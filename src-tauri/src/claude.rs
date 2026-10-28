//! Runs the user's own `claude` CLI headless, so the chat uses whatever account they
//! signed in to Claude Code with. Each message is one `claude -p` run (resuming the
//! previous session); stdout's stream-json lines go to the webview as `claude-event`,
//! and `claude-done` fires when the process exits. Built-in tools are switched off:
//! the only tools are Stint's own, served by mcp.rs.
use crate::mcp::Mcp;
use serde_json::json;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct Run(Mutex<Option<Child>>);

fn home() -> String {
  std::env::var("HOME").unwrap_or_default()
}

fn find_claude() -> Option<String> {
  let h = home();
  let known = [
    format!("{h}/.local/bin/claude"),
    format!("{h}/.claude/local/claude"),
    "/opt/homebrew/bin/claude".into(),
    "/usr/local/bin/claude".into(),
  ];
  if let Some(p) = known.into_iter().find(|p| std::path::Path::new(p).is_file()) {
    return Some(p);
  }
  // Apps opened from Finder don't get the shell's PATH, so ask a login shell.
  let out = Command::new("/bin/zsh").args(["-lc", "command -v claude"]).output().ok()?;
  let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
  (!p.is_empty()).then_some(p)
}

#[tauri::command]
pub fn claude_send(app: AppHandle, run: State<Run>, mcp: State<Arc<Mcp>>, prompt: String, session: Option<String>, system: String) -> Result<(), String> {
  let mut slot = run.0.lock().unwrap();
  if slot.is_some() {
    return Err("Claude is still working on your last message.".into());
  }
  let bin = find_claude().ok_or("Couldn't find the Claude CLI. Install Claude Code, then run `claude` in Terminal once to sign in.")?;
  let config = json!({ "mcpServers": { "stint": {
    "type": "http",
    "url": format!("http://127.0.0.1:{}/mcp", mcp.port),
    "headers": { "Authorization": format!("Bearer {}", mcp.token) },
  } } });
  // A neutral working directory, so no project's CLAUDE.md or settings leak into the chat.
  let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("claude");
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let mut cmd = Command::new(bin);
  cmd
    .args(["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages"])
    .args(["--tools", "", "--strict-mcp-config", "--allowedTools", "mcp__stint"])
    .arg("--mcp-config")
    .arg(config.to_string())
    .arg("--append-system-prompt")
    .arg(system);
  if let Some(s) = session {
    cmd.arg("--resume").arg(s);
  }
  let h = home();
  let mut child = cmd
    .current_dir(&dir)
    .env("PATH", format!("{h}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"))
    .env_remove("CLAUDECODE")
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|e| format!("Couldn't start Claude: {e}"))?;
  // The message goes in on stdin, so text starting with "-" is never read as a flag.
  if let Some(mut stdin) = child.stdin.take() {
    let _ = stdin.write_all(prompt.as_bytes());
  }
  let stdout = child.stdout.take().unwrap();
  let mut stderr = child.stderr.take().unwrap();
  *slot = Some(child);
  drop(slot);
  std::thread::spawn(move || {
    let err = std::thread::spawn(move || {
      let mut s = String::new();
      let _ = stderr.read_to_string(&mut s);
      s
    });
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
      let _ = app.emit("claude-event", line);
    }
    let child = app.state::<Run>().0.lock().unwrap().take();
    let code = child.and_then(|mut c| c.wait().ok()).and_then(|s| s.code());
    let _ = app.emit("claude-done", json!({ "code": code, "stderr": err.join().unwrap_or_default() }));
  });
  Ok(())
}

#[tauri::command]
pub fn claude_stop(run: State<Run>) {
  if let Some(c) = run.0.lock().unwrap().as_mut() {
    let _ = c.kill();
  }
}

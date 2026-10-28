//! Local MCP server for the in-app Claude chat (see claude.rs).
//! Listens on 127.0.0.1 behind a random bearer token. The workspace data lives in the
//! webview, so tools/list and tools/call are forwarded there (src/actions/claude.js)
//! and the answer comes back through `mcp_respond`.
use serde_json::{Value, json};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

pub struct Mcp {
  pub port: u16,
  pub token: String,
  pending: Mutex<HashMap<u64, mpsc::Sender<Value>>>,
  next: AtomicU64,
}

pub fn start(app: &AppHandle) -> Result<Arc<Mcp>, Box<dyn std::error::Error>> {
  let server = tiny_http::Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
  let port = server.server_addr().to_ip().map(|a| a.port()).ok_or("no port")?;
  let mcp = Arc::new(Mcp {
    port,
    token: uuid::Uuid::new_v4().simple().to_string(),
    pending: Mutex::default(),
    next: AtomicU64::new(1),
  });
  let (m, app) = (mcp.clone(), app.clone());
  std::thread::spawn(move || {
    for req in server.incoming_requests() {
      let (m, app) = (m.clone(), app.clone());
      std::thread::spawn(move || handle(&m, &app, req));
    }
  });
  Ok(mcp)
}

fn handle(m: &Mcp, app: &AppHandle, mut req: tiny_http::Request) {
  let bearer = format!("Bearer {}", m.token);
  if !req.headers().iter().any(|h| h.field.equiv("Authorization") && h.value.as_str() == bearer) {
    return reply(req, 401, None);
  }
  // Streamable HTTP without a server-to-client stream: plain JSON replies to POST only.
  if req.method() != &tiny_http::Method::Post || req.url() != "/mcp" {
    return reply(req, 405, None);
  }
  let mut body = String::new();
  let Ok(msg) = req.as_reader().read_to_string(&mut body).map_err(|_| ()).and_then(|_| serde_json::from_str::<Value>(&body).map_err(|_| ())) else {
    return reply(req, 400, None);
  };
  // Notifications carry no id and get no answer.
  let Some(id) = msg.get("id").cloned() else {
    return reply(req, 202, None);
  };
  let method = msg["method"].as_str().unwrap_or("");
  let result = match method {
    "initialize" => Ok(json!({
      "protocolVersion": msg["params"]["protocolVersion"].as_str().unwrap_or("2025-06-18"),
      "capabilities": { "tools": {} },
      "serverInfo": { "name": "stint", "version": env!("CARGO_PKG_VERSION") },
    })),
    "ping" => Ok(json!({})),
    "tools/list" | "tools/call" => ask_webview(m, app, method, &msg["params"]),
    _ => Err((-32601, format!("Method not found: {method}"))),
  };
  let out = match result {
    Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
    Err((code, message)) => json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } }),
  };
  reply(req, 200, Some(out));
}

fn ask_webview(m: &Mcp, app: &AppHandle, method: &str, params: &Value) -> Result<Value, (i64, String)> {
  let rid = m.next.fetch_add(1, Ordering::Relaxed);
  let (tx, rx) = mpsc::channel();
  m.pending.lock().unwrap().insert(rid, tx);
  let res = app
    .emit("mcp-request", json!({ "rid": rid, "method": method, "params": params }))
    .map_err(|e| e.to_string())
    .and_then(|_| rx.recv_timeout(Duration::from_secs(30)).map_err(|_| "Stint didn't answer in time".to_string()));
  m.pending.lock().unwrap().remove(&rid);
  res.map_err(|e| (-32603, e))
}

fn reply(req: tiny_http::Request, status: u16, body: Option<Value>) {
  let mut res = tiny_http::Response::from_string(body.map(|b| b.to_string()).unwrap_or_default()).with_status_code(status);
  if status == 200 {
    res.add_header(tiny_http::Header::from_bytes("Content-Type", "application/json").unwrap());
  }
  let _ = req.respond(res);
}

#[tauri::command]
pub fn mcp_respond(mcp: State<Arc<Mcp>>, rid: u64, result: Value) {
  if let Some(tx) = mcp.pending.lock().unwrap().remove(&rid) {
    let _ = tx.send(result);
  }
}

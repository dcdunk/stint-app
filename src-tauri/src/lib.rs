mod claude;
mod mcp;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(claude::Run::default())
    .invoke_handler(tauri::generate_handler![claude::claude_send, claude::claude_stop, mcp::mcp_respond])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      tauri::Manager::manage(app, mcp::start(app.handle())?);
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}

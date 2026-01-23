use std::fs;
use serde::{Deserialize, Serialize};
use tauri::Manager;
use base64::{engine::general_purpose, Engine as _};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDocumentArgs {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadDocumentArgs {
    pub path: String,
}

#[tauri::command]
fn save_document(args: SaveDocumentArgs) -> Result<(), String> {
    fs::write(&args.path, args.content).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_document(args: LoadDocumentArgs) -> Result<String, String> {
    fs::read_to_string(&args.path).map_err(|e| e.to_string())
}

#[tauri::command]
fn show_save_dialog() -> Result<Option<String>, String> {
    let dialog = rfd::FileDialog::new()
        .add_filter("Galileo Design", &["galileo"])
        .set_title("Save Design")
        .save_file();

    Ok(dialog.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn show_open_dialog() -> Result<Option<String>, String> {
    let dialog = rfd::FileDialog::new()
        .add_filter("Galileo Design", &["galileo"])
        .set_title("Open Design")
        .pick_file();

    Ok(dialog.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn show_import_dialog() -> Result<Option<String>, String> {
    let dialog = rfd::FileDialog::new()
        .add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "icns"])
        .set_title("Import Image")
        .pick_file();

    Ok(dialog.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn load_binary(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(general_purpose::STANDARD.encode(bytes))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            save_document,
            load_document,
            show_save_dialog,
            show_open_dialog,
            show_import_dialog,
            load_binary,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

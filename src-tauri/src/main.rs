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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveBinaryArgs {
    pub path: String,
    pub data_base64: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveImageDialogArgs {
    pub suggested_name: Option<String>,
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
fn show_open_folder() -> Result<Option<String>, String> {
    let dialog = rfd::FileDialog::new()
        .set_title("Select Plugin Folder")
        .pick_folder();

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

#[tauri::command]
fn load_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn show_save_image_dialog(args: SaveImageDialogArgs) -> Result<Option<String>, String> {
    let mut dialog = rfd::FileDialog::new()
        .add_filter("Images", &["png", "jpg", "jpeg"])
        .set_title("Export Image");
    if let Some(name) = args.suggested_name {
        dialog = dialog.set_file_name(&name);
    }
    Ok(dialog.save_file().map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn save_binary(args: SaveBinaryArgs) -> Result<(), String> {
    let bytes = general_purpose::STANDARD
        .decode(args.data_base64)
        .map_err(|e| e.to_string())?;
    fs::write(&args.path, bytes).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            save_document,
            load_document,
            show_save_dialog,
            show_open_dialog,
            show_open_folder,
            show_import_dialog,
            load_binary,
            load_text,
            show_save_image_dialog,
            save_binary,
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

use base64::{engine::general_purpose, Engine as _};
use image::{ImageBuffer, ImageFormat, Rgba};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Cursor;
use tauri::{path::BaseDirectory, Manager};

mod background_remove;
mod draft_store;
mod unsplash;

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
pub struct RenameDocumentArgs {
    pub old_path: String,
    pub new_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteDocumentArgs {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateDocumentArgs {
    pub src: String,
    pub dest: String,
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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncodePngArgs {
    /// Raw RGBA pixel data as base64
    pub rgba_base64: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncodeWebpArgs {
    /// Raw RGBA pixel data as base64
    pub rgba_base64: String,
    pub width: u32,
    pub height: u32,
    /// Quality 0-100 (lossy) or None for lossless
    pub quality: Option<u8>,
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
fn rename_document(args: RenameDocumentArgs) -> Result<(), String> {
    fs::rename(&args.old_path, &args.new_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_document(args: DeleteDocumentArgs) -> Result<(), String> {
    fs::remove_file(&args.path).map_err(|e| e.to_string())
}

#[tauri::command]
fn duplicate_document(args: DuplicateDocumentArgs) -> Result<(), String> {
    fs::copy(&args.src, &args.dest)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn path_exists(path: String) -> Result<bool, String> {
    Ok(fs::metadata(path).is_ok())
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
        .add_filter(
            "Images",
            &[
                "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "icns", "heic", "heif",
            ],
        )
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
fn load_resource_binary(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let resolved = app
        .path()
        .resolve(path, BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let bytes = fs::read(&resolved).map_err(|e| e.to_string())?;
    Ok(general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
fn load_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn show_save_image_dialog(args: SaveImageDialogArgs) -> Result<Option<String>, String> {
    let mut dialog = rfd::FileDialog::new()
        .add_filter("PNG", &["png"])
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

/// Encode raw RGBA pixels to PNG using native Rust (5-10x faster than canvas.toDataURL)
#[tauri::command]
fn encode_png(args: EncodePngArgs) -> Result<String, String> {
    let rgba_bytes = general_purpose::STANDARD
        .decode(&args.rgba_base64)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let expected_len = (args.width * args.height * 4) as usize;
    if rgba_bytes.len() != expected_len {
        return Err(format!(
            "Invalid RGBA data length: expected {}, got {}",
            expected_len,
            rgba_bytes.len()
        ));
    }

    let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
        ImageBuffer::from_raw(args.width, args.height, rgba_bytes)
            .ok_or("Failed to create image buffer")?;

    let mut png_bytes: Vec<u8> = Vec::new();
    let mut cursor = Cursor::new(&mut png_bytes);
    img.write_to(&mut cursor, ImageFormat::Png)
        .map_err(|e| format!("Failed to encode PNG: {}", e))?;

    Ok(general_purpose::STANDARD.encode(&png_bytes))
}

/// Encode raw RGBA pixels to WebP (smaller files, good for web)
#[tauri::command]
fn encode_webp(args: EncodeWebpArgs) -> Result<String, String> {
    let rgba_bytes = general_purpose::STANDARD
        .decode(&args.rgba_base64)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let expected_len = (args.width * args.height * 4) as usize;
    if rgba_bytes.len() != expected_len {
        return Err(format!(
            "Invalid RGBA data length: expected {}, got {}",
            expected_len,
            rgba_bytes.len()
        ));
    }

    let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
        ImageBuffer::from_raw(args.width, args.height, rgba_bytes)
            .ok_or("Failed to create image buffer")?;

    let mut webp_bytes: Vec<u8> = Vec::new();
    let mut cursor = Cursor::new(&mut webp_bytes);
    img.write_to(&mut cursor, ImageFormat::WebP)
        .map_err(|e| format!("Failed to encode WebP: {}", e))?;

    Ok(general_purpose::STANDARD.encode(&webp_bytes))
}

fn mask_env_value(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.is_empty() {
        return "(empty)".to_string();
    }
    if chars.len() <= 6 {
        return "***".to_string();
    }
    let prefix: String = chars.iter().take(3).collect();
    let suffix: String = chars
        .iter()
        .rev()
        .take(2)
        .copied()
        .collect::<Vec<char>>()
        .into_iter()
        .rev()
        .collect();
    format!("{prefix}***{suffix}")
}

fn log_env_diagnostics() {
    let tracked_keys = ["UNSPLASH_ACCESS_KEY"];
    let mut reported = Vec::new();
    for key in tracked_keys {
        match std::env::var(key) {
            Ok(value) if !value.trim().is_empty() => {
                reported.push(format!("{key}=set({})", mask_env_value(value.trim())));
            }
            Ok(_) => {
                reported.push(format!("{key}=empty"));
            }
            Err(_) => {
                reported.push(format!("{key}=missing"));
            }
        }
    }

    let galileo_keys: Vec<String> = std::env::vars()
        .map(|(key, _)| key)
        .filter(|key| key.starts_with("GALILEO_"))
        .collect();

    if galileo_keys.is_empty() {
        eprintln!(
            "[env] Startup env check: {} | GALILEO_* keys: none",
            reported.join(", ")
        );
    } else {
        eprintln!(
            "[env] Startup env check: {} | GALILEO_* keys: {}",
            reported.join(", "),
            galileo_keys.join(", ")
        );
    }
}

fn main() {
    if let Ok(path) = dotenvy::dotenv() {
        eprintln!("[env] Loaded .env from {}", path.display());
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            background_remove::remove_background,
            draft_store::save_draft,
            draft_store::load_draft,
            draft_store::delete_draft,
            draft_store::list_drafts,
            draft_store::get_file_mtime,
            save_document,
            load_document,
            rename_document,
            delete_document,
            duplicate_document,
            path_exists,
            show_save_dialog,
            show_open_dialog,
            show_open_folder,
            show_import_dialog,
            load_binary,
            load_resource_binary,
            load_text,
            show_save_image_dialog,
            save_binary,
            encode_png,
            encode_webp,
            unsplash::unsplash_search_photos,
            unsplash::unsplash_get_photo,
            unsplash::unsplash_track_download,
            unsplash::unsplash_fetch_image,
        ])
        .setup(|_app| {
            log_env_diagnostics();

            #[cfg(debug_assertions)]
            {
                let window = _app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

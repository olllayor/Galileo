use base64::{engine::general_purpose, Engine as _};
use image::{ImageBuffer, ImageFormat, Rgba};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::fs;
use std::io::Cursor;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager, State};
use url::Url;

#[cfg(target_os = "macos")]
use objc::runtime::Object;
#[cfg(target_os = "macos")]
use objc::{class, msg_send, sel, sel_impl};
#[cfg(target_os = "macos")]
use std::ffi::CStr;
#[cfg(target_os = "macos")]
use std::os::raw::c_char;

mod background_remove;
mod draft_store;
mod figma;
mod unsplash;

const AUTH_DEEP_LINK_EVENT: &str = "galileo-auth://deep-link";
const AUTH_DEEP_LINK_QUEUE_MAX: usize = 32;

#[derive(Default)]
struct AuthDeepLinkState {
    queue: Mutex<VecDeque<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthDeepLinkEventPayload {
    urls: Vec<String>,
}

fn collect_auth_deep_links_from_args(args: &[String]) -> Vec<String> {
    args.iter()
        .filter_map(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return None;
            }
            let parsed = Url::parse(trimmed).ok()?;
            if parsed.scheme().eq_ignore_ascii_case("galileo") {
                Some(trimmed.to_string())
            } else {
                None
            }
        })
        .collect()
}

fn push_auth_deep_link_queue(state: &AuthDeepLinkState, urls: &[String]) {
    let mut queue = state
        .queue
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    for url in urls {
        if queue.contains(url) {
            continue;
        }
        queue.push_back(url.clone());
        while queue.len() > AUTH_DEEP_LINK_QUEUE_MAX {
            let _ = queue.pop_front();
        }
    }
}

fn enqueue_and_emit_auth_deep_links(app: &AppHandle, urls: Vec<String>) {
    if urls.is_empty() {
        return;
    }
    if let Some(state) = app.try_state::<AuthDeepLinkState>() {
        push_auth_deep_link_queue(&state, &urls);
    }
    let _ = app.emit(
        AUTH_DEEP_LINK_EVENT,
        AuthDeepLinkEventPayload { urls: urls.clone() },
    );
}

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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSecretSetArgs {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSecretGetArgs {
    pub key: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSecretRemoveArgs {
    pub key: String,
}

fn normalize_auth_secret_key(key: &str) -> Result<String, String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("auth_invalid_key: key is required".to_string());
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
    {
        return Err("auth_invalid_key: unsupported characters in key".to_string());
    }
    Ok(trimmed.to_string())
}

fn auth_secret_file_path(app: &tauri::AppHandle, key: &str) -> Result<PathBuf, String> {
    let normalized = normalize_auth_secret_key(key)?;
    let mut dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    dir.push("auth");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    dir.push(format!("{normalized}.secret"));
    Ok(dir)
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

#[tauri::command]
fn auth_secret_set(app: tauri::AppHandle, args: AuthSecretSetArgs) -> Result<(), String> {
    let path = auth_secret_file_path(&app, &args.key)?;
    fs::write(path, args.value).map_err(|e| e.to_string())
}

#[tauri::command]
fn auth_secret_get(app: tauri::AppHandle, args: AuthSecretGetArgs) -> Result<Option<String>, String> {
    let path = auth_secret_file_path(&app, &args.key)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path)
        .map(Some)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn auth_secret_remove(app: tauri::AppHandle, args: AuthSecretRemoveArgs) -> Result<(), String> {
    let path = auth_secret_file_path(&app, &args.key)?;
    if !path.exists() {
        return Ok(());
    }
    fs::remove_file(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn auth_last_deep_link_get(state: State<'_, AuthDeepLinkState>) -> Vec<String> {
    let mut queue = state
        .queue
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    queue.drain(..).collect()
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

#[cfg(target_os = "macos")]
unsafe fn nsstring_to_string(value: *mut Object) -> Option<String> {
    if value.is_null() {
        return None;
    }
    let utf8: *const c_char = msg_send![value, UTF8String];
    if utf8.is_null() {
        return None;
    }
    let cstr = CStr::from_ptr(utf8);
    Some(cstr.to_string_lossy().into_owned())
}

#[tauri::command]
fn list_system_fonts() -> Result<Vec<String>, String> {
    #[cfg(target_os = "macos")]
    unsafe {
        let font_manager: *mut Object = msg_send![class!(NSFontManager), sharedFontManager];
        if font_manager.is_null() {
            return Err("Failed to access NSFontManager".to_string());
        }

        let families: *mut Object = msg_send![font_manager, availableFontFamilies];
        if families.is_null() {
            return Err("Failed to read available font families".to_string());
        }

        let count: usize = msg_send![families, count];
        let mut result = Vec::with_capacity(count);

        for index in 0..count {
            let item: *mut Object = msg_send![families, objectAtIndex: index];
            if let Some(family) = nsstring_to_string(item) {
                let trimmed = family.trim();
                if !trimmed.is_empty() {
                    result.push(trimmed.to_string());
                }
            }
        }

        result.sort();
        result.dedup();
        return Ok(result);
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Native system font listing is only implemented for macOS".to_string())
    }
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
        .manage(AuthDeepLinkState::default())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            let urls = collect_auth_deep_links_from_args(&argv);
            enqueue_and_emit_auth_deep_links(app, urls);
        }))
        .plugin(tauri_plugin_deep_link::init())
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
            auth_secret_set,
            auth_secret_get,
            auth_secret_remove,
            auth_last_deep_link_get,
            encode_png,
            encode_webp,
            list_system_fonts,
            unsplash::unsplash_search_photos,
            unsplash::unsplash_get_photo,
            unsplash::unsplash_track_download,
            unsplash::unsplash_fetch_image,
            figma::figma_fetch_file,
            figma::figma_fetch_nodes,
            figma::figma_fetch_images,
            figma::figma_fetch_local_variables,
        ])
        .setup(|_app| {
            log_env_diagnostics();
            let startup_urls = collect_auth_deep_links_from_args(&std::env::args().collect::<Vec<_>>());
            enqueue_and_emit_auth_deep_links(&_app.handle(), startup_urls);

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

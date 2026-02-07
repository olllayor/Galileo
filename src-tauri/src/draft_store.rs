use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const DRAFTS_DIR: &str = "drafts";
const DRAFT_FILE_EXT: &str = "draft.json";
const DRAFT_VERSION: u8 = 1;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDraftArgs {
    pub key: String,
    pub path: Option<String>,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftKeyArgs {
    pub key: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredDraft {
    version: u8,
    key: String,
    path: Option<String>,
    content: String,
    saved_at_ms: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftPayload {
    pub key: String,
    pub path: Option<String>,
    pub content: String,
    pub saved_at_ms: u64,
    pub compressed_bytes: usize,
    pub uncompressed_bytes: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftSummary {
    pub key: String,
    pub path: Option<String>,
    pub saved_at_ms: u64,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn sanitize_key(key: &str) -> Result<String, String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("Draft key cannot be empty".to_string());
    }
    Ok(trimmed.to_string())
}

fn encode_key(key: &str) -> String {
    general_purpose::URL_SAFE_NO_PAD.encode(key.as_bytes())
}

fn drafts_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_data.join(DRAFTS_DIR))
}

fn draft_path_for_key(app: &tauri::AppHandle, key: &str) -> Result<PathBuf, String> {
    let dir = drafts_dir(app)?;
    let file_name = format!("{}.{}", encode_key(key), DRAFT_FILE_EXT);
    Ok(dir.join(file_name))
}

fn ensure_drafts_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = drafts_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn write_atomic(path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut tmp_path = path.to_path_buf();
    tmp_path.set_extension("tmp");

    fs::write(&tmp_path, data).map_err(|e| e.to_string())?;

    match fs::rename(&tmp_path, path) {
        Ok(()) => Ok(()),
        Err(rename_err) => {
            if path.exists() {
                fs::remove_file(path).map_err(|e| e.to_string())?;
                fs::rename(&tmp_path, path).map_err(|e| e.to_string())
            } else {
                let _ = fs::remove_file(&tmp_path);
                Err(rename_err.to_string())
            }
        }
    }
}

fn read_draft(path: &Path) -> Result<Option<(StoredDraft, usize, usize)>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let uncompressed = fs::read(path).map_err(|e| e.to_string())?;
    let uncompressed_bytes = uncompressed.len();
    let stored: StoredDraft = serde_json::from_slice(&uncompressed).map_err(|e| e.to_string())?;

    if stored.version != DRAFT_VERSION {
        return Err(format!("Unsupported draft version {}", stored.version));
    }

    Ok(Some((stored, uncompressed_bytes, uncompressed_bytes)))
}

fn file_mtime_ms(path: &Path) -> Result<Option<u64>, String> {
    let metadata = match fs::metadata(path) {
        Ok(value) => value,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err.to_string()),
    };
    let modified = metadata.modified().map_err(|e| e.to_string())?;
    let duration = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?;
    Ok(Some(duration.as_millis() as u64))
}

#[tauri::command]
pub fn save_draft(app: tauri::AppHandle, args: SaveDraftArgs) -> Result<(), String> {
    let key = sanitize_key(&args.key)?;
    let _ = ensure_drafts_dir(&app)?;
    let path = draft_path_for_key(&app, &key)?;

    let stored = StoredDraft {
        version: DRAFT_VERSION,
        key,
        path: args.path,
        content: args.content,
        saved_at_ms: now_ms(),
    };

    let json = serde_json::to_vec(&stored).map_err(|e| e.to_string())?;
    write_atomic(&path, &json)
}

#[tauri::command]
pub fn load_draft(
    app: tauri::AppHandle,
    args: DraftKeyArgs,
) -> Result<Option<DraftPayload>, String> {
    let key = sanitize_key(&args.key)?;
    let path = draft_path_for_key(&app, &key)?;

    match read_draft(&path) {
        Ok(Some((stored, compressed_bytes, uncompressed_bytes))) => Ok(Some(DraftPayload {
            key: stored.key,
            path: stored.path,
            content: stored.content,
            saved_at_ms: stored.saved_at_ms,
            compressed_bytes,
            uncompressed_bytes,
        })),
        Ok(None) => Ok(None),
        Err(err) => {
            let _ = fs::remove_file(&path);
            Err(err)
        }
    }
}

#[tauri::command]
pub fn delete_draft(app: tauri::AppHandle, args: DraftKeyArgs) -> Result<(), String> {
    let key = sanitize_key(&args.key)?;
    let path = draft_path_for_key(&app, &key)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub fn list_drafts(app: tauri::AppHandle) -> Result<Vec<DraftSummary>, String> {
    let dir = ensure_drafts_dir(&app)?;
    let mut summaries = Vec::new();

    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let ext = path.extension().and_then(OsStr::to_str).unwrap_or("");
        if ext != "json" {
            continue;
        }
        if let Ok(Some((stored, _, _))) = read_draft(&path) {
            summaries.push(DraftSummary {
                key: stored.key,
                path: stored.path,
                saved_at_ms: stored.saved_at_ms,
            });
        }
    }

    summaries.sort_by(|a, b| b.saved_at_ms.cmp(&a.saved_at_ms));
    Ok(summaries)
}

#[tauri::command]
pub fn get_file_mtime(path: String) -> Result<Option<u64>, String> {
    file_mtime_ms(Path::new(&path))
}

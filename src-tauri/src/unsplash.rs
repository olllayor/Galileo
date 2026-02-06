use base64::{engine::general_purpose, Engine as _};
use image::GenericImageView;
use reqwest::{header::CONTENT_TYPE, Client, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use url::Url;

const UNSPLASH_API_HOST: &str = "api.unsplash.com";
const UNSPLASH_IMAGE_HOST: &str = "images.unsplash.com";
const UNSPLASH_API_VERSION: &str = "v1";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsplashSearchArgs {
    pub query: String,
    pub page: Option<u32>,
    pub per_page: Option<u32>,
    pub orientation: Option<String>,
    pub content_filter: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsplashGetPhotoArgs {
    pub photo_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsplashTrackDownloadArgs {
    pub download_location: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsplashFetchImageArgs {
    pub url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsplashFetchImageResult {
    pub data_base64: String,
    pub mime: String,
    pub width: u32,
    pub height: u32,
}

fn build_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("Galileo/0.1.0")
        .build()
        .map_err(|e| format!("unsplash_client_init_failed: {e}"))
}

fn require_access_key() -> Result<String, String> {
    env::var("UNSPLASH_ACCESS_KEY")
        .map(|value| value.trim().to_string())
        .map_err(|_| "unsplash_missing_access_key: set UNSPLASH_ACCESS_KEY".to_string())
        .and_then(|value| {
            if value.is_empty() {
                Err("unsplash_missing_access_key: set UNSPLASH_ACCESS_KEY".to_string())
            } else {
                Ok(value)
            }
        })
}

fn parse_and_validate_https_url(raw: &str, allowed_host: &str) -> Result<Url, String> {
    let parsed = Url::parse(raw).map_err(|e| format!("unsplash_invalid_url: {e}"))?;
    if parsed.scheme() != "https" {
        return Err("unsplash_invalid_url: only https URLs are allowed".to_string());
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "unsplash_invalid_url: missing host".to_string())?;
    if host != allowed_host {
        return Err(format!("unsplash_invalid_url: host {host} is not allowed"));
    }

    Ok(parsed)
}

fn normalize_orientation(orientation: Option<String>) -> Result<Option<String>, String> {
    let Some(raw) = orientation else {
        return Ok(None);
    };

    let normalized = raw.trim().to_lowercase();
    match normalized.as_str() {
        "landscape" | "portrait" | "squarish" => Ok(Some(normalized)),
        _ => Err(
            "unsplash_invalid_params: orientation must be landscape, portrait, or squarish"
                .to_string(),
        ),
    }
}

fn normalize_content_filter(content_filter: Option<String>) -> Result<String, String> {
    let normalized = content_filter
        .unwrap_or_else(|| "high".to_string())
        .trim()
        .to_lowercase();
    match normalized.as_str() {
        "low" | "high" => Ok(normalized),
        _ => Err("unsplash_invalid_params: contentFilter must be low or high".to_string()),
    }
}

fn format_unsplash_http_error(status: StatusCode, body: &str) -> String {
    let category = match status.as_u16() {
        401 => "unsplash_auth_failed",
        403 => "unsplash_forbidden",
        404 => "unsplash_not_found",
        429 => "unsplash_rate_limited",
        500..=599 => "unsplash_server_error",
        _ => "unsplash_request_failed",
    };

    let compact_body = truncate(body, 180);
    if compact_body.is_empty() {
        format!("{category}: status {}", status.as_u16())
    } else {
        format!("{category}: status {} - {compact_body}", status.as_u16())
    }
}

fn truncate(value: &str, max_chars: usize) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let char_count = trimmed.chars().count();
    if char_count <= max_chars {
        return trimmed.to_string();
    }

    let mut out = String::with_capacity(max_chars + 3);
    for (idx, ch) in trimmed.chars().enumerate() {
        if idx >= max_chars {
            break;
        }
        out.push(ch);
    }
    out.push_str("...");
    out
}

fn api_request_builder(client: &Client, url: Url, access_key: &str) -> reqwest::RequestBuilder {
    client
        .get(url)
        .header("Authorization", format!("Client-ID {access_key}"))
        .header("Accept-Version", UNSPLASH_API_VERSION)
}

#[tauri::command]
pub async fn unsplash_search_photos(args: UnsplashSearchArgs) -> Result<Value, String> {
    let query = args.query.trim();
    if query.is_empty() {
        return Err("unsplash_invalid_params: query is required".to_string());
    }

    let page = args.page.unwrap_or(1).max(1);
    let per_page = args.per_page.unwrap_or(24).clamp(1, 30);
    let orientation = normalize_orientation(args.orientation)?;
    let content_filter = normalize_content_filter(args.content_filter)?;

    let access_key = require_access_key()?;
    let client = build_client()?;
    let mut url = Url::parse("https://api.unsplash.com/search/photos")
        .map_err(|e| format!("unsplash_invalid_url: {e}"))?;
    {
        let mut query_pairs = url.query_pairs_mut();
        query_pairs.append_pair("query", query);
        query_pairs.append_pair("page", &page.to_string());
        query_pairs.append_pair("per_page", &per_page.to_string());
        query_pairs.append_pair("content_filter", &content_filter);
        if let Some(value) = orientation.as_deref() {
            query_pairs.append_pair("orientation", value);
        }
    }

    let response = api_request_builder(&client, url, &access_key)
        .send()
        .await
        .map_err(|e| format!("unsplash_request_failed: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format_unsplash_http_error(status, &body));
    }

    response
        .json::<Value>()
        .await
        .map_err(|e| format!("unsplash_response_parse_failed: {e}"))
}

#[tauri::command]
pub async fn unsplash_get_photo(args: UnsplashGetPhotoArgs) -> Result<Value, String> {
    let photo_id = args.photo_id.trim();
    if photo_id.is_empty() {
        return Err("unsplash_invalid_params: photoId is required".to_string());
    }
    if photo_id.contains('/') {
        return Err("unsplash_invalid_params: photoId is invalid".to_string());
    }

    let access_key = require_access_key()?;
    let client = build_client()?;
    let mut url = Url::parse("https://api.unsplash.com/photos")
        .map_err(|e| format!("unsplash_invalid_url: {e}"))?;
    url.path_segments_mut()
        .map_err(|_| "unsplash_invalid_url: invalid path".to_string())?
        .push(photo_id);

    let response = api_request_builder(&client, url, &access_key)
        .send()
        .await
        .map_err(|e| format!("unsplash_request_failed: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format_unsplash_http_error(status, &body));
    }

    response
        .json::<Value>()
        .await
        .map_err(|e| format!("unsplash_response_parse_failed: {e}"))
}

#[tauri::command]
pub async fn unsplash_track_download(args: UnsplashTrackDownloadArgs) -> Result<Value, String> {
    let download_url = parse_and_validate_https_url(&args.download_location, UNSPLASH_API_HOST)?;

    let access_key = require_access_key()?;
    let client = build_client()?;

    let response = api_request_builder(&client, download_url, &access_key)
        .send()
        .await
        .map_err(|e| format!("unsplash_request_failed: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format_unsplash_http_error(status, &body));
    }

    if status == StatusCode::NO_CONTENT {
        return Ok(json!({ "tracked": true }));
    }

    let parsed = response.json::<Value>().await;
    Ok(parsed.unwrap_or_else(|_| json!({ "tracked": true })))
}

#[tauri::command]
pub async fn unsplash_fetch_image(
    args: UnsplashFetchImageArgs,
) -> Result<UnsplashFetchImageResult, String> {
    let image_url = parse_and_validate_https_url(&args.url, UNSPLASH_IMAGE_HOST)?;
    let client = build_client()?;

    let response = client
        .get(image_url)
        .send()
        .await
        .map_err(|e| format!("unsplash_request_failed: {e}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format_unsplash_http_error(status, &body));
    }

    let mime = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .unwrap_or("image/jpeg")
        .to_string();

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("unsplash_response_read_failed: {e}"))?;
    let decoded =
        image::load_from_memory(&bytes).map_err(|e| format!("unsplash_decode_failed: {e}"))?;
    let (width, height) = decoded.dimensions();

    Ok(UnsplashFetchImageResult {
        data_base64: general_purpose::STANDARD.encode(&bytes),
        mime,
        width,
        height,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        format_unsplash_http_error, normalize_content_filter, normalize_orientation,
        parse_and_validate_https_url, UNSPLASH_API_HOST, UNSPLASH_IMAGE_HOST,
    };
    use reqwest::StatusCode;

    #[test]
    fn validate_url_accepts_https_for_allowed_host() {
        let url =
            parse_and_validate_https_url("https://api.unsplash.com/photos/abc", UNSPLASH_API_HOST);
        assert!(url.is_ok());
    }

    #[test]
    fn validate_url_rejects_non_https() {
        let url =
            parse_and_validate_https_url("http://api.unsplash.com/photos/abc", UNSPLASH_API_HOST);
        assert!(url.is_err());
    }

    #[test]
    fn validate_url_rejects_wrong_host() {
        let url =
            parse_and_validate_https_url("https://evil.example/photos/abc", UNSPLASH_IMAGE_HOST);
        assert!(url.is_err());
    }

    #[test]
    fn orientation_validation_is_strict() {
        assert!(normalize_orientation(Some("landscape".to_string())).is_ok());
        assert!(normalize_orientation(Some("square".to_string())).is_err());
    }

    #[test]
    fn content_filter_defaults_to_high() {
        let value = normalize_content_filter(None).expect("default content filter");
        assert_eq!(value, "high");
    }

    #[test]
    fn error_mapping_includes_rate_limited_category() {
        let message = format_unsplash_http_error(StatusCode::TOO_MANY_REQUESTS, "hit rate limit");
        assert!(message.contains("unsplash_rate_limited"));
    }
}

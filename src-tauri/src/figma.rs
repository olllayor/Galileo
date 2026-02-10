use reqwest::{Client, StatusCode, Url};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::thread;
use std::time::Duration;

const FIGMA_API_BASE: &str = "https://api.figma.com/v1";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FigmaFetchFileArgs {
    pub file_key: String,
    pub token: String,
    pub node_ids: Option<Vec<String>>,
    pub depth: Option<u32>,
    pub geometry: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FigmaFetchNodesArgs {
    pub file_key: String,
    pub token: String,
    pub node_ids: Vec<String>,
    pub depth: Option<u32>,
    pub geometry: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FigmaFetchImagesArgs {
    pub file_key: String,
    pub token: String,
    pub image_refs: Vec<String>,
    pub format: Option<String>,
    pub scale: Option<f32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FigmaFetchLocalVariablesArgs {
    pub file_key: String,
    pub token: String,
}

fn validate_file_key(file_key: &str) -> Result<String, String> {
    let trimmed = file_key.trim();
    if trimmed.is_empty() {
        return Err("figma_invalid_params: fileKey is required".to_string());
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
    {
        return Err("figma_invalid_params: fileKey is invalid".to_string());
    }
    Ok(trimmed.to_string())
}

fn validate_token(token: &str) -> Result<String, String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Err("figma_invalid_params: token is required".to_string());
    }
    Ok(trimmed.to_string())
}

fn normalize_node_ids(node_ids: &[String]) -> Result<Vec<String>, String> {
    let mut normalized = Vec::new();
    for node_id in node_ids {
        let trimmed = node_id.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == ':' || ch == '-' || ch == '_')
        {
            return Err("figma_invalid_params: nodeIds contains an invalid id".to_string());
        }
        normalized.push(trimmed.to_string());
    }
    Ok(normalized)
}

fn validate_geometry(geometry: Option<&str>) -> Result<Option<String>, String> {
    match geometry {
        None => Ok(None),
        Some(raw) => {
            let normalized = raw.trim().to_lowercase();
            if normalized.is_empty() {
                return Ok(None);
            }
            if normalized == "paths" {
                Ok(Some(normalized))
            } else {
                Err("figma_invalid_params: geometry must be \"paths\"".to_string())
            }
        }
    }
}

fn build_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("Galileo/0.1.0")
        .build()
        .map_err(|e| format!("figma_client_init_failed: {e}"))
}

async fn send_with_rate_limit_retry(client: &Client, url: Url, token: &str) -> Result<reqwest::Response, String> {
    let mut attempts = 0;
    loop {
        attempts += 1;
        let response = client
            .get(url.clone())
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .map_err(|e| format!("figma_request_failed: {e}"))?;

        if response.status() != StatusCode::TOO_MANY_REQUESTS || attempts >= 4 {
            return Ok(response);
        }

        let retry_after = response
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(1)
            .min(8);
        thread::sleep(Duration::from_secs(retry_after));
    }
}

fn format_error(status: StatusCode, body: &str) -> String {
    let category = match status.as_u16() {
        401 => "figma_auth_failed",
        403 => "figma_forbidden",
        404 => "figma_not_found",
        429 => "figma_rate_limited",
        500..=599 => "figma_server_error",
        _ => "figma_request_failed",
    };
    let compact = body.trim();
    if compact.is_empty() {
        format!("{category}: status {}", status.as_u16())
    } else {
        let excerpt: String = compact.chars().take(180).collect();
        format!("{category}: status {} - {}", status.as_u16(), excerpt)
    }
}

async fn read_json_response(client: &Client, url: Url, token: &str) -> Result<Value, String> {
    let response = send_with_rate_limit_retry(client, url, token).await?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format_error(status, &body));
    }
    response
        .json::<Value>()
        .await
        .map_err(|e| format!("figma_response_parse_failed: {e}"))
}

#[tauri::command]
pub async fn figma_fetch_file(args: FigmaFetchFileArgs) -> Result<Value, String> {
    let file_key = validate_file_key(&args.file_key)?;
    let token = validate_token(&args.token)?;
    let geometry = validate_geometry(args.geometry.as_deref())?;
    let node_ids = normalize_node_ids(&args.node_ids.unwrap_or_default())?;

    let client = build_client()?;
    let mut url = Url::parse(&format!("{FIGMA_API_BASE}/files/{file_key}"))
        .map_err(|e| format!("figma_invalid_url: {e}"))?;
    {
        let mut q = url.query_pairs_mut();
        if !node_ids.is_empty() {
            q.append_pair("ids", &node_ids.join(","));
        }
        if let Some(depth) = args.depth {
            q.append_pair("depth", &depth.min(10).to_string());
        }
        if let Some(geometry) = geometry {
            q.append_pair("geometry", &geometry);
        }
    }

    read_json_response(&client, url, &token).await
}

#[tauri::command]
pub async fn figma_fetch_nodes(args: FigmaFetchNodesArgs) -> Result<Value, String> {
    let file_key = validate_file_key(&args.file_key)?;
    let token = validate_token(&args.token)?;
    let node_ids = normalize_node_ids(&args.node_ids)?;
    if node_ids.is_empty() {
        return Err("figma_invalid_params: nodeIds is required".to_string());
    }
    let geometry = validate_geometry(args.geometry.as_deref())?;

    let client = build_client()?;
    let mut url = Url::parse(&format!("{FIGMA_API_BASE}/files/{file_key}/nodes"))
        .map_err(|e| format!("figma_invalid_url: {e}"))?;
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("ids", &node_ids.join(","));
        if let Some(depth) = args.depth {
            q.append_pair("depth", &depth.min(10).to_string());
        }
        if let Some(geometry) = geometry {
            q.append_pair("geometry", &geometry);
        }
    }

    read_json_response(&client, url, &token).await
}

#[tauri::command]
pub async fn figma_fetch_images(args: FigmaFetchImagesArgs) -> Result<HashMap<String, String>, String> {
    let file_key = validate_file_key(&args.file_key)?;
    let token = validate_token(&args.token)?;
    let image_refs = normalize_node_ids(&args.image_refs)?;
    if image_refs.is_empty() {
        return Err("figma_invalid_params: imageRefs is required".to_string());
    }

    let format = args
        .format
        .as_deref()
        .map(|raw| raw.trim().to_lowercase())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "png".to_string());
    if !["png", "jpg", "svg", "pdf"].contains(&format.as_str()) {
        return Err("figma_invalid_params: format must be png, jpg, svg, or pdf".to_string());
    }

    let scale = args.scale.unwrap_or(1.0).clamp(0.01, 4.0);

    let client = build_client()?;
    let mut url = Url::parse(&format!("{FIGMA_API_BASE}/images/{file_key}"))
        .map_err(|e| format!("figma_invalid_url: {e}"))?;
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("ids", &image_refs.join(","));
        q.append_pair("format", &format);
        q.append_pair("scale", &scale.to_string());
    }

    let json = read_json_response(&client, url, &token).await?;
    let images = json
        .get("images")
        .and_then(|value| value.as_object())
        .ok_or_else(|| "figma_response_parse_failed: missing images map".to_string())?;

    let mut out = HashMap::new();
    for (key, value) in images {
        if let Some(url) = value.as_str() {
            out.insert(key.to_string(), url.to_string());
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn figma_fetch_local_variables(args: FigmaFetchLocalVariablesArgs) -> Result<Value, String> {
    let file_key = validate_file_key(&args.file_key)?;
    let token = validate_token(&args.token)?;

    let client = build_client()?;
    let url = Url::parse(&format!("{FIGMA_API_BASE}/files/{file_key}/variables/local"))
        .map_err(|e| format!("figma_invalid_url: {e}"))?;

    read_json_response(&client, url, &token).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_file_key() {
        assert!(validate_file_key("AbCdEf123").is_ok());
        assert!(validate_file_key("bad/key").is_err());
    }

    #[test]
    fn validates_node_ids() {
        let ids = normalize_node_ids(&vec!["12:34".to_string(), "ab_cd".to_string()]).unwrap();
        assert_eq!(ids.len(), 2);
        assert!(normalize_node_ids(&vec!["bad id".to_string()]).is_err());
    }

    #[test]
    fn maps_http_errors() {
        let message = format_error(StatusCode::TOO_MANY_REQUESTS, "rate");
        assert!(message.contains("figma_rate_limited"));
    }
}

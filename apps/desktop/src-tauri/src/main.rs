#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{CustomMenuItem, Menu, MenuItem, State, Submenu};
use url::Url;

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

#[cfg(target_os = "macos")]
fn macos_screen_capture_authorized() -> bool {
    unsafe { CGPreflightScreenCaptureAccess() }
}

#[cfg(target_os = "macos")]
fn request_macos_screen_capture_access() -> bool {
    unsafe { CGRequestScreenCaptureAccess() }
}

#[derive(Default, Clone)]
struct AppState {
    project_root: Arc<Mutex<Option<PathBuf>>>,
    cancelled_provider_streams: Arc<Mutex<HashSet<String>>>,
    screen_capture_verified: Arc<Mutex<bool>>,
}
const MAX_TIMEOUT_MS: u64 = 180_000;
const MIN_TIMEOUT_MS: u64 = 5_000;
const CREDENTIAL_SERVICE: &str = "com.tokenfence.studio.provider";
const MAX_MESSAGE_CHARS: usize = 1_000_000;

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProviderConfigInput {
    profile_id: String,
    provider_id: String,
    api_style: String,
    api_key: String,
    model: String,
    base_url: String,
    timeout_ms: u64,
    requires_credential: bool,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct ProviderMessage {
    role: String,
    content: Value,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProviderChatRequest {
    config: ProviderConfigInput,
    messages: Vec<ProviderMessage>,
    max_tokens: Option<u32>,
    temperature: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderReply {
    ok: bool,
    status: u16,
    content: Option<String>,
    model: Option<String>,
    error_code: Option<String>,
    error_message: Option<String>,
    latency_ms: u128,
}

impl ProviderReply {
    fn failure(status: u16, code: &str, message: &str, latency_ms: u128) -> Self {
        Self {
            ok: false,
            status,
            content: None,
            model: None,
            error_code: Some(code.to_string()),
            error_message: Some(message.to_string()),
            latency_ms,
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProviderStreamEvent {
    stream_id: String,
    kind: String,
    text: Option<String>,
    model: Option<String>,
    error_code: Option<String>,
    error_message: Option<String>,
}

fn emit_provider_stream(
    window: &tauri::Window,
    stream_id: &str,
    kind: &str,
    text: Option<String>,
    model: Option<String>,
    error_code: Option<String>,
    error_message: Option<String>,
) {
    let _ = window.emit(
        "chris-studio://provider-stream",
        ProviderStreamEvent {
            stream_id: stream_id.to_string(),
            kind: kind.to_string(),
            text,
            model,
            error_code,
            error_message,
        },
    );
}

fn provider_stream_cancelled(state: &AppState, stream_id: &str) -> bool {
    state
        .cancelled_provider_streams
        .lock()
        .map(|streams| streams.contains(stream_id))
        .unwrap_or(true)
}

fn clear_provider_stream_cancel(state: &AppState, stream_id: &str) {
    if let Ok(mut streams) = state.cancelled_provider_streams.lock() {
        streams.remove(stream_id);
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SecretReply {
    ok: bool,
    has_value: bool,
    value: Option<String>,
    error_message: Option<String>,
}

impl SecretReply {
    fn success(value: Option<String>) -> Self {
        Self {
            ok: true,
            has_value: value.is_some(),
            value,
            error_message: None,
        }
    }

    fn failure(message: &str) -> Self {
        Self {
            ok: false,
            has_value: false,
            value: None,
            error_message: Some(message.to_string()),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlatformInfo {
    app_version: &'static str,
    os: &'static str,
    arch: &'static str,
    secure_store: &'static str,
    desktop_runtime: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ComputerCapability {
    id: &'static str,
    available: bool,
    permission_required: bool,
    status: &'static str,
    message: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseAsset {
    name: String,
    download_url: String,
    size: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
    ok: bool,
    current_version: String,
    latest_version: Option<String>,
    update_available: bool,
    release_url: Option<String>,
    published_at: Option<String>,
    notes: Option<String>,
    assets: Vec<ReleaseAsset>,
    error_message: Option<String>,
}


#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProjectFileNode {
    path: String,
    name: String,
    kind: String,
    size: u64,
    depth: usize,
    children: Option<Vec<ProjectFileNode>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectWorkspace {
    root: String,
    name: String,
    file_count: usize,
    git_repository: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFileContent {
    ok: bool,
    path: String,
    content: String,
    binary: bool,
    size: u64,
    error_message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectWriteResult {
    ok: bool,
    path: String,
    backup_path: Option<String>,
    bytes_written: usize,
    error_message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectCommandResult {
    ok: bool,
    preset: String,
    command: String,
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
    duration_ms: u128,
    error_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProjectChangeFileReceipt {
    path: String,
    action: String,
    existed_before: bool,
    backup_path: Option<String>,
    after_path: Option<String>,
    status: String,
    error_message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectChangeSessionResult {
    ok: bool,
    session_id: Option<String>,
    status: String,
    files: Vec<ProjectChangeFileReceipt>,
    patch_archive: Option<String>,
    error_message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectRecoveredChangeSession {
    session: ProjectChangeSessionResult,
    patch: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectChangeManifest {
    session_id: String,
    status: String,
    patch_archive: String,
    files: Vec<ProjectChangeFileReceipt>,
}

#[derive(Debug, Clone)]
struct ProjectPatchTarget {
    path: String,
    action: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitHubConnectionInfo {
    ok: bool,
    login: Option<String>,
    name: Option<String>,
    avatar_url: Option<String>,
    error_message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitHubRepositoryOverview {
    ok: bool,
    full_name: Option<String>,
    default_branch: Option<String>,
    private_repo: Option<bool>,
    stars: Option<u64>,
    open_issues: Option<u64>,
    pushed_at: Option<String>,
    html_url: Option<String>,
    error_message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitHubIssueSummary {
    number: u64,
    title: String,
    state: String,
    url: String,
    updated_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitHubPullRequestResult {
    ok: bool,
    number: Option<u64>,
    url: Option<String>,
    title: Option<String>,
    error_message: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpRequestInput {
    profile_id: String,
    url: String,
    token: String,
    requires_credential: bool,
    method: String,
    params: Value,
    confirmed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct McpReply {
    ok: bool,
    status: u16,
    result: Option<Value>,
    error_code: Option<String>,
    error_message: Option<String>,
    latency_ms: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ComputerActionResult {
    ok: bool,
    action: String,
    message: String,
    screenshot_data_url: Option<String>,
    timestamp: String,
}
fn provider_name(provider_id: &str) -> &'static str {
    match provider_id {
        "deepseek" => "DeepSeek",
        "openai" => "OpenAI",
        "anthropic" => "Anthropic",
        "gemini" => "Gemini",
        "qwen" => "Qwen",
        "kimi" => "Kimi",
        "doubao" => "Doubao",
        "zhipu" => "Zhipu",
        "openrouter" => "OpenRouter",
        "ollama" => "Ollama",
        "lmstudio" => "LM Studio",
        "custom" => "custom provider",
        _ => "provider",
    }
}

fn is_local_host(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "::1")
}

fn trusted_host(provider_id: &str, host: &str) -> bool {
    match provider_id {
        "deepseek" => host == "api.deepseek.com",
        "openai" => host == "api.openai.com",
        "anthropic" => host == "api.anthropic.com",
        "gemini" => host == "generativelanguage.googleapis.com",
        "qwen" => host == "dashscope.aliyuncs.com",
        "kimi" => host == "api.moonshot.cn",
        "doubao" => host == "ark.cn-beijing.volces.com",
        "zhipu" => host == "open.bigmodel.cn",
        "openrouter" => host == "openrouter.ai",
        "ollama" | "lmstudio" => is_local_host(host),
        "custom" => true,
        _ => false,
    }
}

fn validate_endpoint(config: &ProviderConfigInput) -> Result<String, ProviderReply> {
    let raw = config.base_url.trim().trim_end_matches('/');
    let parsed = Url::parse(raw).map_err(|_| {
        ProviderReply::failure(0, "INVALID_ENDPOINT", "Enter a valid provider base URL.", 0)
    })?;
    let host = parsed.host_str().unwrap_or_default();
    let local = is_local_host(host);
    if parsed.scheme() != "https" && !(parsed.scheme() == "http" && local) {
        return Err(ProviderReply::failure(
            0,
            "UNSAFE_ENDPOINT",
            "Remote providers require HTTPS. Plain HTTP is allowed only for localhost runtimes.",
            0,
        ));
    }
    if !trusted_host(config.provider_id.as_str(), host) {
        return Err(ProviderReply::failure(
            0,
            "UNTRUSTED_ENDPOINT",
            "The endpoint host does not match the selected provider. Use Custom API for another trusted HTTPS host.",
            0,
        ));
    }
    Ok(raw.to_string())
}

fn validate_config(config: &ProviderConfigInput) -> Result<(String, String, u64), ProviderReply> {
    if config.api_style == "local-demo" || config.provider_id == "local-demo" {
        return Err(ProviderReply::failure(
            0,
            "LOCAL_ONLY",
            "The local sandbox is handled without a network request.",
            0,
        ));
    }

    if config.requires_credential {
        let api_key = config.api_key.trim();
        if api_key.len() < 8 || api_key.len() > 2048 || api_key.contains('\n') || api_key.contains('\r') {
            return Err(ProviderReply::failure(
                0,
                "INVALID_CREDENTIAL",
                "The API credential is missing or malformed.",
                0,
            ));
        }
    }

    let model = config.model.trim();
    if model.is_empty() || model.len() > 256 || model.contains('\n') || model.contains('\r') {
        return Err(ProviderReply::failure(
            0,
            "INVALID_MODEL",
            "Enter the model or endpoint identifier supplied by the provider.",
            0,
        ));
    }

    let base = validate_endpoint(config)?;
    let timeout = config.timeout_ms.clamp(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
    Ok((base, model.to_string(), timeout))
}

fn validate_messages(messages: &[ProviderMessage], started: Instant) -> Result<(), ProviderReply> {
    if messages.is_empty()
        || messages.len() > 160
        || messages.iter().any(|message| {
            !matches!(message.role.as_str(), "user" | "assistant" | "system")
                || serde_json::to_string(&message.content).map(|value| value.len()).unwrap_or(MAX_MESSAGE_CHARS + 1) > MAX_MESSAGE_CHARS
        })
    {
        return Err(ProviderReply::failure(
            0,
            "INVALID_PAYLOAD",
            "The reviewed conversation payload is empty or exceeds safety limits.",
            started.elapsed().as_millis(),
        ));
    }
    Ok(())
}

fn endpoint(base: &str, suffix: &str) -> String {
    if base.ends_with(suffix) {
        base.to_string()
    } else {
        format!("{base}{suffix}")
    }
}

fn status_message(status: u16, provider_id: &str) -> (String, String) {
    let name = provider_name(provider_id);
    let pair = match status {
        400 => ("BAD_REQUEST", "rejected the request. Check the selected model and endpoint."),
        401 => ("UNAUTHORIZED", "rejected the API credential."),
        402 => ("PAYMENT_REQUIRED", "requires billing access or additional balance."),
        403 => ("FORBIDDEN", "did not permit this account to access the resource."),
        404 => ("NOT_FOUND", "could not find the endpoint or selected model."),
        408 => ("REMOTE_TIMEOUT", "timed out while processing the request."),
        429 => ("RATE_LIMITED", "rate-limited the request. Try again later."),
        500..=599 => ("PROVIDER_UNAVAILABLE", "is temporarily unavailable."),
        _ => ("PROVIDER_ERROR", "returned an unexpected response."),
    };
    (pair.0.to_string(), format!("{name} {}", pair.1))
}

fn parse_error_message(payload: &Value) -> Option<String> {
    payload
        .pointer("/error/message")
        .or_else(|| payload.get("message"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .map(|message| message.chars().take(600).collect())
}

fn send_openai_compatible(
    config: &ProviderConfigInput,
    base_url: &str,
    model: &str,
    timeout_ms: u64,
    messages: Vec<ProviderMessage>,
    max_tokens: u32,
    temperature: f64,
    started: Instant,
) -> ProviderReply {
    let url = endpoint(base_url, "/chat/completions");
    let body = json!({
        "model": model,
        "messages": messages,
        "stream": false,
        "max_tokens": max_tokens.clamp(1, 32768),
        "temperature": temperature.clamp(0.0, 2.0)
    });

    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_millis(timeout_ms))
        .build();
    let mut request = agent.post(&url).set("Content-Type", "application/json");
    if !config.api_key.trim().is_empty() {
        request = request.set("Authorization", &format!("Bearer {}", config.api_key.trim()));
    }
    if config.provider_id == "openrouter" {
        request = request
            .set("HTTP-Referer", "https://github.com/Chrisbetheking/chris-studio")
            .set("X-Title", "Chris Studio");
    }

    match request.send_json(body) {
        Ok(response) => {
            let status = response.status();
            let payload: Value = match response.into_json() {
                Ok(value) => value,
                Err(_) => {
                    return ProviderReply::failure(
                        status,
                        "INVALID_RESPONSE",
                        "The provider returned an unreadable response.",
                        started.elapsed().as_millis(),
                    )
                }
            };
            let content = payload
                .pointer("/choices/0/message/content")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned);
            if content.is_none() {
                return ProviderReply::failure(
                    status,
                    "EMPTY_RESPONSE",
                    "The provider returned no assistant content.",
                    started.elapsed().as_millis(),
                );
            }
            ProviderReply {
                ok: true,
                status,
                content,
                model: payload
                    .get("model")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .or_else(|| Some(model.to_string())),
                error_code: None,
                error_message: None,
                latency_ms: started.elapsed().as_millis(),
            }
        }
        Err(ureq::Error::Status(status, response)) => {
            let payload: Option<Value> = response.into_json().ok();
            let (code, fallback) = status_message(status, &config.provider_id);
            let message = payload
                .as_ref()
                .and_then(parse_error_message)
                .unwrap_or(fallback);
            ProviderReply::failure(status, &code, &message, started.elapsed().as_millis())
        }
        Err(ureq::Error::Transport(_)) => ProviderReply::failure(
            0,
            "NETWORK_ERROR",
            "Network connection failed. Check internet access, proxy, DNS and system time.",
            started.elapsed().as_millis(),
        ),
    }
}


fn send_openai_compatible_stream(
    window: &tauri::Window,
    state: &AppState,
    stream_id: &str,
    config: &ProviderConfigInput,
    base_url: &str,
    model: &str,
    timeout_ms: u64,
    messages: Vec<ProviderMessage>,
    max_tokens: u32,
    temperature: f64,
    started: Instant,
) -> ProviderReply {
    let url = endpoint(base_url, "/chat/completions");
    let body = json!({
        "model": model,
        "messages": messages,
        "stream": true,
        "max_tokens": max_tokens.clamp(1, 32768),
        "temperature": temperature.clamp(0.0, 2.0)
    });

    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_millis(timeout_ms))
        .build();
    let mut request = agent
        .post(&url)
        .set("Content-Type", "application/json")
        .set("Accept", "text/event-stream, application/json");
    if !config.api_key.trim().is_empty() {
        request = request.set("Authorization", &format!("Bearer {}", config.api_key.trim()));
    }
    if config.provider_id == "openrouter" {
        request = request
            .set("HTTP-Referer", "https://github.com/Chrisbetheking/chris-studio")
            .set("X-Title", "Chris Studio");
    }

    match request.send_json(body) {
        Ok(response) => {
            let status = response.status();
            let content_type = response
                .header("Content-Type")
                .unwrap_or_default()
                .to_ascii_lowercase();

            if !content_type.contains("text/event-stream") {
                let payload: Value = match response.into_json() {
                    Ok(value) => value,
                    Err(_) => {
                        let message = "The provider returned a response that was neither valid JSON nor an SSE stream.";
                        emit_provider_stream(window, stream_id, "error", None, None, Some("INVALID_RESPONSE".to_string()), Some(message.to_string()));
                        return ProviderReply::failure(status, "INVALID_RESPONSE", message, started.elapsed().as_millis());
                    }
                };
                let content = payload
                    .pointer("/choices/0/message/content")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToOwned::to_owned);
                let resolved_model = payload
                    .get("model")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .or_else(|| Some(model.to_string()));
                if let Some(text) = content.clone() {
                    emit_provider_stream(window, stream_id, "delta", Some(text), resolved_model.clone(), None, None);
                    emit_provider_stream(window, stream_id, "done", None, resolved_model.clone(), None, None);
                    return ProviderReply { ok: true, status, content, model: resolved_model, error_code: None, error_message: None, latency_ms: started.elapsed().as_millis() };
                }
                let message = parse_error_message(&payload).unwrap_or_else(|| "The provider returned no assistant content.".to_string());
                emit_provider_stream(window, stream_id, "error", None, resolved_model, Some("EMPTY_RESPONSE".to_string()), Some(message.clone()));
                return ProviderReply::failure(status, "EMPTY_RESPONSE", &message, started.elapsed().as_millis());
            }

            let mut output = String::new();
            let mut resolved_model = Some(model.to_string());
            let reader = BufReader::new(response.into_reader());
            for line in reader.lines() {
                if provider_stream_cancelled(state, stream_id) {
                    let message = "The provider stream was stopped by the user.";
                    emit_provider_stream(window, stream_id, "cancelled", None, resolved_model.clone(), Some("CANCELLED".to_string()), Some(message.to_string()));
                    clear_provider_stream_cancel(state, stream_id);
                    return ProviderReply::failure(0, "CANCELLED", message, started.elapsed().as_millis());
                }
                let line = match line {
                    Ok(value) => value,
                    Err(_) if !output.trim().is_empty() => {
                        // Some OpenAI-compatible providers close a chunked SSE body without
                        // writing the final zero-length HTTP chunk. `ureq` reports that as an
                        // unexpected EOF even though all assistant text has already arrived.
                        // Preserve the visible answer and finish successfully instead of
                        // replacing a complete response with a false stream-read failure.
                        break;
                    }
                    Err(_) => {
                        let message = "The provider stream ended before any assistant content could be read.";
                        emit_provider_stream(window, stream_id, "error", None, resolved_model.clone(), Some("STREAM_READ_ERROR".to_string()), Some(message.to_string()));
                        return ProviderReply::failure(status, "STREAM_READ_ERROR", message, started.elapsed().as_millis());
                    }
                };
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with(':') || !trimmed.starts_with("data:") {
                    continue;
                }
                let data = trimmed.trim_start_matches("data:").trim();
                if data == "[DONE]" {
                    break;
                }
                let payload: Value = match serde_json::from_str(data) {
                    Ok(value) => value,
                    Err(_) => continue,
                };
                if let Some(message) = parse_error_message(&payload) {
                    emit_provider_stream(window, stream_id, "error", None, resolved_model.clone(), Some("PROVIDER_STREAM_ERROR".to_string()), Some(message.clone()));
                    return ProviderReply::failure(status, "PROVIDER_STREAM_ERROR", &message, started.elapsed().as_millis());
                }
                if let Some(value) = payload.get("model").and_then(Value::as_str) {
                    resolved_model = Some(value.to_string());
                }
                if let Some(reasoning) = payload.pointer("/choices/0/delta/reasoning_content").and_then(Value::as_str).filter(|value| !value.is_empty()) {
                    emit_provider_stream(window, stream_id, "reasoning", Some(reasoning.to_string()), resolved_model.clone(), None, None);
                }
                if let Some(delta) = payload.pointer("/choices/0/delta/content").and_then(Value::as_str).filter(|value| !value.is_empty()) {
                    output.push_str(delta);
                    emit_provider_stream(window, stream_id, "delta", Some(delta.to_string()), resolved_model.clone(), None, None);
                }
            }

            if output.trim().is_empty() {
                let message = "The provider stream completed without assistant content.";
                emit_provider_stream(window, stream_id, "error", None, resolved_model.clone(), Some("EMPTY_RESPONSE".to_string()), Some(message.to_string()));
                return ProviderReply::failure(status, "EMPTY_RESPONSE", message, started.elapsed().as_millis());
            }
            emit_provider_stream(window, stream_id, "done", None, resolved_model.clone(), None, None);
            ProviderReply {
                ok: true,
                status,
                content: Some(output),
                model: resolved_model,
                error_code: None,
                error_message: None,
                latency_ms: started.elapsed().as_millis(),
            }
        }
        Err(ureq::Error::Status(status, response)) => {
            let payload: Option<Value> = response.into_json().ok();
            let (code, fallback) = status_message(status, &config.provider_id);
            let message = payload.as_ref().and_then(parse_error_message).unwrap_or(fallback);
            emit_provider_stream(window, stream_id, "error", None, Some(model.to_string()), Some(code.clone()), Some(message.clone()));
            ProviderReply::failure(status, &code, &message, started.elapsed().as_millis())
        }
        Err(ureq::Error::Transport(_)) => {
            let message = "Network connection failed. Check internet access, proxy, DNS and system time.";
            emit_provider_stream(window, stream_id, "error", None, Some(model.to_string()), Some("NETWORK_ERROR".to_string()), Some(message.to_string()));
            ProviderReply::failure(0, "NETWORK_ERROR", message, started.elapsed().as_millis())
        }
    }
}

fn send_anthropic(
    config: &ProviderConfigInput,
    base_url: &str,
    model: &str,
    timeout_ms: u64,
    messages: Vec<ProviderMessage>,
    max_tokens: u32,
    temperature: f64,
    started: Instant,
) -> ProviderReply {
    let url = endpoint(base_url, "/messages");
    let system = messages
        .iter()
        .filter(|message| message.role == "system")
        .filter_map(|message| message.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    let chat_messages: Vec<Value> = messages
        .into_iter()
        .filter(|message| message.role != "system")
        .map(|message| {
            let content = match message.content {
                Value::Array(items) => Value::Array(items.into_iter().filter_map(|item| {
                    match item.get("type").and_then(Value::as_str) {
                        Some("text") => Some(json!({ "type": "text", "text": item.get("text").and_then(Value::as_str).unwrap_or_default() })),
                        Some("image_url") => {
                            let url = item.pointer("/image_url/url").and_then(Value::as_str)?;
                            let data = url.strip_prefix("data:")?;
                            let (media_type, encoded) = data.split_once(";base64,")?;
                            Some(json!({ "type": "image", "source": { "type": "base64", "media_type": media_type, "data": encoded } }))
                        }
                        _ => None,
                    }
                }).collect()),
                other => other,
            };
            json!({ "role": message.role, "content": content })
        })
        .collect();
    let mut body = json!({
        "model": model,
        "messages": chat_messages,
        "max_tokens": max_tokens.clamp(1, 32768),
        "temperature": temperature.clamp(0.0, 1.0)
    });
    if !system.is_empty() {
        body["system"] = Value::String(system);
    }

    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_millis(timeout_ms))
        .build();
    let response = agent
        .post(&url)
        .set("Content-Type", "application/json")
        .set("x-api-key", config.api_key.trim())
        .set("anthropic-version", "2023-06-01")
        .send_json(body);

    match response {
        Ok(response) => {
            let status = response.status();
            let payload: Value = match response.into_json() {
                Ok(value) => value,
                Err(_) => {
                    return ProviderReply::failure(
                        status,
                        "INVALID_RESPONSE",
                        "Anthropic returned an unreadable response.",
                        started.elapsed().as_millis(),
                    )
                }
            };
            let content = payload
                .get("content")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.get("text").and_then(Value::as_str))
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .map(|text| text.trim().to_string())
                .filter(|text| !text.is_empty());
            if content.is_none() {
                return ProviderReply::failure(
                    status,
                    "EMPTY_RESPONSE",
                    "Anthropic returned no assistant content.",
                    started.elapsed().as_millis(),
                );
            }
            ProviderReply {
                ok: true,
                status,
                content,
                model: payload
                    .get("model")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .or_else(|| Some(model.to_string())),
                error_code: None,
                error_message: None,
                latency_ms: started.elapsed().as_millis(),
            }
        }
        Err(ureq::Error::Status(status, response)) => {
            let payload: Option<Value> = response.into_json().ok();
            let (code, fallback) = status_message(status, &config.provider_id);
            let message = payload
                .as_ref()
                .and_then(parse_error_message)
                .unwrap_or(fallback);
            ProviderReply::failure(status, &code, &message, started.elapsed().as_millis())
        }
        Err(ureq::Error::Transport(_)) => ProviderReply::failure(
            0,
            "NETWORK_ERROR",
            "Network connection failed. Check internet access, proxy, DNS and system time.",
            started.elapsed().as_millis(),
        ),
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn hydrate_provider_secret(config: &mut ProviderConfigInput, started: Instant) -> Result<(), ProviderReply> {
    if !config.requires_credential || !config.api_key.trim().is_empty() {
        return Ok(());
    }
    let entry = credential_entry(&config.profile_id).map_err(|message| {
        ProviderReply::failure(0, "SECURE_STORE_ERROR", &message, started.elapsed().as_millis())
    })?;
    match entry.get_password() {
        Ok(value) => {
            config.api_key = value;
            Ok(())
        }
        Err(keyring::Error::NoEntry) => Err(ProviderReply::failure(
            0,
            "INVALID_CREDENTIAL",
            "No API credential is stored for this provider profile.",
            started.elapsed().as_millis(),
        )),
        Err(_) => Err(ProviderReply::failure(
            0,
            "SECURE_STORE_ERROR",
            "The operating-system credential store rejected the read.",
            started.elapsed().as_millis(),
        )),
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn hydrate_provider_secret(config: &mut ProviderConfigInput, started: Instant) -> Result<(), ProviderReply> {
    if config.requires_credential && config.api_key.trim().is_empty() {
        return Err(ProviderReply::failure(
            0,
            "SECURE_STORE_UNAVAILABLE",
            "Secure provider credentials are available only in the macOS and Windows desktop builds.",
            started.elapsed().as_millis(),
        ));
    }
    Ok(())
}

fn send_request(
    mut config: ProviderConfigInput,
    messages: Vec<ProviderMessage>,
    max_tokens: u32,
    temperature: f64,
) -> ProviderReply {
    let started = Instant::now();
    if let Err(error) = hydrate_provider_secret(&mut config, started) {
        return error;
    }
    let (base_url, model, timeout_ms) = match validate_config(&config) {
        Ok(value) => value,
        Err(mut error) => {
            error.latency_ms = started.elapsed().as_millis();
            return error;
        }
    };
    if let Err(error) = validate_messages(&messages, started) {
        return error;
    }

    match config.api_style.as_str() {
        "anthropic" => send_anthropic(
            &config,
            &base_url,
            &model,
            timeout_ms,
            messages,
            max_tokens,
            temperature,
            started,
        ),
        "openai-compatible" => send_openai_compatible(
            &config,
            &base_url,
            &model,
            timeout_ms,
            messages,
            max_tokens,
            temperature,
            started,
        ),
        _ => ProviderReply::failure(
            0,
            "UNSUPPORTED_API_STYLE",
            "This provider API style is not supported by the desktop runtime.",
            started.elapsed().as_millis(),
        ),
    }
}


fn send_stream_request(
    window: &tauri::Window,
    state: &AppState,
    stream_id: &str,
    mut config: ProviderConfigInput,
    messages: Vec<ProviderMessage>,
    max_tokens: u32,
    temperature: f64,
) -> ProviderReply {
    let started = Instant::now();
    if let Err(error) = hydrate_provider_secret(&mut config, started) {
        emit_provider_stream(window, stream_id, "error", None, None, error.error_code.clone(), error.error_message.clone());
        return error;
    }
    let (base_url, model, timeout_ms) = match validate_config(&config) {
        Ok(value) => value,
        Err(mut error) => {
            error.latency_ms = started.elapsed().as_millis();
            emit_provider_stream(window, stream_id, "error", None, None, error.error_code.clone(), error.error_message.clone());
            return error;
        }
    };
    if let Err(error) = validate_messages(&messages, started) {
        emit_provider_stream(window, stream_id, "error", None, Some(model), error.error_code.clone(), error.error_message.clone());
        return error;
    }

    match config.api_style.as_str() {
        "openai-compatible" => send_openai_compatible_stream(
            window,
            state,
            stream_id,
            &config,
            &base_url,
            &model,
            timeout_ms,
            messages,
            max_tokens,
            temperature,
            started,
        ),
        "anthropic" => {
            let reply = send_anthropic(&config, &base_url, &model, timeout_ms, messages, max_tokens, temperature, started);
            if reply.ok {
                if let Some(content) = reply.content.clone() {
                    emit_provider_stream(window, stream_id, "delta", Some(content), reply.model.clone(), None, None);
                }
                emit_provider_stream(window, stream_id, "done", None, reply.model.clone(), None, None);
            } else {
                emit_provider_stream(window, stream_id, "error", None, reply.model.clone(), reply.error_code.clone(), reply.error_message.clone());
            }
            reply
        }
        _ => {
            let message = "This provider API style is not supported by the streaming runtime.";
            emit_provider_stream(window, stream_id, "error", None, Some(model), Some("UNSUPPORTED_API_STYLE".to_string()), Some(message.to_string()));
            ProviderReply::failure(0, "UNSUPPORTED_API_STYLE", message, started.elapsed().as_millis())
        }
    }
}

fn credential_user(profile_id: &str) -> Result<String, String> {
    let trimmed = profile_id.trim();
    if trimmed.is_empty() || trimmed.len() > 160 {
        return Err("The provider profile identifier is invalid.".to_string());
    }
    let sanitized: String = trimmed
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '_'
            }
        })
        .collect();
    Ok(sanitized)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn credential_entry(profile_id: &str) -> Result<keyring::Entry, String> {
    let user = credential_user(profile_id)?;
    keyring::Entry::new(CREDENTIAL_SERVICE, &user)
        .map_err(|_| "The operating-system credential store could not create an entry.".to_string())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn secret_save(profile_id: String, secret: String) -> SecretReply {
    let trimmed = secret.trim();
    if trimmed.len() < 8 || trimmed.len() > 2048 || trimmed.contains('\n') || trimmed.contains('\r') {
        return SecretReply::failure("The API credential is missing or malformed.");
    }
    match credential_entry(&profile_id).and_then(|entry| {
        entry
            .set_password(trimmed)
            .map_err(|_| "The operating-system credential store rejected the write.".to_string())
    }) {
        Ok(()) => SecretReply::success(None),
        Err(message) => SecretReply::failure(&message),
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn secret_save(_profile_id: String, _secret: String) -> SecretReply {
    SecretReply::failure("Secure credential storage is only enabled for macOS and Windows builds.")
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn secret_load(profile_id: String) -> SecretReply {
    let entry = match credential_entry(&profile_id) {
        Ok(entry) => entry,
        Err(message) => return SecretReply::failure(&message),
    };
    match entry.get_password() {
        Ok(_) => SecretReply { ok: true, has_value: true, value: None, error_message: None },
        Err(keyring::Error::NoEntry) => SecretReply::success(None),
        Err(_) => SecretReply::failure("The operating-system credential store rejected the read."),
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn secret_load(_profile_id: String) -> SecretReply {
    SecretReply::failure("Secure credential storage is only enabled for macOS and Windows builds.")
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn secret_delete(profile_id: String) -> SecretReply {
    let entry = match credential_entry(&profile_id) {
        Ok(entry) => entry,
        Err(message) => return SecretReply::failure(&message),
    };
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => SecretReply::success(None),
        Err(_) => SecretReply::failure("The operating-system credential store rejected the delete."),
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn secret_delete(_profile_id: String) -> SecretReply {
    SecretReply::success(None)
}

#[tauri::command]
fn provider_connection_test(config: ProviderConfigInput) -> ProviderReply {
    send_request(
        config,
        vec![ProviderMessage {
            role: "user".to_string(),
            content: Value::String("Reply with exactly: Chris Studio connection verified.".to_string()),
        }],
        48,
        0.0,
    )
}

#[tauri::command]
fn provider_chat(request: ProviderChatRequest) -> ProviderReply {
    send_request(
        request.config,
        request.messages,
        request.max_tokens.unwrap_or(3072),
        request.temperature.unwrap_or(0.25),
    )
}


#[tauri::command]
fn provider_chat_stream(
    window: tauri::Window,
    state: State<AppState>,
    request: ProviderChatRequest,
    stream_id: String,
) -> Result<bool, String> {
    if stream_id.trim().is_empty() || stream_id.len() > 160 {
        return Err("The provider stream identifier is invalid.".to_string());
    }

    // Start the blocking SSE worker and return immediately. Tauri v1 can delay
    // renderer-side event delivery while a command invocation is still open,
    // which makes a real stream look like one completed response. The worker
    // owns cloned state/window handles and communicates exclusively through
    // chris-studio://provider-stream events.
    let worker_state = state.inner().clone();
    let cleanup_state = worker_state.clone();
    let worker_window = window.clone();
    let error_window = window;
    let worker_stream_id = stream_id.clone();
    let error_stream_id = stream_id.clone();
    clear_provider_stream_cancel(&worker_state, &worker_stream_id);

    tauri::async_runtime::spawn(async move {
        let worker = tauri::async_runtime::spawn_blocking(move || {
            let reply = send_stream_request(
                &worker_window,
                &worker_state,
                &worker_stream_id,
                request.config,
                request.messages,
                request.max_tokens.unwrap_or(3072),
                request.temperature.unwrap_or(0.25),
            );
            clear_provider_stream_cancel(&worker_state, &worker_stream_id);
            reply
        })
        .await;

        if worker.is_err() {
            clear_provider_stream_cancel(&cleanup_state, &error_stream_id);
            emit_provider_stream(
                &error_window,
                &error_stream_id,
                "error",
                None,
                None,
                Some("STREAM_WORKER_ERROR".to_string()),
                Some("The provider streaming worker stopped unexpectedly.".to_string()),
            );
        }
    });

    Ok(true)
}

#[tauri::command]
fn provider_stream_cancel(state: State<AppState>, stream_id: String) -> bool {
    if stream_id.trim().is_empty() || stream_id.len() > 160 {
        return false;
    }
    match state.cancelled_provider_streams.lock() {
        Ok(mut streams) => {
            streams.insert(stream_id);
            true
        }
        Err(_) => false,
    }
}

#[tauri::command]
fn provider_secret_save(profile_id: String, secret: String) -> SecretReply {
    secret_save(profile_id, secret)
}

#[tauri::command]
fn provider_secret_load(profile_id: String) -> SecretReply {
    secret_load(profile_id)
}

#[tauri::command]
fn provider_secret_delete(profile_id: String) -> SecretReply {
    secret_delete(profile_id)
}

#[tauri::command]
fn platform_info() -> PlatformInfo {
    PlatformInfo {
        app_version: env!("CARGO_PKG_VERSION"),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        secure_store: if cfg!(target_os = "macos") {
            "macOS Keychain"
        } else if cfg!(target_os = "windows") {
            "Windows Credential Manager"
        } else {
            "Unavailable"
        },
        desktop_runtime: true,
    }
}

#[tauri::command]
fn computer_capabilities(state: State<AppState>) -> Vec<ComputerCapability> {
    let native_ready = cfg!(target_os = "macos");
    #[cfg(target_os = "macos")]
    let screen_ok = macos_screen_capture_authorized()
        || state.screen_capture_verified.lock().map(|value| *value).unwrap_or(false);
    #[cfg(not(target_os = "macos"))]
    let screen_ok = false;
    #[cfg(target_os = "macos")]
    let accessibility_ok = macos_accessibility_authorized();
    #[cfg(not(target_os = "macos"))]
    let accessibility_ok = false;

    vec![
        ComputerCapability {
            id: "screen-capture",
            available: native_ready,
            permission_required: true,
            status: if screen_ok { "ready" } else if native_ready { "permission-needed" } else { "planned" },
            message: if screen_ok { "Screen Recording permission is active for this process." } else if native_ready { "Enable Chris Studio under Privacy & Security > Screen & System Audio Recording, then fully quit and reopen it." } else { "Currently implemented for macOS builds." },
        },
        ComputerCapability {
            id: "open-url",
            available: true,
            permission_required: false,
            status: "ready",
            message: "Chris Studio can open reviewed HTTP and HTTPS links through the operating system.",
        },
        ComputerCapability {
            id: "keyboard",
            available: native_ready,
            permission_required: true,
            status: if accessibility_ok { "ready" } else if native_ready { "permission-needed" } else { "planned" },
            message: if accessibility_ok { "Accessibility permission is active for approved typing and keys." } else if native_ready { "Enable Chris Studio under Privacy & Security > Accessibility, then fully quit and reopen it." } else { "Currently implemented for macOS builds." },
        },
        ComputerCapability {
            id: "pointer",
            available: native_ready,
            permission_required: true,
            status: if accessibility_ok { "ready" } else if native_ready { "permission-needed" } else { "planned" },
            message: if accessibility_ok { "Accessibility permission is active for approved pointer control." } else if native_ready { "Enable Chris Studio under Privacy & Security > Accessibility, then fully quit and reopen it." } else { "Currently implemented for macOS builds." },
        },
        ComputerCapability {
            id: "project-files",
            available: true,
            permission_required: true,
            status: "ready",
            message: "Scoped project folders support read, reviewed writes and automatic backups.",
        },
        ComputerCapability {
            id: "terminal",
            available: true,
            permission_required: true,
            status: "ready",
            message: "Only fixed build, test and Git diagnostics from the command allowlist can run.",
        },
    ]
}

fn clean_repo_segment(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 100 {
        return None;
    }
    if trimmed
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    {
        Some(trimmed.to_string())
    } else {
        None
    }
}

fn numeric_version(version: &str) -> Vec<u64> {
    version
        .trim()
        .trim_start_matches('v')
        .split(|character: char| !character.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .take(4)
        .map(|part| part.parse::<u64>().unwrap_or(0))
        .collect()
}

fn is_newer(latest: &str, current: &str) -> bool {
    let mut latest_parts = numeric_version(latest);
    let mut current_parts = numeric_version(current);
    let size = latest_parts.len().max(current_parts.len()).max(3);
    latest_parts.resize(size, 0);
    current_parts.resize(size, 0);
    latest_parts > current_parts
}

#[tauri::command]
fn github_release_check(owner: String, repo: String) -> UpdateInfo {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let owner = match clean_repo_segment(&owner) {
        Some(value) => value,
        None => {
            return UpdateInfo {
                ok: false,
                current_version: current,
                latest_version: None,
                update_available: false,
                release_url: None,
                published_at: None,
                notes: None,
                assets: vec![],
                error_message: Some("The GitHub owner is invalid.".to_string()),
            }
        }
    };
    let repo = match clean_repo_segment(&repo) {
        Some(value) => value,
        None => {
            return UpdateInfo {
                ok: false,
                current_version: current,
                latest_version: None,
                update_available: false,
                release_url: None,
                published_at: None,
                notes: None,
                assets: vec![],
                error_message: Some("The GitHub repository name is invalid.".to_string()),
            }
        }
    };
    let endpoint = format!("https://api.github.com/repos/{owner}/{repo}/releases/latest");
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(20))
        .build();
    let response = agent
        .get(&endpoint)
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", "Chris-Studio")
        .call();

    match response {
        Ok(response) => {
            let payload: Value = match response.into_json() {
                Ok(value) => value,
                Err(_) => {
                    return UpdateInfo {
                        ok: false,
                        current_version: current,
                        latest_version: None,
                        update_available: false,
                        release_url: None,
                        published_at: None,
                        notes: None,
                        assets: vec![],
                        error_message: Some("GitHub returned an unreadable release response.".to_string()),
                    }
                }
            };
            let latest = payload
                .get("tag_name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let assets = payload
                .get("assets")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|asset| {
                            Some(ReleaseAsset {
                                name: asset.get("name")?.as_str()?.to_string(),
                                download_url: asset
                                    .get("browser_download_url")?
                                    .as_str()?
                                    .to_string(),
                                size: asset.get("size").and_then(Value::as_u64).unwrap_or(0),
                            })
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            UpdateInfo {
                ok: true,
                current_version: current.clone(),
                latest_version: Some(latest.clone()),
                update_available: !latest.is_empty() && is_newer(&latest, &current),
                release_url: payload
                    .get("html_url")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                published_at: payload
                    .get("published_at")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                notes: payload
                    .get("body")
                    .and_then(Value::as_str)
                    .map(|notes| notes.chars().take(8_000).collect()),
                assets,
                error_message: None,
            }
        }
        Err(ureq::Error::Status(status, _)) => UpdateInfo {
            ok: false,
            current_version: current,
            latest_version: None,
            update_available: false,
            release_url: None,
            published_at: None,
            notes: None,
            assets: vec![],
            error_message: Some(format!("GitHub release check failed with HTTP {status}.")),
        },
        Err(ureq::Error::Transport(_)) => UpdateInfo {
            ok: false,
            current_version: current,
            latest_version: None,
            update_available: false,
            release_url: None,
            published_at: None,
            notes: None,
            assets: vec![],
            error_message: Some("Could not reach GitHub. Check internet access or the system proxy.".to_string()),
        },
    }
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let parsed = Url::parse(url.trim()).map_err(|_| "The external URL is invalid.".to_string())?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err("Only HTTP and HTTPS links can be opened.".to_string());
    }

    #[cfg(target_os = "macos")]
    let result = Command::new("/usr/bin/open").arg(parsed.as_str()).spawn();
    #[cfg(target_os = "windows")]
    let result = Command::new("cmd")
        .args(["/C", "start", "", parsed.as_str()])
        .spawn();
    #[cfg(target_os = "linux")]
    let result = Command::new("xdg-open").arg(parsed.as_str()).spawn();

    result
        .map(|_| ())
        .map_err(|_| "The operating system could not open the link.".to_string())
}

fn unix_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}

fn truncate_output(value: &[u8]) -> String {
    String::from_utf8_lossy(value).chars().take(80_000).collect()
}

fn ignored_project_name(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "target" | "dist" | "build" | ".next" | ".cache" | ".idea" | ".vscode" | ".tokenfence" | ".chris-studio"
    ) || name.starts_with(".DS_Store")
}

fn count_project_files(path: &Path, depth: usize, count: &mut usize) {
    if depth > 16 || *count >= 20_000 {
        return;
    }
    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if ignored_project_name(&name) {
            continue;
        }
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            count_project_files(&entry.path(), depth + 1, count);
        } else if metadata.is_file() {
            *count += 1;
        }
        if *count >= 20_000 {
            break;
        }
    }
}

fn project_workspace(root: &Path) -> ProjectWorkspace {
    let mut file_count = 0;
    count_project_files(root, 0, &mut file_count);
    ProjectWorkspace {
        root: root.to_string_lossy().to_string(),
        name: root.file_name().and_then(|value| value.to_str()).unwrap_or("Project").to_string(),
        file_count,
        git_repository: root.join(".git").is_dir(),
    }
}

fn set_project_root_path(root: PathBuf, state: &State<'_, AppState>) -> Result<ProjectWorkspace, String> {
    let canonical = root.canonicalize().map_err(|_| "The selected project folder could not be opened.".to_string())?;
    if !canonical.is_dir() {
        return Err("The selected project path is not a folder.".to_string());
    }
    let mut slot = state.project_root.lock().map_err(|_| "The project workspace is busy.".to_string())?;
    *slot = Some(canonical.clone());
    Ok(project_workspace(&canonical))
}

fn current_project_root(state: &State<'_, AppState>) -> Result<PathBuf, String> {
    state
        .project_root
        .lock()
        .map_err(|_| "The project workspace is busy.".to_string())?
        .clone()
        .ok_or_else(|| "Open a project folder first.".to_string())
}

fn clean_relative_path(value: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(value.trim());
    if path.as_os_str().is_empty() || path.is_absolute() {
        return Err("The project file path is invalid.".to_string());
    }
    for component in path.components() {
        match component {
            Component::Normal(_) => {}
            _ => return Err("Parent traversal is not allowed in project paths.".to_string()),
        }
    }
    if path.components().any(|component| matches!(component.as_os_str().to_str(), Some(".git" | ".chris-studio" | ".tokenfence"))) {
        return Err("Direct writes inside protected repository metadata are blocked.".to_string());
    }
    Ok(path)
}

fn resolve_project_path(root: &Path, relative: &str, require_existing: bool) -> Result<(PathBuf, PathBuf), String> {
    let clean = clean_relative_path(relative)?;
    let joined = root.join(&clean);
    if require_existing {
        let canonical = joined.canonicalize().map_err(|_| "The requested project file does not exist.".to_string())?;
        if !canonical.starts_with(root) {
            return Err("The requested file is outside the approved project folder.".to_string());
        }
        Ok((canonical, clean))
    } else {
        let mut existing_ancestor = joined.parent().ok_or_else(|| "The project file has no parent folder.".to_string())?;
        while !existing_ancestor.exists() {
            existing_ancestor = existing_ancestor.parent().ok_or_else(|| "The project file has no existing scoped parent folder.".to_string())?;
        }
        let canonical_parent = existing_ancestor.canonicalize().map_err(|_| "The nearest existing parent folder could not be opened.".to_string())?;
        if !canonical_parent.starts_with(root) {
            return Err("The requested file is outside the approved project folder.".to_string());
        }
        Ok((joined, clean))
    }
}

fn scan_project_directory(root: &Path, current: &Path, depth: usize, count: &mut usize) -> Vec<ProjectFileNode> {
    if depth > 12 || *count >= 5_000 {
        return vec![];
    }
    let mut entries = match fs::read_dir(current) {
        Ok(entries) => entries.flatten().collect::<Vec<_>>(),
        Err(_) => return vec![],
    };
    entries.sort_by_key(|entry| entry.file_name().to_string_lossy().to_lowercase());
    let mut nodes = vec![];
    for entry in entries {
        if *count >= 5_000 {
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if ignored_project_name(&name) {
            continue;
        }
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        let path = entry.path();
        let relative = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().to_string();
        if metadata.is_dir() {
            nodes.push(ProjectFileNode {
                path: relative,
                name,
                kind: "directory".to_string(),
                size: 0,
                depth,
                children: Some(scan_project_directory(root, &path, depth + 1, count)),
            });
        } else if metadata.is_file() {
            *count += 1;
            nodes.push(ProjectFileNode {
                path: relative,
                name,
                kind: "file".to_string(),
                size: metadata.len(),
                depth,
                children: None,
            });
        }
    }
    nodes
}

#[tauri::command]
fn project_choose_folder(state: State<'_, AppState>) -> Result<Option<ProjectWorkspace>, String> {
    let selected = tauri::api::dialog::blocking::FileDialogBuilder::new().pick_folder();
    match selected {
        Some(root) => set_project_root_path(root, &state).map(Some),
        None => Ok(None),
    }
}

#[tauri::command]
fn project_set_root(root: String, state: State<'_, AppState>) -> Result<Option<ProjectWorkspace>, String> {
    set_project_root_path(PathBuf::from(root), &state).map(Some)
}

#[tauri::command]
fn project_scan(state: State<'_, AppState>) -> Result<Vec<ProjectFileNode>, String> {
    let root = current_project_root(&state)?;
    let mut count = 0;
    Ok(scan_project_directory(&root, &root, 0, &mut count))
}

#[tauri::command]
fn project_read_file(path: String, state: State<'_, AppState>) -> ProjectFileContent {
    let root = match current_project_root(&state) {
        Ok(root) => root,
        Err(message) => return ProjectFileContent { ok: false, path, content: String::new(), binary: false, size: 0, error_message: Some(message) },
    };
    let (file_path, clean) = match resolve_project_path(&root, &path, true) {
        Ok(value) => value,
        Err(message) => return ProjectFileContent { ok: false, path, content: String::new(), binary: false, size: 0, error_message: Some(message) },
    };
    let metadata = match fs::metadata(&file_path) {
        Ok(metadata) => metadata,
        Err(_) => return ProjectFileContent { ok: false, path, content: String::new(), binary: false, size: 0, error_message: Some("The file could not be inspected.".to_string()) },
    };
    if metadata.len() > 2_500_000 {
        return ProjectFileContent { ok: false, path, content: String::new(), binary: false, size: metadata.len(), error_message: Some("Files larger than 2.5 MB are not opened in the code editor.".to_string()) };
    }
    match fs::read(&file_path) {
        Ok(bytes) => {
            let binary = bytes.iter().take(8_192).any(|byte| *byte == 0);
            if binary {
                ProjectFileContent { ok: true, path: clean.to_string_lossy().to_string(), content: String::new(), binary: true, size: bytes.len() as u64, error_message: None }
            } else {
                ProjectFileContent { ok: true, path: clean.to_string_lossy().to_string(), content: String::from_utf8_lossy(&bytes).to_string(), binary: false, size: bytes.len() as u64, error_message: None }
            }
        }
        Err(_) => ProjectFileContent { ok: false, path, content: String::new(), binary: false, size: metadata.len(), error_message: Some("The file could not be read.".to_string()) },
    }
}

#[tauri::command]
fn project_write_file(path: String, content: String, confirmed: bool, state: State<'_, AppState>) -> ProjectWriteResult {
    if !confirmed {
        return ProjectWriteResult { ok: false, path, backup_path: None, bytes_written: 0, error_message: Some("Explicit write approval is required.".to_string()) };
    }
    if content.len() > 2_500_000 {
        return ProjectWriteResult { ok: false, path, backup_path: None, bytes_written: 0, error_message: Some("Editor writes are limited to 2.5 MB.".to_string()) };
    }
    let root = match current_project_root(&state) {
        Ok(root) => root,
        Err(message) => return ProjectWriteResult { ok: false, path, backup_path: None, bytes_written: 0, error_message: Some(message) },
    };
    let (file_path, clean) = match resolve_project_path(&root, &path, false) {
        Ok(value) => value,
        Err(message) => return ProjectWriteResult { ok: false, path, backup_path: None, bytes_written: 0, error_message: Some(message) },
    };
    let mut backup_path = None;
    if file_path.exists() {
        let backup = root.join(".tokenfence").join("backups").join(unix_timestamp()).join(&clean);
        if let Some(parent) = backup.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if fs::copy(&file_path, &backup).is_ok() {
            backup_path = Some(backup.to_string_lossy().to_string());
        }
    }
    if let Some(parent) = file_path.parent() {
        if fs::create_dir_all(parent).is_err() {
            return ProjectWriteResult { ok: false, path, backup_path, bytes_written: 0, error_message: Some("The target folder could not be created.".to_string()) };
        }
    }
    match fs::write(&file_path, content.as_bytes()) {
        Ok(()) => ProjectWriteResult { ok: true, path: clean.to_string_lossy().to_string(), backup_path, bytes_written: content.len(), error_message: None },
        Err(_) => ProjectWriteResult { ok: false, path, backup_path, bytes_written: 0, error_message: Some("The operating system rejected the project write.".to_string()) },
    }
}

fn run_project_command(root: &Path, preset: &str, program: &str, args: &[&str]) -> ProjectCommandResult {
    let started = Instant::now();
    let command_display = std::iter::once(program).chain(args.iter().copied()).collect::<Vec<_>>().join(" ");
    match Command::new(program).args(args).current_dir(root).env("CI", "true").output() {
        Ok(output) => ProjectCommandResult {
            ok: output.status.success(),
            preset: preset.to_string(),
            command: command_display,
            stdout: truncate_output(&output.stdout),
            stderr: truncate_output(&output.stderr),
            exit_code: output.status.code(),
            duration_ms: started.elapsed().as_millis(),
            error_message: None,
        },
        Err(_) => ProjectCommandResult {
            ok: false,
            preset: preset.to_string(),
            command: command_display,
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
            duration_ms: started.elapsed().as_millis(),
            error_message: Some(format!("The required executable '{program}' is not available.")),
        },
    }
}

fn execute_project_preset(preset: &str, root: &Path) -> ProjectCommandResult {
    match preset {
        "git-status" => run_project_command(root, preset, "git", &["status", "--short", "--branch"]),
        "git-diff" => run_project_command(root, preset, "git", &["diff", "--no-ext-diff", "--"]),
        "npm-typecheck" => run_project_command(root, preset, "npm", &["run", "typecheck", "--if-present"]),
        "npm-test" => run_project_command(root, preset, "npm", &["test", "--if-present"]),
        "npm-build" => run_project_command(root, preset, "npm", &["run", "build", "--if-present"]),
        "cargo-check" => run_project_command(root, preset, "cargo", &["check"]),
        "cargo-test" => run_project_command(root, preset, "cargo", &["test"]),
        _ => ProjectCommandResult { ok: false, preset: preset.to_string(), command: String::new(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: 0, error_message: Some("This command is not in the Chris Studio allowlist.".to_string()) },
    }
}

#[tauri::command]
fn project_run_preset(preset: String, confirmed: bool, state: State<'_, AppState>) -> ProjectCommandResult {
    if !confirmed {
        return ProjectCommandResult { ok: false, preset, command: String::new(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: 0, error_message: Some("Explicit command approval is required.".to_string()) };
    }
    match current_project_root(&state) {
        Ok(root) => execute_project_preset(&preset, &root),
        Err(message) => ProjectCommandResult { ok: false, preset, command: String::new(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: 0, error_message: Some(message) },
    }
}

#[tauri::command]
fn project_git_status(state: State<'_, AppState>) -> ProjectCommandResult {
    match current_project_root(&state) {
        Ok(root) => execute_project_preset("git-status", &root),
        Err(message) => ProjectCommandResult { ok: false, preset: "git-status".to_string(), command: String::new(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: 0, error_message: Some(message) },
    }
}

#[tauri::command]
fn project_git_diff(state: State<'_, AppState>) -> ProjectCommandResult {
    match current_project_root(&state) {
        Ok(root) => execute_project_preset("git-diff", &root),
        Err(message) => ProjectCommandResult { ok: false, preset: "git-diff".to_string(), command: String::new(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: 0, error_message: Some(message) },
    }
}


fn valid_git_branch(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty()
        && value.len() <= 120
        && !value.starts_with('-')
        && !value.starts_with('.')
        && !value.ends_with('/')
        && !value.contains("..")
        && !value.contains("//")
        && value.chars().all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | '/'))
}

fn command_result_from_output(preset: &str, command: &str, started: Instant, output: std::process::Output) -> ProjectCommandResult {
    ProjectCommandResult {
        ok: output.status.success(),
        preset: preset.to_string(),
        command: command.to_string(),
        stdout: truncate_output(&output.stdout),
        stderr: truncate_output(&output.stderr),
        exit_code: output.status.code(),
        duration_ms: started.elapsed().as_millis(),
        error_message: None,
    }
}


fn project_change_failure(message: impl Into<String>) -> ProjectChangeSessionResult {
    ProjectChangeSessionResult {
        ok: false,
        session_id: None,
        status: "failed".to_string(),
        files: vec![],
        patch_archive: None,
        error_message: Some(message.into()),
    }
}

fn normalize_git_patch_path(value: &str) -> Result<Option<String>, String> {
    let trimmed = value.trim();
    if trimmed == "/dev/null" {
        return Ok(None);
    }
    if trimmed.starts_with('"') || trimmed.ends_with('"') || trimmed.contains('\\') {
        return Err("Quoted, escaped or platform-specific patch paths are not supported in reviewed sessions.".to_string());
    }
    let relative = trimmed.strip_prefix("a/").or_else(|| trimmed.strip_prefix("b/")).unwrap_or(trimmed);
    let clean = clean_relative_path(relative)?;
    Ok(Some(clean.to_string_lossy().to_string()))
}

fn parse_project_patch_targets(patch: &str) -> Result<Vec<ProjectPatchTarget>, String> {
    if patch.trim().is_empty() || patch.len() > 1_000_000 {
        return Err("Provide a reviewed unified diff smaller than 1 MB.".to_string());
    }
    if !patch.trim_start().starts_with("diff --git ") {
        return Err("The reviewed patch must begin with a diff --git section and cannot contain traditional patch preambles.".to_string());
    }
    if patch.contains("GIT binary patch") || patch.contains("Binary files ") || patch.contains("Subproject commit ") {
        return Err("Binary files and submodule changes are blocked in reviewed project sessions.".to_string());
    }
    if patch.lines().any(|line| {
        line.starts_with("rename from ")
            || line.starts_with("rename to ")
            || line.starts_with("copy from ")
            || line.starts_with("copy to ")
            || line.starts_with("old mode ")
            || line.starts_with("new mode ")
    }) {
        return Err("Renames, copies and file-mode changes are not supported in this reviewed session. Generate add/modify/delete changes instead.".to_string());
    }

    let lines = patch.lines().collect::<Vec<_>>();
    let mut targets: Vec<ProjectPatchTarget> = vec![];
    let mut index = 0_usize;
    while index < lines.len() {
        let Some(header) = lines[index].strip_prefix("diff --git ") else {
            index += 1;
            continue;
        };
        let parts = header.split_whitespace().collect::<Vec<_>>();
        if parts.len() != 2 {
            return Err("Patch paths containing spaces or unsupported quoting cannot be applied safely.".to_string());
        }
        let header_old = normalize_git_patch_path(parts[0])?;
        let header_new = normalize_git_patch_path(parts[1])?;
        let mut old_marker_seen = false;
        let mut new_marker_seen = false;
        let mut old_marker: Option<String> = None;
        let mut new_marker: Option<String> = None;
        let mut declared_action: Option<&str> = None;
        let mut in_hunk = false;
        index += 1;
        while index < lines.len() && !lines[index].starts_with("diff --git ") {
            let line = lines[index];
            if line.starts_with("@@") {
                in_hunk = true;
            }
            if !in_hunk {
                if let Some(value) = line.strip_prefix("--- ") {
                    if old_marker_seen {
                        return Err("A reviewed patch section contains multiple old-file headers.".to_string());
                    }
                    old_marker_seen = true;
                    old_marker = normalize_git_patch_path(value)?;
                } else if let Some(value) = line.strip_prefix("+++ ") {
                    if new_marker_seen {
                        return Err("A reviewed patch section contains multiple new-file headers.".to_string());
                    }
                    new_marker_seen = true;
                    new_marker = normalize_git_patch_path(value)?;
                } else if let Some(mode) = line.strip_prefix("new file mode ") {
                    if mode != "100644" && mode != "100755" {
                        return Err("Symlinks, submodules and unsupported new-file modes are blocked.".to_string());
                    }
                    declared_action = Some("add");
                } else if let Some(mode) = line.strip_prefix("deleted file mode ") {
                    if mode != "100644" && mode != "100755" {
                        return Err("Symlinks, submodules and unsupported deleted-file modes are blocked.".to_string());
                    }
                    declared_action = Some("delete");
                } else if let Some(index_metadata) = line.strip_prefix("index ") {
                    let tokens = index_metadata.split_whitespace().collect::<Vec<_>>();
                    if let Some(mode) = tokens.get(1) {
                        if *mode != "100644" && *mode != "100755" {
                            return Err("Symlink, submodule and unsupported index modes are blocked.".to_string());
                        }
                    }
                }
            }
            index += 1;
        }
        if !old_marker_seen || !new_marker_seen {
            return Err("Every reviewed patch section must contain exactly one --- and +++ file header.".to_string());
        }
        let action = match (&old_marker, &new_marker) {
            (None, Some(_)) => "add",
            (Some(_), None) => "delete",
            (Some(_), Some(_)) => "modify",
            (None, None) => return Err("A patch section cannot add and delete /dev/null at the same time.".to_string()),
        };
        if declared_action.is_some() && declared_action != Some(action) {
            return Err("The declared file mode does not match the patch file headers.".to_string());
        }
        match action {
            "add" => {
                if new_marker != header_new {
                    return Err("The new-file path does not match its diff --git header.".to_string());
                }
                if header_old != header_new {
                    return Err("The add-file diff header must use the same scoped path on both sides.".to_string());
                }
            }
            "delete" => {
                if old_marker != header_old {
                    return Err("The deleted-file path does not match its diff --git header.".to_string());
                }
                if header_old != header_new {
                    return Err("The delete-file diff header must use the same scoped path on both sides.".to_string());
                }
            }
            _ => {
                if old_marker != header_old || new_marker != header_new || header_old != header_new {
                    return Err("Modified-file paths must match their diff --git header and cannot rename files.".to_string());
                }
            }
        }
        let path = new_marker.or(old_marker).ok_or_else(|| "The patch section has no project file path.".to_string())?;
        targets.push(ProjectPatchTarget { path, action: action.to_string() });
    }
    if targets.is_empty() {
        return Err("The reviewed text does not contain any diff --git file sections.".to_string());
    }
    if targets.len() > 50 {
        return Err("A single reviewed session is limited to 50 files.".to_string());
    }
    let mut unique = HashSet::new();
    for target in &targets {
        if !unique.insert(target.path.clone()) {
            return Err(format!("The patch contains duplicate sections for {}.", target.path));
        }
    }
    Ok(targets)
}


#[cfg(test)]
mod project_change_tests {
    use super::*;

    const MODIFY_PATCH: &str = "diff --git a/src/a.ts b/src/a.ts\nindex 1111111..2222222 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n";

    #[test]
    fn accepts_scoped_regular_text_modification() {
        let targets = parse_project_patch_targets(MODIFY_PATCH).expect("regular patch should parse");
        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].path, "src/a.ts");
        assert_eq!(targets[0].action, "modify");
    }

    #[test]
    fn rejects_traditional_patch_preambles() {
        let patch = format!("This is an unreviewed preamble.\n{}", MODIFY_PATCH);
        assert!(parse_project_patch_targets(&patch).is_err());
    }

    #[test]
    fn rejects_mismatched_or_protected_file_headers() {
        let patch = "diff --git a/src/a.ts b/src/a.ts\nindex 1111111..2222222 100644\n--- a/src/a.ts\n+++ b/.git/config\n@@ -1 +1 @@\n-old\n+new\n";
        assert!(parse_project_patch_targets(patch).is_err());
    }

    #[test]
    fn rejects_symlink_mode_and_duplicate_sections() {
        let symlink = "diff --git a/src/link b/src/link\nnew file mode 120000\nindex 0000000..2222222\n--- /dev/null\n+++ b/src/link\n@@ -0,0 +1 @@\n+../outside\n";
        assert!(parse_project_patch_targets(symlink).is_err());
        let duplicate = format!("{}\n{}", MODIFY_PATCH, MODIFY_PATCH);
        assert!(parse_project_patch_targets(&duplicate).is_err());
    }

    #[test]
    fn git_numstat_exposes_hidden_traditional_sections() {
        let directory = std::env::temp_dir().join(format!("chris-studio-patch-paths-{}", project_transaction_id()));
        fs::create_dir_all(&directory).expect("temporary patch directory should be created");
        let patch_path = directory.join("mixed.diff");
        let mixed_patch = format!(
            "{}--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1 +1 @@\n-before\n+after\n",
            MODIFY_PATCH,
        );
        fs::write(&patch_path, mixed_patch).expect("mixed patch should be written");
        let paths = git_reported_project_patch_paths(&directory, &patch_path).expect("Git should report every parsed path");
        assert_eq!(paths, HashSet::from(["src/a.ts".to_string(), "src/b.ts".to_string()]));
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn detects_active_transaction_manifests() {
        let root = std::env::temp_dir().join(format!("chris-studio-active-session-{}", project_transaction_id()));
        let session_dir = project_transaction_root(&root).join("123");
        fs::create_dir_all(&session_dir).expect("transaction folder should be created");
        let manifest = ProjectChangeManifest {
            session_id: "123".to_string(),
            status: "applied".to_string(),
            patch_archive: session_dir.join("change.diff").to_string_lossy().to_string(),
            files: vec![ProjectChangeFileReceipt {
                path: "src/a.ts".to_string(),
                action: "modify".to_string(),
                existed_before: true,
                backup_path: None,
                after_path: None,
                status: "applied".to_string(),
                error_message: None,
            }],
        };
        write_project_change_manifest(&session_dir.join("manifest.json"), &manifest).expect("manifest should be written");
        assert!(project_has_active_change_session(&root).expect("active transaction should be detected"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn blocks_internal_metadata_paths() {
        assert!(clean_relative_path(".git/config").is_err());
        assert!(clean_relative_path(".chris-studio/session.json").is_err());
        assert!(clean_relative_path(".tokenfence/patch.diff").is_err());
        assert!(clean_relative_path("src/../outside.ts").is_err());
    }
}

fn git_reported_project_patch_paths(root: &Path, patch_archive: &Path) -> Result<HashSet<String>, String> {
    let output = Command::new("git")
        .args(["apply", "--numstat"])
        .arg(patch_archive)
        .current_dir(root)
        .output()
        .map_err(|_| "Git is not installed or could not inspect the reviewed patch paths.".to_string())?;
    if !output.status.success() {
        return Err(truncate_output(&output.stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut paths = HashSet::new();
    for line in stdout.lines().filter(|line| !line.trim().is_empty()) {
        let columns = line.splitn(3, '\t').collect::<Vec<_>>();
        if columns.len() != 3
            || columns[2].contains(" => ")
            || columns[2].contains('{')
            || columns[2].contains('}')
        {
            return Err("Git reported an unsupported, renamed or ambiguous patch path.".to_string());
        }
        let clean = clean_relative_path(columns[2])?;
        paths.insert(clean.to_string_lossy().to_string());
    }
    if paths.is_empty() {
        return Err("Git did not report any changed project paths for the reviewed patch.".to_string());
    }
    Ok(paths)
}

fn project_transaction_root(root: &Path) -> PathBuf {
    root.join(".git").join("chris-studio").join("transactions")
}

fn project_has_active_change_session(root: &Path) -> Result<bool, String> {
    let transaction_root = project_transaction_root(root);
    if !transaction_root.is_dir() {
        return Ok(false);
    }
    let entries = fs::read_dir(&transaction_root)
        .map_err(|_| "The project transaction directory could not be read.".to_string())?;
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let raw = match fs::read(entry.path().join("manifest.json")) {
            Ok(raw) => raw,
            Err(_) => continue,
        };
        let manifest = match serde_json::from_slice::<ProjectChangeManifest>(&raw) {
            Ok(manifest) => manifest,
            Err(_) => continue,
        };
        let pending = manifest.files.iter().any(|file| file.status == "applied" || file.status == "rollback-blocked");
        if pending && (manifest.status == "applied" || manifest.status == "partially-rolled-back") {
            return Ok(true);
        }
    }
    Ok(false)
}

fn project_transaction_id() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        .to_string()
}

fn valid_project_transaction_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 40 && value.chars().all(|character| character.is_ascii_digit() || character == '-')
}

fn write_project_change_manifest(path: &Path, manifest: &ProjectChangeManifest) -> Result<(), String> {
    let payload = serde_json::to_vec_pretty(manifest).map_err(|_| "The project transaction manifest could not be serialized.".to_string())?;
    fs::write(path, payload).map_err(|_| "The project transaction manifest could not be written.".to_string())
}

fn load_project_change_manifest(root: &Path, session_id: &str) -> Result<(PathBuf, PathBuf, ProjectChangeManifest), String> {
    if !valid_project_transaction_id(session_id) {
        return Err("The project transaction identifier is invalid.".to_string());
    }
    let session_dir = project_transaction_root(root).join(session_id);
    let manifest_path = session_dir.join("manifest.json");
    let raw = fs::read(&manifest_path).map_err(|_| "The project transaction manifest could not be found.".to_string())?;
    let manifest = serde_json::from_slice::<ProjectChangeManifest>(&raw).map_err(|_| "The project transaction manifest is invalid.".to_string())?;
    if manifest.session_id != session_id {
        return Err("The project transaction manifest does not match the requested session.".to_string());
    }
    Ok((session_dir, manifest_path, manifest))
}

fn project_file_matches_after_state(root: &Path, session_dir: &Path, receipt: &ProjectChangeFileReceipt) -> Result<bool, String> {
    let clean = clean_relative_path(&receipt.path)?;
    let destination = root.join(&clean);
    if receipt.action == "delete" {
        return Ok(!destination.exists());
    }
    let after = session_dir.join("after").join(&clean);
    if !after.is_file() || !destination.is_file() {
        return Ok(false);
    }
    let destination_metadata = fs::symlink_metadata(&destination).map_err(|_| format!("{} could not be inspected before rollback.", receipt.path))?;
    if destination_metadata.file_type().is_symlink() || !destination_metadata.is_file() {
        return Ok(false);
    }
    let expected = fs::read(after).map_err(|_| format!("The post-write snapshot for {} could not be read.", receipt.path))?;
    let current = fs::read(destination).map_err(|_| format!("{} could not be read before rollback.", receipt.path))?;
    Ok(expected == current)
}

fn snapshot_project_change_after(root: &Path, session_dir: &Path, files: &mut [ProjectChangeFileReceipt]) -> Vec<String> {
    let after_dir = session_dir.join("after");
    let mut errors = vec![];
    let mut total_bytes = 0_u64;
    for receipt in files.iter_mut() {
        let clean = match clean_relative_path(&receipt.path) {
            Ok(clean) => clean,
            Err(message) => {
                errors.push(message);
                continue;
            }
        };
        let destination = root.join(&clean);
        if receipt.action == "delete" {
            if destination.exists() {
                errors.push(format!("{} still exists after the delete patch.", receipt.path));
            }
            receipt.after_path = None;
            continue;
        }
        let metadata = match fs::symlink_metadata(&destination) {
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => metadata,
            _ => {
                errors.push(format!("{} is not a regular file after patch application.", receipt.path));
                continue;
            }
        };
        total_bytes = total_bytes.saturating_add(metadata.len());
        if metadata.len() > 6_000_000 || total_bytes > 30_000_000 {
            errors.push(format!("{} exceeds the protected post-write snapshot limit.", receipt.path));
            continue;
        }
        let snapshot = after_dir.join(&clean);
        if let Some(parent) = snapshot.parent() {
            if fs::create_dir_all(parent).is_err() {
                errors.push(format!("The post-write snapshot folder for {} could not be created.", receipt.path));
                continue;
            }
        }
        match fs::copy(&destination, &snapshot) {
            Ok(_) => receipt.after_path = Some(snapshot.to_string_lossy().to_string()),
            Err(_) => errors.push(format!("The post-write snapshot for {} could not be created.", receipt.path)),
        }
    }
    errors
}

fn restore_project_change_file(root: &Path, session_dir: &Path, receipt: &ProjectChangeFileReceipt, verify_after_state: bool) -> Result<(), String> {
    let clean = clean_relative_path(&receipt.path)?;
    let destination = root.join(&clean);
    if verify_after_state && !project_file_matches_after_state(root, session_dir, receipt)? {
        return Err(format!("{} changed after the Agent write. Rollback was blocked to avoid overwriting newer user edits.", receipt.path));
    }
    if receipt.existed_before {
        let backup_path = session_dir.join("before").join(&clean);
        if !backup_path.is_file() {
            return Err(format!("The backup for {} is missing.", receipt.path));
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|_| format!("The parent directory for {} could not be restored.", receipt.path))?;
        }
        fs::copy(backup_path, destination).map_err(|_| format!("{} could not be restored from backup.", receipt.path))?;
    } else if destination.exists() {
        if !destination.is_file() {
            return Err(format!("The new path {} is no longer a regular file and was not removed.", receipt.path));
        }
        fs::remove_file(destination).map_err(|_| format!("The newly created file {} could not be removed.", receipt.path))?;
    }
    Ok(())
}

fn restore_project_change_files(
    root: &Path,
    session_dir: &Path,
    files: &mut [ProjectChangeFileReceipt],
    selected: Option<&HashSet<String>>,
    verify_after_state: bool,
) -> Vec<String> {
    let mut errors = vec![];
    for receipt in files.iter_mut() {
        if selected.map(|paths| !paths.contains(&receipt.path)).unwrap_or(false) {
            continue;
        }
        if receipt.status == "rolled-back" || receipt.status == "accepted" || receipt.status == "failed" {
            continue;
        }
        match restore_project_change_file(root, session_dir, receipt, verify_after_state) {
            Ok(()) => {
                receipt.status = "rolled-back".to_string();
                receipt.error_message = None;
            }
            Err(message) => {
                receipt.status = "rollback-blocked".to_string();
                receipt.error_message = Some(message.clone());
                errors.push(message);
            }
        }
    }
    errors
}

#[tauri::command]
fn project_apply_change_session(patch: String, confirmed: bool, state: State<'_, AppState>) -> ProjectChangeSessionResult {
    if !confirmed {
        return project_change_failure("Explicit approval is required before applying a project change session.");
    }
    let root = match current_project_root(&state) {
        Ok(root) => root,
        Err(message) => return project_change_failure(message),
    };
    if !root.join(".git").is_dir() {
        return project_change_failure("Reviewed patch sessions currently require a Git repository so changes can be checked before writing.");
    }
    match project_has_active_change_session(&root) {
        Ok(false) => {}
        Ok(true) => return project_change_failure("Resolve the current applied project transaction before starting another one."),
        Err(message) => return project_change_failure(message),
    }
    let targets = match parse_project_patch_targets(&patch) {
        Ok(targets) => targets,
        Err(message) => return project_change_failure(message),
    };

    let session_id = project_transaction_id();
    let session_dir = project_transaction_root(&root).join(&session_id);
    let before_dir = session_dir.join("before");
    if fs::create_dir_all(&before_dir).is_err() {
        return project_change_failure("The protected project transaction directory could not be created.");
    }
    let patch_archive = session_dir.join("change.diff");
    if fs::write(&patch_archive, patch.as_bytes()).is_err() {
        return project_change_failure("The reviewed patch could not be archived before application.");
    }

    let declared_paths = targets.iter().map(|target| target.path.clone()).collect::<HashSet<_>>();
    match git_reported_project_patch_paths(&root, &patch_archive) {
        Ok(reported_paths) if reported_paths == declared_paths => {}
        Ok(_) => {
            let _ = fs::remove_dir_all(&session_dir);
            return project_change_failure("The paths Git would apply do not exactly match the reviewed diff --git sections.");
        }
        Err(message) => {
            let _ = fs::remove_dir_all(&session_dir);
            return project_change_failure(message);
        }
    }

    let mut total_backup_bytes = 0_u64;
    let mut files: Vec<ProjectChangeFileReceipt> = vec![];
    for target in targets {
        let existed_before = root.join(&target.path).exists();
        let (source, clean) = match resolve_project_path(&root, &target.path, existed_before) {
            Ok(value) => value,
            Err(message) => return project_change_failure(message),
        };
        let mut backup_path = None;
        if existed_before {
            let scoped_source = root.join(&clean);
            let metadata = match fs::symlink_metadata(&scoped_source) {
                Ok(metadata) => metadata,
                Err(_) => return project_change_failure(format!("{} could not be inspected before backup.", target.path)),
            };
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return project_change_failure(format!("{} is not a regular project file.", target.path));
            }
            if metadata.len() > 5_000_000 {
                return project_change_failure(format!("{} exceeds the 5 MB transactional file limit.", target.path));
            }
            total_backup_bytes = total_backup_bytes.saturating_add(metadata.len());
            if total_backup_bytes > 25_000_000 {
                return project_change_failure("The reviewed session exceeds the 25 MB total backup limit.");
            }
            let backup = before_dir.join(&clean);
            if let Some(parent) = backup.parent() {
                if fs::create_dir_all(parent).is_err() {
                    return project_change_failure(format!("The backup folder for {} could not be created.", target.path));
                }
            }
            if fs::copy(&source, &backup).is_err() {
                return project_change_failure(format!("{} could not be backed up.", target.path));
            }
            backup_path = Some(backup.to_string_lossy().to_string());
        } else if target.action != "add" {
            return project_change_failure(format!("{} does not exist, but the patch does not declare it as a new file.", target.path));
        }
        files.push(ProjectChangeFileReceipt {
            path: target.path,
            action: target.action,
            existed_before,
            backup_path,
            after_path: None,
            status: "applied".to_string(),
            error_message: None,
        });
    }

    let manifest_path = session_dir.join("manifest.json");
    let mut manifest = ProjectChangeManifest {
        session_id: session_id.clone(),
        status: "prepared".to_string(),
        patch_archive: patch_archive.to_string_lossy().to_string(),
        files,
    };
    if let Err(message) = write_project_change_manifest(&manifest_path, &manifest) {
        return project_change_failure(message);
    }

    let check = Command::new("git")
        .args(["apply", "--check", "--whitespace=nowarn"])
        .arg(&patch_archive)
        .current_dir(&root)
        .output();
    match check {
        Ok(output) if output.status.success() => {}
        Ok(output) => {
            manifest.status = "failed".to_string();
            for file in manifest.files.iter_mut() {
                file.status = "failed".to_string();
                file.error_message = Some("Patch validation failed before any project file was written.".to_string());
            }
            let _ = write_project_change_manifest(&manifest_path, &manifest);
            return ProjectChangeSessionResult {
                ok: false,
                session_id: Some(session_id),
                status: "failed".to_string(),
                files: manifest.files,
                patch_archive: Some(patch_archive.to_string_lossy().to_string()),
                error_message: Some(truncate_output(&output.stderr)),
            };
        }
        Err(_) => {
            manifest.status = "failed".to_string();
            for file in manifest.files.iter_mut() {
                file.status = "failed".to_string();
                file.error_message = Some("Git could not validate the reviewed patch.".to_string());
            }
            let _ = write_project_change_manifest(&manifest_path, &manifest);
            return ProjectChangeSessionResult {
                ok: false,
                session_id: Some(session_id),
                status: "failed".to_string(),
                files: manifest.files,
                patch_archive: Some(patch_archive.to_string_lossy().to_string()),
                error_message: Some("Git is not installed or could not validate the reviewed patch.".to_string()),
            };
        },
    }

    let applied = Command::new("git")
        .args(["apply", "--whitespace=nowarn"])
        .arg(&patch_archive)
        .current_dir(&root)
        .output();
    match applied {
        Ok(output) if output.status.success() => {
            let snapshot_errors = snapshot_project_change_after(&root, &session_dir, &mut manifest.files);
            if !snapshot_errors.is_empty() {
                let mut restore_errors = restore_project_change_files(&root, &session_dir, &mut manifest.files, None, false);
                manifest.status = "failed".to_string();
                let _ = write_project_change_manifest(&manifest_path, &manifest);
                let mut errors = snapshot_errors;
                errors.append(&mut restore_errors);
                return ProjectChangeSessionResult {
                    ok: false,
                    session_id: Some(session_id),
                    status: "failed".to_string(),
                    files: manifest.files,
                    patch_archive: Some(patch_archive.to_string_lossy().to_string()),
                    error_message: Some(errors.join("\n")),
                };
            }
            manifest.status = "applied".to_string();
            let _ = write_project_change_manifest(&manifest_path, &manifest);
            ProjectChangeSessionResult {
                ok: true,
                session_id: Some(session_id),
                status: "applied".to_string(),
                files: manifest.files,
                patch_archive: Some(patch_archive.to_string_lossy().to_string()),
                error_message: None,
            }
        }
        Ok(output) => {
            let restore_errors = restore_project_change_files(&root, &session_dir, &mut manifest.files, None, false);
            manifest.status = "failed".to_string();
            let _ = write_project_change_manifest(&manifest_path, &manifest);
            let mut message = truncate_output(&output.stderr);
            if !restore_errors.is_empty() {
                message.push_str("\nRollback warnings:\n");
                message.push_str(&restore_errors.join("\n"));
            }
            ProjectChangeSessionResult {
                ok: false,
                session_id: Some(session_id),
                status: "failed".to_string(),
                files: manifest.files,
                patch_archive: Some(patch_archive.to_string_lossy().to_string()),
                error_message: Some(message),
            }
        }
        Err(_) => {
            let restore_errors = restore_project_change_files(&root, &session_dir, &mut manifest.files, None, false);
            manifest.status = "failed".to_string();
            let _ = write_project_change_manifest(&manifest_path, &manifest);
            ProjectChangeSessionResult {
                ok: false,
                session_id: Some(session_id),
                status: "failed".to_string(),
                files: manifest.files,
                patch_archive: Some(patch_archive.to_string_lossy().to_string()),
                error_message: Some(if restore_errors.is_empty() {
                    "Git could not apply the reviewed patch.".to_string()
                } else {
                    format!("Git could not apply the reviewed patch. Rollback warnings: {}", restore_errors.join("; "))
                }),
            }
        }
    }
}


#[tauri::command]
fn project_latest_change_session(state: State<'_, AppState>) -> Result<Option<ProjectRecoveredChangeSession>, String> {
    let root = current_project_root(&state)?;
    let transaction_root = project_transaction_root(&root);
    if !transaction_root.is_dir() {
        return Ok(None);
    }
    let mut session_ids = fs::read_dir(&transaction_root)
        .map_err(|_| "The project transaction directory could not be read.".to_string())?
        .flatten()
        .filter_map(|entry| {
            let id = entry.file_name().to_string_lossy().to_string();
            if entry.path().is_dir() && valid_project_transaction_id(&id) { Some(id) } else { None }
        })
        .collect::<Vec<_>>();
    session_ids.sort_by(|left, right| {
        let left_number = left.parse::<u128>().unwrap_or_default();
        let right_number = right.parse::<u128>().unwrap_or_default();
        right_number.cmp(&left_number)
    });
    for session_id in session_ids {
        let (session_dir, _, manifest) = match load_project_change_manifest(&root, &session_id) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let pending = manifest.files.iter().any(|file| file.status == "applied" || file.status == "rollback-blocked");
        if !pending || (manifest.status != "applied" && manifest.status != "partially-rolled-back") {
            continue;
        }
        let patch = fs::read_to_string(session_dir.join("change.diff"))
            .map_err(|_| "The pending transaction patch archive could not be read.".to_string())?;
        let patch_archive = manifest.patch_archive.clone();
        return Ok(Some(ProjectRecoveredChangeSession {
            session: ProjectChangeSessionResult {
                ok: true,
                session_id: Some(session_id),
                status: manifest.status,
                files: manifest.files,
                patch_archive: Some(patch_archive),
                error_message: None,
            },
            patch,
        }));
    }
    Ok(None)
}

#[tauri::command]
fn project_rollback_change_session(session_id: String, paths: Vec<String>, confirmed: bool, state: State<'_, AppState>) -> ProjectChangeSessionResult {
    if !confirmed {
        return project_change_failure("Explicit approval is required before rolling back project files.");
    }
    let root = match current_project_root(&state) {
        Ok(root) => root,
        Err(message) => return project_change_failure(message),
    };
    let (session_dir, manifest_path, mut manifest) = match load_project_change_manifest(&root, &session_id) {
        Ok(value) => value,
        Err(message) => return project_change_failure(message),
    };
    if manifest.status != "applied" && manifest.status != "partially-rolled-back" {
        return project_change_failure("Only an active project transaction can be rolled back.");
    }
    let selected = if paths.is_empty() {
        None
    } else {
        let requested = paths.into_iter().collect::<HashSet<_>>();
        if requested.iter().any(|path| !manifest.files.iter().any(|file| &file.path == path && (file.status == "applied" || file.status == "rollback-blocked"))) {
            return project_change_failure("One or more requested rollback files are not active in this project transaction.");
        }
        Some(requested)
    };
    let errors = restore_project_change_files(&root, &session_dir, &mut manifest.files, selected.as_ref(), true);
    let active = manifest.files.iter().any(|file| file.status == "applied" || file.status == "rollback-blocked");
    manifest.status = if active { "partially-rolled-back".to_string() } else { "rolled-back".to_string() };
    let _ = write_project_change_manifest(&manifest_path, &manifest);
    ProjectChangeSessionResult {
        ok: errors.is_empty(),
        session_id: Some(session_id),
        status: manifest.status.clone(),
        files: manifest.files,
        patch_archive: Some(manifest.patch_archive),
        error_message: if errors.is_empty() { None } else { Some(errors.join("\n")) },
    }
}

#[tauri::command]
fn project_accept_change_session(session_id: String, paths: Vec<String>, confirmed: bool, state: State<'_, AppState>) -> ProjectChangeSessionResult {
    if !confirmed {
        return project_change_failure("Explicit approval is required before accepting project changes.");
    }
    let root = match current_project_root(&state) {
        Ok(root) => root,
        Err(message) => return project_change_failure(message),
    };
    let (_, manifest_path, mut manifest) = match load_project_change_manifest(&root, &session_id) {
        Ok(value) => value,
        Err(message) => return project_change_failure(message),
    };
    if manifest.status != "applied" && manifest.status != "partially-rolled-back" {
        return project_change_failure("Only an active project transaction can be accepted.");
    }
    let selected = paths.into_iter().collect::<HashSet<_>>();
    if !selected.is_empty() && selected.iter().any(|path| !manifest.files.iter().any(|file| &file.path == path && file.status == "applied")) {
        return project_change_failure("One or more requested files are not active applied files in this project transaction.");
    }
    for file in manifest.files.iter_mut() {
        if (selected.is_empty() || selected.contains(&file.path)) && file.status == "applied" {
            file.status = "accepted".to_string();
        }
    }
    let pending = manifest.files.iter().any(|file| file.status == "applied");
    let rollback_blocked = manifest.files.iter().any(|file| file.status == "rollback-blocked");
    manifest.status = if pending {
        "applied".to_string()
    } else if rollback_blocked {
        "partially-rolled-back".to_string()
    } else {
        "accepted".to_string()
    };
    let _ = write_project_change_manifest(&manifest_path, &manifest);
    ProjectChangeSessionResult {
        ok: true,
        session_id: Some(session_id),
        status: manifest.status.clone(),
        files: manifest.files,
        patch_archive: Some(manifest.patch_archive),
        error_message: None,
    }
}

#[tauri::command]
fn project_apply_patch(patch: String, confirmed: bool, state: State<'_, AppState>) -> ProjectCommandResult {
    let started = Instant::now();
    let preset = "git-apply";
    if !confirmed {
        return ProjectCommandResult { ok: false, preset: preset.to_string(), command: "git apply".to_string(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: 0, error_message: Some("Explicit patch approval is required.".to_string()) };
    }
    if patch.is_empty() || patch.len() > 1_000_000 || (!patch.contains("diff --git") && !patch.contains("--- ")) {
        return ProjectCommandResult { ok: false, preset: preset.to_string(), command: "git apply".to_string(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: 0, error_message: Some("Provide a reviewed unified diff smaller than 1 MB.".to_string()) };
    }
    if patch.lines().any(|line| line.contains("/.git/") || line.contains(" b/.git/") || line.contains(" a/.git/")) {
        return ProjectCommandResult { ok: false, preset: preset.to_string(), command: "git apply".to_string(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: 0, error_message: Some("Patches that target .git are blocked.".to_string()) };
    }
    let root = match current_project_root(&state) {
        Ok(root) => root,
        Err(message) => return ProjectCommandResult { ok: false, preset: preset.to_string(), command: "git apply".to_string(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: 0, error_message: Some(message) },
    };
    let patch_dir = root.join(".tokenfence").join("patches");
    if fs::create_dir_all(&patch_dir).is_err() {
        return ProjectCommandResult { ok: false, preset: preset.to_string(), command: "git apply".to_string(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: started.elapsed().as_millis(), error_message: Some("The reviewed patch archive could not be created.".to_string()) };
    }
    let archive = patch_dir.join(format!("{}.diff", unix_timestamp()));
    if fs::write(&archive, patch.as_bytes()).is_err() {
        return ProjectCommandResult { ok: false, preset: preset.to_string(), command: "git apply".to_string(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: started.elapsed().as_millis(), error_message: Some("The reviewed patch could not be archived.".to_string()) };
    }
    let checked = Command::new("git").args(["apply", "--check", "--whitespace=nowarn"]).arg(&archive).current_dir(&root).output();
    match checked {
        Ok(output) if output.status.success() => {}
        Ok(output) => return command_result_from_output(preset, "git apply --check", started, output),
        Err(_) => return ProjectCommandResult { ok: false, preset: preset.to_string(), command: "git apply --check".to_string(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: started.elapsed().as_millis(), error_message: Some("Git is not installed or could not be started.".to_string()) },
    }
    match Command::new("git").args(["apply", "--whitespace=nowarn"]).arg(&archive).current_dir(&root).output() {
        Ok(output) => command_result_from_output(preset, "git apply --whitespace=nowarn", started, output),
        Err(_) => ProjectCommandResult { ok: false, preset: preset.to_string(), command: "git apply".to_string(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: started.elapsed().as_millis(), error_message: Some("Git is not installed or could not be started.".to_string()) },
    }
}

#[tauri::command]
fn project_git_create_branch(branch: String, confirmed: bool, state: State<'_, AppState>) -> ProjectCommandResult {
    if !confirmed || !valid_git_branch(&branch) {
        return ProjectCommandResult { ok: false, preset: "git-branch".to_string(), command: "git switch -c".to_string(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: 0, error_message: Some("Enter a valid branch name and approve branch creation.".to_string()) };
    }
    match current_project_root(&state) {
        Ok(root) => run_project_command(&root, "git-branch", "git", &["switch", "-c", branch.trim()]),
        Err(message) => ProjectCommandResult { ok: false, preset: "git-branch".to_string(), command: "git switch -c".to_string(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: 0, error_message: Some(message) },
    }
}

#[tauri::command]
fn project_git_commit(message: String, confirmed: bool, state: State<'_, AppState>) -> ProjectCommandResult {
    let message = message.trim();
    if !confirmed || message.len() < 3 || message.len() > 240 || message.contains('\n') || message.contains('\r') {
        return ProjectCommandResult { ok: false, preset: "git-commit".to_string(), command: "git add -A && git commit".to_string(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: 0, error_message: Some("Enter a one-line commit message and approve the commit.".to_string()) };
    }
    let root = match current_project_root(&state) {
        Ok(root) => root,
        Err(error) => return ProjectCommandResult { ok: false, preset: "git-commit".to_string(), command: "git commit".to_string(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: 0, error_message: Some(error) },
    };
    let add = run_project_command(&root, "git-add", "git", &["add", "-A"]);
    if !add.ok { return add; }
    run_project_command(&root, "git-commit", "git", &["commit", "-m", message])
}

#[tauri::command]
fn project_git_push(branch: String, confirmed: bool, state: State<'_, AppState>) -> ProjectCommandResult {
    if !confirmed || !valid_git_branch(&branch) {
        return ProjectCommandResult { ok: false, preset: "git-push".to_string(), command: "git push".to_string(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: 0, error_message: Some("Enter a valid branch name and approve the network push.".to_string()) };
    }
    match current_project_root(&state) {
        Ok(root) => run_project_command(&root, "git-push", "git", &["push", "--set-upstream", "origin", branch.trim()]),
        Err(message) => ProjectCommandResult { ok: false, preset: "git-push".to_string(), command: "git push".to_string(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: 0, error_message: Some(message) },
    }
}

fn validate_public_github_url(value: &str) -> Result<(String, String, String), String> {
    let parsed = Url::parse(value.trim()).map_err(|_| "Enter a valid GitHub repository URL.".to_string())?;
    if parsed.scheme() != "https" || parsed.host_str() != Some("github.com") {
        return Err("Only HTTPS github.com repository URLs can be cloned here.".to_string());
    }
    let segments = parsed.path_segments().map(|segments| segments.filter(|segment| !segment.is_empty()).collect::<Vec<_>>()).unwrap_or_default();
    if segments.len() != 2 {
        return Err("Use a repository URL in the form https://github.com/owner/repo.".to_string());
    }
    let owner = clean_repo_segment(segments[0]).ok_or_else(|| "The GitHub owner is invalid.".to_string())?;
    let repo = clean_repo_segment(segments[1].trim_end_matches(".git")).ok_or_else(|| "The GitHub repository name is invalid.".to_string())?;
    Ok((owner, repo, format!("https://github.com/{}/{}.git", segments[0], segments[1].trim_end_matches(".git"))))
}

#[tauri::command]
fn project_clone_public(url: String, state: State<'_, AppState>) -> Result<Option<ProjectWorkspace>, String> {
    let (_, repo, clone_url) = validate_public_github_url(&url)?;
    let parent = match tauri::api::dialog::blocking::FileDialogBuilder::new().pick_folder() {
        Some(path) => path,
        None => return Ok(None),
    };
    let destination = parent.join(&repo);
    if destination.exists() {
        return Err("The destination folder already exists.".to_string());
    }
    let result = Command::new("git").args(["clone", "--depth", "1", &clone_url]).arg(&destination).current_dir(&parent).output().map_err(|_| "Git is not installed or could not be started.".to_string())?;
    if !result.status.success() {
        return Err(truncate_output(&result.stderr));
    }
    set_project_root_path(destination, &state).map(Some)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn github_token() -> Result<String, String> {
    credential_entry("github-primary")?.get_password().map_err(|_| "No GitHub token is stored in the operating-system credential store.".to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn github_token() -> Result<String, String> {
    Err("Secure GitHub credentials are unavailable on this platform.".to_string())
}

#[tauri::command]
fn github_token_save(token: String) -> SecretReply {
    let trimmed = token.trim();
    if trimmed.len() < 20 || trimmed.len() > 500 {
        return SecretReply::failure("The GitHub token format is invalid.");
    }
    secret_save("github-primary".to_string(), trimmed.to_string())
}

#[tauri::command]
fn github_token_delete() -> SecretReply {
    secret_delete("github-primary".to_string())
}

fn github_json(endpoint: &str, require_token: bool) -> Result<Value, String> {
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(25)).build();
    let mut request = agent.get(endpoint).set("Accept", "application/vnd.github+json").set("X-GitHub-Api-Version", "2022-11-28").set("User-Agent", "Chris-Studio");
    if let Ok(token) = github_token() {
        request = request.set("Authorization", &format!("Bearer {token}"));
    } else if require_token {
        return Err("Store a GitHub Personal Access Token first.".to_string());
    }
    match request.call() {
        Ok(response) => response.into_json().map_err(|_| "GitHub returned unreadable JSON.".to_string()),
        Err(ureq::Error::Status(status, _)) => Err(format!("GitHub returned HTTP {status}. Check token permissions and repository access.")),
        Err(_) => Err("Could not reach GitHub.".to_string()),
    }
}

#[tauri::command]
fn github_connection_test() -> GitHubConnectionInfo {
    match github_json("https://api.github.com/user", true) {
        Ok(value) => GitHubConnectionInfo {
            ok: true,
            login: value.get("login").and_then(Value::as_str).map(ToOwned::to_owned),
            name: value.get("name").and_then(Value::as_str).map(ToOwned::to_owned),
            avatar_url: value.get("avatar_url").and_then(Value::as_str).map(ToOwned::to_owned),
            error_message: None,
        },
        Err(message) => GitHubConnectionInfo { ok: false, login: None, name: None, avatar_url: None, error_message: Some(message) },
    }
}

#[tauri::command]
fn github_repository_overview(owner: String, repo: String) -> GitHubRepositoryOverview {
    let owner = match clean_repo_segment(&owner) { Some(value) => value, None => return GitHubRepositoryOverview { ok: false, full_name: None, default_branch: None, private_repo: None, stars: None, open_issues: None, pushed_at: None, html_url: None, error_message: Some("Invalid GitHub owner.".to_string()) } };
    let repo = match clean_repo_segment(&repo) { Some(value) => value, None => return GitHubRepositoryOverview { ok: false, full_name: None, default_branch: None, private_repo: None, stars: None, open_issues: None, pushed_at: None, html_url: None, error_message: Some("Invalid GitHub repository.".to_string()) } };
    match github_json(&format!("https://api.github.com/repos/{owner}/{repo}"), false) {
        Ok(value) => GitHubRepositoryOverview {
            ok: true,
            full_name: value.get("full_name").and_then(Value::as_str).map(ToOwned::to_owned),
            default_branch: value.get("default_branch").and_then(Value::as_str).map(ToOwned::to_owned),
            private_repo: value.get("private").and_then(Value::as_bool),
            stars: value.get("stargazers_count").and_then(Value::as_u64),
            open_issues: value.get("open_issues_count").and_then(Value::as_u64),
            pushed_at: value.get("pushed_at").and_then(Value::as_str).map(ToOwned::to_owned),
            html_url: value.get("html_url").and_then(Value::as_str).map(ToOwned::to_owned),
            error_message: None,
        },
        Err(message) => GitHubRepositoryOverview { ok: false, full_name: None, default_branch: None, private_repo: None, stars: None, open_issues: None, pushed_at: None, html_url: None, error_message: Some(message) },
    }
}

#[tauri::command]
fn github_issue_list(owner: String, repo: String) -> Vec<GitHubIssueSummary> {
    let owner = match clean_repo_segment(&owner) { Some(value) => value, None => return vec![] };
    let repo = match clean_repo_segment(&repo) { Some(value) => value, None => return vec![] };
    let value = match github_json(&format!("https://api.github.com/repos/{owner}/{repo}/issues?state=open&per_page=30"), false) { Ok(value) => value, Err(_) => return vec![] };
    value.as_array().map(|items| items.iter().filter(|item| item.get("pull_request").is_none()).filter_map(|item| Some(GitHubIssueSummary {
        number: item.get("number")?.as_u64()?,
        title: item.get("title")?.as_str()?.to_string(),
        state: item.get("state")?.as_str()?.to_string(),
        url: item.get("html_url")?.as_str()?.to_string(),
        updated_at: item.get("updated_at").and_then(Value::as_str).map(ToOwned::to_owned),
    })).collect()).unwrap_or_default()
}


#[tauri::command]
fn github_create_pull_request(
    owner: String,
    repo: String,
    title: String,
    body: String,
    head: String,
    base: String,
    confirmed: bool,
) -> GitHubPullRequestResult {
    if !confirmed {
        return GitHubPullRequestResult { ok: false, number: None, url: None, title: None, error_message: Some("Explicit Pull Request approval is required.".to_string()) };
    }
    let owner = match clean_repo_segment(&owner) { Some(value) => value, None => return GitHubPullRequestResult { ok: false, number: None, url: None, title: None, error_message: Some("Invalid GitHub owner.".to_string()) } };
    let repo = match clean_repo_segment(&repo) { Some(value) => value, None => return GitHubPullRequestResult { ok: false, number: None, url: None, title: None, error_message: Some("Invalid GitHub repository.".to_string()) } };
    if title.trim().len() < 3 || title.trim().len() > 240 || !valid_git_branch(&head) || !valid_git_branch(&base) || body.len() > 20_000 {
        return GitHubPullRequestResult { ok: false, number: None, url: None, title: None, error_message: Some("Check the Pull Request title, branches and body length.".to_string()) };
    }
    let token = match github_token() {
        Ok(token) => token,
        Err(message) => return GitHubPullRequestResult { ok: false, number: None, url: None, title: None, error_message: Some(message) },
    };
    let endpoint = format!("https://api.github.com/repos/{owner}/{repo}/pulls");
    let payload = json!({ "title": title.trim(), "body": body, "head": head.trim(), "base": base.trim() });
    let request = ureq::AgentBuilder::new().timeout(Duration::from_secs(25)).build()
        .post(&endpoint)
        .set("Accept", "application/vnd.github+json")
        .set("X-GitHub-Api-Version", "2022-11-28")
        .set("User-Agent", "Chris-Studio")
        .set("Authorization", &format!("Bearer {token}"));
    match request.send_json(payload) {
        Ok(response) => match response.into_json::<Value>() {
            Ok(value) => GitHubPullRequestResult {
                ok: true,
                number: value.get("number").and_then(Value::as_u64),
                url: value.get("html_url").and_then(Value::as_str).map(ToOwned::to_owned),
                title: value.get("title").and_then(Value::as_str).map(ToOwned::to_owned),
                error_message: None,
            },
            Err(_) => GitHubPullRequestResult { ok: false, number: None, url: None, title: None, error_message: Some("GitHub returned unreadable Pull Request data.".to_string()) },
        },
        Err(ureq::Error::Status(status, response)) => {
            let message = response.into_json::<Value>().ok().and_then(|value| value.get("message").and_then(Value::as_str).map(ToOwned::to_owned)).unwrap_or_else(|| format!("GitHub returned HTTP {status}."));
            GitHubPullRequestResult { ok: false, number: None, url: None, title: None, error_message: Some(message) }
        }
        Err(_) => GitHubPullRequestResult { ok: false, number: None, url: None, title: None, error_message: Some("Could not reach GitHub.".to_string()) },
    }
}


fn mcp_credential_id(profile_id: &str) -> Result<String, String> {
    Ok(format!("mcp-{}", credential_user(profile_id)?))
}

#[tauri::command]
fn mcp_connector_secret_save(profile_id: String, secret: String) -> SecretReply {
    let id = match mcp_credential_id(&profile_id) {
        Ok(value) => value,
        Err(message) => return SecretReply::failure(&message),
    };
    secret_save(id, secret)
}

#[tauri::command]
fn mcp_connector_secret_delete(profile_id: String) -> SecretReply {
    let id = match mcp_credential_id(&profile_id) {
        Ok(value) => value,
        Err(message) => return SecretReply::failure(&message),
    };
    secret_delete(id)
}

fn validate_mcp_endpoint(raw: &str) -> Result<String, String> {
    let parsed = Url::parse(raw.trim()).map_err(|_| "Enter a valid MCP endpoint URL.".to_string())?;
    let host = parsed.host_str().unwrap_or_default();
    let local = is_local_host(host);
    if parsed.scheme() != "https" && !(parsed.scheme() == "http" && local) {
        return Err("Remote MCP connectors require HTTPS; HTTP is allowed only for localhost.".to_string());
    }
    if parsed.username() != "" || parsed.password().is_some() {
        return Err("Credentials must not be embedded in the MCP URL.".to_string());
    }
    Ok(parsed.to_string())
}

#[tauri::command]
fn mcp_request(mut request: McpRequestInput) -> McpReply {
    let started = Instant::now();
    let allowed = matches!(request.method.as_str(), "initialize" | "tools/list" | "resources/list" | "prompts/list" | "tools/call");
    if !allowed {
        return McpReply { ok: false, status: 0, result: None, error_code: Some("METHOD_BLOCKED".to_string()), error_message: Some("This MCP method is not in the Chris Studio allowlist.".to_string()), latency_ms: 0 };
    }
    if request.method == "tools/call" && !request.confirmed {
        return McpReply { ok: false, status: 0, result: None, error_code: Some("APPROVAL_REQUIRED".to_string()), error_message: Some("Explicit approval is required for MCP tool execution.".to_string()), latency_ms: 0 };
    }
    let params_size = serde_json::to_string(&request.params).map(|value| value.len()).unwrap_or(200_001);
    if params_size > 200_000 {
        return McpReply { ok: false, status: 0, result: None, error_code: Some("PAYLOAD_TOO_LARGE".to_string()), error_message: Some("MCP parameters exceed the 200 KB safety limit.".to_string()), latency_ms: 0 };
    }
    let endpoint = match validate_mcp_endpoint(&request.url) {
        Ok(value) => value,
        Err(message) => return McpReply { ok: false, status: 0, result: None, error_code: Some("INVALID_ENDPOINT".to_string()), error_message: Some(message), latency_ms: 0 },
    };
    if request.requires_credential && request.token.trim().is_empty() {
        let id = match mcp_credential_id(&request.profile_id) {
            Ok(value) => value,
            Err(message) => return McpReply { ok: false, status: 0, result: None, error_code: Some("SECURE_STORE_ERROR".to_string()), error_message: Some(message), latency_ms: 0 },
        };
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            request.token = match credential_entry(&id).and_then(|entry| entry.get_password().map_err(|_| "No MCP credential is stored for this connector.".to_string())) {
                Ok(value) => value,
                Err(message) => return McpReply { ok: false, status: 0, result: None, error_code: Some("INVALID_CREDENTIAL".to_string()), error_message: Some(message), latency_ms: 0 },
            };
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            return McpReply { ok: false, status: 0, result: None, error_code: Some("SECURE_STORE_UNAVAILABLE".to_string()), error_message: Some("Secure connector credentials require the macOS or Windows desktop build.".to_string()), latency_ms: 0 };
        }
    }
    let body = json!({
        "jsonrpc": "2.0",
        "id": unix_timestamp(),
        "method": request.method,
        "params": request.params,
    });
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(45)).build();
    let mut call = agent.post(&endpoint)
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("User-Agent", "Chris-Studio");
    if !request.token.trim().is_empty() {
        call = call.set("Authorization", &format!("Bearer {}", request.token.trim()));
    }
    match call.send_json(body) {
        Ok(response) => {
            let status = response.status();
            match response.into_json::<Value>() {
                Ok(value) => {
                    if let Some(error) = value.get("error") {
                        McpReply { ok: false, status, result: None, error_code: error.get("code").map(ToString::to_string), error_message: error.get("message").and_then(Value::as_str).map(ToOwned::to_owned), latency_ms: started.elapsed().as_millis() }
                    } else {
                        McpReply { ok: true, status, result: value.get("result").cloned().or(Some(value)), error_code: None, error_message: None, latency_ms: started.elapsed().as_millis() }
                    }
                }
                Err(_) => McpReply { ok: false, status, result: None, error_code: Some("UNSUPPORTED_STREAM".to_string()), error_message: Some("This Beta expects a JSON MCP response. Long-lived SSE sessions are not yet retained.".to_string()), latency_ms: started.elapsed().as_millis() },
            }
        }
        Err(ureq::Error::Status(status, response)) => {
            let message = response.into_json::<Value>().ok().and_then(|value| value.get("message").and_then(Value::as_str).map(ToOwned::to_owned)).unwrap_or_else(|| format!("MCP endpoint returned HTTP {status}."));
            McpReply { ok: false, status, result: None, error_code: Some("MCP_HTTP_ERROR".to_string()), error_message: Some(message), latency_ms: started.elapsed().as_millis() }
        }
        Err(_) => McpReply { ok: false, status: 0, result: None, error_code: Some("NETWORK_ERROR".to_string()), error_message: Some("Could not reach the MCP endpoint.".to_string()), latency_ms: started.elapsed().as_millis() },
    }
}

fn computer_result(ok: bool, action: &str, message: String, screenshot_data_url: Option<String>) -> ComputerActionResult {
    ComputerActionResult { ok, action: action.to_string(), message, screenshot_data_url, timestamp: unix_timestamp() }
}

fn approved_application_name(value: &str) -> Option<&'static str> {
    match value.trim().to_lowercase().as_str() {
        "textedit" | "text edit" | "文本编辑" | "文本编辑器" | "文档" => Some("TextEdit"),
        "notes" | "note" | "备忘录" => Some("Notes"),
        "safari" | "browser" | "浏览器" => Some("Safari"),
        "finder" | "访达" => Some("Finder"),
        "terminal" | "终端" => Some("Terminal"),
        "system settings" | "settings" | "系统设置" => Some("System Settings"),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
fn macos_accessibility_authorized() -> bool {
    Command::new("/usr/bin/osascript")
        .args(["-e", r#"tell application "System Events" to count processes"#])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn activate_approved_application(app: Option<&str>) -> Result<Option<&'static str>, String> {
    let Some(value) = app.filter(|value| !value.trim().is_empty()) else {
        return Ok(None);
    };
    let target = approved_application_name(value).ok_or_else(|| "The requested focus application is outside the Chris Studio allowlist.".to_string())?;
    let script = if target == "TextEdit" {
        r#"tell application id "com.apple.TextEdit" to activate
delay 0.2
tell application "System Events"
    tell process "TextEdit" to set frontmost to true
end tell"#.to_string()
    } else {
        format!("tell application \"System Events\" to set frontmost of process \"{target}\" to true")
    };
    let output = Command::new("/usr/bin/osascript")
        .args(["-e", &script])
        .output()
        .map_err(|error| format!("AppleScript could not focus {target}: {error}."))?;
    if !output.status.success() {
        return Err(format!("macOS could not focus {target}: {}", truncate_output(&output.stderr)));
    }
    std::thread::sleep(Duration::from_millis(180));
    Ok(Some(target))
}

#[tauri::command]
fn computer_capture_screen(state: State<AppState>, confirmed: bool) -> ComputerActionResult {
    if !confirmed {
        return computer_result(false, "screen-capture", "Explicit screen-capture approval is required.".to_string(), None);
    }
    #[cfg(target_os = "macos")]
    {
        let preflight_ok = macos_screen_capture_authorized();
        let path = std::env::temp_dir().join(format!("chris-studio-capture-{}.png", unix_timestamp()));
        let output = Command::new("/usr/sbin/screencapture")
            .args(["-x", "-t", "png"])
            .arg(&path)
            .output();
        match output {
            Ok(output) if output.status.success() => match fs::read(&path) {
                Ok(bytes) if !bytes.is_empty() => {
                    let _ = fs::remove_file(&path);
                    if let Ok(mut verified) = state.screen_capture_verified.lock() {
                        *verified = true;
                    }
                    let data = format!("data:image/png;base64,{}", BASE64_STANDARD.encode(bytes));
                    computer_result(true, "screen-capture", "Screen captured locally. Review the preview before any control action.".to_string(), Some(data))
                }
                Ok(_) => {
                    let _ = fs::remove_file(&path);
                    computer_result(false, "screen-capture", "macOS returned an empty screen capture. Fully quit and reopen Chris Studio after changing Screen Recording permission.".to_string(), None)
                }
                Err(error) => computer_result(false, "screen-capture", format!("The captured screen image could not be read: {error}."), None),
            },
            Ok(output) => {
                let _ = fs::remove_file(&path);
                if let Ok(mut verified) = state.screen_capture_verified.lock() {
                    *verified = false;
                }
                let detail = truncate_output(&output.stderr);
                if preflight_ok {
                    computer_result(false, "screen-capture", format!("Screen capture helper failed even though macOS reports permission is enabled: {detail}"), None)
                } else {
                    computer_result(false, "screen-capture", format!("Screen Recording permission is not active for this Chris Studio build, or macOS still has the previous build cached. Toggle Chris Studio off and on under Privacy & Security > Screen & System Audio Recording, fully quit the app, then reopen it. Helper detail: {detail}"), None)
                }
            }
            Err(error) => computer_result(false, "screen-capture", format!("The macOS screen capture helper could not start: {error}."), None),
        }
    }
    #[cfg(not(target_os = "macos"))]
    computer_result(false, "screen-capture", "Screen capture is currently implemented for macOS builds.".to_string(), None)
}

#[tauri::command]
fn computer_click(x: i32, y: i32, confirmed: bool) -> ComputerActionResult {
    if !confirmed {
        return computer_result(false, "pointer-click", "Explicit pointer approval is required.".to_string(), None);
    }
    if x < 0 || y < 0 || x > 20_000 || y > 20_000 {
        return computer_result(false, "pointer-click", "Pointer coordinates are outside the accepted range.".to_string(), None);
    }
    #[cfg(target_os = "macos")]
    {
        let script = format!("tell application \"System Events\" to click at {{{x}, {y}}}");
        match Command::new("/usr/bin/osascript").args(["-e", &script]).output() {
            Ok(output) if output.status.success() => computer_result(true, "pointer-click", format!("Clicked the approved coordinate ({x}, {y})."), None),
            Ok(output) => computer_result(false, "pointer-click", format!("macOS rejected the click: {}", truncate_output(&output.stderr)), None),
            Err(_) => computer_result(false, "pointer-click", "AppleScript could not be started.".to_string(), None),
        }
    }
    #[cfg(not(target_os = "macos"))]
    computer_result(false, "pointer-click", "Pointer control is currently implemented for macOS builds.".to_string(), None)
}

#[tauri::command]
fn computer_type_text(text: String, confirmed: bool, app: Option<String>) -> ComputerActionResult {
    if !confirmed {
        return computer_result(false, "keyboard-type", "Explicit keyboard approval is required.".to_string(), None);
    }
    if text.is_empty() || text.chars().count() > 4_000 {
        return computer_result(false, "keyboard-type", "Approved typing must contain 1 to 4,000 characters.".to_string(), None);
    }
    #[cfg(target_os = "macos")]
    {
        let focused = match activate_approved_application(app.as_deref()) {
            Ok(value) => value,
            Err(message) => return computer_result(false, "keyboard-type", message, None),
        };
        if focused == Some("TextEdit") {
            let direct_script = r#"on run argv
tell application id "com.apple.TextEdit"
    activate
    if (count documents) is 0 then make new document
    set currentText to text of front document
    set text of front document to currentText & (item 1 of argv)
end tell
end run"#;
            match Command::new("/usr/bin/osascript").args(["-e", direct_script, "--", &text]).output() {
                Ok(output) if output.status.success() => {
                    return computer_result(true, "keyboard-type", format!("Inserted {} approved characters into the front TextEdit document.", text.chars().count()), None);
                }
                _ => {
                    // Fall through to accessibility keystrokes for compatibility
                    // with managed Macs that deny direct TextEdit automation.
                }
            }
        }
        let output = Command::new("/usr/bin/osascript")
            .args(["-e", "on run argv", "-e", "tell application \"System Events\" to keystroke (item 1 of argv)", "-e", "end run", "--", &text])
            .output();
        match output {
            Ok(output) if output.status.success() => {
                let target = focused.map(|value| format!(" into {value}")).unwrap_or_default();
                computer_result(true, "keyboard-type", format!("Typed {} approved characters{target}.", text.chars().count()), None)
            }
            Ok(output) => computer_result(false, "keyboard-type", format!("macOS rejected keyboard control: {}", truncate_output(&output.stderr)), None),
            Err(_) => computer_result(false, "keyboard-type", "AppleScript could not be started.".to_string(), None),
        }
    }
    #[cfg(not(target_os = "macos"))]
    computer_result(false, "keyboard-type", "Keyboard control is currently implemented for macOS builds.".to_string(), None)
}

#[tauri::command]
fn computer_press_key(key: String, confirmed: bool, app: Option<String>) -> ComputerActionResult {
    if !confirmed {
        return computer_result(false, "keyboard-key", "Explicit key approval is required.".to_string(), None);
    }
    let script = match key.as_str() {
        "enter" => "tell application \"System Events\" to key code 36",
        "escape" => "tell application \"System Events\" to key code 53",
        "tab" => "tell application \"System Events\" to key code 48",
        "space" => "tell application \"System Events\" to key code 49",
        "delete" => "tell application \"System Events\" to key code 51",
        "cmd+s" => "tell application \"System Events\" to keystroke \"s\" using command down",
        "cmd+l" => "tell application \"System Events\" to keystroke \"l\" using command down",
        "cmd+n" => "tell application \"System Events\" to keystroke \"n\" using command down",
        "cmd+w" => "tell application \"System Events\" to keystroke \"w\" using command down",
        _ => return computer_result(false, "keyboard-key", "This key is not in the Chris Studio allowlist.".to_string(), None),
    };
    #[cfg(target_os = "macos")]
    {
        if let Err(message) = activate_approved_application(app.as_deref()) {
            return computer_result(false, "keyboard-key", message, None);
        }
        match Command::new("/usr/bin/osascript").args(["-e", script]).output() {
            Ok(output) if output.status.success() => computer_result(true, "keyboard-key", format!("Pressed the approved key: {key}."), None),
            Ok(output) => computer_result(false, "keyboard-key", format!("macOS rejected the key action: {}", truncate_output(&output.stderr)), None),
            Err(_) => computer_result(false, "keyboard-key", "AppleScript could not be started.".to_string(), None),
        }
    }
    #[cfg(not(target_os = "macos"))]
    computer_result(false, "keyboard-key", "Keyboard control is currently implemented for macOS builds.".to_string(), None)
}

#[tauri::command]
fn computer_open_application(app: String, confirmed: bool) -> ComputerActionResult {
    if !confirmed {
        return computer_result(false, "open-application", "Explicit application-launch approval is required.".to_string(), None);
    }
    let target = match approved_application_name(&app) {
        Some(value) => value,
        None => {
            return computer_result(
                false,
                "open-application",
                "This application is not in the Chris Studio allowlist. Allowed: TextEdit, Notes, Safari, Finder, Terminal and System Settings.".to_string(),
                None,
            )
        }
    };
    #[cfg(target_os = "macos")]
    {
        if target == "TextEdit" {
            // Launch by bundle identifier first. On localized macOS installations,
            // addressing TextEdit only by its display name can produce error -600
            // even when the app exists. After launch, create an untitled document
            // through TextEdit's scripting interface and fall back to Cmd+N.
            let launch = Command::new("/usr/bin/open")
                .args(["-b", "com.apple.TextEdit"])
                .output();
            match launch {
                Ok(output) if output.status.success() => {}
                Ok(output) => {
                    return computer_result(false, "open-application", format!("macOS could not launch TextEdit by bundle identifier: {}", truncate_output(&output.stderr)), None)
                }
                Err(error) => {
                    return computer_result(false, "open-application", format!("The macOS open command could not launch TextEdit: {error}."), None)
                }
            }
            std::thread::sleep(Duration::from_millis(450));

            let direct_script = r#"tell application id "com.apple.TextEdit"
activate
make new document
end tell"#;
            let direct = Command::new("/usr/bin/osascript").args(["-e", direct_script]).output();
            if matches!(&direct, Ok(output) if output.status.success()) {
                std::thread::sleep(Duration::from_millis(250));
                return computer_result(true, "open-application", "Created and focused a new untitled TextEdit document ready for approved typing.".to_string(), None);
            }

            let fallback_script = r#"tell application id "com.apple.TextEdit" to activate
delay 0.3
tell application "System Events"
    repeat 30 times
        if exists process "TextEdit" then
            tell process "TextEdit"
                set frontmost to true
                keystroke "n" using command down
            end tell
            delay 0.3
            return
        end if
        delay 0.1
    end repeat
    error "TextEdit process did not appear"
end tell"#;
            let fallback = Command::new("/usr/bin/osascript").args(["-e", fallback_script]).output();
            return match fallback {
                Ok(output) if output.status.success() => computer_result(true, "open-application", "Opened TextEdit and created a new untitled document with the approved Cmd+N fallback.".to_string(), None),
                Ok(output) => {
                    let direct_detail = match direct {
                        Ok(ref first) => truncate_output(&first.stderr),
                        Err(ref error) => error.to_string(),
                    };
                    computer_result(false, "open-application", format!("TextEdit launched, but Chris Studio could not create an untitled document. Direct automation: {direct_detail}. Accessibility fallback: {}. Check Privacy & Security > Accessibility and Automation, then retry once.", truncate_output(&output.stderr)), None)
                }
                Err(error) => computer_result(false, "open-application", format!("TextEdit launched, but the approved Cmd+N fallback could not start: {error}."), None),
            };
        }
        match Command::new("/usr/bin/open").args(["-a", target]).output() {
            Ok(output) if output.status.success() => computer_result(true, "open-application", format!("Opened the approved application: {target}."), None),
            Ok(output) => computer_result(false, "open-application", format!("macOS could not open {target}: {}", truncate_output(&output.stderr)), None),
            Err(error) => computer_result(false, "open-application", format!("The macOS open command could not be started: {error}."), None),
        }
    }
    #[cfg(not(target_os = "macos"))]
    computer_result(false, "open-application", "Application launching is currently implemented for macOS builds.".to_string(), None)
}

#[tauri::command]
fn computer_request_permissions() -> ComputerActionResult {
    #[cfg(target_os = "macos")]
    {
        let accessibility_ok = macos_accessibility_authorized();
        let mut screen_ok = macos_screen_capture_authorized();
        if !screen_ok {
            screen_ok = request_macos_screen_capture_access();
        }
        if !accessibility_ok {
            let _ = Command::new("/usr/bin/open")
                .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
                .spawn();
        } else if !screen_ok {
            let _ = Command::new("/usr/bin/open")
                .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
                .spawn();
        }
        let message = match (accessibility_ok, screen_ok) {
            (true, true) => "Computer Use permissions are active for this Chris Studio process.".to_string(),
            (false, true) => "Screen Recording is active, but Accessibility control is unavailable. Enable Chris Studio under Privacy & Security > Accessibility, then fully quit and reopen the app.".to_string(),
            (true, false) => "Accessibility is active, but Screen Recording is unavailable. Enable Chris Studio under Privacy & Security > Screen & System Audio Recording, then fully quit and reopen the app.".to_string(),
            (false, false) => "Accessibility and Screen Recording are unavailable. Enable Chris Studio in both Privacy & Security panels, then fully quit and reopen the app.".to_string(),
        };
        return computer_result(accessibility_ok && screen_ok, "request-permissions", message, None);
    }
    #[cfg(not(target_os = "macos"))]
    computer_result(false, "request-permissions", "Computer Use permission requests are currently implemented for macOS builds.".to_string(), None)
}

#[tauri::command]
fn computer_open_privacy_settings() -> ComputerActionResult {
    #[cfg(target_os = "macos")]
    {
        let url = if macos_screen_capture_authorized() {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        } else {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        };
        match Command::new("/usr/bin/open").arg(url).spawn() {
            Ok(_) => computer_result(true, "open-privacy-settings", "Opened macOS Privacy & Security settings.".to_string(), None),
            Err(_) => computer_result(false, "open-privacy-settings", "Could not open macOS Privacy & Security settings.".to_string(), None),
        }
    }
    #[cfg(not(target_os = "macos"))]
    computer_result(false, "open-privacy-settings", "This shortcut is available on macOS.".to_string(), None)
}


fn application_menu() -> Menu {
    let about = CustomMenuItem::new("about", "About Chris Studio");
    let preferences = CustomMenuItem::new("preferences", "Preferences…");
    let updates = CustomMenuItem::new("updates", "Check for Updates…");
    let quit = CustomMenuItem::new("quit", "Quit Chris Studio").accelerator("CmdOrCtrl+Q");
    let new_session = CustomMenuItem::new("new_session", "New Session").accelerator("CmdOrCtrl+N");
    let projects = CustomMenuItem::new("projects", "Open Projects Workspace…").accelerator("CmdOrCtrl+Shift+O");
    let computer = CustomMenuItem::new("computer", "Computer Use…");
    let skills = CustomMenuItem::new("skills", "Skill Library…");

    let app_menu = Submenu::new(
        "Chris Studio",
        Menu::new()
            .add_item(about)
            .add_item(preferences)
            .add_item(updates)
            .add_item(quit),
    );
    let file_menu = Submenu::new("File", Menu::new().add_item(new_session).add_item(projects));
    let tools_menu = Submenu::new("Tools", Menu::new().add_item(computer).add_item(skills));
    let edit_menu = Submenu::new(
        "Edit",
        Menu::new()
            .add_native_item(MenuItem::Undo)
            .add_native_item(MenuItem::Redo)
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::Cut)
            .add_native_item(MenuItem::Copy)
            .add_native_item(MenuItem::Paste)
            .add_native_item(MenuItem::SelectAll),
    );

    Menu::new()
        .add_submenu(app_menu)
        .add_submenu(file_menu)
        .add_submenu(edit_menu)
        .add_submenu(tools_menu)
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .menu(application_menu())
        .on_menu_event(|event| match event.menu_item_id() {
            "new_session" => {
                let _ = event.window().emit("tokenfence://new-session", ());
            }
            "preferences" => {
                let _ = event.window().emit("tokenfence://navigate", "settings");
            }
            "updates" => {
                let _ = event.window().emit("tokenfence://navigate", "updates");
            }
            "projects" => { let _ = event.window().emit("tokenfence://navigate", "projects"); }
            "computer" => { let _ = event.window().emit("tokenfence://navigate", "computer"); }
            "skills" => { let _ = event.window().emit("tokenfence://navigate", "skills"); }
            "about" => {
                let _ = event.window().emit("tokenfence://navigate", "about");
            }
            "quit" => std::process::exit(0),
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            provider_connection_test,
            provider_chat,
            provider_chat_stream,
            provider_stream_cancel,
            provider_secret_save,
            provider_secret_load,
            provider_secret_delete,
            platform_info,
            computer_capabilities,
            github_release_check,
            open_external_url,
            project_choose_folder,
            project_set_root,
            project_scan,
            project_read_file,
            project_write_file,
            project_run_preset,
            project_git_status,
            project_git_diff,
            project_apply_patch,
            project_apply_change_session,
            project_latest_change_session,
            project_rollback_change_session,
            project_accept_change_session,
            project_git_create_branch,
            project_git_commit,
            project_git_push,
            project_clone_public,
            github_token_save,
            github_token_delete,
            github_connection_test,
            github_repository_overview,
            github_issue_list,
            github_create_pull_request,
            mcp_connector_secret_save,
            mcp_connector_secret_delete,
            mcp_request,
            computer_capture_screen,
            computer_click,
            computer_type_text,
            computer_press_key,
            computer_open_application,
            computer_request_permissions,
            computer_open_privacy_settings
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Chris Studio");
}

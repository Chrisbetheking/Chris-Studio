#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::{Duration, Instant};

const DEFAULT_BASE_URL: &str = "https://api.deepseek.com";
const MAX_TIMEOUT_MS: u64 = 180_000;
const MIN_TIMEOUT_MS: u64 = 5_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderConfigInput {
    api_key: String,
    model: String,
    base_url: String,
    timeout_ms: u64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct ProviderMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
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

fn validate_config(config: &ProviderConfigInput) -> Result<(String, String, u64), ProviderReply> {
    let api_key = config.api_key.trim();
    if api_key.len() < 12 || api_key.len() > 512 || api_key.contains('\n') || api_key.contains('\r') {
        return Err(ProviderReply::failure(
            0,
            "INVALID_CREDENTIAL",
            "The API credential is missing or malformed.",
            0,
        ));
    }

    let model = config.model.trim();
    if !matches!(model, "deepseek-v4-flash" | "deepseek-v4-pro") {
        return Err(ProviderReply::failure(
            0,
            "UNSUPPORTED_MODEL",
            "Select a currently supported DeepSeek V4 model.",
            0,
        ));
    }

    let base = config.base_url.trim().trim_end_matches('/');
    if !matches!(base, DEFAULT_BASE_URL | "https://api.deepseek.com/v1") {
        return Err(ProviderReply::failure(
            0,
            "UNSAFE_ENDPOINT",
            "TokenFence only permits the official DeepSeek HTTPS endpoint in this build.",
            0,
        ));
    }

    let timeout = config.timeout_ms.clamp(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
    Ok((base.to_string(), model.to_string(), timeout))
}

fn status_message(status: u16) -> (&'static str, &'static str) {
    match status {
        400 => ("BAD_REQUEST", "DeepSeek rejected the request. Check the selected model."),
        401 => ("UNAUTHORIZED", "The DeepSeek API key was rejected."),
        402 => ("PAYMENT_REQUIRED", "The DeepSeek account has insufficient balance or billing access."),
        403 => ("FORBIDDEN", "The DeepSeek account is not permitted to use this resource."),
        404 => ("NOT_FOUND", "The DeepSeek endpoint or selected model was not found."),
        408 => ("REMOTE_TIMEOUT", "DeepSeek timed out while processing the request."),
        429 => ("RATE_LIMITED", "DeepSeek rate-limited the request. Try again later."),
        500..=599 => ("PROVIDER_UNAVAILABLE", "DeepSeek is temporarily unavailable."),
        _ => ("PROVIDER_ERROR", "DeepSeek returned an unexpected response."),
    }
}

fn send_request(
    config: ProviderConfigInput,
    messages: Vec<ProviderMessage>,
    max_tokens: u32,
    temperature: f64,
) -> ProviderReply {
    let started = Instant::now();
    let (base_url, model, timeout_ms) = match validate_config(&config) {
        Ok(value) => value,
        Err(mut error) => {
            error.latency_ms = started.elapsed().as_millis();
            return error;
        }
    };

    if messages.is_empty()
        || messages.len() > 120
        || messages.iter().any(|message| {
            !matches!(message.role.as_str(), "user" | "assistant" | "system")
                || message.content.len() > 1_000_000
        })
    {
        return ProviderReply::failure(
            0,
            "INVALID_PAYLOAD",
            "The reviewed conversation payload is empty or exceeds safety limits.",
            started.elapsed().as_millis(),
        );
    }

    let endpoint = format!("{base_url}/chat/completions");
    let body = json!({
        "model": model,
        "messages": messages,
        "stream": false,
        "thinking": { "type": "disabled" },
        "max_tokens": max_tokens.clamp(1, 8192),
        "temperature": temperature.clamp(0.0, 2.0)
    });

    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_millis(timeout_ms))
        .build();

    let response = agent
        .post(&endpoint)
        .set("Authorization", &format!("Bearer {}", config.api_key.trim()))
        .set("Content-Type", "application/json")
        .send_json(body);

    let latency_ms = started.elapsed().as_millis();
    match response {
        Ok(response) => {
            let status = response.status();
            let payload: Value = match response.into_json() {
                Ok(value) => value,
                Err(_) => {
                    return ProviderReply::failure(
                        status,
                        "INVALID_RESPONSE",
                        "DeepSeek returned an unreadable response.",
                        latency_ms,
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
                    "DeepSeek returned no assistant content.",
                    latency_ms,
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
                    .or(Some(model)),
                error_code: None,
                error_message: None,
                latency_ms,
            }
        }
        Err(ureq::Error::Status(status, _response)) => {
            let (code, message) = status_message(status);
            ProviderReply::failure(status, code, message, latency_ms)
        }
        Err(ureq::Error::Transport(_error)) => ProviderReply::failure(
            0,
            "NETWORK_ERROR",
            "Network connection failed. Check internet access, proxy, DNS and system time.",
            latency_ms,
        ),
    }
}

#[tauri::command]
fn provider_connection_test(config: ProviderConfigInput) -> ProviderReply {
    send_request(
        config,
        vec![ProviderMessage {
            role: "user".to_string(),
            content: "Reply with exactly: TokenFence connection verified.".to_string(),
        }],
        32,
        0.0,
    )
}

#[tauri::command]
fn provider_chat(request: ProviderChatRequest) -> ProviderReply {
    send_request(
        request.config,
        request.messages,
        request.max_tokens.unwrap_or(2048),
        request.temperature.unwrap_or(0.3),
    )
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            provider_connection_test,
            provider_chat
        ])
        .run(tauri::generate_context!())
        .expect("failed to run TokenFence Studio");
}

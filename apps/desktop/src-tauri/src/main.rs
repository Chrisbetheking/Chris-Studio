#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

/* ============================================================
   Types
   ============================================================ */

#[derive(Debug, Serialize, Deserialize)]
struct CommandResult {
    exit_code: i32,
    stdout: String,
    stderr: String,
    killed: bool,
    duration_ms: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct FileInfo {
    path: String,
    exists: bool,
    size: u64,
    is_dir: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ProjectFile {
    path: String,
    name: String,
    extension: String,
    size: u64,
    modified: String,
    kind: String, // "text" | "code" | "data" | "image" | "other"
}

#[derive(Debug, Serialize, Deserialize)]
struct ScanResult {
    files: Vec<ProjectFile>,
    total: usize,
    skipped: usize,
    error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProviderTestResult {
    ok: bool,
    status: String, // "ok" | "failed" | "degraded" | "not_configured"
    message: String,
    models: Vec<String>,
}

/* ============================================================
   Constants
   ============================================================ */

const ALLOWED_EXTENSIONS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "py", "md", "txt", "json", "css", "html",
    "rs", "go", "java", "cpp", "c", "cs", "csv", "yaml", "yml", "toml",
    "xml", "sh", "bat", "ps1", "sql", "r", "rb", "php", "swift", "kt",
];

const EXCLUDE_DIRS: &[&str] = &[
    "node_modules", ".git", "dist", "build", "target", ".next",
    "__pycache__", ".venv", "venv", "coverage", ".cache",
    ".turbo", ".nx", "out", "bin", "obj",
];

const MAX_FILES: usize = 300;
const MAX_FILE_SIZE: u64 = 300_000; // 300KB

const BLOCKED_COMMANDS: &[&str] = &[
    "rm -rf /", "del /f /s c:\\", "format", "shutdown",
    "reboot", "diskpart", "reg delete", "rd /s c:\\",
];

/* ============================================================
   Helpers
   ============================================================ */

fn is_command_safe(command: &str) -> bool {
    let lower = command.to_lowercase();
    for blocked in BLOCKED_COMMANDS {
        if lower.contains(&blocked.to_lowercase()) {
            return false;
        }
    }
    true
}

fn classify_file_kind(ext: &str) -> &str {
    match ext {
        "ts" | "tsx" | "js" | "jsx" | "rs" | "go" | "java" | "cpp" | "c" |
        "cs" | "rb" | "php" | "swift" | "kt" | "py" | "sh" | "bat" | "ps1" | "sql" | "r" => "code",
        "md" | "txt" | "html" | "css" => "text",
        "json" | "csv" | "yaml" | "yml" | "toml" | "xml" => "data",
        _ => "other",
    }
}

fn should_exclude_dir(name: &str) -> bool {
    let lower = name.to_lowercase();
    EXCLUDE_DIRS.iter().any(|d| lower == *d)
}

fn scan_dir_recursive(root: &PathBuf, base: &PathBuf, results: &mut Vec<ProjectFile>, skipped: &mut usize) {
    if results.len() >= MAX_FILES { return; }
    let entries = match std::fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        if results.len() >= MAX_FILES { break; }
        let path = entry.path();
        let fname = entry.file_name().to_string_lossy().to_string();

        if path.is_dir() {
            if !should_exclude_dir(&fname) {
                scan_dir_recursive(&path, base, results, skipped);
            }
        } else if path.is_file() {
            let ext = path.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
                *skipped += 1;
                continue;
            }

            let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            if size > MAX_FILE_SIZE {
                *skipped += 1;
                continue;
            }

            let modified = std::fs::metadata(&path)
                .ok().and_then(|m| m.modified().ok())
                .map(|t| {
                    let d = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
                    chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
                        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                        .unwrap_or_default()
                })
                .unwrap_or_default();

            let kind = classify_file_kind(&ext).to_string();

            results.push(ProjectFile {
                path: path.to_string_lossy().to_string(),
                name: path.strip_prefix(base)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or(fname.clone()),
                extension: ext,
                size,
                modified,
                kind,
            });
        }
    }
}

/* ============================================================
   Tauri Commands
   ============================================================ */

#[tauri::command]
fn get_storage_path(app_handle: tauri::AppHandle) -> String {
    app_handle.path().app_data_dir().unwrap_or_default().to_string_lossy().to_string()
}

#[tauri::command]
fn execute_command(command: String, args: Vec<String>, cwd: Option<String>, _timeout_ms: Option<u64>) -> CommandResult {
    use std::time::Instant;
    if !is_command_safe(&command) {
        return CommandResult { exit_code: -1, stdout: String::new(), stderr: format!("[Security] Blocked: {}", command), killed: false, duration_ms: 0 };
    }
    let start = Instant::now();
    let work_dir = cwd.unwrap_or_else(|| ".".to_string());
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd"); c.arg("/C").arg(&command); c
    } else {
        let mut c = Command::new("sh"); c.arg("-c").arg(&command); c
    };
    if !args.is_empty() { cmd.args(&args); }
    cmd.current_dir(&work_dir);
    let output = cmd.output();
    let duration_ms = start.elapsed().as_millis() as u64;
    match output {
        Ok(out) => CommandResult { exit_code: out.status.code().unwrap_or(-1), stdout: String::from_utf8_lossy(&out.stdout).to_string(), stderr: String::from_utf8_lossy(&out.stderr).to_string(), killed: false, duration_ms },
        Err(e) => CommandResult { exit_code: -1, stdout: String::new(), stderr: format!("Failed: {}", e), killed: false, duration_ms },
    }
}

#[tauri::command]
fn create_directory(path: String) -> Result<String, String> {
    std::fs::create_dir_all(&path).map_err(|e| format!("Failed to create {}: {}", path, e))?;
    Ok(path)
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() { std::fs::create_dir_all(parent).map_err(|e| format!("Failed: {}", e))?; }
    std::fs::write(&p, &content).map_err(|e| format!("Failed to write {}: {}", path, e))?;
    Ok(path)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
fn file_exists(path: String) -> FileInfo {
    let p = PathBuf::from(&path);
    FileInfo { path, exists: p.exists(), size: if p.is_file() { std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0) } else { 0 }, is_dir: p.is_dir() }
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<FileInfo>, String> {
    let entries = std::fs::read_dir(&path).map_err(|e| format!("Failed: {}", e))?;
    let mut files = Vec::new();
    for e in entries.flatten() {
        let ep = e.path();
        files.push(FileInfo { path: ep.to_string_lossy().to_string(), exists: ep.exists(), size: if ep.is_file() { std::fs::metadata(&ep).map(|m| m.len()).unwrap_or(0) } else { 0 }, is_dir: ep.is_dir() });
    }
    Ok(files)
}

#[tauri::command]
fn init_tokenfence_dirs(base_path: String) -> Result<String, String> {
    for d in &["runtimes", "outputs", "logs", "config", "test-vault"] {
        std::fs::create_dir_all(PathBuf::from(&base_path).join(d)).map_err(|e| format!("Failed: {}", e))?;
    }
    Ok(base_path)
}

/* ============================================================
   v1.0.11: Real file scanning
   ============================================================ */

#[tauri::command]
fn scan_project_files(path: String) -> ScanResult {
    let root = PathBuf::from(&path);
    if !root.exists() || !root.is_dir() {
        return ScanResult { files: vec![], total: 0, skipped: 0, error: Some(format!("Path not found or not a directory: {}", path)) };
    }
    let mut files = Vec::new();
    let mut skipped = 0usize;
    scan_dir_recursive(&root, &root, &mut files, &mut skipped);
    let total = files.len();
    ScanResult { files, total, skipped, error: None }
}

#[tauri::command]
fn read_project_file(path: String) -> Result<String, String> {
    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    if size > MAX_FILE_SIZE {
        return Err(format!("File too large: {} bytes (max {})", size, MAX_FILE_SIZE));
    }
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read: {}", e))
}

/* ============================================================
   v1.0.11: Provider connection testing via backend
   ============================================================ */

#[tauri::command]
fn test_provider_connection(provider_id: String, base_url: String, api_key: Option<String>) -> ProviderTestResult {
    let test_url = format!("{}/v1/models", base_url.trim_end_matches('/'));

    // Ollama uses /api/tags
    let test_url = if provider_id == "Ollama" {
        format!("{}/api/tags", base_url.trim_end_matches('/'))
    } else {
        test_url
    };

    // No API key and not local
    if api_key.is_none() && provider_id != "Ollama" && provider_id != "LM Studio" {
        return ProviderTestResult { ok: false, status: "not_configured".into(), message: "No API key configured".into(), models: vec![] };
    }

    let mut req = ureq::get(&test_url);
    if let Some(ref key) = api_key {
        if key.is_empty() && provider_id != "Ollama" && provider_id != "LM Studio" {
            return ProviderTestResult { ok: false, status: "not_configured".into(), message: "No API key configured".into(), models: vec![] };
        }
        if !key.is_empty() {
            req = req.header("Authorization", &format!("Bearer {}", key));
        }
    }

    match req.call() {
        Ok(resp) => {
            let status_code = resp.status();
            let mut b = resp.into_body(); let body = b.read_to_string().unwrap_or_default();
            let models: Vec<String> = if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body) {
                v.get("data")
                    .or_else(|| v.get("models"))
                    .and_then(|arr| arr.as_array())
                    .map(|arr| arr.iter().filter_map(|m| m.get("id").and_then(|id| id.as_str()).map(String::from)).collect())
                    .unwrap_or_default()
            } else {
                vec![]
            };
            ProviderTestResult { ok: true, status: "ok".into(), message: format!("Connected (HTTP {})", status_code), models }
        }
        Err(ureq::Error::StatusCode(401)) | Err(ureq::Error::StatusCode(403)) => {
            ProviderTestResult { ok: true, status: "degraded".into(), message: format!("Endpoint reached (HTTP 401/403). Check API key permissions."), models: vec![] }
        }
        Err(ureq::Error::StatusCode(code)) => {
            ProviderTestResult { ok: false, status: "failed".into(), message: format!("HTTP {}", code), models: vec![] }
        }
        Err(e) => {
            ProviderTestResult { ok: false, status: "failed".into(), message: format!("Connection failed: {}", e), models: vec![] }
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_storage_path,
            execute_command,
            create_directory,
            write_file,
            read_file,
            file_exists,
            list_directory,
            init_tokenfence_dirs,
            scan_project_files,
            read_project_file,
            test_provider_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running TokenFence Studio");
}

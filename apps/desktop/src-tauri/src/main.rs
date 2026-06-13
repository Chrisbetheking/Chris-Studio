#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::path::PathBuf;

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

const BLOCKED_COMMANDS: &[&str] = &[
    "rm -rf /",
    "del /f /s c:\\",
    "format",
    "shutdown",
    "reboot",
    "diskpart",
    "reg delete",
    "rd /s c:\\",
];

fn is_command_safe(command: &str) -> bool {
    let lower = command.to_lowercase();
    for blocked in BLOCKED_COMMANDS {
        if lower.contains(&blocked.to_lowercase()) {
            return false;
        }
    }
    true
}

#[tauri::command]
fn get_storage_path(app_handle: tauri::AppHandle) -> String {
    app_handle
        .path()
        .app_data_dir()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
fn execute_command(command: String, args: Vec<String>, cwd: Option<String>, timeout_ms: Option<u64>) -> CommandResult {
    use std::time::Instant;

    if !is_command_safe(&command) {
        return CommandResult {
            exit_code: -1,
            stdout: String::new(),
            stderr: format!("[Security] Blocked unsafe command: {}", command),
            killed: false,
            duration_ms: 0,
        };
    }

    let start = Instant::now();
    let work_dir = cwd.unwrap_or_else(|| ".".to_string());

    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(&command);
        c
    } else {
        let mut c = Command::new("sh");
        c.arg("-c").arg(&command);
        c
    };

    if !args.is_empty() {
        cmd.args(&args);
    }
    cmd.current_dir(&work_dir);

    let _timeout = timeout_ms.unwrap_or(30000);
    let output = cmd.output();

    let duration_ms = start.elapsed().as_millis() as u64;

    match output {
        Ok(out) => CommandResult {
            exit_code: out.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&out.stdout).to_string(),
            stderr: String::from_utf8_lossy(&out.stderr).to_string(),
            killed: false,
            duration_ms,
        },
        Err(e) => CommandResult {
            exit_code: -1,
            stdout: String::new(),
            stderr: format!("Failed to execute: {}", e),
            killed: false,
            duration_ms,
        },
    }
}

#[tauri::command]
fn create_directory(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    std::fs::create_dir_all(&p).map_err(|e| format!("Failed to create directory {}: {}", path, e))?;
    Ok(path)
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }
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
    let exists = p.exists();
    let is_dir = p.is_dir();
    let size = if exists && !is_dir {
        std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };
    FileInfo { path, exists, size, is_dir }
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<FileInfo>, String> {
    let p = PathBuf::from(&path);
    let entries = std::fs::read_dir(&p).map_err(|e| format!("Failed to list {}: {}", path, e))?;
    let mut files = Vec::new();
    for entry in entries {
        if let Ok(e) = entry {
            let ep = e.path();
            let exists = ep.exists();
            let is_dir = ep.is_dir();
            let size = if exists && !is_dir {
                std::fs::metadata(&ep).map(|m| m.len()).unwrap_or(0)
            } else {
                0
            };
            files.push(FileInfo {
                path: ep.to_string_lossy().to_string(),
                exists,
                size,
                is_dir,
            });
        }
    }
    Ok(files)
}

#[tauri::command]
fn init_tokenfence_dirs(base_path: String) -> Result<String, String> {
    let dirs = vec![
        "runtimes",
        "outputs",
        "logs",
        "config",
        "test-vault",
    ];
    for d in &dirs {
        let full = PathBuf::from(&base_path).join(d);
        std::fs::create_dir_all(&full)
            .map_err(|e| format!("Failed to create {}: {}", full.display(), e))?;
    }
    Ok(base_path)
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running TokenFence Studio");
}


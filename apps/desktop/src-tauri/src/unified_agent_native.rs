use serde::{Deserialize, Serialize};
use std::process::Command;

const ALLOWED_APPS: [&str; 6] = [
    "TextEdit",
    "Notes",
    "Safari",
    "Finder",
    "Terminal",
    "System Settings",
];

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessibilityElementSummary {
    index: usize,
    role: String,
    title: String,
    description: String,
    enabled: bool,
    actions: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessibilitySnapshot {
    ok: bool,
    app: Option<String>,
    window: Option<String>,
    elements: Vec<AccessibilityElementSummary>,
    message: String,
    error_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessibilityActionResult {
    ok: bool,
    app: Option<String>,
    index: Option<usize>,
    role: Option<String>,
    title: Option<String>,
    message: String,
    error_message: Option<String>,
}

fn validate_app(app: Option<String>) -> Result<Option<String>, String> {
    let value = app.map(|entry| entry.trim().to_string()).filter(|entry| !entry.is_empty());
    if let Some(ref name) = value {
        if !ALLOWED_APPS.contains(&name.as_str()) {
            return Err(format!("Unsupported Accessibility target application: {name}."));
        }
    }
    Ok(value)
}

#[cfg(target_os = "macos")]
fn run_jxa(script: &str, app: Option<&str>, index: Option<usize>, expected_role: Option<&str>, expected_title: Option<&str>) -> Result<String, String> {
    let mut command = Command::new("/usr/bin/osascript");
    command.arg("-l").arg("JavaScript").arg("-e").arg(script);
    if let Some(value) = app {
        command.env("CHRIS_TARGET_APP", value);
    }
    if let Some(value) = index {
        command.env("CHRIS_TARGET_INDEX", value.to_string());
    }
    if let Some(value) = expected_role {
        command.env("CHRIS_EXPECTED_ROLE", value);
    }
    if let Some(value) = expected_title {
        command.env("CHRIS_EXPECTED_TITLE", value);
    }
    let output = command.output().map_err(|error| format!("Could not start macOS Accessibility bridge: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "macOS Accessibility bridge failed. Grant Accessibility permission to Chris Studio in Privacy & Security.".to_string()
        } else {
            stderr
        });
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Err("macOS Accessibility bridge returned no data.".to_string());
    }
    Ok(stdout)
}

#[cfg(target_os = "macos")]
const INSPECT_SCRIPT: &str = r#"
ObjC.import('Foundation');
function env(name) {
  var value = $.NSProcessInfo.processInfo.environment.objectForKey(name);
  return value ? ObjC.unwrap(value) : '';
}
function safeText(fn) {
  try {
    var value = fn();
    if (value === undefined || value === null) return '';
    return String(value);
  } catch (_) { return ''; }
}
function safeBool(fn) {
  try { return Boolean(fn()); } catch (_) { return false; }
}
var systemEvents = Application('System Events');
var targetName = env('CHRIS_TARGET_APP');
var processes = systemEvents.applicationProcesses();
var process = null;
for (var i = 0; i < processes.length; i += 1) {
  var current = processes[i];
  var name = safeText(function () { return current.name(); });
  var matches = targetName ? name === targetName : safeBool(function () { return current.frontmost(); });
  if (matches) { process = current; break; }
}
if (!process) throw new Error(targetName ? 'Target application is not running.' : 'No frontmost application was found.');
var windows = process.windows();
if (!windows || windows.length === 0) throw new Error('The target application has no accessible window.');
var windowElement = windows[0];
var rows = [];
function walk(element, depth) {
  if (!element || depth > 6 || rows.length >= 180) return;
  var actions = [];
  try {
    var rawActions = element.actions();
    for (var actionIndex = 0; actionIndex < rawActions.length && actionIndex < 12; actionIndex += 1) {
      actions.push(safeText(function () { return rawActions[actionIndex].name(); }));
    }
  } catch (_) {}
  rows.push({
    index: rows.length,
    role: safeText(function () { return element.role(); }),
    title: safeText(function () { return element.title(); }) || safeText(function () { return element.name(); }),
    description: safeText(function () { return element.description(); }),
    enabled: safeBool(function () { return element.enabled(); }),
    actions: actions.filter(function (value) { return Boolean(value); })
  });
  var children = [];
  try { children = element.uiElements(); } catch (_) { children = []; }
  for (var childIndex = 0; childIndex < children.length && rows.length < 180; childIndex += 1) {
    walk(children[childIndex], depth + 1);
  }
}
walk(windowElement, 0);
JSON.stringify({
  ok: true,
  app: safeText(function () { return process.name(); }),
  window: safeText(function () { return windowElement.title(); }) || safeText(function () { return windowElement.name(); }),
  elements: rows,
  message: 'Inspected ' + rows.length + ' Accessibility element(s).',
  errorMessage: null
});
"#;

#[cfg(target_os = "macos")]
const ACTIVATE_SCRIPT: &str = r#"
ObjC.import('Foundation');
function env(name) {
  var value = $.NSProcessInfo.processInfo.environment.objectForKey(name);
  return value ? ObjC.unwrap(value) : '';
}
function safeText(fn) {
  try {
    var value = fn();
    if (value === undefined || value === null) return '';
    return String(value);
  } catch (_) { return ''; }
}
function safeBool(fn) {
  try { return Boolean(fn()); } catch (_) { return false; }
}
var systemEvents = Application('System Events');
var targetName = env('CHRIS_TARGET_APP');
var targetIndex = Number(env('CHRIS_TARGET_INDEX'));
var expectedRole = env('CHRIS_EXPECTED_ROLE');
var expectedTitle = env('CHRIS_EXPECTED_TITLE');
if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > 179) throw new Error('Invalid Accessibility element index.');
var processes = systemEvents.applicationProcesses();
var process = null;
for (var i = 0; i < processes.length; i += 1) {
  var current = processes[i];
  var name = safeText(function () { return current.name(); });
  var matches = targetName ? name === targetName : safeBool(function () { return current.frontmost(); });
  if (matches) { process = current; break; }
}
if (!process) throw new Error(targetName ? 'Target application is not running.' : 'No frontmost application was found.');
var windows = process.windows();
if (!windows || windows.length === 0) throw new Error('The target application has no accessible window.');
var elements = [];
function walk(element, depth) {
  if (!element || depth > 6 || elements.length >= 180) return;
  elements.push(element);
  var children = [];
  try { children = element.uiElements(); } catch (_) { children = []; }
  for (var childIndex = 0; childIndex < children.length && elements.length < 180; childIndex += 1) {
    walk(children[childIndex], depth + 1);
  }
}
walk(windows[0], 0);
if (targetIndex >= elements.length) throw new Error('Accessibility element index is stale. Inspect the application again.');
var selected = elements[targetIndex];
var role = safeText(function () { return selected.role(); });
var title = safeText(function () { return selected.title(); }) || safeText(function () { return selected.name(); });
if ((expectedRole && role !== expectedRole) || (expectedTitle && title !== expectedTitle)) throw new Error('Accessibility element identity changed after approval. Inspect the application again.');
if (!safeBool(function () { return selected.enabled(); })) throw new Error('The selected Accessibility element is disabled.');
var pressed = false;
try {
  var actions = selected.actions();
  for (var actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
    if (safeText(function () { return actions[actionIndex].name(); }) === 'AXPress') {
      actions[actionIndex].perform();
      pressed = true;
      break;
    }
  }
} catch (_) {}
if (!pressed) {
  try { selected.click(); pressed = true; } catch (_) {}
}
if (!pressed) throw new Error('The selected Accessibility element does not expose an AXPress or click action.');
JSON.stringify({
  ok: true,
  app: safeText(function () { return process.name(); }),
  index: targetIndex,
  role: role,
  title: title,
  message: 'Activated Accessibility element ' + targetIndex + (title ? ' (' + title + ')' : '') + '.',
  errorMessage: null
});
"#;

#[tauri::command]
pub fn computer_inspect_accessibility(app: Option<String>) -> AccessibilitySnapshot {
    let app = match validate_app(app) {
        Ok(value) => value,
        Err(error) => {
            return AccessibilitySnapshot {
                ok: false,
                app: None,
                window: None,
                elements: Vec::new(),
                message: error.clone(),
                error_message: Some(error),
            }
        }
    };
    #[cfg(target_os = "macos")]
    {
        return match run_jxa(INSPECT_SCRIPT, app.as_deref(), None, None, None) {
            Ok(output) => serde_json::from_str::<AccessibilitySnapshot>(&output).unwrap_or_else(|error| AccessibilitySnapshot {
                ok: false,
                app,
                window: None,
                elements: Vec::new(),
                message: "Could not parse Accessibility inspection result.".to_string(),
                error_message: Some(error.to_string()),
            }),
            Err(error) => AccessibilitySnapshot {
                ok: false,
                app,
                window: None,
                elements: Vec::new(),
                message: error.clone(),
                error_message: Some(error),
            },
        };
    }
    #[cfg(not(target_os = "macos"))]
    AccessibilitySnapshot {
        ok: false,
        app,
        window: None,
        elements: Vec::new(),
        message: "Accessibility inspection is available on macOS only.".to_string(),
        error_message: Some("Unsupported platform.".to_string()),
    }
}

#[tauri::command]
pub fn computer_activate_accessibility(
    index: usize,
    app: Option<String>,
    expected_role: Option<String>,
    expected_title: Option<String>,
    confirmed: bool,
) -> AccessibilityActionResult {
    if !confirmed {
        return AccessibilityActionResult {
            ok: false,
            app: None,
            index: Some(index),
            role: None,
            title: None,
            message: "Accessibility activation requires explicit confirmation.".to_string(),
            error_message: Some("Confirmation required.".to_string()),
        };
    }
    if index > 179 {
        return AccessibilityActionResult {
            ok: false,
            app: None,
            index: Some(index),
            role: None,
            title: None,
            message: "Accessibility element index is outside the inspected safety bound.".to_string(),
            error_message: Some("Invalid element index.".to_string()),
        };
    }
    let app = match validate_app(app) {
        Ok(value) => value,
        Err(error) => {
            return AccessibilityActionResult {
                ok: false,
                app: None,
                index: Some(index),
                role: None,
                title: None,
                message: error.clone(),
                error_message: Some(error),
            }
        }
    };
    #[cfg(target_os = "macos")]
    {
        return match run_jxa(ACTIVATE_SCRIPT, app.as_deref(), Some(index), expected_role.as_deref(), expected_title.as_deref()) {
            Ok(output) => serde_json::from_str::<AccessibilityActionResult>(&output).unwrap_or_else(|error| AccessibilityActionResult {
                ok: false,
                app,
                index: Some(index),
                role: None,
                title: None,
                message: "Could not parse Accessibility activation result.".to_string(),
                error_message: Some(error.to_string()),
            }),
            Err(error) => AccessibilityActionResult {
                ok: false,
                app,
                index: Some(index),
                role: None,
                title: None,
                message: error.clone(),
                error_message: Some(error),
            },
        };
    }
    #[cfg(not(target_os = "macos"))]
    AccessibilityActionResult {
        ok: false,
        app,
        index: Some(index),
        role: None,
        title: None,
        message: "Accessibility activation is available on macOS only.".to_string(),
        error_message: Some("Unsupported platform.".to_string()),
    }
}

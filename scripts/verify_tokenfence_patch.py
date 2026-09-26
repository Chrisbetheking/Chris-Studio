from __future__ import annotations

import json
import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "2.1.0"
REQUIRED = [
    "apps/desktop/package.json",
    "apps/desktop/ui/package.json",
    "apps/desktop/ui/package-lock.json",
    "apps/desktop/ui/tsconfig.json",
    "apps/desktop/ui/src/App.tsx",
    "apps/desktop/ui/src/screens/WorkspaceScreen.tsx",
    "apps/desktop/ui/src/screens/ProvidersScreen.tsx",
    "apps/desktop/ui/src/screens/AgentsScreen.tsx",
    "apps/desktop/ui/src/screens/ProjectsScreen.tsx",
    "apps/desktop/ui/src/screens/ComputerScreen.tsx",
    "apps/desktop/ui/src/screens/SkillsScreen.tsx",
    "apps/desktop/ui/src/screens/ConnectorsScreen.tsx",
    "apps/desktop/ui/src/features/files/fileProcessor.ts",
    "apps/desktop/ui/src/features/files/knowledge.ts",
    "apps/desktop/ui/src/features/projects/projectClient.ts",
    "apps/desktop/ui/src/features/github/githubClient.ts",
    "apps/desktop/ui/src/features/computer/computerClient.ts",
    "apps/desktop/ui/src/features/connectors/mcpClient.ts",
    "apps/desktop/ui/src/features/providers/providerClient.ts",
    "apps/desktop/ui/src/features/safety/scanner.ts",
    "apps/desktop/ui/src/features/tokens/optimizer.ts",
    "apps/desktop/src-tauri/build.rs",
    "apps/desktop/src-tauri/icons/32x32.png",
    "apps/desktop/src-tauri/icons/128x128.png",
    "apps/desktop/src-tauri/icons/128x128@2x.png",
    "apps/desktop/src-tauri/icons/icon.icns",
    "apps/desktop/src-tauri/icons/icon.ico",
    "apps/desktop/src-tauri/src/main.rs",
    "apps/desktop/src-tauri/Cargo.toml",
    "apps/desktop/src-tauri/tauri.conf.json",
    ".github/workflows/tokenfence-macos.yml",
    "README.md",
    "README.zh-CN.md",
    "docs/architecture/IMPLEMENTATION_STATUS_v2.1.md",
    "docs/architecture/IMPLEMENTATION_STATUS_v2.1.zh-CN.md",
    "docs/macos/SIGNING_NOTARIZATION.md",
    "docs/macos/SIGNING_NOTARIZATION.zh-CN.md",
    "docs/release/RELEASE_NOTES_v2.1.0.md",
    "docs/troubleshooting/TROUBLESHOOTING.md",
    "docs/troubleshooting/TROUBLESHOOTING.zh-CN.md",
]

for relative in REQUIRED:
    path = ROOT / relative
    assert path.is_file(), f"missing required file: {relative}"
    assert path.stat().st_size > (10 if relative.endswith("build.rs") else 40), f"unexpectedly small file: {relative}"

read = lambda relative: (ROOT / relative).read_text(encoding="utf-8")
main_rs = read("apps/desktop/src-tauri/src/main.rs")
workspace = read("apps/desktop/ui/src/screens/WorkspaceScreen.tsx")
projects = read("apps/desktop/ui/src/screens/ProjectsScreen.tsx")
computer = read("apps/desktop/ui/src/screens/ComputerScreen.tsx")
connectors = read("apps/desktop/ui/src/screens/ConnectorsScreen.tsx")
scanner = read("apps/desktop/ui/src/features/safety/scanner.ts")
store = read("apps/desktop/ui/src/app/store.ts")
registry = read("apps/desktop/ui/src/app/providerRegistry.ts")
skills = read("apps/desktop/ui/src/app/skills.ts")
processor = read("apps/desktop/ui/src/features/files/fileProcessor.ts")
provider_client = read("apps/desktop/ui/src/features/providers/providerClient.ts")
workflow = read(".github/workflows/tokenfence-macos.yml")
tsconfig = json.loads(read("apps/desktop/ui/tsconfig.json"))
package = json.loads(read("apps/desktop/ui/package.json"))
lock = json.loads(read("apps/desktop/ui/package-lock.json"))

# Native least-privilege boundary.
assert "execute_command" not in main_rs, "unsafe generic command execution remains"
assert "project_run_preset" in main_rs and "execute_project_preset" in main_rs
assert 'Command::new("git")' in main_rs and 'args(["apply", "--check"' in main_rs
assert "project_write_file" in main_rs and ".tokenfence" in main_rs
assert "computer_capture_screen" in main_rs and "computer_click" in main_rs and "computer_type_text" in main_rs
assert "computer_request_permissions" in main_rs
assert "computer_press_key" in main_rs and "This key is not in the Chris Studio allowlist" in main_rs
assert "mcp_request" in main_rs and "tools/call" in main_rs and "Explicit approval is required for MCP tool execution" in main_rs
assert "github_create_pull_request" in main_rs and "github_token_save" in main_rs
assert "trusted_host" in main_rs and "UNTRUSTED_ENDPOINT" in main_rs
assert "provider_secret_save" in main_rs and "hydrate_provider_secret" in main_rs
assert "github_release_check" in main_rs and "open_external_url" in main_rs

# Front-end execution paths.
assert "CHRIS_STUDIO_SYSTEM_PROMPT" in workspace and "identityReply" in workspace
assert "runInlineTool" in workspace and "requestComputerPermissions" in workspace
assert "formatSafePayload(scan)" in workspace
assert "reviewedHash === scan.hash" in workspace
assert "recordTokenUsage" in workspace and "dailyTokenBudget" in workspace
assert "searchKnowledge" in workspace and "formatKnowledgeContext" in workspace
assert "generateAgentPatch" in projects and "sendProviderChat" in projects
assert "git apply" not in projects  # no browser-side shell
assert "applyReviewedPatch" in projects and "createGitHubPullRequest" in projects
assert "captureScreen" in computer and "clickPointer" in computer and "typeText" in computer
assert "callMcp" in connectors and "window.confirm" in connectors
assert "loadProviderSecret" not in provider_client, "provider secret is returned to the WebView"
assert "attachments.map" in scanner and "scanText(attachment.content" in scanner
assert "apiKey: ''" in store and "token: ''" in store
assert "customSkills" in store and "knowledge" in store and "computerAudit" in store
assert registry.count("apiStyle:") >= 12, "multi-provider catalog is incomplete"
assert skills.count("builtIn: true") >= 18, "built-in skill library is too small"
assert "pdfjs-dist" in processor and "tesseract.js" in processor and "mammoth" in processor and "exceljs" in processor
assert "ocrScannedPdf" in processor and "chi_sim" in processor
assert "xlsx" not in package["dependencies"], "npm xlsx dependency remains"

# Deterministic build inputs.
assert tsconfig.get("include") == ["src/main.tsx", "src/vite-env.d.ts"]
assert lock["packages"][""]["version"] == VERSION
assert lock["packages"][""]["dependencies"] == package["dependencies"]
assert lock["packages"][""]["devDependencies"] == package["devDependencies"]
lock_text = json.dumps(lock)
for forbidden in ("applied-caas-gateway", "internal.api.openai.org", "registry.npmmirror.com"):
    assert forbidden not in lock_text, f"private/regional registry remains: {forbidden}"

# Release workflow and signing/notarization path.
assert "macos-15" in workflow and "macos-15-intel" in workflow
assert "cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml" in workflow
assert "npm ci --prefix apps/desktop/ui" in workflow
assert "APPLE_CERTIFICATE" in workflow and "APPLE_SIGNING_IDENTITY" in workflow
assert "APPLE_ID" in workflow and "APPLE_PASSWORD" in workflow and "APPLE_TEAM_ID" in workflow
assert "Install-Chris-Studio" in workflow and "com.apple.quarantine" in workflow

with (ROOT / "apps/desktop/src-tauri/Cargo.toml").open("rb") as handle:
    cargo = tomllib.load(handle)
assert cargo["package"]["version"] == VERSION
assert cargo["dependencies"]["url"] == "2"
assert cargo["dependencies"]["base64"] == "0.22"
assert "dialog-open" in cargo["dependencies"]["tauri"]["features"]
assert cargo["target"]['cfg(target_os = "macos")']["dependencies"]["keyring"]["features"] == ["apple-native"]
assert cargo["target"]['cfg(target_os = "windows")']["dependencies"]["keyring"]["features"] == ["windows-native"]

config = json.loads(read("apps/desktop/src-tauri/tauri.conf.json"))
assert config["package"]["version"] == VERSION
assert config["tauri"]["bundle"]["identifier"] == "com.tokenfence.studio"
assert config["tauri"]["windows"][0]["title"] == ""
assert config["tauri"]["windows"][0]["titleBarStyle"] == "Overlay"

for rel in ["apps/desktop/package.json", "apps/desktop/ui/package.json"]:
    pkg = json.loads(read(rel))
    assert pkg["version"] == VERSION, f"version mismatch: {rel}"

# Credential scan (patterns inside regex definitions are ignored by requiring concrete prefixes).
secret_pattern = re.compile(r"(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{30,}|AKIA[0-9A-Z]{16})")
ignored_parts = {"node_modules", "dist", "target", ".git"}
for path in ROOT.rglob("*"):
    if not path.is_file() or ignored_parts.intersection(path.parts) or path.suffix.lower() in {".png", ".ico", ".icns", ".zip"}:
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    matches = [value for value in secret_pattern.findall(text) if "A-Za-z" not in value]
    assert not matches, f"possible committed credential in {path.relative_to(ROOT)}"

print("CHRIS_STUDIO_V210_COMPLETE_UPLOAD_VERIFIED")
print(f"files={sum(1 for path in ROOT.rglob('*') if path.is_file() and not ignored_parts.intersection(path.parts))}")

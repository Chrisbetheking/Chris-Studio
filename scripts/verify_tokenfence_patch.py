from __future__ import annotations

import json
import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    "apps/desktop/package.json",
    "apps/desktop/ui/package.json",
    "apps/desktop/ui/tsconfig.json",
    "apps/desktop/ui/src/App.tsx",
    "apps/desktop/ui/src/screens/WorkspaceScreen.tsx",
    "apps/desktop/ui/src/screens/ProvidersScreen.tsx",
    "apps/desktop/ui/src/features/safety/scanner.ts",
    "apps/desktop/ui/src/features/providers/providerClient.ts",
    "apps/desktop/ui/src/features/platform/desktopClient.ts",
    "apps/desktop/src-tauri/src/main.rs",
    "apps/desktop/src-tauri/Cargo.toml",
    "apps/desktop/src-tauri/tauri.conf.json",
    ".github/workflows/tokenfence-macos.yml",
    "README.md",
    "README.zh-CN.md",
]

for relative in REQUIRED:
    path = ROOT / relative
    assert path.is_file(), f"missing required file: {relative}"
    assert path.stat().st_size > 100, f"unexpectedly small file: {relative}"

main_rs = (ROOT / "apps/desktop/src-tauri/src/main.rs").read_text(encoding="utf-8")
workspace = (ROOT / "apps/desktop/ui/src/screens/WorkspaceScreen.tsx").read_text(encoding="utf-8")
scanner = (ROOT / "apps/desktop/ui/src/features/safety/scanner.ts").read_text(encoding="utf-8")
store = (ROOT / "apps/desktop/ui/src/app/store.ts").read_text(encoding="utf-8")
app = (ROOT / "apps/desktop/ui/src/App.tsx").read_text(encoding="utf-8")
workflow = (ROOT / ".github/workflows/tokenfence-macos.yml").read_text(encoding="utf-8")
tsconfig = json.loads((ROOT / "apps/desktop/ui/tsconfig.json").read_text(encoding="utf-8"))

assert "execute_command" not in main_rs, "unsafe generic command execution remains"
assert "api.deepseek.com" in main_rs, "official DeepSeek endpoint restriction missing"
assert "provider_connection_test" in main_rs and "provider_chat" in main_rs
assert "provider_secret_save" in main_rs and "provider_secret_load" in main_rs
assert "macOS Keychain" in main_rs, "macOS secure-store reporting missing"
assert "application_menu" in main_rs and "CmdOrCtrl+N" in main_rs, "native menu missing"
assert "formatSafePayload(scan)" in workspace, "safe payload is not used"
assert "reviewedHash === scan.hash" in workspace, "edit invalidation guard missing"
assert "attachments.map" in scanner and "scanText(attachment.content" in scanner, "attachments are not scanned"
assert "apiKey: ''" in store, "provider metadata write does not strip the raw key"
assert "remove the legacy plaintext value" in app, "legacy localStorage credential scrub is missing"
assert "macos-15" in workflow, "Apple Silicon runner missing"
assert "macos-15-intel" in workflow, "Intel runner missing"
assert "Check native Rust backend" in workflow, "native Rust diagnostic step missing"
assert "npm install --prefix apps/desktop/ui" in workflow, "nested desktop UI install missing"
assert tsconfig.get("include") == ["src/main.tsx", "src/vite-env.d.ts"], "desktop typecheck scope is unsafe"

with (ROOT / "apps/desktop/src-tauri/Cargo.toml").open("rb") as handle:
    cargo = tomllib.load(handle)
assert cargo["package"]["version"] == "1.6.1"
assert cargo["target"]["cfg(target_os = \"macos\")"]["dependencies"]["keyring"]["features"] == ["apple-native"]
assert cargo["target"]["cfg(target_os = \"windows\")"]["dependencies"]["keyring"]["features"] == ["windows-native"]

config = json.loads((ROOT / "apps/desktop/src-tauri/tauri.conf.json").read_text(encoding="utf-8"))
assert config["package"]["version"] == "1.6.1"
assert config["tauri"]["bundle"]["identifier"] == "com.tokenfence.studio"

for rel in ["apps/desktop/package.json", "apps/desktop/ui/package.json"]:
    pkg = json.loads((ROOT / rel).read_text(encoding="utf-8"))
    assert pkg["version"] == "1.6.1", f"version mismatch: {rel}"

pairs = {"(": ")", "[": "]", "{": "}"}
stack: list[str] = []
in_string = False
escaped = False
for char in main_rs:
    if in_string:
        if escaped:
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == '"':
            in_string = False
        continue
    if char == '"':
        in_string = True
    elif char in pairs:
        stack.append(pairs[char])
    elif char in pairs.values():
        assert stack and stack.pop() == char, "unbalanced Rust delimiters"
assert not stack and not in_string, "unbalanced Rust source"

secret_pattern = re.compile(r"(?:sk|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{24,}|sk-[A-Za-z0-9_-]{24,}")
for path in ROOT.rglob("*"):
    if not path.is_file() or path.suffix.lower() in {".png", ".ico", ".icns", ".zip"}:
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    matches = [value for value in secret_pattern.findall(text) if "A-Za-z" not in value]
    assert not matches, f"possible committed credential in {path.relative_to(ROOT)}"

print("TOKENFENCE_COMPLETE_UPLOAD_VERIFIED")
print(f"files={sum(1 for path in ROOT.rglob('*') if path.is_file())}")

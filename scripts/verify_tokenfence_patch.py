from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    "apps/desktop/ui/src/App.tsx",
    "apps/desktop/ui/src/screens/WorkspaceScreen.tsx",
    "apps/desktop/ui/src/features/safety/scanner.ts",
    "apps/desktop/ui/src/features/providers/providerClient.ts",
    "apps/desktop/src-tauri/src/main.rs",
    "apps/desktop/src-tauri/Cargo.toml",
    "apps/desktop/src-tauri/tauri.conf.json",
]

for relative in REQUIRED:
    path = ROOT / relative
    assert path.is_file(), f"missing required file: {relative}"
    assert path.stat().st_size > 100, f"unexpectedly small file: {relative}"

main_rs = (ROOT / "apps/desktop/src-tauri/src/main.rs").read_text(encoding="utf-8")
workspace = (ROOT / "apps/desktop/ui/src/screens/WorkspaceScreen.tsx").read_text(encoding="utf-8")
scanner = (ROOT / "apps/desktop/ui/src/features/safety/scanner.ts").read_text(encoding="utf-8")

assert "execute_command" not in main_rs, "unsafe generic command execution remains"
assert "api.deepseek.com" in main_rs, "official DeepSeek endpoint restriction missing"
assert "provider_connection_test" in main_rs and "provider_chat" in main_rs
assert "formatSafePayload(scan)" in workspace, "safe payload is not used"
assert "reviewedHash === scan.hash" in workspace, "edit invalidation guard missing"
assert "attachments.map" in scanner and "scanText(attachment.content" in scanner, "attachments are not scanned"
assert "checkDeveloperIdentityQuestion" not in workspace, "developer identity chat override remains"

secret_pattern = re.compile(r"(?:sk|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{24,}|sk-[A-Za-z0-9_-]{24,}")
for path in ROOT.rglob("*"):
    if not path.is_file() or path.suffix.lower() in {".png", ".ico", ".icns", ".zip"}:
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    matches = [value for value in secret_pattern.findall(text) if "A-Za-z" not in value]
    assert not matches, f"possible committed credential in {path.relative_to(ROOT)}"

print("TOKENFENCE_PATCH_VERIFIED")
print(f"files={sum(1 for path in ROOT.rglob('*') if path.is_file())}")

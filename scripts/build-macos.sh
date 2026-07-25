#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script must run on macOS. Use GitHub Actions → Chris Studio macOS Builds and Release elsewhere."
  exit 1
fi

case "$(uname -m)" in
  arm64) TARGET="aarch64-apple-darwin" ;;
  x86_64) TARGET="x86_64-apple-darwin" ;;
  *) echo "Unsupported Mac architecture: $(uname -m)"; exit 1 ;;
esac

command -v node >/dev/null || { echo "Node.js 20–22 is required."; exit 1; }
command -v npm >/dev/null || { echo "npm is required."; exit 1; }
command -v rustup >/dev/null || { echo "Rust stable is required."; exit 1; }
command -v cargo >/dev/null || { echo "Cargo is required."; exit 1; }

rustup target add "$TARGET"
npm ci --prefix apps/desktop/ui --legacy-peer-deps --no-audit --no-fund
npm --prefix apps/desktop/ui run typecheck
npm --prefix apps/desktop/ui run test:core
npm --prefix apps/desktop/ui run build
python3 scripts/verify_tokenfence_patch.py
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
(
  cd apps/desktop
  npx --yes @tauri-apps/cli@1.6.3 build --target "$TARGET"
)

BUNDLE="$ROOT/apps/desktop/src-tauri/target/$TARGET/release/bundle"
echo
echo "Build complete."
find "$BUNDLE" -maxdepth 3 \( -name '*.dmg' -o -name '*.app' \) -print

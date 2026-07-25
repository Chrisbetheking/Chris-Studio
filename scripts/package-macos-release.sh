#!/usr/bin/env bash
set -euo pipefail

SLUG="${1:?usage: package-macos-release.sh <slug> <expected-arch>}"
EXPECTED_ARCH="${2:?usage: package-macos-release.sh <slug> <expected-arch>}"
BUNDLE_DIR="apps/desktop/src-tauri/target/release/bundle"
OUT_DIR="release/${SLUG}"
DMG_NAME="Chris-Studio-macOS-${SLUG}.dmg"
APP_ZIP_NAME="Chris-Studio-macOS-${SLUG}.app.zip"
INSTALLER_NAME="Install-Chris-Studio-${SLUG}.command"
DMG_PATH="${OUT_DIR}/${DMG_NAME}"

mkdir -p "$OUT_DIR"

APP_PATH="$(find "$BUNDLE_DIR/macos" -maxdepth 1 -type d -name '*.app' -print -quit 2>/dev/null || true)"
if [[ -z "$APP_PATH" ]]; then
  echo "No .app bundle was produced. Bundle contents:" >&2
  find "$BUNDLE_DIR" -maxdepth 4 -print 2>/dev/null || true
  exit 1
fi

APP_NAME="$(basename "$APP_PATH")"
EXECUTABLE_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP_PATH/Contents/Info.plist")"
EXECUTABLE_PATH="$APP_PATH/Contents/MacOS/$EXECUTABLE_NAME"
if [[ ! -x "$EXECUTABLE_PATH" ]]; then
  echo "The app executable is missing or not executable: $EXECUTABLE_PATH" >&2
  exit 1
fi

ACTUAL_ARCHS="$(lipo -archs "$EXECUTABLE_PATH")"
echo "Built app: $APP_PATH"
echo "Executable architectures: $ACTUAL_ARCHS"
if [[ " $ACTUAL_ARCHS " != *" $EXPECTED_ARCH "* ]]; then
  echo "Expected architecture $EXPECTED_ARCH, but found: $ACTUAL_ARCHS" >&2
  exit 1
fi

cat > "$OUT_DIR/$INSTALLER_NAME" <<'INSTALLER'
#!/bin/zsh
set -euo pipefail
APP_NAME="Chris Studio.app"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_APP=""
for candidate in "$SCRIPT_DIR/$APP_NAME" "/Volumes/Chris Studio/$APP_NAME"; do
  if [[ -d "$candidate" ]]; then SOURCE_APP="$candidate"; break; fi
done
if [[ -z "$SOURCE_APP" ]]; then
  echo "Cannot find $APP_NAME. Open the DMG and run this installer from inside it."
  read -k 1 "?Press any key to close..."
  exit 1
fi
echo "Installing $APP_NAME into /Applications..."
rm -rf "/Applications/$APP_NAME"
ditto "$SOURCE_APP" "/Applications/$APP_NAME"
xattr -rd com.apple.quarantine "/Applications/$APP_NAME" 2>/dev/null || true
open "/Applications/$APP_NAME"
echo "Chris Studio has been installed and opened."
INSTALLER
chmod +x "$OUT_DIR/$INSTALLER_NAME"

SIGNING_NOTE="Developer ID signed; notarization credentials configured"
if [[ "${CHRIS_STUDIO_SIGNED_BUILD:-false}" != "true" ]]; then
  echo "No Developer ID configured; applying an ad-hoc signature to the community app."
  codesign --force --deep --sign - "$APP_PATH"
  SIGNING_NOTE="Ad-hoc signed community build — Gatekeeper approval may still be required"
elif [[ "${CHRIS_STUDIO_NOTARIZATION_CONFIGURED:-false}" != "true" ]]; then
  SIGNING_NOTE="Developer ID signed; Apple notarization credentials were not fully configured"
fi

codesign --verify --deep --strict --verbose=2 "$APP_PATH"

STAGE="$RUNNER_TEMP/chris-studio-dmg-stage-${SLUG}"
rm -rf "$STAGE"
mkdir -p "$STAGE"
ditto "$APP_PATH" "$STAGE/$APP_NAME"
cp "$OUT_DIR/$INSTALLER_NAME" "$STAGE/$INSTALLER_NAME"
ln -s /Applications "$STAGE/Applications"

ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$OUT_DIR/$APP_ZIP_NAME"

rm -f "$DMG_PATH"
DMG_AVAILABLE=true
echo "Creating DMG with hdiutil (no Finder/AppleScript layout step)."
if ! hdiutil create \
  -volname "Chris Studio" \
  -srcfolder "$STAGE" \
  -fs HFS+ \
  -ov \
  -format UDZO \
  "$DMG_PATH"; then
  echo "First hdiutil attempt failed; printing diagnostics and retrying once." >&2
  df -h || true
  hdiutil info || true
  sleep 3
  rm -f "$DMG_PATH"
  if ! hdiutil create \
    -volname "Chris Studio" \
    -srcfolder "$STAGE" \
    -fs HFS+ \
    -ov \
    -format UDZO \
    "$DMG_PATH"; then
    DMG_AVAILABLE=false
    echo "DMG creation failed twice; publishing APP ZIP fallback." >&2
    printf '%s\n' \
      "DMG creation failed twice on the ${SLUG} runner." \
      "The architecture-verified .app.zip remains installable." \
      > "$OUT_DIR/DMG-ERROR-${SLUG}.txt"
  fi
fi

if [[ "$DMG_AVAILABLE" == "true" && "${CHRIS_STUDIO_SIGNED_BUILD:-false}" == "true" ]]; then
  if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
    echo "Signed-build flag is set, but APPLE_SIGNING_IDENTITY is empty." >&2
    exit 1
  fi
  codesign --force --sign "$APPLE_SIGNING_IDENTITY" --timestamp "$DMG_PATH"
  codesign --verify --verbose=2 "$DMG_PATH"

  if [[ "${CHRIS_STUDIO_NOTARIZATION_CONFIGURED:-false}" == "true" ]]; then
    : "${APPLE_ID_SECRET:?APPLE_ID_SECRET is required for notarization}"
    : "${APPLE_PASSWORD_SECRET:?APPLE_PASSWORD_SECRET is required for notarization}"
    : "${APPLE_TEAM_ID_SECRET:?APPLE_TEAM_ID_SECRET is required for notarization}"
    xcrun notarytool submit "$DMG_PATH" \
      --apple-id "$APPLE_ID_SECRET" \
      --password "$APPLE_PASSWORD_SECRET" \
      --team-id "$APPLE_TEAM_ID_SECRET" \
      --wait
    xcrun stapler staple "$DMG_PATH"
    xcrun stapler validate "$DMG_PATH"
  fi
fi

if [[ "$DMG_AVAILABLE" != "true" ]]; then
  SIGNING_NOTE="${SIGNING_NOTE}; DMG unavailable, use the architecture-verified APP ZIP"
fi
printf '%s\n' "$SIGNING_NOTE" > "$OUT_DIR/SIGNING-${SLUG}.txt"
printf '%s\n' "$ACTUAL_ARCHS" > "$OUT_DIR/ARCHITECTURE-${SLUG}.txt"

(
  cd "$OUT_DIR"
  checksum_files=(
    "$APP_ZIP_NAME"
    "$INSTALLER_NAME"
    "ARCHITECTURE-${SLUG}.txt"
    "SIGNING-${SLUG}.txt"
  )
  [[ -f "$DMG_NAME" ]] && checksum_files+=("$DMG_NAME")
  [[ -f "DMG-ERROR-${SLUG}.txt" ]] && checksum_files+=("DMG-ERROR-${SLUG}.txt")
  shasum -a 256 "${checksum_files[@]}" > "SHA256SUMS-${SLUG}.txt"
)

ls -lah "$OUT_DIR"

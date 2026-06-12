# Releases

TokenFence Studio ships via GitHub Releases.

## Current Release Status

- **v0.3.6** release page exists on GitHub
- **Web** build is available and stable
- **Desktop binaries** (Windows/macOS) are experimental -- Tauri packaging is experimental
- **Android APK is built via Expo EAS and available from GitHub Releases
- **iOS** is self-build/self-signing only

## Release Assets

| Platform | Asset | Format | Status |
|---|---|---|---|
| Windows | TokenFence-Studio-Windows | .exe / .msi | Experimental |
| macOS | TokenFence-Studio-macOS | .dmg / .app | Experimental |
| Android | TokenFence-Mobile-Lite-Android | .apk | Available |

## How Releases Are Built

Releases are triggered by pushing a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The `.github/workflows/release.yml` workflow runs automatically and produces:
- Web build artifacts
- Desktop app bundles (Windows + macOS via Tauri)
- Android APK (via Expo EAS)

## Desktop

The desktop app wraps the full TokenFence Studio web workspace using Tauri.

### Prerequisites (local build)

- Rust (for Tauri)
- Node.js 18-22
- Tauri CLI

### Build locally

```bash
cd apps/desktop
npm install
npm run build
```

Note: Tauri requires a static HTML export of the web app. Since the Next.js web app uses API routes and server-side features, desktop packaging currently requires a separate static build configuration. This is being addressed.

## Android

The Android app is built using Expo EAS Build.

### Prerequisites

- Expo account
- `EXPO_TOKEN` set as GitHub secret for CI
- `owner` and `extra.eas.projectId` configured in `app.json`

### EAS Profiles

- `preview-apk`: Internal APK for testing
- `production-aab`: App Bundle for Google Play
- `ios-simulator`: iOS simulator (documented only)

### Build via EAS

```bash
cd apps/android
npx eas build --platform android --profile preview-apk
```

## iOS

iOS is self-build/self-signing only. Users bring their own Apple Developer account, certificate, and provisioning profile.

To add iOS support:
1. Configure `eas.json` with iOS profile
2. Set up Apple Developer account and signing credentials
3. Build via `npx eas build --platform ios --profile production`

No `ios/` directory is included in this repository.

## Troubleshooting

### Android build does not appear in Expo

Check:
- `EXPO_TOKEN` belongs to the expected Expo account
- `app.json` has correct `owner`
- `app.json` has `extra.eas.projectId`
- `eas.json` contains `preview-apk` profile
- GitHub Actions logs include an Expo build URL

### GitHub Release has no APK

Check:
- EAS build was run with `--wait` flag
- EAS build succeeded on Expo servers
- workflow uploaded Android artifact
- `action-gh-release` included the artifact

### Desktop build has no binaries

Check:
- Tauri config `frontendDist` points to valid static assets
- Rust stable is installed
- Next.js web app produced static export (`apps/web/out`)
- Build artifacts exist under `src-tauri/target/release/bundle`

### macOS unsigned build notice

macOS builds produced by this workflow are unsigned. Users may need to allow them manually in macOS security settings (System Preferences > Security & Privacy > Open Anyway).

## Versioning

This project follows semantic versioning. Tags are expected in `v*` format.

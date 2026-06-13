# Releases

TokenFence Studio ships via GitHub Releases.

## Current Release Status

- **v0.5.22** is the current stable release
- **v0.6.0** is in development on `feature/product-ui-desktop`
- **Web** build is available and stable
- **Android APK** is built via Expo EAS and available from GitHub Releases (v0.5.22+)
- **Desktop** (Windows/macOS) is experimental -- a dedicated Vite+React renderer is in development
- **iOS** is self-build/self-signing only

## Release Assets

| Platform | Asset | Format | Status |
|---|---|---|---|
| Web | TokenFence-Studio-Web | Static site | Stable |
| Android | TokenFence-Mobile-Lite-Android | .apk | Available (v0.5.22+) |
| Windows | TokenFence-Studio-Windows | .exe / .msi | Experimental |
| macOS | TokenFence-Studio-macOS | .dmg / .app | Experimental |
| iOS | â€?| .ipa | Self-build only |

## How Releases Are Built

Releases are triggered by pushing a version tag:

```bash
git tag v0.6.0
git push origin v0.6.0
```

The `.github/workflows/release.yml` workflow runs automatically and produces:
- Web build artifacts
- Android APK (via Expo EAS, with --wait and artifact download)
- Desktop app bundles (Windows + macOS via Tauri -- experimental)

## Desktop

The desktop app is evolving from a simple Tauri web wrapper into a dedicated renderer:

- **Current**: `apps/desktop/ui/` contains a Vite + React + TypeScript desktop UI
- **Config**: `apps/desktop/src-tauri/tauri.conf.json` points to the Vite output
- **Shared**: Reuses logic from `packages/shared`

### Prerequisites (local build)

- Rust (for Tauri)
- Node.js 18-22
- Tauri CLI

### Build locally

```bash
cd apps/desktop
npm run ui:install
npm run build
```

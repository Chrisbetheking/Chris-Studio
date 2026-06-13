# Releases

TokenFence Studio ships via GitHub Releases.

## Current Release Status

- **v1.0.0-rc2** is the current product-candidate release
- **v0.5.24** is the current stable release with verified Android APK and Windows Desktop artifacts
- **Web** build is available and stable
- **Android APK** (internal release, local JDK 17 build) is available from GitHub Releases (v0.5.24)
- **Windows Desktop** (i686, unsigned experimental) portable EXE, MSI, and Setup EXE are available from GitHub Releases (v0.5.24)
- **macOS Desktop** CI pipeline is prepared, but artifacts remain unverified
- **iOS** is self-build/self-signing only

## Release Assets (v0.5.24)

| Platform | Asset | Format | Status |
|---|---|---|---|
| Web | TokenFence-Studio-Web | Static site | Stable |
| Android | TokenFence-Mobile-Lite-Android | .apk | Available (internal release, emulator-tested) |
| Windows | TokenFence-Studio-Windows | .exe / .msi | Available (unsigned i686, smoke-tested) |
| macOS | TokenFence-Studio-macOS | .dmg / .app | CI prepared (unverified) |
| iOS | — | .ipa | Self-build only |

## How Releases Are Built

Releases are triggered by pushing a version tag:

```bash
git tag v1.0.0-rc2
git push origin v1.0.0-rc2
```

## Release Notes

- Each release includes platform-specific assets where available.
- Android APKs are internal-release builds (debug signing), not Play Store production-signed.
- Windows Desktop artifacts are unsigned experimental i686 builds.
- Windows x64 is pending MSVC linker / 64-bit MinGW-w64 toolchain.
- macOS artifacts remain unverified.
- Provider calls require user-supplied API keys.
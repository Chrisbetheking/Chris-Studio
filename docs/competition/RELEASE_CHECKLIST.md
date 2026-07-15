# TokenFence Studio v1.6.0 - Release Checklist

## Pre-Release

- [x] All version fields consistent at 1.6.0
- [x] Desktop UI build passes (Vite)
- [x] Shared package typecheck passes
- [x] Web package typecheck passes
- [x] Tauri release build succeeds
- [x] Portable ZIP created with EXE + WebView2Loader.dll
- [x] No emojis in primary navigation
- [x] No secrets in committed files
- [x] .gitignore excludes *.zip, tmp-portable/
- [x] README download links point to v1.6.0
- [x] App launches without white screen
- [x] Version displayed in About screen is correct

## Artifacts

| Artifact | Path | Size |
|----------|------|------|
| Portable ZIP | TokenFence-Studio-Windows-v1.6.0-portable.zip | 6.29 MB |
| MSI Installer | apps/desktop/src-tauri/target/release/bundle/msi/TokenFence Studio_1.6.0_x64_en-US.msi | 6.56 MB |
| NSIS Setup | apps/desktop/src-tauri/target/release/bundle/nsis/TokenFence Studio_1.6.0_x64-setup.exe | 4.41 MB |

## Post-Release

- [ ] Upload portable ZIP to GitHub Release
- [ ] Create Git tag v1.6.0
- [ ] Verify README download links work (after CDN propagation)
- [ ] Test portable ZIP from clean download
- [ ] Update CHANGELOG.md

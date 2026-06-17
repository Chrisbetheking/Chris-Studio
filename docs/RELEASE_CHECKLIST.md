# TokenFence Studio Release Checklist

Use this checklist before every release to prevent source/release mismatches.

## Before Build

- [ ] `npm run guard:source` passes
- [ ] `git ls-files *.zip` returns empty (no ZIPs in git)
- [ ] `README.md` and `README.zh-CN.md` are UTF-8, LF-only, >= 80 lines
- [ ] All version strings match: `App.tsx`, `tauri.conf.json`, `Cargo.toml`, READMEs
- [ ] No raw keys/secrets in committed files

## Build

- [ ] `npm run build` passes
- [ ] `cd apps/desktop/src-tauri && cargo check` passes
- [ ] `npm run desktop:build` passes
- [ ] ZIP created: `TokenFence-Studio-Windows-vX.Y.Z-portable.zip`
- [ ] ZIP contains: `TokenFence Studio.exe` + `WebView2Loader.dll`

## Verify Public Source

- [ ] `curl` raw main and raw tag commit for these 4 files, each must show multi-line source:
  - `apps/desktop/ui/src/components/AgentPatchPanel.tsx` >= 180 lines
  - `apps/desktop/ui/src/screens/ToolboxScreen.tsx` >= 180 lines
  - `apps/desktop/ui/src/desktop-bridge.ts` >= 100 lines
  - `apps/desktop/src-tauri/src/main.rs` >= 100 lines
- [ ] No bare `###` headings in TSX files
- [ ] No mojibake/乱码 in any source file

## Release

- [ ] `npm run release:sanity -- vX.Y.Z` passes
- [ ] `gh release create` with correct tag, not prerelease, not draft
- [ ] Asset name matches: `TokenFence-Studio-Windows-vX.Y.Z-portable.zip`
- [ ] Release notes are clean, no typos, no leaked keys

## Install & Run

- [ ] Install to `E:\Apps\TokenFenceStudio\vX.Y.Z`
- [ ] Desktop shortcut points to `E:\Apps\TokenFenceStudio\vX.Y.Z\TokenFence Studio.exe`
- [ ] Launch from shortcut, process path is `E:\Apps\TokenFenceStudio\vX.Y.Z\...`
- [ ] Bottom-left shows correct version `vX.Y.Z`
- [ ] No `raw key` visible in Computer Use page
- [ ] No `invoke undefined` errors

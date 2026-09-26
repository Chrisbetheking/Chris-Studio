# Chris Studio Release Checklist

Use this checklist before every release to prevent source/release mismatches.

The macOS release path is authoritative. The retired Windows packaging flow
(`TokenFence-Studio-Windows-*.zip`, `E:\Apps\...` install targets) is no longer
produced and its assertions were removed from the guards.

## 1. Before Build

- [ ] `npm run guard:source` passes with 0 errors
      (overlay completeness, native command registration, reviewed-transaction
      safety, Unified Agent contract, Tauri major alignment, version consistency,
      developer identity, secret hygiene)
- [ ] `npm run release:sanity -- vX.Y.Z` passes with 0 errors
      (version consistency, macOS artifact names, bilingual key parity)
- [ ] `git ls-files *.zip *.dmg *.exe *.msi` returns empty (no release binaries tracked in git)
- [ ] `README.md` and `README.zh-CN.md` are UTF-8, LF-only, CR=0, >=80 lines
- [ ] Version strings agree across `apps/desktop/ui/package.json`,
      `apps/desktop/package.json`, `package.json`,
      `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/tauri.conf.json`,
      `apps/desktop/src-tauri/Cargo.lock`, the App sidebar label, and the
      AboutScreen fallback
- [ ] No raw API keys, tokens, or secrets in committed files

## 2. Local Verification

- [ ] `npm ci --legacy-peer-deps --no-audit --no-fund`
- [ ] `npm ci --prefix apps/desktop/ui --legacy-peer-deps --no-audit --no-fund`
- [ ] `npm run typecheck` (web + shared + android)
- [ ] `npm --prefix apps/desktop/ui run typecheck`
- [ ] `npm --prefix apps/desktop/ui run test:core`
- [ ] `npm --prefix apps/desktop/ui run build`
- [ ] `cargo check --locked --manifest-path apps/desktop/src-tauri/Cargo.toml`
- [ ] `cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml`

## 3. Source Overlay Verification

- [ ] `node scripts/finalize-v2.4.0-alpha.2.cjs` prints
      `CHRIS_STUDIO_V2_4_ALPHA2_OVERLAY_READY`
- [ ] `node scripts/verify-public-npm-locks.cjs` prints
      `PUBLIC_NPM_LOCKFILE_REGISTRIES_VERIFIED`
- [ ] The four overlay entry points exist:
      `apps/desktop/ui/src/App.tsx`,
      `apps/desktop/src-tauri/src/main.rs`,
      `apps/desktop/src-tauri/src/unified_agent_native.rs`,
      `apps/desktop/ui/scripts/run-core-tests.cjs`
- [ ] `apps/desktop/ui/tsconfig.json` includes `src/main.tsx` and does **not**
      include the whole `src` directory

## 4. Release Dispatch

- [ ] Run **Chris Studio macOS Builds and Release** with:
      ```text
      version: vX.Y.Z
      create_release: true
      make_latest: false      # true only for a stable release
      persist_source: true
      ```
- [ ] The `verify-desktop-ui` job passed the source guard and release sanity
      check before dependency installation
- [ ] Both matrix entries built: `Apple-Silicon` (arm64) and `Intel` (x86_64)
- [ ] Alpha tags (`-` in the version) are published as pre-releases and never
      replace the latest stable release

## 5. Artifact Verification

- [ ] Artifacts follow `scripts/package-macos-release.sh` naming:
      - `Chris-Studio-macOS-<slug>.dmg`
      - `Chris-Studio-macOS-<slug>.app.zip`
      - `Install-Chris-Studio-<slug>.command`
- [ ] Release assets match the artifacts produced by both matrix entries
- [ ] Release notes contain no typos and no leaked credentials

## 6. Install & Run

- [ ] Open the DMG and move **Chris Studio.app** into `/Applications`
- [ ] If macOS reports the community build as damaged, run:
      `sudo xattr -rd com.apple.quarantine "/Applications/Chris Studio.app"`
- [ ] Launch from `/Applications` and confirm the sidebar shows the release
      version
- [ ] Confirm no API key is visible in the Providers screen
- [ ] Confirm no `invoke undefined` errors in the console

## 7. Post-Release

- [ ] `Chris Studio CI` passes on the release commit (source-integrity,
      desktop-ui, macos-native-check)
- [ ] `gh release view vX.Y.Z` confirms assets and metadata
- [ ] In-app update check reports the new version

# TokenFence Studio macOS build and test

## What this patch adds

- Native Tauri macOS application bundles (`.app` and `.dmg`).
- Independent GitHub Actions builds for Apple Silicon and Intel Macs.
- Optional Universal macOS package.
- Native macOS application menu entries for New Session, Preferences, About and Quit.
- DeepSeek API credentials stored in macOS Keychain instead of browser localStorage.
- Runtime platform information shown on the About page.

## Build without owning a second Mac

1. Upload this patch to the repository root.
2. Open GitHub → Actions.
3. Select **TokenFence macOS Builds and Release**.
4. Choose **Run workflow** on the `main` branch.
5. After completion, download one of these artifacts:
   - `TokenFence-Studio-macOS-Apple-Silicon`
   - `TokenFence-Studio-macOS-Intel`

Apple Silicon is for M1/M2/M3/M4 and newer Apple chips. Intel is for older Intel-based Macs.

## Build locally on a Mac

From the repository root:

```bash
bash scripts/build-macos.sh
```

The output is under:

```text
apps/desktop/src-tauri/target/<target>/release/bundle/
```

## First launch of an unsigned build

Until Apple Developer signing and notarization are configured, macOS can show a security warning.

Use Finder:

1. Drag TokenFence Studio to Applications.
2. Control-click the app.
3. Choose **Open**.
4. Confirm **Open** again.

Do not disable Gatekeeper globally.

## macOS verification checklist

- Application opens from `/Applications`.
- `TokenFence Studio` appears in the macOS menu bar.
- `Command + N` creates a new safe session.
- Preferences opens Settings.
- About shows `macos` and either `aarch64` or `x86_64`.
- Saving a DeepSeek key creates a Keychain entry for service `com.tokenfence.studio`.
- Restarting the app keeps provider configuration without writing the raw key to localStorage.
- Clearing the credential removes the Keychain entry.
- Demo mode works without a network request.
- Prompt and attachment review still blocks unapproved Critical payloads.

## Signing and notarization

The build workflow intentionally works without Apple Developer secrets. For public distribution without the first-launch warning, add Apple Developer signing and notarization in a later release. Do not place certificates, passwords or App Store Connect keys in the repository.

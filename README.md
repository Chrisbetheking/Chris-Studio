# TokenFence Studio

**Languages:** [English](README.md) | [简体中文](README.zh-CN.md)  
**Help:** [Troubleshooting](docs/troubleshooting/TROUBLESHOOTING.md) | [中文故障排查](docs/troubleshooting/TROUBLESHOOTING.zh-CN.md)

![TokenFence Studio Banner](docs/images/banner.png)

> A local-first safety layer between your prompts, files, and AI providers.

TokenFence Studio is a desktop AI workspace that reviews prompts and supported text attachments **before** a provider request is sent. It helps detect sensitive information, prepare a redacted payload, make the destination explicit, and keep local history safer.

**Safe Workspace** · **Prompt Guard** · **Attachment Review** · **DeepSeek Provider** · **Local History** · **macOS Keychain**

## Download TokenFence Studio

### macOS v1.6.1

| Mac | Recommended download | Alternative |
|---|---|---|
| Apple Silicon — M1/M2/M3/M4 and newer | [Download Apple Silicon DMG](https://github.com/Chrisbetheking/tokenfence-studio/releases/latest/download/TokenFence-Studio-macOS-Apple-Silicon.dmg) | [Download APP ZIP](https://github.com/Chrisbetheking/tokenfence-studio/releases/latest/download/TokenFence-Studio-macOS-Apple-Silicon.app.zip) |
| Intel Mac | [Download Intel DMG](https://github.com/Chrisbetheking/tokenfence-studio/releases/latest/download/TokenFence-Studio-macOS-Intel.dmg) | [Download APP ZIP](https://github.com/Chrisbetheking/tokenfence-studio/releases/latest/download/TokenFence-Studio-macOS-Intel.app.zip) |

- [Open the latest GitHub Release](https://github.com/Chrisbetheking/tokenfence-studio/releases/latest)
- [Open the v1.6.1 Release page](https://github.com/Chrisbetheking/tokenfence-studio/releases/tag/v1.6.1)
- [Apple Silicon checksum](https://github.com/Chrisbetheking/tokenfence-studio/releases/latest/download/SHA256SUMS-Apple-Silicon.txt)
- [Intel checksum](https://github.com/Chrisbetheking/tokenfence-studio/releases/latest/download/SHA256SUMS-Intel.txt)

> A direct link returns `404` until the **v1.6.1 GitHub Release has been created and the matching asset has finished uploading**. Repository source files and Actions artifacts do not update the Releases page by themselves.

To identify the Mac architecture:

```bash
uname -m
```

- `arm64` means Apple Silicon.
- `x86_64` means Intel.

### Previous Windows build

- [TokenFence Studio v1.5.6 release](https://github.com/Chrisbetheking/tokenfence-studio/releases/tag/v1.5.6)

The v1.6.1 release workflow currently publishes the new macOS packages. Windows and Android packages can be added to the same release in a later multi-platform workflow.

## Current release

The current desktop line is **v1.6.1**.

- Native macOS builds for Apple Silicon and Intel Macs
- DeepSeek credentials stored in the operating-system credential store
- English and Simplified Chinese interface
- Light, dark, and system themes
- Demo Mode for offline product demonstrations
- Local redacted conversation history and safety receipts

> The v1.6.1 community macOS builds are currently unsigned. macOS may require **Control-click → Open** on first launch. Do not disable Gatekeeper globally.

## Why TokenFence Studio

AI workflows often include logs, source code, configuration files, account identifiers, emails, and API credentials. A normal chat interface sends content as soon as the user presses Send. TokenFence Studio adds a review step between the user and the provider:

```text
Prompt + supported text attachments
                  ↓
          Local safety scan
                  ↓
     Findings and risk classification
                  ↓
        Reviewed redacted payload
                  ↓
          User approval to send
                  ↓
        Explicit provider request
```

The goal is not to promise perfect data-loss prevention. The goal is to make accidental disclosure harder, visible, and reviewable.

## Core features

### Pre-send Prompt Guard

- Scans the current prompt before approval
- Detects common credentials and personal identifiers
- Supports custom sensitive terms
- Shows risk level and finding categories without exposing full secret values
- Invalidates approval when the prompt changes

### Prompt and attachment review

- Reviews the prompt and supported text attachments in one safety flow
- Invalidates approval when attachments are added or removed
- Prevents Critical raw payloads from bypassing the reviewed version when blocking is enabled
- Enforces configurable text and file scan-size limits

### Native credential protection

- macOS: stores provider credentials in **Keychain**
- Windows: stores provider credentials in the operating-system credential store
- New writes do not store raw provider keys in browser `localStorage`
- Legacy local credentials are migrated and removed from local storage when possible

### Safe local history

- Stores redacted conversation content when local history is enabled
- Keeps safety receipts as metadata rather than raw secret findings
- Re-scans conversation content before persistence as a defensive storage boundary
- Allows users to clear conversations, receipts, credentials, or the entire application state

### DeepSeek provider workspace

- Configurable DeepSeek model and official base endpoint
- Connection test with user-facing error categories
- Provider requests run through the Tauri desktop backend
- Demo Mode works without an API key or network request

### Desktop experience

- Workspace, History, Providers, Settings, and About screens
- Native macOS application menu
- `Command + N` creates a new safe session on macOS
- Runtime platform, CPU architecture, app version, and secure-store information
- English / Simplified Chinese UI
- System / light / dark themes

## Quick start for users

### macOS installation

1. Download the correct `.dmg` from the links above.
2. Open the DMG and drag **TokenFence Studio** to **Applications**.
3. On the first launch of an unsigned build, Control-click the app and choose **Open**.
4. Open **Providers**, enable Demo Mode for an offline demonstration, or save a DeepSeek API key to Keychain.
5. Return to **Workspace**, enter a test prompt, review the scan, and approve the safe payload.

Never use real secrets for a public demo. Use clearly fake test values.

### Windows installation

1. Open the previous Windows release page.
2. Download the Windows portable ZIP.
3. Extract the ZIP completely.
4. Run `tokenfence-studio.exe` from the extracted folder.

Do not run the executable from inside the ZIP preview.

## Development setup

### Requirements

- Node.js `18`–`22`
- npm `9` or newer
- Rust stable toolchain for native desktop development
- macOS desktop builds: Xcode Command Line Tools

### Clone and install

```bash
git clone https://github.com/Chrisbetheking/tokenfence-studio.git
cd tokenfence-studio
npm ci --legacy-peer-deps
```

### Run the web workspace

```bash
npm run dev
```

Open the local address printed by Vite, normally `http://localhost:3000`.

### Run the desktop UI only

```bash
npm --workspace apps/desktop run ui:dev
```

This is useful for visual work, but native provider requests and Keychain access require the Tauri desktop runtime.

### Run the native desktop app

```bash
npm run desktop:dev
```

### Build the desktop app

```bash
npm run desktop:build
```

### Build macOS bundles locally

```bash
bash scripts/build-macos.sh
```

Generated bundles are placed under:

```text
apps/desktop/src-tauri/target/<target>/release/bundle/
```

## Publish v1.6.1 through GitHub Actions

The workflow now supports building **and creating the Release in one manual run**.

1. Upload this patch to the repository root, including the hidden `.github` directory.
2. Open **Actions → TokenFence macOS Builds and Release**.
3. Click **Run workflow**.
4. Set `version` to `v1.6.1`.
5. Keep `create_release` and `make_latest` enabled.
6. Run the workflow from the `main` branch.
7. After Apple Silicon and Intel builds succeed, open the repository **Releases** page.

The Release job creates or updates tag `v1.6.1`, marks it as Latest when selected, and attaches `.dmg`, `.app.zip`, and SHA-256 files. The optional Universal job may fail without blocking the two required architecture builds.

## Configure DeepSeek

1. Open **Providers**.
2. Keep the official base endpoint unless development testing specifically requires another supported configuration.
3. Select a supported model shown by the app.
4. Paste the API key and save it to the system credential store.
5. Run **Test connection**.
6. Return to Workspace after the provider status becomes connected.

The UI stores provider metadata locally, but the raw key is saved through the native credential-store integration.

## Demo Mode

Demo Mode is intended for screenshots, product walkthroughs, judging, and offline testing.

- No provider key is required.
- No network request is sent.
- The full safety-review flow remains visible.
- Use fake sample emails, tokens, and passwords only.

Demo Mode is not evidence that a real provider connection is working. Use **Test connection** to verify a real DeepSeek configuration.

## Privacy and security model

TokenFence Studio follows these design rules:

1. Review prompts and supported text attachments before provider submission.
2. Keep the selected provider and model visible.
3. Require a new approval after relevant input changes.
4. Store provider secrets in the operating-system credential store.
5. Save redacted local history instead of raw detected secrets.
6. Avoid printing provider credentials or unredacted payloads in debug output.

### Important security limitations

- Pattern-based scanning can miss unknown or unusual secrets.
- A redacted payload still requires user review.
- Binary files, images, encrypted archives, and unsupported formats may not be inspected.
- The application cannot control how a third-party provider handles data after an approved request is sent.
- Unsigned community builds are not notarized by Apple.
- TokenFence Studio is not a replacement for enterprise DLP, endpoint security, access control, or legal/compliance review.

## Verification commands

Run from the repository root:

```bash
npm ci --legacy-peer-deps
npm --workspace apps/desktop run typecheck
npm --workspace apps/desktop run test:core
npm --workspace apps/desktop run ui:build
python3 scripts/verify_tokenfence_patch.py
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## Project structure

```text
apps/
├── web/
├── desktop/
│   ├── ui/
│   └── src-tauri/
└── android/
packages/
└── shared/
scripts/
├── build-macos.sh
└── verify_tokenfence_patch.py
docs/
├── release/
└── troubleshooting/
.github/workflows/
├── tokenfence-macos.yml
└── tokenfence-v1.6-verify.yml
```

## Troubleshooting

- [English troubleshooting guide](docs/troubleshooting/TROUBLESHOOTING.md)
- [中文故障排查](docs/troubleshooting/TROUBLESHOOTING.zh-CN.md)

## Roadmap

- Apple Developer signing and notarization
- Windows v1.6.x package in the unified release workflow
- More provider integrations
- Custom safety rules and team policies
- Document-level finding locations
- Token and cost comparisons
- Agent tool-call review

## License

MIT License.

# TokenFence Studio

**Languages:** [English](README.md) | [Simplified Chinese](README.zh-CN.md)

![TokenFence Studio Banner](docs/images/banner.png)

Local-first AI workspace with a Codex-like chat interface, Prompt Guard, Context Pack, Model Hub, smart routing, project context, and Token Budget.

**Chat Workspace** | **Prompt Guard** | **Context Pack** | **Model Hub** | **Smart Routing** | **Token Budget**

## Latest Downloads

- [Android APK](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v1.0.0/TokenFence-Studio-Android-v1.0.0-release.apk)
- [Windows Portable ZIP](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v1.0.11/TokenFence-Studio-Windows-v1.0.11-portable.zip)

> Windows users: download the portable ZIP, extract it first, then run `tokenfence-studio.exe` from the extracted folder. Do not run the EXE directly from inside the ZIP preview.

[Releases](https://github.com/Chrisbetheking/tokenfence-studio/releases) | [Update Log](CHANGELOG.md) | [Simplified Chinese](README.zh-CN.md)

---

## Overview

TokenFence Studio is a local-first AI workspace for prompt safety, model routing, file context, project context, and provider-based AI workflows.

It provides a Codex-like chat workspace with attached files, context packs, model-aware routing, token budget tracking, provider configuration, and project file context.

## Included Features

- Codex-like Chat Workspace
- File Attach and Context Pack
- Project workspace and project file context
- Agent task status area
- Prompt Guard integration
- Token Budget and Token Calculator
- Expanded Model Hub with provider/model presets
- Searchable provider-first model picker
- Model configuration status indicators
- Custom model ID and alias support
- File-type based smart model routing
- Provider API key configuration
- Provider connection testing in desktop runtime
- Toolbox dashboard with preview/working status labels
- English and Simplified Chinese UI

## Feature Matrix

| Area | Capability | Status |
|---|---|---|
| Chat Workspace | Sidebar, conversation list, composer, inspector | Working |
| File Attach | Attach files and add them to Context Pack | Working |
| Context Pack | Files, characters, estimated tokens, context summary | Working |
| Projects | Project records, desktop project scanning, selected project files | Working in desktop runtime |
| Settings | General, Providers, Model Routing, Privacy settings | Working |
| Provider Test | Provider health checks through desktop runtime | Working in desktop runtime |
| Agent Tasks | Step status and workflow state | Partial |
| Prompt Guard | Scan user input and show guard results | Working |
| Token Budget | Estimate input, files, messages, and total tokens | Working |
| Model Hub | Provider/model registry and status | Working |
| Model Picker | Provider-first model browsing and search | Working |
| Model Routing | Route by file type and capability | Working |
| Custom Models | Custom model IDs and aliases | Working |
| Toolbox | Plugin/output/media/computer-use entries | Preview / partial |
| Android | Mobile Lite build carried forward | Mobile Lite |
| macOS | Not included | Not included |
| Windows signing | Unsigned desktop build | Unsigned experimental |

## Windows Usage

Download `TokenFence-Studio-Windows-v1.0.11-portable.zip`, extract it first, then run `tokenfence-studio.exe` from the extracted folder.

Do not run the EXE directly from inside the ZIP preview.

## Known Limitations

- Windows build is unsigned experimental.
- Provider calls require user-provided API keys.
- Project scanning and provider health checks require the desktop runtime.
- Some provider model IDs may need manual adjustment.
- Android APK is carried forward from the Mobile Lite build.
- macOS is not included.
- Some Toolbox features are preview or partial.
- Agent execution is partial; full file-editing/diff workflows are future work.

## License

MIT License

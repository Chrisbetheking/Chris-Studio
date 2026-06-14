# TokenFence Studio

**Languages:** [English](README.md) | [简体中文](README.zh-CN.md)

![TokenFence Studio Banner](docs/images/banner.png)

Local-first prompt safety, document intelligence, and multi-model orchestration workspace for LLMs.

**Prompt Guard** | **Document Pipeline** | **Model Matrix** | **File-level Routing** | **Agent-ready Workflows**

## Latest Downloads

- [Android APK (recommended)](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v0.5.24/TokenFence-Mobile-Lite-Android-v0.5.24-internal-release.apk)
- [Windows Portable EXE (recommended)](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v0.5.24/tokenfence-studio-windows-v0.5.24-i686-unsigned.exe)
- [Windows MSI](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v0.5.24/TokenFence-Studio-Windows-v0.5.24-i686-unsigned.msi)
- [Windows Setup EXE](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v0.5.24/TokenFence-Studio-Windows-v0.5.24-i686-unsigned-setup.exe)

> Android APK is an internal release build verified in emulator. Windows Desktop is an unsigned experimental i686 build. Windows x64 and macOS artifacts remain pending.

[Update Log](CHANGELOG.md) | [GitHub](https://github.com/Chrisbetheking/tokenfence-studio) | [简体中文](README.zh-CN.md)

---

## Overview

TokenFence Studio is a local-first AI workspace that sits between users and large language models.

It is not just another chat UI. It builds a pre-LLM layer that can inspect, clean, protect, chunk, and route user input before it reaches a model.

## Feature Matrix

| Area | Capability | Status |
|---|---|---|
| Prompt Guard | Detect secrets, credentials, tokens, emails, phone numbers, database URLs, and risky prompt content | Working |
| Redaction | Replace sensitive values with safe placeholders | Working |
| Document Intelligence | PDF / DOCX / image OCR parsing, cleaning, and chunking | Working / experimental depending on input |
| Output Generation | Markdown, HTML, JSON, PDF, ZIP-wrapped DOCX | Verified in acceptance |
| Model Matrix | Compare multiple model responses side by side | Working |
| File-level Routing | Route files by type, risk, and task intent | Working |
| Provider Hub | OpenAI, Claude, Gemini, DeepSeek, Qwen, Kimi, Doubao, Zhipu, Ollama, LM Studio, Custom | Working; requires user keys |
| Local Runtime | Execute approved local tasks and save logs | Verified |
| Obsidian Memory | Write output notes into a test vault | Verified |
| API Connector | Test real or mock HTTP connectors | Verified |
| Computer Use | Permission-gated action flow | Experimental |
| Android Mobile Lite | Mobile-first companion app | Verified internal APK |
| Windows Desktop | Tauri desktop app | Experimental i686 build |
| i18n | English / Simplified Chinese UI and README | Working |

## Verified Workflows

The current product-candidate acceptance flow verifies:

1. Local runtime execution
2. Markdown / HTML / JSON / PDF / DOCX output generation
3. ZIP-wrapped DOCX package structure
4. Obsidian test-vault note writing and read-back
5. Provider Hub preset loading
6. Router primary / fallback rule loading
7. API Connector test flow
8. Computer Use permission gating for approved actions
9. Dangerous command blocking
10. README UTF-8 and direct download checks

## Known Limitations

- This is a release candidate, not the final v1.0 production release.
- Windows Desktop is an unsigned i686 experimental build.
- Windows x64 is blocked by missing MSVC linker / 64-bit MinGW-w64 in the current build environment.
- macOS artifact is CI-prepared but not yet verified.
- Android is Mobile Lite, not full desktop parity.
- Play Store production signing is not available.
- Provider calls require user-provided API keys.
- Computer Use full control remains experimental.

## Quick Start

```bash
git clone https://github.com/Chrisbetheking/tokenfence-studio.git
cd tokenfence-studio
npm install --legacy-peer-deps
npm run dev
```

## License

MIT License

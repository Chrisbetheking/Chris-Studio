# TokenFence Studio

**Languages:** [English](README.md) | [简体中文](README.zh-CN.md)

![TokenFence Studio Banner](docs/images/banner.png)

Local-first prompt safety, document intelligence, and multi-model orchestration workspace for LLMs.

**Prompt Guard** | **Document Pipeline** | **Model Matrix** | **File-level Routing** | **Agent-ready Workflows**

## Latest Downloads

- [Android APK](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v1.0.0/TokenFence-Studio-Android-v1.0.0-release.apk)
- [Windows Portable ZIP](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v1.0.3/TokenFence-Studio-Windows-v1.0.3-portable.zip)

> Android APK is an internal release build verified in emulator. Windows Desktop is an unsigned experimental i686 build. Windows x64 and macOS artifacts remain pending.

[Update Log](CHANGELOG.md) | [GitHub](https://github.com/Chrisbetheking/tokenfence-studio) | [简体中文](README.zh-CN.md)

---

## Overview

TokenFence Studio is a local-first AI workspace that sits between users and large language models.

It builds a pre-LLM layer that can inspect, clean, protect, chunk, and route user input before it reaches a model.

## Feature Matrix

| Area | Capability | Status |
|---|---|---|
| Prompt Guard | Detect secrets, credentials, tokens, emails, phone numbers, database URLs, and risky prompt content | Working |
| Redaction | Replace sensitive values with safe placeholders | Working |
| Document Intelligence | PDF / DOCX / image OCR parsing, cleaning, and chunking | Working / experimental |
| Output Generation | Markdown, HTML, JSON, PDF, ZIP-wrapped DOCX | Verified |
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
2. Markdown output generation
3. HTML output generation
4. JSON output generation
5. PDF output generation
6. ZIP-wrapped DOCX output generation
7. Obsidian test-vault note writing and read-back
8. Provider Hub preset loading
9. Router primary / fallback rule loading
10. API Connector test flow
11. Computer Use permission gating for approved actions
12. Dangerous command blocking
13. README UTF-8 checks
14. Direct download link checks

## Known Limitations

- This is a release candidate, not the final v1.0 production release.
- Windows Desktop is an unsigned i686 experimental build.
- Windows x64 is blocked by missing MSVC linker / 64-bit MinGW-w64.
- macOS artifact is CI-prepared but not yet verified.
- Android is Mobile Lite, not full desktop parity.
- Play Store production signing is not available.
- Provider calls require user-provided API keys.
- Computer Use full control remains experimental.

## Platform Support

| Platform | Status | Notes |
|---|---|---|
| Web | Available | Full Next.js workspace |
| Android | Available | Expo React Native Mobile Lite |
| Windows Desktop | Experimental | Tauri wrapper, unsigned i686 |
| macOS Desktop | Experimental | CI prepared but artifact unverified |
| iOS | Self-build only | Users sign with their own Apple Developer account |

## Quick Start

```bash
git clone https://github.com/Chrisbetheking/tokenfence-studio.git
cd tokenfence-studio
npm install --legacy-peer-deps
npm run dev
```

## API Keys

This project requires user-provided API keys.

Supported providers include OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Qwen, Kimi, Doubao, Zhipu, Ollama, LM Studio, and custom OpenAI-compatible endpoints.

## Project Structure

| Directory | Description |
|---|---|
| apps/web | Next.js Web workspace |
| apps/android | Expo React Native Android Mobile Lite |
| apps/desktop | Tauri desktop wrapper |
| packages/shared | Cross-platform shared logic |
| docs | Product documentation |

## License

MIT License

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

**TokenFence Studio** is a local-first AI workspace that sits between users and large language models.

It is not trying to be just another chat UI. The main idea is to build a small pre-LLM layer that can inspect, clean, protect, chunk, and route user input before it reaches a model.

```
Raw prompt / uploaded files
    -> Document Intelligence Pipeline
    -> Prompt Guard + Redaction
    -> Intent detection
    -> Context compression
    -> Model Matrix / file-level routing
    -> Final prompt preview
    -> LLM provider or local model
```

The goal is to make LLM usage safer, cleaner, and easier to debug.

---

## Why TokenFence?

Most AI tools focus on model access.

TokenFence Studio focuses on what happens **before** model access:

- Does this prompt contain secrets or private data?
- Can this PDF, DOCX, log, or Markdown file be cleaned first?
- Can noisy headers, page numbers, and repeated text be removed?
- Can the document be turned into RAG-ready chunks?
- Which model should handle this task or file?
- Should this file go to a cloud model, a local model, or a safer redacted workflow?
- Can several models be compared side by side?

That makes TokenFence closer to a **pre-LLM safety and orchestration layer** than a normal ChatGPT-style interface.

---


## Core Features

### Prompt Guard
Scan prompts locally before they are sent to a model. Detects API keys, emails, phone numbers, database URLs, access tokens, secret assignments, Chinese personal identifiers, and credential-like leaks.

### Redaction Engine
Replace detected sensitive values with safe placeholders while keeping the task understandable.

### Document Intelligence Pipeline
Turn uploaded or pasted files into clean, safe, model-ready context:
- PDF text extraction (text-based PDFs)
- DOCX raw text extraction
- Local image OCR through Tesseract.js
- Noise cleaning and RAG-ready chunk generation
- Export as Markdown / JSON

### Model Matrix
Send the same prompt to multiple models, compare responses, latency, token usage, and risk status. Route each file separately when processing multiple files.

### File-level Model Routing
Different files get different models based on type and risk. Coding files go to coding models, secrets go to local models, long documents get long-context models.

### Multi-provider Support
Supports global, China-based, router, and local providers. Bring your own API key. No vendor lock-in.

Current presets: OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Volcengine/Doubao, Alibaba/Qwen, Baidu Qianfan, Kimi/Moonshot, Zhipu GLM, MiniMax, SiliconFlow, OpenRouter, Groq, Together AI, 302.AI, ModelScope, Ollama, LM Studio, and custom OpenAI-compatible endpoints.

### Context Compression
Compress long prompts or document context while keeping the user goal, constraints, and important details.

### Local Archive
Store sanitized runs locally. No cloud database required.

### Agent Context Packs
Prepare reusable context bundles for AI coding and agent workflows.

### Shared TypeScript Package
Cross-platform logic in `packages/shared` -- guard scanning, provider presets, file routing, fallback chains, budget routing, citation panel.

---

## Platform Support

| Platform | Status | Notes |
|---|---|---|
| Web | Available now | Full Next.js workspace |
| Android | Available now | Expo React Native Mobile Lite. APK available from GitHub Releases. |
| Windows Desktop | Experimental | Tauri wrapper, packaging in progress |
| macOS Desktop | Experimental | Tauri wrapper, packaging in progress |
| iOS | Self-build only | Users sign with their own Apple Developer account |
---

## Quick Start

### Web Workspace

```bash
git clone https://github.com/Chrisbetheking/tokenfence-studio.git
cd tokenfence-studio
npm install --legacy-peer-deps
npm run dev
```

Open `http://localhost:3000`.

### Android Mobile Lite

```bash
cd apps/android
npm install
npm run start
```

Scan the QR code with Expo Go, or connect an Android device / emulator.

### Desktop App

```bash
cd apps/desktop
npm install
npm run dev
```

Requires Rust and Tauri CLI. See [docs/RELEASES.md](./docs/RELEASES.md).

### API Keys

Create a `.env.local` file or save keys in the Provider settings page.

```env
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
DEEPSEEK_API_KEY=
VOLCENGINE_API_KEY=
DASHSCOPE_API_KEY=
QIANFAN_API_KEY=
MOONSHOT_API_KEY=
ZHIPU_API_KEY=
MINIMAX_API_KEY=
SILICONFLOW_API_KEY=
OPENROUTER_API_KEY=
GROQ_API_KEY=
TOGETHER_API_KEY=
THREE_ZERO_TWO_API_KEY=
MODELSCOPE_API_KEY=
```

If you only use Ollama or LM Studio, cloud API keys are optional.

---

## Project Structure

This repository is organized as a cross-platform monorepo:

```
tokenfence-studio/
  apps/
    web/          Next.js web workspace (full TokenFence Studio)
    android/      Expo React Native Android Mobile Lite
    desktop/      Tauri desktop wrapper (Windows + macOS)
  packages/
    shared/       Shared TypeScript logic (guard, providers, routing)
  docs/
    changelog/    Per-update development notes
    images/       Banner and screenshots
  examples/       Sample documents for testing
  cli/            CLI tooling (planned)
  mcp/            MCP integrations (planned)
  .github/
    workflows/    CI/CD (release, lint)
  package.json    Root workspace config
  tsconfig.base.json
```

| Package | Description |
|---|---|
| `apps/web` | Full Next.js web workspace with Chat, Guard, Document Pipeline, Model Matrix, Provider Settings, Archive, and Agent Packs |
| `apps/android` | Android Mobile Lite app built with Expo / React Native -- prompt scanning, model routing, sanitized local archive |
| `apps/desktop` | Tauri desktop wrapper for Windows and macOS (experimental) |
| `packages/shared` | Pure TypeScript logic reused across platforms -- guard scanning, provider presets, file routing, storage helpers |

---

## Project Status

### Available Now

- Responsive Web Workspace (Chat, Guard, Document Pipeline, Model Matrix, Provider Settings, Archive, Agent Packs)
- Android Mobile Lite App (prompt scanning, model routing, sanitized local archive)
- Tauri Desktop Wrapper (Windows + macOS, experimental)
- Multi-provider Settings (global, China-based, router, and local models)
- Prompt Guard with sensitive data scanning
- Redaction Engine with structured placeholders
- Policy Profiles for risk-level control
- Context Compression
- Model Matrix for multi-model comparison
- File-level Model Routing
- Document Intelligence Pipeline (PDF text extraction, DOCX parsing, local image OCR, noise cleaning, chunk generation)
- Local Sanitized Archive
- Agent Context Pack prototype
- Shared TypeScript Logic Package (`packages/shared`)
- GitHub Releases CI/CD Workflow

### Experimental / In Progress

- Provider Fallback Chains
- Cost and Latency Budget Router
- Source Citation Panel (prototype)
- Desktop Storage Path Selection
- File-type Model Routing Rules
- Desktop static renderer packaging (in progress on feature/agent-workspace-v050)

### Planned

- Scanned-PDF Page OCR with PDF-to-image rendering
- Layout-aware Parsing for Complex PDFs and Tables
- Search Grounding Router
- Judge Model for Merging Multi-model Outputs
- MCP Marketplace
- VS Code Extension
- Browser Extension
- Local Vector Search
- Team Workspace
- Plugin / Skill Marketplace

---

## Architecture

```
User input / uploaded files
         |
         v
Document Intelligence Pipeline
         |-- Parser
         |-- Cleaner
         |-- Chunker
         |-- Metadata builder
         |
         v
Prompt Guard
         |-- Scanner
         |-- Redactor
         |-- Risk Engine
         |-- Compressor
         |
         v
Model Matrix / Router
         |-- Prompt-level multi-model run
         |-- File-level model routing
         |-- Local model preference for sensitive files
         |-- Future judge model / fallback chain
         |
         v
Provider Layer
         |-- Global providers
         |-- China-based providers
         |-- Router providers
         |-- Local providers
         |
         v
Response / comparison / archive / exported context
```

---



## Showcase

| GitHub README | Latest Downloads | Chinese README | GitHub Release |
|---|---|---|---|
| ![GitHub README](docs/assets/screenshots/github-readme-home.png) | ![Latest Downloads](docs/assets/screenshots/github-latest-downloads.png) | ![Chinese README](docs/assets/screenshots/github-readme-zh-cn.png) | ![GitHub Release](docs/assets/screenshots/github-release-current.png) |


> Desktop UI screenshots are being updated. The Windows portable exe has been smoke-tested locally.


---
## Releases

- **v1.0.0-rc2** is the current product candidate release -- includes Android APK in GitHub Release Assets
- **Recommended Android APK**: `TokenFence-Mobile-Lite-Android-v0.5.24-internal-release.apk` (57.3 MB, standalone, no Metro required). Available from [v1.0.0-rc2 Release](https://github.com/Chrisbetheking/tokenfence-studio/releases/tag/v1.0.0-rc2) and [v0.5.24 Release](https://github.com/Chrisbetheking/tokenfence-studio/releases/tag/v0.5.24). Debug APK also available for traceability.
- **Windows**: Desktop package available (MSI 6.2 MB, NSIS installer 4.2 MB), built locally with Tauri 2. **macOS**: Experimental, GitHub Actions CI build in progress.
- **iOS** is self-build/self-signing only

See [docs/RELEASES.md](./docs/RELEASES.md) for current release status and troubleshooting.

---

## Update Log

Recent updates and development notes are available in the [Update Log](./docs/changelog/README.md).

---

## Contributing

Issues and pull requests are welcome.

Ideas that are especially helpful:
- Better document parsers
- Scanned-PDF OCR and vision model integrations
- New provider adapters
- Better detection rules
- Search grounding integrations
- File routing heuristics
- Model comparison workflows
- Agent / MCP use cases

---

## Author

Created by **ChrisWang**.

Building practical AI infrastructure.

---

## License

MIT License



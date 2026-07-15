# TokenFence Studio v1.6.0 - Product Overview

## What is TokenFence Studio?

TokenFence Studio is a local-first AI workspace for Windows desktop that prioritizes
data safety. It provides a ChatGPT/Codex-like chat interface with built-in prompt
scanning, content redaction, and multi-provider model routing -- all running locally
on your machine.

## Core Value Proposition

- **Local-first**: All data stays on your device. No telemetry, no cloud dependency.
- **Prompt Guard**: Automatic detection of sensitive content (API keys, tokens, emails,
  phone numbers, credentials, database URLs, Chinese ID numbers) in outgoing prompts.
- **Redaction**: Automatically masks detected sensitive content before it leaves your
  machine.
- **Risk Scoring**: Classifies prompts as safe/low/medium/high risk.
- **Multi-Provider**: Configure OpenAI, Claude, Gemini, DeepSeek, Qwen, Kimi, Doubao,
  Zhipu, xAI, Mistral, Cohere, Perplexity, Groq, Together -- plus local providers
  Ollama and LM Studio.
- **Model Routing**: Automatically routes files by type to appropriate models.
- **Context Pack**: Attach files and see token estimates before sending.
- **Dark/Light Theme**: Full theme support with system preference detection.
- **Bilingual**: English and Simplified Chinese UI.

## Architecture

```
apps/desktop/ui/      -- React + Vite desktop frontend
apps/desktop/src-tauri/ -- Tauri v2 Rust backend
packages/shared/       -- Shared logic (providers, guard, i18n, model registry)
```

## Current Status

| Feature | Status |
|---------|--------|
| Chat Workspace | Working |
| Prompt Guard / Scanner | Working |
| Content Redaction | Working |
| Risk Scoring | Working |
| Multi-Provider Config | Working |
| Provider Health Check | Working |
| File Attachment | Working |
| Context Pack / Token Estimate | Working |
| Model Routing by File Type | Working |
| Conversation Persistence | Working |
| Theme (Light/Dark/System) | Working |
| i18n (EN / zh-CN) | Working |
| Guard Dashboard | Working |
| Settings | Preview |
| Projects | Preview |
| Agent Lab | Preview |
| Computer Use | Needs Runtime |
| History Browser | Partial (data persists, UI pending) |

## Distribution

- **Windows Portable ZIP**: Ready for distribution
- **MSI Installer**: Available (unsigned, experimental)
- **NSIS Setup EXE**: Available (unsigned, experimental)
- Android APK: Previous build available
- macOS: Not yet available

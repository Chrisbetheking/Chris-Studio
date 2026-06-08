# TokenFence Studio

<p align="center">
  <img src="./docs/images/banner.png" alt="TokenFence Studio" width="100%">
</p>

<p align="center">
  <strong>Local-first prompt safety, document intelligence, and multi-model orchestration workspace for LLMs.</strong>
</p>

<p align="center">
  Prompt Guard · Document Pipeline · Model Matrix · File-level routing · Agent-ready workflows
</p>

<p align="center">
  <a href="./README.zh-CN.md">中文</a> ·
  <a href="./docs/changelog/README.md">Update Log</a> ·
  <a href="https://github.com/Chrisbetheking/tokenfence-studio">GitHub</a>
</p>

---

## Overview

**TokenFence Studio** is an early-stage local-first AI workspace that sits between users and large language models.

It is not trying to be just another chat UI. The main idea is to build a small pre-LLM layer that can inspect, clean, protect, chunk, and route user input before it reaches a model.

```text
Raw prompt / uploaded files
   ↓
Document Intelligence Pipeline
   ↓
Prompt Guard + Redaction
   ↓
Intent detection
   ↓
Context compression
   ↓
Model Matrix / file-level routing
   ↓
Final prompt preview
   ↓
LLM provider or local model
```

The goal is to make LLM usage a bit safer, cleaner, and easier to debug.

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

## Screenshots to add

The project is still moving quickly. Recommended screenshots for the README / LinkedIn:

1. `docs/images/chat.png` - Chat workspace with pre-flight safety report.
2. `docs/images/guard.png` - Prompt Guard and final prompt preview.
3. `docs/images/model-matrix.png` - Model Matrix with multiple models and file-level routing.
4. `docs/images/document-pipeline.png` - Document Pipeline report and chunks export.
5. `docs/images/providers.png` - Provider settings with global, China-based, router, and local models.

---

## Core Features

### Prompt Guard

Scan prompts locally before they are sent to a model.

Current detection rules cover common sensitive data patterns such as API keys, emails, phone numbers, database URLs, access tokens, secret assignments, Chinese personal identifiers, and credential-like leaks.

### Redaction Engine

Replace detected sensitive values with safe placeholders while keeping the task understandable.

```text
john@example.com → [EMAIL_1]
sk-xxxxxxx       → [OPENAI_KEY_1]
```

### Document Intelligence Pipeline

TokenFence now has a first document-processing workflow.

It is designed to turn uploaded or pasted files into clean, safe, model-ready context:

```text
File Upload
  → PDF / DOCX / Image / Log / Markdown / Code parsing
  → PDF / DOCX text extraction or image OCR
  → Noise cleaning
  → Sensitive data scanning
  → Redaction-aware risk report
  → RAG-ready chunk generation
  → File-level model routing
  → Export as Markdown / JSON
```

Current prototype capabilities:

- Extract text from text-like files, logs, Markdown, JSON, and code files.
- PDF text extraction through a dedicated server-side parser.
- DOCX text extraction through a dedicated DOCX parser.
- Local image OCR through Tesseract.js before model execution.
- Remove common noise such as blank lines, page numbers, repeated page headers, repeated footers, and duplicated paragraphs.
- Generate `chunks.json` with file name, section, chunk id, risk level, token estimate, and suggested route.
- Export cleaned Markdown for RAG, agent workflows, or manual review.

### Model Matrix

Run one task across multiple models, or assign different files to different models.

Current capabilities include:

- Send the same prompt to multiple selected models.
- Compare responses, latency, token usage, and risk status.
- Paste or process multiple files and route each file separately.
- Choose a model per file.
- Mark files as public, private, or secret.
- Route high-risk or secret-like files toward local models.

### File-level Model Routing

Different files may need different routes.

| File | Recommended route |
|---|---|
| `src/app/page.tsx` | Coding-friendly model |
| `README.md` | Writing / documentation model |
| `error.log` | Long-context model |
| `.env` or secret config | Local model only |
| `report.pdf` | Long-context model after cleaning/chunking |
| `sample-image.png` | Local OCR first, then route extracted text |

### Multi-provider Support

TokenFence Studio supports global, China-based, router, and local providers through native or OpenAI-compatible adapters.

Current presets include:

- OpenAI
- Anthropic Claude
- Google Gemini
- DeepSeek
- Volcengine Ark / Doubao
- Alibaba Cloud Bailian / Qwen
- Baidu Qianfan
- Kimi / Moonshot
- Zhipu GLM
- MiniMax
- SiliconFlow
- OpenRouter
- Groq
- Together AI
- 302.AI
- ModelScope
- Ollama
- LM Studio
- Custom OpenAI-compatible endpoint

Bring your own API key. No vendor lock-in.

### Context Compression

Compress long prompts or document context while keeping the user goal, constraints, file structure, and important details.

### Local Archive

Store sanitized runs locally. No cloud database is required by default.

### Agent Context Packs

Prepare reusable context bundles for AI coding and agent workflows such as Claude Code, Codex, MCP-based agents, and OpenHands-style workflows.

---

## Examples

Example assets are included under:

```text
examples/document-intelligence/
├── README.md
├── sample.pdf
├── sample.docx
├── sample-image.png
├── before-cleaning.txt
├── after-cleaning.md
└── chunks.json
```

These are intentionally small. They are meant to show the expected input/output shape rather than act as benchmark data.

---

## Planned: Search Grounding

Search grounding is planned as a future module.

The idea is to let TokenFence decide whether a request needs live web information, safely prepare the search query, retrieve sources, and inject grounded context before model execution.

Planned search providers / modes:

- Brave Search
- Tavily
- Gemini Grounding with Google Search
- Kimi Web Search
- Baidu search via SERP provider
- Custom search provider

Search will be controlled by the same safety layer:

- Block searching secrets
- Redact private search queries
- Choose Global / China / Auto region
- Show sources before final answer generation

---

## Architecture

```text
User input / uploaded files
        │
        ▼
Document Intelligence Pipeline
        ├── Parser
        ├── Cleaner
        ├── Chunker
        └── Metadata builder
        │
        ▼
Prompt Guard
        ├── Scanner
        ├── Redactor
        ├── Risk Engine
        └── Compressor
        │
        ▼
Model Matrix / Router
        ├── Prompt-level multi-model run
        ├── File-level model routing
        ├── Local model preference for sensitive files
        └── Future judge model / fallback chain
        │
        ▼
Provider Layer
        ├── Global providers
        ├── China-based providers
        ├── Router providers
        └── Local providers
        │
        ▼
Response / comparison / archive / exported context
```

---

## Quick Start

```bash
git clone https://github.com/Chrisbetheking/tokenfence-studio.git
cd tokenfence-studio
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

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

```text
src/
 ├── app/
 │   └── api/
 │       ├── chat/
 │       ├── compare/
 │       ├── documents/
 │       └── guard/
 ├── components/
 │   ├── chat-desk.tsx
 │   ├── compare-desk.tsx
 │   ├── document-pipeline-desk.tsx
 │   └── guard-desk.tsx
 └── lib/
     ├── core/
     ├── document/
     ├── providers/
     ├── skills/
     └── vault/

mcp/
cli/
docs/
examples/
```

---

## Roadmap

### Current prototype

- [x] Chat workspace
- [x] Provider settings
- [x] Prompt Guard
- [x] Redaction engine
- [x] Context compression
- [x] Policy profiles
- [x] Model Matrix for multi-model comparison
- [x] File-level model routing prototype
- [x] Document Intelligence Pipeline prototype
- [x] Local archive
- [x] Agent context pack prototype

### Planned

- [x] PDF text extraction for text-based PDFs
- [x] DOCX raw text extraction
- [x] Local image OCR through Tesseract.js
- [ ] Scanned-PDF page OCR with PDF-to-image rendering
- [ ] Layout-aware parsing for complex PDFs and tables
- [ ] Search Grounding router
- [ ] Judge model for merging multi-model outputs
- [ ] Provider fallback chains
- [ ] Cost and latency budget router
- [ ] Source citation panel
- [ ] MCP marketplace
- [ ] VS Code extension
- [ ] Browser extension
- [ ] Local vector search
- [ ] Team workspace

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

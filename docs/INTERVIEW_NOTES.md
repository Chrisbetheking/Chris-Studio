# TokenFence Studio - Interview Notes

## One-line description

TokenFence Studio is a local-first pre-LLM workspace for prompt safety, document cleaning, model routing, and multi-model orchestration.

## What problem it tries to solve

In many LLM applications, raw prompts or files are sent directly to cloud models. That can create several problems:

- API keys, database URLs, emails, or other private data may be leaked.
- Long documents often contain noisy page headers, footers, page numbers, and repeated text.
- Different tasks and files may need different models.
- Agent workflows need cleaner context than raw chat history.

TokenFence Studio puts a processing layer before the model call.

## Current modules

### Prompt Guard

Scans user input before sending it to a model. It can detect common secrets and private information, then produce a safer final prompt.

### Document Intelligence Pipeline

Turns uploaded or pasted documents into cleaner model-ready context.

Current prototype steps:

1. Parse PDF, DOCX, text, Markdown, logs, JSON, and code files.
2. Clean repeated page noise and duplicated content.
3. Scan the cleaned text for sensitive values.
4. Generate RAG-ready chunks.
5. Attach metadata such as file name, chunk id, section, risk level, and suggested model route.
6. Export Markdown and `chunks.json`.

### Model Matrix

Allows one task to run across multiple models, or different files to be assigned to different models.

### Provider Settings

Supports global, China-based, router, and local providers. Users bring their own API keys.

### Agent Context Pack

Generates compact project context for tools such as Claude Code, Codex, MCP-based agents, and OpenHands-style workflows.

## Technical focus

- Next.js app router
- TypeScript
- Local-first provider key storage
- Prompt scanning and redaction
- Context compression
- File-level routing heuristics
- Multi-provider model abstraction

## Current limitations

- PDF extraction is best-effort and not layout-aware yet.
- DOCX extraction is basic but works for simple documents.
- Image OCR is not included yet; it is represented as a placeholder flow.
- Model routing is rule-based and will need stronger evaluation.

## Next steps

- Improve document parsing quality.
- Add real OCR / vision model support.
- Add search grounding with citations.
- Add judge model for multi-model result merging.
- Add cost and latency-aware routing.

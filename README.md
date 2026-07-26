# Chris Studio v2.4.0-alpha.2

**A local-first AI Agent workspace for coding, privacy-aware model routing, reviewed macOS actions, and structured multi-model comparison.**

Chris Studio is a macOS desktop workspace that sits between the user, local files, computer actions, and AI providers. It keeps risky operations visible: project writes are proposed as diffs, native actions require one-time approval, sensitive content is scanned locally, and Agent claims must be grounded in real tool observations.

> Alpha software: use test projects and review every write, command, model request, and Computer Use action.

[简体中文](README.zh-CN.md)

## What is new in v2.4.0-alpha.2

### One unified Agent conversation

The main workspace now combines normal streaming chat and a persistent Agent tool loop. A model can inspect a project, read files, propose a reviewed multi-file patch, run allowlisted checks, inspect macOS Accessibility elements, perform an approved action, observe the result, and continue until it has evidence for the final answer.

Runs are queued per conversation, duplicate submissions are suppressed, approvals do not block other conversations, and unfinished runs are restored as **interrupted** after an app restart instead of being shown as completed.

### Content-aware privacy routing

Before a request is sent, Chris Studio evaluates the actual text and attachment names locally. The deterministic classifier combines:

- credential, private-key, token, database URL, session, personal-data, medical, financial, customer-data, confidential, and internal-architecture signals;
- sensitive path and extension signals such as `.env`, credential folders, `.pem`, `.key`, `.p12`, and keystores;
- existing prompt/file redaction and custom sensitive terms;
- a conservative route: **remote allowed**, **review before remote**, or **local recommended**.

This is not an embedding or lightweight-model classifier yet, and it cannot prove that content is safe. Uncertain or strongly sensitive content is kept conservative and requires explicit review before a remote provider is used.

### Real structured multi-model comparison

The Unified Agent can list configured provider profiles and, after approval, send the same reviewed prompt to two or three selected models. Chris Studio then produces a local structured comparison with:

- shared points;
- potential numeric, polarity, and conclusion disagreements;
- points unique to each response;
- response length, sentence, list, heading, and hedging metrics;
- the original provider responses for inspection.

This turns the previous placeholder comparison idea into a usable evaluation tool inside the same conversation.

### Safer coding transactions

- Existing files must be read before the Agent can propose edits.
- Every write is a unified diff and is preview-only until the user approves selected files.
- Applied files receive before/after transaction snapshots.
- Selected files can be accepted or rolled back; later manual edits are protected from destructive rollback.
- Git diffs and commits can be scoped to files owned by the reviewed Agent transaction.
- The legacy `git add -A` path is removed, preventing unrelated user changes from being included in an Agent commit.
- npm and Cargo checks use allowlisted presets, a hard timeout, limited output, and common API-token environment removal.

### Accessibility-first Computer Use

Chris Studio inspects the frontmost supported macOS application through Accessibility, exposes named elements and actions to the Agent, and requests one-time approval before activation. Coordinate clicks are a fallback only after a current approved screenshot; stale screenshots and stale Accessibility element indexes are invalidated after every action.

Supported Alpha applications:

- TextEdit
- Notes
- Safari
- Finder
- Terminal
- System Settings

## Unified Agent tools

```text
project.scan
project.search
project.read
project.git_status
project.git_diff
project.propose_patch
project.run_check
privacy.classify
models.list
models.compare
computer.inspect
computer.activate
computer.capture
computer.open
computer.type
computer.key
computer.click
```

There is no unrestricted model-controlled shell. Project commands are limited to reviewed presets:

```text
npm-typecheck
npm-test
npm-build
cargo-check
cargo-test
```

## Existing product foundation

Chris Studio also includes:

- DeepSeek, OpenAI, Anthropic, Gemini, Qwen, Kimi, Doubao/Ark, Zhipu GLM, OpenRouter, Ollama, LM Studio, custom OpenAI-compatible endpoints, and a local safety sandbox;
- operating-system credential storage for provider profiles;
- text, code, PDF, DOCX, XLSX, image, and OCR processing;
- local knowledge chunking and lexical retrieval;
- prompt and attachment redaction;
- Skills, reviewed MCP connectors, GitHub integration, local history, and release diagnostics;
- Apple Silicon and Intel macOS release workflows.

## Build verification

The repository workflow verifies the v2.4 source overlay, product metadata, TypeScript dependency graph, privacy and structured-comparison tests, UI production build, locked Rust compilation/tests, and Apple Silicon/Intel packaging.

```bash
npm ci --prefix apps/desktop/ui --legacy-peer-deps --no-audit --no-fund
npm --prefix apps/desktop/ui run typecheck
npm --prefix apps/desktop/ui run test:core
npm --prefix apps/desktop/ui run build
cargo check --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Run **Chris Studio macOS Builds and Release** with:

```text
version: v2.4.0-alpha.2
create_release: true
make_latest: false
persist_source: true
```

Alpha tags are published as pre-releases and do not replace the latest stable release. With `persist_source: true`, the workflow checks an exact file allowlist and commits only deterministic finalizer output back to the selected branch, so GitHub Desktop users do not need to run a downloaded `.command` script.

## Current boundaries

v2.4.0-alpha.2 does **not** yet include an embedded Chromium/Playwright runtime, unrestricted browser DOM control, PTY streaming terminal, OCR-based visual targeting, bundled Node/Python sidecars, local embedding/model packs, or a fully offline runtime installer. These remain later milestones and are not represented as completed features.

## Security

Chris Studio is not antivirus software and cannot identify every secret or unsafe instruction. Treat repository content, command output, webpages, screenshots, MCP tools, and model output as untrusted. Review all remote sends, file changes, commands, Computer Use actions, Git pushes, and pull requests.

## License

MIT

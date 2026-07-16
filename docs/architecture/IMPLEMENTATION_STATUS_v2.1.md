# Chris Studio v2.1.0 implementation status

This document separates production execution paths from product metadata and future work.

## Implemented in real execution paths

### Providers

- DeepSeek, OpenAI, Anthropic, Gemini, Qwen, Kimi, Doubao/Ark, Zhipu GLM, OpenRouter, Ollama, LM Studio, custom OpenAI-compatible endpoints and Local Sandbox.
- Multiple profiles, active-provider switching, connection checks, model/base URL configuration.
- Native OpenAI-compatible and Anthropic request formats.
- Explicitly approved real-image delivery to vision-capable profiles; otherwise images remain local and only OCR text is sent.
- Provider, GitHub and MCP credentials are stored through the OS credential store rather than localStorage.

### Safety and tokens

- Prompt, extracted attachment content and coding-agent repository context scanning.
- Detection/redaction for keys, tokens, passwords, email, phone, database URLs, private keys and custom terms.
- Review invalidation after edits and explicit approval for high-risk disclosures.
- Conservative/Balanced local prompt compaction.
- Per-request limit, daily budget, input/output/saved token accounting.
- Defensive processing before local history and receipt storage.

### Documents and local knowledge

- Text, source code, Markdown, JSON, CSV and logs.
- PDF text-layer extraction, page markers and OCR fallback for scanned pages.
- DOCX extraction and XLSX worksheet conversion.
- Local image OCR for PNG/JPEG/WEBP/BMP/TIFF with English, Simplified Chinese and mixed language modes.
- Local chunking, multilingual lexical retrieval and cited context injection.
- Explicit file-kind-to-provider/model routing.

### Scoped coding agent

- User-selected repository boundary with path-traversal, symlink and `.git` write protection.
- Reviewed text editing with automatic `.tokenfence/backups` copies.
- AI Patch Assistant sends a locally redacted repository tree, Git state, current diff and selected file to the active model, requesting a plan and unified diff.
- Model output is preview-only until the user confirms it.
- `git apply --check` before apply and patch archive under `.tokenfence/patches`.
- Fixed command allowlist: Git status/diff, npm typecheck/test/build, cargo check/test.
- Confirmed branch, commit, push and GitHub pull-request workflow.
- GitHub account, repository and issue reads using a credential-store PAT.

### macOS Computer Use Beta

- Screen capture and local preview.
- One-action-approved coordinate clicks and text typing.
- Allowlisted Enter, Escape, Tab, Space, Delete, Command+S and Command+L keys.
- Links to Screen Recording and Accessibility settings.
- Local action audit trail.

### Skills and connectors

- 20 built-in Skills plus local custom Skill create/edit/delete/import/export and declared permissions.
- Agents compose built-in and custom Skills into real system instructions.
- MCP/JSON-RPC connector Beta for initialize, tools/list, resources/list, prompts/list and confirmed tools/call.
- Remote endpoints require HTTPS; localhost HTTP is allowed. Connector tokens use the OS credential store.

### Updates and macOS distribution

- In-app GitHub Latest Release checks and architecture-specific asset links.
- Apple Silicon and Intel GitHub Actions builds.
- Developer ID signing and notarization path when publisher-owned Apple secrets are configured.
- Ad-hoc community builds plus a Chris Studio-only install helper when credentials are absent.

## Intentionally constrained

- The coding agent does not silently approve writes, run an unrestricted shell or operate indefinitely without review.
- Computer Use does not provide unattended background control, arbitrary AppleScript or arbitrary terminal execution.
- Local knowledge retrieval is lexical and private, not a vector database.
- MCP support targets request/JSON-response servers; long-lived SSE/OAuth transports may need adapters.
- Updates are visible and user initiated; they do not silently replace the app.

## Publisher/user-owned prerequisites

Apple Developer credentials, provider keys, GitHub/MCP tokens, macOS privacy permissions and private Git credentials cannot be embedded or manufactured by the source package.

## Verification

```bash
npm ci --prefix apps/desktop/ui --legacy-peer-deps --no-audit --no-fund
npm --prefix apps/desktop/ui run typecheck
npm --prefix apps/desktop/ui run test:core
npm --prefix apps/desktop/ui run build
python3 scripts/verify_tokenfence_patch.py
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```


## v2.1 unified workspace

Identity, project, Git, Skills and Computer Use now have in-conversation entry points. Writes, clicks, typing, keys and network actions remain individually approval-gated.

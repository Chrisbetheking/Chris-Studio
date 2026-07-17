# Chris Studio v2.2.0

<p align="center"><strong>A local-first Safe AI Agent workspace for multiple models, lower token usage and reviewed computer actions.</strong></p>

Chris Studio sits between the user and AI providers. Before a request leaves the Mac, it can scan sensitive content, process attachments, compact context, route files, retrieve local knowledge and require approval for native actions. v2.2.0 hardens that desktop Agent foundation: long tasks now have a tested run-state core with checkpoints, loop limits, three-attempt repair boundaries, explicit cancellation and receipts, while the macOS Release path becomes retryable and verifiable.

[简体中文](README.zh-CN.md) · [Rename guide](RENAME_TO_CHRIS_STUDIO.zh-CN.md) · [Fast-track roadmap](FAST_TRACK_ROADMAP.zh-CN.md) · [Implementation status](docs/architecture/IMPLEMENTATION_STATUS_v2.0.md) · [macOS signing](docs/macos/SIGNING_NOTARIZATION.md) · [Troubleshooting](docs/troubleshooting/TROUBLESHOOTING.md)


Support: `chriswangjob@163.com` · WeChat: `easymoneysniperchris`

## v2.2 highlights

- Reliability work stays inside the unified workbench instead of adding more disconnected feature pages.
- A typed Agent run controller records status, checkpoints, loops, repair attempts, patch backups and final receipts.
- Automatic repair is capped at three attempts by default; patch backups can be converted into a path-safe reverse rollback plan and a portable JSON receipt.
- Provider usage/error telemetry is normalized across common SDK field names without hard-coded pricing; optional rate cards remain user/configuration supplied.
- Computer Use gets one-time approval tickets, an emergency stop, a hard deadline and coordinate-overlay data before any future UI wiring.
- Product identity and displayed desktop version are synchronized before development, type-check and production builds.
- The macOS release publisher is repository-owned, idempotent and retryable; every local asset is checked again against the remote Release.
- Version metadata must match across the root workspace, desktop package, desktop UI, Cargo and Tauri configuration before builds begin.
- Apple Silicon and Intel release bundles are verified independently before publishing.
- GitHub-maintained checkout, setup-node and artifact actions use their current Node 24 generations.

## Downloads

### Apple Silicon

- [DMG](https://github.com/Chrisbetheking/chris-studio/releases/latest/download/Chris-Studio-macOS-Apple-Silicon.dmg)
- [APP ZIP](https://github.com/Chrisbetheking/chris-studio/releases/latest/download/Chris-Studio-macOS-Apple-Silicon.app.zip)
- [Community installer](https://github.com/Chrisbetheking/chris-studio/releases/latest/download/Install-Chris-Studio-Apple-Silicon.command)
- [SHA-256](https://github.com/Chrisbetheking/chris-studio/releases/latest/download/SHA256SUMS-Apple-Silicon.txt)

### Intel

- [DMG](https://github.com/Chrisbetheking/chris-studio/releases/latest/download/Chris-Studio-macOS-Intel.dmg)
- [APP ZIP](https://github.com/Chrisbetheking/chris-studio/releases/latest/download/Chris-Studio-macOS-Intel.app.zip)
- [Community installer](https://github.com/Chrisbetheking/chris-studio/releases/latest/download/Install-Chris-Studio-Intel.command)
- [SHA-256](https://github.com/Chrisbetheking/chris-studio/releases/latest/download/SHA256SUMS-Intel.txt)

Direct links become available after the v2.2.0 Release workflow succeeds. Developer ID signed and notarized packages pass the normal macOS trust flow. Without Apple credentials, the workflow publishes ad-hoc signed community packages and an app-specific installer helper.

## Product capabilities carried into v2.2.0

### Multi-provider workspace

Profiles are available for DeepSeek, OpenAI, Anthropic, Gemini, Qwen, Kimi, Doubao/Ark, Zhipu GLM, OpenRouter, Ollama, LM Studio, custom OpenAI-compatible endpoints and Local Sandbox.

- per-profile operating-system credential storage;
- no silent fallback after a real provider is selected;
- OpenAI-compatible and Anthropic request formats;
- reviewed image attachment delivery to vision-capable providers;
- visible model and routing decisions before sending.

### Safety and token budgets

- unified prompt and attachment scanning;
- local redaction and critical-risk approval;
- review invalidation after edits;
- defensive redaction before history persistence;
- conservative and balanced local compaction;
- per-request and daily token limits;
- local input, output and saved-token accounting.

### File processors and local retrieval

- text, code, PDF, DOCX, XLSX and image processing;
- rendered-page OCR fallback for scanned PDFs;
- English, Simplified Chinese and mixed OCR;
- local document chunking and lexical retrieval;
- file-type-specific provider routing;
- reviewed original-image transfer for real vision calls.

### Scoped coding-agent workspace

- explicit project-folder scope;
- text file reading and editing;
- confirmed writes with `.tokenfence/backups`;
- AI Patch Assistant using locally redacted repository tree, Git state, current diff and selected-file context;
- model-generated plans and unified diffs remain preview-only until reviewed;
- reviewed unified-diff application with archived patches;
- allowlisted Git, npm and Cargo checks;
- branch creation, commit and push;
- GitHub PAT storage, repository metadata, Issues and Pull Request creation;
- confirmation before every write, command, push and PR.

Chris Studio does not expose an unrestricted shell to the model.

### macOS Computer Use Beta

- screen capture;
- approved coordinate clicks;
- approved text typing;
- allowlisted keys and shortcuts;
- permission settings shortcut;
- local audit records;
- no unrestricted background control.

### Skills and MCP connectors

- 20 built-in Skills;
- local custom Skill editor and JSON import/export;
- declared permissions and Agent composition;
- reviewed MCP / JSON-RPC HTTP connectors;
- HTTPS enforcement for remote endpoints;
- Keychain storage for connector tokens;
- explicit approval for every `tools/call`.

The current MCP Beta handles JSON responses for `initialize`, `tools/list`, `resources/list`, `prompts/list` and `tools/call`. Servers that require retained SSE sessions may need a later adapter.

### GitHub Release updates

The app shows current and latest versions, release notes, dates and matching macOS assets. Installation remains user initiated.

## macOS signing and the “damaged” warning

The workflow supports these repository Secrets:

```text
APPLE_CERTIFICATE
APPLE_CERTIFICATE_PASSWORD
APPLE_ID
APPLE_PASSWORD
APPLE_TEAM_ID
```

When configured, Tauri builds can be signed and notarized. Without them, a community package is produced with an ad-hoc signature and `Install-Chris-Studio-*.command`. The helper clears quarantine only for Chris Studio and does not disable Gatekeeper globally.

See [SIGNING_NOTARIZATION.md](docs/macos/SIGNING_NOTARIZATION.md).

## Development

```bash
npm ci --prefix apps/desktop/ui --legacy-peer-deps --no-audit --no-fund
npm --prefix apps/desktop/ui run typecheck
npm --prefix apps/desktop/ui run test:core
npm --prefix apps/desktop/ui run build
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
cd apps/desktop
tauri dev
```

Production build:

```bash
cd apps/desktop
tauri build
```

## Release v2.2.0

Run `Chris Studio macOS Builds and Release` from GitHub Actions with:

```text
version: v2.2.0
create_release: true
make_latest: true
```

The workflow verifies public package sources, TypeScript, privacy/token/retrieval tests and Rust before building Apple Silicon and Intel packages.

## Security boundary

Chris Studio is not antivirus software and cannot identify every secret. Review all file writes, commands, Computer Use actions, tool calls, Git pushes and Pull Requests. Never trust an unknown model or tool endpoint with real secrets.

## License

MIT

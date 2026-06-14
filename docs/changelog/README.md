# TokenFence Studio Update Log

This folder records the main development updates of TokenFence Studio.

Instead of putting every detail into the main README, each update has its own note with the date, summary, changed files, and implementation details.

## Updates

| Date | Version / Stage | Summary | Details |
|---|---|---|---|
| 2026-06-14 | v1.0.0-rc2 / Product Candidate 2 | ZIP-wrapped DOCX, upgraded acceptance tests, README UTF-8 cleaned. | —|
| 2026-06-13 | v1.0.0-rc1 / Product Candidate 1 | Bilingual i18n, Chinese README repair, 35 acceptance checks. | —|
| 2026-06-13 | v0.5.24 / Stable Navigation + Desktop | Stable Android navigation, Windows Desktop i686 artifacts. | —|
| 2026-06-13 | v0.5.22 / Android Navigation Architecture | Custom native navigation replacing crash-prone bottom-tabs. | —|
| 2026-06-12 | v0.5.1 / Android Startup Crash Fix | Fixed deprecated Clipboard import for React Native 0.76 / Expo SDK 52. | [View details](./2026-06-12-v051-android-crash-fix.md) |
| 2026-06-12 | v0.5.0 / Agent Workspace + Plugin System | Agent Runtime, 10 built-in plugins, new Web/Desktop/Android UI pages, 11 new docs. | [View details](./2026-06-12-v050-agent-workspace.md) |
| 2026-06-11 | v0.3.7 / Docs & Release Fix | Fixed README encoding, updated Expo/EAS config, bumped versions. | [View details](./2026-06-11-readme-roadmap-and-release-polish.md) |
| 2026-06-08 | v0.3.0 / Document Intelligence Pipeline | Document parsing, cleaning, risk scanning, RAG-ready chunks, export preview. | [View details](./2026-06-08-document-intelligence-pipeline.md) |
| 2026-06-02 | v0.2.0 / Model Matrix | Model Matrix, file-level model routing, provider presets. | [View details](./2026-06-02-model-matrix-and-provider-presets.md) |
| 2026-06-01 | v0.1.0 / Initial Pre-flight Workflow | First pre-flight prompt safety workflow: scanning, redaction, routing. | [View details](./2026-06-01-initial-preflight-workflow.md) |

## Current Project Status

TokenFence Studio is a local-first pre-LLM safety and orchestration workspace.

The project focuses on what happens before model access:

- Prompt safety
- Sensitive data detection
- Redaction
- Document parsing and cleaning
- RAG-ready chunk generation
- Model comparison and routing
- Agent workflows and output generation

Current release: v1.0.0-rc2 (product candidate). Stable download: v0.5.24.

See [GitHub Releases](https://github.com/Chrisbetheking/tokenfence-studio/releases) for downloadable artifacts.
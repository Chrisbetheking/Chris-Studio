# Plugin System

## Overview

TokenFence Studio uses a modular plugin architecture. Each plugin has a manifest declaring its runtime, permissions, and entry point.

## Built-in Plugins

10 built-in plugins across 7 categories:

| Plugin | Category | Runtime | Risk |
|---|---|---|---|
| Obsidian Vault Writer | Knowledge | node | Low |
| Markdown to PDF | Output | node | Low |
| Markdown to DOCX | Output | node | Low |
| Mind Map Generator | Output | node | Low |
| API Request Builder | API | node | Medium |
| Knowledge Search | Knowledge | node | Low |
| MP4 Import | Media | node | Medium |
| Audio Transcribe | Media | python | Medium |
| Local Command Runner | Computer Use | shell | High |
| Computer Screenshot | Computer Use | binary | Medium |

## Plugin Categories

- **Built-in**: Core system plugins
- **Output**: Export and format generation
- **Knowledge**: Obsidian, search, memory
- **Media**: MP4 import, audio transcribe
- **API**: Third-party connector builder
- **Computer Use**: Screenshot, shell, clicks
- **Developer Tools**: Reserved for future

## Permissions

All plugins declare required permissions. Computer Use and shell plugins always require user approval before execution.

## Status

**Experimental MVP**. Plugin manifests and registry are defined. Runtime installation is a stub. Full plugin execution requires the local agent HTTP server (planned).

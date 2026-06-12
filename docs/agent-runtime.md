# Agent Runtime

## Overview

The Agent Runtime is the foundation for TokenFence Studio's local-first agent workflow system. It allows plugins to run in sandboxed environments with explicit permission approval.

## Architecture

```
User defines Agent Task
  -> Agent Steps mapped to Plugin actions
    -> Permission Gate checks each step
      -> Runtime Manager executes approved steps
        -> Execution Log records all activity
```

## Runtime Types

| Type | Description |
|---|---|
| `node` | Node.js plugin runtime |
| `python` | Python plugin with `.venv` isolation |
| `binary` | Standalone binary execution |
| `shell` | Shell command execution (highest risk) |
| `none` | Pure logic plugin, no external runtime |

## Storage

```
.tokenfence/
  runtimes/
    <plugin-id>/
      manifest.json
      logs/
      workspace/
      .venv/          # python only
      node_modules/   # node only
```

## Permission Model

All plugins declare required permissions in their manifest. Execution requires user approval for sensitive operations:

- `file-read` / `file-write`
- `network-out`
- `shell-exec`
- `screenshot`
- `clipboard-read` / `clipboard-write`
- `obsidian-read` / `obsidian-write`
- `api-call`
- `media-ingest`

## Status

**Experimental**. The Agent Runtime core modules are defined in `packages/shared/src/agent-runtime/`. The full local executor requires a companion agent HTTP server (planned for future releases).

### What works now (MVP)
- Agent task definition and step tracking
- Plugin manifest registry
- Permission gate with approve/deny
- Execution log (localStorage)
- Plugin installer (stub)

### Planned
- Local agent HTTP server for real command execution
- Python venv auto-install
- NPX-based plugin bootstrapping
- Process sandboxing

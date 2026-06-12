# Computer Use Permissions

## Overview

TokenFence Studio supports permission-gated computer actions. All shell execution, screenshots, clicks, and typing require explicit user approval.

## Permission Model

| Action | Risk | Approval |
|---|---|---|
| Screenshot | Medium | Always required |
| Click | Medium | Always required |
| Type | Medium | Always required |
| Scroll | Medium | Always required |
| Keypress | Medium | Always required |
| Shell Execute | High | Always required |

## Safety Rules

- Blocked commands: `rm -rf /`, `del /f /s`, `format`, `shutdown`, `reboot`
- All shell commands logged to execution history
- Approval/denial recorded with timestamps
- No persistent elevation

## Status

**Experimental**. Permission gate logic is defined. Actual execution requires local agent runtime.

# Output Plugins

## Overview

Export agent output to various formats: Markdown, HTML, JSON, PDF, DOCX.

## Supported Formats

| Format | Status | Notes |
|---|---|---|
| Markdown | MVP | Clean output with frontmatter |
| HTML | MVP | Styled responsive HTML |
| JSON | MVP | Structured JSON export |
| PDF | Stub | Requires local runtime for full conversion |
| DOCX | Stub | Requires local runtime for full conversion |

## Usage

```ts
import { exportContent } from "@shared/plugins/output-generators";

const result = exportContent(agentOutput, "Report", "md");
// result.filename, result.content, result.format
```

## Status

**MVP**. Markdown, HTML, and JSON generators are functional. PDF and DOCX are stub generators awaiting local agent runtime.

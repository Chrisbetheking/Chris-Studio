# Mind Map Generator

## Overview

Generate mind maps from agent output text using Mermaid syntax.

## Formats

- **Mermaid**: Generates `mindmap` diagram syntax for rendering
- **Markdown**: Falls back to nested bullet lists

## Usage

```ts
import { parseToMindMap, generateMindMap } from "@shared/plugins/mindmap";

const root = parseToMindMap(agentOutput, "Project Plan");
const mm = generateMindMap(root, "mermaid");
// mm.content contains Mermaid mindmap syntax
```

## Rendering

Mermaid mind maps render in any Mermaid-compatible viewer (GitHub, Obsidian, VS Code). Future versions may render directly in the TokenFence UI.

## Status

**MVP**. Core generation logic is functional. Visual rendering in-app is planned.

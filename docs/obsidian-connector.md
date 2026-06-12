# Obsidian Knowledge Connector

## Overview

Read and write notes to a local Obsidian vault from within TokenFence Studio.

## Current Support

**Local vault path mode only**. Configure your Obsidian vault path in settings, and TokenFence provides an interface for reading/writing/searching notes (actual filesystem access requires desktop Tauri app or local agent runtime).

## Limitations

- No Obsidian plugin integration yet (requires Obsidian community plugin)
- No real-time sync
- No graph view
- File system access only (browser sandbox limits this to desktop app)

## API

```ts
import { writeNote, readNote, listNotes, searchNotes } from "@shared/plugins/obsidian-connector";

writeNote("Meeting Notes", "# Summary\n...", ["meeting", "project-x"]);
const notes = searchNotes("project-x");
```

## Status

**Experimental**. Core connector logic is defined. Full vault integration requires the desktop Tauri app for filesystem access.

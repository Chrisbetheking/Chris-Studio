# Media Collector

## Overview

Import and analyze media files (MP4, audio) within the agent workspace.

## MP4 Import

- Import MP4 files and extract frames for AI analysis (manifest and pipeline plan; actual processing requires local agent runtime)
- Local file access only or authorized URLs
- Requires user approval

## Audio Transcribe

- Transcribe audio files using local or cloud models (manifest and pipeline plan; actual processing requires local agent runtime)
- Python runtime required (uses local whisper or cloud API)
- Requires user approval

## Status

**Experimental MVP**. Plugin definitions and stubs are in place. Full processing requires local agent runtime.

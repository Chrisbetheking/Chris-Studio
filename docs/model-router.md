# Model Router

## Overview

Auto-routing by task category with automatic fallback chains.

## Task Categories

| Category | Primary | Fallback Chain |
|---|---|---|
| General | OpenAI GPT-4o | Gemini Flash ? Ollama Llama 3.2 |
| Code | Anthropic Claude | OpenAI GPT-4o ? Ollama DeepSeek Coder |
| Document | OpenAI GPT-4o-mini | Gemini Flash ? Ollama Llama 3.2 |
| Creative | Anthropic Claude | OpenAI GPT-4o ? Gemini Flash |
| Analysis | OpenAI GPT-4o | Anthropic Claude ? Ollama Llama 3.2 |
| Safety | Ollama Llama 3.2 | OpenAI GPT-4o-mini |
| Agent | Anthropic Claude | OpenAI GPT-4o ? Gemini Flash ? Ollama Llama 3.2 |

## Features

- Provider health monitoring (marks unhealthy providers)
- Automatic fallback when primary is unhealthy
- Local-first for safety tasks
- Custom rule configuration (persisted to localStorage)

## Status

**Experimental**. Routing logic is defined and functional in-memory (MVP routing policy and fallback chain foundation). Full integration with the provider system and real health checks is planned.

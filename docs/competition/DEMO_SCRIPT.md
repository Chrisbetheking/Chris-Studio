# TokenFence Studio - Demo Script (2-3 minutes)

## Prerequisites
- Windows 10/11 x64
- Extract portable ZIP fully before running
- No API keys required for the demo (use fictional keys)

## Demo Flow

### 1. Launch Application (10s)
- Extract `TokenFence-Studio-Windows-v1.6.0-portable.zip`
- Run `tokenfence-studio.exe`
- Show the clean, empty Chat Workspace interface
- Point out version v1.6.0 in sidebar

### 2. Show Local-First Scanning (20s)
- Type a prompt containing fictional sensitive data:
  ```
  My API key is sk-test1234567890abcdef1234567890 and my email is
  john.doe@example.com. My phone is +1-555-123-4567.
  ```
- Hit Send
- The Guard panel shows: "Guard flagged: Potential API key, Email address"
- Explain: all scanning happens locally, no data sent yet

### 3. Show Findings and Risk (15s)
- Point to the Inspector panel showing Active Model and Prompt Guard result
- Explain the risk levels: safe / low / medium / high
- This prompt would be classified as high risk (API key detected)

### 4. Show Masked / Redacted Version (15s)
- Switch to Guard screen from Toolbox
- Show the Redaction Engine section
- Explain: detected secrets are masked (sk-te***90, jo***@example.com)

### 5. Show Provider Configuration (20s)
- Navigate to Models tab
- Show available providers: OpenAI, Claude, Gemini, DeepSeek, etc.
- Configure DeepSeek with a fictional key: `sk-demo-fictional-key-12345`
- Show the green status dot when configured

### 6. Show Secure Send (20s)
- Return to Chat
- Select DeepSeek as provider
- Type: "Hello, summarize this for me."
- Send message
- Show response (Demo mode: shows [Preview] if no real key configured)

### 7. Show Safety Report (15s)
- After sending, the Guard result appears in the Inspector
- Show: "Guard: No issues" for clean messages
- Show token usage estimates

### 8. Show History (15s)
- Conversations are persisted automatically
- Switch between conversations in the sidebar
- Previous messages with Guard results are preserved

### 9. Show Theme & Language (15s)
- Toggle between Light, Dark, and System themes
- Switch between English and Chinese
- All UI text updates immediately

### 10. Wrap Up (10s)
- Emphasize: local-first, no cloud dependency
- All scanning and redaction happens on-device
- API keys stay encrypted in local storage

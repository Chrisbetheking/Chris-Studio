# TokenFence Studio v1.6.0 Implementation Report

## Product scope

TokenFence Studio is now centered on one product promise: review and redact prompts and supported text files before content leaves the device for an AI provider.

## Implemented

- Replaced the previous broad toolbox/project navigation with Workspace, History, Providers, Settings and About.
- Added a unified before-send scanner for prompt text and attached text files.
- Fixed the first-message flow by creating the conversation before provider dispatch.
- Invalidates approval whenever prompt text or attachments change.
- Blocks Critical raw sends and permits only an explicitly approved redacted payload.
- Stores redacted prompts in local history; safety receipts contain metadata only.
- Added DeepSeek V4 Flash and V4 Pro configuration.
- Moved DeepSeek HTTP calls to a restricted Tauri Rust command.
- Restricted the backend to the official DeepSeek HTTPS endpoint.
- Added friendly status-specific errors without exposing response bodies or credentials.
- Added local demo mode for judging without a live API account.
- Added functional English/Chinese language selection and light/dark/system themes.
- Added destructive-action confirmations, settings export and application reset.
- Removed the broad shell-command backend from the product path by replacing the Tauri entry point with the provider proxy only.

## Security boundaries

- The API key is stored locally by the UI configuration store.
- This release does not claim operating-system keychain encryption.
- The Rust backend never logs request payloads, credentials or provider response bodies.
- The exact redacted payload is visible before send.
- The model destination and connection state remain visible in the workspace.

## Verification included

- TypeScript strict compilation for the scanner/store modules.
- Static patch verification script.
- GitHub Actions workflow for Windows UI build and Rust `cargo check`.

## Honest limitation

A live DeepSeek API call cannot be certified without a valid user-provided API key and funded/authorized DeepSeek account. The application includes an explicit connection test and local demo mode so this state is visible rather than falsely reported as verified.

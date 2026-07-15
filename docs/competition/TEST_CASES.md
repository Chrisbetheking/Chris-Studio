# TokenFence Studio - Test Cases

## TC-01: Application Launch
- **Action**: Run tokenfence-studio.exe
- **Expected**: App window opens at 1280x800, Chat Workspace visible, version v1.6.0 in sidebar
- **Status**: PASS (verified 2026-07-15)

## TC-02: Prompt Guard - API Key Detection
- **Action**: Type `sk-abc123def456ghi789jkl012mno345pqr678stu` and send
- **Expected**: Guard flags "Potential API key", risk level high
- **Status**: PASS

## TC-03: Prompt Guard - Email Detection
- **Action**: Type `contact@company.com` and send
- **Expected**: Guard flags "Email address"
- **Status**: PASS

## TC-04: Prompt Guard - Clean Text
- **Action**: Type "Hello, how are you?" and send
- **Expected**: Guard reports "No issues"
- **Status**: PASS

## TC-05: File Attachment
- **Action**: Attach a .txt file via the paperclip button
- **Expected**: File appears in Context Pack panel with name, type, size, token estimate
- **Status**: PASS

## TC-06: Provider Configuration
- **Action**: Navigate to Models, click on a provider, enter API key
- **Expected**: Key saved, provider shows configured status (green dot)
- **Status**: PASS

## TC-07: Provider Health Check
- **Action**: Configure a provider with valid key, trigger health check
- **Expected**: Health status updates (ok/degraded/failed)
- **Status**: PASS

## TC-08: Theme Toggle
- **Action**: Click sun/moon/laptop icons in sidebar
- **Expected**: Theme changes immediately between light/dark/system
- **Status**: PASS

## TC-09: Language Switch
- **Action**: Switch between EN and zh-CN in sidebar
- **Expected**: All UI text updates to selected language
- **Status**: PASS

## TC-10: Conversation Persistence
- **Action**: Send messages, close app, reopen
- **Expected**: Previous conversations restored
- **Status**: PASS

## TC-11: No Provider - Graceful Fallback
- **Action**: Send message with no API key configured
- **Expected**: Shows "[Preview] Configure provider API key in Settings"
- **Status**: PASS

## TC-12: Responsive Layout
- **Action**: Resize window to 900x700, 768x700
- **Expected**: No overlapping text, sidebar remains usable, no horizontal scroll
- **Status**: PASS (verified at 1280x800, 900x700)

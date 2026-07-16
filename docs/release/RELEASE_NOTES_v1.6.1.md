# TokenFence Studio v1.6.1

TokenFence Studio v1.6.1 introduces the first native macOS release line and strengthens the local-first safety workflow around AI prompts, supported text attachments, credentials, and local history.

## Download the correct Mac build

- **Apple Silicon DMG:** M1, M2, M3, M4, and newer Apple chips.
- **Intel DMG:** older Intel-based Macs.
- **APP ZIP:** alternative package for testing when the DMG cannot be opened.

To check the Mac architecture, open Terminal and run:

```bash
uname -m
```

- `arm64` → Apple Silicon
- `x86_64` → Intel

## Highlights

- Native Apple Silicon and Intel macOS packages
- Optional Universal macOS package
- macOS native application menu and `Command + N`
- DeepSeek credentials stored through the operating-system credential store
- Legacy browser-stored provider credentials removed when migration is possible
- Prompt and supported attachment review before provider submission
- Approval invalidation after relevant input changes
- Defensive re-scan before local history persistence
- English and Simplified Chinese interface
- Demo Mode for screenshots and offline product walkthroughs
- SHA-256 checksum files for release assets

## Installation note

These community builds are currently unsigned and not notarized. On first launch, use **Control-click → Open** in Finder if macOS blocks the application. Do not disable Gatekeeper globally.

## Security scope

TokenFence Studio reduces accidental disclosure risk, but pattern-based scanning is not perfect. Always review the redacted payload before approving a provider request. Unsupported binary files, images, encrypted archives, and unusual secret formats may not be inspected.

## Documentation

- English README: `README.md`
- 中文说明：`README.zh-CN.md`
- English troubleshooting: `docs/troubleshooting/TROUBLESHOOTING.md`
- 中文故障排查：`docs/troubleshooting/TROUBLESHOOTING.zh-CN.md`

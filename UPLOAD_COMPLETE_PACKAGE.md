# TokenFence Studio v1.6.1 — complete upload package

This archive is rooted at the GitHub repository root. It contains the full v1.6.1 desktop replacement set, bilingual README files, troubleshooting documentation, macOS release workflow, TypeScript scope fix, and native Keychain dependency fix.

## One-time web upload

1. Extract the ZIP.
2. In Finder press `Command + Shift + .` once so the hidden `.github` folder is visible.
3. Open the repository root on GitHub and choose **Add file → Upload files**.
4. Select every extracted item together and upload them in one batch. Do not upload the ZIP file itself.
5. Commit with: `fix: upload complete v1.6.1 macOS release package`
6. Start a new **TokenFence macOS Builds and Release** workflow run. Do not rerun an older failed run.

The workflow creates Apple Silicon and Intel DMG/APP ZIP assets and then updates the v1.6.1 GitHub Release.

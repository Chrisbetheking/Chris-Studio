# TokenFence Studio Troubleshooting

[简体中文](TROUBLESHOOTING.zh-CN.md) | [Back to README](../../README.md)

This guide covers TokenFence Studio v1.6.1 desktop installation, macOS builds, provider configuration, credential storage, and development failures.

## Start with these checks

Before changing code, record:

```bash
node -v
npm -v
rustc --version
cargo --version
```

On macOS also record:

```bash
sw_vers
uname -m
xcode-select -p
```

Never post a real API key in logs, screenshots, GitHub Issues, or chat messages.

## 1. Which macOS build should I download?

Run:

```bash
uname -m
```

- `arm64`: download `TokenFence-Studio-macOS-Apple-Silicon`.
- `x86_64`: download `TokenFence-Studio-macOS-Intel`.
- The Universal package can run on both architectures when it is available.

### Symptom: “Bad CPU type in executable” or the app immediately exits

The wrong architecture was installed. Remove the application and download the matching build.

## 2. macOS says the developer cannot be verified

The community build is currently unsigned and not notarized.

Use the safe first-launch flow:

1. Move the app to `/Applications`.
2. Open Finder → Applications.
3. Control-click **TokenFence Studio**.
4. Choose **Open**.
5. Confirm **Open** again.

Do not disable Gatekeeper globally.

### Symptom: “TokenFence Studio is damaged and can’t be opened”

First:

- Download the artifact again from the official repository workflow or Release.
- Verify the included SHA-256 file.
- Confirm the ZIP/DMG was fully downloaded and extracted.

Only after verifying the source and checksum, a developer testing an unsigned build may remove quarantine from this app only:

```bash
xattr -dr com.apple.quarantine "/Applications/TokenFence Studio.app"
```

Do not run that command on an application from an untrusted source.

## 3. The application opens to a blank or white window

Try these steps in order:

1. Quit the app completely and reopen it.
2. Confirm the app was copied to `/Applications` rather than launched from a read-only DMG window.
3. Install the latest supported macOS updates.
4. Reset local application data from Settings when the page is accessible.
5. Run the app executable from Terminal to capture non-secret errors:

```bash
"/Applications/TokenFence Studio.app/Contents/MacOS/tokenfence-studio"
```

Do not share lines containing credentials or private prompt content.

For development builds, confirm the desktop UI builds:

```bash
npm --workspace apps/desktop run ui:build
```

Then run:

```bash
npm run desktop:dev
```

## 4. `npm ci` fails

### `npm ERR! ERESOLVE`

Use the workspace's expected compatibility flag:

```bash
npm ci --legacy-peer-deps
```

### The lockfile is out of sync

A contributor changed a package manifest without updating `package-lock.json`.

Use a clean branch, then run:

```bash
rm -rf node_modules
npm install --legacy-peer-deps
```

Review the lockfile diff before committing it. Do not regenerate the lockfile casually in an unrelated change.

### Unsupported Node.js version

The repository expects Node.js 18 through 22. Verify:

```bash
node -v
```

With `nvm`:

```bash
nvm install 22
nvm use 22
```

## 5. `tauri: command not found` or desktop scripts fail

Install workspace dependencies from the repository root:

```bash
npm ci --legacy-peer-deps
```

Use the repository script instead of a globally installed CLI:

```bash
npm run desktop:dev
```

or:

```bash
npm run desktop:build
```

## 6. Rust or Cargo is missing

Install Rust using the official rustup installer, restart the terminal, then verify:

```bash
rustc --version
cargo --version
```

For a specific macOS target:

```bash
rustup target add aarch64-apple-darwin
rustup target add x86_64-apple-darwin
```


## 7. Xcode Command Line Tools are missing

Run:

```bash
xcode-select --install
```

Verify:

```bash
xcode-select -p
```

If the path is broken after an Xcode update:

```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
```

Use the second command only when the full Xcode application is installed at that location.

## 8. Local macOS build fails

Run the helper from the repository root:

```bash
bash scripts/build-macos.sh
```

Then inspect:

```text
apps/desktop/src-tauri/target/<target>/release/bundle/
```

Before retrying, verify the UI independently:

```bash
npm --workspace apps/desktop run typecheck
npm --workspace apps/desktop run test:core
npm --workspace apps/desktop run ui:build
```

Verify the Rust backend:

```bash
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## 9. GitHub Actions macOS build is not visible

Confirm this file exists on the selected branch:

```text
.github/workflows/tokenfence-macos.yml
```

Then open:

```text
GitHub → Actions → TokenFence macOS Builds and Release → Run workflow
```

If Actions are disabled for the repository, enable them in repository settings.

## 10. GitHub Actions verification fails before the Mac build

The workflow intentionally verifies the desktop UI first. Open the failed `Verify desktop UI` job and identify the first failed command.

Reproduce locally:

```bash
npm ci --legacy-peer-deps
npm --workspace apps/desktop run typecheck
npm --workspace apps/desktop run test:core
npm --workspace apps/desktop run ui:build
python3 scripts/verify_tokenfence_patch.py
```

Fix the first real failure rather than rerunning repeatedly.

## 11. Apple Silicon build succeeds but Intel fails

The two builds use separate runner architectures and Rust targets.

Check the Intel job for:

- dependency code that only supports arm64;
- native binaries downloaded for the wrong architecture;
- a missing `x86_64-apple-darwin` Rust target;
- a runner-image or third-party action incompatibility.

The workflow uses GitHub's `macos-15-intel` label. If GitHub changes runner availability, compare the workflow label with the current GitHub-hosted runners documentation.


The Universal job is optional. It requires both macOS Rust targets and all native dependencies to support combining architectures.


## 13. No `.dmg` or `.app.zip` appears in the artifact

Open the `Package artifacts` step. The workflow expects Tauri bundles in:

```text
apps/desktop/src-tauri/target/<target>/release/bundle/macos/
apps/desktop/src-tauri/target/<target>/release/bundle/dmg/
```

Check that:

- Tauri bundling is active;
- `bundle.targets` has not disabled `app` or `dmg`;
- the Tauri build step completed successfully;
- the product name did not produce an unexpected path.

## 14. DeepSeek says no credential is stored

Open **Providers**, enter the key again, save it, and confirm the UI reports that a credential is stored.

On macOS, open **Keychain Access** and search for:

```text
com.tokenfence.studio
```

Do not expose the secret value while testing.

If the app is running only in a browser or Vite preview, Keychain access is unavailable. Use the native Tauri app.

## 15. The API key disappears after restarting

Check:

1. The app was running in the native desktop runtime.
2. macOS did not deny Keychain access.
3. The credential was saved before closing the app.
4. The Keychain item for `com.tokenfence.studio` exists.
5. The app is not being run under a different macOS user account.

Clear the provider credential from Settings, save it again, and test the connection.

## 16. I cannot clear the provider credential

Use:

```text
Settings → Privacy → Clear provider credential
```

If that fails on macOS, open Keychain Access, search for `com.tokenfence.studio`, verify it belongs to TokenFence Studio, then delete that item manually.

Do not delete unrelated Keychain items.

## 17. DeepSeek connection test fails

Read the error category and check the matching cause:

### Invalid credential / 401

- The key is missing, revoked, copied incorrectly, or belongs to a different service.
- Save the correct key again in Providers.

### Forbidden / 403

- The account, region, project, or endpoint may not permit the request.
- Check the provider account and official service availability.

### Rate limited / 429

- The account exceeded a request or usage limit.
- Wait, review usage, or use an account with available quota.

### Model not found / 400 or 404

- The selected model is not accepted by the current API account or endpoint.
- Select a supported model shown by the app and retry.

### Timeout or network error

- Check internet access, VPN/proxy behavior, firewall rules, DNS, and system time.
- Increase the request timeout in Settings only when the network is known to be slow.

### `DESKTOP_RUNTIME_REQUIRED`

The request was started from a browser preview. Provider calls must run inside the Tauri desktop app.

### Demo Mode works but the real provider does not

Demo Mode does not perform a network request. It only proves that the local UI and safety flow are working.

## 18. The prompt is blocked after I already approved it

Approval is intentionally invalidated when:

- prompt text changes;
- an attachment is added, removed, or replaced;
- relevant safety settings change.

Run the scan again and review the new redacted payload.

## 19. An attachment is ignored or cannot be scanned

The current safety flow is intended for supported text content. Binary files, images, encrypted archives, and unsupported formats may not be inspectable.

- Convert the relevant content to a supported text format.
- Remove secrets manually before attaching.
- Never assume an unsupported file was scanned.

Also check the maximum file scan size in Settings.

## 20. The scanner reports a false positive

Do not disable all safety checks immediately.

- Review the finding category.
- Replace or rewrite the test value.
- Adjust custom sensitive terms.
- Keep Critical blocking enabled for public demonstrations.
- Report a redacted, synthetic reproduction when the detector needs improvement.

## 21. Local history is missing

Check:

```text
Settings → Privacy → Local history enabled
```

The application stores redacted history only when this option is enabled. Resetting the application or clearing conversations removes local history.

## 22. Language or theme does not update

1. Change the option in Settings.
2. Click **Save settings**.
3. Restart the app if the operating-system theme changed while the app was open.
4. If settings are corrupted, export non-secret settings when possible, then use **Reset application**.

## 23. Reset the application safely

Use:

```text
Settings → Advanced → Reset application
```

This removes local settings, credentials, history, and safety receipts. Export settings first when needed. The export does not include the raw provider key.

## 24. What information should I include in a bug report?

Include:

- TokenFence Studio version;
- operating system version;
- CPU architecture;
- installation source: Release or Actions artifact;
- exact non-secret error message;
- minimal reproduction steps;
- whether Demo Mode works;
- the first failed CI step when relevant.

Never include:

- API keys;
- passwords;
- complete private prompts;
- customer documents;
- unredacted environment files;
- credential-store screenshots that reveal values.

---

## 20. Builds succeeded but GitHub Releases did not update

This usually means the workflow only uploaded Actions artifacts, or `create_release` was disabled.

Use:

```text
GitHub → Actions → TokenFence macOS Builds and Release → Run workflow
```

Set:

```text
version: v1.6.1
create_release: true
make_latest: true
```

Then confirm that **Create or update GitHub Release** completes successfully. Source commits and Actions artifacts do not update the Releases page on their own.

## 21. README direct download link returns 404

The `releases/latest/download/...` URL works only after:

1. the v1.6.1 Release exists;
2. it is marked as Latest;
3. the exact asset filename is attached to the Release.

Open the Release Assets list and compare the filename character-for-character with the README link.

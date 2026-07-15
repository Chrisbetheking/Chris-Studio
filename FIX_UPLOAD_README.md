# TokenFence Studio v1.6.1 — macOS build emergency fix

This patch fixes the GitHub Actions failure at:

```text
npm --workspace apps/desktop run typecheck
```

## Root cause

The repository contains the old v1.5.x desktop UI and the new v1.6.1 desktop files at the same time. The previous upload overwrote only part of `apps/desktop/ui/src`, while the old TypeScript files remained. Because `tsconfig.json` included the entire `src` directory, GitHub Actions compiled both generations and reported duplicate imports, mismatched types, missing props, and unfinished preview screens.

The workflow also used `npm ci`, but the repository lockfile had not been regenerated after adding `@tauri-apps/api`. That is why the Tauri API imports could not be resolved in the runner.

## What this patch changes

1. Overwrites the actual v1.6.1 desktop entry, screens, safety scanner, provider client and platform bridge.
2. Changes desktop TypeScript scope to `src/main.tsx` and its real import graph. Unused legacy files no longer block the production app build.
3. Installs the Tauri API and React versions required by the desktop UI.
4. Changes the macOS workflow from `npm ci` to a synchronized `npm install`, so the runner installs dependencies declared by the uploaded package files even when the old root lockfile is stale.
5. Keeps Apple Silicon and Intel builds. Universal remains optional and is disabled by default for the first successful release.

## Upload

Upload every file and folder inside this patch to the repository root, preserving paths.

Commit message:

```text
fix: isolate v1.6.1 desktop UI and unblock macOS release build
```

Then run:

```text
Actions → TokenFence macOS Builds and Release → Run workflow
```

Use:

```text
version: v1.6.1
create_release: true
make_latest: true
build_universal: false
```

## Expected green jobs

```text
Prepare release metadata
Verify desktop UI and privacy boundary
macOS Apple-Silicon
macOS Intel
Create or update GitHub Release
```

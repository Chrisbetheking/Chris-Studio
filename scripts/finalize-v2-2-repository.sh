#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f package.json || ! -d apps/desktop ]]; then
  echo "Run this script from the Chris-Studio repository root." >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${HOME}/Desktop/Chris-Studio-repository-backup-${STAMP}"
mkdir -p "${BACKUP_DIR}"

# Preserve the current working tree before moving historical files.
git diff > "${BACKUP_DIR}/working-tree.patch" || true
git diff --cached > "${BACKUP_DIR}/staged.patch" || true
git status --short > "${BACKUP_DIR}/status.txt" || true
cp package.json package-lock.json "${BACKUP_DIR}/" 2>/dev/null || true

echo "Backup metadata written to: ${BACKUP_DIR}"

mkdir -p \
  docs/product \
  docs/development \
  docs/release-notes \
  docs/archive/upload-guides \
  docs/archive/validation-reports \
  docs/archive/change-summaries \
  docs/archive/release-checklists \
  docs/archive/migrations \
  docs/archive/screenshots \
  docs/archive/manifests \
  docs/archive/workflows \
  scripts/archive

move_file() {
  local src="$1"
  local dest="$2"
  [[ -e "$src" ]] || return 0
  mkdir -p "$(dirname "$dest")"
  if [[ -e "$dest" ]]; then
    local base ext name dir
    dir="$(dirname "$dest")"
    name="$(basename "$dest")"
    base="${name%.*}"
    ext="${name##*.}"
    if [[ "$base" == "$ext" ]]; then
      dest="${dir}/${name}-${STAMP}"
    else
      dest="${dir}/${base}-${STAMP}.${ext}"
    fi
  fi
  if git ls-files --error-unmatch "$src" >/dev/null 2>&1; then
    git mv "$src" "$dest"
  else
    mv "$src" "$dest"
  fi
  echo "Moved $src -> $dest"
}

shopt -s nullglob
for file in UPLOAD_*.md UPLOAD*.md FIX_UPLOAD_README.md PATCH_UPLOAD_README.md README_UPLOAD_GUIDE.md; do
  move_file "$file" "docs/archive/upload-guides/$(basename "$file")"
done
for file in VALIDATION_REPORT*.md; do
  move_file "$file" "docs/archive/validation-reports/$(basename "$file")"
done
for file in MACOS_RELEASE_CHECKLIST*.md; do
  move_file "$file" "docs/archive/release-checklists/$(basename "$file")"
done
for file in V*_CHANGE_SUMMARY*.md V*_FIX*.md V*_CI_*.md; do
  move_file "$file" "docs/archive/change-summaries/$(basename "$file")"
done
for file in MANIFEST* PATCH_*MANIFEST* PATCH_FILE_LIST.txt PATCH_SHA256SUMS.txt FILES_TO_UPLOAD.txt *.sha256; do
  move_file "$file" "docs/archive/manifests/$(basename "$file")"
done
for file in *_screenshot.png v*_screenshot.png; do
  move_file "$file" "docs/archive/screenshots/$(basename "$file")"
done
for file in fix_*.py verify_public.py; do
  move_file "$file" "scripts/archive/$(basename "$file")"
done

move_file FAST_TRACK_ROADMAP.zh-CN.md docs/product/roadmap.zh-CN.md
move_file PUBLISH_RELEASE_GUIDE.md docs/development/release.md
move_file START_HERE.zh-CN.md docs/development/start-here.zh-CN.md
move_file RENAME_TO_CHRIS_STUDIO.zh-CN.md docs/archive/migrations/rename-to-chris-studio.zh-CN.md

if [[ -f .github/workflows/tokenfence-macos.yml && ! -e .github/workflows/release-macos.yml ]]; then
  git mv .github/workflows/tokenfence-macos.yml .github/workflows/release-macos.yml
fi
if [[ -f .github/workflows/release.yml ]]; then
  if grep -Eqi 'legacy|manual notice|deprecated|retired|退役|旧版' .github/workflows/release.yml; then
    git mv .github/workflows/release.yml docs/archive/workflows/release.yml.disabled
  fi
fi

node <<'NODE'
const fs = require('node:fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.name = 'chris-studio';
pkg.version = '2.2.0';
pkg.private = true;
pkg.description = 'Local-first AI workspace with multi-model routing, reviewed agents and bounded macOS Computer Use.';
pkg.scripts = {
  ...(pkg.scripts || {}),
  'desktop:typecheck': 'npm --prefix apps/desktop/ui run typecheck',
  'desktop:test': 'npm --prefix apps/desktop/ui run test:core',
  'desktop:build': 'npm --prefix apps/desktop/ui run build',
  'desktop:check:rust': 'cargo check --locked --manifest-path apps/desktop/src-tauri/Cargo.toml',
};
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

if (fs.existsSync('package-lock.json')) {
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  lock.name = pkg.name;
  lock.version = pkg.version;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].name = pkg.name;
    lock.packages[''].version = pkg.version;
  }
  fs.writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
}
NODE

cat > docs/development/repository-structure.md <<'DOC'
# Chris Studio repository structure

## Primary product

- `apps/desktop/ui/` — React and TypeScript desktop interface.
- `apps/desktop/src-tauri/` — Rust, Tauri and native macOS commands.

## Supported infrastructure

- `packages/shared/` — Shared packages.
- `mcp/` — Reviewed MCP integrations.
- `scripts/` — Build, validation and release automation.
- `.github/workflows/` — Active CI and macOS release workflows.

## Legacy or experimental areas

`apps/web`, `apps/android`, `cli` and `examples` are retained until their dependency usage is audited. They are not the primary v2.2 desktop release target.

## Root policy

Keep source directories, core configuration, README files, changelog, license and security policy in the repository root. One-time upload guides, screenshots, manifests and validation reports belong in `docs/archive/`.
DOC

cat > docs/product/maintenance-status.md <<'DOC'
# Maintenance status

| Area | Status |
| --- | --- |
| `apps/desktop` | Active, primary product |
| `packages/shared` | Supported |
| `mcp` | Supported beta |
| `apps/web` | Legacy / experimental |
| `apps/android` | Legacy / experimental |
| `cli` | Audit required before removal |
| `examples` | Reference only |
DOC

cat > docs/README.md <<'DOC'
# Chris Studio documentation

- [Repository structure](development/repository-structure.md)
- [Maintenance status](product/maintenance-status.md)
- [Roadmap](product/roadmap.zh-CN.md)
- [Release guide](development/release.md)
- [Release notes and historical reports](archive/)
DOC

# Keep README links valid after moves.
for readme in README.md README.zh-CN.md; do
  [[ -f "$readme" ]] || continue
  perl -0pi -e 's#FAST_TRACK_ROADMAP\.zh-CN\.md#docs/product/roadmap.zh-CN.md#g; s#RENAME_TO_CHRIS_STUDIO\.zh-CN\.md#docs/archive/migrations/rename-to-chris-studio.zh-CN.md#g; s#PUBLISH_RELEASE_GUIDE\.md#docs/development/release.md#g; s#tokenfence-macos\.yml#release-macos.yml#g' "$readme"
done

if ! grep -q 'Chris Studio repository hygiene' .gitignore 2>/dev/null; then
  cat >> .gitignore <<'IGNORE'

# Chris Studio repository hygiene
/Chris_Studio_*_PATCH.zip
/Chris_Studio_*_PATCH.sha256
/*_PATCH_FILE_MANIFEST.sha256
/UPLOAD_*.md
/VALIDATION_REPORT_*.md
/*_screenshot.png
/.tokenfence-test-build/
/apps/desktop/ui/dist/
/apps/desktop/src-tauri/target/
IGNORE
fi

node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); JSON.parse(require('fs').readFileSync('package-lock.json','utf8'));"
if [[ -f scripts/verify-public-npm-locks.cjs ]]; then node scripts/verify-public-npm-locks.cjs; fi
git add -A
git diff --cached --check

echo
echo "Repository closeout prepared. Nothing was committed or pushed."
echo "Review with: git status --short && git diff --cached --stat"
echo "Then run the normal desktop test suite before committing."

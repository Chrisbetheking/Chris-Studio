/**
 * Chris Studio release sanity check (v2.4, macOS).
 *
 * Verifies that a version is internally consistent before a release build is
 * dispatched: every manifest, the sidebar label, the About fallback, the README
 * promises, and the workflow's artifact names must agree. Historical Windows
 * packaging assertions were retired together with the Windows build; the macOS
 * DMG/APP-ZIP names in scripts/package-macos-release.sh are authoritative now.
 *
 * Run: npm run release:sanity -- v2.4.0-alpha.2
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const VERSION = process.argv[2];

if (!VERSION) {
  console.error("Usage: node scripts/release_sanity.js <version>");
  console.error("Example: node scripts/release_sanity.js v2.4.0-alpha.2");
  process.exit(1);
}

const errors = [];

function fail(msg) {
  errors.push(msg);
  console.error("  FAIL: " + msg);
}
function ok(msg) {
  console.log("  OK: " + msg);
}
function section(title) {
  console.log("\n--- " + title + " ---");
}
function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf-8");
}
function exists(relative) {
  return fs.existsSync(path.join(ROOT, relative));
}
function checkContains(relative, needle, label) {
  if (!exists(relative)) {
    fail(relative + ": NOT FOUND");
    return;
  }
  if (read(relative).includes(needle)) ok((label || relative) + ": contains " + JSON.stringify(needle).slice(0, 70));
  else fail((label || relative) + ': MISSING "' + needle + '"');
}
function checkMissing(relative, needle, label) {
  if (!exists(relative)) {
    fail(relative + ": NOT FOUND");
    return;
  }
  if (!read(relative).includes(needle)) ok((label || relative) + ": free of " + JSON.stringify(needle).slice(0, 60));
  else fail((label || relative) + ': still contains "' + needle + '"');
}

const v = VERSION.replace(/^v/, "");
const vTag = "v" + v;
const isPrerelease = v.includes("-");

console.log("\n=== Release sanity check for " + vTag + " ===");
console.log("  INFO: prerelease=" + isPrerelease);

// ============================================================
// 1. Version consistency across every manifest and label.
// ============================================================
section("Version consistency");
const versionChecks = [
  { file: "apps/desktop/ui/package.json", needle: '"version": "' + v + '"' },
  { file: "apps/desktop/package.json", needle: '"version": "' + v + '"' },
  { file: "package.json", needle: '"version": "' + v + '"' },
  { file: "apps/desktop/src-tauri/Cargo.toml", needle: 'version = "' + v + '"' },
  { file: "apps/desktop/src-tauri/tauri.conf.json", needle: '"version": "' + v + '"' },
  { file: "apps/desktop/src-tauri/Cargo.lock", needle: 'name = "chris-studio"\nversion = "' + v + '"' },
  { file: "apps/desktop/ui/src/App.tsx", needle: "v" + v + " \u00b7 macOS" },
  { file: "apps/desktop/ui/src/screens/AboutScreen.tsx", needle: "appVersion: '" + v + "'" },
  { file: "package.json", needle: '"name": "chris-studio"' },
];
for (const item of versionChecks) checkContains(item.file, item.needle);

section("Workflow version default");
checkContains(".github/workflows/tokenfence-macos.yml", "default: v2.4.0-alpha.2", "release workflow default");
checkContains(".github/workflows/tokenfence-macos.yml", "prerelease: ${{ contains(inputs.version, '-') }}", "prerelease guard");

// ============================================================
// 2. Developer identity surface.
// ============================================================
section("Developer identity");
checkContains("apps/desktop/ui/src/app/identity.ts", "chriswangjob@163.com", "contact email");
checkContains("apps/desktop/ui/src/app/identity.ts", "easymoneysniperchris", "contact WeChat");
checkContains("apps/desktop/ui/src/screens/AboutScreen.tsx", "CHRIS_STUDIO_CONTACT", "About contact binding");
checkContains("apps/desktop/ui/src/screens/ChatWorkspace.tsx", "checkDeveloperIdentityQuestion", "identity interceptor");
checkContains("apps/desktop/ui/src/screens/ChatWorkspace.tsx", "designed and built end-to-end by Chris", "identity EN");
const retiredEmail = ["chrisjob", "163.com"].join("@");
for (const f of ["README.md", "README.zh-CN.md", "docs/RELEASE_CHECKLIST.md", "scripts/release_sanity.js"]) {
  checkMissing(f, retiredEmail, f);
}

// ============================================================
// 3. Release documentation + asset naming.
// ============================================================
section("Release documentation");
const readmeVersionPattern = new RegExp("Chris Studio v" + v.replace(/\./g, "\\."));
for (const f of ["README.md", "README.zh-CN.md"]) {
  if (!exists(f)) {
    fail(f + ": NOT FOUND");
    continue;
  }
  const content = read(f);
  if (readmeVersionPattern.test(content)) ok(f + ": documents " + vTag);
  else fail(f + ": does not document " + vTag);
  checkMissing(f, "portable.exe", f);
  checkContains(f, "Chris Studio macOS Builds and Release", f);
}

section("macOS artifact naming");
checkContains("scripts/package-macos-release.sh", 'DMG_NAME="Chris-Studio-macOS-${SLUG}.dmg"', "DMG name");
checkContains("scripts/package-macos-release.sh", 'APP_ZIP_NAME="Chris-Studio-macOS-${SLUG}.app.zip"', "APP ZIP name");
checkContains("scripts/package-macos-release.sh", 'INSTALLER_NAME="Install-Chris-Studio-${SLUG}.command"', "installer name");
checkContains(".github/workflows/tokenfence-macos.yml", "slug: Apple-Silicon", "Apple Silicon matrix entry");
checkContains(".github/workflows/tokenfence-macos.yml", "slug: Intel", "Intel matrix entry");

// ============================================================
// 4. Repository hygiene.
// ============================================================
section(".gitignore check");
if (exists(".gitignore")) {
  for (const required of ["*.zip", "*.exe", "*.msi", "node_modules"]) {
    if (read(".gitignore").includes(required)) ok(".gitignore: contains " + required);
    else fail(".gitignore: MISSING " + required);
  }
} else {
  fail(".gitignore: FILE NOT FOUND");
}

section("Tracked binary check");
let trackedBinary = false;
for (const pattern of ["*.zip", "*.exe", "*.msi", "*.msix", "*.appx", "*.7z", "*.rar", "*.dmg"]) {
  try {
    const tracked = execSync("git ls-files " + pattern, { cwd: ROOT, encoding: "utf-8" }).trim();
    if (tracked) {
      fail(pattern + " tracked in git: " + tracked.split("\n").slice(0, 3).join(", "));
      trackedBinary = true;
    }
  } catch (error) {
    /* no matches is expected */
  }
}
if (!trackedBinary) ok("no release binaries tracked");

// ============================================================
// 5. Secret hygiene.
// ============================================================
section("Secret leak check");
const secretPatterns = [
  { pattern: /ghp_[A-Za-z0-9]{36}/, label: "GitHub PAT (ghp_)" },
  { pattern: /gho_[A-Za-z0-9]{36}/, label: "GitHub OAuth token (gho_)" },
  { pattern: /github_pat_[A-Za-z0-9_]{36,}/, label: "GitHub fine-grained PAT" },
  { pattern: /sk-[A-Za-z0-9]{32,}/, label: "provider API key (sk-)" },
  { pattern: /AKIA[0-9A-Z]{16}/, label: "AWS access key" },
];
const secretFiles = [
  "README.md", "README.zh-CN.md",
  "docs/RELEASE_CHECKLIST.md",
  "scripts/source_guard.js", "scripts/release_sanity.js",
  ".github/workflows/ci.yml", ".github/workflows/tokenfence-macos.yml",
  "apps/desktop/ui/src/app/identity.ts",
];
let leaked = 0;
for (const relative of secretFiles) {
  if (!exists(relative)) continue;
  const content = read(relative);
  for (const entry of secretPatterns) {
    if (entry.pattern.test(content)) {
      fail(relative + ": contains " + entry.label);
      leaked += 1;
    }
  }
}
if (leaked === 0) ok("no credential patterns in scanned files");

// ============================================================
// 6. Core source size floors.
// ============================================================
section("Core source size");
const coreFiles = [
  { file: "apps/desktop/ui/src/App.tsx", min: 250 },
  { file: "apps/desktop/ui/src/screens/WorkspaceScreen.tsx", min: 300 },
  { file: "apps/desktop/ui/src/screens/ProjectsScreen.tsx", min: 400 },
  { file: "apps/desktop/ui/src/screens/ChatWorkspace.tsx", min: 1000 },
  { file: "apps/desktop/ui/src/features/unified-agent/manager.ts", min: 300 },
  { file: "apps/desktop/src-tauri/src/main.rs", min: 1000 },
  { file: "apps/desktop/src-tauri/src/unified_agent_native.rs", min: 100 },
  { file: "scripts/source_guard.js", min: 150 },
  { file: "scripts/release_sanity.js", min: 80 },
  { file: ".github/workflows/ci.yml", min: 40 },
  { file: "docs/RELEASE_CHECKLIST.md", min: 60 },
  { file: "README.zh-CN.md", min: 80 },
];
for (const item of coreFiles) {
  const fp = path.join(ROOT, item.file);
  if (!fs.existsSync(fp)) {
    fail(item.file + ": NOT FOUND");
    continue;
  }
  const lines = fs.readFileSync(fp, "utf-8").split("\n").length;
  if (lines < item.min) fail(item.file + ": " + lines + " lines (min " + item.min + ")");
  else ok(item.file + ": " + lines + " lines");
}

// ============================================================
// 7. LF enforcement + bilingual parity.
// ============================================================
section(".gitattributes check");
if (exists(".gitattributes")) {
  const ga = read(".gitattributes");
  if (ga.includes("text=auto") || ga.includes("* text=auto")) ok(".gitattributes: LF enforcement found");
  else fail(".gitattributes: no LF enforcement for source files");
} else {
  fail(".gitattributes: FILE NOT FOUND");
}

section("Bilingual key parity");
const i18nKeys = [
  { file: "packages/shared/src/i18n/zh-CN.ts", key: "\u672A\u914D\u7F6E\u6A21\u578B", label: "no-configured-model label" },
  { file: "packages/shared/src/i18n/zh-CN.ts", key: "\u8BBE\u4E3A\u5F53\u524D\u6A21\u578B", label: "set-as-active label" },
  { file: "packages/shared/src/i18n/zh-CN.ts", key: "\u6B63\u5728\u4F7F\u7528", label: "in-use label" },
  { file: "packages/shared/src/i18n/en.ts", key: "No configured model", label: "no-configured-model label" },
  { file: "packages/shared/src/i18n/en.ts", key: "Set as active", label: "set-as-active label" },
  { file: "packages/shared/src/i18n/en.ts", key: "In use", label: "in-use label" },
  { file: "packages/shared/src/i18n/en.ts", key: "modelCount", label: "model count template" },
  { file: "packages/shared/src/i18n/zh-CN.ts", key: "modelCount", label: "model count template" },
];
for (const item of i18nKeys) checkContains(item.file, item.key, item.label);

// The bilingual dictionaries must declare the same key tree; a drift here is
// what let a quarter of the Chinese UI silently fall back to English.
if (exists("packages/shared/src/i18n/en.ts") && exists("packages/shared/src/i18n/zh-CN.ts")) {
  const countKeys = (source) => (source.match(/^\s{2,}[A-Za-z][A-Za-z0-9]*:/gm) || []).length;
  const enKeys = countKeys(read("packages/shared/src/i18n/en.ts"));
  const zhKeys = countKeys(read("packages/shared/src/i18n/zh-CN.ts"));
  const drift = Math.abs(enKeys - zhKeys);
  if (drift <= 2) ok("i18n key counts align (en=" + enKeys + ", zh-CN=" + zhKeys + ")");
  else fail("i18n key drift: en=" + enKeys + " zh-CN=" + zhKeys + " (difference " + drift + ")");
}

// ============================================================
console.log("\n=== RESULT: " + errors.length + " error(s) ===");
if (errors.length > 0) {
  console.log("Failures:");
  errors.forEach((entry) => console.log("  - " + entry));
  process.exit(1);
}
console.log("Release sanity check passed.");
process.exit(0);

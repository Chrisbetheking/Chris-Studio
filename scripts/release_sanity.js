const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const VERSION = process.argv[2];

if (!VERSION) {
  console.error("Usage: node scripts/release_sanity.js <version>");
  console.error("Example: node scripts/release_sanity.js v1.2.7");
  process.exit(1);
}

let errors = [];

function fail(msg) {
  errors.push(msg);
  console.error("  FAIL: " + msg);
}

function ok(msg) {
  console.log("  OK: " + msg);
}

const v = VERSION.replace(/^v/, "");
const vTag = "v" + v;

console.log("\n=== Release sanity check for " + vTag + " ===");

// 1. Version consistency
console.log("\n--- Version consistency ---");
const checks = [
  { file: "apps/desktop/ui/src/App.tsx", pattern: 'const VERSION = "' + vTag + '"' },
  { file: "apps/desktop/src-tauri/tauri.conf.json", pattern: '"version": "' + v + '"' },
  { file: "apps/desktop/src-tauri/Cargo.toml", pattern: 'version = "' + v + '"' },
  { file: "package.json", pattern: '"name": "tokenfence-studio"' },
];

for (const item of checks) {
  const fp = path.join(ROOT, item.file);
  if (!fs.existsSync(fp)) {
    fail(item.file + ": NOT FOUND");
    continue;
  }
  const content = fs.readFileSync(fp, "utf-8");
  if (content.includes(item.pattern)) {
    ok(item.file + ': contains "' + item.pattern + '"');
  } else {
    fail(item.file + ': MISSING "' + item.pattern + '"');
  }
}

// 1.5. About page version check
console.log("\n--- About page version check ---");
var aboutPath = path.join(ROOT, "apps/desktop/ui/src/screens/AboutScreen.tsx");
if (fs.existsSync(aboutPath)) {
  var aboutContent = fs.readFileSync(aboutPath, "utf-8");
  if (aboutContent.indexOf("v0.5.0-dev") >= 0) fail("AboutScreen.tsx still contains v0.5.0-dev");
  else ok("AboutScreen.tsx does not contain v0.5.0-dev");
  if (aboutContent.indexOf('import { VERSION }') >= 0) ok("AboutScreen.tsx imports VERSION from App");
  else fail("AboutScreen.tsx MISSING VERSION import");
  if (aboutContent.indexOf("chrisjob@163.com") >= 0) ok("AboutScreen.tsx contains contact email");
  else fail("AboutScreen.tsx MISSING contact email");
  if (aboutContent.indexOf("easymoneysniperchris") >= 0) ok("AboutScreen.tsx contains WeChat");
  else fail("AboutScreen.tsx MISSING WeChat");
} else { fail("AboutScreen.tsx NOT FOUND"); }
// 2. README download links
console.log("\n--- README download links ---");
const zipName = "TokenFence-Studio-Windows-" + vTag + "-portable.zip";
for (const f of ["README.md", "README.zh-CN.md"]) {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) {
    fail(f + ": NOT FOUND");
    continue;
  }
  const content = fs.readFileSync(fp, "utf-8");
  if (content.includes(zipName)) {
    ok(f + ": contains " + zipName);
  } else {
    fail(f + ": MISSING " + zipName);
  }
  // Ensure no old version links remain
  if (content.includes("portable.exe")) {
    fail(f + ': contains deprecated "portable.exe" link');
  }
}

// 3. .gitignore sanity
console.log("\n--- .gitignore check ---");
const giPath = path.join(ROOT, ".gitignore");
if (fs.existsSync(giPath)) {
  const gi = fs.readFileSync(giPath, "utf-8");
  const required = ["*.zip", "*.exe", "*.msi", "node_modules"];
  for (const r of required) {
    if (gi.includes(r)) {
      ok(".gitignore: contains " + r);
    } else {
      fail(".gitignore: MISSING " + r);
    }
  }
} else {
  fail(".gitignore: FILE NOT FOUND");
}

// 4. Tracked binary check
console.log("\n--- Tracked binary check ---");
const binaryPatterns = ["*.zip", "*.exe", "*.msi", "*.msix", "*.appx", "*.7z", "*.rar"];
var hasTrackedBinary = false;
for (const pat of binaryPatterns) {
  try {
    const tracked = execSync("git ls-files " + pat, { cwd: ROOT, encoding: "utf-8" }).trim();
    if (tracked) {
      fail(pat + " tracked in git: " + tracked);
      hasTrackedBinary = true;
    }
  } catch (e) { /* no matches is OK */ }
}
if (!hasTrackedBinary) ok("no binary files tracked");

// 5. ZIP asset name match
console.log("\n--- ZIP asset name ---");
const zipPath = path.join(ROOT, zipName);
if (fs.existsSync(zipPath)) {
  ok("ZIP exists: " + zipName);
} else {
  console.log("  INFO: ZIP not yet built (expected before release)");
}

// 6. Secret leak check
console.log("\n--- Secret leak check ---");
const secretPatterns = [
  /ghp_[A-Za-z0-9]{36}/,
  /gho_[A-Za-z0-9]{36}/,
  /sk-[A-Za-z0-9]{32,}/,
  /github_pat_[A-Za-z0-9]{36,}/,
];
const checkFiles = [
  "README.md", "README.zh-CN.md",
  "docs/RELEASE_CHECKLIST.md",
  "scripts/source_guard.js", "scripts/release_sanity.js",
  ".github/workflows/ci.yml"
];
for (const f of checkFiles) {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) continue;
  const content = fs.readFileSync(fp, "utf-8");
  for (const pat of secretPatterns) {
    if (pat.test(content)) {
      fail(f + ": contains secret/key pattern");
    }
  }
}
ok("no secrets leaked");

// 7. Core source size (full list matching source_guard.js)
console.log("\n--- Core source size ---");
const coreFiles = [
  { file: "apps/desktop/ui/src/App.tsx", min: 250 },
  { file: "apps/desktop/ui/src/components/AppTitleBar.tsx", min: 80 },
  { file: "apps/desktop/ui/src/components/AgentPatchPanel.tsx", min: 220 },
  { file: "apps/desktop/ui/src/agentModelBridge.ts", min: 120 },
  { file: "apps/desktop/ui/src/screens/ToolboxScreen.tsx", min: 180 },
  { file: "apps/desktop/ui/src/desktop-bridge.ts", min: 100 },
  { file: "apps/desktop/src-tauri/src/main.rs", min: 100 },
  { file: "scripts/source_guard.js", min: 150 },
  { file: "scripts/release_sanity.js", min: 80 },
  { file: ".github/workflows/ci.yml", min: 50 },
  { file: "docs/RELEASE_CHECKLIST.md", min: 60 },
  { file: "README.zh-CN.md", min: 80 },
  { file: "apps/desktop/ui/src/data/active-model.ts", min: 200 },
  { file: "apps/desktop/ui/src/components/CustomModelModal.tsx", min: 100 },
  { file: "apps/desktop/ui/src/components/ProviderConfigModal.tsx", min: 200 },
  { file: "apps/desktop/ui/src/components/ProviderSetupWizard.tsx", min: 180 },
];
for (const item of coreFiles) {
  const fp = path.join(ROOT, item.file);
  if (!fs.existsSync(fp)) {
    fail(item.file + ": NOT FOUND");
    continue;
  }
  const lines = fs.readFileSync(fp, "utf-8").split("\n").length;
  if (lines < item.min) {
    fail(item.file + ": " + lines + " lines (min " + item.min + ")");
  } else {
    ok(item.file + ": " + lines + " lines");
  }
}

// 8. Verify .gitattributes enforces LF
console.log("\n--- .gitattributes check ---");
const gaPath = path.join(ROOT, ".gitattributes");
if (fs.existsSync(gaPath)) {
  const ga = fs.readFileSync(gaPath, "utf-8");
  const hasTextAuto = ga.includes("text=auto") || ga.includes("* text=auto");
  const hasTsxLF = ga.includes("*.tsx") || ga.includes("*.ts text");
  if (hasTextAuto || hasTsxLF) {
    ok(".gitattributes: LF enforcement found");
  } else {
    fail(".gitattributes: no LF enforcement for source files");
  }
} else {
  fail(".gitattributes: FILE NOT FOUND");
}

// 9. i18n consistency check
console.log("\n--- i18n consistency ---");
const i18nPairs = [
  { file: "packages/shared/src/i18n/zh-CN.ts", key: "\u672A\u914D\u7F6E\u6A21\u578B", label: "no-configured-model label" },
  { file: "packages/shared/src/i18n/zh-CN.ts", key: "\u8BBE\u4E3A\u5F53\u524D\u6A21\u578B", label: "set-as-active label" },
  { file: "packages/shared/src/i18n/zh-CN.ts", key: "\u6B63\u5728\u4F7F\u7528", label: "in-use label" },
  { file: "packages/shared/src/i18n/en.ts", key: "No configured model", label: "no-configured-model label" },
  { file: "packages/shared/src/i18n/en.ts", key: "Set as active", label: "set-as-active label" },
  { file: "packages/shared/src/i18n/en.ts", key: "In use", label: "in-use label" },
];
for (const item of i18nPairs) {
  const fp = path.join(ROOT, item.file);
  if (!fs.existsSync(fp)) { fail(item.file + ": NOT FOUND"); continue; }
  const content = fs.readFileSync(fp, "utf-8");
  if (content.includes(item.key)) { ok(item.file + ": contains " + item.label); }
  else { fail(item.file + ": MISSING " + item.label); }
}
const amPath = path.join(ROOT, "apps/desktop/ui/src/data/active-model.ts");
if (fs.existsSync(amPath)) {
  const am = fs.readFileSync(amPath, "utf-8");
  if (am.includes("NO_CONFIGURED_MODEL_LABEL_EN") && am.includes("NO_CONFIGURED_MODEL_LABEL_ZH")) {
    ok("active-model.ts contains both i18n label constants");
  } else { fail("active-model.ts MISSING i18n label constant(s)"); }
}

// Final
console.log("\n=== RESULT: " + errors.length + " error(s) ===");
if (errors.length > 0) {
  console.log("Failures:");
  errors.forEach(function(e) { console.log("  - " + e); });
  process.exit(1);
} else {
  console.log("Release sanity check passed.");
  process.exit(0);
}

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const VERSION = process.argv[2];

if (!VERSION) {
  console.error("Usage: node scripts/release_sanity.js <version>");
  console.error("Example: node scripts/release_sanity.js v1.1.5");
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

const v = VERSION.replace(/^v/, ""); // "1.1.5"
const vTag = "v" + v;

console.log(`\n=== Release sanity check for ${vTag} ===`);

// ===== 1. Version consistency =====
console.log("\n--- Version consistency ---");

const checks = [
  { file: "apps/desktop/ui/src/App.tsx", pattern: `const VERSION = "${vTag}"` },
  { file: "apps/desktop/src-tauri/tauri.conf.json", pattern: `"version": "${v}"` },
  { file: "apps/desktop/src-tauri/Cargo.toml", pattern: `version = "${v}"` },
];

for (const { file, pattern } of checks) {
  const fp = path.join(ROOT, file);
  if (!fs.existsSync(fp)) {
    fail(`${file}: NOT FOUND`);
    continue;
  }
  const content = fs.readFileSync(fp, "utf-8");
  if (content.includes(pattern)) {
    ok(`${file}: contains "${pattern}"`);
  } else {
    fail(`${file}: MISSING "${pattern}"`);
  }
}

// ===== 2. README download links =====
console.log("\n--- README download links ---");
const zipName = `TokenFence-Studio-Windows-${vTag}-portable.zip`;
const readmes = ["README.md", "README.zh-CN.md"];

for (const f of readmes) {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) continue;
  const content = fs.readFileSync(fp, "utf-8");
  if (content.includes(zipName)) {
    ok(`${f}: contains ${zipName}`);
  } else {
    fail(`${f}: MISSING ${zipName}`);
  }
}

// ===== 3. No raw keys / secrets =====
console.log("\n--- Secret leak check ---");
const sensitivePatterns = [
  /ghp_[A-Za-z0-9]{36}/,
  /gho_[A-Za-z0-9]{36}/,
  /sk-[A-Za-z0-9]{32,}/,
  /AIza[0-9A-Za-z\-_]{35}/,
];

const sensitiveFiles = ["README.md", "README.zh-CN.md", "docs/RELEASE_CHECKLIST.md"];
// Also check scripts
sensitiveFiles.push("scripts/source_guard.js", "scripts/release_sanity.js");
// Check CI
sensitiveFiles.push(".github/workflows/ci.yml");

for (const f of sensitiveFiles) {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) continue;
  const content = fs.readFileSync(fp, "utf-8");
  for (const pat of sensitivePatterns) {
    if (pat.test(content)) {
      fail(`${f}: contains sensitive key/token pattern`);
    }
  }
}
ok("no secrets leaked in checked files");

// ===== 4. Core source line check =====
console.log("\n--- Core source size ---");
const coreFiles = [
  { file: "apps/desktop/ui/src/components/AgentPatchPanel.tsx", min: 180 },
  { file: "apps/desktop/ui/src/screens/ToolboxScreen.tsx", min: 180 },
  { file: "apps/desktop/ui/src/desktop-bridge.ts", min: 100 },
  { file: "apps/desktop/src-tauri/src/main.rs", min: 100 },
];

for (const { file, min } of coreFiles) {
  const fp = path.join(ROOT, file);
  if (!fs.existsSync(fp)) {
    fail(`${file}: NOT FOUND`);
    continue;
  }
  const lines = fs.readFileSync(fp, "utf-8").split("\n").length;
  if (lines < min) {
    fail(`${file}: ${lines} lines (min ${min})`);
  } else {
    ok(`${file}: ${lines} lines`);
  }
}

// ===== Final =====
console.log(`\n=== RESULT: ${errors.length} error(s) ===`);
if (errors.length > 0) {
  console.log("Failures:");
  errors.forEach(e => console.log("  - " + e));
  process.exit(1);
} else {
  console.log("Release sanity check passed.");
  process.exit(0);
}

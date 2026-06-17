const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
let errors = [];

function fail(msg) {
  errors.push(msg);
  console.error("  FAIL: " + msg);
}

function ok(msg) {
  console.log("  OK: " + msg);
}

// ===== 1. Core file line counts =====
console.log("\n--- Core file line counts ---");
const coreFiles = [
  { file: "apps/desktop/ui/src/components/AgentPatchPanel.tsx", min: 180 },
  { file: "apps/desktop/ui/src/screens/ToolboxScreen.tsx", min: 180 },
  { file: "apps/desktop/ui/src/desktop-bridge.ts", min: 100 },
  { file: "apps/desktop/src-tauri/src/main.rs", min: 100 },
  { file: "packages/shared/src/installed-models.ts", min: 50 },
];

for (const { file, min } of coreFiles) {
  const fp = path.join(ROOT, file);
  if (!fs.existsSync(fp)) {
    fail(file + ": FILE NOT FOUND");
    continue;
  }
  const content = fs.readFileSync(fp, "utf-8");
  const lines = content.split("\n").length;
  if (lines < min) {
    fail(file + ": " + lines + " lines (min " + min + ") - TOO SHORT");
  } else {
    ok(file + ": " + lines + " lines");
  }
}

// ===== 2. Bad pattern check =====
console.log("\n--- Bad pattern check ---");
// Bad i18n key leaks (these should never appear as bare strings in TSX)
const badKeys = [
  "providersPage.title",
  "computerUse.enabledLabel",
  "chat.agentStep",
];

const checkFiles = coreFiles.map(function(c) { return c.file; });
checkFiles.push("apps/desktop/ui/src/App.tsx");

// Mojibake check: these are GBK-misinterpreted UTF-8 sequences
// 0xE5 0xA6 0x82 = 濡 (GBK misinterpretation)
// We check raw bytes for common mojibake patterns
const mojibakeBytes = [
  { name: "mojibake-濡", bytes: [0xE6, 0xBF, 0x91] },  // 濡 in UTF-8 is actually E6 B9 A6
];

for (const f of checkFiles) {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) continue;
  const buf = fs.readFileSync(fp);
  
  // Check for bad i18n keys in content
  const content = buf.toString("utf-8");
  for (const key of badKeys) {
    if (content.includes(key)) {
      fail(f + ': leaked i18n key "' + key + '"');
    }
  }
  
  // Check for mojibake byte sequences
  // Common mojibake patterns from GBK<->UTF-8 corruption
  // æ (0xC3A6) appears in mojibake
  // å (0xC3A5) appears in mojibake  
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 0xC3 && (buf[i+1] === 0xA6 || buf[i+1] === 0xA5 || buf[i+1] === 0xA9)) {
      fail(f + ": possible mojibake at byte " + i);
      break;
    }
  }
}
ok("bad patterns checked");

// ===== 3. Bare ### in TSX =====
console.log("\n--- Bare ### in TSX ---");
const tsxFiles = [
  "apps/desktop/ui/src/components/AgentPatchPanel.tsx",
  "apps/desktop/ui/src/screens/ToolboxScreen.tsx",
];

for (const f of tsxFiles) {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) continue;
  const lines = fs.readFileSync(fp, "utf-8").split("\n");
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Bare ### at start of line (not inside string or regex context)
    if (/^\s*###/.test(line)) {
      // Allow if it looks like it's inside a template literal or regex
      var trimmed = line.trimStart();
      if (trimmed.startsWith("###")) {
        fail(f + ":" + (i+1) + ': bare ### heading: "' + line.trim() + '"');
        found = true;
      }
    }
  }
  if (!found) ok(f + ": no bare ###");
}

// ===== 4. Tracked ZIPs =====
console.log("\n--- Tracked ZIP check ---");
try {
  const tracked = execSync("git ls-files *.zip", { cwd: ROOT, encoding: "utf-8" }).trim();
  if (tracked) {
    fail("ZIP files tracked in git: " + tracked);
  } else {
    ok("no ZIP files tracked");
  }
} catch (e) {
  fail("git ls-files failed: " + e.message);
}

// ===== 5. README encoding check =====
console.log("\n--- README check ---");
const readmes = ["README.md", "README.zh-CN.md"];

for (const f of readmes) {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) {
    fail(f + ": FILE NOT FOUND");
    continue;
  }
  const buf = fs.readFileSync(fp);
  
  // Check BOM
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    fail(f + ": has UTF-8 BOM");
  }
  
  // Check for CR
  var crCount = 0;
  for (var bi = 0; bi < buf.length; bi++) {
    if (buf[bi] === 0x0D) crCount++;
  }
  if (crCount > 0) {
    fail(f + ": " + crCount + " CR bytes, should be LF-only");
  }
  
  // Validate UTF-8 and line count
  try {
    const text = buf.toString("utf-8");
    const lines = text.split("\n").length;
    if (lines < 80) {
      fail(f + ": " + lines + " lines (min 80)");
    } else {
      ok(f + ": UTF-8, LF-only, " + lines + " lines");
    }
  } catch (e) {
    fail(f + ": invalid UTF-8");
  }
}

// ===== Final =====
console.log("\n=== RESULT: " + errors.length + " error(s) ===");
if (errors.length > 0) {
  console.log("Failures:");
  errors.forEach(function(e) { console.log("  - " + e); });
  process.exit(1);
} else {
  console.log("All checks passed.");
  process.exit(0);
}

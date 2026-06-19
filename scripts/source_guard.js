const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
var errors = [];

function fail(msg) { errors.push(msg); console.error("  FAIL: " + msg); }
function ok(msg) { console.log("  OK: " + msg); }

// ===== 1. Core file line counts =====
console.log("\n--- Core file line counts ---");
var coreFiles = [
  { file: "apps/desktop/ui/src/App.tsx", min: 250 },
  { file: "apps/desktop/ui/src/components/AppTitleBar.tsx", min: 80 },
  { file: "apps/desktop/ui/src/components/AgentPatchPanel.tsx", min: 220 },
  { file: "apps/desktop/ui/src/agentModelBridge.ts", min: 120 },
  { file: "apps/desktop/ui/src/screens/ToolboxScreen.tsx", min: 180 },
  { file: "apps/desktop/ui/src/desktop-bridge.ts", min: 100 },
  { file: "apps/desktop/src-tauri/src/main.rs", min: 100 },
  { file: "apps/desktop/ui/src/data/active-model.ts", min: 450 },
  { file: "apps/desktop/ui/src/components/CustomModelModal.tsx", min: 100 },
  { file: "apps/desktop/ui/src/components/ProviderConfigModal.tsx", min: 200 },
  { file: "apps/desktop/ui/src/components/ProviderSetupWizard.tsx", min: 180 },
  { file: "apps/desktop/ui/src/screens/ModelsScreen.tsx", min: 500 },
  { file: "apps/desktop/ui/src/screens/ChatWorkspace.tsx", min: 1755 },
  { file: "apps/desktop/ui/src/components/ModelRuntimeSelfTest.tsx", min: 150 },
  { file: "scripts/source_guard.js", min: 150 },
  { file: "scripts/release_sanity.js", min: 80 },
  { file: ".github/workflows/ci.yml", min: 40 },
  { file: "docs/RELEASE_CHECKLIST.md", min: 60 },
  { file: "README.zh-CN.md", min: 80 },
];

for (var i = 0; i < coreFiles.length; i++) {
  var item = coreFiles[i];
  var fp = path.join(ROOT, item.file);
  if (!fs.existsSync(fp)) { fail(item.file + ": FILE NOT FOUND"); continue; }
  var content = fs.readFileSync(fp, "utf-8");
  var lines = content.split("\n").length;
  if (lines < item.min) { fail(item.file + ": " + lines + " lines (min " + item.min + ")"); }
  else { ok(item.file + ": " + lines + " lines"); }
}

// ===== 2. BOM and encoding check (UTF-8, CR, minified) =====
console.log("\n--- BOM and encoding check ---");
for (var i = 0; i < coreFiles.length; i++) {
  var item = coreFiles[i];
  var fp = path.join(ROOT, item.file);
  if (!fs.existsSync(fp)) continue;
  var buf = fs.readFileSync(fp);
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) { fail(item.file + ": has BOM"); }
  var crCount = 0;
  for (var bi = 0; bi < buf.length; bi++) { if (buf[bi] === 0x0D) crCount++; }
  if (crCount > 0) { fail(item.file + ": " + crCount + " CR bytes"); }
  try {
    var text = buf.toString("utf-8");
    var lines = text.split("\n").length;
    if (lines < 5 && text.length > 200) { fail(item.file + ": minified"); }
    if (text.length / Math.max(lines, 1) > 800) { fail(item.file + ": possible single-line"); }
  } catch (e) { fail(item.file + ": invalid UTF-8"); }
}
ok("BOM/encoding checks done");


// ===== 2.5. Capabilities check =====
console.log("\n--- Capabilities check ---");
var capPath = path.join(ROOT, "apps/desktop/src-tauri/capabilities/default.json");
if (!fs.existsSync(capPath)) {
  fail("capabilities/default.json: NOT FOUND");
} else {
  var capContent = fs.readFileSync(capPath, "utf-8");
  var requiredPerms = [
    "core:window:allow-start-dragging",
    "core:window:allow-minimize",
    "core:window:allow-maximize",
    "core:window:allow-unmaximize",
    "core:window:allow-close"
  ];
  for (var rp = 0; rp < requiredPerms.length; rp++) {
    if (capContent.indexOf(requiredPerms[rp]) >= 0) {
      ok("capabilities contains " + requiredPerms[rp]);
    } else {
      fail("capabilities MISSING " + requiredPerms[rp]);
    }
  }
}
// Check AppTitleBar has proper API calls
var atbPath = path.join(ROOT, "apps/desktop/ui/src/components/AppTitleBar.tsx");
if (fs.existsSync(atbPath)) {
  var atbContent = fs.readFileSync(atbPath, "utf-8");
  var requiredCalls = ["startDragging", "minimize", "maximize", "unmaximize", "close"];
  for (var rc = 0; rc < requiredCalls.length; rc++) {
    if (atbContent.indexOf(requiredCalls[rc]) >= 0) {
      ok("AppTitleBar contains " + requiredCalls[rc]);
    } else {
      fail("AppTitleBar MISSING " + requiredCalls[rc]);
    }
  }
}


// Check ChatWorkspace for hardcoded fallbacks
var cwPath = path.join(ROOT, "apps/desktop/ui/src/screens/ChatWorkspace.tsx");
if (fs.existsSync(cwPath)) {
  var cwContent = fs.readFileSync(cwPath, "utf-8");
  if (cwContent.indexOf("\"OpenAI\"") >= 0 || cwContent.indexOf("'OpenAI'") >= 0) fail("ChatWorkspace.tsx has hardcoded OpenAI");
  else ok("ChatWorkspace has no hardcoded OpenAI");
  if (cwContent.indexOf("\"gpt-4o\"") >= 0 || cwContent.indexOf("'gpt-4o'") >= 0) fail("ChatWorkspace.tsx has hardcoded gpt-4o");
  else ok("ChatWorkspace has no hardcoded gpt-4o");
  if (cwContent.indexOf("tokenfence:active-model-changed") < 0) fail("ChatWorkspace.tsx MISSING event listener");
  else ok("ChatWorkspace has active-model-changed listener");
  if (cwContent.indexOf("getActiveModelViewState") < 0) fail("ChatWorkspace.tsx MISSING getActiveModelViewState");
  else ok("ChatWorkspace uses getActiveModelViewState");
}
// Check ModelRuntimeSelfTest exists
var selfTestPath = path.join(ROOT, "apps/desktop/ui/src/components/ModelRuntimeSelfTest.tsx");
if (!fs.existsSync(selfTestPath)) fail("ModelRuntimeSelfTest.tsx NOT FOUND");
else ok("ModelRuntimeSelfTest.tsx exists");

// Check active-model has normalizeDisplayText and migrateActiveModelStorage
var amCheck = fs.readFileSync(path.join(ROOT, "apps/desktop/ui/src/data/active-model.ts"), "utf-8");
if (amCheck.indexOf("normalizeDisplayText") < 0) fail("active-model.ts MISSING normalizeDisplayText");
else ok("active-model contains normalizeDisplayText");
if (amCheck.indexOf("migrateActiveModelStorageV2") < 0) fail("active-model.ts MISSING migrateActiveModelStorageV2");
else ok("active-model contains migrateActiveModelStorageV2");
if (amCheck.indexOf("ActiveModelV2") < 0) fail("active-model.ts MISSING ActiveModelV2 interface");
else ok("active-model contains ActiveModelV2");
if (amCheck.indexOf("canonicalizeProviderId") < 0) fail("active-model.ts MISSING canonicalizeProviderId");
else ok("active-model contains canonicalizeProviderId");
if (amCheck.indexOf("getActiveModelViewState") < 0) fail("active-model.ts MISSING getActiveModelViewState");
else ok("active-model contains getActiveModelViewState");

// ===== 3. Bad pattern check (mojibake, leaked i18n keys) =====
console.log("\n--- Bad pattern check ---");
var badKeys = ["providersPage.title", "computerUse.enabledLabel", "chat.agentStep"];
var checkFiles = [
  "apps/desktop/ui/src/components/AgentPatchPanel.tsx",
  "apps/desktop/ui/src/screens/ToolboxScreen.tsx",
  "apps/desktop/ui/src/desktop-bridge.ts",
  "apps/desktop/src-tauri/src/main.rs",
  "apps/desktop/ui/src/App.tsx",
  "apps/desktop/ui/src/components/AppTitleBar.tsx",
  "apps/desktop/ui/src/data/active-model.ts",
  "apps/desktop/ui/src/components/CustomModelModal.tsx",
  "apps/desktop/ui/src/components/ProviderConfigModal.tsx",
  "apps/desktop/ui/src/components/ProviderSetupWizard.tsx",
];
for (var j = 0; j < checkFiles.length; j++) {
  var cf = checkFiles[j];
  var fp = path.join(ROOT, cf);
  if (!fs.existsSync(fp)) continue;
  var buf = fs.readFileSync(fp);
  var content = buf.toString("utf-8");
  for (var k = 0; k < badKeys.length; k++) { if (content.includes(badKeys[k])) fail(cf + ': leaked key "' + badKeys[k] + '"'); }
  for (var bi = 0; bi < buf.length - 1; bi++) {
    if (buf[bi] === 0xC3) { if (buf[bi+1] >= 0x80 && buf[bi+1] <= 0xBF) { fail(cf + ": mojibake at " + bi); break; } }
    if (buf[bi] === 0xEF && buf[bi+1] === 0xBF && buf.length > bi+2 && buf[bi+2] === 0xBD) { fail(cf + ": U+FFFD at " + bi); break; }
  }
}
ok("bad patterns checked");

// ===== 4. Bare # / ### in source files (not markdown) =====
console.log("\n--- Bare # / ### ---");
var sourceFiles = [
  "apps/desktop/ui/src/App.tsx", "apps/desktop/ui/src/components/AgentPatchPanel.tsx",
  "apps/desktop/ui/src/components/AppTitleBar.tsx", "apps/desktop/ui/src/screens/ToolboxScreen.tsx",
  "apps/desktop/ui/src/agentModelBridge.ts", "apps/desktop/ui/src/desktop-bridge.ts",
  "apps/desktop/src-tauri/src/main.rs", "apps/desktop/ui/src/data/active-model.ts",
  "apps/desktop/ui/src/components/CustomModelModal.tsx",
  "apps/desktop/ui/src/components/ProviderConfigModal.tsx",
  "apps/desktop/ui/src/components/ProviderSetupWizard.tsx",
  "scripts/source_guard.js", "scripts/release_sanity.js",
];
function inTemplate(lines, idx) { var bc=0; for(var i=0;i<idx;i++){var m=lines[i].match(/(?<!\\)`/g);if(m)bc+=m.length;} return bc%2===1; }
for (var t = 0; t < sourceFiles.length; t++) {
  var tf = sourceFiles[t];
  var fp = path.join(ROOT, tf);
  if (!fs.existsSync(fp)) continue;
  var lines = fs.readFileSync(fp, "utf-8").split("\n");
  var found = false;
  for (var li = 0; li < lines.length; li++) {
    var line = lines[li];
    var trimmed = line.trimStart();
    if (inTemplate(lines, li)) continue;
    if (tf.endsWith(".rs")) { if (trimmed.startsWith("#[") || trimmed.startsWith("#![")) continue; }
    if (/^#[^#!\[\/]/.test(trimmed) && !/^\s*\/\//.test(line)) { fail(tf + ":" + (li+1) + ": bare #"); found = true; }
    if (/^###[^#]/.test(trimmed) && !/^\s*\/\//.test(line)) { fail(tf + ":" + (li+1) + ": bare ###"); found = true; }
  }
  if (!found) ok(tf + ": ok");
}

// ===== 5. Tracked binary check (ZIP, EXE, MSI, etc.) =====
console.log("\n--- Tracked binary check ---");
var bp = ["*.zip","*.exe","*.msi","*.msix","*.appx","*.7z","*.rar"];
var htb = false;
for (var p=0;p<bp.length;p++) { try { var t=execSync("git ls-files "+bp[p],{cwd:ROOT,encoding:"utf-8"}).trim(); if(t){fail(bp[p]+": tracked");htb=true;} } catch(e){} }
if (!htb) ok("no binaries tracked");

// ===== 6. README check (BOM, CR, min line count) =====
console.log("\n--- README check ---");
for (var r=0;r<2;r++) {
  var rf = ["README.md","README.zh-CN.md"][r];
  var fp = path.join(ROOT, rf);
  if (!fs.existsSync(fp)) { fail(rf+": NOT FOUND"); continue; }
  var buf = fs.readFileSync(fp);
  if (buf.length>=3 && buf[0]===0xEF && buf[1]===0xBB && buf[2]===0xBF) fail(rf+": BOM");
  var cr=0; for(var bi=0;bi<buf.length;bi++){if(buf[bi]===0x0D)cr++;}
  if (cr>0) fail(rf+": "+cr+" CR");
  try { var t=buf.toString("utf-8"); var l=t.split("\n").length;
    if(l<80) fail(rf+": "+l+" lines"); else ok(rf+": UTF-8 LF "+l+" lines");
  } catch(e) { fail(rf+": invalid UTF-8"); }
}


// ===== 7. v1.3.8 Active Model Runtime checks =====
console.log("\n--- v1.3.8 Active Model Runtime checks ---");
if (amCheck.indexOf("NO_CONFIGURED_MODEL_LABEL_EN") < 0) fail("active-model.ts MISSING NO_CONFIGURED_MODEL_LABEL_EN");
else ok("active-model contains NO_CONFIGURED_MODEL_LABEL_EN");
if (amCheck.indexOf("normalizeRuntimeText") < 0) fail("active-model.ts MISSING normalizeRuntimeText");
else ok("active-model contains normalizeRuntimeText");
if (amCheck.indexOf("getNoConfiguredModelLabel") < 0) fail("active-model.ts MISSING getNoConfiguredModelLabel");
else ok("active-model contains getNoConfiguredModelLabel");
if (amCheck.indexOf("NO_CONFIGURED_MODEL_LABEL_ZH") < 0) fail("active-model.ts MISSING NO_CONFIGURED_MODEL_LABEL_ZH");
else ok("active-model contains NO_CONFIGURED_MODEL_LABEL_ZH");
if (amCheck.indexOf('displayLabel: ""') >= 0 || amCheck.indexOf("displayLabel: ''") >= 0) fail("active-model.ts returns displayLabel: empty string");
else ok("active-model has no empty displayLabel fallback")
if (cwContent.indexOf("__TOKENFENCE_MODEL_RUNTIME__") < 0) fail("ChatWorkspace.tsx MISSING __TOKENFENCE_MODEL_RUNTIME__");
else ok("ChatWorkspace contains __TOKENFENCE_MODEL_RUNTIME__");
if (cwContent.indexOf("/ GPT-5.5") >= 0) fail("ChatWorkspace.tsx contains hardcoded '/ GPT-5.5' fallback");
else ok("ChatWorkspace has no '/ GPT-5.5' fallback");
if (cwContent.indexOf('"No Model"') >= 0) fail("ChatWorkspace.tsx contains hardcoded 'No Model'");
else ok("ChatWorkspace has no 'No Model' fallback")
if (/provider\s*\|\|\s*["'\`]OpenAI["'\`]/.test(cwContent)) fail("ChatWorkspace.tsx contains provider || OpenAI fallback");
else ok("ChatWorkspace has no provider || OpenAI fallback");
if (/model\s*\|\|\s*["'\`]GPT-5\.5["'\`]/.test(cwContent)) fail("ChatWorkspace.tsx contains model || GPT-5.5 fallback");
else ok("ChatWorkspace has no model || GPT-5.5 fallback");
if (fs.existsSync(selfTestPath)) {
  var stContent = fs.readFileSync(selfTestPath, "utf-8");
  if (stContent.indexOf("valid not_configured state") < 0) fail("ModelRuntimeSelfTest.tsx MISSING 'valid not_configured state'");
  else ok("ModelRuntimeSelfTest has 'valid not_configured state' test");
  if (stContent.indexOf("Reset Model Runtime State") < 0) fail("ModelRuntimeSelfTest.tsx MISSING 'Reset Model Runtime State' button");
  else ok("ModelRuntimeSelfTest has Reset button");
  if (stContent.indexOf("Active model apply indicator is consistent") < 0) fail("ModelRuntimeSelfTest.tsx MISSING active model apply indicator consistency test");
  else ok("ModelRuntimeSelfTest has active model apply indicator test");
}
var mppPath = path.join(ROOT, "apps/desktop/ui/src/components/ModelPickerPanel.tsx");
if (fs.existsSync(mppPath)) {
  var mppContent = fs.readFileSync(mppPath, "utf-8");
  if (mppContent.indexOf("chat.setAsActive") < 0 && mppContent.indexOf("chat.inUse") < 0) fail("ModelPickerPanel.tsx MISSING setAsActive or inUse i18n");
  else ok("ModelPickerPanel has setAsActive/inUse i18n");
}
// ===== 8. i18n file checks =====
console.log("\n--- i18n file checks ---");
var zhCNPath = path.join(ROOT, "packages/shared/src/i18n/zh-CN.ts");
if (fs.existsSync(zhCNPath)) {
  var zhContent = fs.readFileSync(zhCNPath, "utf-8");
  if (zhContent.indexOf("\u672A\u914D\u7F6E\u6A21\u578B") < 0) fail("zh-CN.ts MISSING no-configured-model label");
  else ok("zh-CN.ts contains no-configured-model label");
  if (zhContent.indexOf("\u8BBE\u4E3A\u5F53\u524D\u6A21\u578B") < 0) fail("zh-CN.ts MISSING set-as-active label");
  else ok("zh-CN.ts contains set-as-active label");
} else { fail("zh-CN.ts NOT FOUND"); }
var enPath = path.join(ROOT, "packages/shared/src/i18n/en.ts");
if (fs.existsSync(enPath)) {
  var enContent = fs.readFileSync(enPath, "utf-8");
  if (enContent.indexOf("No configured model") < 0) fail("en.ts MISSING No configured model");
  else ok("en.ts contains No configured model");
  if (enContent.indexOf("Set as active") < 0) fail("en.ts MISSING Set as active");
  else ok("en.ts contains Set as active");
} else { fail("en.ts NOT FOUND"); }

// ===== Final =====
console.log("\n=== RESULT: " + errors.length + " error(s) ===");
if (errors.length > 0) { console.log("Failures:"); errors.forEach(function(e) { console.log("  - " + e); }); process.exit(1); }
else { console.log("All checks passed."); process.exit(0);
}
// source_guard.js v1.3.6 - protects against flattened/minified source files

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
  { file: "apps/desktop/ui/src/data/project-workspace.ts", min: 120 },
  { file: "apps/desktop/ui/src/components/RecentProjectsPanel.tsx", min: 120 },
  { file: "apps/desktop/ui/src/components/ProjectEmptyState.tsx", min: 60 },

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
// ===== 7.5. v1.3.9 setActiveModelV2 check =====
console.log("\n--- v1.3.9 setActiveModelV2 check ---");
if (amCheck.indexOf("export function setActiveModelV2") < 0) fail("active-model.ts MISSING setActiveModelV2 export");
else ok("active-model.ts exports setActiveModelV2");
if (amCheck.indexOf("saveActiveModel(activeModel);") >= 0 && amCheck.indexOf("dispatchActiveModelChanged();") >= 0) ok("setActiveModelV2 calls saveActiveModel + dispatchActiveModelChanged");
else fail("setActiveModelV2 MISSING save or dispatch call");
if (mppContent.indexOf("setActiveModelV2") < 0) fail("ModelPickerPanel.tsx MISSING setActiveModelV2 call");
else ok("ModelPickerPanel calls setActiveModelV2");

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


// ===== 8.5. Project workspace checks =====
console.log("\n--- Project workspace checks ---");
var pwPath = path.join(ROOT, "apps/desktop/ui/src/data/project-workspace.ts");
if (fs.existsSync(pwPath)) {
  var pwContent = fs.readFileSync(pwPath, "utf-8");
  if (pwContent.indexOf("tokenfence.recentProjects") >= 0) ok("project-workspace.ts contains tokenfence.recentProjects");
  else fail("project-workspace.ts MISSING tokenfence.recentProjects");
  if (pwContent.indexOf("tokenfence.activeProject") >= 0) ok("project-workspace.ts contains tokenfence.activeProject");
  else fail("project-workspace.ts MISSING tokenfence.activeProject");
  if (pwContent.indexOf("addRecentProject") >= 0) ok("project-workspace.ts contains addRecentProject");
  else fail("project-workspace.ts MISSING addRecentProject");
  if (pwContent.indexOf("toggleFavoriteProject") >= 0) ok("project-workspace.ts contains toggleFavoriteProject");
  else fail("project-workspace.ts MISSING toggleFavoriteProject");
  if (pwContent.indexOf("pinProject") >= 0) ok("project-workspace.ts contains pinProject");
  else fail("project-workspace.ts MISSING pinProject");
} else { fail("project-workspace.ts NOT FOUND"); }

var rppPath = path.join(ROOT, "apps/desktop/ui/src/components/RecentProjectsPanel.tsx");
if (fs.existsSync(rppPath)) {
  var rppContent = fs.readFileSync(rppPath, "utf-8");
  if (rppContent.indexOf("tokenfence.recentProjects") >= 0) ok("RecentProjectsPanel.tsx references recent projects key");
  else fail("RecentProjectsPanel.tsx MISSING recent projects reference");
} else { fail("RecentProjectsPanel.tsx NOT FOUND"); }

var cwPath = path.join(ROOT, "apps/desktop/ui/src/screens/ChatWorkspace.tsx");
if (fs.existsSync(cwPath)) {
  var cwContent2 = fs.readFileSync(cwPath, "utf-8");
  if (cwContent2.indexOf("RecentProjectsPanel") >= 0) ok("ChatWorkspace.tsx imports RecentProjectsPanel");
  else fail("ChatWorkspace.tsx MISSING RecentProjectsPanel import");
}


// ===== 9. About page checks =====
console.log("\n--- About page checks ---");
var aboutPath = path.join(ROOT, "apps/desktop/ui/src/screens/AboutScreen.tsx");
if (fs.existsSync(aboutPath)) {
  var aboutContent = fs.readFileSync(aboutPath, "utf-8");
  if (aboutContent.indexOf("v0.5.0-dev") >= 0) fail("AboutScreen.tsx still contains v0.5.0-dev");
  else ok("AboutScreen.tsx does not contain v0.5.0-dev");
  if (aboutContent.indexOf("chriswangjob@163.com") >= 0) ok("AboutScreen.tsx contains chriswangjob@163.com");
  else fail("AboutScreen.tsx MISSING chriswangjob@163.com");
  if (aboutContent.indexOf("easymoneysniperchris") >= 0) ok("AboutScreen.tsx contains easymoneysniperchris");
  else fail("AboutScreen.tsx MISSING easymoneysniperchris");
  if (aboutContent.indexOf("Chris") >= 0) ok("AboutScreen.tsx contains Chris");
  else fail("AboutScreen.tsx MISSING Chris");
  var enPath2 = path.join(ROOT, "packages/shared/src/i18n/en.ts"); var zhPath2 = path.join(ROOT, "packages/shared/src/i18n/zh-CN.ts"); var enDev = fs.existsSync(enPath2) ? fs.readFileSync(enPath2, "utf-8").indexOf("Developer") >= 0 : false; var zhDev = fs.existsSync(zhPath2) ? fs.readFileSync(zhPath2, "utf-8").indexOf("开发者") >= 0 : false; if (enDev && zhDev) ok("i18n files contain Developer/开发者"); else fail("i18n files MISSING Developer/开发者");
  var enCon = fs.existsSync(enPath2) ? fs.readFileSync(enPath2, "utf-8").indexOf("Contact") >= 0 : false; var zhCon = fs.existsSync(zhPath2) ? fs.readFileSync(zhPath2, "utf-8").indexOf("联系方式") >= 0 : false; if (enCon && zhCon) ok("i18n files contain Contact/联系方式"); else fail("i18n files MISSING Contact/联系方式");
} else { fail("AboutScreen.tsx NOT FOUND"); }

// ===== 10. Routing UI checks =====
console.log("\n--- Routing UI checks ---");
var routingPath = path.join(ROOT, "apps/desktop/ui/src/screens/RoutingScreen.tsx");
if (fs.existsSync(routingPath)) {
  var routingContent = fs.readFileSync(routingPath, "utf-8");
  if (routingContent.indexOf("Edit") >= 0 || routingContent.indexOf("编辑") >= 0) ok("RoutingScreen.tsx contains Edit/编辑");
  else fail("RoutingScreen.tsx MISSING Edit/编辑");
  var enPrim = fs.existsSync(enPath2) ? fs.readFileSync(enPath2, "utf-8").indexOf("Primary model") >= 0 : false; var zhPrim = fs.existsSync(zhPath2) ? fs.readFileSync(zhPath2, "utf-8").indexOf("主模型") >= 0 : false; if (enPrim && zhPrim) ok("i18n files contain Primary model/主模型"); else fail("i18n files MISSING Primary model/主模型");
  var enFall = fs.existsSync(enPath2) ? fs.readFileSync(enPath2, "utf-8").indexOf("Fallback model") >= 0 : false; var zhFall = fs.existsSync(zhPath2) ? fs.readFileSync(zhPath2, "utf-8").indexOf("备用模型") >= 0 : false; if (enFall && zhFall) ok("i18n files contain Fallback model/备用模型"); else fail("i18n files MISSING Fallback model/备用模型");
  var enAsk = fs.existsSync(enPath2) ? fs.readFileSync(enPath2, "utf-8").indexOf("Ask before switching") >= 0 : false; var zhAsk = fs.existsSync(zhPath2) ? fs.readFileSync(zhPath2, "utf-8").indexOf("切换前询问") >= 0 : false; if (enAsk && zhAsk) ok("i18n files contain Ask before switching/切换前询问"); else fail("i18n files MISSING Ask before switching/切换前询问");
} else { fail("RoutingScreen.tsx NOT FOUND"); }

// ===== 11. v1.4.3 version checks =====
console.log("\n--- v1.4.1 version checks ---");
var appPath = path.join(ROOT, "apps/desktop/ui/src/App.tsx");
if (fs.existsSync(appPath)) {
  var appContent = fs.readFileSync(appPath, "utf-8");
  if (appContent.indexOf('"v1.5.6"') >= 0) ok("App.tsx VERSION is v1.5.5");
  else fail("App.tsx VERSION is NOT v1.5.5");
} else { fail("App.tsx NOT FOUND"); }

// Check ChatWorkspace for developer identity
var cwPath3 = path.join(ROOT, "apps/desktop/ui/src/screens/ChatWorkspace.tsx");
if (fs.existsSync(cwPath3)) {
  var cw3 = fs.readFileSync(cwPath3, "utf-8");
  if (cw3.indexOf("chriswangjob@163.com") >= 0) ok("ChatWorkspace contains chriswangjob@163.com");
  else fail("ChatWorkspace MISSING chriswangjob@163.com");
  if (cw3.indexOf("easymoneysniperchris") >= 0) ok("ChatWorkspace contains easymoneysniperchris");
  else fail("ChatWorkspace MISSING easymoneysniperchris");
  if (cw3.indexOf("developed and maintained by Chris") >= 0) ok("ChatWorkspace contains developed and maintained by Chris");
  else fail("ChatWorkspace MISSING developer identity EN");
  if (cw3.indexOf("由 Chris 开发并维护") >= 0) ok("ChatWorkspace contains 由 Chris 开发并维护");
  else fail("ChatWorkspace MISSING developer identity ZH");
} else { fail("ChatWorkspace NOT FOUND"); }

// Check sensitive detection patterns
if (fs.existsSync(cwPath3)) {
  var cw3 = fs.readFileSync(cwPath3, "utf-8");
  if (cw3.indexOf("idNumber") >= 0) ok("ChatWorkspace scanPrompt contains idNumber detection");
  else fail("ChatWorkspace scanPrompt MISSING idNumber detection");
  if (cw3.indexOf("phoneNumber") >= 0) ok("ChatWorkspace scanPrompt contains phoneNumber detection");
  else fail("ChatWorkspace scanPrompt MISSING phoneNumber detection");
  if (cw3.indexOf("bankCard") >= 0) ok("ChatWorkspace scanPrompt contains bankCard detection");
  else fail("ChatWorkspace scanPrompt MISSING bankCard detection");
  if (cw3.indexOf("email") >= 0) ok("ChatWorkspace scanPrompt contains email detection");
  else fail("ChatWorkspace scanPrompt MISSING email detection");
  if (cw3.indexOf("apiKey") >= 0) ok("ChatWorkspace scanPrompt contains apiKey detection");
  else fail("ChatWorkspace scanPrompt MISSING apiKey detection");
  if (cw3.indexOf("检测到敏感数据") >= 0 || cw3.indexOf("Sensitive data detected") >= 0) ok("ChatWorkspace contains sensitive detected message");
  else fail("ChatWorkspace MISSING sensitive detected message");
}

// Check GuardScreen and StorageScreen have React imports
var gsPath = path.join(ROOT, "apps/desktop/ui/src/screens/GuardScreen.tsx");
if (fs.existsSync(gsPath)) {
  var gsContent = fs.readFileSync(gsPath, "utf-8");
  if (gsContent.indexOf('import { useState, useEffect } from "react"') >= 0) ok("GuardScreen imports React hooks");
  else fail("GuardScreen MISSING React hooks import");
} else { fail("GuardScreen NOT FOUND"); }
var ssPath = path.join(ROOT, "apps/desktop/ui/src/screens/StorageScreen.tsx");
if (fs.existsSync(ssPath)) {
  var ssContent = fs.readFileSync(ssPath, "utf-8");
  if (ssContent.indexOf('import { useState, useEffect } from "react"') >= 0) ok("StorageScreen imports React hooks");
  else fail("StorageScreen MISSING React hooks import");
} else { fail("StorageScreen NOT FOUND"); }

// Check toolbox detail pages exist
if (fs.existsSync(gsPath)) {
  var gsContent2 = fs.readFileSync(gsPath, "utf-8");
  var enGuard = fs.existsSync(enPath2) ? fs.readFileSync(enPath2, "utf-8").indexOf("Prompt Shield") >= 0 : false; var zhGuard = fs.existsSync(zhPath2) ? fs.readFileSync(zhPath2, "utf-8").indexOf("提示词防护") >= 0 : false; if (enGuard && zhGuard) ok("i18n files contain Prompt Shield/提示词防护"); else fail("i18n files MISSING Prompt Shield/提示词防护");
}
if (fs.existsSync(ssPath)) {
  var ssContent2 = fs.readFileSync(ssPath, "utf-8");
  if (ssContent2.indexOf("Storage") >= 0 || ssContent2.indexOf("存储") >= 0) ok("StorageScreen contains Storage/存储");
  else fail("StorageScreen MISSING Storage/存储");
}


// ===== 12. v1.4.2 project resilience checks =====
console.log("\n--- v1.4.2 project resilience checks ---");
var pwPath2 = path.join(ROOT, "apps/desktop/ui/src/data/project-workspace.ts");
if (fs.existsSync(pwPath2)) {
  var pw2 = fs.readFileSync(pwPath2, "utf-8");
  if (pw2.indexOf("safeParseJson") >= 0) ok("project-workspace.ts contains safeParseJson");
  else fail("project-workspace.ts MISSING safeParseJson");
  if (pw2.indexOf("tokenfence.recentProjects") >= 0) ok("project-workspace.ts contains tokenfence.recentProjects");
  else fail("project-workspace.ts MISSING tokenfence.recentProjects");
  if (pw2.indexOf("tokenfence.activeProject") >= 0) ok("project-workspace.ts contains tokenfence.activeProject");
  else fail("project-workspace.ts MISSING tokenfence.activeProject");
}
var psPath = path.join(ROOT, "apps/desktop/ui/src/screens/ProjectsScreen.tsx");
if (fs.existsSync(psPath)) {
  var psContent = fs.readFileSync(psPath, "utf-8");
  if (psContent.indexOf("Page failed to load") >= 0 || psContent.indexOf("页面加载失败") >= 0) ok("ProjectsScreen contains Page failed to load/页面加载失败");
  else fail("ProjectsScreen MISSING error recovery text");
  if (psContent.indexOf("Clear project state") >= 0 || psContent.indexOf("清除项目状态") >= 0) ok("ProjectsScreen contains Clear project state/清除项目状态");
  else fail("ProjectsScreen MISSING clear state button");
  if (psContent.indexOf("No project opened yet") >= 0 || psContent.indexOf("还没有打开过项目") >= 0) ok("ProjectsScreen contains No project opened yet/还没有打开过项目");
  else fail("ProjectsScreen MISSING empty state text");
}
var appPath = path.join(ROOT, "apps/desktop/ui/src/App.tsx");
if (fs.existsSync(appPath)) {
  var appContent2 = fs.readFileSync(appPath, "utf-8");
  if (appContent2.indexOf("ErrorBoundary") >= 0) ok("App.tsx contains ErrorBoundary");
  else fail("App.tsx MISSING ErrorBoundary");
}


// ===== 13. v1.4.3 project load + developer identity + sensitive checks =====
console.log("\n--- v1.4.3 project load + developer identity + sensitive checks ---");
var cwPath4 = path.join(ROOT, "apps/desktop/ui/src/screens/ChatWorkspace.tsx");
if (fs.existsSync(cwPath4)) {
  var cw4 = fs.readFileSync(cwPath4, "utf-8");
  if (cw4.indexOf("checkDeveloperIdentityQuestion") >= 0) ok("ChatWorkspace contains developer identity interceptor");
  else fail("ChatWorkspace MISSING developer identity interceptor");
  if (cw4.indexOf("TokenFence Studio 由 Chris 开发并维护") >= 0) ok("Developer interceptor contains ZH identity");
  else fail("Developer interceptor MISSING ZH identity");
  if (cw4.indexOf("developed and maintained by Chris") >= 0) ok("Developer interceptor contains EN identity");
  else fail("Developer interceptor MISSING EN identity");
  if (cw4.indexOf("chriswangjob@163.com") >= 0) ok("Developer interceptor contains email");
  else fail("Developer interceptor MISSING email");
  if (cw4.indexOf("easymoneysniperchris") >= 0) ok("Developer interceptor contains WeChat");
  else fail("Developer interceptor MISSING WeChat");
  if ((cw4.indexOf("\u8eab\u4efd") >= 0 || cw4.indexOf("\\u8eab") >= 0) && cw4.indexOf("idNumber") >= 0) ok("scanPrompt contains 身份证/idNumber detection");
  else fail("scanPrompt MISSING 身份证/idNumber detection");
  if (cw4.indexOf("phoneNumber") >= 0) ok("scanPrompt contains phone detection");
  else fail("scanPrompt MISSING phone detection");
  if (cw4.indexOf("bankCard") >= 0) ok("scanPrompt contains bank card detection");
  else fail("scanPrompt MISSING bank card detection");
  if (cw4.indexOf("email") >= 0 && cw4.indexOf("regex") >= 0) ok("scanPrompt contains email detection");
  else fail("scanPrompt MISSING email detection");
  if (cw4.indexOf("apiKey") >= 0) ok("scanPrompt contains API key/token/password detection");
  else fail("scanPrompt MISSING API key/token detection");
  if (cw4.indexOf("检测到敏感数据") >= 0 || cw4.indexOf("Sensitive data detected") >= 0) ok("scanPrompt contains sensitive detected message");
  else fail("scanPrompt MISSING sensitive detected message");
}


// ==== v1.4.3 OOM fix checks ====
console.log("\n--- v1.4.3 OOM / safe detector checks ---");
var cw5Path = path.join(ROOT, "apps/desktop/ui/src/screens/ChatWorkspace.tsx");
if (fs.existsSync(cw5Path)) {
  var cw5 = fs.readFileSync(cw5Path, "utf-8");
  if (cw5.indexOf("MAX_SCAN_LENGTH") >= 0) ok("Sensitive detector contains MAX_SCAN_LENGTH");
  else fail("Sensitive detector MISSING MAX_SCAN_LENGTH");
  if (cw5.indexOf("MAX_FINDINGS") >= 0) ok("Sensitive detector contains MAX_FINDINGS");
  else fail("Sensitive detector MISSING MAX_FINDINGS");
  if (cw5.indexOf("sanitizedText") >= 0) ok("Sensitive detector exports sanitizedText");
  else fail("Sensitive detector MISSING sanitizedText");
  if (cw5.indexOf("findings") >= 0) ok("Sensitive detector exports findings");
  else fail("Sensitive detector MISSING findings");
  // Must NOT have while(true) which would be infinite loop
  if (cw5.indexOf("while (true)") < 0) ok("Sensitive detector has no while(true)");
  else fail("Sensitive detector HAS while(true)");
  // Check that sanitizedText is used for outbound message
  if (cw5.indexOf("sanitizedText") >= 0 && cw5.indexOf("fullContent") >= 0) ok("ChatWorkspace uses sanitizedText for outbound provider message");
  else fail("ChatWorkspace MISSING sanitizedText in outbound flow");
  // Check for finally reset pattern
  if (cw5.indexOf("setSending(false)") >= 0) ok("Send flow contains finally reset for sending state");
  else fail("Send flow MISSING setSending(false)");
  // Check patterns have /g flag - look for regex with /g
  if (cw5.indexOf("/g, type:") >= 0 || cw5.indexOf("/gi, type:") >= 0) ok("Detector patterns have /g flag");
  else fail("Detector patterns MISSING /g flag");
  // Check for safe Phase labeling
  if (cw5.indexOf("Phase 1") >= 0 && cw5.indexOf("Phase 2") >= 0 && cw5.indexOf("Phase 3") >= 0) ok("Detector has safe phased scanning");
  else fail("Detector MISSING phased scanning");
}


// ==== v1.4.4 email check ====
console.log("\n--- v1.5.2 contact email check ---");
var emailCheckFiles = [
  path.join(ROOT, "apps/desktop/ui/src/screens/ChatWorkspace.tsx"),
  path.join(ROOT, "apps/desktop/ui/src/screens/AboutScreen.tsx"),
  path.join(ROOT, "README.md"),
  path.join(ROOT, "README.zh-CN.md"),
  path.join(ROOT, "scripts/release_sanity.js"),
  
  path.join(ROOT, "CHANGELOG.md")
];
var badEmailFiles = [];
emailCheckFiles.forEach(function(fp) {
  if (fs.existsSync(fp)) {
    var fc = fs.readFileSync(fp, "utf-8");
    if (fc.indexOf("chrisjob@163.com") >= 0) badEmailFiles.push(fp);
  }
});
if (badEmailFiles.length === 0) ok("No file contains old email chrisjob@163.com");
else fail("OLD EMAIL still in: " + badEmailFiles.join(", "));

var newEmailFound = false;
emailCheckFiles.forEach(function(fp) {
  if (fs.existsSync(fp) && fs.readFileSync(fp, "utf-8").indexOf("chriswangjob@163.com") >= 0) newEmailFound = true;
});
if (newEmailFound) ok("New email chriswangjob@163.com found in source");
else fail("New email chriswangjob@163.com MISSING");


// ==== v1.5.2 diagnostics checks ====
console.log("\n--- v1.5.2 release diagnostics checks ---");
var diagPath = path.join(ROOT, "apps/desktop/ui/src/components/ReleaseDiagnosticsPanel.tsx");
if (fs.existsSync(diagPath)) ok("ReleaseDiagnosticsPanel exists");
else fail("ReleaseDiagnosticsPanel MISSING");

if (fs.existsSync(diagPath)) {
  var dc = fs.readFileSync(diagPath, "utf-8");
  if (dc.indexOf("Expected install path") >= 0 || dc.indexOf("expectedPath") >= 0) ok("Release diagnostics contains Expected install path");
  else fail("Release diagnostics MISSING Expected install path");
  if (dc.indexOf("TokenFence-Studio-Windows") >= 0) ok("Release diagnostics contains ZIP reference");
  else fail("Release diagnostics MISSING ZIP reference");
  if (dc.indexOf("tokenfence.recentProjects") >= 0) ok("Release diagnostics contains tokenfence.recentProjects");
  else fail("Release diagnostics MISSING tokenfence.recentProjects");
  if (dc.indexOf("tokenfence.activeProject") >= 0) ok("Release diagnostics contains tokenfence.activeProject");
  else fail("Release diagnostics MISSING tokenfence.activeProject");
  if (dc.indexOf("tokenfence.activeModel") >= 0) ok("Release diagnostics contains tokenfence.activeModel");
  else fail("Release diagnostics MISSING tokenfence.activeModel");
}

var checkSc = path.join(ROOT, "scripts/check_shortcuts.ps1");
if (fs.existsSync(checkSc)) ok("check_shortcuts.ps1 exists");
else fail("check_shortcuts.ps1 MISSING");
if (fs.existsSync(checkSc) && fs.readFileSync(checkSc, "utf-8").indexOf("v1.5.6") >= 0) ok("check_shortcuts.ps1 contains v1.5.5");
else fail("check_shortcuts.ps1 MISSING v1.5.5");

var updateSc = path.join(ROOT, "scripts/update_shortcuts.ps1");
if (fs.existsSync(updateSc)) ok("update_shortcuts.ps1 exists");
else fail("update_shortcuts.ps1 MISSING");
if (fs.existsSync(updateSc) && fs.readFileSync(updateSc, "utf-8").indexOf("v1.5.6") >= 0) ok("update_shortcuts.ps1 contains v1.5.5");
else fail("update_shortcuts.ps1 MISSING v1.5.5");


// ==== v1.5.2 file tree + context pack checks ====
console.log("\n--- v1.5.2 file tree + context pack checks ---");
var cpPath = path.join(ROOT, "apps/desktop/ui/src/data/context-pack.ts");
if (fs.existsSync(cpPath)) ok("context-pack.ts exists");
else fail("context-pack.ts MISSING");
if (fs.existsSync(cpPath)) {
  var cpc = fs.readFileSync(cpPath, "utf-8");
  if (cpc.indexOf("tokenfence.contextPack") >= 0) ok("context-pack.ts contains tokenfence.contextPack");
  else fail("context-pack.ts MISSING tokenfence.contextPack");
  if (cpc.indexOf("ContextPackFile") >= 0) ok("context-pack.ts contains ContextPackFile");
  else fail("context-pack.ts MISSING ContextPackFile");
  if (cpc.indexOf("addFilesToContextPack") >= 0) ok("context-pack.ts contains addFilesToContextPack");
  else fail("context-pack.ts MISSING addFilesToContextPack");
  if (cpc.indexOf("clearContextPack") >= 0) ok("context-pack.ts contains clearContextPack");
  else fail("context-pack.ts MISSING clearContextPack");
}

var pftPath = path.join(ROOT, "apps/desktop/ui/src/data/project-file-tree.ts");
if (fs.existsSync(pftPath)) ok("project-file-tree.ts exists");
else fail("project-file-tree.ts MISSING");
if (fs.existsSync(pftPath) && fs.readFileSync(pftPath, "utf-8").indexOf("ProjectFileNode") >= 0) ok("project-file-tree.ts contains ProjectFileNode");
else fail("project-file-tree.ts MISSING ProjectFileNode");

var pftComp = path.join(ROOT, "apps/desktop/ui/src/components/ProjectFileTree.tsx");
if (fs.existsSync(pftComp)) ok("ProjectFileTree.tsx exists");
else fail("ProjectFileTree.tsx MISSING");

var ctxPanel = path.join(ROOT, "apps/desktop/ui/src/components/ContextPackPanel.tsx");
if (fs.existsSync(ctxPanel)) ok("ContextPackPanel.tsx exists");
else fail("ContextPackPanel.tsx MISSING");

var psPath = path.join(ROOT, "apps/desktop/ui/src/screens/ProjectsScreen.tsx");
if (fs.existsSync(psPath)) {
  var psc = fs.readFileSync(psPath, "utf-8");
  if (psc.indexOf("ProjectFileTree") >= 0) ok("Project UI contains ProjectFileTree");
  else fail("Project UI MISSING ProjectFileTree");
  if (psc.indexOf("ContextPackPanel") >= 0) ok("Project UI contains ContextPackPanel");
  else fail("Project UI MISSING ContextPackPanel");
}

var cwPath5 = path.join(ROOT, "apps/desktop/ui/src/screens/ChatWorkspace.tsx");
if (fs.existsSync(cwPath5)) {
  var cw5 = fs.readFileSync(cwPath5, "utf-8");
  if (cw5.indexOf("ContextPackPanel") >= 0) ok("ChatWorkspace contains ContextPackPanel");
  else fail("ChatWorkspace MISSING ContextPackPanel");
}


// ==== v1.5.2 computer use preview checks ====
console.log("\n--- v1.5.2 computer use preview checks ---");
var cuPath = path.join(ROOT, "apps/desktop/ui/src/data/computer-use.ts");
if (fs.existsSync(cuPath)) ok("computer-use.ts exists");
else fail("computer-use.ts MISSING");
if (fs.existsSync(cuPath)) {
  var cuc = fs.readFileSync(cuPath, "utf-8");
  if (cuc.indexOf("ComputerUsePlanStep") >= 0) ok("computer-use.ts contains ComputerUsePlanStep");
  else fail("computer-use.ts MISSING ComputerUsePlanStep");
  if (cuc.indexOf("generatePlan") >= 0) ok("computer-use.ts contains generatePlan");
  else fail("computer-use.ts MISSING generatePlan");
  if (cuc.indexOf("executeStep") >= 0) ok("computer-use.ts contains executeStep (real diagnostics)");
  else fail("computer-use.ts MISSING executeStep");
  if (cuc.indexOf("isDangerousTask") >= 0) ok("computer-use.ts contains isDangerousTask");
  else fail("computer-use.ts MISSING isDangerousTask");
  if (cuc.indexOf("BLOCKED_KEYWORDS") >= 0) ok("computer-use.ts contains BLOCKED_KEYWORDS");
  else fail("computer-use.ts MISSING BLOCKED_KEYWORDS");
  if (cuc.indexOf("ALLOWED_COMMAND_IDS") >= 0) ok("computer-use.ts contains ALLOWED_COMMAND_IDS");
  else fail("computer-use.ts MISSING ALLOWED_COMMAND_IDS");
}

var ccPath = path.join(ROOT, "apps/desktop/ui/src/screens/ComputerControlScreen.tsx");
if (fs.existsSync(ccPath)) {
  var ccc = fs.readFileSync(ccPath, "utf-8");
  if (ccc.indexOf("Diagnostics Preview") >= 0 || ccc.indexOf("Computer Use Preview") >= 0 || ccc.indexOf("预览版") >= 0) ok("ComputerControlScreen contains Diagnostics Preview/Preview/预览版");
  else fail("ComputerControlScreen MISSING Preview/预览版");
  if (ccc.indexOf("generatePlan") >= 0) ok("ComputerControlScreen uses generatePlan");
  else fail("ComputerControlScreen MISSING generatePlan usage");
  if (ccc.indexOf("executeStep") >= 0) ok("ComputerControlScreen uses executeStep");
  else fail("ComputerControlScreen MISSING executeStep usage");
  if (ccc.indexOf("handleStop") >= 0) ok("ComputerControlScreen contains handleStop");
  else fail("ComputerControlScreen MISSING handleStop");
  if (ccc.indexOf("handleClear") >= 0) ok("ComputerControlScreen contains handleClear");
  else fail("ComputerControlScreen MISSING handleClear");
  if (ccc.indexOf("executeCommand") < 0) ok("ComputerControlScreen has no direct executeCommand");
  else fail("ComputerControlScreen has direct executeCommand (unrestricted)");
  if (ccc.indexOf("eval(") < 0) ok("ComputerControlScreen has no eval()");
  else fail("ComputerControlScreen has eval()");
  if (ccc.indexOf("executeStep") >= 0) ok("ComputerControlScreen imports executeStep");
  else fail("ComputerControlScreen MISSING executeStep import");
  if (ccc.indexOf("simulateStepExecution") < 0) ok("ComputerControlScreen has no simulateStepExecution (using real executeStep)");
  else fail("ComputerControlScreen still uses simulateStepExecution (should use executeStep)");
} else {
  fail("ComputerControlScreen.tsx MISSING");
}

var enPath = path.join(ROOT, "packages/shared/src/i18n/en.ts");
if (fs.existsSync(enPath)) {
  var enc = fs.readFileSync(enPath, "utf-8");
  if (enc.indexOf("previewNotice") >= 0) ok("en.ts contains previewNotice");
  else fail("en.ts MISSING previewNotice");
  if (enc.indexOf("generatePlan") >= 0) ok("en.ts contains generatePlan i18n");
  else fail("en.ts MISSING generatePlan i18n");
  if (enc.indexOf("noScreen") >= 0) ok("en.ts contains noScreen");
  else fail("en.ts MISSING noScreen");
  if (enc.indexOf("noMouse") >= 0) ok("en.ts contains noMouse");
  else fail("en.ts MISSING noMouse");
  if (enc.indexOf("noKeyboard") >= 0) ok("en.ts contains noKeyboard");
  else fail("en.ts MISSING noKeyboard");
}

var zhPath = path.join(ROOT, "packages/shared/src/i18n/zh-CN.ts");
if (fs.existsSync(zhPath)) {
  var zhc = fs.readFileSync(zhPath, "utf-8");
  if (zhc.indexOf("预览版") >= 0) ok("zh-CN.ts contains 预览版");
  else fail("zh-CN.ts MISSING 预览版");
  if (zhc.indexOf("不读屏幕") >= 0) ok("zh-CN.ts contains 不读屏幕");
  else fail("zh-CN.ts MISSING 不读屏幕");
  if (zhc.indexOf("不控鼠标") >= 0) ok("zh-CN.ts contains 不控鼠标");
  else fail("zh-CN.ts MISSING 不控鼠标");
  if (zhc.indexOf("不控键盘") >= 0) ok("zh-CN.ts contains 不控键盘");
  else fail("zh-CN.ts MISSING 不控键盘");
}

// ==== v1.5.5 Tauri version match checks ====
console.log("\n--- v1.5.5 Tauri version match checks ---");
var cargoPath2 = path.join(ROOT, "apps/desktop/src-tauri/Cargo.toml");
var pkgPath2 = path.join(ROOT, "apps/desktop/ui/package.json");
var bridgePath = path.join(ROOT, "apps/desktop/ui/src/desktop-bridge.ts");

var tauriMajor = 0;
if (fs.existsSync(cargoPath2)) {
  var cargoContent = fs.readFileSync(cargoPath2, "utf-8");
  var tauriMatch = cargoContent.match(/tauri\s*=\s*\{[^}]*version\s*=\s*"(\d+)\./);
  if (tauriMatch) { tauriMajor = parseInt(tauriMatch[1], 10); }
}
var apiMajor = 0;
if (fs.existsSync(pkgPath2)) {
  var pkgContent = fs.readFileSync(pkgPath2, "utf-8");
  var apiMatch = pkgContent.match(/"@tauri-apps\/api":\s*"[\^~]?(\d+)\./);
  if (apiMatch) { apiMajor = parseInt(apiMatch[1], 10); }
}
var cliMajor = 0;
var desktopPkgPath = path.join(ROOT, "apps/desktop/package.json");
if (fs.existsSync(desktopPkgPath)) {
  var desktopPkg = fs.readFileSync(desktopPkgPath, "utf-8");
  var cliMatch = desktopPkg.match(/"@tauri-apps\/cli":\s*"[\^~]?(\d+)\./);
  if (cliMatch) { cliMajor = parseInt(cliMatch[1], 10); }
}
console.log("  INFO: Cargo tauri major = " + tauriMajor);
console.log("  INFO: @tauri-apps/api major = " + apiMajor);
console.log("  INFO: @tauri-apps/cli major = " + cliMajor);

var versionsMatch = (tauriMajor === apiMajor && tauriMajor > 0);
if (!versionsMatch) {
  fail("Tauri version mismatch: Cargo=" + tauriMajor + " api=" + apiMajor + " cli=" + cliMajor);
} else {
  ok("Tauri versions match: major=" + tauriMajor);
}

if (fs.existsSync(bridgePath)) {
  var bc2 = fs.readFileSync(bridgePath, "utf-8");
  if (tauriMajor === 1) {
    if (bc2.indexOf('"@tauri-apps/api/tauri"') >= 0) ok("desktop-bridge.ts uses /tauri (correct for v1)");
    else fail("desktop-bridge.ts must use /tauri import for Tauri v1");
    if (bc2.indexOf('"@tauri-apps/api/core"') < 0) ok("desktop-bridge.ts has no /core import");
    else fail("desktop-bridge.ts has /core import (wrong for v1)");
  }
  if (tauriMajor === 2) {
    if (bc2.indexOf('"@tauri-apps/api/core"') >= 0) ok("desktop-bridge.ts uses /core (correct for v2)");
    else fail("desktop-bridge.ts must use /core import for Tauri v2");
  }
  var wc = (bc2.match(/window\.__TAURI__/g) || []).length;
  var commentOnly = bc2.match(/\/\/.*window\.__TAURI__/);
  if (wc <= 1 || (wc === 1 && commentOnly)) ok("desktop-bridge.ts no window.__TAURI__ usage");
  else fail("desktop-bridge.ts contains window.__TAURI__");
  if (bc2.indexOf("No Tauri invoke") < 0) ok("desktop-bridge.ts no No Tauri invoke");
  else fail("desktop-bridge.ts contains No Tauri invoke");
}

var mainRsPath = path.join(ROOT, "apps/desktop/src-tauri/src/main.rs");
if (fs.existsSync(mainRsPath)) {
  var rsC = fs.readFileSync(mainRsPath, "utf-8");
  if (rsC.indexOf("fn ping_tauri") >= 0) ok("main.rs has ping_tauri");
  else fail("main.rs MISSING ping_tauri");
  var hi = rsC.indexOf("generate_handler![");
  if (hi >= 0) {
    var hs = rsC.substring(hi, hi + 1300);
    if (hs.indexOf("ping_tauri,") >= 0) ok("ping_tauri registered in handler");
    else fail("ping_tauri not in handler");
    if (hs.indexOf("scan_project_directory,") >= 0) ok("scan_project_directory registered");
    else fail("scan_project_directory not in handler");
  }
}
// ==== v1.5.6 RC5 Agent Runtime checks ====
console.log("\n--- v1.5.6 RC5 Computer Use Agent checks ---");
var cuPath2 = path.join(ROOT, "apps/desktop/ui/src/data/computer-use.ts");
if (fs.existsSync(cuPath2)) {
  var cuContent2 = fs.readFileSync(cuPath2, "utf-8");
  if (cuContent2.indexOf("ComputerUseAgentStatus") >= 0) ok("computer-use.ts contains ComputerUseAgentStatus");
  else fail("computer-use.ts MISSING ComputerUseAgentStatus");
  if (cuContent2.indexOf("planComputerUseTask") >= 0) ok("computer-use.ts contains planComputerUseTask");
  else fail("computer-use.ts MISSING planComputerUseTask");
  if (cuContent2.indexOf("open_notepad_with_text") >= 0) ok("computer-use.ts contains open_notepad_with_text");
  else fail("computer-use.ts MISSING open_notepad_with_text");
  if (cuContent2.indexOf("SAFE_SCRIPT_WHITELIST") >= 0) ok("computer-use.ts contains SAFE_SCRIPT_WHITELIST");
  else fail("computer-use.ts MISSING SAFE_SCRIPT_WHITELIST");
  if (cuContent2.indexOf("eval(") < 0) ok("computer-use.ts has no eval()");
  else fail("computer-use.ts CONTAINS eval()");
} else { fail("computer-use.ts NOT FOUND"); }

// ==== v1.5.6 RC6 Chat-integrated Computer Use checks ====
console.log("\n--- v1.5.6 RC6 Chat-integrated Computer Use checks ---");
var cwPath2 = path.join(ROOT, "apps/desktop/ui/src/screens/ChatWorkspace.tsx");
if (fs.existsSync(cwPath2)) {
  var cwContent2 = fs.readFileSync(cwPath2, "utf-8");
  if (cwContent2.indexOf("detectComputerUseIntent") >= 0) ok("ChatWorkspace contains detectComputerUseIntent");
  else fail("ChatWorkspace MISSING detectComputerUseIntent");
  if (cwContent2.indexOf("ComputerUseRunCard") >= 0) ok("ChatWorkspace contains ComputerUseRunCard");
  else fail("ChatWorkspace MISSING ComputerUseRunCard");
  if (cwContent2.indexOf("useComputerUseAgent") >= 0) ok("ChatWorkspace contains useComputerUseAgent");
  else fail("ChatWorkspace MISSING useComputerUseAgent");
} else { fail("ChatWorkspace NOT FOUND"); }
var ccPath2 = path.join(ROOT, "apps/desktop/ui/src/screens/ComputerControlScreen.tsx");
if (fs.existsSync(ccPath2)) {
  var ccContent2 = fs.readFileSync(ccPath2, "utf-8");
  if (ccContent2.indexOf("useComputerUseAgent") >= 0) ok("ComputerControlScreen uses useComputerUseAgent");
  else fail("ComputerControlScreen MISSING useComputerUseAgent");
} else { fail("ComputerControlScreen NOT FOUND"); }
var cuHookPath = path.join(ROOT, "apps/desktop/ui/src/features/computer-use/useComputerUseAgent.ts");
if (fs.existsSync(cuHookPath)) {
  var hookContent = fs.readFileSync(cuHookPath, "utf-8");
  if (hookContent.indexOf("detectComputerUseIntent") >= 0) ok("useComputerUseAgent contains detectComputerUseIntent");
  else fail("useComputerUseAgent MISSING detectComputerUseIntent");
} else { fail("useComputerUseAgent.ts NOT FOUND"); }
var cuCardPath = path.join(ROOT, "apps/desktop/ui/src/features/computer-use/ComputerUseRunCard.tsx");
if (fs.existsSync(cuCardPath)) {
  var cardContent = fs.readFileSync(cuCardPath, "utf-8");
  if (cardContent.indexOf("ComputerUseRunCard") >= 0) ok("ComputerUseRunCard exists");
  else fail("ComputerUseRunCard MISSING export");
} else { fail("ComputerUseRunCard.tsx NOT FOUND"); }
var mainPath2 = path.join(ROOT, "apps/desktop/src-tauri/src/main.rs");
if (fs.existsSync(mainPath2)) {
  var mainContent2 = fs.readFileSync(mainPath2, "utf-8");
  if (mainContent2.indexOf("run_computer_use_action") >= 0) ok("main.rs contains run_computer_use_action");
  else fail("main.rs MISSING run_computer_use_action");
} else { fail("main.rs NOT FOUND"); }
var bridgePath2 = path.join(ROOT, "apps/desktop/ui/src/desktop-bridge.ts");
if (fs.existsSync(bridgePath2)) {
  var bridgeContent2 = fs.readFileSync(bridgePath2, "utf-8");
  if (bridgeContent2.indexOf("runComputerUseAction") >= 0) ok("desktop-bridge.ts contains runComputerUseAction");
  else fail("desktop-bridge.ts MISSING runComputerUseAction");
} else { fail("desktop-bridge.ts NOT FOUND"); }


console.log("\n=== RESULT: " + errors.length + " error(s) ===");
if (errors.length > 0) { console.log("Failures:"); errors.forEach(function(e) { console.log("  - " + e); }); process.exit(1); }
else { console.log("All checks passed."); process.exit(0);
}
// source_guard.js v1.3.6 - protects against flattened/minified source files

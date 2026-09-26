// Regression tests: the Computer Use diagnostics must describe this product.
//
// The allowlisted diagnostics preview kept a block of Windows-era constants:
//
//   const VERSION = "v1.5.2";
//   const EXPECTED_PATH = `E:\Apps\TokenFenceStudio\${VERSION}\TokenFence Studio.exe`;
//   const PROJECT_ROOT = "E:\Dev\tokenfence-studio-clean";
//   const INSTALL_DIR = `E:\Apps\TokenFenceStudio\${VERSION}`;
//
// and ran `powershell`, `cmd /c` and `explorer` through the desktop bridge. On
// this macOS v2.4.0-alpha.2 build every diagnostic therefore reported a retired
// version, looked for an app bundle that cannot exist, executed its checks
// inside a path nobody owns, and could not open any folder at all.
//
// The checks below pin the platform facts without executing the diagnostics,
// which would touch the real filesystem through the desktop bridge.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const MODULE = 'apps/desktop/ui/src/data/computer-use.ts';
const filePath = path.join(repoRoot, MODULE);

// A minimal browser-ish environment: the module reaches for `window` and
// `localStorage` at import time through its persistence helpers.
globalThis.window = globalThis.window ?? { dispatchEvent: () => true };
globalThis.localStorage = globalThis.localStorage ?? {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class CustomEvent {
  constructor(type, init) { this.type = type; this.detail = init && init.detail; }
};

const compiledCache = new Map();

function resolveSpecifier(fromDir, specifier) {
  let base;
  if (specifier.startsWith('.')) {
    base = path.resolve(fromDir, specifier);
  } else if (specifier === '@tauri-apps/api/tauri') {
    // The desktop bridge imports this at module scope; a stub export is enough
    // because nothing in this test invokes the native layer.
    return null;
  } else {
    throw new Error(`Unexpected external dependency: ${specifier}`);
  }
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Cannot resolve ${specifier} from ${fromDir}`);
}

function loadCompiled(target) {
  if (compiledCache.has(target)) return compiledCache.get(target);
  const output = ts.transpileModule(fs.readFileSync(target, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.React },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    const resolved = resolveSpecifier(path.dirname(target), specifier);
    if (resolved === null) return { invoke: async () => undefined, listen: async () => () => undefined };
    return loadCompiled(resolved);
  };
  compiledCache.set(target, module.exports);
  new Function('exports', 'require', 'module', '__filename', '__dirname', output)(
    module.exports,
    localRequire,
    module,
    target,
    path.dirname(target),
  );
  compiledCache.set(target, module.exports);
  return module.exports;
}

// --- 1. the module must load and keep its public surface ----------------
const computerUse = loadCompiled(filePath);
for (const name of [
  'loadComputerUseState',
  'saveComputerUseState',
  'isDangerousTask',
  'generatePlan',
  'executeStep',
  'getPermissionMode',
  'setPermissionMode',
  'evaluateComputerUsePermission',
  'loadAuditLog',
  'saveAuditEntry',
  'loadAgentState',
  'saveAgentState',
  'planComputerUseTask',
  'runAgentSteps',
  'clearAuditLog',
]) {
  assert.equal(typeof computerUse[name], 'function', `${name} must stay exported`);
}

// --- 2. the retired Windows constants must be gone ---------------------
const source = fs.readFileSync(filePath, 'utf8');
// Strip comments so the explanatory note above the constants is not matched.
const code = source
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

assert.doesNotMatch(code, /E:\\+Apps\\+TokenFenceStudio/, 'the retired install path must not return');
assert.doesNotMatch(code, /tokenfence-studio-clean/, 'the retired project path must not return');
assert.doesNotMatch(code, /const VERSION = "v1\.5\.2"/, 'the retired version constant must not return');
assert.doesNotMatch(code, /"powershell"/, 'the Windows shell must not be invoked');
assert.doesNotMatch(code, /"cmd"/, 'the Windows command interpreter must not be invoked');
assert.doesNotMatch(code, /"explorer"/, 'the Windows file manager must not be invoked');
assert.doesNotMatch(code, /WScript/, 'the Windows scripting host must not be referenced');
assert.doesNotMatch(code, /TokenFence Studio\.exe/, 'the retired executable name must not return');

// --- 3. the replacement must describe macOS ----------------------------
assert.match(code, /const PRODUCT_VERSION = "[0-9]+\.[0-9]+\.[0-9]+/, 'a real product version must be declared');
assert.match(code, /const MACOS_INSTALL_DIR = "\/Applications\/Chris Studio\.app"/, 'the macOS install location must be declared');
assert.match(code, /function diagnosticProjectRoot\(\)/, 'the project root must be resolved at runtime');
assert.match(code, /function isMacPlatform\(\)/, 'the platform probe must stay present');

// The declared version must match the shipped manifest, so a release bump
// cannot leave the diagnostics reporting the previous version.
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'apps/desktop/ui/package.json'), 'utf8'));
const versionMatch = code.match(/const PRODUCT_VERSION = "([^"]+)"/);
assert.ok(versionMatch, 'the product version must be declared');
assert.equal(
  versionMatch[1],
  manifest.version,
  `the diagnostics version (${versionMatch[1]}) must match the desktop manifest (${manifest.version})`,
);
assert.doesNotMatch(versionMatch[1], /^v/, 'the version constant must not carry a leading v');

// --- 4. commands must be POSIX programs -------------------------------
const commandLiterals = [...code.matchAll(/executeCommand\(\s*"([^"]+)"/g)].map((match) => match[1]);
assert.ok(commandLiterals.length >= 2, 'the diagnostics must still invoke their checks');
for (const command of commandLiterals) {
  assert.match(
    command,
    /^(\/|git$|[a-z][a-z0-9_-]*$)/,
    `an absolute path or a plain program name is expected, found ${command}`,
  );
  assert.ok(!/^(cmd|powershell|explorer)$/i.test(command), `${command} is a Windows-only program`);
}
// The shell invocations must pass through /bin/sh with an explicit command.
assert.ok(
  commandLiterals.includes('/bin/sh'),
  'the npm-based checks must run through a POSIX shell',
);
assert.ok(
  commandLiterals.some((command) => command.startsWith('/usr/bin/')),
  'opening a folder must use a macOS system program',
);
for (const match of code.matchAll(/executeCommand\(\s*"\/bin\/sh",\s*\["-lc"/g)) {
  assert.ok(match, 'the POSIX shell must be invoked with -lc');
}
assert.doesNotMatch(code, /\{"-c"/, 'the Windows cmd flag must not be used with /bin/sh');

// --- 5. plan construction must stay allowlisted -----------------------
const ALLOWED = [
  'check_version',
  'check_process_path',
  'check_shortcuts',
  'check_release_diagnostics',
  'run_guard_source',
  'run_release_sanity',
  'run_verify_raw',
  'open_install_folder',
];
for (const step of ALLOWED) {
  assert.match(code, new RegExp(`(?:case |commandId: )"${step}"`), `${step} must stay reachable`);
}

// A dangerous task must be refused before any command is built.
assert.equal(typeof computerUse.isDangerousTask, 'function');
assert.equal(computerUse.isDangerousTask('rm -rf /'), true, 'a destructive task must be flagged');
assert.equal(computerUse.isDangerousTask('check the current version'), false, 'a routine check must pass');

const plan = computerUse.generatePlan('check the current version');
assert.equal(plan.blocked, false, 'a routine check must produce a plan');
assert.ok(Array.isArray(plan.plan), 'the plan must be a list');
assert.ok(plan.plan.every((step) => ALLOWED.includes(step.commandId) || step.commandId === undefined),
  'every planned step must use an allowlisted command id');

const blocked = computerUse.generatePlan('delete every file on the disk');
assert.equal(blocked.blocked, true, 'a destructive request must be blocked');
assert.ok(blocked.plan.length >= 1, 'a blocked request explains itself with a step');
assert.ok(
  blocked.plan.every((step) => step.riskLevel === 'blocked'),
  'every step of a blocked request must be marked blocked',
);
assert.ok(
  blocked.plan.every((step) => step.commandId === undefined),
  'a blocked request must not carry an executable command id',
);

// --- 6. permission gates must stay intact -----------------------------
const MODES = ['request_approval', 'auto_review', 'full_access'];
assert.ok(MODES.includes(computerUse.getPermissionMode()), 'the mode must be one of the known values');

function actionRequest(patch = {}) {
  return {
    actionId: 'open_install_folder',
    label: 'Open install folder',
    description: 'Open the install location in Finder',
    riskLevel: 'low',
    ...patch,
  };
}

const askDecision = computerUse.evaluateComputerUsePermission(actionRequest(), 'request_approval');
assert.equal(askDecision.decision, 'ask', 'request_approval must ask before acting');
assert.equal(typeof askDecision.reason, 'string', 'a decision must explain itself');

const lowRisk = computerUse.evaluateComputerUsePermission(actionRequest(), 'auto_review');
assert.equal(lowRisk.decision, 'allow', 'auto_review may allow a low-risk step');

const highRisk = computerUse.evaluateComputerUsePermission(actionRequest({ riskLevel: 'high' }), 'auto_review');
assert.equal(highRisk.decision, 'block', 'auto_review must block a high-risk step');

// The hard gates must hold in every mode, including full access.
for (const mode of MODES) {
  assert.equal(
    computerUse.evaluateComputerUsePermission(actionRequest({ isDestructive: true }), mode).decision,
    'block',
    `a destructive action must be blocked in ${mode}`,
  );
  assert.equal(
    computerUse.evaluateComputerUsePermission(actionRequest({ riskLevel: 'blocked' }), mode).decision,
    'block',
    `an enterprise-blocked action must be blocked in ${mode}`,
  );
}

// Full access is a convenience, not an allowlist bypass.
const fullAccess = computerUse.evaluateComputerUsePermission(actionRequest(), 'full_access');
assert.equal(fullAccess.decision, 'allow', 'full access allows an ordinary allowlisted step');

console.log('CHRIS_STUDIO_V2_4_MACOS_DIAGNOSTICS_PASSED');

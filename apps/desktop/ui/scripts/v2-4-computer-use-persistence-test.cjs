// Regression tests: Computer Use persistence must tolerate untrusted data.
//
// Two loaders returned `JSON.parse(raw)` without inspection:
//
//   loadAuditLog    -> a non-array payload was handed back verbatim, and the
//                      next `saveAuditEntry` threw on `log.push is not a
//                      function`, silently stopping the audit trail.
//   loadAgentState  -> a stored object missing `plan`/`logs` (or holding a
//                      non-array there) reached code that maps over them, and a
//                      string `currentStepIndex` selected the wrong step.
//
// Entries inside a valid array were equally unchecked: a `null` audit entry or
// one without a numeric timestamp reached the Computer Use panel.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const MODULE = 'apps/desktop/ui/src/data/computer-use.ts';
const AUDIT_KEY = 'tokenfence.computerUse.auditLog';
const AGENT_KEY = 'tokenfence.computerUse.agent';

// The module touches `window`, `localStorage`, `navigator` and `CustomEvent` at
// import time through its persistence and platform helpers.
let backing = new Map();
globalThis.localStorage = {
  getItem: (key) => (backing.has(key) ? backing.get(key) : null),
  setItem: (key, value) => { backing.set(key, String(value)); },
  removeItem: (key) => { backing.delete(key); },
};
globalThis.window = {
  localStorage: globalThis.localStorage,
  dispatchEvent: () => true,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  open: () => undefined,
};
globalThis.navigator = globalThis.navigator ?? { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh)' };
globalThis.CustomEvent = globalThis.CustomEvent ?? class CustomEvent {
  constructor(type, init) { this.type = type; this.detail = init && init.detail; }
};

const compiledCache = new Map();

function resolveSpecifier(fromDir, specifier) {
  if (specifier === '@tauri-apps/api/tauri') return null;
  let base;
  if (specifier.startsWith('.')) {
    base = path.resolve(fromDir, specifier);
  } else if (specifier.startsWith('@tokenfence/shared/')) {
    base = path.join(repoRoot, 'packages/shared', specifier.slice('@tokenfence/shared/'.length));
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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    const resolved = resolveSpecifier(path.dirname(target), specifier);
    if (resolved === null) return { invoke: async () => undefined, listen: async () => () => undefined };
    return loadCompiled(resolved);
  };
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

const computerUse = loadCompiled(path.join(repoRoot, MODULE));

function seedAudit(raw) {
  backing = new Map();
  if (raw !== undefined) globalThis.localStorage.setItem(AUDIT_KEY, raw);
}
function seedAgent(raw) {
  backing = new Map();
  if (raw !== undefined) globalThis.localStorage.setItem(AGENT_KEY, raw);
}
function auditEntry(id, patch = {}) {
  return {
    id,
    timestamp: 1_700_000_000_000,
    taskText: 'check the current version',
    actionId: 'check_version',
    decision: 'allowed',
    decisionReason: 'routine diagnostic',
    permissionMode: 'request_approval',
    approvedByUser: true,
    observation: 'done',
    ...patch,
  };
}

// --- 1. an unusable audit slot must read as an empty log -----------------
const BAD_SLOTS = [
  ['an object', JSON.stringify({ not: 'an array' })],
  ['a string', JSON.stringify('oops')],
  ['a number', JSON.stringify(42)],
  ['a boolean', 'true'],
  ['null', 'null'],
  ['malformed JSON', '{not json'],
];
for (const [label, raw] of BAD_SLOTS) {
  seedAudit(raw);
  let result;
  let threw = null;
  try {
    result = computerUse.loadAuditLog();
  } catch (error) {
    threw = String(error && error.message);
  }
  assert.equal(threw, null, `the audit slot holding ${label} must not throw`);
  assert.deepEqual(result, [], `the audit slot holding ${label} must read as an empty log`);
}

// --- 2. and writing must still succeed afterwards ------------------------
seedAudit(JSON.stringify({ not: 'an array' }));
assert.doesNotThrow(
  () => computerUse.saveAuditEntry(auditEntry('after-repair')),
  'a write after a damaged slot must not throw',
);
const repairedLog = computerUse.loadAuditLog();
assert.equal(repairedLog.length, 1, 'the new entry must be stored');
assert.equal(repairedLog[0].id, 'after-repair');

// --- 3. unusable entries inside a valid array are dropped ---------------
seedAudit(JSON.stringify([
  null,
  'junk',
  42,
  [],
  { id: 'no-timestamp' },
  { timestamp: 1 },
  { id: 'bad-timestamp', timestamp: 'yesterday' },
  auditEntry('kept'),
]));
const log = computerUse.loadAuditLog();
assert.equal(log.length, 1, 'only the well-formed entry survives');
assert.equal(log[0].id, 'kept');
assert.equal(log[0].timestamp, 1_700_000_000_000);
assert.equal(log[0].approvedByUser, true);

// Missing optional text is normalised rather than left undefined.
seedAudit(JSON.stringify([{ id: 'minimal', timestamp: 1 }]));
const minimal = computerUse.loadAuditLog()[0];
assert.equal(minimal.taskText, '', 'a missing task text becomes an empty string');
assert.equal(minimal.actionId, '');
assert.equal(minimal.decision, '');
assert.equal(minimal.decisionReason, '');
assert.equal(minimal.permissionMode, '');
assert.equal(minimal.observation, '');
assert.equal(minimal.approvedByUser, false, 'a missing approval flag is false');
assert.equal(minimal.error, undefined);

// The audit log is capped when written.
seedAudit();
for (let index = 0; index < 5; index += 1) computerUse.saveAuditEntry(auditEntry(`e${index}`));
assert.equal(computerUse.loadAuditLog().length, 5, 'entries accumulate');
computerUse.clearAuditLog();
assert.deepEqual(computerUse.loadAuditLog(), [], 'clearing empties the log');

// --- 4. the agent state must always expose the documented shape ---------
const BAD_AGENT_SLOTS = [
  ['a bare object', JSON.stringify({ status: 'idle' })],
  ['a string', JSON.stringify('oops')],
  ['a number', JSON.stringify(42)],
  ['an array', JSON.stringify([])],
  ['null', 'null'],
  ['malformed JSON', '{not json'],
  ['a non-array plan', JSON.stringify({ status: 'idle', plan: 'x', logs: [], currentStepIndex: 0, updatedAt: 1 })],
  ['a non-array logs', JSON.stringify({ status: 'idle', plan: [], logs: {}, currentStepIndex: 0, updatedAt: 1 })],
];
for (const [label, raw] of BAD_AGENT_SLOTS) {
  seedAgent(raw);
  let state;
  let threw = null;
  try {
    state = computerUse.loadAgentState();
  } catch (error) {
    threw = String(error && error.message);
  }
  assert.equal(threw, null, `the agent slot holding ${label} must not throw`);
  assert.ok(Array.isArray(state.plan), `${label}: plan must be an array`);
  assert.ok(Array.isArray(state.logs), `${label}: logs must be an array`);
  assert.equal(typeof state.currentStepIndex, 'number', `${label}: the step index must be a number`);
  assert.equal(typeof state.taskText, 'string', `${label}: the task text must be a string`);
  assert.equal(typeof state.updatedAt, 'number', `${label}: the timestamp must be a number`);
}

// --- 5. out-of-range and wrong-typed fields are normalised --------------
seedAgent(JSON.stringify({
  status: 'bogus',
  taskText: 5,
  plan: [],
  currentStepIndex: 'first',
  logs: [],
  permissionMode: 'bogus',
  updatedAt: 'yesterday',
}));
const normalized = computerUse.loadAgentState();
assert.equal(normalized.status, 'idle', 'an unknown status falls back to idle');
assert.equal(normalized.taskText, '', 'a non-string task text becomes empty');
assert.equal(normalized.currentStepIndex, 0, 'a non-numeric step index becomes 0');
assert.ok(
  ['request_approval', 'auto_review', 'full_access'].includes(normalized.permissionMode),
  'an unknown permission mode falls back to a supported one',
);
assert.ok(Number.isFinite(normalized.updatedAt) && normalized.updatedAt > 0, 'the timestamp is usable');

seedAgent(JSON.stringify({ status: 'running', plan: [], logs: [], currentStepIndex: -5, updatedAt: 1 }));
assert.equal(computerUse.loadAgentState().currentStepIndex, 0, 'a negative step index becomes 0');
seedAgent(JSON.stringify({ status: 'running', plan: [], logs: [], currentStepIndex: 2.7, updatedAt: 1 }));
assert.equal(computerUse.loadAgentState().currentStepIndex, 2, 'a fractional step index is floored');

// Unusable steps inside the plan are dropped.
seedAgent(JSON.stringify({
  status: 'planning',
  taskText: 'plan',
  plan: [null, 'junk', {}, { id: 'ok', index: 0, title: 't', description: 'd', actionId: 'check_version', args: {}, riskLevel: 'low', status: 'pending' }],
  logs: [null, 'junk', {}],
  currentStepIndex: 0,
  permissionMode: 'auto_review',
  updatedAt: 1,
}));
const withSteps = computerUse.loadAgentState();
assert.equal(withSteps.plan.length, 1, 'only the well-formed step survives');
assert.equal(withSteps.plan[0].id, 'ok');
assert.equal(withSteps.plan[0].args && typeof withSteps.plan[0].args, 'object', 'a step keeps its argument object');
assert.equal(withSteps.logs.length, 1, 'a usable log row survives while invalid ones are dropped');

// --- 6. a real round trip ------------------------------------------------
backing = new Map();
const savedState = {
  status: 'running',
  taskText: 'open the install folder',
  plan: [{ id: 's1', index: 0, title: 'Open', description: 'd', actionId: 'open_install_folder', args: { path: '/tmp' }, riskLevel: 'low', status: 'pending' }],
  currentStepIndex: 1,
  logs: [{ id: 'l1', time: 1, level: 'info', message: 'queued' }],
  permissionMode: 'auto_review',
  updatedAt: 1_700_000_000_000,
};
computerUse.saveAgentState(savedState);
const roundTrip = computerUse.loadAgentState();
assert.equal(roundTrip.status, 'running');
assert.equal(roundTrip.taskText, 'open the install folder');
assert.equal(roundTrip.plan.length, 1);
assert.equal(roundTrip.plan[0].actionId, 'open_install_folder');
assert.deepEqual(roundTrip.plan[0].args, { path: '/tmp' });
assert.equal(roundTrip.currentStepIndex, 1);
assert.equal(roundTrip.permissionMode, 'auto_review');
assert.equal(roundTrip.updatedAt, 1_700_000_000_000);
assert.equal(roundTrip.logs.length, 1);

// An empty slot yields the documented idle state.
seedAgent();
const idle = computerUse.loadAgentState();
assert.equal(idle.status, 'idle');
assert.deepEqual(idle.plan, []);
assert.deepEqual(idle.logs, []);
assert.equal(idle.currentStepIndex, 0);

// --- 7. the module must keep its guards and public surface -------------
const source = fs.readFileSync(path.join(repoRoot, MODULE), 'utf8');
assert.match(source, /function normalizeAuditEntry\(entry: unknown\)/, 'the audit validator must stay present');
assert.match(source, /function normalizeAgentStep\(entry: unknown\)/, 'the step validator must stay present');
assert.match(source, /function defaultAgentState\(\): ComputerUseAgentState/, 'the default state builder must stay present');
assert.match(source, /if \(!Array\.isArray\(parsed\)\) return \[\];/, 'the audit loader must reject non-arrays');
assert.doesNotMatch(
  source,
  /const raw = localStorage\.getItem\(AUDIT_LOG_KEY\);\s*\n\s*return raw \? JSON\.parse\(raw\) : \[\];/,
  'the unchecked audit passthrough must not return',
);
assert.doesNotMatch(
  source,
  /const raw = localStorage\.getItem\(STORAGE_KEY \+ "\.agent"\);\s*\n\s*if \(raw\) return JSON\.parse\(raw\);/,
  'the unchecked agent passthrough must not return',
);

for (const name of [
  'loadAuditLog',
  'saveAuditEntry',
  'loadAgentState',
  'saveAgentState',
  'clearAuditLog',
  'planComputerUseTask',
  'evaluateComputerUsePermission',
  'isDangerousTask',
  'generatePlan',
]) {
  assert.equal(typeof computerUse[name], 'function', `${name} must stay exported`);
}

console.log('CHRIS_STUDIO_V2_4_COMPUTER_USE_PERSISTENCE_PASSED');

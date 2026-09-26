// Regression tests: the stored active model must be a real selection.
//
// `loadActiveModel` accepted any object whose `providerId`/`modelId` were
// truthy, then ran every field through a text normalizer. A stored number, object
// or array was therefore silently coerced into a provider identity:
//
//   42                -> "42"
//   {}                -> "[object Object]"
//   [] (after canon.) -> "Unknown"
//
// The app then believed a provider the user never chose was active, and the
// mismatch only surfaced later as an unroutable request. The `source` field and
// `lastSetAt` were also carried through unchecked, so an unknown source string
// and `"yesterday"` as a timestamp both reached callers that declare them as a
// closed union and a number.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const STORAGE_KEY = 'tokenfence.activeModel';

// The module reads `localStorage` and dispatches window events directly.
let backing = new Map();
globalThis.localStorage = {
  getItem: (key) => (backing.has(key) ? backing.get(key) : null),
  setItem: (key, value) => { backing.set(key, String(value)); },
  removeItem: (key) => { backing.delete(key); },
};
globalThis.window = globalThis.window ?? {
  dispatchEvent: () => true,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class CustomEvent {
  constructor(type, init) { this.type = type; this.detail = init && init.detail; }
};

const compiledCache = new Map();

function resolveSpecifier(fromDir, specifier) {
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
  const localRequire = (specifier) => loadCompiled(resolveSpecifier(path.dirname(target), specifier));
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

const activeModel = loadCompiled(path.join(repoRoot, 'apps/desktop/ui/src/data/active-model.ts'));

function seed(raw) {
  backing = new Map();
  if (raw !== undefined) globalThis.localStorage.setItem(STORAGE_KEY, raw);
}

// --- 1. a wrong-typed identity must read as "nothing configured" ---------
const REJECTED = [
  ['a numeric providerId', JSON.stringify({ providerId: 42, modelId: 'm' })],
  ['a numeric modelId', JSON.stringify({ providerId: 'deepseek', modelId: 7 })],
  ['an object providerId', JSON.stringify({ providerId: {}, modelId: 'm' })],
  ['an array providerId', JSON.stringify({ providerId: [], modelId: 'm' })],
  ['a boolean providerId', JSON.stringify({ providerId: true, modelId: 'm' })],
  ['a null providerId', JSON.stringify({ providerId: null, modelId: 'm' })],
  ['a blank modelId', JSON.stringify({ providerId: 'd', modelId: '   ' })],
  ['a blank providerId', JSON.stringify({ providerId: '  ', modelId: 'm' })],
  ['a top-level array', JSON.stringify([{ providerId: 'd', modelId: 'm' }])],
  ['a top-level string', JSON.stringify('oops')],
  ['a top-level number', JSON.stringify(42)],
  ['null', 'null'],
];
for (const [label, raw] of REJECTED) {
  seed(raw);
  let result;
  let threw = null;
  try {
    result = activeModel.loadActiveModel();
  } catch (error) {
    threw = String(error && error.message);
  }
  assert.equal(threw, null, `${label} must not throw`);
  assert.equal(result, null, `${label} must not resolve to an active model`);
}

// --- 2. malformed storage and an empty slot -----------------------------
for (const raw of ['{not json', '', 'undefined', '[]']) {
  seed(raw);
  assert.equal(activeModel.loadActiveModel(), null, `malformed storage must read as unset: ${raw}`);
}
seed();
assert.equal(activeModel.loadActiveModel(), null, 'an empty slot reads as unset');

// --- 3. a valid record keeps its meaning --------------------------------
seed(JSON.stringify({ providerId: 'deepseek', modelId: 'deepseek-chat' }));
const valid = activeModel.loadActiveModel();
assert.ok(valid, 'a valid record must load');
assert.equal(valid.providerId, 'DeepSeek', 'the provider id must be canonicalized');
assert.equal(valid.modelId, 'deepseek-chat', 'the model id must be preserved');
assert.equal(valid.source, 'installed', 'a missing source defaults to installed');
assert.equal(valid.schemaVersion, 2, 'the loaded record is schema version 2');
assert.ok(Number.isFinite(valid.lastSetAt) && valid.lastSetAt > 0, 'a missing timestamp is filled in');
assert.equal(typeof valid.displayLabel, 'string');
assert.ok(valid.displayLabel.length > 0, 'a label must always be present');

// --- 4. the source union is enforced ------------------------------------
for (const source of ['installed', 'custom', 'library', 'fallback']) {
  seed(JSON.stringify({ providerId: 'deepseek', modelId: 'm', source }));
  assert.equal(activeModel.loadActiveModel()?.source, source, `the valid source ${source} must be preserved`);
}
for (const source of ['bogus', 'INSTALLED', 'manual', '', 42, {}]) {
  seed(JSON.stringify({ providerId: 'deepseek', modelId: 'm', source }));
  assert.equal(
    activeModel.loadActiveModel()?.source,
    'installed',
    `the unknown source ${JSON.stringify(source)} must fall back to installed`,
  );
}

// --- 5. the timestamp must stay a usable number -------------------------
for (const bad of ['yesterday', -1, 0, null, {}, Number.NaN, Number.POSITIVE_INFINITY]) {
  seed(JSON.stringify({ providerId: 'deepseek', modelId: 'm', lastSetAt: bad }));
  const record = activeModel.loadActiveModel();
  assert.equal(
    Number.isFinite(record.lastSetAt) && record.lastSetAt > 0,
    true,
    `the timestamp ${String(bad)} must be replaced with a usable number`,
  );
}
seed(JSON.stringify({ providerId: 'deepseek', modelId: 'm', lastSetAt: 1_234_567_890 }));
assert.equal(activeModel.loadActiveModel()?.lastSetAt, 1_234_567_890, 'a valid timestamp must be preserved');

// --- 6. a saved record round-trips -------------------------------------
seed();
activeModel.saveActiveModel({
  schemaVersion: 2,
  providerId: 'openai',
  modelId: 'gpt-4o',
  providerDisplayName: 'OpenAI',
  modelDisplayName: 'GPT-4o',
  displayLabel: 'OpenAI / GPT-4o',
  source: 'library',
  configured: true,
  healthy: true,
  lastSetAt: 1,
});
const roundTrip = activeModel.loadActiveModel();
assert.equal(roundTrip.providerId, 'OpenAI');
assert.equal(roundTrip.modelId, 'gpt-4o');
assert.equal(roundTrip.source, 'library', 'the saved source must survive the round trip');
assert.equal(roundTrip.configured, true, 'the configured flag must survive');
assert.equal(roundTrip.healthy, true, 'the healthy flag must survive');
assert.equal(roundTrip.displayLabel, 'OpenAI / GPT-4o', 'the label must survive');
activeModel.clearActiveModel();
assert.equal(activeModel.loadActiveModel(), null, 'clearing must remove the record');

// --- 7. the module must keep its defensive helpers ----------------------
const source = fs.readFileSync(path.join(repoRoot, 'apps/desktop/ui/src/data/active-model.ts'), 'utf8');
assert.match(source, /function storedText\(value: unknown\): string/, 'the string guard must stay present');
assert.match(source, /function storedTimestamp\(value: unknown\): number/, 'the timestamp guard must stay present');
assert.match(source, /ACTIVE_MODEL_SOURCES/, 'the source union must stay declared');
assert.doesNotMatch(
  source,
  /source: parsed\.source \|\| "installed",/,
  'the unchecked source passthrough must not return',
);
assert.doesNotMatch(
  source,
  /lastSetAt: parsed\.lastSetAt \|\| Date\.now\(\),/,
  'the unchecked timestamp passthrough must not return',
);

for (const name of [
  'loadActiveModel',
  'saveActiveModel',
  'clearActiveModel',
  'resolveActiveModel',
  'getActiveModelViewState',
  'setActiveModelV2',
  'setActiveModel',
  'validateModelForSend',
]) {
  assert.equal(typeof activeModel[name], 'function', `${name} must stay exported`);
}

console.log('CHRIS_STUDIO_V2_4_ACTIVE_MODEL_VALIDATION_PASSED');

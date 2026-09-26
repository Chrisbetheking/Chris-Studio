// Regression tests: the token usage ledger must survive untrusted stored data.
//
// `tokenUsageSummary` filtered the stored list with
// `entry.createdAt.startsWith(...)` and applied `Math.max(0, entry.x || 0)` to
// each count. Both assumed well-formed entries, so a partially written or
// hand-edited slot broke the whole panel:
//
//   null                 -> TypeError: reading 'createdAt' of null
//   "garbage"            -> TypeError: reading 'startsWith' of undefined
//   { createdAt: 12345 } -> TypeError: entry.createdAt.startsWith is not a function
//   { inputTokens: {} }  -> NaN in every derived total
//
// The summary is rendered on the settings screen, so any of those left the user
// with a broken token panel instead of the usage that was actually recorded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const USAGE_KEY = 'tokenfence.token-usage.v180';

// The store reads `localStorage` and dispatches window events directly.
let backing = new Map();
globalThis.localStorage = {
  getItem: (key) => (backing.has(key) ? backing.get(key) : null),
  setItem: (key, value) => { backing.set(key, String(value)); },
  removeItem: (key) => { backing.delete(key); },
};
globalThis.window = globalThis.window ?? {
  localStorage: globalThis.localStorage,
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

const store = loadCompiled(path.join(repoRoot, 'apps/desktop/ui/src/app/store.ts'));
const TODAY = new Date().toISOString().slice(0, 10);

function seed(entries) {
  backing = new Map();
  if (entries !== undefined) {
    globalThis.localStorage.setItem(USAGE_KEY, JSON.stringify(entries));
  }
}

function entry(id, patch = {}) {
  return {
    id,
    createdAt: `${TODAY}T12:00:00.000Z`,
    provider: 'Test Provider',
    model: 'test-model',
    inputTokens: 100,
    outputTokens: 50,
    savedTokens: 10,
    ...patch,
  };
}

// --- 1. damaged entries must never throw and never yield NaN ------------
const DAMAGED = [
  ['a null entry', [null]],
  ['a missing createdAt', [{ id: 'a', inputTokens: 10 }]],
  ['a numeric createdAt', [{ id: 'b', createdAt: 12345, inputTokens: 10 }]],
  ['a null createdAt', [{ id: 'c', createdAt: null, inputTokens: 10 }]],
  ['a bare string entry', ['garbage']],
  ['an array entry', [[]]],
  ['a numeric entry', [42]],
  ['a nested object count', [{ id: 'd', createdAt: TODAY, inputTokens: {} }]],
  ['a string count', [{ id: 'e', createdAt: TODAY, inputTokens: 'lots' }]],
  ['a negative count', [{ id: 'f', createdAt: TODAY, inputTokens: -50, savedTokens: -5 }]],
  ['a mixed list', [null, 'junk', entry('ok'), { id: 'bad' }]],
];
for (const [label, entries] of DAMAGED) {
  seed(entries);
  let summary;
  let threw = null;
  try {
    summary = store.tokenUsageSummary(TODAY);
  } catch (error) {
    threw = String(error && error.message);
  }
  assert.equal(threw, null, `${label} must not make the summary throw`);
  for (const key of ['inputTokens', 'outputTokens', 'savedTokens', 'totalTokens']) {
    assert.equal(
      Number.isFinite(summary[key]) && summary[key] >= 0,
      true,
      `${label}: ${key} must be a finite non-negative number, got ${String(summary[key])}`,
    );
  }
}

// --- 2. well-formed entries are aggregated correctly --------------------
seed([
  entry('one', { inputTokens: 100, outputTokens: 50, savedTokens: 10 }),
  entry('two', { inputTokens: 200, outputTokens: 80, savedTokens: 20 }),
]);
const totals = store.tokenUsageSummary(TODAY);
assert.equal(totals.inputTokens, 300);
assert.equal(totals.outputTokens, 130);
assert.equal(totals.savedTokens, 30);
assert.equal(totals.totalTokens, 430, 'total counts input plus output');

// --- 3. the date filter is honoured ------------------------------------
seed([
  entry('jan', { createdAt: '2026-01-01T00:00:00.000Z', inputTokens: 100, outputTokens: 0, savedTokens: 0 }),
  entry('feb', { createdAt: '2026-02-01T00:00:00.000Z', inputTokens: 200, outputTokens: 0, savedTokens: 0 }),
]);
assert.equal(store.tokenUsageSummary('2026-01').inputTokens, 100);
assert.equal(store.tokenUsageSummary('2026-02').inputTokens, 200);
assert.equal(store.tokenUsageSummary('2026').inputTokens, 300, 'a coarse prefix matches both months');
assert.equal(store.tokenUsageSummary('2099').inputTokens, 0, 'a prefix with no matches reports zero');

// A non-string prefix must not throw: `startsWith` would reject it outright.
for (const prefix of [null, undefined, 42, {}]) {
  assert.doesNotThrow(() => store.tokenUsageSummary(prefix), `a ${String(prefix)} prefix must be tolerated`);
}

// --- 4. the stored list is filtered and capped --------------------------
seed([null, 'junk', {}, entry('kept')]);
const loaded = store.loadTokenUsage();
assert.equal(loaded.length, 1, 'only aggregatable entries survive the read');
assert.equal(loaded[0].id, 'kept');
assert.equal(loaded[0].inputTokens, 100);

seed(Array.from({ length: 6000 }, (_value, index) => entry(`e${index}`)));
assert.equal(store.loadTokenUsage().length, 5000, 'the ledger stays capped at 5000 entries');

seed();
assert.deepEqual(store.loadTokenUsage(), [], 'an empty slot yields an empty ledger');
for (const raw of ['not json', '"text"', '42', '{}']) {
  backing = new Map();
  globalThis.localStorage.setItem(USAGE_KEY, raw);
  assert.deepEqual(store.loadTokenUsage(), [], `malformed storage yields an empty ledger: ${raw}`);
}

// --- 5. recording and clearing round-trip -------------------------------
seed();
store.recordTokenUsage(entry('recorded'));
assert.equal(store.loadTokenUsage().length, 1, 'a recorded entry must be readable');
assert.equal(store.tokenUsageSummary(TODAY).inputTokens, 100, 'the summary must reflect the record');
store.recordTokenUsage(entry('second'));
assert.equal(store.loadTokenUsage().length, 2, 'records accumulate');
store.clearTokenUsage();
assert.equal(store.loadTokenUsage().length, 0, 'clearing empties the ledger');
assert.equal(store.tokenUsageSummary(TODAY).totalTokens, 0, 'a cleared ledger reports zero');

// --- 6. the implementation must keep its guard -------------------------
const source = fs.readFileSync(path.join(repoRoot, 'apps/desktop/ui/src/app/store.ts'), 'utf8');
assert.match(
  source,
  /function normalizeTokenUsageEntry\(entry: unknown\): TokenUsageEntry \| undefined/,
  'the entry validator must stay present',
);
assert.doesNotMatch(
  source,
  /entry\.createdAt\.startsWith\(datePrefix\)/,
  'the unguarded createdAt access must not return',
);
assert.doesNotMatch(
  source,
  /Math\.max\(0, entry\.inputTokens \|\| 0\)/,
  'the coercing count arithmetic must not return',
);

console.log('CHRIS_STUDIO_V2_4_TOKEN_USAGE_LEDGER_PASSED');

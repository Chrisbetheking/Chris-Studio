// Regression tests: the per-request token limit must reach the provider call.
//
// The settings screen exposes "Per-request token limit" (`maxRequestTokens`,
// 1,000–1,000,000) and `providerRequest` sent `maxTokens: 8192` as a literal.
// Raising the setting changed nothing, and lowering it did not protect the daily
// quota — the control was a no-op for the whole release.
//
// `requestMaxTokens()` now resolves the configured value per request, clamped to
// the range the native commands enforce (`1..32768`), with an unusable value
// falling back to the previous default rather than collapsing the budget.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const MODULE = 'apps/desktop/ui/src/features/providers/providerClient.ts';
const SETTINGS_KEY = 'tokenfence.settings.v170';

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

function loadCompiled(target) {
  if (compiledCache.has(target)) return compiledCache.get(target);
  const output = ts.transpileModule(fs.readFileSync(target, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier === '@tauri-apps/api/tauri') {
      return { invoke: async () => undefined };
    }
    if (specifier === '@tauri-apps/api/event') {
      return { listen: async () => () => undefined };
    }
    let base;
    if (specifier.startsWith('.')) {
      base = path.resolve(path.dirname(target), specifier);
    } else if (specifier.startsWith('@tokenfence/shared/')) {
      base = path.join(repoRoot, 'packages/shared', specifier.slice('@tokenfence/shared/'.length));
    } else {
      throw new Error(`Unexpected external dependency: ${specifier}`);
    }
    for (const candidate of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return loadCompiled(candidate);
    }
    throw new Error(`Cannot resolve ${specifier} from ${target}`);
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

const client = loadCompiled(path.join(repoRoot, MODULE));

function seedSettings(value) {
  backing = new Map();
  if (value !== undefined) {
    globalThis.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ maxRequestTokens: value }));
  }
}

// --- 1. the configured value reaches the request -------------------------
assert.equal(typeof client.requestMaxTokens, 'function', 'the resolver must be exported for testability');

const HONOURED = [
  ['the shipped default', undefined, 32_000],
  ['a low value', 1_000, 1_000],
  ['a mid value', 12_000, 12_000],
  ['exactly the native maximum', 32_768, 32_768],
  ['fractional input', 12_000.7, 12_000],
];
for (const [label, configured, expected] of HONOURED) {
  seedSettings(configured);
  assert.equal(client.requestMaxTokens(), expected, `${label} must resolve to ${expected}`);
}

// The native commands clamp to 32,768, so a larger setting must not exceed it.
for (const configured of [32_769, 100_000, 1_000_000]) {
  seedSettings(configured);
  assert.equal(client.requestMaxTokens(), 32_768, `a setting of ${configured} clamps to the native maximum`);
}

// --- 2. an unusable value falls back instead of collapsing the budget ---
for (const configured of [0, -500, Number.NaN, null, 'not-a-number', {}, []]) {
  seedSettings(configured);
  const resolved = client.requestMaxTokens();
  assert.equal(resolved, 8_192, `the unusable setting ${JSON.stringify(configured)} falls back to the default`);
  assert.ok(resolved > 0, 'a request must never be sent with a zero completion budget');
}

// A corrupt settings slot must not block the send.
for (const raw of ['null', JSON.stringify('oops'), JSON.stringify([]), '{not json']) {
  backing = new Map();
  globalThis.localStorage.setItem(SETTINGS_KEY, raw);
  const resolved = client.requestMaxTokens();
  assert.ok(Number.isFinite(resolved) && resolved > 0, `a corrupt settings slot still resolves a usable budget: ${raw}`);
}

// --- 3. the request builder must use the resolver ------------------------
const source = fs.readFileSync(path.join(repoRoot, MODULE), 'utf8');
assert.match(source, /maxTokens: requestMaxTokens\(\)/, 'the request must resolve its budget per call');
assert.doesNotMatch(source, /maxTokens: 8192/, 'the hard-coded budget must not return');
assert.match(source, /const MAX_REQUEST_TOKENS = 32_768;/, 'the native maximum must stay declared');
assert.match(source, /const FALLBACK_REQUEST_TOKENS = 8_192;/, 'the fallback must stay declared');
assert.match(source, /import \{ loadSettings \} from '\.\.\/\.\.\/app\/store';/, 'the settings read must stay wired');

// Resolving per call means a settings change applies to the next send.
seedSettings(41_000);
const first = client.requestMaxTokens();
seedSettings(2_000);
const second = client.requestMaxTokens();
assert.equal(first, 32_768, 'the first read clamps to the native maximum');
assert.equal(second, 2_000, 'a later settings change is observed without reloading the module');

console.log('CHRIS_STUDIO_V2_4_REQUEST_TOKEN_BUDGET_PASSED');

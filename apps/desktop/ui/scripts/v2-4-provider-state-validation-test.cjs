// Regression tests: persisted provider state must always read back as a list.
//
// `loadProviderConfigs` and `loadModelAliases` returned `JSON.parse(raw)` as-is,
// so an unusable slot handed callers a value that is not a list at all:
//
//   '{"not":"array"}' -> an object
//   '"oops"'          -> a string
//   '42'              -> a number
//
// Every consumer treats the result as an array (`.find`, `.map`, `.filter`), so
// the first use threw. Entries inside a valid array were also unvalidated: a
// `null` element or one without a provider reached the picker and the alias
// lookup. Field types were checked just as loosely — a string `enabled` and a
// non-numeric `lastHealthCheck` were carried through unchecked.
//
// `providers.ts` is listed as intentionally divergent between the shared package
// and the Android copy (the mobile build ships a lighter catalogue), so this
// suite pins the shared implementation only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const CONFIG_KEY = 'tokenfence-provider-configs';
const ALIAS_KEY = 'tokenfence-provider-aliases';

// `providers.ts` persists through the shared safeStorage wrapper, which reads
// `globalThis.localStorage`.
let backing = new Map();
globalThis.localStorage = {
  getItem: (key) => (backing.has(key) ? backing.get(key) : null),
  setItem: (key, value) => { backing.set(key, String(value)); },
  removeItem: (key) => { backing.delete(key); },
};

const compiledCache = new Map();

function resolveSpecifier(fromDir, specifier) {
  if (!specifier.startsWith('.')) {
    throw new Error(`Unexpected external dependency: ${specifier}`);
  }
  const base = path.resolve(fromDir, specifier);
  for (const candidate of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
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

const providers = loadCompiled(path.join(repoRoot, 'packages/shared/src/providers.ts'));

function seedConfigs(raw) {
  backing = new Map();
  if (raw !== undefined) globalThis.localStorage.setItem(CONFIG_KEY, raw);
}
function seedAliases(raw) {
  backing = new Map();
  if (raw !== undefined) globalThis.localStorage.setItem(ALIAS_KEY, raw);
}

// --- 1. an unusable slot must still yield a list -------------------------
const BAD_CONFIG_SLOTS = [
  ['an object', JSON.stringify({ not: 'an array' })],
  ['a string', JSON.stringify('oops')],
  ['a number', JSON.stringify(42)],
  ['a boolean', 'true'],
  ['null', 'null'],
  ['malformed JSON', '{not json'],
];
for (const [label, raw] of BAD_CONFIG_SLOTS) {
  seedConfigs(raw);
  let result;
  let threw = null;
  try {
    result = providers.loadProviderConfigs();
  } catch (error) {
    threw = String(error && error.message);
  }
  assert.equal(threw, null, `the configuration slot holding ${label} must not throw`);
  assert.ok(Array.isArray(result), `the configuration slot holding ${label} must read as an array`);
  assert.ok(result.length > 0, `the configuration slot holding ${label} must fall back to the defaults`);
  assert.ok(
    result.every((entry) => typeof entry.provider === 'string' && typeof entry.enabled === 'boolean'),
    `every default configuration must be well formed (${label})`,
  );
}

for (const [label, raw] of BAD_CONFIG_SLOTS) {
  seedAliases(raw);
  let result;
  let threw = null;
  try {
    result = providers.loadModelAliases();
  } catch (error) {
    threw = String(error && error.message);
  }
  assert.equal(threw, null, `the alias slot holding ${label} must not throw`);
  assert.deepEqual(result, [], `the alias slot holding ${label} must read as an empty list`);
}

// An empty slot keeps the documented behaviour.
seedConfigs();
assert.ok(providers.loadProviderConfigs().length > 0, 'an empty configuration slot yields the defaults');
seedAliases();
assert.deepEqual(providers.loadModelAliases(), [], 'an empty alias slot yields an empty list');

// --- 2. unusable entries inside a valid array are dropped ----------------
seedConfigs(JSON.stringify([
  null,
  'junk',
  42,
  [],
  { provider: '   ' },
  { model: 'no-provider' },
  { provider: 'OpenAI', model: 'gpt-4o', apiKey: 'k', baseUrl: 'https://api.openai.com/v1', endpoint: '/v1/chat/completions', deployment: 'cloud', enabled: true, lastHealthStatus: 'ok' },
]));
const configs = providers.loadProviderConfigs();
assert.equal(configs.length, 1, 'only the well-formed configuration survives');
assert.equal(configs[0].provider, 'OpenAI');
assert.equal(configs[0].enabled, true);
assert.equal(configs[0].lastHealthStatus, 'ok');

// A list that becomes empty after validation falls back to the defaults rather
// than leaving the app with no provider at all.
seedConfigs(JSON.stringify([null, 'junk', {}]));
const afterFiltering = providers.loadProviderConfigs();
assert.ok(afterFiltering.length > 0, 'an all-invalid list falls back to the defaults');
assert.ok(afterFiltering.every((entry) => typeof entry.provider === 'string'));

seedAliases(JSON.stringify([
  null,
  'junk',
  { provider: 'X' },
  { modelId: 'm' },
  { provider: 'X', modelId: 'm' },
  { provider: 'OpenAI', modelId: 'gpt-4o', alias: 'GPT' },
]));
const aliases = providers.loadModelAliases();
assert.equal(aliases.length, 1, 'only the complete alias survives');
assert.equal(aliases[0].provider, 'OpenAI');
assert.equal(aliases[0].modelId, 'gpt-4o');
assert.equal(aliases[0].alias, 'GPT');

// --- 3. field types are normalised --------------------------------------
seedConfigs(JSON.stringify([
  {
    provider: 'OpenAI',
    model: 'gpt-4o',
    enabled: 'yes',
    deployment: 'weird',
    lastHealthStatus: 'bogus',
    lastHealthCheck: 'yesterday',
    apiKey: 42,
    baseUrl: null,
    endpoint: 7,
    customModelId: {},
    lastHealthError: [],
  },
]));
const normalized = providers.loadProviderConfigs()[0];
assert.equal(normalized.provider, 'OpenAI');
assert.equal(normalized.enabled, false, 'a non-boolean enabled flag must not be treated as enabled');
assert.equal(normalized.deployment, 'cloud', 'an unknown deployment falls back to cloud');
assert.equal(normalized.lastHealthStatus, 'unknown', 'an unknown health status falls back to unknown');
assert.equal(normalized.lastHealthCheck, undefined, 'a non-numeric health check time is dropped');
assert.equal(normalized.apiKey, '', 'a non-string API key becomes an empty string');
assert.equal(normalized.baseUrl, '');
assert.equal(normalized.endpoint, '');
assert.equal(normalized.customModelId, undefined);
assert.equal(normalized.lastHealthError, undefined);

// A real local deployment and a real status survive.
seedConfigs(JSON.stringify([
  { provider: 'Ollama', model: 'llama3.2', deployment: 'local', enabled: true, lastHealthStatus: 'degraded', lastHealthCheck: 1_700_000_000_000 },
]));
const localConfig = providers.loadProviderConfigs()[0];
assert.equal(localConfig.deployment, 'local');
assert.equal(localConfig.enabled, true);
assert.equal(localConfig.lastHealthStatus, 'degraded');
assert.equal(localConfig.lastHealthCheck, 1_700_000_000_000);

// --- 4. saving and reading back -----------------------------------------
backing = new Map();
providers.saveProviderConfigs([
  { provider: 'OpenAI', model: 'gpt-4o', apiKey: 'k', baseUrl: 'https://api.openai.com/v1', endpoint: '/v1/chat/completions', deployment: 'cloud', enabled: true, lastHealthStatus: 'ok' },
]);
const saved = providers.loadProviderConfigs();
assert.equal(saved.length, 1, 'a saved configuration must be readable');
assert.equal(saved[0].provider, 'OpenAI');
assert.equal(saved[0].enabled, true);
providers.saveModelAliases([{ provider: 'OpenAI', modelId: 'gpt-4o', alias: 'GPT' }]);
assert.equal(providers.loadModelAliases().length, 1, 'a saved alias must be readable');

// --- 5. the pre-existing lookups must not move --------------------------
assert.equal(providers.recommendModel('high').every((entry) => entry.deployment === 'local'), true,
  'a high-risk request must only be offered local providers');
assert.equal(providers.recommendModel('low').length, providers.PROVIDERS.length,
  'a routine request may use the whole catalogue');
assert.equal(providers.getProviderByModel('gpt-4o')?.provider, 'OpenAI');
assert.equal(providers.getProviderByName('OpenAI')?.provider, 'OpenAI');
assert.equal(providers.getProviderByModel('does-not-exist'), undefined);
assert.ok(providers.estimateTokens('hello world') >= 1);
assert.equal(providers.estimateTokens(''), 0);
assert.ok(providers.PROVIDER_ENDPOINTS.OpenAI, 'the endpoint catalogue must stay available');

// --- 6. the implementation must keep its guards -------------------------
const source = fs.readFileSync(path.join(repoRoot, 'packages/shared/src/providers.ts'), 'utf8');
assert.match(source, /function normalizeAlias\(entry: unknown\)/, 'the alias validator must stay present');
assert.match(source, /function normalizeProviderConfig\(entry: unknown\)/, 'the configuration validator must stay present');
assert.match(source, /if \(!Array\.isArray\(parsed\)\) return \[\]/, 'the alias loader must reject non-arrays');
assert.match(source, /if \(!Array\.isArray\(parsed\)\) return fallback\(\)/, 'the configuration loader must reject non-arrays');
assert.doesNotMatch(
  source,
  /const raw = storeGet\(ALIAS_STORAGE_KEY\);\s*\n\s*return raw \? JSON\.parse\(raw\) : \[\];/,
  'the unchecked alias passthrough must not return',
);
assert.doesNotMatch(
  source,
  /const raw = storeGet\(STORAGE_KEY\);\s*\n\s*if \(raw\) return JSON\.parse\(raw\);/,
  'the unchecked configuration passthrough must not return',
);

console.log('CHRIS_STUDIO_V2_4_PROVIDER_STATE_VALIDATION_PASSED');

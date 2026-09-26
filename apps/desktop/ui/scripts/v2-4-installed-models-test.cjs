// Regression tests: the installed-model library must stay self-consistent.
//
// Four defects were found by probing the module:
//
//  1. Deleting the default model left the library with no default at all, so
//     the stored state and `getDefaultModel()` disagreed about what was active.
//  2. Disabling the default model kept the flag on the disabled entry while
//     `getDefaultModel()` answered with a different model — the same divergence
//     in the other direction.
//  3. `loadInstalledModels` returned the parsed array unchecked. The slot is
//     read back from storage, so a partially written or hand-edited value put
//     `null` and id-less entries into the picker; a `null` entry crashed the
//     caller, and an entry without an id could never be removed again.
//  4. `installModel` marked a model default only when the library was empty, so
//     installing into an all-disabled library produced no default.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const STORAGE_KEY = 'tokenfence.installedModels';

// `safeStorage` reads `globalThis.localStorage`, so the mock replaces exactly
// that (setting `window.localStorage` would leave the module on the in-memory
// fallback and the tests would not exercise persistence at all).
let backing = new Map();
globalThis.localStorage = {
  getItem: (key) => (backing.has(key) ? backing.get(key) : null),
  setItem: (key, value) => { backing.set(key, String(value)); },
  removeItem: (key) => { backing.delete(key); },
};

const compiledCache = new Map();

function compileTypeScript(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filePath,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) {
      throw new Error(`Unexpected external dependency in the shared package: ${specifier}`);
    }
    const base = path.resolve(path.dirname(filePath), specifier);
    for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate)) return loadCompiled(candidate);
    }
    throw new Error(`Cannot resolve ${specifier} from ${filePath}`);
  };
  new Function('exports', 'require', 'module', '__filename', '__dirname', output)(
    module.exports,
    localRequire,
    module,
    filePath,
    path.dirname(filePath),
  );
  return module.exports;
}

function loadCompiled(filePath) {
  if (compiledCache.has(filePath)) return compiledCache.get(filePath);
  const exports = compileTypeScript(filePath);
  compiledCache.set(filePath, exports);
  return exports;
}

const models = loadCompiled(path.join(repoRoot, 'packages/shared/src/installed-models.ts'));
const reset = () => { backing = new Map(); };

// --- 1. installing into an empty library ---------------------------------
reset();
const first = models.installModel('OpenAI', 'gpt-4o');
assert.equal(first.enabled, true, 'a newly installed model must be enabled');
assert.equal(first.isDefault, true, 'the first model must become the default');
assert.equal(first.source, 'registry', 'the default source is the registry');
assert.ok(first.addedAt > 0, 'an install must be timestamped');

// Re-installing the same provider+model is idempotent.
const again = models.installModel('OpenAI', 'gpt-4o');
assert.equal(again.id, first.id, 're-installing must return the existing entry');
assert.equal(models.loadInstalledModels().length, 1, 're-installing must not duplicate the entry');

// --- 2. deleting the default must promote another enabled model ----------
models.installModel('Claude', 'claude-sonnet-4-20250514');
models.uninstallModel(first.id);
const afterDelete = models.loadInstalledModels();
assert.equal(afterDelete.length, 1);
assert.equal(afterDelete[0].modelId, 'claude-sonnet-4-20250514');
assert.equal(afterDelete[0].isDefault, true, 'the remaining enabled model must become the default');
assert.equal(
  models.getDefaultModel()?.id,
  afterDelete.find((entry) => entry.isDefault)?.id,
  'the stored flag and getDefaultModel must agree',
);

// --- 3. disabling the default must not leave the flag on a disabled entry -
reset();
const head = models.installModel('OpenAI', 'gpt-4o');
models.installModel('Ollama', 'llama3.2');
models.toggleModel(head.id);
const afterDisable = models.loadInstalledModels();
assert.equal(
  afterDisable.some((entry) => entry.isDefault && !entry.enabled),
  false,
  'no disabled model may carry the default flag',
);
assert.equal(afterDisable.filter((entry) => entry.isDefault).length, 1, 'exactly one default must remain');
assert.equal(afterDisable.find((entry) => entry.isDefault)?.modelId, 'llama3.2');
assert.equal(
  models.getDefaultModel()?.id,
  afterDisable.find((entry) => entry.isDefault)?.id,
  'the stored flag and getDefaultModel must agree after disabling',
);

// Disabling every model leaves no default, and the reader reports none.
models.toggleModel(afterDisable.find((entry) => entry.enabled).id);
const allDisabled = models.loadInstalledModels();
assert.equal(allDisabled.every((entry) => !entry.enabled), true);
assert.equal(allDisabled.some((entry) => entry.isDefault), false, 'an all-disabled library has no default');
assert.equal(models.getDefaultModel(), undefined, 'getDefaultModel must report nothing usable');
assert.equal(models.getEnabledModels().length, 0);

// Installing into an all-disabled library must produce a usable default.
const revived = models.installModel('DeepSeek', 'deepseek-chat');
assert.equal(revived.isDefault, true, 'the first usable model must claim the default flag');
assert.equal(models.getDefaultModel()?.id, revived.id);

// --- 4. persisted entries are untrusted input ----------------------------
reset();
globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify([
  { id: 'ok', providerId: 'OpenAI', modelId: 'gpt-4o', displayName: 'GPT', enabled: true, addedAt: 1, source: 'registry' },
  { providerId: 'no-id' },
  { id: 'no-provider', modelId: 'x' },
  { id: 'no-model', providerId: 'y' },
  null,
  'garbage',
  42,
  [],
  { id: 'noflag', providerId: 'X', modelId: 'y', displayName: 'Y', addedAt: 1, source: 'registry' },
  { id: 'badsource', providerId: 'Z', modelId: 'z', displayName: 'Z', enabled: true, addedAt: 1, source: 'nonsense' },
  { id: 'badtime', providerId: 'W', modelId: 'w', displayName: 'W', enabled: true, addedAt: 'not-a-number', source: 'registry' },
]));
const loaded = models.loadInstalledModels();
assert.equal(loaded.length, 4, 'only entries carrying an id, a provider and a model may survive');
assert.ok(loaded.every((entry) => typeof entry.id === 'string' && entry.id.length > 0), 'every entry must have an id');
assert.ok(loaded.every((entry) => typeof entry.providerId === 'string' && entry.providerId.length > 0));
assert.ok(loaded.every((entry) => typeof entry.modelId === 'string' && entry.modelId.length > 0));
assert.equal(loaded.find((entry) => entry.id === 'noflag')?.enabled, true, 'a missing enabled flag means usable');
assert.equal(loaded.find((entry) => entry.id === 'badsource')?.source, 'registry', 'an unknown source falls back to registry');
assert.ok(loaded.find((entry) => entry.id === 'badtime')?.addedAt > 0, 'an unusable timestamp is replaced');
assert.equal(loaded.filter((entry) => entry.isDefault).length, 1, 'exactly one default after repair');
assert.equal(models.getEnabledModels().every((entry) => Boolean(entry.id)), true);

// A stored value that is not an array must not throw.
for (const raw of ['not json', '{"a":1}', '"text"', '42']) {
  reset();
  globalThis.localStorage.setItem(STORAGE_KEY, raw);
  assert.deepEqual(models.loadInstalledModels(), [], `malformed storage must yield an empty library: ${raw}`);
}

// --- 5. mutations on unknown ids must be no-ops ---------------------------
reset();
assert.doesNotThrow(() => models.uninstallModel('missing'));
assert.doesNotThrow(() => models.setDefaultModel('missing'));
assert.doesNotThrow(() => models.toggleModel('missing'));
assert.doesNotThrow(() => models.markModelUsed('missing'));
assert.deepEqual(models.loadInstalledModels(), [], 'a missing id must not create state');

const target = models.installModel('OpenAI', 'gpt-4o');
const other = models.installModel('Ollama', 'llama3.2');
models.setDefaultModel(other.id);
const afterSet = models.loadInstalledModels();
assert.equal(afterSet.filter((entry) => entry.isDefault).length, 1, 'setting a default must leave exactly one');
assert.equal(afterSet.find((entry) => entry.isDefault)?.id, other.id);
models.setDefaultModel('missing');
assert.equal(
  models.loadInstalledModels().find((entry) => entry.isDefault)?.id,
  other.id,
  'an unknown id must not clear the current default',
);

// --- 6. alias and usage bookkeeping --------------------------------------
models.updateModelAlias(target.id, '  session model  ');
assert.equal(models.loadInstalledModels().find((entry) => entry.id === target.id)?.alias, 'session model');
models.updateModelAlias(target.id, '   ');
assert.equal(models.loadInstalledModels().find((entry) => entry.id === target.id)?.alias, undefined, 'a blank alias is removed');
models.markModelUsed(target.id);
assert.ok(models.loadInstalledModels().find((entry) => entry.id === target.id)?.lastUsedAt > 0);

// --- 7. provider lookup --------------------------------------------------
reset();
models.installModel('OpenAI', 'gpt-4o');
models.installModel('OpenAI', 'gpt-4o-mini');
models.installModel('Ollama', 'llama3.2');
assert.equal(models.getModelsForProvider('OpenAI').length, 2);
assert.equal(models.getModelsForProvider('Ollama').length, 1);
assert.equal(models.getModelsForProvider('missing').length, 0);

// --- 8. custom-source duplicates are keyed by custom id ------------------
reset();
models.installModel('Custom', 'custom', 'custom', 'endpoint-a');
models.installModel('Custom', 'custom', 'custom', 'endpoint-b');
assert.equal(models.loadInstalledModels().length, 2, 'different custom endpoints may coexist');
models.installModel('Custom', 'custom', 'custom', 'endpoint-a');
assert.equal(models.loadInstalledModels().length, 2, 'the same custom endpoint must not duplicate');

// --- 9. the legacy key migration must not clobber existing data ----------
reset();
globalThis.localStorage.setItem('tokenfence-installed-models', JSON.stringify([
  { id: 'legacy', providerId: 'OpenAI', modelId: 'gpt-4o', displayName: 'Legacy', enabled: true, addedAt: 1, source: 'registry' },
]));
models.migrateInstalledModels();
assert.equal(models.loadInstalledModels().length, 1, 'the legacy slot must migrate when the new slot is empty');
globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
globalThis.localStorage.setItem('tokenfence-installed-models', JSON.stringify([{ id: 'stale' }]));
models.migrateInstalledModels();
assert.equal(models.loadInstalledModels().length, 0, 'an existing new slot must never be overwritten by the legacy one');

// --- 10. the module must keep its defensive shape ------------------------
const source = fs.readFileSync(path.join(repoRoot, 'packages/shared/src/installed-models.ts'), 'utf8');
assert.match(source, /function normalizeEntry\(entry: unknown\)/, 'the entry validator must stay present');
assert.match(source, /function repairDefaultFlag\(models: InstalledModel\[\]\)/, 'the default repair must stay present');
assert.doesNotMatch(
  source,
  /return Array\.isArray\(parsed\) \? parsed : \[\];/,
  'the unchecked passthrough must not return',
);

// The desktop UI depends on the shared module through this exact path, so the
// export list must keep every entry point the picker uses.
for (const name of [
  'loadInstalledModels',
  'saveInstalledModels',
  'installModel',
  'uninstallModel',
  'toggleModel',
  'setDefaultModel',
  'updateModelAlias',
  'markModelUsed',
  'getEnabledModels',
  'getDefaultModel',
  'getModelsForProvider',
  'migrateInstalledModels',
]) {
  assert.equal(typeof models[name], 'function', `${name} must stay exported`);
}

console.log('CHRIS_STUDIO_V2_4_INSTALLED_MODELS_PASSED');

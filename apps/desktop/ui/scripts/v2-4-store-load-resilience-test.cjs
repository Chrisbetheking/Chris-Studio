// Regression tests: every store loader must survive a damaged storage slot.
//
// `safeRead` returned `JSON.parse(raw)` unchecked, and `JSON.parse("null")` is
// syntactically valid. A slot written as `null` therefore handed `null` to the
// caller, and the first property access threw — on the startup path, where
// settings, provider profiles, agents and conversations are all read:
//
//   loadSettings          -> Object.keys(null)
//   loadProviderProfiles  -> saved.length on null
//   loadAgents            -> source.filter on null
//   loadConversations     -> null.localeCompare
//
// Three loaders also accepted a syntactically valid but wrong-typed payload
// because a bare string has a truthy `length`:
//
//   loadAgents            -> "oops".filter is not a function
//   loadProviderStatuses  -> returned the string as the status map
//   loadRoutingRules      -> returned the string as the rule list
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const storePath = path.join(repoRoot, 'apps/desktop/ui/src/app/store.ts');

// Every reader the store exposes, with the storage key it reads and the shape
// its callers rely on.
const SETTINGS_KEY = 'tokenfence.settings.v170';
const PROFILES_KEY = 'tokenfence.providers.v170';
const STATUSES_KEY = 'tokenfence.provider-statuses.v170';
const ROUTING_KEY = 'tokenfence.routing.v170';
const AGENTS_KEY = 'tokenfence.agents.v170';
const CONVERSATIONS_KEY = 'tokenfence.conversations.v170';
const SKILLS_KEY = 'tokenfence.custom-skills.v180';
const KNOWLEDGE_KEY = 'tokenfence.knowledge.v180';
const AUDIT_KEY = 'tokenfence.computer-audit.v180';
const CONNECTORS_KEY = 'tokenfence.connectors.v180';

let backing = new Map();

function installWindow() {
  global.window = {
    localStorage: {
      getItem: (key) => (backing.has(key) ? backing.get(key) : null),
      setItem: (key, value) => { backing.set(key, String(value)); },
      removeItem: (key) => { backing.delete(key); },
    },
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  global.CustomEvent = class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init && init.detail; }
  };
}

installWindow();

const compiledCache = new Map();

function loadCompiled(target) {
  if (compiledCache.has(target)) return compiledCache.get(target);
  const output = ts.transpileModule(fs.readFileSync(target, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
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

const store = loadCompiled(storePath);

/** Damaged payloads a slot can hold, and the shape each loader must still return. */
const DAMAGED = [
  ['a bare string', JSON.stringify('oops')],
  ['a bare number', JSON.stringify(42)],
  ['a bare boolean', 'true'],
  ['a JSON null', 'null'],
  ['malformed JSON', '{not json'],
  ['an empty string', ''],
];

const READERS = [
  { name: 'loadSettings', key: SETTINGS_KEY, isShape: (r) => r && typeof r === 'object' && !Array.isArray(r) },
  { name: 'loadProviderProfiles', key: PROFILES_KEY, isShape: (r) => Array.isArray(r) && r.length > 0 },
  { name: 'loadProviderStatuses', key: STATUSES_KEY, isShape: (r) => r && typeof r === 'object' && !Array.isArray(r) },
  { name: 'loadRoutingRules', key: ROUTING_KEY, isShape: (r) => Array.isArray(r) && r.length > 0 },
  { name: 'loadAgents', key: AGENTS_KEY, isShape: (r) => Array.isArray(r) && r.length > 0 },
  { name: 'loadConversations', key: CONVERSATIONS_KEY, isShape: (r) => Array.isArray(r) },
  { name: 'loadCustomSkills', key: SKILLS_KEY, isShape: (r) => Array.isArray(r) },
  { name: 'loadKnowledgeIndex', key: KNOWLEDGE_KEY, isShape: (r) => Array.isArray(r) },
  { name: 'loadComputerAudit', key: AUDIT_KEY, isShape: (r) => Array.isArray(r) },
  { name: 'loadToolConnectors', key: CONNECTORS_KEY, isShape: (r) => Array.isArray(r) },
];

// --- 1. every reader survives every damaged payload ---------------------
for (const reader of READERS) {
  for (const [label, raw] of DAMAGED) {
    backing = new Map();
    if (raw) global.window.localStorage.setItem(reader.key, raw);
    let result;
    let threw = null;
    try {
      result = store[reader.name]();
    } catch (error) {
      threw = String(error && error.message);
    }
    assert.equal(threw, null, `${reader.name} must not throw when the slot holds ${label}`);
    assert.equal(
      reader.isShape(result),
      true,
      `${reader.name} must return its documented shape when the slot holds ${label}, got ${JSON.stringify(result)?.slice(0, 60)}`,
    );
  }
}

// --- 2. a null slot is cleared rather than left behind ------------------
backing = new Map();
global.window.localStorage.setItem(SETTINGS_KEY, 'null');
store.loadSettings();
assert.equal(
  global.window.localStorage.getItem(SETTINGS_KEY),
  null,
  'a null payload is removed so the next read is not forced through the guard again',
);

// --- 3. defaults are still produced -------------------------------------
backing = new Map();
const defaults = store.loadSettings();
assert.equal(defaults.language, 'zh-CN', 'settings fall back to the documented defaults');
assert.ok(Array.isArray(defaults.customSensitiveTerms));
assert.ok(store.loadProviderProfiles().length > 0, 'provider profiles fall back to the defaults');
assert.ok(store.loadAgents().length > 0, 'agents fall back to the built-in profiles');
assert.ok(store.loadRoutingRules().length > 0, 'routing rules fall back to the generated defaults');
assert.deepEqual(store.loadConversations(), [], 'an empty conversation slot reads as an empty list');
assert.deepEqual(store.loadKnowledgeIndex(), [], 'an empty knowledge slot reads as an empty list');
assert.deepEqual(store.loadComputerAudit(), [], 'an empty audit slot reads as an empty list');
assert.ok(store.loadProviderStatuses(), 'provider statuses always read as a map');

// --- 4. wrong-typed entries inside a valid list are dropped -------------
backing = new Map();
global.window.localStorage.setItem(ROUTING_KEY, JSON.stringify([
  null,
  'junk',
  42,
  { kind: 'code' },
  { id: 'kept', kind: 'code', providerProfileId: 'deepseek-primary', enabled: true, reasonEn: 'r', reasonZh: 'r' },
]));
const rules = store.loadRoutingRules();
assert.equal(rules.length, 1, 'only rules carrying an id survive');
assert.equal(rules[0].id, 'kept');

backing = new Map();
global.window.localStorage.setItem(AGENTS_KEY, JSON.stringify([null, 'junk', { name: 'no-id' }, { id: 'kept', name: 'Coder' }]));
const agents = store.loadAgents();
assert.equal(agents.length, 1, 'only agents carrying an id survive');
assert.equal(agents[0].id, 'kept');

// --- 5. a real round trip still works -----------------------------------
backing = new Map();
store.saveSettings({ ...store.DEFAULT_SETTINGS, language: 'en', debugMode: true });
const savedSettings = store.loadSettings();
assert.equal(savedSettings.language, 'en');
assert.equal(savedSettings.debugMode, true);

store.saveProviderStatus('deepseek-primary', { state: 'connected', message: 'ok' });
assert.equal(store.loadProviderStatuses()['deepseek-primary']?.state, 'connected');
assert.equal(store.loadProviderStatus('deepseek-primary').state, 'connected');

// --- 6. the implementation must keep its guards -------------------------
const source = fs.readFileSync(storePath, 'utf8');
assert.match(
  source,
  /if \(parsed === null \|\| parsed === undefined\) \{/,
  'safeRead must reject a null payload',
);
assert.match(
  source,
  /const savedList = Array\.isArray\(saved\) \? saved : \[\];/,
  'loadAgents must narrow the stored list',
);
assert.match(
  source,
  /const savedMap = saved && typeof saved === 'object' && !Array\.isArray\(saved\)/,
  'loadProviderStatuses must narrow the stored map',
);
assert.match(
  source,
  /const savedRules = Array\.isArray\(saved\)/,
  'loadRoutingRules must narrow the stored list',
);

console.log('CHRIS_STUDIO_V2_4_STORE_LOAD_RESILIENCE_PASSED');

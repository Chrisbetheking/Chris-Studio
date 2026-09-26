// Regression tests: the "Optimization mode" setting must reach the provider call.
//
// The settings screen promises "Compact repeated context before billing starts"
// and offers Off / Conservative / Balanced, but `optimizeText` had no product
// caller: `providerMessages` forwarded every message verbatim, so the control
// changed nothing about what was sent or billed.
//
// `compactionPolicy.ts` now resolves the mode per request and compacts only the
// prose turns of the re-sent history. Everything else stays verbatim: the system
// prompt (instructions), the current turn (the payload the user just approved),
// the attachment context (extracted file text whose indentation is semantic) and
// the agent protocol messages (tool observations and repair prompts).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const POLICY = 'apps/desktop/ui/src/features/tokens/compactionPolicy.ts';
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

const policy = loadCompiled(path.join(repoRoot, POLICY));
const { compactionMode, compactProviderMessages, isCompactionCandidate, COMPACTION_MODES } = policy;

function seed(mode) {
  backing = new Map();
  if (mode !== undefined) {
    globalThis.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ tokenOptimizationMode: mode }));
  }
}

// --- 1. the configured mode is resolved, with a safe fallback -----------
assert.deepEqual(COMPACTION_MODES, ['off', 'conservative', 'balanced'], 'the mode union stays declared');

seed('off');
assert.equal(compactionMode(), 'off');
seed('conservative');
assert.equal(compactionMode(), 'conservative');
seed('balanced');
assert.equal(compactionMode(), 'balanced');
seed();
assert.equal(compactionMode(), 'balanced', 'the shipped default is balanced');
for (const bad of ['nonsense', 42, null, {}, []]) {
  seed(bad);
  assert.equal(compactionMode(), 'balanced', `the unusable mode ${JSON.stringify(bad)} falls back to the default`);
}
backing = new Map();
globalThis.localStorage.setItem(SETTINGS_KEY, '{not json');
assert.equal(compactionMode(), 'balanced', 'a corrupt settings slot still resolves a usable mode');

// A later change is observed without reloading the module.
seed('off');
assert.equal(compactionMode(), 'off');
seed('balanced');
assert.equal(compactionMode(), 'balanced');

// --- 2. mode off is a true no-op ----------------------------------------
const history = [
  { role: 'system', content: 'You are Chris Studio.   Keep this  prompt intact.' },
  { role: 'user', content: 'Please  please   summarise.\nRepeated context\nRepeated context' },
  { role: 'assistant', content: 'Here   is   the   summary.' },
  { role: 'user', content: 'Please  please   the current turn.' },
];
seed('off');
const untouched = compactProviderMessages(history);
assert.deepEqual(untouched, history, 'off must return the history unchanged');

// --- 3. the current turn and the system prompt stay verbatim ------------
for (const mode of ['conservative', 'balanced']) {
  seed(mode);
  const out = compactProviderMessages(history);
  assert.equal(out[0].content, history[0].content, `${mode}: the system prompt must stay verbatim`);
  assert.equal(
    out[out.length - 1].content,
    history[history.length - 1].content,
    `${mode}: the current turn must stay verbatim — it is the payload the user approved`,
  );
  assert.notEqual(out[1].content, history[1].content, `${mode}: re-sent prose history must be compacted`);
  assert.equal(out.length, history.length, `${mode}: the message count must not change`);
  out.forEach((message, index) => {
    assert.equal(message.role, history[index].role, `${mode}: roles must not change`);
  });
}

// A single-message conversation is entirely the current turn.
seed('balanced');
const single = [{ role: 'user', content: 'Please  please   hello' }];
assert.deepEqual(compactProviderMessages(single), single, 'a one-message history is left alone');

// --- 4. machine payloads are never rewritten ---------------------------
seed('balanced');
const machine = [
  { role: 'user', content: 'User-approved local attachment context:\n    def f():\n        return 1' },
  { role: 'user', content: '{"type":"tool_observation","callId":"c1","ok":true}' },
  { role: 'user', content: 'Your previous response was not a valid Unified Agent JSON decision: bad' },
  { role: 'user', content: 'Please  please   ordinary prose' },
  { role: 'assistant', content: 'current reply' },
];
const machineOut = compactProviderMessages(machine);
assert.equal(machineOut[0].content, machine[0].content, 'the attachment context keeps its indentation');
assert.ok(machineOut[0].content.includes('        return 1'), 'nested indentation survives verbatim');
assert.equal(machineOut[1].content, machine[1].content, 'a tool observation stays byte-identical');
assert.equal(machineOut[2].content, machine[2].content, 'a protocol repair prompt stays byte-identical');
assert.notEqual(machineOut[3].content, machine[3].content, 'ordinary prose is still compacted');

// Leading whitespace must not disguise a machine payload.
seed('balanced');
const padded = [
  { role: 'user', content: '\n   User-approved local attachment context:\n    indented' },
  { role: 'assistant', content: 'current' },
];
assert.equal(compactProviderMessages(padded)[0].content, padded[0].content,
  'an indented attachment context is still recognised');

// --- 5. fenced code inside kept history survives ------------------------
seed('balanced');
const fenced = [
  { role: 'user', content: 'Please  review  this\n```python\ndef f():\n    return {"a": 1}\n```' },
  { role: 'assistant', content: 'current' },
];
const fencedOut = compactProviderMessages(fenced);
assert.ok(fencedOut[0].content.includes('    return {"a": 1}'), 'fenced indentation must survive compaction');
assert.doesNotMatch(fencedOut[0].content, /Please\s+review/, 'the prose around the fence is still compacted');

// --- 6. the predicate documents the exclusions --------------------------
assert.equal(isCompactionCandidate('user', 'prose', 0, 3), true);
assert.equal(isCompactionCandidate('assistant', 'prose', 1, 3), true);
assert.equal(isCompactionCandidate('system', 'prose', 0, 3), false, 'a system prompt is never compacted');
assert.equal(isCompactionCandidate('user', 'prose', 2, 3), false, 'the current turn is never compacted');
assert.equal(isCompactionCandidate('user', 'User-approved local attachment context: x', 0, 3), false);
assert.equal(isCompactionCandidate('user', '{"type":"tool_observation"', 0, 3), false);
assert.equal(isCompactionCandidate('user', 'Your previous response was not a valid x', 0, 3), false);

// --- 7. damaged input must not throw ------------------------------------
seed('balanced');
for (const input of [null, undefined, 'oops', 42, {}]) {
  let out;
  let threw = null;
  try {
    out = compactProviderMessages(input);
  } catch (error) {
    threw = String(error && error.message);
  }
  assert.equal(threw, null, `compacting ${String(input)} must not throw`);
  assert.ok(Array.isArray(out), `compacting ${String(input)} must return a list`);
}
const damaged = compactProviderMessages([null, { role: 'user' }, { role: 'user', content: 42 }]);
assert.equal(damaged.length, 3, 'a damaged entry still produces a row');
for (const row of damaged) {
  assert.equal(typeof row.content, 'string', 'every emitted row carries string content');
}

// --- 8. the provider client must use the policy -------------------------
const clientSource = fs.readFileSync(
  path.join(repoRoot, 'apps/desktop/ui/src/features/providers/providerClient.ts'),
  'utf8',
);
assert.match(clientSource, /import \{ compactProviderMessages \} from '\.\.\/tokens\/compactionPolicy';/,
  'the provider client must import the compaction policy');
assert.match(clientSource, /const compacted = compactProviderMessages\(messages\);/,
  'the provider client must compact the re-sent history');
assert.match(clientSource, /compacted\.map\(\(\{ role, content \}, index\) =>/, 'the compacted list must be the one mapped');

console.log('CHRIS_STUDIO_V2_4_COMPACTION_POLICY_PASSED');

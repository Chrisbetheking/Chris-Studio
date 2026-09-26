// Regression tests: the agent execution log must tolerate untrusted storage.
//
// `load()` assigned `JSON.parse(raw)` straight into `entries`. A damaged slot
// therefore produced two different failures:
//
//   non-iterable value  -> `getEntries` threw "entries is not iterable" and
//                          every later `addEntry` threw "entries.push is not a
//                          function", so the log stopped recording entirely.
//   bare JSON string    -> the string was spread into its individual characters,
//                          turning the log into a list of single-letter rows.
//
// Entries inside a valid array were also unchecked: a `null` element crashed the
// sort on `entry.timestamp`, and a row without an id or a level reached the view.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const KEY = 'tokenfence.execution-log';
const MODULE = 'packages/shared/src/agent-runtime/executionLog.ts';

// The module persists through the shared safeStorage wrapper.
let backing = new Map();
globalThis.localStorage = {
  getItem: (key) => (backing.has(key) ? backing.get(key) : null),
  setItem: (key, value) => { backing.set(key, String(value)); },
  removeItem: (key) => { backing.delete(key); },
};

const compiledCache = new Map();

function loadCompiled(target) {
  if (compiledCache.has(target)) return compiledCache.get(target);
  const output = ts.transpileModule(fs.readFileSync(target, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) throw new Error(`Unexpected external dependency: ${specifier}`);
    const base = path.resolve(path.dirname(target), specifier);
    for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate)) return loadCompiled(candidate);
    }
    throw new Error(`Cannot resolve ${specifier}`);
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

// `load()` runs at import time, so every scenario needs a fresh module instance.
function freshLog(rawValue) {
  backing = new Map();
  if (rawValue !== undefined) globalThis.localStorage.setItem(KEY, rawValue);
  compiledCache.delete(path.join(repoRoot, MODULE));
  return loadCompiled(path.join(repoRoot, MODULE));
}

function entry(id, patch = {}) {
  return {
    id,
    taskId: 'task-1',
    pluginId: 'plugin-1',
    timestamp: 1_700_000_000_000,
    level: 'info',
    message: 'queued',
    ...patch,
  };
}

// --- 1. a damaged slot must never break reading or writing --------------
const DAMAGED = [
  ['an object', JSON.stringify({ not: 'an array' })],
  ['a string', JSON.stringify('oops')],
  ['a number', JSON.stringify(42)],
  ['a boolean', 'true'],
  ['null', 'null'],
  ['malformed JSON', '{not json'],
];
for (const [label, raw] of DAMAGED) {
  const log = freshLog(raw);
  let entries;
  let threw = null;
  try {
    entries = log.getEntries();
  } catch (error) {
    threw = String(error && error.message);
  }
  assert.equal(threw, null, `getEntries must not throw when the slot holds ${label}`);
  assert.deepEqual(entries, [], `the slot holding ${label} must read as an empty log`);

  // The log must keep recording afterwards — this is what used to break.
  let appended;
  let writeThrew = null;
  try {
    appended = log.addEntry({ taskId: 'task-1', pluginId: 'plugin-1', level: 'info', message: 'after repair' });
  } catch (error) {
    writeThrew = String(error && error.message);
  }
  assert.equal(writeThrew, null, `addEntry must not throw when the slot held ${label}`);
  assert.equal(typeof appended.id, 'string');
  assert.equal(log.getEntries().length, 1, `the log must record again after a damaged slot (${label})`);
  assert.equal(log.getEntries()[0].message, 'after repair');
}

// A bare JSON string must not be spread into characters.
const spread = freshLog(JSON.stringify('oops'));
assert.deepEqual(spread.getEntries(), [], 'a JSON string must not be spread into per-character rows');

// --- 2. unusable entries inside a valid array are dropped ---------------
const mixed = freshLog(JSON.stringify([
  null,
  'junk',
  42,
  [],
  { id: 'no-level', timestamp: 1, message: 'm' },
  { level: 'info', timestamp: 1, message: 'm' },
  { id: 'bad-level', level: 'nonsense', timestamp: 1, message: 'm' },
  entry('kept'),
]));
let entries;
let threw = null;
try {
  entries = mixed.getEntries();
} catch (error) {
  threw = String(error && error.message);
}
assert.equal(threw, null, 'sorting a mixed log must not throw');
assert.equal(entries.length, 1, 'only the well-formed entry survives');
assert.equal(entries[0].id, 'kept');
assert.equal(entries[0].level, 'info');
assert.equal(entries[0].message, 'queued');

// Filters and limits must stay usable on a repaired log.
assert.equal(mixed.getEntries({ taskId: 'task-1' }).length, 1);
assert.equal(mixed.getEntries({ taskId: 'nope' }).length, 0);
assert.equal(mixed.getEntries({ pluginId: 'plugin-1' }).length, 1);
assert.equal(mixed.getEntries({ level: 'info' }).length, 1);
assert.equal(mixed.getEntries({ limit: 1 }).length, 1);
assert.doesNotThrow(() => mixed.getEntries({ limit: 0 }), 'a zero limit must be tolerated');

// --- 3. field types are normalised -------------------------------------
const normalized = freshLog(JSON.stringify([
  { id: 'x', taskId: 5, pluginId: null, timestamp: 'yesterday', level: 'warn', message: 42, metadata: 'text', stepId: 7 },
])).getEntries()[0];
assert.equal(normalized.id, 'x');
assert.equal(normalized.taskId, '', 'a non-string task id becomes empty');
assert.equal(normalized.pluginId, '', 'a non-string plugin id becomes empty');
assert.equal(normalized.timestamp, 0, 'a non-numeric timestamp becomes 0');
assert.equal(normalized.level, 'warn');
assert.equal(normalized.message, '', 'a non-string message becomes empty');
assert.equal(normalized.metadata, undefined, 'a non-object metadata payload is dropped');
assert.equal(normalized.stepId, undefined, 'a non-string step id is dropped');

// A real metadata object and step id survive.
const preserved = freshLog(JSON.stringify([
  { id: 'y', taskId: 't', pluginId: 'p', timestamp: 5, level: 'error', message: 'm', stepId: 's1', metadata: { attempt: 2 } },
])).getEntries()[0];
assert.equal(preserved.stepId, 's1');
assert.deepEqual(preserved.metadata, { attempt: 2 });

// Every level the union allows is accepted.
for (const level of ['info', 'warn', 'error', 'debug']) {
  const log = freshLog(JSON.stringify([entry(`e-${level}`, { level })]));
  assert.equal(log.getEntries().length, 1, `the ${level} level must be accepted`);
}

// --- 4. ordering, capping and clearing ---------------------------------
const ordering = freshLog(JSON.stringify([
  entry('older', { timestamp: 1 }),
  entry('newer', { timestamp: 3 }),
  entry('middle', { timestamp: 2 }),
]));
assert.deepEqual(ordering.getEntries().map((e) => e.id), ['newer', 'middle', 'older'],
  'entries are returned newest first');

const capped = freshLog(JSON.stringify(
  Array.from({ length: 1200 }, (_value, index) => entry(`e${index}`, { timestamp: index })),
));
assert.equal(capped.getEntries().length, 1000, 'the log is capped at 1000 entries on load');

const cleared = freshLog(JSON.stringify([entry('a')]));
assert.equal(cleared.getEntries().length, 1);
cleared.clearLog();
assert.deepEqual(cleared.getEntries(), [], 'clearing must empty the log');

// An empty slot yields an empty log.
assert.deepEqual(freshLog().getEntries(), [], 'an empty slot yields an empty log');

// --- 5. recording accumulates ------------------------------------------
const recording = freshLog();
recording.addEntry({ taskId: 't1', pluginId: 'p', level: 'info', message: 'first' });
recording.addEntry({ taskId: 't1', pluginId: 'p', level: 'warn', message: 'second' });
const recorded = recording.getEntries();
assert.equal(recorded.length, 2, 'entries accumulate');
// Both writes can land in the same millisecond, so the assertion checks the
// set rather than the order: the ordering contract itself is covered above with
// explicit distinct timestamps.
assert.deepEqual(
  recorded.map((entry) => entry.message).sort(),
  ['first', 'second'],
  'both recorded entries are present',
);
for (const entry of recorded) {
  assert.equal(typeof entry.id, 'string');
  assert.ok(entry.id.length > 0, 'a recorded entry carries an id');
  assert.equal(typeof entry.timestamp, 'number');
  assert.equal(entry.taskId, 't1');
  assert.equal(entry.pluginId, 'p');
}
assert.notEqual(recorded[0].id, recorded[1].id, 'each entry gets its own id');

// --- 6. the implementation must keep its guard -------------------------
const source = fs.readFileSync(path.join(repoRoot, MODULE), 'utf8');
assert.match(source, /function normalizeEntry\(entry: unknown\): ExecutionLogEntry \| undefined/, 'the entry validator must stay present');
assert.match(source, /if \(!Array\.isArray\(parsed\)\) \{/, 'the loader must reject non-arrays');
assert.match(source, /\.slice\(-MAX_ENTRIES\)/, 'the loader must apply the cap');
assert.doesNotMatch(
  source,
  /if \(raw\) entries = JSON\.parse\(raw\);/,
  'the unchecked assignment must not return',
);

console.log('CHRIS_STUDIO_V2_4_EXECUTION_LOG_PASSED');

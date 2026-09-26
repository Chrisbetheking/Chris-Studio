// Regression tests: persisted runtime records must describe real runs.
//
// `hydrate` accepted an entry as soon as it carried a string id, then handed it
// to the reliability dock. A record whose `updatedAt`/`createdAt` were missing or
// wrong-typed reached the UI, where `relativeTime` rendered `NaN`, the dock's own
// sort produced `NaN` comparisons (leaving the order undefined), and a non-string
// `status` built a broken CSS class.
//
// The suite also pins the migration contract: a pre-v2.2 record must still have
// its historical failures acknowledged on hydration, and a record that was
// mid-flight must be restored as cancelled rather than left active.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const MODULE = 'apps/desktop/ui/src/features/agent-runtime/runtimeStore.ts';
const STORAGE_KEY = 'chris-studio.runtime-runs.v2';

let backing = new Map();

function freshStore(rawValue) {
  backing = new Map();
  if (rawValue !== undefined) backing.set(STORAGE_KEY, rawValue);
  global.window = {
    localStorage: {
      getItem: (key) => (backing.has(key) ? backing.get(key) : null),
      setItem: (key, value) => { backing.set(key, String(value)); },
      removeItem: (key) => { backing.delete(key); },
    },
    dispatchEvent: () => true,
  };
  global.CustomEvent = class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init && init.detail; }
  };

  const output = ts.transpileModule(fs.readFileSync(path.join(repoRoot, MODULE), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) throw new Error(`Unexpected external dependency: ${specifier}`);
    const base = path.resolve(path.join(repoRoot, 'apps/desktop/ui/src/features/agent-runtime'), specifier);
    for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
      if (!fs.existsSync(candidate)) continue;
      const nested = ts.transpileModule(fs.readFileSync(candidate, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      }).outputText;
      const nestedModule = { exports: {} };
      new Function('exports', 'require', 'module', '__filename', '__dirname', nested)(
        nestedModule.exports,
        () => ({}),
        nestedModule,
        candidate,
        path.dirname(candidate),
      );
      return nestedModule.exports;
    }
    throw new Error(`Cannot resolve ${specifier}`);
  };
  new Function('exports', 'require', 'module', '__filename', '__dirname', output)(
    module.exports,
    localRequire,
    module,
    path.join(repoRoot, MODULE),
    path.dirname(path.join(repoRoot, MODULE)),
  );
  return module.exports;
}

function record(id, patch = {}) {
  return {
    schemaVersion: 2,
    id,
    kind: 'provider',
    task: 'protected request',
    status: 'completed',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_500,
    ...patch,
  };
}

// --- 1. an unusable slot must hydrate as an empty list ------------------
for (const [label, raw] of [
  ['an object', JSON.stringify({ not: 'an array' })],
  ['a string', JSON.stringify('oops')],
  ['a number', JSON.stringify(42)],
  ['null', 'null'],
  ['malformed JSON', '{not json'],
]) {
  const store = freshStore(raw);
  let runs;
  let threw = null;
  try {
    runs = store.loadRuntimeRuns();
  } catch (error) {
    threw = String(error && error.message);
  }
  assert.equal(threw, null, `hydration must not throw when the slot holds ${label}`);
  assert.deepEqual(runs, [], `the slot holding ${label} must hydrate as an empty list`);
  assert.doesNotThrow(() => store.beginRuntimeRun({ kind: 'provider', task: 'after repair' }),
    `recording must still work when the slot held ${label}`);
  assert.equal(store.loadRuntimeRuns().length, 1, `the store must record again after ${label}`);
}

// --- 2. records that cannot describe a run are dropped ------------------
const mixed = freshStore(JSON.stringify([
  null,
  'junk',
  42,
  [],
  { id: 'no-kind', status: 'completed', createdAt: 1, updatedAt: 2 },
  { id: 'bad-kind', kind: 'nonsense', status: 'completed', createdAt: 1, updatedAt: 2 },
  { id: 'no-status', kind: 'provider', createdAt: 1, updatedAt: 2 },
  { id: 'bad-status', kind: 'provider', status: 'nonsense', createdAt: 1, updatedAt: 2 },
  { id: 'no-created', kind: 'provider', status: 'completed', updatedAt: 2 },
  { id: 'no-updated', kind: 'provider', status: 'completed', createdAt: 1 },
  { id: 'bad-created', kind: 'provider', status: 'completed', createdAt: 'yesterday', updatedAt: 2 },
  { id: 'bad-updated', kind: 'provider', status: 'completed', createdAt: 1, updatedAt: 'yesterday' },
  { id: 'zero-updated', kind: 'provider', status: 'completed', createdAt: 1, updatedAt: 0 },
  record('kept'),
]));
const runs = mixed.loadRuntimeRuns();
assert.equal(runs.length, 1, 'only the record describing a real run survives');
assert.equal(runs[0].id, 'kept');
assert.equal(runs[0].kind, 'provider');
assert.equal(runs[0].status, 'completed');
assert.equal(Number.isFinite(runs[0].createdAt), true, 'a surviving record keeps a numeric createdAt');
assert.equal(Number.isFinite(runs[0].updatedAt), true, 'a surviving record keeps a numeric updatedAt');

// --- 3. optional fields are normalised ---------------------------------
const normalised = freshStore(JSON.stringify([
  record('optional', {
    provider: 42,
    model: null,
    action: {},
    attempt: 'first',
    maxAttempts: [],
    message: 7,
    error: true,
    finishedAt: 'later',
    acknowledgedAt: 'earlier',
    archivedAt: -1,
    parentId: 5,
  }),
])).loadRuntimeRuns()[0];
assert.equal(normalised.provider, undefined, 'a non-string provider is dropped');
assert.equal(normalised.model, undefined, 'a non-string model is dropped');
assert.equal(normalised.action, undefined);
assert.equal(normalised.attempt, undefined, 'a non-numeric attempt is dropped');
assert.equal(normalised.maxAttempts, undefined);
assert.equal(normalised.message, undefined);
assert.equal(normalised.error, undefined);
assert.equal(normalised.finishedAt, undefined, 'a non-numeric finishedAt is dropped');
assert.equal(normalised.acknowledgedAt, undefined);
assert.equal(normalised.archivedAt, undefined, 'a negative archivedAt is dropped');
assert.equal(normalised.parentId, undefined, 'a non-string parent id is dropped');

const kept = freshStore(JSON.stringify([
  record('with-optionals', {
    provider: 'DeepSeek',
    model: 'deepseek-chat',
    attempt: 2,
    maxAttempts: 4,
    message: 'Retry 1 of 3.',
    finishedAt: 1_700_000_000_600,
    parentId: 'parent-1',
  }),
])).loadRuntimeRuns()[0];
assert.equal(kept.provider, 'DeepSeek');
assert.equal(kept.model, 'deepseek-chat');
assert.equal(kept.attempt, 2);
assert.equal(kept.maxAttempts, 4);
assert.equal(kept.message, 'Retry 1 of 3.');
assert.equal(kept.finishedAt, 1_700_000_000_600);
assert.equal(kept.parentId, 'parent-1');

// --- 4. every status and kind the unions allow is accepted -------------
for (const kind of ['provider', 'computer', 'project', 'agent']) {
  const store = freshStore(JSON.stringify([record(`k-${kind}`, { kind })]));
  assert.equal(store.loadRuntimeRuns().length, 1, `the ${kind} kind must be accepted`);
}
for (const status of ['idle', 'planning', 'running', 'checking', 'repairing', 'waiting-approval', 'stopping', 'completed', 'failed', 'cancelled', 'timed-out']) {
  const store = freshStore(JSON.stringify([record(`s-${status}`, { status })]));
  assert.equal(store.loadRuntimeRuns().length, 1, `the ${status} status must be accepted`);
}

// --- 5. an interrupted run is restored as cancelled ---------------------
const interrupted = freshStore(JSON.stringify([
  record('mid-flight', { status: 'running' }),
])).loadRuntimeRuns()[0];
assert.equal(interrupted.status, 'cancelled', 'an active record must not stay active after a restart');
assert.ok(interrupted.finishedAt, 'an interrupted record receives a finish time');
assert.match(interrupted.message ?? '', /Interrupted by app restart/, 'the interruption is explained');
assert.equal(interrupted.schemaVersion, 2, 'records are stamped with the current schema');

// --- 6. the pre-v2.2 migration still acknowledges historical failures ---
const legacy = freshStore(JSON.stringify([
  { schemaVersion: 1, id: 'legacy-failed', kind: 'provider', task: 't', status: 'failed', createdAt: 1, updatedAt: 2 },
  { schemaVersion: 1, id: 'legacy-done', kind: 'provider', task: 't', status: 'completed', createdAt: 1, updatedAt: 2 },
])).loadRuntimeRuns();
const legacyFailed = legacy.find((entry) => entry.id === 'legacy-failed');
const legacyDone = legacy.find((entry) => entry.id === 'legacy-done');
assert.ok(legacyFailed?.acknowledgedAt, 'a pre-v2.2 failure must be acknowledged during migration');
assert.equal(legacyDone?.acknowledgedAt, undefined, 'a pre-v2.2 success is not acknowledged');
assert.equal(legacyFailed.schemaVersion, 2, 'a migrated record carries the current schema');

// A current-schema failure keeps whatever acknowledgement it already had.
const current = freshStore(JSON.stringify([
  record('current-failed', { status: 'failed' }),
])).loadRuntimeRuns()[0];
assert.equal(current.acknowledgedAt, undefined, 'a current record is not acknowledged during hydration');

// --- 7. hydration order and the cap -------------------------------------
// Hydration preserves the stored order; the persistence path is what writes
// newest-first, so the head of a well-formed list is the newest record.
const ordered = freshStore(JSON.stringify([
  record('first-stored', { updatedAt: 1_700_000_000_900, createdAt: 1_700_000_000_900 }),
  record('second-stored', { updatedAt: 1_700_000_000_100, createdAt: 1_700_000_000_100 }),
])).loadRuntimeRuns();
assert.deepEqual(
  ordered.map((entry) => entry.id),
  ['first-stored', 'second-stored'],
  'hydration preserves the stored order',
);

// Stored newest-first (as the write path produces), the cap keeps the newest.
const capped = freshStore(JSON.stringify(
  Array.from({ length: 120 }, (_value, index) => record(`e${index}`, {
    updatedAt: 1_700_000_000_000 - index,
    createdAt: 1_700_000_000_000 - index,
  })),
)).loadRuntimeRuns();
assert.equal(capped.length, 80, 'hydration keeps at most 80 records');
assert.equal(capped[0].id, 'e0', 'the stored head — the newest record — is retained');
assert.equal(capped[capped.length - 1].id, 'e79', 'everything beyond the cap is dropped');

// An empty slot and a fresh store both start empty.
assert.deepEqual(freshStore().loadRuntimeRuns(), [], 'an empty slot hydrates as an empty list');
assert.deepEqual(freshStore('[]').loadRuntimeRuns(), [], 'an empty array hydrates as an empty list');

// --- 8. the implementation must keep its guard -------------------------
const source = fs.readFileSync(path.join(repoRoot, MODULE), 'utf8');
assert.match(source, /function normalizeRunRecord\(entry: unknown, hydratedAt: number\)/, 'the record validator must stay present');
assert.match(source, /const RUN_KINDS: ReadonlySet<string>/, 'the kind union must stay declared');
assert.match(source, /const RUN_STATUSES: ReadonlySet<string>/, 'the status union must stay declared');
assert.doesNotMatch(
  source,
  /\.filter\(\(entry\): entry is RuntimeRunRecord => Boolean\(entry && typeof entry\.id === "string"\)\)/,
  'the id-only acceptance must not return',
);

console.log('CHRIS_STUDIO_V2_4_RUNTIME_RECORD_VALIDATION_PASSED');

// Boundary tests for the Unified Agent durable runtime receipts.
//
// The runtime store keeps runs in localStorage. A single macOS screenshot is a
// multi-megabyte data URL and the origin quota is roughly 5 MB, so the store
// used to blow the quota and then silently drop every later write: receipt
// history and the "interrupted after restart" recovery both stopped working.
// These tests pin the durable projection to the behaviours that prevent it.
const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = path.resolve(__dirname, '../../../../.tokenfence-test-build');
const MODULE_PATH = path.join(buildRoot, 'features/unified-agent/runtimeStore.js');
const STORAGE_KEY = 'chris-studio.unified-agent-runtime.v1';
const STARTED_AT = '2026-09-26T10:00:00.000Z';

class FakeStorage {
  constructor(capacity = 5_000_000) {
    this.capacity = capacity;
    this.map = new Map();
    this.writes = 0;
    this.failures = 0;
    this.lastWritten = null;
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    const text = String(value);
    const size = Buffer.byteLength(text, 'utf8');
    if (size > this.capacity) {
      this.failures += 1;
      const error = new Error('QuotaExceededError: fake storage capacity exceeded');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.map.set(key, text);
    this.writes += 1;
    this.lastWritten = text;
  }
  removeItem(key) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

function installWindow(storage) {
  global.window = { localStorage: storage, dispatchEvent: () => true };
  if (typeof global.CustomEvent !== 'function') {
    global.CustomEvent = class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    };
  }
  return storage;
}

function freshRuntime() {
  delete require.cache[require.resolve(MODULE_PATH)];
  return require(MODULE_PATH);
}

function makeRun(id, patch = {}) {
  return {
    schemaVersion: 1,
    id,
    conversationId: 'conv-1',
    clientRequestId: `req-${id}`,
    mode: 'agent',
    goal: `goal for ${id}`,
    providerProfileId: 'profile-1',
    providerName: 'Test Provider',
    model: 'test-model',
    status: 'completed',
    loop: 1,
    maxLoops: 20,
    createdAt: STARTED_AT,
    updatedAt: STARTED_AT,
    events: [],
    approvals: [],
    ...patch,
  };
}

function makeEvent(id, output, screenshotDataUrl) {
  return {
    id,
    call: { id: `call-${id}`, name: 'project.read', args: {}, reason: 'inspect' },
    status: 'completed',
    startedAt: STARTED_AT,
    summary: 'read',
    output,
    screenshotDataUrl,
  };
}

function makeApproval(id, runId, toolEventId) {
  return {
    id,
    runId,
    toolEventId,
    toolName: 'computer.capture',
    title: 'Capture current screen',
    detail: 'Share one current desktop screenshot with this Agent run.',
    status: 'pending',
    createdAt: STARTED_AT,
  };
}

const BIG_SCREENSHOT = `data:image/png;base64,${'A'.repeat(400_000)}`;

// --- Scenario A: screenshots never reach durable storage --------------------
function scenarioScreenshotStripping() {
  const storage = installWindow(new FakeStorage());
  const runtime = freshRuntime();
  runtime.resetUnifiedRuntimeForTests();

  runtime.upsertUnifiedRun(makeRun('run-shots', {
    events: [makeEvent('evt-1', 'z'.repeat(50_000), BIG_SCREENSHOT)],
  }));

  const stored = storage.getItem(STORAGE_KEY);
  assert.ok(stored && stored.length > 2, 'the runtime must persist a projection of its runs');
  assert.ok(!stored.includes('data:image'), 'screenshot bitmaps must never reach durable storage');
  assert.ok(!stored.includes('screenshotDataUrl'), 'the screenshot field must be dropped from durable receipts');
  assert.ok(stored.includes('[truncated before persistence]'), 'oversized tool output must be clipped when persisted');
  assert.ok(storage.lastWritten.includes('run-shots'), 'the newest receipt must survive the projection');

  const live = runtime.loadUnifiedRuntime().runs.find((entry) => entry.id === 'run-shots');
  assert.ok(live, 'the live runtime must keep the run in memory');
  assert.equal(live.events[0].screenshotDataUrl, BIG_SCREENSHOT, 'the live runtime keeps the capture for the current approval window');
  assert.equal(live.events[0].output.length, 50_000, 'in-memory output stays complete for the current session');

  // A second write must not reintroduce bitmaps through another code path.
  runtime.updateUnifiedRun('run-shots', { status: 'failed', errorMessage: 'stopped' });
  const afterUpdate = storage.getItem(STORAGE_KEY);
  assert.ok(!afterUpdate.includes('data:image'), 'updates must keep the durable projection screenshot-free');
  assert.ok(afterUpdate.includes('"status":"failed"'), 'updates must still land in durable storage');
}

// --- Scenario B: quota pressure degrades to a compacted projection ---------
function scenarioQuotaDegradation() {
  const storage = installWindow(new FakeStorage(60_000));
  const runtime = freshRuntime();
  runtime.resetUnifiedRuntimeForTests();

  for (let index = 0; index < 12; index += 1) {
    runtime.upsertUnifiedRun(makeRun(`run-${index}`, {
      events: [makeEvent(`evt-${index}`, 'y'.repeat(8_000))],
    }));
  }

  assert.ok(storage.failures >= 1, 'a payload above the storage capacity must be attempted and refused');
  const stored = storage.getItem(STORAGE_KEY);
  assert.ok(stored, 'the runtime must converge on a compacted projection instead of failing silently');
  assert.ok(Buffer.byteLength(stored, 'utf8') <= storage.capacity, 'the compacted projection must fit the capacity');
  const parsed = JSON.parse(stored);
  assert.equal(parsed.length, 12, 'every receipt must survive compaction');
  assert.ok(parsed.every((run) => run.events[0].output.length <= 1_100), 'compaction clips tool output');
  assert.ok(parsed.every((run) => run.events[0].output.includes('[truncated before persistence]')), 'compaction marks clipped output');
  assert.ok(!stored.includes('data:image'), 'compaction must not leak screenshots either');
  assert.equal(runtime.loadUnifiedRuntime().runs.length, 12, 'compaction must not delete live receipts');
}

// --- Scenario C: hydration repairs legacy receipts --------------------------
function scenarioHydrationRepair() {
  const storage = installWindow(new FakeStorage());
  storage.setItem(STORAGE_KEY, JSON.stringify([
    makeRun('legacy-active', {
      status: 'waiting-approval',
      events: [makeEvent('evt-a', 'legacy output', BIG_SCREENSHOT)],
      approvals: [makeApproval('ap-1', 'legacy-active', 'evt-a')],
    }),
    makeRun('legacy-done', {
      status: 'completed',
      events: [makeEvent('evt-b', 'done output', BIG_SCREENSHOT)],
    }),
    makeRun('wrong-schema', { schemaVersion: 0 }),
    { conversationId: 'conv-1' },
  ]));

  const runtime = freshRuntime();
  const snapshot = runtime.loadUnifiedRuntime();
  assert.equal(snapshot.runs.length, 2, 'only schemaVersion 1 receipts with an id are restored');

  const active = snapshot.runs.find((entry) => entry.id === 'legacy-active');
  assert.equal(active.status, 'interrupted', 'unfinished runs must be restored as interrupted, never completed');
  assert.match(String(active.errorMessage), /durable completion receipt/i, 'the interrupted receipt must explain itself');
  assert.equal(active.approvals[0].status, 'denied', 'pending approvals from a previous process must be denied');
  assert.equal(active.events[0].screenshotDataUrl, undefined, 'restored receipts must not resurrect screenshot bitmaps');

  const done = snapshot.runs.find((entry) => entry.id === 'legacy-done');
  assert.equal(done.status, 'completed', 'finished runs must keep their real status');
  assert.equal(done.events[0].screenshotDataUrl, undefined, 'finished runs must also drop stale screenshots');
  assert.equal(done.events[0].output, 'done output', 'restoring must not damage stored output');

  const rewritten = storage.getItem(STORAGE_KEY);
  assert.ok(!rewritten.includes('data:image'), 'hydration rewrites the store without screenshots');
  assert.equal(storage.failures, 0, 'hydration must not need a failed write to converge');
}

// --- Scenario D: reset clears both memory and durable state ----------------
function scenarioReset() {
  const storage = installWindow(new FakeStorage());
  const runtime = freshRuntime();
  runtime.upsertUnifiedRun(makeRun('run-reset'));
  runtime.resetUnifiedRuntimeForTests();
  assert.equal(runtime.loadUnifiedRuntime().runs.length, 0, 'reset must clear in-memory receipts');
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).length, 0, 'reset must clear durable receipts');
}

scenarioScreenshotStripping();
scenarioQuotaDegradation();
scenarioHydrationRepair();
scenarioReset();

console.log('CHRIS_STUDIO_V2_4_UNIFIED_RUNTIME_STORE_PASSED');

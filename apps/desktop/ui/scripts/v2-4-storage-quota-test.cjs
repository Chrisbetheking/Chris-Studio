// Regression tests: local storage writes must degrade instead of throwing.
//
// `safeWrite` used to call `localStorage.setItem` without a try/catch, while
// `safeRead` had one. Any write failure — an exhausted origin quota, storage
// blocked in a hardened browser — therefore threw synchronously out of the send
// flow: the composer looked frozen, the draft stayed, and nothing was reported.
//
// The reviewed request path additionally depends on the conversation being
// durable: `saveConversation` now reports success, and the workspace refuses to
// queue a request whose redacted history could not be stored.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const uiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(uiRoot, '../../..');
const buildRoot = path.join(repoRoot, '.tokenfence-test-build');

/** localStorage that enforces a byte capacity and records failures. */
class CappedStorage {
  constructor(capacityBytes = 5_000_000) {
    this.capacity = capacityBytes;
    this.map = new Map();
    this.failures = 0;
    this.writes = 0;
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    const text = String(value);
    const size = Buffer.byteLength(text, 'utf8');
    if (size > this.capacity) {
      this.failures += 1;
      const error = new Error('QuotaExceededError: capped storage capacity exceeded');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.map.set(key, text);
    this.writes += 1;
  }
  removeItem(key) {
    this.map.delete(key);
  }
  usedBytes() {
    let total = 0;
    for (const value of this.map.values()) total += Buffer.byteLength(value, 'utf8');
    return total;
  }
}

function installWindow(storage) {
  global.window = {
    localStorage: storage,
    dispatchEvent: () => true,
  };
  global.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    }
  };
}

function freshStore() {
  delete require.cache[require.resolve(path.join(buildRoot, 'app/store.js'))];
  return require(path.join(buildRoot, 'app/store.js'));
}

function conversation(id, messageLength = 40, updatedAt) {
  return {
    id,
    title: `Conversation ${id}`,
    createdAt: '2026-09-26T10:00:00.000Z',
    updatedAt: updatedAt ?? `2026-09-26T10:${String(Number(id.slice(-2)) % 60).padStart(2, '0')}:00.000Z`,
    provider: 'Test Provider',
    model: 'test-model',
    mode: 'agent',
    messages: [
      { id: `${id}-m1`, role: 'user', content: 'x'.repeat(messageLength), createdAt: '2026-09-26T10:00:00.000Z' },
      { id: `${id}-m2`, role: 'assistant', content: 'y'.repeat(messageLength), createdAt: '2026-09-26T10:00:01.000Z' },
    ],
  };
}

// --- 1. a write failure must be reported, not thrown ----------------------
function writeFailureIsReported() {
  // Capacity too small for the settings blob, so every write must fail.
  const storage = new CappedStorage(10);
  installWindow(storage);
  const store = freshStore();

  let threw = false;
  try {
    store.saveSettings({ ...store.DEFAULT_SETTINGS, debugMode: true });
  } catch {
    threw = true;
  }
  assert.equal(threw, false, 'a full quota must not throw out of the settings write');
  assert.ok(storage.failures >= 1, 'the capped storage must have refused at least one write');

  // The write path for conversations must report failure the same way.
  const ok = store.saveConversation(conversation('c-01'));
  assert.equal(ok, false, 'saveConversation must report that nothing was stored');
  assert.ok(store.loadConversations().length === 0, 'no conversation may be visible after a failed write');
}

// --- 2. a healthy write must succeed and round-trip ----------------------
function healthyWriteSucceeds() {
  const storage = new CappedStorage(5_000_000);
  installWindow(storage);
  const store = freshStore();

  const ok = store.saveConversation(conversation('c-02'));
  assert.equal(ok, true, 'a conversation must be stored when the quota allows it');
  const loaded = store.loadConversations();
  assert.equal(loaded.length, 1, 'the stored conversation must be readable back');
  assert.equal(loaded[0].id, 'c-02');
  assert.equal(loaded[0].messages.length, 2, 'messages must survive the round trip');
  assert.ok(storage.usedBytes() > 0, 'the storage must actually hold the conversation');
}

// --- 3. a tight quota must still store the newest conversation -----------
function tightQuotaKeepsNewest() {
  // Room for roughly one conversation plus the settings blob, far less than the
  // 300-conversation ceiling, so the first write of the full list must fail.
  const storage = new CappedStorage(12_000);
  installWindow(storage);
  const store = freshStore();

  // Seed history so the full list would exceed the capacity. The seed goes
  // straight into the backing map: history that predates the tight quota is
  // exactly what a real origin would already hold, and it must not be the thing
  // under test here.
  const seeded = Array.from({ length: 60 }, (_value, position) => conversation(`c-${String(position).padStart(2, '0')}`));
  storage.map.set('tokenfence.conversations.v170', JSON.stringify(seeded));
  assert.ok(storage.usedBytes() > storage.capacity, 'the seeded history must exceed the capacity');

  const before = store.loadConversations().length;
  assert.ok(before >= 50, 'the seed history must be present');

  // An explicit newest timestamp keeps the intent unambiguous: this is the
  // conversation the user just approved, and it must be the one preserved.
  const ok = store.saveConversation(conversation('c-99', 4000, '2026-09-26T23:59:59.000Z'));
  assert.equal(ok, true, 'the degradation path must still land the newest conversation');

  const loaded = store.loadConversations();
  assert.equal(loaded.length, 1, 'the degraded write keeps only what fits');
  assert.equal(loaded[0].id, 'c-99', 'the newest conversation must be the one preserved');
  assert.ok(storage.usedBytes() <= storage.capacity, 'the stored payload must fit the capacity');
}

// --- 4. the workspace must refuse a request it cannot persist ------------
const workspace = fs.readFileSync(path.join(uiRoot, 'src/screens/WorkspaceScreen.tsx'), 'utf8');
assert.match(
  workspace,
  /if \(!saveConversation\(pending\)\) \{/,
  'the workspace must branch on the persistence result',
);
assert.match(
  workspace,
  /Local history is full, so this request was not sent\./,
  'the refusal must be explained in English',
);
assert.match(
  workspace,
  /本地历史已写满，本次请求未发送。/,
  'the refusal must be explained in Chinese',
);
const guardIndex = workspace.indexOf('if (!saveConversation(pending)) {');
const enqueueIndex = workspace.indexOf('const result = unifiedAgentManager.enqueue({');
assert.ok(
  guardIndex >= 0 && guardIndex < enqueueIndex,
  'the persistence guard must run before the request is queued',
);

// --- 5. the store must keep its quota-aware helpers ----------------------
const storeSource = fs.readFileSync(path.join(uiRoot, 'src/app/store.ts'), 'utf8');
assert.match(
  storeSource,
  /function safeWrite<T>\(key: string, value: T\): boolean \{/,
  'safeWrite must report whether the value was stored',
);
assert.match(
  storeSource,
  /export function saveConversation\(conversation: Conversation\): boolean \{/,
  'saveConversation must return the persistence result',
);
assert.match(
  storeSource,
  /const trimmed = next\.slice\(0, Math\.max\(1, Math\.floor\(next\.length \/ 2\)\)\);/,
  'the quota degradation step must be present',
);
assert.match(
  storeSource,
  /written = safeWrite\(KEYS\.conversations, next\.slice\(0, 1\)\);/,
  'the final fallback must attempt the newest conversation alone',
);
assert.doesNotMatch(
  storeSource,
  /function safeWrite<T>\(key: string, value: T\): void \{/,
  'the throwing void implementation must not return',
);

writeFailureIsReported();
healthyWriteSucceeds();
tightQuotaKeepsNewest();

console.log('CHRIS_STUDIO_V2_4_STORAGE_QUOTA_PASSED');

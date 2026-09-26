const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const uiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(uiRoot, '../../..');
const buildRoot = path.join(repoRoot, '.tokenfence-test-build');
const candidates = [
  path.join(buildRoot, 'features/providers/providerClient.js'),
  path.join(buildRoot, 'src/features/providers/providerClient.js'),
];
const compiled = candidates.find((candidate) => fs.existsSync(candidate));
if (!compiled) throw new Error(`Cannot find compiled providerClient module. Checked: ${candidates.join(', ')}`);

let streamListener;
let cancelCalls = 0;
let mode = 'progressive';
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@tauri-apps/api/event') {
    return {
      listen: async (eventName, callback) => {
        assert.equal(eventName, 'chris-studio://provider-stream');
        streamListener = callback;
        return () => { streamListener = undefined; };
      },
    };
  }
  if (request === '@tauri-apps/api/tauri') {
    return {
      invoke: async (command, args) => {
        if (command === 'provider_stream_cancel') {
          cancelCalls += 1;
          return true;
        }
        assert.equal(command, 'provider_chat_stream');
        assert.equal(typeof args.streamId, 'string');
        const id = args.streamId;
        if (mode === 'progressive') {
          setTimeout(() => streamListener?.({ payload: { streamId: id, kind: 'delta', text: 'Hel', model: 'test-model' } }), 10);
          setTimeout(() => streamListener?.({ payload: { streamId: id, kind: 'delta', text: 'lo', model: 'test-model' } }), 24);
          setTimeout(() => streamListener?.({ payload: { streamId: id, kind: 'done', model: 'test-model' } }), 40);
        } else if (mode === 'late-read-error') {
          setTimeout(() => streamListener?.({ payload: { streamId: id, kind: 'delta', text: 'Complete visible answer.', model: 'test-model' } }), 8);
          setTimeout(() => streamListener?.({ payload: { streamId: id, kind: 'error', errorCode: 'STREAM_READ_ERROR', errorMessage: 'late EOF', model: 'test-model' } }), 18);
        }
        return true;
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { sendProviderChatStream } = require(compiled);
Module._load = originalLoad;

const profile = {
  id: 'test-profile',
  providerId: 'custom',
  displayName: 'Test provider',
  apiStyle: 'openai-compatible',
  apiKey: 'test-only-key',
  credentialStored: true,
  model: 'test-model',
  baseUrl: 'https://example.invalid/v1',
  enabled: true,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const deltas = [];
  let completed = false;
  const responsePromise = sendProviderChatStream(
    profile,
    [{ role: 'user', content: 'hello' }],
    5_000,
    undefined,
    [],
    false,
    { onDelta: (delta) => deltas.push(delta) },
  ).then((reply) => {
    completed = true;
    return reply;
  });

  await sleep(18);
  assert.deepEqual(deltas, ['Hel'], 'The first chunk must reach the renderer before completion.');
  assert.equal(completed, false, 'The stream promise must remain open while later chunks are pending.');

  const response = await responsePromise;
  assert.equal(response.ok, true);
  assert.equal(response.content, 'Hello');
  assert.equal(response.model, 'test-model');
  assert.deepEqual(deltas, ['Hel', 'lo']);

  mode = 'late-read-error';
  const lateDeltas = [];
  const salvaged = await sendProviderChatStream(
    profile,
    [{ role: 'user', content: 'salvage me' }],
    5_000,
    undefined,
    [],
    false,
    { onDelta: (delta) => lateDeltas.push(delta) },
  );
  assert.equal(salvaged.ok, true, 'A late SSE read error must not replace visible assistant text with a red failure.');
  assert.equal(salvaged.content, 'Complete visible answer.');
  assert.deepEqual(lateDeltas, ['Complete visible answer.']);

  mode = 'cancel';
  const controller = new AbortController();
  const cancelled = sendProviderChatStream(
    profile,
    [{ role: 'user', content: 'cancel me' }],
    5_000,
    undefined,
    [],
    false,
    { onDelta: () => {} },
    controller.signal,
  );
  setTimeout(() => controller.abort('test stop'), 8);
  const cancelledReply = await cancelled;
  assert.equal(cancelledReply.ok, false);
  assert.equal(cancelledReply.errorCode, 'CANCELLED');
  assert.ok(cancelCalls >= 1, 'Abort must notify the Rust stream worker.');

  console.log('v2.2 progressive provider stream session tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

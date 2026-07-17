const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = path.resolve(__dirname, '../../../../.tokenfence-test-build');
const runtime = require(path.join(buildRoot, 'features/agent-runtime/runtimeStore.js'));

async function main() {
  runtime.resetRuntimeStoreForTests();

  const snapshots = [];
  const unsubscribe = runtime.subscribeRuntimeRuns((runs) => snapshots.push(runs));
  const run = runtime.beginRuntimeRun({
    kind: 'provider',
    task: 'Verify runtime stop and persistence-safe state updates',
    provider: 'Test Provider',
    model: 'test-model',
    maxAttempts: 4,
  });

  assert.equal(run.status, 'planning');
  assert.equal(run.maxAttempts, 4);
  assert.equal(runtime.loadRuntimeRuns().length, 1);

  runtime.updateRuntimeRun(run.id, { status: 'running', attempt: 1, message: 'Running.' });
  const running = runtime.loadRuntimeRuns()[0];
  assert.equal(running.status, 'running');
  assert.equal(running.attempt, 1);

  const neverFinishes = new Promise(() => {});
  const stopped = runtime.raceWithRuntimeStop(run.id, neverFinishes);
  runtime.requestRuntimeStop(run.id, 'User emergency stop test.');
  await assert.rejects(stopped, (error) => {
    assert.equal(error.name, 'RuntimeStopError');
    assert.match(error.message, /emergency stop/i);
    return true;
  });

  runtime.finishRuntimeRun(run.id, 'cancelled', 'User emergency stop test.');
  assert.equal(runtime.loadRuntimeRuns()[0].status, 'cancelled');
  assert.equal(runtime.loadRuntimeRuns()[0].message, 'User emergency stop test.');
  assert.equal(runtime.clearFinishedRuntimeRuns().length, 0);
  assert.ok(snapshots.length >= 4, 'Subscribers should receive each meaningful runtime transition.');

  unsubscribe();
  runtime.resetRuntimeStoreForTests();
  console.log('v2.2 runtime store tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = path.resolve(__dirname, '../../../../.tokenfence-test-build');
const runtime = require(path.join(buildRoot, 'features/agent-runtime/runtimeStore.js'));

async function main() {
  runtime.resetRuntimeStoreForTests();

  const snapshots = [];
  const unsubscribe = runtime.subscribeRuntimeRuns((runs) => snapshots.push(runs));
  const parent = runtime.beginRuntimeRun({
    kind: 'computer',
    task: 'Model-driven desktop goal',
    provider: 'Test Provider',
    model: 'test-model',
    maxAttempts: 4,
  });
  const child = runtime.beginRuntimeRun({
    parentId: parent.id,
    kind: 'computer',
    task: 'Approved TextEdit action',
    action: 'open',
  });

  assert.equal(parent.schemaVersion, 2);
  assert.equal(parent.status, 'planning');
  assert.equal(child.parentId, parent.id);
  assert.equal(runtime.loadRuntimeRuns().length, 2);

  runtime.updateRuntimeRun(parent.id, { status: 'running', attempt: 1, message: 'Running.' });
  const running = runtime.loadRuntimeRuns().find((entry) => entry.id === parent.id);
  assert.equal(running.status, 'running');
  assert.equal(running.attempt, 1);

  const neverFinishes = new Promise(() => {});
  const stopped = runtime.raceWithRuntimeStop(parent.id, neverFinishes);
  runtime.requestRuntimeStop(parent.id, 'User emergency stop test.');
  await assert.rejects(stopped, (error) => {
    assert.equal(error.name, 'RuntimeStopError');
    assert.match(error.message, /emergency stop/i);
    return true;
  });

  runtime.finishRuntimeRun(child.id, 'completed', 'Child step completed.');
  runtime.finishRuntimeRun(parent.id, 'failed', 'Parent goal failed for attention test.');
  runtime.acknowledgeRuntimeRun(parent.id);
  let records = runtime.loadRuntimeRuns();
  assert.ok(records.every((entry) => entry.acknowledgedAt), 'Acknowledging a parent must acknowledge its child receipts.');

  runtime.archiveRuntimeRun(parent.id);
  records = runtime.loadRuntimeRuns();
  assert.ok(records.every((entry) => entry.archivedAt), 'Archiving a parent must archive its finished child receipts.');
  assert.equal(runtime.clearArchivedRuntimeRuns().length, 0);
  assert.ok(snapshots.length >= 7, 'Subscribers should receive each meaningful runtime transition.');

  const failedOne = runtime.beginRuntimeRun({ kind: 'provider', task: 'Failure one' });
  const failedTwo = runtime.beginRuntimeRun({ kind: 'provider', task: 'Failure two' });
  runtime.finishRuntimeRun(failedOne.id, 'failed', 'one');
  runtime.finishRuntimeRun(failedTwo.id, 'timed-out', 'two');
  runtime.acknowledgeAllRuntimeFailures();
  assert.ok(runtime.loadRuntimeRuns().every((entry) => entry.acknowledgedAt));
  runtime.archiveFinishedRuntimeRuns();
  assert.ok(runtime.loadRuntimeRuns().every((entry) => entry.archivedAt));
  assert.equal(runtime.clearFinishedRuntimeRuns().length, 0);

  unsubscribe();
  runtime.resetRuntimeStoreForTests();
  console.log('v2.2 runtime store grouping and archive tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

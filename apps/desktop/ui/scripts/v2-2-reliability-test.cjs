const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const buildRoot = path.resolve(__dirname, '../../../../.tokenfence-test-build');
const candidates = [
  path.join(buildRoot, 'features/agent-runtime/reliableRun.js'),
  path.join(buildRoot, 'src/features/agent-runtime/reliableRun.js'),
];
const modulePath = candidates.find((candidate) => fs.existsSync(candidate));
if (!modulePath) {
  throw new Error(`Cannot find compiled reliableRun module. Checked: ${candidates.join(', ')}`);
}

const {
  ReliableRunController,
  DEFAULT_MAX_REPAIR_ATTEMPTS,
} = require(modulePath);

assert.equal(DEFAULT_MAX_REPAIR_ATTEMPTS, 3);

let clock = 1000;
const run = new ReliableRunController({
  task: 'repair a failed build',
  runId: 'test-run',
  hardTimeoutMs: 0,
  now: () => ++clock,
});
run.start();
assert.equal(run.beginLoop(), 1);
run.beginCheckpoint('typecheck', 'TypeScript');
run.finishCheckpoint('typecheck', true, 'passed');
run.recordPatchBackup({ path: 'src/a.ts', backupPath: '.tokenfence/backups/a.ts' });
assert.equal(run.beginRepair('first failure'), true);
assert.equal(run.beginRepair('second failure'), true);
assert.equal(run.beginRepair('third failure'), true);
assert.equal(run.beginRepair('fourth failure'), false);
const failed = run.snapshot();
assert.equal(failed.status, 'failed');
assert.equal(failed.repairAttempts, 3);
assert.equal(failed.patchBackups.length, 1);
assert.ok(failed.finishedAt);

const stopped = new ReliableRunController({ task: 'computer task', hardTimeoutMs: 0 });
stopped.start('running');
stopped.cancel('Emergency stop');
assert.equal(stopped.snapshot().status, 'cancelled');
assert.equal(stopped.signal.aborted, true);

const approval = new ReliableRunController({ task: 'write patch', hardTimeoutMs: 0 });
approval.start('running');
approval.waitForApproval('Review diff');
assert.equal(approval.snapshot().status, 'waiting-approval');
approval.resume();
assert.equal(approval.complete().status, 'completed');

console.log('v2.2 reliable Agent run tests passed');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const buildRoot = path.resolve(__dirname, '../../../../.tokenfence-test-build');
function load(relative) {
  const candidates = [
    path.join(buildRoot, relative),
    path.join(buildRoot, 'src', relative),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`Cannot find compiled module: ${candidates.join(', ')}`);
  return require(found);
}

const { normalizeProviderUsage, normalizeProviderError } = load('features/providers/providerTelemetry.js');
const { ComputerUseSessionGuard, buildCoordinateOverlay } = load('features/computer-use/sessionGuard.js');
const { ReliableRunController } = load('features/agent-runtime/reliableRun.js');
const { buildRollbackPlan, serializeRunReceipt } = load('features/agent-runtime/rollbackPlan.js');

const usage = normalizeProviderUsage('openai', {
  prompt_tokens: 1200,
  completion_tokens: 300,
  total_tokens: 1500,
  input_tokens_details: { cached_tokens: 200 },
}, {
  model: 'test-model',
  rateCard: { inputUsdPerMillion: 1, outputUsdPerMillion: 4, cachedInputUsdPerMillion: 0.25 },
});
assert.equal(usage.totalTokens, 1500);
assert.equal(usage.cachedInputTokens, 200);
assert.equal(usage.estimatedCostUsd, 0.00225);

const rateError = normalizeProviderError('openai', {
  status: 429,
  code: 'rate_limit_exceeded',
  message: 'Bearer abc.def.ghi rate limit reached',
  retry_after: 2,
});
assert.equal(rateError.category, 'rate-limit');
assert.equal(rateError.retryable, true);
assert.equal(rateError.retryAfterMs, 2000);
assert.equal(rateError.safeMessage.includes('abc.def.ghi'), false);

let now = 10_000;
const guard = new ComputerUseSessionGuard({
  sessionId: 'computer-test',
  hardTimeoutMs: 100,
  approvalTtlMs: 20,
  now: () => now,
});
guard.start();
const overlay = buildCoordinateOverlay(720, 450, { width: 1440, height: 900 });
assert.equal(overlay.normalizedX, 0.5);
assert.equal(overlay.normalizedY, 0.5);
const ticket = guard.issueApproval('click', 'Click Save');
guard.consumeApproval(ticket.id, 'click');
assert.throws(() => guard.consumeApproval(ticket.id, 'click'), /already been used/);
now = 10_100;
assert.throws(() => guard.checkDeadline(), /hard timeout/i);
assert.equal(guard.snapshot().status, 'timed-out');
assert.equal(guard.signal.aborted, true);

const stopped = new ComputerUseSessionGuard({ hardTimeoutMs: 0 });
stopped.start();
stopped.emergencyStop();
assert.equal(stopped.snapshot().status, 'stopped');

const run = new ReliableRunController({ task: 'rollback', runId: 'rollback-test', hardTimeoutMs: 0 });
run.start('running');
run.recordPatchBackup({
  path: 'src/file.ts',
  backupPath: '.tokenfence/backups/run-1/src/file.ts',
  sha256Before: 'before',
  sha256After: 'after-one',
});
run.recordPatchBackup({
  path: 'src/file.ts',
  backupPath: '.tokenfence/backups/run-1/src/file-v2.ts',
  sha256Before: 'after-one',
  sha256After: 'after-two',
});
run.recordPatchBackup({
  path: 'src/other.ts',
  backupPath: '.tokenfence/backups/run-1/src/other.ts',
});
const receipt = run.complete();
const plan = buildRollbackPlan(receipt, 12345);
assert.equal(plan.steps.length, 2);
assert.equal(plan.steps[0].targetPath, 'src/other.ts');
assert.equal(plan.steps[1].sourceBackupPath.endsWith('file-v2.ts'), true);
assert.equal(serializeRunReceipt(receipt).endsWith('\n'), true);
assert.throws(() => buildRollbackPlan({ ...receipt, patchBackups: [{ path: '../escape', backupPath: '.tokenfence/backups/x' }] }), /unsafe/);

console.log('v2.2 provider, Computer Use and rollback tests passed');

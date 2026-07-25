const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const uiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(uiRoot, '../../..');
const buildRoot = path.join(repoRoot, '.tokenfence-test-build');
const collaboration = require(path.join(buildRoot, 'features/agent-runtime/collaborativeRun.js'));

function profile(id, model = `${id}-model`) {
  return {
    id,
    providerId: 'custom',
    displayName: id,
    apiStyle: 'openai-compatible',
    baseUrl: 'https://example.invalid/v1',
    model,
    enabled: true,
    credentialStored: true,
    apiKey: '',
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  };
}

const fallback = profile('workspace');
const planner = profile('planner');
const executor = profile('executor');
const reviewer = profile('reviewer');
const agent = {
  id: 'coder',
  name: 'Coder',
  description: 'test',
  collaborationMode: 'plan-execute-review',
  plannerProviderProfileId: planner.id,
  executorProviderProfileId: executor.id,
  reviewerProviderProfileId: reviewer.id,
  maxRevisionRounds: 1,
  skillIds: [],
  permissionMode: 'ask',
  enabled: true,
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
};

const roles = collaboration.resolveAgentRoleProfiles(agent, [planner, executor, reviewer], fallback);
assert.equal(roles.planner.id, 'planner');
assert.equal(roles.executor.id, 'executor');
assert.equal(roles.reviewer.id, 'reviewer');

const inherited = collaboration.resolveAgentRoleProfiles(
  { ...agent, plannerProviderProfileId: undefined, reviewerProviderProfileId: undefined },
  [executor],
  fallback,
);
assert.equal(inherited.planner.id, 'executor');
assert.equal(inherited.reviewer.id, 'executor');

assert.throws(
  () => collaboration.resolveAgentRoleProfiles({ ...agent, reviewerProviderProfileId: 'missing' }, [planner, executor], fallback),
  /will not silently route this role elsewhere/i,
);

const plan = collaboration.parseAgentPlan('```json\n{"steps":[{"title":"Inspect repository","detail":"Read before writing"},{"title":"Implement minimal change"},{"title":"Run tests"}]}\n```');
assert.deepEqual(plan.map((step) => step.title), ['Inspect repository', 'Implement minimal change', 'Run tests']);
assert.equal(plan[0].status, 'pending');
assert.equal(collaboration.parseAgentPlan('1. Inspect\n2. Implement\n3. Verify').length, 3);

const pass = collaboration.parseAgentReview('{"verdict":"pass","summary":"All acceptance criteria are met.","issues":[]}');
assert.equal(pass.verdict, 'pass');
const revise = collaboration.parseAgentReview('{"verdict":"revise","summary":"One issue","issues":["Missing test evidence"]}');
assert.equal(revise.verdict, 'revise');
assert.deepEqual(revise.issues, ['Missing test evidence']);

const workspace = fs.readFileSync(path.join(uiRoot, 'src/screens/WorkspaceScreen.tsx'), 'utf8');
const agents = fs.readFileSync(path.join(uiRoot, 'src/screens/AgentsScreen.tsx'), 'utf8');
const runtime = fs.readFileSync(path.join(uiRoot, 'src/features/agent-runtime/collaborativeRun.ts'), 'utf8');
assert.match(workspace, /runCollaborativeAgent\(/);
assert.match(workspace, /agentRun:\s*agentRunReceipt/);
assert.match(workspace, /Plan → Execute → Review/);
assert.match(agents, /plannerProviderProfileId/);
assert.match(agents, /executorProviderProfileId/);
assert.match(agents, /reviewerProviderProfileId/);
assert.match(agents, /Allow one revision/);
assert.match(runtime, /will not silently route this role elsewhere/);
assert.match(runtime, /ask for explicit approval/i);
assert.match(runtime, /resumeCollaborativeAgent/);
assert.match(runtime, /MAX_AGENT_RESUME_ATTEMPTS\s*=\s*2/);
assert.match(workspace, /resumeAgentMessage/);
assert.match(workspace, /Completed roles are reused/);
assert.match(workspace, /inputVisionAttachmentCount/);

const providerReadyGuard = workspace.indexOf('if (!providerReady)');
const pendingPersistence = workspace.indexOf('if (settings.localHistoryEnabled) saveConversation(pending);');
const immediateComposerClear = workspace.indexOf("setPrompt('');", pendingPersistence);
const requestMessageAssembly = workspace.indexOf('const requestMessages:', pendingPersistence);
assert.ok(providerReadyGuard >= 0 && providerReadyGuard < pendingPersistence, 'Provider/preflight failures must retain the unsent draft.');
assert.ok(
  pendingPersistence >= 0
    && immediateComposerClear > pendingPersistence
    && requestMessageAssembly > immediateComposerClear,
  'The composer must clear immediately after the request is accepted and persisted, before the model workflow starts.',
);
assert.match(
  workspace.slice(pendingPersistence, requestMessageAssembly),
  /setPrompt\(''\);[\s\S]*composerInput\.current\?\.focus\(\)/,
  'Accepted sends should clear and refocus the composer.',
);
const usageRecording = workspace.indexOf('recordTokenUsage({', requestMessageAssembly);
const sendCatch = workspace.indexOf('    } catch (error) {', usageRecording);
assert.ok(usageRecording >= 0 && sendCatch > usageRecording);
assert.doesNotMatch(
  workspace.slice(usageRecording, sendCatch),
  /setPrompt\(''\)/,
  'Completing the response must not erase a new draft typed while the Agent was running.',
);

async function runWorkflowTest() {
  const runtime = require(path.join(buildRoot, 'features/agent-runtime/runtimeStore.js'));
  runtime.resetRuntimeStoreForTests();
  const receipts = [];
  const chunks = [];
  let sendCount = 0;
  const transport = {
    async send(_profile, _messages, _timeout, _model, _attachments, _vision, context) {
      sendCount += 1;
      if (context.role === 'planner') {
        return { ok: true, status: 200, latencyMs: 1, content: '{"steps":[{"title":"Plan"},{"title":"Execute"},{"title":"Verify"}]}' };
      }
      if (context.role === 'reviewer') {
        return { ok: true, status: 200, latencyMs: 1, content: '{"verdict":"pass","summary":"Verified","issues":[]}' };
      }
      throw new Error(`Unexpected role ${context.role}`);
    },
    async stream(_profile, _messages, _timeout, _model, _attachments, _vision, callbacks) {
      callbacks.onDelta('Live ');
      await Promise.resolve();
      callbacks.onDelta('draft');
      return { ok: true, status: 200, latencyMs: 2, content: 'Live draft' };
    },
  };
  const result = await collaboration.runCollaborativeAgent({
    agent: { ...agent, maxRevisionRounds: 0 },
    profiles: [planner, executor, reviewer],
    defaultProfile: fallback,
    messages: [{ role: 'user', content: 'Build the feature.' }],
    timeoutMs: 1_000,
    attachments: [],
    includeVisionImages: false,
    transport,
    callbacks: {
      onReceipt: (receipt) => receipts.push(receipt),
      onExecutorDelta: (delta) => chunks.push(delta),
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.content, 'Live draft');
  assert.equal(result.receipt.phase, 'completed');
  assert.equal(result.receipt.reviewVerdict, 'pass');
  assert.deepEqual(chunks, ['Live ', 'draft']);
  assert.equal(sendCount, 2);
  assert.ok(receipts.some((receipt) => receipt.phase === 'planning'));
  assert.ok(receipts.some((receipt) => receipt.phase === 'executing'));
  assert.ok(receipts.some((receipt) => receipt.phase === 'reviewing'));
  assert.ok(receipts.some((receipt) => receipt.phase === 'completed'));
  const runs = runtime.loadRuntimeRuns();
  const parent = runs.find((entry) => entry.kind === 'agent');
  assert.ok(parent, 'The collaborative workflow must create one Agent parent receipt.');
  assert.equal(parent.status, 'completed');
  runtime.resetRuntimeStoreForTests();
}

async function runRecoveryTests() {
  const runtime = require(path.join(buildRoot, 'features/agent-runtime/runtimeStore.js'));
  runtime.resetRuntimeStoreForTests();

  const failedExecutor = await collaboration.runCollaborativeAgent({
    agent: { ...agent, maxRevisionRounds: 0 },
    profiles: [planner, executor, reviewer],
    defaultProfile: fallback,
    messages: [{ role: 'user', content: 'Resume the implementation.' }],
    timeoutMs: 1_000,
    attachments: [],
    includeVisionImages: false,
    transport: {
      async send(_profile, _messages, _timeout, _model, _attachments, _vision, context) {
        if (context.role === 'planner') {
          return { ok: true, status: 200, latencyMs: 1, content: '{"steps":[{"title":"Inspect"},{"title":"Implement"},{"title":"Verify"}]}' };
        }
        throw new Error(`Reviewer must not run after an Executor failure: ${context.role}`);
      },
      async stream() {
        return { ok: false, status: 503, latencyMs: 1, errorMessage: 'Executor temporarily unavailable.' };
      },
    },
    callbacks: { onExecutorDelta() {} },
  });
  assert.equal(failedExecutor.ok, false);
  assert.equal(failedExecutor.receipt.phase, 'failed');
  assert.equal(failedExecutor.receipt.resumeStage, 'executor');
  assert.equal(collaboration.canResumeAgentRun(failedExecutor.receipt), true);

  const resumedRoles = [];
  const executorChunks = [];
  const resumedExecutor = await collaboration.resumeCollaborativeAgent({
    previousReceipt: failedExecutor.receipt,
    existingDraft: '',
    agent: { ...agent, maxRevisionRounds: 0 },
    profiles: [planner, executor, reviewer],
    defaultProfile: fallback,
    messages: [{ role: 'user', content: 'Resume the implementation.' }],
    timeoutMs: 1_000,
    attachments: [],
    includeVisionImages: false,
    transport: {
      async send(_profile, _messages, _timeout, _model, _attachments, _vision, context) {
        resumedRoles.push(context.role);
        assert.notEqual(context.role, 'planner', 'Planner must not rerun from an Executor checkpoint.');
        return { ok: true, status: 200, latencyMs: 1, content: '{"verdict":"pass","summary":"Recovered review passed.","issues":[]}' };
      },
      async stream(_profile, _messages, _timeout, _model, _attachments, _vision, callbacks, _signal, context) {
        resumedRoles.push(context.role);
        callbacks.onDelta('Recovered ');
        callbacks.onDelta('draft');
        return { ok: true, status: 200, latencyMs: 1, content: 'Recovered draft' };
      },
    },
    callbacks: { onExecutorDelta: (delta) => executorChunks.push(delta) },
  });
  assert.equal(resumedExecutor.ok, true);
  assert.equal(resumedExecutor.receipt.phase, 'completed');
  assert.equal(resumedExecutor.receipt.resumedFromRunId, failedExecutor.receipt.id);
  assert.equal(resumedExecutor.receipt.resumeAttempts.length, 1);
  assert.equal(resumedExecutor.receipt.resumeAttempts[0].stage, 'executor');
  assert.equal(resumedExecutor.receipt.resumeAttempts[0].status, 'completed');
  assert.equal(resumedExecutor.receipt.resumeStage, undefined);
  assert.deepEqual(resumedRoles, ['executor-resume', 'reviewer-resume']);
  assert.deepEqual(executorChunks, ['Recovered ', 'draft']);

  runtime.resetRuntimeStoreForTests();
  const failedReviewer = await collaboration.runCollaborativeAgent({
    agent: { ...agent, maxRevisionRounds: 0 },
    profiles: [planner, executor, reviewer],
    defaultProfile: fallback,
    messages: [{ role: 'user', content: 'Keep the completed draft.' }],
    timeoutMs: 1_000,
    attachments: [],
    includeVisionImages: false,
    transport: {
      async send(_profile, _messages, _timeout, _model, _attachments, _vision, context) {
        if (context.role === 'planner') {
          return { ok: true, status: 200, latencyMs: 1, content: '{"steps":[{"title":"Draft"},{"title":"Review"}]}' };
        }
        return { ok: false, status: 503, latencyMs: 1, errorMessage: 'Reviewer temporarily unavailable.' };
      },
      async stream(_profile, _messages, _timeout, _model, _attachments, _vision, callbacks) {
        callbacks.onDelta('Preserved draft');
        return { ok: true, status: 200, latencyMs: 1, content: 'Preserved draft' };
      },
    },
    callbacks: { onExecutorDelta() {} },
  });
  assert.equal(failedReviewer.ok, true);
  assert.equal(failedReviewer.receipt.phase, 'partial');
  assert.equal(failedReviewer.receipt.resumeStage, 'reviewer');
  assert.equal(failedReviewer.content, 'Preserved draft');

  let reviewerResumeCalls = 0;
  const resumedReviewer = await collaboration.resumeCollaborativeAgent({
    previousReceipt: failedReviewer.receipt,
    existingDraft: failedReviewer.content,
    agent: { ...agent, maxRevisionRounds: 0 },
    profiles: [planner, executor, reviewer],
    defaultProfile: fallback,
    messages: [{ role: 'user', content: 'Keep the completed draft.' }],
    timeoutMs: 1_000,
    attachments: [],
    includeVisionImages: false,
    transport: {
      async send(_profile, _messages, _timeout, _model, _attachments, _vision, context) {
        reviewerResumeCalls += 1;
        assert.equal(context.role, 'reviewer-resume');
        return { ok: true, status: 200, latencyMs: 1, content: '{"verdict":"pass","summary":"Draft is valid.","issues":[]}' };
      },
      async stream() {
        throw new Error('Executor must not rerun from a Reviewer checkpoint.');
      },
    },
    callbacks: { onExecutorDelta() {} },
  });
  assert.equal(reviewerResumeCalls, 1);
  assert.equal(resumedReviewer.ok, true);
  assert.equal(resumedReviewer.content, 'Preserved draft');
  assert.equal(resumedReviewer.receipt.phase, 'completed');
  assert.equal(resumedReviewer.receipt.reviewVerdict, 'pass');

  const exhausted = {
    ...failedExecutor.receipt,
    resumeAttempts: [
      { stage: 'executor', previousRunId: 'one', startedAt: '2026-07-19T00:00:00.000Z', status: 'failed' },
      { stage: 'executor', previousRunId: 'two', startedAt: '2026-07-19T00:01:00.000Z', status: 'failed' },
    ],
  };
  assert.equal(collaboration.canResumeAgentRun(exhausted), false);

  const visionCheckpoint = {
    ...failedExecutor.receipt,
    inputVisionAttachmentCount: 1,
  };
  await assert.rejects(
    collaboration.resumeCollaborativeAgent({
      previousReceipt: visionCheckpoint,
      existingDraft: '',
      agent,
      profiles: [planner, executor, reviewer],
      defaultProfile: fallback,
      messages: [{ role: 'user', content: 'Vision task.' }],
      timeoutMs: 1_000,
      attachments: [],
      includeVisionImages: false,
      callbacks: { onExecutorDelta() {} },
    }),
    /reattach the images/i,
  );
  runtime.resetRuntimeStoreForTests();
}

runWorkflowTest()
  .then(runRecoveryTests)
  .then(() => {
    console.log('v2.3 multi-model Agent collaboration, composer and checkpoint recovery tests passed');
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

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

runWorkflowTest().then(() => {
  console.log('v2.3 multi-model Agent collaboration tests passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

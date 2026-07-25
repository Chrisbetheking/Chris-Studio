const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const uiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(uiRoot, '../../..');
const buildRoot = path.join(repoRoot, '.tokenfence-test-build');
const session = require(path.join(buildRoot, 'features/projects/projectChangeSession.js'));

const plan = session.parseProjectCodingPlan(JSON.stringify({
  summary: 'Add transaction support',
  steps: [{ title: 'Inspect', detail: 'Read exact files' }, 'Generate patch', 'Run checks'],
  filesToRead: ['src/a.ts', 'src/b.ts'],
  checks: ['npm-typecheck', 'rm-rf', 'npm-test'],
  risks: ['Rollback must be complete'],
}));
assert.equal(plan.summary, 'Add transaction support');
assert.equal(plan.steps.length, 3);
assert.deepEqual(plan.filesToRead, ['src/a.ts', 'src/b.ts']);
assert.deepEqual(plan.checks, ['npm-typecheck', 'npm-test']);

const patch = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-old
+new

diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1 @@
+created

diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index 4444444..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1 +0,0 @@
-remove
`;
const files = session.parseUnifiedDiff(patch);
assert.deepEqual(files.map((entry) => [entry.path, entry.action]), [
  ['src/a.ts', 'modify'],
  ['src/new.ts', 'add'],
  ['src/old.ts', 'delete'],
]);
assert.equal(files[0].additions, 1);
assert.equal(files[0].deletions, 1);
const selected = session.composeSelectedPatch(files, ['src/new.ts']);
assert.match(selected, /diff --git a\/src\/new\.ts b\/src\/new\.ts/);
assert.doesNotMatch(selected, /src\/a\.ts/);
assert.doesNotMatch(selected, /src\/old\.ts/);
assert.ok(selected.endsWith('\n'));

const tree = [{
  path: 'src', name: 'src', kind: 'directory', size: 0, depth: 0, children: [
    { path: 'src/a.ts', name: 'a.ts', kind: 'file', size: 120, depth: 1 },
    { path: 'src/b.ts', name: 'b.ts', kind: 'file', size: 140, depth: 1 },
  ],
}, { path: 'package.json', name: 'package.json', kind: 'file', size: 300, depth: 0 }];
const context = session.chooseProjectContextFiles(tree, ['src/b.ts'], 'src/a.ts', 'update b typescript');
assert.deepEqual(context.slice(0, 3), ['src/a.ts', 'src/b.ts', 'package.json']);
assert.deepEqual(session.normalizeApprovedChecks(plan, true, false), ['npm-typecheck', 'npm-test']);

const review = session.parseProjectCodingReview('{"verdict":"block","summary":"Tests failed","issues":["Fix test"],"tested":["npm test failed"]}');
assert.equal(review.verdict, 'block');
assert.deepEqual(review.issues, ['Fix test']);

const projects = fs.readFileSync(path.join(uiRoot, 'src/screens/ProjectsScreen.tsx'), 'utf8');
const client = fs.readFileSync(path.join(uiRoot, 'src/features/projects/projectClient.ts'), 'utf8');
const rust = fs.readFileSync(path.join(repoRoot, 'apps/desktop/src-tauri/src/main.rs'), 'utf8');
for (const token of [
  'generateCodingProposal', 'applySelectedProposal', 'runSelectedChecks', 'runReviewer',
  'rollbackFiles', 'acceptRemaining', 'composeSelectedPatch', 'resolveAgentRoleProfiles',
  'unreadTargets', 'conflictingAdds', 'recoverPendingTransaction', 'sessionRollbackFiles',
  'Resolve the current applied transaction',
]) assert.ok(projects.includes(token), `ProjectsScreen is missing ${token}`);
for (const token of ['applyProjectChangeSession', 'loadLatestProjectChangeSession', 'rollbackProjectChangeSession', 'acceptProjectChangeSession']) {
  assert.ok(client.includes(token), `Project client is missing ${token}`);
}
assert.ok(rust.includes('git_numstat_exposes_hidden_traditional_sections'), 'Rust regression test for hidden traditional patch sections is missing');
assert.ok(rust.includes('detects_active_transaction_manifests'), 'Rust regression test for active transaction exclusion is missing');
for (const command of ['project_apply_change_session', 'project_latest_change_session', 'project_rollback_change_session', 'project_accept_change_session']) {
  assert.ok(rust.includes(command), `Rust command is missing ${command}`);
}
for (const boundary of [
  'Binary files and submodule changes are blocked',
  'The reviewed patch must begin with a diff --git section',
  'The paths Git would apply do not exactly match the reviewed diff --git sections',
  'Git reported an unsupported, renamed or ambiguous patch path',
  'Resolve the current applied project transaction before starting another one',
  'Only an active project transaction can be rolled back',
  'Only an active project transaction can be accepted',
  'Renames, copies and file-mode changes are not supported',
  '25 MB total backup limit',
  'Symlink, submodule and unsupported index modes are blocked',
  'changed after the Agent write. Rollback was blocked',
  'Explicit approval is required before rolling back',
]) assert.ok(rust.includes(boundary), `Rust safety boundary is missing: ${boundary}`);
assert.match(rust, /git"\)\s*\.args\(\["apply", "--check", "--whitespace=nowarn"\]\)/);
assert.match(projects, /Reviewer model is unavailable[\s\S]*will not switch models silently/);

const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/tokenfence-macos.yml'), 'utf8');
assert.match(workflow, /tauri build --bundles app --ci/);
assert.match(workflow, /cargo generate-lockfile --manifest-path apps\/desktop\/src-tauri\/Cargo\.toml/);
assert.match(workflow, /cargo check --locked --manifest-path apps\/desktop\/src-tauri\/Cargo\.toml/);
assert.match(workflow, /cargo test --locked --manifest-path apps\/desktop\/src-tauri\/Cargo\.toml project_change_tests/);
assert.ok(
  workflow.indexOf('cargo generate-lockfile --manifest-path apps/desktop/src-tauri/Cargo.toml') <
    workflow.indexOf('cargo check --locked --manifest-path apps/desktop/src-tauri/Cargo.toml'),
  'Rust lockfile synchronization must run before locked native checks.',
);
assert.match(workflow, /prerelease: \$\{\{ contains\(inputs\.version, '-'\) \}\}/);
assert.match(workflow, /make_latest: \$\{\{ !contains\(inputs\.version, '-'\) && inputs\.make_latest \}\}/);

console.log('v2.3 alpha.4 transactional coding session tests passed');

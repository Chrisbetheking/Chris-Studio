const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const uiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(uiRoot, '../../..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

const runtimeStore = read('apps/desktop/ui/src/features/agent-runtime/runtimeStore.ts');
const dock = read('apps/desktop/ui/src/components/ReliabilityDock.tsx');
const computerScreen = read('apps/desktop/ui/src/screens/ComputerScreen.tsx');
const computerReliable = read('apps/desktop/ui/src/features/computer/computerClientReliable.ts');
const projects = read('apps/desktop/ui/src/screens/ProjectsScreen.tsx');
const connectors = read('apps/desktop/ui/src/screens/ConnectorsScreen.tsx');
const skills = read('apps/desktop/ui/src/screens/SkillsScreen.tsx');
const rust = read('apps/desktop/src-tauri/src/main.rs');

assert.match(runtimeStore, /parentId\?: string/);
assert.match(runtimeStore, /archiveRuntimeRun/);
assert.match(runtimeStore, /acknowledgeRuntimeRun/);
assert.match(dock, /当前任务/);
assert.match(dock, /最近完成/);
assert.match(dock, /需要处理/);
assert.match(dock, /已归档/);
assert.match(computerReliable, /withComputerRuntimeParent/);
assert.match(computerScreen, /withComputerRuntimeParent\(agentSessionRunIdRef\.current/);

for (const token of ['projectGitStatus', 'projectGitDiff', 'createGitHubPullRequest', 'backupPath']) {
  assert.ok(projects.includes(token), `ProjectsScreen must preserve ${token}`);
}
assert.match(connectors, /tools\/call/);
assert.match(connectors, /window\.confirm/);
assert.match(skills, /permission/i);

for (const command of [
  'project_choose_folder', 'project_scan', 'project_read_file', 'project_write_file',
  'project_run_preset', 'github_create_pull_request', 'mcp_request',
  'computer_capture_screen', 'computer_open_application', 'computer_type_text',
]) {
  assert.ok(rust.includes(command), `Rust command missing: ${command}`);
}

console.log('v2.2 final closeout capability contracts passed');

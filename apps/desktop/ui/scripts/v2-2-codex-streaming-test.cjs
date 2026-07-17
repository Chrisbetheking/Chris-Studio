const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const uiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(uiRoot, '../../..');
const buildRoot = path.join(repoRoot, '.tokenfence-test-build');

function loadCompiled(relative) {
  const candidates = [path.join(buildRoot, relative), path.join(buildRoot, 'src', relative)];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`Cannot find compiled module: ${candidates.join(', ')}`);
  return require(found);
}

const { parseModelComputerAction } = loadCompiled('features/computer-use/modelComputerProtocol.js');

assert.deepEqual(
  parseModelComputerAction('{"action":"open","app":"TextEdit","reason":"Create a document"}', false),
  {
    action: 'open',
    reason: 'Create a document',
    app: 'TextEdit',
    x: undefined,
    y: undefined,
    text: undefined,
    key: undefined,
    message: undefined,
  },
);
assert.equal(
  parseModelComputerAction('```json\n{"action":"click","x":120,"y":220,"reason":"Visible button"}\n```', true).action,
  'click',
);
assert.throws(
  () => parseModelComputerAction('{"action":"click","x":1,"y":2,"reason":"Guess"}', false),
  /vision-capable/i,
);
assert.throws(
  () => parseModelComputerAction('{"action":"open","app":"Unknown App","reason":"No"}', true),
  /allowlist/i,
);
assert.throws(
  () => parseModelComputerAction('{"action":"key","key":"cmd+q","reason":"No"}', true),
  /key outside the allowlist/i,
);

const providerClient = fs.readFileSync(path.join(uiRoot, 'src/features/providers/providerClient.ts'), 'utf8');
assert.match(providerClient, /listen<ProviderStreamEvent>\('chris-studio:\/\/provider-stream'/);
assert.match(providerClient, /invoke<ProviderReply>\('provider_chat_stream'/);
assert.match(providerClient, /provider_stream_cancel/);
assert.match(providerClient, /Promise\.race\(\[invokeReply, abortReply\]\)/);
assert.match(providerClient, /maxTokens: 8192/);

const reliableProvider = fs.readFileSync(path.join(uiRoot, 'src/features/providers/providerClientReliable.ts'), 'utf8');
assert.match(reliableProvider, /Never reconnect after visible output/);
assert.match(reliableProvider, /sendProviderChatStreamBase/);
assert.match(reliableProvider, /beginRuntimeRun\(\{[\s\S]*kind: "provider"/);

const workspace = fs.readFileSync(path.join(uiRoot, 'src/screens/WorkspaceScreen.tsx'), 'utf8');
assert.match(workspace, /sendProviderChatStream/);
assert.match(workspace, /onDelta:\s*\(delta\)/);
assert.match(workspace, /Scans after send/);
assert.match(workspace, /stopCurrentRequest/);
assert.equal((workspace.match(/scanPayload\(prompt, attachments/g) || []).length, 1, 'The real payload must be scanned only by the Send action.');

const app = fs.readFileSync(path.join(uiRoot, 'src/App.tsx'), 'utf8');
assert.match(app, /<LanguageSwitcher/);
assert.match(app, /<RecentConversations/);


const settingsScreen = fs.readFileSync(path.join(uiRoot, 'src/screens/SettingsScreen.tsx'), 'utf8');
assert.doesNotMatch(settingsScreen, /Live scan|实时扫描/);
assert.match(settingsScreen, /Open inspector for findings/);

const store = fs.readFileSync(path.join(uiRoot, 'src/app/store.ts'), 'utf8');
assert.match(store, /autoOpenInspector: false/);

const computerScreen = fs.readFileSync(path.join(uiRoot, 'src/screens/ComputerScreen.tsx'), 'utf8');
assert.match(computerScreen, /runModelAgent/);
assert.match(computerScreen, /maxSteps = 8/);
assert.match(computerScreen, /Emergency stop/);
assert.match(computerScreen, /window\.confirm/);

const rust = fs.readFileSync(path.join(repoRoot, 'apps/desktop/src-tauri/src/main.rs'), 'utf8');
assert.match(rust, /"stream": true/);
assert.match(rust, /text\/event-stream/);
assert.match(rust, /reasoning_content/);
assert.match(rust, /async fn provider_chat_stream/);
assert.match(rust, /tauri::async_runtime::spawn_blocking/);
assert.match(rust, /fn provider_stream_cancel/);
assert.match(rust, /provider_chat_stream,\s*provider_stream_cancel/s);

console.log('v2.2 Codex layout, streaming and model Computer Use tests passed');

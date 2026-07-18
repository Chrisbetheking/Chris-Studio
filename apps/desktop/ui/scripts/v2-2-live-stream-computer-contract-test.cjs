const fs = require('node:fs');
const path = require('node:path');

const uiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(uiRoot, '../../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function expect(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const workspace = read('apps/desktop/ui/src/screens/WorkspaceScreen.tsx');
expect(workspace, /if \(!openConversationId \|\| conversation\?\.id === openConversationId\) return;/,
  'Workspace must not reload and erase the current in-memory streaming conversation.');
expect(workspace, /if \(settings\.localHistoryEnabled\) saveConversation\(pending\);/,
  'Pending user messages must be persisted before the shell selects the new conversation.');
expect(workspace, /const empty = !conversation\?\.messages\.length && !sending;/,
  'The home screen must not cover the live assistant bubble while a request is running.');

const modelAgent = read('apps/desktop/ui/src/features/computer-use/modelComputerAgent.ts');
expect(modelAgent, /from '\.\.\/providers\/providerClient';/,
  'Computer Use planner calls must be folded into the parent session instead of creating a runtime card for every planning turn.');

const computerScreen = read('apps/desktop/ui/src/screens/ComputerScreen.tsx');
const rust = read('apps/desktop/src-tauri/src/main.rs');
expect(computerScreen, /function goalContractActions\(/,
  'Computer Use must build a deterministic safety contract for known open-and-type goals.');
expect(computerScreen, /requiredContractAction\(goal, observations\)/,
  'Computer Use must enforce missing goal actions before accepting model completion.');
expect(computerScreen, /computer-agent-progress/,
  'Computer Use must expose visible per-step progress.');
expect(computerScreen, /beginRuntimeRun\(\{[\s\S]*action: 'model-session'/,
  'Computer Use must publish one coherent parent runtime session.');


expect(computerScreen, /if \(required \|\| sameFailureCount >= 2\)/,
  'A deterministic Computer Use failure must stop instead of consuming all eight steps.');
expect(computerScreen, /computer-agent-progress-inline/,
  'Computer Use progress must remain visible in the main task panel.');
expect(rust, /screen_capture_verified/,
  'A successful real capture must override stale macOS preflight state for the current process.');
expect(rust, /let preflight_ok = macos_screen_capture_authorized\(\);[\s\S]*Command::new\("\/usr\/sbin\/screencapture"\)/,
  'Screen capture must verify the real helper result instead of failing only on stale preflight state.');

const sessionGuard = read('apps/desktop/ui/src/features/computer-use/sessionGuard.ts');
expect(sessionGuard, /ComputerActionKind = "screenshot" \| "open"/,
  'Opening an application must use the same one-time approval guard as other desktop actions.');

const reliableComputer = read('apps/desktop/ui/src/features/computer/computerClientReliable.ts');
expect(reliableComputer, /export const openApplication:/,
  'Reliable Computer Use adapter must wrap application launches.');

expect(rust, /Command::new\("\/usr\/bin\/open"\)[\s\S]*?\.args\(\["-b", "com\.apple\.TextEdit"\]\)/,
  'TextEdit must be launched by bundle identifier before document automation.');
expect(rust, /tell application id "com\.apple\.TextEdit"[\s\S]*make new document/,
  'TextEdit launch must create an untitled document through its stable bundle identifier.');
expect(rust, /keystroke "n" using command down/,
  'TextEdit launch must retain an Accessibility Cmd+N fallback.');
expect(rust, /tell application id "com\.apple\.TextEdit"[\s\S]*set text of front document to currentText & \(item 1 of argv\)/,
  'Approved TextEdit typing must target the front document directly.');

console.log('V2_2_LIVE_STREAM_COMPUTER_CONTRACT_PASSED');

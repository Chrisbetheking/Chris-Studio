const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {
  synchronizeAppText,
  synchronizeReliabilityAppText,
  synchronizeWorkspaceRuntimeAdapters,
  synchronizeComputerScreenRuntimeAdapter,
} = require('./sync-product-metadata.cjs');

const appFixture = `import { ToastProvider } from './components/Toast';
import chrisStudioLogo from './assets/chris-studio-logo.png';
const footer = 'v2.1.0 · macOS';
function ChrisStudioApp() { return <main />; }
export function App() {
  return <ToastProvider><ChrisStudioApp /></ToastProvider>;
}
`;

const workspaceFixture = `import { sendProviderChat } from '../features/providers/providerClient';
import { captureScreen, clickPointer } from '../features/computer/computerClient';
export function WorkspaceScreen() { return null; }
`;

const versioned = synchronizeAppText(appFixture, '2.2.0');
const mounted = synchronizeReliabilityAppText(versioned);
assert.match(mounted, /v2\.2\.0 · macOS/);
assert.match(mounted, /import \{ ReliabilityDock \} from '\.\/components\/ReliabilityDock';/);
assert.match(mounted, /<ChrisStudioApp\s*\/>[\s\S]*<ReliabilityDock\s*\/>/);
assert.equal((mounted.match(/import \{ ReliabilityDock \}/g) || []).length, 1, 'Exactly one reliability dock import is expected.');
assert.equal((mounted.match(/<ReliabilityDock\s*\/>/g) || []).length, 1, 'Exactly one mounted reliability dock is expected.');
assert.equal(synchronizeReliabilityAppText(mounted), mounted, 'App integration must be idempotent.');

const adapted = synchronizeWorkspaceRuntimeAdapters(workspaceFixture);
assert.ok(adapted.includes('../features/providers/providerClientReliable'));
assert.ok(adapted.includes('../features/computer/computerClientReliable'));
assert.ok(!adapted.includes("from '../features/providers/providerClient'"));
assert.ok(!adapted.includes("from '../features/computer/computerClient'"));
assert.equal(synchronizeWorkspaceRuntimeAdapters(adapted), adapted, 'Workspace adapter integration must be idempotent.');

const computerScreenFixture = `import { captureScreen } from '../features/computer/computerClient';
export function ComputerScreen() { return null; }
`;
const computerAdapted = synchronizeComputerScreenRuntimeAdapter(computerScreenFixture);
assert.ok(computerAdapted.includes('../features/computer/computerClientReliable'));
assert.equal(synchronizeComputerScreenRuntimeAdapter(computerAdapted), computerAdapted);


const reliableComputerClient = fs.readFileSync(
  path.join(__dirname, '../src/features/computer/computerClientReliable.ts'),
  'utf8',
);
assert.match(
  reliableComputerClient,
  /export \* from ["']\.\/computerClient["'];/,
  'The reliable adapter must forward untouched computerClient exports such as openApplication.',
);
assert.match(reliableComputerClient, /action,\s*timestamp: Date\.now\(\)/s);

console.log('v2.2 workspace reliability integration tests passed');

// Regression tests: the connector console must recover from a failed native call.
//
// `ConnectorsScreen.run()` set `busy` before awaiting `callMcp` and cleared it
// only on the success path. A rejected native call (the bridge returns `Err`
// when a command is unavailable, or the IPC itself fails) therefore left `busy`
// set forever: the Run button stayed disabled and the screen looked frozen with
// no message. The same shape existed in `save()` (a rejected credential write
// aborted the save silently) and `remove()` (a missing credential entry blocked
// deleting the connector).
//
// The checks below pin the control flow statically — the component is JSX and is
// exercised through the real UI in the app — and exercise `mcpClient`'s
// non-desktop branches behaviourally.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const SCREEN = 'apps/desktop/ui/src/screens/ConnectorsScreen.tsx';
const CLIENT = 'apps/desktop/ui/src/features/connectors/mcpClient.ts';

const screenSource = fs.readFileSync(path.join(repoRoot, SCREEN), 'utf8');

// --- 1. run(): busy must be cleared on every path ------------------------
assert.match(screenSource, /setBusy\(true\);/, 'the run action must mark itself busy');
assert.match(screenSource, /finally \{\s*\n\s*setBusy\(false\);\s*\n\s*\}/, 'busy must be cleared in a finally block');
assert.match(screenSource, /catch \(cause\) \{/, 'a rejected run must be caught');
assert.match(screenSource, /setResult\(\{ ok: false, status: 0, errorCode: 'BRIDGE_FAILED'/, 'a rejected run must surface a failure result');
assert.match(screenSource, /toast\.show\(message, 'error'\)/, 'a rejected run must explain itself');
// The confirmation gate must still run before the request is sent.
assert.match(screenSource, /const confirmed = method !== 'tools\/call' \|\| window\.confirm\(/, 'the approval gate must stay before the call');
assert.match(screenSource, /if \(!confirmed\) return;/, 'a declined approval must abort the request');
assert.match(screenSource, /callMcp\(draft, method, params, confirmed\)/, 'the confirmation must be forwarded to the native command');
// Only one setBusy(false) in the success path: the finally owns the reset.
const busyResets = (screenSource.match(/setBusy\(false\)/g) || []).length;
assert.equal(busyResets, 1, 'busy is cleared in exactly one place');

// --- 2. save(): a rejected credential write must be reported ------------
assert.match(
  screenSource,
  /const secret = await saveConnectorSecret\(draft\.id, draft\.token\.trim\(\)\);\s*\n\s*if \(!secret\.ok\) return toast\.show/,
  'a refused credential write is reported',
);
assert.match(
  screenSource,
  /catch \(cause\) \{[\s\S]{0,400}?return toast\.show\(cause instanceof Error \? cause\.message : String\(cause\), 'error'\)/,
  'a rejected credential write is reported instead of aborting silently',
);

// --- 3. remove(): a missing credential must not block the delete ---------
assert.match(
  screenSource,
  /try \{\s*\n\s*await deleteConnectorSecret\(selected\.id\);\s*\n\s*\} catch \{[\s\S]{0,200}?\}\s*\n\s*deleteToolConnector\(selected\.id\);/,
  'the connector is deleted even when its credential entry is absent',
);

// --- 4. the approval gate and allowlist copy must stay visible ----------
assert.match(screenSource, /Tool calls always require explicit approval\./, 'the English approval promise must stay');
assert.match(screenSource, /工具调用始终需要明确确认。/, 'the Chinese approval promise must stay');
assert.match(screenSource, /disabled=\{busy \|\| !draft\.enabled\}/, 'the run button stays disabled while busy or unused');

// --- 5. mcpClient behaves safely outside the desktop runtime -----------
function loadClient() {
  const target = path.join(repoRoot, CLIENT);
  const output = ts.transpileModule(fs.readFileSync(target, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier === '@tauri-apps/api/tauri') {
      return { invoke: async () => { throw new Error('native bridge unavailable'); } };
    }
    if (specifier.startsWith('.')) {
      const base = path.resolve(path.dirname(target), specifier);
      for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
        if (!fs.existsSync(candidate)) continue;
        const nested = ts.transpileModule(fs.readFileSync(candidate, 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
        }).outputText;
        const nestedModule = { exports: {} };
        new Function('exports', 'require', 'module', '__filename', '__dirname', nested)(
          nestedModule.exports,
          () => ({}),
          nestedModule,
          candidate,
          path.dirname(candidate),
        );
        return nestedModule.exports;
      }
    }
    throw new Error(`Cannot resolve ${specifier}`);
  };
  new Function('exports', 'require', 'module', '__filename', '__dirname', output)(
    module.exports,
    localRequire,
    module,
    target,
    path.dirname(target),
  );
  return module.exports;
}

// No `window.__TAURI__`, so the client reports "desktop runtime required"
// instead of invoking a command that does not exist in the browser preview.
globalThis.window = globalThis.window ?? {};

(async () => {
  const client = loadClient();
  const profile = {
    id: 'connector-1',
    name: 'Test connector',
    url: 'https://example.invalid/mcp',
    enabled: true,
    requiresCredential: false,
    credentialStored: false,
    token: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const reply = await client.callMcp(profile, 'tools/list', {});
  assert.equal(reply.ok, false, 'a browser preview cannot call an MCP endpoint');
  assert.equal(reply.errorCode, 'DESKTOP_REQUIRED', 'the refusal names the missing runtime');
  assert.match(String(reply.errorMessage), /desktop runtime/i, 'the refusal explains itself');
  assert.equal(typeof reply.latencyMs, 'number', 'the reply keeps the documented shape');

  const saved = await client.saveConnectorSecret('connector-1', 'secret-value');
  assert.equal(saved.ok, false, 'a browser preview cannot store a credential');
  assert.match(String(saved.errorMessage), /desktop runtime/i);

  const deleted = await client.deleteConnectorSecret('connector-1');
  assert.equal(deleted.ok, true, 'deleting is a no-op outside the desktop runtime');
  assert.equal(deleted.hasValue, false, 'nothing is reported as stored');

  // The allowlist is declared in the client and enforced again natively.
  assert.match(
    fs.readFileSync(path.join(repoRoot, CLIENT), 'utf8'),
    /'initialize' \| 'tools\/list' \| 'resources\/list' \| 'prompts\/list' \| 'tools\/call'/,
    'the client keeps the MCP method union',
  );

  console.log('CHRIS_STUDIO_V2_4_CONNECTOR_RESILIENCE_PASSED');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// Regression tests: the GitHub client must resolve instead of rejecting.
//
// `getGitHubRepository`, `listGitHubIssues` and `createGitHubPullRequest` invoked
// their native command with no runtime guard and no catch, while the project
// screen awaited them in a plain sequence:
//
//   const [repo, repoIssues] = await Promise.all([getGitHubRepository(...), listGitHubIssues(...)]);
//
// In the browser preview (or when the bridge itself failed) the rejection escaped
// and the connect flow stopped mid-way with no message, leaving the user staring
// at a half-connected screen. The token helpers had a guard but still let a
// refused credential write reject.
//
// The client now resolves every path with the documented failure shape.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const CLIENT = 'apps/desktop/ui/src/features/github/githubClient.ts';

/**
 * Compile the client with a controllable native bridge.
 *
 * `invoke` rejects when `rejectInvoke` is set, which stands in for a native
 * command that fails or an IPC error — exactly the case that used to escape.
 */
function loadClient({ tauriPresent = false, rejectInvoke = false } = {}) {
  const target = path.join(repoRoot, CLIENT);
  const output = ts.transpileModule(fs.readFileSync(target, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const windowStub = tauriPresent ? { __TAURI__: {} } : {};
  const localRequire = (specifier) => {
    if (specifier === '@tauri-apps/api/tauri') {
      return {
        invoke: async (command) => {
          if (rejectInvoke) throw new Error(`bridge refused ${command}`);
          // A minimal well-formed reply per command family.
          if (command === 'github_connection_test') return { ok: true, login: 'tester' };
          if (command === 'github_repository_overview') return { ok: true, fullName: 'owner/repo' };
          if (command === 'github_issue_list') return [{ number: 1, title: 'an issue', state: 'open', url: 'https://example.invalid/1' }];
          if (command === 'github_create_pull_request') return { ok: true, number: 7, url: 'https://example.invalid/pr/7' };
          if (command === 'github_token_save') return { ok: true, hasValue: true };
          if (command === 'github_token_delete') return { ok: true, hasValue: false };
          return { ok: true, hasValue: false };
        },
      };
    }
    if (specifier.startsWith('.')) {
      const base = path.resolve(path.dirname(target), specifier);
      for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
        if (!fs.existsSync(candidate)) continue;
        const nested = ts.transpileModule(fs.readFileSync(candidate, 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
        }).outputText;
        const nestedModule = { exports: {} };
        // Only the runtime probe is needed from the sibling modules.
        const nestedRequire = (inner) => {
          if (inner === '@tauri-apps/api/tauri') return { invoke: async () => undefined };
          return {};
        };
        new Function('exports', 'require', 'window', 'module', '__filename', '__dirname', nested)(
          nestedModule.exports,
          nestedRequire,
          windowStub,
          nestedModule,
          candidate,
          path.dirname(candidate),
        );
        return nestedModule.exports;
      }
    }
    throw new Error(`Cannot resolve ${specifier}`);
  };
  globalThis.window = windowStub;
  new Function('exports', 'require', 'window', 'module', '__filename', '__dirname', output)(
    module.exports,
    localRequire,
    windowStub,
    module,
    target,
    path.dirname(target),
  );
  return module.exports;
}

(async () => {
  // --- 1. the browser preview must resolve every reader -------------------
  {
    const client = loadClient({ tauriPresent: false });
    const repo = await client.getGitHubRepository('owner', 'repo');
    assert.equal(repo.ok, false, 'a browser preview cannot read repository metadata');
    assert.match(String(repo.errorMessage), /desktop runtime/i, 'the refusal names the missing runtime');

    const issues = await client.listGitHubIssues('owner', 'repo');
    assert.deepEqual(issues, [], 'the issue list reads as empty outside the desktop runtime');

    const pr = await client.createGitHubPullRequest({
      owner: 'owner', repo: 'repo', title: 'A title', body: '', head: 'feat', base: 'main', confirmed: true,
    });
    assert.equal(pr.ok, false, 'a browser preview cannot open a Pull Request');
    assert.match(String(pr.errorMessage), /desktop runtime/i);

    const connection = await client.testGitHubConnection();
    assert.equal(connection.ok, false);
    assert.match(String(connection.errorMessage), /desktop runtime/i);

    const saved = await client.saveGitHubToken('a-token-value-long-enough');
    assert.equal(saved.ok, false, 'a browser preview cannot store a token');
    const deleted = await client.deleteGitHubToken();
    assert.equal(deleted.ok, true, 'deleting is a no-op outside the desktop runtime');
  }

  // --- 2. a failing bridge must resolve with the failure shape -----------
  {
    const client = loadClient({ tauriPresent: true, rejectInvoke: true });

    let repo;
    let threw = null;
    try {
      repo = await client.getGitHubRepository('owner', 'repo');
    } catch (error) {
      threw = String(error && error.message);
    }
    assert.equal(threw, null, 'a refused repository read must not reject');
    assert.equal(repo.ok, false, 'a refused repository read reports failure');
    assert.match(String(repo.errorMessage), /bridge refused github_repository_overview/, 'the refusal explains itself');

    const issues = await client.listGitHubIssues('owner', 'repo');
    assert.deepEqual(issues, [], 'a refused issue list resolves as empty so the connect flow can finish');

    const pr = await client.createGitHubPullRequest({
      owner: 'owner', repo: 'repo', title: 'A title', body: '', head: 'feat', base: 'main', confirmed: true,
    });
    assert.equal(pr.ok, false, 'a refused Pull Request resolves with a failure result');
    assert.match(String(pr.errorMessage), /bridge refused github_create_pull_request/);

    const saved = await client.saveGitHubToken('a-token-value-long-enough');
    assert.equal(saved.ok, false, 'a refused token write resolves with a failure result');
    assert.match(String(saved.message), /bridge refused github_token_save/);

    const deleted = await client.deleteGitHubToken();
    assert.equal(deleted.ok, false, 'a refused token delete resolves with a failure result');

    const connection = await client.testGitHubConnection();
    assert.equal(connection.ok, false);
    assert.match(String(connection.errorMessage), /bridge refused github_connection_test/);
  }

  // --- 3. the happy path still returns the native payload ----------------
  {
    const client = loadClient({ tauriPresent: true, rejectInvoke: false });
    const repo = await client.getGitHubRepository('owner', 'repo');
    assert.equal(repo.ok, true);
    assert.equal(repo.fullName, 'owner/repo');

    const issues = await client.listGitHubIssues('owner', 'repo');
    assert.equal(issues.length, 1);
    assert.equal(issues[0].number, 1);

    const pr = await client.createGitHubPullRequest({
      owner: 'owner', repo: 'repo', title: 'A title', body: '', head: 'feat', base: 'main', confirmed: true,
    });
    assert.equal(pr.ok, true);
    assert.equal(pr.number, 7);

    const connection = await client.testGitHubConnection();
    assert.equal(connection.ok, true);
    assert.equal(connection.login, 'tester');

    const saved = await client.saveGitHubToken('a-token-value-long-enough');
    assert.equal(saved.ok, true);
  }

  // --- 4. a non-array issue payload must not break the caller ------------
  {
    const target = path.join(repoRoot, CLIENT);
    const output = ts.transpileModule(fs.readFileSync(target, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} };
    globalThis.window = { __TAURI__: {} };
    new Function('exports', 'require', 'window', 'module', '__filename', '__dirname', output)(
      module.exports,
      (specifier) => {
        if (specifier === '@tauri-apps/api/tauri') {
          return { invoke: async () => ({ ok: true, unexpected: 'shape' }) };
        }
        if (specifier.startsWith('.')) {
          const base = path.resolve(path.dirname(target), specifier);
          for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
            if (fs.existsSync(candidate)) {
              const nested = ts.transpileModule(fs.readFileSync(candidate, 'utf8'), {
                compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
              }).outputText;
              const nestedModule = { exports: {} };
              new Function('exports', 'require', 'window', 'module', '__filename', '__dirname', nested)(
                nestedModule.exports,
                () => ({}),
                globalThis.window,
                nestedModule,
                candidate,
                path.dirname(candidate),
              );
              return nestedModule.exports;
            }
          }
        }
        throw new Error(`Cannot resolve ${specifier}`);
      },
      globalThis.window,
      module,
      target,
      path.dirname(target),
    );
    const issues = await module.exports.listGitHubIssues('owner', 'repo');
    assert.ok(Array.isArray(issues), 'a malformed issue payload still reads as a list');
    assert.deepEqual(issues, [], 'a malformed issue payload yields an empty list');
  }

  // --- 5. the implementation must keep its guards -------------------------
  const source = fs.readFileSync(path.join(repoRoot, CLIENT), 'utf8');
  assert.match(source, /const DESKTOP_REQUIRED = 'Desktop runtime required\.';/, 'the runtime message must stay declared');
  assert.match(source, /function bridgeFailure\(cause: unknown\): string/, 'the bridge failure helper must stay present');
  for (const name of [
    'saveGitHubToken',
    'deleteGitHubToken',
    'testGitHubConnection',
    'getGitHubRepository',
    'listGitHubIssues',
    'createGitHubPullRequest',
  ]) {
    assert.match(source, new RegExp(`export async function ${name}`), `${name} must stay exported`);
  }
  // Every exported command must be guarded by the runtime probe.
  const guards = (source.match(/if \(!isDesktopRuntime\(\)\)/g) || []).length;
  assert.equal(guards, 6, 'every exported helper keeps its runtime guard');
  // And every native call must sit inside a try/catch.
  const catches = (source.match(/catch \(cause\) \{/g) || []).length;
  assert.equal(catches, 5, 'five helpers report the cause; the issue reader swallows it by design');
  assert.doesNotMatch(
    source,
    /export async function getGitHubRepository\(owner: string, repo: string\): Promise<GitHubRepositoryOverview> \{\s*\n\s*return await invoke/,
    'the unguarded repository read must not return',
  );

  console.log('CHRIS_STUDIO_V2_4_GITHUB_CLIENT_RESILIENCE_PASSED');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

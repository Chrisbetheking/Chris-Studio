// Regression tests: the remembered active project must be a usable record.
//
// `loadActiveProject` cast whatever JSON was in the slot straight to
// `RecentProject` while `loadRecentProjects` ran the same data through a repair
// pass. A stored number, an empty object, a string, an array or an entry without
// a path therefore came back as an "ActiveProject" whose `path` was undefined,
// and the project screen threw on `path.trim()`. Values that cannot describe a
// real folder must be repaired or rejected.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const ACTIVE_KEY = 'tokenfence.activeProject';
const RECENT_KEY = 'tokenfence.recentProjects';

// The module imports `@tokenfence/shared/src/agent-runtime/safeStorage`, which
// reads `globalThis.localStorage`; mocking exactly that exercises the real
// persistence path rather than the in-memory fallback.
let backing = new Map();
globalThis.localStorage = {
  getItem: (key) => (backing.has(key) ? backing.get(key) : null),
  setItem: (key, value) => { backing.set(key, String(value)); },
  removeItem: (key) => { backing.delete(key); },
};

const compiledCache = new Map();

function resolveSpecifier(fromDir, specifier) {
  let base;
  if (specifier.startsWith('@tokenfence/shared/')) {
    base = path.join(repoRoot, 'packages/shared', specifier.slice('@tokenfence/shared/'.length));
  } else if (specifier.startsWith('.')) {
    base = path.resolve(fromDir, specifier);
  } else {
    throw new Error(`Unexpected external dependency: ${specifier}`);
  }
  for (const candidate of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Cannot resolve ${specifier} from ${fromDir}`);
}

function loadCompiled(filePath) {
  if (compiledCache.has(filePath)) return compiledCache.get(filePath);
  const output = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => loadCompiled(resolveSpecifier(path.dirname(filePath), specifier));
  new Function('exports', 'require', 'module', '__filename', '__dirname', output)(
    module.exports,
    localRequire,
    module,
    filePath,
    path.dirname(filePath),
  );
  compiledCache.set(filePath, module.exports);
  return module.exports;
}

const workspace = loadCompiled(path.join(repoRoot, 'apps/desktop/ui/src/data/project-workspace.ts'));
const reset = () => { backing = new Map(); };

// --- 1. a valid record round-trips untouched ------------------------------
reset();
const saved = { id: 'p1', name: 'Demo Project', path: '/tmp/demo', lastOpenedAt: 1, pinned: true, favorite: true };
workspace.setActiveProject(saved);
const loaded = workspace.loadActiveProject();
assert.equal(loaded.id, 'p1');
assert.equal(loaded.name, 'Demo Project');
assert.equal(loaded.path, '/tmp/demo');
assert.equal(loaded.pinned, true);
assert.equal(loaded.favorite, true);

// --- 2. unusable stored values must all be rejected ----------------------
const REJECTED = [
  ['null', 'null'],
  ['a number', '42'],
  ['a string', '"oops"'],
  ['a boolean', 'true'],
  ['an empty object', '{}'],
  ['an entry without a path', JSON.stringify({ id: 'x', name: 'NoPath' })],
  ['a blank path', JSON.stringify({ id: 'x', name: 'Empty', path: '   ' })],
  ['a null path', JSON.stringify({ id: 'x', name: 'NullPath', path: null })],
  ['an array', '[1,2,3]'],
  ['malformed JSON', '{not json'],
];
for (const [label, raw] of REJECTED) {
  reset();
  globalThis.localStorage.setItem(ACTIVE_KEY, raw);
  let result;
  let threw = null;
  try {
    result = workspace.loadActiveProject();
  } catch (error) {
    threw = String(error && error.message);
  }
  assert.equal(threw, null, `${label} must not make the loader throw`);
  assert.equal(result, null, `${label} must be rejected rather than returned as an ActiveProject`);
}

// An empty slot is simply "nothing remembered".
reset();
assert.equal(workspace.loadActiveProject(), null);
reset();
globalThis.localStorage.setItem(ACTIVE_KEY, '');
assert.equal(workspace.loadActiveProject(), null, 'an empty string must read as no active project');

// --- 3. legacy field names are still repaired ----------------------------
reset();
globalThis.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ id: 'old', name: 'Legacy', folderPath: '/tmp/legacy' }));
assert.equal(workspace.loadActiveProject()?.path, '/tmp/legacy', 'the legacy folderPath must be repaired to path');

reset();
globalThis.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ projectPath: '/tmp/other' }));
assert.equal(workspace.loadActiveProject()?.path, '/tmp/other', 'the legacy projectPath must be repaired to path');

// --- 4. missing metadata is filled in ------------------------------------
reset();
globalThis.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ path: '/Users/me/My Project' }));
const partial = workspace.loadActiveProject();
assert.ok(partial, 'a record carrying only a path must still be usable');
assert.equal(typeof partial.id, 'string');
assert.ok(partial.id.length > 0, 'a missing id must be generated');
assert.equal(partial.name, 'My Project', 'a missing name must come from the folder name');
assert.equal(typeof partial.lastOpenedAt, 'number', 'a missing timestamp must be numeric');
assert.equal(typeof partial.pinned, 'boolean', 'a missing pin flag must be boolean');
assert.equal(typeof partial.favorite, 'boolean', 'a missing favourite flag must be boolean');

// --- 5. every accepted record exposes a trimmable path -------------------
reset();
const ACCEPTED = [
  '42',
  '{}',
  '[]',
  JSON.stringify({ path: '  /tmp/x  ' }),
  JSON.stringify({ folderPath: '/tmp/y' }),
  JSON.stringify({ path: '/tmp/z', id: '', name: '' }),
];
for (const raw of ACCEPTED) {
  reset();
  globalThis.localStorage.setItem(ACTIVE_KEY, raw);
  const result = workspace.loadActiveProject();
  if (result === null) continue;
  assert.equal(typeof result.path, 'string', `an accepted record must expose a string path: ${raw}`);
  assert.doesNotThrow(() => result.path.trim(), `an accepted path must be trimmable: ${raw}`);
  assert.ok(result.path.trim().length > 0, `an accepted path must not be blank: ${raw}`);
}
// The whitespace-padded path is trimmed when repaired.
reset();
globalThis.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ path: '  /tmp/x  ' }));
assert.equal(workspace.loadActiveProject()?.path, '/tmp/x');

// --- 6. a mojibake name is regenerated from the path ---------------------
reset();
globalThis.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ path: '/Users/me/Real Folder', name: 'â€™â€™â€™â€™â€™â€™' }));
const repaired = workspace.loadActiveProject();
assert.equal(repaired?.name, 'Real Folder', 'a corrupted name must be regenerated from the folder name');

// --- 7. clearing removes the record --------------------------------------
reset();
workspace.setActiveProject(saved);
assert.ok(workspace.loadActiveProject(), 'the record must be readable after saving');
workspace.clearActiveProject();
assert.equal(workspace.loadActiveProject(), null, 'clearing must remove the active project');

// --- 8. the recent-projects list keeps its own guarantees ---------------
reset();
workspace.addRecentProject({ name: 'Alpha', path: '/tmp/alpha' });
workspace.addRecentProject({ name: 'Beta', path: '/tmp/beta' });
const recent = workspace.loadRecentProjects();
assert.equal(recent.length, 2);
assert.ok(recent.every((entry) => typeof entry.path === 'string' && entry.path.length > 0));
reset();
globalThis.localStorage.setItem(RECENT_KEY, JSON.stringify([null, 'garbage', { id: 'no-path' }, { path: '/tmp/kept' }]));
const repairedRecent = workspace.loadRecentProjects();
assert.equal(repairedRecent.length, 1, 'unusable recent entries must be dropped');
assert.equal(repairedRecent[0].path, '/tmp/kept');
assert.equal(typeof repairedRecent[0].id, 'string', 'a repaired entry must carry an id');

// --- 9. pin, favourite and removal operate on the stored list -----------
// `addRecentProject` returns the whole list, so the new entry is looked up by
// path rather than assumed to be the return value.
reset();
const afterAdd = workspace.addRecentProject({ name: 'Gamma', path: '/tmp/gamma' });
const added = afterAdd.find((entry) => entry.path === '/tmp/gamma');
assert.ok(added, 'the added project must appear in the returned list');
assert.equal(typeof added.id, 'string');
assert.ok(added.id.length > 0, 'an added project must carry an id');
assert.equal(added.pinned, false, 'a new project is not pinned yet');
assert.equal(added.favorite, false, 'a new project is not favourited yet');

workspace.pinProject(added.id);
assert.equal(workspace.loadRecentProjects().find((entry) => entry.id === added.id)?.pinned, true);
workspace.unpinProject(added.id);
assert.equal(workspace.loadRecentProjects().find((entry) => entry.id === added.id)?.pinned, false);
workspace.toggleFavoriteProject(added.id);
assert.equal(workspace.loadRecentProjects().find((entry) => entry.id === added.id)?.favorite, true);
workspace.removeRecentProject(added.id);
assert.equal(workspace.loadRecentProjects().length, 0);
// Unknown ids must be no-ops rather than throwing or inventing entries.
assert.doesNotThrow(() => workspace.pinProject('missing'));
assert.doesNotThrow(() => workspace.removeRecentProject('missing'));
assert.doesNotThrow(() => workspace.toggleFavoriteProject('missing'));
assert.equal(workspace.loadRecentProjects().length, 0);

// --- 10. re-adding the same path must not duplicate ---------------------
reset();
workspace.addRecentProject({ name: 'Same', path: '/tmp/same' });
workspace.addRecentProject({ name: 'Same Again', path: '/tmp/same' });
assert.equal(workspace.loadRecentProjects().length, 1, 'the same folder must appear once');

// --- 11. the source must keep the repair pass ---------------------------
const source = fs.readFileSync(path.join(repoRoot, 'apps/desktop/ui/src/data/project-workspace.ts'), 'utf8');
assert.match(
  source,
  /const repaired = repairProjectInfo\(parsed\);/,
  'the active-project loader must run the shared repair pass',
);
assert.doesNotMatch(
  source,
  /safeParseJson\(raw\); return p as RecentProject;/,
  'the unchecked cast must not return',
);
assert.match(
  source,
  /export function loadActiveProject\(\): RecentProject \| null \{/,
  'the loader signature must stay stable',
);

console.log('CHRIS_STUDIO_V2_4_ACTIVE_PROJECT_REPAIR_PASSED');

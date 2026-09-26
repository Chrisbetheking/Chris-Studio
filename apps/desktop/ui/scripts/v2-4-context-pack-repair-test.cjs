// Regression tests: the context pack must survive untrusted stored data.
//
// Five defects were found by probing the module:
//
//  1. `loadContextPack` validated the top-level shape but returned `files`
//     verbatim, so `null`, a bare string and id-less entries reached the rest of
//     the module.
//  2. `addFilesToContextPack` then threw on `entry.path` — adding a file to a
//     pack that already held a `null` entry crashed.
//  3. `removeFileFromContextPack` threw on `entry.id` for the same reason.
//  4. A non-numeric `sizeBytes` rendered the pack summary as `NaN MB`.
//  5. `MAX_FILES` was enforced only while adding, so a stored list that was
//     already over the limit stayed over it forever.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const STORAGE_KEY = 'tokenfence.contextPack';
const MAX_FILES = 50;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// The module reads `localStorage` directly, so the mock replaces it wholesale.
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

const pack = loadCompiled(path.join(repoRoot, 'apps/desktop/ui/src/data/context-pack.ts'));

function reset(files) {
  backing = new Map();
  if (files !== undefined) {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeProjectPath: '/tmp/project',
      files,
      updatedAt: 1,
    }));
  }
}

function entry(id, patch = {}) {
  return {
    id,
    name: `${id}.ts`,
    path: `/tmp/${id}.ts`,
    relativePath: `${id}.ts`,
    sizeBytes: 100,
    fileType: 'code',
    addedAt: 1,
    isLarge: false,
    ...patch,
  };
}

// --- 1. unusable entries must never reach the rest of the module ----------
reset([
  entry('kept'),
  null,
  'garbage',
  42,
  true,
  [],
  { name: 'no-path' },
  { path: '   ' },
  { id: 'blank-path', path: '' },
]);
const loaded = pack.loadContextPack();
assert.equal(loaded.files.length, 1, 'only entries carrying a real path may survive');
assert.equal(loaded.files[0].id, 'kept');
assert.equal(loaded.activeProjectPath, '/tmp/project');

// --- 2. and the read-modify-write helpers must not throw -----------------
reset([null, 'garbage', { name: 'no-path' }]);
assert.doesNotThrow(
  () => pack.addFilesToContextPack([{ name: 'new.ts', path: '/tmp/new.ts', relativePath: 'new.ts', sizeBytes: 10, fileType: 'code' }]),
  'adding to a pack that held broken entries must not throw',
);
assert.equal(pack.loadContextPack().files.length, 1, 'the added file must be stored');

reset([null]);
assert.doesNotThrow(() => pack.removeFileFromContextPack('anything'), 'removing from a broken pack must not throw');

reset([null, { id: 'no-path' }]);
assert.doesNotThrow(() => pack.clearContextPack(), 'clearing a broken pack must not throw');
assert.equal(pack.loadContextPack().files.length, 0, 'clearing must empty the pack');
assert.equal(pack.loadContextPack().activeProjectPath, null, 'clearing must reset the project path');

// --- 3. missing metadata is repaired ------------------------------------
reset([{ path: '/Users/me/src/main.ts' }]);
const patched = pack.loadContextPack().files[0];
assert.equal(typeof patched.id, 'string');
assert.ok(patched.id.length > 0, 'a missing id must be generated');
assert.equal(patched.name, 'main.ts', 'a missing name must come from the file name');
assert.equal(patched.relativePath, '/Users/me/src/main.ts', 'a missing relative path falls back to the path');
assert.equal(patched.sizeBytes, 0, 'a missing size must read as zero');
assert.equal(patched.fileType, 'unknown', 'a missing type must read as unknown');
assert.equal(typeof patched.addedAt, 'number');
assert.equal(patched.isLarge, false);

// --- 4. the summary must never render NaN or Infinity -------------------
for (const bad of ['big', null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -5, {}]) {
  reset([entry('s', { sizeBytes: bad })]);
  const summary = pack.getContextPackSummary();
  assert.doesNotMatch(summary, /NaN/, `a ${String(bad)} size must not render NaN`);
  assert.doesNotMatch(summary, /Infinity/, `a ${String(bad)} size must not render Infinity`);
  assert.match(summary, /Context Pack: 1 files/, 'the summary must still describe the pack');
}
// A usable size still renders with its unit.
reset([entry('a', { sizeBytes: 2048 })]);
assert.match(pack.getContextPackSummary(), /2\.0 KB/, 'a real size must keep its unit');
reset([entry('b', { sizeBytes: 3 * 1024 * 1024 })]);
assert.match(pack.getContextPackSummary(), /3\.0 MB/);

// --- 5. the cap applies to restored data as well ------------------------
reset(Array.from({ length: 200 }, (_value, index) => entry(`f${index}`)));
assert.equal(pack.loadContextPack().files.length, MAX_FILES, 'a stored list above the cap must be trimmed');
// And the cap still holds while adding.
reset(Array.from({ length: MAX_FILES }, (_value, index) => entry(`g${index}`)));
const full = pack.addFilesToContextPack([{ name: 'extra.ts', path: '/tmp/extra.ts', relativePath: 'extra.ts', sizeBytes: 1, fileType: 'code' }]);
assert.equal(full.files.length, MAX_FILES, 'adding to a full pack must stay at the cap');

// --- 6. the large-file flag must match the stored size ------------------
reset([entry('big', { sizeBytes: MAX_FILE_SIZE_BYTES + 1, isLarge: false })]);
assert.equal(pack.loadContextPack().files[0].isLarge, true, 'an oversized file must be flagged even when the stored flag says otherwise');
reset([entry('small', { sizeBytes: 10, isLarge: true })]);
assert.equal(pack.loadContextPack().files[0].isLarge, false, 'a small file must not stay flagged as oversized');

// --- 7. a normal add/remove round trip ----------------------------------
reset();
const added = pack.addFilesToContextPack([
  { name: 'a.ts', path: '/tmp/a.ts', relativePath: 'a.ts', sizeBytes: 100, fileType: 'code' },
  { name: 'a.ts', path: '/tmp/a.ts', relativePath: 'a.ts', sizeBytes: 100, fileType: 'code' },
]);
assert.equal(added.files.length, 1, 'the same path must not be added twice');
assert.ok(added.updatedAt > 0, 'the pack must be timestamped');
const removed = pack.removeFileFromContextPack(added.files[0].id);
assert.equal(removed.files.length, 0, 'removing the only file must empty the pack');
assert.doesNotThrow(() => pack.removeFileFromContextPack('missing'), 'an unknown id must be a no-op');

// --- 8. malformed storage must fall back to an empty pack --------------
for (const raw of ['not json', '"text"', '42', '[]', 'null']) {
  backing = new Map();
  globalThis.localStorage.setItem(STORAGE_KEY, raw);
  const state = pack.loadContextPack();
  assert.deepEqual(state.files, [], `malformed storage must yield no files: ${raw}`);
}
backing = new Map();
assert.deepEqual(pack.loadContextPack().files, [], 'an empty slot must yield an empty pack');

// --- 9. the module must keep its repair pass ---------------------------
const source = fs.readFileSync(path.join(repoRoot, 'apps/desktop/ui/src/data/context-pack.ts'), 'utf8');
assert.match(source, /function normalizeFile\(entry: unknown\)/, 'the entry validator must stay present');
assert.match(source, /\.slice\(0, MAX_FILES\)/, 'the cap must be applied when loading');
assert.doesNotMatch(
  source,
  /files: Array\.isArray\(parsed\.files\) \? parsed\.files : \[\],/,
  'the unchecked passthrough must not return',
);

for (const name of ['loadContextPack', 'saveContextPack', 'addFilesToContextPack', 'removeFileFromContextPack', 'clearContextPack', 'getContextPackSummary']) {
  assert.equal(typeof pack[name], 'function', `${name} must stay exported`);
}

console.log('CHRIS_STUDIO_V2_4_CONTEXT_PACK_REPAIR_PASSED');

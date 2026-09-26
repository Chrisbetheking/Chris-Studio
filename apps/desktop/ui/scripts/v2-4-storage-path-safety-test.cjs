// Regression tests: storage sub-paths must not escape their base directory.
//
// `validatePath` used to only check for Windows-reserved punctuation while
// deleting the first colon, and it never inspected path segments. It therefore
// accepted `../../etc/passwd`, `a/../../../../root/.ssh/id_rsa`, `C:/Windows`,
// `\\server\share`, `/etc/passwd` and `~/secrets`. `resolveStoragePath` then
// concatenated such a value onto a workspace root without a second check, so a
// caller could be handed a path outside the workspace it asked about.
//
// The helper is exported from the shared package used by the desktop, web and
// Android workspaces, so the guard is pinned on both copies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');

function loadModule(relative) {
  const filePath = path.join(repoRoot, relative);
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filePath,
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'require', 'module', '__filename', '__dirname', output)(
    module.exports,
    () => ({}),
    module,
    filePath,
    path.dirname(filePath),
  );
  return module.exports;
}

const shared = loadModule('packages/shared/src/storage.ts');
const { validatePath, resolveStoragePath, getDefaultStoragePaths } = shared;

// --- 1. values that must be refused ---------------------------------------
const UNSAFE = [
  ['parent traversal', '../../etc/passwd'],
  ['deep traversal', 'a/../../../../root/.ssh/id_rsa'],
  ['trailing traversal', 'docs/..'],
  ['backslash traversal', '..\\..\\windows\\system32'],
  ['mixed separator traversal', 'docs\\..\\..\\secret'],
  ['absolute posix path', '/etc/passwd'],
  ['absolute windows path', '\\Windows\\System32'],
  ['drive letter', 'C:/Windows/System32'],
  ['drive letter backslash', 'C:\\Windows'],
  ['unc forward', '//server/share'],
  ['unc backslash', '\\\\server\\share'],
  ['colon / alternate data stream', 'notes.txt:hidden'],
  ['colon mid-path', 'a:b'],
  ['null byte', 'a\u0000b'],
  ['control character', 'a\u0001b'],
  ['delete character', 'a\u007fb'],
  ['angle bracket', 'a<b'],
  ['pipe', 'a|b'],
  ['question mark', 'a?b'],
  ['asterisk', 'a*b'],
  ['double quote', 'a"b'],
  ['home expansion', '~/secrets'],
  ['empty string', ''],
  ['whitespace only', '   '],
];
for (const [label, value] of UNSAFE) {
  assert.equal(validatePath(value), false, `${label} must be refused: ${JSON.stringify(value)}`);
}

// --- 2. values that must stay usable --------------------------------------
const SAFE = [
  ['plain file', 'notes.md'],
  ['nested path', 'docs/guides/setup.md'],
  ['dots inside a name', 'report..v2.md'],
  ['explicit current dir', './docs/a.md'],
  ['bare current dir', '.'],
  ['spaces in segments', 'my reports/q1 x.md'],
  ['non-ascii names', '文档/笔记.md'],
  ['deeply nested', 'a/b/c/d/e/f.txt'],
  ['dash and underscore', 'my-file_name.txt'],
];
for (const [label, value] of SAFE) {
  assert.equal(validatePath(value), true, `${label} must stay usable: ${JSON.stringify(value)}`);
}

// --- 3. non-string input must not throw -----------------------------------
for (const value of [null, undefined, 42, {}, []]) {
  assert.equal(validatePath(value), false, `non-string input must be refused: ${String(value)}`);
}

// --- 4. joining must reject traversal instead of producing an escaped path -
assert.equal(resolveStoragePath('/base', 'docs/a.md'), '/base/docs/a.md');
assert.equal(resolveStoragePath('/base/', 'docs/a.md'), '/base/docs/a.md', 'a trailing separator is normalized');
assert.equal(resolveStoragePath('/base', './docs/a.md'), '/base/docs/a.md', 'a leading ./ is normalized');
assert.equal(resolveStoragePath('/base', 'docs\\a.md'), '/base/docs/a.md', 'backslashes are normalized');
assert.equal(resolveStoragePath('', 'docs/a.md'), 'docs/a.md', 'an empty base yields the sub-path');
assert.equal(resolveStoragePath('/base', ''), '/base', 'an empty sub-path yields the base');
assert.equal(resolveStoragePath('/base', '.'), '/base', 'the current-dir segment yields the base');

for (const [label, value] of UNSAFE) {
  if (!value.trim()) continue;
  assert.throws(
    () => resolveStoragePath('/base', value),
    /Unsafe storage path rejected/,
    `${label} must make the join throw rather than escape the base`,
  );
}

// A joined result must never resolve above its base once normalized. The check
// looks at path segments: `report..v2.md` is a legal name, only the exact `..`
// segment is a traversal.
const base = '/workspace/project';
for (const [, value] of SAFE) {
  const joined = resolveStoragePath(base, value);
  const normalized = path.posix.normalize(joined);
  assert.ok(
    normalized === base || normalized.startsWith(`${base}/`),
    `the joined path must stay inside the base: ${joined}`,
  );
  const segments = normalized.split('/');
  assert.ok(
    !segments.includes('..'),
    `the joined path must contain no traversal segment: ${joined}`,
  );
  assert.ok(
    normalized.startsWith(base),
    `the joined path must keep the base prefix: ${joined}`,
  );
}

// --- 5. default paths stay independent copies -----------------------------
const defaultsA = getDefaultStoragePaths();
const defaultsB = getDefaultStoragePaths();
defaultsA.workspacePath = '/mutated';
assert.equal(defaultsB.workspacePath, '', 'each call must return its own copy');

// --- 6. both package copies must stay byte-identical ---------------------
const sharedSource = fs.readFileSync(path.join(repoRoot, 'packages/shared/src/storage.ts'), 'utf8');
const androidSource = fs.readFileSync(path.join(repoRoot, 'apps/android/src/shared/storage.ts'), 'utf8');
assert.equal(sharedSource, androidSource, 'the Android storage copy must mirror the shared package');
assert.doesNotMatch(
  sharedSource,
  /path\.replace\(':', ''\)/,
  'the retired single-colon-strip check must not return',
);
assert.match(sharedSource, /segment === '\.\.'/, 'the traversal segment check must stay present');

console.log('CHRIS_STUDIO_V2_4_STORAGE_PATH_SAFETY_PASSED');

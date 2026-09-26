// Regression tests: file-type detection must read real browser MIME values.
//
// `detectFileType` compared the raw `File.type` value against the mapping, and
// derived the extension with `split('.').pop()`. Both assumptions were wrong:
//
//  1. `File.type` routinely carries parameters and header-style casing
//     (`application/pdf; charset=utf-8`, `APPLICATION/PDF`), and the mapping
//     holds bare lowercase types. Every such file fell through to `unknown`, so
//     the router recommended the generic fallback model for PDFs, sheets and
//     documents that it should have routed precisely.
//
//  2. `.tar.gz` must be treated as one compound extension rather than `.gz`, and
//     a dotfile such as `.env` is a name rather than an extension — the old
//     `split('.').pop()` produced `env` for it and `gz` for the archive.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');

// Compiles the shared package on demand and loads its sibling modules for real:
// fileRouter imports PROVIDERS from ./providers, so a stub require would make
// recommendModelForFile fail on undefined data instead of exercising the router.
const compiledCache = new Map();

function compileTypeScript(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filePath,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) {
      throw new Error(`Unexpected external dependency in the shared package: ${specifier}`);
    }
    const base = path.resolve(path.dirname(filePath), specifier);
    for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate)) return loadCompiled(candidate);
    }
    throw new Error(`Cannot resolve ${specifier} from ${filePath}`);
  };
  new Function('exports', 'require', 'module', '__filename', '__dirname', output)(
    module.exports,
    localRequire,
    module,
    filePath,
    path.dirname(filePath),
  );
  return module.exports;
}

function loadCompiled(filePath) {
  if (compiledCache.has(filePath)) return compiledCache.get(filePath);
  const exports = compileTypeScript(filePath);
  compiledCache.set(filePath, exports);
  return exports;
}

function loadModule(relative) {
  return loadCompiled(path.join(repoRoot, relative));
}

const router = loadModule('packages/shared/src/fileRouter.ts');
const { detectFileType, recommendModelForFile } = router;

// --- 1. the pre-existing contract must not move ---------------------------
const EXTENSION_CASES = [
  ['report.pdf', 'pdf'],
  ['notes.md', 'markdown'],
  ['sheet.xlsx', 'spreadsheet'],
  ['deck.pptx', 'presentation'],
  ['image.png', 'image'],
  ['bundle.zip', 'archive'],
  ['script.ts', 'code'],
  ['unknown.xyz', 'unknown'],
];
for (const [name, expected] of EXTENSION_CASES) {
  assert.equal(detectFileType(name).category, expected, `${name} must still detect as ${expected}`);
}

// --- 2. MIME values with parameters must match ---------------------------
const MIME_CASES = [
  ['application/pdf; charset=utf-8', 'pdf'],
  ['application/pdf;charset=utf-8', 'pdf'],
  [' application/pdf ', 'pdf'],
  ['text/csv; charset=utf-8', 'spreadsheet'],
  ['text/plain; charset=utf-8', 'document'],
  ['image/png; name="shot.png"', 'image'],
];
for (const [mime, expected] of MIME_CASES) {
  assert.equal(
    detectFileType('payload.bin', mime).category,
    expected,
    `${mime} must detect as ${expected}`,
  );
}

// --- 3. MIME casing must not matter --------------------------------------
for (const [mime, expected] of [
  ['APPLICATION/PDF', 'pdf'],
  ['Application/Pdf', 'pdf'],
  ['TEXT/CSV', 'spreadsheet'],
  ['IMAGE/PNG', 'image'],
]) {
  assert.equal(detectFileType('payload.bin', mime).category, expected, `${mime} must detect as ${expected}`);
}

// An explicit MIME type is the stronger signal and must win over the extension.
assert.equal(
  detectFileType('renamed.bin', 'application/pdf').category,
  'pdf',
  'a known MIME type must win over an unknown extension',
);

// --- 4. extensions must be case-insensitive ------------------------------
for (const [name, expected] of [
  ['REPORT.PDF', 'pdf'],
  ['Notes.MD', 'markdown'],
  ['Bundle.ZIP', 'archive'],
  ['Sheet.XLSX', 'spreadsheet'],
]) {
  assert.equal(detectFileType(name).category, expected, `${name} must detect as ${expected}`);
}

// --- 5. compound extensions and dotfiles ---------------------------------
assert.equal(detectFileType('data.tar.gz').category, 'archive', '.tar.gz must detect as an archive');
assert.equal(detectFileType('backup.tar').category, 'archive', '.tar must detect as an archive');
assert.equal(detectFileType('archive.gz').category, 'archive', '.gz must detect as an archive');

for (const name of ['.env', '.gitignore', '.npmrc', 'noext', 'weird.', '', '   ']) {
  assert.equal(
    detectFileType(name).category,
    'unknown',
    `${JSON.stringify(name)} must be unknown rather than guessing an extension`,
  );
}
for (const value of [undefined, null, 42, {}]) {
  assert.equal(
    detectFileType(value).category,
    'unknown',
    `non-string input must be unknown: ${String(value)}`,
  );
}

// --- 6. an unusable MIME value must not shadow the extension -------------
assert.equal(detectFileType('a.pdf', '').category, 'pdf', 'an empty MIME value must not block the extension');
assert.equal(detectFileType('a.pdf', '   ').category, 'pdf', 'a blank MIME value must not block the extension');
assert.equal(detectFileType('a.pdf', '!!!').category, 'pdf', 'an unparsable MIME value must not block the extension');
assert.equal(detectFileType('a.pdf', ';').category, 'pdf', 'a parameter-only MIME value must not block the extension');

// --- 7. the mapping must stay internally consistent ----------------------
const RULES = router.getDefaultFileRoutingRules();
assert.ok(Array.isArray(RULES) && RULES.length > 0, 'routing rules must be available');
for (const info of EXTENSION_CASES.filter(([, category]) => category !== 'unknown').map(([name]) => detectFileType(name))) {
  assert.ok(info.label && info.label !== 'Unknown', 'a detected type must carry a label');
  assert.ok(info.recommendedModel, 'a detected type must recommend a model');
  assert.ok(Array.isArray(info.mimeTypes), 'a detected type must expose its MIME list');
}
const recommendation = recommendModelForFile('quarterly-report.pdf');
assert.ok(recommendation && typeof recommendation === 'object', 'a routed file must produce a recommendation');

// --- 8. both package copies must stay byte-identical ---------------------
const sharedSource = fs.readFileSync(path.join(repoRoot, 'packages/shared/src/fileRouter.ts'), 'utf8');
const androidSource = fs.readFileSync(path.join(repoRoot, 'apps/android/src/shared/fileRouter.ts'), 'utf8');
assert.equal(sharedSource, androidSource, 'the Android router copy must mirror the shared package');
assert.match(sharedSource, /split\(';', 1\)/, 'MIME parameters must be stripped before matching');
assert.doesNotMatch(
  sharedSource,
  /fileName\.split\('\.'\)\.pop\(\)/,
  'the retired extension guess must not return',
);

console.log('CHRIS_STUDIO_V2_4_FILE_TYPE_DETECTION_PASSED');

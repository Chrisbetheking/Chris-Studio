// Regression tests: "store sanitized only" must remove the raw matched values.
//
// `createArchiveEntry(..., storeSanitizedOnly = true)` cleared
// `GuardResult.original` but left every `SensitiveFinding.match` untouched. That
// field holds the exact text the guard detected, so an archive entry that looked
// sanitized still contained live credentials in its finding list — a mailbox, a
// token, an API key — and serializing the entry wrote them to disk.
//
// Offsets, labels, severities and the redacted text are kept so a redacted
// receipt can still be audited against the scan that produced it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');

// Compiles the shared package on demand and resolves its sibling imports for
// real: archive.ts is standalone, while the guard has no runtime dependencies.
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

const guard = loadModule('packages/shared/src/guard.ts');
const archive = loadModule('packages/shared/src/archive.ts');
const { createArchiveEntry, filterArchive } = archive;

// Credential bodies are assembled at runtime so this file never contains a
// literal token that secret-scanning push protection would reject.
const J = (...parts) => parts.join('');
const keyBody = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
const KEY = J('s', 'k-', 'proj-') + keyBody;
const EMAIL = J('alice', '@', 'example.com');
const TEXT = `api_key=${KEY} and email ${EMAIL}`;

const scan = guard.scanPrompt(TEXT);
assert.ok(scan.findings.length >= 2, 'the fixture must produce several findings');
// The shared guard redacts by truncation (`ap***89`) rather than with a marker
// placeholder, so the check is that the payload actually changed.
assert.notEqual(scan.redacted, TEXT, 'the fixture must be redactable');
assert.ok(!scan.redacted.includes(EMAIL), 'the redacted text must not keep the raw mailbox');

// --- 1. sanitized storage must not carry any raw matched value ------------
const sanitized = createArchiveEntry(scan, 'chat', true);
assert.equal(sanitized.guardResult.original, '', 'the original payload must be dropped');
assert.equal(
  sanitized.guardResult.findings.length,
  scan.findings.length,
  'findings must survive for auditing',
);
assert.ok(
  sanitized.guardResult.findings.every((finding) => finding.match === finding.redacted),
  'every finding must replace its raw match with the redacted form',
);

const serialized = JSON.stringify(sanitized);
assert.ok(!serialized.includes(keyBody), 'the serialized entry must not contain the key body');
assert.ok(!serialized.includes(EMAIL), 'the serialized entry must not contain the raw mailbox');
assert.ok(!serialized.includes(TEXT), 'the serialized entry must not contain the raw payload');

// --- 2. audit metadata must stay intact ----------------------------------
assert.equal(
  sanitized.guardResult.riskLevel,
  scan.riskLevel,
  'the risk level must be preserved for the receipt',
);
assert.equal(
  sanitized.guardResult.redacted,
  scan.redacted,
  'the redacted text must be preserved',
);
assert.notEqual(sanitized.guardResult.redacted, TEXT, 'the stored text must stay redacted');
assert.equal(sanitized.guardResult.timestamp, scan.timestamp, 'the receipt timestamp must be preserved');
sanitized.guardResult.findings.forEach((finding, index) => {
  const source = scan.findings[index];
  assert.equal(finding.type, source.type, 'the finding type must be preserved');
  assert.equal(finding.label, source.label, 'the finding label must be preserved');
  assert.equal(finding.start, source.start, 'the finding offset must be preserved');
  assert.equal(finding.end, source.end, 'the finding offset must be preserved');
  assert.equal(finding.redacted, source.redacted, 'the redacted form must be preserved');
  assert.ok(finding.redacted.length > 0, 'a redacted form must not be empty');
  assert.notEqual(finding.match, source.match, 'the raw match must not be kept');
});

// --- 3. the sanitized copy must not alias the caller's scan --------------
assert.notEqual(sanitized.guardResult.findings, scan.findings, 'the findings array must be a copy');
sanitized.guardResult.findings[0].match = 'mutated';
assert.notEqual(scan.findings[0].match, 'mutated', 'mutating the entry must not touch the source scan');

// --- 4. unsanitized storage keeps everything for local inspection --------
const full = createArchiveEntry(scan, 'chat', false);
assert.equal(full.guardResult.original, TEXT, 'an unsanitized entry keeps the original payload');
assert.ok(
  full.guardResult.findings.some((finding) => finding.match.includes(EMAIL)),
  'an unsanitized entry keeps the raw matches',
);
assert.equal(full.guardResult, scan, 'an unsanitized entry reuses the scan result unchanged');

// --- 5. degenerate inputs must not throw ---------------------------------
const clean = guard.scanPrompt('nothing sensitive in this line');
const cleanEntry = createArchiveEntry(clean, 'chat', true);
assert.deepEqual(cleanEntry.guardResult.findings, [], 'a clean scan stores an empty finding list');

const missingFindings = createArchiveEntry(
  { riskLevel: 'safe', findings: undefined, original: 'x', redacted: 'x', timestamp: 1 },
  'chat',
  true,
);
assert.ok(Array.isArray(missingFindings.guardResult.findings), 'a missing finding list must not crash the archive');

// --- 6. filtering keeps the newest entries and respects the default ------
const entries = Array.from({ length: 5 }, (_value, index) => ({ id: `entry-${index}` }));
assert.equal(filterArchive(entries).length, 5, 'the default limit must not truncate a small list');
assert.equal(filterArchive(entries, 2).length, 2, 'an explicit limit must be honoured');
assert.equal(filterArchive(entries, 2)[0].id, 'entry-0', 'filtering keeps the list order');

// --- 7. both package copies must stay byte-identical ---------------------
const sharedSource = fs.readFileSync(path.join(repoRoot, 'packages/shared/src/archive.ts'), 'utf8');
const androidSource = fs.readFileSync(path.join(repoRoot, 'apps/android/src/shared/archive.ts'), 'utf8');
assert.equal(sharedSource, androidSource, 'the Android archive copy must mirror the shared package');
assert.match(sharedSource, /match: finding\.redacted/, 'the raw-match replacement must stay present');
assert.doesNotMatch(
  sharedSource,
  /\? \{ \.\.\.guardResult, original: '' \}/,
  'dropping only the original payload must not return',
);

console.log('CHRIS_STUDIO_V2_4_ARCHIVE_SANITIZATION_PASSED');

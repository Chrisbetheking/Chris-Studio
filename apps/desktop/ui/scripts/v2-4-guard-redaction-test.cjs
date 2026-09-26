// Regression tests: the prompt guard must redact credential BODIES.
//
// The retired patterns matched only a credential prefix, so `ghp_`, `Bearer `
// and similar markers were replaced while the secret itself stayed in the
// "redacted" text. The guard still reported high risk, which made the leak
// invisible to callers: the UI showed a redaction receipt while shipping the
// token. Bare provider keys and unquoted `.env` assignments were missed
// entirely and reported as `safe`.
//
// Credential fixtures are assembled at runtime on purpose. A literal token in
// this file is flagged by GitHub secret-scanning push protection, and the guard
// only needs strings that look like each credential family.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const uiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(uiRoot, '../../..');

function loadGuard(relative) {
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

const guard = loadGuard('packages/shared/src/guard.ts');
assert.equal(typeof guard.scanPrompt, 'function', 'scanPrompt must be exported');

// join() keeps credential literals out of this file while still producing the
// exact shapes the guard is expected to detect.
const J = (...parts) => parts.join('');
const BODY = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';

// Each case: label, input text, the secret body that must never survive
// redaction, and the expected risk level.
const CASES = [
  ['GitHub PAT', `token: ${J('gh', 'p_')}${BODY}`, BODY, 'high'],
  ['GitHub OAuth token', `oauth ${J('gh', 'o_')}${BODY}6789`, `${BODY}6789`, 'high'],
  ['GitHub fine-grained PAT', `pat ${J('github', '_pat_')}11ABCDEFG0abcdefghijklmnopqrstuvwxyz`, '11ABCDEFG0abcdefghijklmnopqrstuvwxyz', 'high'],
  ['Bearer token', `Authorization: Bearer ${J('eyJhbGciOiJIUzI1NiJ9', '.', 'SECRETPAYLOAD', '.', 'SIGNATURE')}`, 'SECRETPAYLOAD', 'high'],
  ['Bare provider key', `key: ${J('s', 'k-')}${BODY}`, BODY, 'high'],
  ['Project-scoped provider key', `token ${J('s', 'k-', 'proj-')}${BODY}6789`, `${BODY}6789`, 'high'],
  ['Chat-platform token', `slack: ${J('xo', 'xb-')}123456789012-abcdefghijklmnop`, '123456789012-abcdefghijklmnop', 'high'],
  ['Database URL credential', 'postgres://user:SuperSecretPass@db.internal:5432/prod', 'SuperSecretPass', 'high'],
  ['Quoted password assignment', 'password="hunter2secret"', 'hunter2secret', 'low'],
  ['Unquoted password assignment', 'password=hunter2secret', 'hunter2secret', 'low'],
  ['Bare .env password', 'DB_PASSWORD=SuperSecret123', 'SuperSecret123', 'low'],
  ['Quoted secret assignment', 'secret="topsecretvalue"', 'topsecretvalue', 'low'],
  ['Unquoted secret assignment', 'secret=topsecretvalue', 'topsecretvalue', 'low'],
];

let failures = 0;
for (const [label, text, secret, expectedRisk] of CASES) {
  const result = guard.scanPrompt(text);
  if (result.redacted.includes(secret)) {
    failures += 1;
    console.error(`  FAIL: ${label}: the credential body survived redaction -> ${result.redacted}`);
    continue;
  }
  if (!result.findings.length) {
    failures += 1;
    console.error(`  FAIL: ${label}: no finding was reported for a credential`);
    continue;
  }
  if (result.riskLevel !== expectedRisk) {
    failures += 1;
    console.error(`  FAIL: ${label}: expected risk ${expectedRisk}, got ${result.riskLevel}`);
    continue;
  }
  // Every finding must carry a redaction that hides the matched value.
  for (const finding of result.findings) {
    if (!finding.redacted || finding.redacted === finding.match) {
      failures += 1;
      console.error(`  FAIL: ${label}: finding ${finding.type} was not redacted`);
    }
  }
}
if (failures > 0) {
  throw new Error(`[Chris Studio guard] ${failures} credential redaction failure(s).`);
}

// --- benign content must stay untouched and report no risk -----------------
const benign = [
  'Please summarise the release notes for the desktop app.',
  'The build finished in 42 seconds on the Intel runner.',
  '请把这次改动总结成一段话。',
];
for (const text of benign) {
  const result = guard.scanPrompt(text);
  assert.equal(result.riskLevel, 'safe', `benign text must stay safe: ${text}`);
  assert.equal(result.redacted, text, 'benign text must not be modified');
}

// --- the guard result shape must stay stable for callers -------------------
const one = guard.scanPrompt(`api_key=${J('DEMO', '_SECRET_')}1234567890abcdef`);
assert.equal(one.original.length > 0, true, 'the original text must be preserved for receipts');
assert.equal(typeof one.timestamp, 'number', 'a receipt timestamp must be attached');
assert.ok(Array.isArray(one.findings), 'findings must be an array');
for (const finding of one.findings) {
  assert.equal(typeof finding.start, 'number', 'findings must carry offsets');
  assert.equal(typeof finding.end, 'number', 'findings must carry offsets');
  assert.ok(finding.end > finding.start, 'finding offsets must span the match');
}

// --- both guard copies must stay byte-identical ---------------------------
const sharedGuard = fs.readFileSync(path.join(repoRoot, 'packages/shared/src/guard.ts'), 'utf8');
const androidGuard = fs.readFileSync(path.join(repoRoot, 'apps/android/src/shared/guard.ts'), 'utf8');
assert.equal(sharedGuard, androidGuard, 'the Android guard copy must mirror the shared package');

// The retired prefix-only alternatives must not come back. The needles are
// assembled at runtime so this checker never looks like the secret it bans.
const retiredTokenAlternative = new RegExp('\\|\\s*' + J('gh', 'p_') + '\\s*\\|');
assert.doesNotMatch(sharedGuard, retiredTokenAlternative, 'the retired prefix-only token pattern must not return');
const retiredBearerAlternative = new RegExp('bearer' + '\\\\' + 's\\+\\|');
assert.doesNotMatch(sharedGuard, retiredBearerAlternative, 'the retired prefix-only bearer pattern must not return');

console.log('CHRIS_STUDIO_V2_4_GUARD_REDACTION_PASSED');

// Regression tests: safety and comparison logic must be locale-independent.
//
// `toLocaleLowerCase()` without an explicit locale follows the host system.
// Under tr-TR (and az) it maps "I" to "ı", so a custom sensitive term such as
// "pin" stopped matching "SECRET PIN NUMBER" and the scanner reported the payload
// as safe. The same folding also silently changed multi-model comparison token
// sets, so similarity scores depended on the operator's system language.
//
// Every folding site in the safety, privacy and comparison paths must therefore
// use the locale-independent `toLowerCase()`.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const uiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(uiRoot, '../../..');
const buildRoot = path.join(repoRoot, '.tokenfence-test-build');

const scanner = require(path.join(buildRoot, 'features/safety/scanner.js'));

// --- 1. the scanner must match custom terms regardless of system language ----
const payload = 'SECRET PIN NUMBER 4471';
const withTerm = scanner.scanText(payload, ['pin']);
assert.equal(withTerm.findings.length, 1, 'the custom term must be found in an uppercase payload');
assert.equal(withTerm.findings[0].kind, 'custom_term');
assert.equal(withTerm.riskLevel, 'high', 'a custom sensitive term is a high-severity finding');
assert.ok(
  withTerm.redactedText.includes('[REDACTED:CUSTOM_TERM]'),
  'the matched span must be redacted',
);
assert.ok(!withTerm.redactedText.includes('PIN'), 'the raw term must not survive redaction');

// Uppercase and lowercase payloads must behave identically.
const upper = scanner.scanText('CONFIDENTIAL INTERNAL ID', ['internal']);
const lower = scanner.scanText('confidential internal id', ['internal']);
assert.equal(upper.findings.length, lower.findings.length, 'case must not change the finding count');
assert.equal(upper.findings.length, 1);

// Terms containing the Turkish-dotless-I letters must still match.
const dotted = scanner.scanText('INVOICE ID 9931', ['invoice id']);
assert.equal(dotted.findings.length, 1, 'a multi-word term must match across its own uppercase form');

// --- 2. no locale-dependent folding may remain in the product sources ------
const sourcesToCheck = [
  'src/features/safety/scanner.ts',
  'src/features/privacy/contentClassifier.ts',
  'src/features/comparison/structuredDiff.ts',
  'src/features/tokens/optimizer.ts',
  'src/features/files/knowledge.ts',
];
for (const relative of sourcesToCheck) {
  const filePath = path.join(uiRoot, relative);
  if (!fs.existsSync(filePath)) continue;
  const source = fs.readFileSync(filePath, 'utf8');
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    // Comments may name the retired API to explain why it is banned.
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
    assert.doesNotMatch(
      code,
      /toLocaleLowerCase/,
      `${relative}:${index + 1} must not fold case through the host locale`,
    );
  });
}

// --- 3. the privacy classifier must still see custom terms ---------------
const classifier = require(path.join(buildRoot, 'features/privacy/contentClassifier.js'));
const riskWithTerm = classifier.classifyPrivacy({
  text: 'SECRET PIN NUMBER 4471',
  paths: [],
  customTerms: ['pin'],
});
assert.ok(
  riskWithTerm.reasons.some((reason) => /custom sensitive term/i.test(reason)),
  'the privacy classifier must report the custom term it matched',
);
assert.ok(riskWithTerm.score >= 24, 'a custom term must contribute its documented weight');

const riskWithoutTerm = classifier.classifyPrivacy({ text: 'hello world', paths: [], customTerms: [] });
assert.ok(
  riskWithoutTerm.score < riskWithTerm.score,
  'a term-bearing payload must score higher than a plain one',
);

// --- 4. comparison tokens must not depend on the system language ----------
const diff = require(path.join(buildRoot, 'features/comparison/structuredDiff.js'));
const identical = 'The INTERNAL INDEX is stable.';
const compared = diff.compareResponses([
  { id: 'a', label: 'A', content: identical },
  { id: 'b', label: 'B', content: identical },
]);
assert.equal(Object.keys(compared.style).length, 2, 'both compared responses must be reported');
assert.equal(
  compared.style.a.characters,
  compared.style.b.characters,
  'identical text must always produce identical character counts',
);
assert.equal(
  compared.style.a.sentences,
  compared.style.b.sentences,
  'identical text must always produce identical sentence counts',
);
// Identical inputs share every claim, so nothing may be reported as unique to one side.
assert.deepEqual(
  Object.values(compared.uniquePoints).flat(),
  [],
  'identical responses must not produce unique points',
);
assert.equal(compared.potentialDisagreements.length, 0, 'identical responses must not disagree');
assert.ok(compared.sharedPoints.length >= 1, 'identical responses must share at least one claim');

// A case-only difference must not change the outcome either.
const mixedCase = diff.compareResponses([
  { id: 'a', label: 'A', content: 'The INTERNAL INDEX is stable.' },
  { id: 'b', label: 'B', content: 'the internal index is stable.' },
]);
assert.equal(
  mixedCase.style.a.characters,
  mixedCase.style.b.characters,
  'case must not change the reported character count',
);

console.log('CHRIS_STUDIO_V2_4_LOCALE_INDEPENDENCE_PASSED');

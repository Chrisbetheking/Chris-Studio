// Regression tests: token compaction must never rewrite fenced code.
//
// `balanced` compaction ended with `replace(/[ \t]{2,}/g, ' ')` over the whole
// string, so every run of spaces inside a fenced block was collapsed. Whitespace
// is semantic in Python, YAML and Makefiles, so a compacted request silently
// changed the code the model was asked to reason about — 4-space indentation
// became 1 space and the snippet no longer parsed.
//
// Layout-only normalization (line endings, trailing spaces, blank-line runs) is
// still applied everywhere; prose-only compaction is now limited to the text
// around a fence.
const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = path.resolve(__dirname, '../../../../.tokenfence-test-build');
const optimizer = require(path.join(buildRoot, 'features/tokens/optimizer.js'));
const { optimizeText, estimateTokens } = optimizer;

// --- 1. indentation inside a fence must survive every mode ---------------
const python = [
  '请 请  总结 这段 代码',
  '```python',
  'def run():',
  '    if enabled:',
  '        return {"a": 1}',
  '```',
  '谢谢',
].join('\n');

for (const mode of ['conservative', 'balanced']) {
  const result = optimizeText(python, mode);
  assert.ok(result.optimizedText.includes('    if enabled:'), `${mode}: the 4-space indent must survive`);
  assert.ok(result.optimizedText.includes('        return {"a": 1}'), `${mode}: the 8-space indent must survive`);
  assert.ok(result.optimizedText.includes('def run():'), `${mode}: the code body must be intact`);
}

// A YAML block is indentation-sensitive in the same way.
const yaml = [
  'Please   please review   this configuration',
  '```yaml',
  'service:',
  '  network:',
  '    timeout: 30s',
  '    retries: 3',
  '```',
  'done',
].join('\n');
const yamlResult = optimizeText(yaml, 'balanced');
assert.ok(yamlResult.optimizedText.includes('    timeout: 30s'), 'YAML indentation must survive');
assert.ok(yamlResult.optimizedText.includes('    retries: 3'), 'YAML indentation must survive');
assert.doesNotMatch(yamlResult.optimizedText, /Please\s+please/, 'the prose around the fence must still be compacted');

// A Makefile recipe needs its leading tab, which the same pass would have
// reduced to a single space.
const makefile = [
  'run  the  build',
  '```make',
  'build:',
  '\tgo  build  ./...',
  '```',
].join('\n');
const makeResult = optimizeText(makefile, 'balanced');
assert.ok(makeResult.optimizedText.includes('\tgo  build  ./...'), 'a tab-indented recipe must survive verbatim');

// --- 2. prose around fences is still compacted --------------------------
const proseOnly = '请 请 请    帮我    总结';
const proseResult = optimizeText(proseOnly, 'balanced');
assert.ok(proseResult.optimizedText.length < proseOnly.length, 'redundant prose must still shrink');
assert.ok(proseResult.optimizedText.includes('帮我'), 'the substance of the request must survive');
assert.ok(proseResult.optimizedText.includes('总结'));

// --- 3. layout-only normalization still applies -------------------------
const layout = 'line one   \r\nline two\r\n\r\n\r\n\r\n\r\nline three';
const layoutResult = optimizeText(layout, 'conservative');
assert.ok(!layoutResult.optimizedText.includes('\r'), 'carriage returns must be normalized away');
assert.ok(!/ {2,}$/m.test(layoutResult.optimizedText), 'trailing spaces must be trimmed');
assert.ok(!layoutResult.optimizedText.includes('\n\n\n\n'), 'long blank runs must be collapsed');
assert.ok(layoutResult.optimizedText.includes('line one\n'), 'content must survive normalization');

// --- 4. the pre-existing contract must not move -------------------------
const offResult = optimizeText('unchanged  text', 'off');
assert.equal(offResult.optimizedText, 'unchanged  text', 'off must be a true no-op');
assert.equal(offResult.savedTokens, 0);

const emptyResult = optimizeText('', 'balanced');
assert.equal(emptyResult.optimizedText, '', 'an empty input stays empty');
assert.equal(emptyResult.savedTokens, 0);
assert.equal(emptyResult.originalTokens, 0);

const blankResult = optimizeText('   \n\t  ', 'balanced');
assert.equal(blankResult.savedTokens, 0, 'a whitespace-only input reports no savings');

// The documented dedupe behaviour: consecutive identical lines collapse and the
// change is reported through `changes`, while the code body itself stays intact.
const dedupe = optimizeText('same\nsame\nsame\nother', 'conservative');
assert.equal(dedupe.optimizedText, 'same\nother', 'consecutive duplicates must collapse');
assert.ok(dedupe.savedTokens > 0, 'the collapse must report savings');
assert.ok(
  dedupe.changes.some((entry) => /Removed 2 repeated lines/.test(entry)),
  'the change list must describe what was removed',
);

// `changes` is only reported when something was actually saved, so a no-op run
// does not claim to have compacted anything.
const noSavings = optimizeText('a b c', 'conservative');
assert.deepEqual(noSavings.changes, [], 'a run without savings must not report changes');

// --- 5. the core-privacy fixture must still shrink --------------------
const privacyFixture = optimizeText(
  'Please please review this.\nRepeated context\nRepeated context\n\n\n\nDone',
  'balanced',
);
assert.ok(
  privacyFixture.optimizedTokens < privacyFixture.originalTokens,
  'the documented duplicate-context fixture must still be reduced',
);

// --- 6. token estimation boundaries -------------------------------------
assert.equal(estimateTokens(''), 0, 'an empty string costs nothing');
assert.equal(estimateTokens('   \n  '), 0, 'whitespace costs nothing');
assert.ok(estimateTokens('hello world') >= 1, 'latin text costs at least one token');
assert.ok(estimateTokens('你好世界') >= 1, 'CJK text costs at least one token');
assert.ok(
  estimateTokens('中文'.repeat(500)) > estimateTokens('ab'.repeat(500)) / 2,
  'CJK text must be estimated more heavily than the same character count of latin text',
);
assert.equal(Number.isFinite(estimateTokens('x'.repeat(100000))), true, 'a long input must stay finite');

// --- 7. malformed fenced input must not throw -------------------------
for (const input of [
  '```\nunclosed',
  '```',
  '```python\ncode',
  'text ``` inline ``` more',
  '```\n```',
  '````\nfour backticks\n````',
]) {
  const result = optimizeText(input, 'balanced');
  assert.equal(typeof result.optimizedText, 'string', `a fence edge case must not throw: ${JSON.stringify(input)}`);
  assert.ok(result.optimizedText.length > 0 || input.length === 0);
}

// --- 8. the implementation must keep the prose-only path ---------------
const source = require('node:fs').readFileSync(
  path.resolve(__dirname, '../src/features/tokens/optimizer.ts'),
  'utf8',
);
assert.match(source, /function splitFencedSegments/, 'the fence splitter must stay present');
assert.match(source, /function mapProse/, 'the prose-only mapper must stay present');
assert.match(source, /mapProse\(optimized, \(prose\) => prose/, 'compaction must run through the prose mapper');

console.log('CHRIS_STUDIO_V2_4_TOKEN_COMPACTION_SAFETY_PASSED');

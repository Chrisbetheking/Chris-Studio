// Regression tests: knowledge indexing and retrieval must tolerate damaged input.
//
// `buildKnowledgeIndex` and `searchKnowledge` dereferenced whatever they were
// given. Seven failures were confirmed by probing:
//
//   buildKnowledgeIndex(null file)         -> Cannot read properties of null
//   buildKnowledgeIndex(missing content)   -> Cannot read properties of undefined
//   buildKnowledgeIndex(non-string content)-> text.replace is not a function
//   searchKnowledge(null entry)            -> Cannot read properties of null
//   searchKnowledge(bad tokens)            -> Cannot read properties of undefined
//   searchKnowledge(non-string text)       -> chunk.text.toLowerCase is not a function
//   searchKnowledge(non-string query)      -> text.toLowerCase is not a function
//
// A malformed query therefore aborted the whole retrieval step rather than
// returning no hits, and one bad attachment aborted indexing for every file.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const MODULE = 'apps/desktop/ui/src/features/files/knowledge.ts';

const compiledCache = new Map();

function loadCompiled(target) {
  if (compiledCache.has(target)) return compiledCache.get(target);
  const output = ts.transpileModule(fs.readFileSync(target, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) throw new Error(`Unexpected external dependency: ${specifier}`);
    const base = path.resolve(path.dirname(target), specifier);
    for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate)) return loadCompiled(candidate);
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
  compiledCache.set(target, module.exports);
  return module.exports;
}

const knowledge = loadCompiled(path.join(repoRoot, MODULE));
const { buildKnowledgeIndex, searchKnowledge, formatKnowledgeContext } = knowledge;

function file(id, patch = {}) {
  return { id, name: `${id}.md`, content: 'The deployment checklist mentions staging first.', ...patch };
}

function chunk(id, patch = {}) {
  return {
    id,
    sourceId: 'src-1',
    sourceName: 'notes.md',
    text: 'the deployment checklist mentions staging first',
    tokens: ['deployment', 'checklist', 'staging'],
    index: 0,
    ...patch,
  };
}

// --- 1. indexing must never throw on a damaged attachment ---------------
const DAMAGED_FILES = [
  ['a null entry', [null]],
  ['a string entry', ['junk']],
  ['a number entry', [42]],
  ['a missing content field', [{ id: 'f', name: 'a.md' }]],
  ['a non-string content', [{ id: 'f', name: 'a.md', content: 42 }]],
  ['a null content', [{ id: 'f', name: 'a.md', content: null }]],
  ['a non-string name', [{ id: 'f', name: 42, content: 'hello world' }]],
  ['a non-string id', [{ id: 42, name: 'a.md', content: 'hello world' }]],
  ['a non-array input', 'not-an-array'],
  ['a null input', null],
];
for (const [label, files] of DAMAGED_FILES) {
  let result;
  let threw = null;
  try {
    result = buildKnowledgeIndex(files);
  } catch (error) {
    threw = String(error && error.message);
  }
  assert.equal(threw, null, `indexing must not throw for ${label}`);
  assert.ok(Array.isArray(result), `indexing must return a list for ${label}`);
  for (const entry of result) {
    assert.equal(typeof entry.id, 'string', 'an indexed chunk carries a string id');
    assert.equal(typeof entry.text, 'string', 'an indexed chunk carries string text');
    assert.ok(Array.isArray(entry.tokens), 'an indexed chunk carries a token list');
    assert.equal(typeof entry.index, 'number', 'an indexed chunk carries a numeric index');
  }
}

// One damaged attachment must not stop the healthy ones from being indexed.
const mixedFiles = buildKnowledgeIndex([
  null,
  { id: 'broken', name: 'broken.md' },
  file('good'),
]);
assert.ok(mixedFiles.length > 0, 'a healthy attachment is still indexed alongside a broken one');
assert.ok(
  mixedFiles.every((entry) => entry.sourceId === 'good'),
  'only the healthy attachment contributes chunks',
);

// --- 2. retrieval must never throw on a damaged index -------------------
const DAMAGED_INDEXES = [
  ['a null entry', [null]],
  ['a string entry', ['junk']],
  ['a number entry', [42]],
  ['a missing tokens field', [{ id: 'x', text: 'hello', sourceName: 'a', index: 0 }]],
  ['a non-array tokens field', [{ id: 'x', text: 'hello', tokens: 'junk', sourceName: 'a', index: 0 }]],
  ['a non-string text', [{ id: 'x', text: 42, tokens: ['hello'], sourceName: 'a', index: 0 }]],
  ['a non-string source name', [{ id: 'x', text: 'hello', tokens: ['hello'], sourceName: 42, index: 0 }]],
  ['a non-numeric index', [{ id: 'x', text: 'hello', tokens: ['hello'], sourceName: 'a', index: 'first' }]],
  ['an entry without an id', [{ text: 'hello', tokens: ['hello'], sourceName: 'a', index: 0 }]],
  ['a non-array index', 'not-an-array'],
  ['a null index', null],
];
for (const [label, index] of DAMAGED_INDEXES) {
  let hits;
  let threw = null;
  try {
    hits = searchKnowledge(index, 'deployment checklist');
  } catch (error) {
    threw = String(error && error.message);
  }
  assert.equal(threw, null, `retrieval must not throw for ${label}`);
  assert.ok(Array.isArray(hits), `retrieval must return a list for ${label}`);
  assert.doesNotThrow(() => formatKnowledgeContext(hits), `formatting must not throw for ${label}`);
}

// --- 3. retrieval must never throw on a damaged query -------------------
for (const query of [null, undefined, 42, {}, [], true]) {
  let hits;
  let threw = null;
  try {
    hits = searchKnowledge([chunk('a')], query);
  } catch (error) {
    threw = String(error && error.message);
  }
  assert.equal(threw, null, `a ${String(query)} query must not throw`);
  assert.deepEqual(hits, [], `a ${String(query)} query yields no hits`);
}

// A blank or whitespace-only query is equally empty.
for (const query of ['', '   ', '\n\t']) {
  assert.deepEqual(searchKnowledge([chunk('a')], query), [], 'a blank query yields no hits');
}

// --- 4. the limit stays predictable -------------------------------------
const tenFiles = Array.from({ length: 10 }, (_value, index) =>
  file(`f${index}`, { content: `deployment checklist staging step ${index}` }));
const tenChunks = buildKnowledgeIndex(tenFiles);
assert.equal(tenChunks.length, 10, 'the fixture indexes ten chunks');

assert.equal(searchKnowledge(tenChunks, 'deployment checklist', 3).length, 3, 'an explicit limit is honoured');
assert.equal(searchKnowledge(tenChunks, 'deployment checklist', 2.7).length, 2, 'a fractional limit is floored');
assert.equal(searchKnowledge(tenChunks, 'deployment checklist').length, 6, 'the documented default is six');
for (const limit of [0, -3, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, null, 'many']) {
  const hits = searchKnowledge(tenChunks, 'deployment checklist', limit);
  assert.equal(hits.length, 6, `the unusable limit ${String(limit)} falls back to the default`);
}

// --- 5. relevance ordering and the valid round trip ---------------------
const index = buildKnowledgeIndex([file('notes')]);
assert.equal(index.length, 1, 'a short document yields one chunk');
assert.equal(index[0].sourceName, 'notes.md');
assert.equal(index[0].index, 0);
assert.ok(index[0].tokens.includes('deployment'), 'the chunk carries its tokens');

const hits = searchKnowledge(index, 'deployment checklist');
assert.equal(hits.length, 1, 'the matching chunk is retrieved');
assert.ok(hits[0].score > 0, 'the hit carries a positive score');
assert.equal(hits[0].chunk.sourceId, 'notes');

const unrelated = searchKnowledge(index, 'quantum chromodynamics');
assert.deepEqual(unrelated, [], 'an unrelated query returns no hits');

const formatted = formatKnowledgeContext(hits);
assert.match(formatted, /^\[#1 notes\.md · chunk 1\]/, 'the formatted context names the source and chunk');
assert.match(formatted, /deployment checklist/, 'the formatted context carries the chunk text');
assert.equal(formatKnowledgeContext([]), '', 'no hits format as an empty string');

// A higher-scoring chunk sorts first.
const ranked = searchKnowledge([
  chunk('low', { text: 'staging', tokens: ['staging'] }),
  chunk('high', { text: 'deployment checklist staging', tokens: ['deployment', 'checklist', 'staging'] }),
], 'deployment checklist');
assert.equal(ranked[0].chunk.id, 'high', 'the better match sorts first');

// --- 6. formatting tolerates damaged hit rows ---------------------------
for (const damaged of [null, [null], ['junk'], [{ chunk: null }], [{ chunk: { text: 42 } }]]) {
  assert.doesNotThrow(() => formatKnowledgeContext(damaged), `formatting must tolerate ${JSON.stringify(damaged)?.slice(0, 40)}`);
}
assert.equal(formatKnowledgeContext(null), '', 'a null hit list formats as an empty string');

// --- 7. chunking still splits long documents ----------------------------
const longText = Array.from({ length: 40 }, (_value, index) => `Paragraph ${index}. ${'x'.repeat(200)}`).join('\n\n');
const longChunks = buildKnowledgeIndex([file('long', { content: longText })]);
assert.ok(longChunks.length > 1, 'a long document is split into several chunks');
assert.ok(longChunks.every((entry) => entry.text.length <= 1_800), 'each chunk respects the character cap');
assert.deepEqual(longChunks.map((entry) => entry.index), longChunks.map((_value, i) => i), 'chunk indexes are sequential');

// --- 8. the implementation must keep its guards -------------------------
const source = fs.readFileSync(path.join(repoRoot, MODULE), 'utf8');
assert.match(source, /function normalizeChunk\(entry: unknown\)/, 'the chunk validator must stay present');
assert.match(source, /function asText\(value: unknown\): string/, 'the text guard must stay present');
assert.match(source, /if \(!Array\.isArray\(files\)\) return \[\];/, 'indexing must reject a non-array input');
assert.match(source, /const DEFAULT_LIMIT = 6;/, 'the default limit must stay declared');
assert.doesNotMatch(
  source,
  /const queryTokens = normalizedTokens\(query\);/,
  'the unguarded query normalization must not return',
);

console.log('CHRIS_STUDIO_V2_4_KNOWLEDGE_RESILIENCE_PASSED');

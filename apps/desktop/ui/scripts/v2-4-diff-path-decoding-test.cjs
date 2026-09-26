// Regression tests: unified-diff parsing must handle real git output.
//
// Three defects were found by probing against actual `git diff` output:
//
//  1. Paths containing spaces were truncated. Git terminates a `---`/`+++` path
//     with a tab, and an unquoted path may contain spaces, so splitting the
//     `diff --git` header on whitespace produced "reports/q1" for
//     "my reports/q1 x.md". A reviewed patch could then be composed for a path
//     that does not exist, or silently omit the intended file.
//
//  2. Non-ASCII paths were mojibake. Git escapes them as octal UTF-8 bytes
//     (`"\344\270\255"`), so decoding escape-by-escape produced "ä¸­" instead
//     of "中" and the file would never match the real path.
//
//  3. Change counts were wrong whenever content began with `++` or `--`.
//     Skipping every line that looked like a file header discarded real changes:
//     `++i;` is emitted as `+++i;` and a SQL comment as `--- sql comment`.
const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = path.resolve(__dirname, '../../../../.tokenfence-test-build');
const session = require(path.join(buildRoot, 'features/projects/projectChangeSession.js'));

const { parseUnifiedDiff, composeSelectedPatch } = session;

function patchOf(lines) {
  return `${lines.join('\n')}\n`;
}

// --- 1. a path with spaces must survive verbatim ---------------------------
const spaced = patchOf([
  'diff --git a/my reports/q1 x.md b/my reports/q1 x.md',
  'index 3367afd..3e75765 100644',
  '--- a/my reports/q1 x.md\t',
  '+++ b/my reports/q1 x.md\t',
  '@@ -1 +1 @@',
  '-old',
  '+new',
]);
const spacedFiles = parseUnifiedDiff(spaced);
assert.equal(spacedFiles.length, 1, 'the spaced path must produce one file entry');
assert.equal(spacedFiles[0].path, 'my reports/q1 x.md', 'a spaced path must not be truncated');
assert.equal(spacedFiles[0].action, 'modify');
assert.equal(spacedFiles[0].additions, 1);
assert.equal(spacedFiles[0].deletions, 1);
assert.equal(composeSelectedPatch(spacedFiles, ['my reports/q1 x.md']).includes('diff --git a/my reports/q1 x.md'), true);

// --- 2. non-ASCII paths must decode from octal UTF-8 escapes ---------------
const cjk = patchOf([
  'diff --git "a/\\344\\270\\255\\346\\226\\207.md" "b/\\344\\270\\255\\346\\226\\207.md"',
  'index 1111111..2222222 100644',
  '--- "a/\\344\\270\\255\\346\\226\\207.md"',
  '+++ "b/\\344\\270\\255\\346\\226\\207.md"',
  '@@ -1 +1 @@',
  '-old',
  '+new',
]);
const cjkFiles = parseUnifiedDiff(cjk);
assert.equal(cjkFiles.length, 1);
assert.equal(cjkFiles[0].path, '中文.md', 'octal UTF-8 escapes must decode to the real path');
assert.equal(cjkFiles[0].newPath, '中文.md');
assert.equal(cjkFiles[0].oldPath, '中文.md');

// A quoted path that also contains a space must decode cleanly.
const quotedSpaced = patchOf([
  'diff --git "a/my reports/q1 x.md" "b/my reports/q1 x.md"',
  'index 1111111..2222222 100644',
  '--- "a/my reports/q1 x.md"',
  '+++ "b/my reports/q1 x.md"',
  '@@ -1 +1 @@',
  '-old',
  '+new',
]);
assert.equal(parseUnifiedDiff(quotedSpaced)[0].path, 'my reports/q1 x.md');

// A tab inside the path is escaped, so it must not be mistaken for the delimiter.
const escapedTab = patchOf([
  'diff --git "a/tab\\tname.md" "b/tab\\tname.md"',
  'index 1111111..2222222 100644',
  '--- "a/tab\\tname.md"',
  '+++ "b/tab\\tname.md"',
  '@@ -1 +1 @@',
  '-old',
  '+new',
]);
assert.equal(parseUnifiedDiff(escapedTab)[0].path, 'tab\tname.md', 'an escaped tab must stay part of the path');

// --- 3. content beginning with ++ / -- must still be counted --------------
const counter = patchOf([
  'diff --git a/counter.cpp b/counter.cpp',
  'new file mode 100644',
  'index 0000000..5b5e037',
  '--- /dev/null',
  '+++ b/counter.cpp',
  '@@ -0,0 +1 @@',
  '+++i;',
]);
const counterFiles = parseUnifiedDiff(counter);
assert.equal(counterFiles[0].action, 'add');
assert.equal(counterFiles[0].additions, 1, 'a `+++i;` content line must count as one addition');
assert.equal(counterFiles[0].deletions, 0);

const sqlComment = patchOf([
  'diff --git a/comment.sql b/comment.sql',
  'index 7c7ed4b..2018e51 100644',
  '--- a/comment.sql',
  '+++ b/comment.sql',
  '@@ -1 +1,2 @@',
  ' -- sql comment',
  '+-- sql comment changed',
]);
const sqlFiles = parseUnifiedDiff(sqlComment);
assert.equal(sqlFiles[0].additions, 1, 'a `+-- comment` line must count as one addition');
assert.equal(sqlFiles[0].deletions, 0, 'a context line must not count as a deletion');

const longRule = patchOf([
  'diff --git a/style.css b/style.css',
  'index 1111111..2222222 100644',
  '--- a/style.css',
  '+++ b/style.css',
  '@@ -1,3 +1,3 @@',
  ' /* header */',
  '--- remove this rule',
  '+++ add this rule',
]);
const longRuleFiles = parseUnifiedDiff(longRule);
assert.equal(longRuleFiles[0].deletions, 1, 'a `---` content line must count as one deletion');
assert.equal(longRuleFiles[0].additions, 1, 'a `+++` content line must count as one addition');

// --- 4. deleted files, added files and renames ---------------------------
const deleted = parseUnifiedDiff(patchOf([
  'diff --git a/gone.md b/gone.md',
  'deleted file mode 100644',
  'index 4444444..0000000',
  '--- a/gone.md',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-remove',
]));
assert.equal(deleted[0].action, 'delete');
assert.equal(deleted[0].path, 'gone.md');
assert.equal(deleted[0].newPath, undefined, '/dev/null must not become a new path');
assert.equal(deleted[0].deletions, 1);

const added = parseUnifiedDiff(patchOf([
  'diff --git a/fresh.ts b/fresh.ts',
  'new file mode 100644',
  'index 0000000..3333333',
  '--- /dev/null',
  '+++ b/fresh.ts',
  '@@ -0,0 +1 @@',
  '+created',
]));
assert.equal(added[0].action, 'add');
assert.equal(added[0].path, 'fresh.ts');
assert.equal(added[0].oldPath, undefined, '/dev/null must not become an old path');

// A content-free rename has no `---`/`+++` lines, so the spaced header is the
// only source of the new path.
const renamed = parseUnifiedDiff(patchOf([
  'diff --git a/old name.md b/new name.md',
  'similarity index 100%',
  'rename from old name.md',
  'rename to new name.md',
]));
assert.equal(renamed[0].action, 'rename');
assert.equal(renamed[0].path, 'new name.md', 'a content-free rename must use the header new path');

// --- 5. multiple files and selective composition still work --------------
const multi = parseUnifiedDiff(patchOf([
  'diff --git a/one.md b/one.md',
  'index 1111111..2222222 100644',
  '--- a/one.md',
  '+++ b/one.md',
  '@@ -1 +1 @@',
  '-a',
  '+b',
  'diff --git a/two.md b/two.md',
  'index 3333333..4444444 100644',
  '--- a/two.md',
  '+++ b/two.md',
  '@@ -1 +1 @@',
  '-c',
  '+d',
]));
assert.deepEqual(multi.map((file) => file.path), ['one.md', 'two.md']);
const selected = composeSelectedPatch(multi, ['two.md']);
assert.match(selected, /diff --git a\/two\.md b\/two\.md/);
assert.doesNotMatch(selected, /one\.md/);
assert.ok(selected.endsWith('\n'), 'a composed patch must end with a newline');

// --- 6. malformed input must not throw ------------------------------------
assert.deepEqual(parseUnifiedDiff(''), []);
assert.deepEqual(parseUnifiedDiff('no patch here'), []);
assert.deepEqual(parseUnifiedDiff('diff --git '), [], 'a header without paths must be dropped');

console.log('CHRIS_STUDIO_V2_4_DIFF_PATH_DECODING_PASSED');

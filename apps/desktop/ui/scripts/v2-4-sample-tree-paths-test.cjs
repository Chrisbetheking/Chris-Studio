// Regression tests: the sample file tree must produce real paths.
//
// Chris Studio is a macOS app, but `buildMockFileTree` hard-coded a backslash
// when joining paths. On macOS `\` is an ordinary filename character rather than
// a separator, so 16 of the 17 synthetic nodes carried a path that no file API
// could resolve.
//
// Nested nodes also stored only their own name in `relativePath`, so
// `src/index.ts` was reported as `index.ts` and was indistinguishable from a
// root-level file. Both fields must describe the node's real position.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');

function loadModule(relative) {
  const filePath = path.join(repoRoot, relative);
  const output = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
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

const tree = loadModule('apps/desktop/ui/src/data/project-file-tree.ts');
const { buildMockFileTree, flattenFileTree, getFileType, isSupportedFile } = tree;

const MAC_ROOT = '/Users/kevinwong/Documents/GitHub/Chris-Studio';

// --- 1. macOS project paths must use forward slashes ---------------------
const macNodes = flattenFileTree(buildMockFileTree(MAC_ROOT));
assert.ok(macNodes.length >= 17, 'the sample tree must still contain every node');
assert.equal(
  macNodes.filter((node) => node.path.includes('\\')).length,
  0,
  'no synthetic macOS path may contain a backslash',
);

const root = macNodes[0];
assert.equal(root.path, MAC_ROOT, 'the root must keep the project path verbatim');
assert.equal(root.name, 'Chris-Studio', 'the root name comes from the last path segment');
assert.equal(root.type, 'directory');
assert.equal(root.relativePath, '');

const findByName = (name) => macNodes.find((node) => node.name === name);
assert.equal(findByName('src').path, `${MAC_ROOT}/src`);
assert.equal(findByName('index.ts').path, `${MAC_ROOT}/src/index.ts`);
assert.equal(findByName('components').path, `${MAC_ROOT}/src/components`);
assert.equal(findByName('Header.tsx').path, `${MAC_ROOT}/src/components/Header.tsx`);
assert.equal(findByName('README.md').path, `${MAC_ROOT}/docs/README.md`);
assert.equal(findByName('package.json').path, `${MAC_ROOT}/package.json`);

// --- 2. relative paths must keep the intermediate directories ------------
assert.equal(findByName('src').relativePath, 'src');
assert.equal(findByName('index.ts').relativePath, 'src/index.ts', 'a nested file must keep its directory prefix');
assert.equal(findByName('Header.tsx').relativePath, 'src/components/Header.tsx', 'deep nesting must be preserved');
assert.equal(findByName('components').relativePath, 'src/components');
assert.equal(findByName('README.md').relativePath, 'docs/README.md');
assert.equal(findByName('package.json').relativePath, 'package.json');

// Every child path must extend its parent's path, and every relative path must
// extend its parent's relative path.
function assertHierarchy(nodes, parentPath, parentRelative) {
  for (const node of nodes) {
    if (parentPath !== null) {
      assert.ok(node.path.startsWith(`${parentPath}/`), `${node.path} must live under ${parentPath}`);
      const expectedRelative = parentRelative ? `${parentRelative}/${node.name}` : node.name;
      assert.equal(node.relativePath, expectedRelative, `${node.name} must extend ${parentRelative || '(root)'}`);
    }
    if (node.children) assertHierarchy(node.children, node.path, node.relativePath);
  }
}
assertHierarchy(buildMockFileTree(MAC_ROOT), null, '');

// --- 3. a trailing separator must be normalized away --------------------
assert.equal(buildMockFileTree('/tmp/demo/')[0].path, '/tmp/demo');
assert.equal(buildMockFileTree('/tmp/demo///')[0].path, '/tmp/demo');
assert.equal(buildMockFileTree('/tmp/demo/')[0].name, 'demo');

// --- 4. Windows-style input still resolves as before --------------------
const windowsNodes = flattenFileTree(buildMockFileTree('C:\\Users\\me\\proj'));
assert.ok(windowsNodes.some((node) => node.path.includes('\\')), 'a Windows root must keep backslash joining');
assert.equal(windowsNodes[0].path, 'C:\\Users\\me\\proj');
assert.equal(windowsNodes[0].name, 'proj');
assert.equal(findByNameIn(windowsNodes, 'src').path, 'C:\\Users\\me\\proj\\src');
// Relative paths stay separator-independent so they can be compared across OSes.
assert.equal(findByNameIn(windowsNodes, 'index.ts').relativePath, 'src/index.ts');

function findByNameIn(nodes, name) {
  return nodes.find((node) => node.name === name);
}

// --- 5. degenerate roots must not throw --------------------------------
for (const input of ['', '/', '///', '   ']) {
  const built = buildMockFileTree(input);
  assert.equal(Array.isArray(built), true, `building a tree must not throw for ${JSON.stringify(input)}`);
  assert.ok(built.length === 1, 'a single root node is returned');
  assert.equal(typeof built[0].name, 'string');
  assert.ok(built[0].name.length > 0, `the root name must never be empty for ${JSON.stringify(input)}`);
  assert.ok(flattenFileTree(built).length > 10, 'the sample tree stays complete');
}

// --- 6. every node must be usable -------------------------------------
const allNodes = flattenFileTree(buildMockFileTree(MAC_ROOT));
assert.equal(new Set(allNodes.map((node) => node.id)).size, allNodes.length, 'every node needs its own id');
for (const node of allNodes) {
  assert.equal(typeof node.id, 'string');
  assert.ok(node.id.length > 0);
  assert.ok(['file', 'directory'].includes(node.type), `${node.name} must declare a type`);
  assert.equal(typeof node.path, 'string');
  assert.equal(typeof node.relativePath, 'string');
  if (node.type === 'file') {
    assert.equal(typeof node.sizeBytes, 'number', `${node.name} must carry a size`);
    assert.equal(typeof node.fileType, 'string', `${node.name} must carry a file type`);
  } else {
    assert.equal(node.fileType, undefined, 'a directory must not claim a file type');
  }
}

// --- 7. the pre-existing type detection must not move -------------------
assert.equal(getFileType('a.ts'), 'ts');
assert.equal(getFileType('noext'), 'other');
assert.equal(getFileType('.env'), 'env');
assert.equal(getFileType('a.TS'), 'ts');
assert.equal(getFileType(''), 'other');
assert.equal(isSupportedFile('a.ts'), true);
assert.equal(isSupportedFile('a.png'), false);

// --- 8. the exported limits must stay stable ---------------------------
assert.equal(tree.MAX_FILE_SIZE_BYTES, 20 * 1024 * 1024);
assert.equal(tree.MAX_SCAN_FILES, 1000);
assert.equal(tree.MAX_SCAN_DEPTH, 6);
assert.equal(tree.MAX_CONTEXT_FILES, 50);

// --- 9. the source must keep the separator derivation ------------------
const source = fs.readFileSync(path.join(repoRoot, 'apps/desktop/ui/src/data/project-file-tree.ts'), 'utf8');
assert.match(source, /function separatorFor\(projectPath: string\): string/, 'the separator helper must stay present');
assert.doesNotMatch(source, /path: projectPath \+ "\\\\" \+ name/, 'the hard-coded backslash join must not return');
assert.match(source, /const relativePath = parentRelative \? `\$\{parentRelative\}\/\$\{name\}` : name;/, 'relative paths must be composed from the parent');

console.log('CHRIS_STUDIO_V2_4_SAMPLE_TREE_PATHS_PASSED');

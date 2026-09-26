// Regression tests: the product version must have one source of truth.
//
// The version was hard-coded in three unrelated renderer files with a stale
// `2.1.0` literal, while the build manifest said `2.4.0-alpha.2`:
//
//   features/updates/updateClient.ts       currentVersion: '2.1.0'
//   features/platform/desktopClient.ts     appVersion: '2.1.0' / '2.1.0-web-preview'
//   screens/UpdatesScreen.tsx              `Installed: ${... ?? '2.1.0'}`
//
// The update screen therefore told the user a 2.4.0-alpha.2 build was 2.1.0 —
// and a release bump would have left the literals behind again.
//
// `app/productVersion.ts` is now the single source, kept in sync with
// `apps/desktop/ui/package.json` by the overlay finalizer and verified on every
// build by `scripts/sync-product-metadata.cjs`.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const VERSION_MODULE = 'apps/desktop/ui/src/app/productVersion.ts';
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'apps/desktop/ui/package.json'), 'utf8'));

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

const version = loadCompiled(path.join(repoRoot, VERSION_MODULE));

// --- 1. the constant matches the build manifest -------------------------
assert.equal(
  version.PRODUCT_VERSION,
  manifest.version,
  `the renderer version (${version.PRODUCT_VERSION}) must match the desktop manifest (${manifest.version})`,
);
assert.doesNotMatch(version.PRODUCT_VERSION, /^v/, 'the constant carries no leading v');
assert.match(version.PRODUCT_VERSION, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, 'the constant is a semver string');

// --- 2. the derived helpers agree with it -------------------------------
assert.equal(version.productVersionLabel(), `v${manifest.version} · macOS`);
assert.equal(version.productVersionTag(), `v${manifest.version}`);
assert.equal(version.previewVersion(), `${manifest.version}-web-preview`);
// The tag strips the platform suffix the label keeps.
assert.doesNotMatch(version.productVersionTag(), /macOS/);
assert.match(version.productVersionLabel(), /macOS/);

// --- 3. no stale literal remains in the renderer ------------------------
const STALE = `'2.1.0'`;
const RENDERER_FILES = [
  'apps/desktop/ui/src/features/updates/updateClient.ts',
  'apps/desktop/ui/src/features/platform/desktopClient.ts',
  'apps/desktop/ui/src/screens/UpdatesScreen.tsx',
  'apps/desktop/ui/src/data/computer-use.ts',
];
for (const relative of RENDERER_FILES) {
  const source = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  assert.ok(!source.includes(STALE), `${relative} must not carry the retired ${STALE} literal`);
  assert.ok(
    !source.includes(`"2.1.0"`),
    `${relative} must not carry the retired "2.1.0" literal`,
  );
}

// The three consumers must read the shared constant instead.
assert.match(
  fs.readFileSync(path.join(repoRoot, 'apps/desktop/ui/src/features/updates/updateClient.ts'), 'utf8'),
  /import \{ PRODUCT_VERSION \} from '\.\.\/\.\.\/app\/productVersion';/,
  'the update client must import the shared version',
);
assert.match(
  fs.readFileSync(path.join(repoRoot, 'apps/desktop/ui/src/features/platform/desktopClient.ts'), 'utf8'),
  /import \{ PRODUCT_VERSION, previewVersion \} from '\.\.\/\.\.\/app\/productVersion';/,
  'the platform client must import the shared version',
);
assert.match(
  fs.readFileSync(path.join(repoRoot, 'apps/desktop/ui/src/screens/UpdatesScreen.tsx'), 'utf8'),
  /import \{ PRODUCT_VERSION \} from '\.\.\/app\/productVersion';/,
  'the updates screen must import the shared version',
);
assert.match(
  fs.readFileSync(path.join(repoRoot, 'apps/desktop/ui/src/data/computer-use.ts'), 'utf8'),
  /import \{ PRODUCT_VERSION \} from "\.\.\/app\/productVersion";/,
  'the Computer Use diagnostics must import the shared version',
);

// Only one module may declare the constant.
const DECLARATIONS = [
  'apps/desktop/ui/src/app/productVersion.ts',
  'apps/desktop/ui/src/data/computer-use.ts',
  'apps/desktop/ui/src/features/updates/updateClient.ts',
  'apps/desktop/ui/src/features/platform/desktopClient.ts',
  'apps/desktop/ui/src/screens/UpdatesScreen.tsx',
];
const declaring = DECLARATIONS.filter((relative) => {
  const source = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  return /export const PRODUCT_VERSION = /.test(source) || /^const PRODUCT_VERSION = /m.test(source);
});
assert.deepEqual(
  declaring,
  ['apps/desktop/ui/src/app/productVersion.ts'],
  'exactly one module may declare the version constant',
);

// --- 4. the synchronizer keeps the constant aligned ---------------------
const sync = require(path.join(repoRoot, 'apps/desktop/ui/scripts/sync-product-metadata.cjs'));
assert.equal(typeof sync.synchronizeProductVersion, 'function', 'the synchronizer must be exported');

const fixture = "export const PRODUCT_VERSION = '1.2.3';\nexport function productVersionLabel() { return `v${PRODUCT_VERSION} · macOS`; }\n";
const synchronised = sync.synchronizeProductVersion(fixture, '2.4.0-alpha.2');
assert.match(synchronised, /export const PRODUCT_VERSION = '2\.4\.0-alpha\.2';/);
assert.equal(
  sync.synchronizeProductVersion(synchronised, '2.4.0-alpha.2'),
  synchronised,
  'synchronizing is idempotent',
);
// A file without the declaration is a hard error rather than a silent no-op.
assert.throws(
  () => sync.synchronizeProductVersion('export const OTHER = 1;\n', '2.4.0-alpha.2'),
  /Cannot synchronize the product version constant/,
);

// --- 5. the real file is already synchronized ---------------------------
const realSource = fs.readFileSync(path.join(repoRoot, VERSION_MODULE), 'utf8');
assert.equal(
  sync.synchronizeProductVersion(realSource, manifest.version),
  realSource,
  'the committed version module must already match the manifest',
);

// --- 6. the finalizer and the release workflow know the file ------------
const finalizer = fs.readFileSync(path.join(repoRoot, 'scripts/finalize-v2.4.0-alpha.2.cjs'), 'utf8');
assert.match(
  finalizer,
  /\['src\/app\/productVersion\.ts', \(source\) => sync\.synchronizeProductVersion\(source, VERSION\)\]/,
  'the overlay finalizer must synchronize the version module',
);
const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/tokenfence-macos.yml'), 'utf8');
assert.match(
  workflow,
  /apps\/desktop\/ui\/src\/app\/productVersion\\\.ts/,
  'the release allowlist must cover the version module',
);
const metadataScript = fs.readFileSync(path.join(repoRoot, 'apps/desktop/ui/scripts/sync-product-metadata.cjs'), 'utf8');
assert.match(
  metadataScript,
  /verifyFile\(path\.join\(UI_ROOT, 'src\/app\/productVersion\.ts'\), \(source\) => synchronizeProductVersion\(source, version\)\);/,
  'the metadata check must verify the version module',
);

console.log('CHRIS_STUDIO_V2_4_PRODUCT_VERSION_SOURCE_PASSED');

// Contract test: which shared-package modules must stay byte-identical.
//
// The desktop workspace imports `@tokenfence/shared` from `packages/shared`,
// while the Android workspace keeps its own `apps/android/src/shared` copies and
// resolves them through the `@shared/*` path mapping. Some of those copies are
// intentionally a lighter variant (the Android provider catalogue, for example),
// but the safety-critical modules must not drift: a guard, path or archive fix
// that lands on one side only leaves the other side exposed.
//
// A real drift was found here: `apps/android/src/shared/types.ts` had lost the
// optional `contextWindow?: number` field that `packages/shared/src/types.ts`
// still declared, so the Android copy described a different shape than the one
// the shared modules actually produce.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../../..');
const SHARED = 'packages/shared/src';
const ANDROID = 'apps/android/src/shared';

/**
 * Modules that must stay byte-identical on both sides.
 *
 * These carry the safety and routing behaviour the two workspaces share. Their
 * copies deliberately avoid workspace-specific imports so the comparison is
 * exact: a difference is always a defect, never configuration.
 */
const MIRRORED_MODULES = [
  'archive.ts',
  'budget.ts',
  'citation.ts',
  'fallback.ts',
  'fileRouter.ts',
  'guard.ts',
  'storage.ts',
  'types.ts',
];

/**
 * Modules that exist only in the shared package, or that are intentionally a
 * different shape on Android. Documented so the list above is not expanded by
 * accident.
 */
const INTENTIONALLY_DIFFERENT = [
  'index.ts',
  'installed-models.ts',
  'model-registry.ts',
  'providers.ts',
];

const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

// --- 1. the mirrored set must exist on both sides ------------------------
for (const module of MIRRORED_MODULES) {
  assert.ok(fs.existsSync(path.join(repoRoot, SHARED, module)), `${SHARED}/${module} must exist`);
  assert.ok(fs.existsSync(path.join(repoRoot, ANDROID, module)), `${ANDROID}/${module} must exist`);
}

// --- 2. mirrored modules must be byte-identical --------------------------
for (const module of MIRRORED_MODULES) {
  const shared = read(`${SHARED}/${module}`);
  const android = read(`${ANDROID}/${module}`);
  assert.equal(
    android,
    shared,
    `${ANDROID}/${module} has drifted from ${SHARED}/${module}; apply the change to both copies`,
  );
}

// --- 3. the deliberately divergent modules must stay out of the mirror set
for (const module of INTENTIONALLY_DIFFERENT) {
  assert.ok(
    !MIRRORED_MODULES.includes(module),
    `${module} is intentionally workspace-specific and must not be mirrored`,
  );
}
// They may exist on both sides, but then they must genuinely differ — otherwise
// they belong in the mirrored list instead.
for (const module of INTENTIONALLY_DIFFERENT) {
  const sharedPath = path.join(repoRoot, SHARED, module);
  const androidPath = path.join(repoRoot, ANDROID, module);
  if (!fs.existsSync(sharedPath) || !fs.existsSync(androidPath)) continue;
  assert.notEqual(
    read(`${SHARED}/${module}`),
    read(`${ANDROID}/${module}`),
    `${module} is listed as divergent but the copies are identical; move it into MIRRORED_MODULES`,
  );
}

// --- 4. the Android type surface must keep the shared ProviderModel shape
const sharedTypes = read(`${SHARED}/types.ts`);
const androidTypes = read(`${ANDROID}/types.ts`);
assert.match(sharedTypes, /contextWindow\?: number;/, 'ProviderModel must declare its context window');
assert.match(androidTypes, /contextWindow\?: number;/, 'the Android ProviderModel must declare it too');

// --- 5. safety-critical behaviour must be present on both sides ----------
// The guard must redact credential bodies rather than only their prefixes, and
// the Android copy must carry the same patterns.
for (const relative of [`${SHARED}/guard.ts`, `${ANDROID}/guard.ts`]) {
  const source = read(relative);
  assert.match(source, /PATTERNS/, `${relative} must define its detection patterns`);
  assert.match(source, /bearer\\s\+/, `${relative} must consume the full bearer credential`);
  assert.match(source, /\[A-Za-z0-9_\]\{16,\}/, `${relative} must match token bodies, not just prefixes`);
}

// The path guard must reject traversal on both sides.
for (const relative of [`${SHARED}/storage.ts`, `${ANDROID}/storage.ts`]) {
  const source = read(relative);
  assert.match(source, /segment === '\.\.'/, `${relative} must reject the traversal segment`);
  assert.match(source, /Unsafe storage path rejected/, `${relative} must refuse an unsafe join`);
}

// The archive must strip raw matches on both sides.
for (const relative of [`${SHARED}/archive.ts`, `${ANDROID}/archive.ts`]) {
  const source = read(relative);
  assert.match(source, /match: finding\.redacted/, `${relative} must replace raw matches when sanitizing`);
}

// The router must normalize MIME values on both sides.
for (const relative of [`${SHARED}/fileRouter.ts`, `${ANDROID}/fileRouter.ts`]) {
  const source = read(relative);
  assert.match(source, /split\(';', 1\)/, `${relative} must strip MIME parameters`);
}

// --- 6. no workspace-specific import may enter a mirrored module ---------
for (const module of MIRRORED_MODULES) {
  const source = read(`${SHARED}/${module}`);
  for (const line of source.split('\n')) {
    const code = line.replace(/\/\/.*$/, '');
    if (!/\bimport\b/.test(code)) continue;
    assert.doesNotMatch(
      code,
      /@shared\//,
      `${SHARED}/${module} must not import through the Android @shared mapping`,
    );
  }
}

console.log('CHRIS_STUDIO_V2_4_SHARED_MIRROR_PASSED');

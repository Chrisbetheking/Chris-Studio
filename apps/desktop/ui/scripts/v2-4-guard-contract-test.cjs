// Contract test: the release guards must stay wired into the automation.
//
// background: scripts/source_guard.js and scripts/release_sanity.js existed for
// many releases while asserting a product layout that no longer existed, so both
// always failed and neither was ever called from CI. That is how a commit could
// delete 284 source files and still land on main. This test pins the guards to
// the workflows and pins the workflows to the checks that matter.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

const guard = read('scripts/source_guard.js');
const sanity = read('scripts/release_sanity.js');
const ci = read('.github/workflows/ci.yml');
const release = read('.github/workflows/tokenfence-macos.yml');
const packageJson = read('package.json');

// --- guards must describe the current product, not a retired one ------------
assert.match(guard, /Overlay completeness/, 'The source guard must verify the overlay file set.');
assert.match(guard, /Native command registration/, 'The source guard must verify frontend invoke targets are registered.');
assert.match(guard, /apps\/desktop\/src-tauri\/src\/unified_agent_native\.rs/, 'The overlay list must include the native Unified Agent module.');
assert.match(guard, /scripts\/verify-public-npm-locks\.cjs/, 'The overlay list must include the lockfile verifier the release workflow runs.');
assert.match(guard, /scripts\/package-macos-release\.sh/, 'The overlay list must include the macOS packaging script.');
assert.match(guard, /Reviewed transaction safety/, 'The source guard must keep the reviewed-transaction safety contract.');
assert.match(guard, /Unified Agent runtime/, 'The source guard must keep the Unified Agent runtime contract.');

// The guard must not carry retired v1.5.x assertions that can never pass again.
assert.doesNotMatch(guard, /VERSION is NOT v1\.5\.5/, 'Retired v1.5.5 version assertion must not return.');
assert.doesNotMatch(guard, /MISSING ping_tauri/, 'Retired ping_tauri assertion must not return.');
assert.doesNotMatch(guard, /ComputerUseAgentStatus/, 'Retired v1.5.6 Computer Use data assertions must not return.');

assert.match(sanity, /macOS artifact naming/, 'The release sanity check must verify macOS artifact names.');
assert.match(sanity, /Bilingual key parity/, 'The release sanity check must verify bilingual key parity.');
assert.doesNotMatch(sanity, /TokenFence-Studio-Windows/, 'Windows portable ZIP assertions must not return.');
assert.doesNotMatch(sanity, /tokenfence-studio/, 'The retired package name assertion must not return.');

// --- both guards must be runnable through npm scripts -----------------------
assert.match(packageJson, /"guard:source": "node scripts\/source_guard\.js"/, 'guard:source must stay available.');
assert.match(packageJson, /"release:sanity": "node scripts\/release_sanity\.js"/, 'release:sanity must stay available.');

// --- CI must gate on the guards before the expensive jobs -------------------
assert.match(ci, /source-integrity:/, 'CI must define the source-integrity job.');
assert.match(ci, /run: node scripts\/source_guard\.js/, 'CI must run the source guard.');
assert.match(ci, /node scripts\/release_sanity\.js "v\$\{VERSION\}"/, 'CI must run the release sanity check against the desktop UI version.');
assert.match(ci, /needs: source-integrity/, 'The desktop UI job must depend on the integrity gate.');

// The version read in CI must come from the desktop UI manifest, which is the
// value the overlay finalizer synchronizes.
assert.match(ci, /require\('\.\/apps\/desktop\/ui\/package\.json'\)\.version/, 'CI must read the version from the desktop UI manifest.');

// --- the release workflow must gate on the same guards ----------------------
assert.match(release, /node scripts\/source_guard\.js/, 'The release workflow must run the source guard.');
assert.match(release, /node scripts\/release_sanity\.js "v\$\{VERSION\}"/, 'The release workflow must run the release sanity check.');
assert.match(release, /node scripts\/verify-public-npm-locks\.cjs/, 'The release workflow must keep verifying public npm lockfiles.');

// --- the desktop UI suite must still be the documented entry point ----------
const desktopPackageJson = read('apps/desktop/ui/package.json');
assert.match(desktopPackageJson, /"test:core": "node scripts\/run-core-tests\.cjs"/, 'The desktop UI package must keep the test:core entry point.');
assert.match(desktopPackageJson, /"overlay:finalize": "node \.\.\/\.\.\/\.\.\/scripts\/finalize-v2\.4\.0-alpha\.2\.cjs"/, 'The desktop UI package must finalize the overlay before typecheck/test/build.');
assert.match(release, /test:core/, 'The release workflow must keep running test:core.');

console.log('CHRIS_STUDIO_V2_4_GUARD_CONTRACT_PASSED');

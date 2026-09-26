// Regression tests: a screenshot pixel coordinate must be converted to the
// logical point macOS actually clicks.
//
// On a Retina display `screencapture` writes a physical-resolution image while
// `System Events ... click at {x, y}` addresses logical points. Measured on this
// machine: the capture is 2940×1912 and the display is 1470×956 — exactly 2×.
//
// The Unified Agent read its coordinate off the screenshot and passed it straight
// to `clickPointer`, so every approved coordinate click landed at twice the
// intended position. The wrong click silently hit the wrong target, which is the
// worst outcome for an action the user just approved.
//
// `screenScale.ts` derives the ratio from the captured image and the logical
// display size. A ratio it cannot trust falls back to 1 (no conversion) rather
// than moving every click with a guessed factor.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const MODULE = 'apps/desktop/ui/src/features/computer-use/screenScale.ts';

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

const scale = loadCompiled(path.join(repoRoot, MODULE));
const { MAX_SCREEN_SCALE, pngPixelSize, resolveScreenshotScale, toLogicalPoint } = scale;

/** Build a data URL whose PNG header declares the given pixel size. */
function pngDataUrl(width, height) {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);          // IHDR payload length
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header[24] = 8;                        // bit depth
  header[25] = 6;                        // colour type (RGBA)
  return `data:image/png;base64,${header.toString('base64')}`;
}

// --- 1. the header reader ---
assert.deepEqual(pngPixelSize(pngDataUrl(2940, 1912)), { width: 2940, height: 1912 });
assert.deepEqual(pngPixelSize(pngDataUrl(1, 1)), { width: 1, height: 1 });
assert.deepEqual(pngPixelSize(pngDataUrl(1_000_000, 999_999)), { width: 1_000_000, height: 999_999 });

for (const [label, input] of [
  ['null', null],
  ['undefined', undefined],
  ['a plain string', 'hello'],
  ['a non-PNG data url', 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='],
  ['a truncated payload', 'data:image/png;base64,AAAA'],
  ['a payload with the wrong signature', `data:image/png;base64,${Buffer.alloc(40).toString('base64')}`],
]) {
  assert.equal(pngPixelSize(input), undefined, `${label} must not yield a pixel size`);
}

// --- 2. the measured Retina ratio ---------------------------------------
const retina = { width: 2940, height: 1912 };
const logical = { width: 1470, height: 956 };
assert.equal(resolveScreenshotScale(retina, logical), 2, 'the measured Retina capture resolves to 2x');
assert.equal(resolveScreenshotScale({ width: 1470, height: 956 }, logical), 1, 'a 1x capture resolves to 1x');
assert.equal(resolveScreenshotScale({ width: 4410, height: 2868 }, logical), 3, 'a 3x capture resolves to 3x');
assert.equal(MAX_SCREEN_SCALE, 4, 'the supported ratio ceiling stays declared');

// Anything the function cannot trust must fall back to no conversion.
for (const [label, pixel, size] of [
  ['a missing capture', undefined, logical],
  ['a missing display size', retina, undefined],
  ['a zero-width display', retina, { width: 0, height: 956 }],
  ['a negative display', retina, { width: -1470, height: -956 }],
  ['mismatched axes', { width: 2940, height: 1000 }, logical],
  ['a non-integral ratio', { width: 3000, height: 2000 }, logical],
  ['a ratio beyond the ceiling', { width: 30000, height: 20000 }, logical],
  ['a sub-1× ratio', { width: 500, height: 400 }, logical],
  ['NaN dimensions', { width: Number.NaN, height: Number.NaN }, logical],
]) {
  assert.equal(resolveScreenshotScale(pixel, size), 1, `${label} must fall back to 1x`);
}

// --- 3. the conversion itself -------------------------------------------
// The centre of a Retina capture is the centre of the display.
assert.equal(toLogicalPoint(1470, 2, logical.width), 735);
assert.equal(toLogicalPoint(956, 2, logical.height), 478);
// Corners survive the round trip and stay inside the display.
assert.equal(toLogicalPoint(0, 2, logical.width), 0);
assert.equal(toLogicalPoint(2939, 2, logical.width), 1470, 'the last pixel clamps into the display');
assert.equal(toLogicalPoint(1911, 2, logical.height), 956);
// A 1x display is untouched.
assert.equal(toLogicalPoint(735, 1, logical.width), 735);
// Out-of-range and unusable inputs are clamped rather than passed through.
assert.equal(toLogicalPoint(99_999, 2, logical.width), 1470);
assert.equal(toLogicalPoint(-50, 2, logical.width), 0);
assert.equal(toLogicalPoint(Number.NaN, 2, logical.width), 0);
assert.equal(toLogicalPoint(100, Number.NaN, logical.width), 100, 'a bad ratio leaves the value alone');
assert.equal(toLogicalPoint(100, 0, logical.width), 100, 'a zero ratio is treated as no conversion');
assert.equal(toLogicalPoint(100, 2, Number.NaN), 50, 'a bad extent still divides correctly');

// --- 4. the click path must convert -------------------------------------
const registry = fs.readFileSync(
  path.join(repoRoot, 'apps/desktop/ui/src/features/unified-agent/toolRegistry.ts'),
  'utf8',
);
assert.match(
  registry,
  /import \{ pngPixelSize, resolveScreenshotScale, toLogicalPoint, type PixelSize \} from '\.\.\/computer-use\/screenScale';/,
  'the tool registry must import the coordinate conversion',
);
assert.match(registry, /const screenshotPixels = pngPixelSize\(context\.latestScreenshotDataUrl\);/, 'the click path must read the capture size');
assert.match(registry, /const scale = resolveScreenshotScale\(screenshotPixels, logicalSize\);/, 'the click path must resolve the ratio');
assert.match(registry, /const pointX = toLogicalPoint\(x, scale, logicalSize\?\.width \?\? x\);/, 'the x coordinate must be converted');
assert.match(registry, /const pointY = toLogicalPoint\(y, scale, logicalSize\?\.height \?\? y\);/, 'the y coordinate must be converted');
assert.match(
  registry,
  /clickPointer\(pointX, pointY, true\)/,
  'the native click must receive the converted points, not the raw pixels',
);
assert.doesNotMatch(
  registry,
  /clickPointer\(x, y, true\)/,
  'the unconverted click must not return',
);
// The approval prompt must disclose the conversion so the user sees both values.
assert.match(registry, /at \$\{scale\}×/, 'the approval summary must disclose the ratio');

// --- 5. the implementation must keep its guards -------------------------
const source = fs.readFileSync(path.join(repoRoot, MODULE), 'utf8');
assert.match(source, /export function pngPixelSize\(dataUrl: string \| undefined\)/, 'the header reader must stay exported');
assert.match(source, /export function resolveScreenshotScale\(/, 'the ratio resolver must stay exported');
assert.match(source, /export function toLogicalPoint\(/, 'the converter must stay exported');
assert.match(source, /export const MAX_SCREEN_SCALE = 4;/, 'the ratio ceiling must stay declared');

console.log('CHRIS_STUDIO_V2_4_SCREEN_SCALE_PASSED');

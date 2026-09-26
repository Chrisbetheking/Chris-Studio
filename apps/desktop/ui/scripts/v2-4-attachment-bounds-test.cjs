// Regression tests for attachment extraction boundaries.
//
// `processFile` keeps at most MAX_CONTENT_CHARS of extracted text. That cap used
// to be applied silently: a large PDF, OCR result or DOCX was cut in half while
// the composer showed the attachment as fully read, so the model reasoned over an
// incomplete document without anyone being told. Truncation is now reported
// through the same `warnings` channel the UI already surfaces.
const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = path.resolve(__dirname, '../../../../.tokenfence-test-build');

// The processor reaches into the app store (for id generation), which expects a
// browser-ish environment.
class StorageMock {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}
global.window = { localStorage: new StorageMock(), dispatchEvent() {} };
global.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
if (typeof global.crypto === 'undefined') global.crypto = require('node:crypto').webcrypto;

const processor = require(path.join(buildRoot, 'features/files/fileProcessor.js'));
const { classifyFile, processFile, MAX_CONTENT_CHARS } = processor;

// --- 1. the exported cap must be the documented one ------------------------
assert.equal(typeof MAX_CONTENT_CHARS, 'number');
assert.equal(MAX_CONTENT_CHARS, 1_500_000, 'the extraction cap must stay explicitly defined');

// --- 2. classification must not depend on the browser MIME type ------------
const classifyCases = [
  ['main.ts', 'text/plain', 'code'],
  ['server.rs', '', 'code'],
  ['notes.md', '', 'text'],
  ['data.json', 'application/json', 'text'],
  ['report.pdf', '', 'pdf'],
  ['brief.docx', '', 'document'],
  ['budget.xlsx', '', 'spreadsheet'],
  ['screen.png', '', 'image'],
  ['scan.tiff', 'image/tiff', 'image'],
  ['mystery.bin', '', 'unknown'],
  ['noextension', 'text/plain', 'text'],
];
for (const [name, type, expected] of classifyCases) {
  assert.equal(classifyFile({ name, type }), expected, `${name} must classify as ${expected}`);
}

// --- 3. an oversized attachment must warn about the truncated remainder ----
async function largeFileIsReported() {
  // 1.6M ASCII characters keeps the string cheap while exceeding the cap.
  const payload = 'x'.repeat(MAX_CONTENT_CHARS + 100_000);
  const file = new File([payload], 'huge-log.txt', { type: 'text/plain' });
  const draft = await processFile(file, 50_000_000);
  assert.equal(draft.kind, 'text');
  assert.equal(draft.content.length, MAX_CONTENT_CHARS, 'the stored content must stop at the cap');
  assert.ok(Array.isArray(draft.warnings) && draft.warnings.length >= 1, 'truncation must be reported');
  const warning = draft.warnings.join(' ');
  assert.match(warning, /Only the first/i, 'the warning must state that only part was extracted');
  assert.match(warning, /huge-log\.txt/, 'the warning must name the affected file');
  assert.match(warning, /Split the file/i, 'the warning must tell the user how to proceed');
}

// --- 4. a small attachment must not warn ----------------------------------
async function smallFileIsClean() {
  const file = new File(['a short note'], 'note.txt', { type: 'text/plain' });
  const draft = await processFile(file, 50_000_000);
  assert.equal(draft.kind, 'text');
  assert.equal(draft.content, 'a short note', 'small attachments must be kept verbatim');
  assert.deepEqual(draft.warnings, [], 'a fully extracted attachment must not warn');
  assert.equal(draft.processor, 'text-reader');
}

// --- 5. the size gate must still reject oversized uploads ----------------
async function sizeGateStillWorks() {
  const file = new File(['x'.repeat(5_000)], 'mid.txt', { type: 'text/plain' });
  await assert.rejects(
    () => processFile(file, 1_000),
    /processing limit/i,
    'files above the configured byte limit must be refused before extraction',
  );
}

// --- 6. unsupported types must fail visibly -------------------------------
async function unsupportedTypeFails() {
  const file = new File(['binary'], 'archive.bin', { type: 'application/octet-stream' });
  await assert.rejects(
    () => processFile(file, 50_000_000),
    /not supported/i,
    'unsupported types must raise instead of returning empty content',
  );
}

(async () => {
  await largeFileIsReported();
  await smallFileIsClean();
  await sizeGateStillWorks();
  await unsupportedTypeFails();
  console.log('CHRIS_STUDIO_V2_4_ATTACHMENT_BOUNDS_PASSED');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

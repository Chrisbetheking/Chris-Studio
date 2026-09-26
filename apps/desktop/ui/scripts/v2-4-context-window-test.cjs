// Boundary tests for the Unified Agent bounded context window.
//
// The workspace exposes `settings.conversationContextLimit` (2–100) and the
// runtime must honour it exactly, while corrupted or hostile stored values must
// never collapse the window to zero or grow it without bound.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const uiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(uiRoot, '../../..');
const buildRoot = path.join(repoRoot, '.tokenfence-test-build');
const contextWindow = require(path.join(buildRoot, 'features/unified-agent/contextWindow.js'));

const {
  DEFAULT_CONTEXT_MESSAGE_LIMIT,
  MIN_CONTEXT_MESSAGE_LIMIT,
  MAX_CONTEXT_MESSAGE_LIMIT,
  normalizeContextLimit,
  limitConversationHistory,
} = contextWindow;

// --- normalizeContextLimit: constants and clamping -------------------------
assert.equal(DEFAULT_CONTEXT_MESSAGE_LIMIT, 24);
assert.equal(MIN_CONTEXT_MESSAGE_LIMIT, 2);
assert.equal(MAX_CONTEXT_MESSAGE_LIMIT, 100);

assert.equal(normalizeContextLimit(undefined), 24, 'missing value falls back to the default');
assert.equal(normalizeContextLimit(null), 24, 'null falls back to the default');
assert.equal(normalizeContextLimit(Number.NaN), 24, 'NaN falls back to the default');
assert.equal(normalizeContextLimit(Number.POSITIVE_INFINITY), 24, 'Infinity falls back to the default');
assert.equal(normalizeContextLimit(0), 2, 'zero clamps up to the minimum');
assert.equal(normalizeContextLimit(1), 2, 'below-minimum clamps up to the minimum');
assert.equal(normalizeContextLimit(-50), 2, 'negative clamps up to the minimum');
assert.equal(normalizeContextLimit(2), 2);
assert.equal(normalizeContextLimit(50), 50);
assert.equal(normalizeContextLimit(100), 100);
assert.equal(normalizeContextLimit(101), 100, 'above-maximum clamps down to the maximum');
assert.equal(normalizeContextLimit(10_000), 100, 'hostile large values clamp down');
assert.equal(normalizeContextLimit(7.9), 7, 'fractional values are floored');
assert.equal(normalizeContextLimit('24'), 24, 'non-numeric strings fall back instead of coercing');

// --- limitConversationHistory: filtering and windowing ---------------------
const history = [
  { role: 'system', content: 'runtime instructions' },
  { role: 'user', content: 'first' },
  { role: 'assistant', content: '   ' },
  { role: 'user', content: 'second' },
  { role: 'assistant', content: '' },
  { role: 'user', content: 'third' },
];

const all = limitConversationHistory(history, 100);
assert.deepEqual(all.map((entry) => entry.content), ['first', 'second', 'third'],
  'system messages and blank content are removed before windowing');

const windowed = limitConversationHistory(history, 2);
assert.deepEqual(windowed.map((entry) => entry.content), ['second', 'third'],
  'the limit keeps the trailing, real messages only');

// Only role and content travel to the provider; private fields must be dropped.
const withExtras = [{ role: 'user', content: 'hello', id: 'msg-1', riskLevel: 'low' }];
const projected = limitConversationHistory(withExtras, 10);
assert.deepEqual(projected, [{ role: 'user', content: 'hello' }],
  'history projection strips message identity before it reaches a provider');
assert.equal(Object.keys(projected[0]).length, 2);

// The minimum window is still functional rather than empty.
const minimum = limitConversationHistory(history, 0);
assert.deepEqual(minimum.map((entry) => entry.content), ['second', 'third'],
  'a clamp-to-minimum window still returns the newest messages');

// Very large conversation windows stay bounded.
const long = Array.from({ length: 500 }, (_value, index) => ({ role: 'user', content: `m${index}` }));
assert.equal(limitConversationHistory(long, 100).length, 100);
assert.equal(limitConversationHistory(long, 100).at(-1).content, 'm499');
assert.equal(limitConversationHistory(long, 100).at(0).content, 'm400');
assert.equal(limitConversationHistory(long, undefined).length, 24, 'the default window applies to long histories');

// Empty and fully-filtered histories must not throw.
assert.deepEqual(limitConversationHistory([], 24), []);
assert.deepEqual(limitConversationHistory([{ role: 'system', content: 'only system' }], 24), []);

// --- wiring: the runtime must consume the user setting ---------------------
const manager = fs.readFileSync(path.join(uiRoot, 'src/features/unified-agent/manager.ts'), 'utf8');
assert.match(manager, /import \{ limitConversationHistory \} from '\.\/contextWindow';/,
  'The runtime must build provider history through the bounded context window.');
assert.equal((manager.match(/limitedHistory\(conversation, item\.conversationContextLimit\)/g) || []).length, 2,
  'Both chat and Agent loops must pass the configured context limit.');
assert.doesNotMatch(manager, /slice\(-24\)/,
  'The legacy hard-coded 24-message window must be gone.');

const workspace = fs.readFileSync(path.join(uiRoot, 'src/screens/WorkspaceScreen.tsx'), 'utf8');
assert.match(workspace, /conversationContextLimit: settings\.conversationContextLimit,/,
  'The workspace must forward the user setting into the queue handoff.');

const types = fs.readFileSync(path.join(uiRoot, 'src/features/unified-agent/types.ts'), 'utf8');
assert.match(types, /conversationContextLimit\?: number;/,
  'The enqueue input must carry the optional context limit.');

console.log('CHRIS_STUDIO_V2_4_CONTEXT_WINDOW_PASSED');

const assert = require('node:assert/strict');
const {
  synchronizeAppText,
  synchronizeAboutVersion,
  synchronizeChatWorkspaceText,
} = require('./sync-product-metadata.cjs');

assert.equal(
  synchronizeAppText('<small>v2.1.0 · macOS</small>', '2.2.0'),
  '<small>v2.2.0 · macOS</small>',
);

assert.equal(
  synchronizeAboutVersion("const fallback: PlatformInfo = { appVersion: '2.1.0', os: 'Loading…' };", '2.3.0-alpha.4'),
  "const fallback: PlatformInfo = { appVersion: '2.3.0-alpha.4', os: 'Loading…' };",
);

const fixture = String.raw`const zhPatterns = /\u5F00\u53D1\u8005/;
const enPatterns = /who developed|support email/i;
return "TokenFence Studio \u7531 Chris \u5F00\u53D1\u5E76\u7EF4\u62A4.";
return "TokenFence Studio is developed and maintained by Chris.";`;
const synchronized = synchronizeChatWorkspaceText(fixture);
assert.match(synchronized, /I am Chris Studio, designed and built end-to-end by Chris\./);
assert.ok(synchronized.includes(String.raw`\u6211\u662F Chris Studio`));
assert.ok(synchronized.includes(String.raw`\u4F60\u662F\u8C01`));
assert.match(synchronized, /who are you\|what are you\|what is your name\|who developed/);

// The operation must be idempotent so predev, pretypecheck and prebuild can all run.
assert.equal(synchronizeChatWorkspaceText(synchronized), synchronized);

console.log('v2.2 product metadata synchronization tests passed');

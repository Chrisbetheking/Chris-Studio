const fs = require('node:fs');
const path = require('node:path');

const UI_ROOT = path.resolve(__dirname, '..');

function replaceRequired(source, search, replacement, label) {
  const next = typeof search === 'string'
    ? source.split(search).join(replacement)
    : source.replace(search, replacement);
  if (next === source && !source.includes(replacement)) {
    throw new Error(`Cannot synchronize ${label}; expected source marker was not found.`);
  }
  return next;
}

function synchronizeAppText(source, version) {
  const label = `v${version} · macOS`;
  const next = source.replace(/v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)? · macOS/g, label);
  if (next === source && !source.includes(label)) {
    throw new Error('Cannot synchronize sidebar version; version label was not found.');
  }
  return next;
}

function synchronizeChatWorkspaceText(source) {
  let next = source;

  // The repository previously carried both plain Chinese and escaped-Unicode
  // variants during UI migrations. Support both without broad replacements.
  next = next
    .split('TokenFence Studio \\u7531 Chris \\u5F00\\u53D1\\u5E76\\u7EF4\\u62A4.')
    .join('\\u6211\\u662F Chris Studio\\uFF0C\\u7531 Chris \\u5168\\u7A0B\\u8BBE\\u8BA1\\u548C\\u5EFA\\u9020\\u3002')
    .split('TokenFence Studio 由 Chris 开发并维护。')
    .join('我是 Chris Studio，由 Chris 全程设计和建造。')
    .split('TokenFence Studio is developed and maintained by Chris.')
    .join('I am Chris Studio, designed and built end-to-end by Chris.');

  if (!next.includes('I am Chris Studio, designed and built end-to-end by Chris.')) {
    throw new Error('Cannot synchronize English Chris Studio identity response.');
  }
  const hasZhIdentity = next.includes('我是 Chris Studio，由 Chris 全程设计和建造。')
    || next.includes('\\u6211\\u662F Chris Studio\\uFF0C\\u7531 Chris \\u5168\\u7A0B\\u8BBE\\u8BA1\\u548C\\u5EFA\\u9020\\u3002');
  if (!hasZhIdentity) {
    throw new Error('Cannot synchronize Chinese Chris Studio identity response.');
  }

  const zhIdentityPrefix = '\\u4F60\\u662F\\u8C01|\\u4F60\\u662F\\u4EC0\\u4E48|\\u4F60\\u53EB\\u4EC0\\u4E48|\\u4F60\\u7684\\u540D\\u5B57|';
  if (!next.includes('\\u4F60\\u662F\\u8C01')) {
    next = replaceRequired(
      next,
      'const zhPatterns = /',
      `const zhPatterns = /${zhIdentityPrefix}`,
      'Chinese identity intent patterns',
    );
  }

  if (!next.includes('/who are you|what are you|what is your name|who developed|')) {
    next = replaceRequired(
      next,
      'const enPatterns = /who developed|',
      'const enPatterns = /who are you|what are you|what is your name|who developed|',
      'English identity intent patterns',
    );
  }

  return next;
}

function syncFile(filePath, transform) {
  const before = fs.readFileSync(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(filePath, after, 'utf8');
    console.log(`Updated ${path.relative(UI_ROOT, filePath)}`);
  } else {
    console.log(`Already synchronized ${path.relative(UI_ROOT, filePath)}`);
  }
}

function main() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(UI_ROOT, 'package.json'), 'utf8'));
  const version = String(packageJson.version || '').trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid desktop UI package version: ${version}`);
  }

  syncFile(path.join(UI_ROOT, 'src/App.tsx'), (source) => synchronizeAppText(source, version));
  syncFile(
    path.join(UI_ROOT, 'src/screens/ChatWorkspace.tsx'),
    synchronizeChatWorkspaceText,
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  synchronizeAppText,
  synchronizeChatWorkspaceText,
};

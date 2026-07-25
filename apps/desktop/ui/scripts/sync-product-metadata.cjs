const fs = require('node:fs');
const path = require('node:path');
const UI_ROOT = path.resolve(__dirname, '..');

function replaceRequired(source, search, replacement, label) {
  const next = typeof search === 'string' ? source.split(search).join(replacement) : source.replace(search, replacement);
  if (next === source && !source.includes(replacement)) throw new Error(`Cannot synchronize ${label}; source marker was not found.`);
  return next;
}
function synchronizeAppText(source, version) {
  const label = `v${version} · macOS`;
  const next = source.replace(/v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)? · macOS/g, label);
  if (next === source && !source.includes(label)) throw new Error('Cannot synchronize sidebar version.');
  return next;
}
function synchronizeAboutVersion(source, version) {
  const replacement = `const fallback: PlatformInfo = { appVersion: '${version}',`;
  const next = source.replace(/const fallback: PlatformInfo = \{ appVersion: '[^']+',/, replacement);
  if (next === source && !source.includes(replacement)) throw new Error('Cannot synchronize About fallback version.');
  return next;
}
function synchronizeReliabilityAppText(source) {
  let next = source;
  const importStatement = "import { ReliabilityDock } from './components/ReliabilityDock';";
  if (!next.includes('./components/ReliabilityDock')) {
    const marker = /import\s+chrisStudioLogo\s+from\s+['"]\.\/assets\/chris-studio-logo\.png['"];?/;
    const match = next.match(marker);
    if (!match) throw new Error('Cannot mount ReliabilityDock.');
    next = next.replace(match[0], `${importStatement}\n${match[0]}`);
  }
  if (!/<ReliabilityDock\s*\/>/.test(next)) {
    if (!/<ChrisStudioApp\s*\/>/.test(next)) throw new Error('Cannot find <ChrisStudioApp />.');
    next = next.replace(/<ChrisStudioApp\s*\/>/, (match) => `${match}\n      <ReliabilityDock />`);
  }
  return next;
}
function synchronizeAdapterImport(source, legacy, reliable, label) {
  if (source.includes(reliable)) return source;
  if (!source.includes(legacy)) throw new Error(`Cannot synchronize ${label}.`);
  return source.split(legacy).join(reliable);
}
function synchronizeWorkspaceRuntimeAdapters(source) {
  let next = source;
  if (next.includes('../features/providers/providerClient')) {
    next = synchronizeAdapterImport(next, '../features/providers/providerClient', '../features/providers/providerClientReliable', 'provider adapter');
  }
  if (next.includes('../features/computer/computerClient')) {
    next = synchronizeAdapterImport(next, '../features/computer/computerClient', '../features/computer/computerClientReliable', 'Computer adapter');
  }
  return next;
}
function synchronizeComputerScreenRuntimeAdapter(source) {
  const legacy = '../features/computer/computerClient';
  const reliable = '../features/computer/computerClientReliable';
  if (!source.includes(legacy) && !source.includes(reliable)) return source;
  return synchronizeAdapterImport(source, legacy, reliable, 'Computer screen adapter');
}
function synchronizeChatWorkspaceText(source) {
  let next = source
    .split('TokenFence Studio \\u7531 Chris \\u5F00\\u53D1\\u5E76\\u7EF4\\u62A4.')
    .join('\\u6211\\u662F Chris Studio\\uFF0C\\u7531 Chris \\u5168\\u7A0B\\u8BBE\\u8BA1\\u548C\\u5EFA\\u9020\\u3002')
    .split('TokenFence Studio 由 Chris 开发并维护。').join('我是 Chris Studio，由 Chris 全程设计和建造。')
    .split('TokenFence Studio is developed and maintained by Chris.').join('I am Chris Studio, designed and built end-to-end by Chris.');
  if (!next.includes('I am Chris Studio, designed and built end-to-end by Chris.')) throw new Error('English identity response is missing.');
  const zhPrefix = '\\u4F60\\u662F\\u8C01|\\u4F60\\u662F\\u4EC0\\u4E48|\\u4F60\\u53EB\\u4EC0\\u4E48|\\u4F60\\u7684\\u540D\\u5B57|';
  if (!next.includes('\\u4F60\\u662F\\u8C01')) next = replaceRequired(next, 'const zhPatterns = /', `const zhPatterns = /${zhPrefix}`, 'Chinese identity patterns');
  if (!next.includes('/who are you|what are you|what is your name|who developed|')) next = replaceRequired(next, 'const enPatterns = /who developed|', 'const enPatterns = /who are you|what are you|what is your name|who developed|', 'English identity patterns');
  return next;
}
function verifyFile(filePath, transform) {
  const before = fs.readFileSync(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) throw new Error(`Metadata is not synchronized: ${path.relative(UI_ROOT, filePath)}. Run the v2.4 overlay finalizer once.`);
  console.log(`Verified ${path.relative(UI_ROOT, filePath)}`);
}
function main() {
  const version = String(JSON.parse(fs.readFileSync(path.join(UI_ROOT, 'package.json'), 'utf8')).version || '').trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Invalid desktop UI version: ${version}`);
  verifyFile(path.join(UI_ROOT, 'src/App.tsx'), (source) => synchronizeReliabilityAppText(synchronizeAppText(source, version)));
  verifyFile(path.join(UI_ROOT, 'src/screens/AboutScreen.tsx'), (source) => synchronizeAboutVersion(source, version));
  verifyFile(path.join(UI_ROOT, 'src/screens/WorkspaceScreen.tsx'), synchronizeWorkspaceRuntimeAdapters);
  verifyFile(path.join(UI_ROOT, 'src/screens/ComputerScreen.tsx'), synchronizeComputerScreenRuntimeAdapter);
  verifyFile(path.join(UI_ROOT, 'src/screens/ChatWorkspace.tsx'), synchronizeChatWorkspaceText);
}
if (require.main === module) main();
module.exports = {
  synchronizeAppText,
  synchronizeAboutVersion,
  synchronizeReliabilityAppText,
  synchronizeWorkspaceRuntimeAdapters,
  synchronizeComputerScreenRuntimeAdapter,
  synchronizeChatWorkspaceText,
};

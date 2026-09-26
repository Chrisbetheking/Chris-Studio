const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function loadTypeScriptModule(relative) {
  const filename = path.join(root, relative);
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, require, console, Set, Map, RegExp, String, Number, Math, JSON });
  new vm.Script(compiled, { filename }).runInContext(context);
  return module.exports;
}

const privacy = loadTypeScriptModule('src/features/privacy/contentClassifier.ts');
const comparison = loadTypeScriptModule('src/features/comparison/structuredDiff.ts');

const secret = privacy.classifyPrivacy({ text: 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456' });
assert.equal(secret.route, 'local-only');
assert.ok(secret.score >= 50);
assert.ok(secret.categories.includes('credentials'));

const internal = privacy.classifyPrivacy({ text: 'This is an internal architecture document under NDA for our customer database.' });
assert.notEqual(internal.route, 'remote-ok');

const publicReadme = privacy.classifyPrivacy({ text: 'Open source public documentation for installation.', paths: ['README.md'] });
assert.equal(publicReadme.route, 'remote-ok');

const diff = comparison.compareResponses([
  { id: 'a', label: 'Model A', content: 'The release supports 20 tools. Therefore it should ship on Monday.' },
  { id: 'b', label: 'Model B', content: 'The release supports 24 tools. Therefore it should ship on Monday.' },
]);
assert.ok(diff.potentialDisagreements.some((item) => item.reason === 'different-number'));
assert.ok(diff.sharedPoints.length >= 1);
const formatted = comparison.formatStructuredComparison([
  { id: 'a', label: 'Model A', content: 'The release supports 20 tools. Therefore it should ship on Monday.' },
  { id: 'b', label: 'Model B', content: 'The release supports 24 tools. Therefore it should ship on Monday.' },
], diff);
assert.match(formatted, /Potential disagreements/);
assert.match(formatted, /different-number/);

const threeWay = comparison.compareResponses([
  { id: 'a', label: 'Model A', content: 'The deployment window is Tuesday.' },
  { id: 'b', label: 'Model B', content: 'The budget is 30 dollars. Therefore approval is required.' },
  { id: 'c', label: 'Model C', content: 'The budget is 50 dollars. Therefore approval is required.' },
]);
assert.ok(threeWay.potentialDisagreements.some((item) => item.leftId === 'b' && item.rightId === 'c' && item.reason === 'different-number'));

console.log('CHRIS_STUDIO_V2_4_ALPHA2_PRIVACY_COMPARISON_PASSED');

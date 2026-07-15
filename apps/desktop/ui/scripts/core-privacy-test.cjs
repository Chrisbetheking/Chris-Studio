const fs = require('node:fs');
const path = require('node:path');

const buildRoot = path.resolve(__dirname, '../../../../.tokenfence-test-build');

class StorageMock {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

global.window = { localStorage: new StorageMock(), dispatchEvent() {} };
global.CustomEvent = class CustomEvent { constructor(type) { this.type = type; } };

try {
  const scanner = require(path.join(buildRoot, 'features/safety/scanner.js'));
  const store = require(path.join(buildRoot, 'app/store.js'));

  const prompt = scanner.scanText('api_key=DEMO_SECRET_1234567890abcdef and alice@example.com');
  if (prompt.riskLevel !== 'critical') throw new Error(`Expected critical risk, got ${prompt.riskLevel}`);
  if (prompt.redactedText.includes('DEMO_SECRET') || prompt.redactedText.includes('alice@example.com')) {
    throw new Error('Prompt redaction leaked a detected value');
  }

  const payload = scanner.scanPayload(
    'hello',
    [{ id: 'file-1', name: 'config.txt', size: 40, content: 'password=SuperSecretPassword123' }],
    [],
  );
  if (payload.riskLevel !== 'critical') throw new Error('Attachment was not included in risk aggregation');
  if (scanner.formatSafePayload(payload).includes('SuperSecretPassword123')) {
    throw new Error('Attachment redaction leaked a detected value');
  }

  const now = new Date().toISOString();
  store.saveConversation({
    id: 'conversation-1',
    title: 'alice@example.com',
    createdAt: now,
    updatedAt: now,
    provider: 'DeepSeek',
    model: 'deepseek-v4-flash',
    riskSummary: 'critical',
    messages: [{ id: 'message-1', role: 'user', content: 'api_key=DEMO_SECRET_1234567890abcdef', createdAt: now }],
  });
  const stored = JSON.stringify(store.loadConversations()[0]);
  if (stored.includes('DEMO_SECRET') || stored.includes('alice@example.com')) {
    throw new Error('Persistence defense wrote an unredacted value');
  }

  global.window.localStorage.setItem('tokenfence.conversations.v160', '{broken api_key=DEMO_SECRET_1234567890abcdef');
  store.loadConversations();
  const corruptBackup = Array.from(global.window.localStorage.map.entries())
    .find(([key]) => key.startsWith('tokenfence.conversations.v160.corrupt.'))?.[1] ?? '';
  if (!corruptBackup || corruptBackup.includes('DEMO_SECRET')) {
    throw new Error('Corrupt-data backup was not sanitized');
  }

  console.log('TOKENFENCE_CORE_PRIVACY_TESTS_PASSED');
} finally {
  fs.rmSync(buildRoot, { recursive: true, force: true });
}

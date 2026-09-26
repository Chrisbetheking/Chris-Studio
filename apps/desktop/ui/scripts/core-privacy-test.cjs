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
  const identity = require(path.join(buildRoot, 'app/identity.js'));
  const store = require(path.join(buildRoot, 'app/store.js'));
  const optimizer = require(path.join(buildRoot, 'features/tokens/optimizer.js'));
  const knowledge = require(path.join(buildRoot, 'features/files/knowledge.js'));

  if (!identity.isIdentityQuestion('你是谁？')) throw new Error('Chinese identity intent was not detected');
  const identityText = identity.identityReply('zh-CN');
  if (!identityText.includes('Chris Studio') || !identityText.includes('chriswangjob@163.com') || !identityText.includes('easymoneysniperchris')) {
    throw new Error('Chris Studio identity or contact was not preserved');
  }

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

  const optimized = optimizer.optimizeText('Please please review this.\nRepeated context\nRepeated context\n\n\n\nDone', 'balanced');
  if (optimized.optimizedTokens >= optimized.originalTokens || optimized.savedTokens <= 0) {
    throw new Error('Token optimizer did not reduce obvious duplicate context');
  }

  const chunks = knowledge.buildKnowledgeIndex([{ id: 'doc-1', name: 'security.md', size: 128, content: 'Chris Studio protects API keys before an AI request is sent. It also keeps reviewed backups for project edits.' }]);
  const hits = knowledge.searchKnowledge(chunks, 'How are API keys protected?', 3);
  if (!hits.length || hits[0].chunk.sourceName !== 'security.md') throw new Error('Local knowledge retrieval did not return the expected source');

  const now = new Date().toISOString();
  store.saveProviderProfile({
    id: 'deepseek-primary', providerId: 'deepseek', displayName: 'DeepSeek', apiStyle: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', enabled: true, credentialStored: true,
    apiKey: 'DEMO_ONLY_NOT_A_REAL_KEY', createdAt: now, updatedAt: now,
  });
  store.saveActiveProviderId('deepseek-primary');
  if (store.loadActiveProvider().id !== 'deepseek-primary') throw new Error('Configured provider silently fell back to Local Sandbox');
  const providerStorage = global.window.localStorage.getItem('tokenfence.providers.v170') || '';
  if (providerStorage.includes('DEMO_ONLY_NOT_A_REAL_KEY')) throw new Error('Provider API key was persisted to localStorage');

  store.recordTokenUsage({ id: 'usage-1', createdAt: now, provider: 'DeepSeek', model: 'deepseek-v4-flash', inputTokens: 120, outputTokens: 40, savedTokens: 35 });
  const usage = store.tokenUsageSummary(now.slice(0, 10));
  if (usage.totalTokens !== 160 || usage.savedTokens !== 35) throw new Error('Token budget accounting failed');

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

  const renamed = store.renameConversation('conversation-1', 'Manual acceptance renamed');
  if (!renamed || renamed.title !== 'Manual acceptance renamed') throw new Error('Conversation rename was not persisted.');
  if (store.loadConversations()[0]?.title !== 'Manual acceptance renamed') throw new Error('Renamed conversation was not reloaded.');

  global.window.localStorage.setItem('tokenfence.conversations.v160', '{broken api_key=DEMO_SECRET_1234567890abcdef');
  store.loadConversations();
  const corruptBackup = Array.from(global.window.localStorage.map.entries())
    .find(([key]) => key.startsWith('tokenfence.conversations.v160.corrupt.'))?.[1] ?? '';
  if (!corruptBackup || corruptBackup.includes('DEMO_SECRET')) {
    throw new Error('Corrupt-data backup was not sanitized');
  }

  console.log('CHRIS_STUDIO_CORE_TESTS_PASSED');
} finally {
  fs.rmSync(buildRoot, { recursive: true, force: true });
}

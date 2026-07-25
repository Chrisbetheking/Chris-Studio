import type {
  AgentProfile,
  AppSettings,
  Conversation,
  ProviderProfile,
  ProviderStatus,
  RoutingRule,
  SafetyReceipt,
  ComputerAuditEntry,
  CustomSkillDefinition,
  KnowledgeChunk,
  TokenUsageEntry,
  TokenUsageSummary,
  ToolConnectorProfile,
} from './types';
import { scanText } from '../features/safety/scanner';
import { providerDefinition } from './providerRegistry';
import { DEFAULT_AGENTS } from './skills';

const KEYS = {
  settings: 'tokenfence.settings.v170',
  legacySettings: 'tokenfence.settings.v160',
  providers: 'tokenfence.providers.v170',
  activeProvider: 'tokenfence.active-provider.v170',
  providerStatuses: 'tokenfence.provider-statuses.v170',
  legacyProvider: 'tokenfence.provider.deepseek.v161',
  legacyProviderStatus: 'tokenfence.provider-status.deepseek.v160',
  conversations: 'tokenfence.conversations.v170',
  legacyConversations: 'tokenfence.conversations.v160',
  receipts: 'tokenfence.safety-receipts.v170',
  legacyReceipts: 'tokenfence.safety-receipts.v160',
  routing: 'tokenfence.routing.v170',
  agents: 'tokenfence.agents.v170',
  activeAgent: 'tokenfence.active-agent.v170',
  customSkills: 'tokenfence.custom-skills.v180',
  knowledge: 'tokenfence.knowledge.v180',
  computerAudit: 'tokenfence.computer-audit.v180',
  projectRoot: 'tokenfence.project-root.v180',
  githubRepoUrl: 'tokenfence.github-repo-url.v180',
  tokenUsage: 'tokenfence.token-usage.v180',
  connectors: 'tokenfence.connectors.v180',
} as const;

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'zh-CN',
  theme: 'system',
  startScreen: 'workspace',
  autoOpenInspector: false,
  autoScan: true,
  autoRedactCritical: true,
  blockCriticalSends: true,
  customSensitiveTerms: [],
  maxTextScanSize: 250_000,
  maxFileScanSize: 8_000_000,
  requestTimeoutMs: 90_000,
  conversationContextLimit: 24,
  localHistoryEnabled: true,
  safetyReceiptsEnabled: true,
  experimentalFeatures: true,
  debugMode: false,
  tokenOptimizationMode: 'balanced',
  maxRequestTokens: 32_000,
  dailyTokenBudget: 250_000,
  githubOwner: 'Chrisbetheking',
  githubRepo: 'chris-studio',
  autoCheckUpdates: true,
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}


function sanitizeCorruptBackup(raw: string): string {
  return scanText(raw.slice(0, 200_000)).redactedText
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization)\s*[:=]\s*)[^\s,;}\]"']+/gi, '$1[REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]');
}

function safeRead<T>(key: string, fallback: T, backupCorrupt = true): T {
  if (!canUseStorage()) return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    if (backupCorrupt && !key.includes('provider')) {
      try {
        window.localStorage.setItem(`${key}.corrupt.${Date.now()}`, sanitizeCorruptBackup(raw));
      } catch {
        // Storage failures must not crash Chris Studio.
      }
    }
    window.localStorage.removeItem(key);
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function makeId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}_${random}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

function defaultProfiles(): ProviderProfile[] {
  const timestamp = nowIso();
  const deepseek = providerDefinition('deepseek');
  const local = providerDefinition('local-demo');
  return [
    {
      id: 'deepseek-primary', providerId: 'deepseek', displayName: 'DeepSeek', apiStyle: deepseek.apiStyle,
      baseUrl: deepseek.defaultBaseUrl, model: deepseek.defaultModel, enabled: true,
      credentialStored: false, apiKey: '', createdAt: timestamp, updatedAt: timestamp,
    },
    {
      id: 'local-sandbox', providerId: 'local-demo', displayName: 'Local Sandbox', apiStyle: local.apiStyle,
      baseUrl: local.defaultBaseUrl, model: local.defaultModel, enabled: true,
      credentialStored: false, apiKey: '', createdAt: timestamp, updatedAt: timestamp,
    },
  ];
}

function migrateLegacyProvider(): ProviderProfile[] | null {
  const legacy = safeRead<Record<string, unknown>>(KEYS.legacyProvider, {}, false);
  if (!Object.keys(legacy).length) return null;
  const def = providerDefinition('deepseek');
  const timestamp = nowIso();
  return [
    {
      id: 'deepseek-primary', providerId: 'deepseek', displayName: 'DeepSeek', apiStyle: def.apiStyle,
      baseUrl: typeof legacy.baseUrl === 'string' ? legacy.baseUrl : def.defaultBaseUrl,
      model: typeof legacy.model === 'string' ? legacy.model : def.defaultModel,
      enabled: true,
      credentialStored: Boolean(legacy.credentialStored || legacy.apiKey),
      apiKey: typeof legacy.apiKey === 'string' ? legacy.apiKey : '',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'local-sandbox', providerId: 'local-demo', displayName: 'Local Sandbox', apiStyle: 'local-demo',
      baseUrl: 'local://chris-studio', model: 'chris-studio-safety-demo', enabled: true,
      credentialStored: false, apiKey: '', createdAt: timestamp, updatedAt: timestamp,
    },
  ];
}

export function loadSettings(): AppSettings {
  const saved = safeRead<Partial<AppSettings>>(KEYS.settings, {});
  const legacy = safeRead<Partial<AppSettings>>(KEYS.legacySettings, {});
  return { ...DEFAULT_SETTINGS, ...(Object.keys(saved).length ? saved : legacy) };
}

export function saveSettings(settings: AppSettings): void {
  safeWrite(KEYS.settings, settings);
  window.dispatchEvent(new CustomEvent('tokenfence:settings-updated'));
}

export function loadProviderProfiles(): ProviderProfile[] {
  const saved = safeRead<ProviderProfile[]>(KEYS.providers, []);
  const source = Array.isArray(saved) && saved.length ? saved : (migrateLegacyProvider() ?? defaultProfiles());
  const normalized = source
    .filter((profile) => profile && typeof profile.id === 'string')
    .map((profile) => ({ ...profile, apiKey: typeof profile.apiKey === 'string' ? profile.apiKey : '' }));
  if (!saved.length) saveProviderProfiles(normalized);
  return normalized;
}

export function saveProviderProfiles(profiles: ProviderProfile[]): void {
  safeWrite(KEYS.providers, profiles.map((profile) => ({
    ...profile,
    apiKey: '',
    credentialStored: Boolean(profile.credentialStored || profile.apiKey.trim()),
  })));
  window.dispatchEvent(new CustomEvent('tokenfence:providers-updated'));
}

export function saveProviderProfile(profile: ProviderProfile): void {
  const all = loadProviderProfiles();
  const next = [profile, ...all.filter((item) => item.id !== profile.id)];
  saveProviderProfiles(next);
}

export function deleteProviderProfile(id: string): void {
  if (id === 'local-sandbox') return;
  const next = loadProviderProfiles().filter((profile) => profile.id !== id);
  saveProviderProfiles(next.length ? next : defaultProfiles());
  if (loadActiveProviderId() === id) saveActiveProviderId(next[0]?.id ?? 'deepseek-primary');
}

export function loadActiveProviderId(): string {
  const saved = safeRead<string>(KEYS.activeProvider, '');
  const profiles = loadProviderProfiles();
  if (saved && profiles.some((profile) => profile.id === saved)) return saved;
  const connected = profiles.find((profile) => profile.providerId !== 'local-demo' && profile.credentialStored);
  return connected?.id ?? profiles.find((profile) => profile.id === 'deepseek-primary')?.id ?? profiles[0]?.id ?? 'local-sandbox';
}

export function saveActiveProviderId(id: string): void {
  safeWrite(KEYS.activeProvider, id);
  window.dispatchEvent(new CustomEvent('tokenfence:providers-updated'));
}

export function loadActiveProvider(): ProviderProfile {
  const profiles = loadProviderProfiles();
  return profiles.find((profile) => profile.id === loadActiveProviderId()) ?? profiles[0] ?? defaultProfiles()[0];
}

export function loadProviderStatuses(): Record<string, ProviderStatus> {
  const saved = safeRead<Record<string, ProviderStatus>>(KEYS.providerStatuses, {}, false);
  if (Object.keys(saved).length) return saved;
  const legacy = safeRead<ProviderStatus>(KEYS.legacyProviderStatus, { state: 'not-configured' }, false);
  return { 'deepseek-primary': legacy };
}

export function loadProviderStatus(profileId: string): ProviderStatus {
  const profile = loadProviderProfiles().find((item) => item.id === profileId);
  const fallback: ProviderStatus = profile?.providerId === 'local-demo'
    ? { state: 'connected', message: 'Local sandbox ready' }
    : profile?.credentialStored || !providerDefinition(profile?.providerId ?? 'custom').requiresCredential
      ? { state: 'configured' }
      : { state: 'not-configured' };
  return loadProviderStatuses()[profileId] ?? fallback;
}

export function saveProviderStatus(profileId: string, status: ProviderStatus): void {
  safeWrite(KEYS.providerStatuses, { ...loadProviderStatuses(), [profileId]: status });
  window.dispatchEvent(new CustomEvent('tokenfence:providers-updated'));
}

export function clearProviderStatus(profileId: string): void {
  const next = { ...loadProviderStatuses() };
  delete next[profileId];
  safeWrite(KEYS.providerStatuses, next);
  window.dispatchEvent(new CustomEvent('tokenfence:providers-updated'));
}

export function loadRoutingRules(): RoutingRule[] {
  const saved = safeRead<RoutingRule[]>(KEYS.routing, []);
  if (saved.length) return saved;
  const active = loadActiveProviderId();
  const defaults: RoutingRule[] = [
    { id: 'route-code', kind: 'code', providerProfileId: active, enabled: true, reasonEn: 'Coding and repository work', reasonZh: '代码与仓库任务' },
    { id: 'route-pdf', kind: 'pdf', providerProfileId: active, enabled: true, reasonEn: 'Long-document analysis', reasonZh: '长文档分析' },
    { id: 'route-image', kind: 'image', providerProfileId: active, enabled: true, reasonEn: 'OCR or vision analysis', reasonZh: 'OCR 或视觉分析' },
    { id: 'route-sheet', kind: 'spreadsheet', providerProfileId: active, enabled: true, reasonEn: 'Tabular data analysis', reasonZh: '表格数据分析' },
    { id: 'route-default', kind: 'default', providerProfileId: active, enabled: true, reasonEn: 'General fallback', reasonZh: '通用回退' },
  ];
  saveRoutingRules(defaults);
  return defaults;
}

export function saveRoutingRules(rules: RoutingRule[]): void {
  safeWrite(KEYS.routing, rules);
  window.dispatchEvent(new CustomEvent('tokenfence:routing-updated'));
}

function normalizeAgentProfile(agent: AgentProfile): AgentProfile {
  const mode = agent.collaborationMode === 'plan-execute-review' ? 'plan-execute-review' : 'single';
  const executorProfileId = agent.executorProviderProfileId || agent.providerProfileId;
  return {
    ...agent,
    collaborationMode: mode,
    plannerProviderProfileId: agent.plannerProviderProfileId || executorProfileId,
    executorProviderProfileId: executorProfileId,
    reviewerProviderProfileId: agent.reviewerProviderProfileId || executorProfileId,
    maxRevisionRounds: agent.maxRevisionRounds === 1 ? 1 : 0,
  };
}

export function loadAgents(): AgentProfile[] {
  const saved = safeRead<AgentProfile[]>(KEYS.agents, []);
  const source = saved.length ? saved : DEFAULT_AGENTS;
  const normalized = source
    .filter((agent) => agent && typeof agent.id === 'string')
    .map(normalizeAgentProfile);
  if (!saved.length || JSON.stringify(saved) !== JSON.stringify(normalized)) saveAgents(normalized);
  return normalized;
}

export function saveAgents(agents: AgentProfile[]): void {
  safeWrite(KEYS.agents, agents.map(normalizeAgentProfile));
  window.dispatchEvent(new CustomEvent('tokenfence:agents-updated'));
}

export function loadActiveAgentId(): string {
  const id = safeRead<string>(KEYS.activeAgent, 'tokenfence-coder');
  return loadAgents().some((agent) => agent.id === id) ? id : loadAgents()[0]?.id ?? 'tokenfence-coder';
}

export function saveActiveAgentId(id: string): void {
  safeWrite(KEYS.activeAgent, id);
  window.dispatchEvent(new CustomEvent('tokenfence:agents-updated'));
}

export function loadConversations(): Conversation[] {
  const saved = safeRead<Conversation[]>(KEYS.conversations, []);
  // Always inspect the legacy slot once so malformed historical data is sanitized and removed.
  const legacySaved = safeRead<Conversation[]>(KEYS.legacyConversations, []);
  const source = saved.length ? saved : legacySaved;
  if (!Array.isArray(source)) return [];
  return source
    .filter((item) => item && typeof item.id === 'string' && Array.isArray(item.messages))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveConversation(conversation: Conversation): void {
  const terms = loadSettings().customSensitiveTerms;
  const sanitized: Conversation = {
    ...conversation,
    title: scanText(conversation.title, terms).redactedText.slice(0, 120),
    messages: conversation.messages.map((message) => ({
      ...message,
      content: scanText(message.content, terms).redactedText,
    })),
  };
  const all = loadConversations();
  const next = [sanitized, ...all.filter((item) => item.id !== sanitized.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 300);
  safeWrite(KEYS.conversations, next);
  window.dispatchEvent(new CustomEvent('tokenfence:history-updated'));
}

export function renameConversation(id: string, nextTitle: string): Conversation | undefined {
  const title = scanText(nextTitle.trim(), loadSettings().customSensitiveTerms).redactedText.slice(0, 120);
  if (!title) return undefined;
  const all = loadConversations();
  const existing = all.find((item) => item.id === id);
  if (!existing) return undefined;
  const updated: Conversation = { ...existing, title, updatedAt: new Date().toISOString() };
  const next = [updated, ...all.filter((item) => item.id !== id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 300);
  safeWrite(KEYS.conversations, next);
  window.dispatchEvent(new CustomEvent('tokenfence:history-updated'));
  window.dispatchEvent(new CustomEvent('chris-studio:conversation-renamed', {
    detail: { id, title, updatedAt: updated.updatedAt },
  }));
  return updated;
}

export function deleteConversation(id: string): void {
  safeWrite(KEYS.conversations, loadConversations().filter((item) => item.id !== id));
  window.dispatchEvent(new CustomEvent('tokenfence:history-updated'));
}

export function clearConversations(): void {
  safeWrite(KEYS.conversations, []);
  window.dispatchEvent(new CustomEvent('tokenfence:history-updated'));
}

export function saveReceipt(receipt: SafetyReceipt): void {
  const existing = safeRead<SafetyReceipt[]>(KEYS.receipts, safeRead<SafetyReceipt[]>(KEYS.legacyReceipts, []));
  safeWrite(KEYS.receipts, [receipt, ...existing].slice(0, 500));
}

export function clearReceipts(): void {
  safeWrite(KEYS.receipts, []);
}

export function exportLocalSettings(): string {
  const settings = loadSettings();
  const providers = loadProviderProfiles().map((provider) => ({
    id: provider.id,
    providerId: provider.providerId,
    displayName: provider.displayName,
    model: provider.model,
    baseUrl: provider.baseUrl,
    hasCredential: provider.credentialStored,
  }));
  return JSON.stringify({ exportedAt: nowIso(), settings, providers, routing: loadRoutingRules(), agents: loadAgents() }, null, 2);
}

export function resetApplication(): void {
  if (!canUseStorage()) return;
  Object.values(KEYS).forEach((key) => window.localStorage.removeItem(key));
  window.dispatchEvent(new CustomEvent('tokenfence:reset'));
}


export function loadCustomSkills(): CustomSkillDefinition[] {
  const saved = safeRead<CustomSkillDefinition[]>(KEYS.customSkills, []);
  return Array.isArray(saved) ? saved.filter((skill) => skill && typeof skill.id === 'string') : [];
}

export function saveCustomSkills(skills: CustomSkillDefinition[]): void {
  safeWrite(KEYS.customSkills, skills.slice(0, 200));
  window.dispatchEvent(new CustomEvent('tokenfence:skills-updated'));
}

export function loadKnowledgeIndex(): KnowledgeChunk[] {
  const saved = safeRead<KnowledgeChunk[]>(KEYS.knowledge, []);
  return Array.isArray(saved) ? saved.slice(0, 12_000) : [];
}

export function saveKnowledgeIndex(chunks: KnowledgeChunk[]): void {
  safeWrite(KEYS.knowledge, chunks.slice(0, 12_000));
  window.dispatchEvent(new CustomEvent('tokenfence:knowledge-updated'));
}

export function clearKnowledgeIndex(): void {
  safeWrite(KEYS.knowledge, []);
  window.dispatchEvent(new CustomEvent('tokenfence:knowledge-updated'));
}

export function loadComputerAudit(): ComputerAuditEntry[] {
  const saved = safeRead<ComputerAuditEntry[]>(KEYS.computerAudit, []);
  return Array.isArray(saved) ? saved : [];
}

export function appendComputerAudit(entry: ComputerAuditEntry): void {
  safeWrite(KEYS.computerAudit, [entry, ...loadComputerAudit()].slice(0, 500));
  window.dispatchEvent(new CustomEvent('tokenfence:computer-audit-updated'));
}

export function clearComputerAudit(): void {
  safeWrite(KEYS.computerAudit, []);
  window.dispatchEvent(new CustomEvent('tokenfence:computer-audit-updated'));
}

export function loadProjectRoot(): string {
  return safeRead<string>(KEYS.projectRoot, '');
}

export function saveProjectRoot(root: string): void {
  safeWrite(KEYS.projectRoot, root);
  window.dispatchEvent(new CustomEvent('tokenfence:project-updated'));
}

export function loadGitHubRepoUrl(): string {
  return safeRead<string>(KEYS.githubRepoUrl, 'https://github.com/Chrisbetheking/chris-studio');
}

export function saveGitHubRepoUrl(url: string): void {
  safeWrite(KEYS.githubRepoUrl, url.trim());
  window.dispatchEvent(new CustomEvent('tokenfence:github-updated'));
}

export function loadTokenUsage(): TokenUsageEntry[] {
  const saved = safeRead<TokenUsageEntry[]>(KEYS.tokenUsage, []);
  return Array.isArray(saved) ? saved.slice(0, 5_000) : [];
}

export function recordTokenUsage(entry: TokenUsageEntry): void {
  safeWrite(KEYS.tokenUsage, [entry, ...loadTokenUsage()].slice(0, 5_000));
  window.dispatchEvent(new CustomEvent('tokenfence:token-usage-updated'));
}

export function tokenUsageSummary(datePrefix = new Date().toISOString().slice(0, 10)): TokenUsageSummary {
  return loadTokenUsage().filter((entry) => entry.createdAt.startsWith(datePrefix)).reduce<TokenUsageSummary>((summary, entry) => ({
    inputTokens: summary.inputTokens + Math.max(0, entry.inputTokens || 0),
    outputTokens: summary.outputTokens + Math.max(0, entry.outputTokens || 0),
    savedTokens: summary.savedTokens + Math.max(0, entry.savedTokens || 0),
    totalTokens: summary.totalTokens + Math.max(0, entry.inputTokens || 0) + Math.max(0, entry.outputTokens || 0),
  }), { inputTokens: 0, outputTokens: 0, savedTokens: 0, totalTokens: 0 });
}

export function clearTokenUsage(): void {
  safeWrite(KEYS.tokenUsage, []);
  window.dispatchEvent(new CustomEvent('tokenfence:token-usage-updated'));
}

export function loadToolConnectors(): ToolConnectorProfile[] {
  const saved = safeRead<ToolConnectorProfile[]>(KEYS.connectors, []);
  return Array.isArray(saved) ? saved.map((connector) => ({ ...connector, token: '' })).slice(0, 50) : [];
}

export function saveToolConnectors(connectors: ToolConnectorProfile[]): void {
  safeWrite(KEYS.connectors, connectors.slice(0, 50).map((connector) => ({
    ...connector,
    token: '',
    credentialStored: Boolean(connector.credentialStored || connector.token.trim()),
  })));
  window.dispatchEvent(new CustomEvent('tokenfence:connectors-updated'));
}

export function saveToolConnector(connector: ToolConnectorProfile): void {
  saveToolConnectors([connector, ...loadToolConnectors().filter((item) => item.id !== connector.id)]);
}

export function deleteToolConnector(id: string): void {
  saveToolConnectors(loadToolConnectors().filter((item) => item.id !== id));
}

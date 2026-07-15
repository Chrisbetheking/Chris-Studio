import type {
  AppSettings,
  Conversation,
  ProviderConfig,
  ProviderStatus,
  SafetyReceipt,
} from './types';
import { scanText } from '../features/safety/scanner';

const KEYS = {
  settings: 'tokenfence.settings.v160',
  provider: 'tokenfence.provider.deepseek.v160',
  providerStatus: 'tokenfence.provider-status.deepseek.v160',
  conversations: 'tokenfence.conversations.v160',
  receipts: 'tokenfence.safety-receipts.v160',
} as const;

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  theme: 'system',
  startScreen: 'workspace',
  autoOpenInspector: true,
  autoScan: true,
  autoRedactCritical: true,
  blockCriticalSends: true,
  customSensitiveTerms: [],
  maxTextScanSize: 250_000,
  maxFileScanSize: 1_000_000,
  requestTimeoutMs: 60_000,
  conversationContextLimit: 20,
  localHistoryEnabled: true,
  safetyReceiptsEnabled: true,
  experimentalFeatures: false,
  debugMode: false,
};

export const DEFAULT_PROVIDER: ProviderConfig = {
  provider: 'deepseek',
  apiKey: '',
  model: 'deepseek-v4-flash',
  baseUrl: 'https://api.deepseek.com',
  demoMode: false,
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
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
        window.localStorage.setItem(`${key}.corrupt.${Date.now()}`, scanText(raw.slice(0, 200_000)).redactedText);
      } catch {
        // A storage quota problem must never crash the app.
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

export function loadSettings(): AppSettings {
  const saved = safeRead<Partial<AppSettings>>(KEYS.settings, {});
  return { ...DEFAULT_SETTINGS, ...saved };
}

export function saveSettings(settings: AppSettings): void {
  safeWrite(KEYS.settings, settings);
  window.dispatchEvent(new CustomEvent('tokenfence:settings-updated'));
}

export function loadProviderConfig(): ProviderConfig {
  const saved = safeRead<Partial<ProviderConfig>>(KEYS.provider, {}, false);
  return { ...DEFAULT_PROVIDER, ...saved, provider: 'deepseek' };
}

export function saveProviderConfig(config: ProviderConfig): void {
  safeWrite(KEYS.provider, { ...config, provider: 'deepseek' });
  window.dispatchEvent(new CustomEvent('tokenfence:provider-updated'));
}

export function clearProviderCredentials(): void {
  safeWrite(KEYS.provider, DEFAULT_PROVIDER);
  safeWrite<ProviderStatus>(KEYS.providerStatus, { state: 'not-configured' });
  window.dispatchEvent(new CustomEvent('tokenfence:provider-updated'));
}

export function loadProviderStatus(): ProviderStatus {
  const fallback: ProviderStatus = loadProviderConfig().apiKey
    ? { state: 'configured' }
    : { state: 'not-configured' };
  return safeRead<ProviderStatus>(KEYS.providerStatus, fallback, false);
}

export function saveProviderStatus(status: ProviderStatus): void {
  safeWrite(KEYS.providerStatus, status);
  window.dispatchEvent(new CustomEvent('tokenfence:provider-updated'));
}

export function loadConversations(): Conversation[] {
  const value = safeRead<Conversation[]>(KEYS.conversations, []);
  if (!Array.isArray(value)) return [];
  return value
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

export function deleteConversation(id: string): void {
  safeWrite(KEYS.conversations, loadConversations().filter((item) => item.id !== id));
  window.dispatchEvent(new CustomEvent('tokenfence:history-updated'));
}

export function clearConversations(): void {
  safeWrite(KEYS.conversations, []);
  window.dispatchEvent(new CustomEvent('tokenfence:history-updated'));
}

export function saveReceipt(receipt: SafetyReceipt): void {
  const existing = safeRead<SafetyReceipt[]>(KEYS.receipts, []);
  safeWrite(KEYS.receipts, [receipt, ...existing].slice(0, 500));
}

export function clearReceipts(): void {
  safeWrite(KEYS.receipts, []);
}

export function exportLocalSettings(): string {
  const settings = loadSettings();
  const provider = loadProviderConfig();
  return JSON.stringify(
    {
      exportedAt: nowIso(),
      settings,
      provider: {
        provider: provider.provider,
        model: provider.model,
        baseUrl: provider.baseUrl,
        demoMode: provider.demoMode,
        hasCredential: Boolean(provider.apiKey),
      },
    },
    null,
    2,
  );
}

export function resetApplication(): void {
  if (!canUseStorage()) return;
  Object.values(KEYS).forEach((key) => window.localStorage.removeItem(key));
  window.dispatchEvent(new CustomEvent('tokenfence:reset'));
}

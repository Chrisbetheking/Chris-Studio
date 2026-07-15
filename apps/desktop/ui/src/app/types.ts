export type Language = 'en' | 'zh-CN';
export type ThemeMode = 'system' | 'light' | 'dark';
export type ScreenId = 'workspace' | 'history' | 'providers' | 'settings' | 'about';
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'safe';

export interface AttachmentDraft {
  id: string;
  name: string;
  size: number;
  content: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  provider?: string;
  model?: string;
  riskLevel?: RiskLevel;
  failed?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  model: string;
  riskSummary: RiskLevel;
  messages: ChatMessage[];
}

export interface SafetyFinding {
  id: string;
  kind: string;
  label: string;
  severity: Severity;
  start: number;
  end: number;
  replacement: string;
}

export interface TextScanResult {
  originalLength: number;
  redactedText: string;
  findings: SafetyFinding[];
  riskLevel: RiskLevel;
  riskScore: number;
  estimatedTokens: number;
}

export interface PayloadScanResult {
  hash: string;
  prompt: TextScanResult;
  attachments: Array<AttachmentDraft & { scan: TextScanResult }>;
  findings: SafetyFinding[];
  riskLevel: RiskLevel;
  riskScore: number;
  estimatedTokens: number;
}

export interface ProviderConfig {
  provider: 'deepseek';
  apiKey: string;
  model: string;
  baseUrl: string;
  demoMode: boolean;
}

export interface ProviderStatus {
  state: 'not-configured' | 'configured' | 'connected' | 'error';
  checkedAt?: string;
  latencyMs?: number;
  model?: string;
  message?: string;
}

export interface AppSettings {
  language: Language;
  theme: ThemeMode;
  startScreen: ScreenId;
  autoOpenInspector: boolean;
  autoScan: boolean;
  autoRedactCritical: boolean;
  blockCriticalSends: boolean;
  customSensitiveTerms: string[];
  maxTextScanSize: number;
  maxFileScanSize: number;
  requestTimeoutMs: number;
  conversationContextLimit: number;
  localHistoryEnabled: boolean;
  safetyReceiptsEnabled: boolean;
  experimentalFeatures: boolean;
  debugMode: boolean;
}

export interface SafetyReceipt {
  id: string;
  conversationId: string;
  createdAt: string;
  provider: string;
  model: string;
  riskLevel: RiskLevel;
  findingKinds: string[];
  attachmentNames: string[];
  requestCharacters: number;
  result: 'sent' | 'demo' | 'failed';
}

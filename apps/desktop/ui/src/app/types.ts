export type Language = 'en' | 'zh-CN';
export type ThemeMode = 'system' | 'light' | 'dark';
export type ScreenId =
  | 'workspace'
  | 'projects'
  | 'computer'
  | 'skills'
  | 'connectors'
  | 'agents'
  | 'files'
  | 'routing'
  | 'providers'
  | 'history'
  | 'updates'
  | 'settings'
  | 'about';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'safe';
export type ProviderId =
  | 'local-demo'
  | 'deepseek'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'qwen'
  | 'kimi'
  | 'doubao'
  | 'zhipu'
  | 'openrouter'
  | 'ollama'
  | 'lmstudio'
  | 'custom';
export type ProviderApiStyle = 'local-demo' | 'openai-compatible' | 'anthropic';
export type ProviderStatusState = 'not-configured' | 'configured' | 'connected' | 'error';
export type FileKind = 'text' | 'code' | 'pdf' | 'document' | 'spreadsheet' | 'image' | 'unknown';
export type ProcessorId = 'text-reader' | 'pdf-extractor' | 'docx-reader' | 'sheet-reader' | 'local-ocr';
export type WorkspaceMode = 'chat' | 'agent';
export type AgentCollaborationMode = 'single' | 'plan-execute-review';
export type AgentRole = 'planner' | 'executor' | 'reviewer';
export type AgentResumeStage = AgentRole | 'revision';
export type AgentRunPhase = 'idle' | 'planning' | 'executing' | 'reviewing' | 'revising' | 'completed' | 'partial' | 'failed' | 'cancelled';
export type SkillPermission =
  | 'network'
  | 'files-read'
  | 'files-write'
  | 'github'
  | 'terminal-safe'
  | 'computer-view'
  | 'computer-control';

export interface AttachmentDraft {
  id: string;
  name: string;
  size: number;
  content: string;
  kind?: FileKind;
  processor?: ProcessorId;
  mimeType?: string;
  pageCount?: number;
  warnings?: string[];
  dataUrl?: string;
  ocrLanguage?: string;
}

export interface AgentPlanStep {
  id: string;
  title: string;
  detail?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface AgentRoleReceipt {
  role: AgentRole;
  providerProfileId: string;
  provider: string;
  model: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: string;
  finishedAt?: string;
  message?: string;
}

export interface AgentResumeAttempt {
  stage: AgentResumeStage;
  previousRunId: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  message?: string;
}

export interface AgentRunReceipt {
  id: string;
  mode: AgentCollaborationMode;
  phase: AgentRunPhase;
  startedAt: string;
  finishedAt?: string;
  plan: AgentPlanStep[];
  roles: AgentRoleReceipt[];
  reviewSummary?: string;
  reviewVerdict?: 'pass' | 'revise' | 'unavailable';
  errorMessage?: string;
  resumeStage?: AgentResumeStage;
  resumedFromRunId?: string;
  resumeAttempts?: AgentResumeAttempt[];
  inputAttachmentCount?: number;
  inputVisionAttachmentCount?: number;
}

export interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  createdAt: string;
  provider?: string;
  model?: string;
  riskLevel?: RiskLevel;
  failed?: boolean;
  agentRun?: AgentRunReceipt;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  model: string;
  riskSummary: RiskLevel;
  mode?: WorkspaceMode;
  agentId?: string;
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

export interface ProviderCapabilities {
  vision: boolean;
  tools: boolean;
  reasoning: boolean;
  local: boolean;
  files: boolean;
}

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  shortName: string;
  apiStyle: ProviderApiStyle;
  defaultBaseUrl: string;
  defaultModel: string;
  modelSuggestions: string[];
  requiresCredential: boolean;
  capabilities: ProviderCapabilities;
  accent: string;
  descriptionEn: string;
  descriptionZh: string;
}

export interface ProviderProfile {
  id: string;
  providerId: ProviderId;
  displayName: string;
  apiStyle: ProviderApiStyle;
  baseUrl: string;
  model: string;
  enabled: boolean;
  credentialStored: boolean;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderStatus {
  state: ProviderStatusState;
  checkedAt?: string;
  latencyMs?: number;
  model?: string;
  message?: string;
}

export interface RoutingRule {
  id: string;
  kind: FileKind | 'default';
  providerProfileId: string;
  modelOverride?: string;
  enabled: boolean;
  reasonEn: string;
  reasonZh: string;
}

export interface SkillDefinition {
  id: string;
  nameEn: string;
  nameZh: string;
  descriptionEn: string;
  descriptionZh: string;
  category: 'coding' | 'documents' | 'research' | 'security' | 'productivity' | 'automation';
  icon: string;
  permissions: SkillPermission[];
  systemPrompt: string;
  builtIn: boolean;
}

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  providerProfileId?: string;
  collaborationMode?: AgentCollaborationMode;
  plannerProviderProfileId?: string;
  executorProviderProfileId?: string;
  reviewerProviderProfileId?: string;
  maxRevisionRounds?: 0 | 1;
  skillIds: string[];
  permissionMode: 'ask' | 'read-only' | 'trusted';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
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
  tokenOptimizationMode: 'off' | 'conservative' | 'balanced';
  maxRequestTokens: number;
  dailyTokenBudget: number;
  githubOwner: string;
  githubRepo: string;
  autoCheckUpdates: boolean;
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
  estimatedTokens?: number;
  optimizedTokens?: number;
  result: 'sent' | 'demo' | 'failed';
}

export interface TokenOptimizationResult {
  originalText: string;
  optimizedText: string;
  originalTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  savedPercent: number;
  changes: string[];
}

export interface TokenUsageEntry {
  id: string;
  createdAt: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  savedTokens: number;
}

export interface TokenUsageSummary {
  inputTokens: number;
  outputTokens: number;
  savedTokens: number;
  totalTokens: number;
}

export interface ReleaseAsset {
  name: string;
  downloadUrl: string;
  size: number;
}

export interface UpdateInfo {
  ok: boolean;
  currentVersion: string;
  latestVersion?: string;
  updateAvailable: boolean;
  releaseUrl?: string;
  publishedAt?: string;
  notes?: string;
  assets: ReleaseAsset[];
  errorMessage?: string;
}

export interface ComputerCapability {
  id: 'screen-capture' | 'open-url' | 'keyboard' | 'pointer' | 'project-files' | 'terminal';
  available: boolean;
  permissionRequired: boolean;
  status: 'ready' | 'permission-needed' | 'planned';
  message: string;
}


export interface ProjectFileNode {
  path: string;
  name: string;
  kind: 'file' | 'directory';
  size: number;
  depth: number;
  children?: ProjectFileNode[];
}

export interface ProjectWorkspace {
  root: string;
  name: string;
  fileCount: number;
  gitRepository: boolean;
}

export interface ProjectFileContent {
  ok: boolean;
  path: string;
  content: string;
  binary: boolean;
  size: number;
  errorMessage?: string;
}

export interface ProjectWriteResult {
  ok: boolean;
  path: string;
  backupPath?: string;
  bytesWritten: number;
  errorMessage?: string;
}

export interface ProjectCommandResult {
  ok: boolean;
  preset: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode?: number;
  durationMs: number;
  errorMessage?: string;
}

export interface ProjectCodingPlan {
  summary: string;
  steps: string[];
  filesToRead: string[];
  checks: string[];
  risks: string[];
}

export interface ProjectPatchFileSummary {
  path: string;
  oldPath?: string;
  newPath?: string;
  action: 'add' | 'modify' | 'delete' | 'rename';
  additions: number;
  deletions: number;
  patch: string;
}

export interface ProjectChangeFileReceipt {
  path: string;
  action: 'add' | 'modify' | 'delete';
  existedBefore: boolean;
  backupPath?: string;
  afterPath?: string;
  status: 'applied' | 'accepted' | 'rolled-back' | 'rollback-blocked' | 'failed';
  errorMessage?: string;
}

export interface ProjectChangeSessionResult {
  ok: boolean;
  sessionId?: string;
  status: 'applied' | 'partially-rolled-back' | 'rolled-back' | 'accepted' | 'failed';
  files: ProjectChangeFileReceipt[];
  patchArchive?: string;
  errorMessage?: string;
}

export interface ProjectRecoveredChangeSession {
  session: ProjectChangeSessionResult;
  patch: string;
}

export interface ProjectCodingReview {
  verdict: 'pass' | 'revise' | 'block';
  summary: string;
  issues: string[];
  tested: string[];
}

export interface GitHubConnectionInfo {
  ok: boolean;
  login?: string;
  name?: string;
  avatarUrl?: string;
  errorMessage?: string;
}

export interface GitHubRepositoryOverview {
  ok: boolean;
  fullName?: string;
  defaultBranch?: string;
  privateRepo?: boolean;
  stars?: number;
  openIssues?: number;
  pushedAt?: string;
  htmlUrl?: string;
  errorMessage?: string;
}

export interface GitHubIssueSummary {
  number: number;
  title: string;
  state: string;
  url: string;
  updatedAt?: string;
}


export interface GitHubPullRequestResult {
  ok: boolean;
  number?: number;
  url?: string;
  title?: string;
  errorMessage?: string;
}

export interface ComputerActionResult {
  ok: boolean;
  action: string;
  message: string;
  screenshotDataUrl?: string;
  timestamp: string;
}

export interface ComputerAuditEntry {
  id: string;
  action: string;
  detail: string;
  ok: boolean;
  createdAt: string;
}

export interface KnowledgeChunk {
  id: string;
  sourceId: string;
  sourceName: string;
  text: string;
  tokens: string[];
  index: number;
}

export interface KnowledgeSearchHit {
  chunk: KnowledgeChunk;
  score: number;
}

export interface CustomSkillDefinition extends SkillDefinition {
  version: string;
  source: 'local' | 'imported';
  updatedAt: string;
}

export interface ToolConnectorProfile {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  requiresCredential: boolean;
  credentialStored: boolean;
  token: string;
  createdAt: string;
  updatedAt: string;
}

export interface McpReply {
  ok: boolean;
  status: number;
  result?: unknown;
  errorCode?: string;
  errorMessage?: string;
  latencyMs: number;
}

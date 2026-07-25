import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentProfile,
  AgentRunReceipt,
  AppSettings,
  AttachmentDraft,
  ChatMessage,
  Conversation,
  Language,
  ProviderProfile,
  ProviderStatus,
  PayloadScanResult,
  RiskLevel,
  SafetyReceipt,
  WorkspaceMode,
} from '../app/types';
import {
  loadActiveAgentId,
  loadActiveProvider,
  loadActiveProviderId,
  loadAgents,
  loadConversations,
  loadCustomSkills,
  loadKnowledgeIndex,
  loadProviderProfiles,
  loadProviderStatus,
  loadRoutingRules,
  loadSettings,
  makeId,
  nowIso,
  saveActiveAgentId,
  saveActiveProviderId,
  recordTokenUsage,
  saveConversation,
  saveReceipt,
  saveProjectRoot,
  tokenUsageSummary,
} from '../app/store';
import { providerDefinition } from '../app/providerRegistry';
import { skillPrompt } from '../app/skills';
import { formatSafePayload, maxRisk, scanPayload } from '../features/safety/scanner';
import { sendProviderChatStream } from '../features/providers/providerClientReliable';
import { canResumeAgentRun, resumeCollaborativeAgent, runCollaborativeAgent } from '../features/agent-runtime/collaborativeRun';
import { CHRIS_STUDIO_SYSTEM_PROMPT, identityReply, isIdentityQuestion } from '../app/identity';
import { captureScreen, clickPointer, openApplication, pressKey, requestComputerPermissions, typeText } from '../features/computer/computerClientReliable';
import { chooseProjectFolder, projectGitDiff, projectGitStatus, runProjectPreset } from '../features/projects/projectClient';
import { processFile } from '../features/files/fileProcessor';
import { routeAttachments } from '../features/files/routing';
import { formatKnowledgeContext, searchKnowledge } from '../features/files/knowledge';
import { optimizeText } from '../features/tokens/optimizer';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

function normalizeApplicationName(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (['textedit', 'text edit', '文本编辑', '文本编辑器', '文档'].includes(normalized)) return 'TextEdit';
  if (['notes', 'note', '备忘录'].includes(normalized)) return 'Notes';
  if (['safari', 'browser', '浏览器'].includes(normalized)) return 'Safari';
  if (['finder', '访达'].includes(normalized)) return 'Finder';
  if (['terminal', '终端'].includes(normalized)) return 'Terminal';
  if (['system settings', 'settings', '系统设置'].includes(normalized)) return 'System Settings';
  return null;
}

function normalizeLocalToolIntent(text: string): string {
  const value = text.trim();
  const lower = value.toLowerCase();
  if (/^(截屏|截图|截取屏幕|capture screen|take a screenshot)$/.test(lower)) return '/screen';
  if (/^(请求权限|电脑权限|打开电脑权限|request permissions|computer permissions)$/.test(lower)) return '/permissions';
  if (/^(选择项目|打开项目|连接项目|choose project|open project)$/.test(lower)) return '/project';
  if (/^(git status|查看 git 状态|查看git状态)$/.test(lower)) return '/git status';
  if (/^(git diff|查看 git diff|查看git diff|查看差异)$/.test(lower)) return '/git diff';
  if (/^(查看 skills|查看skills|skills|skill 列表|skill列表)$/.test(lower)) return '/skills';
  if (/^(帮助|命令帮助|help|commands)$/.test(lower)) return '/help';

  const chineseOpen = value.match(/^(?:请)?(?:帮我)?(?:打开|启动)\s*(文档|文本编辑器?|text\s*edit|textedit|备忘录|notes?|safari|浏览器|访达|finder|终端|terminal|系统设置)(?:\s*(?:并|然后|再)?\s*(?:输入|写入|键入|打字)\s*[:：]?\s*(.+))?$/i);
  if (chineseOpen) {
    const app = normalizeApplicationName(chineseOpen[1]);
    if (app) return chineseOpen[2]?.trim() ? `/open ${app} --type ${chineseOpen[2].trim()}` : `/open ${app}`;
  }

  const englishOpen = value.match(/^(?:please\s+)?open\s+(.+?)(?:\s+and\s+(?:type|enter|write)\s+(.+))?$/i);
  if (englishOpen) {
    const app = normalizeApplicationName(englishOpen[1]);
    if (app) return englishOpen[2]?.trim() ? `/open ${app} --type ${englishOpen[2].trim()}` : `/open ${app}`;
  }

  const directType = value.match(/^(?:输入|写入|键入|打字|type|enter)\s*[:：]?\s*(.+)$/i);
  if (directType?.[1]?.trim()) return `/type ${directType[1].trim()}`;
  return value;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

type RequestStage = 'idle' | 'reviewing' | 'local' | 'provider' | 'finalizing';

function requestStageLabel(language: Language, stage: RequestStage): string {
  const labels: Record<RequestStage, [string, string]> = {
    idle: ['Ready', '就绪'],
    reviewing: ['Reviewing locally', '正在本地审查'],
    local: ['Running approved local action', '正在执行已批准的本地操作'],
    provider: ['Waiting for model response', '正在等待模型响应'],
    finalizing: ['Saving result locally', '正在本地保存结果'],
  };
  return copy(language, labels[stage][0], labels[stage][1]);
}

const riskLabel = (language: Language, level: RiskLevel) => ({
  safe: copy(language, 'Safe', '安全'),
  low: copy(language, 'Low', '低风险'),
  medium: copy(language, 'Medium', '中风险'),
  high: copy(language, 'High', '高风险'),
  critical: copy(language, 'Critical', '严重风险'),
}[level]);

function agentPhaseLabel(language: Language, phase: AgentRunReceipt['phase']): string {
  const labels: Record<AgentRunReceipt['phase'], [string, string]> = {
    idle: ['Ready', '就绪'],
    planning: ['Planning', '规划中'],
    executing: ['Executing', '执行中'],
    reviewing: ['Independent review', '独立审查中'],
    revising: ['Bounded revision', '有限修订中'],
    completed: ['Completed', '已完成'],
    partial: ['Draft completed · review unavailable', '草稿已完成 · 审查不可用'],
    failed: ['Failed', '失败'],
    cancelled: ['Stopped', '已停止'],
  };
  return copy(language, labels[phase][0], labels[phase][1]);
}

function agentRoleLabel(language: Language, role: AgentRunReceipt['roles'][number]['role']): string {
  if (role === 'planner') return copy(language, 'Planner', '规划');
  if (role === 'reviewer') return copy(language, 'Reviewer', '审查');
  return copy(language, 'Executor', '执行');
}

function agentResumeStageLabel(language: Language, stage: NonNullable<AgentRunReceipt['resumeStage']>): string {
  if (stage === 'planner') return copy(language, 'restart planning', '重新规划');
  if (stage === 'executor') return copy(language, 'resume execution', '继续执行');
  if (stage === 'reviewer') return copy(language, 'retry review', '重试审查');
  return copy(language, 'resume revision', '继续修订');
}

function AgentRunPanel({
  receipt,
  language,
  compact = false,
  onResume,
  resumeBusy = false,
}: {
  receipt: AgentRunReceipt;
  language: Language;
  compact?: boolean;
  onResume?: () => void;
  resumeBusy?: boolean;
}) {
  return (
    <section className={`agent-run-panel phase-${receipt.phase} ${compact ? 'compact' : ''}`}>
      <header className="agent-run-panel-head">
        <span><Icon name="bot" />{copy(language, 'Plan → Execute → Review', '规划 → 执行 → 审查')}</span>
        <strong>{agentPhaseLabel(language, receipt.phase)}</strong>
      </header>
      <div className="agent-role-strip">
        {receipt.roles.map((role) => (
          <div key={role.role} className={`agent-role-chip status-${role.status}`}>
            <span>{agentRoleLabel(language, role.role)}</span>
            <strong>{role.model}</strong>
            <small>{role.status}</small>
          </div>
        ))}
      </div>
      {receipt.plan.length > 0 && (
        <ol className="agent-plan-list">
          {receipt.plan.map((step) => <li key={step.id} className={`status-${step.status}`}><span /> <div><strong>{step.title}</strong>{step.detail && !compact && <small>{step.detail}</small>}</div></li>)}
        </ol>
      )}
      {receipt.reviewSummary && <details className="agent-review-summary" open={receipt.phase === 'partial' || receipt.phase === 'failed'}><summary>{copy(language, 'Review receipt', '审查回执')} · {receipt.reviewVerdict || '—'}</summary><pre>{receipt.reviewSummary}</pre></details>}
      {receipt.errorMessage && <p className="agent-run-error">{receipt.errorMessage}</p>}
      {receipt.resumedFromRunId && <p className="agent-resume-note"><Icon name="history" />{copy(language, `Recovered from checkpoint ${receipt.resumedFromRunId.slice(-8)}.`, `已从检查点 ${receipt.resumedFromRunId.slice(-8)} 恢复。`)}</p>}
      {onResume && receipt.resumeStage && canResumeAgentRun(receipt) && (
        <div className="agent-resume-actions">
          <button type="button" className="button secondary" onClick={onResume} disabled={resumeBusy}>
            <Icon name="refresh" />
            {resumeBusy
              ? copy(language, 'Recovering…', '恢复中…')
              : agentResumeStageLabel(language, receipt.resumeStage)}
          </button>
          <small>{copy(language, 'Completed roles are reused. The configured model is never silently replaced.', '已完成角色不会重跑，且绝不会静默更换已配置模型。')}</small>
        </div>
      )}
    </section>
  );
}

function newConversation(provider: ProviderProfile, mode: WorkspaceMode, agentId?: string): Conversation {
  const timestamp = nowIso();
  return {
    id: makeId('conversation'),
    title: 'New protected task',
    createdAt: timestamp,
    updatedAt: timestamp,
    provider: provider.displayName,
    model: provider.model,
    riskSummary: 'safe',
    mode,
    agentId,
    messages: [],
  };
}

function localDemoReply(language: Language, findings: number, tokens: number, savedTokens: number): string {
  return copy(
    language,
    `Local Sandbox completed the protected workflow. Chris Studio found ${findings} sensitive item${findings === 1 ? '' : 's'}, prepared an estimated ${tokens}-token request, and saved about ${savedTokens} token${savedTokens === 1 ? '' : 's'} through local compaction. No network request was made.`,
    `本地沙箱已完成受保护工作流。Chris Studio 检测到 ${findings} 处敏感内容，准备了约 ${tokens} Token 的安全请求，并通过本地压缩节约约 ${savedTokens} Token。本次没有发起网络请求。`,
  );
}

export function WorkspaceScreen({
  language,
  openConversationId,
  newSessionNonce,
  onOpenProviders,
  onOpenRouting,
  onOpenAgents,
  onConversationChange,
}: {
  language: Language;
  openConversationId?: string;
  newSessionNonce: number;
  onOpenProviders: () => void;
  onOpenRouting: () => void;
  onOpenAgents: () => void;
  onConversationChange?: (id: string | undefined) => void;
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [profiles, setProfiles] = useState<ProviderProfile[]>(() => loadProviderProfiles());
  const [provider, setProvider] = useState<ProviderProfile>(() => loadActiveProvider());
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>(() => loadProviderStatus(loadActiveProviderId()));
  const [agents, setAgents] = useState<AgentProfile[]>(() => loadAgents());
  const [activeAgentId, setActiveAgentId] = useState(() => loadActiveAgentId());
  const [mode, setMode] = useState<WorkspaceMode>('chat');
  const [reviewedHash, setReviewedHash] = useState<string | null>(null);
  const [criticalApproved, setCriticalApproved] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [requestStartedAt, setRequestStartedAt] = useState<number | null>(null);
  const [requestStage, setRequestStage] = useState<RequestStage>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [liveAgentRun, setLiveAgentRun] = useState<AgentRunReceipt | null>(null);
  const [resumeTargetId, setResumeTargetId] = useState<string | null>(null);
  const streamAbort = useRef<AbortController | null>(null);
  const [toolPreview, setToolPreview] = useState('');
  const [fileBusy, setFileBusy] = useState(false);
  const [fileProgress, setFileProgress] = useState(0);
  const [includeVisionImages, setIncludeVisionImages] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const composerInput = useRef<HTMLTextAreaElement | null>(null);
  const messageEnd = useRef<HTMLDivElement | null>(null);
  const toast = useToast();

  useEffect(() => {
    onConversationChange?.(conversation?.id);
  }, [conversation?.id, onConversationChange]);

  useEffect(() => {
    if (!requestStartedAt) { setElapsedMs(0); return; }
    const tick = window.setInterval(() => setElapsedMs(Date.now() - requestStartedAt), 100);
    return () => window.clearInterval(tick);
  }, [requestStartedAt]);

  useEffect(() => {
    const focusComposer = () => window.setTimeout(() => composerInput.current?.focus(), 0);
    window.addEventListener('chris-studio:focus-composer', focusComposer);
    return () => window.removeEventListener('chris-studio:focus-composer', focusComposer);
  }, []);

  const [scan, setScan] = useState<PayloadScanResult>(() => scanPayload('', [], loadSettings().customSensitiveTerms));
  const optimization = useMemo(() => optimizeText(prompt, settings.tokenOptimizationMode), [prompt, settings.tokenOptimizationMode]);
  const routingDecision = useMemo(() => routeAttachments(attachments, profiles, loadRoutingRules(), provider.id, language), [attachments, profiles, provider.id, language]);
  const knowledgeHits = useMemo(() => searchKnowledge(loadKnowledgeIndex(), prompt, 5), [prompt]);
  const effectiveProvider = routingDecision?.profile ?? provider;
  const effectiveModel = routingDecision?.model ?? provider.model;
  const effectiveStatus = loadProviderStatus(effectiveProvider.id);
  const activeAgent = agents.find((agent) => agent.id === activeAgentId) ?? agents[0];
  const isReviewed = reviewedHash === scan.hash;
  const hasInput = Boolean(prompt.trim() || attachments.length);
  const providerDef = providerDefinition(effectiveProvider.providerId);
  const visionImageCount = attachments.filter((attachment) => attachment.kind === 'image' && attachment.dataUrl).length;
  const providerReady = effectiveProvider.providerId === 'local-demo'
    || (!providerDef.requiresCredential || effectiveProvider.credentialStored) && effectiveStatus.state === 'connected';
  const mustApproveCritical = settings.blockCriticalSends && scan.riskLevel === 'critical';
  const projectedInputTokens = Math.max(0, (isReviewed ? scan.estimatedTokens : optimization.originalTokens) - optimization.savedTokens);
  const collaborativeAgentEnabled = mode === 'agent' && activeAgent?.collaborationMode === 'plan-execute-review' && effectiveProvider.providerId !== 'local-demo';
  const projectedModelCalls = collaborativeAgentEnabled ? 3 + (activeAgent?.maxRevisionRounds === 1 ? 1 : 0) : 1;
  const projectedBudgetTokens = projectedInputTokens * projectedModelCalls;
  const todayUsage = tokenUsageSummary();

  useEffect(() => {
    if (!openConversationId || conversation?.id === openConversationId) return;
    const found = loadConversations().find((item) => item.id === openConversationId) ?? null;
    setConversation(found);
    setPrompt('');
    setAttachments([]);
    setIncludeVisionImages(false);
    setReviewedHash(null);
    setCriticalApproved(false);
    if (found?.mode) setMode(found.mode);
    if (found?.agentId) setActiveAgentId(found.agentId);
  }, [openConversationId, conversation?.id]);

  useEffect(() => {
    const syncRenamedConversation = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; title?: string; updatedAt?: string }>).detail;
      if (!detail?.id || !detail.title) return;
      setConversation((current) => current && current.id === detail.id
        ? { ...current, title: detail.title as string, updatedAt: detail.updatedAt || current.updatedAt }
        : current);
    };
    window.addEventListener('chris-studio:conversation-renamed', syncRenamedConversation);
    return () => window.removeEventListener('chris-studio:conversation-renamed', syncRenamedConversation);
  }, []);

  useEffect(() => {
    if (newSessionNonce === 0) return;
    setConversation(null);
    setPrompt('');
    setAttachments([]);
    setIncludeVisionImages(false);
    setReviewedHash(null);
    setCriticalApproved(false);
  }, [newSessionNonce]);

  useEffect(() => {
    const updateProvider = () => {
      const nextProfiles = loadProviderProfiles();
      const next = loadActiveProvider();
      setProfiles(nextProfiles);
      setProvider(next);
      setProviderStatus(loadProviderStatus(next.id));
    };
    const updateSettings = () => setSettings(loadSettings());
    const updateAgents = () => {
      setAgents(loadAgents());
      setActiveAgentId(loadActiveAgentId());
    };
    window.addEventListener('tokenfence:providers-updated', updateProvider);
    window.addEventListener('tokenfence:settings-updated', updateSettings);
    window.addEventListener('tokenfence:agents-updated', updateAgents);
    return () => {
      window.removeEventListener('tokenfence:providers-updated', updateProvider);
      window.removeEventListener('tokenfence:settings-updated', updateSettings);
      window.removeEventListener('tokenfence:agents-updated', updateAgents);
    };
  }, []);

  useEffect(() => {
    setReviewedHash(null);
    setCriticalApproved(false);
    // Keep typing lightweight. The actual request payload is scanned only after Send.
    setScan(scanPayload('', [], settings.customSensitiveTerms));
  }, [prompt, attachments, settings.customSensitiveTerms]);

  useEffect(() => {
    messageEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages.length, streamingContent]);

  const selectProvider = (id: string) => {
    saveActiveProviderId(id);
    const next = profiles.find((profile) => profile.id === id);
    if (next) {
      setProvider(next);
      setProviderStatus(loadProviderStatus(next.id));
    }
  };

  const selectAgent = (id: string) => {
    saveActiveAgentId(id);
    setActiveAgentId(id);
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setFileBusy(true);
    setFileProgress(0);
    const next: AttachmentDraft[] = [];
    for (const file of Array.from(files)) {
      try {
        const processed = await processFile(file, settings.maxFileScanSize, setFileProgress);
        next.push(processed);
      } catch (error) {
        toast.show(error instanceof Error ? error.message : copy(language, 'File processing failed.', '文件处理失败。'), 'error');
      }
    }
    setAttachments((current) => [...current, ...next].slice(0, 12));
    setFileBusy(false);
    setFileProgress(0);
    if (next.length) toast.show(copy(language, `${next.length} file${next.length === 1 ? '' : 's'} processed locally.`, `已在本地处理 ${next.length} 个文件。`), 'success');
  };

  const review = () => {
    if (!hasInput) return;
    setReviewedHash(scan.hash);
    setInspectorOpen(true);
    toast.show(copy(language, 'Safety review locked to the current prompt and files.', '安全审查已锁定到当前提示词和文件。'), 'success');
  };

  const applyOptimization = () => {
    if (!optimization.savedTokens) {
      toast.show(copy(language, 'No safe local compression opportunity was found.', '没有发现可安全压缩的内容。'), 'warning');
      return;
    }
    setPrompt(optimization.optimizedText);
    toast.show(copy(language, `Saved about ${optimization.savedTokens} tokens locally.`, `已在本地节约约 ${optimization.savedTokens} Token。`), 'success');
  };

  const appendLocalResult = (userContent: string, assistantContent: string, failed = false, screenshotDataUrl?: string) => {
    const now = nowIso();
    const current = conversation ?? newConversation(effectiveProvider, mode, mode === 'agent' ? activeAgent?.id : undefined);
    const userMessage: ChatMessage = {
      id: makeId('message'), role: 'user', content: userContent, createdAt: now,
      provider: 'Chris Studio', model: 'local-control', riskLevel: scan.riskLevel,
    };
    const assistantMessage: ChatMessage = {
      id: makeId('message'), role: 'assistant', content: assistantContent, createdAt: nowIso(),
      provider: 'Chris Studio', model: 'local-control', failed,
    };
    const completed: Conversation = {
      ...current,
      title: current.messages.length ? current.title : userContent.slice(0, 54),
      updatedAt: nowIso(),
      provider: 'Chris Studio',
      model: 'local-control',
      mode,
      agentId: mode === 'agent' ? activeAgent?.id : undefined,
      riskSummary: maxRisk(current.riskSummary, scan.riskLevel),
      messages: [...current.messages, userMessage, assistantMessage],
    };
    setConversation(completed);
    if (settings.localHistoryEnabled) saveConversation(completed);
    if (screenshotDataUrl) setToolPreview(screenshotDataUrl);
    setPrompt('');
    setAttachments([]);
    setReviewedHash(null);
    setCriticalApproved(false);
  };

  const runInlineTool = async (raw: string): Promise<boolean> => {
    const value = normalizeLocalToolIntent(raw);
    if (!value.startsWith('/')) return false;
    const [command, ...parts] = value.split(/\s+/);
    const rest = value.slice(command.length).trim();
    const confirmationFree = command === '/permissions' || command === '/help' || command === '/skills';
    const approved = confirmationFree || window.confirm(copy(
      language,
      `Run this reviewed local action?\n${value}`,
      `执行这项已审查的本地操作吗？\n${value}`,
    ));
    if (!approved) {
      appendLocalResult(value, copy(language, 'The local action was cancelled.', '本地操作已取消。'), true);
      return true;
    }

    setSending(true);
    setRequestStage('local');
    setRequestStartedAt(Date.now());
    try {
      if (command === '/help') {
        appendLocalResult(value, copy(
          language,
          'Available commands: /project, /git status, /git diff, /check npm-test, /skills, /permissions, /screen, /open TextEdit, /open TextEdit --type hello, /type text, /click x y and /key cmd+s.',
          '可用命令：/project、/git status、/git diff、/check npm-test、/skills、/permissions、/screen、/open TextEdit、/open TextEdit --type 文字、/type 文字、/click x y、/key cmd+s。也可以直接说“打开文档并输入 Chris Studio”。',
        ));
        return true;
      }
      if (command === '/project') {
        const workspace = await chooseProjectFolder();
        if (!workspace) appendLocalResult(value, copy(language, 'No project folder was selected.', '未选择项目目录。'), true);
        else {
          saveProjectRoot(workspace.root);
          appendLocalResult(value, copy(language, `Project connected: ${workspace.name}
${workspace.root}
${workspace.fileCount} files`, `项目已连接：${workspace.name}
${workspace.root}
${workspace.fileCount} 个文件`));
        }
        return true;
      }
      if (command === '/git') {
        const gitAction = parts[0]?.toLowerCase();
        const result = gitAction === 'diff' ? await projectGitDiff() : await projectGitStatus();
        appendLocalResult(value, `${result.command}

${result.stdout || result.stderr || result.errorMessage || 'No output.'}`, !result.ok);
        return true;
      }
      if (command === '/check') {
        const preset = parts[0] || 'git-status';
        const result = await runProjectPreset(preset, true);
        appendLocalResult(value, `${result.command}

${result.stdout || result.stderr || result.errorMessage || 'No output.'}`, !result.ok);
        return true;
      }
      if (command === '/skills') {
        appendLocalResult(value, copy(language, `Active agent: ${activeAgent?.name ?? 'None'}
Skills: ${activeAgent?.skillIds.join(', ') || 'None'}`, `当前 Agent：${activeAgent?.name ?? '无'}
Skills：${activeAgent?.skillIds.join(', ') || '无'}`));
        return true;
      }
      if (command === '/open') {
        const typedMatch = rest.match(/^(.*?)\s+--type\s+([\s\S]+)$/i);
        const appName = (typedMatch?.[1] ?? rest).trim();
        const textToType = typedMatch?.[2]?.trim() ?? '';
        if (!appName) {
          appendLocalResult(value, copy(language, 'Choose an allowed app: TextEdit, Notes, Safari, Finder, Terminal or System Settings.', '请选择允许的应用：TextEdit、备忘录、Safari、访达、终端或系统设置。'), true);
          return true;
        }
        const openResult = await openApplication(appName, true);
        if (!openResult.ok || !textToType) {
          appendLocalResult(value, openResult.message, !openResult.ok);
          return true;
        }
        await wait(850);
        if (/^(textedit|notes)$/i.test(appName)) {
          await pressKey('cmd+n', true);
          await wait(250);
        }
        const typeResult = await typeText(textToType, true);
        appendLocalResult(value, `${openResult.message}
${typeResult.message}`, !typeResult.ok);
        return true;
      }

      let result = null;
      if (command === '/permissions') result = await requestComputerPermissions();
      else if (command === '/screen') result = await captureScreen(true);
      else if (command === '/type') {
        if (!rest) {
          appendLocalResult(value, copy(language, 'Add the text after /type.', '请在 /type 后填写需要输入的文字。'), true);
          return true;
        }
        result = await typeText(rest, true);
      } else if (command === '/click') {
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          appendLocalResult(value, copy(language, 'Use /click x y with numeric coordinates.', '请使用 /click x y，并填写数字坐标。'), true);
          return true;
        }
        result = await clickPointer(x, y, true);
      } else if (command === '/key') {
        const key = parts.join(' ').trim().toLowerCase();
        if (!key) {
          appendLocalResult(value, copy(language, 'Add an allowed key after /key.', '请在 /key 后填写允许的按键。'), true);
          return true;
        }
        result = await pressKey(key, true);
      }

      if (!result) {
        appendLocalResult(value, copy(
          language,
          'Unknown command. Type /help to see the reviewed local tools.',
          '未知命令。输入 /help 查看可用的本地工具。',
        ), true);
      } else {
        appendLocalResult(value, result.message, !result.ok, result.screenshotDataUrl);
      }
    } catch (error) {
      appendLocalResult(value, copy(
        language,
        `Local action failed: ${error instanceof Error ? error.message : 'Unknown error.'}`,
        `本地操作失败：${error instanceof Error ? error.message : '未知错误。'}`,
      ), true);
    } finally {
      setSending(false);
      setRequestStage('idle');
      setRequestStartedAt(null);
      streamAbort.current = null;
      setStreamingContent('');
      setStreamingReasoning('');
    }
    return true;
  };

  const stopCurrentRequest = () => {
    streamAbort.current?.abort();
    streamAbort.current = null;
    setRequestStage('finalizing');
    toast.show(copy(language, 'Stopping the current response…', '正在停止当前响应…'), 'warning');
  };

  const send = async (reviewOverride = false, scanOverride?: PayloadScanResult) => {
    const requestScan = scanOverride ?? scan;
    const requestIsReviewed = reviewedHash === requestScan.hash;
    if (!hasInput || (!requestIsReviewed && !reviewOverride) || sending) return;
    if (settings.blockCriticalSends && requestScan.riskLevel === 'critical' && !criticalApproved) {
      toast.show(copy(language, 'Confirm the redacted critical payload before sending.', '请先确认严重风险内容的脱敏版本。'), 'warning');
      return;
    }

    const originalPrompt = prompt.trim();
    if (await runInlineTool(originalPrompt)) return;

    if (isIdentityQuestion(originalPrompt) && attachments.length === 0) {
      appendLocalResult(originalPrompt, identityReply(language));
      return;
    }

    if (!providerReady) {
      toast.show(copy(language, `${effectiveProvider.displayName} is not connected.`, `${effectiveProvider.displayName} 尚未连接。`), 'warning');
      onOpenProviders();
      return;
    }
    if (projectedInputTokens > settings.maxRequestTokens) {
      toast.show(copy(language, `This request is about ${projectedInputTokens} tokens and exceeds the ${settings.maxRequestTokens} per-request limit.`, `本次请求约 ${projectedInputTokens} Token，超过单次 ${settings.maxRequestTokens} Token 的限制。`), 'error');
      return;
    }
    if (todayUsage.totalTokens + projectedBudgetTokens > settings.dailyTokenBudget) {
      const approved = window.confirm(copy(language, `This ${projectedModelCalls}-call workflow may exceed today's ${settings.dailyTokenBudget}-token budget. Continue?`, `本次 ${projectedModelCalls} 次模型调用工作流可能超过今日 ${settings.dailyTokenBudget} Token 预算，仍然继续吗？`));
      if (!approved) return;
    }

    setSending(true);
    setStreamingContent('');
    setStreamingReasoning('');
    setLiveAgentRun(null);
    setRequestStage('reviewing');
    setRequestStartedAt(Date.now());
    let pending: Conversation | null = null;

    try {
      const safePayload = formatSafePayload(requestScan);
      const now = nowIso();
      const current = conversation ?? newConversation(effectiveProvider, mode, mode === 'agent' ? activeAgent?.id : undefined);
      const userMessage: ChatMessage = {
        id: makeId('message'), role: 'user', content: safePayload, createdAt: now,
        provider: effectiveProvider.displayName, model: effectiveModel, riskLevel: requestScan.riskLevel,
      };
      pending = {
        ...current,
        title: current.messages.length ? current.title : (prompt.trim().slice(0, 54) || attachments[0]?.name || 'Protected task'),
        updatedAt: now,
        provider: effectiveProvider.displayName,
        model: effectiveModel,
        mode,
        agentId: mode === 'agent' ? activeAgent?.id : undefined,
        riskSummary: maxRisk(current.riskSummary, requestScan.riskLevel),
        messages: [...current.messages, userMessage],
      };
      setConversation(pending);
      // Persist the pending conversation before the parent shell selects it.
      // Without this, the openConversationId effect can reload an empty archive
      // entry and hide all live stream deltas behind the workspace home state.
      if (settings.localHistoryEnabled) saveConversation(pending);

      // The request has now passed every preflight gate and is durably queued in
      // the conversation. Clear the composer immediately instead of keeping the
      // submitted text visible for the entire Planner → Executor → Reviewer run.
      // Preflight failures above intentionally retain the draft.
      setPrompt('');
      window.setTimeout(() => composerInput.current?.focus(), 0);

      const requestMessages: Pick<ChatMessage, 'role' | 'content'>[] = pending.messages
        .slice(-settings.conversationContextLimit)
        .map(({ role, content }) => ({ role, content }));
      requestMessages.unshift({ role: 'system', content: CHRIS_STUDIO_SYSTEM_PROMPT });
      if (mode === 'agent' && activeAgent) {
        requestMessages.unshift({
          role: 'system',
          content: `You are operating inside Chris Studio as the ${activeAgent.name} agent.
${activeAgent.description}
Permission mode: ${activeAgent.permissionMode}.
${skillPrompt(activeAgent.skillIds, loadCustomSkills())}
Present one coherent Codex-style plan in the conversation. Before any external or destructive action, ask for explicit approval. Use the local slash tools only when the user explicitly approves them.`,
        });
      }
      if (knowledgeHits.length) {
        requestMessages.unshift({
          role: 'system',
          content: `Relevant local knowledge retrieved by Chris Studio. Cite source labels when used and ignore unrelated chunks.

${formatKnowledgeContext(knowledgeHits)}`,
        });
      }

      let assistantContent = '';
      let assistantModel = effectiveModel;
      let assistantProvider = 'Chris Studio';
      let agentRunReceipt: AgentRunReceipt | undefined;
      let failed = false;
      let receiptResult: SafetyReceipt['result'] = 'sent';
      setRequestStage('provider');

      if (effectiveProvider.providerId === 'local-demo') {
        assistantContent = localDemoReply(language, requestScan.findings.length, requestScan.estimatedTokens, optimization.savedTokens);
        receiptResult = 'demo';
      } else {
        try {
          const abortController = new AbortController();
          streamAbort.current = abortController;
          let streamed = '';
          let reasoning = '';

          if (collaborativeAgentEnabled && activeAgent) {
            const result = await runCollaborativeAgent({
              agent: activeAgent,
              profiles,
              defaultProfile: effectiveProvider,
              messages: requestMessages,
              timeoutMs: settings.requestTimeoutMs,
              attachments,
              includeVisionImages,
              signal: abortController.signal,
              callbacks: {
                onReceipt: (receipt) => setLiveAgentRun(receipt),
                onExecutorDelta: (delta) => {
                  streamed += delta;
                  setStreamingContent(streamed);
                },
                onExecutorReasoning: (delta) => {
                  reasoning += delta;
                  setStreamingReasoning(reasoning);
                },
                onResetExecutor: () => {
                  streamed = '';
                  reasoning = '';
                  setStreamingContent('');
                  setStreamingReasoning('');
                },
              },
            });
            agentRunReceipt = result.receipt;
            assistantContent = result.content || streamed;
            assistantModel = result.executorProfile.model;
            assistantProvider = result.executorProfile.displayName;
            failed = !result.ok && result.receipt.phase !== 'cancelled';
            if (!result.ok) {
              receiptResult = 'failed';
              const message = result.receipt.phase === 'cancelled'
                ? copy(language, 'Agent workflow stopped.', 'Agent 工作流已停止。')
                : copy(language, `Agent workflow failed: ${result.errorMessage || 'Unknown error.'}`, `Agent 工作流失败：${result.errorMessage || '未知错误。'}`);
              assistantContent = assistantContent.trim() ? `${assistantContent.trim()}

${message}` : message;
            }
          } else {
            const result = await sendProviderChatStream(
              effectiveProvider,
              requestMessages,
              settings.requestTimeoutMs,
              effectiveModel,
              attachments,
              includeVisionImages,
              {
                onDelta: (delta) => {
                  streamed += delta;
                  setStreamingContent(streamed);
                },
                onReasoning: (delta) => {
                  reasoning += delta;
                  setStreamingReasoning(reasoning);
                },
              },
              abortController.signal,
            );
            if (result.ok && (streamed || result.content)) assistantContent = streamed || result.content || '';
            else {
              failed = result.errorCode !== 'CANCELLED';
              receiptResult = 'failed';
              const partial = streamed.trim();
              const errorMessage = result.errorCode === 'CANCELLED'
                ? copy(language, 'Response stopped.', '响应已停止。')
                : copy(language, `Request failed: ${result.errorMessage ?? 'Unknown provider error.'}`, `请求失败：${result.errorMessage ?? '未知模型错误。'}`);
              assistantContent = partial ? `${partial}

${errorMessage}` : errorMessage;
            }
          }
          streamAbort.current = null;
        } catch (error) {
          streamAbort.current = null;
          failed = true;
          receiptResult = 'failed';
          assistantContent = copy(
            language,
            `Request failed before a model response was returned: ${error instanceof Error ? error.message : 'Unknown error.'}`,
            `模型返回响应前请求失败：${error instanceof Error ? error.message : '未知错误。'}`,
          );
        }
      }

      setRequestStage('finalizing');
      const assistantMessage: ChatMessage = {
        id: makeId('message'), role: 'assistant', content: assistantContent, createdAt: nowIso(),
        provider: assistantProvider, model: assistantModel, failed, agentRun: agentRunReceipt,
      };
      const completed: Conversation = { ...pending, updatedAt: nowIso(), messages: [...pending.messages, assistantMessage] };
      setConversation(completed);
      if (settings.localHistoryEnabled) saveConversation(completed);
      if (settings.safetyReceiptsEnabled) saveReceipt({
        id: makeId('receipt'), conversationId: completed.id, createdAt: nowIso(), provider: effectiveProvider.displayName,
        model: effectiveModel, riskLevel: requestScan.riskLevel, findingKinds: Array.from(new Set(requestScan.findings.map((finding) => finding.kind))),
        attachmentNames: attachments.map((file) => file.name), requestCharacters: safePayload.length,
        estimatedTokens: requestScan.estimatedTokens, optimizedTokens: Math.max(0, requestScan.estimatedTokens - optimization.savedTokens), result: receiptResult,
      });
      recordTokenUsage({
        id: makeId('usage'), createdAt: nowIso(), provider: assistantProvider, model: assistantModel,
        inputTokens: projectedBudgetTokens, outputTokens: Math.ceil(assistantContent.length / 4), savedTokens: optimization.savedTokens,
      });
      // Do not clear the composer again here. It was cleared when the request
      // was accepted, and the user may already be drafting the next message.
      setAttachments([]);
      setIncludeVisionImages(false);
      setReviewedHash(null);
      setCriticalApproved(false);
    } catch (error) {
      const message = copy(
        language,
        `Chris Studio could not finish this request: ${error instanceof Error ? error.message : 'Unknown error.'}`,
        `Chris Studio 未能完成本次请求：${error instanceof Error ? error.message : '未知错误。'}`,
      );
      if (pending) {
        const failedMessage: ChatMessage = {
          id: makeId('message'), role: 'assistant', content: message, createdAt: nowIso(),
          provider: 'Chris Studio', model: effectiveModel, failed: true,
        };
        const failedConversation: Conversation = { ...pending, updatedAt: nowIso(), messages: [...pending.messages, failedMessage] };
        setConversation(failedConversation);
        if (settings.localHistoryEnabled) saveConversation(failedConversation);
      }
      toast.show(message, 'error');
    } finally {
      setSending(false);
      setRequestStage('idle');
      setRequestStartedAt(null);
      streamAbort.current = null;
      setStreamingContent('');
      setStreamingReasoning('');
      setLiveAgentRun(null);
    }
  };

  const resumeAgentMessage = async (message: ChatMessage) => {
    const previousReceipt = message.agentRun;
    if (!conversation || !previousReceipt?.resumeStage || !canResumeAgentRun(previousReceipt) || sending) return;

    const stage = previousReceipt.resumeStage;
    if (
      previousReceipt.inputVisionAttachmentCount
      && previousReceipt.inputVisionAttachmentCount > 0
      && (stage === 'executor' || stage === 'revision')
    ) {
      toast.show(copy(
        language,
        'This checkpoint used vision images. Reattach the images and start a new Agent run so visual evidence is not silently dropped.',
        '该检查点使用了视觉图片。请重新添加图片并启动新的 Agent，避免恢复时静默丢失视觉证据。',
      ), 'warning');
      return;
    }

    const agent = agents.find((entry) => entry.id === conversation.agentId)
      ?? agents.find((entry) => entry.id === activeAgentId)
      ?? activeAgent;
    if (!agent) {
      toast.show(copy(language, 'The original Agent profile is unavailable.', '原始 Agent 配置已不可用。'), 'error');
      return;
    }

    const plannerRole = previousReceipt.roles.find((entry) => entry.role === 'planner');
    const executorRole = previousReceipt.roles.find((entry) => entry.role === 'executor');
    const reviewerRole = previousReceipt.roles.find((entry) => entry.role === 'reviewer');
    const lockedAgent: AgentProfile = {
      ...agent,
      collaborationMode: 'plan-execute-review',
      plannerProviderProfileId: plannerRole?.providerProfileId,
      executorProviderProfileId: executorRole?.providerProfileId,
      reviewerProviderProfileId: reviewerRole?.providerProfileId,
    };
    const defaultProfile = profiles.find((entry) => entry.id === executorRole?.providerProfileId)
      ?? effectiveProvider;

    const approved = window.confirm(copy(
      language,
      `Resume this Agent from the ${stage} checkpoint? Completed roles will not run again, and the original configured role models will remain locked.`,
      `从“${agentResumeStageLabel(language, stage)}”检查点继续吗？已完成角色不会重跑，原先配置的角色模型将保持锁定。`,
    ));
    if (!approved) return;

    const messageIndex = conversation.messages.findIndex((entry) => entry.id === message.id);
    if (messageIndex < 0) return;
    const contextMessages: Pick<ChatMessage, 'role' | 'content'>[] = conversation.messages
      .slice(0, messageIndex)
      .slice(-settings.conversationContextLimit)
      .map(({ role, content }) => ({ role, content }));
    contextMessages.unshift({ role: 'system', content: CHRIS_STUDIO_SYSTEM_PROMPT });
    contextMessages.unshift({
      role: 'system',
      content: `You are operating inside Chris Studio as the ${lockedAgent.name} agent.
${lockedAgent.description}
Permission mode: ${lockedAgent.permissionMode}.
${skillPrompt(lockedAgent.skillIds, loadCustomSkills())}
This is an explicit user-approved checkpoint recovery. Reuse completed role receipts and never claim a native or external action without a real Chris Studio tool receipt.`,
    });
    const lastUserRequest = [...contextMessages].reverse().find((entry) => entry.role === 'user')?.content ?? '';
    const resumedKnowledgeHits = searchKnowledge(loadKnowledgeIndex(), lastUserRequest, 5);
    if (resumedKnowledgeHits.length) {
      contextMessages.unshift({
        role: 'system',
        content: `Relevant local knowledge reloaded for checkpoint recovery. Cite source labels when used and ignore unrelated chunks.

${formatKnowledgeContext(resumedKnowledgeHits)}`,
      });
    }

    setSending(true);
    setResumeTargetId(message.id);
    setStreamingContent('');
    setStreamingReasoning('');
    setLiveAgentRun(previousReceipt);
    setRequestStage('provider');
    setRequestStartedAt(Date.now());

    let streamed = '';
    let reasoning = '';
    try {
      const abortController = new AbortController();
      streamAbort.current = abortController;
      const result = await resumeCollaborativeAgent({
        previousReceipt,
        existingDraft: stage === 'reviewer' || stage === 'revision' ? message.content : '',
        agent: lockedAgent,
        profiles,
        defaultProfile,
        messages: contextMessages,
        timeoutMs: settings.requestTimeoutMs,
        attachments: [],
        includeVisionImages: false,
        signal: abortController.signal,
        callbacks: {
          onReceipt: (receipt) => setLiveAgentRun(receipt),
          onExecutorDelta: (delta) => {
            streamed += delta;
            setStreamingContent(streamed);
          },
          onExecutorReasoning: (delta) => {
            reasoning += delta;
            setStreamingReasoning(reasoning);
          },
          onResetExecutor: () => {
            streamed = '';
            reasoning = '';
            setStreamingContent('');
            setStreamingReasoning('');
          },
        },
      });
      streamAbort.current = null;

      let content = result.content || streamed || message.content;
      const failed = !result.ok && result.receipt.phase !== 'cancelled';
      if (!result.ok) {
        const recoveryMessage = result.receipt.phase === 'cancelled'
          ? copy(language, 'Agent checkpoint recovery stopped.', 'Agent 检查点恢复已停止。')
          : copy(
            language,
            `Checkpoint recovery failed: ${result.errorMessage || 'Unknown error.'}`,
            `检查点恢复失败：${result.errorMessage || '未知错误。'}`,
          );
        content = content.trim() ? `${content.trim()}

${recoveryMessage}` : recoveryMessage;
      }

      const updatedMessage: ChatMessage = {
        ...message,
        content,
        provider: result.executorProfile.displayName,
        model: result.executorProfile.model,
        failed,
        agentRun: result.receipt,
      };
      const updatedConversation: Conversation = {
        ...conversation,
        updatedAt: nowIso(),
        messages: conversation.messages.map((entry) => entry.id === message.id ? updatedMessage : entry),
      };
      setConversation(updatedConversation);
      if (settings.localHistoryEnabled) saveConversation(updatedConversation);
      recordTokenUsage({
        id: makeId('usage'),
        createdAt: nowIso(),
        provider: result.executorProfile.displayName,
        model: result.executorProfile.model,
        inputTokens: Math.ceil(contextMessages.reduce((total, entry) => total + entry.content.length, 0) / 4),
        outputTokens: Math.ceil(content.length / 4),
        savedTokens: 0,
      });
      toast.show(
        result.receipt.phase === 'completed'
          ? copy(language, 'Agent checkpoint recovery completed.', 'Agent 检查点恢复完成。')
          : copy(language, 'Agent checkpoint updated. Review the remaining issue.', 'Agent 检查点已更新，请查看剩余问题。'),
        result.receipt.phase === 'completed' ? 'success' : 'warning',
      );
    } catch (error) {
      toast.show(copy(
        language,
        `Checkpoint recovery could not start: ${error instanceof Error ? error.message : 'Unknown error.'}`,
        `无法启动检查点恢复：${error instanceof Error ? error.message : '未知错误。'}`,
      ), 'error');
    } finally {
      setSending(false);
      setResumeTargetId(null);
      setRequestStage('idle');
      setRequestStartedAt(null);
      streamAbort.current = null;
      setStreamingContent('');
      setStreamingReasoning('');
      setLiveAgentRun(null);
      window.setTimeout(() => composerInput.current?.focus(), 0);
    }
  };

  const submit = () => {
    if (!hasInput || sending || fileBusy) return;
    if (isReviewed) {
      void send();
      return;
    }

    // Safety scanning is intentionally triggered by the send action rather than while the user types.
    setRequestStage('reviewing');
    const nextScan = scanPayload(prompt, attachments, settings.customSensitiveTerms);
    setScan(nextScan);
    setReviewedHash(nextScan.hash);
    if (settings.autoOpenInspector && nextScan.findings.length > 0) setInspectorOpen(true);
    if (nextScan.riskLevel === 'critical' && settings.blockCriticalSends) {
      setInspectorOpen(true);
      toast.show(copy(language, 'Critical values were detected. Review the redacted payload before it can be sent.', '检测到严重风险内容，请确认脱敏后的请求再发送。'), 'warning');
      return;
    }
    if (nextScan.riskLevel === 'high' || nextScan.riskLevel === 'medium') {
      const approved = window.confirm(copy(
        language,
        `Chris Studio found ${nextScan.findings.length} sensitive item${nextScan.findings.length === 1 ? '' : 's'} after you pressed Send. Send the redacted payload?`,
        `点击发送后，Chris Studio 检测到 ${nextScan.findings.length} 处敏感内容。是否发送脱敏后的请求？`,
      ));
      if (!approved) {
        setInspectorOpen(true);
        return;
      }
    }
    void send(true, nextScan);
  };

  const empty = !conversation?.messages.length && !sending;

  return (
    <main className={`workspace-modern ${inspectorOpen ? 'inspector-visible' : ''}`}>
      <section className="workspace-main">
        <header className="workspace-toolbar">
          <div className="mode-switch">
            <button className={mode === 'chat' ? 'active' : ''} onClick={() => setMode('chat')}><Icon name="workspace" />{copy(language, 'Chat', '对话')}</button>
            <button className={mode === 'agent' ? 'active' : ''} onClick={() => setMode('agent')}><Icon name="bot" />Agent</button>
          </div>
          {mode === 'agent' && (
            <select value={activeAgentId} onChange={(event) => selectAgent(event.target.value)} className="agent-select">
              {agents.filter((agent) => agent.enabled).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          )}
          <div className="workspace-toolbar-spacer" />
          <button className="route-chip" onClick={onOpenRouting}><Icon name="route" /><span>{routingDecision?.reason ?? copy(language, 'Default route', '默认路由')}</span></button>
          <button className={`icon-button ${inspectorOpen ? 'active' : ''}`} onClick={() => setInspectorOpen((value) => !value)}><Icon name="panel" /></button>
        </header>

        <div className="conversation-stage">
          {empty ? (
            <div className="workspace-empty-modern">
              <div className="empty-orb"><Icon name={mode === 'agent' ? 'bot' : 'shield'} size={28} /></div>
              <h1>{mode === 'agent' ? copy(language, 'Build with a protected agent.', '让受保护的 Agent 开始工作。') : copy(language, 'One workspace. Every model. Less data and fewer tokens.', '一个工作台，连接所有模型，减少泄露与 Token 浪费。')}</h1>
              <p>{mode === 'agent'
                ? copy(language, 'Skills, file processors, model routing and approval gates are assembled before the request leaves your Mac.', 'Skills、文件处理、模型路由与操作确认会在请求离开 Mac 前完成。')
                : copy(language, 'Chris Studio scans, compacts and routes each task before it reaches a cloud or local model.', 'Chris Studio 会在任务到达云端或本地模型之前完成扫描、压缩与路由。')}</p>
              <div className="starter-grid">
                <button onClick={() => { setMode('agent'); selectAgent('tokenfence-coder'); setPrompt(copy(language, 'Review this repository, propose a minimal implementation plan, and list the tests required before changing code.', '审查这个仓库，给出最小修改方案，并在改代码前列出必须执行的测试。')); }}><Icon name="code" /><strong>{copy(language, 'Code agent', '代码 Agent')}</strong><span>{copy(language, 'Plan → edit → verify', '规划 → 修改 → 验证')}</span></button>
                <button onClick={() => fileInput.current?.click()}><Icon name="fileText" /><strong>{copy(language, 'Process a file', '处理文件')}</strong><span>PDF · DOCX · XLSX · OCR</span></button>
                <button onClick={() => setPrompt('API_KEY=sk-test-example-1234567890\nemail=demo@example.com\nPlease summarize this configuration safely.')}><Icon name="shield" /><strong>{copy(language, 'Safety demo', '安全演示')}</strong><span>{copy(language, 'Detect and redact locally', '本地检测与脱敏')}</span></button>
              </div>
              <div className="workspace-links"><button onClick={onOpenAgents}><Icon name="bot" />{copy(language, 'Explore built-in skills', '查看内置 Skills')}</button><button onClick={onOpenProviders}><Icon name="server" />{copy(language, 'Connect more models', '连接更多模型')}</button></div>
            </div>
          ) : (
            <div className="message-list-modern">
              {conversation?.messages.filter((message) => message.role !== 'system').map((message) => (
                <article key={message.id} className={`message-bubble ${message.role} ${message.failed ? 'failed' : ''}`}>
                  <header><span>{message.role === 'user' ? copy(language, 'Protected request', '受保护请求') : message.provider}</span><small>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></header>
                  <div>{message.content}</div>
                  {message.agentRun && <AgentRunPanel receipt={message.agentRun} language={language} compact onResume={() => { void resumeAgentMessage(message); }} resumeBusy={sending || resumeTargetId === message.id} />}
                  {message.model && <footer>{message.model}</footer>}
                </article>
              ))}
              {sending && <article className="message-bubble assistant pending-message streaming-message"><header><span>Chris Studio</span><small>{(elapsedMs / 1000).toFixed(1)}s</small></header>{liveAgentRun && <AgentRunPanel receipt={liveAgentRun} language={language} />}{streamingReasoning && <details className="stream-reasoning"><summary>{copy(language, 'Reasoning', '思考过程')}</summary><div>{streamingReasoning}</div></details>}<div>{streamingContent || <><span className="typing-dots"><i /><i /><i /></span>{liveAgentRun ? agentPhaseLabel(language, liveAgentRun.phase) : requestStageLabel(language, requestStage)}</>}</div></article>}
              <div ref={messageEnd} />
            </div>
          )}
        </div>

        <div className="composer-zone">
          {attachments.length > 0 && <div className="attachment-strip-modern">{attachments.map((file) => <div key={file.id} className="attachment-card-mini"><Icon name={file.kind === 'image' ? 'image' : file.kind === 'spreadsheet' ? 'table' : 'file'} /><span><strong>{file.name}</strong><small>{file.processor} · {Math.ceil(file.content.length / 4)} tokens</small></span><button onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))}><Icon name="x" size={14} /></button></div>)}</div>}
          {fileBusy && <div className="file-progress"><span style={{ width: `${Math.max(8, fileProgress * 100)}%` }} /><small>{copy(language, 'Local processor working…', '本地处理模块运行中…')}</small></div>}
          <div className="composer-modern">
            <textarea ref={composerInput} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); submit(); } }} placeholder={mode === 'agent' ? copy(language, 'Describe the outcome, or say “open TextEdit and type…” in this same conversation…', '描述你要完成的结果，也可以直接说“打开文档并输入……”') : copy(language, 'Message any connected model, attach a file, or run an approved local command…', '向任意模型发消息、添加文件，或直接说“打开文档并输入……”')} rows={4} />
            <div className="composer-modern-footer">
              <input ref={fileInput} type="file" multiple hidden accept=".txt,.md,.json,.csv,.log,.xml,.yaml,.yml,.js,.jsx,.ts,.tsx,.py,.rs,.go,.java,.html,.css,.pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.webp" onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ''; }} />
              <button className="icon-button" onClick={() => fileInput.current?.click()} disabled={fileBusy}><Icon name="paperclip" /></button>
              <div className="composer-metrics"><span><Icon name="sparkles" size={14} />{optimization.originalTokens} → {optimization.optimizedTokens}</span>{collaborativeAgentEnabled && <span><Icon name="bot" size={13} />{projectedModelCalls} {copy(language, 'model calls', '次模型调用')}</span>}<span className="send-scan-note"><Icon name="shield" size={13} />{copy(language, 'Scans after send', '发送后检测')}</span><span>{attachments.length} {copy(language, 'files', '文件')}</span>{knowledgeHits.length > 0 && <span>{knowledgeHits.length} RAG</span>}</div>
              {optimization.savedTokens > 0 && <button className="compact-action" onClick={applyOptimization}><Icon name="wand" />-{optimization.savedTokens} tokens</button>}
              {visionImageCount > 0 && providerDef.capabilities.vision && <button className={`compact-action ${includeVisionImages ? 'active' : ''}`} onClick={() => setIncludeVisionImages((value) => !value)}><Icon name="image" />{includeVisionImages ? copy(language, 'Vision on', '视觉已启用') : copy(language, 'Use vision', '启用视觉')}</button>}
              <button className={`button primary ${sending ? 'stop-request' : ''}`} onClick={sending ? stopCurrentRequest : submit} disabled={!sending && (!hasInput || fileBusy || (isReviewed && mustApproveCritical && !criticalApproved))}><Icon name={sending ? 'x' : mode === 'agent' ? 'bot' : 'send'} />{sending ? copy(language, 'Stop', '停止') : isReviewed && scan.findings.length > 0 ? copy(language, 'Send redacted', '发送脱敏内容') : mode === 'agent' ? copy(language, 'Run in workspace', '在工作台运行') : copy(language, 'Send', '发送')}</button>
            </div>
          </div>
          <div className="composer-caption"><span>{effectiveProvider.displayName} · {effectiveModel}</span><span>{sending ? `${copy(language, 'Elapsed', '已用时')} ${(elapsedMs / 1000).toFixed(1)}s` : effectiveStatus.state === 'connected' ? copy(language, 'Connected · ⌘↵ to send', '已连接 · ⌘↵ 发送') : effectiveProvider.providerId === 'local-demo' ? copy(language, 'Offline sandbox', '离线沙箱') : copy(language, 'Connection required', '需要连接')}</span></div>
        </div>
      </section>

      {inspectorOpen && (
        <aside className="inspector-modern">
          <header><div><span className="section-kicker">CHRIS STUDIO CONTROL</span><h2>{copy(language, 'Request control', '请求控制')}</h2></div><button className="icon-button" onClick={() => setInspectorOpen(false)}><Icon name="x" /></button></header>
          <div className={`risk-hero risk-panel-${scan.riskLevel}`}><div><strong>{scan.riskScore}</strong><span>/100</span></div><div><small>{copy(language, 'CURRENT RISK', '当前风险')}</small><h3>{riskLabel(language, scan.riskLevel)}</h3><p>{isReviewed ? copy(language, 'Locked to this exact payload', '已锁定到当前请求') : copy(language, 'Scan starts after Send', '点击发送后开始检测')}</p></div></div>
          <div className="inspector-card token-card"><div className="inspector-card-title"><span><Icon name="sparkles" />Token budget</span><strong>{scan.estimatedTokens}</strong></div><div className="token-bar"><span style={{ width: `${Math.min(100, scan.estimatedTokens / 80)}%` }} /></div><div className="token-stats"><span>{copy(language, 'Local saving', '本地节约')}<strong>{optimization.savedTokens}</strong></span><span>{copy(language, 'Context limit', '上下文轮次')}<strong>{settings.conversationContextLimit}</strong></span></div></div>
          <div className="inspector-card"><div className="inspector-card-title"><span><Icon name="route" />{copy(language, 'Routing', '模型路由')}</span><button onClick={onOpenRouting}>{copy(language, 'Edit', '编辑')}</button></div><div className="route-summary"><span className="provider-avatar tiny" style={{ '--provider-accent': providerDefinition(effectiveProvider.providerId).accent } as React.CSSProperties}>{providerDefinition(effectiveProvider.providerId).shortName}</span><div><strong>{effectiveProvider.displayName}</strong><small>{effectiveModel}</small></div></div><p className="route-reason">{routingDecision?.reason}</p></div>
          {mode === 'agent' && activeAgent && <div className="inspector-card"><div className="inspector-card-title"><span><Icon name="bot" />Agent</span><button onClick={onOpenAgents}>{copy(language, 'Configure', '配置')}</button></div><strong className="agent-name-inspector">{activeAgent.name}</strong><div className="skill-dot-row">{activeAgent.skillIds.slice(0, 5).map((id) => <span key={id}>{id}</span>)}</div><p className="route-reason">{copy(language, `Permission mode: ${activeAgent.permissionMode}`, `权限模式：${activeAgent.permissionMode}`)}</p><p className="route-reason">{activeAgent.collaborationMode === 'plan-execute-review' ? copy(language, `Collaboration: Planner → Executor → Reviewer · ${projectedModelCalls} calls`, `协作：规划 → 执行 → 审查 · ${projectedModelCalls} 次调用`) : copy(language, 'Collaboration: Single model', '协作：单模型')}</p>{liveAgentRun && <AgentRunPanel receipt={liveAgentRun} language={language} compact />}</div>}
          <div className="inspector-card unified-tools-card"><div className="inspector-card-title"><span><Icon name="command" />{copy(language, 'Unified local tools', '同一对话内工具')}</span><em>CODEX STYLE</em></div><p className="route-reason">{copy(language, 'Run approved desktop actions without leaving the conversation.', '无需离开对话即可执行经批准的桌面操作。')}</p><div className="tool-command-grid"><button onClick={() => setPrompt('/project')}><Icon name="folder" />/project</button><button onClick={() => setPrompt('/git status')}><Icon name="git" />/git status</button><button onClick={() => setPrompt('/open TextEdit')}><Icon name="layout" />/open</button><button onClick={() => setPrompt('/permissions')}><Icon name="settings" />/permissions</button><button onClick={() => setPrompt('/screen')}><Icon name="monitor" />/screen</button><button onClick={() => setPrompt('/type Chris Studio test')}><Icon name="edit" />/type</button><button onClick={() => setPrompt('/click 400 300')}><Icon name="circle" />/click</button><button onClick={() => setPrompt('/key cmd+s')}><Icon name="command" />/key</button><button onClick={() => fileInput.current?.click()}><Icon name="paperclip" />{copy(language, 'File', '文件')}</button><button onClick={() => setPrompt('/check npm-test')}><Icon name="check" />/check</button><button onClick={() => setPrompt('/skills')}><Icon name="plug" />/skills</button><button onClick={() => setPrompt('/help')}><Icon name="info" />/help</button></div>{toolPreview && <img className="tool-preview-image" src={toolPreview} alt="Approved desktop capture" />}</div>
          <div className="inspector-card findings-card"><div className="inspector-card-title"><span><Icon name="shield" />{copy(language, 'Findings', '检测结果')}</span><strong>{scan.findings.length}</strong></div>{scan.findings.length ? <div className="finding-list-modern">{scan.findings.slice(0, 8).map((finding) => <div key={finding.id} className={`finding-modern finding-${finding.severity}`}><span /><div><strong>{finding.label}</strong><small>{finding.replacement}</small></div><em>{finding.severity}</em></div>)}</div> : <div className="safe-state"><Icon name="check" />{copy(language, 'No supported sensitive pattern detected.', '未检测到已支持的敏感模式。')}</div>}</div>
          {isReviewed && <div className="inspector-card safe-payload"><div className="inspector-card-title"><span>{copy(language, 'Reviewed payload', '已审查请求')}</span><em>{copy(language, 'LOCKED', '已锁定')}</em></div><pre>{formatSafePayload(scan) || copy(language, 'No text payload.', '没有文本请求。')}</pre></div>}
          {mustApproveCritical && isReviewed && <label className="critical-approval"><input type="checkbox" checked={criticalApproved} onChange={(event) => setCriticalApproved(event.target.checked)} /><span><strong>{copy(language, 'Send only the redacted version', '仅发送脱敏版本')}</strong><small>{copy(language, 'Critical raw values remain blocked.', '严重风险原文仍会被拦截。')}</small></span></label>}
        </aside>
      )}
    </main>
  );
}

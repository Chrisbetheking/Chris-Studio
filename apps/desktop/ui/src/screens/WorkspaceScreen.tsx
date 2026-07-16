import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentProfile,
  AppSettings,
  AttachmentDraft,
  ChatMessage,
  Conversation,
  Language,
  ProviderProfile,
  ProviderStatus,
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
import { sendProviderChat } from '../features/providers/providerClient';
import { CHRIS_STUDIO_SYSTEM_PROMPT, identityReply, isIdentityQuestion } from '../app/identity';
import { captureScreen, clickPointer, pressKey, requestComputerPermissions, typeText } from '../features/computer/computerClient';
import { chooseProjectFolder, projectGitDiff, projectGitStatus, runProjectPreset } from '../features/projects/projectClient';
import { processFile } from '../features/files/fileProcessor';
import { routeAttachments } from '../features/files/routing';
import { formatKnowledgeContext, searchKnowledge } from '../features/files/knowledge';
import { optimizeText } from '../features/tokens/optimizer';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

function normalizeLocalToolIntent(text: string): string {
  const value = text.trim();
  const lower = value.toLowerCase();
  if (/^(截屏|截图|截取屏幕|capture screen|take a screenshot)$/.test(lower)) return '/screen';
  if (/^(请求权限|电脑权限|打开电脑权限|request permissions|computer permissions)$/.test(lower)) return '/permissions';
  if (/^(选择项目|打开项目|连接项目|choose project|open project)$/.test(lower)) return '/project';
  if (/^(git status|查看 git 状态|查看git状态)$/.test(lower)) return '/git status';
  if (/^(git diff|查看 git diff|查看git diff|查看差异)$/.test(lower)) return '/git diff';
  if (/^(查看 skills|查看skills|skills|skill 列表|skill列表)$/.test(lower)) return '/skills';
  return value;
}

const riskLabel = (language: Language, level: RiskLevel) => ({
  safe: copy(language, 'Safe', '安全'),
  low: copy(language, 'Low', '低风险'),
  medium: copy(language, 'Medium', '中风险'),
  high: copy(language, 'High', '高风险'),
  critical: copy(language, 'Critical', '严重风险'),
}[level]);

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
}: {
  language: Language;
  openConversationId?: string;
  newSessionNonce: number;
  onOpenProviders: () => void;
  onOpenRouting: () => void;
  onOpenAgents: () => void;
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
  const [inspectorOpen, setInspectorOpen] = useState(() => loadSettings().autoOpenInspector);
  const [sending, setSending] = useState(false);
  const [requestStartedAt, setRequestStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [toolPreview, setToolPreview] = useState('');
  const [fileBusy, setFileBusy] = useState(false);
  const [fileProgress, setFileProgress] = useState(0);
  const [includeVisionImages, setIncludeVisionImages] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const messageEnd = useRef<HTMLDivElement | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!requestStartedAt) { setElapsedMs(0); return; }
    const tick = window.setInterval(() => setElapsedMs(Date.now() - requestStartedAt), 100);
    return () => window.clearInterval(tick);
  }, [requestStartedAt]);

  const scan = useMemo(() => scanPayload(prompt, attachments, settings.customSensitiveTerms), [prompt, attachments, settings.customSensitiveTerms]);
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
  const projectedInputTokens = Math.max(0, scan.estimatedTokens - optimization.savedTokens);
  const todayUsage = tokenUsageSummary();

  useEffect(() => {
    if (!openConversationId) return;
    const found = loadConversations().find((item) => item.id === openConversationId) ?? null;
    setConversation(found);
    setPrompt('');
    setAttachments([]);
    setIncludeVisionImages(false);
    setReviewedHash(null);
    setCriticalApproved(false);
    if (found?.mode) setMode(found.mode);
    if (found?.agentId) setActiveAgentId(found.agentId);
  }, [openConversationId]);

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
  }, [prompt, attachments]);

  useEffect(() => {
    messageEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages.length]);

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
    const approved = command === '/permissions' || window.confirm(copy(
      language,
      `Run this reviewed local action?\n${value}`,
      `执行这项已审查的本地操作吗？\n${value}`,
    ));
    if (!approved) {
      appendLocalResult(value, copy(language, 'The local action was cancelled.', '本地操作已取消。'), true);
      return true;
    }
    setSending(true);
    setRequestStartedAt(Date.now());
    try {
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
      const result = command === '/permissions'
        ? await requestComputerPermissions()
        : command === '/screen'
          ? await captureScreen(true)
          : command === '/type'
            ? await typeText(rest, true)
            : command === '/click'
              ? await clickPointer(Number(parts[0]), Number(parts[1]), true)
              : command === '/key'
                ? await pressKey(parts.join(' '), true)
                : null;
      if (!result) {
        appendLocalResult(value, copy(
          language,
          'Unknown command. Try /project, /git status, /git diff, /check npm-test, /skills, /permissions, /screen, /type text, /click x y or /key cmd+s.',
          '未知命令。可使用 /project、/git status、/git diff、/check npm-test、/skills、/permissions、/screen、/type 文字、/click x y 或 /key cmd+s。',
        ), true);
      } else {
        appendLocalResult(value, result.message, !result.ok, result.screenshotDataUrl);
      }
    } finally {
      setSending(false);
      setRequestStartedAt(null);
    }
    return true;
  };

  const send = async (reviewOverride = false) => {
    if (!hasInput || (!isReviewed && !reviewOverride) || sending) return;
    if (mustApproveCritical && !criticalApproved) {
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
    if (todayUsage.totalTokens + projectedInputTokens > settings.dailyTokenBudget) {
      const approved = window.confirm(copy(language, `This request may exceed today's ${settings.dailyTokenBudget}-token budget. Continue?`, `本次请求可能超过今日 ${settings.dailyTokenBudget} Token 预算，仍然继续吗？`));
      if (!approved) return;
    }

    setSending(true);
    setRequestStartedAt(Date.now());
    const safePayload = formatSafePayload(scan);
    const now = nowIso();
    const current = conversation ?? newConversation(effectiveProvider, mode, mode === 'agent' ? activeAgent?.id : undefined);
    const userMessage: ChatMessage = {
      id: makeId('message'), role: 'user', content: safePayload, createdAt: now,
      provider: effectiveProvider.displayName, model: effectiveModel, riskLevel: scan.riskLevel,
    };
    const pending: Conversation = {
      ...current,
      title: current.messages.length ? current.title : (prompt.trim().slice(0, 54) || attachments[0]?.name || 'Protected task'),
      updatedAt: now,
      provider: effectiveProvider.displayName,
      model: effectiveModel,
      mode,
      agentId: mode === 'agent' ? activeAgent?.id : undefined,
      riskSummary: maxRisk(current.riskSummary, scan.riskLevel),
      messages: [...current.messages, userMessage],
    };
    setConversation(pending);

    const requestMessages: Pick<ChatMessage, 'role' | 'content'>[] = pending.messages.slice(-settings.conversationContextLimit).map(({ role, content }) => ({ role, content }));
    requestMessages.unshift({ role: 'system', content: CHRIS_STUDIO_SYSTEM_PROMPT });
    if (mode === 'agent' && activeAgent) {
      requestMessages.unshift({
        role: 'system',
        content: `You are operating inside Chris Studio as the ${activeAgent.name} agent.\n${activeAgent.description}\nPermission mode: ${activeAgent.permissionMode}.\n${skillPrompt(activeAgent.skillIds, loadCustomSkills())}\nPresent one coherent Codex-style plan in the conversation. Before any external or destructive action, ask for explicit approval. Use the local slash tools only when the user explicitly approves them.`,
      });
    }
    if (knowledgeHits.length) {
      requestMessages.unshift({
        role: 'system',
        content: `Relevant local knowledge retrieved by Chris Studio. Cite source labels when used and ignore unrelated chunks.\n\n${formatKnowledgeContext(knowledgeHits)}`,
      });
    }

    let assistantContent = '';
    let failed = false;
    let receiptResult: SafetyReceipt['result'] = 'sent';

    if (effectiveProvider.providerId === 'local-demo') {
      assistantContent = localDemoReply(language, scan.findings.length, scan.estimatedTokens, optimization.savedTokens);
      receiptResult = 'demo';
    } else {
      const result = await sendProviderChat(effectiveProvider, requestMessages, settings.requestTimeoutMs, effectiveModel, attachments, includeVisionImages);
      if (result.ok && result.content) assistantContent = result.content;
      else {
        failed = true;
        receiptResult = 'failed';
        assistantContent = copy(language, `Request failed: ${result.errorMessage ?? 'Unknown provider error.'}`, `请求失败：${result.errorMessage ?? '未知模型错误。'}`);
      }
    }

    const assistantMessage: ChatMessage = {
      id: makeId('message'), role: 'assistant', content: assistantContent, createdAt: nowIso(),
      provider: 'Chris Studio', model: effectiveModel, failed,
    };
    const completed: Conversation = { ...pending, updatedAt: nowIso(), messages: [...pending.messages, assistantMessage] };
    setConversation(completed);
    if (settings.localHistoryEnabled) saveConversation(completed);
    if (settings.safetyReceiptsEnabled) saveReceipt({
      id: makeId('receipt'), conversationId: completed.id, createdAt: nowIso(), provider: effectiveProvider.displayName,
      model: effectiveModel, riskLevel: scan.riskLevel, findingKinds: Array.from(new Set(scan.findings.map((finding) => finding.kind))),
      attachmentNames: attachments.map((file) => file.name), requestCharacters: safePayload.length,
      estimatedTokens: scan.estimatedTokens, optimizedTokens: Math.max(0, scan.estimatedTokens - optimization.savedTokens), result: receiptResult,
    });
    recordTokenUsage({
      id: makeId('usage'), createdAt: nowIso(), provider: effectiveProvider.displayName, model: effectiveModel,
      inputTokens: projectedInputTokens, outputTokens: Math.ceil(assistantContent.length / 4), savedTokens: optimization.savedTokens,
    });
    setPrompt('');
    setAttachments([]);
    setIncludeVisionImages(false);
    setReviewedHash(null);
    setCriticalApproved(false);
    setSending(false);
    setRequestStartedAt(null);
  };

  const submit = () => {
    if (!hasInput || sending || fileBusy) return;
    if (isReviewed) {
      void send();
      return;
    }
    setReviewedHash(scan.hash);
    if (scan.findings.length === 0 && scan.riskLevel === 'safe') {
      void send(true);
      return;
    }
    setInspectorOpen(true);
    toast.show(copy(language, 'Review the detected items, then send the redacted payload.', '请先检查检测结果，再发送脱敏后的请求。'), 'warning');
  };

  const empty = !conversation?.messages.length;

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
                  {message.model && <footer>{message.model}</footer>}
                </article>
              ))}
              {sending && <article className="message-bubble assistant pending-message"><header><span>Chris Studio</span><small>{(elapsedMs / 1000).toFixed(1)}s</small></header><div><span className="typing-dots"><i /><i /><i /></span>{copy(language, ' Routing, reviewing and waiting for the model…', ' 正在完成路由、安全检查并等待模型响应…')}</div></article>}
              <div ref={messageEnd} />
            </div>
          )}
        </div>

        <div className="composer-zone">
          {attachments.length > 0 && <div className="attachment-strip-modern">{attachments.map((file) => <div key={file.id} className="attachment-card-mini"><Icon name={file.kind === 'image' ? 'image' : file.kind === 'spreadsheet' ? 'table' : 'file'} /><span><strong>{file.name}</strong><small>{file.processor} · {Math.ceil(file.content.length / 4)} tokens</small></span><button onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))}><Icon name="x" size={14} /></button></div>)}</div>}
          {fileBusy && <div className="file-progress"><span style={{ width: `${Math.max(8, fileProgress * 100)}%` }} /><small>{copy(language, 'Local processor working…', '本地处理模块运行中…')}</small></div>}
          <div className="composer-modern">
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); submit(); } }} placeholder={mode === 'agent' ? copy(language, 'Describe the outcome, or use /screen, /type, /click, /key and /permissions in this same conversation…', '描述你要的结果，或在同一对话中使用 /screen、/type、/click、/key 和 /permissions…') : copy(language, 'Message any connected model, attach a file, or run an approved local command…', '向任意模型发消息、添加文件，或运行经批准的本地命令…')} rows={4} />
            <div className="composer-modern-footer">
              <input ref={fileInput} type="file" multiple hidden accept=".txt,.md,.json,.csv,.log,.xml,.yaml,.yml,.js,.jsx,.ts,.tsx,.py,.rs,.go,.java,.html,.css,.pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.webp" onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ''; }} />
              <button className="icon-button" onClick={() => fileInput.current?.click()} disabled={fileBusy}><Icon name="paperclip" /></button>
              <div className="composer-metrics"><span><Icon name="sparkles" size={14} />{optimization.originalTokens} → {optimization.optimizedTokens}</span><span className={`risk-text risk-${scan.riskLevel}`}>{riskLabel(language, scan.riskLevel)}</span><span>{attachments.length} {copy(language, 'files', '文件')}</span>{knowledgeHits.length > 0 && <span>{knowledgeHits.length} RAG</span>}</div>
              {optimization.savedTokens > 0 && <button className="compact-action" onClick={applyOptimization}><Icon name="wand" />-{optimization.savedTokens} tokens</button>}
              {visionImageCount > 0 && providerDef.capabilities.vision && <button className={`compact-action ${includeVisionImages ? 'active' : ''}`} onClick={() => setIncludeVisionImages((value) => !value)}><Icon name="image" />{includeVisionImages ? copy(language, 'Vision on', '视觉已启用') : copy(language, 'Use vision', '启用视觉')}</button>}
              <button className="button primary" onClick={submit} disabled={sending || !hasInput || fileBusy || (isReviewed && mustApproveCritical && !criticalApproved)}><Icon name={mode === 'agent' ? 'bot' : 'send'} />{sending ? `${copy(language, 'Running', '执行中')} ${(elapsedMs / 1000).toFixed(1)}s` : !isReviewed && scan.findings.length > 0 ? copy(language, 'Review findings', '审查并继续') : mode === 'agent' ? copy(language, 'Run in workspace', '在工作台运行') : copy(language, 'Send', '发送')}</button>
            </div>
          </div>
          <div className="composer-caption"><span>{effectiveProvider.displayName} · {effectiveModel}</span><span>{sending ? `${copy(language, 'Elapsed', '已用时')} ${(elapsedMs / 1000).toFixed(1)}s` : providerStatus.state === 'connected' ? copy(language, 'Connected · ⌘↵ to send', '已连接 · ⌘↵ 发送') : effectiveProvider.providerId === 'local-demo' ? copy(language, 'Offline sandbox', '离线沙箱') : copy(language, 'Connection required', '需要连接')}</span></div>
        </div>
      </section>

      {inspectorOpen && (
        <aside className="inspector-modern">
          <header><div><span className="section-kicker">CHRIS STUDIO CONTROL</span><h2>{copy(language, 'Request control', '请求控制')}</h2></div><button className="icon-button" onClick={() => setInspectorOpen(false)}><Icon name="x" /></button></header>
          <div className={`risk-hero risk-panel-${scan.riskLevel}`}><div><strong>{scan.riskScore}</strong><span>/100</span></div><div><small>{copy(language, 'CURRENT RISK', '当前风险')}</small><h3>{riskLabel(language, scan.riskLevel)}</h3><p>{isReviewed ? copy(language, 'Locked to this exact payload', '已锁定到当前请求') : copy(language, 'Edit requires a new review', '编辑后需要重新审查')}</p></div></div>
          <div className="inspector-card token-card"><div className="inspector-card-title"><span><Icon name="sparkles" />Token budget</span><strong>{scan.estimatedTokens}</strong></div><div className="token-bar"><span style={{ width: `${Math.min(100, scan.estimatedTokens / 80)}%` }} /></div><div className="token-stats"><span>{copy(language, 'Local saving', '本地节约')}<strong>{optimization.savedTokens}</strong></span><span>{copy(language, 'Context limit', '上下文轮次')}<strong>{settings.conversationContextLimit}</strong></span></div></div>
          <div className="inspector-card"><div className="inspector-card-title"><span><Icon name="route" />{copy(language, 'Routing', '模型路由')}</span><button onClick={onOpenRouting}>{copy(language, 'Edit', '编辑')}</button></div><div className="route-summary"><span className="provider-avatar tiny" style={{ '--provider-accent': providerDefinition(effectiveProvider.providerId).accent } as React.CSSProperties}>{providerDefinition(effectiveProvider.providerId).shortName}</span><div><strong>{effectiveProvider.displayName}</strong><small>{effectiveModel}</small></div></div><p className="route-reason">{routingDecision?.reason}</p></div>
          {mode === 'agent' && activeAgent && <div className="inspector-card"><div className="inspector-card-title"><span><Icon name="bot" />Agent</span><button onClick={onOpenAgents}>{copy(language, 'Skills', 'Skills')}</button></div><strong className="agent-name-inspector">{activeAgent.name}</strong><div className="skill-dot-row">{activeAgent.skillIds.slice(0, 5).map((id) => <span key={id}>{id}</span>)}</div><p className="route-reason">{copy(language, `Permission mode: ${activeAgent.permissionMode}`, `权限模式：${activeAgent.permissionMode}`)}</p></div>}
          <div className="inspector-card unified-tools-card"><div className="inspector-card-title"><span><Icon name="command" />{copy(language, 'Unified local tools', '同一对话内工具')}</span><em>CODEX STYLE</em></div><p className="route-reason">{copy(language, 'Run approved desktop actions without leaving the conversation.', '无需离开对话即可执行经批准的桌面操作。')}</p><div className="tool-command-grid"><button onClick={() => setPrompt('/project')}><Icon name="folder" />/project</button><button onClick={() => setPrompt('/git status')}><Icon name="git" />/git status</button><button onClick={() => setPrompt('/skills')}><Icon name="plug" />/skills</button><button onClick={() => setPrompt('/permissions')}><Icon name="settings" />/permissions</button><button onClick={() => setPrompt('/screen')}><Icon name="monitor" />/screen</button><button onClick={() => setPrompt('/type Chris Studio test')}><Icon name="edit" />/type</button><button onClick={() => setPrompt('/click 400 300')}><Icon name="circle" />/click</button><button onClick={() => setPrompt('/key cmd+s')}><Icon name="command" />/key</button><button onClick={() => fileInput.current?.click()}><Icon name="paperclip" />{copy(language, 'File', '文件')}</button><button onClick={() => setPrompt('/check npm-test')}><Icon name="check" />/check</button></div>{toolPreview && <img className="tool-preview-image" src={toolPreview} alt="Approved desktop capture" />}</div>
          <div className="inspector-card findings-card"><div className="inspector-card-title"><span><Icon name="shield" />{copy(language, 'Findings', '检测结果')}</span><strong>{scan.findings.length}</strong></div>{scan.findings.length ? <div className="finding-list-modern">{scan.findings.slice(0, 8).map((finding) => <div key={finding.id} className={`finding-modern finding-${finding.severity}`}><span /><div><strong>{finding.label}</strong><small>{finding.replacement}</small></div><em>{finding.severity}</em></div>)}</div> : <div className="safe-state"><Icon name="check" />{copy(language, 'No supported sensitive pattern detected.', '未检测到已支持的敏感模式。')}</div>}</div>
          {isReviewed && <div className="inspector-card safe-payload"><div className="inspector-card-title"><span>{copy(language, 'Reviewed payload', '已审查请求')}</span><em>{copy(language, 'LOCKED', '已锁定')}</em></div><pre>{formatSafePayload(scan) || copy(language, 'No text payload.', '没有文本请求。')}</pre></div>}
          {mustApproveCritical && isReviewed && <label className="critical-approval"><input type="checkbox" checked={criticalApproved} onChange={(event) => setCriticalApproved(event.target.checked)} /><span><strong>{copy(language, 'Send only the redacted version', '仅发送脱敏版本')}</strong><small>{copy(language, 'Critical raw values remain blocked.', '严重风险原文仍会被拦截。')}</small></span></label>}
        </aside>
      )}
    </main>
  );
}

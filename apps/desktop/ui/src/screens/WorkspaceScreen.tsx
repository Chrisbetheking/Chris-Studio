import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AttachmentDraft,
  ChatMessage,
  Conversation,
  Language,
  ProviderProfile,
  WorkspaceMode,
} from '../app/types';
import {
  loadActiveProvider,
  loadConversations,
  loadProjectRoot,
  loadProviderProfiles,
  loadSettings,
  makeId,
  nowIso,
  renameConversation,
  saveActiveProviderId,
  saveConversation,
  saveProjectRoot,
} from '../app/store';
import { providerDefinition } from '../app/providerRegistry';
import { formatSafePayload, maxRisk, scanPayload } from '../features/safety/scanner';
import { processFile } from '../features/files/fileProcessor';
import { chooseProjectFolder, reopenProjectFolder } from '../features/projects/projectClient';
import { UnifiedAgentRunCard } from '../features/unified-agent/UnifiedAgentRunCard';
import { unifiedAgentManager } from '../features/unified-agent/manager';
import {
  loadUnifiedRuntime,
  subscribeUnifiedRuntime,
} from '../features/unified-agent/runtimeStore';
import type { UnifiedAgentRun, UnifiedRuntimeSnapshot } from '../features/unified-agent/types';
import '../styles/unified-agent.css';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

type TimelineItem =
  | { kind: 'message'; value: ChatMessage; time: string }
  | { kind: 'run'; value: UnifiedAgentRun; time: string };

function newConversation(provider: ProviderProfile, mode: WorkspaceMode): Conversation {
  const timestamp = nowIso();
  return {
    id: makeId('conversation'),
    title: mode === 'agent' ? 'New Agent task' : 'New conversation',
    createdAt: timestamp,
    updatedAt: timestamp,
    provider: provider.displayName,
    model: provider.model,
    riskSummary: 'safe',
    mode,
    messages: [],
  };
}

function safeAttachments(scan: ReturnType<typeof scanPayload>): AttachmentDraft[] {
  return scan.attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    size: attachment.size,
    content: attachment.scan.redactedText,
    kind: attachment.kind,
    processor: attachment.processor,
    mimeType: attachment.mimeType,
    pageCount: attachment.pageCount,
    warnings: attachment.warnings,
    dataUrl: attachment.dataUrl,
    ocrLanguage: attachment.ocrLanguage,
  }));
}

function formatTime(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return '';
  }
}

function MessageBubble({ message, language }: { message: ChatMessage; language: Language }) {
  return (
    <article className={`ua-message role-${message.role} ${message.failed ? 'failed' : ''}`}>
      <header>
        <strong>{message.role === 'user' ? copy(language, 'You', '你') : 'Chris Studio'}</strong>
        <span>{formatTime(message.createdAt)}</span>
      </header>
      <div>{message.content || (message.role === 'assistant' ? copy(language, 'Generating…', '生成中…') : '')}</div>
      {message.provider && <small>{message.provider}{message.model ? ` · ${message.model}` : ''}</small>}
    </article>
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
  const [settings, setSettings] = useState(() => loadSettings());
  const [profiles, setProfiles] = useState(() => loadProviderProfiles());
  const [provider, setProvider] = useState(() => loadActiveProvider());
  const [mode, setMode] = useState<WorkspaceMode>('agent');
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [fileBusy, setFileBusy] = useState(false);
  const [projectRoot, setProjectRoot] = useState(() => loadProjectRoot());
  const [runtime, setRuntime] = useState<UnifiedRuntimeSnapshot>(() => loadUnifiedRuntime());
  const [error, setError] = useState('');
  const [titleEditing, setTitleEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const fileInput = useRef<HTMLInputElement | null>(null);
  const composer = useRef<HTMLTextAreaElement | null>(null);
  const sendLock = useRef(false);
  const bottom = useRef<HTMLDivElement | null>(null);
  const currentRuns = useMemo(() => conversation
    ? runtime.runs.filter((run) => run.conversationId === conversation.id)
    : [], [runtime.runs, conversation?.id]);

  useEffect(() => subscribeUnifiedRuntime(setRuntime), []);
  useEffect(() => onConversationChange?.(conversation?.id), [conversation?.id, onConversationChange]);
  useEffect(() => {
    const focus = () => window.setTimeout(() => composer.current?.focus(), 0);
    window.addEventListener('chris-studio:focus-composer', focus);
    return () => window.removeEventListener('chris-studio:focus-composer', focus);
  }, []);
  useEffect(() => {
    const refreshConversation = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id || conversation?.id !== id) return;
      setConversation(loadConversations().find((entry) => entry.id === id) || null);
    };
    const refreshProviders = () => {
      setProfiles(loadProviderProfiles());
      setProvider(loadActiveProvider());
    };
    const refreshSettings = () => setSettings(loadSettings());
    const refreshProject = () => setProjectRoot(loadProjectRoot());
    window.addEventListener('chris-studio:conversation-live-updated', refreshConversation);
    window.addEventListener('tokenfence:providers-updated', refreshProviders);
    window.addEventListener('tokenfence:settings-updated', refreshSettings);
    window.addEventListener('tokenfence:project-updated', refreshProject);
    return () => {
      window.removeEventListener('chris-studio:conversation-live-updated', refreshConversation);
      window.removeEventListener('tokenfence:providers-updated', refreshProviders);
      window.removeEventListener('tokenfence:settings-updated', refreshSettings);
      window.removeEventListener('tokenfence:project-updated', refreshProject);
    };
  }, [conversation?.id]);
  useEffect(() => {
    if (!projectRoot) return;
    void reopenProjectFolder(projectRoot).catch(() => undefined);
  }, [projectRoot]);
  useEffect(() => {
    if (!openConversationId || conversation?.id === openConversationId) return;
    const found = loadConversations().find((entry) => entry.id === openConversationId) || null;
    setConversation(found);
    setMode(found?.mode || 'agent');
    setPrompt('');
    setAttachments([]);
    setError('');
  }, [openConversationId, conversation?.id]);
  useEffect(() => {
    if (!newSessionNonce) return;
    setConversation(null);
    setPrompt('');
    setAttachments([]);
    setError('');
    setMode('agent');
  }, [newSessionNonce]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages.length, currentRuns.length, runtime.runs.map((run) => run.updatedAt).join('|')]);

  const chooseProject = async () => {
    setError('');
    try {
      const workspace = await chooseProjectFolder();
      if (!workspace) return;
      saveProjectRoot(workspace.root);
      setProjectRoot(workspace.root);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const selectProvider = (id: string) => {
    saveActiveProviderId(id);
    const next = profiles.find((entry) => entry.id === id);
    if (next) setProvider(next);
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setFileBusy(true);
    setError('');
    const next: AttachmentDraft[] = [];
    for (const file of Array.from(files)) {
      try {
        next.push(await processFile(file, settings.maxFileScanSize));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
    setAttachments((current) => [...current, ...next].slice(0, 12));
    setFileBusy(false);
    if (fileInput.current) fileInput.current.value = '';
  };

  const persistTitle = () => {
    if (!conversation) return;
    const updated = renameConversation(conversation.id, draftTitle);
    if (updated) setConversation(updated);
    setTitleEditing(false);
  };

  const submit = () => {
    if (sendLock.current || fileBusy || (!prompt.trim() && !attachments.length)) return;
    sendLock.current = true;
    setError('');
    try {
      const requestScan = scanPayload(prompt, attachments, settings.customSensitiveTerms);
      if (requestScan.riskLevel === 'critical' && settings.blockCriticalSends) {
        const approved = window.confirm(copy(
          language,
          'Critical values were detected. Continue only with the redacted payload?',
          '检测到严重风险内容。是否仅使用脱敏后的内容继续？',
        ));
        if (!approved) return;
      } else if (requestScan.riskLevel === 'high' || requestScan.riskLevel === 'medium') {
        const approved = window.confirm(copy(
          language,
          `Chris Studio found ${requestScan.findings.length} sensitive item(s). Send the redacted payload?`,
          `Chris Studio 检测到 ${requestScan.findings.length} 处敏感内容。是否发送脱敏后的内容？`,
        ));
        if (!approved) return;
      }
      const safePayload = formatSafePayload(requestScan) || prompt.trim();
      const timestamp = nowIso();
      const current = conversation || newConversation(provider, mode);
      const userMessage: ChatMessage = {
        id: makeId('message'),
        role: 'user',
        content: safePayload,
        createdAt: timestamp,
        provider: provider.displayName,
        model: provider.model,
        riskLevel: requestScan.riskLevel,
      };
      const pending: Conversation = {
        ...current,
        title: current.messages.length ? current.title : (prompt.trim().slice(0, 60) || attachments[0]?.name || 'Agent task'),
        updatedAt: timestamp,
        provider: provider.displayName,
        model: provider.model,
        mode,
        riskSummary: maxRisk(current.riskSummary, requestScan.riskLevel),
        messages: [...current.messages, userMessage],
      };
      saveConversation(pending);
      setConversation(pending);
      const result = unifiedAgentManager.enqueue({
        conversationId: pending.id,
        clientRequestId: userMessage.id,
        goal: safePayload,
        mode,
        provider,
        requestTimeoutMs: settings.requestTimeoutMs,
        attachments: safeAttachments(requestScan),
      });
      if (!result.accepted) {
        setError(result.reason || copy(language, 'The request was not queued.', '请求未进入队列。'));
        return;
      }
      setPrompt('');
      setAttachments([]);
      window.setTimeout(() => composer.current?.focus(), 0);
    } finally {
      window.setTimeout(() => { sendLock.current = false; }, 350);
    }
  };

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!conversation) return [];
    const items: TimelineItem[] = [
      ...conversation.messages.map((value) => ({ kind: 'message' as const, value, time: value.createdAt })),
      ...currentRuns.map((value) => ({ kind: 'run' as const, value, time: value.createdAt })),
    ];
    return items.sort((a, b) => a.time.localeCompare(b.time));
  }, [conversation, currentRuns]);

  const enabledProfiles = profiles.filter((entry) => entry.enabled);
  const providerReady = provider.providerId === 'local-demo'
    || (!providerDefinition(provider.providerId).requiresCredential || provider.credentialStored);
  const agentProviderReady = mode !== 'agent' || provider.providerId !== 'local-demo';

  return (
    <main className="ua-workspace">
      <section className="ua-main">
        <header className="ua-toolbar">
          <div className="ua-mode-switch">
            <button type="button" className={mode === 'chat' ? 'active' : ''} onClick={() => setMode('chat')}>{copy(language, 'Chat', '对话')}</button>
            <button type="button" className={mode === 'agent' ? 'active' : ''} onClick={() => setMode('agent')}>{copy(language, 'Agent', 'Agent')}</button>
          </div>
          <select value={provider.id} onChange={(event) => selectProvider(event.target.value)}>
            {enabledProfiles.map((entry) => <option value={entry.id} key={entry.id}>{entry.displayName} · {entry.model}</option>)}
          </select>
          <button type="button" className="ua-project-button" onClick={() => void chooseProject()} title={projectRoot}>
            <span className={projectRoot ? 'connected' : ''} />
            {projectRoot ? projectRoot.split(/[\\/]/).filter(Boolean).pop() : copy(language, 'Choose project', '选择项目')}
          </button>
          <button type="button" className="ua-toolbar-link" onClick={onOpenProviders}>{copy(language, 'Providers', '模型')}</button>
          <button type="button" className="ua-toolbar-link" onClick={onOpenRouting}>{copy(language, 'Routing', '路由')}</button>
          <button type="button" className="ua-toolbar-link" onClick={onOpenAgents}>{copy(language, 'Agents', 'Agent 设置')}</button>
        </header>

        <div className="ua-conversation-head">
          {conversation ? (
            titleEditing ? (
              <input
                autoFocus
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onBlur={persistTitle}
                onKeyDown={(event) => { if (event.key === 'Enter') persistTitle(); if (event.key === 'Escape') setTitleEditing(false); }}
              />
            ) : (
              <button type="button" onClick={() => { setDraftTitle(conversation.title); setTitleEditing(true); }}>
                {conversation.title}<span>✎</span>
              </button>
            )
          ) : <h1>{copy(language, 'What should Chris Studio do?', '让 Chris Studio 做什么？')}</h1>}
          <p>{mode === 'agent'
            ? copy(language, 'The model can inspect, edit, run approved checks and operate macOS one verified step at a time.', '模型可读取项目、提交 Diff、运行已批准检查，并逐步操作 macOS。')
            : copy(language, 'Normal streaming conversation without tool execution.', '普通流式对话，不执行本地工具。')}</p>
        </div>

        <div className="ua-timeline">
          {!timeline.length && (
            <div className="ua-empty">
              <div>✦</div>
              <h2>{copy(language, 'One conversation. Real actions.', '一个对话框，真正执行任务。')}</h2>
              <p>{copy(language, 'Attach a project, describe the result, then review every write and Computer Use action in this timeline.', '连接项目并描述目标；所有写入和电脑操作都会在这里展示并等待你确认。')}</p>
              <div className="ua-capability-grid">
                <span>Project scan / search / read</span>
                <span>Reviewed multi-file Diff</span>
                <span>npm / Cargo checks</span>
                <span>Accessibility-first macOS control</span>
              </div>
            </div>
          )}
          {timeline.map((item) => item.kind === 'message'
            ? <MessageBubble key={`message-${item.value.id}`} message={item.value} language={language} />
            : <UnifiedAgentRunCard key={`run-${item.value.id}`} run={item.value} language={language} onStop={(id) => unifiedAgentManager.stop(id)} />)}
          <div ref={bottom} />
        </div>

        <footer className="ua-composer-wrap">
          {error && <div className="ua-global-error">{error}</div>}
          {!providerReady && <button type="button" className="ua-provider-warning" onClick={onOpenProviders}>{copy(language, 'Configure this provider before sending.', '发送前请先配置当前模型。')}</button>}
          {!agentProviderReady && <button type="button" className="ua-provider-warning" onClick={onOpenProviders}>{copy(language, 'Agent mode requires a real configured model; Local Sandbox is chat-only.', 'Agent 模式需要已配置的真实模型；Local Sandbox 仅支持普通对话。')}</button>}
          {attachments.length ? (
            <div className="ua-attachments">
              {attachments.map((attachment) => (
                <span key={attachment.id}>{attachment.name}<button type="button" onClick={() => setAttachments((current) => current.filter((entry) => entry.id !== attachment.id))}>×</button></span>
              ))}
            </div>
          ) : null}
          <div className="ua-composer">
            <button type="button" className="ua-attach" onClick={() => fileInput.current?.click()} disabled={fileBusy}>＋</button>
            <input ref={fileInput} type="file" multiple hidden onChange={(event) => void addFiles(event.target.files)} />
            <textarea
              ref={composer}
              value={prompt}
              rows={1}
              placeholder={mode === 'agent'
                ? copy(language, 'Describe the outcome. Agent will inspect and act…', '描述你要的结果，Agent 会自行检查并执行……')
                : copy(language, 'Message Chris Studio…', '给 Chris Studio 发消息……')}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <button type="button" className="ua-send" onClick={submit} disabled={fileBusy || !providerReady || !agentProviderReady || (!prompt.trim() && !attachments.length)}>↑</button>
          </div>
          <small>{copy(language, 'Enter to send · Shift+Enter for a new line · writes and Computer Use always require approval', 'Enter 发送 · Shift+Enter 换行 · 写入与电脑操作始终需要确认')}</small>
        </footer>
      </section>
    </main>
  );
}

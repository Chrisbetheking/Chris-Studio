import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppSettings,
  AttachmentDraft,
  ChatMessage,
  Conversation,
  Language,
  ProviderConfig,
  ProviderStatus,
  RiskLevel,
  SafetyReceipt,
} from '../app/types';
import {
  loadConversations,
  loadProviderConfig,
  loadProviderStatus,
  loadSettings,
  makeId,
  nowIso,
  saveConversation,
  saveReceipt,
} from '../app/store';
import { formatSafePayload, maxRisk, scanPayload } from '../features/safety/scanner';
import { sendDeepSeekChat } from '../features/providers/providerClient';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

const riskLabel = (language: Language, level: RiskLevel) => ({
  safe: copy(language, 'Safe', '安全'),
  low: copy(language, 'Low', '低风险'),
  medium: copy(language, 'Medium', '中风险'),
  high: copy(language, 'High', '高风险'),
  critical: copy(language, 'Critical', '严重风险'),
}[level]);

function newConversation(provider: ProviderConfig): Conversation {
  const timestamp = nowIso();
  return {
    id: makeId('conversation'),
    title: 'New safe conversation',
    createdAt: timestamp,
    updatedAt: timestamp,
    provider: 'DeepSeek',
    model: provider.model,
    riskSummary: 'safe',
    messages: [],
  };
}

function localDemoReply(language: Language, findings: number, tokens: number): string {
  return copy(
    language,
    `Local demo complete. TokenFence reviewed the full payload, redacted ${findings} sensitive finding${findings === 1 ? '' : 's'}, and prepared an estimated ${tokens}-token request. No network request was made.`,
    `本地演示完成。TokenFence 已审查完整请求、脱敏 ${findings} 处敏感内容，并准备了约 ${tokens} Token 的安全请求。本次未发起网络请求。`,
  );
}

export function WorkspaceScreen({
  language,
  openConversationId,
  newSessionNonce,
  onOpenProviders,
}: {
  language: Language;
  openConversationId?: string;
  newSessionNonce: number;
  onOpenProviders: () => void;
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [provider, setProvider] = useState<ProviderConfig>(() => loadProviderConfig());
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>(() => loadProviderStatus());
  const [reviewedHash, setReviewedHash] = useState<string | null>(null);
  const [criticalApproved, setCriticalApproved] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(() => loadSettings().autoOpenInspector);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const messageEnd = useRef<HTMLDivElement | null>(null);
  const toast = useToast();

  const scan = useMemo(
    () => scanPayload(prompt, attachments, settings.customSensitiveTerms),
    [prompt, attachments, settings.customSensitiveTerms],
  );
  const isReviewed = reviewedHash === scan.hash;
  const hasInput = Boolean(prompt.trim() || attachments.length);
  const providerReady = provider.demoMode || (Boolean(provider.apiKey.trim()) && providerStatus.state === 'connected');
  const mustApproveCritical = settings.blockCriticalSends && scan.riskLevel === 'critical';
  const showLiveScan = settings.autoScan || isReviewed;
  const inspectorFindings = showLiveScan ? scan.findings : [];
  const inspectorRiskLevel: RiskLevel = showLiveScan ? scan.riskLevel : 'safe';
  const inspectorRiskScore = showLiveScan ? scan.riskScore : 0;

  useEffect(() => {
    if (!openConversationId) return;
    const found = loadConversations().find((item) => item.id === openConversationId) ?? null;
    setConversation(found);
    setPrompt('');
    setAttachments([]);
    setReviewedHash(null);
    setCriticalApproved(false);
  }, [openConversationId]);

  useEffect(() => {
    if (newSessionNonce === 0) return;
    setConversation(null);
    setPrompt('');
    setAttachments([]);
    setReviewedHash(null);
    setCriticalApproved(false);
  }, [newSessionNonce]);

  useEffect(() => {
    const updateProvider = () => {
      setProvider(loadProviderConfig());
      setProviderStatus(loadProviderStatus());
    };
    const updateSettings = () => setSettings(loadSettings());
    window.addEventListener('tokenfence:provider-updated', updateProvider);
    window.addEventListener('tokenfence:settings-updated', updateSettings);
    return () => {
      window.removeEventListener('tokenfence:provider-updated', updateProvider);
      window.removeEventListener('tokenfence:settings-updated', updateSettings);
    };
  }, []);

  useEffect(() => {
    if (settings.autoScan && settings.autoOpenInspector && scan.findings.length > 0) setInspectorOpen(true);
  }, [scan.findings.length, settings.autoOpenInspector, settings.autoScan]);

  useEffect(() => {
    setReviewedHash(null);
    setCriticalApproved(false);
  }, [scan.hash]);

  useEffect(() => {
    messageEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages.length, sending]);

  const persist = (next: Conversation) => {
    setConversation(next);
    if (settings.localHistoryEnabled) saveConversation(next);
  };

  const review = () => {
    if (!hasInput) return;
    if (prompt.length > settings.maxTextScanSize) {
      toast.show(copy(language, 'Prompt exceeds the configured scan limit.', '提示词超过设置的扫描上限。'), 'error');
      return;
    }
    if (scan.riskLevel === 'critical' && !settings.autoRedactCritical) {
      toast.show(copy(language, 'Critical data was detected. Enable automatic Critical redaction before approval.', '检测到严重敏感数据。请先启用“自动脱敏严重风险”再批准。'), 'error');
      setInspectorOpen(true);
      return;
    }
    setReviewedHash(scan.hash);
    setInspectorOpen(true);
    toast.show(
      scan.findings.length
        ? copy(language, `Review ready: ${scan.findings.length} finding(s) redacted.`, `审查完成：已脱敏 ${scan.findings.length} 处内容。`)
        : copy(language, 'Review ready: no sensitive values detected.', '审查完成：未检测到敏感内容。'),
      scan.findings.length ? 'warning' : 'success',
    );
  };

  const attachFiles = async (files: FileList | null) => {
    if (!files) return;
    const accepted: AttachmentDraft[] = [];
    for (const file of Array.from(files)) {
      if (file.size > settings.maxFileScanSize) {
        toast.show(copy(language, `${file.name} exceeds the file scan limit.`, `${file.name} 超过文件扫描上限。`), 'error');
        continue;
      }
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!['txt', 'md', 'json', 'csv', 'log', 'xml', 'yaml', 'yml'].includes(extension)) {
        toast.show(copy(language, `${file.name} is not a supported text file.`, `${file.name} 不是支持的文本文件。`), 'warning');
        continue;
      }
      try {
        accepted.push({ id: makeId('attachment'), name: file.name, size: file.size, content: await file.text() });
      } catch {
        toast.show(copy(language, `Could not read ${file.name}.`, `无法读取 ${file.name}。`), 'error');
      }
    }
    setAttachments((current) => [...current, ...accepted].slice(0, 12));
    if (fileInput.current) fileInput.current.value = '';
  };

  const send = async () => {
    if (!hasInput || sending) return;
    if (!isReviewed) {
      review();
      return;
    }
    if (mustApproveCritical && !criticalApproved) {
      toast.show(copy(language, 'Approve the redacted payload before sending.', '请先确认仅发送脱敏后的内容。'), 'warning');
      return;
    }
    if (!providerReady) {
      onOpenProviders();
      return;
    }

    const safePayload = formatSafePayload(scan);
    if (!safePayload) return;
    const base = conversation ?? newConversation(provider);
    const createdAt = nowIso();
    const safeUserMessage: ChatMessage = {
      id: makeId('message'),
      role: 'user',
      content: safePayload,
      createdAt,
      provider: 'DeepSeek',
      model: provider.model,
      riskLevel: scan.riskLevel,
    };
    const withUser: Conversation = {
      ...base,
      title: base.messages.length ? base.title : (scan.prompt.redactedText.trim().slice(0, 58) || attachments[0]?.name || 'Safe conversation'),
      updatedAt: createdAt,
      provider: provider.demoMode ? 'Local demo' : 'DeepSeek',
      model: provider.demoMode ? 'local-safety-demo' : provider.model,
      riskSummary: maxRisk(base.riskSummary, scan.riskLevel),
      messages: [...base.messages, safeUserMessage],
    };
    persist(withUser);
    setSending(true);

    let assistantContent = '';
    let failed = false;
    let result: SafetyReceipt['result'] = provider.demoMode ? 'demo' : 'sent';

    if (provider.demoMode) {
      assistantContent = localDemoReply(language, scan.findings.length, scan.estimatedTokens);
    } else {
      const context = withUser.messages.slice(-Math.max(2, settings.conversationContextLimit));
      const reply = await sendDeepSeekChat(provider, context, settings.requestTimeoutMs);
      if (reply.ok && reply.content?.trim()) {
        assistantContent = reply.content.trim();
      } else {
        failed = true;
        result = 'failed';
        assistantContent = copy(
          language,
          `DeepSeek request failed. ${reply.errorMessage ?? 'Check the connection, API key, account balance and model availability.'}`,
          `DeepSeek 请求失败。${reply.errorMessage ?? '请检查网络、API Key、账户余额和模型可用性。'}`,
        );
      }
    }

    const finishedAt = nowIso();
    const assistantMessage: ChatMessage = {
      id: makeId('message'),
      role: 'assistant',
      content: assistantContent,
      createdAt: finishedAt,
      provider: provider.demoMode ? 'Local demo' : 'DeepSeek',
      model: provider.demoMode ? 'local-safety-demo' : provider.model,
      failed,
    };
    const completed = { ...withUser, updatedAt: finishedAt, messages: [...withUser.messages, assistantMessage] };
    persist(completed);

    if (settings.safetyReceiptsEnabled) {
      saveReceipt({
        id: makeId('receipt'),
        conversationId: completed.id,
        createdAt: finishedAt,
        provider: provider.demoMode ? 'Local demo' : 'DeepSeek',
        model: provider.demoMode ? 'local-safety-demo' : provider.model,
        riskLevel: scan.riskLevel,
        findingKinds: Array.from(new Set(scan.findings.map((finding) => finding.kind))),
        attachmentNames: attachments.map((attachment) => attachment.name),
        requestCharacters: safePayload.length,
        result,
      });
    }

    setPrompt('');
    setAttachments([]);
    setReviewedHash(null);
    setCriticalApproved(false);
    setSending(false);
    toast.show(
      failed ? copy(language, 'Safe payload retained; provider request failed.', '安全请求已保留，但 Provider 调用失败。') : copy(language, 'Safe payload sent.', '安全请求已发送。'),
      failed ? 'error' : 'success',
    );
  };

  const clearCurrent = () => {
    if (conversation?.messages.length && !window.confirm(copy(language, 'Start a new conversation?', '确定开始新会话吗？'))) return;
    setConversation(null);
    setPrompt('');
    setAttachments([]);
    setReviewedHash(null);
  };

  return (
    <main className={`workspace ${inspectorOpen ? 'inspector-visible' : ''}`}>
      <section className="chat-pane">
        <header className="workspace-topbar">
          <div>
            <h1>{conversation?.title || copy(language, 'New safe conversation', '新建安全会话')}</h1>
            <p>{copy(language, 'Review the exact redacted payload before it leaves your device.', '在内容离开设备前，审查将要发送的准确脱敏版本。')}</p>
          </div>
          <div className="topbar-actions">
            {settings.debugMode && <div className="debug-chip">{scan.hash} · {isReviewed ? 'reviewed' : 'draft'}</div>}
            <div className={`provider-chip provider-${provider.demoMode ? 'demo' : providerStatus.state}`}>
              <span />
              <div><strong>{provider.demoMode ? copy(language, 'Local demo', '本地演示') : 'DeepSeek'}</strong><small>{provider.demoMode ? 'local-safety-demo' : provider.model}</small></div>
            </div>
            <button className="icon-button" onClick={clearCurrent} aria-label="New conversation"><Icon name="plus" /></button>
            <button className={`icon-button ${inspectorOpen ? 'active' : ''}`} onClick={() => setInspectorOpen((value) => !value)} aria-label="Toggle safety inspector"><Icon name="panel" /></button>
          </div>
        </header>

        <div className="message-scroll">
          {!conversation?.messages.length ? (
            <div className="workspace-empty">
              <div className="empty-shield"><Icon name="shield" size={38} /></div>
              <h2>{copy(language, 'Protect your data before it reaches AI.', '在内容发送给 AI 之前保护你的数据。')}</h2>
              <p>{copy(language, 'TokenFence scans prompts and text files locally, redacts sensitive information, and shows exactly what will be sent.', 'TokenFence 会在本地扫描提示词和文本文件、自动脱敏，并准确展示即将发送的内容。')}</p>
              {!providerReady && <button className="button primary" onClick={onOpenProviders}>{copy(language, 'Connect DeepSeek', '连接 DeepSeek')}</button>}
              <div className="suggestion-row">
                {[copy(language, 'Review a support ticket', '审查客服工单'), copy(language, 'Sanitize a config file', '脱敏配置文件'), copy(language, 'Check a client prompt', '检查客户提示词')].map((item) => <button key={item} onClick={() => setPrompt(item)}>{item}</button>)}
                {settings.experimentalFeatures && <button onClick={() => setPrompt('Review contact alice@example.com and api_key=DEMO_SECRET_1234567890abcdef before sending.')}>{copy(language, 'Load redaction demo', '载入脱敏演示')}</button>}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {conversation.messages.map((message) => (
                <article className={`message message-${message.role} ${message.failed ? 'message-failed' : ''}`} key={message.id}>
                  <div className="message-avatar">{message.role === 'user' ? 'YOU' : <Icon name="shield" size={17} />}</div>
                  <div className="message-body">
                    <div className="message-meta"><strong>{message.role === 'user' ? copy(language, 'Reviewed payload', '已审查请求') : message.provider}</strong><span>{new Date(message.createdAt).toLocaleTimeString()}</span>{message.riskLevel && <span className={`risk-text risk-${message.riskLevel}`}>{riskLabel(language, message.riskLevel)}</span>}</div>
                    <pre>{message.content}</pre>
                  </div>
                </article>
              ))}
              {sending && <article className="message message-assistant"><div className="message-avatar"><Icon name="shield" size={17} /></div><div className="message-body"><div className="typing"><span/><span/><span/></div></div></article>}
              <div ref={messageEnd} />
            </div>
          )}
        </div>

        <div className="composer-wrap">
          {attachments.length > 0 && <div className="attachment-strip">{attachments.map((attachment) => <div className="attachment-chip" key={attachment.id}><Icon name="paperclip" size={15}/><span>{attachment.name}</span><small>{Math.ceil(attachment.size / 1024)} KB</small><button onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}><Icon name="x" size={14}/></button></div>)}</div>}
          <div className={`composer ${isReviewed ? 'reviewed' : ''}`}>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={copy(language, 'Type a prompt or attach a supported text file…', '输入提示词或添加支持的文本文件…')}
              rows={3}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void send();
              }}
            />
            <div className="composer-footer">
              <input ref={fileInput} type="file" hidden multiple accept=".txt,.md,.json,.csv,.log,.xml,.yaml,.yml" onChange={(event) => void attachFiles(event.target.files)} />
              <button className="icon-button" onClick={() => fileInput.current?.click()} aria-label="Attach text file"><Icon name="paperclip" /></button>
              <span className="composer-status">{scan.estimatedTokens.toLocaleString()} {copy(language, 'estimated tokens', '预估 Token')} · {showLiveScan ? scan.findings.length : '—'} {copy(language, 'findings', '项风险')}</span>
              {!isReviewed ? (
                <button className="button primary" onClick={review} disabled={!hasInput}><Icon name="shield" />{copy(language, 'Review before send', '发送前审查')}</button>
              ) : (
                <button className="button primary" onClick={() => void send()} disabled={!hasInput || sending || (mustApproveCritical && !criticalApproved)}><Icon name="send" />{providerReady ? copy(language, 'Send safe version', '发送安全版本') : copy(language, 'Connect provider', '连接 Provider')}</button>
              )}
            </div>
          </div>
          <p className="composer-hint">{copy(language, 'Ctrl/⌘ + Enter sends only after a current safety review. Editing invalidates approval.', 'Ctrl/⌘ + Enter 仅在当前内容完成安全审查后发送；任何编辑都会使批准失效。')}</p>
        </div>
      </section>

      {inspectorOpen && <aside className="safety-inspector">
        <header>
          <div><span className="eyebrow">SAFETY INSPECTOR</span><h2>{copy(language, 'Before-send review', '发送前审查')}</h2></div>
          <button className="icon-button inspector-close" onClick={() => setInspectorOpen(false)}><Icon name="x" /></button>
        </header>
        <div className={`risk-summary risk-panel-${inspectorRiskLevel}`}>
          <div className="risk-score"><strong>{inspectorRiskScore}</strong><span>/100</span></div>
          <div><span>{copy(language, 'Current risk', '当前风险')}</span><h3>{riskLabel(language, inspectorRiskLevel)}</h3><p>{isReviewed ? copy(language, 'Approved snapshot is current.', '当前批准快照有效。') : copy(language, 'Review required after every edit.', '每次编辑后都必须重新审查。')}</p></div>
        </div>
        <div className="inspector-stats"><div><strong>{showLiveScan ? scan.findings.length : '—'}</strong><span>{copy(language, 'Findings', '风险项')}</span></div><div><strong>{scan.estimatedTokens}</strong><span>Tokens</span></div><div><strong>{attachments.length}</strong><span>{copy(language, 'Files', '文件')}</span></div></div>

        <section className="inspector-section">
          <h3>{copy(language, 'Detected data', '检测到的数据')}</h3>
          {!showLiveScan ? <div className="safe-state pending"><Icon name="info" />{copy(language, 'Auto scan is off. Click Review before send to run the scanner.', '自动扫描已关闭。点击“发送前审查”运行扫描。')}</div> : !inspectorFindings.length ? <div className="safe-state"><Icon name="check" />{copy(language, 'No supported sensitive pattern detected.', '未检测到已支持的敏感模式。')}</div> : <div className="finding-list">{inspectorFindings.map((finding) => <div className={`finding finding-${finding.severity}`} key={finding.id}><Icon name="alert" size={16}/><div><strong>{finding.label}</strong><span>{finding.replacement}</span></div><small>{finding.severity}</small></div>)}</div>}
        </section>

        <section className="inspector-section safe-preview">
          <div className="section-title"><h3>{copy(language, 'Exact safe payload', '准确安全请求')}</h3><span>{isReviewed ? copy(language, 'Reviewed', '已审查') : copy(language, 'Draft', '草稿')}</span></div>
          <pre>{showLiveScan ? (formatSafePayload(scan) || copy(language, 'Nothing to review yet.', '暂无待审查内容。')) : copy(language, 'Run Review before send to generate the exact redacted payload.', '点击“发送前审查”生成准确的脱敏请求。')}</pre>
        </section>

        {mustApproveCritical && isReviewed && <label className="critical-approval"><input type="checkbox" checked={criticalApproved} onChange={(event) => setCriticalApproved(event.target.checked)} /><span><strong>{copy(language, 'Approve redacted payload only', '仅批准发送脱敏版本')}</strong><small>{copy(language, 'The detected raw values will not be included.', '检测到的原始敏感值不会被包含。')}</small></span></label>}

        <div className="destination-card">
          <span>{copy(language, 'Destination', '发送目标')}</span>
          <div><strong>{provider.demoMode ? copy(language, 'Local demo — no network', '本地演示—无网络请求') : 'DeepSeek'}</strong><small>{provider.demoMode ? 'local-safety-demo' : provider.model}</small></div>
          <div className={`status-dot status-${provider.demoMode ? 'connected' : providerStatus.state}`} />
        </div>
      </aside>}
    </main>
  );
}

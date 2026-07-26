import { useEffect, useMemo, useState } from 'react';
import type { Language } from '../../app/types';
import { resolveUnifiedApproval } from './approvalBroker';
import { acceptProjectChangeSession, rollbackProjectChangeSession } from '../projects/projectClient';
import { updateToolEvent } from './runtimeStore';
import type { UnifiedAgentRun, UnifiedApprovalRequest } from './types';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

function statusLabel(language: Language, status: UnifiedAgentRun['status']): string {
  const labels: Record<UnifiedAgentRun['status'], [string, string]> = {
    queued: ['Queued', '排队中'],
    planning: ['Model deciding', '模型决策中'],
    running: ['Running tools', '执行工具中'],
    'waiting-approval': ['Waiting for approval', '等待审批'],
    completed: ['Completed', '已完成'],
    failed: ['Failed', '失败'],
    cancelled: ['Stopped', '已停止'],
    interrupted: ['Interrupted', '已中断'],
  };
  return copy(language, labels[status][0], labels[status][1]);
}

function ApprovalCard({ approval, language }: { approval: UnifiedApprovalRequest; language: Language }) {
  const defaults = useMemo(() => approval.selectedPaths || approval.patchFiles?.map((file) => file.path) || [], [approval]);
  const [selected, setSelected] = useState<string[]>(defaults);
  useEffect(() => setSelected(defaults), [approval.id, defaults]);
  if (approval.status !== 'pending') {
    return (
      <div className={`ua-approval resolved ${approval.status}`}>
        <strong>{approval.title}</strong>
        <span>{approval.status === 'approved' ? copy(language, 'Approved', '已批准') : copy(language, 'Denied', '已拒绝')}</span>
      </div>
    );
  }
  const toggle = (path: string) => setSelected((current) => current.includes(path)
    ? current.filter((entry) => entry !== path)
    : [...current, path]);
  return (
    <section className="ua-approval pending">
      <header>
        <div><strong>{approval.title}</strong><p>{approval.detail}</p></div>
        <span>{copy(language, 'ACTION REQUIRED', '需要确认')}</span>
      </header>
      {approval.patchFiles?.length ? (
        <div className="ua-patch-files">
          {approval.patchFiles.map((file) => (
            <details key={file.path} open>
              <summary>
                <label onClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" checked={selected.includes(file.path)} onChange={() => toggle(file.path)} />
                  <b>{file.path}</b>
                </label>
                <em>{file.action} · +{file.additions} −{file.deletions}</em>
              </summary>
              <pre>{file.patch}</pre>
            </details>
          ))}
        </div>
      ) : null}
      <footer>
        <button type="button" className="ua-button ghost" onClick={() => resolveUnifiedApproval(approval.id, false)}>
          {copy(language, 'Deny', '拒绝')}
        </button>
        <button
          type="button"
          className="ua-button primary"
          disabled={Boolean(approval.patchFiles?.length && !selected.length)}
          onClick={() => resolveUnifiedApproval(approval.id, true, selected)}
        >
          {approval.patchFiles?.length
            ? copy(language, `Apply ${selected.length} file(s)`, `应用 ${selected.length} 个文件`)
            : copy(language, 'Approve once', '仅本次批准')}
        </button>
      </footer>
    </section>
  );
}

function TransactionActions({
  runId,
  event,
  language,
}: {
  runId: string;
  event: UnifiedAgentRun['events'][number];
  language: Language;
}) {
  const [busy, setBusy] = useState<'accept' | 'rollback' | ''>('');
  if (!event.sessionId || event.transactionStatus === 'accepted' || event.transactionStatus === 'rolled-back') return null;
  const paths = event.selectedPaths || event.patchFiles?.map((file) => file.path) || [];
  const applyAction = async (action: 'accept' | 'rollback') => {
    if (!paths.length || busy) return;
    const confirmed = window.confirm(action === 'accept'
      ? copy(language, `Accept ${paths.length} changed file(s) and discard their rollback snapshots?`, `确认接受 ${paths.length} 个文件的修改并清理对应回滚快照？`)
      : copy(language, `Rollback ${paths.length} changed file(s)? Later manual edits are protected and will be blocked instead of overwritten.`, `回滚 ${paths.length} 个文件？后续人工修改会受保护，发生冲突时不会被覆盖。`));
    if (!confirmed) return;
    setBusy(action);
    try {
      const result = action === 'accept'
        ? await acceptProjectChangeSession(event.sessionId!, paths, true)
        : await rollbackProjectChangeSession(event.sessionId!, paths, true);
      const transactionStatus = result.ok
        ? (action === 'accept' ? 'accepted' : result.status === 'rolled-back' ? 'rolled-back' : 'rollback-blocked')
        : 'failed';
      updateToolEvent(runId, event.id, {
        transactionStatus,
        transactionMessage: result.errorMessage || `${result.files.filter((file) => file.status === (action === 'accept' ? 'accepted' : 'rolled-back')).length}/${paths.length} file(s) ${action === 'accept' ? 'accepted' : 'rolled back'}.`,
      });
    } catch (cause) {
      updateToolEvent(runId, event.id, {
        transactionStatus: 'failed',
        transactionMessage: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="ua-transaction-actions">
      <button type="button" disabled={Boolean(busy)} onClick={() => void applyAction('rollback')}>
        {busy === 'rollback' ? copy(language, 'Rolling back…', '回滚中…') : copy(language, 'Rollback selected', '回滚所选文件')}
      </button>
      <button type="button" disabled={Boolean(busy)} onClick={() => void applyAction('accept')}>
        {busy === 'accept' ? copy(language, 'Accepting…', '确认中…') : copy(language, 'Accept transaction', '接受本次事务')}
      </button>
    </div>
  );
}

export function UnifiedAgentRunCard({
  run,
  language,
  onStop,
}: {
  run: UnifiedAgentRun;
  language: Language;
  onStop: (runId: string) => void;
}) {
  const active = ['queued', 'planning', 'running', 'waiting-approval'].includes(run.status);
  return (
    <article className={`ua-run-card status-${run.status}`}>
      <header className="ua-run-head">
        <div>
          <span className="ua-run-dot" />
          <strong>{run.mode === 'agent' ? copy(language, 'Unified Agent', '统一 Agent') : copy(language, 'Chat request', '对话请求')}</strong>
          <small>{run.model}</small>
        </div>
        <div>
          <span className="ua-status">{statusLabel(language, run.status)}</span>
          {active && <button type="button" className="ua-stop" onClick={() => onStop(run.id)}>{copy(language, 'Stop', '停止')}</button>}
        </div>
      </header>
      {run.queuePosition ? <p className="ua-queue">{copy(language, `Queue position ${run.queuePosition}`, `队列第 ${run.queuePosition} 位`)}</p> : null}
      {run.privacy ? <p className={`ua-run-privacy route-${run.privacy.route}`}>{copy(language, 'Privacy', '隐私')}：{run.privacy.route} · {run.privacy.score}/100</p> : null}
      {run.mode === 'agent' && <p className="ua-loop">{copy(language, `Decision loop ${run.loop}/${run.maxLoops}`, `决策循环 ${run.loop}/${run.maxLoops}`)}</p>}
      {run.assistantDraft && run.mode === 'chat' ? <pre className="ua-stream-draft">{run.assistantDraft}</pre> : null}
      {run.events.length ? (
        <div className="ua-events">
          {run.events.map((event) => (
            <details key={event.id} open={event.status === 'failed' || event.status === 'waiting-approval'}>
              <summary>
                <span>{event.call.name}</span>
                <em>{event.status}</em>
              </summary>
              <p>{event.call.reason}</p>
              {event.summary && <p className={event.status === 'failed' ? 'ua-error' : ''}>{event.summary}</p>}
              {event.output && <pre>{event.output}</pre>}
              {event.screenshotDataUrl && <img src={event.screenshotDataUrl} alt="Approved Computer Use observation" />}
              {event.sessionId && <small>{copy(language, 'Transaction', '事务')}：{event.sessionId}</small>}
              {event.transactionMessage && <p className={event.transactionStatus === 'failed' || event.transactionStatus === 'rollback-blocked' ? 'ua-error' : ''}>{event.transactionMessage}</p>}
              <TransactionActions runId={run.id} event={event} language={language} />
            </details>
          ))}
        </div>
      ) : null}
      {run.approvals.map((approval) => <ApprovalCard key={approval.id} approval={approval} language={language} />)}
      {run.errorMessage && <p className="ua-run-error">{run.errorMessage}</p>}
    </article>
  );
}

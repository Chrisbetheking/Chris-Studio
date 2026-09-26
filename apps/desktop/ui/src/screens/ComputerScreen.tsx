import { useEffect, useRef, useState } from 'react';
import type { ComputerAuditEntry, ComputerCapability, Language } from '../app/types';
import {
  appendComputerAudit,
  clearComputerAudit,
  loadActiveProvider,
  loadComputerAudit,
  loadProviderStatus,
  loadSettings,
  makeId,
  nowIso,
} from '../app/store';
import { providerDefinition } from '../app/providerRegistry';
import { getComputerCapabilities } from '../features/platform/desktopClient';
import {
  captureScreen,
  clickPointer,
  openApplication,
  openComputerPrivacySettings,
  pressKey,
  requestComputerPermissions,
  typeText,
  withComputerRuntimeParent,
} from '../features/computer/computerClientReliable';
import {
  planNextComputerAction,
  type ModelComputerAction,
  type ModelComputerObservation,
} from '../features/computer-use/modelComputerAgent';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import {
  beginRuntimeRun,
  finishRuntimeRun,
  requestRuntimeStop,
  updateRuntimeRun,
} from '../features/agent-runtime/runtimeStore';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

type DesktopAction = 'capture' | 'open' | 'click' | 'type' | 'key';
type AgentStatus = 'idle' | 'planning' | 'executing' | 'waiting-approval' | 'completed' | 'failed' | 'stopped';

interface AgentLogEntry {
  id: string;
  level: 'info' | 'success' | 'warning' | 'error';
  text: string;
}

interface AgentTimelineItem {
  id: string;
  action: ModelComputerAction['action'];
  label: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  detail?: string;
}

const APP_OPTIONS = [
  { value: 'TextEdit', en: 'TextEdit', zh: '文本编辑' },
  { value: 'Notes', en: 'Notes', zh: '备忘录' },
  { value: 'Safari', en: 'Safari', zh: 'Safari' },
  { value: 'Finder', en: 'Finder', zh: '访达' },
  { value: 'Terminal', en: 'Terminal', zh: '终端' },
  { value: 'System Settings', en: 'System Settings', zh: '系统设置' },
];

function completionRequirements(goal: string): Array<{ action: ModelComputerAction['action']; target?: string; label: string }> {
  const normalized = goal.toLowerCase();
  const requirements: Array<{ action: ModelComputerAction['action']; target?: string; label: string }> = [];
  if (/textedit|text edit|文本编辑|文本编辑器/.test(normalized)) requirements.push({ action: 'open', target: 'TextEdit', label: 'open TextEdit' });
  if (/输入|键入|type|write|填入/.test(normalized)) requirements.push({ action: 'type', label: 'type the requested text' });
  return requirements;
}

function requestedTextFromGoal(goal: string): string | undefined {
  const match = goal.match(/(?:输入|键入|写入|打字|type|enter|write)\s*[:：]?\s*([\s\S]+)/i);
  if (!match?.[1]) return undefined;
  let value = match[1].trim();
  value = value.split(/\n(?:完成后|然后停止|停止执行|不要保存|when done|then stop|do not save)/i)[0]?.trim() ?? value;
  value = value.replace(/(?:完成后停止|完成后|然后停止|不要保存|when done|then stop|do not save)[\s\S]*$/i, '').trim();
  value = value.replace(/^[“"']|[”"']$/g, '').trim();
  return value || undefined;
}

function goalContractActions(goal: string): ModelComputerAction[] {
  const normalized = goal.toLowerCase();
  const actions: ModelComputerAction[] = [];
  const usesTextEdit = /textedit|text edit|文本编辑|文本编辑器/.test(normalized);
  if (usesTextEdit) {
    actions.push({ action: 'open', app: 'TextEdit', reason: 'Create and focus a new untitled TextEdit document.' });
  }
  const requestedText = requestedTextFromGoal(goal);
  if (requestedText) {
    actions.push({ action: 'type', text: requestedText, reason: 'Insert the exact user-approved text into the focused document.' });
  }
  return actions;
}

function contractActionSatisfied(action: ModelComputerAction, observations: ModelComputerObservation[]): boolean {
  return observations.some((observation) => {
    if (!observation.ok || observation.action !== action.action) return false;
    if (action.action === 'open') return !action.app || observation.target === action.app;
    return true;
  });
}

function requiredContractAction(goal: string, observations: ModelComputerObservation[]): ModelComputerAction | undefined {
  return goalContractActions(goal).find((action) => !contractActionSatisfied(action, observations));
}

function actionProgressKey(action: ModelComputerAction): string {
  if (action.action === 'open') return `open:${action.app ?? 'application'}`;
  return action.action;
}

function missingCompletionRequirements(goal: string, observations: ModelComputerObservation[]): string[] {
  const missing = completionRequirements(goal).filter((requirement) => !observations.some((observation) =>
    observation.ok
      && observation.action === requirement.action
      && (!requirement.target || observation.target === requirement.target),
  )).map((requirement) => requirement.label);
  const effectSucceeded = observations.some((observation) => observation.ok && ['open', 'type', 'key', 'click'].includes(observation.action));
  if (!effectSucceeded) missing.push('execute at least one desktop-changing action');
  const last = observations[observations.length - 1];
  if (last && !last.ok) missing.push('recover from the most recent failed action');
  return Array.from(new Set(missing));
}

function actionLabel(language: Language, action?: ModelComputerAction): string {
  if (!action) return copy(language, 'Waiting for a model plan', '等待模型生成下一步');
  const labels: Record<ModelComputerAction['action'], [string, string]> = {
    capture: ['Capture the current screen', '获取当前屏幕'],
    open: [`Open ${action.app ?? 'application'}`, `打开 ${action.app ?? '应用'}`],
    click: [`Click ${action.x}, ${action.y}`, `点击坐标 ${action.x}, ${action.y}`],
    type: [`Type “${(action.text ?? '').slice(0, 42)}”`, `输入“${(action.text ?? '').slice(0, 42)}”`],
    key: [`Press ${action.key ?? 'key'}`, `执行按键 ${action.key ?? ''}`],
    ask: ['Needs user clarification', '需要用户确认或补充'],
    done: ['Goal completed', '目标已完成'],
  };
  return copy(language, labels[action.action][0], labels[action.action][1]);
}

export function ComputerScreen({ language }: { language: Language }) {
  const [capabilities, setCapabilities] = useState<ComputerCapability[]>([]);
  const [screenshot, setScreenshot] = useState('');
  const [application, setApplication] = useState('TextEdit');
  const [x, setX] = useState(400);
  const [y, setY] = useState(300);
  const [text, setText] = useState('');
  const [key, setKey] = useState('enter');
  const [approved, setApproved] = useState(false);
  const [audit, setAudit] = useState<ComputerAuditEntry[]>(() => loadComputerAudit());
  const [busyAction, setBusyAction] = useState<DesktopAction | null>(null);

  const [agentGoal, setAgentGoal] = useState('');
  const [agentApproved, setAgentApproved] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [agentStep, setAgentStep] = useState<ModelComputerAction | undefined>(undefined);
  const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([]);
  const [agentTimeline, setAgentTimeline] = useState<AgentTimelineItem[]>([]);
  const [agentStepNumber, setAgentStepNumber] = useState(0);
  const stopAgentRef = useRef(false);
  const agentAbortRef = useRef<AbortController | null>(null);
  const agentSessionRunIdRef = useRef<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    const refreshCapabilities = () => { void getComputerCapabilities().then(setCapabilities); };
    refreshCapabilities();
    window.addEventListener('focus', refreshCapabilities);
    const interval = window.setInterval(refreshCapabilities, 5000);
    return () => {
      window.removeEventListener('focus', refreshCapabilities);
      window.clearInterval(interval);
    };
  }, []);

  const record = (action: string, detail: string, ok: boolean) => {
    const entry = { id: makeId('audit'), action, detail, ok, createdAt: nowIso() };
    appendComputerAudit(entry);
    setAudit(loadComputerAudit());
  };

  const logAgent = (level: AgentLogEntry['level'], value: string) => {
    setAgentLogs((current) => [...current, { id: makeId('agent-log'), level, text: value }].slice(-80));
  };

  const markTimeline = (action: ModelComputerAction, status: AgentTimelineItem['status'], detail?: string) => {
    const key = actionProgressKey(action);
    setAgentTimeline((current) => {
      let matched = false;
      const next = current.map((item) => {
        if (matched || item.id !== key) return item;
        matched = true;
        return { ...item, status, detail };
      });
      if (matched) return next;
      return [...next, { id: key, action: action.action, label: actionLabel(language, action), status, detail }];
    });
  };

  const performAction = async (action: DesktopAction, input?: { app?: string; x?: number; y?: number; text?: string; key?: string }) => {
    const invoke = () => action === 'capture' ? captureScreen(true)
      : action === 'open' ? openApplication(input?.app ?? application, true)
      : action === 'click' ? clickPointer(input?.x ?? x, input?.y ?? y, true)
      : action === 'type' ? typeText(input?.text ?? text, true, input?.app)
      : pressKey(input?.key ?? key, true, input?.app);
    const result = await withComputerRuntimeParent(agentSessionRunIdRef.current ?? undefined, invoke);
    if (result.screenshotDataUrl) setScreenshot(result.screenshotDataUrl);
    record(result.action, result.message, result.ok);
    if (action === 'capture') setCapabilities(await getComputerCapabilities());
    return result;
  };

  const execute = async (action: DesktopAction) => {
    if (!approved) {
      toast.show(copy(language, 'Review and approve this single desktop action first.', '请先审查并批准这一项桌面操作。'), 'warning');
      return;
    }
    if (action === 'type' && !text.trim()) {
      toast.show(copy(language, 'Enter text before approving the action.', '请先填写需要输入的文字。'), 'warning');
      return;
    }

    setBusyAction(action);
    try {
      const result = await performAction(action);
      toast.show(result.message, result.ok ? 'success' : 'error');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      record(action, message, false);
      toast.show(message, 'error');
    } finally {
      setApproved(false);
      setBusyAction(null);
    }
  };

  const requestPermissions = async () => {
    setBusyAction('capture');
    try {
      const result = await requestComputerPermissions();
      setCapabilities(await getComputerCapabilities());
      toast.show(result.message, result.ok ? 'success' : 'warning');
    } catch (error) {
      toast.show(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const stopModelAgent = () => {
    stopAgentRef.current = true;
    agentAbortRef.current?.abort();
    agentAbortRef.current = null;
    const runtimeId = agentSessionRunIdRef.current;
    if (runtimeId) requestRuntimeStop(runtimeId, 'Computer Use session stopped by the user.');
    setAgentStatus('stopped');
    logAgent('warning', copy(language, 'Emergency stop requested by the user.', '用户已请求紧急停止。'));
  };

  const runModelAgent = async () => {
    const goal = agentGoal.trim();
    if (!goal) {
      toast.show(copy(language, 'Describe the desktop outcome first.', '请先描述希望电脑完成的目标。'), 'warning');
      return;
    }
    if (!agentApproved) {
      toast.show(copy(language, 'Approve this bounded Computer Use session first.', '请先批准本次有限步数的电脑操作会话。'), 'warning');
      return;
    }

    const profile = loadActiveProvider();
    const definition = providerDefinition(profile.providerId);
    const status = loadProviderStatus(profile.id);
    if (profile.providerId === 'local-demo' || status.state !== 'connected') {
      toast.show(copy(language, 'Connect a real model before starting model-driven Computer Use.', '请先连接真实模型，再启动模型驱动的电脑操作。'), 'warning');
      return;
    }

    stopAgentRef.current = false;
    setAgentLogs([]);
    setAgentStep(undefined);
    setAgentStepNumber(0);
    const contractPlan = goalContractActions(goal);
    setAgentTimeline([
      ...contractPlan.map((action) => ({
        id: actionProgressKey(action),
        action: action.action,
        label: actionLabel(language, action),
        status: 'pending' as const,
      })),
      { id: 'done', action: 'done' as const, label: copy(language, 'Verify and finish', '验证结果并完成'), status: 'pending' as const },
    ]);
    setAgentStatus('planning');
    const observations: ModelComputerObservation[] = [];
    let currentScreenshot = screenshot;
    let focusedApplication: string | undefined;
    const maxSteps = 8;
    const sessionRun = beginRuntimeRun({
      kind: 'computer',
      task: `Computer Use goal: ${goal.slice(0, 240)}`,
      provider: profile.displayName,
      model: profile.model,
      action: 'model-session',
      maxAttempts: maxSteps,
    });
    agentSessionRunIdRef.current = sessionRun.id;
    updateRuntimeRun(sessionRun.id, { status: 'running', attempt: 0, message: 'Preparing the bounded desktop plan.' });
    logAgent('info', copy(language, `Starting a bounded ${maxSteps}-step session with ${profile.displayName}.`, `正在使用 ${profile.displayName} 启动最多 ${maxSteps} 步的有限会话。`));
    if (!definition.capabilities.vision) {
      logAgent('warning', copy(language, 'This model has no vision capability. It can plan known app and keyboard actions, but coordinate clicking is disabled.', '当前模型不支持视觉，可规划已知应用和键盘操作，但不能进行坐标点击。'));
    }

    try {
      for (let index = 0; index < maxSteps; index += 1) {
        if (stopAgentRef.current) break;

        if (definition.capabilities.vision) {
          const capture = await performAction('capture');
          if (capture.ok && capture.screenshotDataUrl) currentScreenshot = capture.screenshotDataUrl;
          observations.push({ action: 'capture', ok: capture.ok, detail: capture.message, target: 'screen' });
          logAgent(capture.ok ? 'success' : 'warning', capture.message);
        }

        const controller = new AbortController();
        agentAbortRef.current = controller;
        setAgentStatus('planning');
        setAgentStepNumber(index + 1);
        const runtimeId = agentSessionRunIdRef.current;
        if (runtimeId) updateRuntimeRun(runtimeId, { status: 'planning', attempt: index + 1, message: `Planning desktop step ${index + 1}/${maxSteps}.` });
        logAgent('info', copy(language, `Planning step ${index + 1}/${maxSteps}…`, `正在规划第 ${index + 1}/${maxSteps} 步…`));
        const required = requiredContractAction(goal, observations);
        const next = required ?? await planNextComputerAction({
          profile,
          goal,
          screenshotDataUrl: currentScreenshot,
          observations,
          timeoutMs: loadSettings().requestTimeoutMs,
          signal: controller.signal,
        });
        if (required) {
          logAgent('info', copy(language, 'Using the verified goal contract for the next safe action.', '正在按已验证的目标契约执行下一项安全操作。'));
        }
        agentAbortRef.current = null;
        if (stopAgentRef.current) break;
        setAgentStep(next);
        markTimeline(next, 'running');
        if (runtimeId) updateRuntimeRun(runtimeId, { status: 'running', attempt: index + 1, message: actionLabel(language, next) });
        logAgent('info', `${actionLabel(language, next)} — ${next.reason}`);

        if (next.action === 'done') {
          const missing = missingCompletionRequirements(goal, observations);
          if (missing.length) {
            const detail = `Completion rejected: ${missing.join(', ')}.`;
            observations.push({ action: 'done', ok: false, detail, target: 'completion-check' });
            logAgent('warning', copy(language, detail, `暂不能结束：${missing.join('、')}。`));
            setAgentStatus('planning');
            continue;
          }
          markTimeline(next, 'success', next.message);
          setAgentStatus('completed');
          const runtimeId = agentSessionRunIdRef.current;
          if (runtimeId) finishRuntimeRun(runtimeId, 'completed', next.message || 'Computer Use goal completed.');
          agentSessionRunIdRef.current = null;
          logAgent('success', next.message || copy(language, 'The model marked the goal complete.', '模型已确认目标完成。'));
          toast.show(copy(language, 'Computer Use goal completed.', '电脑操作目标已完成。'), 'success');
          return;
        }
        if (next.action === 'ask') {
          markTimeline(next, 'failed', next.message);
          setAgentStatus('waiting-approval');
          logAgent('warning', next.message || copy(language, 'The model needs clarification.', '模型需要进一步确认。'));
          toast.show(next.message || copy(language, 'The model needs clarification.', '模型需要进一步确认。'), 'warning');
          return;
        }

        const sensitive = next.action === 'click' || next.action === 'type' || next.action === 'key'
          || (next.action === 'open' && (next.app === 'Terminal' || next.app === 'System Settings'));
        if (sensitive) {
          setAgentStatus('waiting-approval');
          const confirmed = window.confirm(copy(
            language,
            `Approve this model-selected action?\n\n${actionLabel(language, next)}\n${next.reason}`,
            `是否批准模型选择的这一项操作？\n\n${actionLabel(language, next)}\n${next.reason}`,
          ));
          if (!confirmed) {
            observations.push({ action: next.action, ok: false, detail: 'User denied this action.', target: next.app || next.key || next.action });
            logAgent('warning', copy(language, 'The user denied the proposed action.', '用户拒绝了模型提出的操作。'));
            markTimeline(next, 'failed', 'User denied this action.');
            setAgentStatus('stopped');
            const runtimeId = agentSessionRunIdRef.current;
            if (runtimeId) finishRuntimeRun(runtimeId, 'cancelled', 'The user denied the proposed action.');
            agentSessionRunIdRef.current = null;
            return;
          }
        }

        setAgentStatus('executing');
        const result = next.action === 'capture' ? await performAction('capture')
          : next.action === 'open' ? await performAction('open', { app: next.app })
          : next.action === 'click' ? await performAction('click', { x: next.x, y: next.y })
          : next.action === 'type' ? await performAction('type', { text: next.text, app: focusedApplication })
          : await performAction('key', { key: next.key, app: focusedApplication });
        if (result.ok && next.action === 'open' && next.app) focusedApplication = next.app;
        const observationTarget = next.action === 'open' ? next.app : next.action === 'key' ? next.key : next.action === 'type' ? 'typed-text' : next.action;
        observations.push({
          action: next.action,
          ok: result.ok,
          detail: result.message,
          target: observationTarget,
        });
        markTimeline(next, result.ok ? 'success' : 'failed', result.message);
        logAgent(result.ok ? 'success' : 'error', result.message);
        if (!result.ok) {
          const sameFailureCount = observations.filter((observation) =>
            !observation.ok && observation.action === next.action && observation.target === observationTarget,
          ).length;
          if (required || sameFailureCount >= 2) {
            setAgentStatus('failed');
            const failureMessage = required
              ? copy(language, `Required desktop step failed: ${result.message}`, `必要桌面步骤失败：${result.message}`)
              : copy(language, `The same desktop action failed twice, so the session stopped instead of looping: ${result.message}`, `同一桌面操作已连续失败两次，会话已停止以避免循环：${result.message}`);
            const currentRuntimeId = agentSessionRunIdRef.current;
            if (currentRuntimeId) finishRuntimeRun(currentRuntimeId, 'failed', failureMessage);
            agentSessionRunIdRef.current = null;
            logAgent('error', failureMessage);
            toast.show(failureMessage, 'error');
            return;
          }
          setAgentStatus('planning');
        }
      }

      if (stopAgentRef.current) {
        setAgentStatus('stopped');
        const runtimeId = agentSessionRunIdRef.current;
        if (runtimeId) finishRuntimeRun(runtimeId, 'cancelled', 'Computer Use session stopped by the user.');
        agentSessionRunIdRef.current = null;
        return;
      }
      setAgentStatus('failed');
      const runtimeId = agentSessionRunIdRef.current;
      if (runtimeId) finishRuntimeRun(runtimeId, 'failed', 'The session reached its eight-step safety limit before completion.');
      agentSessionRunIdRef.current = null;
      logAgent('error', copy(language, 'The session reached its eight-step safety limit before completion.', '会话在完成目标前达到 8 步安全上限。'));
    } catch (error) {
      if (stopAgentRef.current || (error instanceof Error && /stopped|cancelled/i.test(error.message))) {
        setAgentStatus('stopped');
        const runtimeId = agentSessionRunIdRef.current;
        if (runtimeId) finishRuntimeRun(runtimeId, 'cancelled', 'Computer Use session stopped by the user.');
        agentSessionRunIdRef.current = null;
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setAgentStatus('failed');
      const runtimeId = agentSessionRunIdRef.current;
      if (runtimeId) finishRuntimeRun(runtimeId, 'failed', message);
      agentSessionRunIdRef.current = null;
      logAgent('error', message);
      toast.show(message, 'error');
    } finally {
      agentAbortRef.current = null;
      setAgentApproved(false);
    }
  };

  const busy = busyAction !== null;
  const agentRunning = agentStatus === 'planning' || agentStatus === 'executing' || agentStatus === 'waiting-approval';
  const activeProvider = loadActiveProvider();
  const activeDefinition = providerDefinition(activeProvider.providerId);
  const timelineWeight = agentTimeline.reduce((total, item) => total + (item.status === 'success' ? 1 : item.status === 'running' ? 0.45 : 0), 0);
  const agentProgressPercent = agentTimeline.length ? Math.min(100, Math.round((timelineWeight / agentTimeline.length) * 100)) : 0;

  return <main className="modern-page computer-page">
    <header className="compact-page-header">
      <div>
        <span className="section-kicker">COMPUTER USE · MODEL DRIVEN</span>
        <h1>{copy(language, 'Goal-driven desktop agent', '目标驱动的桌面 Agent')}</h1>
        <p>{copy(language, 'The model plans one action, observes the new screen, and continues inside a bounded approval session. Manual controls are retained below for debugging.', '模型每次规划一个动作，观察新的屏幕状态后继续执行；整个过程受步数、审批和紧急停止限制。手动控制保留在下方用于调试。')}</p>
      </div>
      <div className="header-actions">
        <button className="button primary" onClick={() => void requestPermissions()} disabled={busy || agentRunning}>
          <Icon name="shield" />{copy(language, 'Request permissions', '请求系统权限')}
        </button>
        <button className="button secondary" onClick={() => void openComputerPrivacySettings()} disabled={busy || agentRunning}>
          <Icon name="settings" />{copy(language, 'Open settings', '打开系统设置')}
        </button>
      </div>
    </header>

    <section className="computer-agent-panel">
      <div className="computer-agent-main">
        <div className="computer-agent-heading">
          <div><span className="section-kicker">MODEL LOOP</span><h2>{copy(language, 'Describe the outcome, not the clicks', '描述目标，而不是逐个点击')}</h2></div>
          <span className="computer-agent-provider" style={{ '--provider-accent': activeDefinition.accent } as React.CSSProperties}>{activeProvider.displayName} · {activeProvider.model}</span>
        </div>
        <textarea
          rows={3}
          value={agentGoal}
          onChange={(event) => setAgentGoal(event.target.value)}
          disabled={agentRunning}
          placeholder={copy(language, 'Example: Open TextEdit, create a new document, type “Chris Studio streaming test”, and save it.', '例如：打开文本编辑，新建文档，输入“Chris Studio 流式测试”，然后保存。')}
        />
        <div className="computer-agent-controls">
          <label className="critical-approval computer-session-approval">
            <input type="checkbox" checked={agentApproved} onChange={(event) => setAgentApproved(event.target.checked)} disabled={agentRunning} />
            <span><strong>{copy(language, 'Approve an eight-step bounded session', '批准最多 8 步的有限会话')}</strong><small>{copy(language, 'Typing, coordinate clicks, Terminal and System Settings still require per-action approval.', '文字输入、坐标点击、终端和系统设置仍需逐项确认。')}</small></span>
          </label>
          {agentRunning
            ? <button className="button primary stop-request" onClick={stopModelAgent}><Icon name="x" />{copy(language, 'Emergency stop', '紧急停止')}</button>
            : <button className="button primary" onClick={() => void runModelAgent()} disabled={!agentGoal.trim()}><Icon name="bot" />{copy(language, 'Start model agent', '启动模型 Agent')}</button>}
        </div>
        {agentTimeline.length > 0 && <div className={`computer-agent-progress-inline status-${agentStatus}`}>
          <div className="computer-agent-progress-inline-head">
            <span>{copy(language, `Desktop progress · step ${agentStepNumber}/${Math.max(1, agentTimeline.length)}`, `桌面执行进度 · 步骤 ${agentStepNumber}/${Math.max(1, agentTimeline.length)}`)}</span>
            <strong>{agentProgressPercent}%</strong>
          </div>
          <span className="computer-agent-progress-track"><i style={{ width: `${agentProgressPercent}%` }} /></span>
          <div className="computer-agent-progress-inline-current">
            <Icon name={agentStatus === 'failed' ? 'x' : agentStatus === 'completed' ? 'check' : 'bot'} />
            <div>
              <strong>{actionLabel(language, agentStep)}</strong>
              <small>{agentLogs[agentLogs.length - 1]?.text || copy(language, 'Waiting to start the next approved action.', '等待开始下一项已批准操作。')}</small>
            </div>
          </div>
        </div>}
      </div>
      <aside className={`computer-agent-status status-${agentStatus}`}>
        <div className="panel-title"><span>{copy(language, 'Current model step', '当前模型步骤')}</span><em>{agentStatus}</em></div>
        <div className="computer-agent-progress">
          <div><span>{copy(language, `Step ${agentStepNumber}/${Math.max(1, agentTimeline.length)}`, `步骤 ${agentStepNumber}/${Math.max(1, agentTimeline.length)}`)}</span><strong>{agentProgressPercent}%</strong></div>
          <span className="computer-agent-progress-track"><i style={{ width: `${agentProgressPercent}%` }} /></span>
          <ol>
            {agentTimeline.map((item) => <li key={item.id} className={`timeline-${item.status}`}><span>{item.status === 'success' ? '✓' : item.status === 'failed' ? '!' : item.status === 'running' ? '●' : '○'}</span><div><strong>{item.label}</strong>{item.detail && <small>{item.detail}</small>}</div></li>)}
          </ol>
        </div>
        <strong>{actionLabel(language, agentStep)}</strong>
        {agentStep?.reason && <p>{agentStep.reason}</p>}
        <div className="computer-agent-log">
          {agentLogs.length ? agentLogs.slice(-8).map((entry) => <div key={entry.id} className={`log-${entry.level}`}>{entry.text}</div>) : <div className="log-empty">{copy(language, 'Execution observations will appear here.', '执行观察结果会显示在这里。')}</div>}
        </div>
      </aside>
    </section>

    <section className="capability-row-modern">
      {capabilities.map((capability) => {
        const optionalForModel = capability.id === 'screen-capture' && !activeDefinition.capabilities.vision;
        const displayStatus = optionalForModel ? 'optional-current-model' : capability.status;
        return <article key={capability.id} title={capability.message}>
          <span className={`cap-dot cap-${optionalForModel ? 'ready' : capability.status}`} />
          <div><strong>{capability.id}</strong><small>{displayStatus}</small></div>
        </article>;
      })}
    </section>

    <details className="manual-computer-section">
      <summary><Icon name="sliders" />{copy(language, 'Developer manual controls and audit', '开发者手动控制与审计')}</summary>
      <div className="computer-layout">
        <section className="screen-preview-panel">
          <header>
            <div><span className="section-kicker">VISIBLE STATE</span><h2>{copy(language, 'Screen preview', '屏幕预览')}</h2></div>
            <button className="button secondary" onClick={() => void execute('capture')} disabled={busy || agentRunning}>
              <Icon name="monitor" />{busyAction === 'capture' ? copy(language, 'Working…', '处理中…') : copy(language, 'Capture now', '立即截屏')}
            </button>
          </header>
          {screenshot
            ? <img src={screenshot} alt="Current desktop capture" />
            : <div className="screen-placeholder"><Icon name="monitor" size={40} /><p>{copy(language, 'Approve and capture the current screen. macOS may request Screen Recording permission.', '批准后截取当前屏幕，macOS 可能请求“屏幕与系统音频录制”权限。')}</p></div>}
        </section>

        <aside className="computer-control-panel">
          <div className="panel-title"><span>{copy(language, 'Next approved action', '下一项批准操作')}</span></div>

          <label>
            <span>{copy(language, 'Open application', '打开应用')}</span>
            <select value={application} onChange={(event) => setApplication(event.target.value)}>
              {APP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{copy(language, option.en, option.zh)}</option>)}
            </select>
          </label>
          <button className="button secondary full" onClick={() => void execute('open')} disabled={busy || agentRunning}>
            <Icon name="external" />{busyAction === 'open' ? copy(language, 'Opening…', '正在打开…') : copy(language, 'Open application', '打开应用')}
          </button>

          <label><span>{copy(language, 'Pointer coordinates', '鼠标坐标')}</span><div className="inline-fields"><input type="number" value={x} onChange={(event) => setX(Number(event.target.value))} /><input type="number" value={y} onChange={(event) => setY(Number(event.target.value))} /></div></label>
          <button className="button secondary full" onClick={() => void execute('click')} disabled={busy || agentRunning}><Icon name="circle" />{copy(language, 'Click coordinate', '点击坐标')}</button>

          <label><span>{copy(language, 'Text to type', '输入文字')}</span><textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} placeholder={copy(language, 'Text is typed into the currently focused app.', '文字将输入到当前获得焦点的应用中。')} /></label>
          <button className="button secondary full" onClick={() => void execute('type')} disabled={busy || agentRunning || !text.trim()}><Icon name="edit" />{copy(language, 'Type text', '输入文字')}</button>

          <label><span>{copy(language, 'Approved key', '批准按键')}</span><select value={key} onChange={(event) => setKey(event.target.value)}><option value="enter">Enter</option><option value="escape">Escape</option><option value="tab">Tab</option><option value="space">Space</option><option value="delete">Delete</option><option value="cmd+n">⌘N</option><option value="cmd+s">⌘S</option><option value="cmd+l">⌘L</option></select></label>
          <button className="button secondary full" onClick={() => void execute('key')} disabled={busy || agentRunning}><Icon name="command" />{copy(language, 'Press key', '执行按键')}</button>

          <label className="critical-approval">
            <input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} disabled={busy || agentRunning} />
            <span><strong>{copy(language, 'I reviewed this single action', '我已审查这一项操作')}</strong><small>{copy(language, 'Approval resets after every action.', '每次操作后批准状态都会重置。')}</small></span>
          </label>
        </aside>

        <aside className="audit-panel">
          <div className="panel-title"><span>{copy(language, 'Local audit log', '本地审计日志')}</span><button onClick={() => { clearComputerAudit(); setAudit([]); }}>{copy(language, 'Clear', '清空')}</button></div>
          {audit.length
            ? audit.slice(0, 50).map((entry) => <article key={entry.id} className={entry.ok ? 'ok' : 'failed'}><span>{entry.ok ? '✓' : '!'}</span><div><strong>{entry.action}</strong><p>{entry.detail}</p><small>{new Date(entry.createdAt).toLocaleString()}</small></div></article>)
            : <div className="file-empty-small"><Icon name="shield" /><p>{copy(language, 'Approved desktop actions will appear here.', '已批准的桌面操作会显示在这里。')}</p></div>}
        </aside>
      </div>
    </details>
  </main>;
}

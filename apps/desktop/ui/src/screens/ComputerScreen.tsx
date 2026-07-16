import { useEffect, useState } from 'react';
import type { ComputerAuditEntry, ComputerCapability, Language } from '../app/types';
import { appendComputerAudit, clearComputerAudit, loadComputerAudit, makeId, nowIso } from '../app/store';
import { getComputerCapabilities } from '../features/platform/desktopClient';
import { captureScreen, clickPointer, openComputerPrivacySettings, pressKey, requestComputerPermissions, typeText } from '../features/computer/computerClient';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

export function ComputerScreen({ language }: { language: Language }) {
  const [capabilities, setCapabilities] = useState<ComputerCapability[]>([]);
  const [screenshot, setScreenshot] = useState('');
  const [x, setX] = useState(400);
  const [y, setY] = useState(300);
  const [text, setText] = useState('');
  const [key, setKey] = useState('enter');
  const [approved, setApproved] = useState(false);
  const [audit, setAudit] = useState<ComputerAuditEntry[]>(() => loadComputerAudit());
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => { void getComputerCapabilities().then(setCapabilities); }, []);

  const record = (action: string, detail: string, ok: boolean) => {
    const entry = { id: makeId('audit'), action, detail, ok, createdAt: nowIso() };
    appendComputerAudit(entry);
    setAudit(loadComputerAudit());
  };

  const execute = async (action: 'capture' | 'click' | 'type' | 'key') => {
    if (!approved) return toast.show(copy(language, 'Review and approve the next desktop action first.', '请先审查并批准下一步桌面操作。'), 'warning');
    setBusy(true);
    const result = action === 'capture' ? await captureScreen(true)
      : action === 'click' ? await clickPointer(x, y, true)
      : action === 'type' ? await typeText(text, true)
      : await pressKey(key, true);
    if (result.screenshotDataUrl) setScreenshot(result.screenshotDataUrl);
    record(result.action, result.message, result.ok);
    toast.show(result.message, result.ok ? 'success' : 'error');
    setApproved(false);
    setBusy(false);
  };

  return <main className="modern-page computer-page">
    <header className="compact-page-header"><div><span className="section-kicker">COMPUTER USE · APPROVAL FIRST</span><h1>{copy(language, 'Permission-gated desktop control', '权限门控的桌面控制')}</h1><p>{copy(language, 'Screen capture, pointer and keyboard actions execute only after explicit approval and create an audit receipt.', '屏幕捕获、鼠标和键盘操作只有在明确批准后才会执行，并生成审计记录。')}</p></div><div className="header-actions"><button className="button primary" onClick={async () => { const result = await requestComputerPermissions(); toast.show(result.message, result.ok ? 'success' : 'warning'); }}><Icon name="shield" />{copy(language, 'Request permissions', '请求系统权限')}</button><button className="button secondary" onClick={() => void openComputerPrivacySettings()}><Icon name="settings" />{copy(language, 'Open settings', '打开系统设置')}</button></div></header>

    <section className="capability-row-modern">{capabilities.map((capability) => <article key={capability.id}><span className={`cap-dot cap-${capability.status}`} /><div><strong>{capability.id}</strong><small>{capability.status}</small></div></article>)}</section>

    <div className="computer-layout">
      <section className="screen-preview-panel">
        <header><div><span className="section-kicker">VISIBLE STATE</span><h2>{copy(language, 'Screen preview', '屏幕预览')}</h2></div><button className="button secondary" onClick={() => void execute('capture')} disabled={busy}><Icon name="monitor" />{copy(language, 'Capture now', '立即截屏')}</button></header>
        {screenshot ? <img src={screenshot} alt="Current desktop capture" /> : <div className="screen-placeholder"><Icon name="monitor" size={40} /><p>{copy(language, 'Approve and capture the current screen. macOS may request Screen Recording permission.', '批准后截取当前屏幕，macOS 可能请求“屏幕录制”权限。')}</p></div>}
      </section>

      <aside className="computer-control-panel">
        <div className="panel-title"><span>{copy(language, 'Next approved action', '下一项批准操作')}</span></div>
        <label><span>{copy(language, 'Pointer coordinates', '鼠标坐标')}</span><div className="inline-fields"><input type="number" value={x} onChange={(event) => setX(Number(event.target.value))} /><input type="number" value={y} onChange={(event) => setY(Number(event.target.value))} /></div></label>
        <button className="button secondary full" onClick={() => void execute('click')} disabled={busy}><Icon name="circle" />{copy(language, 'Click coordinate', '点击坐标')}</button>
        <label><span>{copy(language, 'Text to type', '输入文字')}</span><textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} /></label>
        <button className="button secondary full" onClick={() => void execute('type')} disabled={busy || !text}><Icon name="edit" />{copy(language, 'Type text', '输入文字')}</button>
        <label><span>{copy(language, 'Approved key', '批准按键')}</span><select value={key} onChange={(event) => setKey(event.target.value)}><option value="enter">Enter</option><option value="escape">Escape</option><option value="tab">Tab</option><option value="space">Space</option><option value="delete">Delete</option><option value="cmd+s">⌘S</option><option value="cmd+l">⌘L</option></select></label>
        <button className="button secondary full" onClick={() => void execute('key')} disabled={busy}><Icon name="command" />{copy(language, 'Press key', '执行按键')}</button>
        <label className="critical-approval"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} /><span><strong>{copy(language, 'I reviewed this single action', '我已审查这一项操作')}</strong><small>{copy(language, 'Approval resets after every action.', '每次操作后批准状态都会重置。')}</small></span></label>
      </aside>

      <aside className="audit-panel"><div className="panel-title"><span>{copy(language, 'Local audit log', '本地审计日志')}</span><button onClick={() => { clearComputerAudit(); setAudit([]); }}>{copy(language, 'Clear', '清空')}</button></div>{audit.length ? audit.slice(0, 50).map((entry) => <article key={entry.id} className={entry.ok ? 'ok' : 'failed'}><span>{entry.ok ? '✓' : '!'}</span><div><strong>{entry.action}</strong><p>{entry.detail}</p><small>{new Date(entry.createdAt).toLocaleString()}</small></div></article>) : <div className="file-empty-small"><Icon name="shield" /><p>{copy(language, 'Approved desktop actions will appear here.', '已批准的桌面操作会显示在这里。')}</p></div>}</aside>
    </div>
  </main>;
}

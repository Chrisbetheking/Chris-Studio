import { useState } from 'react';
import type { AppSettings, Language, ScreenId, ThemeMode } from '../app/types';
import {
  clearConversations,
  clearProviderCredentials,
  clearReceipts,
  exportLocalSettings,
  loadSettings,
  resetApplication,
  saveSettings,
} from '../app/store';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

function Toggle({ checked, onChange, title, detail }: { checked: boolean; onChange: (value: boolean) => void; title: string; detail: string }) {
  return (
    <label className="toggle-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span><strong>{title}</strong><small>{detail}</small></span>
    </label>
  );
}

export function SettingsScreen({ language, onSettingsChanged }: { language: Language; onSettingsChanged: (settings: AppSettings) => void }) {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [customTerms, setCustomTerms] = useState(() => settings.customSensitiveTerms.join('\n'));
  const toast = useToast();

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));

  const save = () => {
    const next = {
      ...settings,
      customSensitiveTerms: customTerms.split(/\r?\n|,/).map((term) => term.trim()).filter(Boolean).slice(0, 100),
    };
    saveSettings(next);
    setSettings(next);
    onSettingsChanged(next);
    toast.show(copy(language, 'Settings saved.', '设置已保存。'), 'success');
  };

  const downloadSettings = () => {
    const blob = new Blob([exportLocalSettings()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tokenfence-settings-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const dangerous = (message: string, action: () => void, success: string) => {
    if (!window.confirm(message)) return;
    action();
    toast.show(success, 'success');
  };

  return (
    <main className="page-scroll">
      <div className="page-header">
        <div>
          <span className="eyebrow">PREFERENCES</span>
          <h1>{copy(language, 'Settings', '设置')}</h1>
          <p>{copy(language, 'Every option below is connected to runtime behavior or local data handling.', '以下选项均已连接实际运行逻辑或本地数据处理，不是空壳 UI。')}</p>
        </div>
        <button className="button primary" onClick={save}>{copy(language, 'Save settings', '保存设置')}</button>
      </div>

      <div className="settings-grid">
        <section className="settings-card">
          <h2>{copy(language, 'General', '常规')}</h2>
          <label className="field"><span>{copy(language, 'Language', '语言')}</span><select value={settings.language} onChange={(e) => update('language', e.target.value as Language)}><option value="en">English</option><option value="zh-CN">简体中文</option></select></label>
          <label className="field"><span>{copy(language, 'Theme', '主题')}</span><select value={settings.theme} onChange={(e) => update('theme', e.target.value as ThemeMode)}><option value="system">{copy(language, 'System', '跟随系统')}</option><option value="light">{copy(language, 'Light', '浅色')}</option><option value="dark">{copy(language, 'Dark', '深色')}</option></select></label>
          <label className="field"><span>{copy(language, 'Start screen', '启动页面')}</span><select value={settings.startScreen} onChange={(e) => update('startScreen', e.target.value as ScreenId)}><option value="workspace">Workspace</option><option value="history">History</option><option value="providers">Providers</option></select></label>
          <Toggle checked={settings.autoOpenInspector} onChange={(v) => update('autoOpenInspector', v)} title={copy(language, 'Auto-open Safety Inspector', '自动打开安全检查器')} detail={copy(language, 'Open the inspector when findings are detected.', '发现风险时自动展开右侧检查器。')} />
        </section>

        <section className="settings-card">
          <h2>{copy(language, 'Safety', '安全')}</h2>
          <Toggle checked={settings.autoScan} onChange={(v) => update('autoScan', v)} title={copy(language, 'Auto scan', '自动扫描')} detail={copy(language, 'Update risk analysis while the prompt changes.', '输入变化时同步更新风险分析。')} />
          <Toggle checked={settings.autoRedactCritical} onChange={(v) => update('autoRedactCritical', v)} title={copy(language, 'Auto redact Critical findings', '自动脱敏严重风险')} detail={copy(language, 'Critical values are replaced before a payload can be approved.', '严重敏感值在批准发送前自动替换。')} />
          <Toggle checked={settings.blockCriticalSends} onChange={(v) => update('blockCriticalSends', v)} title={copy(language, 'Block Critical raw sends', '阻止严重风险原文发送')} detail={copy(language, 'Only the reviewed redacted payload can proceed.', '仅允许经过审查的脱敏版本继续发送。')} />
          <label className="field"><span>{copy(language, 'Custom sensitive terms (one per line)', '自定义敏感词（每行一个）')}</span><textarea rows={5} value={customTerms} onChange={(e) => setCustomTerms(e.target.value)} placeholder={copy(language, 'Internal project name\nCustomer identifier', '内部项目名\n客户编号')} /></label>
          <div className="two-fields">
            <label className="field"><span>{copy(language, 'Maximum text size', '最大文本扫描大小')}</span><input type="number" min={1000} max={2000000} value={settings.maxTextScanSize} onChange={(e) => update('maxTextScanSize', Number(e.target.value))} /></label>
            <label className="field"><span>{copy(language, 'Maximum file size', '最大文件扫描大小')}</span><input type="number" min={1000} max={10000000} value={settings.maxFileScanSize} onChange={(e) => update('maxFileScanSize', Number(e.target.value))} /></label>
          </div>
        </section>

        <section className="settings-card">
          <h2>AI</h2>
          <label className="field"><span>{copy(language, 'Request timeout (ms)', '请求超时（毫秒）')}</span><input type="number" min={5000} max={180000} value={settings.requestTimeoutMs} onChange={(e) => update('requestTimeoutMs', Number(e.target.value))} /></label>
          <label className="field"><span>{copy(language, 'Conversation context messages', '会话上下文条数')}</span><input type="number" min={2} max={100} value={settings.conversationContextLimit} onChange={(e) => update('conversationContextLimit', Number(e.target.value))} /></label>
        </section>

        <section className="settings-card">
          <h2>{copy(language, 'Privacy', '隐私')}</h2>
          <Toggle checked={settings.localHistoryEnabled} onChange={(v) => update('localHistoryEnabled', v)} title={copy(language, 'Local history enabled', '启用本地历史')} detail={copy(language, 'Save only redacted prompts and replies.', '仅保存脱敏提示词与回复。')} />
          <Toggle checked={settings.safetyReceiptsEnabled} onChange={(v) => update('safetyReceiptsEnabled', v)} title={copy(language, 'Safety receipts', '安全回执')} detail={copy(language, 'Keep metadata about scans without storing raw findings.', '保留扫描元数据，不保存敏感原文。')} />
          <div className="danger-actions">
            <button className="button secondary" onClick={downloadSettings}><Icon name="download" />{copy(language, 'Export settings', '导出设置')}</button>
            <button className="button ghost danger" onClick={() => dangerous(copy(language, 'Clear all conversations?', '清空全部会话？'), clearConversations, copy(language, 'Conversations cleared.', '会话已清空。'))}>{copy(language, 'Clear conversations', '清空会话')}</button>
            <button className="button ghost danger" onClick={() => dangerous(copy(language, 'Clear all safety receipts?', '清空全部安全回执？'), clearReceipts, copy(language, 'Safety receipts cleared.', '安全回执已清空。'))}>{copy(language, 'Clear safety receipts', '清空安全回执')}</button>
            <button className="button ghost danger" onClick={() => dangerous(copy(language, 'Clear the provider credential?', '清除 Provider 凭证？'), clearProviderCredentials, copy(language, 'Credential cleared.', '凭证已清除。'))}>{copy(language, 'Clear provider credential', '清除 Provider 凭证')}</button>
          </div>
        </section>

        <section className="settings-card">
          <h2>{copy(language, 'Advanced', '高级')}</h2>
          <Toggle checked={settings.experimentalFeatures} onChange={(v) => update('experimentalFeatures', v)} title={copy(language, 'Experimental features', '实验功能')} detail={copy(language, 'Keep disabled for public demos.', '公开演示时建议关闭。')} />
          <Toggle checked={settings.debugMode} onChange={(v) => update('debugMode', v)} title={copy(language, 'Debug mode', '调试模式')} detail={copy(language, 'Never prints provider secrets or unredacted payloads.', '即使开启也不会打印 Provider 密钥或未脱敏请求。')} />
          <button className="button danger full" onClick={() => dangerous(copy(language, 'Reset the entire application? All local settings, credentials, history and receipts will be removed.', '确定重置整个应用吗？本地设置、凭证、历史和回执都会被删除。'), () => { resetApplication(); window.location.reload(); }, copy(language, 'Application reset.', '应用已重置。'))}>{copy(language, 'Reset application', '重置应用')}</button>
        </section>
      </div>
    </main>
  );
}

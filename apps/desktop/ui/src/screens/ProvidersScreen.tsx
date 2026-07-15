import { useEffect, useState } from 'react';
import type { Language, ProviderConfig, ProviderStatus } from '../app/types';
import {
  clearProviderCredentials,
  loadProviderConfig,
  loadProviderStatus,
  loadSettings,
  nowIso,
  saveProviderConfig,
  saveProviderStatus,
} from '../app/store';
import { testDeepSeekConnection } from '../features/providers/providerClient';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

export function ProvidersScreen({ language, onDone }: { language: Language; onDone: () => void }) {
  const [config, setConfig] = useState<ProviderConfig>(() => loadProviderConfig());
  const [status, setStatus] = useState<ProviderStatus>(() => loadProviderStatus());
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const sync = () => {
      setConfig(loadProviderConfig());
      setStatus(loadProviderStatus());
    };
    window.addEventListener('tokenfence:provider-updated', sync);
    return () => window.removeEventListener('tokenfence:provider-updated', sync);
  }, []);

  const save = () => {
    saveProviderConfig(config);
    const next: ProviderStatus = config.apiKey.trim() ? { state: 'configured' } : { state: 'not-configured' };
    saveProviderStatus(next);
    setStatus(next);
    toast.show(copy(language, 'Provider settings saved locally.', 'Provider 设置已保存在本机。'), 'success');
  };

  const test = async () => {
    if (!config.apiKey.trim()) {
      toast.show(copy(language, 'Enter a DeepSeek API key first.', '请先填写 DeepSeek API Key。'), 'warning');
      return;
    }
    setBusy(true);
    saveProviderConfig(config);
    const result = await testDeepSeekConnection(config, loadSettings().requestTimeoutMs);
    const next: ProviderStatus = result.ok
      ? {
          state: 'connected',
          checkedAt: nowIso(),
          latencyMs: result.latencyMs,
          model: result.model ?? config.model,
          message: 'Connection verified',
        }
      : {
          state: 'error',
          checkedAt: nowIso(),
          message: result.errorMessage ?? 'Connection failed',
        };
    saveProviderStatus(next);
    setStatus(next);
    setBusy(false);
    toast.show(
      result.ok
        ? copy(language, 'DeepSeek connection verified.', 'DeepSeek 连接验证成功。')
        : copy(language, next.message ?? 'Connection failed.', `连接失败：${next.message ?? '请检查网络和 Key。'}`),
      result.ok ? 'success' : 'error',
    );
  };

  const clear = () => {
    if (!window.confirm(copy(language, 'Clear the saved API credential?', '确定清除已保存的 API 凭证吗？'))) return;
    clearProviderCredentials();
    setConfig(loadProviderConfig());
    setStatus({ state: 'not-configured' });
    toast.show(copy(language, 'Credential cleared.', '凭证已清除。'), 'success');
  };

  const stateLabel = {
    'not-configured': copy(language, 'Not configured', '未配置'),
    configured: copy(language, 'Configured — test required', '已配置—需要测试'),
    connected: copy(language, 'Connected', '已连接'),
    error: copy(language, 'Connection failed', '连接失败'),
  }[status.state];

  return (
    <main className="page-scroll">
      <div className="page-header">
        <div>
          <span className="eyebrow">AI PROVIDER</span>
          <h1>{copy(language, 'Connect DeepSeek', '连接 DeepSeek')}</h1>
          <p>{copy(language, 'Provider requests leave the renderer through the Tauri desktop backend, not a browser fetch.', 'Provider 请求通过 Tauri 桌面后端发出，不再由浏览器前端直连。')}</p>
        </div>
        <div className={`status-pill status-${status.state}`}><span />{stateLabel}</div>
      </div>

      <section className="provider-card">
        <div className="provider-card-head">
          <div className="provider-logo">DS</div>
          <div>
            <h2>DeepSeek</h2>
            <p>https://api.deepseek.com/chat/completions</p>
          </div>
          <div className="provider-state-detail">
            {status.checkedAt && <small>{copy(language, 'Last checked', '上次检测')} {new Date(status.checkedAt).toLocaleString()}</small>}
            {status.latencyMs != null && <strong>{status.latencyMs} ms</strong>}
          </div>
        </div>

        <div className="form-grid">
          <label className="field field-wide">
            <span>API Key</span>
            <div className="input-with-action">
              <input
                type={showKey ? 'text' : 'password'}
                value={config.apiKey}
                onChange={(event) => setConfig({ ...config, apiKey: event.target.value })}
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-…"
              />
              <button type="button" className="icon-button" onClick={() => setShowKey((value) => !value)} aria-label="Toggle API key visibility">
                <Icon name={showKey ? 'eyeOff' : 'eye'} />
              </button>
            </div>
          </label>

          <label className="field">
            <span>{copy(language, 'Model', '模型')}</span>
            <select value={config.model} onChange={(event) => setConfig({ ...config, model: event.target.value })}>
              <option value="deepseek-v4-flash">deepseek-v4-flash</option>
              <option value="deepseek-v4-pro">deepseek-v4-pro</option>
            </select>
          </label>

          <label className="field">
            <span>{copy(language, 'Endpoint', '接口地址')}</span>
            <input value={config.baseUrl} disabled />
          </label>

          <label className="toggle-row field-wide">
            <input
              type="checkbox"
              checked={config.demoMode}
              onChange={(event) => setConfig({ ...config, demoMode: event.target.checked })}
            />
            <span>
              <strong>{copy(language, 'Local demo mode', '本地演示模式')}</strong>
              <small>{copy(language, 'Generate a local safety demonstration without contacting DeepSeek.', '不连接 DeepSeek，仅在本地生成安全流程演示回复。')}</small>
            </span>
          </label>
        </div>

        {status.state === 'error' && <div className="inline-alert error"><Icon name="alert" />{status.message}</div>}

        <div className="privacy-note">
          <Icon name="lock" />
          <div>
            <strong>{copy(language, 'Stored locally on this device', '仅保存在此设备上')}</strong>
            <p>{copy(language, 'The key is kept in the app’s local storage. TokenFence does not upload it, but this build does not claim OS keychain encryption.', 'Key 保存在应用本地存储中，TokenFence 不会上传；当前版本不虚假声称使用了系统钥匙串加密。')}</p>
          </div>
        </div>

        <div className="button-row">
          <button className="button secondary" onClick={save}>{copy(language, 'Save', '保存')}</button>
          <button className="button primary" onClick={test} disabled={busy}>{busy ? copy(language, 'Testing…', '测试中…') : copy(language, 'Test connection', '测试连接')}</button>
          <button className="button ghost danger" onClick={clear}>{copy(language, 'Clear credential', '清除凭证')}</button>
          {(status.state === 'connected' || config.demoMode) && <button className="button ghost push-right" onClick={onDone}>{copy(language, 'Return to workspace', '返回工作台')} <Icon name="chevron" size={16} /></button>}
        </div>
      </section>
    </main>
  );
}

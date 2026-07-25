import { useEffect, useMemo, useState } from 'react';
import type { Language, ProviderId, ProviderProfile, ProviderStatus } from '../app/types';
import { PROVIDERS, providerDefinition } from '../app/providerRegistry';
import {
  clearProviderStatus,
  deleteProviderProfile,
  loadActiveProviderId,
  loadProviderProfiles,
  loadProviderStatus,
  makeId,
  nowIso,
  saveActiveProviderId,
  saveProviderProfile,
  saveProviderStatus,
} from '../app/store';
import { deleteProviderSecret, saveProviderSecret } from '../features/platform/desktopClient';
import { testProviderConnection } from '../features/providers/providerClient';
import { loadSettings } from '../app/store';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

function makeProfile(providerId: ProviderId): ProviderProfile {
  const definition = providerDefinition(providerId);
  const timestamp = nowIso();
  return {
    id: `${providerId}-${makeId('profile').slice(-8)}`,
    providerId,
    displayName: definition.name,
    apiStyle: definition.apiStyle,
    baseUrl: definition.defaultBaseUrl,
    model: definition.defaultModel,
    enabled: true,
    credentialStored: false,
    apiKey: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function ProvidersScreen({ language, onDone }: { language: Language; onDone: () => void }) {
  const [profiles, setProfiles] = useState<ProviderProfile[]>(() => loadProviderProfiles());
  const [selectedId, setSelectedId] = useState(() => loadActiveProviderId());
  const [draft, setDraft] = useState<ProviderProfile>(() => loadProviderProfiles().find((profile) => profile.id === loadActiveProviderId()) ?? loadProviderProfiles()[0]);
  const [status, setStatus] = useState<ProviderStatus>(() => loadProviderStatus(selectedId));
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const toast = useToast();
  const definition = providerDefinition(draft.providerId);

  const configuredCount = useMemo(() => profiles.filter((profile) => profile.providerId === 'local-demo' || profile.credentialStored || !providerDefinition(profile.providerId).requiresCredential).length, [profiles]);

  const reload = (nextSelected = selectedId) => {
    const nextProfiles = loadProviderProfiles();
    const selected = nextProfiles.find((profile) => profile.id === nextSelected) ?? nextProfiles[0];
    setProfiles(nextProfiles);
    setSelectedId(selected.id);
    setDraft({ ...selected, apiKey: '' });
    setStatus(loadProviderStatus(selected.id));
  };

  useEffect(() => {
    const update = () => reload(selectedId);
    window.addEventListener('tokenfence:providers-updated', update);
    return () => window.removeEventListener('tokenfence:providers-updated', update);
  }, [selectedId]);

  const choose = (id: string) => {
    const profile = profiles.find((item) => item.id === id);
    if (!profile) return;
    setSelectedId(id);
    setDraft({ ...profile, apiKey: '' });
    setStatus(loadProviderStatus(id));
  };

  const addProvider = (providerId: ProviderId) => {
    const profile = makeProfile(providerId);
    saveProviderProfile(profile);
    saveActiveProviderId(profile.id);
    setCatalogOpen(false);
    reload(profile.id);
  };

  const persist = async (): Promise<ProviderProfile | null> => {
    const requiresCredential = definition.requiresCredential;
    let credentialStored = draft.credentialStored;
    if (draft.apiKey.trim()) {
      const result = await saveProviderSecret(draft.id, draft.apiKey.trim());
      if (!result.ok) {
        toast.show(copy(language, result.message ?? 'Could not save the API credential.', `无法安全保存 API Key：${result.message ?? '系统凭证库不可用。'}`), 'error');
        return null;
      }
      credentialStored = true;
    }
    const next = {
      ...draft,
      apiKey: '',
      credentialStored: requiresCredential ? credentialStored : false,
      updatedAt: nowIso(),
    };
    saveProviderProfile(next);
    saveActiveProviderId(next.id);
    setDraft(next);
    return next;
  };

  const save = async () => {
    setBusy(true);
    const next = await persist();
    setBusy(false);
    if (!next) return;
    const nextState: ProviderStatus = next.providerId === 'local-demo'
      ? { state: 'connected', checkedAt: nowIso(), model: next.model, message: 'Local sandbox ready' }
      : definition.requiresCredential && !next.credentialStored
        ? { state: 'not-configured' }
        : { state: 'configured', message: 'Saved — run connection test' };
    saveProviderStatus(next.id, nextState);
    setStatus(nextState);
    reload(next.id);
    toast.show(copy(language, `${next.displayName} saved and selected as the active provider.`, `${next.displayName} 已保存并设为当前模型服务。`), 'success');
  };

  const test = async () => {
    setBusy(true);
    const next = await persist();
    if (!next) {
      setBusy(false);
      return;
    }
    const result = await testProviderConnection(next, loadSettings().requestTimeoutMs);
    const nextStatus: ProviderStatus = result.ok
      ? { state: 'connected', checkedAt: nowIso(), latencyMs: result.latencyMs, model: result.model ?? next.model, message: 'Connection verified' }
      : { state: 'error', checkedAt: nowIso(), message: result.errorMessage ?? 'Connection failed' };
    saveProviderStatus(next.id, nextStatus);
    setStatus(nextStatus);
    setBusy(false);
    reload(next.id);
    toast.show(result.ok ? copy(language, 'Connection verified and selected for the workspace.', '连接成功，已用于工作台。') : copy(language, nextStatus.message ?? 'Connection failed.', `连接失败：${nextStatus.message ?? '请检查接口与凭证。'}`), result.ok ? 'success' : 'error');
  };

  const clearCredential = async () => {
    if (!window.confirm(copy(language, 'Clear this provider credential?', '确定清除此模型服务的凭证吗？'))) return;
    setBusy(true);
    const result = await deleteProviderSecret(draft.id);
    setBusy(false);
    if (!result.ok) {
      toast.show(copy(language, result.message ?? 'Could not clear credential.', `无法清除凭证：${result.message ?? '未知错误'}`), 'error');
      return;
    }
    const next = { ...draft, apiKey: '', credentialStored: false, updatedAt: nowIso() };
    saveProviderProfile(next);
    clearProviderStatus(next.id);
    reload(next.id);
    toast.show(copy(language, 'Credential removed from the operating-system store.', '凭证已从系统凭证库移除。'), 'success');
  };

  const remove = async () => {
    if (draft.id === 'local-sandbox') return;
    if (!window.confirm(copy(language, `Remove ${draft.displayName}?`, `删除 ${draft.displayName} 配置吗？`))) return;
    await deleteProviderSecret(draft.id);
    deleteProviderProfile(draft.id);
    reload(loadActiveProviderId());
  };

  const stateLabel = {
    'not-configured': copy(language, 'Not configured', '未配置'),
    configured: copy(language, 'Saved', '已保存'),
    connected: copy(language, 'Connected', '已连接'),
    error: copy(language, 'Needs attention', '需要处理'),
  }[status.state];

  return (
    <main className="modern-page provider-page">
      <header className="compact-page-header">
        <div>
          <span className="section-kicker">PROVIDER MESH</span>
          <h1>{copy(language, 'Model connections', '模型服务')}</h1>
          <p>{copy(language, 'Connect cloud and local models once, then route every task to the right one.', '一次连接云端与本地模型，再把不同任务路由给最合适的模型。')}</p>
        </div>
        <div className="header-actions">
          <span className="metric-chip"><strong>{configuredCount}</strong>{copy(language, ' ready', ' 个可用')}</span>
          <button className="button primary" onClick={() => setCatalogOpen(true)}><Icon name="plus" />{copy(language, 'Add provider', '添加模型服务')}</button>
        </div>
      </header>

      <div className="provider-layout">
        <aside className="provider-list-panel">
          <div className="panel-title"><span>{copy(language, 'Connections', '连接配置')}</span><small>{profiles.length}</small></div>
          <div className="provider-profile-list">
            {profiles.map((profile) => {
              const def = providerDefinition(profile.providerId);
              const profileStatus = loadProviderStatus(profile.id);
              const active = loadActiveProviderId() === profile.id;
              return (
                <button key={profile.id} className={`provider-profile-item ${selectedId === profile.id ? 'selected' : ''}`} onClick={() => choose(profile.id)}>
                  <span className="provider-avatar" style={{ '--provider-accent': def.accent } as React.CSSProperties}>{def.shortName}</span>
                  <span className="provider-profile-copy">
                    <strong>{profile.displayName}</strong>
                    <small>{profile.model}</small>
                  </span>
                  <span className={`mini-status status-${profileStatus.state}`} />
                  {active && <em>{copy(language, 'ACTIVE', '当前')}</em>}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="provider-editor-card">
          <div className="provider-editor-head">
            <div className="provider-avatar large" style={{ '--provider-accent': definition.accent } as React.CSSProperties}>{definition.shortName}</div>
            <div>
              <div className="title-with-status"><h2>{draft.displayName}</h2><span className={`status-pill status-${status.state}`}><span />{stateLabel}</span></div>
              <p>{copy(language, definition.descriptionEn, definition.descriptionZh)}</p>
            </div>
            <button className="icon-button push-right" onClick={() => saveActiveProviderId(draft.id)} title={copy(language, 'Use in workspace', '在工作台使用')}><Icon name="check" /></button>
          </div>

          <div className="provider-capability-row">
            {definition.capabilities.local && <span><Icon name="cpu" />Local</span>}
            {definition.capabilities.vision && <span><Icon name="image" />Vision</span>}
            {definition.capabilities.tools && <span><Icon name="plug" />Tools</span>}
            {definition.capabilities.reasoning && <span><Icon name="brain" />Reasoning</span>}
            {definition.capabilities.files && <span><Icon name="file" />Files</span>}
          </div>

          <div className="form-grid provider-form">
            <label className="field">
              <span>{copy(language, 'Connection name', '连接名称')}</span>
              <input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} />
            </label>
            <label className="field">
              <span>{copy(language, 'Model', '模型')}</span>
              <input list={`models-${draft.providerId}`} value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} spellCheck={false} />
              <datalist id={`models-${draft.providerId}`}>{definition.modelSuggestions.map((model) => <option key={model} value={model} />)}</datalist>
            </label>
            <label className="field field-wide">
              <span>{copy(language, 'Base URL', '接口地址')}</span>
              <input value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} spellCheck={false} disabled={draft.providerId === 'local-demo'} />
            </label>
            {definition.requiresCredential && (
              <label className="field field-wide">
                <span>API Key</span>
                <div className="input-with-action">
                  <input type={showKey ? 'text' : 'password'} value={draft.apiKey} onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })} autoComplete="off" spellCheck={false} placeholder={draft.credentialStored ? copy(language, 'Stored in Keychain — type to replace', '已存入钥匙串—输入新 Key 可替换') : 'sk-…'} />
                  <button type="button" className="icon-button" onClick={() => setShowKey((value) => !value)}><Icon name={showKey ? 'eyeOff' : 'eye'} /></button>
                </div>
              </label>
            )}
          </div>

          {status.state === 'error' && <div className="inline-alert error"><Icon name="alert" />{status.message}</div>}
          <div className="secure-note"><Icon name="lock" /><div><strong>{copy(language, 'Secrets stay in the operating-system credential store', '密钥仅保存在操作系统凭证库')}</strong><p>{copy(language, 'Provider configuration is stored locally without the API key. Selecting this provider no longer switches the workspace into Local Sandbox.', 'Provider 配置会保存到本地，但 API Key 不会写入 localStorage；保存后工作台也不会再自动切换成本地演示。')}</p></div></div>

          <div className="button-row provider-actions">
            <button className="button secondary" onClick={save} disabled={busy}><Icon name="lock" />{copy(language, 'Save and select', '保存并设为当前')}</button>
            <button className="button primary" onClick={test} disabled={busy}>{busy ? copy(language, 'Testing…', '测试中…') : copy(language, 'Test connection', '测试连接')}</button>
            {definition.requiresCredential && <button className="button ghost danger" onClick={clearCredential} disabled={busy}>{copy(language, 'Clear key', '清除 Key')}</button>}
            {draft.id !== 'local-sandbox' && <button className="icon-button danger" onClick={remove}><Icon name="trash" /></button>}
            {(status.state === 'connected' || draft.providerId === 'local-demo') && <button className="button ghost push-right" onClick={onDone}>{copy(language, 'Open workspace', '进入工作台')}<Icon name="chevron" size={15} /></button>}
          </div>
        </section>
      </div>

      {catalogOpen && (
        <div className="modal-backdrop" onMouseDown={() => setCatalogOpen(false)}>
          <section className="provider-catalog" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span className="section-kicker">PROVIDER CATALOG</span><h2>{copy(language, 'Add a model connection', '添加模型连接')}</h2></div><button className="icon-button" onClick={() => setCatalogOpen(false)}><Icon name="x" /></button></header>
            <div className="provider-catalog-grid">
              {PROVIDERS.filter((item) => item.id !== 'local-demo').map((item) => (
                <button key={item.id} onClick={() => addProvider(item.id)}>
                  <span className="provider-avatar" style={{ '--provider-accent': item.accent } as React.CSSProperties}>{item.shortName}</span>
                  <strong>{item.name}</strong>
                  <p>{copy(language, item.descriptionEn, item.descriptionZh)}</p>
                  <div>{item.capabilities.vision && <span>Vision</span>}{item.capabilities.tools && <span>Tools</span>}{item.capabilities.local && <span>Local</span>}</div>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

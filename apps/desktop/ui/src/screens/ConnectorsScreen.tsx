import { useMemo, useState } from 'react';
import type { Language, McpReply, ToolConnectorProfile } from '../app/types';
import { deleteToolConnector, loadToolConnectors, makeId, nowIso, saveToolConnector } from '../app/store';
import { callMcp, deleteConnectorSecret, saveConnectorSecret } from '../features/connectors/mcpClient';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

function emptyConnector(): ToolConnectorProfile {
  const now = nowIso();
  return {
    id: makeId('connector'),
    name: 'MCP Connector',
    url: 'http://127.0.0.1:3001/mcp',
    enabled: true,
    requiresCredential: false,
    credentialStored: false,
    token: '',
    createdAt: now,
    updatedAt: now,
  };
}

export function ConnectorsScreen({ language }: { language: Language }) {
  const [connectors, setConnectors] = useState<ToolConnectorProfile[]>(() => loadToolConnectors());
  const [selectedId, setSelectedId] = useState(() => connectors[0]?.id ?? '');
  const [draft, setDraft] = useState<ToolConnectorProfile>(() => connectors[0] ?? emptyConnector());
  const [method, setMethod] = useState<'initialize' | 'tools/list' | 'resources/list' | 'prompts/list' | 'tools/call'>('tools/list');
  const [paramsText, setParamsText] = useState('{}');
  const [result, setResult] = useState<McpReply | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const selected = useMemo(() => connectors.find((item) => item.id === selectedId), [connectors, selectedId]);

  const select = (connector: ToolConnectorProfile) => {
    setSelectedId(connector.id);
    setDraft({ ...connector, token: '' });
    setResult(null);
  };

  const create = () => {
    const next = emptyConnector();
    setDraft(next);
    setSelectedId(next.id);
    setResult(null);
  };

  const save = async () => {
    if (!draft.name.trim() || !draft.url.trim()) return toast.show(copy(language, 'Name and endpoint are required.', '名称和接口地址不能为空。'), 'warning');
    let credentialStored = draft.credentialStored;
    if (draft.token.trim()) {
      const secret = await saveConnectorSecret(draft.id, draft.token.trim());
      if (!secret.ok) return toast.show(secret.errorMessage ?? 'Credential store failed.', 'error');
      credentialStored = true;
    }
    const next = { ...draft, token: '', credentialStored, updatedAt: nowIso() };
    saveToolConnector(next);
    const all = loadToolConnectors();
    setConnectors(all);
    setDraft(next);
    setSelectedId(next.id);
    toast.show(copy(language, 'Connector saved locally.', '连接器已保存在本地。'), 'success');
  };

  const remove = async () => {
    if (!selected || !window.confirm(copy(language, 'Delete this connector and its stored credential?', '删除此连接器及其已保存凭证？'))) return;
    await deleteConnectorSecret(selected.id);
    deleteToolConnector(selected.id);
    const all = loadToolConnectors();
    setConnectors(all);
    const next = all[0] ?? emptyConnector();
    setSelectedId(next.id);
    setDraft(next);
    setResult(null);
  };

  const run = async () => {
    let params: unknown;
    try { params = JSON.parse(paramsText || '{}'); }
    catch { return toast.show(copy(language, 'Parameters must be valid JSON.', '参数必须是有效 JSON。'), 'warning'); }
    const confirmed = method !== 'tools/call' || window.confirm(copy(language, 'Run this reviewed MCP tool call?', '执行这次已审查的 MCP 工具调用？'));
    if (!confirmed) return;
    setBusy(true);
    const response = await callMcp(draft, method, params, confirmed);
    setResult(response);
    setBusy(false);
    toast.show(response.ok ? copy(language, 'Connector request completed.', '连接器请求已完成。') : (response.errorMessage ?? 'Connector request failed.'), response.ok ? 'success' : 'error');
  };

  return <main className="modern-page connectors-page">
    <header className="compact-page-header">
      <div><span className="section-kicker">MCP · TOOL CONNECTORS</span><h1>{copy(language, 'Reviewed tool connections', '受审查的工具连接')}</h1><p>{copy(language, 'Connect HTTPS or localhost MCP JSON-RPC endpoints. Tool calls always require explicit approval.', '连接 HTTPS 或本机 MCP JSON-RPC 接口；工具调用始终需要明确确认。')}</p></div>
      <div className="header-actions"><button className="button secondary" onClick={create}><Icon name="plus" />{copy(language, 'New connector', '新建连接器')}</button><button className="button primary" onClick={() => void save()}><Icon name="check" />{copy(language, 'Save', '保存')}</button></div>
    </header>

    <div className="connector-layout">
      <aside className="connector-list">
        {connectors.map((connector) => <button key={connector.id} className={selectedId === connector.id ? 'selected' : ''} onClick={() => select(connector)}><Icon name="plug" /><span><strong>{connector.name}</strong><small>{connector.url}</small></span><i className={connector.enabled ? 'ready' : ''} /></button>)}
        {!connectors.length && <div className="file-empty-small"><Icon name="plug" /><p>{copy(language, 'Create your first MCP connector.', '创建第一个 MCP 连接器。')}</p></div>}
      </aside>

      <section className="connector-editor">
        <div className="connector-fields">
          <label><span>{copy(language, 'Name', '名称')}</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          <label><span>{copy(language, 'Endpoint', '接口地址')}</span><input value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} placeholder="https://example.com/mcp" /></label>
          <label><span>{copy(language, 'Bearer token', 'Bearer Token')}</span><input type="password" value={draft.token} onChange={(event) => setDraft((current) => ({ ...current, token: event.target.value }))} placeholder={draft.credentialStored ? copy(language, 'Stored in Keychain', '已保存到钥匙串') : copy(language, 'Optional', '可选')} /></label>
          <label className="connector-toggle"><input type="checkbox" checked={draft.requiresCredential} onChange={(event) => setDraft((current) => ({ ...current, requiresCredential: event.target.checked }))} /><span>{copy(language, 'Credential required', '必须提供凭证')}</span></label>
          <label className="connector-toggle"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} /><span>{copy(language, 'Enabled', '启用')}</span></label>
        </div>

        <div className="connector-console">
          <div className="connector-call-row"><select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}><option value="initialize">initialize</option><option value="tools/list">tools/list</option><option value="resources/list">resources/list</option><option value="prompts/list">prompts/list</option><option value="tools/call">tools/call</option></select><button className="button primary" disabled={busy || !draft.enabled} onClick={() => void run()}><Icon name="rocket" />{busy ? copy(language, 'Running…', '执行中…') : copy(language, 'Run reviewed request', '执行已审查请求')}</button></div>
          <textarea value={paramsText} onChange={(event) => setParamsText(event.target.value)} spellCheck={false} />
          <pre>{result ? JSON.stringify(result, null, 2) : copy(language, 'Connector results appear here. Streamable HTTP/SSE session management remains server-dependent in this Beta.', '连接结果将在此显示。当前 Beta 的 Streamable HTTP/SSE 会话管理仍取决于服务端实现。')}</pre>
        </div>
        <button className="button danger" onClick={() => void remove()} disabled={!selected}>{copy(language, 'Delete connector', '删除连接器')}</button>
      </section>
    </div>
  </main>;
}

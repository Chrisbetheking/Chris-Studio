import { useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation, Language } from '../app/types';
import { clearConversations, deleteConversation, loadConversations, renameConversation } from '../app/store';
import { Icon } from '../components/Icon';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

export function HistoryScreen({ language, onOpen }: { language: Language; onOpen: (id: string) => void }) {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [draftTitle, setDraftTitle] = useState('');
  const cancelledBlur = useRef(false);

  useEffect(() => {
    const reload = () => setConversations(loadConversations());
    window.addEventListener('tokenfence:history-updated', reload);
    return () => window.removeEventListener('tokenfence:history-updated', reload);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? conversations.filter((item) => `${item.title} ${item.provider} ${item.model}`.toLowerCase().includes(needle))
      : conversations;
  }, [conversations, query]);

  const beginRename = (conversation: Conversation) => {
    cancelledBlur.current = false;
    setEditingId(conversation.id);
    setDraftTitle(conversation.title);
  };
  const cancelRename = () => { cancelledBlur.current = true; setEditingId(undefined); setDraftTitle(''); };
  const commitRename = (conversation: Conversation) => {
    if (cancelledBlur.current) { cancelledBlur.current = false; return; }
    const title = draftTitle.trim();
    if (title && title !== conversation.title) renameConversation(conversation.id, title);
    setEditingId(undefined);
    setDraftTitle('');
  };
  const remove = (id: string) => {
    if (!window.confirm(copy(language, 'Delete this task?', '删除这条任务吗？'))) return;
    deleteConversation(id);
  };

  return <main className="modern-page history-page-modern">
    <header className="compact-page-header"><div><span className="section-kicker">LOCAL ARCHIVE</span><h1>{copy(language, 'Protected task history', '受保护任务历史')}</h1><p>{copy(language, 'Only redacted prompts, model replies and safety metadata are retained.', '仅保留脱敏提示词、模型回复与安全元数据。')}</p></div><div className="header-actions"><button className="button danger ghost" onClick={() => { if (window.confirm(copy(language, 'Clear all history?', '清空全部历史吗？'))) clearConversations(); }}><Icon name="trash" />{copy(language, 'Clear all', '清空全部')}</button></div></header>
    <label className="search-bar-modern"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy(language, 'Search tasks, provider or model', '搜索任务、Provider 或模型')} /><span>{filtered.length}</span></label>
    {filtered.length ? <section className="history-grid-modern">{filtered.map((conversation) => <article key={conversation.id} className={editingId === conversation.id ? 'is-editing' : ''}>
      {editingId === conversation.id ? <div className="history-card-main history-card-editor-shell">
        <div className="history-card-icon"><Icon name={conversation.mode === 'agent' ? 'bot' : 'workspace'} /></div>
        <div>
          <div className="history-card-title">
            <input
              className="history-title-editor"
              autoFocus
              value={draftTitle}
              maxLength={120}
              aria-label={copy(language, 'Conversation title', '对话名称')}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={() => commitRename(conversation)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitRename(conversation); } if (event.key === 'Escape') { event.preventDefault(); cancelRename(); } }}
            />
            <span className={`risk-text risk-${conversation.riskSummary}`}>{conversation.riskSummary}</span>
          </div>
          <p>{conversation.messages[conversation.messages.length - 1]?.content.slice(0, 180) || copy(language, 'Empty task', '空任务')}</p>
          <footer><span>{new Date(conversation.updatedAt).toLocaleString()}</span><span>{conversation.provider}</span><span>{conversation.model}</span>{conversation.mode === 'agent' && <span>Agent</span>}</footer>
        </div>
      </div> : <button className="history-card-main" type="button" onClick={() => onOpen(conversation.id)} onDoubleClick={(event) => { event.preventDefault(); beginRename(conversation); }}>
        <div className="history-card-icon"><Icon name={conversation.mode === 'agent' ? 'bot' : 'workspace'} /></div>
        <div>
          <div className="history-card-title"><strong title={copy(language, `${conversation.title} — double-click to rename`, `${conversation.title} — 双击重命名`)}>{conversation.title}</strong><span className={`risk-text risk-${conversation.riskSummary}`}>{conversation.riskSummary}</span></div>
          <p>{conversation.messages[conversation.messages.length - 1]?.content.slice(0, 180) || copy(language, 'Empty task', '空任务')}</p>
          <footer><span>{new Date(conversation.updatedAt).toLocaleString()}</span><span>{conversation.provider}</span><span>{conversation.model}</span>{conversation.mode === 'agent' && <span>Agent</span>}</footer>
        </div>
      </button>}
      <div className="history-card-actions"><button type="button" onClick={() => beginRename(conversation)} title={copy(language, 'Rename', '重命名')}><Icon name="edit" /></button><button type="button" onClick={() => remove(conversation.id)} title={copy(language, 'Delete', '删除')}><Icon name="trash" /></button></div>
    </article>)}</section> : <section className="empty-modern"><Icon name="history" size={34} /><h2>{copy(language, 'No protected tasks yet', '还没有受保护任务')}</h2><p>{copy(language, 'Reviewed conversations and agent runs will appear here.', '完成审查的对话和 Agent 任务会显示在这里。')}</p></section>}
  </main>;
}

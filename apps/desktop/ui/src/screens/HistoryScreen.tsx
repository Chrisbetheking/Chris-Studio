import { useEffect, useMemo, useState } from 'react';
import type { Conversation, Language } from '../app/types';
import { clearConversations, deleteConversation, loadConversations, saveConversation } from '../app/store';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

export function HistoryScreen({ language, onOpen }: { language: Language; onOpen: (id: string) => void }) {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [query, setQuery] = useState('');
  const toast = useToast();

  useEffect(() => {
    const reload = () => setConversations(loadConversations());
    window.addEventListener('tokenfence:history-updated', reload);
    return () => window.removeEventListener('tokenfence:history-updated', reload);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return conversations;
    return conversations.filter((item) => `${item.title} ${item.provider} ${item.model}`.toLocaleLowerCase().includes(needle));
  }, [conversations, query]);

  const rename = (conversation: Conversation) => {
    const title = window.prompt(copy(language, 'Conversation title', '会话标题'), conversation.title)?.trim();
    if (!title) return;
    saveConversation({ ...conversation, title, updatedAt: new Date().toISOString() });
    toast.show(copy(language, 'Conversation renamed.', '会话已重命名。'), 'success');
  };

  const remove = (id: string) => {
    if (!window.confirm(copy(language, 'Delete this conversation?', '确定删除这条会话吗？'))) return;
    deleteConversation(id);
    toast.show(copy(language, 'Conversation deleted.', '会话已删除。'), 'success');
  };

  const clearAll = () => {
    if (!window.confirm(copy(language, 'Delete all local conversation history? This cannot be undone.', '确定清空全部本地会话吗？此操作无法撤销。'))) return;
    clearConversations();
    setConversations([]);
    toast.show(copy(language, 'History cleared.', '历史记录已清空。'), 'success');
  };

  return (
    <main className="page-scroll">
      <div className="page-header history-header">
        <div>
          <span className="eyebrow">LOCAL HISTORY</span>
          <h1>{copy(language, 'Conversation history', '会话历史')}</h1>
          <p>{copy(language, 'Only redacted prompts and model replies are retained. Raw detected secrets are not written to history.', '这里只保留脱敏后的提示词与模型回复，检测到的原始敏感内容不会写入历史。')}</p>
        </div>
        <button className="button ghost danger" onClick={clearAll} disabled={!conversations.length}><Icon name="trash" />{copy(language, 'Clear all', '清空全部')}</button>
      </div>

      <div className="history-toolbar">
        <Icon name="search" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy(language, 'Search conversations, providers or models', '搜索会话、Provider 或模型')} />
        <span>{filtered.length}</span>
      </div>

      {!filtered.length ? (
        <section className="empty-card">
          <Icon name="history" size={32} />
          <h2>{copy(language, 'No saved conversations', '暂无会话记录')}</h2>
          <p>{copy(language, 'Safe conversations will appear here after the first successful review and send.', '完成首次安全审查并发送后，会话会显示在这里。')}</p>
        </section>
      ) : (
        <section className="history-list">
          {filtered.map((conversation) => (
            <article className="history-item" key={conversation.id}>
              <button className="history-main" onClick={() => onOpen(conversation.id)}>
                <div className="history-icon"><Icon name="workspace" /></div>
                <div>
                  <h3>{conversation.title}</h3>
                  <p>{conversation.messages[conversation.messages.length - 1]?.content.slice(0, 150) || copy(language, 'Empty conversation', '空会话')}</p>
                  <div className="history-meta">
                    <span>{new Date(conversation.updatedAt).toLocaleString()}</span>
                    <span>{conversation.provider}</span>
                    <span>{conversation.model}</span>
                    <span className={`risk-text risk-${conversation.riskSummary}`}>{conversation.riskSummary}</span>
                  </div>
                </div>
              </button>
              <div className="history-actions">
                <button className="icon-button" onClick={() => rename(conversation)} aria-label="Rename"><Icon name="edit" /></button>
                <button className="icon-button danger" onClick={() => remove(conversation.id)} aria-label="Delete"><Icon name="trash" /></button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

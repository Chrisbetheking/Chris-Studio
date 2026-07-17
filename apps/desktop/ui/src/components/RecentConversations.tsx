import { useEffect, useState } from 'react';
import type { Conversation, Language } from '../app/types';
import { deleteConversation, loadConversations, saveConversation } from '../app/store';
import { Icon } from './Icon';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

export function RecentConversations({
  language,
  activeConversationId,
  onOpen,
  onViewAll,
}: {
  language: Language;
  activeConversationId?: string;
  onOpen: (id: string) => void;
  onViewAll: () => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations().slice(0, 8));

  useEffect(() => {
    const reload = () => setConversations(loadConversations().slice(0, 8));
    window.addEventListener('tokenfence:history-updated', reload);
    return () => window.removeEventListener('tokenfence:history-updated', reload);
  }, []);

  const rename = (conversation: Conversation) => {
    const title = window.prompt(copy(language, 'Rename conversation', '重命名对话'), conversation.title)?.trim();
    if (!title) return;
    saveConversation({ ...conversation, title, updatedAt: new Date().toISOString() });
  };

  const remove = (conversation: Conversation) => {
    if (!window.confirm(copy(language, `Delete “${conversation.title}”?`, `删除“${conversation.title}”吗？`))) return;
    deleteConversation(conversation.id);
  };

  return (
    <section className="recent-conversations" aria-label={copy(language, 'Recent conversations', '最近对话')}>
      <div className="recent-conversations-heading">
        <span>{copy(language, 'RECENT', '最近对话')}</span>
        <button type="button" onClick={onViewAll}>{copy(language, 'All', '全部')}</button>
      </div>
      <div className="recent-conversations-list">
        {conversations.length ? conversations.map((conversation) => (
          <div key={conversation.id} className={`recent-conversation-row ${activeConversationId === conversation.id ? 'active' : ''}`}>
            <button className="recent-conversation-main" type="button" onClick={() => onOpen(conversation.id)} title={conversation.title}>
              <Icon name={conversation.mode === 'agent' ? 'bot' : 'workspace'} size={14} />
              <span>{conversation.title}</span>
            </button>
            <div className="recent-conversation-actions">
              <button type="button" onClick={() => rename(conversation)} aria-label={copy(language, 'Rename', '重命名')}><Icon name="edit" size={12} /></button>
              <button type="button" onClick={() => remove(conversation)} aria-label={copy(language, 'Delete', '删除')}><Icon name="trash" size={12} /></button>
            </div>
          </div>
        )) : (
          <button className="recent-conversations-empty" type="button" onClick={onViewAll}>
            <Icon name="workspace" size={14} />
            <span>{copy(language, 'No conversations yet', '还没有对话')}</span>
          </button>
        )}
      </div>
    </section>
  );
}

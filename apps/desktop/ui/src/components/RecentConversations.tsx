import { useEffect, useRef, useState } from 'react';
import type { Conversation, Language } from '../app/types';
import { deleteConversation, loadConversations, renameConversation } from '../app/store';
import { Icon } from './Icon';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

export function RecentConversations({
  language,
  activeConversationId,
  onOpen,
  onViewAll,
  onDelete,
}: {
  language: Language;
  activeConversationId?: string;
  onOpen: (id: string) => void;
  onViewAll: () => void;
  onDelete?: (id: string) => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations().slice(0, 8));
  const [editingId, setEditingId] = useState<string>();
  const [draftTitle, setDraftTitle] = useState('');
  const cancelledBlur = useRef(false);

  useEffect(() => {
    const reload = () => setConversations(loadConversations().slice(0, 8));
    window.addEventListener('tokenfence:history-updated', reload);
    return () => window.removeEventListener('tokenfence:history-updated', reload);
  }, []);

  const beginRename = (conversation: Conversation) => {
    cancelledBlur.current = false;
    setEditingId(conversation.id);
    setDraftTitle(conversation.title);
  };

  const cancelRename = () => {
    cancelledBlur.current = true;
    setEditingId(undefined);
    setDraftTitle('');
  };

  const commitRename = (conversation: Conversation) => {
    if (cancelledBlur.current) {
      cancelledBlur.current = false;
      return;
    }
    const title = draftTitle.trim();
    if (title && title !== conversation.title) renameConversation(conversation.id, title);
    setEditingId(undefined);
    setDraftTitle('');
  };

  const remove = (conversation: Conversation) => {
    if (!window.confirm(copy(language, `Delete “${conversation.title}”?`, `删除“${conversation.title}”吗？`))) return;
    deleteConversation(conversation.id);
    onDelete?.(conversation.id);
  };

  return (
    <section className="recent-conversations" aria-label={copy(language, 'Recent conversations', '最近对话')}>
      <div className="recent-conversations-heading">
        <span>{copy(language, 'RECENT', '最近对话')}</span>
        <button type="button" onClick={onViewAll}>{copy(language, 'All', '全部')}</button>
      </div>
      <div className="recent-conversations-list">
        {conversations.length ? conversations.map((conversation) => (
          <div
            key={conversation.id}
            className={`recent-conversation-row ${activeConversationId === conversation.id ? 'active' : ''} ${editingId === conversation.id ? 'is-editing' : ''}`}
            onContextMenu={(event) => { event.preventDefault(); beginRename(conversation); }}
          >
            {editingId === conversation.id ? (
              <div className="recent-conversation-editor">
                <Icon name={conversation.mode === 'agent' ? 'bot' : 'workspace'} size={14} />
                <input
                  autoFocus
                  value={draftTitle}
                  maxLength={120}
                  aria-label={copy(language, 'Conversation title', '对话名称')}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onBlur={() => commitRename(conversation)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') { event.preventDefault(); commitRename(conversation); }
                    if (event.key === 'Escape') { event.preventDefault(); cancelRename(); }
                  }}
                />
              </div>
            ) : (
              <button
                className="recent-conversation-main"
                type="button"
                onClick={() => onOpen(conversation.id)}
                onDoubleClick={(event) => { event.preventDefault(); beginRename(conversation); }}
                title={copy(language, `${conversation.title} — double-click to rename`, `${conversation.title} — 双击重命名`)}
              >
                <Icon name={conversation.mode === 'agent' ? 'bot' : 'workspace'} size={14} />
                <span>{conversation.title}</span>
              </button>
            )}
            {editingId !== conversation.id && (
              <div className="recent-conversation-actions">
                <button type="button" onClick={() => beginRename(conversation)} aria-label={copy(language, 'Rename', '重命名')} title={copy(language, 'Rename', '重命名')}><Icon name="edit" size={12} /></button>
                <button type="button" onClick={() => remove(conversation)} aria-label={copy(language, 'Delete', '删除')} title={copy(language, 'Delete', '删除')}><Icon name="trash" size={12} /></button>
              </div>
            )}
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

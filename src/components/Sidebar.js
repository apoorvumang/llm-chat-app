import React from 'react';
import { MessageSquare, Plus, Trash2, Settings, Pencil } from 'lucide-react';
import styles from './Sidebar.module.css';

export default function Sidebar({ chats, currentChatId, onSelectChat, onNewChat, onDeleteChat, onOpenSettings, onRenameChat }) {
  const [editingChatId, setEditingChatId] = React.useState(null);
  const [editTitle, setEditTitle] = React.useState('');

  const handleEditClick = (e, chat) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditTitle(chat.title);
  };

  const handleRename = (chatId) => {
    if (editTitle.trim()) {
      onRenameChat(chatId, editTitle.trim());
    }
    setEditingChatId(null);
  };

  const handleKeyDown = (e, chatId) => {
    if (e.key === 'Enter') {
      handleRename(chatId);
    } else if (e.key === 'Escape') {
      setEditingChatId(null);
    }
  };

  return (
    <aside className={styles.sidebar}>
      <button className={styles.newChatBtn} onClick={onNewChat}>
        <Plus size={20} />
        <span>New Chat</span>
      </button>

      <div className={styles.chatList}>
        <div className={styles.sectionTitle}>Previous Chats</div>
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`${styles.chatItem} ${chat.id === currentChatId ? styles.active : ''}`}
            onClick={() => onSelectChat(chat.id)}
          >
            <MessageSquare size={18} className={styles.icon} />
            {editingChatId === chat.id ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => handleRename(chat.id)}
                onKeyDown={(e) => handleKeyDown(e, chat.id)}
                autoFocus
                className={styles.editInput}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className={styles.chatTitle}>{chat.title || 'New Chat'}</span>
            )}
            <div className={styles.chatActions}>
              <button
                className={styles.editBtn}
                onClick={(e) => handleEditClick(e, chat)}
                title="Edit title"
              >
                <Pencil size={14} />
              </button>
              <button
                className={styles.deleteBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteChat(chat.id);
                }}
                title="Delete chat"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <button className={styles.settingsBtn} onClick={onOpenSettings}>
          <Settings size={18} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}

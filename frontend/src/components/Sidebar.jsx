import React, { useState } from "react";
import { Plus, MessageSquare, Trash2, Edit2, Check, X, Moon, Sun, PanelLeftClose, PanelLeft, Search } from "lucide-react";

export default function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onNewChat,
  onClearAll,
  theme,
  onToggleTheme,
  isOpen,
  onClose
}) {
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredConversations = conversations.filter((conv) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    
    const titleMatches = conv.title.toLowerCase().includes(query);
    const messageMatches = conv.messages.some((msg) =>
      msg.content.toLowerCase().includes(query)
    );
    return titleMatches || messageMatches;
  });

  const handleStartRename = (e, id, currentTitle) => {
    e.stopPropagation(); // Prevent selecting the chat
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const handleSaveRename = (e, id) => {
    e.stopPropagation();
    if (editTitle.trim()) {
      onRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleCancelRename = (e) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleKeyDown = (e, id) => {
    if (e.key === "Enter") {
      handleSaveRename(e, id);
    } else if (e.key === "Escape") {
      handleCancelRename(e);
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && <div className="sidebar-overlay" onClick={onClose}></div>}

      <aside className={`sidebar glass-panel ${isOpen ? "open" : ""}`}>
        {/* Header */}
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={onNewChat}>
            <Plus size={18} />
            <span>New Chat</span>
          </button>
          
          {/* Close Sidebar button (visible on desktop and mobile for folding) */}
          <button className="toggle-sidebar-btn desktop-only" onClick={onClose} title="Close sidebar">
            <PanelLeftClose size={18} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="search-bar-container">
          <div className="search-input-wrapper glass-panel">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Search chat history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery("")}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* History List */}
        <div className="conversations-list-container">
          <div className="list-title">Recent Chats</div>
          {filteredConversations.length === 0 ? (
            <div className="empty-history">
              {searchQuery ? "No matches found" : "No conversation history"}
            </div>
          ) : (
            <div className="conversations-list">
              {filteredConversations.map((conv) => {
                const isActive = conv.id === currentConversationId;
                const isEditing = conv.id === editingId;

                return (
                  <div
                    key={conv.id}
                    className={`conv-item ${isActive ? "active" : ""}`}
                    onClick={() => onSelectConversation(conv.id)}
                  >
                    <MessageSquare size={16} className="conv-icon" />
                    
                    {isEditing ? (
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={(e) => handleSaveRename(e, conv.id)}
                        onKeyDown={(e) => handleKeyDown(e, conv.id)}
                        className="rename-input"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="conv-title">{conv.title}</span>
                    )}

                    {/* Action buttons (only show when not editing, or save/cancel when editing) */}
                    <div className="conv-actions">
                      {isEditing ? (
                        <>
                          <button
                            className="action-icon-btn check-btn"
                            onClick={(e) => handleSaveRename(e, conv.id)}
                            title="Save title"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            className="action-icon-btn cancel-btn"
                            onClick={handleCancelRename}
                            title="Cancel edit"
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="action-icon-btn"
                            onClick={(e) => handleStartRename(e, conv.id, conv.title)}
                            title="Rename chat"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            className="action-icon-btn delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteConversation(conv.id);
                            }}
                            title="Delete chat"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sidebar-footer">
          {conversations.length > 0 && (
            <button className="footer-btn clear-all-btn" onClick={onClearAll}>
              <Trash2 size={16} />
              <span>Clear all chats</span>
            </button>
          )}

          <button className="footer-btn theme-toggle-btn" onClick={onToggleTheme}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          </button>
          
          <div className="user-profile">
            <div className="profile-avatar">C</div>
            <div className="profile-info">
              <span className="profile-name">Chat User</span>
              <span className="profile-status">AI Assistant v1.0</span>
            </div>
          </div>
        </div>
      </aside>

      <style dangerouslySetInnerHTML={{ __html: `
        .sidebar {
          width: 280px;
          height: 100%;
          background-color: var(--bg-sidebar);
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          z-index: 50;
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .sidebar-header {
          padding: 1.25rem 1rem;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .new-chat-btn {
          flex-grow: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 0.75rem;
          border-radius: 12px;
          border: 1px solid var(--border-color);
          background-color: var(--bg-surface);
          color: var(--text-main);
          font-weight: 500;
          font-size: 0.9rem;
        }
        .new-chat-btn:hover {
          background-color: var(--bg-surface-hover);
          border-color: var(--primary);
          box-shadow: var(--shadow-glow);
          transform: translateY(-1px);
        }
        
        .toggle-sidebar-btn {
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          border: 1px solid var(--border-color);
          background-color: var(--bg-surface);
          color: var(--text-muted);
        }
        .toggle-sidebar-btn:hover {
          color: var(--text-main);
          background-color: var(--bg-surface-hover);
        }
        
        .search-bar-container {
          padding: 0 0.75rem;
          margin-bottom: 0.5rem;
        }
        .search-input-wrapper {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0.5rem 0.75rem;
          border-radius: 10px;
          background-color: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-color);
        }
        body.light-mode .search-input-wrapper {
          background-color: rgba(0, 0, 0, 0.02);
        }
        .search-input-wrapper:focus-within {
          border-color: var(--primary);
        }
        .search-icon {
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .search-input {
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-main);
          font-family: var(--font-sans);
          font-size: 0.8rem;
          width: 100%;
        }
        .search-input::placeholder {
          color: var(--text-muted);
        }
        .clear-search-btn {
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2px;
          border-radius: 4px;
        }
        .clear-search-btn:hover {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.05);
        }
        body.light-mode .clear-search-btn:hover {
          background-color: rgba(0, 0, 0, 0.05);
        }

        .conversations-list-container {
          flex-grow: 1;
          overflow-y: auto;
          padding: 0.5rem;
          display: flex;
          flex-direction: column;
        }
        
        .list-title {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 0.5rem 0.75rem;
          margin-bottom: 0.5rem;
        }
        
        .empty-history {
          font-size: 0.85rem;
          color: var(--text-muted);
          text-align: center;
          padding: 2rem 1rem;
          font-style: italic;
        }
        
        .conversations-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .conv-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0.7rem 0.75rem;
          border-radius: 10px;
          cursor: pointer;
          position: relative;
          color: var(--text-muted);
          transition: all 0.2s ease;
        }
        
        .conv-item:hover, .conv-item.active {
          background-color: var(--bg-surface-hover);
          color: var(--text-main);
        }
        
        .conv-item.active {
          border-left: 3px solid var(--primary);
          padding-left: calc(0.75rem - 3px);
        }
        
        .conv-icon {
          flex-shrink: 0;
          opacity: 0.7;
        }
        .conv-item.active .conv-icon {
          color: var(--primary);
          opacity: 1;
        }
        
        .conv-title {
          font-size: 0.9rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex-grow: 1;
          margin-right: 40px; /* Leave space for actions */
        }
        
        .rename-input {
          font-family: var(--font-sans);
          font-size: 0.9rem;
          background: transparent;
          border: none;
          border-bottom: 1.5px solid var(--primary);
          color: var(--text-main);
          outline: none;
          width: 80%;
          padding: 0;
        }
        
        .conv-actions {
          position: absolute;
          right: 0.5rem;
          display: none;
          align-items: center;
          gap: 4px;
        }
        
        .conv-item:hover .conv-actions, 
        .conv-item.active .conv-actions,
        .conv-item:focus-within .conv-actions {
          display: flex;
        }
        
        .action-icon-btn {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
        }
        .action-icon-btn:hover {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.08);
        }
        body.light-mode .action-icon-btn:hover {
          background-color: rgba(0, 0, 0, 0.05);
        }
        .action-icon-btn.delete-btn:hover {
          color: #ef4444;
        }
        .action-icon-btn.check-btn {
          color: #10b981;
        }
        .action-icon-btn.cancel-btn {
          color: #ef4444;
        }
        
        .sidebar-footer {
          padding: 0.75rem;
          border-top: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        
        .footer-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0.65rem 0.75rem;
          border-radius: 10px;
          color: var(--text-muted);
          font-size: 0.85rem;
          font-weight: 500;
          text-align: left;
          width: 100%;
        }
        .footer-btn:hover {
          color: var(--text-main);
          background-color: var(--bg-surface-hover);
        }
        .clear-all-btn:hover {
          color: #ef4444;
        }
        
        .user-profile {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0.75rem;
          border-radius: 12px;
          background-color: rgba(255, 255, 255, 0.02);
          margin-top: 0.5rem;
        }
        body.light-mode .user-profile {
          background-color: rgba(0, 0, 0, 0.02);
        }
        .profile-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background-color: var(--primary);
          color: var(--text-inverse);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 0.9rem;
        }
        .profile-info {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .profile-name {
          font-size: 0.85rem;
          font-weight: 600;
          white-space: nowrap;
          text-overflow: ellipsis;
          overflow: hidden;
        }
        .profile-status {
          font-size: 0.7rem;
          color: var(--text-muted);
        }
        
        .sidebar-overlay {
          display: none;
        }
        
        /* Responsive CSS Rules */
        @media (max-width: 768px) {
          .desktop-only {
            display: none !important;
          }
          
          .sidebar {
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            transform: translateX(-100%);
            z-index: 100;
            box-shadow: 10px 0 30px rgba(0, 0, 0, 0.2);
          }
          .sidebar.open {
            transform: translateX(0);
          }
          
          .sidebar-overlay {
            display: block;
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
            z-index: 90;
          }
        }
      `}} />
    </>
  );
}

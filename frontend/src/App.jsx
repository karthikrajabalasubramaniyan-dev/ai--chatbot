import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import ChatArea from "./components/ChatArea";
import SettingsModal from "./components/SettingsModal";
import { PanelLeft } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
const BACKEND_URL = `${API_BASE}/api/chat`;
const HISTORY_URL = `${API_BASE}/api/history`;
const SETTINGS_URL = `${API_BASE}/api/settings`;

export default function App() {
  const [conversations, setConversations] = useState(() => {
    const saved = localStorage.getItem("ai_chatbot_conversations");
    return saved ? JSON.parse(saved) : [];
  });
  
  const [currentConversationId, setCurrentConversationId] = useState(() => {
    return localStorage.getItem("ai_chatbot_current_id") || null;
  });
  
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("ai_chatbot_theme") || "dark";
  });
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // AI Model States
  const [selectedModel, setSelectedModel] = useState("gemini");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({
    defaultModel: "gemini",
    apiKeys: { gemini: "", openai: "", claude: "" }
  });

  // Fetch Settings from backend
  const fetchSettings = async () => {
    try {
      const response = await fetch(SETTINGS_URL);
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        setSelectedModel(data.defaultModel || "gemini");
      }
    } catch (err) {
      console.warn("Could not load settings from backend.", err);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveSettings = async (newSettings) => {
    try {
      const response = await fetch(SETTINGS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings)
      });
      if (!response.ok) throw new Error("Failed to save settings");
      await fetchSettings();
    } catch (err) {
      console.error("Save settings error:", err);
      throw err;
    }
  };

  // Fetch history from backend on mount
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(HISTORY_URL);
        if (!response.ok) throw new Error("Failed to load history");
        const data = await response.json();
        setConversations(data);
      } catch (err) {
        console.warn("Could not load history from backend. Using localStorage fallback.", err);
      }
    };
    fetchHistory();
  }, []);

  // Sync conversations to localStorage as a fallback
  useEffect(() => {
    localStorage.setItem("ai_chatbot_conversations", JSON.stringify(conversations));
  }, [conversations]);

  // Sync current conversation ID to localStorage
  useEffect(() => {
    if (currentConversationId) {
      localStorage.setItem("ai_chatbot_current_id", currentConversationId);
    } else {
      localStorage.removeItem("ai_chatbot_current_id");
    }
  }, [currentConversationId]);

  // Toggle Dark/Light mode body class
  useEffect(() => {
    if (theme === "light") {
      document.body.classList.add("light-mode");
    } else {
      document.body.classList.remove("light-mode");
    }
    localStorage.setItem("ai_chatbot_theme", theme);
  }, [theme]);

  // Backend persistence helpers
  const saveConversationToBackend = async (conversation) => {
    try {
      await fetch(HISTORY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conversation)
      });
    } catch (err) {
      console.error("Failed to save conversation to backend:", err);
    }
  };

  const deleteConversationFromBackend = async (id) => {
    try {
      await fetch(`${HISTORY_URL}/${id}`, { method: "DELETE" });
    } catch (err) {
      console.error("Failed to delete conversation from backend:", err);
    }
  };

  const clearAllConversationsFromBackend = async () => {
    try {
      await fetch(HISTORY_URL, { method: "DELETE" });
    } catch (err) {
      console.error("Failed to clear history from backend:", err);
    }
  };

  // Get active conversation details
  const activeConversation = conversations.find(c => c.id === currentConversationId) || null;

  // Handle sending a new message
  const handleSendMessage = async (text, attachment) => {
    if (!text.trim()) return;

    const isImage = attachment && attachment.mimeType?.startsWith("image/");
    const userContent = attachment 
      ? isImage
        ? `🖼️ **Image**: ${attachment.fileName}\n\n${text}`
        : `📎 **Document**: ${attachment.fileName}\n\n${text}`
      : text;

    const userMessage = {
      id: Date.now().toString(),
      role: "user",
      content: userContent,
      timestamp: new Date().toISOString()
    };

    let targetConvId = currentConversationId;
    let updatedConversations = [...conversations];
    let newConv = null;

    // 1. If we are starting a brand new chat (no active ID or conversation not found in history)
    if (!targetConvId || !conversations.some(c => c.id === targetConvId)) {
      targetConvId = Date.now().toString();
      setCurrentConversationId(targetConvId);
      
      newConv = {
        id: targetConvId,
        title: text.length > 30 ? text.substring(0, 30) + "..." : text,
        messages: [userMessage],
        createdAt: new Date().toISOString()
      };
      
      updatedConversations = [newConv, ...conversations];
      setConversations(updatedConversations);
      saveConversationToBackend(newConv);
    } else {
      // 2. Append user message to existing conversation
      let updatedConv = null;
      updatedConversations = conversations.map(c => {
        if (c.id === targetConvId) {
          updatedConv = {
            ...c,
            messages: [...c.messages, userMessage]
          };
          return updatedConv;
        }
        return c;
      });
      setConversations(updatedConversations);
      if (updatedConv) {
        saveConversationToBackend(updatedConv);
      }
    }

    setIsLoading(true);

    try {
      const activeConv = updatedConversations.find(c => c.id === targetConvId);
      const apiHistory = activeConv.messages.slice(0, -1).map(m => ({
        role: m.role,
        content: m.content
      }));

      // Construct prompt based on model capabilities
      let promptMessage = text;
      let payloadAttachment = null;

      if (attachment) {
        const isImage = attachment.mimeType?.startsWith("image/");
        
        if (isImage) {
          // Send image payload to the backend for all models (multimodal vision)
          payloadAttachment = {
            data: attachment.data,
            mimeType: attachment.mimeType
          };
        } else {
          // It's a PDF: Send raw payload to Gemini, fallback context text to others
          if (selectedModel === "gemini") {
            payloadAttachment = {
              data: attachment.data,
              mimeType: attachment.mimeType
            };
          } else {
            promptMessage = `[Document Context: ${attachment.fileName}]\n---\nDOCUMENT TEXT:\n${attachment.extractedText || "No text extracted."}\n---\nUser Question:\n${text}`;
          }
        }
      }

      const response = await fetch(BACKEND_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: promptMessage,
          history: apiHistory,
          model: selectedModel,
          attachment: payloadAttachment
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned error code ${response.status}`);
      }

      const data = await response.json();
      
      const aiMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response,
        timestamp: new Date().toISOString()
      };

      setConversations(prev => {
        const target = prev.find(c => c.id === targetConvId);
        if (!target) return prev;
        const updated = {
          ...target,
          messages: [...target.messages, aiMessage]
        };
        saveConversationToBackend(updated);
        return prev.map(c => c.id === targetConvId ? updated : c);
      });

    } catch (error) {
      console.error("Failed to connect to backend REST API:", error);
      
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `⚠️ **Connection Error**\n\nFailed to connect to the backend server at \`${BACKEND_URL}\`.\n\nPlease verify that:\n1. The backend server is running (\`npm run dev\` inside the \`backend\` folder).\n2. Your firewall or port configuration is correct.\n\n*Note: Since the backend is unreachable, live responses cannot be generated.*`,
        timestamp: new Date().toISOString()
      };

      setConversations(prev => {
        const target = prev.find(c => c.id === targetConvId);
        if (!target) return prev;
        const updated = {
          ...target,
          messages: [...target.messages, errorMessage]
        };
        saveConversationToBackend(updated);
        return prev.map(c => c.id === targetConvId ? updated : c);
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Switch conversation
  const handleSelectConversation = (id) => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setCurrentConversationId(id);
    setIsMobileSidebarOpen(false); // Close mobile menu when selecting
  };

  // Delete conversation
  const handleDeleteConversation = (id) => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    const filtered = conversations.filter(c => c.id !== id);
    setConversations(filtered);
    deleteConversationFromBackend(id);
    
    if (currentConversationId === id) {
      setCurrentConversationId(filtered.length > 0 ? filtered[0].id : null);
    }
  };

  // Rename conversation
  const handleRenameConversation = (id, newTitle) => {
    setConversations(prev => {
      const target = prev.find(c => c.id === id);
      if (!target) return prev;
      const updated = { ...target, title: newTitle };
      saveConversationToBackend(updated);
      return prev.map(c => c.id === id ? updated : c);
    });
  };

  // Start a new blank chat
  const handleNewChat = () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setCurrentConversationId(null);
    setIsMobileSidebarOpen(false);
  };

  // Clear all chats from history
  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to clear your entire chat history? This cannot be undone.")) {
      setConversations([]);
      setCurrentConversationId(null);
      clearAllConversationsFromBackend();
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar - render if not collapsed on desktop, and handle mobile layout */}
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onNewChat={handleNewChat}
        onClearAll={handleClearAll}
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        isOpen={isMobileSidebarOpen}
        onClose={() => {
          setIsMobileSidebarOpen(false);
          setIsSidebarCollapsed(true);
        }}
      />

      {/* Floating open sidebar button on desktop when sidebar is collapsed */}
      {isSidebarCollapsed && (
        <button
          className="open-sidebar-btn desktop-only"
          onClick={() => setIsSidebarCollapsed(false)}
          title="Open sidebar"
        >
          <PanelLeft size={18} />
        </button>
      )}

      {/* Main Chat Panel */}
      <ChatArea
        conversation={activeConversation}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        onToggleSidebar={() => {
          // On mobile, toggle mobile drawer, on desktop toggle folding
          if (window.innerWidth <= 768) {
            setIsMobileSidebarOpen(!isMobileSidebarOpen);
          } else {
            setIsSidebarCollapsed(!isSidebarCollapsed);
          }
        }}
        isSidebarOpen={!isSidebarCollapsed}
        activeModel={selectedModel}
        onChangeModel={setSelectedModel}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Glassmorphic Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />

      <style dangerouslySetInnerHTML={{ __html: `
        .open-sidebar-btn {
          position: absolute;
          top: 11px;
          left: 12px;
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          border: 1px solid var(--border-color);
          background-color: var(--bg-sidebar);
          color: var(--text-muted);
          z-index: 40;
        }
        .open-sidebar-btn:hover {
          color: var(--text-main);
          background-color: var(--bg-surface-hover);
        }
        
        /* Adjust layout when sidebar is collapsed on desktop */
        .desktop-only {
          display: flex;
        }
        
        @media (min-width: 769px) {
          .sidebar {
            display: ${isSidebarCollapsed ? "none" : "flex"};
          }
          .chat-area {
            margin-left: 0;
          }
          
          /* Hide mobile hamburger toggle on desktop when sidebar is open */
          .menu-btn {
            display: ${isSidebarCollapsed ? "flex" : "none"} !important;
          }
        }
        
        @media (max-width: 768px) {
          .desktop-only {
            display: none !important;
          }
        }
      `}} />
    </div>
  );
}

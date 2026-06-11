import React, { useState, useRef, useEffect } from "react";
import { Send, Menu, Sparkles, Code, MessageSquare, Table, PanelLeft, Mic, MicOff, VolumeX, Globe, Settings } from "lucide-react";
import MessageItem from "./MessageItem";
import TypingIndicator from "./TypingIndicator";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

const SUGGESTIONS = [
  {
    icon: <Sparkles size={16} className="suggest-icon sparkle" />,
    text: "Explain quantum computing in simple terms",
    prompt: "Explain quantum computing in simple terms, using a creative analogy."
  },
  {
    icon: <Code size={16} className="suggest-icon code" />,
    text: "Write a JS function to filter even numbers",
    prompt: "Write a JavaScript function to filter even numbers from an array and explain how it works."
  },
  {
    icon: <Table size={16} className="suggest-icon table" />,
    text: "Compare REST vs WebSockets",
    prompt: "Create a comparison table comparing REST APIs and WebSockets based on features, protocols, and use cases."
  },
  {
    icon: <MessageSquare size={16} className="suggest-icon message" />,
    text: "What are your capabilities?",
    prompt: "Help me understand what you can do and what features you support."
  }
];

export default function ChatArea({
  conversation,
  onSendMessage,
  isLoading,
  onToggleSidebar,
  isSidebarOpen,
  activeModel,
  onChangeModel,
  onOpenSettings
}) {
  const [input, setInput] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("idle"); // "idle" | "listening" | "processing" | "error"
  const [voiceLanguage, setVoiceLanguage] = useState("en-US");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceInputSupported, setIsVoiceInputSupported] = useState(() => {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  });
  const [voiceError, setVoiceError] = useState(null);
  
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef(null);

  // Clean up recognition on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Periodically check if synthesis is speaking
  useEffect(() => {
    const checkSpeaking = setInterval(() => {
      if (window.speechSynthesis) {
        setIsSpeaking(window.speechSynthesis.speaking);
      }
    }, 250);
    return () => clearInterval(checkSpeaking);
  }, []);

  const startRecording = async () => {
    if (!isVoiceInputSupported) {
      setVoiceError("Audio recording is not supported in this environment.");
      setVoiceStatus("error");
      return;
    }

    try {
      setVoiceError(null);
      
      // Request mic permission and stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all audio tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
        
        if (!audioChunksRef.current || audioChunksRef.current.length === 0) {
          setVoiceError("No audio captured.");
          setVoiceStatus("error");
          setTimeout(() => setVoiceStatus("idle"), 3000);
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setVoiceStatus("processing");

        try {
          // Convert Blob to Base64
          const base64Audio = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
              const base64data = reader.result.split(",")[1];
              resolve(base64data);
            };
            reader.onerror = reject;
          });

          // Send to Express backend for Gemini transcription
          const response = await fetch(`${API_BASE}/api/transcribe`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              audio: base64Audio,
              mimeType: "audio/webm",
              language: voiceLanguage
            })
          });

          if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
          }

          const data = await response.json();
          if (data.error) {
            throw new Error(data.error);
          }

          const transcriptionText = data.text || "";
          
          if (transcriptionText.trim()) {
            setInput(prev => {
              const separator = prev.trim() ? " " : "";
              return prev + separator + transcriptionText;
            });
            setVoiceStatus("idle");
          } else {
            setVoiceError("No speech detected. Please speak clearly.");
            setVoiceStatus("error");
            setTimeout(() => {
              setVoiceStatus("idle");
              setVoiceError(null);
            }, 3000);
          }

        } catch (err) {
          console.warn("Transcription failed:", err);
          setVoiceError("Transcription service failed. Please type instead.");
          setVoiceStatus("error");
          setTimeout(() => {
            setVoiceStatus("idle");
            setVoiceError(null);
          }, 3000);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setVoiceStatus("listening");

    } catch (err) {
      console.warn("Microphone access failed:", err);
      setVoiceError("Microphone permission denied or device occupied.");
      setVoiceStatus("error");
      setTimeout(() => {
        setVoiceStatus("idle");
        setVoiceError(null);
      }, 3000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn("Error stopping media recorder:", err);
        setVoiceStatus("idle");
      }
    }
  };

  const toggleListening = () => {
    if (voiceStatus === "listening") {
      stopRecording();
    } else if (voiceStatus === "idle" || voiceStatus === "error") {
      startRecording();
    }
  };

  const handleStopSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const messages = conversation?.messages || [];

  // Auto scroll to latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Auto-resize input textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (prompt) => {
    if (isLoading) return;
    onSendMessage(prompt);
  };

  return (
    <div className="chat-area">
      {/* Header */}
      <header className="chat-header glass-panel">
        <div className="header-left">
          <button className="menu-btn" onClick={onToggleSidebar} title="Toggle Sidebar">
            <Menu size={20} />
          </button>
          
          <div className="header-title-container">
            <h2 className="header-title">{conversation?.title || "New Chat"}</h2>
            <span className="header-badge">{isLoading ? "Generating..." : "Ready"}</span>
          </div>
        </div>

        <div className="header-right">
          <div className="model-selector-wrapper">
            <select
              value={activeModel || "gemini"}
              onChange={(e) => onChangeModel?.(e.target.value)}
              className="model-dropdown-select glass-panel"
              title="Select AI Model"
              disabled={isLoading}
            >
              <option value="gemini">Gemini 2.5 Flash</option>
              <option value="openai">OpenAI GPT-4o-mini</option>
              <option value="claude">Claude 3.5 Sonnet</option>
            </select>
          </div>
          <button 
            className="settings-trigger-btn" 
            onClick={onOpenSettings} 
            title="AI Model Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Main Message Stream */}
      <div className="message-stream-container">
        {messages.length === 0 ? (
          <div className="welcome-container animate-fade-in">
            <div className="welcome-glow"></div>
            <div className="welcome-logo">
              <Sparkles size={36} className="logo-sparkle" />
            </div>
            <h1 className="welcome-title">How can I help you today?</h1>
            <p className="welcome-subtitle">
              Ask me about coding, scientific concepts, or let me structure reports for you.
            </p>

            <div className="suggestions-grid">
              {SUGGESTIONS.map((sug, idx) => (
                <div
                  key={idx}
                  className="suggestion-card glass-panel"
                  onClick={() => handleSuggestionClick(sug.prompt)}
                >
                  <div className="suggestion-header">
                    {sug.icon}
                  </div>
                  <p className="suggestion-text">{sug.text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((msg) => (
              <MessageItem key={msg.id} message={msg} />
            ))}
            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Form Panel */}
      <footer className="chat-input-container">
        {isSpeaking && (
          <div className="stop-speaking-bar animate-fade-in">
            <button className="stop-speaking-btn" onClick={handleStopSpeaking}>
              <VolumeX size={14} />
              <span>Stop Speaking</span>
            </button>
          </div>
        )}
        <div className="input-box-wrapper glass-panel">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              voiceStatus === "listening"
                ? "Listening... Click microphone to finish speaking..."
                : voiceStatus === "processing"
                ? "Transcribing voice input..."
                : "Message AI Chatbot..."
            }
            className={`chat-textarea ${voiceStatus === "listening" ? "textarea-listening" : ""} ${voiceStatus === "processing" ? "textarea-processing" : ""}`}
            disabled={isLoading || voiceStatus === "processing"}
          />

          {/* Language Toggle */}
          <button
            type="button"
            className={`lang-toggle-btn ${voiceLanguage === "ta-IN" ? "tamil" : ""}`}
            onClick={() => setVoiceLanguage(prev => prev === "en-US" ? "ta-IN" : "en-US")}
            title={`Voice Language: ${voiceLanguage === "en-US" ? "English" : "Tamil (தமிழ்)"}`}
            disabled={voiceStatus !== "idle"}
          >
            <Globe size={14} />
            <span>{voiceLanguage === "en-US" ? "EN" : "தமிழ்"}</span>
          </button>

          {/* Microphone Button */}
          <button
            type="button"
            className={`mic-btn ${voiceStatus === "listening" ? "listening" : ""} ${voiceStatus === "processing" ? "processing" : ""} ${!isVoiceInputSupported ? "disabled" : ""}`}
            onClick={toggleListening}
            title={
              !isVoiceInputSupported
                ? (voiceError || "Audio input is not supported in this environment")
                : voiceStatus === "listening"
                ? "Stop listening & transcribe"
                : voiceStatus === "processing"
                ? "Processing transcription..."
                : "Start voice input"
            }
            disabled={!isVoiceInputSupported || voiceStatus === "processing"}
          >
            {voiceStatus === "listening" ? <MicOff size={16} /> : <Mic size={16} />}
          </button>

          <button
            className={`send-btn ${input.trim() ? "active" : ""}`}
            onClick={handleSend}
            disabled={!input.trim() || isLoading || voiceStatus === "processing"}
            title="Send message"
          >
            <Send size={18} />
          </button>
        </div>
        {voiceError ? (
          <p className="input-disclaimer voice-error-text">
            ⚠️ {voiceError}
          </p>
        ) : (
          <p className="input-disclaimer">
            AI Chatbot can make mistakes. Verify important info. Built using React + Node.js.
          </p>
        )}
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .chat-area {
          display: flex;
          flex-direction: column;
          flex-grow: 1;
          height: 100%;
          position: relative;
          background: radial-gradient(circle at 50% 50%, var(--bg-app) 0%, rgba(8, 11, 17, 0.95) 100%);
          overflow: hidden;
        }
        
        .chat-header {
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1.5rem;
          border-bottom: 1px solid var(--border-color);
          background-color: rgba(8, 11, 17, 0.4);
          z-index: 10;
        }
        
        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .model-selector-wrapper {
          display: flex;
          align-items: center;
        }

        .model-dropdown-select {
          padding: 6px 12px;
          border-radius: 10px;
          font-size: 0.85rem;
          font-weight: 550;
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
          outline: none;
          cursor: pointer;
          transition: all 0.2s;
        }
        body.light-mode .model-dropdown-select {
          background-color: rgba(0, 0, 0, 0.02);
          color: #1f2937;
        }
        .model-dropdown-select:hover {
          background-color: rgba(255, 255, 255, 0.06);
          border-color: var(--border-color-active);
        }
        body.light-mode .model-dropdown-select:hover {
          background-color: rgba(0, 0, 0, 0.04);
        }
        .model-dropdown-select:focus {
          border-color: var(--primary);
        }

        .settings-trigger-btn {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          color: var(--text-muted);
          background-color: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
          transition: all 0.2s;
        }
        body.light-mode .settings-trigger-btn {
          background-color: rgba(0, 0, 0, 0.02);
        }
        .settings-trigger-btn:hover {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.06);
          border-color: var(--border-color-active);
          transform: rotate(25deg);
        }
        body.light-mode .settings-trigger-btn:hover {
          background-color: rgba(0, 0, 0, 0.04);
        }
        
        .menu-btn {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          color: var(--text-muted);
        }
        .menu-btn:hover {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.05);
        }
        body.light-mode .menu-btn:hover {
          background-color: rgba(0, 0, 0, 0.05);
        }
        
        .header-title-container {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .header-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-main);
          white-space: nowrap;
          max-width: 250px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .header-badge {
          font-size: 0.65rem;
          font-weight: 500;
          padding: 2px 8px;
          border-radius: 9999px;
          background: rgba(139, 92, 246, 0.1);
          color: var(--primary);
          border: 1px solid rgba(139, 92, 246, 0.2);
        }
        
        .message-stream-container {
          flex-grow: 1;
          overflow-y: auto;
          padding: 1.5rem;
          position: relative;
        }
        
        .message-list {
          max-width: 800px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          padding-bottom: 2rem;
        }
        
        /* Welcome Dashboard styling */
        .welcome-container {
          max-width: 720px;
          margin: 4rem auto 0;
          text-align: center;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0 1rem;
        }
        
        .welcome-glow {
          position: absolute;
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%);
          top: -100px;
          z-index: 0;
          pointer-events: none;
        }
        
        .welcome-logo {
          width: 68px;
          height: 68px;
          border-radius: 20px;
          background: linear-gradient(135deg, var(--primary), #a78bfa);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          margin-bottom: 1.5rem;
          box-shadow: 0 8px 30px rgba(139, 92, 246, 0.3);
          z-index: 1;
        }
        .logo-sparkle {
          animation: spin 10s infinite linear;
        }
        
        .welcome-title {
          font-size: 2.2rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          background: linear-gradient(to right, var(--text-main), #a78bfa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          z-index: 1;
        }
        
        .welcome-subtitle {
          color: var(--text-muted);
          font-size: 1rem;
          max-width: 500px;
          margin-bottom: 3rem;
          line-height: 1.5;
          z-index: 1;
        }
        
        .suggestions-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          width: 100%;
          z-index: 1;
        }
        
        .suggestion-card {
          padding: 1.2rem;
          border-radius: 16px;
          text-align: left;
          cursor: pointer;
          background-color: var(--bg-surface);
          border-color: var(--border-color);
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .suggestion-card:hover {
          background-color: var(--bg-surface-hover);
          border-color: var(--border-color-active);
          box-shadow: var(--shadow-glow);
          transform: translateY(-2px);
        }
        
        .suggestion-header {
          margin-bottom: 0.75rem;
        }
        .suggest-icon {
          padding: 6px;
          width: 28px;
          height: 28px;
          border-radius: 8px;
        }
        .suggest-icon.sparkle { background-color: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        .suggest-icon.code { background-color: rgba(16, 185, 129, 0.1); color: #10b981; }
        .suggest-icon.table { background-color: rgba(6, 182, 212, 0.1); color: #06b6d4; }
        .suggest-icon.message { background-color: rgba(139, 92, 246, 0.1); color: #8b5cf6; }
        
        .suggestion-text {
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--text-main);
          line-height: 1.4;
        }
        
        /* Chat Input Area */
        .chat-input-container {
          max-width: 800px;
          width: 100%;
          margin: 0 auto;
          padding: 0 1.5rem 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .input-box-wrapper {
          border-radius: 20px;
          padding: 10px 14px;
          display: flex;
          align-items: flex-end;
          gap: 10px;
          background-color: var(--bg-surface);
          border-color: var(--border-color);
        }
        .input-box-wrapper:focus-within {
          border-color: var(--primary);
          box-shadow: var(--shadow-glow);
        }
        
        .chat-textarea {
          flex-grow: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-main);
          font-family: var(--font-sans);
          font-size: 0.95rem;
          line-height: 1.5;
          padding: 8px 4px;
          resize: none;
          max-height: 200px;
        }
        .chat-textarea::placeholder {
          color: var(--text-muted);
        }
        
        .send-btn {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          background-color: rgba(255, 255, 255, 0.02);
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        .send-btn.active {
          color: white;
          background-color: var(--primary);
          box-shadow: 0 4px 12px var(--primary-glow);
        }
        .send-btn.active:hover {
          background-color: var(--primary-hover);
          transform: scale(1.05);
        }
        
        .input-disclaimer {
          font-size: 0.7rem;
          color: var(--text-muted);
          text-align: center;
        }
        
        @media (max-width: 768px) {
          .chat-header {
            padding: 0 1rem;
          }
          .welcome-title {
            font-size: 1.6rem;
          }
          .welcome-subtitle {
            font-size: 0.85rem;
            margin-bottom: 2rem;
          }
          .suggestions-grid {
            grid-template-columns: 1fr;
            gap: 8px;
          }
          .suggestion-card {
            padding: 1rem;
          }
          .chat-input-container {
            padding: 0 1rem 1rem;
          }
          .input-box-wrapper {
            padding: 8px 10px;
            border-radius: 16px;
          }
          .chat-textarea {
            font-size: 0.9rem;
          }
        }

        /* Voice assistant custom styles */
        .mic-btn, .lang-toggle-btn {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          background-color: rgba(255, 255, 255, 0.02);
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        body.light-mode .mic-btn, body.light-mode .lang-toggle-btn {
          background-color: rgba(0, 0, 0, 0.02);
        }
        .mic-btn:hover, .lang-toggle-btn:hover {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.05);
        }
        body.light-mode .mic-btn:hover, body.light-mode .lang-toggle-btn:hover {
          background-color: rgba(0, 0, 0, 0.05);
        }

        .mic-btn.listening {
          color: #ffffff;
          background-color: #ef4444;
          box-shadow: 0 0 12px rgba(239, 68, 68, 0.5);
          animation: pulse 1.4s infinite ease-in-out;
        }

        .mic-btn.disabled {
          opacity: 0.4;
          cursor: not-allowed;
          background-color: rgba(255, 255, 255, 0.01) !important;
          color: var(--text-muted) !important;
        }
        body.light-mode .mic-btn.disabled {
          background-color: rgba(0, 0, 0, 0.01) !important;
        }

        .lang-toggle-btn {
          width: auto;
          padding: 0 8px;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--primary);
          border: 1px solid rgba(139, 92, 246, 0.2);
        }
        .lang-toggle-btn.tamil {
          color: #10b981;
          border-color: rgba(16, 185, 129, 0.2);
        }

        .textarea-listening {
          color: var(--primary) !important;
          font-style: italic;
        }

        .stop-speaking-bar {
          display: flex;
          justify-content: center;
          margin-bottom: 8px;
        }
        .stop-speaking-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 500;
          color: #ef4444;
          padding: 6px 12px;
          border-radius: 9999px;
          border: 1px solid rgba(239, 68, 68, 0.2);
          background-color: rgba(239, 68, 68, 0.05);
        }
        .stop-speaking-btn:hover {
          background-color: rgba(239, 68, 68, 0.1);
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(239, 68, 68, 0.1);
        }

        .mic-btn.processing {
          color: #ffffff;
          background-color: var(--primary);
          box-shadow: 0 0 12px var(--primary-glow);
          animation: spin 2s infinite linear;
        }
        .textarea-processing {
          color: var(--text-muted) !important;
          font-style: italic;
        }

        .voice-error-text {
          color: #f59e0b !important;
          font-weight: 500;
        }
      `}} />
    </div>
  );
}

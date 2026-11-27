import React, { useState, useRef, useEffect } from "react";
import {
  Send, Menu, Sparkles, Code, MessageSquare,
  Mic, MicOff, VolumeX, Globe, Settings, Paperclip, FileText, X, Bot,
  GraduationCap, BookOpen, Layers, Zap
} from "lucide-react";
import MessageItem from "./MessageItem";
import TypingIndicator from "./TypingIndicator";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

const CHAT_SUGGESTIONS = [
  {
    icon: <Code size={16} className="suggest-icon code" />,
    text: "Write a React component with Tailwind",
    prompt: "Write a modern, accessible React component with Tailwind CSS styling."
  },
  {
    icon: <Sparkles size={16} className="suggest-icon sparkle" />,
    text: "Explain a complex concept simply",
    prompt: "Explain how neural networks and transformers work using simple analogies."
  },
  {
    icon: <MessageSquare size={16} className="suggest-icon message" />,
    text: "Brainstorm creative ideas",
    prompt: "Give me 5 creative ideas for an innovative mobile application using generative AI."
  },
  {
    icon: <FileText size={16} className="suggest-icon table" />,
    text: "Draft a professional outline",
    prompt: "Help me structure a comprehensive project proposal. Provide a clear outline and key sections."
  }
];

const STUDY_SUGGESTIONS = [
  {
    icon: <FileText size={16} className="suggest-icon sparkle" />,
    text: "Computer Networks: TCP vs UDP (2-Marks)",
    prompt: "Computer Networks Unit 3: Differentiate between TCP and UDP protocols with comparison table."
  },
  {
    icon: <BookOpen size={16} className="suggest-icon code" />,
    text: "OS: Deadlock & Banker's Algorithm (16-Marks)",
    prompt: "Operating Systems: Explain Deadlock Prevention, Avoidance, and Banker's Algorithm with detailed diagram."
  },
  {
    icon: <Layers size={16} className="suggest-icon table" />,
    text: "DBMS: Normalization 1NF to BCNF (Revision)",
    prompt: "Database Management Systems: Quick revision cheat sheet on Functional Dependency, 1NF, 2NF, 3NF, and BCNF."
  },
  {
    icon: <Zap size={16} className="suggest-icon message" />,
    text: "Compiler Design: Lexical Analysis (Tanglish)",
    prompt: "Compiler Design: Explain Lexical Analysis phase, tokens, and lexemes in friendly beginner Tanglish."
  }
];

const STUDY_QUICK_CHIPS = [
  "CN: TCP vs UDP",
  "OS: Banker's Algorithm",
  "DBMS: BCNF Normalization",
  "CD: LL(1) vs LR(1) Parser",
  "DAA: Dynamic Programming",
  "AI: A* Search Algorithm"
];

export default function ChatArea({
  conversation,
  onSendMessage,
  onStudyAgent,
  isLoading,
  onToggleSidebar,
  isSidebarOpen,
  activeModel,
  onChangeModel,
  onOpenSettings
}) {
  const [input, setInput] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("idle");

  // Mode Toggle: "chat" or "study"
  const [appMode, setAppMode] = useState("chat");
  // Study Modes: "2-marks" | "16-marks" | "unit-summary" | "tanglish-explain"
  const [studyMode, setStudyMode] = useState("16-marks");

  // Selected Model for Chat Bar: "gemini" | "groq"
  const [inputModel, setInputModel] = useState(() => {
    return activeModel === "groq" || activeModel === "hf" ? "groq" : "gemini";
  });

  useEffect(() => {
    if (activeModel === "groq" || activeModel === "hf" || activeModel === "gemini") {
      setInputModel(activeModel === "hf" ? "groq" : activeModel);
    }
  }, [activeModel]);

  // Live Web (2001–2026) Grounding & Live Search toggle
  const [liveWebEnabled, setLiveWebEnabled] = useState(true);

  // PDF & Image Attachment States
  const [selectedFile, setSelectedFile] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  const [base64Data, setBase64Data] = useState("");

  const fileInputRef = useRef(null);
  const [voiceLanguage, setVoiceLanguage] = useState("en-US");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceInputSupported] = useState(() => {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  });
  const [voiceError, setVoiceError] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef(null);

  // Clean up media recorder on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
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
          const base64Audio = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
              const base64data = reader.result.split(",")[1];
              resolve(base64data);
            };
            reader.onerror = reject;
          });

          const response = await fetch(`${API_BASE}/api/v1/transcribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audio: base64Audio,
              mimeType: "audio/webm",
              language: voiceLanguage
            })
          });

          if (!response.ok) throw new Error(`Server error: ${response.status}`);
          const data = await response.json();
          const transcriptionText = data.text || "";

          if (transcriptionText.trim()) {
            setInput(prev => (prev.trim() ? prev + " " + transcriptionText : transcriptionText));
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
          setVoiceError("Transcription service failed.");
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
      setVoiceError("Microphone permission denied.");
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleFileChange = async (file) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");

    if (!isPdf && !isImage) {
      alert("Only PDF documents and image files are supported.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);

    if (isImage) {
      setIsParsing(false);
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result.split(",")[1];
        setBase64Data(base64);
      };
      reader.readAsDataURL(file);
      setExtractedText("");
    } else if (isPdf) {
      setIsParsing(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result.split(",")[1];
        setBase64Data(base64);
      };
      reader.readAsDataURL(file);

      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = window["pdfjs-dist/build/pdf"];
        if (!pdfjsLib) throw new Error("PDF.js library is not loaded.");
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((item) => item.str);
          text += strings.join(" ") + "\n";
        }
        setExtractedText(text);
      } catch (err) {
        console.error("PDF text extraction failed:", err);
      } finally {
        setIsParsing(false);
      }
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setExtractedText("");
    setBase64Data("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = () => {
    if ((!input.trim() && !selectedFile) || isLoading || isParsing) return;

    const attachment = selectedFile ? {
      data: base64Data,
      mimeType: selectedFile.type.startsWith("image/") ? selectedFile.type : "application/pdf",
      extractedText: extractedText,
      fileName: selectedFile.name
    } : null;

    if (appMode === "study") {
      if (onStudyAgent) {
        onStudyAgent(input.trim(), studyMode, attachment);
      } else {
        onSendMessage(input.trim(), attachment, inputModel, liveWebEnabled);
      }
    } else {
      onSendMessage(input.trim(), attachment, inputModel, liveWebEnabled);
    }

    setInput("");
    handleRemoveFile();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (prompt) => {
    if (isLoading) return;
    if (appMode === "study" && onStudyAgent) {
      onStudyAgent(prompt, studyMode, null);
    } else {
      onSendMessage(prompt, null, inputModel, liveWebEnabled);
    }
  };

  const getStudyModeDescription = () => {
    switch (studyMode) {
      case "2-marks":
        return "Anna University Part-A Specialist: Generates 10 high-yield questions with crisp, full-mark answers.";
      case "16-marks":
        return "Part-B / Part-C Specialist: Structured headings, diagram placeholders, algorithms, and key takeaways.";
      case "unit-summary":
        return "Fast-Revision Cheat Sheet: Core concept matrices, formulas, definitions, and comparison tables.";
      case "tanglish-explain":
        return "Friendly Mentor: Explains complex CSE topics in simple Tanglish with real-world analogies.";
      default:
        return "Anna University CSE Semester Exam Preparation Expert.";
    }
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
            <h2 className="header-title">{conversation?.title || (appMode === "study" ? "Anna University CSE Exam Prep" : "KarthikAI Chat")}</h2>
            <span className={`header-badge ${appMode === "study" ? "study-badge" : ""}`}>
              {isLoading ? "Thinking..." : appMode === "study" ? "🎓 Anna University CSE" : "KarthikAI Active"}
            </span>
          </div>
        </div>

        {/* Center Mode Switch Tabs */}
        <div className="app-mode-switch glass-panel">
          <button
            type="button"
            className={`mode-switch-btn ${appMode === "chat" ? "active" : ""}`}
            onClick={() => setAppMode("chat")}
            title="General AI Assistant"
          >
            <MessageSquare size={14} />
            <span>Chat</span>
          </button>
          <button
            type="button"
            className={`mode-switch-btn study ${appMode === "study" ? "active" : ""}`}
            onClick={() => setAppMode("study")}
            title="Anna University CSE Exam Prep Agent"
          >
            <GraduationCap size={15} />
            <span>Study Agent</span>
          </button>
        </div>

        <div className="header-right">
          <div className="model-selector-wrapper">
            <select
              value={activeModel || inputModel || "gemini"}
              onChange={(e) => {
                const val = e.target.value;
                onChangeModel?.(val);
                if (val === "groq" || val === "hf" || val === "gemini") {
                  setInputModel(val === "hf" ? "groq" : val);
                }
              }}
              className="model-dropdown-select glass-panel"
              title="Select AI Model"
              disabled={isLoading}
            >
              <option value="gemini">Gemini (Default)</option>
              <option value="groq">Groq (Llama 3.3 70B)</option>
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

      {/* Study Agent Navigation & Quick Mode Selector Bar */}
      {appMode === "study" && (
        <div className="study-agent-bar glass-panel animate-fade-in">
          <div className="study-modes-row">
            <span className="study-bar-label">
              <GraduationCap size={15} className="study-icon-grad" />
              <span>Exam Mode:</span>
            </span>
            <button
              type="button"
              className={`study-mode-pill ${studyMode === "2-marks" ? "active" : ""}`}
              onClick={() => setStudyMode("2-marks")}
              title="Generate 10 Part-A 2-mark questions and answers"
            >
              <FileText size={13} />
              <span>2-Mark Q&A</span>
            </button>
            <button
              type="button"
              className={`study-mode-pill ${studyMode === "16-marks" ? "active" : ""}`}
              onClick={() => setStudyMode("16-marks")}
              title="Generate high-scoring 16-mark structured answers with diagram placeholders"
            >
              <BookOpen size={13} />
              <span>16-Mark Q&A</span>
            </button>
            <button
              type="button"
              className={`study-mode-pill ${studyMode === "unit-summary" ? "active" : ""}`}
              onClick={() => setStudyMode("unit-summary")}
              title="Generate quick revision cheat sheet & concept matrix"
            >
              <Layers size={13} />
              <span>Quick Revision</span>
            </button>
            <button
              type="button"
              className={`study-mode-pill ${studyMode === "tanglish-explain" ? "active" : ""}`}
              onClick={() => setStudyMode("tanglish-explain")}
              title="Explain in beginner-friendly Tanglish with real-world analogies"
            >
              <Zap size={13} />
              <span>Tanglish Explain</span>
            </button>
          </div>

          <div className="study-bar-meta">
            <span className="study-desc-text">{getStudyModeDescription()}</span>
            <div className="study-chips-scroll">
              {STUDY_QUICK_CHIPS.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="study-quick-chip"
                  onClick={() => setInput(chip)}
                  title={`Load topic: ${chip}`}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Message Stream */}
      <div className="message-stream-container">
        {messages.length === 0 ? (
          <div className="welcome-container animate-fade-in">
            <div className="welcome-glow"></div>
            <div className="welcome-logo">
              {appMode === "study" ? (
                <GraduationCap size={38} className="logo-ai" style={{ color: "#38bdf8" }} />
              ) : (
                <Bot size={36} className="logo-ai" />
              )}
            </div>

            <h1 className="welcome-title">
              {appMode === "study" ? "Anna University CSE Exam Prep" : "KarthikAI Intelligence"}
            </h1>

            <p className="welcome-subtitle">
              {appMode === "study"
                ? "Tailored revision notes, 10 Part-A Q&As, 16-Mark structured answers with diagrams, cheat sheets, and simple Tanglish explanations."
                : "Your next-generation AI assistant for coding, writing, research, and analysis."
              }
            </p>

            <div className="suggestions-grid">
              {(appMode === "study" ? STUDY_SUGGESTIONS : CHAT_SUGGESTIONS).map((sug, idx) => (
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
        {selectedFile && (
          <div className="attachment-preview glass-panel animate-fade-in">
            <div className="attachment-info">
              {selectedFile.type.startsWith("image/") ? (
                <div className="image-preview-thumbnail-wrapper">
                  <img
                    src={base64Data ? `data:${selectedFile.type};base64,${base64Data}` : ""}
                    alt="Preview"
                    className="image-preview-thumbnail"
                  />
                </div>
              ) : (
                <FileText size={16} className="pdf-icon" />
              )}
              <span className="attachment-name">{selectedFile.name}</span>
              {selectedFile.type.startsWith("image/") ? (
                <span className="attachment-status ready">Image Ready</span>
              ) : isParsing ? (
                <span className="attachment-status">Indexing PDF...</span>
              ) : (
                <span className="attachment-status ready">
                  {appMode === "study" ? "Syllabus / Notes Ready" : "Parsed"}
                </span>
              )}
            </div>
            <button
              type="button"
              className="remove-attachment-btn"
              onClick={handleRemoveFile}
              title="Remove attachment"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {isSpeaking && (
          <div className="stop-speaking-bar animate-fade-in">
            <button className="stop-speaking-btn" onClick={handleStopSpeaking}>
              <VolumeX size={14} />
              <span>Stop Speaking</span>
            </button>
          </div>
        )}

        {/* Compact Model Selector Bar near chat input */}
        <div className="input-toolbar-row animate-fade-in">
          <div className="input-model-selector-wrapper">
            <Bot size={13} className="input-model-icon" />
            <span className="input-model-tag">Model:</span>
            <select
              value={inputModel}
              onChange={(e) => {
                const val = e.target.value;
                setInputModel(val);
                onChangeModel?.(val);
              }}
              className="input-model-dropdown"
              title="Select Chat Model"
              disabled={isLoading}
              aria-label="Select Chat Model"
            >
              <option value="gemini">Gemini (Default)</option>
              <option value="groq">Groq (Llama 3.3 70B)</option>
            </select>
          </div>

          <button
            type="button"
            className={`live-web-toggle-pill ${liveWebEnabled ? "active" : ""}`}
            onClick={() => setLiveWebEnabled(prev => !prev)}
            title={liveWebEnabled ? "Live Web & Grounding Active (2001–2026)" : "Live Web Search Disabled"}
          >
            <Globe size={12} className="live-web-icon" />
            <span>Live Web (2001–2026)</span>
            <span className={`live-web-dot ${liveWebEnabled ? "on" : "off"}`}></span>
          </button>
        </div>

        <div className={`input-box-wrapper glass-panel ${appMode === "study" ? "study-input-active" : ""}`}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) handleFileChange(file);
            }}
            accept="application/pdf,image/*"
            style={{ display: "none" }}
          />

          <button
            type="button"
            className={`paperclip-btn ${selectedFile ? "has-file" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            title={appMode === "study" ? "Upload syllabus or lecture notes PDF" : "Upload PDF or image"}
            disabled={isLoading || isParsing || voiceStatus === "listening"}
          >
            <Paperclip size={18} />
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isParsing
                ? "Parsing syllabus/notes document..."
                : voiceStatus === "listening"
                  ? "Listening... Click microphone to finish speaking..."
                  : voiceStatus === "processing"
                    ? "Transcribing voice input..."
                    : appMode === "study"
                      ? `Enter topic or unit (e.g. 'Operating Systems - Deadlocks') for ${studyMode === "2-marks" ? "2-Mark Q&A" : studyMode === "16-marks" ? "16-Mark Answers" : studyMode === "unit-summary" ? "Quick Revision" : "Tanglish Explanation"}...`
                      : "Ask KarthikAI anything..."
            }
            className={`chat-textarea ${voiceStatus === "listening" ? "textarea-listening" : ""} ${voiceStatus === "processing" ? "textarea-processing" : ""}`}
            disabled={isLoading || voiceStatus === "processing" || isParsing}
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
                ? (voiceError || "Audio input is not supported")
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
            className={`send-btn ${input.trim() || selectedFile ? "active" : ""} ${appMode === "study" ? "study-send-btn" : ""}`}
            onClick={handleSend}
            disabled={(!input.trim() && !selectedFile) || isLoading || voiceStatus === "processing" || isParsing}
            title={appMode === "study" ? "Generate Exam Material" : "Send message"}
          >
            {appMode === "study" ? <GraduationCap size={18} /> : <Send size={18} />}
          </button>
        </div>
        {voiceError ? (
          <p className="input-disclaimer voice-error-text">
            ⚠️ {voiceError}
          </p>
        ) : (
          <p className="input-disclaimer">
            {appMode === "study"
              ? "Anna University CSE Exam Specialist • Covers 2-Marks, 16-Marks with diagrams, Revision Cheat Sheets & Tanglish explanations."
              : "KarthikAI can assist with coding, general queries, and document analysis."
            }
          </p>
        )}
      </footer>

      <style dangerouslySetInnerHTML={{
        __html: `
        .chat-area {
          display: flex;
          flex-direction: column;
          flex-grow: 1;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          height: 100%;
          position: relative;
          background: radial-gradient(circle at 50% 50%, var(--bg-app) 0%, rgba(8, 11, 17, 0.95) 100%);
          overflow: hidden;
          box-sizing: border-box;
        }
        
        .chat-header {
          height: 60px;
          min-height: 60px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1.5rem;
          border-bottom: 1px solid var(--border-color);
          background-color: rgba(8, 11, 17, 0.4);
          z-index: 10;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          gap: 12px;
        }
        
        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
          flex: 1 1 auto;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .app-mode-switch {
          display: flex;
          align-items: center;
          gap: 3px;
          padding: 3px;
          border-radius: 12px;
          background-color: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--border-color);
          flex-shrink: 0;
        }
        body.light-mode .app-mode-switch {
          background-color: rgba(0, 0, 0, 0.03);
        }

        .mode-switch-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 12px;
          border-radius: 9px;
          font-size: 0.8rem;
          font-weight: 550;
          color: var(--text-muted);
          background: transparent;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .mode-switch-btn:hover {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.05);
        }
        .mode-switch-btn.active {
          color: #ffffff;
          background-color: var(--primary);
          box-shadow: 0 2px 8px var(--primary-glow);
        }
        .mode-switch-btn.study.active {
          background: linear-gradient(135deg, #0284c7, #2563eb);
          box-shadow: 0 2px 10px rgba(37, 99, 235, 0.3);
        }

        /* Study Bar */
        .study-agent-bar {
          padding: 8px 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 6px;
          border-bottom: 1px solid var(--border-color);
          background-color: rgba(14, 23, 42, 0.6);
          position: relative;
          z-index: 15;
          width: 100%;
          box-sizing: border-box;
        }
        body.light-mode .study-agent-bar {
          background-color: rgba(241, 245, 249, 0.85);
        }

        .study-modes-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .study-bar-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--text-muted);
          margin-right: 4px;
        }

        .study-icon-grad {
          color: #38bdf8;
        }

        .study-mode-pill {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 11px;
          border-radius: 8px;
          font-size: 0.76rem;
          font-weight: 550;
          color: var(--text-muted);
          background-color: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .study-mode-pill:hover {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.07);
          border-color: rgba(56, 189, 248, 0.4);
        }
        .study-mode-pill.active {
          color: #ffffff;
          background: linear-gradient(135deg, #0284c7, #0369a1);
          border-color: #38bdf8;
          box-shadow: 0 2px 10px rgba(56, 189, 248, 0.25);
        }

        .study-bar-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .study-desc-text {
          font-size: 0.73rem;
          color: var(--text-muted);
          font-style: italic;
        }

        .study-chips-scroll {
          display: flex;
          align-items: center;
          gap: 6px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          padding: 2px 0;
          max-width: 100%;
        }

        .study-quick-chip {
          padding: 2px 8px;
          border-radius: 9999px;
          font-size: 0.7rem;
          font-weight: 500;
          color: #38bdf8;
          background-color: rgba(56, 189, 248, 0.08);
          border: 1px solid rgba(56, 189, 248, 0.25);
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .study-quick-chip:hover {
          background-color: rgba(56, 189, 248, 0.18);
          border-color: #38bdf8;
          transform: translateY(-1px);
        }

        .study-badge {
          background: rgba(56, 189, 248, 0.12) !important;
          color: #38bdf8 !important;
          border-color: rgba(56, 189, 248, 0.3) !important;
        }

        .study-input-active {
          border-color: rgba(56, 189, 248, 0.35);
        }
        .study-input-active:focus-within {
          border-color: #38bdf8 !important;
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.2) !important;
        }

        .study-send-btn.active {
          background: linear-gradient(135deg, #0284c7, #2563eb) !important;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3) !important;
        }

        .model-selector-wrapper {
          display: flex;
          align-items: center;
          min-width: 0;
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
          max-width: 220px;
          text-overflow: ellipsis;
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
          flex-shrink: 0;
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
          flex-shrink: 0;
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
          min-width: 0;
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
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.2);
          white-space: nowrap;
          flex-shrink: 0;
        }

        .message-stream-container {
          flex-grow: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 1.5rem 1rem;
          display: flex;
          flex-direction: column;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          -webkit-overflow-scrolling: touch;
        }

        .welcome-container {
          margin: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          max-width: 640px;
          position: relative;
          z-index: 1;
          padding: 0 1rem;
          width: 100%;
          box-sizing: border-box;
        }

        .welcome-glow {
          position: absolute;
          width: 280px;
          height: 280px;
          background: radial-gradient(circle, var(--primary-glow) 0%, transparent 70%);
          top: -40px;
          z-index: -1;
          pointer-events: none;
        }

        .welcome-logo {
          width: 64px;
          height: 64px;
          border-radius: 20px;
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2));
          border: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 1.25rem;
          box-shadow: 0 10px 30px rgba(139, 92, 246, 0.2);
        }

        .logo-ai {
          color: var(--primary);
        }

        .welcome-title {
          font-family: var(--font-display);
          font-size: 2.2rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin-bottom: 0.5rem;
          background: linear-gradient(to right, var(--text-main), var(--text-muted));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .welcome-subtitle {
          color: var(--text-muted);
          font-size: 1rem;
          line-height: 1.6;
          margin-bottom: 2.5rem;
          max-width: 480px;
        }

        .suggestions-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          width: 100%;
          box-sizing: border-box;
        }

        .suggestion-card {
          padding: 1rem;
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 8px;
          text-align: left;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
        }
        .suggestion-card:hover {
          background-color: var(--bg-surface-hover);
          border-color: var(--primary);
          transform: translateY(-2px);
          box-shadow: var(--shadow-glow);
        }

        .suggestion-header {
          display: flex;
          align-items: center;
          color: var(--text-muted);
        }

        .suggest-icon.sparkle { color: #8b5cf6; }
        .suggest-icon.code { color: #3b82f6; }
        .suggest-icon.table { color: #10b981; }
        .suggest-icon.message { color: #ec4899; }

        .suggestion-text {
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--text-main);
          line-height: 1.4;
        }

        .message-list {
          width: 100%;
          max-width: 820px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
        }

        .chat-input-container {
          padding: 0 1.5rem 1.5rem;
          width: 100%;
          max-width: 820px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
          box-sizing: border-box;
        }

        .stop-speaking-bar {
          display: flex;
          justify-content: center;
          margin-bottom: 2px;
        }

        .input-toolbar-row {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 10px;
          padding: 0 4px;
          flex-wrap: wrap;
        }

        .live-web-toggle-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 11px;
          border-radius: 20px;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
          font-size: 0.78rem;
          font-weight: 550;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .live-web-toggle-pill:hover {
          border-color: #38bdf8;
          color: var(--text-main);
          background-color: var(--bg-surface-hover);
        }

        .live-web-toggle-pill.active {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.1);
          border-color: rgba(56, 189, 248, 0.4);
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.15);
        }

        .live-web-icon {
          color: #38bdf8;
        }

        .live-web-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: #64748b;
          transition: background-color 0.2s ease;
        }

        .live-web-dot.on {
          background-color: #10b981;
          box-shadow: 0 0 6px #10b981;
        }

        .live-web-dot.off {
          background-color: #ef4444;
        }

        .input-model-selector-wrapper {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 20px;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
          font-size: 0.78rem;
          color: var(--text-muted);
          transition: all 0.2s ease;
        }

        .input-model-selector-wrapper:hover {
          border-color: var(--primary);
          background-color: var(--bg-surface-hover);
        }

        .input-model-icon {
          color: #8b5cf6;
          flex-shrink: 0;
        }

        .input-model-tag {
          font-weight: 600;
          color: var(--text-muted);
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .input-model-dropdown {
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-main);
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          padding: 2px 4px;
          border-radius: 6px;
        }

        .input-model-dropdown option {
          background-color: #0f172a;
          color: #f8fafc;
        }

        .stop-speaking-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 20px;
          background-color: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444;
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .stop-speaking-btn:hover {
          background-color: rgba(239, 68, 68, 0.25);
        }

        .attachment-preview {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          border-radius: 12px;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
          width: fit-content;
          max-width: 100%;
          gap: 12px;
        }

        .attachment-info {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .pdf-icon {
          color: #ef4444;
          flex-shrink: 0;
        }

        .attachment-name {
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--text-main);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 250px;
        }

        .attachment-status {
          font-size: 0.72rem;
          padding: 2px 6px;
          border-radius: 4px;
          background-color: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
        }

        .attachment-status.ready {
          background-color: rgba(16, 185, 129, 0.15);
          color: #10b981;
        }

        .remove-attachment-btn {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .remove-attachment-btn:hover {
          color: #ef4444;
          background-color: rgba(239, 68, 68, 0.08);
        }

        .image-preview-thumbnail-wrapper {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          overflow: hidden;
          border: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .image-preview-thumbnail {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .input-box-wrapper {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 18px;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
          transition: all 0.2s ease;
          width: 100%;
          box-sizing: border-box;
        }
        .input-box-wrapper:focus-within {
          border-color: var(--primary);
          box-shadow: var(--shadow-glow);
        }
        
        .paperclip-btn {
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
        .paperclip-btn:hover {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.05);
        }
        .paperclip-btn.has-file {
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.3);
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
          min-width: 0;
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
          font-size: 0.72rem;
          color: var(--text-muted);
          text-align: center;
          word-break: break-word;
        }

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

        /* Responsive CSS Rules for Mobile & Tablet */
        @media (max-width: 768px) {
          .chat-header {
            height: 54px;
            min-height: 54px;
            padding: 0 0.75rem;
            gap: 8px;
          }
          .header-left {
            gap: 8px;
          }
          .header-title {
            font-size: 0.88rem;
            max-width: 110px;
          }
          .header-right {
            gap: 8px;
          }
          .model-dropdown-select {
            padding: 5px 8px;
            font-size: 0.78rem;
            max-width: 110px;
          }
          .mode-switch-btn {
            padding: 4px 8px;
            font-size: 0.75rem;
          }
          .study-agent-bar {
            padding: 6px 0.75rem;
            gap: 6px;
          }
          .study-mode-pill {
            padding: 3px 8px;
            font-size: 0.72rem;
          }
          .message-stream-container {
            padding: 1rem 0.75rem;
          }
          .welcome-container {
            margin: 1.5rem auto 0;
            padding: 0 0.5rem;
          }
          .welcome-title {
            font-size: 1.6rem;
          }
          .welcome-subtitle {
            font-size: 0.9rem;
            margin-bottom: 1.5rem;
          }
          .suggestions-grid {
            grid-template-columns: 1fr;
            gap: 8px;
          }
          .chat-input-container {
            padding: 0 0.75rem 0.75rem;
          }
        }

        @media (max-width: 480px) {
          .chat-header {
            height: 50px;
            min-height: 50px;
            padding: 0 0.5rem;
            gap: 6px;
          }
          .header-left {
            gap: 6px;
          }
          .header-title {
            display: none;
          }
          .header-badge {
            display: none;
          }
          .header-right {
            gap: 6px;
          }
          .model-dropdown-select {
            padding: 4px 6px;
            font-size: 0.72rem;
            max-width: 90px;
          }
          .settings-trigger-btn {
            width: 32px;
            height: 32px;
          }
          .menu-btn {
            width: 32px;
            height: 32px;
          }
          .mode-switch-btn span {
            display: none;
          }
          .mode-switch-btn {
            padding: 6px 8px;
          }
          .study-agent-bar {
            padding: 6px 0.5rem;
          }
          .study-modes-row {
            gap: 4px;
          }
          .study-mode-pill {
            padding: 3px 6px;
            font-size: 0.68rem;
          }
          .study-bar-meta {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }
          .study-desc-text {
            font-size: 0.68rem;
          }
          .message-stream-container {
            padding: 0.75rem 0.5rem;
          }
          .message-list {
            padding-bottom: 1rem;
          }
          .welcome-container {
            margin: 0.75rem auto 0;
            padding: 0 0.25rem;
          }
          .welcome-logo {
            width: 52px;
            height: 52px;
            border-radius: 16px;
            margin-bottom: 0.75rem;
          }
          .welcome-title {
            font-size: 1.3rem;
          }
          .welcome-subtitle {
            font-size: 0.8rem;
            margin-bottom: 1rem;
          }
          .suggestion-card {
            padding: 0.85rem;
            border-radius: 12px;
          }
          .suggestion-text {
            font-size: 0.8rem;
          }
          .chat-input-container {
            padding: 0 0.5rem 0.5rem;
            gap: 4px;
          }
          .input-box-wrapper {
            padding: 6px 8px;
            gap: 6px;
            border-radius: 16px;
          }
          .chat-textarea {
            font-size: 0.88rem;
            padding: 6px 2px;
          }
          .paperclip-btn, .mic-btn, .send-btn {
            width: 32px;
            height: 32px;
            border-radius: 10px;
          }
          .paperclip-btn svg, .mic-btn svg, .send-btn svg {
            width: 15px;
            height: 15px;
          }
          .lang-toggle-btn {
            height: 32px;
            padding: 0 5px;
            font-size: 0.68rem;
            border-radius: 10px;
          }
          .lang-toggle-btn svg {
            width: 12px;
            height: 12px;
          }
          .input-disclaimer {
            font-size: 0.68rem;
          }
          .attachment-preview {
            padding: 6px 10px;
            border-radius: 10px;
          }
          .attachment-name {
            max-width: 140px;
            font-size: 0.78rem;
          }
        }
      `}} />
    </div>
  );
}

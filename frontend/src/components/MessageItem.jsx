import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { User, Bot, Copy, Check, Volume2, VolumeX } from "lucide-react";

// Preprocess markdown to ensure table blocks have proper newline boundaries, matching columns and blank lines
function preprocessMarkdown(content) {
  if (!content || typeof content !== "string") return "";
  
  // Normalize CRLF to LF
  const formatted = content.replace(/\r\n/g, "\n");
  const lines = formatted.split("\n");
  const processedLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trim = line.trim();
    
    // Check if current line contains pipes and looks like a table header
    const hasPipes = trim.includes("|");
    if (hasPipes && i + 1 < lines.length) {
      const nextTrim = lines[i + 1].trim();
      // Check if next line is a separator row with dashes and pipes (e.g. |---|---| or |:---|:---:| or ---|---|---)
      if (/^\|?(\s*:?-+:?\s*\|?)+\s*$/.test(nextTrim) && nextTrim.includes("-") && nextTrim.includes("|")) {
        // Normalize header line to start and end with |
        let normalizedHeader = trim;
        if (!normalizedHeader.startsWith("|")) normalizedHeader = "| " + normalizedHeader;
        if (!normalizedHeader.endsWith("|")) normalizedHeader = normalizedHeader + " |";
        
        // Count columns in header
        const headerCols = normalizedHeader.split("|").filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).length;
        
        // Ensure blank line before table if previous line is not blank
        if (processedLines.length > 0 && processedLines[processedLines.length - 1].trim() !== "") {
          processedLines.push("");
        }
        
        processedLines.push(normalizedHeader);
        
        // Generate valid matching separator with exact column count
        const fixedSep = "| " + Array(Math.max(headerCols, 1)).fill("---").join(" | ") + " |";
        processedLines.push(fixedSep);
        
        i++; // skip original separator row
        
        // Consume following table data rows and ensure they start and end with | and retain separate newlines
        while (i + 1 < lines.length) {
          const nextRow = lines[i + 1];
          const nextRowTrim = nextRow.trim();
          if (nextRowTrim.includes("|") && !/^\|?(\s*:?-+:?\s*\|?)+\s*$/.test(nextRowTrim)) {
            let normRow = nextRowTrim;
            if (!normRow.startsWith("|")) normRow = "| " + normRow;
            if (!normRow.endsWith("|")) normRow = normRow + " |";
            processedLines.push(normRow);
            i++;
          } else {
            break;
          }
        }
        
        // Ensure blank line after table
        if (i + 1 < lines.length && lines[i + 1].trim() !== "") {
          processedLines.push("");
        }
        continue;
      }
    }
    
    processedLines.push(line);
  }
  
  return processedLines.join("\n");
}

// CodeBlock helper for formatting code blocks with headers and copy features
function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span>{language || "code"}</span>
        <button onClick={handleCopy} className="copy-code-btn" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "Copied!" : "Copy code"}</span>
        </button>
      </div>
      <pre>
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  );
}

export default function MessageItem({ message }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [isSpeakingThis, setIsSpeakingThis] = useState(false);

  // Stop speaking tracker when global cancel is called
  React.useEffect(() => {
    const handleGlobalStop = () => {
      setIsSpeakingThis(false);
    };
    
    // Since cancel triggers onend/onerror, we monitor global states.
    // If the browser stops speaking, toggle this indicator off.
    const interval = setInterval(() => {
      if (isSpeakingThis && window.speechSynthesis && !window.speechSynthesis.speaking) {
        setIsSpeakingThis(false);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isSpeakingThis]);

  const handleReadAloud = () => {
    if (!window.speechSynthesis) {
      alert("Text-to-speech is not supported in this browser.");
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      if (isSpeakingThis) {
        setIsSpeakingThis(false);
        return;
      }
    }

    // Clean markdown characters from synthesis input
    const cleanText = message.content
      .replace(/[*#`_\-]/g, "") 
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") 
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Auto-detect language: if Tamil characters match, speak in Tamil, else English
    const hasTamil = /[\u0B80-\u0BFF]/.test(cleanText);
    utterance.lang = hasTamil ? "ta-IN" : "en-US";

    utterance.onstart = () => {
      setIsSpeakingThis(true);
    };

    utterance.onend = () => {
      setIsSpeakingThis(false);
    };

    utterance.onerror = () => {
      setIsSpeakingThis(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Custom components for react-markdown renderer
  const markdownComponents = {
    table({ node, children, ...props }) {
      return (
        <div className="weather-table-container">
          <table className="weather-styled-table" {...props}>
            {children}
          </table>
        </div>
      );
    },
    thead({ node, children, ...props }) {
      return <thead className="weather-table-head" {...props}>{children}</thead>;
    },
    tbody({ node, children, ...props }) {
      return <tbody className="weather-table-body" {...props}>{children}</tbody>;
    },
    tr({ node, children, ...props }) {
      return <tr className="weather-table-row" {...props}>{children}</tr>;
    },
    th({ node, children, ...props }) {
      return <th className="weather-table-th" {...props}>{children}</th>;
    },
    td({ node, children, ...props }) {
      return <td className="weather-table-td" {...props}>{children}</td>;
    },
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const isInline = !className || !className.startsWith("language-");
      
      if (!isInline && match) {
        return (
          <CodeBlock
            language={match[1]}
            code={String(children).replace(/\n$/, "")}
          />
        );
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
  };

  return (
    <div className={`message-row ${isUser ? "user-message-row" : "ai-message-row"} animate-fade-in`}>
      {!isUser && (
        <div className="avatar ai-avatar">
          <Bot size={18} />
        </div>
      )}
      
      <div className="bubble-container">
        <div className={`message-bubble ${isUser ? "user-bubble" : "ai-bubble glass-panel"}`}>
          {isUser ? (
            <div className="message-text user-text">{message.content}</div>
          ) : (
            <div className="markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {preprocessMarkdown(message.content)}
              </ReactMarkdown>
            </div>
          )}
          
          {/* Voice read-aloud and Copy response buttons for AI responses */}
          {!isUser && (
            <div className="bubble-actions" style={{ gap: '8px' }}>
              <button
                className={`bubble-action-btn ${isSpeakingThis ? "speaking" : ""}`}
                onClick={handleReadAloud}
                title={isSpeakingThis ? "Stop reading" : "Read aloud"}
              >
                {isSpeakingThis ? <VolumeX size={14} style={{ color: '#ef4444' }} /> : <Volume2 size={14} />}
                <span>{isSpeakingThis ? "Stop" : "Read"}</span>
              </button>

              <button 
                className={`bubble-action-btn ${copied ? "copied" : ""}`} 
                onClick={handleCopyMessage}
                title="Copy entire response"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          )}
        </div>
        
        <span className="timestamp">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {isUser && (
        <div className="avatar user-avatar">
          <User size={18} />
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .message-row {
          display: flex;
          margin-bottom: 1.5rem;
          gap: 12px;
          max-width: 85%;
        }
        .user-message-row {
          margin-left: auto;
          flex-direction: row;
          justify-content: flex-end;
        }
        .ai-message-row {
          margin-right: auto;
        }
        
        .avatar {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: var(--shadow-sm);
        }
        .user-avatar {
          background-color: var(--primary);
          color: var(--text-inverse);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .ai-avatar {
          background: linear-gradient(135deg, #10b981, #06b6d4);
          color: white;
        }
        
        .bubble-container {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .user-message-row .bubble-container {
          align-items: flex-end;
        }
        
        .message-bubble {
          padding: 1rem 1.25rem;
          border-radius: 16px;
          position: relative;
          max-width: 100%;
          word-break: break-word;
        }
        .user-bubble {
          background-color: var(--user-bubble);
          color: var(--user-bubble-text);
          border-bottom-right-radius: 2px;
          box-shadow: 0 4px 10px rgba(37, 99, 235, 0.2);
        }
        body.light-mode .user-bubble {
          box-shadow: 0 4px 10px rgba(124, 58, 237, 0.2);
        }
        .ai-bubble {
          background-color: var(--ai-bubble);
          border-bottom-left-radius: 2px;
          border-color: var(--border-color);
        }
        
        .user-text {
          white-space: pre-wrap;
          font-size: 0.95rem;
          line-height: 1.5;
        }
        
        .timestamp {
          font-size: 0.7rem;
          color: var(--text-muted);
          padding: 0 4px;
        }
        
        /* Copy action buttons overlay */
        .bubble-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 0.75rem;
          border-top: 1px solid var(--border-color);
          padding-top: 0.5rem;
          opacity: 0.6;
          transition: opacity 0.2s ease;
        }
        .message-bubble:hover .bubble-actions {
          opacity: 1;
        }
        .bubble-action-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          color: var(--text-muted);
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid var(--border-color);
          background: rgba(255, 255, 255, 0.02);
        }
        .bubble-action-btn:hover {
          color: var(--text-main);
          background: rgba(255, 255, 255, 0.05);
          border-color: var(--text-muted);
        }
        .bubble-action-btn.copied {
          color: #10b981;
          border-color: #10b981;
        }
        
        /* Code block copy styling */
        .copy-code-btn {
          font-size: 0.7rem;
          color: var(--text-muted);
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid var(--border-color);
          background: rgba(255, 255, 255, 0.05);
        }
        .copy-code-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.1);
        }
        
        /* Weather Table Styling */
        .weather-table-container {
          width: 100%;
          overflow-x: auto;
          margin: 1rem 0;
          border-radius: 12px;
          border: 1px solid var(--border-color);
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
        }

        .weather-table-container::-webkit-scrollbar {
          height: 6px;
        }

        .weather-table-container::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.1);
          border-radius: 4px;
        }

        .weather-table-container::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }

        .weather-styled-table {
          width: 100%;
          min-width: 480px;
          border-collapse: collapse;
          font-family: var(--font-sans);
          font-size: 0.88rem;
          text-align: left;
          line-height: 1.4;
        }

        .weather-table-head {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        }

        .weather-table-th {
          padding: 12px 16px;
          color: var(--text-main);
          font-weight: 600;
          font-size: 0.82rem;
          letter-spacing: 0.03em;
          text-transform: capitalize;
          white-space: nowrap;
          border: none;
        }

        .weather-table-row {
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          transition: background-color 0.15s ease;
        }

        .weather-table-row:last-child {
          border-bottom: none;
        }

        .weather-table-row:nth-child(even) {
          background: rgba(255, 255, 255, 0.015);
        }

        .weather-table-row:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .weather-table-td {
          padding: 11px 16px;
          color: var(--text-main);
          border: none;
          white-space: nowrap;
          vertical-align: middle;
        }

        body.light-mode .weather-table-container {
          background: rgba(255, 255, 255, 0.9);
          border-color: rgba(0, 0, 0, 0.1);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
        }

        body.light-mode .weather-table-head {
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.05) 0%, rgba(0, 0, 0, 0.02) 100%);
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        }

        body.light-mode .weather-table-th {
          color: #0f172a;
        }

        body.light-mode .weather-table-row {
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        }

        body.light-mode .weather-table-row:nth-child(even) {
          background: rgba(0, 0, 0, 0.015);
        }

        body.light-mode .weather-table-row:hover {
          background: rgba(0, 0, 0, 0.04);
        }

        body.light-mode .weather-table-td {
          color: #1e293b;
        }

        @media (max-width: 768px) {
          .message-row {
            max-width: 95%;
          }
          .avatar {
            width: 30px;
            height: 30px;
            border-radius: 8px;
          }
          .avatar svg {
            width: 14px;
            height: 14px;
          }
          .message-bubble {
            padding: 0.85rem 1rem;
          }
        }
      `}} />
    </div>
  );
}

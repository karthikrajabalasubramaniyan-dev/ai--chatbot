import React from "react";
import { Bot } from "lucide-react";

export default function TypingIndicator() {
  return (
    <div className="message-row ai-message-row animate-fade-in">
      <div className="avatar ai-avatar">
        <Bot size={18} />
      </div>
      <div className="bubble-container">
        <div className="message-bubble ai-bubble glass-panel typing-bubble">
          <div className="dots-container">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .typing-bubble {
          padding: 1rem 1.25rem;
          display: inline-flex;
          align-items: center;
          border-radius: 0 16px 16px 16px;
        }
        .dots-container {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: var(--primary);
          animation: pulse 1.4s infinite ease-in-out both;
        }
        .dot:nth-child(1) {
          animation-delay: -0.32s;
        }
        .dot:nth-child(2) {
          animation-delay: -0.16s;
        }
      `}} />
    </div>
  );
}

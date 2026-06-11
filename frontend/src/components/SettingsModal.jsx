import React, { useState, useEffect } from "react";
import { X, Key, Shield, Eye, EyeOff, Save, Loader2 } from "lucide-react";

export default function SettingsModal({ isOpen, onClose, settings, onSave }) {
  const [defaultModel, setDefaultModel] = useState("gemini");
  const [geminiKey, setGeminiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [claudeKey, setClaudeKey] = useState("");

  const [showKeys, setShowKeys] = useState({
    gemini: false,
    openai: false,
    claude: false,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync state when settings object or open state changes
  useEffect(() => {
    if (isOpen && settings) {
      setDefaultModel(settings.defaultModel || "gemini");
      setGeminiKey(settings.apiKeys?.gemini || "");
      setOpenaiKey(settings.apiKeys?.openai || "");
      setClaudeKey(settings.apiKeys?.claude || "");
      setSaveSuccess(false);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleToggleShow = (modelKey) => {
    setShowKeys((prev) => ({
      ...prev,
      [modelKey]: !prev[modelKey],
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave({
        defaultModel,
        apiKeys: {
          gemini: geminiKey,
          openai: openaiKey,
          claude: claudeKey,
        },
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1000);
    } catch (err) {
      console.error("Save settings error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div
        className="settings-modal-card glass-panel animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div className="modal-title-area">
            <div className="modal-icon-wrapper">
              <Shield size={20} className="shield-icon" />
            </div>
            <div>
              <h3>AI Model Settings</h3>
              <p className="modal-subtitle">Configure model routing and private API credentials</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close settings">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSave} className="modal-form">
          <div className="form-group">
            <label htmlFor="default-model-select" className="form-label">
              Default AI Assistant
            </label>
            <select
              id="default-model-select"
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              className="settings-select"
            >
              <option value="gemini">Gemini 2.5 Flash (Default)</option>
              <option value="openai">OpenAI GPT-4o-mini</option>
              <option value="claude">Anthropic Claude 3.5 Sonnet</option>
            </select>
            <p className="field-hint">
              This model will start by default for new conversations.
            </p>
          </div>

          <div className="divider"></div>

          <h4 className="section-title">API Keys Configuration</h4>
          <p className="section-subtitle">
            Keys are stored locally on your device in your configuration folder. Left blank or unmodified keys will fall back to environment settings or simulate mock responses.
          </p>

          {/* Gemini API Key */}
          <div className="form-group">
            <div className="label-with-icon">
              <Key size={14} className="key-field-icon gemini-color" />
              <label htmlFor="gemini-key-input" className="form-label">
                Google Gemini API Key
              </label>
            </div>
            <div className="input-with-action">
              <input
                id="gemini-key-input"
                type={showKeys.gemini ? "text" : "password"}
                placeholder={
                  geminiKey ? "••••••••••••••••" : "Enter Gemini API Key (AIzaSy...)"
                }
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className="settings-input"
              />
              <button
                type="button"
                className="input-action-btn"
                onClick={() => handleToggleShow("gemini")}
                title={showKeys.gemini ? "Hide Key" : "Show Key"}
              >
                {showKeys.gemini ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* OpenAI API Key */}
          <div className="form-group">
            <div className="label-with-icon">
              <Key size={14} className="key-field-icon openai-color" />
              <label htmlFor="openai-key-input" className="form-label">
                OpenAI API Key
              </label>
            </div>
            <div className="input-with-action">
              <input
                id="openai-key-input"
                type={showKeys.openai ? "text" : "password"}
                placeholder={
                  openaiKey ? "••••••••••••••••" : "Enter OpenAI API Key (sk-...)"
                }
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="settings-input"
              />
              <button
                type="button"
                className="input-action-btn"
                onClick={() => handleToggleShow("openai")}
                title={showKeys.openai ? "Hide Key" : "Show Key"}
              >
                {showKeys.openai ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Claude API Key */}
          <div className="form-group">
            <div className="label-with-icon">
              <Key size={14} className="key-field-icon claude-color" />
              <label htmlFor="claude-key-input" className="form-label">
                Anthropic Claude API Key
              </label>
            </div>
            <div className="input-with-action">
              <input
                id="claude-key-input"
                type={showKeys.claude ? "text" : "password"}
                placeholder={
                  claudeKey ? "••••••••••••••••" : "Enter Claude API Key (sk-ant-...)"
                }
                value={claudeKey}
                onChange={(e) => setClaudeKey(e.target.value)}
                className="settings-input"
              />
              <button
                type="button"
                className="input-action-btn"
                onClick={() => handleToggleShow("claude")}
                title={showKeys.claude ? "Hide Key" : "Show Key"}
              >
                {showKeys.claude ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="cancel-btn"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`save-settings-btn ${saveSuccess ? "success" : ""}`}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : saveSuccess ? (
                <span>Saved Settings!</span>
              ) : (
                <>
                  <Save size={16} />
                  <span>Save Config</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(3, 5, 8, 0.7);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .settings-modal-card {
          width: 90%;
          max-width: 520px;
          border-radius: 24px;
          background-color: rgba(13, 17, 24, 0.75);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
          overflow: hidden;
          color: #f3f4f6;
        }
        body.light-mode .settings-modal-card {
          background-color: rgba(255, 255, 255, 0.8);
          border-color: rgba(0, 0, 0, 0.08);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.1);
          color: #1f2937;
        }

        .modal-header {
          padding: 1.5rem;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        body.light-mode .modal-header {
          border-bottom-color: rgba(0, 0, 0, 0.06);
        }

        .modal-title-area {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .modal-icon-wrapper {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: rgba(139, 92, 246, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .shield-icon {
          color: var(--primary);
        }

        .modal-header h3 {
          font-size: 1.15rem;
          font-weight: 650;
          margin: 0;
        }
        .modal-subtitle {
          font-size: 0.78rem;
          color: var(--text-muted);
          margin: 2px 0 0 0;
        }

        .modal-close-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
        }
        .modal-close-btn:hover {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.05);
        }
        body.light-mode .modal-close-btn:hover {
          background-color: rgba(0, 0, 0, 0.05);
        }

        .modal-form {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-label {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text-muted);
        }
        body.light-mode .form-label {
          color: #4b5563;
        }

        .settings-select {
          padding: 10px 14px;
          border-radius: 12px;
          background-color: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #f3f4f6;
          font-size: 0.9rem;
          outline: none;
          cursor: pointer;
          transition: all 0.2s;
        }
        body.light-mode .settings-select {
          background-color: rgba(0, 0, 0, 0.02);
          border-color: rgba(0, 0, 0, 0.08);
          color: #1f2937;
        }
        .settings-select:focus {
          border-color: var(--primary);
        }

        .field-hint {
          font-size: 0.72rem;
          color: var(--text-muted);
          margin: 2px 0 0 0;
        }

        .divider {
          height: 1px;
          background-color: rgba(255, 255, 255, 0.06);
          margin: 4px 0;
        }
        body.light-mode .divider {
          background-color: rgba(0, 0, 0, 0.06);
        }

        .section-title {
          font-size: 0.9rem;
          font-weight: 650;
          margin: 0;
        }
        .section-subtitle {
          font-size: 0.74rem;
          color: var(--text-muted);
          line-height: 1.4;
          margin: -4px 0 4px 0;
        }

        .label-with-icon {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .key-field-icon {
          opacity: 0.7;
        }
        .gemini-color { color: var(--primary); }
        .openai-color { color: #10b981; }
        .claude-color { color: #f59e0b; }

        .input-with-action {
          position: relative;
          display: flex;
          align-items: center;
        }

        .settings-input {
          width: 100%;
          padding: 10px 42px 10px 14px;
          border-radius: 12px;
          background-color: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #f3f4f6;
          font-size: 0.9rem;
          outline: none;
          transition: all 0.2s;
        }
        body.light-mode .settings-input {
          background-color: rgba(0, 0, 0, 0.02);
          border-color: rgba(0, 0, 0, 0.08);
          color: #1f2937;
        }
        .settings-input:focus {
          border-color: var(--primary);
          background-color: rgba(255, 255, 255, 0.05);
        }
        body.light-mode .settings-input:focus {
          background-color: rgba(0, 0, 0, 0.01);
        }

        .input-action-btn {
          position: absolute;
          right: 12px;
          color: var(--text-muted);
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
        }
        .input-action-btn:hover {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.06);
        }
        body.light-mode .input-action-btn:hover {
          background-color: rgba(0, 0, 0, 0.06);
        }

        .modal-footer {
          margin-top: 0.75rem;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
        }

        .cancel-btn {
          padding: 10px 18px;
          border-radius: 12px;
          font-size: 0.88rem;
          font-weight: 550;
          color: var(--text-muted);
          background-color: transparent;
        }
        .cancel-btn:hover {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.05);
        }
        body.light-mode .cancel-btn:hover {
          background-color: rgba(0, 0, 0, 0.05);
        }

        .save-settings-btn {
          padding: 10px 18px;
          border-radius: 12px;
          font-size: 0.88rem;
          font-weight: 600;
          color: white;
          background-color: var(--primary);
          box-shadow: 0 4px 14px var(--primary-glow);
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }
        .save-settings-btn:hover {
          background-color: var(--primary-hover);
          transform: translateY(-1px);
        }
        .save-settings-btn.success {
          background-color: #10b981;
          box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);
        }

        /* Animations */
        .animate-spin {
          animation: spin 1s infinite linear;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .animate-scale-in {
          animation: scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes scaleIn {
          from { transform: scale(0.92); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}} />
    </div>
  );
}

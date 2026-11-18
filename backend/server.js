const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.json({
    status: "Running",
    message: "KarthikAI Chatbot Backend API",
    version: "2.1.0"
  });
});

app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"]
}));
app.options("*", cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Settings JSON database path and helpers
const SETTINGS_FILE = path.join(__dirname, "data", "settings.json");

function ensureSettingsDir() {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readSettings() {
  try {
    ensureSettingsDir();
    if (!fs.existsSync(SETTINGS_FILE)) {
      return {
        defaultModel: "groq",
        apiKeys: {
          gemini: "",
          groq: "",
          openai: "",
          claude: ""
        }
      };
    }
    const data = fs.readFileSync(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(data || "{}");
    return {
      defaultModel: parsed.defaultModel || "groq",
      apiKeys: {
        gemini: parsed.apiKeys?.gemini || "",
        groq: parsed.apiKeys?.groq || "",
        openai: parsed.apiKeys?.openai || "",
        claude: parsed.apiKeys?.claude || ""
      }
    };
  } catch (err) {
    console.error("Error reading settings file:", err);
    return {
      defaultModel: "groq",
      apiKeys: {
        gemini: "",
        groq: "",
        openai: "",
        claude: ""
      }
    };
  }
}

function writeSettings(settings) {
  try {
    ensureSettingsDir();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("Error writing settings file:", err);
    return false;
  }
}

function sanitizeError(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [REDACTED]")
    .replace(/x-api-key["':\s]+[a-zA-Z0-9_\-\.]+/gi, "x-api-key: [REDACTED]")
    .replace(/key=[a-zA-Z0-9_\-\.]+/gi, "key=[REDACTED]")
    .replace(/sk-[a-zA-Z0-9_\-\.]{15,}/gi, "sk-[REDACTED]")
    .replace(/gsk_[a-zA-Z0-9_\-\.]{15,}/gi, "gsk-[REDACTED]")
    .replace(/AIza[a-zA-Z0-9_\-\.]{15,}/gi, "AIza[REDACTED]");
}

function resolveApiKey(model, settings = null) {
  const currentSettings = settings || readSettings();
  const m = (model || "").toLowerCase();
  if (m === "gemini") {
    return currentSettings.apiKeys.gemini || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  } else if (m === "groq") {
    return currentSettings.apiKeys.groq || process.env.GROQ_API_KEY || "";
  } else if (m === "openai") {
    return currentSettings.apiKeys.openai || process.env.OPENAI_API_KEY || "";
  } else if (m === "claude" || m === "anthropic") {
    return currentSettings.apiKeys.claude || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || "";
  }
  return "";
}

function isPlaceholderKey(key) {
  if (!key || typeof key !== "string") return true;
  const trimmed = key.trim();
  return (
    !trimmed ||
    trimmed === "your_gemini_api_key_here" ||
    trimmed === "your_google_api_key_here" ||
    trimmed === "your_groq_api_key_here" ||
    trimmed === "your_openai_api_key_here" ||
    trimmed === "your_claude_api_key_here" ||
    trimmed === "your_anthropic_api_key_here"
  );
}

function maskKey(key) {
  if (isPlaceholderKey(key)) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function isMasked(key) {
  if (!key) return false;
  return key.includes("...") || key.includes("•••") || key === "••••••••";
}

// Health check
app.get(["/api/health", "/api/v1/health"], (req, res) => {
  const settings = readSettings();
  const geminiKey = resolveApiKey("gemini", settings);
  const groqKey = resolveApiKey("groq", settings);
  const openaiKey = resolveApiKey("openai", settings);
  const claudeKey = resolveApiKey("claude", settings);

  const isLive = Boolean(
    !isPlaceholderKey(geminiKey) ||
    !isPlaceholderKey(groqKey) ||
    !isPlaceholderKey(openaiKey) ||
    !isPlaceholderKey(claudeKey)
  );
  res.json({ status: "ok", mode: isLive ? "live" : "mock" });
});

// Settings API endpoints
app.get(["/api/settings", "/api/v1/settings"], (req, res) => {
  const settings = readSettings();

  const geminiKey = resolveApiKey("gemini", settings);
  const groqKey = resolveApiKey("groq", settings);
  const openaiKey = resolveApiKey("openai", settings);
  const claudeKey = resolveApiKey("claude", settings);

  res.json({
    defaultModel: settings.defaultModel,
    apiKeys: {
      gemini: maskKey(geminiKey),
      groq: maskKey(groqKey),
      openai: maskKey(openaiKey),
      claude: maskKey(claudeKey)
    }
  });
});

app.post(["/api/settings", "/api/v1/settings"], (req, res) => {
  const { defaultModel, apiKeys } = req.body;
  if (!defaultModel) {
    return res.status(400).json({ error: "defaultModel is required" });
  }

  const currentSettings = readSettings();
  const newSettings = {
    defaultModel,
    apiKeys: {
      gemini: currentSettings.apiKeys.gemini,
      groq: currentSettings.apiKeys.groq,
      openai: currentSettings.apiKeys.openai,
      claude: currentSettings.apiKeys.claude
    }
  };

  if (apiKeys) {
    if (apiKeys.gemini !== undefined && !isMasked(apiKeys.gemini)) {
      newSettings.apiKeys.gemini = apiKeys.gemini.trim();
    }
    if (apiKeys.groq !== undefined && !isMasked(apiKeys.groq)) {
      newSettings.apiKeys.groq = apiKeys.groq.trim();
    }
    if (apiKeys.openai !== undefined && !isMasked(apiKeys.openai)) {
      newSettings.apiKeys.openai = apiKeys.openai.trim();
    }
    if (apiKeys.claude !== undefined && !isMasked(apiKeys.claude)) {
      newSettings.apiKeys.claude = apiKeys.claude.trim();
    }
  }

  writeSettings(newSettings);
  res.json({ success: true, settings: newSettings });
});

// Mock responses for testing when API key is missing
const mockResponses = [
  "Hello! I am KarthikAI Assistant. How can I help you today?",
  "That is an interesting question. In a production environment, I connect to real-time AI APIs to give you accurate insights.",
  "Here is some formatted code for you:\n\n```javascript\nfunction greet(name) {\n  console.log(`Hello, ${name}!`);\n}\n\ngreet('Developer');\n```",
  "I am ready to help you with coding, writing, and general questions."
];

let mockCounter = 0;

function getMockResponse(userMessage, model) {
  const modelName = model === "openai" ? "OpenAI GPT-4o-mini" :
    model === "claude" ? "Claude 3.5 Sonnet" :
      model === "groq" ? "Groq LLaMA" :
        "Gemini 2.5 Flash";

  const prefix = `[${modelName}] (Mock Mode)\n\n`;
  const msg = userMessage.toLowerCase().trim();

  if (msg.includes("hello") || msg.includes("hi") || msg.includes("hey")) {
    return prefix + "Hello there! I'm your KarthikAI assistant. Ask me anything or let me assist you with coding and answers!";
  }
  if (msg.includes("who are you") || msg.includes("your name")) {
    return prefix + "I am KarthikAI, an AI assistant built to help you with questions, coding, and everyday tasks.";
  }

  const resp = mockResponses[mockCounter % mockResponses.length];
  mockCounter++;
  return prefix + resp;
}

// -------------------------------------------------------------
// AI PROVIDER GENERATION FUNCTIONS
// -------------------------------------------------------------

async function generateGroqResponse(apiKey, { message, history }) {
  const Groq = require("groq-sdk");
  const groq = new Groq({ apiKey });

  const messages = [
    {
      role: "system",
      content: "You are KarthikAI, a helpful AI assistant. Answer clearly, concisely, and accurately."
    }
  ];

  if (history && Array.isArray(history)) {
    history.forEach(item => {
      if (item && item.content) {
        messages.push({
          role: item.role === "assistant" ? "assistant" : "user",
          content: item.content
        });
      }
    });
  }

  messages.push({
    role: "user",
    content: message
  });

  const candidateModels = ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b", "groq/compound", "groq/compound-mini"];
  let completion = null;
  let lastError = null;

  for (const modelId of candidateModels) {
    try {
      completion = await groq.chat.completions.create({
        model: modelId,
        messages,
        temperature: 0.5,
        max_tokens: 1024
      });
      if (completion?.choices?.[0]?.message?.content) break;
    } catch (err) {
      lastError = err;
      console.warn(`Groq model ${modelId} failed:`, sanitizeError(err.message));
    }
  }

  if (!completion && lastError) {
    throw new Error(`Groq failed: ${sanitizeError(lastError.message)}`);
  }

  return completion?.choices?.[0]?.message?.content || "";
}

async function generateGeminiResponse(apiKey, { message, history, attachment }) {
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);

  const formattedHistory = [];
  if (history && Array.isArray(history)) {
    history.forEach(item => {
      if (item && item.content) {
        formattedHistory.push({
          role: item.role === "assistant" ? "model" : "user",
          parts: [{ text: item.content }]
        });
      }
    });
  }

  const now = new Date();
  const currentDateTime = now.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  const systemPrompt = `You are KarthikAI, a helpful AI assistant. Current date and time in India is: ${currentDateTime}.\nIf user asks current date/time, answer using this information.`;

  const candidateGeminiModels = [
    "gemini-2.5-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.5-pro-latest",
    "gemini-pro"
  ];
  let responseText = null;
  let lastGeminiError = null;

  for (const modelId of candidateGeminiModels) {
    try {
      const geminiModel = genAI.getGenerativeModel({ model: modelId });
      const chat = geminiModel.startChat({
        history: [
          {
            role: "user",
            parts: [{ text: systemPrompt }]
          },
          {
            role: "model",
            parts: [{ text: "Understood. I will answer clearly and accurately." }]
          },
          ...formattedHistory
        ],
      });

      let result;
      if (attachment && attachment.data && attachment.mimeType) {
        result = await chat.sendMessage([
          {
            inlineData: {
              data: attachment.data,
              mimeType: attachment.mimeType
            }
          },
          message
        ]);
      } else {
        result = await chat.sendMessage(message);
      }
      responseText = result.response.text();
      if (responseText) break;
    } catch (err) {
      lastGeminiError = err;
      console.warn(`Gemini model ${modelId} failed:`, sanitizeError(err.message));
    }
  }

  if (!responseText && lastGeminiError) {
    throw new Error(`Gemini failed: ${sanitizeError(lastGeminiError.message)}`);
  }

  return responseText || "";
}

async function generateOpenAiResponse(apiKey, { message, history, attachment }) {
  const systemPrompt = "You are KarthikAI, a helpful AI assistant. Answer clearly, concisely, and accurately.";

  const messages = [
    { role: "system", content: systemPrompt }
  ];

  if (history && Array.isArray(history)) {
    history.forEach(item => {
      if (item && item.content) {
        messages.push({
          role: item.role === "assistant" ? "assistant" : "user",
          content: item.content
        });
      }
    });
  }

  if (attachment && attachment.data && attachment.mimeType && attachment.mimeType.startsWith("image/")) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: message },
        {
          type: "image_url",
          image_url: {
            url: `data:${attachment.mimeType};base64,${attachment.data}`
          }
        }
      ]
    });
  } else {
    messages.push({ role: "user", content: message });
  }

  const candidateModels = ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"];
  let responseText = null;
  let lastError = null;

  for (const modelId of candidateModels) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelId,
          messages: messages,
          temperature: 0.5,
          max_tokens: 1024
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI HTTP ${response.status}: ${sanitizeError(errorText)}`);
      }

      const data = await response.json();
      responseText = data.choices?.[0]?.message?.content || "";
      if (responseText) break;
    } catch (err) {
      lastError = err;
      console.warn(`OpenAI model ${modelId} failed:`, sanitizeError(err.message));
    }
  }

  if (!responseText && lastError) {
    throw new Error(`OpenAI failed: ${sanitizeError(lastError.message)}`);
  }

  return responseText || "";
}

async function generateClaudeResponse(apiKey, { message, history, attachment }) {
  const systemPrompt = "You are KarthikAI, a helpful AI assistant. Answer clearly, concisely, and accurately.";

  const rawMessages = [];
  if (history && Array.isArray(history)) {
    history.forEach(item => {
      if (item && item.content) {
        rawMessages.push({
          role: item.role === "assistant" ? "assistant" : "user",
          content: item.content
        });
      }
    });
  }

  const userContent = [];
  if (attachment && attachment.data && attachment.mimeType && attachment.mimeType.startsWith("image/")) {
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: attachment.mimeType,
        data: attachment.data
      }
    });
  }

  userContent.push({ type: "text", text: message });
  rawMessages.push({ role: "user", content: userContent });

  // Format messages to strictly alternate roles and ensure first message is user (Anthropic API requirement)
  const formattedMessages = [];
  for (let i = 0; i < rawMessages.length; i++) {
    const m = rawMessages[i];
    if (formattedMessages.length === 0 && m.role !== "user") {
      continue;
    }
    if (formattedMessages.length > 0 && formattedMessages[formattedMessages.length - 1].role === m.role) {
      // Merge consecutive same-role text contents
      const prev = formattedMessages[formattedMessages.length - 1];
      if (typeof prev.content === "string" && typeof m.content === "string") {
        prev.content += `\n\n${m.content}`;
      } else if (Array.isArray(prev.content) && Array.isArray(m.content)) {
        prev.content.push(...m.content);
      } else {
        formattedMessages.push(m);
      }
    } else {
      formattedMessages.push(m);
    }
  }

  if (formattedMessages.length === 0) {
    formattedMessages.push({ role: "user", content: userContent });
  }

  const candidateModels = [
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-latest",
    "claude-3-7-sonnet-20250219",
    "claude-3-5-haiku-20241022",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307"
  ];
  let responseText = null;
  let lastError = null;

  for (const modelId of candidateModels) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 1024,
          system: systemPrompt,
          messages: formattedMessages
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude HTTP ${response.status}: ${sanitizeError(errorText)}`);
      }

      const data = await response.json();
      responseText = data.content?.[0]?.text || "";
      if (responseText) break;
    } catch (err) {
      lastError = err;
      console.warn(`Claude model ${modelId} failed:`, sanitizeError(err.message));
    }
  }

  if (!responseText && lastError) {
    throw new Error(`Claude failed: ${sanitizeError(lastError.message)}`);
  }

  return responseText || "";
}

async function executeAiGeneration(modelName, apiKey, payload) {
  const m = (modelName || "").toLowerCase();
  if (m === "groq") {
    return await generateGroqResponse(apiKey, payload);
  } else if (m === "gemini") {
    return await generateGeminiResponse(apiKey, payload);
  } else if (m === "openai") {
    return await generateOpenAiResponse(apiKey, payload);
  } else if (m === "claude" || m === "anthropic") {
    return await generateClaudeResponse(apiKey, payload);
  }
  throw new Error(`Unsupported model: ${modelName}`);
}

// -------------------------------------------------------------
// CHAT API HANDLER (Supports /api/v1/chat and /api/chat)
// -------------------------------------------------------------
async function handleChatRequest(req, res) {
  const { message, history, session_id, model, attachment } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const settings = readSettings();
  const activeModel = (model || settings.defaultModel || "groq").toLowerCase();

  // Resolve API Key for requested model
  const apiKey = resolveApiKey(activeModel, settings);
  const isPlaceholder = isPlaceholderKey(apiKey);

  const aiPayload = {
    message,
    history,
    attachment
  };

  // Determine priority order of models to attempt (requested model first, then any other configured live models)
  const modelsToAttempt = [];
  if (!isPlaceholder) {
    modelsToAttempt.push({ model: activeModel, key: apiKey });
  }

  const otherModels = ["groq", "gemini", "openai", "claude"].filter(m => m !== activeModel);
  for (const altModel of otherModels) {
    const altKey = resolveApiKey(altModel, settings);
    if (!isPlaceholderKey(altKey)) {
      modelsToAttempt.push({ model: altModel, key: altKey });
    }
  }

  // If no live models are configured at all, return safe mock response
  if (modelsToAttempt.length === 0) {
    return res.json({
      response: getMockResponse(message, activeModel),
      session_id: session_id || ""
    });
  }

  // Attempt generation with cascade fallback across configured models
  let finalResponse = null;
  let lastAttemptError = null;

  for (const candidate of modelsToAttempt) {
    try {
      finalResponse = await executeAiGeneration(candidate.model, candidate.key, aiPayload);
      if (finalResponse) {
        break;
      }
    } catch (err) {
      lastAttemptError = err;
      console.warn(`Provider ${candidate.model} failed, attempting next fallback:`, sanitizeError(err.message));
    }
  }

  if (finalResponse) {
    return res.json({
      response: finalResponse,
      session_id: session_id || ""
    });
  }

  // Graceful fallback if all configured live providers fail
  console.error("All AI provider attempts failed:", sanitizeError(lastAttemptError?.message || "Unknown error"));

  return res.json({
    response: getMockResponse(message, activeModel),
    session_id: session_id || ""
  });
}

app.post(["/api/v1/chat", "/api/chat"], handleChatRequest);

// History REST endpoints
const HISTORY_FILE = path.join(__dirname, "data", "history.json");

function ensureHistoryDir() {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readHistory() {
  try {
    ensureHistoryDir();
    if (!fs.existsSync(HISTORY_FILE)) {
      return [];
    }
    const data = fs.readFileSync(HISTORY_FILE, "utf8");
    return JSON.parse(data || "[]");
  } catch (err) {
    console.error("Error reading history file:", err);
    return [];
  }
}

function writeHistory(historyData) {
  try {
    ensureHistoryDir();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyData, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("Error writing history file:", err);
    return false;
  }
}

app.get(["/api/history", "/api/v1/history"], (req, res) => {
  const history = readHistory();
  res.json(history);
});

app.post(["/api/history", "/api/v1/history"], (req, res) => {
  const conversation = req.body;
  if (!conversation || !conversation.id) {
    return res.status(400).json({ error: "Invalid conversation structure" });
  }

  let history = readHistory();
  const index = history.findIndex(c => c.id === conversation.id);

  if (index > -1) {
    history[index] = {
      ...history[index],
      ...conversation,
      updatedAt: new Date().toISOString()
    };
  } else {
    history.unshift({
      ...conversation,
      createdAt: conversation.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  writeHistory(history);
  res.json({ success: true, conversation: conversation });
});

app.delete(["/api/history/:id", "/api/v1/history/:id"], (req, res) => {
  const { id } = req.params;
  let history = readHistory();
  const filtered = history.filter(c => c.id !== id);
  writeHistory(filtered);
  res.json({ success: true });
});

app.delete(["/api/history", "/api/v1/history"], (req, res) => {
  writeHistory([]);
  res.json({ success: true });
});

// Transcribe audio using Gemini
app.post(["/api/transcribe", "/api/v1/transcribe"], async (req, res) => {
  const { audio, mimeType, language } = req.body;

  if (!audio) {
    return res.status(400).json({ error: "Audio data is required" });
  }

  const settings = readSettings();
  const apiKey = settings.apiKeys.gemini || process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    setTimeout(() => {
      res.json({ text: "Hello! This is a mock transcription because your API key is not configured." });
    }, 1200);
    return;
  }

  try {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const langHint = language === "ta-IN" ? "Tamil" : "English";

    const result = await model.generateContent([
      {
        inlineData: {
          data: audio,
          mimeType: mimeType || "audio/webm"
        }
      },
      `Provide only the transcription of this audio. The language spoken is likely ${langHint}. Do not add any introductory or explanatory text, formatting, or commentary. Output only the verbatim words spoken in the audio.`
    ]);

    const transcription = result.response.text().trim();
    res.json({ text: transcription });
  } catch (error) {
    console.error("Transcription API error:", error);
    res.status(500).json({
      error: "Failed to transcribe audio",
      details: error.message
    });
  }
});

let server;

function startServer(port = PORT) {
  server = app.listen(port, () => {
    console.log(`KarthikAI Backend server running on http://localhost:${port}`);
    console.log(`- POST /api/v1/chat`);
  });
  return server;
}

function stopServer() {
  if (server) {
    server.close();
    console.log("Backend server stopped.");
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer, stopServer, app };
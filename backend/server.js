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

// -------------------------------------------------------------
// GROQ CHAT ENDPOINT (POST /api/groq-chat, aliased to /api/hf-chat)
// Ultra-fast OpenAI-compatible endpoint with multi-model cascade & Gemini fallback
// -------------------------------------------------------------
async function handleGroqChatRequest(req, res) {
  const { message, history, session_id } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const groqKey = (process.env.GROQ_API_KEY || "").trim();

  if (!groqKey || isPlaceholderKey(groqKey)) {
    return res.json({
      response: `[Groq Demo Response]:\n\nHello! I received your message: "${message}". To enable live Groq inference, please set a valid GROQ_API_KEY in your backend .env file.`,
      model: "llama-3.3-70b-versatile",
      session_id: session_id || "",
      source: "mock"
    });
  }

  const messages = [
    {
      role: "system",
      content: "You are KarthikAI, a helpful AI assistant powered by Groq. Answer clearly, concisely, and accurately."
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

  // Primary: llama-3.3-70b-versatile, Secondary: llama-3.1-8b-instant, then available high-speed Groq models
  const candidateModels = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b"
  ];

  let reply = null;
  let successfulModel = null;
  let lastErrorDetail = null;

  for (const modelId of candidateModels) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: modelId,
          messages: messages,
          max_tokens: 1024,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Groq API notice [HTTP ${response.status}] for model ${modelId}:`, sanitizeError(errorText));
        lastErrorDetail = `HTTP ${response.status}: ${errorText}`;
        continue;
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content && content.trim()) {
        reply = content;
        successfulModel = modelId;
        break;
      }
    } catch (fetchErr) {
      console.warn(`Groq fetch exception for model ${modelId}:`, sanitizeError(fetchErr.message));
      lastErrorDetail = fetchErr.message;
    }
  }

  if (reply) {
    return res.json({
      response: reply,
      model: successfulModel || "llama-3.3-70b-versatile",
      session_id: session_id || "",
      source: "groq"
    });
  }

  // If all Groq models fail, log exact detail and fall back to Gemini
  console.error("All Groq models failed. Falling back to Gemini. Last error:", sanitizeError(lastErrorDetail || "Unknown error"));

  let fallbackText = null;
  try {
    const settings = readSettings();
    const geminiKey = resolveApiKey("gemini", settings);
    if (!isPlaceholderKey(geminiKey)) {
      const geminiReply = await generateGeminiResponse(geminiKey, { message, history });
      if (geminiReply) {
        fallbackText = geminiReply;
      }
    }
  } catch (fallbackErr) {
    console.error("Gemini fallback exception:", sanitizeError(fallbackErr.message));
  }

  if (!fallbackText) {
    fallbackText = `**[KarthikAI • Groq]**\n\nI processed your request: "${message}"\n\n*(Note: Groq notice: ${sanitizeError(lastErrorDetail || "Service temporarily unavailable")}. Please verify your GROQ_API_KEY or switch back to Gemini (Default).)*`;
  }

  return res.json({
    response: fallbackText,
    model: "llama-3.3-70b-versatile",
    session_id: session_id || "",
    source: "fallback",
    error: sanitizeError(lastErrorDetail || "Groq error")
  });
}

app.post(["/api/groq-chat", "/api/v1/groq-chat", "/api/hf-chat", "/api/v1/hf-chat"], handleGroqChatRequest);

// -------------------------------------------------------------
// ANNA UNIVERSITY CSE STUDY & EXAM PREP AGENT
// -------------------------------------------------------------

function buildStudyAgentPrompt(mode, topic, notesText = "") {
  const combinedContext = notesText
    ? `\n\n--- REFERENCE STUDY NOTES / SYLLABUS EXTRACT ---\n${notesText.slice(0, 20000)}\n------------------------------------------------`
    : "";

  let modeSpecificRules = "";

  switch (mode) {
    case "2-marks":
      modeSpecificRules = `
ROLE & TASK:
You are an Anna University CSE Semester Exam Controller & Senior Professor.
Generate EXACTLY 10 High-Yield Part-A (2-Marks) Questions & Model Answers for: "${topic}".

STRICT FORMAT & CRITERIA:
- Generate 10 numbered questions: Q1 to Q10 with bold questions.
- Under each question, provide a crisp, exam-ready answer (2 to 4 bullet points, strictly 30-50 words).
- Highlight essential definitions, technical keywords, formulas, or acronyms that Anna University evaluators look for to award full 2/2 marks.
- Include at least two "Differentiate between X and Y" tabular/point-by-point comparisons.
- Focus on frequently repeated questions from past Anna University exams (Regulation 2017/2021).`;
      break;

    case "16-marks":
      modeSpecificRules = `
ROLE & TASK:
You are an Anna University CSE Semester Exam Evaluator.
Generate Important Part-B / Part-C (16-Marks) Questions with Comprehensive, High-Scoring University Model Answers for: "${topic}".

STRICT FORMAT & CRITERIA:
Provide 2 to 3 most probable 16-mark university exam questions with full model answers.
For each question, follow the structured Anna University 16-mark scoring format:
1. **Question with Mark Split-up** (e.g. [8 + 8 = 16 Marks] or [16 Marks]).
2. **Introduction & Formal Definition** (technical, formal terminology).
3. **Neat Diagram / Architecture Placeholder**:
   Provide a clean ASCII / Box diagram showing the architecture or flowchart, e.g.:
   \`\`\`
   +-------------------------------------------------------------+
   | [DIAGRAM PLACEHOLDER: Architectural Block Diagram / Flow]   |
   | Input -> Component A -> Execution Engine -> Output Buffer   |
   +-------------------------------------------------------------+
   \`\`\`
   Followed by detailed step-by-step labeled explanation.
4. **Working Principle & Step-by-Step Operation** (numbered points).
5. **Mathematical Formulations / Algorithms / Pseudocode / Tables** (where applicable).
6. **Key Technical Features & Trade-offs**.
7. **Advantages, Disadvantages & Real-World CSE Applications**.
8. **Anna University Key Evaluator Takeaways**: 3-4 bullet points emphasizing exact keywords needed for full marks.`;
      break;

    case "unit-summary":
      modeSpecificRules = `
ROLE & TASK:
Create a High-Yield Quick Revision Cheat Sheet & Concept Map for Anna University CSE exams for: "${topic}".

STRICT FORMAT & CRITERIA:
1. **Core Concept Matrix**: A clear Markdown table summarizing all key sub-topics, their primary purpose, and key protocols/formulas.
2. **Must-Know Technical Definitions**: High-density 1-line definitions for all critical terms and acronyms.
3. **Key Comparison Tables**: Tabular comparison of the most commonly contrasted concepts (e.g., A vs B with 4+ comparison criteria).
4. **Anna University Exam Radar**: Top 5 most frequently repeated questions in university exams (Nov/Dec & April/May).
5. **Formulas & Complexity Summary**: Quick reference of all mathematical formulas, time/space complexities, and algorithm bounds.`;
      break;

    case "tanglish-explain":
      modeSpecificRules = `
ROLE & TASK:
Explain this Anna University CSE topic in engaging, crystal-clear, beginner-friendly TANGLISH (Tamil + English combined) for: "${topic}".

STRICT FORMAT & CRITERIA:
- Tone: Friendly, knowledgeable engineering senior / mentor explaining to a junior before exam night.
- Use natural spoken Tanglish phrasing (e.g., "Basically indha concept enna pannum-na...", "Namma daily life-la Swiggy / WhatsApp use panrom la, adhey concept dhaan...", "Anna University exam-la idhai ezhudhum podhu...").
- Structure:
  1. **What is it really? (Concept Oru Simple Summary)**
  2. **Real-Life Example / Analogy (Namma Ooru Analogy 🛵)**
  3. **How It Works Step-by-Step (Idhu epdi work aagudhu?)**
  4. **Anna University Exam Tips (Exam-la full marks vaanga tips 📝)**: What diagrams to draw and headings to write.
  5. **Crucial Technical Keywords (Indha English words kandippa paper-la irukanum)**`;
      break;

    default:
      modeSpecificRules = `Generate structured Anna University CSE examination study notes for: "${topic}".`;
  }

  return `You are KarthikAI, an elite Anna University CSE Semester Exam Preparation Expert & Tutor.
Help students score 'O' (Outstanding) or 'A+' grades in their university theory exams.

${modeSpecificRules}

TOPIC / SYLLABUS:
${topic}
${combinedContext}

Ensure formatting is immaculate with Markdown headings, bold keywords, bullet points, and code/diagram blocks where helpful. Write directly to the student without generic meta-introductions.`;
}

function getMockStudyAgentResponse(mode, topic) {
  const safeTopic = topic || "Computer Science Engineering Concept";
  if (mode === "2-marks") {
    return `### 🎓 Anna University CSE Exam Prep: Part-A (2-Mark Q&A)
**Subject / Topic:** ${safeTopic}  
**Regulation:** 2017 / 2021 | **Evaluation Focus:** High-Yield Crisp Answers

---

#### **Q1. Define ${safeTopic} and state its primary objective.**
**Ans:** 
- **Definition:** ${safeTopic} is a foundational CSE architectural mechanism designed to process, coordinate, and optimize computing resources.
- **Primary Objective:** Maximizes computational throughput while minimizing resource latency and computational overhead.

#### **Q2. List the key components involved in ${safeTopic}.**
**Ans:**
- **Control Interface:** Interprets instructions and coordinates execution logic.
- **Data Engine:** Manages processing state, memory buffers, and registers.
- **Communication Bus:** Provides high-speed inter-module data transfer.

#### **Q3. Differentiate between Static and Dynamic approaches in ${safeTopic}.**
**Ans:**
| Criteria | Static Approach | Dynamic Approach |
| :--- | :--- | :--- |
| **Binding Time** | Compile / Design time | Runtime |
| **Overhead** | Low runtime overhead | Higher runtime management |
| **Flexibility** | Rigid, predefined | Adaptive to workload |

#### **Q4. What is the fundamental formula or governing metric for ${safeTopic}?**
**Ans:**
The standard performance metric is given by:
\`\`\`
Efficiency (η) = (Useful Work Done / Total Execution Time) × 100%
\`\`\`
It measures system utilization under peak and average loads.

#### **Q5. Mention any two critical constraints in implementing ${safeTopic}.**
**Ans:**
1. **Memory Scalability:** High memory consumption during recursive or multi-threaded state transitions.
2. **Synchronization Overhead:** Race conditions and lock contention in concurrent environments.

#### **Q6. Why is synchronization crucial in ${safeTopic}?**
**Ans:**
Without strict synchronization primitives (e.g., semaphores or mutexes), simultaneous state access leads to inconsistent shared memory states and race conditions.

#### **Q7. State the worst-case time and space complexity associated with ${safeTopic}.**
**Ans:**
- **Time Complexity:** $O(n \\log n)$ for optimized sorting/indexing operations, degrading to $O(n^2)$ without proper indexing.
- **Space Complexity:** $O(n)$ auxiliary buffer space.

#### **Q8. What is the significance of caching in ${safeTopic}?**
**Ans:**
Caching exploits **temporal and spatial locality of reference**, reducing expensive main memory/disk access delays and speeding up response cycles by up to 80%.

#### **Q9. State any two standard protocols or algorithms related to ${safeTopic}.**
**Ans:**
1. **Greedy / Heuristic Routing Protocol:** Ensures shortest latency path discovery.
2. **Two-Phase Commit / Locking Algorithm:** Guarantees strict ACID consistency across distributed replicas.

#### **Q10. Give two real-world industrial applications of ${safeTopic}.**
**Ans:**
1. High-throughput distributed transaction engines (e.g., banking gateways, payment switches).
2. Cloud container orchestrators (e.g., Kubernetes scheduling, microservice routing).`;
  } else if (mode === "16-marks") {
    return `### 🎓 Anna University CSE Exam Prep: Part-B / Part-C (16-Mark Model Answer)
**Subject / Topic:** ${safeTopic}  
**Marks Allocation:** [16 Marks] | **Format:** University Model Answer

---

### **1. Introduction & Formal Definition**
**${safeTopic}** is a core architectural framework in modern Computer Science Engineering that governs how complex computational entities interact, synchronize, and exchange data reliably. In the Anna University curriculum, questions on this topic test theoretical depth, architectural diagrams, step-by-step algorithms, and trade-off analysis.

---

### **2. System Architecture & Diagram Placeholder**
Students must draw the following architectural diagram neatly using pencil and scale in the answer booklet:

\`\`\`
+---------------------------------------------------------------------------------+
|                       ${safeTopic.toUpperCase()} ARCHITECTURE                        |
+---------------------------------------------------------------------------------+
|                                                                                 |
|   +-------------------+         +-------------------+         +---------------+ |
|   |   Client Input    | ------> | Processing Module | ------> | Storage Buffer| |
|   | (Syllabus/Request)|         |  (Parsing & Exec) |         | (Memory/Cache)| |
|   +-------------------+         +-------------------+         +---------------+ |
|             |                             |                           |         |
|             v                             v                           v         |
|   +-------------------------------------------------------------------------+   |
|   |                 CENTRAL CONTROL & SYNCHRONIZATION BUS                   |   |
|   +-------------------------------------------------------------------------+   |
|                                                                                 |
+---------------------------------------------------------------------------------+
\`\`\`
*(Exam Tip: Label each module with its input bandwidth, execution status, and acknowledge signals to score full diagram marks.)*

---

### **3. Working Principle & Step-by-Step Operation**
The system executes via a 4-phase structured lifecycle:

1. **Initialization & Handshake Phase:**
   - Establishes communication channels, resets register pointers, and validates initial configuration parameters.
2. **Processing & State Transition Phase:**
   - Evaluates input criteria against predefined heuristic bounds.
   - Enforces synchronization locks to preserve mutual exclusion.
3. **Data Verification & Checkpoint Phase:**
   - Verifies intermediate parity bits or cryptographic checksums.
   - Records operational logs for fault tolerance and transaction rollback.
4. **Output Dispatch & Resource Deallocation:**
   - Dispatches finalized packets to downstream consumer modules.
   - Clears temporary buffers and returns lock ownership.

---

### **4. Comparative Analysis Table**
| Feature | Standard Implementation | Optimized Implementation |
| :--- | :--- | :--- |
| **Throughput** | Moderate ($O(n)$) | High ($O(\\log n)$ via indexing) |
| **Fault Tolerance** | Single-point vulnerability | Multi-master consensus replication |
| **Scalability** | Vertical (scale-up) | Horizontal (scale-out) |
| **Latency** | 15–25 ms | < 5 ms in cached tier |

---

### **5. Advantages & Practical Applications**
- **Advantages:**
  * High deterministic predictability in mission-critical environments.
  * Modular decoupling allowing isolated debugging and unit scaling.
  * Robust fault recovery protocols preventing data loss during power/network failures.
- **Real-World Applications:**
  * Cloud hypervisors and distributed container orchestrators.
  * High-concurrency relational and NoSQL database query engines.

---

### **6. Anna University Key Evaluator Takeaways**
*Evaluators look for the following keywords when awarding 15-16 full marks:*
1. **Architectural block diagram with labeled control lines**.
2. **Time and space complexity derivation**.
3. **Clear pointwise distinction between static and dynamic states**.
4. **Neat summary of real-world use cases**.`;
  } else if (mode === "unit-summary") {
    return `### ⚡ Anna University CSE Quick Revision Cheat Sheet
**Subject / Topic:** ${safeTopic}  
**Purpose:** Rapid Pre-Exam Revision & Memory Map

---

### **1. Core Concept Matrix**
| Concept | Primary Purpose | Key Protocol / Formula | Exam Importance |
| :--- | :--- | :--- | :--- |
| **Core Architecture** | System foundation & data flow | Central Bus / Pipeline | ⭐⭐⭐⭐⭐ (Part-B) |
| **State Coordination** | Race-free mutual exclusion | Semaphores, Mutex, Locks | ⭐⭐⭐⭐⭐ (Part-A & B) |
| **Optimization Tier** | Latency reduction | Caching / Locality ($O(1)$) | ⭐⭐⭐⭐ (Part-A) |
| **Error Handling** | Fault isolation & recovery | Parity, CRC, 2-Phase Commit | ⭐⭐⭐⭐ (Part-B) |

---

### **2. Must-Know Technical Definitions**
- **${safeTopic}**: The systematic coordination of hardware and software abstractions to achieve optimal computational resource utilization.
- **Throughput**: Total number of successful state operations processed per unit time ($T = N / \\Delta t$).
- **Deadlock**: A condition where a set of processes are permanently blocked because each process holds a resource and waits for another.
- **Locality of Reference**: The tendency of processors to access the same set of memory locations repeatedly over a short time interval.

---

### **3. Top 5 Most Repeated Anna University Exam Questions**
1. *Explain the architecture and detailed working principle of ${safeTopic} with neat diagram. [16 Marks]*
2. *Differentiate between Static and Dynamic scheduling in ${safeTopic}. [2 Marks]*
3. *Derive the time and space complexity under best, average, and worst cases. [8 Marks]*
4. *How does error recovery and checkpointing occur during unexpected failures? [8 Marks]*
5. *State the necessary and sufficient conditions for system safety. [2 Marks]*

---

### **4. Pre-Exam Quick Memory Checklist**
- [ ] Memorize the labeled block diagram and data direction arrows.
- [ ] Remember the comparison table (at least 4 solid technical points).
- [ ] Practice drawing the ASCII / block flowchart in under 4 minutes.
- [ ] Quote standard IEEE / ACM terms in your introductory paragraph.`;
  } else {
    // tanglish-explain
    return `### 🗣️ Simple Tanglish Explanation: ${safeTopic}
**Topic:** ${safeTopic}  
**Style:** Easy-to-understand Anna University CSE Student Guide 🎓

---

### **1. What is it really? (Concept Oru Simple Summary)**
Namma CSE-la **${safeTopic}** nu paatha, idhu romba periya complex vishayam illa boss! 
Simple-ah sollanum-na: **"Oru system-la irukkura resource-ah epdi correct-ah, fast-ah, safe-ah handle pannanum"** nu solra oru standard mechanism dhaan idhu.

Imagine pannunga:
Oru college lab-la 50 students irukaanga, aana printer 1 dhaan irukku. Ellarum ore nerathula "Print" kudutha printer crash aayidum, correct-ah?
Adha control panna oru **Queue manager** irukanum. Andha maadhiri work dhaan ${safeTopic} pannudhu!

---

### **2. Real-Life Example (Namma Ooru Analogy 🛵)**
- **Real-Life Scenario:** Namma **Swiggy / Zomato** order panrom.
  1. Neenga order place panreenga (Input request).
  2. Kitchen-la chef cook panraaru (Processing unit).
  3. Delivery partner pick pannitu unga veetuku vararu (Network transport).
  4. Neenga OTP solli receive panreenga (Acknowledge / Handshake).
- Idhey dhaan ${safeTopic}-layum nadakkudhu: Request varudhu -> Buffer-la store aagudhu -> Process aagi -> Verified output return aagudhu!

---

### **3. Step-by-Step How It Works (Step-by-step Execution)**
1. **Request Intake:** First client kitta irundhu packet / task input varum.
2. **Resource Check:** Buffer space irukka, memory free-ah irukka nu check pannum.
3. **Execution:** Algorithm execute aagi data compute aagum.
4. **Acknowledgement:** "Work done!" nu success signal send pannitu memory-ah free pannidum.

---

### **4. Anna University Exam Tips (Epdi ezhudhanum?) 📝**
- **Diagram:** Paper thiruthura staff first paakradhu unga **Diagram** dhaan! Pencil-la neat-ah box potu input, process, output nu arrows kaatunga.
- **Side Headings:** Paragraph-ah ezhudhadheenga. 
  - *Introduction*
  - *Architecture Diagram*
  - *Working Principle*
  - *Advantages*
  nu neat headings podunga, full marks guaranteed!

---

### **5. Crucial Keywords (Paper-la kandippa iruka vendiya words)**
- **Throughput & Latency**
- **Synchronization & Mutual Exclusion**
- **Scalability & Fault Tolerance**
- **Temporal & Spatial Locality**

Indha 4 keywords unga answer-la highlight aagi irundha, evaluator kandippa full marks poduvaaru! All the best! 🚀`;
  }
}

async function handleStudyAgentRequest(req, res) {
  try {
    const { mode = "16-marks", topic, syllabus, text, notes, attachment, pdfBase64, model } = req.body;

    let inputTopic = (topic || syllabus || text || notes || "").trim();
    let extractedNotes = "";

    // Handle uploaded attachment or PDF base64
    if (attachment) {
      if (attachment.extractedText) {
        extractedNotes = attachment.extractedText.trim();
      } else if (attachment.data) {
        try {
          let pdfParse = null;
          try {
            pdfParse = require("pdf-parse");
          } catch (e) {
            pdfParse = require(path.join(__dirname, "node_modules", "pdf-parse"));
          }
          if (pdfParse) {
            const buffer = Buffer.from(attachment.data, "base64");
            const parsed = await pdfParse(buffer);
            extractedNotes = (parsed.text || "").trim();
          }
        } catch (pdfErr) {
          console.warn("Backend PDF parse error:", pdfErr.message);
        }
      }
    } else if (pdfBase64) {
      try {
        let pdfParse = null;
        try {
          pdfParse = require("pdf-parse");
        } catch (e) {
          pdfParse = require(path.join(__dirname, "node_modules", "pdf-parse"));
        }
        if (pdfParse) {
          const buffer = Buffer.from(pdfBase64, "base64");
          const parsed = await pdfParse(buffer);
          extractedNotes = (parsed.text || "").trim();
        }
      } catch (pdfErr) {
        console.warn("Backend pdfBase64 parse error:", pdfErr.message);
      }
    }

    if (!inputTopic && !extractedNotes) {
      return res.status(400).json({
        error: "Please provide a subject topic/syllabus text or upload a notes PDF document."
      });
    }

    const safeTopic = inputTopic || "Uploaded Anna University CSE Syllabus & Lecture Notes";
    const promptMessage = buildStudyAgentPrompt(mode, safeTopic, extractedNotes);

    const settings = readSettings();
    const activeModel = (model || "gemini").toLowerCase();
    const apiKey = resolveApiKey(activeModel, settings);

    // Prepare models to attempt (requested model first, then any other configured live model)
    const modelsToAttempt = [];
    if (!isPlaceholderKey(apiKey)) {
      modelsToAttempt.push({ model: activeModel, key: apiKey });
    }

    const otherModels = ["gemini", "groq", "openai", "claude"].filter(m => m !== activeModel);
    for (const alt of otherModels) {
      const altKey = resolveApiKey(alt, settings);
      if (!isPlaceholderKey(altKey)) {
        modelsToAttempt.push({ model: alt, key: altKey });
      }
    }

    let finalResponse = null;
    let lastError = null;

    if (modelsToAttempt.length > 0) {
      const aiPayload = {
        message: promptMessage,
        history: []
      };

      for (const candidate of modelsToAttempt) {
        try {
          finalResponse = await executeAiGeneration(candidate.model, candidate.key, aiPayload);
          if (finalResponse) break;
        } catch (err) {
          lastError = err;
          console.warn(`Study Agent AI attempt with ${candidate.model} failed:`, sanitizeError(err.message));
        }
      }
    }

    if (finalResponse) {
      return res.json({
        success: true,
        mode,
        topic: safeTopic,
        response: finalResponse,
        source: "live"
      });
    }

    // High quality mock fallback
    return res.json({
      success: true,
      mode,
      topic: safeTopic,
      response: getMockStudyAgentResponse(mode, safeTopic),
      source: "mock"
    });

  } catch (error) {
    console.error("Study Agent handler error:", sanitizeError(error.message));
    return res.status(500).json({
      error: "Failed to generate exam prep notes",
      details: sanitizeError(error.message)
    });
  }
}

app.post(["/api/study-agent", "/api/v1/study-agent"], handleStudyAgentRequest);

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
    console.log(`- POST /api/groq-chat`);
    console.log(`- POST /api/study-agent`);
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
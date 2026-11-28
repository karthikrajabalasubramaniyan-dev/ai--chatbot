const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});
require("dotenv").config({ path: path.join(__dirname, ".env") });

let MsEdgeTTS;
let OUTPUT_FORMAT;
try {
  const edgeTts = require("msedge-tts");
  MsEdgeTTS = edgeTts.MsEdgeTTS;
  OUTPUT_FORMAT = edgeTts.OUTPUT_FORMAT;
} catch (e) {
  console.warn("msedge-tts not yet loaded:", e.message);
}

const app = express();
const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.json({
    status: "Running",
    message: "VEXA Chatbot Backend API",
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
  "Hello! I am VEXA, your AI assistant built by Karthik Raja. How can I help you today?",
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
    return prefix + "Hello there! I'm VEXA, your AI assistant built by Karthik Raja. Ask me anything or let me assist you with coding and answers!";
  }
  if (msg.includes("who are you") || msg.includes("your name") || msg.includes("who made you") || msg.includes("who created you")) {
    return prefix + "I am VEXA, an AI intelligence assistant built by Karthik Raja to help you with questions, coding, research, and everyday tasks.";
  }

  const resp = mockResponses[mockCounter % mockResponses.length];
  mockCounter++;
  return prefix + resp;
}

// -------------------------------------------------------------
// SHARED HELPER: build the 25-year knowledge system prompt
// -------------------------------------------------------------
function buildKnowledgeSystemPrompt(role = "VEXA, an advanced AI intelligence assistant created and built by Karthik Raja") {
  const now = new Date();
  const currentDateFull = now.toLocaleDateString("en-IN", { dateStyle: "full" });
  const currentDateTime = now.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  });

  return `You are ${role}.

IDENTITY & CREATOR:
- Your name is VEXA.
- You were developed, created, and built by Karthik Raja.
- When asked who you are, what your name is, or who created/made you, proudly state that you are VEXA, created and built by Karthik Raja.

Today's exact date and time (India): ${currentDateTime}.

KNOWLEDGE SCOPE:
You have comprehensive knowledge covering the past 25 years (2001–2026) up to today's date (${currentDateFull}).
Combine your deep historical knowledge (2001–2024) with real-time web search context for 2024–2026 events.
When answering questions about recent events, explicitly acknowledge the year 2026 as the current year.
Never claim your knowledge only goes up to 2024—your effective knowledge extends to ${currentDateFull}.
If asked about the current date, year, or time, state today's exact date: ${currentDateFull}.

LANGUAGE, DIALECT & TONE:
- If the user writes or asks questions in Tanglish (Tamil written in English/Latin script, e.g. "Idhu yaar?", "Enna padam idhu?", "Thor 3 la ivar role enna?"), reply in natural, friendly, conversational Tanglish and English matching the user's dialect!
- Do NOT reply in formal, robotic, or pure Tamil script (தமிழ் எழுத்துக்கள்) unless the user explicitly writes in pure Tamil script.
- For image analysis, clearly describe characters, actors, movie scenes, posters, objects, and text in the image. If asked in Tanglish, explain the visual details naturally in Tanglish.`;
}

// -------------------------------------------------------------
// SHARED HELPER: Tavily / Wikipedia live web search context
// Returns a brief web snippet string to prepend to user message, or "" if unavailable
// -------------------------------------------------------------
async function fetchLiveSearchContext(query) {
  const tavilyKey = (process.env.TAVILY_API_KEY || "").trim();

  // Try Tavily first (rich structured results)
  if (tavilyKey && !isPlaceholderKey(tavilyKey)) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyKey,
          query: query,
          max_results: 3,
          search_depth: "basic"
        })
      });
      if (res.ok) {
        const data = await res.json();
        const results = data.results || [];
        if (results.length > 0) {
          const snippets = results.map((r, i) =>
            `[${i + 1}] ${r.title}: ${(r.content || r.snippet || "").slice(0, 300)}`
          ).join("\n");
          return `\n\n---\n📡 **Live Web Context (Tavily, ${new Date().getFullYear()}):**\n${snippets}\n---`;
        }
      }
    } catch (e) {
      console.warn("Tavily search failed:", sanitizeError(e.message));
    }
  }

  // Wikipedia instant search fallback (no API key required)
  try {
    const encoded = encodeURIComponent(query.slice(0, 120));
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&utf8=1&format=json&srlimit=2`
    );
    if (res.ok) {
      const data = await res.json();
      const results = (data.query?.search || []).slice(0, 2);
      if (results.length > 0) {
        const snippets = results.map((r, i) =>
          `[${i + 1}] ${r.title}: ${(r.snippet || "").replace(/<[^>]+>/g, "").slice(0, 250)}`
        ).join("\n");
        return `\n\n---\n📖 **Knowledge Context (Wikipedia):**\n${snippets}\n---`;
      }
    }
  } catch (e) {
    console.warn("Wikipedia fallback failed:", sanitizeError(e.message));
  }

  return "";
}

// -------------------------------------------------------------
// AI PROVIDER GENERATION FUNCTIONS
// -------------------------------------------------------------

async function generateGroqResponse(apiKey, { message, history, liveSearch = true, attachment }) {
  const Groq = require("groq-sdk");
  const groq = new Groq({ apiKey });

  // Fetch live search context if enabled
  let searchContext = "";
  if (liveSearch) {
    try { searchContext = await fetchLiveSearchContext(message); } catch (_) { }
  }

  const messages = [
    {
      role: "system",
      content: buildKnowledgeSystemPrompt("VEXA, an advanced AI intelligence assistant created and built by Karthik Raja")
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

  const hasImage = attachment && attachment.data && attachment.mimeType?.startsWith("image/");
  const promptText = searchContext ? `${message}${searchContext}` : message;
  const userContent = hasImage
    ? [
      { type: "text", text: promptText },
      { type: "image_url", image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}` } }
    ]
    : promptText;

  messages.push({
    role: "user",
    content: userContent
  });

  const candidateModels = hasImage
    ? ["meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.2-11b-vision-preview", "llama-3.2-90b-vision-preview"]
    : ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b", "groq/compound", "groq/compound-mini"];
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

async function generateGeminiResponse(apiKey, { message, history, attachment, useGrounding = true }) {
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

  const systemPrompt = buildKnowledgeSystemPrompt("VEXA, an advanced AI intelligence assistant created and built by Karthik Raja");

  // Models that support googleSearch grounding (Gemini 1.5+)
  const groundingModels = [
    "gemini-2.5-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.5-pro-latest"
  ];
  // Final fallback model that may not support tools
  const fallbackModels = ["gemini-pro"];
  const candidateGeminiModels = [...groundingModels, ...fallbackModels];

  let responseText = null;
  let lastGeminiError = null;

  for (const modelId of candidateGeminiModels) {
    try {
      // Enable Google Search grounding for supported models when no attachment
      const isGroundingModel = groundingModels.includes(modelId);
      const shouldGround = useGrounding && isGroundingModel && !attachment;
      const modelConfig = shouldGround
        ? { model: modelId, tools: [{ googleSearch: {} }] }
        : { model: modelId };

      const geminiModel = genAI.getGenerativeModel(modelConfig);
      const chat = geminiModel.startChat({
        history: [
          {
            role: "user",
            parts: [{ text: systemPrompt }]
          },
          {
            role: "model",
            parts: [{ text: "Understood. I will answer clearly and accurately, using my comprehensive knowledge from 2001 to 2026 and live web search when available." }]
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
  const systemPrompt = "You are VEXA, an advanced AI assistant created and built by Karthik Raja. Answer clearly, concisely, and accurately.";

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
  const systemPrompt = "You are VEXA, an advanced AI assistant created and built by Karthik Raja. Answer clearly, concisely, and accurately.";

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
  const hasImage = payload.attachment && payload.attachment.data && payload.attachment.mimeType?.startsWith("image/");
  if (m === "groq") {
    if (hasImage) {
      try {
        return await generateGroqResponse(apiKey, payload);
      } catch (groqErr) {
        console.warn("Groq vision attempt failed, delegating to Gemini vision:", sanitizeError(groqErr.message));
        const settings = readSettings();
        const geminiKey = resolveApiKey("gemini", settings);
        if (!isPlaceholderKey(geminiKey)) {
          return await generateGeminiResponse(geminiKey, payload);
        }
        throw groqErr;
      }
    }
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
  const { message, history, session_id, model, attachment, liveWeb = true, image, images } = req.body;

  if (!message && !attachment && !image && !(images && images.length)) {
    return res.status(400).json({ error: "Message or image is required" });
  }

  // Extract image if sent as image/images base64 URL
  const rawImage = image || (Array.isArray(images) && images[0]);
  let finalAttachment = attachment;
  if (!finalAttachment && rawImage && typeof rawImage === "string") {
    let mimeType = "image/jpeg";
    let data = rawImage;
    if (rawImage.startsWith("data:")) {
      const parts = rawImage.split(";base64,");
      mimeType = parts[0].replace("data:", "") || "image/jpeg";
      data = parts[1];
    }
    finalAttachment = { data, mimeType, fileName: "image.jpg" };
  }

  const settings = readSettings();
  const activeModel = (model || settings.defaultModel || "groq").toLowerCase();

  // Resolve API Key for requested model
  const apiKey = resolveApiKey(activeModel, settings);
  const isPlaceholder = isPlaceholderKey(apiKey);

  const aiPayload = {
    message: message || "Please analyze this image in detail.",
    history,
    attachment: finalAttachment,
    useGrounding: liveWeb !== false,
    liveSearch: liveWeb !== false
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
      session_id: session_id || "",
      liveWeb: false
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
      session_id: session_id || "",
      liveWeb: liveWeb !== false
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
  const { message, history, session_id, liveWeb = true, image, images, attachment } = req.body;

  if (!message && !image && !(images && images.length) && !attachment) {
    return res.status(400).json({ error: "Message or image is required" });
  }

  // Extract attached image if present (via image, images, or attachment)
  const rawImage = image || (Array.isArray(images) && images[0]) || (attachment && attachment.data ? `data:${attachment.mimeType || 'image/jpeg'};base64,${attachment.data}` : null);
  let hasImage = false;
  let imageData = null;
  let imageMimeType = "image/jpeg";
  let imageUrl = null;

  if (rawImage && typeof rawImage === "string") {
    hasImage = true;
    if (rawImage.startsWith("data:")) {
      const parts = rawImage.split(";base64,");
      imageMimeType = parts[0].replace("data:", "") || "image/jpeg";
      imageData = parts[1];
      imageUrl = rawImage;
    } else {
      imageData = rawImage;
      imageMimeType = attachment?.mimeType || "image/jpeg";
      imageUrl = `data:${imageMimeType};base64,${imageData}`;
    }
  } else if (attachment && attachment.data) {
    hasImage = true;
    imageData = attachment.data;
    imageMimeType = attachment.mimeType || "image/jpeg";
    imageUrl = `data:${imageMimeType};base64,${imageData}`;
  }

  const effectiveMessage = message || (hasImage ? "Please analyze this attached image in detail." : "");
  const groqKey = (process.env.GROQ_API_KEY || "").trim();

  if (!groqKey || isPlaceholderKey(groqKey)) {
    // If Groq key not configured, check if Gemini can handle it directly
    const settings = readSettings();
    const geminiKey = resolveApiKey("gemini", settings);
    if (!isPlaceholderKey(geminiKey)) {
      try {
        const geminiAttachment = hasImage
          ? { data: imageData, mimeType: imageMimeType, fileName: attachment?.fileName || "image.jpg" }
          : attachment;
        const geminiReply = await generateGeminiResponse(geminiKey, {
          message: effectiveMessage,
          history,
          attachment: geminiAttachment,
          useGrounding: liveWeb !== false
        });
        if (geminiReply) {
          return res.json({
            response: geminiReply,
            model: hasImage ? "gemini-2.5-flash (vision)" : "gemini-2.5-flash",
            session_id: session_id || "",
            source: hasImage ? "gemini-multimodal" : "gemini-fallback",
            liveWeb: liveWeb !== false
          });
        }
      } catch (e) {
        console.warn("Direct Gemini fallback failed:", sanitizeError(e.message));
      }
    }

    return res.json({
      response: `[Groq Demo Response]:\n\nHello! I received your message: "${effectiveMessage}". To enable live Groq inference, please set a valid GROQ_API_KEY in your backend .env file.`,
      model: "llama-3.3-70b-versatile",
      session_id: session_id || "",
      source: "mock",
      liveWeb: false
    });
  }

  // Live search context helper for Groq (Tavily with Wikipedia fallback)
  let liveCtx = "";
  if (liveWeb !== false && !hasImage) {
    try {
      liveCtx = await fetchLiveSearchContext(effectiveMessage);
    } catch (_) { }
  }

  const messages = [
    {
      role: "system",
      content: buildKnowledgeSystemPrompt("VEXA, an advanced AI intelligence assistant powered by Groq and created by Karthik Raja")
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

  const promptText = liveCtx ? `${effectiveMessage}${liveCtx}` : effectiveMessage;
  const userContent = hasImage
    ? [
      { type: "text", text: promptText },
      { type: "image_url", image_url: { url: imageUrl } }
    ]
    : promptText;

  messages.push({
    role: "user",
    content: userContent
  });

  // Candidate models: Groq vision models if image is attached, else standard Groq cascade
  const candidateModels = hasImage
    ? [
      "meta-llama/llama-4-scout-17b-16e-instruct",
      "llama-3.2-11b-vision-preview",
      "llama-3.2-90b-vision-preview"
    ]
    : [
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
      model: successfulModel || (hasImage ? "llama-4-scout-vision" : "llama-3.3-70b-versatile"),
      session_id: session_id || "",
      source: "groq",
      liveWeb: liveWeb !== false
    });
  }

  // If Groq models fail or vision delegation is needed, delegate to Gemini multimodal
  console.log("Delegating request to Gemini multimodal vision endpoint...");

  let fallbackText = null;
  try {
    const settings = readSettings();
    const geminiKey = resolveApiKey("gemini", settings);
    if (!isPlaceholderKey(geminiKey)) {
      const geminiAttachment = hasImage
        ? { data: imageData, mimeType: imageMimeType, fileName: attachment?.fileName || "image.jpg" }
        : attachment;

      const geminiReply = await generateGeminiResponse(geminiKey, {
        message: effectiveMessage,
        history,
        attachment: geminiAttachment,
        useGrounding: liveWeb !== false
      });
      if (geminiReply) {
        return res.json({
          response: geminiReply,
          model: hasImage ? "gemini-2.5-flash (vision)" : "llama-3.3-70b-versatile",
          session_id: session_id || "",
          source: hasImage ? "gemini-multimodal" : "fallback",
          liveWeb: liveWeb !== false
        });
      }
    }
  } catch (fallbackErr) {
    console.error("Gemini fallback exception:", sanitizeError(fallbackErr.message));
  }

  if (!fallbackText) {
    fallbackText = `**[VEXA • Vision]**\n\nI received your request${hasImage ? " and image" : ""}: "${effectiveMessage}"\n\n*(Note: Vision model notice: ${sanitizeError(lastErrorDetail || "Service temporarily unavailable")}. Please verify your API keys or switch to Gemini (Default).)*`;
  }

  return res.json({
    response: fallbackText,
    model: hasImage ? "gemini-2.5-flash (vision)" : "llama-3.3-70b-versatile",
    session_id: session_id || "",
    source: "fallback",
    liveWeb: liveWeb !== false,
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

  return `You are VEXA, an elite Anna University CSE Semester Exam Preparation Expert & Tutor created and built by Karthik Raja.
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

// -------------------------------------------------------------
// TEXT-TO-SPEECH (TTS) & SPEECH-TO-TEXT (STT / TRANSCRIBE)
// -------------------------------------------------------------

// Clean markdown characters and symbols for natural, fluent voice output
function cleanTextForSpeech(text) {
  if (!text || typeof text !== "string") return "";
  return text
    // Remove multi-line code blocks
    .replace(/```[\s\S]*?```/g, " ")
    // Remove inline code ticks
    .replace(/`([^`]+)`/g, "$1")
    // Remove markdown links & images, keeping label
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Remove headings (#, ##, etc.)
    .replace(/^#{1,6}\s+/gm, "")
    // Remove bold and italic markers (*, _)
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .replace(/[*_]/g, "")
    // Remove blockquotes and list bullets
    .replace(/^[>*\-+]\s+/gm, "")
    // Remove table formatting and pipes
    .replace(/\|/g, " ")
    .replace(/[-:]{3,}/g, "")
    // Remove HTML tags
    .replace(/<[^>]+>/g, "")
    // Remove URLs
    .replace(/https?:\/\/\S+/g, "")
    // Remove multiple symbols and normalize whitespace
    .replace(/[~^\\#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// POST /api/tts: Natural Neural Voice Output (Edge TTS)
app.post(["/api/tts", "/api/v1/tts"], async (req, res) => {
  const { text, lang } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Text is required for TTS synthesis" });
  }

  const cleanedText = cleanTextForSpeech(text);
  if (!cleanedText) {
    return res.status(400).json({ error: "No speakable text found after stripping markdown" });
  }

  // Detect Tamil script or explicit Tamil language request
  const hasTamil = /[\u0B80-\u0BFF]/.test(cleanedText);
  const isTamil = hasTamil || (lang && (lang.startsWith("ta") || lang.toLowerCase().includes("tamil")));

  // Voice Selection: Tamil -> ta-IN-PallaviNeural, English (India) -> en-IN-PrabhatNeural or en-IN-NeerjaNeural
  const voice = isTamil ? "ta-IN-PallaviNeural" : "en-IN-PrabhatNeural";

  try {
    if (!MsEdgeTTS) {
      const edgeTts = require("msedge-tts");
      MsEdgeTTS = edgeTts.MsEdgeTTS;
      OUTPUT_FORMAT = edgeTts.OUTPUT_FORMAT;
    }

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    // Limit text to 4000 characters to keep synthesis snappy and responsive
    const speakText = cleanedText.length > 4000 ? cleanedText.slice(0, 4000) + "..." : cleanedText;

    const { audioStream } = tts.toStream(speakText);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-cache");

    audioStream.on("error", (streamErr) => {
      console.error("MsEdgeTTS stream error:", streamErr);
      if (!res.headersSent) {
        res.status(500).json({ error: "TTS audio streaming failed", details: streamErr.message });
      }
    });

    audioStream.pipe(res);
  } catch (err) {
    console.error("MsEdgeTTS synthesis error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "TTS generation failed", details: err.message });
    }
  }
});

// POST /api/transcribe: Groq Whisper STT (whisper-large-v3-turbo) with Gemini fallback
app.post(["/api/transcribe", "/api/v1/transcribe"], upload.any(), async (req, res) => {
  let audioBuffer = null;
  let mimeType = "audio/webm";
  let fileName = "audio.webm";
  let language = req.body?.language || "en-US";

  // Handle multipart file upload via multer
  if (req.files && req.files.length > 0) {
    const file = req.files[0];
    audioBuffer = file.buffer;
    mimeType = file.mimetype || "audio/webm";
    fileName = file.originalname || "audio.webm";
  } else if (req.file) {
    audioBuffer = req.file.buffer;
    mimeType = req.file.mimetype || "audio/webm";
    fileName = req.file.originalname || "audio.webm";
  } else if (req.body?.audio) {
    // Handle base64 audio JSON payload
    audioBuffer = Buffer.from(req.body.audio, "base64");
    mimeType = req.body.mimeType || "audio/webm";
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    return res.status(400).json({ error: "Audio data or file is required" });
  }

  const groqKey = (process.env.GROQ_API_KEY || "").trim();

  // Primary: Groq Whisper API (whisper-large-v3-turbo)
  if (groqKey && !isPlaceholderKey(groqKey)) {
    try {
      const formData = new FormData();
      const audioBlob = new Blob([audioBuffer], { type: mimeType });
      formData.append("file", audioBlob, fileName.endsWith(".webm") ? fileName : "recording.webm");
      formData.append("model", "whisper-large-v3-turbo");

      // Set language hint if Tamil is requested (Whisper uses ISO-639-1 code 'ta')
      if (language && (language.startsWith("ta") || language.toLowerCase().includes("tamil"))) {
        formData.append("language", "ta");
      }

      const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqKey}`
        },
        body: formData
      });

      if (groqRes.ok) {
        const groqData = await groqRes.json();
        const transcription = (groqData.text || "").trim();
        return res.json({ text: transcription, provider: "groq-whisper" });
      } else {
        const errText = await groqRes.text();
        console.warn(`Groq Whisper notice [HTTP ${groqRes.status}]:`, sanitizeError(errText));
      }
    } catch (groqErr) {
      console.warn("Groq Whisper exception, attempting Gemini fallback:", sanitizeError(groqErr.message));
    }
  }

  // Fallback: Gemini audio transcription
  try {
    const settings = readSettings();
    const apiKey = resolveApiKey("gemini", settings);
    if (apiKey && !isPlaceholderKey(apiKey)) {
      const { GoogleGenerativeAI } = require("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const langHint = language === "ta-IN" ? "Tamil" : "English";

      const base64Audio = audioBuffer.toString("base64");
      const result = await model.generateContent([
        {
          inlineData: {
            data: base64Audio,
            mimeType: mimeType || "audio/webm"
          }
        },
        `Provide only the verbatim transcription of this audio. The language spoken is likely ${langHint} or Tanglish. Do not add any introductory or explanatory text, formatting, or commentary.`
      ]);

      const transcription = result.response.text().trim();
      return res.json({ text: transcription, provider: "gemini" });
    }
  } catch (geminiErr) {
    console.error("Gemini transcription fallback exception:", sanitizeError(geminiErr.message));
  }

  // Safe mock response if all remote keys fail
  return res.json({
    text: "Hello! Audio received, but transcription requires a valid GROQ_API_KEY or GEMINI_API_KEY.",
    provider: "fallback"
  });
});

let server;

function startServer(port = PORT) {
  server = app.listen(port, () => {
    console.log(`VEXA Backend server running on http://localhost:${port}`);
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
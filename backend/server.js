const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const weatherService = require("./weatherService");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.json({
    status: "Running",
    message: "WeatherGPT AI Chatbot Backend API",
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

// Mock responses for general non-weather testing when API key is missing
const mockResponses = [
  "Hello! I am WeatherGPT Assistant. How can I help you today? You can ask me about current weather, forecasts, historical data, or general questions!",
  "That is an interesting question. In a production environment, I connect to real-time APIs to give you accurate insights.",
  "Here is some formatted code for you:\n\n```javascript\nfunction greet(name) {\n  console.log(`Hello, ${name}!`);\n}\n\ngreet('Developer');\n```",
  "I am fully responsive with real-time meteorological weather data support."
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
    return prefix + `Hello there! I'm your WeatherGPT assistant. Ask me about weather anywhere in the world or let me assist you with coding and answers!`;
  }
  if (msg.includes("who are you") || msg.includes("your name")) {
    return prefix + `I am WeatherGPT, an AI assistant with live meteorological intelligence and natural language capabilities.`;
  }
  
  const resp = mockResponses[mockCounter % mockResponses.length];
  mockCounter++;
  return prefix + resp;
}

// -------------------------------------------------------------
// WEATHER REST API ENDPOINTS
// -------------------------------------------------------------

// 1. Current Weather Endpoint: GET /api/v1/weather/current & GET /api/weather/current
app.get(["/api/v1/weather/current", "/api/weather/current"], async (req, res) => {
  const city = req.query.city || req.query.location;
  if (!city) {
    return res.status(400).json({ error: "city parameter is required" });
  }

  try {
    const geo = await weatherService.geocodeLocation(city);
    if (!geo) {
      return res.status(404).json({ error: `Location "${city}" could not be geocoded` });
    }

    const data = await weatherService.fetchCurrentWeatherData(geo);
    res.json(data);
  } catch (err) {
    console.error("Current weather API error:", err);
    res.status(500).json({ error: "Failed to fetch current weather data", details: err.message });
  }
});

// 2. Forecast Weather Endpoint: GET /api/v1/weather/forecast & GET /api/weather/forecast
app.get(["/api/v1/weather/forecast", "/api/weather/forecast"], async (req, res) => {
  const city = req.query.city || req.query.location;
  const days = parseInt(req.query.days || "7", 10);
  if (!city) {
    return res.status(400).json({ error: "city parameter is required" });
  }

  try {
    const geo = await weatherService.geocodeLocation(city);
    if (!geo) {
      return res.status(404).json({ error: `Location "${city}" could not be geocoded` });
    }

    const data = await weatherService.fetchForecastWeatherData(geo, days);
    res.json(data);
  } catch (err) {
    console.error("Forecast weather API error:", err);
    res.status(500).json({ error: "Failed to fetch weather forecast", details: err.message });
  }
});

// 3. Hourly Weather Endpoint: GET /api/v1/weather/hourly & GET /api/weather/hourly
app.get(["/api/v1/weather/hourly", "/api/weather/hourly"], async (req, res) => {
  const city = req.query.city || req.query.location;
  const hours = parseInt(req.query.hours || "24", 10);
  if (!city) {
    return res.status(400).json({ error: "city parameter is required" });
  }

  try {
    const geo = await weatherService.geocodeLocation(city);
    if (!geo) {
      return res.status(404).json({ error: `Location "${city}" could not be geocoded` });
    }

    const data = await weatherService.fetchHourlyWeatherData(geo, hours);
    res.json(data);
  } catch (err) {
    console.error("Hourly weather API error:", err);
    res.status(500).json({ error: "Failed to fetch hourly weather data", details: err.message });
  }
});

// 4. Historical Weather Endpoint: GET /api/v1/weather/history & GET /api/weather/history
app.get(["/api/v1/weather/history", "/api/weather/history"], async (req, res) => {
  const city = req.query.city || req.query.location;
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  if (!city) {
    return res.status(400).json({ error: "city parameter is required" });
  }
  if (!startDate || !endDate) {
    return res.status(400).json({ error: "start_date and end_date parameters are required (format: YYYY-MM-DD)" });
  }

  try {
    const geo = await weatherService.geocodeLocation(city);
    if (!geo) {
      return res.status(404).json({ error: `Location "${city}" could not be geocoded` });
    }

    const data = await weatherService.fetchHistoricalWeatherData(geo, startDate, endDate);
    res.json(data);
  } catch (err) {
    console.error("Historical weather API error:", err);
    res.status(500).json({ error: "Failed to fetch historical weather data", details: err.message });
  }
});

// 5. Location Search & Autocomplete Endpoint: GET /api/v1/weather/search & GET /api/weather/search
app.get(["/api/v1/weather/search", "/api/weather/search"], async (req, res) => {
  const query = req.query.q || req.query.query || req.query.name;
  const limit = parseInt(req.query.limit || "10", 10);
  if (!query) {
    return res.status(400).json({ error: "q parameter is required" });
  }

  try {
    const results = await weatherService.searchLocations(query, limit);
    res.json(results);
  } catch (err) {
    console.error("Location search endpoint error:", err);
    res.status(500).json({ error: "Failed to search locations", details: err.message });
  }
});

// 6. Reverse Geocode Endpoint: GET /api/v1/weather/reverse-geocode & GET /api/weather/reverse-geocode
app.get(["/api/v1/weather/reverse-geocode", "/api/weather/reverse-geocode", "/api/v1/weather/reverse", "/api/weather/reverse"], async (req, res) => {
  const lat = req.query.lat || req.query.latitude;
  const lon = req.query.lon || req.query.longitude || req.query.lng;
  if (!lat || !lon) {
    return res.status(400).json({ error: "lat and lon parameters are required" });
  }

  try {
    const geo = await weatherService.reverseGeocode(lat, lon);
    if (!geo) {
      return res.status(404).json({ error: "Location could not be reverse-geocoded" });
    }
    res.json(geo);
  } catch (err) {
    console.error("Reverse geocode endpoint error:", err);
    res.status(500).json({ error: "Failed to reverse geocode", details: err.message });
  }
});

// General Weather API endpoint (backwards compatible)
app.get(["/api/v1/weather", "/api/weather"], async (req, res) => {
  const { city, location, start_date, end_date, days, hours } = req.query;
  const targetCity = city || location;
  if (!targetCity) {
    return res.status(400).json({ error: "city parameter is required" });
  }
  try {
    const geo = await weatherService.geocodeLocation(targetCity);
    if (!geo) {
      return res.status(404).json({ error: `Location "${targetCity}" could not be geocoded` });
    }
    if (start_date && end_date) {
      const data = await weatherService.fetchHistoricalWeatherData(geo, start_date, end_date);
      return res.json(data);
    } else if (hours) {
      const data = await weatherService.fetchHourlyWeatherData(geo, parseInt(hours, 10));
      return res.json(data);
    } else if (days) {
      const data = await weatherService.fetchForecastWeatherData(geo, parseInt(days, 10));
      return res.json(data);
    } else {
      const data = await weatherService.fetchCurrentWeatherData(geo);
      return res.json(data);
    }
  } catch (err) {
    console.error("Weather API error:", err);
    res.status(500).json({ error: "Failed to fetch weather data", details: err.message });
  }
});

// -------------------------------------------------------------
// AI PROVIDER GENERATION FUNCTIONS
// -------------------------------------------------------------

async function generateGroqResponse(apiKey, { weatherContextPrompt, message, history }) {
  const Groq = require("groq-sdk");
  const groq = new Groq({ apiKey });

  const messages = [
    {
      role: "system",
      content: weatherContextPrompt
        ? `You are WeatherGPT, a helpful weather and AI assistant. Answer accurately and conversationally using ONLY the verified meteorological data provided below. NEVER invent, hallucinate, or estimate numbers.\n\n${weatherContextPrompt}`
        : "You are WeatherGPT, a helpful AI assistant. Answer clearly, concisely, and accurately."
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

  let userPrompt = message;
  if (weatherContextPrompt) {
    userPrompt = `${weatherContextPrompt}\n\nUser Question: ${message}`;
  }

  messages.push({
    role: "user",
    content: userPrompt
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

async function generateGeminiResponse(apiKey, { weatherContextPrompt, message, history, attachment }) {
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

  const systemPrompt = weatherContextPrompt
    ? `You are WeatherGPT, a helpful AI assistant. Answer the user's weather question naturally and conversationally using ONLY the verified meteorological data provided below. Do not invent or guess any weather values.\n\n${weatherContextPrompt}`
    : `You are WeatherGPT, a helpful AI assistant. Current date and time in India is: ${currentDateTime}.\nIf user asks current date/time, answer using this information.`;

  let finalPrompt = message;
  if (weatherContextPrompt) {
    finalPrompt = `${weatherContextPrompt}\n\nUser Question:\n${message}`;
  }

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
            parts: [{ text: "Understood. I will answer accurately based strictly on the verified data." }]
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
          finalPrompt
        ]);
      } else {
        result = await chat.sendMessage(finalPrompt);
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

async function generateOpenAiResponse(apiKey, { weatherContextPrompt, message, history, attachment }) {
  const systemPrompt = weatherContextPrompt
    ? `You are WeatherGPT, an AI assistant. Answer using ONLY the real meteorological data provided in the prompt.\n\n${weatherContextPrompt}`
    : "You are WeatherGPT, a helpful AI assistant. Answer clearly, concisely, and accurately.";

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

  const userText = weatherContextPrompt ? `${weatherContextPrompt}\n\nUser Question:\n${message}` : message;

  if (attachment && attachment.data && attachment.mimeType && attachment.mimeType.startsWith("image/")) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: userText },
        {
          type: "image_url",
          image_url: {
            url: `data:${attachment.mimeType};base64,${attachment.data}`
          }
        }
      ]
    });
  } else {
    messages.push({ role: "user", content: userText });
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

async function generateClaudeResponse(apiKey, { weatherContextPrompt, message, history, attachment }) {
  const systemPrompt = weatherContextPrompt
    ? `You are WeatherGPT, a helpful AI assistant. Answer the user's weather question naturally and conversationally using ONLY the verified meteorological data provided below. Do not invent or guess any weather values.\n\n${weatherContextPrompt}`
    : "You are WeatherGPT, a helpful AI assistant. Answer clearly, concisely, and accurately.";

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

  const userTextPrompt = weatherContextPrompt
    ? `${weatherContextPrompt}\n\nUser Question:\n${message}`
    : message;

  userContent.push({ type: "text", text: userTextPrompt });
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
  const { message, city, history, session_id, model, attachment, clientLocation, userLocation } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const settings = readSettings();
  const activeModel = (model || settings.defaultModel || "groq").toLowerCase();

  // Resolve API Key for requested model
  const apiKey = resolveApiKey(activeModel, settings);
  const isPlaceholder = isPlaceholderKey(apiKey);

  // Weather Intelligence Processing
  let weatherContextPrompt = "";
  let resolvedWeatherData = null;
  let resolvedHistoricalData = null;
  let resolvedTemporal = null;
  let forecastData = null;
  let hourlyData = null;
  let activeCityResolved = city || "Chennai";

  if (weatherService.isWeatherQuery(message)) {
    try {
      const temporal = weatherService.extractTemporalIntent(message);
      const locInfo = weatherService.extractLocation(message, history, city, clientLocation || userLocation);

      if (!locInfo || !locInfo.locationName) {
        return res.json({ 
          response: "Which city or location would you like the weather for?",
          city: activeCityResolved,
          session_id: session_id || ""
        });
      }

      const targetCity = locInfo.locationName;
      const geo = await weatherService.geocodeLocation(targetCity);
      if (!geo) {
        return res.json({ 
          response: `I'm unable to find weather data for "${targetCity}". Please verify the location name.`,
          city: activeCityResolved,
          session_id: session_id || ""
        });
      }

      activeCityResolved = geo.name;
      resolvedTemporal = temporal;

      let currentData = null;
      let historicalData = null;

      // 1. COMPARISON INTENT
      if (temporal.type === "comparison") {
        currentData = await weatherService.fetchCurrentWeatherData(geo);
        historicalData = await weatherService.fetchHistoricalWeatherData(
          geo,
          temporal.historicalStartDate,
          temporal.historicalEndDate
        );
        resolvedWeatherData = currentData;
        resolvedHistoricalData = historicalData;

        weatherContextPrompt = weatherService.buildWeatherContextPrompt(
          currentData,
          null,
          null,
          historicalData,
          temporal
        );
      }
      // 2. HISTORICAL INTENT
      else if (temporal.type === "historical") {
        historicalData = await weatherService.fetchHistoricalWeatherData(geo, temporal.startDate, temporal.endDate);
        resolvedWeatherData = historicalData;
        resolvedHistoricalData = historicalData;

        weatherContextPrompt = weatherService.buildWeatherContextPrompt(
          null,
          null,
          null,
          historicalData,
          temporal
        );
      }
      // 3. CURRENT / FORECAST / HOURLY INTENT
      else {
        currentData = await weatherService.fetchCurrentWeatherData(geo);
        resolvedWeatherData = currentData;

        if (
          temporal.type === "forecast" ||
          temporal.type === "weekend" ||
          temporal.type === "tomorrow" ||
          /\b(tomorrow|weekend|week|travel|trip|days|forecast)\b/i.test(message)
        ) {
          forecastData = await weatherService.fetchForecastWeatherData(geo, temporal.days || 7);
        }

        if (temporal.type === "hourly" || /\b(hourly|hour|rain\s+time|when\s+will\s+it\s+rain)\b/i.test(message)) {
          hourlyData = await weatherService.fetchHourlyWeatherData(geo, temporal.hours || 24);
        }

        weatherContextPrompt = weatherService.buildWeatherContextPrompt(
          currentData,
          forecastData,
          hourlyData,
          null,
          temporal
        );
      }

      // If in Mock Mode (no API key configured for any model), generate conversational answer using real API data directly
      if (isPlaceholder) {
        // Check if any other configured live model exists before falling back to rule-based mock
        const availableModels = ["groq", "gemini", "openai", "claude"].filter(
          m => m !== activeModel && !isPlaceholderKey(resolveApiKey(m, settings))
        );

        if (availableModels.length === 0) {
          const mockWeatherResp = weatherService.getMockWeatherConversationalResponse(
            message,
            resolvedWeatherData,
            temporal,
            resolvedHistoricalData,
            forecastData
          );
          return res.json({ 
            response: mockWeatherResp,
            city: activeCityResolved,
            session_id: session_id || ""
          });
        }
      }

    } catch (wErr) {
      console.error("Weather processing error:", sanitizeError(wErr.message));
      return res.json({ 
        response: "Live weather data is temporarily unavailable. Please try again in a few moments.",
        city: activeCityResolved,
        session_id: session_id || ""
      });
    }
  }

  const aiPayload = {
    weatherContextPrompt,
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
    if (resolvedWeatherData || resolvedHistoricalData) {
      const mockWeatherResp = weatherService.getMockWeatherConversationalResponse(
        message,
        resolvedWeatherData,
        resolvedTemporal,
        resolvedHistoricalData,
        forecastData
      );
      return res.json({
        response: mockWeatherResp,
        city: activeCityResolved,
        session_id: session_id || ""
      });
    }
    return res.json({
      response: getMockResponse(message, activeModel),
      city: activeCityResolved,
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
      city: activeCityResolved,
      session_id: session_id || ""
    });
  }

  // Graceful fallback if all configured live providers fail
  console.error("All AI provider attempts failed:", sanitizeError(lastAttemptError?.message || "Unknown error"));
  if (resolvedWeatherData || resolvedHistoricalData) {
    const fallbackResp = weatherService.getMockWeatherConversationalResponse(
      message,
      resolvedWeatherData,
      resolvedTemporal,
      resolvedHistoricalData,
      forecastData
    );
    return res.json({
      response: fallbackResp,
      city: activeCityResolved,
      session_id: session_id || ""
    });
  }

  return res.json({
    response: getMockResponse(message, activeModel),
    city: activeCityResolved,
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
    console.log(`WeatherGPT Backend server running on http://localhost:${port}`);
    console.log(`Weather APIs:`);
    console.log(`- GET /api/v1/weather/current?city={city}`);
    console.log(`- GET /api/v1/weather/forecast?city={city}&days={days}`);
    console.log(`- GET /api/v1/weather/hourly?city={city}&hours={hours}`);
    console.log(`- GET /api/v1/weather/history?city={city}&start_date={YYYY-MM-DD}&end_date={YYYY-MM-DD}`);
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

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

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
        defaultModel: "gemini",
        apiKeys: {
          gemini: "",
          openai: "",
          claude: ""
        }
      };
    }
    const data = fs.readFileSync(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(data || "{}");
    return {
      defaultModel: parsed.defaultModel || "gemini",
      apiKeys: {
        gemini: parsed.apiKeys?.gemini || "",
        openai: parsed.apiKeys?.openai || "",
        claude: parsed.apiKeys?.claude || ""
      }
    };
  } catch (err) {
    console.error("Error reading settings file:", err);
    return {
      defaultModel: "gemini",
      apiKeys: {
        gemini: "",
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

function maskKey(key) {
  if (!key) return "";
  if (key === "your_gemini_api_key_here" || key === "your_openai_api_key_here" || key === "your_claude_api_key_here") {
    return "";
  }
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function isMasked(key) {
  if (!key) return false;
  return key.includes("...") || key.includes("•••") || key === "••••••••";
}

// Health check returns status & model details
app.get("/api/health", (req, res) => {
  const settings = readSettings();
  const geminiKey = settings.apiKeys.gemini || process.env.GEMINI_API_KEY;
  const isLive = geminiKey && geminiKey !== "your_gemini_api_key_here";
  res.json({ status: "ok", mode: isLive ? "live" : "mock" });
});

// Settings API endpoints
app.get("/api/settings", (req, res) => {
  const settings = readSettings();
  
  // Resolve effective keys (settings or env) to check configuration status
  const geminiKey = settings.apiKeys.gemini || process.env.GEMINI_API_KEY || "";
  const openaiKey = settings.apiKeys.openai || process.env.OPENAI_API_KEY || "";
  const claudeKey = settings.apiKeys.claude || process.env.CLAUDE_API_KEY || "";

  res.json({
    defaultModel: settings.defaultModel,
    apiKeys: {
      gemini: maskKey(geminiKey),
      openai: maskKey(openaiKey),
      claude: maskKey(claudeKey)
    }
  });
});

app.post("/api/settings", (req, res) => {
  const { defaultModel, apiKeys } = req.body;
  if (!defaultModel) {
    return res.status(400).json({ error: "defaultModel is required" });
  }

  const currentSettings = readSettings();
  const newSettings = {
    defaultModel,
    apiKeys: {
      gemini: currentSettings.apiKeys.gemini,
      openai: currentSettings.apiKeys.openai,
      claude: currentSettings.apiKeys.claude
    }
  };

  if (apiKeys) {
    if (apiKeys.gemini !== undefined && !isMasked(apiKeys.gemini)) {
      newSettings.apiKeys.gemini = apiKeys.gemini.trim();
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
  "Hello! I am a modern AI chatbot. How can I help you today?",
  "That is an interesting question. In a production environment, I would connect to the API to give you a fully reasoned response, but since the API key is not configured, I am running in mock mode!",
  "Here is some formatted code for you:\n\n```javascript\nfunction greet(name) {\n  console.log(`Hello, ${name}!`);\n}\n\ngreet('Developer');\n```\n\nYou can copy this code block using the button in the top right!",
  "Let me break this down for you:\n1. **Step One**: Open the Settings modal via the gear icon in the header.\n2. **Step Two**: Input your API Key for the selected model.\n3. **Step Three**: Start chatting with live AI!",
  "Sure! Here is a table comparing REST APIs and WebSockets:\n\n| Feature | REST API | WebSockets |\n| --- | --- | --- |\n| Protocol | HTTP | TCP (ws://) |\n| Communication | Request-Response | Bidirectional |\n| Use Case | CRUD operations | Real-time chat |",
  "I am fully responsive, supporting beautiful glassmorphic dark and light themes, message copying, auto scroll, and sidebar management."
];

let mockCounter = 0;

function getMockResponse(userMessage, model) {
  const modelName = model === "openai" ? "OpenAI GPT-4o-mini" : 
                    model === "claude" ? "Claude 3.5 Sonnet" : 
                    "Gemini 2.5 Flash";
  
  const prefix = `[${modelName}] (Mock Mode)\n\n`;
  const msg = userMessage.toLowerCase().trim();
  
  if (msg.includes("hello") || msg.includes("hi") || msg.includes("hey")) {
    return prefix + `Hello there! I'm your AI assistant running in mock mode. How can I help you today?`;
  }
  if (msg.includes("code") || msg.includes("javascript") || msg.includes("programming")) {
    return prefix + "Certainly! Here is an example of a simple Express server setup:\n\n```javascript\nconst express = require('express');\nconst app = express();\n\napp.get('/', (req, res) => {\n  res.send('Hello World!');\n});\n\napp.listen(3000, () => {\n  console.log('Server is running on port 3000');\n});\n```\n\nYou can easily copy this code block to start your next backend project.";
  }
  if (msg.includes("who are you") || msg.includes("your name")) {
    return prefix + `I am a local AI Chatbot built using React and Node.js. When configured with an API key, I connect directly to the chosen AI model. Right now I am simulating responses!`;
  }
  if (msg.includes("help") || msg.includes("what can you do")) {
    return prefix + "I can help you with:\n\n- Writing and debugging **code**\n- Structuring scientific **reports**\n- Formatting data in **markdown tables**\n- Having interactive discussions\n\nJust configure your API keys in the Settings modal!";
  }
  
  // Default circular mock responses
  const resp = mockResponses[mockCounter % mockResponses.length];
  mockCounter++;
  return prefix + resp;
}

// Web search helper querying Tavily or SerpAPI
async function searchWeb(query) {
  const apiKey = process.env.WEB_SEARCH_API_KEY || process.env.TAVILY_API_KEY || process.env.SERPAPI_API_KEY || "";
  if (!apiKey) {
    console.warn("WEB_SEARCH_API_KEY is not set. Using mock search fallback.");
    return [
      {
        title: "Mock Search Result: AI Chatbot updates",
        url: "https://ai-chatbot-mock.onrender.com/updates",
        content: `Simulated search result snippet for: "${query}". Gemini chatbot web search integration is functional. Set a valid Tavily API key to get live search results.`
      }
    ];
  }

  // Detect which API engine is used
  const isTavily = apiKey.startsWith("tvly-") || process.env.TAVILY_API_KEY || (!process.env.SERPAPI_API_KEY);

  try {
    if (isTavily) {
      console.log(`Querying Tavily search for: "${query}"`);
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          api_key: apiKey,
          query: query,
          max_results: 5
        })
      });

      if (!response.ok) {
        throw new Error(`Tavily API responded with status ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      return (data.results || []).map(r => ({
        title: r.title || "Search Result",
        url: r.url || "",
        content: r.content || ""
      }));
    } else {
      console.log(`Querying SerpAPI search for: "${query}"`);
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&engine=google`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`SerpAPI responded with status ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      return (data.organic_results || []).slice(0, 5).map(r => ({
        title: r.title || "Search Result",
        url: r.link || r.url || "",
        content: r.snippet || ""
      }));
    }
  } catch (err) {
    console.error("Web search API request failed:", err);
    return [];
  }
}

// Classifier helper to detect current/latest/news/realtime questions
function isCurrentQuestion(message) {
  const cleanMsg = message.toLowerCase();
  
  const keywords = [
    "news", "weather", "sports", "score", "price", "stock", "rate", "election",
    "today", "yesterday", "current", "latest", "recent", "now", "currently",
    "happenings", "status of", "update on", "who is the current", "who is the president",
    "who is the prime minister", "who won", "what is the price of", "politics", "cabinet",
    "government posts", "yesterday's"
  ];
  
  const years = /\b(2025|2026|2027)\b/;

  const hasKeyword = keywords.some(kw => {
    const rx = new RegExp(`\\b${kw}\\b`, "i");
    return rx.test(cleanMsg);
  });

  return hasKeyword || years.test(cleanMsg);
}

// POST endpoint for chat
app.post("/api/chat", async (req, res) => {
  const { message, history, model, attachment } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const settings = readSettings();
  const activeModel = model || settings.defaultModel || "gemini";

  // Resolve API Key
  let apiKey = "";
  if (activeModel === "gemini") {
    apiKey = settings.apiKeys.gemini || process.env.GEMINI_API_KEY || "";
  } else if (activeModel === "openai") {
    apiKey = settings.apiKeys.openai || process.env.OPENAI_API_KEY || "";
  } else if (activeModel === "claude") {
    apiKey = settings.apiKeys.claude || process.env.CLAUDE_API_KEY || "";
  }

  const isPlaceholder = !apiKey || 
    apiKey === "your_gemini_api_key_here" || 
    apiKey === "your_openai_api_key_here" || 
    apiKey === "your_claude_api_key_here";

  if (isPlaceholder) {
    // Return mock response with a realistic network typing delay
    setTimeout(() => {
      res.json({
        response: getMockResponse(message, activeModel)
      });
    }, 1500);
    return;
  }

  try {
    if (activeModel === "gemini") {
      const { GoogleGenerativeAI } = require("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const formattedHistory = [];
      if (history && Array.isArray(history)) {
        history.forEach(item => {
          formattedHistory.push({
            role: item.role === "assistant" ? "model" : "user",
            parts: [{ text: item.content }]
          });
        });
      }

      const chat = geminiModel.startChat({
  history: [
    {
      role: "user",
      parts: [{
       text: "You are a helpful AI assistant. Answer directly when you know the answer. If web search results are provided, use them and give the answer with sources. Only say verify official sources if the answer is uncertain. Do not refuse simple current affairs questions."
      }]
    },
    {
      role: "model",
      parts: [{ text: "Understood." }]
    },
    ...formattedHistory
  ],
});

      let finalPrompt = message;
      let isSearchActive = false;

      if (isCurrentQuestion(message)) {
        const searchResults = await searchWeb(message);
        if (searchResults && searchResults.length > 0) {
          isSearchActive = true;
          let contextText = "";
          searchResults.forEach((res, idx) => {
            contextText += `[Result ${idx + 1}] Title: ${res.title}\nURL: ${res.url}\nSnippet: ${res.content}\n\n`;
          });

          finalPrompt = `You are a helpful AI assistant with live web search capability.
Answer the user's question accurately using the provided search results as your primary context.
Prioritize these search results for current facts, dates, news, and events.
At the end of your response, list the references you used under a clear "Sources:" heading with their corresponding clickable URLs from the search results.

Web Search Results:
${contextText}

User Question:
${message}`;
        }
      }

      if (!isSearchActive) {
        // Normal non-search system instruction wrapper
        finalPrompt = `You are a helpful AI assistant.
Answer the user's question to the best of your ability.

User Question:
${message}`;
      }

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
      const responseText = result.response.text();
      res.json({ response: responseText });

    } else if (activeModel === "openai") {
      // Map history for OpenAI format: [{ role: "user" | "assistant", content: "..." }]
      const messages = [
        { role: "system", content: "You are a helpful assistant." }
      ];
      if (history && Array.isArray(history)) {
        history.forEach(item => {
          messages.push({
            role: item.role === "assistant" ? "assistant" : "user",
            content: item.content
          });
        });
      }
      const userContent = [
        { type: "text", text: message }
      ];
      if (attachment && attachment.data && attachment.mimeType && attachment.mimeType.startsWith("image/")) {
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:${attachment.mimeType};base64,${attachment.data}`
          }
        });
      }
      messages.push({ role: "user", content: userContent });

      const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: messages
        })
      });

      if (!openAiResponse.ok) {
        const errorText = await openAiResponse.text();
        throw new Error(`OpenAI API returned status ${openAiResponse.status}: ${errorText}`);
      }

      const data = await openAiResponse.json();
      const responseText = data.choices?.[0]?.message?.content || "";
      res.json({ response: responseText });

    } else if (activeModel === "claude") {
      // Map history for Claude messages format: [{ role: "user" | "assistant", content: "..." }]
      const messages = [];
      if (history && Array.isArray(history)) {
        history.forEach(item => {
          messages.push({
            role: item.role === "assistant" ? "assistant" : "user",
            content: item.content
          });
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
      messages.push({ role: "user", content: userContent });

      const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1024,
          messages: messages
        })
      });

      if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        throw new Error(`Claude API returned status ${claudeResponse.status}: ${errorText}`);
      }

      const data = await claudeResponse.json();
      const responseText = data.content?.[0]?.text || "";
      res.json({ response: responseText });
    } else {
      throw new Error(`Unsupported model: ${activeModel}`);
    }
  } catch (error) {
    console.error(`${activeModel} API error:`, error);
    res.status(500).json({ 
      error: "Failed to generate AI response", 
      details: error.message 
    });
  }
});

// JSON History Database Helpers
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

// History REST endpoints
app.get("/api/history", (req, res) => {
  const history = readHistory();
  res.json(history);
});

app.post("/api/history", (req, res) => {
  const conversation = req.body;
  if (!conversation || !conversation.id) {
    return res.status(400).json({ error: "Invalid conversation structure" });
  }

  let history = readHistory();
  const index = history.findIndex(c => c.id === conversation.id);

  if (index > -1) {
    // Update existing conversation
    history[index] = {
      ...history[index],
      ...conversation,
      updatedAt: new Date().toISOString()
    };
  } else {
    // Add new conversation
    history.unshift({
      ...conversation,
      createdAt: conversation.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  writeHistory(history);
  res.json({ success: true, conversation: conversation });
});

app.delete("/api/history/:id", (req, res) => {
  const { id } = req.params;
  let history = readHistory();
  const filtered = history.filter(c => c.id !== id);
  writeHistory(filtered);
  res.json({ success: true });
});

app.delete("/api/history", (req, res) => {
  writeHistory([]);
  res.json({ success: true });
});

// Transcribe audio using Gemini multimodal model
app.post("/api/transcribe", async (req, res) => {
  const { audio, mimeType, language } = req.body;

  if (!audio) {
    return res.status(400).json({ error: "Audio data is required" });
  }

  const settings = readSettings();
  const apiKey = settings.apiKeys.gemini || process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    setTimeout(() => {
      res.json({ text: "Hello! This is a mock transcription because your API key is not configured." });
    }, 1500);
    return;
  }

  try {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const langHint = language === "ta-IN" ? "Tamil" : "English";

    const result = await model.generateContent([
      {
        inlineData: {
          data: audio,
          mimeType: mimeType || "audio/webm"
        }
      },
      `Provide only the transcription of this audio. The language spoken is likely ${langHint}. Do not add any introductory or explanatory text, formatting, or commentary. Output only the verbatim words spoken in the audio. If you detect speech in a different language, transcribe that instead.`
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
    console.log(`Backend server running on http://localhost:${port}`);
    if (!process.env.GEMINI_API_KEY) {
      console.warn("WARNING: GEMINI_API_KEY is not set. Server is running in MOCK mode.");
    } else {
      console.log("Gemini API key detected. Server is running in LIVE mode.");
    }
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

module.exports = { startServer, stopServer };

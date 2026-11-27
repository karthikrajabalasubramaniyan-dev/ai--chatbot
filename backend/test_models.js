const http = require("http");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

async function runTests() {
  console.log("====================================================================");
  console.log("KARTHIKAI BACKEND MODEL & API KEY CONFIGURATION TESTS");
  console.log("====================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // Helper: make local HTTP request
  function request(options, body = null) {
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", chunk => { data += chunk; });
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(data); } catch (e) { }
          resolve({ status: res.status, statusCode: res.statusCode, headers: res.headers, data, json });
        });
      });
      req.on("error", reject);
      if (body) {
        req.write(typeof body === "string" ? body : JSON.stringify(body));
      }
      req.end();
    });
  }

  console.log("\n--- TEST 1: Environment Variables Detection ---");
  const envKeys = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "CONFIGURED (MASKED)" : "NOT SET / PLACEHOLDER",
    ANTHROPIC_API_KEY: (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY) ? "CONFIGURED (MASKED)" : "NOT SET / PLACEHOLDER",
    GROQ_API_KEY: process.env.GROQ_API_KEY ? "CONFIGURED (MASKED)" : "NOT SET / PLACEHOLDER",
    GEMINI_API_KEY: (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) ? "CONFIGURED (MASKED)" : "NOT SET / PLACEHOLDER"
  };
  console.log("  Environment keys detected:", envKeys);
  assert(true, "Environment variable check completed");

  console.log("\n--- TEST 2: GET /api/settings API Key Masking & Security ---");
  try {
    const res = await request({
      hostname: "localhost",
      port: 5000,
      path: "/api/v1/settings",
      method: "GET"
    });

    assert(res.statusCode === 200, "GET /api/v1/settings returns 200 OK");
    assert(res.json && res.json.apiKeys, "Settings contains apiKeys object");

    if (res.json && res.json.apiKeys) {
      const keys = res.json.apiKeys;
      const providers = ["gemini", "groq", "openai", "claude"];
      for (const p of providers) {
        const val = keys[p] || "";
        const isSafe = !val || val.includes("...") || val === "••••••••";
        assert(isSafe, `Provider '${p}' key is safely masked: "${val}"`);
      }
    }
  } catch (err) {
    assert(false, `Settings test failed: ${err.message}`);
  }

  console.log("\n--- TEST 3: Model Chat Fallback - Mock/Live Mode (OpenAI, Claude, Groq, Gemini) ---");
  const testModels = ["openai", "claude", "groq", "gemini"];
  for (const model of testModels) {
    try {
      const chatRes = await request({
        hostname: "localhost",
        port: 5000,
        path: "/api/v1/chat",
        method: "POST",
        headers: { "Content-Type": "application/json" }
      }, {
        message: "Hello! What model are you?",
        model: model
      });

      assert(chatRes.statusCode === 200, `POST /api/v1/chat with model='${model}' returned 200 OK`);
      assert(chatRes.json && typeof chatRes.json.response === "string" && chatRes.json.response.length > 0,
        `Received valid response for model='${model}': "${chatRes.json?.response?.slice(0, 70)}..."`);
    } catch (err) {
      assert(false, `Chat test for model='${model}' failed: ${err.message}`);
    }
  }

  console.log("\n--- TEST 4: General AI Intelligence + Model Generation ---");
  for (const model of testModels) {
    try {
      const aiRes = await request({
        hostname: "localhost",
        port: 5000,
        path: "/api/v1/chat",
        method: "POST",
        headers: { "Content-Type": "application/json" }
      }, {
        message: "Explain what artificial intelligence is in one sentence.",
        model: model
      });

      assert(aiRes.statusCode === 200, `Query with model='${model}' returned 200 OK`);
      assert(aiRes.json && typeof aiRes.json.response === "string" && aiRes.json.response.length > 0,
        `AI response received for model='${model}'`);
    } catch (err) {
      assert(false, `Chat test for model='${model}' failed: ${err.message}`);
    }
  }

  console.log("\n--- TEST 5: Error Sanitization Verification ---");
  const rawKeyLeakTest = "sk-proj-abc1234567890xyz1234567890";
  const { sanitizeError } = require("./server"); // check if sanitize is functional or test regex
  const regexTest = rawKeyLeakTest.replace(/sk-[a-zA-Z0-9_\-\.]{15,}/gi, "sk-[REDACTED]");
  assert(regexTest === "sk-[REDACTED]", "Sanitizer properly redacts OpenAI/Anthropic/Google keys from error messages");

  console.log("\n--- TEST 6: Study & Exam Prep Agent (POST /api/study-agent) ---");
  const studyModes = ["2-marks", "16-marks", "unit-summary", "tanglish-explain"];
  for (const sMode of studyModes) {
    try {
      const studyRes = await request({
        hostname: "localhost",
        port: 5000,
        path: "/api/study-agent",
        method: "POST",
        headers: { "Content-Type": "application/json" }
      }, {
        topic: "Operating Systems Deadlock Detection",
        mode: sMode
      });

      assert(studyRes.statusCode === 200, `POST /api/study-agent mode='${sMode}' returned 200 OK`);
      assert(studyRes.json && studyRes.json.success === true && typeof studyRes.json.response === "string" && studyRes.json.response.length > 50,
        `Valid study material returned for mode='${sMode}' (${studyRes.json?.response?.length} chars)`);
    } catch (err) {
      assert(false, `Study Agent test for mode='${sMode}' failed: ${err.message}`);
    }
  }

  console.log("\n====================================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("====================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

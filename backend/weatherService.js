/**
 * Weather Service Module
 * Handles:
 * 1. Weather Intent Detection (Current, Forecast, Hourly, Historical, Comparison)
 * 2. Location Extraction (from query, active city payload, & conversation history)
 * 3. Temporal Extraction (Today, Tomorrow, Hourly, Weekend, Date Ranges, Relative Past, Comparisons)
 * 4. Geocoding & India-Wide Location Search (Open-Meteo Geocoding API with India preference)
 * 5. Current Meteorological Data Fetching (Open-Meteo Forecast API)
 * 6. Multi-Day Forecast Meteorological Data Fetching (Open-Meteo Forecast API)
 * 7. Hourly Meteorological Data Fetching (Open-Meteo Forecast API)
 * 8. Historical Meteorological Data Fetching (Open-Meteo Historical Archive API)
 * 9. LLM Weather Context Formatting (Current, Forecast, Historical, Comparison)
 */

// WMO Weather interpretation codes
const WMO_CODE_MAP = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  62: "Moderate rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snowfall",
  73: "Moderate snowfall",
  75: "Heavy snowfall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail"
};

function decodeWmoCode(code) {
  return WMO_CODE_MAP[code] || "Partly cloudy";
}

/**
 * 1. Detect if a message is asking about weather-related information
 */
function isWeatherQuery(message) {
  if (!message || typeof message !== "string") return false;
  const msg = message.toLowerCase().trim();

  const weatherKeywords = [
    "weather", "temperature", "forecast", "climate",
    "rain", "raining", "rainy", "rainfall", "rainstorm", "shower", "showers", "drizzle", "downpour",
    "humidity", "humid", "wind", "windy", "breeze", "breezy", "gusts", "gust", "pressure",
    "sunny", "sunshine", "hot", "cold", "warm", "chilly", "freezing", "heat", "heatwave",
    "snow", "snowing", "snowfall", "blizzard", "hail", "sleet",
    "thunder", "thunderstorm", "lightning", "storm", "cyclone", "typhoon", "hurricane",
    "uv index", "air quality", "cloudy", "overcast", "fog", "foggy", "mist",
    "umbrella", "jacket", "coat", "sweater", "sunscreen", "travel", "outdoor", "walk", "picnic",
    "historical", "yesterday", "last week", "last month", "compare"
  ];

  const weatherPatterns = [
    /\b(weather|forecast|climate|temp|temperature)\b/i,
    /\b(will|is|did|does|was|were|might|could)\s+(it\s+)?(rain|pour|snow|freeze|drizzle|storm|hot|cold|warm|windy|cloudy|sunny)\b/i,
    /\b(how\s+was|what\s+was|how\s+hot\s+was|how\s+cold\s+was|how\s+is|what\s+is|what's)\s+(the\s+weather|the\s+temp|the\s+temperature|it|today|tomorrow|yesterday|this\s+weekend)\b/i,
    /\b(chance\s+of\s+rain|rain\s+probability|rain\s+chance|rain\s+percentage|rainfall|precipitation)\b/i,
    /\b(can|should|is\s+it\s+safe\s+to|good\s+to|safe\s+to)\s+(i|we|people)\s+(go|travel|drive|fly|walk|step)\s+(outside|out|today|tomorrow|yesterday|for\s+a\s+walk)?\b/i,
    /\b(how('s|\s+is)\s+(the\s+weather|it\s+outside|the\s+temperature|the\s+climate|today|tomorrow|yesterday|weekend))\b/i,
    /\b(do\s+i\s+need|should\s+i\s+take|carry|wear)\s+(an?\s+)?(umbrella|raincoat|jacket|sweater|sunscreen|coat)\b/i,
    /\b(what\s+is\s+the\s+temp|how\s+hot|how\s+cold|how\s+warm)\b/i,
    /\b(weather\s+in|weather\s+at|weather\s+for|weather\s+here|forecast\s+for|forecast\s+in)\b/i,
    /\b(hourly\s+weather|hourly\s+forecast|next\s+\d+\s+hours|weather\s+by\s+hour)\b/i,
    /\b(historical\s+weather|past\s+weather|weather\s+history|weather\s+between|weather\s+from)\b/i,
    /\b(compare\s+(today|this\s+week|yesterday|the\s+weather))\b/i,
    /\bwhat\s+about\s+([a-zA-Z\s.-]+)\b/i
  ];

  for (const pattern of weatherPatterns) {
    if (pattern.test(msg)) return true;
  }

  return weatherKeywords.some(kw => {
    const rx = new RegExp(`\\b${kw}\\b`, "i");
    return rx.test(msg);
  });
}

function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const MONTH_MAP = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

/**
 * 2. Determine query intent (current, forecast, hourly, historical, comparison)
 */
function extractTemporalIntent(message) {
  const msg = message.toLowerCase().trim();
  const today = new Date();
  const currentYear = today.getFullYear();

  // 1. Comparison Intent
  if (/\bcompare\b/i.test(msg)) {
    if (/\b(this\s+week|week)\b/i.test(msg) && /\blast\s+week\b/i.test(msg)) {
      const lastWeekStart = new Date(today);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      const lastWeekEnd = new Date(today);
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);

      return {
        type: "comparison",
        comparisonType: "week_vs_last_week",
        description: "this week compared with last week",
        historicalStartDate: formatDateISO(lastWeekStart),
        historicalEndDate: formatDateISO(lastWeekEnd)
      };
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = formatDateISO(yesterday);

    return {
      type: "comparison",
      comparisonType: "today_vs_yesterday",
      description: "today compared with yesterday",
      historicalStartDate: yStr,
      historicalEndDate: yStr
    };
  }

  // 2. Historical: Date range (Month Day to Month Day, Year OR Day Month to Day Month, Year)
  const rangeMatch1 = msg.match(/\b(?:from|between)?\s*([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(?:to|and|-|through)\s+(?:([a-zA-Z]+)\s+)?(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\b/i);
  if (rangeMatch1 && MONTH_MAP[rangeMatch1[1].toLowerCase()]) {
    const month1Str = rangeMatch1[1].toLowerCase();
    const day1 = parseInt(rangeMatch1[2], 10);
    const month2Str = (rangeMatch1[3] || rangeMatch1[1]).toLowerCase();
    const day2 = parseInt(rangeMatch1[4], 10);
    const year = rangeMatch1[5] ? parseInt(rangeMatch1[5], 10) : currentYear;

    const m1 = MONTH_MAP[month1Str];
    const m2 = MONTH_MAP[month2Str];

    if (m1 && m2 && day1 >= 1 && day1 <= 31 && day2 >= 1 && day2 <= 31) {
      const sDate = `${year}-${String(m1).padStart(2, "0")}-${String(day1).padStart(2, "0")}`;
      const eDate = `${year}-${String(m2).padStart(2, "0")}-${String(day2).padStart(2, "0")}`;
      return {
        type: "historical",
        description: `${month1Str} ${day1} to ${month2Str} ${day2}, ${year}`,
        startDate: sDate,
        endDate: eDate
      };
    }
  }

  const rangeMatch2 = msg.match(/\b(?:from|between)?\s*(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)\s+(?:to|and|-|through)\s+(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)?,?\s*(\d{4})?\b/i);
  if (rangeMatch2 && MONTH_MAP[rangeMatch2[2].toLowerCase()]) {
    const day1 = parseInt(rangeMatch2[1], 10);
    const month1Str = rangeMatch2[2].toLowerCase();
    const day2 = parseInt(rangeMatch2[3], 10);
    const month2Str = (rangeMatch2[4] || rangeMatch2[2]).toLowerCase();
    const year = rangeMatch2[5] ? parseInt(rangeMatch2[5], 10) : currentYear;

    const m1 = MONTH_MAP[month1Str];
    const m2 = MONTH_MAP[month2Str];

    if (m1 && m2 && day1 >= 1 && day1 <= 31 && day2 >= 1 && day2 <= 31) {
      const sDate = `${year}-${String(m1).padStart(2, "0")}-${String(day1).padStart(2, "0")}`;
      const eDate = `${year}-${String(m2).padStart(2, "0")}-${String(day2).padStart(2, "0")}`;
      return {
        type: "historical",
        description: `${day1} ${month1Str} to ${day2} ${month2Str}, ${year}`,
        startDate: sDate,
        endDate: eDate
      };
    }
  }

  // 3. Historical: Single explicit date (Month Day, Year OR Day Month, Year)
  const singleDateMatch1 = msg.match(/\b(?:on\s+)?([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\b/i);
  if (singleDateMatch1 && MONTH_MAP[singleDateMatch1[1].toLowerCase()]) {
    const monthStr = singleDateMatch1[1].toLowerCase();
    const dayVal = parseInt(singleDateMatch1[2], 10);
    const yearVal = singleDateMatch1[3] ? parseInt(singleDateMatch1[3], 10) : currentYear;
    const monthNum = MONTH_MAP[monthStr];

    if (monthNum && dayVal >= 1 && dayVal <= 31) {
      const dateStr = `${yearVal}-${String(monthNum).padStart(2, "0")}-${String(dayVal).padStart(2, "0")}`;
      return {
        type: "historical",
        description: `${monthStr} ${dayVal}, ${yearVal}`,
        startDate: dateStr,
        endDate: dateStr
      };
    }
  }

  const singleDateMatch2 = msg.match(/\b(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+),?\s*(\d{4})?\b/i);
  if (singleDateMatch2 && MONTH_MAP[singleDateMatch2[2].toLowerCase()]) {
    const dayVal = parseInt(singleDateMatch2[1], 10);
    const monthStr = singleDateMatch2[2].toLowerCase();
    const yearVal = singleDateMatch2[3] ? parseInt(singleDateMatch2[3], 10) : currentYear;
    const monthNum = MONTH_MAP[monthStr];

    if (monthNum && dayVal >= 1 && dayVal <= 31) {
      const dateStr = `${yearVal}-${String(monthNum).padStart(2, "0")}-${String(dayVal).padStart(2, "0")}`;
      return {
        type: "historical",
        description: `${dayVal} ${monthStr}, ${yearVal}`,
        startDate: dateStr,
        endDate: dateStr
      };
    }
  }

  // 4. Historical: ISO format (range or single)
  const isoRangeMatch = msg.match(/\b(\d{4}-\d{2}-\d{2})\s+(?:to|and|-|through)\s+(\d{4}-\d{2}-\d{2})\b/);
  if (isoRangeMatch) {
    return {
      type: "historical",
      description: `${isoRangeMatch[1]} to ${isoRangeMatch[2]}`,
      startDate: isoRangeMatch[1],
      endDate: isoRangeMatch[2]
    };
  }

  const isoSingleMatch = msg.match(/\b(?:on\s+)?(\d{4}-\d{2}-\d{2})\b/);
  if (isoSingleMatch) {
    return {
      type: "historical",
      description: `${isoSingleMatch[1]}`,
      startDate: isoSingleMatch[1],
      endDate: isoSingleMatch[1]
    };
  }

  // 5. Historical: Yesterday
  if (/\byesterday\b/i.test(msg)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    const dateStr = formatDateISO(d);
    return {
      type: "historical",
      description: "yesterday",
      startDate: dateStr,
      endDate: dateStr
    };
  }

  // 6. Historical: Last week / Last 7 days
  if (/\b(last\s+week|past\s+week|last\s+7\s+days)\b/i.test(msg)) {
    const end = new Date(today);
    end.setDate(end.getDate() - 1);
    const start = new Date(today);
    start.setDate(start.getDate() - 7);
    return {
      type: "historical",
      description: "last week",
      startDate: formatDateISO(start),
      endDate: formatDateISO(end)
    };
  }

  // 7. Historical: Last month
  if (/\blast\s+month\b/i.test(msg)) {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return {
      type: "historical",
      description: "last month",
      startDate: formatDateISO(start),
      endDate: formatDateISO(end)
    };
  }

  // 8. Past tense question ("was", "were", "did it rain") -> default to yesterday
  if (/\b(was|were|did\s+it\s+rain|happened|past\s+weather)\b/i.test(msg) && !/\b(today|tomorrow|now|currently|tonight)\b/i.test(msg)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    const dateStr = formatDateISO(d);
    return {
      type: "historical",
      description: "yesterday",
      startDate: dateStr,
      endDate: dateStr
    };
  }

  // 9. Hourly
  if (/\b(hourly|hour\s+by\s+hour|by\s+the\s+hour|(?:next|for|the)?\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty-four|24|48)\s*[- ]?hours?)\b/i.test(msg)) {
    const wordHours = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, 'twenty-four': 24, twentyfour: 24 };
    const hourMatch = msg.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty-four|24|48)\s*[- ]?hours?\b/i);
    let hours = 24;
    if (hourMatch && hourMatch[1]) {
      const raw = hourMatch[1].toLowerCase();
      hours = wordHours[raw] || parseInt(raw, 10);
    }
    hours = Math.min(Math.max(hours || 24, 1), 48);
    return {
      type: "hourly",
      description: `next ${hours} hours`,
      hours
    };
  }

  // 10. Weekend
  if (/\b(weekend|this\s+weekend|saturday|sunday)\b/i.test(msg)) {
    return {
      type: "weekend",
      description: "this weekend"
    };
  }

  // 11. Tomorrow
  if (/\btomorrow\b/i.test(msg)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return {
      type: "tomorrow",
      description: "tomorrow",
      targetDate: formatDateISO(d)
    };
  }

  // 12. Multi-day forecast (e.g. "5 day forecast", "5-day forecast", "5 days weather", "next 5 days", "weekly", "10 days")
  const forecastPattern = /\b(?:(?:next|for|the)?\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|14)\s*[- ]?days?(?:\s+(?:weather|forecast))?|forecast|weekly|this\s+week|next\s+week|extended)\b/i;
  if (forecastPattern.test(msg)) {
    const wordNumbers = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fourteen: 14 };
    const numMatch = msg.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|14)\s*[- ]?days?\b/i);
    let days = 7;
    if (numMatch && numMatch[1]) {
      const raw = numMatch[1].toLowerCase();
      days = wordNumbers[raw] || parseInt(raw, 10);
    }
    days = Math.min(Math.max(days || 7, 1), 14);
    return {
      type: "forecast",
      description: `${days}-day forecast`,
      days
    };
  }

  // Default: current weather
  return {
    type: "current",
    description: "current and forecast"
  };
}

const LOCATION_BLACKLIST = new Set([
  "give", "gives", "given", "giving", "show", "shows", "showing", "tell", "tells", "telling", 
  "get", "gets", "getting", "check", "checking", "find", "finding", "provide", "display", "fetch", 
  "know", "see", "please", "can", "could", "would", "should", "will", "what", "whats", "how", "hows", 
  "why", "when", "where", "who", "which", "is", "are", "was", "were", "am", "be", "been", "being", 
  "do", "does", "did", "have", "has", "had", "next", "previous", "past", "last", "coming", "upcoming", 
  "hour", "hours", "hr", "hrs", "day", "days", "week", "weeks", "month", "months", "year", "years", 
  "time", "times", "report", "reports", "update", "updates", "info", "information", "data", "details", 
  "summary", "condition", "conditions", "status", "overview", "prediction", "outlook", "hourly", 
  "daily", "weekly", "monthly", "today", "tomorrow", "yesterday", "tonight", "morning", "afternoon", 
  "evening", "night", "now", "current", "currently", "here", "there", "outside", "me", "us", "my", 
  "your", "our", "it", "its", "this", "that", "the", "a", "an", "city", "place", "location", "area", 
  "town", "village", "state", "country", "weather", "forecast", "climate", "temperature", "temp", 
  "rain", "raining", "rainfall", "humidity", "wind", "speed", "pressure", "uv", "aqi", "travel", 
  "safe", "good", "bad", "hot", "cold", "warm", "umbrella", "compare", "historical", "january", 
  "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"
]);

function cleanLocationCandidate(str) {
  if (!str || typeof str !== "string") return null;
  let s = str.trim()
    .replace(/^[,\s?.!-]+|[,\s?.!-]+$/g, "")
    .replace(/^(?:the|a|an|in|at|for|near|around|of|to|from)\s+/i, "")
    .replace(/\s+(?:today|tomorrow|yesterday|now|right\s+now|currently|this\s+weekend|next\s+week|last\s+week)$/i, "")
    .trim();

  // Strip temporal suffixes like "for the next 6 hours" or "for 5 days"
  s = s.replace(/\s+(?:for|in)\s+(?:the\s+)?(?:next|past|last)?\s*\d+\s*(?:hours?|days?|weeks?|months?)$/i, "").trim();

  if (s.length < 2) return null;
  if (LOCATION_BLACKLIST.has(s.toLowerCase())) return null;

  // Filter out candidates consisting purely of blacklisted words or numbers
  const words = s.toLowerCase().split(/\s+/);
  const nonBlacklistWords = words.filter(w => !LOCATION_BLACKLIST.has(w) && !/^\d+$/.test(w));
  if (nonBlacklistWords.length === 0) return null;

  return s;
}

/**
 * 3. Extract target location from message, active city payload, or conversation history
 */
function extractLocation(message, history = [], activeCity = null, clientLocation = null) {
  if (!message || typeof message !== "string") {
    if (activeCity) return { locationName: activeCity, source: "payload", isExplicitInQuery: false };
    return null;
  }
  const rawMsg = message.trim();

  // Strip leading conversational command prefixes
  const commandPrefixRegex = /^(?:please\s+)?(?:can\s+you\s+|could\s+you\s+|would\s+you\s+)?(?:give|show|tell|get|find|fetch|check|display|provide|let\s+me\s+know|what\s+is|whats|how\s+is|what\s+about|how\s+about)\s+(?:me\s+|us\s+)?(?:the\s+|a\s+|an\s+)?/i;

  // Pattern 1: Explicit preposition with city name
  // Match "in/at/for/around/near/of <City>"
  const prepRegex = /\b(?:in|at|for|around|near|of)\s+([a-zA-Z\u0080-\uFFFF\s.-]+?)(?:\s+(?:for|in|at|from|to|between|on|today|tomorrow|yesterday|now|right\s+now|currently|hourly|forecast|weather|temp|temperature|next\s+\d+|this\s+weekend|next\s+week|last\s+week)|[?!.]|$)/gi;

  let match;
  while ((match = prepRegex.exec(rawMsg)) !== null) {
    const rawCandidate = match[1];
    const candidate = cleanLocationCandidate(rawCandidate);
    if (candidate) {
      return {
        locationName: candidate,
        source: "query",
        isExplicitInQuery: true
      };
    }
  }

  // Pattern 2: "Show me <City> hourly weather" or "Tell me <City> weather"
  const strippedMsg = rawMsg.replace(commandPrefixRegex, "").trim();

  // Check if stripped query starts with a city name before weather terms
  const cityBeforeWeatherMatch = strippedMsg.match(/^([a-zA-Z\u0080-\uFFFF\s.-]+?)\s+(?:hourly|weather|forecast|temperature|temp|climate|rain|rainfall|aqi|air\s+quality|history|past\s+weather|conditions?)/i);
  if (cityBeforeWeatherMatch && cityBeforeWeatherMatch[1]) {
    const candidate = cleanLocationCandidate(cityBeforeWeatherMatch[1]);
    if (candidate) {
      return {
        locationName: candidate,
        source: "query",
        isExplicitInQuery: true
      };
    }
  }

  // Pattern 3: City at the very end of stripped message
  // e.g. "Next 6 hours Chennai", "Hourly weather Chennai"
  const cityAtEndMatch = strippedMsg.match(/(?:hourly|weather|forecast|temperature|temp|hours?|days?)\s+([a-zA-Z\u0080-\uFFFF\s.-]+)$/i);
  if (cityAtEndMatch && cityAtEndMatch[1]) {
    const candidate = cleanLocationCandidate(cityAtEndMatch[1]);
    if (candidate) {
      return {
        locationName: candidate,
        source: "query",
        isExplicitInQuery: true
      };
    }
  }

  // Pattern 4: "here" / "my location"
  if (/\b(here|my location|current location|local|where i am)\b/i.test(rawMsg)) {
    if (clientLocation && (clientLocation.city || (clientLocation.latitude && clientLocation.longitude))) {
      return {
        locationName: clientLocation.city || `${clientLocation.latitude},${clientLocation.longitude}`,
        latitude: clientLocation.latitude,
        longitude: clientLocation.longitude,
        source: "client",
        isExplicitInQuery: true
      };
    }
    if (activeCity) {
      return {
        locationName: activeCity,
        source: "payload",
        isExplicitInQuery: false
      };
    }
    return {
      locationName: "Chennai",
      source: "default_fallback",
      isExplicitInQuery: false
    };
  }

  // Pattern 5: Active city passed in request payload
  if (activeCity && typeof activeCity === "string" && activeCity.trim().length > 0) {
    return {
      locationName: activeCity.trim(),
      source: "payload",
      isExplicitInQuery: false
    };
  }

  // Pattern 6: Search conversation history
  if (Array.isArray(history) && history.length > 0) {
    for (let i = history.length - 1; i >= 0; i--) {
      const item = history[i];
      if (item && item.role === "user" && item.content) {
        const extracted = extractLocation(item.content, [], null, null);
        if (extracted && extracted.locationName && extracted.isExplicitInQuery) {
          return {
            locationName: extracted.locationName,
            source: "history",
            isExplicitInQuery: false
          };
        }
      }
    }
  }

  // Fallback default city
  return {
    locationName: "Chennai",
    source: "default_fallback",
    isExplicitInQuery: false
  };
}

function getWeatherApiKey() {
  return (process.env.WEATHER_API_KEY || "").trim();
}

function sanitizeError(str) {
  if (!str || typeof str !== "string") return "";
  return str.replace(/key=[a-zA-Z0-9_-]+/gi, "key=[REDACTED]");
}

async function fetchWithRetry(url, options = {}, retries = 3, backoffMs = 400) {
  const defaultHeaders = {
    "User-Agent": "WeatherGPT/2.0 (Meteorological Client)"
  };
  const mergedOptions = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {})
    }
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, mergedOptions);
      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${sanitizeError(errorBody)}`);
      }
      return await response.json();
    } catch (err) {
      if (attempt === retries) {
        throw new Error(sanitizeError(err.message));
      }
      await new Promise(res => setTimeout(res, backoffMs * attempt));
    }
  }
}

/**
 * 4. India-Wide & Global Location Autocomplete / Search
 * Supports WeatherAPI.com with Open-Meteo fallback
 */
async function searchLocations(query, limit = 10) {
  if (!query || typeof query !== "string") return [];
  const clean = query.trim();
  if (clean.length < 2) return [];

  const apiKey = getWeatherApiKey();

  // If WEATHER_API_KEY is available, query WeatherAPI.com search
  if (apiKey) {
    try {
      const url = `https://api.weatherapi.com/v1/search.json?key=${apiKey}&q=${encodeURIComponent(clean)}`;
      const data = await fetchWithRetry(url);
      if (Array.isArray(data) && data.length > 0) {
        // Prioritize India matches
        const sorted = [...data].sort((a, b) => {
          const aIndia = (a.country && a.country.toLowerCase() === "india") ? 1 : 0;
          const bIndia = (b.country && b.country.toLowerCase() === "india") ? 1 : 0;
          return bIndia - aIndia;
        });

        return sorted.slice(0, limit).map(r => ({
          id: r.id || `${r.lat},${r.lon}`,
          name: r.name,
          admin1: r.region || "",
          country: r.country || "",
          countryCode: r.country && r.country.toLowerCase() === "india" ? "IN" : "",
          latitude: r.lat,
          longitude: r.lon,
          timezone: "auto",
          displayName: [r.name, r.region, r.country].filter(Boolean).join(", ")
        }));
      }
    } catch (err) {
      // Fall through to Open-Meteo on error
    }
  }

  // Open-Meteo Geocoding Search
  try {
    const fetchCount = Math.max(limit * 2, 25);
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(clean)}&count=${fetchCount}&language=en&format=json`;
    const data = await fetchWithRetry(geoUrl);
    if (data && data.results && Array.isArray(data.results)) {
      const sorted = [...data.results].sort((a, b) => {
        const aIndia = (a.country_code === "IN" || (a.country && a.country.toLowerCase() === "india")) ? 1 : 0;
        const bIndia = (b.country_code === "IN" || (b.country && b.country.toLowerCase() === "india")) ? 1 : 0;
        return bIndia - aIndia;
      });

      return sorted.slice(0, limit).map(r => ({
        id: r.id,
        name: r.name,
        admin1: r.admin1 || "",
        country: r.country || "",
        countryCode: r.country_code || "",
        latitude: r.latitude,
        longitude: r.longitude,
        timezone: r.timezone || "auto",
        displayName: [r.name, r.admin1, r.country].filter(Boolean).join(", ")
      }));
    }
  } catch (err) {
    console.error("Location search API error:", err.message);
  }
  return [];
}

/**
 * 5. Geocode location name to coordinates (Prioritizes Indian matches when ambiguous)
 */
async function geocodeLocation(locationName) {
  if (!locationName) return null;
  const cleanName = locationName.trim();

  // If already coordinates "lat,lon"
  const coordMatch = cleanName.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
  if (coordMatch) {
    return {
      name: "Current Location",
      admin1: "",
      country: "",
      countryCode: "",
      latitude: parseFloat(coordMatch[1]),
      longitude: parseFloat(coordMatch[3]),
      timezone: "auto",
      displayName: `${coordMatch[1]}, ${coordMatch[3]}`
    };
  }

  const apiKey = getWeatherApiKey();

  // First try Open-Meteo geocoding to reliably disambiguate all Indian locations (e.g. Delhi -> India, Salem -> Tamil Nadu)
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanName)}&count=25&language=en&format=json`;
    const data = await fetchWithRetry(geoUrl);
    if (data && data.results && data.results.length > 0) {
      const indiaMatch = data.results.find(r => r.country_code === "IN" || (r.country && r.country.toLowerCase() === "india"));
      const result = indiaMatch || data.results[0];

      return {
        name: result.name,
        admin1: result.admin1 || "",
        country: result.country || "",
        countryCode: result.country_code || "",
        latitude: result.latitude,
        longitude: result.longitude,
        timezone: result.timezone || "auto",
        displayName: [result.name, result.admin1, result.country].filter(Boolean).join(", ")
      };
    }
  } catch (err) {
    // Continue to WeatherAPI search fallback
  }

  // WeatherAPI.com search fallback
  if (apiKey) {
    try {
      const url = `https://api.weatherapi.com/v1/search.json?key=${apiKey}&q=${encodeURIComponent(cleanName)}`;
      const data = await fetchWithRetry(url);
      if (Array.isArray(data) && data.length > 0) {
        const indiaMatch = data.find(r => r.country && r.country.toLowerCase() === "india");
        const result = indiaMatch || data[0];

        return {
          name: result.name,
          admin1: result.region || "",
          country: result.country || "",
          countryCode: result.country && result.country.toLowerCase() === "india" ? "IN" : "",
          latitude: result.lat,
          longitude: result.lon,
          timezone: "auto",
          displayName: [result.name, result.region, result.country].filter(Boolean).join(", ")
        };
      }
    } catch (err) {
      // Ignore
    }
  }

  return null;
}

/**
 * 6. Fetch live current weather data (Supports WeatherAPI.com + Open-Meteo fallback)
 */
async function fetchCurrentWeatherData(locationInfo) {
  let geo = locationInfo;
  if (typeof locationInfo === "string") {
    geo = await geocodeLocation(locationInfo);
    if (!geo) {
      throw new Error(`Location "${locationInfo}" not found.`);
    }
  }
  const { latitude, longitude, name, admin1, country } = geo;
  const apiKey = getWeatherApiKey();

  // Try WeatherAPI.com if key is provided
  if (apiKey) {
    try {
      const queryParam = latitude && longitude ? `${latitude},${longitude}` : name;
      const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(queryParam)}&days=2&aqi=yes&alerts=yes`;
      const data = await fetchWithRetry(url);

      if (data && data.current) {
        const c = data.current;
        const l = data.location || geo;
        const fday = data.forecast?.forecastday || [];
        const todayDay = fday[0]?.day || {};
        const tomorrowDay = fday[1]?.day || {};

        const cityNameResolved = name || l.name || "Unknown";
        const formattedLocation = geo.displayName || [cityNameResolved, admin1 || l.region, country || l.country].filter(Boolean).join(", ");
        const todayRainProb = todayDay.daily_chance_of_rain !== undefined ? todayDay.daily_chance_of_rain : (c.precip_mm > 0 ? 80 : 10);
        const tomorrowRainProb = tomorrowDay.daily_chance_of_rain !== undefined ? tomorrowDay.daily_chance_of_rain : 0;

        return {
          mode: "current",
          provider: "WeatherAPI",
          location: formattedLocation,
          cityName: cityNameResolved,
          admin1: admin1 || l.region || "",
          country: country || l.country || "",
          latitude: l.lat || latitude,
          longitude: l.lon || longitude,
          temperature: Math.round(c.temp_c ?? 0),
          feelsLike: Math.round(c.feelslike_c ?? c.temp_c ?? 0),
          condition: c.condition?.text || "Clear",
          weatherCode: c.condition?.code || 1000,
          humidity: Math.round(c.humidity ?? 0),
          windSpeed: Math.round(c.wind_kph ?? 0),
          pressure: Math.round(c.pressure_mb ?? 1013),
          rainProbability: todayRainProb,
          precipitation: c.precip_mm ?? 0,
          uvIndex: c.uv ?? todayDay.uv ?? 0,
          airQuality: c.air_quality ? {
            pm2_5: Math.round(c.air_quality.pm2_5 || 0),
            pm10: Math.round(c.air_quality.pm10 || 0),
            usEpaIndex: c.air_quality["us-epa-index"] || 1
          } : null,
          today: {
            date: fday[0]?.date || formatDateISO(new Date()),
            maxTemp: Math.round(todayDay.maxtemp_c ?? c.temp_c ?? 0),
            minTemp: Math.round(todayDay.mintemp_c ?? c.temp_c ?? 0),
            condition: todayDay.condition?.text || c.condition?.text || "Clear",
            rainProbability: todayRainProb,
            precipitationSum: todayDay.totalprecip_mm ?? 0
          },
          tomorrow: {
            date: fday[1]?.date || "",
            maxTemp: Math.round(tomorrowDay.maxtemp_c ?? 0),
            minTemp: Math.round(tomorrowDay.mintemp_c ?? 0),
            condition: tomorrowDay.condition?.text || "Clear",
            rainProbability: tomorrowRainProb,
            precipitationSum: tomorrowDay.totalprecip_mm ?? 0
          }
        };
      }
    } catch (err) {
      console.warn("WeatherAPI current fetch fallback to Open-Meteo:", err.message);
    }
  }

  // Open-Meteo fallback
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,uv_index_max,wind_speed_10m_max&timezone=auto`;

  const data = await fetchWithRetry(weatherUrl);
  const current = data.current || {};
  const daily = data.daily || {};

  const currentWeatherCode = current.weather_code !== undefined ? current.weather_code : 0;
  const condition = decodeWmoCode(currentWeatherCode);

  const todayRainProb = daily.precipitation_probability_max?.[0] !== undefined 
    ? daily.precipitation_probability_max[0] 
    : (current.rain > 0 ? 80 : 10);

  const tomorrowRainProb = daily.precipitation_probability_max?.[1] !== undefined 
    ? daily.precipitation_probability_max[1] 
    : 0;

  const formattedLocation = [name, admin1, country].filter(Boolean).join(", ");
  const pressure = Math.round(current.surface_pressure ?? 1013);

  return {
    mode: "current",
    provider: "Open-Meteo",
    location: formattedLocation,
    cityName: name,
    admin1: admin1 || "",
    country: country || "",
    latitude,
    longitude,
    temperature: Math.round(current.temperature_2m ?? 0),
    feelsLike: Math.round(current.apparent_temperature ?? current.temperature_2m ?? 0),
    condition: condition,
    weatherCode: currentWeatherCode,
    humidity: Math.round(current.relative_humidity_2m ?? 0),
    windSpeed: Math.round(current.wind_speed_10m ?? 0),
    pressure: pressure,
    rainProbability: todayRainProb,
    precipitation: current.precipitation ?? 0,
    uvIndex: current.uv_index ?? daily.uv_index_max?.[0] ?? 0,
    today: {
      date: daily.time?.[0] || formatDateISO(new Date()),
      maxTemp: Math.round(daily.temperature_2m_max?.[0] ?? current.temperature_2m ?? 0),
      minTemp: Math.round(daily.temperature_2m_min?.[0] ?? current.temperature_2m ?? 0),
      condition: decodeWmoCode(daily.weather_code?.[0] ?? currentWeatherCode),
      rainProbability: todayRainProb,
      precipitationSum: daily.precipitation_sum?.[0] ?? 0
    },
    tomorrow: {
      date: daily.time?.[1] || "",
      maxTemp: Math.round(daily.temperature_2m_max?.[1] ?? 0),
      minTemp: Math.round(daily.temperature_2m_min?.[1] ?? 0),
      condition: decodeWmoCode(daily.weather_code?.[1] ?? 0),
      rainProbability: tomorrowRainProb,
      precipitationSum: daily.precipitation_sum?.[1] ?? 0
    }
  };
}

/**
 * 7. Fetch 7-day or N-day Forecast Data
 */
async function fetchForecastWeatherData(locationInfo, days = 7) {
  let geo = locationInfo;
  if (typeof locationInfo === "string") {
    geo = await geocodeLocation(locationInfo);
    if (!geo) {
      throw new Error(`Location "${locationInfo}" not found.`);
    }
  }
  const { latitude, longitude, name, admin1, country } = geo;
  const numDays = Math.min(Math.max(days, 1), 14);
  const apiKey = getWeatherApiKey();

  // Try WeatherAPI.com
  if (apiKey) {
    try {
      const queryParam = latitude && longitude ? `${latitude},${longitude}` : name;
      const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(queryParam)}&days=${numDays}&aqi=yes&alerts=yes`;
      const data = await fetchWithRetry(url);

      if (data && data.forecast?.forecastday) {
        const l = data.location || geo;
        const cityNameResolved = name || l.name || "Unknown";
        const formattedLocation = geo.displayName || [cityNameResolved, admin1 || l.region, country || l.country].filter(Boolean).join(", ");
        const dailyForecasts = data.forecast.forecastday.map((fd, i) => {
          const day = fd.day || {};
          const dateStr = fd.date;
          const dayName = new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" });

          return {
            date: dateStr,
            dayName: i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayName,
            maxTemp: Math.round(day.maxtemp_c ?? 0),
            minTemp: Math.round(day.mintemp_c ?? 0),
            condition: day.condition?.text || "Clear",
            weatherCode: day.condition?.code || 1000,
            rainProbability: day.daily_chance_of_rain ?? (day.totalprecip_mm > 0 ? 70 : 10),
            precipitationSum: day.totalprecip_mm ?? 0,
            windSpeedMax: Math.round(day.maxwind_kph ?? 0),
            uvIndex: day.uv ?? 0
          };
        });

        // If WeatherAPI provided all requested days
        if (dailyForecasts.length >= numDays) {
          return {
            mode: "forecast",
            provider: "WeatherAPI",
            location: formattedLocation,
            cityName: cityNameResolved,
            admin1: admin1 || l.region || "",
            country: country || l.country || "",
            latitude: l.lat || latitude,
            longitude: l.lon || longitude,
            requestedDays: numDays,
            days: dailyForecasts.length,
            forecast: dailyForecasts
          };
        }

        // If WeatherAPI tier caps forecast at fewer days (e.g. 3 days on free tier) and user requested more (e.g. 5 or 7 days)
        try {
          const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max&timezone=auto&forecast_days=${numDays}`;
          const omData = await fetchWithRetry(omUrl);
          const omDaily = omData.daily || {};

          if (omDaily.time && Array.isArray(omDaily.time) && omDaily.time.length >= numDays) {
            const omForecasts = [];
            for (let i = 0; i < omDaily.time.length; i++) {
              const code = omDaily.weather_code?.[i] ?? 0;
              const dateStr = omDaily.time[i];
              const dayName = new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" });

              omForecasts.push({
                date: dateStr,
                dayName: i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayName,
                maxTemp: Math.round(omDaily.temperature_2m_max?.[i] ?? 0),
                minTemp: Math.round(omDaily.temperature_2m_min?.[i] ?? 0),
                condition: decodeWmoCode(code),
                weatherCode: code,
                rainProbability: omDaily.precipitation_probability_max?.[i] ?? 0,
                precipitationSum: omDaily.precipitation_sum?.[i] ?? 0,
                windSpeedMax: Math.round(omDaily.wind_speed_10m_max?.[i] ?? 0),
                uvIndex: omDaily.uv_index_max?.[i] ?? 0
              });
            }

            return {
              mode: "forecast",
              provider: "Open-Meteo",
              location: formattedLocation,
              cityName: l.name || name,
              admin1: l.region || admin1 || "",
              country: l.country || country || "",
              latitude: l.lat || latitude,
              longitude: l.lon || longitude,
              requestedDays: numDays,
              days: omForecasts.length,
              forecast: omForecasts
            };
          }
        } catch (omErr) {
          // If Open-Meteo fallback fails, return available WeatherAPI days
        }

        return {
          mode: "forecast",
          provider: "WeatherAPI",
          location: formattedLocation,
          cityName: l.name || name,
          admin1: l.region || admin1 || "",
          country: l.country || country || "",
          latitude: l.lat || latitude,
          longitude: l.lon || longitude,
          requestedDays: numDays,
          days: dailyForecasts.length,
          limitedByProvider: true,
          forecast: dailyForecasts
        };
      }
    } catch (err) {
      console.warn("WeatherAPI forecast fetch fallback to Open-Meteo:", err.message);
    }
  }

  // Open-Meteo fallback
  const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max&timezone=auto&forecast_days=${numDays}`;

  const data = await fetchWithRetry(forecastUrl);
  const daily = data.daily || {};
  const formattedLocation = [name, admin1, country].filter(Boolean).join(", ");

  const dailyForecasts = [];
  if (daily.time && Array.isArray(daily.time)) {
    for (let i = 0; i < daily.time.length; i++) {
      const code = daily.weather_code?.[i] ?? 0;
      const dateStr = daily.time[i];
      const dayName = new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" });

      dailyForecasts.push({
        date: dateStr,
        dayName: i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayName,
        maxTemp: Math.round(daily.temperature_2m_max?.[i] ?? 0),
        minTemp: Math.round(daily.temperature_2m_min?.[i] ?? 0),
        condition: decodeWmoCode(code),
        weatherCode: code,
        rainProbability: daily.precipitation_probability_max?.[i] ?? 0,
        precipitationSum: daily.precipitation_sum?.[i] ?? 0,
        windSpeedMax: Math.round(daily.wind_speed_10m_max?.[i] ?? 0),
        uvIndex: daily.uv_index_max?.[i] ?? 0
      });
    }
  }

  return {
    mode: "forecast",
    provider: "Open-Meteo",
    location: formattedLocation,
    cityName: name,
    admin1: admin1 || "",
    country: country || "",
    latitude,
    longitude,
    requestedDays: numDays,
    days: dailyForecasts.length,
    forecast: dailyForecasts
  };
}

/**
 * 8. Fetch Hourly Weather Data for next N hours
 */
async function fetchHourlyWeatherData(locationInfo, hours = 24) {
  let geo = locationInfo;
  if (typeof locationInfo === "string") {
    geo = await geocodeLocation(locationInfo);
    if (!geo) {
      throw new Error(`Location "${locationInfo}" not found.`);
    }
  }
  const { latitude, longitude, name, admin1, country } = geo;
  const numHours = Math.min(Math.max(hours, 1), 48);
  const apiKey = getWeatherApiKey();

  // Try WeatherAPI.com
  if (apiKey) {
    try {
      const queryParam = latitude && longitude ? `${latitude},${longitude}` : name;
      const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(queryParam)}&days=2&aqi=yes`;
      const data = await fetchWithRetry(url);

      if (data && data.forecast?.forecastday) {
        const l = data.location || geo;
        const formattedLocation = [l.name || name, l.region || admin1, l.country || country].filter(Boolean).join(", ");
        
        const allHours = [];
        for (const fday of data.forecast.forecastday) {
          for (const h of fday.hour || []) {
            allHours.push(h);
          }
        }

        const nowEpoch = Math.floor(Date.now() / 1000);
        const futureHours = allHours.filter(h => h.time_epoch >= nowEpoch - 3600);
        const selectedHours = (futureHours.length > 0 ? futureHours : allHours).slice(0, numHours);

        const hourlyRecords = selectedHours.map(h => ({
          time: h.time,
          hourLabel: h.time.includes(" ") ? h.time.split(" ")[1] : h.time,
          temperature: Math.round(h.temp_c ?? 0),
          feelsLike: Math.round(h.feelslike_c ?? h.temp_c ?? 0),
          condition: h.condition?.text || "Clear",
          weatherCode: h.condition?.code || 1000,
          humidity: Math.round(h.humidity ?? 0),
          rainProbability: h.chance_of_rain ?? 0,
          precipitation: h.precip_mm ?? 0,
          windSpeed: Math.round(h.wind_kph ?? 0)
        }));

        return {
          mode: "hourly",
          provider: "WeatherAPI",
          location: formattedLocation,
          cityName: l.name || name,
          admin1: l.region || admin1 || "",
          country: l.country || country || "",
          latitude: l.lat || latitude,
          longitude: l.lon || longitude,
          hoursCount: hourlyRecords.length,
          hourly: hourlyRecords
        };
      }
    } catch (err) {
      console.warn("WeatherAPI hourly fetch fallback to Open-Meteo:", err.message);
    }
  }

  // Open-Meteo fallback
  const hourlyUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m&timezone=auto&forecast_hours=${numHours}`;

  const data = await fetchWithRetry(hourlyUrl);
  const hourly = data.hourly || {};
  const formattedLocation = [name, admin1, country].filter(Boolean).join(", ");

  const hourlyRecords = [];
  if (hourly.time && Array.isArray(hourly.time)) {
    for (let i = 0; i < Math.min(hourly.time.length, numHours); i++) {
      const timeStr = hourly.time[i];
      const code = hourly.weather_code?.[i] ?? 0;
      
      hourlyRecords.push({
        time: timeStr,
        hourLabel: timeStr.includes("T") ? timeStr.split("T")[1] : timeStr,
        temperature: Math.round(hourly.temperature_2m?.[i] ?? 0),
        feelsLike: Math.round(hourly.apparent_temperature?.[i] ?? hourly.temperature_2m?.[i] ?? 0),
        condition: decodeWmoCode(code),
        weatherCode: code,
        humidity: Math.round(hourly.relative_humidity_2m?.[i] ?? 0),
        rainProbability: hourly.precipitation_probability?.[i] ?? 0,
        precipitation: hourly.precipitation?.[i] ?? 0,
        windSpeed: Math.round(hourly.wind_speed_10m?.[i] ?? 0)
      });
    }
  }

  return {
    mode: "hourly",
    provider: "Open-Meteo",
    location: formattedLocation,
    cityName: name,
    admin1: admin1 || "",
    country: country || "",
    latitude,
    longitude,
    hoursCount: hourlyRecords.length,
    hourly: hourlyRecords
  };
}

/**
 * 9. Fetch Historical Meteorological Data
 */
async function fetchHistoricalWeatherData(locationInfo, startDate, endDate) {
  let geo = locationInfo;
  if (typeof locationInfo === "string") {
    geo = await geocodeLocation(locationInfo);
    if (!geo) {
      throw new Error(`Location "${locationInfo}" not found.`);
    }
  }
  const { latitude, longitude, name, admin1, country } = geo;
  const apiKey = getWeatherApiKey();

  // Try WeatherAPI.com history
  if (apiKey) {
    try {
      const queryParam = latitude && longitude ? `${latitude},${longitude}` : name;
      const dStart = new Date(startDate);
      const dEnd = new Date(endDate);
      const diffDays = Math.round((dEnd - dStart) / (1000 * 60 * 60 * 24)) + 1;
      const daysToFetch = Math.min(Math.max(diffDays, 1), 14);

      const records = [];
      let locInfo = null;

      for (let i = 0; i < daysToFetch; i++) {
        const curDate = new Date(dStart);
        curDate.setDate(curDate.getDate() + i);
        const dateStr = curDate.toISOString().split("T")[0];

        const url = `https://api.weatherapi.com/v1/history.json?key=${apiKey}&q=${encodeURIComponent(queryParam)}&dt=${dateStr}`;
        const data = await fetchWithRetry(url, {}, 2, 200);
        if (!locInfo && data.location) {
          locInfo = data.location;
        }
        const fd = data.forecast?.forecastday?.[0];
        if (fd) {
          const day = fd.day || {};
          records.push({
            date: fd.date,
            maxTemp: Math.round(day.maxtemp_c ?? 0),
            minTemp: Math.round(day.mintemp_c ?? 0),
            meanTemp: Math.round(day.avgtemp_c ?? ((day.maxtemp_c + day.mintemp_c) / 2) ?? 0),
            humidity: Math.round(day.avghumidity ?? 65),
            precipitation: day.totalprecip_mm ?? 0,
            rain: day.totalprecip_mm ?? 0,
            windSpeedMax: Math.round(day.maxwind_kph ?? 0),
            condition: day.condition?.text || "Clear"
          });
        }
      }

      if (records.length > 0) {
        const requestedCity = name;
        const stationName = (locInfo?.name && locInfo.name.toLowerCase() !== requestedCity.toLowerCase()) ? locInfo.name : null;
        const formattedLocation = geo.displayName || [requestedCity, admin1 || locInfo?.region, country || locInfo?.country].filter(Boolean).join(", ");
        return {
          mode: "historical",
          provider: "WeatherAPI",
          location: formattedLocation,
          cityName: requestedCity,
          stationName: stationName,
          admin1: admin1 || locInfo?.region || "",
          country: country || locInfo?.country || "",
          startDate,
          endDate,
          recordsCount: records.length,
          records
        };
      }
    } catch (err) {
      console.warn("WeatherAPI history fetch fallback to Open-Meteo:", err.message);
    }
  }

  // Open-Meteo fallback
  const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${startDate}&end_date=${endDate}&daily=weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean,apparent_temperature_max,apparent_temperature_min,precipitation_sum,rain_sum,wind_speed_10m_max&hourly=relative_humidity_2m&timezone=auto`;

  const data = await fetchWithRetry(archiveUrl);
  const daily = data.daily || {};
  const hourly = data.hourly || {};
  const requestedCity = name;
  const formattedLocation = geo.displayName || [requestedCity, admin1, country].filter(Boolean).join(", ");
  const records = [];

  const hourlyHumidities = hourly.relative_humidity_2m || [];

  if (daily.time && Array.isArray(daily.time)) {
    for (let i = 0; i < daily.time.length; i++) {
      const code = daily.weather_code?.[i] ?? 0;
      
      let meanHumidity = 65;
      const dayHourlySlice = hourlyHumidities.slice(i * 24, (i + 1) * 24);
      if (dayHourlySlice.length > 0) {
        const sum = dayHourlySlice.reduce((acc, h) => acc + (h || 0), 0);
        meanHumidity = Math.round(sum / dayHourlySlice.length);
      }

      records.push({
        date: daily.time[i],
        maxTemp: Math.round(daily.temperature_2m_max?.[i] ?? 0),
        minTemp: Math.round(daily.temperature_2m_min?.[i] ?? 0),
        meanTemp: Math.round(daily.temperature_2m_mean?.[i] ?? 0),
        humidity: meanHumidity,
        precipitation: daily.precipitation_sum?.[i] ?? 0,
        rain: daily.rain_sum?.[i] ?? 0,
        windSpeedMax: Math.round(daily.wind_speed_10m_max?.[i] ?? 0),
        condition: decodeWmoCode(code)
      });
    }
  }

  return {
    mode: "historical",
    provider: "Open-Meteo",
    location: formattedLocation,
    cityName: requestedCity,
    stationName: null,
    admin1: admin1 || "",
    country: country || "",
    startDate,
    endDate,
    recordsCount: records.length,
    records
  };
}

/**
 * 10. Build LLM prompt context for CURRENT, FORECAST, HISTORICAL, and COMPARISON weather
 */
function buildWeatherContextPrompt(weatherData, forecastData = null, hourlyData = null, historicalData = null, temporalInfo = null) {
  if (!weatherData && !historicalData && !forecastData) return "";

  // 1. COMPARISON CONTEXT
  if (temporalInfo?.type === "comparison" && historicalData) {
    let comparisonPrompt = `
WEATHER COMPARISON CONTEXT
Location: ${weatherData?.location || historicalData.location}
Comparison: ${temporalInfo.description}

CURRENT WEATHER (Today):
City: ${weatherData?.location || "Current Location"}
Temperature: ${weatherData?.temperature}°C (Feels like: ${weatherData?.feelsLike}°C)
Condition: ${weatherData?.condition}
Humidity: ${weatherData?.humidity}%
Wind Speed: ${weatherData?.windSpeed} km/h
Pressure: ${weatherData?.pressure || 1013} hPa
Rain Probability: ${weatherData?.rainProbability}%

HISTORICAL WEATHER:
Date Range: ${historicalData.startDate} to ${historicalData.endDate}
`;

    historicalData.records.forEach(r => {
      comparisonPrompt += `\n${r.date}:
Temperature: Max ${r.maxTemp}°C, Min ${r.minTemp}°C (Mean: ${r.meanTemp}°C)
Condition: ${r.condition}
Humidity: ${r.humidity}%
Wind Speed: ${r.windSpeedMax} km/h
Rainfall: ${r.precipitation} mm
`;
    });

    comparisonPrompt += `
INSTRUCTIONS FOR AI ASSISTANT:
1. Compare today's meteorological readings directly with the historical readings above.
2. Highlight the differences in temperature, condition, humidity, and rainfall clearly.
3. NEVER invent or fabricate any weather numbers. Use ONLY the data provided above.
`;
    return comparisonPrompt.trim();
  }

  // 2. HISTORICAL WEATHER CONTEXT
  if (weatherData?.mode === "historical" || historicalData?.mode === "historical") {
    const data = historicalData || weatherData;
    const requestedCity = data.cityName || data.location || "the requested location";
    const stationNote = data.stationName ? ` (Weather Station: ${data.stationName})` : "";
    let histPrompt = `
HISTORICAL WEATHER
Target Location: ${data.location || requestedCity}${stationNote}
Requested City: ${requestedCity}
Date Range: ${data.startDate} to ${data.endDate}
`;

    data.records.forEach(r => {
      histPrompt += `\n${r.date}:
Temperature: Max ${r.maxTemp}°C, Min ${r.minTemp}°C, Mean ${r.meanTemp}°C
Condition: ${r.condition}
Humidity: ${r.humidity}%
Wind Speed: ${r.windSpeedMax} km/h
Rainfall: ${r.precipitation} mm
`;
    });

    histPrompt += `
INSTRUCTIONS FOR AI ASSISTANT:
1. Answer the user's historical weather question directly for "${requestedCity}" using ONLY the verified recorded meteorological data provided above.
2. Treat this data as the verified official historical record for ${requestedCity}. DO NOT claim that data for ${requestedCity} is missing or that you only have data for another area.
3. If a local weather station (${data.stationName || "local station"}) is noted, you may mention it as the local station for ${requestedCity}, but answer the question directly for ${requestedCity}.
4. Detail the temperatures (Max, Min, Mean), recorded conditions, humidity, wind, and rainfall accurately.
5. NEVER invent or hallucinate past weather values.
`;
    return histPrompt.trim();
  }

  // 3. CURRENT & FORECAST CONTEXT
  const locName = weatherData?.location || weatherData?.cityName || forecastData?.location || forecastData?.cityName || "Current Location";
  let prompt = "";

  if (weatherData && weatherData.temperature !== undefined) {
    prompt += `CURRENT WEATHER
City: ${locName}
Temperature: ${weatherData.temperature}°C
Feels Like: ${weatherData.feelsLike}°C
Condition: ${weatherData.condition}
Humidity: ${weatherData.humidity}%
Wind Speed: ${weatherData.windSpeed} km/h
Pressure: ${weatherData.pressure || 1013} hPa
Precipitation: ${weatherData.precipitation} mm
Rain Probability: ${weatherData.rainProbability}%
UV Index: ${weatherData.uvIndex}
`;
  }

  if (forecastData && forecastData.forecast && forecastData.forecast.length > 0) {
    prompt += `\nFORECAST (${forecastData.forecast.length} Days Provided):\n`;
    forecastData.forecast.forEach((f, i) => {
      prompt += `- Day ${i + 1} - ${f.dayName} (${f.date}): High: ${f.maxTemp}°C, Low: ${f.minTemp}°C, Condition: ${f.condition}, Rain Probability: ${f.rainProbability}%, Max Wind: ${f.windSpeedMax} km/h\n`;
    });

    if (forecastData.limitedByProvider && forecastData.requestedDays > forecastData.days) {
      prompt += `\nNOTE FOR AI: The user requested a ${forecastData.requestedDays}-day forecast, but the weather service returned ${forecastData.days} days of data. Clearly present all ${forecastData.days} available days and state that only ${forecastData.days} days are available from the weather provider. DO NOT invent or fabricate missing days.\n`;
    }
  } else if (weatherData?.today && weatherData?.tomorrow) {
    prompt += `
FORECAST:
- Today (${weatherData.today.date}): High ${weatherData.today.maxTemp}°C, Low ${weatherData.today.minTemp}°C, Condition: ${weatherData.today.condition}, Rain Chance: ${weatherData.today.rainProbability}%
- Tomorrow (${weatherData.tomorrow.date}): High ${weatherData.tomorrow.maxTemp}°C, Low ${weatherData.tomorrow.minTemp}°C, Condition: ${weatherData.tomorrow.condition}, Rain Chance: ${weatherData.tomorrow.rainProbability}%
`;
  }

  if (hourlyData && hourlyData.hourly && hourlyData.hourly.length > 0) {
    prompt += `\nHourly Breakdown (Next ${Math.min(hourlyData.hourly.length, 12)} Hours):\n`;
    hourlyData.hourly.slice(0, 12).forEach(h => {
      prompt += `- ${h.hourLabel}: ${h.temperature}°C (${h.condition}), Rain Probability: ${h.rainProbability}%, Wind: ${h.windSpeed} km/h\n`;
    });
  }

  prompt += `
INSTRUCTIONS FOR AI ASSISTANT:
1. Answer the user's weather question naturally and conversationally using ONLY the verified real numbers and conditions above.
2. When the user asks for a multi-day forecast (e.g. 5-day forecast), present all provided forecast days clearly in order (Day 1, Day 2, etc.) with high/low temperatures, conditions, and rain probabilities.
3. If the weather provider returned fewer days than requested, report the actual days provided and clearly state that the provider supplied data for those days. NEVER invent, hallucinate, or estimate missing days or numbers.
4. Provide practical advice when relevant (e.g. carry an umbrella if rain probability >= 40%, stay hydrated if hot).
`;

  return prompt.trim();
}

/**
 * 11. Conversational fallback response generator from real meteorological data
 */
function getMockWeatherConversationalResponse(userMessage, weatherData, temporalInfo, historicalData = null, forecastData = null) {
  const loc = weatherData?.location || weatherData?.cityName || forecastData?.location || historicalData?.location || "the requested location";
  const msg = (userMessage || "").toLowerCase();

  if (temporalInfo?.type === "comparison" && historicalData && weatherData) {
    const yRec = historicalData.records[0];
    const diffTemp = weatherData.temperature - (yRec ? yRec.meanTemp : weatherData.temperature);
    const tempWord = diffTemp > 0 ? `${diffTemp}°C warmer` : diffTemp < 0 ? `${Math.abs(diffTemp)}°C cooler` : "about the same temperature";
    return `In **${loc}**, today is **${tempWord}** than yesterday. Today's current temperature is **${weatherData.temperature}°C** (${weatherData.condition}) with **${weatherData.humidity}% humidity**, compared to yesterday's mean temperature of **${yRec?.meanTemp || yRec?.maxTemp}°C** (${yRec?.condition}) with **${yRec?.humidity}% humidity** and **${yRec?.precipitation} mm** rainfall.`;
  }

  if (weatherData?.mode === "historical" || historicalData?.mode === "historical") {
    const data = historicalData || weatherData;
    if (data.records && data.records.length > 0) {
      if (data.records.length === 1) {
        const rec = data.records[0];
        const dateDesc = temporalInfo?.description || rec.date;
        const rainInfo = rec.precipitation > 0 ? `Total recorded rainfall was ${rec.precipitation} mm.` : `No significant rainfall was recorded.`;
        return `On **${dateDesc}** in **${loc}**, the weather was **${rec.condition.toLowerCase()}** with a high of **${rec.maxTemp}°C** and a low of **${rec.minTemp}°C** (mean temperature around ${rec.meanTemp}°C, humidity ${rec.humidity}%). ${rainInfo} Maximum wind speed reached ${rec.windSpeedMax} km/h.`;
      } else {
        const avgMax = Math.round(data.records.reduce((acc, r) => acc + r.maxTemp, 0) / data.records.length);
        const avgMin = Math.round(data.records.reduce((acc, r) => acc + r.minTemp, 0) / data.records.length);
        const totalRain = data.records.reduce((acc, r) => acc + r.precipitation, 0).toFixed(1);
        return `From **${data.startDate} to ${data.endDate}** in **${loc}**, temperatures ranged from a low of **${avgMin}°C** to a high of **${avgMax}°C**, with a total rainfall of **${totalRain} mm**.`;
      }
    }
    return `I was unable to find historical records for **${loc}** during the specified date.`;
  }

  // Multi-day forecast response
  const fc = forecastData || (weatherData?.forecast ? weatherData : null);
  if (temporalInfo?.type === "forecast" || fc?.forecast) {
    const fcList = fc?.forecast || [];
    if (fcList.length > 0) {
      const lines = fcList.map((f, i) => `• **${f.dayName} (${f.date})**: High **${f.maxTemp}°C**, Low **${f.minTemp}°C**, ${f.condition}, Rain Chance: ${f.rainProbability}%`).join("\n");
      const note = (fc.limitedByProvider && fc.requestedDays > fc.days)
        ? `\n\n*(Note: Weather provider supplied ${fc.days} days of forecast data).*`
        : "";
      return `Here is the **${fcList.length}-day forecast** for **${loc}**:\n\n${lines}${note}`;
    }
  }

  if (msg.includes("tomorrow")) {
    const tom = weatherData?.tomorrow;
    if (tom) {
      const rainAdvice = tom.rainProbability > 40
        ? `There is a ${tom.rainProbability}% chance of rain, so carrying an umbrella is recommended.`
        : `Rain is unlikely (${tom.rainProbability}% chance), making it great for outdoor activities.`;
      return `Tomorrow in **${loc}**, expect **${tom.condition.toLowerCase()}** with temperatures between **${tom.minTemp}°C** and **${tom.maxTemp}°C**. ${rainAdvice}`;
    }
  }

  if (msg.includes("travel") || msg.includes("safe") || msg.includes("go out")) {
    const isRainy = weatherData?.rainProbability >= 50;
    const advice = isRainy
      ? `It might be tricky for outdoor travel today as there is a **${weatherData.rainProbability}% chance of rain** with **${weatherData.condition.toLowerCase()}**.`
      : `Conditions look good for travel! It is currently **${weatherData.condition.toLowerCase()}** at **${weatherData.temperature}°C** with only a **${weatherData.rainProbability}% chance of rain**.`;
    return `In **${loc}**: ${advice} (Wind: ${weatherData?.windSpeed} km/h, Humidity: ${weatherData?.humidity}%).`;
  }

  if (msg.includes("temperature") || msg.includes("temp") || msg.includes("hot") || msg.includes("cold") || msg.includes("warm")) {
    return `The current temperature in **${loc}** is **${weatherData?.temperature}°C** (feels like **${weatherData?.feelsLike}°C**) with **${weatherData?.condition.toLowerCase()}**. Today's high will reach **${weatherData?.today?.maxTemp}°C** and the low will be **${weatherData?.today?.minTemp}°C**.`;
  }

  if (msg.includes("humidity")) {
    return `The relative humidity in **${loc}** is currently **${weatherData?.humidity}%** with a temperature of **${weatherData?.temperature}°C** (${weatherData?.condition}).`;
  }

  if (msg.includes("wind")) {
    return `The wind speed in **${loc}** is currently **${weatherData?.windSpeed} km/h** with **${weatherData?.condition.toLowerCase()}** conditions.`;
  }

  return `${loc} is currently ${weatherData?.temperature}°C with ${weatherData?.condition.toLowerCase()} conditions. Humidity is ${weatherData?.humidity}%, pressure is ${weatherData?.pressure || 1013} hPa, and wind speed is ${weatherData?.windSpeed} km/h. Today's high is ${weatherData?.today?.maxTemp}°C and low is ${weatherData?.today?.minTemp}°C.`;
}

module.exports = {
  isWeatherQuery,
  extractTemporalIntent,
  extractLocation,
  searchLocations,
  geocodeLocation,
  fetchCurrentWeatherData,
  fetchForecastWeatherData,
  fetchHourlyWeatherData,
  fetchHistoricalWeatherData,
  buildWeatherContextPrompt,
  getMockWeatherConversationalResponse
};

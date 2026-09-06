import React, { useState, useRef, useEffect } from "react";
import { 
  Send, Menu, Sparkles, Code, MessageSquare, Table, PanelLeft, 
  Mic, MicOff, VolumeX, Globe, Settings, Paperclip, FileText, X,
  MapPin, CloudSun, CloudRain, Sun, Thermometer, Wind, Search, Check, ChevronDown, 
  History, Calendar, Clock, ArrowRight, BarChart2, Navigation, Compass, Loader2
} from "lucide-react";
import MessageItem from "./MessageItem";
import TypingIndicator from "./TypingIndicator";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

const QUICK_CITIES = [
  "Chennai", "Coimbatore", "Madurai", "Ooty", "Kochi", 
  "Bengaluru", "Hyderabad", "Mumbai", "Delhi", "Kolkata", 
  "Jaipur", "Lucknow", "Guwahati", "Srinagar", "Port Blair"
];

const SUGGESTIONS = [
  {
    icon: <Sun size={16} className="suggest-icon sparkle" />,
    text: "What's the weather now?",
    prompt: "What's the weather now?"
  },
  {
    icon: <CloudRain size={16} className="suggest-icon code" />,
    text: "Will it rain tomorrow?",
    prompt: "Will it rain tomorrow?"
  },
  {
    icon: <History size={16} className="suggest-icon table" />,
    text: "What was the weather yesterday?",
    prompt: "What was the weather yesterday?"
  },
  {
    icon: <BarChart2 size={16} className="suggest-icon message" />,
    text: "Compare today's weather with yesterday",
    prompt: "Compare today's weather with yesterday."
  }
];

export default function ChatArea({
  conversation,
  onSendMessage,
  isLoading,
  onToggleSidebar,
  isSidebarOpen,
  activeModel,
  onChangeModel,
  onOpenSettings,
  activeCity = "Chennai",
  onCityChange
}) {
  const [input, setInput] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("idle");
  
  // Weather Tabs State: "none" | "current" | "forecast" | "historical"
  const [activeWeatherTab, setActiveWeatherTab] = useState("none");
  const [forecastData, setForecastData] = useState(null);
  const [isForecastLoading, setIsForecastLoading] = useState(false);

  // Historical Section State
  const [histCity, setHistCity] = useState(activeCity);
  const [histStartDate, setHistStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [histEndDate, setHistEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  });
  const [historicalRecords, setHistoricalRecords] = useState(null);
  const [isHistLoading, setIsHistLoading] = useState(false);
  const [histError, setHistError] = useState(null);

  // India-Wide Location Search & Autocomplete State
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false);
  const [citySearchInput, setCitySearchInput] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGeoLoading, setIsGeoLoading] = useState(false);
  const [recentLocations, setRecentLocations] = useState(() => {
    const saved = localStorage.getItem("weathergpt_recent_locations");
    return saved ? JSON.parse(saved) : ["Chennai", "Coimbatore", "Madurai", "Bengaluru", "Mumbai"];
  });

  const [cityWeatherSummary, setCityWeatherSummary] = useState(null);
  const dropdownRef = useRef(null);

  // PDF & Image Attachment States
  const [selectedFile, setSelectedFile] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  const [base64Data, setBase64Data] = useState("");
  
  const fileInputRef = useRef(null);
  const [voiceLanguage, setVoiceLanguage] = useState("en-US");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceInputSupported] = useState(() => {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  });
  const [voiceError, setVoiceError] = useState(null);
  
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef(null);

  // Sync histCity with activeCity
  useEffect(() => {
    setHistCity(activeCity);
  }, [activeCity]);

  // Save recent locations to localStorage
  const saveRecentLocation = (loc) => {
    if (!loc) return;
    setRecentLocations(prev => {
      const filtered = prev.filter(item => item.toLowerCase() !== loc.toLowerCase());
      const updated = [loc, ...filtered].slice(0, 8);
      localStorage.setItem("weathergpt_recent_locations", JSON.stringify(updated));
      return updated;
    });
  };

  // Live Location Autocomplete Debounce
  useEffect(() => {
    if (!citySearchInput || citySearchInput.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`${API_BASE}/api/v1/weather/search?q=${encodeURIComponent(citySearchInput.trim())}&limit=8`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.warn("Autocomplete error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [citySearchInput]);

  // Fetch quick current weather snapshot for active city
  useEffect(() => {
    let isCancelled = false;
    const fetchCityWeather = async () => {
      if (!activeCity) return;
      try {
        const res = await fetch(`${API_BASE}/api/v1/weather/current?city=${encodeURIComponent(activeCity)}`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled) {
            setCityWeatherSummary(data);
          }
        }
      } catch (err) {
        console.warn("Could not fetch city weather snapshot:", err);
      }
    };

    fetchCityWeather();
    return () => {
      isCancelled = true;
    };
  }, [activeCity]);

  // Fetch forecast when forecast tab opened
  const handleOpenForecast = async () => {
    if (activeWeatherTab === "forecast") {
      setActiveWeatherTab("none");
      return;
    }
    setActiveWeatherTab("forecast");
    setIsForecastLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/weather/forecast?city=${encodeURIComponent(activeCity)}&days=7`);
      if (res.ok) {
        const data = await res.json();
        setForecastData(data);
      }
    } catch (err) {
      console.warn("Forecast fetch error:", err);
    } finally {
      setIsForecastLoading(false);
    }
  };

  // Fetch historical weather
  const handleFetchHistory = async (e) => {
    if (e) e.preventDefault();
    if (!histCity || !histStartDate || !histEndDate) return;
    setIsHistLoading(true);
    setHistError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/weather/history?city=${encodeURIComponent(histCity)}&start_date=${histStartDate}&end_date=${histEndDate}`
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with status ${res.status}`);
      }
      const data = await res.json();
      setHistoricalRecords(data);
    } catch (err) {
      setHistError(err.message || "Failed to load historical data");
    } finally {
      setIsHistLoading(false);
    }
  };

  // Browser Geolocation ("Use My Location")
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setIsGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        try {
          const res = await fetch(`${API_BASE}/api/v1/weather/current?city=${lat},${lon}`);
          if (res.ok) {
            const data = await res.json();
            const resolved = data.cityName || data.location || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
            handleCitySelect(resolved);
          }
        } catch (err) {
          console.warn("Reverse location error:", err);
          handleCitySelect(`${lat.toFixed(2)}, ${lon.toFixed(2)}`);
        } finally {
          setIsGeoLoading(false);
        }
      },
      (err) => {
        setIsGeoLoading(false);
        alert("Unable to retrieve your location. Please check location permissions.");
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Close city dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsCityDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Clean up media recorder on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    const checkSpeaking = setInterval(() => {
      if (window.speechSynthesis) {
        setIsSpeaking(window.speechSynthesis.speaking);
      }
    }, 250);
    return () => clearInterval(checkSpeaking);
  }, []);

  const handleCitySelect = (city) => {
    if (city && city.trim()) {
      const clean = city.trim();
      onCityChange?.(clean);
      saveRecentLocation(clean);
      setIsCityDropdownOpen(false);
      setCitySearchInput("");
      setSearchResults([]);
    }
  };

  const handleCitySearchSubmit = (e) => {
    e.preventDefault();
    if (searchResults.length > 0) {
      handleCitySelect(searchResults[0].displayName || searchResults[0].name);
    } else if (citySearchInput.trim()) {
      handleCitySelect(citySearchInput.trim());
    }
  };

  const startRecording = async () => {
    if (!isVoiceInputSupported) {
      setVoiceError("Audio recording is not supported in this environment.");
      setVoiceStatus("error");
      return;
    }

    try {
      setVoiceError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        
        if (!audioChunksRef.current || audioChunksRef.current.length === 0) {
          setVoiceError("No audio captured.");
          setVoiceStatus("error");
          setTimeout(() => setVoiceStatus("idle"), 3000);
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setVoiceStatus("processing");

        try {
          const base64Audio = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
              const base64data = reader.result.split(",")[1];
              resolve(base64data);
            };
            reader.onerror = reject;
          });

          const response = await fetch(`${API_BASE}/api/v1/transcribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audio: base64Audio,
              mimeType: "audio/webm",
              language: voiceLanguage
            })
          });

          if (!response.ok) throw new Error(`Server error: ${response.status}`);
          const data = await response.json();
          const transcriptionText = data.text || "";
          
          if (transcriptionText.trim()) {
            setInput(prev => (prev.trim() ? prev + " " + transcriptionText : transcriptionText));
            setVoiceStatus("idle");
          } else {
            setVoiceError("No speech detected. Please speak clearly.");
            setVoiceStatus("error");
            setTimeout(() => {
              setVoiceStatus("idle");
              setVoiceError(null);
            }, 3000);
          }
        } catch (err) {
          console.warn("Transcription failed:", err);
          setVoiceError("Transcription service failed.");
          setVoiceStatus("error");
          setTimeout(() => {
            setVoiceStatus("idle");
            setVoiceError(null);
          }, 3000);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setVoiceStatus("listening");

    } catch (err) {
      console.warn("Microphone access failed:", err);
      setVoiceError("Microphone permission denied.");
      setVoiceStatus("error");
      setTimeout(() => {
        setVoiceStatus("idle");
        setVoiceError(null);
      }, 3000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn("Error stopping media recorder:", err);
        setVoiceStatus("idle");
      }
    }
  };

  const toggleListening = () => {
    if (voiceStatus === "listening") {
      stopRecording();
    } else if (voiceStatus === "idle" || voiceStatus === "error") {
      startRecording();
    }
  };

  const handleStopSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const messages = conversation?.messages || [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleFileChange = async (file) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");

    if (!isPdf && !isImage) {
      alert("Only PDF documents and image files are supported.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);

    if (isImage) {
      setIsParsing(false);
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result.split(",")[1];
        setBase64Data(base64);
      };
      reader.readAsDataURL(file);
      setExtractedText("");
    } else if (isPdf) {
      setIsParsing(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result.split(",")[1];
        setBase64Data(base64);
      };
      reader.readAsDataURL(file);

      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = window["pdfjs-dist/build/pdf"];
        if (!pdfjsLib) throw new Error("PDF.js library is not loaded.");
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((item) => item.str);
          text += strings.join(" ") + "\n";
        }
        setExtractedText(text);
      } catch (err) {
        console.error("PDF text extraction failed:", err);
      } finally {
        setIsParsing(false);
      }
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setExtractedText("");
    setBase64Data("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = () => {
    if (!input.trim() || isLoading || isParsing) return;
    
    const attachment = selectedFile ? {
      data: base64Data,
      mimeType: selectedFile.type.startsWith("image/") ? selectedFile.type : "application/pdf",
      extractedText: extractedText,
      fileName: selectedFile.name
    } : null;

    onSendMessage(input.trim(), attachment);
    setInput("");
    handleRemoveFile();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (prompt) => {
    if (isLoading) return;
    onSendMessage(prompt);
  };

  return (
    <div className="chat-area">
      {/* Header */}
      <header className="chat-header glass-panel">
        <div className="header-left">
          <button className="menu-btn" onClick={onToggleSidebar} title="Toggle Sidebar">
            <Menu size={20} />
          </button>
          
          <div className="header-title-container">
            <h2 className="header-title">{conversation?.title || "WeatherGPT Chat"}</h2>
            <span className="header-badge">{isLoading ? "Thinking..." : "All-India Weather Live"}</span>
          </div>
        </div>

        <div className="header-right">
          <div className="model-selector-wrapper">
            <select
              value={activeModel || "groq"}
              onChange={(e) => onChangeModel?.(e.target.value)}
              className="model-dropdown-select glass-panel"
              title="Select AI Model"
              disabled={isLoading}
            >
              <option value="groq">Groq (LLaMA / GPT-OSS)</option>
              <option value="gemini">Gemini 2.5 Flash</option>
              <option value="openai">OpenAI GPT-4o-mini</option>
              <option value="claude">Claude 3.5 Sonnet</option>
            </select>
          </div>
          <button 
            className="settings-trigger-btn" 
            onClick={onOpenSettings} 
            title="AI Model Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Active City & Weather Data Navigation Bar */}
      <div className="active-city-bar glass-panel" ref={dropdownRef}>
        <div className="city-bar-left">
          <button 
            className="city-selector-btn"
            onClick={() => setIsCityDropdownOpen(!isCityDropdownOpen)}
            title="Search any location across India or the world"
          >
            <MapPin size={15} className="pin-icon" />
            <span className="active-city-label">Location:</span>
            <span className="active-city-name">{activeCity}</span>
            <ChevronDown size={14} className={`chevron-icon ${isCityDropdownOpen ? "open" : ""}`} />
          </button>

          {/* Weather Context Tabs */}
          <div className="weather-nav-tabs">
            <button
              className={`weather-tab-btn ${activeWeatherTab === "current" ? "active" : ""}`}
              onClick={() => setActiveWeatherTab(activeWeatherTab === "current" ? "none" : "current")}
              title="View current weather"
            >
              <Sun size={13} />
              <span>Current</span>
            </button>
            <button
              className={`weather-tab-btn ${activeWeatherTab === "forecast" ? "active" : ""}`}
              onClick={handleOpenForecast}
              title="View 7-day forecast"
            >
              <CloudSun size={13} />
              <span>Forecast</span>
            </button>
            <button
              className={`weather-tab-btn ${activeWeatherTab === "historical" ? "active" : ""}`}
              onClick={() => {
                setActiveWeatherTab(activeWeatherTab === "historical" ? "none" : "historical");
                if (activeWeatherTab !== "historical" && !historicalRecords) {
                  handleFetchHistory();
                }
              }}
              title="Search and view historical weather archive"
            >
              <History size={13} />
              <span>Historical</span>
            </button>
          </div>
        </div>

        {/* Quick Popular City Chips (All across India & Global) */}
        <div className="quick-city-chips">
          {QUICK_CITIES.map((c) => (
            <button
              key={c}
              className={`city-chip ${activeCity.toLowerCase().includes(c.toLowerCase()) ? "active" : ""}`}
              onClick={() => handleCitySelect(c)}
            >
              {c}
            </button>
          ))}
        </div>

        {/* India-Wide Location Search & Autocomplete Dropdown Modal */}
        {isCityDropdownOpen && (
          <div className="city-dropdown-menu glass-panel animate-fade-in">
            <form onSubmit={handleCitySearchSubmit} className="city-search-form">
              <Search size={15} className="city-search-icon" />
              <input
                type="text"
                placeholder="Search any city or location in India..."
                value={citySearchInput}
                onChange={(e) => setCitySearchInput(e.target.value)}
                className="city-search-input"
                autoFocus
              />
              {isSearching && <Loader2 size={14} className="animate-spin text-purple-400" />}
              <button type="submit" className="city-search-submit-btn">
                Search
              </button>
            </form>

            {/* Geolocation Button */}
            <div className="geo-location-wrapper">
              <button 
                type="button" 
                className="use-my-location-btn" 
                onClick={handleUseMyLocation}
                disabled={isGeoLoading}
              >
                {isGeoLoading ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
                <span>{isGeoLoading ? "Detecting location..." : "Use my current location"}</span>
              </button>
            </div>

            {/* Live Autocomplete Results */}
            {searchResults.length > 0 && (
              <div className="autocomplete-results-container">
                <div className="dropdown-section-label">Matching Locations in India & Worldwide</div>
                <div className="dropdown-suggestions-list">
                  {searchResults.map((item) => (
                    <div
                      key={item.id || item.displayName}
                      className="dropdown-suggestion-item"
                      onClick={() => handleCitySelect(item.displayName || item.name)}
                    >
                      <MapPin size={13} className="pin-suggest" />
                      <div className="suggest-info">
                        <span className="suggest-name">{item.name}</span>
                        <span className="suggest-details">
                          {[item.admin1, item.country].filter(Boolean).join(", ")}
                        </span>
                      </div>
                      {item.countryCode === "IN" && (
                        <span className="india-badge">India</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="dropdown-divider"></div>

            {/* Recent Locations */}
            {recentLocations.length > 0 && (
              <div className="recent-locations-section">
                <div className="dropdown-section-label">Recent Searches</div>
                <div className="recent-tags-row">
                  {recentLocations.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="recent-tag-btn"
                      onClick={() => handleCitySelect(item)}
                    >
                      <Clock size={11} />
                      <span>{item}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expandable Weather Data Panels */}
      {activeWeatherTab === "current" && cityWeatherSummary && (
        <div className="weather-drawer-panel glass-panel animate-fade-in">
          <div className="drawer-header">
            <div className="drawer-title">
              <Sun size={16} className="text-amber-400" />
              <span>Current Weather: <strong>{cityWeatherSummary.location}</strong></span>
            </div>
            <button className="drawer-close-btn" onClick={() => setActiveWeatherTab("none")}>
              <X size={14} />
            </button>
          </div>
          <div className="current-grid">
            <div className="metric-card">
              <span className="metric-label">Temperature</span>
              <span className="metric-val">{cityWeatherSummary.temperature}°C</span>
              <span className="metric-sub">Feels like {cityWeatherSummary.feelsLike}°C</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Condition</span>
              <span className="metric-val">{cityWeatherSummary.condition}</span>
              <span className="metric-sub">UV Index: {cityWeatherSummary.uvIndex}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Humidity & Pressure</span>
              <span className="metric-val">{cityWeatherSummary.humidity}%</span>
              <span className="metric-sub">{cityWeatherSummary.pressure} hPa</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Wind & Rain</span>
              <span className="metric-val">{cityWeatherSummary.windSpeed} km/h</span>
              <span className="metric-sub">{cityWeatherSummary.rainProbability}% rain chance</span>
            </div>
          </div>
        </div>
      )}

      {activeWeatherTab === "forecast" && (
        <div className="weather-drawer-panel glass-panel animate-fade-in">
          <div className="drawer-header">
            <div className="drawer-title">
              <CloudSun size={16} className="text-sky-400" />
              <span>7-Day Weather Forecast: <strong>{activeCity}</strong></span>
            </div>
            <button className="drawer-close-btn" onClick={() => setActiveWeatherTab("none")}>
              <X size={14} />
            </button>
          </div>
          {isForecastLoading ? (
            <div className="drawer-loading">Loading 7-day meteorological forecast...</div>
          ) : forecastData?.forecast ? (
            <div className="forecast-cards-row">
              {forecastData.forecast.map((f, i) => (
                <div key={i} className="forecast-card">
                  <span className="fc-day">{f.dayName}</span>
                  <span className="fc-date">{f.date.slice(5)}</span>
                  <span className="fc-temp">{f.maxTemp}° / {f.minTemp}°</span>
                  <span className="fc-cond">{f.condition}</span>
                  <span className="fc-rain">💧 {f.rainProbability}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="drawer-empty">Forecast data unavailable.</div>
          )}
        </div>
      )}

      {activeWeatherTab === "historical" && (
        <div className="weather-drawer-panel glass-panel animate-fade-in">
          <div className="drawer-header">
            <div className="drawer-title">
              <History size={16} className="text-purple-400" />
              <span>Historical Weather Archive</span>
            </div>
            <button className="drawer-close-btn" onClick={() => setActiveWeatherTab("none")}>
              <X size={14} />
            </button>
          </div>

          <form onSubmit={handleFetchHistory} className="historical-filter-bar">
            <div className="hist-input-group">
              <label>Location</label>
              <input
                type="text"
                value={histCity}
                onChange={(e) => setHistCity(e.target.value)}
                placeholder="Any Indian town, district or city"
                className="hist-input"
                required
              />
            </div>
            <div className="hist-input-group">
              <label>Start Date</label>
              <input
                type="date"
                value={histStartDate}
                onChange={(e) => setHistStartDate(e.target.value)}
                className="hist-input"
                required
              />
            </div>
            <div className="hist-input-group">
              <label>End Date</label>
              <input
                type="date"
                value={histEndDate}
                onChange={(e) => setHistEndDate(e.target.value)}
                className="hist-input"
                required
              />
            </div>
            <button type="submit" className="hist-submit-btn" disabled={isHistLoading}>
              {isHistLoading ? "Fetching..." : "View History"}
            </button>
          </form>

          {histError && <div className="hist-error-text">⚠️ {histError}</div>}

          {historicalRecords?.records && (
            <div className="historical-table-wrapper">
              <table className="historical-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Condition</th>
                    <th>Max / Min</th>
                    <th>Mean</th>
                    <th>Humidity</th>
                    <th>Wind</th>
                    <th>Rain</th>
                  </tr>
                </thead>
                <tbody>
                  {historicalRecords.records.map((r, i) => (
                    <tr key={i}>
                      <td><strong>{r.date}</strong></td>
                      <td>{r.condition}</td>
                      <td>{r.maxTemp}°C / {r.minTemp}°C</td>
                      <td>{r.meanTemp}°C</td>
                      <td>{r.humidity}%</td>
                      <td>{r.windSpeedMax} km/h</td>
                      <td>{r.precipitation} mm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Main Message Stream */}
      <div className="message-stream-container">
        {messages.length === 0 ? (
          <div className="welcome-container animate-fade-in">
            <div className="welcome-glow"></div>
            <div className="welcome-logo">
              <CloudSun size={38} className="logo-weather" />
            </div>
            <h1 className="welcome-title">WeatherGPT Intelligence</h1>
            <p className="welcome-subtitle">
              Verified real meteorological AI across <strong>all states, districts, cities & towns in India</strong>. Currently active: <strong className="highlight-city">{activeCity}</strong>.
            </p>

            <div className="suggestions-grid">
              {SUGGESTIONS.map((sug, idx) => (
                <div
                  key={idx}
                  className="suggestion-card glass-panel"
                  onClick={() => handleSuggestionClick(sug.prompt)}
                >
                  <div className="suggestion-header">
                    {sug.icon}
                  </div>
                  <p className="suggestion-text">{sug.text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((msg) => (
              <MessageItem key={msg.id} message={msg} />
            ))}
            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Form Panel */}
      <footer className="chat-input-container">
        {selectedFile && (
          <div className="attachment-preview glass-panel animate-fade-in">
            <div className="attachment-info">
              {selectedFile.type.startsWith("image/") ? (
                <div className="image-preview-thumbnail-wrapper">
                  <img
                    src={base64Data ? `data:${selectedFile.type};base64,${base64Data}` : ""}
                    alt="Preview"
                    className="image-preview-thumbnail"
                  />
                </div>
              ) : (
                <FileText size={16} className="pdf-icon" />
              )}
              <span className="attachment-name">{selectedFile.name}</span>
              {selectedFile.type.startsWith("image/") ? (
                <span className="attachment-status ready">Image Ready</span>
              ) : isParsing ? (
                <span className="attachment-status">Indexing...</span>
              ) : (
                <span className="attachment-status ready">Parsed</span>
              )}
            </div>
            <button
              type="button"
              className="remove-attachment-btn"
              onClick={handleRemoveFile}
              title="Remove attachment"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {isSpeaking && (
          <div className="stop-speaking-bar animate-fade-in">
            <button className="stop-speaking-btn" onClick={handleStopSpeaking}>
              <VolumeX size={14} />
              <span>Stop Speaking</span>
            </button>
          </div>
        )}
        <div className="input-box-wrapper glass-panel">
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) handleFileChange(file);
            }}
            accept="application/pdf,image/*"
            style={{ display: "none" }}
          />

          <button
            type="button"
            className="paperclip-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Upload PDF or image"
            disabled={isLoading || isParsing || voiceStatus === "listening"}
          >
            <Paperclip size={18} />
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isParsing
                ? "Parsing document..."
                : voiceStatus === "listening"
                ? "Listening... Click microphone to finish speaking..."
                : voiceStatus === "processing"
                ? "Transcribing voice input..."
                : `Ask WeatherGPT about ${activeCity} or any Indian location...`
            }
            className={`chat-textarea ${voiceStatus === "listening" ? "textarea-listening" : ""} ${voiceStatus === "processing" ? "textarea-processing" : ""}`}
            disabled={isLoading || voiceStatus === "processing" || isParsing}
          />

          {/* Language Toggle */}
          <button
            type="button"
            className={`lang-toggle-btn ${voiceLanguage === "ta-IN" ? "tamil" : ""}`}
            onClick={() => setVoiceLanguage(prev => prev === "en-US" ? "ta-IN" : "en-US")}
            title={`Voice Language: ${voiceLanguage === "en-US" ? "English" : "Tamil (தமிழ்)"}`}
            disabled={voiceStatus !== "idle"}
          >
            <Globe size={14} />
            <span>{voiceLanguage === "en-US" ? "EN" : "தமிழ்"}</span>
          </button>

          {/* Microphone Button */}
          <button
            type="button"
            className={`mic-btn ${voiceStatus === "listening" ? "listening" : ""} ${voiceStatus === "processing" ? "processing" : ""} ${!isVoiceInputSupported ? "disabled" : ""}`}
            onClick={toggleListening}
            title={
              !isVoiceInputSupported
                ? (voiceError || "Audio input is not supported")
                : voiceStatus === "listening"
                ? "Stop listening & transcribe"
                : voiceStatus === "processing"
                ? "Processing transcription..."
                : "Start voice input"
            }
            disabled={!isVoiceInputSupported || voiceStatus === "processing"}
          >
            {voiceStatus === "listening" ? <MicOff size={16} /> : <Mic size={16} />}
          </button>

          <button
            className={`send-btn ${input.trim() ? "active" : ""}`}
            onClick={handleSend}
            disabled={!input.trim() || isLoading || voiceStatus === "processing" || isParsing}
            title="Send message"
          >
            <Send size={18} />
          </button>
        </div>
        {voiceError ? (
          <p className="input-disclaimer voice-error-text">
            ⚠️ {voiceError}
          </p>
        ) : (
          <p className="input-disclaimer">
            Real meteorological data for all of India. Active location: <strong>{activeCity}</strong>.
          </p>
        )}
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .chat-area {
          display: flex;
          flex-direction: column;
          flex-grow: 1;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          height: 100%;
          position: relative;
          background: radial-gradient(circle at 50% 50%, var(--bg-app) 0%, rgba(8, 11, 17, 0.95) 100%);
          overflow: hidden;
          box-sizing: border-box;
        }
        
        .chat-header {
          height: 60px;
          min-height: 60px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1.5rem;
          border-bottom: 1px solid var(--border-color);
          background-color: rgba(8, 11, 17, 0.4);
          z-index: 10;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          gap: 12px;
        }
        
        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
          flex: 1 1 auto;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .model-selector-wrapper {
          display: flex;
          align-items: center;
          min-width: 0;
        }

        .model-dropdown-select {
          padding: 6px 12px;
          border-radius: 10px;
          font-size: 0.85rem;
          font-weight: 550;
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
          outline: none;
          cursor: pointer;
          transition: all 0.2s;
          max-width: 220px;
          text-overflow: ellipsis;
        }
        body.light-mode .model-dropdown-select {
          background-color: rgba(0, 0, 0, 0.02);
          color: #1f2937;
        }
        .model-dropdown-select:hover {
          background-color: rgba(255, 255, 255, 0.06);
          border-color: var(--border-color-active);
        }
        body.light-mode .model-dropdown-select:hover {
          background-color: rgba(0, 0, 0, 0.04);
        }
        .model-dropdown-select:focus {
          border-color: var(--primary);
        }

        .settings-trigger-btn {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          color: var(--text-muted);
          background-color: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
          transition: all 0.2s;
          flex-shrink: 0;
        }
        body.light-mode .settings-trigger-btn {
          background-color: rgba(0, 0, 0, 0.02);
        }
        .settings-trigger-btn:hover {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.06);
          border-color: var(--border-color-active);
          transform: rotate(25deg);
        }
        body.light-mode .settings-trigger-btn:hover {
          background-color: rgba(0, 0, 0, 0.04);
        }
        
        .menu-btn {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .menu-btn:hover {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.05);
        }
        body.light-mode .menu-btn:hover {
          background-color: rgba(0, 0, 0, 0.05);
        }
        
        .header-title-container {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        
        .header-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-main);
          white-space: nowrap;
          max-width: 250px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .header-badge {
          font-size: 0.65rem;
          font-weight: 500;
          padding: 2px 8px;
          border-radius: 9999px;
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.2);
          white-space: nowrap;
          flex-shrink: 0;
        }

        /* Active City & Tabs Bar */
        .active-city-bar {
          padding: 8px 1.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--border-color);
          background-color: rgba(14, 19, 31, 0.5);
          position: relative;
          z-index: 20;
          gap: 12px;
          flex-wrap: wrap;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }
        body.light-mode .active-city-bar {
          background-color: rgba(243, 244, 246, 0.8);
        }

        .city-bar-left {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          min-width: 0;
        }

        .city-selector-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 10px;
          background-color: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.3);
          color: var(--text-main);
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
          max-width: 100%;
        }
        .city-selector-btn:hover {
          background-color: rgba(139, 92, 246, 0.2);
          border-color: var(--primary);
        }
        .pin-icon {
          color: var(--primary);
          flex-shrink: 0;
        }
        .active-city-label {
          color: var(--text-muted);
          font-size: 0.75rem;
        }
        .active-city-name {
          font-weight: 600;
          color: var(--text-main);
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .chevron-icon {
          color: var(--text-muted);
          transition: transform 0.2s;
          flex-shrink: 0;
        }
        .chevron-icon.open {
          transform: rotate(180deg);
        }

        .weather-nav-tabs {
          display: flex;
          align-items: center;
          gap: 4px;
          background-color: rgba(255, 255, 255, 0.03);
          padding: 2px 4px;
          border-radius: 10px;
          border: 1px solid var(--border-color);
          flex-shrink: 0;
        }
        .weather-tab-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 8px;
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .weather-tab-btn:hover {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.05);
        }
        .weather-tab-btn.active {
          background-color: var(--primary);
          color: #ffffff;
          font-weight: 600;
        }

        .quick-city-chips {
          display: flex;
          align-items: center;
          gap: 6px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          max-width: 450px;
          padding: 2px 0;
          box-sizing: border-box;
        }
        .quick-city-chips::-webkit-scrollbar {
          display: none;
        }
        .city-chip {
          font-size: 0.75rem;
          padding: 3px 10px;
          border-radius: 9999px;
          background-color: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .city-chip:hover {
          background-color: rgba(255, 255, 255, 0.08);
          color: var(--text-main);
          border-color: var(--border-color-active);
        }
        .city-chip.active {
          background-color: var(--primary);
          color: #ffffff;
          border-color: var(--primary);
          font-weight: 600;
        }

        /* Drawer Panels for Weather Data */
        .weather-drawer-panel {
          padding: 1rem 1.5rem;
          border-bottom: 1px solid var(--border-color);
          background-color: rgba(10, 14, 24, 0.9);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          z-index: 15;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          overflow-x: hidden;
        }
        body.light-mode .weather-drawer-panel {
          background-color: rgba(255, 255, 255, 0.95);
        }

        .drawer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.75rem;
        }
        .drawer-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.9rem;
          color: var(--text-main);
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .drawer-close-btn {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .drawer-close-btn:hover {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.05);
        }

        .current-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }
        .metric-card {
          padding: 0.75rem;
          border-radius: 12px;
          background-color: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          box-sizing: border-box;
        }
        .metric-label {
          font-size: 0.7rem;
          color: var(--text-muted);
          text-transform: uppercase;
          font-weight: 600;
        }
        .metric-val {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .metric-sub {
          font-size: 0.75rem;
          color: var(--text-main);
        }

        .forecast-cards-row {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          width: 100%;
          max-width: 100%;
          padding-bottom: 4px;
          box-sizing: border-box;
        }
        .forecast-card {
          padding: 0.75rem 0.5rem;
          border-radius: 12px;
          background-color: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-color);
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 3px;
          flex: 1 0 85px;
          min-width: 80px;
          box-sizing: border-box;
        }
        .fc-day { font-size: 0.8rem; font-weight: 600; color: var(--text-main); }
        .fc-date { font-size: 0.65rem; color: var(--text-muted); }
        .fc-temp { font-size: 0.85rem; font-weight: 700; color: var(--primary); }
        .fc-cond { font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .fc-rain { font-size: 0.7rem; color: #38bdf8; font-weight: 600; }

        .historical-filter-bar {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          margin-bottom: 0.75rem;
          flex-wrap: wrap;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }
        .hist-input-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1 1 120px;
          min-width: 0;
        }
        .hist-input-group label {
          font-size: 0.7rem;
          color: var(--text-muted);
          font-weight: 600;
        }
        .hist-input {
          padding: 5px 10px;
          border-radius: 8px;
          background-color: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
          color: var(--text-main);
          font-size: 0.8rem;
          outline: none;
          width: 100%;
          box-sizing: border-box;
        }
        body.light-mode .hist-input {
          background-color: rgba(0, 0, 0, 0.02);
        }
        .hist-submit-btn {
          padding: 6px 14px;
          border-radius: 8px;
          background-color: var(--primary);
          color: white;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          flex-shrink: 0;
        }
        .hist-error-text {
          font-size: 0.75rem;
          color: #ef4444;
          margin-bottom: 0.5rem;
        }
        .historical-table-wrapper {
          max-height: 220px;
          overflow-y: auto;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 10px;
          border: 1px solid var(--border-color);
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }
        .historical-table {
          width: 100%;
          min-width: 480px;
          border-collapse: collapse;
          font-size: 0.78rem;
          text-align: left;
        }
        .historical-table th, .historical-table td {
          padding: 6px 10px;
          border-bottom: 1px solid var(--border-color);
          white-space: nowrap;
        }
        .historical-table th {
          background-color: rgba(255, 255, 255, 0.02);
          color: var(--text-muted);
          font-weight: 600;
        }

        /* Location Search Dropdown Modal */
        .city-dropdown-menu {
          position: absolute;
          top: calc(100% + 4px);
          left: 1.5rem;
          width: 380px;
          max-width: calc(100vw - 3rem);
          background-color: rgba(14, 19, 31, 0.96);
          border: 1px solid var(--border-color-active);
          border-radius: 16px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
          padding: 14px;
          backdrop-filter: blur(20px);
          z-index: 50;
          box-sizing: border-box;
        }
        body.light-mode .city-dropdown-menu {
          background-color: rgba(255, 255, 255, 0.98);
        }

        .city-search-form {
          display: flex;
          align-items: center;
          gap: 8px;
          background-color: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 8px 12px;
          width: 100%;
          box-sizing: border-box;
        }
        body.light-mode .city-search-form {
          background-color: rgba(0, 0, 0, 0.03);
        }
        .city-search-icon {
          color: var(--primary);
          flex-shrink: 0;
        }
        .city-search-input {
          flex-grow: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-main);
          font-size: 0.88rem;
          min-width: 0;
        }
        .city-search-submit-btn {
          font-size: 0.75rem;
          padding: 4px 10px;
          border-radius: 8px;
          background-color: var(--primary);
          color: white;
          font-weight: 600;
          flex-shrink: 0;
        }

        .geo-location-wrapper {
          margin-top: 8px;
        }
        .use-my-location-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 7px 10px;
          border-radius: 8px;
          background-color: rgba(56, 189, 248, 0.1);
          border: 1px solid rgba(56, 189, 248, 0.25);
          color: #38bdf8;
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .use-my-location-btn:hover {
          background-color: rgba(56, 189, 248, 0.18);
        }

        .dropdown-section-label {
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          margin: 10px 0 6px;
        }

        .dropdown-suggestions-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 200px;
          overflow-y: auto;
        }
        .dropdown-suggestion-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
          background-color: rgba(255, 255, 255, 0.02);
        }
        .dropdown-suggestion-item:hover {
          background-color: var(--bg-surface-hover);
          border-color: var(--border-color-active);
        }
        .pin-suggest {
          color: var(--primary);
          flex-shrink: 0;
        }
        .suggest-info {
          display: flex;
          flex-direction: column;
          flex-grow: 1;
          overflow: hidden;
          min-width: 0;
        }
        .suggest-name {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-main);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .suggest-details {
          font-size: 0.72rem;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .india-badge {
          font-size: 0.65rem;
          padding: 2px 6px;
          border-radius: 6px;
          background-color: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
          font-weight: 600;
          flex-shrink: 0;
        }

        .recent-tags-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .recent-tag-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 6px;
          background-color: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--border-color);
          font-size: 0.75rem;
          color: var(--text-main);
          cursor: pointer;
        }
        .recent-tag-btn:hover {
          background-color: var(--bg-surface-hover);
          color: var(--primary);
        }

        .dropdown-divider {
          height: 1px;
          background-color: var(--border-color);
          margin: 10px 0;
        }
        
        .message-stream-container {
          flex-grow: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 1.5rem;
          position: relative;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }
        
        .message-list {
          max-width: 800px;
          width: 100%;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          padding-bottom: 2rem;
          box-sizing: border-box;
          min-width: 0;
        }
        
        /* Welcome Dashboard styling */
        .welcome-container {
          max-width: 720px;
          width: 100%;
          margin: 3rem auto 0;
          text-align: center;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0 1rem;
          box-sizing: border-box;
        }
        
        .welcome-glow {
          position: absolute;
          width: 300px;
          height: 300px;
          max-width: 100%;
          background: radial-gradient(circle, rgba(139, 92, 246, 0.18) 0%, transparent 70%);
          top: -100px;
          z-index: 0;
          pointer-events: none;
        }
        
        .welcome-logo {
          width: 72px;
          height: 72px;
          border-radius: 22px;
          background: linear-gradient(135deg, var(--primary), #38bdf8);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          margin-bottom: 1.25rem;
          box-shadow: 0 8px 30px rgba(56, 189, 248, 0.3);
          z-index: 1;
          flex-shrink: 0;
        }
        .logo-weather {
          animation: float 4s ease-in-out infinite;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        
        .welcome-title {
          font-size: 2.2rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          background: linear-gradient(to right, var(--text-main), #38bdf8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          z-index: 1;
          word-break: break-word;
        }
        
        .welcome-subtitle {
          color: var(--text-muted);
          font-size: 1rem;
          max-width: 560px;
          margin-bottom: 2.5rem;
          line-height: 1.5;
          z-index: 1;
        }
        .highlight-city {
          color: var(--primary);
        }
        
        .suggestions-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          width: 100%;
          max-width: 100%;
          z-index: 1;
          box-sizing: border-box;
        }
        
        .suggestion-card {
          padding: 1.2rem;
          border-radius: 16px;
          text-align: left;
          cursor: pointer;
          background-color: var(--bg-surface);
          border-color: var(--border-color);
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-sizing: border-box;
        }
        .suggestion-card:hover {
          background-color: var(--bg-surface-hover);
          border-color: var(--border-color-active);
          box-shadow: var(--shadow-glow);
          transform: translateY(-2px);
        }
        
        .suggestion-header {
          margin-bottom: 0.75rem;
        }
        .suggest-icon {
          padding: 6px;
          width: 28px;
          height: 28px;
          border-radius: 8px;
        }
        .suggest-icon.sparkle { background-color: rgba(245, 158, 11, 0.15); color: #f59e0b; }
        .suggest-icon.code { background-color: rgba(56, 189, 248, 0.15); color: #38bdf8; }
        .suggest-icon.table { background-color: rgba(16, 185, 129, 0.15); color: #10b981; }
        .suggest-icon.message { background-color: rgba(139, 92, 246, 0.15); color: #8b5cf6; }
        
        .suggestion-text {
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--text-main);
          line-height: 1.4;
        }
        
        /* Chat Input Area */
        .chat-input-container {
          max-width: 800px;
          width: 100%;
          margin: 0 auto;
          padding: 0 1.5rem 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 8px;
          box-sizing: border-box;
          min-width: 0;
        }
        
        .input-box-wrapper {
          border-radius: 20px;
          padding: 10px 14px;
          display: flex;
          align-items: flex-end;
          gap: 10px;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          min-width: 0;
        }
        .input-box-wrapper:focus-within {
          border-color: var(--primary);
          box-shadow: var(--shadow-glow);
        }
        
        .chat-textarea {
          flex-grow: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-main);
          font-family: var(--font-sans);
          font-size: 0.95rem;
          line-height: 1.5;
          padding: 8px 4px;
          resize: none;
          max-height: 200px;
          min-width: 0;
        }
        .chat-textarea::placeholder {
          color: var(--text-muted);
        }
        
        .send-btn {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          background-color: rgba(255, 255, 255, 0.02);
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        .send-btn.active {
          color: white;
          background-color: var(--primary);
          box-shadow: 0 4px 12px var(--primary-glow);
        }
        .send-btn.active:hover {
          background-color: var(--primary-hover);
          transform: scale(1.05);
        }
        
        .input-disclaimer {
          font-size: 0.72rem;
          color: var(--text-muted);
          text-align: center;
          word-break: break-word;
        }

        .mic-btn, .lang-toggle-btn {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          background-color: rgba(255, 255, 255, 0.02);
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        body.light-mode .mic-btn, body.light-mode .lang-toggle-btn {
          background-color: rgba(0, 0, 0, 0.02);
        }
        .mic-btn:hover, .lang-toggle-btn:hover {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.05);
        }
        body.light-mode .mic-btn:hover, body.light-mode .lang-toggle-btn:hover {
          background-color: rgba(0, 0, 0, 0.05);
        }

        .mic-btn.listening {
          color: #ffffff;
          background-color: #ef4444;
          box-shadow: 0 0 12px rgba(239, 68, 68, 0.5);
          animation: pulse 1.4s infinite ease-in-out;
        }

        .mic-btn.disabled {
          opacity: 0.4;
          cursor: not-allowed;
          background-color: rgba(255, 255, 255, 0.01) !important;
        }

        .lang-toggle-btn {
          width: auto;
          padding: 0 8px;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--primary);
          border: 1px solid rgba(139, 92, 246, 0.2);
        }
        .lang-toggle-btn.tamil {
          color: #10b981;
          border-color: rgba(16, 185, 129, 0.2);
        }

        .textarea-listening {
          color: var(--primary) !important;
          font-style: italic;
        }

        .stop-speaking-bar {
          display: flex;
          justify-content: center;
          margin-bottom: 8px;
        }
        .stop-speaking-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 500;
          color: #ef4444;
          padding: 6px 12px;
          border-radius: 9999px;
          border: 1px solid rgba(239, 68, 68, 0.2);
          background-color: rgba(239, 68, 68, 0.05);
        }

        .mic-btn.processing {
          color: #ffffff;
          background-color: var(--primary);
          box-shadow: 0 0 12px var(--primary-glow);
          animation: spin 2s infinite linear;
        }

        .paperclip-btn {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          background-color: rgba(255, 255, 255, 0.02);
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        .paperclip-btn:hover:not(:disabled) {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.05);
        }

        .attachment-preview {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 14px;
          border-radius: 14px;
          background-color: rgba(14, 19, 31, 0.7);
          border: 1px solid var(--border-color);
          margin-bottom: 8px;
          backdrop-filter: blur(12px);
          max-width: 100%;
          box-sizing: border-box;
        }
        body.light-mode .attachment-preview {
          background-color: rgba(255, 255, 255, 0.8);
        }

        .attachment-info {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          overflow: hidden;
        }

        .pdf-icon {
          color: #ef4444;
          flex-shrink: 0;
        }

        .attachment-name {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-main);
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .attachment-status {
          font-size: 0.7rem;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 6px;
          background-color: rgba(245, 158, 11, 0.1);
          color: #f59e0b;
          flex-shrink: 0;
        }
        .attachment-status.ready {
          background-color: rgba(16, 185, 129, 0.1);
          color: #10b981;
        }

        .remove-attachment-btn {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .remove-attachment-btn:hover {
          color: #ef4444;
          background-color: rgba(239, 68, 68, 0.08);
        }

        .image-preview-thumbnail-wrapper {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          overflow: hidden;
          border: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .image-preview-thumbnail {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        /* Responsive CSS Rules for Mobile & Tablet */
        @media (max-width: 768px) {
          .chat-header {
            height: 54px;
            min-height: 54px;
            padding: 0 0.75rem;
            gap: 8px;
          }
          .header-left {
            gap: 8px;
          }
          .header-title {
            font-size: 0.9rem;
            max-width: 140px;
          }
          .header-right {
            gap: 8px;
          }
          .model-dropdown-select {
            padding: 5px 8px;
            font-size: 0.78rem;
            max-width: 140px;
          }
          .active-city-bar {
            padding: 6px 0.75rem;
            gap: 8px;
            flex-direction: column;
            align-items: stretch;
          }
          .city-bar-left {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            gap: 8px;
            flex-wrap: wrap;
          }
          .city-selector-btn {
            padding: 4px 8px;
            font-size: 0.8rem;
          }
          .active-city-name {
            max-width: 110px;
          }
          .weather-nav-tabs {
            flex: 0 0 auto;
          }
          .weather-tab-btn {
            padding: 3px 8px;
            font-size: 0.72rem;
          }
          .quick-city-chips {
            width: 100%;
            max-width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            padding: 2px 0 4px;
          }
          .city-dropdown-menu {
            width: calc(100% - 1.5rem);
            max-width: calc(100vw - 1.5rem);
            left: 0.75rem;
            right: 0.75rem;
          }
          .weather-drawer-panel {
            padding: 0.75rem;
          }
          .current-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
          }
          .message-stream-container {
            padding: 1rem 0.75rem;
          }
          .welcome-container {
            margin: 1.5rem auto 0;
            padding: 0 0.5rem;
          }
          .welcome-title {
            font-size: 1.6rem;
          }
          .welcome-subtitle {
            font-size: 0.9rem;
            margin-bottom: 1.5rem;
          }
          .suggestions-grid {
            grid-template-columns: 1fr;
            gap: 8px;
          }
          .chat-input-container {
            padding: 0 0.75rem 0.75rem;
          }
        }

        @media (max-width: 480px) {
          .chat-header {
            height: 50px;
            min-height: 50px;
            padding: 0 0.5rem;
            gap: 6px;
          }
          .header-left {
            gap: 6px;
          }
          .header-title {
            font-size: 0.82rem;
            max-width: 95px;
          }
          .header-badge {
            display: none;
          }
          .header-right {
            gap: 6px;
          }
          .model-dropdown-select {
            padding: 4px 6px;
            font-size: 0.72rem;
            max-width: 110px;
          }
          .settings-trigger-btn {
            width: 32px;
            height: 32px;
          }
          .menu-btn {
            width: 32px;
            height: 32px;
          }
          .active-city-bar {
            padding: 6px 0.5rem;
            gap: 6px;
          }
          .city-bar-left {
            gap: 6px;
          }
          .city-selector-btn {
            padding: 4px 6px;
            font-size: 0.75rem;
          }
          .active-city-label {
            display: none;
          }
          .active-city-name {
            max-width: 80px;
            font-size: 0.78rem;
          }
          .weather-tab-btn {
            padding: 3px 6px;
          }
          .weather-tab-btn span {
            font-size: 0.7rem;
          }
          .city-chip {
            font-size: 0.7rem;
            padding: 2px 8px;
          }
          .city-dropdown-menu {
            width: calc(100% - 1rem);
            max-width: calc(100vw - 1rem);
            left: 0.5rem;
            right: 0.5rem;
            padding: 10px;
          }
          .weather-drawer-panel {
            padding: 0.5rem;
          }
          .current-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 6px;
          }
          .metric-card {
            padding: 0.5rem;
          }
          .metric-val {
            font-size: 0.95rem;
          }
          .metric-label {
            font-size: 0.65rem;
          }
          .metric-sub {
            font-size: 0.68rem;
          }
          .message-stream-container {
            padding: 0.75rem 0.5rem;
          }
          .message-list {
            padding-bottom: 1rem;
          }
          .welcome-container {
            margin: 0.75rem auto 0;
            padding: 0 0.25rem;
          }
          .welcome-logo {
            width: 52px;
            height: 52px;
            border-radius: 16px;
            margin-bottom: 0.75rem;
          }
          .welcome-title {
            font-size: 1.3rem;
          }
          .welcome-subtitle {
            font-size: 0.8rem;
            margin-bottom: 1rem;
          }
          .suggestion-card {
            padding: 0.85rem;
            border-radius: 12px;
          }
          .suggestion-text {
            font-size: 0.8rem;
          }
          .chat-input-container {
            padding: 0 0.5rem 0.5rem;
            gap: 4px;
          }
          .input-box-wrapper {
            padding: 6px 8px;
            gap: 6px;
            border-radius: 16px;
          }
          .chat-textarea {
            font-size: 0.88rem;
            padding: 6px 2px;
          }
          .paperclip-btn, .mic-btn, .send-btn {
            width: 32px;
            height: 32px;
            border-radius: 10px;
          }
          .paperclip-btn svg, .mic-btn svg, .send-btn svg {
            width: 15px;
            height: 15px;
          }
          .lang-toggle-btn {
            height: 32px;
            padding: 0 5px;
            font-size: 0.68rem;
            border-radius: 10px;
          }
          .lang-toggle-btn svg {
            width: 12px;
            height: 12px;
          }
          .input-disclaimer {
            font-size: 0.68rem;
          }
          .quick-city-chips {
            width: 100%;
            max-width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            padding: 2px 0 4px;
          }
          .city-dropdown-menu {
            width: calc(100% - 1.5rem);
            max-width: calc(100vw - 1.5rem);
            left: 0.75rem;
            right: 0.75rem;
          }
          .weather-drawer-panel {
            padding: 0.75rem;
          }
          .current-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
          }
          .message-stream-container {
            padding: 1rem 0.75rem;
          }
          .welcome-container {
            margin: 1.5rem auto 0;
            padding: 0 0.5rem;
          }
          .welcome-title {
            font-size: 1.6rem;
          }
          .welcome-subtitle {
            font-size: 0.9rem;
            margin-bottom: 1.5rem;
          }
          .suggestions-grid {
            grid-template-columns: 1fr;
            gap: 8px;
          }
          .chat-input-container {
            padding: 0 0.75rem 0.75rem;
          }
        }

        @media (max-width: 480px) {
          .chat-header {
            height: 50px;
            min-height: 50px;
            padding: 0 0.5rem;
            gap: 6px;
          }
          .header-left {
            gap: 6px;
          }
          .header-title {
            font-size: 0.82rem;
            max-width: 95px;
          }
          .header-badge {
            display: none;
          }
          .header-right {
            gap: 6px;
          }
          .model-dropdown-select {
            padding: 4px 6px;
            font-size: 0.72rem;
            max-width: 110px;
          }
          .settings-trigger-btn {
            width: 32px;
            height: 32px;
          }
          .menu-btn {
            width: 32px;
            height: 32px;
          }
          .active-city-bar {
            padding: 6px 0.5rem;
            gap: 6px;
          }
          .city-bar-left {
            gap: 6px;
          }
          .city-selector-btn {
            padding: 4px 6px;
            font-size: 0.75rem;
          }
          .active-city-label {
            display: none;
          }
          .active-city-name {
            max-width: 80px;
            font-size: 0.78rem;
          }
          .weather-tab-btn {
            padding: 3px 6px;
          }
          .weather-tab-btn span {
            font-size: 0.7rem;
          }
          .city-chip {
            font-size: 0.7rem;
            padding: 2px 8px;
          }
          .city-dropdown-menu {
            width: calc(100% - 1rem);
            max-width: calc(100vw - 1rem);
            left: 0.5rem;
            right: 0.5rem;
            padding: 10px;
          }
          .weather-drawer-panel {
            padding: 0.5rem;
          }
          .current-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 6px;
          }
          .metric-card {
            padding: 0.5rem;
          }
          .metric-val {
            font-size: 0.95rem;
          }
          .metric-label {
            font-size: 0.65rem;
          }
          .metric-sub {
            font-size: 0.68rem;
          }
          .message-stream-container {
            padding: 0.75rem 0.5rem;
          }
          .message-list {
            padding-bottom: 1rem;
          }
          .welcome-container {
            margin: 0.75rem auto 0;
            padding: 0 0.25rem;
          }
          .welcome-logo {
            width: 52px;
            height: 52px;
            border-radius: 16px;
            margin-bottom: 0.75rem;
          }
          .welcome-title {
            font-size: 1.3rem;
          }
          .welcome-subtitle {
            font-size: 0.8rem;
            margin-bottom: 1rem;
          }
          .suggestion-card {
            padding: 0.85rem;
            border-radius: 12px;
          }
          .suggestion-text {
            font-size: 0.8rem;
          }
          .chat-input-container {
            padding: 0 0.5rem 0.5rem;
            gap: 4px;
          }
          .input-box-wrapper {
            padding: 6px 8px;
            gap: 6px;
            border-radius: 16px;
          }
          .chat-textarea {
            font-size: 0.88rem;
            padding: 6px 2px;
          }
          .paperclip-btn, .mic-btn, .send-btn {
            width: 32px;
            height: 32px;
            border-radius: 10px;
          }
          .paperclip-btn svg, .mic-btn svg, .send-btn svg {
            width: 15px;
            height: 15px;
          }
          .lang-toggle-btn {
            height: 32px;
            padding: 0 5px;
            font-size: 0.68rem;
            border-radius: 10px;
          }
          .lang-toggle-btn svg {
            width: 12px;
            height: 12px;
          }
          .input-disclaimer {
            font-size: 0.68rem;
          }
          .attachment-preview {
            padding: 6px 10px;
            border-radius: 10px;
          }
          .attachment-name {
            max-width: 140px;
            font-size: 0.78rem;
          }
        }
      `}} />
    </div>
  );
}

// Audio service for natural neural TTS playback and fallback
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

let currentAudio = null;
let currentBlobUrl = null;
let activeMessageId = null;
const listeners = new Set();

function notifyListeners() {
  const isPlaying = isAudioSpeaking();
  listeners.forEach((fn) => {
    try {
      fn(isPlaying, activeMessageId);
    } catch (e) {
      console.warn("audioService listener error:", e);
    }
  });
}

export function subscribeAudioState(fn) {
  listeners.add(fn);
  try {
    fn(isAudioSpeaking(), activeMessageId);
  } catch (_) {}
  return () => listeners.delete(fn);
}

export function isAudioSpeaking() {
  const isAudioPlaying = !!(currentAudio && !currentAudio.paused && !currentAudio.ended);
  const isSynthSpeaking = !!(window.speechSynthesis && window.speechSynthesis.speaking);
  return isAudioPlaying || isSynthSpeaking;
}

export function getActiveSpeakingId() {
  return activeMessageId;
}

export function stopAudio() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (_) {}
    currentAudio = null;
  }
  if (currentBlobUrl) {
    try {
      URL.revokeObjectURL(currentBlobUrl);
    } catch (_) {}
    currentBlobUrl = null;
  }
  if (window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch (_) {}
  }
  activeMessageId = null;
  notifyListeners();
}

export async function playNeuralTTS(text, lang = "en-IN", messageId = null) {
  stopAudio();

  if (!text || !text.trim()) return false;

  activeMessageId = messageId || "global";
  notifyListeners();

  try {
    const response = await fetch(`${API_BASE}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang })
    });

    if (!response.ok) {
      throw new Error(`TTS server returned status ${response.status}`);
    }

    const audioBlob = await response.blob();
    if (!audioBlob || audioBlob.size === 0) {
      throw new Error("Received empty audio response");
    }

    const blobUrl = URL.createObjectURL(audioBlob);
    currentBlobUrl = blobUrl;

    const audio = new Audio(blobUrl);
    currentAudio = audio;

    audio.onplay = () => notifyListeners();
    audio.onended = () => {
      stopAudio();
    };
    audio.onerror = (e) => {
      console.warn("Audio playback error, falling back to speech synthesis:", e);
      stopAudio();
      fallbackSpeechSynthesis(text, lang, messageId);
    };

    await audio.play();
    notifyListeners();
    return true;
  } catch (err) {
    console.warn("Natural neural TTS unavailable, using browser speech synthesis fallback:", err.message);
    fallbackSpeechSynthesis(text, lang, messageId);
    return false;
  }
}

function fallbackSpeechSynthesis(text, lang = "en-IN", messageId = null) {
  if (!window.speechSynthesis) {
    stopAudio();
    return;
  }

  const cleanText = text
    .replace(/[*#`_\-]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();

  const utterance = new SpeechSynthesisUtterance(cleanText);
  const hasTamil = /[\u0B80-\u0BFF]/.test(cleanText);
  utterance.lang = hasTamil || (lang && lang.startsWith("ta")) ? "ta-IN" : "en-IN";

  activeMessageId = messageId || "global";
  utterance.onstart = () => notifyListeners();
  utterance.onend = () => stopAudio();
  utterance.onerror = () => stopAudio();

  window.speechSynthesis.speak(utterance);
}

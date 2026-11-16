let cachedVoices = [];

export function initSpeechVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const load = () => {
    try {
      const v = window.speechSynthesis.getVoices?.() || [];
      if (v && v.length > 0) cachedVoices = v;
    } catch {}
  };
  load();
  if (typeof window.speechSynthesis.addEventListener === "function") {
    window.speechSynthesis.addEventListener("voiceschanged", load);
  } else if ("onvoiceschanged" in window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = load;
  }
}

const HIGH_QUALITY_VOICE_KEYWORDS = [
  "natural",
  "neural",
  "online",
  "premium",
  "siri",
  "google",
  "sabina",
  "alvaro",
  "jorge",
  "monica",
  "guy",
  "jenny",
  "samantha",
  "luciana",
  "diego",
];

export function pickBestVoice(langPrefix) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const pool = cachedVoices.length > 0 ? cachedVoices : (window.speechSynthesis.getVoices?.() || []);
  if (!pool || pool.length === 0) return null;

  const prefix = (langPrefix || "en").toLowerCase();
  const matches = pool.filter((v) => {
    const l = (v.lang || "").toLowerCase().replace("_", "-");
    return l.startsWith(prefix);
  });
  if (matches.length === 0) return null;

  const natural = matches.find((v) => {
    const name = (v.name || "").toLowerCase();
    return HIGH_QUALITY_VOICE_KEYWORDS.some((kw) => name.includes(kw));
  });

  return natural || matches[0];
}

let activeUtterance = null;
let activeCallbackOnEnd = null;

export function cancelElisSpeech() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    if (activeCallbackOnEnd) {
      const cb = activeCallbackOnEnd;
      activeCallbackOnEnd = null;
      cb();
    }
    activeUtterance = null;
    if (typeof window !== "undefined") window.__elisActiveUtterance = null;
    window.speechSynthesis.cancel();
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  } catch {}
}

/**
 * Cross-browser speech synthesis for Elis.
 * - Cancels any stuck queue and resumes paused engine.
 * - Stores a persistent reference to prevent SpiderMonkey / WebKit garbage collection.
 * - Never speaks empty text (which locks Firefox queue).
 * - Safe fallback if voice objects are still loading.
 */
export function speakElisText(text, isEs = false, onStart, onEnd) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text || !text.trim()) {
    onEnd?.();
    return () => {};
  }

  try {
    cancelElisSpeech();

    const cleanText = text.trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Keep persistent reference to prevent GC mid-playback in Firefox
    activeUtterance = utterance;
    activeCallbackOnEnd = onEnd;
    if (typeof window !== "undefined") {
      window.__elisActiveUtterance = utterance;
    }

    utterance.lang = isEs ? "es" : "en";
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voice = pickBestVoice(isEs ? "es" : "en");
    if (voice) {
      try {
        utterance.voice = voice;
        if (voice.lang) utterance.lang = voice.lang;
      } catch {}
    }

    utterance.onstart = () => {
      onStart?.();
    };

    utterance.onend = () => {
      if (activeUtterance === utterance) {
        activeUtterance = null;
        activeCallbackOnEnd = null;
        if (typeof window !== "undefined") window.__elisActiveUtterance = null;
      }
      onEnd?.();
    };

    utterance.onerror = (e) => {
      // In some browsers, cancel() triggers an error event with error: 'canceled' or 'interrupted'
      if (activeUtterance === utterance) {
        activeUtterance = null;
        activeCallbackOnEnd = null;
        if (typeof window !== "undefined") window.__elisActiveUtterance = null;
      }
      onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  } catch {
    activeUtterance = null;
    activeCallbackOnEnd = null;
    if (typeof window !== "undefined") window.__elisActiveUtterance = null;
    onEnd?.();
  }

  return () => {
    cancelElisSpeech();
  };
}

// MASTER TIMELINE (seconds). Every animation reads these constants; retime here only.
// Cue times are derived from the final narration (public/audio/narration.wav, 103 % take) and its
// word-level timings (public/audio/words-103.json), shifted by VOICE_START.

export const FPS = 30;
export const DURATION_FRAMES = 900; // 30.0 s hard limit → last frame 29.967 s

/** The narration file starts at this frame (≈0.17 s). */
export const VOICE_START_FRAME = 5;
export const VOICE_START = VOICE_START_FRAME / FPS;

export const T = {
  // Scene 1 — cinematic opening (original footage, unmodified source files)
  clip1: [0, 4.0],
  clip2: [3.4, 6.3], // plays at CLIP2_RATE, so it only reaches ≈2.2 s of clip 02; its AI-generated UI starts ≈2.25 s
  clipCross: [3.4, 4.0], // cross-dissolve clip 01 → clip 02 with a continuous push-in, in the pause after "trains."
  handoff: [5.75, 6.13], // clip 02 dissolves into the authentic Explore screenshot
  reconTag: [0.2, 6.15], // "Cinematic reconstruction" label
  placeTitle: [0.6, 3.8], // "…Machu Picchu stops the trains"

  // Explore (authentic) — "…but they don't agree" (6.71–7.55)
  estab: [6.0, 6.8],
  rowsIn: [6.7, 7.3],
  rowsHL: [6.8, 8.0],
  pullBack: [7.9, 8.5],
  toAmpl: [8.3, 8.6], // "For the NASA Harmonization challenge, we built Elis"

  // Scene 2 — Compare + method
  compareClick: 10.05,
  toCompare: [10.15, 10.5], // pause after "Elis." (10.30)
  camTop: [10.55, 11.15],
  jumpHL: [10.85, 12.2],
  n334: [11.4, 12.85], // "explodes" (11.55)
  camBottom: [12.3, 12.9],
  n38: [12.6, 14.45], // "under four percent" (13.22–14.32)
  schematic: [14.4, 18.85], // "It turns the satellites' disagreement into a measurement…"
  missedRing: 16.35, // "measurement" (16.50)
  schemChips: 17.1, // "with capture-recapture statistics" (17.20–18.58)
  camReset: [14.45, 14.85],

  // Scene 3 — Ask Elis — "Every number is checked against NASA FIRMS data" (19.10–21.39)
  askClick: 18.7,
  toAsk: [18.8, 19.1],
  qArrive: 19.3,
  qHover: [19.15, 19.7],
  qClick: 19.55,
  toAnswer: [19.65, 19.9],
  reveal: [19.67, 20.4],
  camHeader: [19.9, 20.45],
  verified: [20.5, 21.6], // "NASA FIRMS data" (20.58–21.39)
  camAskReset: [21.05, 21.4],
  outlookClick: 21.42,
  toOutlook: [21.5, 21.8], // pause after "data." (21.39–21.74)

  // Scene 4 — Outlook + Peru 2026 validation — "On a season it never saw…"
  camOutlook: [21.85, 22.45],
  card: [22.1, 25.25],
  fForecast: 23.35, // "forecast"
  fObserved: 23.65, // "landed"
  fWithin: 24.0, // "within six percent" (24.01)

  // Scene 5 — one closing scene: logo with the team around it ("We're Peruvian students trying to help",
  // 25.28–27.02), then tagline, URL and credits ("If it works here, it can work anywhere", 27.32–29.28)
  finale: 25.15,
  fLogo: 25.3,
  fPhotos: 25.62, // first photo; the others follow every F_PHOTO_STEP
  fLabel: 26.3,
  fLift: [27.1, 27.7],
  phrase: 27.45,
  url: 27.65,
  attrib: 27.85, // everything settled by ≈28.35 → still until the fade
  fadeBlack: [29.6, 29.967],
} as const;

export const CLIP2_RATE = 0.8;
export const F_PHOTO_STEP = 0.14;

type Word = { w: string; s: number; e: number };
export type Caption = { from: number; to: number; words: Word[] };

/** Narration words [text, start, end] in seconds of narration.wav. Text is the exact spoken script;
 *  timings come from words-103.json (automatic transcription, word errors corrected by hand). */
const CUE_WORDS: [string, number, number][][] = [
  [["August", 0.17, 0.35], ["2026.", 0.35, 1.262]],
  [["Fire", 1.612, 1.661], ["near", 1.661, 1.709], ["Machu", 1.709, 2.214], ["Picchu", 2.214, 2.505], ["stops", 2.505, 2.757], ["the", 2.757, 2.951], ["trains.", 2.951, 3.262]],
  [["For", 3.612, 3.767], ["years,", 3.767, 4.039], ["MODIS", 4.272, 4.466], ["and", 4.466, 4.621], ["VIIRS", 4.621, 4.835], ["satellites", 4.835, 5.243], ["have", 5.243, 5.534], ["watched", 5.534, 5.825], ["Peru", 5.825, 6.136], ["burn,", 6.136, 6.291]],
  [["but", 6.544, 6.68], ["they", 6.68, 6.893], ["don't", 6.893, 7.049], ["agree.", 7.049, 7.379]],
  [["For", 7.748, 7.864], ["the", 7.864, 8.019], ["NASA", 8.019, 8.214], ["Harmonization", 8.214, 8.777], ["challenge,", 8.777, 9.146], ["we", 9.534, 9.553], ["built", 9.553, 9.786], ["Elis.", 9.786, 10.136]],
  [["Mixed", 10.466, 10.505], ["naively,", 10.505, 10.893], ["the", 11.068, 11.204], ["error", 11.204, 11.379], ["explodes.", 11.379, 11.845]],
  [["Elis", 12.311, 12.524], ["brings", 12.524, 12.816], ["it", 12.816, 13.049], ["under", 13.049, 13.437], ["four", 13.437, 13.676], ["percent.", 13.676, 14.155]],
  [["It", 14.47, 14.563], ["turns", 14.563, 14.777], ["the", 14.777, 14.99], ["satellites'", 14.99, 15.32], ["disagreement", 15.495, 15.864], ["into", 15.864, 16.272], ["a", 16.272, 16.33], ["measurement,", 16.33, 16.738]],
  [["with", 17.029, 17.204], ["capture-recapture", 17.204, 18.0], ["statistics.", 18.0, 18.408]],
  [["Every", 18.932, 19.126], ["number", 19.126, 19.379], ["is", 19.379, 19.592], ["checked", 19.592, 19.786], ["against", 19.786, 20.408], ["NASA", 20.408, 20.641], ["FIRMS", 20.641, 20.913], ["data.", 20.913, 21.223]],
  [["On", 21.573, 21.689], ["a", 21.689, 21.806], ["season", 21.806, 21.961], ["it", 21.961, 22.175], ["never", 22.175, 22.388], ["saw,", 22.388, 22.699]],
  [["its", 23.01, 23.184], ["forecast", 23.184, 23.456], ["landed", 23.456, 23.845], ["within", 23.845, 24.097], ["six", 24.097, 24.372], ["percent.", 24.372, 25.107]],
  [["We're", 25.107, 25.534], ["Peruvian", 25.534, 25.786], ["students", 25.786, 26.155], ["trying", 26.155, 26.485], ["to", 26.485, 26.641], ["help.", 26.641, 26.854]],
  [["If", 27.146, 27.282], ["it", 27.282, 27.379], ["works", 27.379, 27.592], ["here,", 27.592, 27.903], ["it", 28.233, 28.291], ["can", 28.291, 28.466], ["work", 28.466, 28.641], ["anywhere.", 28.641, 29.107]],
];

export const CAPTIONS: Caption[] = CUE_WORDS.map((cue, i) => {
  const words = cue.map(([w, s, e]) => ({ w, s: s + VOICE_START, e: e + VOICE_START }));
  const next = CUE_WORDS[i + 1];
  const nextFrom = next ? next[0][1] + VOICE_START - 0.05 : Infinity;
  return { from: words[0].s - 0.08, to: Math.min(nextFrom, words[words.length - 1].e + 0.4), words };
});

const VOICE_WORDS = CAPTIONS.flatMap((c) => c.words);
const voiceGap = (t: number) => Math.min(...VOICE_WORDS.map((w) => (t < w.s ? w.s - t : t > w.e ? t - w.e : 0)));

/** Music ducking, one gain per frame: low under the voice, a little higher in pauses, full in the close. */
export const MUSIC_DUCK: number[] = Array.from({ length: DURATION_FRAMES }, (_, f) => {
  const t = f / FPS;
  const open = Math.min(1, Math.max(0, (voiceGap(t) - 0.08) / 0.4));
  const close = Math.min(1, Math.max(0, (t - 29.2) / 0.3));
  const end = Math.min(1, Math.max(0, (DURATION_FRAMES / FPS - t) / 0.4));
  return (0.4 + 0.3 * open + 0.3 * close) * end;
});

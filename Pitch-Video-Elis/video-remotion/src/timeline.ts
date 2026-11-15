// MASTER TIMELINE (seconds). Every animation reads these constants; retime here only.
// Narration blocks follow the production brief (internal document, not published). Final cue times must be
// re-derived from the real narration recording (word-level) — until then they are PRELIMINARY.

export const FPS = 30;
export const DURATION_FRAMES = 900; // 30.0 s hard limit → last frame 29.967 s

export const T = {
  // Scene 1 — cinematic opening (original footage, unmodified source files)
  clip1: [0, 4.0],
  clip2: [4.0, 6.3], // plays 0.00–2.30 s of clip 02; its AI-generated UI starts ≈2.25 s
  handoff: [5.75, 6.13], // clip 02 dissolves into the authentic Explore screenshot
  reconTag: [0.2, 6.15], // "Cinematic reconstruction" label
  placeTitle: [0.6, 3.8],

  // Explore (authentic)
  estab: [6.0, 7.1], // camera eases 1.45× → 1.0× while the real UI resolves
  rowsIn: [7.15, 7.8],
  rowsHL: [7.55, 8.55],
  pullBack: [8.35, 9.0],
  toAmpl: [8.72, 9.02],

  // Scene 2 — Compare + method
  compareClick: 9.45,
  toCompare: [9.58, 9.95],
  camTop: [10.0, 10.6],
  jumpHL: [10.4, 11.95],
  n334: [10.65, 12.4],
  camBottom: [11.9, 12.5],
  n38: [12.2, 13.05],
  schematic: [13.05, 16.5],
  missedRing: 15.2, // "…the fire both satellites miss"
  camReset: [13.2, 13.6],

  // Scene 3 — Ask Elis (approved interaction)
  askClick: 17.2,
  toAsk: [17.3, 17.6],
  qArrive: 18.25,
  qHover: [18.05, 18.75],
  qClick: 18.55,
  toAnswer: [18.7, 18.95],
  reveal: [18.72, 19.45],
  camHeader: [18.9, 19.5],
  verified: [19.6, 20.4],
  camPanel: [20.05, 20.45],
  scroll: [20.25, 21.2],
  camAskReset: [21.05, 21.4],
  outlookClick: 21.48,
  toOutlook: [21.6, 21.95],

  // Scene 4 — Outlook + Peru 2026 validation
  camOutlook: [22.0, 22.6],
  card: [22.25, 25.3],
  fForecast: 22.55,
  fObserved: 23.4,
  fWithin: 24.2,

  // Scene 5 — outro
  toOutro: [25.3, 25.9],
  logo: 25.7,
  phrase: 26.5,
  url: 27.1,
  attrib: 27.3,
  fadeBlack: [29.45, 29.967],
} as const;

/** PRELIMINARY subtitles — exact approved narration text (internal voice script, closing A).
 *  Times are placeholders aligned to the brief's block table; replace from the real voice track. */
export const CAPTIONS: { from: number; to: number; text: string }[] = [
  { from: 0.25, to: 3.9, text: 'August 2026. Fire near Machu Picchu stops the trains.' },
  { from: 4.0, to: 6.6, text: 'NASA has watched Peru burn for twenty-six years,' },
  { from: 6.6, to: 8.95, text: "but its two satellites don't agree." },
  { from: 9.0, to: 10.95, text: 'Stack them naively, and the error explodes.' },
  { from: 10.95, to: 13.0, text: 'Elis harmonizes them, under four percent.' },
  { from: 13.05, to: 15.1, text: 'A Bayesian capture-recapture model' },
  { from: 15.1, to: 17.3, text: 'estimates the fire both satellites miss.' },
  { from: 17.4, to: 21.3, text: 'Ask Elis anything, every number checked.' },
  { from: 21.45, to: 25.25, text: 'On a season it never saw, its forecast landed within six percent.' },
  { from: 25.45, to: 27.6, text: "We're Peruvian students trying to help." },
  { from: 27.6, to: 29.7, text: 'If it works here, it can work anywhere.' },
];

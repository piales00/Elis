# ELIS 30-second video: production notes (v3, final narration)

Status: **final narration integrated, pending team review in Remotion Studio.** The final MP4 has not been rendered yet.

## Narration and sync (v3)

- `public/audio/narration.wav` (29.5 s, 48 kHz, 103 % take, already cleaned and normalized) starts at frame 5 (≈0.17 s, `VOICE_START_FRAME` in `src/timeline.ts`). `cinematicVolume` is 0.15, so the clips' sound stays under the voice.
- Subtitles: 14 short cues built from `public/audio/words-103.json` (word-level timings). The text is the exact spoken script; transcription errors were corrected by hand ("firing" → "Fire near", "arrow" → "error", "brilliant" → "Peruvian", "doesn't work" → "can work", etc.). The word being spoken is lightly highlighted.
- Key cues (video seconds): "explodes" 11.55 → 334 %; "under four percent" 13.2 → 3.8 %; "measurement" 16.5 → estimated-total ring; "capture-recapture" 17.2 → chips "Capture–recapture (Chapman) · Simultaneous overpasses · 90% range"; "NASA FIRMS data" 20.6 → "✓ verified against NASA FIRMS"; "forecast / landed / within six percent" 23.35 / 23.65 / 24.0 → Forecast 24,392 → Observed 22,955 → within ~6%; "We're Peruvian students" 25.3 → team card (Team Log N + 1 · Peru); "If it works here" 27.3 → outro; URL fully visible from 28.4 to the fade at 29.6.
- Scene changes fall in the pauses: Compare at 10.15–10.5 (after "Elis."), schematic at 14.4, Ask Elis at 18.8 (after "statistics."), Outlook at 21.5 (after "data."), team at 25.15.
- Ask Elis now uses two new authentic captures of https://elis-peru.vercel.app (2026-11-15, English, dark): the example questions and the stored answer to "Why do the raw counts jump in 2012?". The whole answer fits on one screen, so the old scroll strip (`ask-strip`, `tools/ask_strip.py`) and the three old captures were removed.

## How it is built

- Remotion (React). Every frame is a pure function of time `t`, the `View(t)` principle of the `html-demo` approach. All times are in `src/timeline.ts`.
- Composition `ElisPitch`: 1920×1080, 30 fps, 900 frames (30.000 s).
- `npm ci`, then `npm run dev` (Remotion Studio: play, pause, scrub, jump and freeze) and `npm run render:v2`.

## Assets (originals are never modified)

- `public/media/clip01.mp4`: `01-incendio.mp4` scaled from 1280×720 to 1920×1080 and converted from 24 to 30 fps (frame duplication, no interpolation). Included in the repository.
- `public/media/clip02.mp4`: `02-transicion-elis.mp4` converted from 24 to 30 fps. Only its first 2.30 s are used. Included in the repository.
- `public/shots/*.png`: the 6 screenshots, scaled and center-cropped to 1920×1080 (`tools/normalize.py`).
- `public/team/*.jpg`: the 4 team photos from `web/public/landing/team/`.

## Hand-off from clip 02 to the real Explore view

- The AI-generated interface in clip 02 appears at the left edge from about 1.9 to 2.0 s and fully from about 2.25 s.
- In the video:
  - The clip dissolves into the real `explore-inicial` screenshot between 5.75 and 6.13 s (`T.handoff` in `src/timeline.ts`).
  - During the dissolve the clip gets a 4.5% push-in that keeps that edge out of frame.
  - The real Explore view starts at 1.45× zoom and opens out to 1.0×.
- One detail remains, without text: a small synthetic marker or box in the clip, visible from about 1.6 s near the center right.

## Items awaiting confirmation

1. ~~"Bayesian"~~: closed. The final narration says "capture-recapture statistics"; the labels say "Capture–recapture (Chapman)".
2. **"within six percent"**: the difference between 24,392 and 22,955 is 5.9% measured against the forecast and 6.3% measured against the observation. On screen: "within ~6%", with the context Peru, 2026 season, out of sample (`docs/methods/05-seasonal-forecast.md`).
3. **Substitution**: the brief called for Thermal, True color and Burn scars views, but no authentic screenshots of those views exist. They were replaced by Compare and a scientific schematic labeled "Schematic · not data".
4. ~~Team~~: closed. Team card with the 4 real photos and roles.
5. **Santa María "VIIRS 3 · MODIS 1"**: not found in the repository. The real rows from the screenshot are used (MODIS 1,215 · VIIRS 5,912, Peru, August 2026, raw, not comparable).
6. ~~Ask Elis answer~~: closed. The new capture shows the stored verified answer (10,375 → 92,807 raw detections, 8.9×; September 2011/2012 fire cell-days with 90 % ranges).

## Pending

- Team review of the preview in Studio (`npm run dev`), then render the final MP4 (`npm run render:v2`).
- `public/audio/` is git-ignored: copy `narration.wav` there on any machine that renders, or approve publishing it.
- Review the open items in `../ASSETS-AND-LICENSES.md`.

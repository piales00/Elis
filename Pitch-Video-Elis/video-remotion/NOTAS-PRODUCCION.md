# ELIS 30-second video: production notes (v4, final narration, sound and team close)

Status: **final narration, music, sound effects and the new closing scene integrated; pending team review in Remotion Studio.** The final MP4 has not been rendered yet.

## Narration and sync (v3)

- `public/audio/narration.wav` (29.5 s, 48 kHz, 103 % take, already cleaned and normalized) starts at frame 5 (≈0.17 s, `VOICE_START_FRAME` in `src/timeline.ts`). `cinematicVolume` is 0.15, so the clips' sound stays under the voice.
- Subtitles: 14 short cues built from `public/audio/words-103.json` (word-level timings). The text is the exact spoken script; transcription errors were corrected by hand ("firing" → "Fire near", "arrow" → "error", "brilliant" → "Peruvian", "doesn't work" → "can work", etc.). The word being spoken is lightly highlighted.
- Key cues (video seconds): "explodes" 11.55 → 334 %; "under four percent" 13.2 → 3.8 %; "measurement" 16.5 → estimated-total ring; "capture-recapture" 17.2 → chips "Capture–recapture (Chapman) · Simultaneous overpasses · 90% range"; "NASA FIRMS data" 20.6 → "✓ verified against NASA FIRMS"; "forecast / landed / within six percent" 23.35 / 23.65 / 24.0 → Forecast 24,392 → Observed 22,955 → within ~6%; "We're Peruvian students" 25.3 → closing scene (logo with the team around it); "If it works here" 27.3 → tagline, URL and credits in the same scene; everything settled from 28.35 to the fade at 29.6.
- Scene changes fall in the pauses: Compare at 10.15–10.5 (after "Elis."), schematic at 14.4, Ask Elis at 18.8 (after "statistics."), Outlook at 21.5 (after "data."), closing scene at 25.15.
- Ask Elis now uses two new authentic captures of https://elis-peru.vercel.app (2026-11-15, English, dark): the example questions and the stored answer to "Why do the raw counts jump in 2012?". The whole answer fits on one screen, so the old scroll strip (`ask-strip`, `tools/ask_strip.py`) and the three old captures were removed.

## Changes in v4

- **Softer cut between the two fire clips.** Clip 01 now cross-dissolves into clip 02 over 0.6 s (3.4–4.0 s, `T.clipCross`), in the pause between "…stops the trains." (ends 3.43) and "For years…" (starts 3.78). Clip 01 keeps pushing in (up to 1.07×) and clip 02 starts at 1.06× and relaxes, so the zoom reads as one movement. Brightness and colour of both clips were measured at the join (mean luma 82.5 vs 82.8) and needed no correction. Clip 02 starts 0.6 s earlier and plays at 0.8× (`CLIP2_RATE`), so it still never reaches its AI-generated interface. The clips' own sound cross-fades too.
- **New closing scene** (`src/components/Finale.tsx`, 25.15 s to the end; replaces the team card and the outro): Elis logo in the centre with a warm halo and a thin ring, the four team photos around it joined by thin lines, name plus two role lines each, the label "Team Log N + 1 · Peru · NASA Space Apps 2026"; with "If it works here…" the group lifts 84 px and the tagline, the URL and the credits appear. Still from 28.35 to 29.6 s.
- **Sound** (`src/components/Soundtrack.tsx`, files in `public/audio/sfx/`, all synthesized by `tools/make_audio.py`, no third-party material):

| Sound | Second(s) |
|---|---|
| `music.wav` (30 s bed, ducked under the voice by `MUSIC_DUCK` in `src/timeline.ts`) | 0–30 |
| `whoosh` | 3.3 · 5.55 · 9.95 · 14.2 · 18.6 · 21.3 · 24.95 |
| `click` (pointer clicks: Compare, Ask Elis, question, Outlook) | 10.05 · 18.7 · 19.55 · 21.42 |
| `riser` → `impact` (334%) | 10.7 → 11.4 |
| `tick` (3.8%) | 12.68 |
| `chime` (✓ verified against NASA FIRMS) | 20.5 |
| `pop1` · `pop2` · `pop3` (Forecast → Observed → within ~6%) | 23.35 · 23.65 · 24.0 |
| `shimmer` (final logo) | 25.3 |
| `photo1`–`photo4` (team photos) | 25.62 · 25.76 · 25.90 · 26.04 |

  No typing sound: no scene shows text being typed.
- **Mix** (audio-only export, `npx remotion render src/index.ts ElisPitch out/audio-check.wav --codec=wav`, measured with ffmpeg `ebur128` and `volumedetect`): full mix −15.8 LUFS, peak −4.9 dBFS. Voice alone −15.9 LUFS, peak −5.2 dBFS. Sound effects peak about 14 dB under the voice peak; music about 16 LU under the voice. Levels: `musicVolume` 0.52, `sfxVolume` 0.7 in `src/Root.tsx`; per-effect levels in `Soundtrack.tsx`.
- **Replacing the music**: save your track as `public/audio/music-custom.mp3` (or `.wav`) and set `musicSrc: 'audio/music-custom.mp3'` in `src/Root.tsx` (or in the Studio props panel). It gets the same ducking. `musicSrc: null` turns music off. Custom music stays git-ignored.
- **New Outlook capture** (https://elis-peru.vercel.app, 2026-11-15, English, dark, 1920×1080, Peru, Aug 2026): replaces the older Cusco capture; nothing distracting is left behind the Peru 2026 card. The app's own 2027 season card is dimmed as before so it is not confused with the 2026 validation. The capture shows the app's honest label "Climatology (no skill at this lead)" for the 2027 outlook at a 10-month lead; the card on screen is about the 2026 season forecast issued 1 month ahead.

## How it is built

- Remotion (React). Every frame is a pure function of time `t`, the `View(t)` principle of the `html-demo` approach. All times are in `src/timeline.ts`.
- Composition `ElisPitch`: 1920×1080, 30 fps, 900 frames (30.000 s).
- `npm ci`, then `npm run dev` (Remotion Studio: play, pause, scrub, jump and freeze) and `npm run render:v2`.

## Assets (originals are never modified)

- `public/media/clip01.mp4`: `01-incendio.mp4` scaled from 1280×720 to 1920×1080 and converted from 24 to 30 fps (frame duplication, no interpolation). Included in the repository.
- `public/media/clip02.mp4`: `02-transicion-elis.mp4` converted from 24 to 30 fps. Only its first 2.30 s are used. Included in the repository.
- `public/shots/*.png`: the 6 screenshots, scaled and center-cropped to 1920×1080 (`tools/normalize.py`, needs `opencv-python`).
- `public/audio/sfx/*.wav`: synthesized music and sound effects (`python3 tools/make_audio.py`, needs `numpy`). Included in the repository.
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
4. ~~Team~~: closed. Closing scene with the 4 real photos and their roles.
5. **Santa María "VIIRS 3 · MODIS 1"**: not found in the repository. The real rows from the screenshot are used (MODIS 1,215 · VIIRS 5,912, Peru, August 2026, raw, not comparable).
6. ~~Ask Elis answer~~: closed. The new capture shows the stored verified answer (10,375 → 92,807 raw detections, 8.9×; September 2011/2012 fire cell-days with 90 % ranges).

## Pending

- Team review of the preview in Studio (`npm run dev`), then render the final MP4 (`npm run render:v2`).
- `public/audio/narration.wav` is git-ignored (only `public/audio/sfx/` is tracked): copy it there on any machine that renders, or approve publishing it.
- Listen to the mix on speakers and headphones before the final render; adjust `musicVolume` / `sfxVolume` in `src/Root.tsx` if needed.
- Review the open items in `../ASSETS-AND-LICENSES.md`.

# ELIS 30-second video: production notes (preliminary visual version v2)

Status: **preliminary.** The narrator's real recording is not included yet, and subtitle timings are provisional. This is not the final delivery.

## How it is built

- Remotion (React). Every frame is a pure function of time `t`, the `View(t)` principle of the `html-demo` approach. All times are in `src/timeline.ts`.
- Composition `ElisPitch`: 1920×1080, 30 fps, 900 frames (30.000 s).
- `npm ci`, then `npm run dev` (Remotion Studio: play, pause, scrub, jump and freeze) and `npm run render:v2`.

## Assets (originals are never modified)

- `public/media/clip01.mp4`: `01-incendio.mp4` scaled from 1280×720 to 1920×1080 and converted from 24 to 30 fps (frame duplication, no interpolation). Included in the repository.
- `public/media/clip02.mp4`: `02-transicion-elis.mp4` converted from 24 to 30 fps. Only its first 2.30 s are used. Included in the repository.
- `public/shots/*.png`: the 7 screenshots, scaled and center-cropped to 1920×1080 (`tools/normalize.py`).
- `public/shots/ask-strip.png`: a strip of the Ask Elis answer panel. It joins `ask-elis-02` and `ask-elis-03` over their shared region: match score 0.997, mean difference 2.5/255 (`tools/ask_strip.py`). No content is invented.

## Hand-off from clip 02 to the real Explore view

- The AI-generated interface in clip 02 appears at the left edge from about 1.9 to 2.0 s and fully from about 2.25 s.
- In the video:
  - The clip dissolves into the real `explore-inicial` screenshot between 5.75 and 6.13 s (`T.handoff` in `src/timeline.ts`).
  - During the dissolve the clip gets a 4.5% push-in that keeps that edge out of frame.
  - The real Explore view starts at 1.45× zoom and opens out to 1.0×.
- One detail remains, without text: a small synthetic marker or box in the clip, visible from about 1.6 s near the center right.

## Items awaiting confirmation

1. **"Bayesian"**: the main documented method (`docs/methods/01-harmonization.md`) is the Chapman estimator (capture-recapture) with bootstrap. Bayesian analysis appears in `docs/resultados-bayes.md` as a complementary analysis. The narration text is unchanged; the on-screen labels say "Capture–recapture · Simultaneous overpasses · 90% range" and do not present the method as Bayesian. **Confirm with the narrator.**
2. **"within six percent"**: the difference between 24,392 and 22,955 is 5.9% measured against the forecast and 6.3% measured against the observation. On screen: "within ~6%", with the context Peru, 2026 season, out of sample (`docs/methods/05-seasonal-forecast.md`).
3. **Substitution**: the brief called for Thermal, True color and Burn scars views, but no authentic screenshots of those views exist. They were replaced by Compare and a scientific schematic labeled "Schematic · not data".
4. **Team**: no photo or confirmed roles, so no team card is shown.
5. **Santa María "VIIRS 3 · MODIS 1"**: not found in the repository. The real rows from the screenshot are used (MODIS 1,215 · VIIRS 5,912, Peru, August 2026, raw, not comparable).
6. **Ask Elis answer**: it includes figures outside the verified table (1,787.7; 41.7%; 4.1×; ~7%). It is the app's real output and is shown without emphasis.

## For the final version

- Copy the narration to `public/audio/` and pass `voiceSrc` (default props in `src/Root.tsx`).
- Lower `cinematicVolume` (now 0.35) to about 0.12 to 0.2, or set it to 0 to mute the clips.
- Rebuild `CAPTIONS` in `src/timeline.ts` with the real word-level timings of the narration.
- **Do not speed up the audio without the team's approval.**
- Review the open items in `../ASSETS-AND-LICENSES.md`.

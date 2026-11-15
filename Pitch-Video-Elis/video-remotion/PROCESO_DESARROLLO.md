# Development process: ELIS 30-second video

This document explains how `out/elis-preview-v2.mp4` was built. Sources are the code in `src/` and `tools/`, `NOTAS-PRODUCCION.md`, and the commands run during production. Numeric values (times, zooms, coordinates) are copied from the code as it stands.

---

## 1. Starting point

### Available material

| Material | Facts (verified with ffprobe or visual inspection) |
|---|---|
| `01-incendio.mp4` | 4.000 s, 1280×720, 24 fps, H.264 + AAC |
| `02-transicion-elis.mp4` | 4.958 s, 1920×1080, 24 fps, H.264 + AAC |
| 7 screenshots in `assets/imagenes/screenshots/` | `explore-inicial.jpeg` (1600×915); the other six are about 1900×1060 |
| `assets/imagenes/logo-elis.png` | 2048×2048, transparent background |
| Internal production brief and voice script | Approved narration (closing A), verified figures, delivery requirements. Not published. |

The two clips are AI-generated team assets; their origin and credits are in `../ASSETS-AND-LICENSES.md`.

### Scientific sources

- The published app and NASA GIBS were not reachable from the development environment.
- Figures were cross-checked against this repository's documentation, read-only:
  - `README.md` and `docs/methods/01-harmonization.md`: 334% to 3.8%, Peru, held-out years 2021 to 2024. Also the method: Chapman estimator on simultaneous overpasses, with bootstrap and 90% ranges.
  - `docs/methods/05-seasonal-forecast.md`: Peru 2026 season, forecast 24,392 versus 22,955 observed, model fitted on 2003 to 2025. Also "15 of 20" departments with skill (backtest, 1-month lead).

### Decisions approved before coding

- Keep the two clips unedited. Replace the AI-generated interface at the end of clip 02 with the real `explore-inicial` screenshot.
- Ask Elis: the purple question from *Example Questions*, then the upper answer and a scroll to the lower one. No Mission Hub and no 3D button.
- No team card, because there is no photo and roles are unconfirmed.
- Do not invent Thermal, True color or Burn scars views. Substitute Compare and a labeled schematic.
- "within ~6%", with the Peru, 2026 season context.
- Do not present the method as Bayesian on screen, but keep the word in the narration.
- A "Cinematic reconstruction" label over the recreated footage.
- Narration left intact; no speeding up the audio without approval.

---

## 2. Architecture: one clock

The principle comes from the `html-demo` approach: **every frame is a pure function of one number**.

- In `ElisPitch.tsx`: `t = useCurrentFrame() / fps`. There is no `useState`, `setTimeout` or CSS transition. Everything derives from `t`.
- `src/timeline.ts` gathers every moment of the video, in seconds, in the object `T`. Re-timing means changing a constant.
- `src/lib/motion.ts` holds the helpers:
  - `ease(t, a, b)`: 0 to 1 progress with a cubic curve.
  - `vis(t, a, b, fi, fo)`: fade in, hold, fade out.
  - `camAt(t, start, moves)`: the camera interpolates between `{cx, cy, z}` positions. `clampCam` keeps the view from leaving the edge.
  - `glide(t, ways)`: the pointer reaches each waypoint at its time `at`, with a curve approximating `cubic-bezier(0.55, 0, 0.25, 1)`.
  - `press(t, at)`: a 0.17 s click press.
- **Fixed 1920×1080 stage.** Screenshots are normalized to that size. Cameras transform the stage with `translate(...) scale(z)` and origin `0 0` (`camTransform`).
- **Real coordinates.** Pointer targets, highlights and cameras are written in pixels of the **original screenshot**. `N()` and `R()` in `lib/assets.ts` convert them to the stage using the scale and crop saved in `shots-meta.json`.
- **Layers.** Each scene is mounted only during its interval (`exploreOn`, `compareOn`, ...) with an opacity computed from `t`. Cross-fades between scenes are always an `ease()` on the incoming layer's opacity.

As a result, Remotion Studio can play, pause, scrub, jump to and freeze any frame, and the same frame looks identical on every render.

---

## 3. Asset preparation

Run once; outputs are in `public/`, and originals are never touched.

### Clips to 1080p30

```bash
npm run prepare:clips
```

This wraps the conversion originally done with ffmpeg:

```bash
ffmpeg -i assets/videos/01-incendio.mp4 -vf "scale=1920:1080:flags=lanczos,fps=30" \
  -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k public/media/clip01.mp4
ffmpeg -i assets/videos/02-transicion-elis.mp4 -vf "fps=30" \
  -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k public/media/clip02.mp4
```

Going from 24 to 30 fps duplicates frames without interpolating. Clip 01 is scaled from 720p to 1080p. (The `prepare:clips` script uses the ffmpeg bundled with Remotion, which has no `fps` filter, so it passes `-r 30`; the result is the same up to encoder differences.)

### Screenshots to 1920×1080: `tools/normalize.py`

Cover-scale `s = max(1920/w, 1080/h)` followed by a center crop. Saves `s`, `ox` and `oy` for each screenshot in `meta.json`. For example, `explore-inicial` has `s = 1.2` and loses 9 px at the top and bottom.

### Ask Elis scroll strip: `tools/ask_strip.py`

- Finds a block of `ask-elis-03` (rows 100 to 300, columns 100 to 480) inside `ask-elis-02` with `cv2.matchTemplate`.
- Result: match score **0.997**, vertical offset **d = 429 px**, horizontal offset −2 px.
- Builds a strip with the panel from 02 on top and what appears only in 03 below, with a 24 px feather at the seam (row 620).
- Mean difference over the overlap: **2.52/255**.
- Geometry saved in `ask-strip.json`: x0 74, top 82, bottom 958, width 437, height 876, d 429.
- No content is invented: every pixel comes from one of the two screenshots.

### Font and logo

- Inter (4 weights) copied to `public/fonts/`. It is loaded with `FontFace` and `delayRender` so no frame renders with a fallback font.
- The logo is copied to `public/media/`.

---

## 4. Scenes

Times are from `src/timeline.ts`. Cameras are described as `{cx, cy, z}` in stage coordinates.

### Scene 1: cinematic opening + real Explore (0 to 9.02 s)

| Time | What happens | Code |
|---|---|---|
| 0 to 4.0 s | `clip01.mp4` in full | `<Sequence>` + `<OffthreadVideo>` |
| 0.6 to 3.8 s | label "Cusco · Peru / Machu Picchu · Aug 2026" | `OpeningLabels` |
| 0.2 to 6.15 s | "Cinematic reconstruction" label (top right) | `OpeningLabels`, prop `showReconstructionTag` |
| 4.0 to 6.3 s | `clip02.mp4`, only its first 2.30 s | second `<Sequence>` |
| 5.75 to 6.13 s | **hand-off**: the clip dissolves into `explore-inicial` (see section 5) | `T.handoff` |
| 6.0 to 7.1 s | camera on the real Explore view goes from `{1215, 520, 1.45}` to 1.0× | `camExplore`, `T.estab` |
| 7.15 to 7.8 s | zoom to 1.8× on the *"What each sensor saw"* rows | `T.rowsIn`, `ROWS = R('explore-inicial', 86, 308, 408, 368)` |
| 7.55 to 8.55 s | highlight of MODIS 1,215 and VIIRS 5,912, real figures from the screenshot | `Highlight`, color `modis` |
| 8.35 to 9.0 s | pull back to 1.0× | `T.pullBack` |
| 8.72 to 9.02 s | cross-fade to `explore-ampliado`, which arrives at scale 1.08 to 1.0 | `T.toAmpl`, `camAmpl` |

### Scene 2: Compare + method (9.0 to 17.3 s)

| Time | What happens | Code |
|---|---|---|
| 8.85 s | the pointer appears | `cursorOpacity` |
| 9.45 s | click on the real **Compare** button of `explore-ampliado` | `T.compareClick` |
| 9.58 to 9.95 s | cross-fade to `compare.png` | `T.toCompare` |
| 10.0 to 10.6 s | camera to 1.6× on the *Raw detections (naive sum)* chart | `T.camTop` |
| 10.4 to 11.95 s | orange highlight of the post-2012 jump | `R('compare', 356, 432, 640, 616)` |
| 10.65 to 12.4 s | red **"334%"**, "Naive sum · MODIS + VIIRS" | `ErrorFigure` |
| 11.9 to 12.5 s | camera moves down to the *Fire cell-days: each sensor and the estimate* chart | `T.camBottom` |
| 12.2 to 13.05 s | "334%" rises and fades; green **"3.8%"** enters, "Elis · harmonized" | `ErrorFigure` |
| (both) | figure footer: "Annual error · Peru · held-out years 2021–2024 / Unit: fire cell-days" | `ErrorFigure` |
| 13.05 to 16.5 s | capture-recapture **schematic** over a dimmed Compare view | `Schematic` |
| 13.2 to 13.6 s | under the schematic, the Compare camera returns to 1.0× for the next click | `T.camReset` |

Schematic details:
- Two circles, "MODIS · Aqua · 1 km" and "VIIRS · S-NPP · 375 m", with "seen by both" in the intersection.
- Chips "Capture–recapture · Simultaneous overpasses · 90% range".
- At 15.2 s a dashed ellipse, "Estimated total — including fire both missed", is drawn, in sync with *"...the fire both satellites miss"*.
- A fixed label, "Schematic · not data". The schematic contains no numbers.

### Scene 3: Ask Elis (17.2 to 21.95 s)

| Time | What happens | Code |
|---|---|---|
| 17.2 s | click on **Ask Elis** in the left menu of `compare` | `T.askClick` |
| 17.3 to 17.6 s | cross-fade to `ask-elis-01-inicial` | `T.toAsk` |
| 18.25 s | the pointer reaches the purple question *"What is the 2027 outlook & fire regime in Cusco / Machu Picchu?"* | `T.qArrive` |
| 18.05 to 18.75 s | hover: violet frame around the question | `R('ask-elis-01-inicial', 105, 326, 481, 374)` |
| 18.55 s | click | `T.qClick` |
| 18.7 to 18.95 s | cross-fade to the background of `ask-elis-03` with the strip on top | `T.toAnswer` |
| 18.72 to 19.45 s | the question bubble shows from the start; the answer is revealed top to bottom | `revealY` |
| 18.9 to 19.5 s | camera to 1.5× on the question, the real chip *"✓ Verified figures · fire cell-days"* and the title | `T.camHeader` |
| 19.6 to 20.4 s | **"✓ verified against data"** badge, anchored to the real chip (follows the camera and the scroll via `toScreen`) | `VerifiedBadge` |
| 20.05 to 20.45 s | camera moves to 1.25× on the panel | `T.camPanel` |
| 20.25 to 21.2 s | continuous **scroll** of 429 px of the screenshot (× scale) inside the panel; the rest stays fixed | `T.scroll` |
| 21.05 to 21.4 s | camera returns to 1.0× | `T.camAskReset` |
| 21.48 s | click on **Outlook** | `T.outlookClick` |

### Scene 4: Outlook + Peru 2026 validation (21.6 to 25.9 s)

| Time | What happens | Code |
|---|---|---|
| 21.6 to 21.95 s | cross-fade to `outlook.jpg` | `T.toOutlook` |
| 22.0 to 22.6 s | framing `{889, 545, 1.08}`, showing the *Model* box and the *"15 of 20 active departments"* line | `camOutlook` |
| 22.0 to 22.6 s | the Cusco 2027 card (1,788) is **dimmed** so it is not confused with the validation | `Dim`, `R('outlook', 92, 243, 551, 476)` |
| 22.25 to 25.3 s | card "Peru · 2026 fire season · Out of sample — the model never saw 2026" | `ForecastCard` |
| 22.55 / 23.4 / 24.2 s | "Forecast 24,392", "Observed 22,955" and **"within ~6%"** enter | `T.fForecast/fObserved/fWithin` |

Card footer: "Fire cell-days · model fitted on 2003–2025 · forecast issued 1 month ahead · 2026 observations provisional (NRT)".

### Scene 5: outro (25.3 to 29.967 s)

- 25.3 to 25.9 s: a dark-green radial background appears (`Outro`).
- 25.7 s: the original logo enters, scaling 0.94 to 1, and the name "Elis".
- 26.5 s: "From Peru. For a more resilient world."
- 27.1 s: "elis-peru.vercel.app".
- 27.3 s: attributions for NASA GIBS, FIRMS, Sentinel-2/EOX and "Opening sequence: cinematic reconstruction".
- 29.45 to 29.967 s: fade to black (`FadeBlack`).
- There is no team card.

---

## 5. The hand-off from clip 02 to the real Explore view

### Clip analysis

Frames were extracted every 0.125 s:

| Time in clip 02 | Content |
|---|---|
| 0 to 1.6 s | smoke and flames |
| ~1.6 s | synthetic heat blotches and a small synthetic box (no text) appear |
| ~2.0 s | the smoke dissolves into terrain |
| ≥ ~2.25 s | the AI-generated interface enters, with distorted text and unverified figures |
| ~4.9 s | that fake interface almost exactly matches the framing of `explore-inicial` |

### Discarded attempt

An automatic alignment with SIFT keypoints and `estimateAffinePartial2D` was tried. The transforms came out degenerate: the clip's terrain is a generated approximation, not the same map. The test script is not part of the project. Instead, frames of the clip were checked by hand against the screenshot with a 50% blend.

### Solution in code

1. Clip 02 is cut at 2.30 s and never shows the full fake interface.
2. Under the clip sits `explore-inicial`, enlarged 1.45× over the terrain (`{1215, 520}`), so the hand-off reads as "terrain over terrain".
3. The clip's opacity dissolves between 5.75 and 6.13 s (`T.handoff`).
4. During the dissolve the clip is scaled by `1 + 0.045 * ease(t, 5.3, 6.13)`: a 4.5% push-in that keeps the edges, where the fake interface peeked in, out of frame.
5. Afterward the camera opens out to 1.0× and the complete real interface appears.

### Iterations (checked with frames)

| Version | Problem found | Fix |
|---|---|---|
| first test frames | at 1.3× the framing cut off the real left panel | initial zoom 1.45× centered on the map |
| first test frames | Explore to Explore-enlarged cross-fade showed doubled text for too long | `toAmpl` shortened to 8.72 to 9.02 s |
| edge frames | at 6.00 to 6.10 s the fake sidebar showed at the left edge (from ~1.9 to 2.0 s of the clip) | 4.5% push-in and dissolve at 5.85 to 6.25 s |
| v1 (MP4) | at 6.20 s faint fake figures showed at the right edge | dissolve moved earlier, to **5.75 to 6.13 s** |

In v2, the frames at 6.03, 6.10 and 6.13 s show only the real interface at the edges ("Drop to explore", legend, "5 km").

---

## 6. The pointer

Defined in `WAYS` and in `cursorOpacity` / `cursorPress` in `ElisPitch.tsx`, following the `html-demo` guidelines:
- It arrives before the click.
- It glides in 0.5 to 0.6 s.
- It presses for 0.17 s: the arrow scales 1.15 to 0.98 with a click ring.
- It leaves the scene when the result needs to be seen.

| Visible span | Path |
|---|---|
| 8.85 to 10.3 s | enters, goes to the Compare button (click at 9.45 s), rests at (980, 640) |
| 16.65 to 19.35 s | goes to the Ask Elis button (click at 17.2 s), then to the purple question (arrives 18.25 s, click 18.55 s), then moves aside |
| 20.85 to 22.05 s | goes to the Outlook button (click at 21.48 s) |

Every click happens with the camera at 1.0×, so stage coordinates equal screen coordinates.

---

## 7. Audiovisual composition

- **Clip audio:**
  - Both `OffthreadVideo` elements use `cinematicVolume` (0.35 in `Root.tsx`).
  - Clip 02's audio fades out between 5.85 and 6.3 s (`clipVol`).
  - With `cinematicVolume: 0` they are muted. The plan is to lower it to about 0.12 to 0.2 once the narration is added.
- **Narration:**
  - `<Audio>` mounts only when `voiceSrc` is not `null`.
  - It is `null` today, so the video has no narration.
- **Subtitles:**
  - `Subtitles.tsx` shows the active `CAPTIONS` entry with 0.12 s fades.
  - There are 11 phrases with the exact text of the approved voice script (closing A), including the word "Bayesian".
  - Timings are provisional, aligned with the brief's block table.
- **Style:**
  - Colors taken from the app (`COLORS` in `assets.ts`): orange for raw, cyan for harmonized, violet for forecast, plus the dark-green background.
  - Dark glass cards (`Glass`) and Inter typography.

---

## 8. Export

1. Type check: `tsc`, no errors (`npm run typecheck`).
2. Single frames with `remotion still` at each transition, and visual review before each render.
3. Full render with `remotion render ... --codec=h264 --crf=18`: 900 frames in about 2.5 minutes on 2 cores.
4. The container came out at 30.016 s because the AAC track was longer than the video. It was trimmed with `ffmpeg -t 29.966 -c:v copy -c:a aac -b:a 192k`, without re-encoding the video.
5. ffprobe verification: video of 900 frames, 1920×1080, 30/1 fps; audio of 29.966 s; format duration **30.000 s**.
6. During development, contact sheets of frames read from the **already encoded MP4** (not from the composition) were used to review the main transitions. They are not included in the repository.

`tools/render-v2.mjs` (`npm run render:v2`) reproduces steps 3 to 5. Rendering from the converted clips used for v2 produced video frames and decoded audio identical to the v2 file.

History: v1 was rendered, reviewed with frames from the MP4, and replaced by v2. Two problems found in v1, faint figures at 6.20 s and an empty Ask Elis panel at 18.90 s, were fixed; the latter with the new `revealY` formula.

---

## 9. Known limitations of v2

- In cross-fades between screenshots with different text (≈ 8.8 s and ≈ 21.8 s), doubled text is visible for about 0.3 s.
- `explore-inicial` looks somewhat soft: it is a 1600 px screenshot scaled 1.2× and then enlarged up to 1.45×.
- Clip 02 contains, from ~1.6 s, a small synthetic box without text near the center right.
- The real Ask Elis answer contains figures outside the brief's verified table (1,787.7; 41.7%; 4.1×; ~7%). They are shown as-is, as authentic app output, without emphasis.
- `npm run render` (plain Remotion) writes `out/elis-preview.mp4` and does not trim the audio; use `npm run render:v2`.
- Installation and rendering have not been tested on Windows.
- Re-converting the clips with `prepare:clips` uses a different ffmpeg build than the original conversion, so encoded pixels can differ very slightly. A full render from clips converted this way was not run.

# ELIS 30-second pitch video: Remotion project

React + Remotion project that composes the ELIS pitch video for NASA Space Apps 2026 (challenge *Harmonization of MODIS and VIIRS Hot Spots*). The app it shows is ELIS (https://elis-peru.vercel.app).

Every frame is a pure function of a single clock (`t = frame / fps`), the `View(t)` principle of the `html-demo` approach. There is no stateful animation, so any frame can be scrubbed to, frozen, or re-rendered identically.

> **Status: final narration integrated (v3, pending team review in Studio).** Subtitles are timed word by word from the recording. See `NOTAS-PRODUCCION.md`.

## Output

| | |
|---|---|
| Composition | `ElisPitch` |
| Format | H.264 + AAC, 1920×1080, 30 fps |
| Length | 900 frames = 30.000 s (audio trimmed to 29.966 s) |
| Voice | none yet |
| Subtitles | English, always on, provisional timings |

The rendered MP4 is not stored in this repository (regenerate it with `npm run render:v2`). Origin and credits of the opening clips: `../ASSETS-AND-LICENSES.md`.

## Technologies

| Tool | Version | Use |
|---|---|---|
| Remotion (`remotion`, `@remotion/cli`) | 4.0.543 | Composition, Studio preview, MP4 render |
| React / React DOM | 19.3.1 | Scenes and overlays |
| TypeScript | 5.9.3 | Typing (`npm run typecheck`) |
| Python 3 + OpenCV + NumPy | n/a | Only for `tools/normalize.py` (already run; outputs are committed) |
| Inter font | 4 weights, OTF | Bundled in `public/fonts/` so rendering does not need the internet |

Developed with Node.js 22 and npm 10 on Linux.

## Structure

```
video-remotion/
├── package.json, package-lock.json, tsconfig.json, remotion.config.ts
├── src/
│   ├── index.ts              registerRoot
│   ├── Root.tsx              composition "ElisPitch" and default props
│   ├── ElisPitch.tsx         layers, cameras, pointer, audio
│   ├── timeline.ts           MASTER TIMELINE (T) and subtitles (CAPTIONS)
│   ├── components/           primitives.tsx, Overlays.tsx, Subtitles.tsx
│   └── lib/                  motion.ts (easing, camera, pointer), assets.ts, shots-meta.json
├── public/
│   ├── fonts/                Inter + OFL.txt
│   ├── media/                logo-elis.png, clip01.mp4, clip02.mp4 (1080p / 30 fps conversions of the opening clips)
│   ├── audio/                narration.wav + words-103.json (git-ignored, see ../ASSETS-AND-LICENSES.md)
│   ├── team/                 4 team photos (from web/public/landing/team)
│   └── shots/                6 normalized screenshots, meta.json
├── tools/
│   ├── prepare-clips.mjs     converts ../assets/videos/*.mp4 into public/media/clip01|02.mp4
│   ├── check-assets.mjs      preflight: lists any missing file the composition needs
│   ├── render-v2.mjs         reproducible render (check + render + audio trim + verify)
│   └── normalize.py          screenshots -> 1920×1080
└── NOTAS-PRODUCCION.md, PROCESO_DESARROLLO.md
```

The source screenshots and logo live one level up, in `../assets/imagenes/`.

## Installation

```bash
cd video-remotion
npm ci
```

`node_modules/` is not committed. The first render downloads the browser Remotion uses. Installation and rendering were developed and verified on Linux; they have not been tested on Windows or macOS.

## Opening clips

The 1080p / 30 fps versions the composition loads are already in `public/media/` (`clip01.mp4`, `clip02.mp4`), converted from the originals in `../assets/videos/`. To regenerate them, or to confirm nothing is missing:

```bash
npm run prepare:clips     # ../assets/videos/*.mp4 -> public/media/clip01.mp4, clip02.mp4
npm run check:assets      # confirms every required file is present
```

`prepare:clips` runs `remotion ffmpeg` with H.264 `-preset veryfast -crf 16`, AAC 192 kb/s, and `-r 30` (24 to 30 fps by duplicating frames; clip 01 is also scaled from 720p to 1080p with Lanczos). The settings match how the clips were originally converted, but a different ffmpeg build can change the encoded pixels very slightly.

## Preview

```bash
npm run dev               # Remotion Studio: play, pause, scrub, jump to any frame
npm run still -- out/f183.jpg --frame=183     # one frame, e.g. the clip-to-app hand-off at 6.10 s
```

## Rendering

```bash
npm run render:v2
# optional: REMOTION_BROWSER_EXECUTABLE=/path/to/chrome npm run render:v2
# optional: node tools/render-v2.mjs --out out/my-name.mp4
```

The script:
1. Runs the asset check and stops with instructions if anything is missing.
2. Renders with Remotion: `--codec=h264 --crf=18` (frames are JPEG quality 92, concurrency 2, set in `remotion.config.ts`).
3. Trims the audio to 29.966 s with the ffmpeg bundled in Remotion, copying the video stream unchanged, so the container is exactly 30.000 s. (Remotion's own output is 30.016 s because the AAC track runs slightly longer.)
4. Prints an ffprobe check; expected: 1920×1080, 30/1 fps, 900 video frames, duration 30.000000.

Default output is `out/elis-preview-v2-render.mp4` (git-ignored). Rendering takes about 2.5 to 3 minutes on 2 cores.

The original commands the v2 file was produced with, for reference:

```bash
npx remotion render src/index.ts ElisPitch out/raw.mp4 --codec=h264 --crf=18
ffmpeg -i out/raw.mp4 -t 29.966 -c:v copy -c:a aac -b:a 192k out/elis-preview-v2.mp4
```

`npm run render` (plain Remotion render to `out/elis-preview.mp4`) also works but does not trim the audio.

## Adjustable props (no scene edits needed)

Defaults are in `src/Root.tsx`:

| Prop | Default | Purpose |
|---|---|---|
| `cinematicVolume` | `0.15` | Volume of the clips' own audio; `0` mutes it |
| `voiceSrc` | `'audio/narration.wav'` | Path under `public/` of the narration (starts at frame 5, `VOICE_START_FRAME`) |
| `voiceVolume` | `1` | Narration volume |
| `showSubtitles` | `true` | English subtitles |
| `showReconstructionTag` | `true` | "Cinematic reconstruction" label over the recreated footage |

All animation and subtitle times are in `src/timeline.ts`.

## Open items for the final version

See `NOTAS-PRODUCCION.md`: review the preview in Studio, render the final MP4, and review the open items in `../ASSETS-AND-LICENSES.md`.

## Documentation

- `PROCESO_DESARROLLO.md`: how the video was built.
- `NOTAS-PRODUCCION.md`: status and open items.
- `../ASSETS-AND-LICENSES.md`: assets and licensing.

# Assets, credits and licensing review

This file lists every asset in this folder, where it came from, who made it, and which points still need a rights check. It describes the origin as reported by the team; it does not grant or verify any license. It is not legal advice.

## 1. Credits

| Asset | Created by | How |
|---|---|---|
| `01-incendio.mp4` (opening clip, scene 1) | Samuel | Starting from an image prepared for the project, animated with audio using Google Flow. |
| `02-transicion-elis.mp4` (transition clip, scene 2) | Valentino | Made from material of the previous scene and the ELIS interface, animated with audio using Google Flow. |
| ELIS app screenshots, logo | ELIS team | Captured from / made for the ELIS project. |
| Video composition, code, documentation | ELIS team | React + Remotion project in this folder. |

Both clips are original AI-generated material produced for this project. They were not downloaded from third-party sources. The video labels them "Cinematic reconstruction" because they are not real satellite or camera footage.

## 2. Included assets

| Asset | Location | Notes |
|---|---|---|
| Original clip 1, `01-incendio.mp4` | `assets/videos/` | 4.0 s, 1280×720, 24 fps, with audio. Unmodified original. |
| Original clip 2, `02-transicion-elis.mp4` | `assets/videos/` | 4.96 s, 1920×1080, 24 fps, with audio. Unmodified original. Only the first 2.30 s appear in the video. |
| Converted clips `clip01.mp4`, `clip02.mp4` | `video-remotion/public/media/` | 1080p / 30 fps versions the render loads. Derived from the originals; can be regenerated with `npm run prepare:clips`. |
| ELIS logo | `assets/imagenes/logo-elis.png`, `video-remotion/public/media/logo-elis.png` | Team asset. |
| 6 app screenshots | `assets/imagenes/screenshots/` | Captured from the ELIS app (the two `ask-elis-v2-*` from https://elis-peru.vercel.app on 2026-11-15). Show the Sentinel-2 cloudless 2020 basemap (see item B). |
| Normalized screenshots (1920×1080) | `video-remotion/public/shots/` | Derived from the screenshots by `tools/normalize.py`. Pixel-identical when regenerated. |
| Team photos | `video-remotion/public/team/` | Team members' own photos, copied from `web/public/landing/team/`. |
| Inter font (4 weights) | `video-remotion/public/fonts/` | SIL Open Font License 1.1, license text in `OFL.txt`. |
| Source code, scripts, config | `video-remotion/` | Repository license to be decided by the owners. |
| Music bed and sound effects | `video-remotion/public/audio/sfx/*.wav` | Own sounds, synthesized from scratch by `video-remotion/tools/make_audio.py` (sine waves and filtered noise generated with numpy). No samples, loops or third-party recordings. Same terms as the source code. |

## 3. Not included

| Asset | Reason |
|---|---|
| Narration recording | Recorded by the team (`public/audio/narration.wav`, 103 % take, and its word timings). It stays git-ignored until the team approves publishing it (only `video-remotion/public/audio/sfx/` is tracked). An optional replacement track at `public/audio/music-custom.*` is also git-ignored; whoever adds one must check its license. |
| Rendered video (`elis-preview-v2.mp4`) | Regenerate locally with `npm run render:v2`. |
| Internal production brief and voice script | Internal documents. |
| Development contact sheets | Review aids only; not needed to render. |

## 4. Open licensing considerations

**A. AI-generated clips (Google Flow).** The team created both clips with Google Flow, including their audio tracks. Ownership of, and permitted uses for, AI-generated output depend on the tool's terms of service and on the original inputs, and these terms have not been independently checked here. Scene 1 started from an image prepared for the project; the rights to that source image have not been verified in this repository. Scene 2 reuses material from scene 1 and the ELIS interface. Before wider or commercial use, review the current Google Flow terms and the status of the source image. This repository does not claim exclusive copyright over the AI-generated clips.

**B. Sentinel-2 cloudless basemap in the screenshots.** EOX publishes its 2018 to 2020 releases under CC BY-NC-SA 4.0 (attribution, non-commercial, share-alike); only 2016 is CC BY. The screenshots show the 2020 release, so the attribution in the README is required, use must be non-commercial, and derivatives should be shared under the same license. Check how this interacts with the repository's own license. Source: https://eox.at/2021/03/sentinel-2-cloudless-2020/

**C. Remotion license.** Remotion is source-available, not open source. It is free for individuals, non-profits, and for-profit teams of up to 3 people; a company license is required from 4 people, and the combined headcount of collaborating teams counts. Confirm that this team and use qualify. Source: https://www.remotion.dev/docs/license-pricing-compliance/faq

**D. Logo and screenshots.** Team-made. The Ask Elis screenshots contain a real application answer.

**E. NASA data and imagery.** NASA GIBS and FIRMS imagery is generally free to use with attribution. Attributions appear in the video outro and in the README.

**F. Third-party tooling not included.** The video was designed using principles from the `html-demo` agent skill (MengTo/Skills). Its files are not part of this folder; its license was not checked.

## 5. Narration

The approved narration text is preserved unmodified in the subtitles (`video-remotion/src/timeline.ts`). The final recording (103 % speed take, prepared by the team) is wired in `src/Root.tsx`; subtitle timings come from its word-level transcription, with the transcription's word errors corrected to the spoken script.

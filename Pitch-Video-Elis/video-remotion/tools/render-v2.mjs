#!/usr/bin/env node
// Reproducible render of the v2 preview: asset check + Remotion render + audio trim to the 30 s limit.
// Usage (from video-remotion/):  npm run render:v2   (or: node tools/render-v2.mjs [--out out/elis-preview-v2-render.mp4])
// Optional: REMOTION_BROWSER_EXECUTABLE=/path/to/chrome to use a specific Chromium.
//
// Same settings used for out/elis-preview-v2.mp4:
//   1) npx remotion render src/index.ts ElisPitch <raw> --codec=h264 --crf=18
//   2) ffmpeg -i <raw> -t 29.966 -c:v copy -c:a aac -b:a 192k <out>
// Step 2 uses the ffmpeg bundled with Remotion (`npx remotion ffmpeg`), so no system ffmpeg is needed.
// The default output name is different from the existing MP4 so it is never overwritten.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argOut = process.argv.indexOf('--out');
const out = argOut > -1 ? process.argv[argOut + 1] : 'out/elis-preview-v2-render.mp4';
const raw = 'out/.render-raw.mp4';
const TRIM_SECONDS = '29.966'; // 899 frames @30 fps ≈ 29.967 s; keeps the container at exactly 30.000 s

const run = (args) => {
  console.log('\n> npx ' + args.join(' '));
  const r = spawnSync('npx', args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`\nFailed (exit ${r.status}).`);
    process.exit(r.status ?? 1);
  }
};

// Preflight: fail early, with instructions, if any required asset (e.g. the cinematic clips) is missing.
const check = spawnSync(process.execPath, [join(root, 'tools/check-assets.mjs')], { cwd: root, stdio: 'inherit' });
if (check.status !== 0) process.exit(check.status ?? 1);

mkdirSync(join(root, 'out'), { recursive: true });

const renderArgs = ['remotion', 'render', 'src/index.ts', 'ElisPitch', raw, '--codec=h264', '--crf=18'];
if (process.env.REMOTION_BROWSER_EXECUTABLE) renderArgs.push(`--browser-executable=${process.env.REMOTION_BROWSER_EXECUTABLE}`);
run(renderArgs);

run(['remotion', 'ffmpeg', '-v', 'error', '-y', '-i', raw, '-t', TRIM_SECONDS, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', out]);
if (existsSync(join(root, raw))) rmSync(join(root, raw));

run(['remotion', 'ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate,nb_frames', '-of', 'compact', out]);
console.log(`\nDone: ${out}  (expected: 1920x1080, 30/1 fps, 900 video frames, duration 30.000000)`);

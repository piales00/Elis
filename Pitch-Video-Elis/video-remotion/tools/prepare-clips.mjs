#!/usr/bin/env node
// Converts the two original cinematic clips into the 1080p / 30 fps versions the composition expects.
//
//   ../assets/videos/01-incendio.mp4        -> public/media/clip01.mp4  (720p -> 1080p, 24 -> 30 fps)
//   ../assets/videos/02-transicion-elis.mp4 -> public/media/clip02.mp4  (24 -> 30 fps)
//
// Both the originals and the converted outputs are committed; run this only to regenerate the conversions:
//   npm run prepare:clips
// Frame-rate conversion duplicates frames; it does not interpolate. Uses the ffmpeg bundled with Remotion.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jobs = [
  { src: '../assets/videos/01-incendio.mp4', out: 'public/media/clip01.mp4', vf: 'scale=1920:1080:flags=lanczos' },
  { src: '../assets/videos/02-transicion-elis.mp4', out: 'public/media/clip02.mp4', vf: null },
];

const missing = jobs.filter((j) => !existsSync(join(root, j.src)));
if (missing.length) {
  console.error('Missing source clip(s):\n' + missing.map((j) => '  - ' + j.src.replace('../', '')).join('\n'));
  console.error('\nSee assets/videos/README.md.');
  process.exit(1);
}

mkdirSync(join(root, 'public/media'), { recursive: true });
for (const j of jobs) {
  // '-r 30' converts 24 -> 30 fps by duplicating frames (the ffmpeg bundled with Remotion has no 'fps' filter).
  const args = ['remotion', 'ffmpeg', '-v', 'error', '-y', '-i', j.src, ...(j.vf ? ['-vf', j.vf] : []), '-r', '30',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', j.out];
  console.log('> npx ' + args.join(' '));
  const r = spawnSync('npx', args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log('\nDone: public/media/clip01.mp4 and public/media/clip02.mp4');

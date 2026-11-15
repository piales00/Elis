#!/usr/bin/env node
// Preflight check: confirms every file the composition loads exists before a render starts.
// Exit code 0 = all present, 1 = something is missing (with instructions).

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const shots = Object.keys(require(join(root, 'src/lib/shots-meta.json'))).map((n) => `public/shots/${n}.png`);

const required = [
  'public/media/clip01.mp4',
  'public/media/clip02.mp4',
  'public/media/logo-elis.png',
  'public/shots/ask-strip.png',
  ...shots,
  ...['Regular', 'Medium', 'SemiBold', 'Bold'].map((w) => `public/fonts/Inter-${w}.otf`),
];

const missing = required.filter((p) => !existsSync(join(root, p)));
if (missing.length === 0) {
  console.log(`Asset check passed (${required.length} files).`);
  process.exit(0);
}

console.error('Asset check failed. Missing files:\n' + missing.map((p) => '  - ' + p).join('\n'));
if (missing.some((p) => p.startsWith('public/media/clip'))) {
  console.error(
    '\nThe converted opening clips are missing. Make sure the originals are at:\n  assets/videos/01-incendio.mp4\n  assets/videos/02-transicion-elis.mp4\n' +
      'then run:  npm run prepare:clips\n(see ../assets/videos/README.md and ../ASSETS-AND-LICENSES.md)',
  );
}
if (missing.some((p) => p.startsWith('public/shots/'))) {
  console.error('\nNormalized screenshots can be regenerated with tools/normalize.py and tools/ask_strip.py (see README).');
}
process.exit(1);

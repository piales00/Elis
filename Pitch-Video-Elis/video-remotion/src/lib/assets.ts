import meta from './shots-meta.json';
import strip from './ask-strip.json';

export type ShotName = keyof typeof meta;

/** The authentic screenshots, cover-scaled and centre-cropped to 1920 × 1080 (tools/normalize.py). */
export const shot = (name: ShotName) => `shots/${name}.png`;

/** Convert a pixel in the ORIGINAL screenshot to the normalized 1920 × 1080 stage. */
export const N = (name: ShotName, x: number, y: number): [number, number] => {
  const m = meta[name];
  return [x * m.s - m.ox, y * m.s - m.oy];
};

/** Convert a rectangle [x0, y0, x1, y1] in the original screenshot to stage {left, top, width, height}. */
export const R = (name: ShotName, x0: number, y0: number, x1: number, y1: number) => {
  const [l, t] = N(name, x0, y0);
  const [r, b] = N(name, x1, y1);
  return { left: l, top: t, width: r - l, height: b - t };
};

export const scaleOf = (name: ShotName) => meta[name].s;

/** Ask Elis answer strip (tools/ask_strip.py): ask-02 content on top, ask-03 below, matched on their overlap. */
export const ASK_STRIP = strip as {
  x0: number; top: number; bot: number; w: number; h: number; d: number; src: ShotName;
};

export const COLORS = {
  bg: '#07100d',
  panel: 'rgb(15,27,22)',
  ink: '#eef5f1',
  muted: '#9fb3aa',
  raw: '#f2994a', // app: raw / naive (orange)
  modis: '#f2b84b',
  viirs: '#4fd1a5',
  harmonized: '#5cc8e8', // app: harmonized (cyan)
  forecast: '#b794f6', // app: forecast (violet)
  red: '#ff5b4d',
  green: '#4ade80',
};

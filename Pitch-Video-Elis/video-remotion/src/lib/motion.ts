import { spring } from 'remotion';
// Every frame is a pure function of one clock, t (seconds). No state, no timers.
// Same idea as html-demo's View({ t }), applied to a 1920 × 1080 video stage.

export const W = 1920;
export const H = 1080;

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const mix = (a: number, b: number, p: number) => a + (b - a) * p;

export const easeInOut = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
// Approximates cubic-bezier(0.55, 0, 0.25, 1), the pointer glide from html-demo.
export const glideEase = (x: number) =>
  x < 0.45 ? 0.5 * Math.pow(x / 0.45, 2.4) : 0.5 + 0.5 * easeOut((x - 0.45) / 0.55);

/** 0 → 1 between a and b, eased. */
export const ease = (t: number, a: number, b: number, fn = easeInOut) =>
  fn(clamp((t - a) / (b - a)));

/** Fade in over [a, a+fi], hold, fade out over [b-fo, b]. */
export const vis = (t: number, a: number, b: number, fi = 0.25, fo = 0.25) =>
  Math.min(fi > 0 ? clamp((t - a) / fi) : t >= a ? 1 : 0, fo > 0 ? clamp((b - t) / fo) : t < b ? 1 : 0);

// ---------- camera ----------
export type Cam = { cx: number; cy: number; z: number };
export type Move = { from: number; to: number; cam: Cam };

/** Clamp so the stage never shows past its own edges. */
export const clampCam = (c: Cam): Cam => {
  const z = Math.max(1, c.z);
  const hx = W / 2 / z;
  const hy = H / 2 / z;
  return { z, cx: clamp(c.cx, hx, W - hx), cy: clamp(c.cy, hy, H - hy) };
};

export const camAt = (t: number, start: Cam, moves: Move[]): Cam => {
  let cur = clampCam(start);
  for (const m of moves) {
    const target = clampCam(m.cam);
    if (t >= m.to) {
      cur = target;
      continue;
    }
    if (t > m.from) {
      const p = ease(t, m.from, m.to);
      return { cx: mix(cur.cx, target.cx, p), cy: mix(cur.cy, target.cy, p), z: mix(cur.z, target.z, p) };
    }
    return cur;
  }
  return cur;
};

export const camTransform = (c: Cam) =>
  `translate(${W / 2 - c.cx * c.z}px, ${H / 2 - c.cy * c.z}px) scale(${c.z})`;

export const toScreen = (c: Cam, x: number, y: number): [number, number] => [
  W / 2 + (x - c.cx) * c.z,
  H / 2 + (y - c.cy) * c.z,
];

export const IDENT: Cam = { cx: W / 2, cy: H / 2, z: 1 };

// ---------- pointer ----------
export type Way = { at: number; x: number; y: number; dur?: number };

/** Pointer position: glides from one waypoint to the next, arriving at `at`. */
export const glide = (t: number, ways: Way[]): [number, number] => {
  let [x, y] = [ways[0].x, ways[0].y];
  for (let i = 1; i < ways.length; i++) {
    const w = ways[i];
    const d = w.dur ?? 0.6;
    if (t >= w.at) {
      [x, y] = [w.x, w.y];
      continue;
    }
    if (t > w.at - d) {
      const p = glideEase(clamp((t - (w.at - d)) / d));
      return [mix(x, w.x, p), mix(y, w.y, p)];
    }
    return [x, y];
  }
  return [x, y];
};

/** 0 → 1 → 0 press curve for a click at `at` lasting `len`. */
export const press = (t: number, at: number, len = 0.17) =>
  t < at || t > at + len ? 0 : Math.sin(((t - at) / len) * Math.PI);

/** Spring 0 → 1 starting at `at` (seconds). damping 200 = no overshoot; lower = a soft overshoot. */
export const spr = (t: number, at: number, damping = 200, stiffness = 100) =>
  t <= at ? 0 : spring({ frame: (t - at) * 30, fps: 30, config: { damping, stiffness, mass: 1 } });

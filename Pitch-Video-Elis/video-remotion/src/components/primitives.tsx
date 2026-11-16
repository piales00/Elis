import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { Cam, camTransform, W, H } from '../lib/motion';
import { COLORS } from '../lib/assets';

/** One authentic screenshot on the fixed stage, seen through a camera. Children use stage (image) coordinates. */
export const Shot: React.FC<{
  src: string;
  cam: Cam;
  opacity?: number;
  filter?: string;
  children?: React.ReactNode;
}> = ({ src, cam, opacity = 1, filter, children }) => {
  if (opacity <= 0.001) return null;
  return (
    <AbsoluteFill style={{ opacity, overflow: 'hidden', filter }}>
      <div style={{ position: 'absolute', width: W, height: H, transformOrigin: '0 0', transform: camTransform(cam) }}>
        <Img src={staticFile(src)} style={{ position: 'absolute', width: W, height: H }} />
        {children}
      </div>
    </AbsoluteFill>
  );
};

/** Highlight frame drawn in image coordinates (moves with the camera). */
export const Highlight: React.FC<{
  box: { left: number; top: number; width: number; height: number };
  opacity: number;
  color?: string;
  pad?: number;
  fill?: string;
}> = ({ box, opacity, color = COLORS.harmonized, pad = 6, fill }) =>
  opacity <= 0.001 ? null : (
    <div
      style={{
        position: 'absolute',
        left: box.left - pad,
        top: box.top - pad,
        width: box.width + pad * 2,
        height: box.height + pad * 2,
        borderRadius: 10,
        border: `2px solid ${color}`,
        boxShadow: `0 0 0 4px ${color}33, 0 0 28px ${color}55`,
        background: fill,
        opacity,
      }}
    />
  );

/** Dim (and optionally blur) a region (image coordinates). */
export const Dim: React.FC<{ box: { left: number; top: number; width: number; height: number }; opacity: number; blur?: number; radius?: number; strength?: number }> = ({
  box,
  opacity,
  blur = 0,
  radius = 12,
  strength = 0.72,
}) =>
  opacity <= 0.001 ? null : (
    <div style={{ position: 'absolute', ...box, borderRadius: radius, background: `rgba(7,16,13,${strength * opacity})`, backdropFilter: blur ? `blur(${blur * opacity}px)` : undefined }} />
  );

/** Scripted pointer (screen coordinates). Arrow scale 1.0 → 0.9 while pressed. */
export const Cursor: React.FC<{ x: number; y: number; opacity: number; pressed: number }> = ({ x, y, opacity, pressed }) =>
  opacity <= 0.001 ? null : (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        opacity,
        transform: `translate(-3px,-2px) scale(${1.15 - 0.17 * pressed})`,
        transformOrigin: '3px 2px',
        filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.55))',
      }}
    >
      {pressed > 0.01 && (
        <div
          style={{
            position: 'absolute',
            left: -22 + 3,
            top: -22 + 2,
            width: 44,
            height: 44,
            borderRadius: 22,
            border: '2px solid rgba(255,255,255,0.8)',
            opacity: pressed,
            transform: `scale(${0.6 + 0.6 * pressed})`,
          }}
        />
      )}
      <svg width="30" height="38" viewBox="0 0 30 38">
        <path d="M3 2 L3 30 L10 24 L15 35 L20 33 L15 22 L25 22 Z" fill="#fff" stroke="#111" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  );

/** Dark glass card used for every on-screen label. */
export const Glass: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div
    style={{
      background: 'rgba(8,18,15,0.84)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 16,
      boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
      color: COLORS.ink,
      ...style,
    }}
  >
    {children}
  </div>
);

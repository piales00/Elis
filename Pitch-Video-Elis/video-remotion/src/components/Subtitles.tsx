import React from 'react';
import { CAPTIONS } from '../timeline';
import { vis } from '../lib/motion';

/** English subtitles, always on. Times come from CAPTIONS (to be re-derived from the real voice track). */
export const Subtitles: React.FC<{ t: number }> = ({ t }) => {
  const cue = CAPTIONS.find((c) => t >= c.from && t < c.to);
  if (!cue) return null;
  const o = vis(t, cue.from, cue.to, 0.12, 0.12);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 58, display: 'flex', justifyContent: 'center', opacity: o }}>
      <div
        style={{
          maxWidth: 1500,
          padding: '12px 26px',
          borderRadius: 12,
          background: 'rgba(4,9,7,0.68)',
          color: '#fff',
          fontSize: 42,
          fontWeight: 600,
          lineHeight: 1.25,
          letterSpacing: -0.2,
          textAlign: 'center',
          textShadow: '0 2px 6px rgba(0,0,0,0.6)',
        }}
      >
        {cue.text}
      </div>
    </div>
  );
};

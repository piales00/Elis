import React from 'react';
import { CAPTIONS } from '../timeline';
import { clamp, vis } from '../lib/motion';

/** English subtitles, always on, timed word by word from the narration. The word being spoken is
 *  lightly highlighted; words already spoken stay white, upcoming words are slightly dimmed. */
export const Subtitles: React.FC<{ t: number }> = ({ t }) => {
  const cue = CAPTIONS.find((c) => t >= c.from && t < c.to);
  if (!cue) return null;
  const o = vis(t, cue.from, cue.to, 0.12, 0.12);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 58, display: 'flex', justifyContent: 'center', opacity: o }}>
      <div
        style={{
          maxWidth: 1120,
          padding: '12px 26px',
          borderRadius: 12,
          background: 'rgba(4,9,7,0.70)',
          color: '#fff',
          fontSize: 44,
          fontWeight: 600,
          lineHeight: 1.25,
          letterSpacing: -0.2,
          textAlign: 'center',
          textWrap: 'balance',
          textShadow: '0 2px 6px rgba(0,0,0,0.6)',
        }}
      >
        {cue.words.map((wd, i) => {
          const active = t >= wd.s && t < wd.e + 0.04;
          const heard = clamp((t - wd.s) / 0.08);
          return (
            <React.Fragment key={i}>
              {i > 0 && ' '}
              <span style={{ color: active ? '#ffd7a8' : `rgba(255,255,255,${0.72 + 0.28 * heard})` }}>{wd.w}</span>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

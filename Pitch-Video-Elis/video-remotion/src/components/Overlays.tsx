import React from 'react';
import { T } from '../timeline';
import { COLORS } from '../lib/assets';
import { clamp, ease, easeOut, mix, vis } from '../lib/motion';
import { Glass } from './primitives';

const small: React.CSSProperties = { fontSize: 18, letterSpacing: 2.2, textTransform: 'uppercase', color: COLORS.muted, fontWeight: 600 };

// ---------- Scene 1 labels ----------
export const OpeningLabels: React.FC<{ t: number; showTag: boolean }> = ({ t, showTag }) => {
  const o = vis(t, T.placeTitle[0], T.placeTitle[1], 0.5, 0.45);
  const y = mix(14, 0, ease(t, T.placeTitle[0], T.placeTitle[0] + 0.7, easeOut));
  const tag = showTag ? vis(t, T.reconTag[0], T.reconTag[1], 0.4, 0.3) : 0;
  return (
    <>
      {o > 0 && (
        <div style={{ position: 'absolute', left: 96, top: 92, opacity: o, transform: `translateY(${y}px)` }}>
          <div style={{ ...small, color: '#ffd7a8', fontSize: 20 }}>Cusco · Peru</div>
          <div style={{ fontSize: 64, fontWeight: 700, color: '#fff', letterSpacing: -1, textShadow: '0 4px 24px rgba(0,0,0,0.6)' }}>
            Machu Picchu · Aug 2026
          </div>
        </div>
      )}
      {tag > 0 && (
        <div style={{ position: 'absolute', right: 40, top: 36, opacity: tag * 0.9, display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderRadius: 999, background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.88)', fontSize: 19, fontWeight: 500 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: '#ffb366' }} />
          Cinematic reconstruction
        </div>
      )}
    </>
  );
};

// ---------- Scene 2: 334 % → 3.8 % ----------
export const ErrorFigure: React.FC<{ t: number }> = ({ t }) => {
  const a = vis(t, T.n334[0], T.n334[1], 0.35, 0.4);
  const b = vis(t, T.n38[0], T.n38[1], 0.4, 0.3);
  const panel = Math.max(a, b);
  if (panel <= 0) return null;
  const pop = 0.86 + 0.14 * ease(t, T.n334[0], T.n334[0] + 0.55, easeOut);
  const out = ease(t, T.n334[1] - 0.4, T.n334[1]);
  const inB = ease(t, T.n38[0], T.n38[0] + 0.45, easeOut);
  return (
    <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 760, opacity: panel, background: 'linear-gradient(90deg, rgba(7,16,13,0) 0%, rgba(7,16,13,0.88) 22%, rgba(7,16,13,0.94) 100%)' }}>
      <div style={{ position: 'absolute', left: 190, top: 330, width: 540 }}>
        <div style={{ position: 'relative', height: 220 }}>
          <div style={{ position: 'absolute', opacity: a * (1 - out), transform: `translateY(${-30 * out}px) scale(${pop})`, transformOrigin: 'left center' }}>
            <div style={{ ...small, color: COLORS.raw }}>Naive sum · MODIS + VIIRS</div>
            <div style={{ fontSize: 168, fontWeight: 800, color: COLORS.red, letterSpacing: -6, lineHeight: 1.05 }}>334%</div>
          </div>
          <div style={{ position: 'absolute', opacity: b * inB, transform: `translateY(${30 * (1 - inB)}px)` }}>
            <div style={{ ...small, color: COLORS.harmonized }}>Elis · harmonized</div>
            <div style={{ fontSize: 168, fontWeight: 800, color: COLORS.green, letterSpacing: -6, lineHeight: 1.05 }}>3.8%</div>
          </div>
        </div>
        <div style={{ marginTop: 18, fontSize: 24, color: COLORS.muted, lineHeight: 1.4 }}>
          Annual error · Peru · held-out years 2021–2024
          <br />
          Unit: fire cell-days (cells of about 11 km)
        </div>
      </div>
    </div>
  );
};

// ---------- Scene 2: capture–recapture schematic (no data) ----------
export const Schematic: React.FC<{ t: number }> = ({ t }) => {
  const [s0, s1] = T.schematic;
  const o = vis(t, s0, s1, 0.35, 0.4);
  if (o <= 0) return null;
  const c1 = ease(t, s0 + 0.2, s0 + 0.75, easeOut);
  const c2 = ease(t, s0 + 0.45, s0 + 1.0, easeOut);
  const ov = ease(t, s0 + 0.9, s0 + 1.4);
  const chips = ease(t, T.schemChips, T.schemChips + 0.5, easeOut);
  const miss = ease(t, T.missedRing, T.missedRing + 0.6, easeOut);
  const cx = 960, cy = 470, r = 190, gap = 120;
  const dash = 2 * Math.PI * 380;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o, background: 'rgba(5,12,10,0.86)' }}>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <ellipse cx={cx} cy={cy} rx={430} ry={330} fill="none" stroke={COLORS.forecast} strokeWidth={3} strokeDasharray="14 12"
          strokeDashoffset={dash * (1 - miss)} opacity={miss} />
        <circle cx={cx - gap} cy={cy} r={r * c1} fill={`${COLORS.modis}2e`} stroke={COLORS.modis} strokeWidth={3} />
        <circle cx={cx + gap} cy={cy} r={r * c2} fill={`${COLORS.viirs}2e`} stroke={COLORS.viirs} strokeWidth={3} />
      </svg>
      <div style={{ position: 'absolute', left: cx - gap - r - 240, top: cy - 30, width: 210, textAlign: 'center', opacity: c1, fontSize: 30, fontWeight: 700, color: COLORS.modis }}>
        MODIS<div style={{ fontSize: 20, fontWeight: 500, color: COLORS.muted }}>Aqua · 1 km</div>
      </div>
      <div style={{ position: 'absolute', left: cx + gap + r + 30, top: cy - 30, width: 210, textAlign: 'center', opacity: c2, fontSize: 30, fontWeight: 700, color: COLORS.viirs }}>
        VIIRS<div style={{ fontSize: 20, fontWeight: 500, color: COLORS.muted }}>S-NPP · 375 m</div>
      </div>
      <div style={{ position: 'absolute', left: cx - 70, top: cy - 22, width: 140, textAlign: 'center', opacity: ov, fontSize: 21, fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>
        seen by<br />both
      </div>
      <div style={{ position: 'absolute', left: cx - 360, top: cy - 330 - 52, width: 720, textAlign: 'center', opacity: miss, fontSize: 24, fontWeight: 600, color: COLORS.forecast }}>
        Estimated total — including fire both missed
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: cy + 360, display: 'flex', justifyContent: 'center', gap: 16, opacity: chips, transform: `translateY(${12 * (1 - chips)}px)` }}>
        {['Capture–recapture (Chapman)', 'Simultaneous overpasses', '90% range'].map((c) => (
          <div key={c} style={{ padding: '10px 20px', borderRadius: 999, border: `1px solid ${COLORS.harmonized}88`, background: `${COLORS.harmonized}1a`, color: COLORS.ink, fontSize: 24, fontWeight: 600 }}>
            {c}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', right: 56, top: 40, fontSize: 17, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
        Schematic · not data
      </div>
    </div>
  );
};

// ---------- Scene 3: verified badge ----------
export const VerifiedBadge: React.FC<{ t: number; x: number; y: number }> = ({ t, x, y }) => {
  const o = vis(t, T.verified[0], T.verified[1], 0.3, 0.3);
  if (o <= 0) return null;
  const k = ease(t, T.verified[0], T.verified[0] + 0.4, easeOut);
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity: o, transform: `translateX(${16 * (1 - k)}px)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderRadius: 999, background: 'rgba(8,30,20,0.92)', border: `2px solid ${COLORS.green}`, color: COLORS.green, fontSize: 28, fontWeight: 700, boxShadow: `0 0 30px ${COLORS.green}44` }}>
        ✓ verified against NASA FIRMS
      </div>
    </div>
  );
};

// ---------- Scene 4: Peru 2026 out-of-sample card ----------
export const ForecastCard: React.FC<{ t: number }> = ({ t }) => {
  const o = vis(t, T.card[0], T.card[1], 0.4, 0.3);
  if (o <= 0) return null;
  const row = (at: number) => ease(t, at, at + 0.45, easeOut);
  const r1 = row(T.fForecast), r2 = row(T.fObserved), r3 = row(T.fWithin);
  const line = (label: string, value: string, color: string, k: number) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '14px 0', borderTop: '1px solid rgba(255,255,255,0.08)', opacity: k, transform: `translateY(${10 * (1 - k)}px)` }}>
      <span style={{ fontSize: 30, color: COLORS.muted, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 58, fontWeight: 800, color, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
  return (
    <Glass style={{ position: 'absolute', right: 70, top: 420, width: 620, padding: '30px 36px', opacity: o, background: 'rgba(8,18,15,0.94)' }}>
      <div style={small}>Peru · 2026 fire season</div>
      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6, marginBottom: 12 }}>Out of sample — the model never saw 2026</div>
      {line('Forecast', '24,392', COLORS.forecast, r1)}
      {line('Observed', '22,955', COLORS.harmonized, r2)}
      <div style={{ marginTop: 10, padding: '16px 0 6px', borderTop: '1px solid rgba(255,255,255,0.08)', opacity: r3, transform: `scale(${0.94 + 0.06 * r3})`, transformOrigin: 'left center' }}>
        <span style={{ fontSize: 64, fontWeight: 800, color: COLORS.green, letterSpacing: -1.5 }}>within ~6%</span>
      </div>
      <div style={{ marginTop: 12, fontSize: 19, color: COLORS.muted, lineHeight: 1.45, opacity: r1 }}>
        Fire cell-days · model fitted on 2003–2025 · forecast issued 1 month ahead · 2026 observations provisional (NRT)
      </div>
    </Glass>
  );
};

export const FadeBlack: React.FC<{ t: number }> = ({ t }) => {
  const o = clamp((t - T.fadeBlack[0]) / (T.fadeBlack[1] - T.fadeBlack[0]));
  return o > 0 ? <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: o }} /> : null;
};

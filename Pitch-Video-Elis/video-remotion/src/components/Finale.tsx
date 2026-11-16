import React from 'react';
import { Img, staticFile } from 'remotion';
import { F_PHOTO_STEP, T } from '../timeline';
import { COLORS } from '../lib/assets';
import { ease, easeOut, mix, spr } from '../lib/motion';

const WARM = '#ffd7a8';
const LOGO = { x: 960, y: 250, ring: 132 };
const PHOTO = 150;

const TEAM = [
  { photo: 'team/piero.jpg', name: 'Piero Pérez', title: 'AI & Backend Engineer', focus: 'Statistical methods', x: 610, y: 352 },
  { photo: 'team/jossep.jpg', name: 'Jossep Hurtado', title: 'Data Engineer', focus: 'Public API', x: 1310, y: 352 },
  { photo: 'team/samuel.jpg', name: 'Samuel Ortega', title: 'Frontend Engineer', focus: 'Motion design', x: 270, y: 215 },
  { photo: 'team/valentino.jpg', name: 'Valentino Llamocca', title: 'AI Engineer', focus: 'Conversational assistant', x: 1650, y: 215 },
];

/** Closing scene: the Elis logo with the four team members around it, then tagline, URL and credits. */
export const Finale: React.FC<{ t: number }> = ({ t }) => {
  const bg = ease(t, T.finale, T.finale + 0.35);
  if (bg <= 0) return null;
  const logo = spr(t, T.fLogo, 16, 90);
  const logoO = ease(t, T.fLogo, T.fLogo + 0.35);
  const ring = spr(t, T.fLogo + 0.12, 200, 60);
  const label = spr(t, T.fLabel);
  const lift = mix(84, 0, ease(t, T.fLift[0], T.fLift[1]));
  const pk = spr(t, T.phrase);
  const uk = spr(t, T.url, 18, 110);
  const ukO = ease(t, T.url, T.url + 0.3);
  const ak = ease(t, T.attrib, T.attrib + 0.5, easeOut);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: bg, background: 'radial-gradient(ellipse at 50% 34%, #10251d 0%, #07100d 62%, #040907 100%)' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translateY(${lift}px)` }}>
        <div style={{ position: 'absolute', left: LOGO.x - 330, top: LOGO.y - 330, width: 660, height: 660, borderRadius: 330, opacity: 0.9 * logoO, background: 'radial-gradient(circle, rgba(242,153,74,0.20) 0%, rgba(242,153,74,0.07) 38%, rgba(242,153,74,0) 68%)' }} />
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          <circle cx={LOGO.x} cy={LOGO.y} r={LOGO.ring * (0.82 + 0.18 * ring)} fill="rgba(4,9,7,0.35)" stroke={WARM} strokeOpacity={0.42 * ring} strokeWidth={1.5} />
          {TEAM.map((m, i) => {
            const k = spr(t, T.fPhotos + i * F_PHOTO_STEP - 0.06, 200, 70);
            const dx = LOGO.x - m.x, dy = LOGO.y - m.y;
            const len = Math.hypot(dx, dy);
            const ux = dx / len, uy = dy / len;
            const x0 = m.x + ux * (PHOTO / 2 + 12), y0 = m.y + uy * (PHOTO / 2 + 12);
            const x1 = LOGO.x - ux * (LOGO.ring + 10), y1 = LOGO.y - uy * (LOGO.ring + 10);
            return (
              <g key={m.name} opacity={k}>
                <line x1={x0} y1={y0} x2={mix(x0, x1, k)} y2={mix(y0, y1, k)} stroke={WARM} strokeOpacity={0.3} strokeWidth={1.25} />
                <circle cx={x1} cy={y1} r={3} fill={WARM} fillOpacity={0.75 * ease(k, 0.8, 1)} />
              </g>
            );
          })}
        </svg>
        <Img src={staticFile('media/logo-elis.png')} style={{ position: 'absolute', left: LOGO.x - 150, top: LOGO.y - 150, width: 300, height: 300, opacity: logoO, transform: `scale(${0.8 + 0.2 * logo})` }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 392, textAlign: 'center', fontSize: 68, fontWeight: 800, letterSpacing: -1.5, color: '#fff', opacity: logoO, transform: `translateY(${10 * (1 - logo)}px)` }}>
          Elis
        </div>
        {TEAM.map((m, i) => {
          const at = T.fPhotos + i * F_PHOTO_STEP;
          const k = spr(t, at, 15, 120);
          const o = ease(t, at, at + 0.25);
          const txt = spr(t, at + 0.1);
          return (
            <div key={m.name} style={{ position: 'absolute', left: m.x - 170, top: m.y - PHOTO / 2, width: 340, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Img src={staticFile(m.photo)} style={{ width: PHOTO, height: PHOTO, borderRadius: PHOTO / 2, objectFit: 'cover', border: '2px solid rgba(255,215,168,0.55)', boxShadow: '0 12px 36px rgba(0,0,0,0.55)', opacity: o, transform: `scale(${0.7 + 0.3 * k})` }} />
              <div style={{ opacity: txt, transform: `translateY(${10 * (1 - txt)}px)`, textAlign: 'center', whiteSpace: 'nowrap' }}>
                <div style={{ marginTop: 16, fontSize: 30, fontWeight: 700, color: '#fff', letterSpacing: -0.3 }}>{m.name}</div>
                <div style={{ marginTop: 5, fontSize: 21, fontWeight: 600, color: '#d6e6de' }}>{m.title}</div>
                <div style={{ marginTop: 2, fontSize: 20, fontWeight: 500, color: COLORS.muted }}>{m.focus}</div>
              </div>
            </div>
          );
        })}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 578, textAlign: 'center', fontSize: 19, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', color: WARM, opacity: 0.85 * label, transform: `translateY(${8 * (1 - label)}px)` }}>
          Team Log N + 1 · Peru · NASA Space Apps 2026
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 642, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ fontSize: 38, fontWeight: 500, color: '#eef5f1', opacity: pk, transform: `translateY(${12 * (1 - pk)}px)` }}>
          From Peru. For a more resilient world.
        </div>
        <div style={{ marginTop: 24, padding: '12px 34px', borderRadius: 999, border: `1.5px solid ${COLORS.harmonized}`, background: `${COLORS.harmonized}1f`, boxShadow: `0 0 36px ${COLORS.harmonized}33`, color: '#fff', fontSize: 38, fontWeight: 700, letterSpacing: 0.2, opacity: ukO, transform: `scale(${0.92 + 0.08 * uk})` }}>
          elis-peru.vercel.app
        </div>
        <div style={{ marginTop: 28, fontSize: 17, color: 'rgba(214,230,222,0.62)', lineHeight: 1.5, textAlign: 'center', opacity: ak }}>
          Satellite imagery: NASA GIBS / Worldview — VIIRS (NOAA-20) Corrected Reflectance and Thermal Anomalies.
          <br />
          Fire data: NASA FIRMS (MODIS &amp; VIIRS). 3D basemap: Sentinel-2 cloudless – s2maps.eu by EOX IT Services GmbH
          <br />
          (Contains modified Copernicus Sentinel data 2020). Opening sequence: cinematic reconstruction.
        </div>
      </div>
    </div>
  );
};

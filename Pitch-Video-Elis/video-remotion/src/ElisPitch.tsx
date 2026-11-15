import React from 'react';
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig, continueRender, delayRender } from 'remotion';
import { T } from './timeline';
import { ASK_STRIP, COLORS, N, R, scaleOf, shot } from './lib/assets';
import { Cam, IDENT, camAt, clamp, ease, glide, press, toScreen, vis } from './lib/motion';
import { Cursor, Dim, Highlight, Shot } from './components/primitives';
import { ErrorFigure, FadeBlack, ForecastCard, OpeningLabels, Outro, Schematic, VerifiedBadge } from './components/Overlays';
import { Subtitles } from './components/Subtitles';

// ---- fonts (bundled Inter, so the render never depends on the network) ----
const fontHandle = typeof document !== 'undefined' ? delayRender('Inter') : null;
if (typeof document !== 'undefined') {
  Promise.all(
    [['Regular', 400], ['Medium', 500], ['SemiBold', 600], ['Bold', 700], ['Bold', 800]].map(([f, w]) =>
      new FontFace('ElisInter', `url(${staticFile(`fonts/Inter-${f}.otf`)})`, { weight: String(w) })
        .load()
        .then((ff) => (document.fonts as unknown as { add: (f: FontFace) => void }).add(ff))
    )
  ).then(() => fontHandle !== null && continueRender(fontHandle));
}

export type ElisProps = {
  /** Level of the original clips' own sound (0 = muted). Kept low so the voice leads. */
  cinematicVolume: number;
  /** Path under public/, e.g. "audio/narration.m4a". null until the recording exists. */
  voiceSrc: string | null;
  voiceVolume: number;
  showSubtitles: boolean;
  showReconstructionTag: boolean;
};

// ---- cameras (stage coordinates of each normalized screenshot) ----
const ROWS = R('explore-inicial', 86, 308, 408, 368); // "What each sensor saw": MODIS / VIIRS rows
const camExplore = (t: number): Cam =>
  camAt(t, { cx: 1215, cy: 520, z: 1.45 }, [
    { from: T.estab[0], to: T.estab[1], cam: IDENT },
    { from: T.rowsIn[0], to: T.rowsIn[1], cam: { cx: ROWS.left + ROWS.width / 2, cy: ROWS.top + ROWS.height / 2, z: 1.8 } },
    { from: T.pullBack[0], to: T.pullBack[1], cam: IDENT },
  ]);
const camAmpl = (t: number): Cam => ({ cx: 960, cy: 540, z: 1 + 0.08 * (1 - ease(t, T.toAmpl[0], T.toAmpl[1] + 0.4)) });

const [ctx, cty] = N('compare', 365, 495);
const [cbx, cby] = N('compare', 365, 830);
const camCompare = (t: number): Cam =>
  camAt(t, IDENT, [
    { from: T.camTop[0], to: T.camTop[1], cam: { cx: ctx, cy: cty, z: 1.6 } },
    { from: T.camBottom[0], to: T.camBottom[1], cam: { cx: cbx, cy: cby, z: 1.6 } },
    { from: T.camReset[0], to: T.camReset[1], cam: IDENT },
  ]);

const [hx, hy] = N('ask-elis-03-respuesta-inferior', 300, 190);
const [px, py] = N('ask-elis-03-respuesta-inferior', 290, 520);
const camAnswer = (t: number): Cam =>
  camAt(t, IDENT, [
    { from: T.camHeader[0], to: T.camHeader[1], cam: { cx: hx, cy: hy, z: 1.5 } },
    { from: T.camPanel[0], to: T.camPanel[1], cam: { cx: px, cy: py, z: 1.25 } },
    { from: T.camAskReset[0], to: T.camAskReset[1], cam: IDENT },
  ]);

const camOutlook = (t: number): Cam =>
  camAt(t, IDENT, [{ from: T.camOutlook[0], to: T.camOutlook[1], cam: { cx: 889, cy: 545, z: 1.08 } }]);

// ---- Ask Elis answer strip geometry (image coords of the ask-03 stage) ----
const AS = scaleOf('ask-elis-03-respuesta-inferior');
const [stripLeft, stripTop] = N('ask-elis-03-respuesta-inferior', ASK_STRIP.x0, ASK_STRIP.top);
const stripW = ASK_STRIP.w * AS;
const viewH = ASK_STRIP.h * AS;
const scrollMax = ASK_STRIP.d * AS;
// "✓ Verified figures · fire cell-days" chip in ask-02 (x shifted +2 px in the strip), right end
const [chipX, chipY] = N('ask-elis-03-respuesta-inferior', 424, 187);

// ---- pointer ----
const [cmpBtnX, cmpBtnY] = N('explore-ampliado', 34, 150);
const [askBtnX, askBtnY] = N('compare', 33, 382);
const [qX, qY] = N('ask-elis-01-inicial', 293, 350);
const [outBtnX, outBtnY] = N('ask-elis-03-respuesta-inferior', 34, 325);
const WAYS = [
  { at: 0, x: 1450, y: 760 },
  { at: T.compareClick - 0.03, x: cmpBtnX, y: cmpBtnY, dur: 0.55 },
  { at: 10.15, x: 980, y: 640, dur: 0.6 },
  { at: T.askClick - 0.05, x: askBtnX, y: askBtnY, dur: 0.5 },
  { at: T.qArrive, x: qX + 40, y: qY + 2, dur: 0.6 },
  { at: 19.35, x: 760, y: 760, dur: 0.55 },
  { at: T.outlookClick - 0.06, x: outBtnX, y: outBtnY, dur: 0.5 },
];
const cursorOpacity = (t: number) =>
  Math.max(vis(t, 8.85, 10.3, 0.2, 0.35), vis(t, 16.65, 19.35, 0.2, 0.35), vis(t, 20.85, 22.05, 0.2, 0.3));
const cursorPress = (t: number) =>
  Math.max(press(t, T.compareClick), press(t, T.askClick), press(t, T.qClick), press(t, T.outlookClick));

export const ElisPitch: React.FC<ElisProps> = ({ cinematicVolume, voiceSrc, voiceVolume, showSubtitles, showReconstructionTag }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  // layer opacities, all derived from t
  const clip2Fade = 1 - ease(t, T.handoff[0], T.handoff[1]);
  const exploreOn = t >= T.handoff[0] && t < T.toAmpl[1];
  const inicialO = 1 - ease(t, T.toAmpl[0], T.toAmpl[1]);
  const amplOn = t >= T.toAmpl[0] && t < T.toCompare[1];
  const compareO = ease(t, T.toCompare[0], T.toCompare[1]);
  const compareOn = t >= T.toCompare[0] && t < T.toAsk[1];
  const ask1O = ease(t, T.toAsk[0], T.toAsk[1]);
  const ask1On = t >= T.toAsk[0] && t < T.toAnswer[1];
  const answerO = ease(t, T.toAnswer[0], T.toAnswer[1]);
  const answerOn = t >= T.toAnswer[0] && t < T.toOutlook[1];
  const outlookO = ease(t, T.toOutlook[0], T.toOutlook[1]);
  const outlookOn = t >= T.toOutlook[0] && t < T.toOutro[1];

  const ansCam = camAnswer(t);
  const scroll = ease(t, T.scroll[0], T.scroll[1]) * scrollMax;
  // question bubble (top ≈ 95 px of the panel) is visible at once; the answer then streams in below it
const revealY = 95 * AS + 60 + ease(t, T.reveal[0], T.reveal[1]) * (viewH - 95 * AS);
  const [badgeX, badgeY] = toScreen(ansCam, chipX + 14, chipY - scroll);

  const [cx, cy] = glide(t, WAYS);
  const clipVol = (f: number, fadeTo?: [number, number]) => {
    const tt = f / fps;
    return clamp(cinematicVolume * (fadeTo ? 1 - ease(tt + 4.0, fadeTo[0], fadeTo[1]) : 1), 0, 1);
  };

  return (
    <AbsoluteFill style={{ background: COLORS.bg, fontFamily: 'ElisInter, Inter, system-ui, sans-serif' }}>
      {/* ---------- Explore (authentic) under the clip, so the dissolve reveals it ---------- */}
      {amplOn && <Shot src={shot('explore-ampliado')} cam={camAmpl(t)} />}
      {exploreOn && (
        <Shot src={shot('explore-inicial')} cam={camExplore(t)} opacity={inicialO}>
          <Highlight box={ROWS} opacity={vis(t, T.rowsHL[0], T.rowsHL[1], 0.3, 0.35)} color={COLORS.modis} />
        </Shot>
      )}

      {/* ---------- Scene 1: original cinematic footage ---------- */}
      <Sequence from={0} durationInFrames={Math.round(T.clip1[1] * fps)} layout="none">
        <AbsoluteFill>
          <OffthreadVideo src={staticFile('media/clip01.mp4')} volume={(f) => clipVol(f)} />
        </AbsoluteFill>
      </Sequence>
      <Sequence from={Math.round(T.clip2[0] * fps)} durationInFrames={Math.round((T.clip2[1] - T.clip2[0]) * fps)} layout="none">
        <AbsoluteFill style={{ opacity: clip2Fade, transform: `scale(${1 + 0.045 * ease(t, 5.3, 6.13)})` }}>
          <OffthreadVideo src={staticFile('media/clip02.mp4')} volume={(f) => clipVol(f, [5.85, 6.3])} />
        </AbsoluteFill>
      </Sequence>

      {/* ---------- Scene 2: Compare ---------- */}
      {compareOn && (
        <Shot src={shot('compare')} cam={camCompare(t)} opacity={compareO}>
          <Highlight box={R('compare', 356, 432, 640, 616)} opacity={vis(t, T.jumpHL[0], T.jumpHL[1], 0.35, 0.4)} color={COLORS.raw} pad={4} />
        </Shot>
      )}

      {/* ---------- Scene 3: Ask Elis ---------- */}
      {ask1On && (
        <Shot src={shot('ask-elis-01-inicial')} cam={IDENT} opacity={ask1O}>
          <Highlight box={R('ask-elis-01-inicial', 105, 326, 481, 374)} opacity={vis(t, T.qHover[0], T.qHover[1], 0.2, 0.2)} color={COLORS.forecast} pad={2} fill="rgba(183,148,246,0.10)" />
        </Shot>
      )}
      {answerOn && (
        <Shot src={shot('ask-elis-03-respuesta-inferior')} cam={ansCam} opacity={answerO}>
          <div style={{ position: 'absolute', left: stripLeft, top: stripTop, width: stripW, height: viewH, overflow: 'hidden', background: COLORS.panel }}>
            <Img src={staticFile('shots/ask-strip.png')} style={{ position: 'absolute', left: 0, top: -scroll, width: stripW, height: (ASK_STRIP.h + ASK_STRIP.d) * AS }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: revealY - 60, bottom: 0, background: `linear-gradient(180deg, rgba(15,27,22,0) 0px, ${COLORS.panel} 60px)` }} />
          </div>
        </Shot>
      )}

      {/* ---------- Scene 4: Outlook ---------- */}
      {outlookOn && (
        <Shot src={shot('outlook')} cam={camOutlook(t)} opacity={outlookO}>
          <Dim box={R('outlook', 92, 243, 551, 476)} opacity={ease(t, T.camOutlook[0], T.camOutlook[1])} />
        </Shot>
      )}

      {/* ---------- overlays (screen space) ---------- */}
      <OpeningLabels t={t} showTag={showReconstructionTag} />
      <ErrorFigure t={t} />
      <Schematic t={t} />
      <VerifiedBadge t={t} x={badgeX} y={badgeY - 30} />
      <ForecastCard t={t} />
      <Cursor x={cx} y={cy} opacity={cursorOpacity(t)} pressed={cursorPress(t)} />
      <Outro t={t} />
      {showSubtitles && <Subtitles t={t} />}
      <FadeBlack t={t} />

      {voiceSrc && <Audio src={staticFile(voiceSrc)} volume={voiceVolume} />}
    </AbsoluteFill>
  );
};

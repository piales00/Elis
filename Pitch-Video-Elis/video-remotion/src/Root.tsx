import React from 'react';
import { Composition } from 'remotion';
import { ElisPitch, ElisProps } from './ElisPitch';
import { DURATION_FRAMES, FPS } from './timeline';

const defaults: ElisProps = {
  cinematicVolume: 0.15, // clips' own sound, kept under the voice (0 = mute)
  voiceSrc: 'audio/narration.wav', // final narration (103 % take), starts at VOICE_START
  voiceVolume: 1,
  showSubtitles: true,
  showReconstructionTag: true,
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="ElisPitch"
    component={ElisPitch}
    durationInFrames={DURATION_FRAMES}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={defaults}
  />
);

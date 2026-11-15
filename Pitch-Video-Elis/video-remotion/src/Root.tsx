import React from 'react';
import { Composition } from 'remotion';
import { ElisPitch, ElisProps } from './ElisPitch';
import { DURATION_FRAMES, FPS } from './timeline';

const defaults: ElisProps = {
  cinematicVolume: 0.35, // set 0 to mute, ~0.12–0.2 once the voice is in
  voiceSrc: null, // e.g. 'audio/narration.m4a' when the recording arrives
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

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
  // Music bed. Synthesized by tools/make_audio.py. To use your own track instead, save it as
  // public/audio/music-custom.mp3 (or .wav) and change this line to 'audio/music-custom.mp3'.
  // It gets the same ducking under the voice. null = no music.
  musicSrc: 'audio/sfx/music.wav',
  musicVolume: 0.52,
  sfxVolume: 0.7,
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

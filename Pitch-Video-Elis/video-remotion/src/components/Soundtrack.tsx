import React from 'react';
import { Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import { F_PHOTO_STEP, MUSIC_DUCK, T, VOICE_START_FRAME } from '../timeline';

/** Every sound effect is synthesized by tools/make_audio.py (public/audio/sfx/). [file, second, level] */
export const SFX: [string, number, number][] = [
  ['whoosh', T.clipCross[0] - 0.1, 0.1],
  ['whoosh', T.handoff[0] - 0.2, 0.13],
  ['click', T.compareClick, 0.16],
  ['whoosh', T.toCompare[0] - 0.2, 0.13],
  ['riser', T.n334[0] - 0.7, 0.14],
  ['impact', T.n334[0], 0.22],
  ['tick', T.n38[0] + 0.08, 0.16],
  ['whoosh', T.schematic[0] - 0.2, 0.13],
  ['click', T.askClick, 0.16],
  ['whoosh', T.toAsk[0] - 0.2, 0.13],
  ['click', T.qClick, 0.16],
  ['chime', T.verified[0], 0.15],
  ['click', T.outlookClick, 0.16],
  ['whoosh', T.toOutlook[0] - 0.2, 0.13],
  ['pop1', T.fForecast, 0.17],
  ['pop2', T.fObserved, 0.17],
  ['pop3', T.fWithin, 0.18],
  ['whoosh', T.finale - 0.2, 0.13],
  ['shimmer', T.fLogo, 0.15],
  ...[0, 1, 2, 3].map((i): [string, number, number] => [`photo${i + 1}`, T.fPhotos + i * F_PHOTO_STEP, 0.09]),
];

export const Soundtrack: React.FC<{
  voiceSrc: string | null;
  voiceVolume: number;
  musicSrc: string | null;
  musicVolume: number;
  sfxVolume: number;
}> = ({ voiceSrc, voiceVolume, musicSrc, musicVolume, sfxVolume }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {voiceSrc && (
        <Sequence from={VOICE_START_FRAME} layout="none" name="Voice">
          <Audio src={staticFile(voiceSrc)} volume={voiceVolume} />
        </Sequence>
      )}
      {musicSrc && (
        <Sequence layout="none" name="Music">
          <Audio src={staticFile(musicSrc)} volume={(f) => musicVolume * (MUSIC_DUCK[f] ?? 0)} />
        </Sequence>
      )}
      {sfxVolume > 0 &&
        SFX.map(([name, at, level], i) => (
          <Sequence key={i} from={Math.round(at * fps)} layout="none" name={`SFX ${name}`}>
            <Audio src={staticFile(`audio/sfx/${name}.wav`)} volume={level * sfxVolume} />
          </Sequence>
        ))}
    </>
  );
};

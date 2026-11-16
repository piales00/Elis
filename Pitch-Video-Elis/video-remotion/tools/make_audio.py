#!/usr/bin/env python3
# Usage: python3 tools/make_audio.py            (needs numpy; writes public/audio/sfx/*.wav, 48 kHz stereo 16-bit)
# Every sound here is synthesized from sine waves and filtered noise. No samples, no third-party material.
# Timings and levels live in src/components/Soundtrack.tsx; the music ducking lives in src/timeline.ts.
import os, wave
import numpy as np

SR = 48000
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'audio', 'sfx')
rng = np.random.default_rng(2026)


def tt(d):
    return np.arange(int(SR * d)) / SR


def db(x):
    return 10 ** (x / 20)


def band_noise(d, lo, hi):
    n = int(SR * d)
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    c, w = np.sqrt(lo * hi), np.log(hi / lo) / 2
    shape = np.exp(-0.5 * (np.log(np.maximum(f, 1) / c) / w) ** 2)
    x = np.fft.irfft(spec * shape, n)
    return x / np.max(np.abs(x))


def lowpass(x, cut):
    spec = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(x.shape[0], 1 / SR)
    g = 1 / (1 + (f / cut) ** 4)
    return np.fft.irfft(spec * (g[:, None] if x.ndim == 2 else g), x.shape[0], axis=0)


def fade(x, fi=0.005, fo=0.02):
    n = x.shape[0]
    a, b = int(SR * fi), int(SR * fo)
    env = np.ones(n)
    if a:
        env[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    if b:
        env[-b:] = np.cos(np.linspace(0, np.pi / 2, b)) ** 2
    return x * (env[:, None] if x.ndim == 2 else env)


def stereo(x, pan=0.0):
    return np.stack([x * np.sqrt((1 - pan) / 2), x * np.sqrt((1 + pan) / 2)], axis=1) * np.sqrt(2)


def save(name, x, peak_db):
    if x.ndim == 1:
        x = stereo(x)
    x = x / np.max(np.abs(x)) * db(peak_db)
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
    print(f'{name}.wav  {x.shape[0] / SR:.2f} s  peak {peak_db} dBFS')


def note(n):
    return 440 * 2 ** ((n - 69) / 12)


def whoosh():
    d = 0.7
    t = tt(d)
    out = np.zeros((len(t), 2))
    bands = [(250, 500), (450, 900), (800, 1600), (1400, 2800), (2400, 4800)]
    for i, (lo, hi) in enumerate(bands):
        c = 0.22 + 0.06 * i
        env = np.exp(-0.5 * ((t - c) / 0.13) ** 2)
        out += stereo(band_noise(d, lo, hi) * env * (0.9 ** i), pan=-0.5 + 0.25 * i)
    return fade(out, 0.05, 0.15)


def riser():
    d = 0.7
    t = tt(d)
    p = t / d
    env = p ** 2.2
    tone = np.sin(2 * np.pi * np.cumsum(180 * 2 ** (1.4 * p)) / SR) * 0.5
    air = np.zeros(len(t))
    for i, (lo, hi) in enumerate([(500, 1000), (1000, 2000), (2000, 4000)]):
        air += band_noise(d, lo, hi) * np.exp(-0.5 * ((p - (0.55 + 0.2 * i)) / 0.25) ** 2)
    return fade((tone + 0.6 * air) * env, 0.03, 0.03)


def impact():
    d = 1.1
    t = tt(d)
    f = 42 + 50 * np.exp(-t / 0.06)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.28)
    thump = lowpass(band_noise(d, 60, 400), 300) * np.exp(-t / 0.05) * 0.5
    return fade(body + thump, 0.004, 0.2)


def blip(f0, f1, d=0.16, decay=0.035, bell=0.0):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t / 0.012)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t / decay) + bell * np.sin(2.0 * ph) * np.exp(-t / (decay * 2.2))
    return fade(x, 0.003, 0.03)


def tick():
    return blip(2100, 1500, d=0.12, decay=0.018, bell=0.25)


def pop(n, soft=False):
    f = note(n)
    return blip(f * 1.35, f, d=0.3 if not soft else 0.22, decay=0.05 if not soft else 0.04, bell=0.3 if not soft else 0.12)


def click():
    d = 0.11
    x = np.zeros(int(SR * d))
    for at, amp, dec in [(0.0, 1.0, 0.0025), (0.065, 0.55, 0.002)]:
        n = int(SR * 0.02)
        t = tt(0.02)
        burst = (band_noise(0.02, 1800, 5200) + 0.6 * np.sin(2 * np.pi * 2600 * t)) * np.exp(-t / dec)
        i = int(SR * at)
        x[i:i + n] += amp * burst
    return fade(x, 0.0005, 0.01)


def chime():
    d = 1.5
    t = tt(d)
    out = np.zeros((len(t), 2))
    for k, (n, at) in enumerate([(81, 0.0), (88, 0.09)]):
        f = note(n)
        tk = np.maximum(t - at, 0)
        x = sum(a * np.sin(2 * np.pi * f * r * tk) * np.exp(-tk / dec) for r, a, dec in [(1, 1, 0.42), (2.0, 0.28, 0.25), (2.76, 0.12, 0.16), (5.4, 0.05, 0.08)])
        x *= (t >= at) * (1 - np.exp(-tk / 0.004))
        out += stereo(x, pan=-0.3 + 0.6 * k)
    return fade(out, 0.002, 0.3)


def shimmer():
    d = 2.2
    t = tt(d)
    out = np.zeros((len(t), 2))
    for k, n in enumerate([86, 90, 93, 98, 100, 105]):
        at = 0.07 * k
        tk = np.maximum(t - at, 0)
        env = (1 - np.exp(-tk / 0.05)) * np.exp(-tk / 0.55) * (t >= at)
        trem = 1 + 0.25 * np.sin(2 * np.pi * (3.1 + 0.7 * k) * t)
        x = (np.sin(2 * np.pi * note(n) * tk) + 0.2 * np.sin(2 * np.pi * note(n) * 2.01 * tk)) * env * trem * (0.85 ** k)
        out += stereo(x, pan=(-1) ** k * 0.45)
    air = band_noise(d, 5000, 11000) * np.exp(-0.5 * ((t - 0.35) / 0.3) ** 2) * 0.12
    return fade(out + stereo(air), 0.01, 0.5)


def music():
    d = 30.0
    t = tt(d)
    n = len(t)
    chords = [
        (0.0, [38, 45, 52, 57, 62]),
        (9.6, [35, 42, 50, 57, 62]),
        (17.3, [43, 50, 55, 57, 62]),
        (22.1, [45, 52, 57, 61, 64]),
        (25.3, [38, 45, 50, 57, 62, 66]),
    ]
    xf = 1.6
    pad = np.zeros((n, 2))
    for i, (start, notes) in enumerate(chords):
        end = chords[i + 1][0] if i + 1 < len(chords) else d + xf
        env = np.clip((t - start + xf / 2) / xf, 0, 1) * np.clip((end + xf / 2 - t) / xf, 0, 1)
        env = np.sin(env * np.pi / 2) ** 2
        for j, m in enumerate(notes):
            f = note(m)
            for det, pan in [(-0.0025, -0.6), (0.0025, 0.6), (0.0, 0.0)]:
                ph = 2 * np.pi * f * (1 + det) * t + rng.uniform(0, 6.28)
                v = sum(np.sin(h * ph) / h ** 2.1 for h in (1, 2, 3, 4))
                lfo = 1 + 0.12 * np.sin(2 * np.pi * (0.11 + 0.03 * j) * t + j)
                pad += stereo(v * env * lfo * (0.8 if m < 48 else 0.55), pan)
    pad = lowpass(pad, 1400)
    pad /= np.max(np.abs(pad))

    step = 0.3
    arp = np.zeros((n, 2))
    k = 0
    at = 4.8
    while at < 25.2:
        notes = [c for s, c in chords if s <= at][-1]
        tones = [m + 12 for m in notes[2:]] + [notes[3] + 24]
        m = tones[[0, 2, 1, 3, 2, 1][k % 6] % len(tones)]
        grow = np.clip((at - 4.8) / 17.0, 0, 1) ** 1.3
        amp = (0.18 + 0.82 * grow) * (1.0 if k % 2 == 0 else 0.7)
        tk = tt(1.2)
        f = note(m)
        x = (np.sin(2 * np.pi * f * tk) + 0.25 * np.sin(4 * np.pi * f * tk) * np.exp(-tk / 0.08)) * np.exp(-tk / 0.3) * (1 - np.exp(-tk / 0.006))
        i = int(at * SR)
        seg = stereo(x * amp, pan=0.35 if k % 2 else -0.35)[: n - i]
        arp[i:i + len(seg)] += seg
        at += step
        k += 1
    for m, pan, delay in [(62, -0.3, 0.0), (69, 0.3, 0.05), (74, 0.0, 0.1), (78, 0.2, 0.16)]:
        tk = tt(4.6)
        f = note(m)
        x = (np.sin(2 * np.pi * f * tk) + 0.2 * np.sin(4 * np.pi * f * tk)) * np.exp(-tk / 1.5) * (1 - np.exp(-tk / 0.01))
        i = int((25.3 + delay) * SR)
        seg = stereo(x * 0.9, pan)[: n - i]
        arp[i:i + len(seg)] += seg
    echo = np.zeros_like(arp)
    lag = int(0.45 * SR)
    echo[lag:] = arp[:-lag] * 0.32
    echo[2 * lag:] += arp[:-2 * lag][:, ::-1] * 0.14
    arp = lowpass(arp + echo, 3200)
    arp /= np.max(np.abs(arp))

    sub = np.sin(2 * np.pi * note(26) * t) * (0.5 + 0.5 * np.clip(t / 20, 0, 1))
    swell = 0.75 + 0.25 * np.clip((t - 4) / 21, 0, 1)
    mix = (pad * 0.8 + stereo(sub) * 0.22) * swell[:, None] + arp * 0.5
    return fade(mix, 1.6, 1.0)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    save('music', music(), -6)
    save('whoosh', whoosh(), -3)
    save('riser', riser(), -3)
    save('impact', impact(), -3)
    save('tick', tick(), -3)
    save('click', click(), -3)
    save('chime', chime(), -3)
    save('shimmer', shimmer(), -3)
    for i, m in enumerate([72, 76, 79]):
        save(f'pop{i + 1}', pop(m), -3)
    for i, m in enumerate([74, 76, 78, 81]):
        save(f'photo{i + 1}', pop(m, soft=True), -3)

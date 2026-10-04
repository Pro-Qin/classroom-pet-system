#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
score.py — 校园宠物乐园宣传片配乐（全部代码合成，无外部素材）

120 BPM / 1 拍 0.5s / 1 小节 2.0s / 21 小节 = 42.000s，与 film.html 共用同一张时间表。

结构（与分镜一一对应）：
  b1-2   0–4s    引子     铺底 + 铃声 + 拨弦
  b3-5   4–10s   主歌 A   四踩底鼓进，贝斯八分，主题动机第一次出现（"加分"）
  b6-8  10–16s   主歌 A2  加 16 分拨弦，动机复奏（"宠物"）
  b9    16–18s   推进     滚奏 + 上升音（"进化"前的一口气）
  b10-12 18–24s  副歌 B   全开，动机升八度（"进化 / 荣誉"）
  b13-15 24–30s  主歌 A3  收一点，留空间给领奖台与大屏
  b16-17 30–34s  过渡     轻，开口钹
  b18   34–36s   断点     撤鼓撤贝斯，只剩铺底 + 58Hz 嗡鸣（"断网也在写"）
  b19   36–38s   回归     全开 + 冲击（"恢复就补传"）
  b20-21 38–42s  尾奏     铺底 + 铃声，动机放慢，衰减到静

和声：Am – F – C – G（每两小节一个），A 小调。
主题动机（8 音 / 两小节，一小节 4 音）：E4 G4 A4 C5 | B4 A4 G4 E4

用法： python score.py -o out/score.wav
"""
import argparse
import wave

import numpy as np

SR = 44100
DUR = 42.0
BPM = 120
BEAT = 60.0 / BPM            # 0.5
BAR = BEAT * 4               # 2.0
BARS = 21
N = int(SR * DUR)

L = np.zeros(N)
R = np.zeros(N)
BUF = (L, R)


def idx(t):
    return int(round(t * SR))


def add(t, sig, gain=1.0, pan=0.0):
    i = idx(t)
    if i >= N:
        return
    n = min(len(sig), N - i)
    if n <= 0:
        return
    BUF[0][i:i + n] += sig[:n] * gain * min(1.0, 1.0 - pan)
    BUF[1][i:i + n] += sig[:n] * gain * min(1.0, 1.0 + pan)


def expenv(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def noise(n, seed):
    return np.random.default_rng(seed).normal(0, 1, n)


def lp(x, cutoff):
    """一阶 IIR 低通（指数核卷积近似）"""
    a = float(np.exp(-2 * np.pi * cutoff / SR))
    k = max(2, min(len(x), int(np.ceil(np.log(1e-4) / np.log(a)))))
    kern = a ** np.arange(k)
    kern /= kern.sum()
    return np.convolve(x, kern, mode='same')


def hp(x, cutoff):
    return x - lp(x, cutoff)


# ------------------------------------------------------------------ 乐器
def kick(dur=0.40, f0=126.0, f1=48.0):
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * expenv(n, 0.105)
    click = noise(n, 3) * expenv(n, 0.003) * 0.30
    return np.tanh((body + click) * 1.5) * 0.95


def clap(dur=0.28):
    n = int(SR * dur)
    t = np.arange(n) / SR
    band = hp(lp(noise(n, 11), 3000), 1100)
    e = (np.exp(-t * 95) + 0.6 * np.exp(-np.maximum(t - 0.010, 0) * 95) +
         0.42 * np.exp(-np.maximum(t - 0.021, 0) * 80) + 0.20 * np.exp(-t * 16))
    return band * e * 0.30


def hat(open_=False, dur=None):
    dur = dur if dur is not None else (0.20 if open_ else 0.05)
    n = int(SR * dur)
    return hp(noise(n, 21), 7600) * expenv(n, 0.032 if open_ else 0.009) * 0.20


def bass(f, dur=0.42):
    n = int(SR * dur)
    t = np.arange(n) / SR
    saw = 2 * ((f * t) % 1.0) - 1.0
    sub = np.sin(2 * np.pi * f * t)
    x = lp(saw * 0.40 + sub * 0.90, 430)
    e = np.minimum(1, t / 0.005) * np.exp(-t * 3.4)
    return x * e * 0.30


def lead(f, dur):
    """主题动机的主音色：三把失谐锯齿 + 低八度，拨弦包络"""
    n = int(SR * dur)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for d, g in ((-0.008, 0.40), (0.008, 0.40), (0.0, 0.55)):
        x += g * (2 * ((f * (1 + d) * t) % 1.0) - 1.0)
    x += 0.50 * np.sin(2 * np.pi * f * 0.5 * t)
    x = lp(x, 2400)
    e = np.minimum(1, t / 0.008) * np.exp(-t * 2.6) + 0.18 * np.exp(-t * 0.9)
    return x * e * 0.20


def pad(freqs, dur, seed=0, gain=0.115):
    n = int(SR * dur)
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    out = np.zeros(n)
    for f in freqs:
        for d in (-0.007, 0.0, 0.007):
            out += np.sin(2 * np.pi * f * (1 + d) * t + rng.random() * 2 * np.pi)
    out /= (len(freqs) * 3)
    out *= 1 + 0.14 * np.sin(2 * np.pi * 0.09 * t + seed)
    out = lp(out, 1250)
    e = np.minimum(1, t / 0.55) * np.minimum(1, (dur - t) / 0.7)
    return out * e * gain


def pluck(f, dur=0.40, gain=0.15):
    n = int(SR * dur)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + 0.30 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)
    return x * expenv(n, 0.11) * gain


def bell(f, dur=3.4, gain=0.20):
    n = int(SR * dur)
    t = np.arange(n) / SR
    x = (np.sin(2 * np.pi * f * t) +
         0.52 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 1.7) +
         0.26 * np.sin(2 * np.pi * f * 5.40 * t) * np.exp(-t * 3.2))
    return x * expenv(n, 0.9) * gain


def riser(dur=2.0, gain=0.15):
    n = int(SR * dur)
    t = np.arange(n) / SR
    band = hp(lp(noise(n, 33), 4600), 800)
    e = (t / dur) ** 2.1
    f = 240 * (1 + 2.6 * (t / dur) ** 2)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR)
    return (band * 0.9 + tone * 0.8) * e * gain


def impact(gain=0.40):
    n = int(SR * 1.2)
    t = np.arange(n) / SR
    f = 82 * np.exp(-t * 3.6) + 38
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * expenv(n, 0.26)
    x += lp(noise(n, 55), 2600) * expenv(n, 0.10) * 0.45
    return np.tanh(x * 1.3) * gain


def drone(dur, f=58.0, gain=0.11):
    n = int(SR * dur)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + 0.28 * np.sin(2 * np.pi * f * 2 * t)
    x *= 1 + 0.20 * np.sin(2 * np.pi * 0.6 * t)
    e = np.minimum(1, t / 0.3) * np.minimum(1, (dur - t) / 0.4)
    return x * e * gain


# ------------------------------------------------------------------ 和声与动机
CHORDS = [
    [220.00, 261.63, 329.63],   # Am  A3 C4 E4
    [174.61, 220.00, 261.63],   # F   F3 A3 C4
    [196.00, 261.63, 329.63],   # C   G3 C4 E4
    [196.00, 246.94, 293.66],   # G   G3 B3 D4
]
ROOT = [110.00, 87.31, 130.81, 98.00]
HOOK = [329.63, 392.00, 440.00, 523.25, 493.88, 440.00, 392.00, 329.63]

DRUMS = set(range(3, 18)) | {19}
BASSY = set(range(3, 18)) | {19}
ARPS = set(range(7, 18)) | {19}
LEADS = set(range(3, 9)) | set(range(10, 18)) | {19}

KICKS = []
for b in sorted(DRUMS):
    t0 = (b - 1) * BAR
    for k in range(4):
        KICKS.append(t0 + k * BEAT)


def sidechain(n, kicks, depth=0.55, rel=0.15):
    env = np.ones(n)
    ln = int(rel * SR)
    curve = 1 - depth * np.exp(-np.arange(ln) / (rel * SR * 0.34))
    for k in kicks:
        i = int(k * SR)
        if i >= n:
            continue
        m = min(ln, n - i)
        env[i:i + m] = np.minimum(env[i:i + m], curve[:m])
    return env


SC = sidechain(N, KICKS)

# ------------------------------------------------------------------ 铺底（全片）
for b in range(1, BARS + 1):
    t0 = (b - 1) * BAR
    ch = CHORDS[((b - 1) // 2) % 4]
    p = pad(ch, BAR, seed=b)
    i = idx(t0)
    p = p * (SC[i:i + len(p)] * 0.35 + 0.65)
    add(t0, p, 1.35 if b == 18 else 1.0, pan=-0.10 if b % 2 else 0.10)

# ------------------------------------------------------------------ 鼓组
for b in sorted(DRUMS):
    t0 = (b - 1) * BAR
    for k in range(4):
        add(t0 + k * BEAT, kick(), 0.95)
    for k in (1, 3):
        add(t0 + k * BEAT, clap(), 0.82, pan=0.04)
    for k in range(8):
        add(t0 + k * BEAT / 2, hat(open_=(k == 7 and b % 4 == 0)), 1.0 if k % 2 == 0 else 0.66,
            pan=-0.22 if k % 2 else 0.22)
    if b % 4 == 0:
        for k in range(4):
            add(t0 + 3 * BEAT + k * BEAT / 4, hat(open_=False), 0.5 + 0.14 * k, pan=0.3)

# 第 9 小节滚奏（进副歌前）
t9 = 8 * BAR
for k in range(16):
    add(t9 + k * BEAT / 4, hat(open_=False), 0.34 + 0.030 * k, pan=-0.3 + 0.04 * k)

# ------------------------------------------------------------------ 贝斯
for b in sorted(BASSY):
    t0 = (b - 1) * BAR
    root = ROOT[((b - 1) // 2) % 4]
    for k in range(8):
        f = root * (1.5 if (k == 6 and b % 4 == 3) else 1.0)
        add(t0 + k * BEAT / 2, bass(f), 0.95 if k % 2 == 0 else 0.72)

# ------------------------------------------------------------------ 主题动机
for b in sorted(LEADS):
    t0 = (b - 1) * BAR
    up = 2.0 if 10 <= b <= 14 else 1.0
    for k in range(4):
        f = HOOK[((b - 1) * 4 + k) % 8] * up
        add(t0 + k * BEAT, lead(f, 0.55), 1.0 if k % 2 == 0 else 0.86, pan=-0.06)
for k, f in enumerate(HOOK):                 # 尾奏：动机放慢一倍
    add(37.2 + k * BEAT, lead(f * 0.5, 1.1), 0.70, pan=-0.05)

# ------------------------------------------------------------------ 16 分拨弦
for b in sorted(ARPS):
    t0 = (b - 1) * BAR
    ch = CHORDS[((b - 1) // 2) % 4]
    for k in range(16):
        f = ch[[0, 1, 2, 1][k % 4]] * (2 if k >= 8 else 1)
        add(t0 + k * BEAT / 4, pluck(f), 0.62 if k % 2 == 0 else 0.42,
            pan=0.34 if k % 2 else -0.34)

# ------------------------------------------------------------------ 断点（b18）
t18 = 17 * BAR
add(t18, drone(BAR, 58.0, 0.15), 1.0)
add(t18 + BEAT * 2, drone(BAR * 0.9, 87.31, 0.07), 1.0)
add(t18, lp(noise(int(SR * BAR), 77), 800) * expenv(int(SR * BAR), 0.8) * 0.04, 1.0)

# ------------------------------------------------------------------ 切点与冲击
for c, g in [(4.0, 0.30), (10.0, 0.26), (16.0, 0.30), (22.0, 0.34),
             (28.0, 0.26), (32.0, 0.30), (38.0, 0.40)]:
    add(c, impact(g), 1.0)
for c in [16.0, 36.0]:
    add(c - 2.0, riser(1.95, 0.16), 1.0)
add(36.0, impact(0.50), 1.0)

# ------------------------------------------------------------------ 铃声
add(0.25, bell(880.00, 4.2, 0.15), 1.0, pan=-0.10)
add(38.40, bell(659.26, 3.6, 0.17), 1.0, pan=0.08)
add(39.60, bell(987.77, 3.0, 0.13), 1.0, pan=-0.08)

# ------------------------------------------------------------------ 附点八分延迟
for B in BUF:
    x = B.copy()
    d = int(0.375 * SR)
    fb = np.zeros_like(x)
    fb[d:] = x[:-d] * 0.30
    fb[d * 2:] += x[:-d * 2] * 0.09
    B[:] += fb * 0.22

# ------------------------------------------------------------------ 母带
mix = np.stack([L, R])
mix = mix - mix.mean(axis=1, keepdims=True)
mix = np.tanh(mix * 1.5) / 1.5
rms = float(np.sqrt(np.mean(mix ** 2)))
mix *= min(14.0, 0.185 / max(rms, 1e-9))
peak = float(np.max(np.abs(mix)))
if peak > 0.72:
    mix *= 0.72 / peak
tail = np.linspace(1.0, 0.0, int(SR * 1.4)) ** 1.3
mix[:, -len(tail):] *= tail
head = np.linspace(0.0, 1.0, int(SR * 0.12))
mix[:, :len(head)] *= head

out = np.clip(mix, -1.0, 1.0).T
pcm = (out * 32767.0).astype('<i2')

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('-o', '--out', default='out/score.wav')
    a = ap.parse_args()
    import os
    os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
    with wave.open(a.out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    p = float(np.max(np.abs(out)))
    r = float(np.sqrt(np.mean(out ** 2)))
    print('写出 %s  %.3fs  %d 帧  峰值 %.3f (%.2f dBFS)  RMS %.4f (%.1f dBFS)'
          % (a.out, DUR, len(pcm), p, 20 * np.log10(max(p, 1e-9)),
             r, 20 * np.log10(max(r, 1e-9))))

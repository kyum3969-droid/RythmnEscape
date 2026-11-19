# 곡마다 16분음 자리별 어택 세기(고음·중음·저음). 결과: on16.json {라운드: {hi:[...], mid:[...], lo:[...]}} (마디*16 + k)
import json, subprocess, numpy as np, sys
songs = json.load(open(sys.argv[1])); root = sys.argv[2]; out = {}
SR = 22050; N = 1024; H = 256
for s in songs:
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', root + '/' + s['file'], '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    nf = (len(x) - N) // H
    fr = np.lib.stride_tricks.as_strided(x, shape=(nf, N), strides=(x.strides[0] * H, x.strides[0]))
    M = np.log1p(30 * np.abs(np.fft.rfft(fr * np.hanning(N), axis=1)))
    f = np.fft.rfftfreq(N, 1 / SR)
    d = np.maximum(0, np.diff(M, axis=0))
    t = (np.arange(len(d)) + 1) * H / SR + N / 2 / SR
    bands = {'hi': f > 5000, 'mid': (f > 800) & (f <= 5000), 'lo': f < 180}
    spb = 60 / s['bpm']; n16 = s['bars'] * 16; res = {}
    for k, sel in bands.items():
        fl = d[:, sel].sum(1); fl = fl / (np.percentile(fl, 95) + 1e-9)
        v = []
        for j in range(n16):
            tj = s['off'] + j * spb / 4; a = np.searchsorted(t, tj - 0.03); b = np.searchsorted(t, tj + 0.03)
            v.append(round(float(fl[a:b].max()) if b > a else 0.0, 3))
        res[k] = v
    out[s['r']] = res
    print('round', s['r'], 'done', flush=True)
json.dump(out, open(sys.argv[3], 'w'))

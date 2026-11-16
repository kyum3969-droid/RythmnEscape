// 곡 분석: 템포(BPM), 첫 박 위치, 템포가 곡 안에서 흔들리는 정도.
// 브라우저(곡 넣기)와 node(테스트) 양쪽에서 쓴다. 입력은 한 채널로 합친 소리 샘플.
//
// 방법: ① 5ms 단위로 "소리가 갑자기 커지는 정도"를 잰다(킥이 잘 잡히게 낮은 소리에 무게를 둔다)
//       ② 그 값이 얼마 간격으로 되풀이되는지 보고 템포를 어림한다(hintBpm 근처를 우선)
//       ③ 템포를 0.01 BPM 단위로 바꿔 가며 박이 가장 또렷하게 겹치는 값을 고른다
//       ④ 박마다 실제 킥 위치를 찾아 직선에 맞춰 템포와 첫 박을 다듬고, 남는 어긋남을 흔들림으로 보고한다
function analyzeTrack(x, sr, opts = {}) {
  const hint = opts.hintBpm || 96;
  const hop = Math.max(1, Math.round(sr / 200)), fps = sr / hop;
  const n = Math.floor(x.length / hop);
  const duration = x.length / sr;
  if (n < fps * 4) return { ok: false, reason: "곡이 너무 짧아요(4초 미만).", duration };

  // ① 낮은 소리(약 160Hz 아래)와 전체 소리의 크기
  const a = Math.exp(-2 * Math.PI * 160 / sr);
  const lo = new Float32Array(n), full = new Float32Array(n);
  let l1 = 0, l2 = 0, sumLo = 0, sumFull = 0;
  for (let i = 0; i < n; i++) {
    let sl = 0, sf = 0;
    for (let j = 0, p = i * hop; j < hop; j++, p++) {
      const v = x[p];
      l1 = l1 * a + v * (1 - a); l2 = l2 * a + l1 * (1 - a);
      sl += l2 * l2; sf += v * v;
    }
    lo[i] = Math.sqrt(sl / hop); full[i] = Math.sqrt(sf / hop);
    sumLo += lo[i]; sumFull += full[i];
  }
  const refLo = sumLo / n || 1e-9, refFull = sumFull / n || 1e-9;
  if (sumFull / n < 1e-5) return { ok: false, reason: "소리가 거의 없어요.", duration };
  const onset = new Float32Array(n);
  for (let i = 0; i < n; i++) {                      // 맨 앞은 "그 전엔 소리가 없었다"고 본다(곡이 첫 박부터 바로 시작하는 경우)
    const dl = Math.log1p(20 * lo[i] / refLo) - (i ? Math.log1p(20 * lo[i - 1] / refLo) : 0);
    const df = Math.log1p(20 * full[i] / refFull) - (i ? Math.log1p(20 * full[i - 1] / refFull) : 0);
    onset[i] = Math.max(0, dl) + 0.3 * Math.max(0, df);
  }

  // ② 되풀이 간격으로 템포 어림 (60~200 BPM)
  let coarse = hint, bestAc = -1;
  for (let lag = Math.floor(fps * 60 / 200); lag <= Math.ceil(fps * 60 / 60); lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += onset[i] * onset[i + lag];
    const bpm = 60 * fps / lag, w = Math.exp(-0.5 * (Math.log2(bpm / hint) / 0.3) ** 2);
    if (s / (n - lag) * w > bestAc) { bestAc = s / (n - lag) * w; coarse = bpm; }
  }

  // ③ 박이 가장 또렷하게 겹치는 템포
  const NB = 64, acc = new Float32Array(NB);
  const fold = (period) => {
    acc.fill(0);
    for (let i = 0; i < n; i++) { const ph = (i / fps) / period; acc[Math.floor((ph - Math.floor(ph)) * NB)] += onset[i]; }
    let best = -1, bi = 0;
    for (let b = 0; b < NB; b++) { const v = acc[(b + NB - 1) % NB] + 2 * acc[b] + acc[(b + 1) % NB]; if (v > best) { best = v; bi = b; } }
    return { score: best, phase: (bi + 0.5) / NB * period };
  };
  let period = 60 / coarse, top = fold(period);
  for (let bpm = coarse * 0.985; bpm <= coarse * 1.015; bpm += 0.01) { const f = fold(60 / bpm); if (f.score > top.score) { top = f; period = 60 / bpm; } }
  let t0 = top.phase;
  if (t0 > period - 0.03) t0 -= period;               // 첫 박이 0초 바로 앞뒤에 있는 경우

  // ④ 박마다 실제 킥 위치 → 직선 맞춤
  const peakNear = (t, win) => {
    const c = t * fps, i0 = Math.max(0, Math.round(c - win * fps)), i1 = Math.min(n - 2, Math.round(c + win * fps));
    let m = -1, mv = 0;
    for (let i = i0; i <= i1; i++) if (onset[i] > mv) { mv = onset[i]; m = i; }
    if (m < 0) return null;
    const y0 = m ? onset[m - 1] : 0, y1 = onset[m], y2 = onset[m + 1], d = y0 - 2 * y1 + y2;
    return { t: (m + (d < 0 ? 0.5 * (y0 - y2) / d : 0)) / fps, s: mv };
  };
  let picks = [], strong = 0;
  for (let iter = 0; iter < 4; iter++) {
    const all = [];
    for (let k = 0; t0 + k * period < duration - 0.05; k++) { const p = peakNear(t0 + k * period, 0.035); if (p) all.push({ k, t: p.t, s: p.s }); }
    if (all.length < 8) break;
    const sorted = all.map((p) => p.s).sort((u, v) => v - u);
    strong = sorted[Math.floor(sorted.length * 0.25)] || 0;
    picks = all.filter((p) => p.s >= strong * 0.3 && Math.abs(p.t - (t0 + p.k * period)) < (iter ? 0.02 : 0.035));
    if (picks.length < 8) break;
    let sk = 0, st = 0, skk = 0, skt = 0;
    for (const p of picks) { sk += p.k; st += p.t; skk += p.k * p.k; skt += p.k * p.t; }
    const m = picks.length, den = m * skk - sk * sk;
    if (!den) break;
    period = (m * skt - sk * st) / den; t0 = (st - period * sk) / m;
  }
  if (picks.length < 8) return { ok: false, reason: "박을 찾지 못했어요. 킥이 또렷한 곡인지 확인해 주세요.", duration };

  // 흔들림: 박을 하나씩 따라가며(조금씩 밀리는 것도 놓치지 않게) 직선에서 얼마나 벗어나는지 본다. 8박씩 묶은 값의 최대.
  const res = [];
  let local = 0;
  for (let k = picks[0].k; t0 + k * period < duration - 0.05; k++) {
    const want = t0 + k * period + local, p = peakNear(want, 0.03);
    if (!p || p.s < strong * 0.3) continue;
    local += 0.5 * (p.t - want);
    res.push({ k, r: (p.t - (t0 + k * period)) * 1000 });
  }
  let wobble = 0;
  for (let i = 0; i + 8 <= res.length; i += 4) {
    const w = res.slice(i, i + 8).map((p) => p.r).sort((u, v) => u - v);
    wobble = Math.max(wobble, Math.abs((w[3] + w[4]) / 2));
  }
  const fit = picks.map((p) => (p.t - (t0 + p.k * period)) * 1000);
  const jitter = Math.sqrt(fit.reduce((s, r) => s + r * r, 0) / fit.length);
  const total = Math.floor((duration - t0) / period) + 1;
  const first = picks[0].k;
  return {
    ok: true, bpm: 60 / period, period, offset: t0 + first * period, duration,
    beats: total - first, coverage: picks.length / total, wobbleMs: wobble, jitterMs: jitter,
  };
}

if (typeof module !== "undefined") module.exports = { analyzeTrack };

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
  const onset = new Float32Array(n), kick = new Float32Array(n);   // onset = 템포를 찾을 때 쓰는 값(전체 소리 포함), kick = 박 위치를 잴 때 쓰는 값(낮은 소리만)
  for (let i = 0; i < n; i++) {                      // 맨 앞은 "그 전엔 소리가 없었다"고 본다(곡이 첫 박부터 바로 시작하는 경우)
    const dl = Math.log1p(20 * lo[i] / refLo) - (i ? Math.log1p(20 * lo[i - 1] / refLo) : 0);
    const df = Math.log1p(20 * full[i] / refFull) - (i ? Math.log1p(20 * full[i - 1] / refFull) : 0);
    kick[i] = Math.max(0, dl);
    onset[i] = kick[i] + 0.3 * Math.max(0, df);
  }

  // ②③ 템포: 60~200 BPM을 훑으며, 그 간격으로 접었을 때 박이 가장 또렷하게 겹치는 값을 고른다.
  // (되풀이 간격만 보는 방법은 16분음표가 촘촘한 실제 곡에서 엉뚱한 값을 냈다)
  const NB = 64, acc = new Float32Array(NB);
  let onsetSum = 0;
  for (let i = 0; i < n; i++) onsetSum += onset[i];
  const fold = (period) => {
    acc.fill(0);
    for (let i = 0; i < n; i++) { const ph = (i / fps) / period; acc[Math.floor((ph - Math.floor(ph)) * NB)] += onset[i]; }
    let best = -1, bi = 0;
    for (let b = 0; b < NB; b++) { const v = acc[(b + NB - 1) % NB] + 2 * acc[b] + acc[(b + 1) % NB]; if (v > best) { best = v; bi = b; } }
    return { score: best / (onsetSum || 1), phase: (bi + 0.5) / NB * period };
  };
  // 후보 템포 여러 개를 뽑는다(점수가 봉우리를 이루는 곳)
  const scan = [];
  for (let bpm = 60; bpm <= 200; bpm += 0.05) scan.push([bpm, fold(60 / bpm).score]);
  const cands = [];
  for (const [bpm, sc] of scan.slice().sort((u, v) => v[1] - u[1])) { if (cands.every((c) => Math.abs(c - bpm) > 1)) cands.push(bpm); if (cands.length >= 6) break; }

  // ④ 후보마다 박 위치에서 실제 킥을 찾아 직선에 맞춰 본다. "박마다 킥이 얼마나 빠짐없이 있는가"로 진짜 템포를 고른다.
  const peakNear = (t, win) => {
    const c = t * fps, i0 = Math.max(0, Math.round(c - win * fps)), i1 = Math.min(n - 2, Math.round(c + win * fps));
    let m = -1, mv = 0;
    for (let i = i0; i <= i1; i++) if (kick[i] > mv) { mv = kick[i]; m = i; }
    if (m < 0) return null;
    const y0 = m ? kick[m - 1] : 0, y1 = kick[m], y2 = kick[m + 1], d = y0 - 2 * y1 + y2;
    return { t: (m + (d < 0 ? 0.5 * (y0 - y2) / d : 0)) / fps, s: mv };
  };
  const tops = [];                                     // 곡 전체에서 "또렷한 소리"의 기준(템포와 무관하게)
  for (let i = 1; i < n - 1; i++) if (kick[i] > kick[i - 1] && kick[i] >= kick[i + 1] && kick[i] > 0.05) tops.push(kick[i]);
  tops.sort((u, v) => v - u);
  const strong = tops[Math.floor(tops.length * 0.25)] || 0;
  const fit = (bpm0) => {
    let best = { score: -1, phase: 0 }, period = 60 / bpm0;
    for (let bpm = bpm0 - 0.06; bpm <= bpm0 + 0.06; bpm += 0.004) { const f = fold(60 / bpm); if (f.score > best.score) { best = f; period = 60 / bpm; } }
    let t0 = best.phase, picks = [];
    if (t0 > period - 0.03) t0 -= period;             // 첫 박이 0초 바로 앞뒤에 있는 경우
    for (let iter = 0; iter < 4; iter++) {
      const all = [];
      for (let k = 0; t0 + k * period < duration - 0.05; k++) { const p = peakNear(t0 + k * period, 0.035); if (p) all.push({ k, t: p.t, s: p.s }); }
      picks = all.filter((p) => p.s >= strong * 0.3 && Math.abs(p.t - (t0 + p.k * period)) < 0.035);
      if (picks.length < 8) break;
      let sk = 0, st = 0, skk = 0, skt = 0;
      for (const p of picks) { sk += p.k; st += p.t; skk += p.k * p.k; skt += p.k * p.t; }
      const m = picks.length, den = m * skk - sk * sk;
      if (!den) break;
      period = (m * skt - sk * st) / den; t0 = (st - period * sk) / m;
    }
    const span = picks.length ? picks[picks.length - 1].k - picks[0].k + 1 : 1;
    const power = picks.reduce((u, p) => u + Math.min(p.s, 3 * strong), 0) / span;   // 박마다 킥이 빠짐없이, 그리고 세게 있을수록 높다
    // 하나 걸러 하나가 약하면(킥-베이스-킥-베이스…) 그건 박이 아니라 박을 쪼갠 것이다
    const alt = [0, 0], cnt = [0, 0];
    for (const p of picks) { alt[p.k & 1] += Math.min(p.s, 3 * strong); cnt[p.k & 1]++; }
    const even = alt[0] / (cnt[0] || 1), odd = alt[1] / (cnt[1] || 1);
    return { period, t0, picks, cover: picks.length / span, power, balance: Math.min(even, odd) / (Math.max(even, odd) || 1), score: best.score };
  };
  const fits = cands.map(fit).filter((f) => f.picks.length >= 8);
  if (!fits.length) return { ok: false, reason: "박을 찾지 못했어요. 킥이 또렷한 곡인지 확인해 주세요.", duration };
  const bestPower = Math.max(...fits.map((f) => f.power));
  const good = fits.filter((f) => f.power >= bestPower * 0.92);
  const chosen = good.filter((f) => f.balance >= 0.7).sort((u, v) => u.period - v.period)[0] || good.sort((u, v) => v.power - u.power)[0];   // 비슷하게 잘 맞으면 더 빠른 쪽이 곡의 진짜 박
  const { period, t0, picks } = chosen;

  // 흔들림: 박마다 조금 넓게(±60ms) 킥을 다시 찾아, 직선에서 벗어난 정도를 16박씩 묶어 본다(가운데값). 그 최대.
  const res = [];
  for (let k = picks[0].k; t0 + k * period < duration - 0.05; k++) {
    const p = peakNear(t0 + k * period, 0.06);
    if (p && p.s >= strong * 0.5) res.push((p.t - (t0 + k * period)) * 1000);
  }
  let wobble = 0;
  for (let i = 0; i + 16 <= res.length; i += 8) {
    const w = res.slice(i, i + 16).sort((u, v) => u - v);
    wobble = Math.max(wobble, Math.abs((w[7] + w[8]) / 2));
  }
  const off = picks.map((p) => (p.t - (t0 + p.k * period)) * 1000);
  const jitter = Math.sqrt(off.reduce((s, r) => s + r * r, 0) / off.length);
  const total = Math.floor((duration - t0) / period) + 1;
  let first = picks[0].k;
  // 게임의 한 박: 공이 한 번 튀는 간격. 곡의 박이 너무 빠르면 두 박을 한 박으로(느리면 반 박을 한 박으로) 본다.
  const musicBpm = 60 / period;
  let per = 1;
  while (musicBpm / per > hint * 1.4) per *= 2;
  while (musicBpm / per < hint / 1.4) per /= 2;
  if (per === 2) {                                     // 두 박 중 어느 쪽이 "땅에 닿는 박"인가: 킥이 뚜렷이 더 센 쪽. 비슷하면 먼저 나오는 쪽.
    const sum = [0, 0], cnt = [0, 0];
    for (const p of picks) { sum[(p.k - first) & 1] += p.s; cnt[(p.k - first) & 1]++; }
    if (cnt[1] && sum[1] / cnt[1] > 1.15 * (sum[0] / (cnt[0] || 1))) first += 1;
  }
  return {
    ok: true, bpm: musicBpm / per, period: period * per, musicBpm, beatsPerBounce: per, offset: t0 + first * period, duration,
    beats: (total - first) / per, coverage: picks.length / total, wobbleMs: wobble, jitterMs: jitter,
  };
}

if (typeof module !== "undefined") module.exports = { analyzeTrack };

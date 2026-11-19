// 고리 사슬 찾기: 곡마다 16분음 자리의 어택(tools_onset16.py가 만든 on16.json)을 읽고, 라운드마다 피버·계단·세트·체크포인트·함정 앞이 아닌 '새 마디' 가운데 하이햇·스네어가
// 반 박마다 센 마디를 골라 그 어택 자리에 고리를 놓는다(간격 2·3·4칸). 실제 코스에 넣어 완주·고리마다 누름이 꼭 필요한지·±14스텝·멈춤을 쭉 눌러 건너면 죽는지 검사한다.
// 리듬: 10라운드부터는 모든 라운드와 달라야 해서 먼저 고른다. 쓰는 법: python3 tools_onset16.py songs.json . on16.json → ON16=on16.json node tools_chains.js 10,11,...,18,2,3,... → chains.json
const Lg = require('./logic.js');
const fs = require('fs'), ON = JSON.parse(fs.readFileSync(process.env.ON16 || 'on16.json', 'utf8'));
const ROUNDS = (process.argv[2] || '2,3,4,5,6,7,9,10,11,12,13,14,15,16,17,18').split(',').map(Number);
const MAXPER = +(process.env.MAXPER || 3), THR = +(process.env.THR || 0.4);
const sig = (p) => JSON.stringify([p.presses, p.holds]);
const taken = new Set(); Lg.COURSES.forEach((C) => C.bars.forEach((n) => { const p = Lg.PATTERNS[n]; if (p && p.mode !== 'rush') taken.add(sig(p)); }));
// 사슬의 모양: 낮은 사슬(첫 튐의 꼭대기 2~3칸에서, 또는 둘째 튐의 꼭대기 6~7칸에서 시작), 높은 사슬(0.5박에 이단 점프로 올라가 4~5칸에서 시작, 높이 3~5칸)
//   고리 간격은 2칸(반 박)·3칸(3/8박). 마지막 고리 뒤에는 반 박 넘게 남은 첫 박에 땅에 내려선다(그 뒤로는 보통 튐)
if (process.env.PRE) for (const arr of Object.values(JSON.parse(require('fs').readFileSync(process.env.PRE, 'utf8')))) for (const c of arr) taken.add(sig(c.pat));      // 먼저 고른 사슬의 리듬(뒤 라운드의 것)
const seqs = []; const grow = (a, hi, min) => { if (a.length >= min) seqs.push({ cs: a.slice(), hi }); for (const g of [2, 3, 4]) { const c = a[a.length - 1] + g; if (c <= 13) { a.push(c); grow(a, hi, min); a.pop(); } } };
grow([2], false, 4); grow([3], false, 4); grow([4], true, 3); grow([5], true, 3);
// (마지막 고리는 11칸 넘어서: 마디 끝에 내려서야 빈 박이 안 생긴다. 둘째 튐부터 시작하는 사슬은 첫 박이 비어서 뺐다)
for (let i = seqs.length - 1; i >= 0; i--) if (seqs[i].cs[seqs[i].cs.length - 1] < 11) seqs.splice(i, 1);
const landX = (c) => { const t = c / 4; let lb = Math.ceil(t + 1e-6); if (lb - t < 0.5) lb++; return lb * 4; };
const mk = (o) => { const cs = o.cs, h = o.hi ? 3 : 1, lx = landX(cs[cs.length - 1]); return { holds: [], presses: [...(o.hi ? [0.5] : []), ...cs.map((c) => c / 4)], tol: 0.18, set: true, rings: cs.flatMap((c) => [[c, h], [c, h + 1]]), lava: [[o.hi ? 1 : cs[0] - 1, lx - 2]] }; };
const result = {};
for (const r of ROUNDS) {
  const C = Lg.COURSES[r - 1], on = ON[r]; if (!on) continue;
  const L0 = Lg.buildLevel(C), rideBar = new Set(); for (const q of L0.rides) for (let b = q[0] / 16; b < q[1] / 16; b++) rideBar.add(b);
  const cnt = {}; C.bars.forEach((n) => (cnt[n] = (cnt[n] || 0) + 1));
  const cand = C.bars.map((n, b) => { const p = Lg.PATTERNS[n]; return !p || n === 'flat' || n === 'goal' || p.mode === 'rush' || p.stair || p.set || p.cp || p.traps || p.boxes || p.rings || p.lava || p.movers || rideBar.has(b) || cnt[n] > 1 || [1, 2].some((d) => { const q = Lg.PATTERNS[C.bars[b + d]]; return q && q.traps; }) || !/^g\d+_\d+$/.test(n) ? -1 : b; }).filter((b) => b >= 0);
  const S = (b, k) => Math.max(on.hi[b * 16 + k] || 0, 0.8 * (on.mid[b * 16 + k] || 0));
  const e8 = (b) => [2, 4, 6, 8, 10, 12].reduce((u, k) => u + S(b, k), 0) / 6;
  const ranked = cand.map((b) => ({ b, e: e8(b) })).filter((o) => o.e >= THR).sort((u, v) => v.e - u.e);
  // 이어진 마디를 먼저(사슬 둘·셋이 잇달아), 그다음 센 마디
  const pick = []; for (const o of ranked) { if (pick.length >= MAXPER) break; pick.push(o.b); }
  pick.sort((u, v) => u - v);
  const chosen = [];
  let bars = C.bars.slice();
  for (const b of pick) {
    const opts = seqs.filter((q) => landX(q.cs[q.cs.length - 1]) <= 16).map((q) => ({ ...q, sc: q.cs.reduce((u, c) => u + S(b, c), 0) + (q.hi ? S(b, 2) : 0) + 0.15 * q.cs.length - (q.cs.length < 4 ? 0.4 : 0) })).sort((u, v) => v.sc - u.sc);
    let done = null; const R_ = {};
    for (const o of opts) {
      const p = mk(o); if (taken.has(sig(p))) { R_.taken = (R_.taken || 0) + 1; continue; }
      const name = `ch${r}_${b}`; Lg.PATTERNS[name] = p;
      const nb = bars.slice(); nb[b] = name;
      let L; try { L = Lg.buildLevel({ ...C, bars: nb }); } catch (e) { continue; }
      if (L.fixed.length) { R_.fixed = (R_.fixed || 0) + 1; continue; }
      const P = L.ref.presses, H = L.ref.holds, lo = b * 384, inb = (v) => v >= lo && v < lo + 384;
      const go = (pr) => { const inp = Lg.planInput({ presses: pr, holds: H }), s = Lg.spawnState(L, -1); while (!s.dead && !s.won) Lg.stepState(L, s, inp.press.has(s.step + 1), null, inp.hold.has(s.step + 1)); return s; };
      if (!go(P).won) { R_.refdie = (R_.refdie || 0) + 1; continue; }
      const mine = P.filter(inb); let ok = mine.length === p.presses.length;
      for (const v of mine) { if (!ok) break; const s = go(P.filter((q) => q !== v)); if (!(s.dead && Math.floor(s.x / 16) === b)) ok = false; for (const d of [-14, 14]) if (ok && !go(P.map((q) => (q === v ? q + d : q))).won) ok = false; }
      if (ok) { const s2 = (() => { const inp = Lg.planInput({ presses: P.filter((v) => !inb(v) || v === mine[0]), holds: [...H, [mine[0] + 6, lo + 384]] }), st = Lg.spawnState(L, -1); while (!st.dead && !st.won) Lg.stepState(L, st, inp.press.has(st.step + 1), null, inp.hold.has(st.step + 1)); return st; })(); if (!(s2.dead && Math.floor(s2.x / 16) === b)) ok = false; }      // 멈춤을 쭉 누르고 건너면 안 된다
      if (!ok) { R_.check = (R_.check || 0) + 1; delete Lg.PATTERNS[name]; continue; }
      done = { b, name, cs: o.cs, hi: o.hi, pat: p, presses: p.presses, score: +o.sc.toFixed(2), was: C.bars[b] }; if (r >= 10) taken.add(sig(p)); bars = nb; break;      // (10라운드 이전끼리는 리듬이 같아도 된다. 10라운드부터는 모든 라운드와 달라야 한다)
    }
    if (done) chosen.push(done); else console.log(`R${r} 마디 ${b}: 맞는 사슬을 못 찾았다 ${JSON.stringify(R_)} / ${opts.length}`);
  }
  result[r] = chosen;
  console.log(`R${r}: 후보 ${cand.length}, 연타 센 마디 ${ranked.slice(0, 6).map((o) => o.b + '(' + o.e.toFixed(2) + ')').join(' ')} → ${chosen.map((c) => c.b + ':' + c.presses.join('/')).join('  ')}`);
}
fs.writeFileSync(process.env.OUT || 'chains.json', JSON.stringify(result, null, 1));

// 조각(마디)별 입력 여유 측정.
// 자동 풀이가 찾은 입력(멈춤 시작·끝, 대시 시점)을 하나씩 앞뒤로 밀어 보며, 다른 입력은 그대로 둔 채
// 죽지 않는 범위를 잰다. 각 입력을 그 범위 한가운데로 옮긴 뒤 한 번 더 재서(가운데 맞춤) 보고한다.
// 사용: node bounce2d/tests/windows.js [BPM]
const Lg = require('../logic.js');

// 높은 길(hi_*)과 계단은 앞뒤에 계단을 붙여야 실제 코스와 같은 상황이 된다
function context(name) {
  if (name.startsWith('hi')) return { bars: ['flat', 'up', name, 'down', 'flat', 'flat', 'goal'], at: 2 };
  if (name === 'down') return { bars: ['flat', 'up', 'down', 'flat', 'flat', 'goal'], at: 2 };
  if (name === 'up') return { bars: ['flat', 'up', 'down', 'flat', 'flat', 'goal'], at: 1 };
  return { bars: ['flat', name, 'flat', 'flat', 'goal'], at: 1 };
}

function measure(name, bpm = 96) {
  const ctx = context(name);
  const lv = Lg.buildLevel({ name, bpm, bars: ctx.bars, sections: [{ bar: 0, id: 'a' }] });
  const ms = 60000 / bpm / Lg.SUB;
  const r = Lg.solve(lv, Lg.spawnState(lv, -1), { grid: 6 });
  if (!r.plan) return { name, solvable: false };
  // 붙어 있는 멈춤 구간을 하나로 합쳐 입력 목록을 만든다
  const acts = [];
  for (const [a, b] of r.plan.holds) { const last = acts[acts.length - 1]; if (last && last.type === 'hold' && last.end === a) last.end = b; else acts.push({ type: 'hold', start: a, end: b }); }
  for (const d of r.plan.dashes) acts.push({ type: 'dash', step: d });
  const endX = 16 * (ctx.bars.length - 2) + 8;
  const alive = () => {
    const s = Lg.spawnState(lv, -1), dash = new Set(acts.filter(a => a.type === 'dash').map(a => a.step));
    const holds = acts.filter(a => a.type === 'hold');
    while (!s.dead && !s.won && s.x < endX) { const st = s.step + 1; Lg.stepState(lv, s, dash.has(st), null, holds.some(h => st >= h.start && st < h.end)); }
    return !s.dead;
  };
  if (!alive()) return { name, solvable: true, error: '합친 입력으로 재생 실패' };
  // 없어도 되는 입력은 뺀다(자동 풀이는 필요 없는 멈춤을 넣기도 한다)
  for (let i = acts.length - 1; i >= 0; i--) { const [x] = acts.splice(i, 1); if (!alive()) acts.splice(i, 0, x); }
  acts.sort((p, q) => (p.start ?? p.step) - (q.start ?? q.step));
  const params = [];
  for (const a of acts) { if (a.type === 'hold') { params.push({ a, key: 'start', label: '멈춤 시작' }); params.push({ a, key: 'end', label: '멈춤 끝' }); } else params.push({ a, key: 'step', label: '대시' }); }
  let out = [];
  for (let round = 0; round < 3; round++) {
    out = [];
    for (const p of params) {
      const v0 = p.a[p.key];
      const okAt = (v) => { p.a[p.key] = v; const valid = p.a.type !== 'hold' || p.a.end > p.a.start; const res = valid && alive(); p.a[p.key] = v0; return res; };
      let lo = v0, hi = v0;
      while (v0 - lo < 200 && okAt(lo - 1)) lo--;
      while (hi - v0 < 200 && okAt(hi + 1)) hi++;
      p.a[p.key] = Math.round((lo + hi) / 2);
      out.push({ label: p.label, ms: (hi - lo + 1) * ms });
    }
  }
  return { name, solvable: true, inputs: out, min: Math.min(...out.map(o => o.ms)) };
}

module.exports = { measure, context };

if (require.main === module) {
  const bpm = +process.argv[2] || Lg.COURSE.bpm;
  console.log(`입력 여유 (${bpm} BPM, 한 번 튀는 데 ${(60 / bpm).toFixed(2)}초)`);
  for (const name of Object.keys(Lg.CHUNKS)) {
    if (['flat', 'cp', 'goal'].includes(name)) continue;
    const m = measure(name, bpm);
    console.log(name.padEnd(11), !m.solvable ? '풀 수 없음' : m.error || m.inputs.map(i => `${i.label} ${i.ms >= 600 ? '600+' : i.ms.toFixed(0)}`).join('  '));
  }
}

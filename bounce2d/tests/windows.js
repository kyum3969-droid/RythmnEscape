// 패턴별 입력 여유 측정.
// 패턴에 적힌 입력(멈춤 시작·끝, 점프 시각)을 하나씩 앞뒤로 밀어 보며, 다른 입력은 그대로 둔 채
// 죽지 않는 범위를 잰다. 일찍 쪽 / 늦게 쪽 여유를 ms로 보고한다.
// 사용: node bounce2d/tests/windows.js [BPM] [패턴 이름...]
const Lg = require('../logic.js');

function measure(name, bpm = 96) {
  // 피버 패턴은 구간 한가운데에 있을 때를 잰다(앞뒤에 빈 피버 마디)
  const rush = Lg.PATTERNS[name].mode === 'rush';
  const wide = rush && Lg.PATTERNS[name].wide;       // 넓은 통로의 패턴은 계단으로 올라가서 시작하고 계단으로 내려온다
  const ob = !!Lg.PATTERNS[name].ob;                 // 엇박 길 한가운데의 패턴은 길에 올라탄 상태에서 잰다
  const lv = Lg.buildLevel({ name, bpm, tol: process.env.TOL ? +process.env.TOL : Lg.COURSE.tol, bars: ob ? ['flat', 'obIn', name, 'obOut', 'flat', 'goal'] : rush ? ['flat', wide ? 'wUp' : 'zE', name, wide ? 'wDn' : 'zE', 'flat', 'goal'] : ['flat', name, 'flat', 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });
  const ms = 60000 / bpm / Lg.SUB;
  const acts = [];
  for (const [a, b] of lv.ref.holds) acts.push({ type: 'hold', start: a, end: b });
  for (const d of lv.ref.presses) acts.push({ type: 'jump', step: d });
  acts.sort((p, q) => (p.start ?? p.step) - (q.start ?? q.step));
  const endX = 16 * (rush || ob ? 4 : 3) + 8;
  const alive = (list = acts) => {
    const s = Lg.spawnState(lv, -1), press = new Set(list.filter(a => a.type === 'jump').map(a => a.step));
    const holds = list.filter(a => a.type === 'hold');
    while (!s.dead && !s.won && s.x < endX) { const st = s.step + 1; Lg.stepState(lv, s, press.has(st), null, holds.some(h => st >= h.start && st < h.end)); }
    return !s.dead;
  };
  if (!alive()) return { name, ok: false, fixed: lv.fixed };
  const out = [];
  for (const a of acts) for (const [key, label] of a.type === 'hold' ? [['start', '누르기 시작'], ['end', '떼기']] : [['step', '누르기']]) {
    const v0 = a[key];
    const okAt = (v) => { a[key] = v; const res = (a.type !== 'hold' || a.end > a.start) && alive(); a[key] = v0; return res; };
    let lo = v0, hi = v0;
    while (v0 - lo < 120 && okAt(lo - 1)) lo--;
    while (hi - v0 < 120 && okAt(hi + 1)) hi++;
    out.push({ label, early: (v0 - lo) * ms, late: (hi - v0) * ms });
  }
  // 입력을 하나씩 빼 보거나 아예 안 눌렀을 때 죽는가 = 장애물이 그 입력을 정말로 요구하는가
  const needed = acts.map((a) => !alive(acts.filter((x) => x !== a)));
  return { name, ok: true, needed, idleDies: !alive([]), acts: acts.map((a) => a.type), inputs: out, min: Math.min(...out.map(o => Math.min(o.early, o.late))), fixed: lv.fixed };
}

module.exports = { measure };

if (require.main === module) {
  const bpm = +process.argv[2] || Lg.COURSE.bpm;
  const names = process.argv.slice(3);
  console.log(`입력 여유 (${bpm} BPM, 한 번 튀는 데 ${(60 / bpm).toFixed(2)}초) — 일찍/늦게 눌러도 되는 시간(ms), 600은 "충분"`);
  for (const name of names.length ? names : Object.keys(Lg.PATTERNS)) {
    if (!Lg.PATTERNS[name].holds.length && !Lg.PATTERNS[name].presses.length) continue;
    const m = measure(name, bpm);
    const f = (v) => (v >= 600 ? '충분' : v.toFixed(0));
    if (!m.ok) { console.log(name.padEnd(10), '패턴대로 달려도 죽음'); continue; }
    console.log(name.padEnd(10), m.inputs.map(i => `${i.label} -${f(i.early)}/+${f(i.late)}`).join('   ') + (m.fixed.length ? `   [걷어낸 칸 ${m.fixed.join(',')}]` : '')
      + `\n${' '.repeat(11)}꼭 필요한 입력: ${m.acts.map((t, i) => (t === 'hold' ? '누르고 있기' : '누르기') + (m.needed[i] ? '○' : '✕')).join(' ')}${m.idleDies ? '' : '  (아무것도 안 눌러도 지나감!)'}`);
  }
}

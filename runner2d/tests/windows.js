// 타이밍 여유 측정: 앞의 입력을 모두 '여유 한가운데'에서 눌렀다고 치고,
// 다음 입력을 얼마나 일찍/늦게 눌러도 그 뒤를 이어 갈 수 있는지(ms)를 입력마다 잰다.
// 연속 대시처럼 앞 입력에 따라 뒤 입력의 여유가 달라지는 구간을 사람 기준으로 보기 위한 것.
const Lg = require('../logic.js');

function centeredWindows(L, from = -1) {
  const msPerStep = 60000 / L.bpm / Lg.SUB;
  const fixed = [], out = [];
  for (let guard = 0; guard < 500; guard++) {
    const s = Lg.spawnState(L, from), set = new Set(fixed);
    const last = fixed.length ? fixed[fixed.length - 1] : s.step;
    while (!s.dead && !s.won && s.step < last) Lg.stepState(L, s, set.has(s.step + 1));
    if (s.dead) throw new Error('고정한 입력으로 죽음: ' + s.cause);
    const r = Lg.solve(L, s, { grid: 6 });
    if (!r.presses) throw new Error(`마디 ${Math.floor(s.x / 16)}에서 이어 갈 수 없음`);
    if (!r.presses.length) break;
    const p = r.presses[0];
    const base = { ...s };
    while (base.step < Math.max(last, p - 61)) Lg.stepState(L, base, false);
    const valid = new Map();
    for (let sh = -60; sh <= 60; sh++) {
      const t = p + sh;
      if (t <= base.step) continue;
      const n = { ...base }; let type = null;
      while (!n.dead && n.step < t + 31) {
        const ev = []; Lg.stepState(L, n, n.step + 1 === t, ev);
        if (n.step >= t && !type) { const e = ev.find((e) => e.type === 'jump' || e.type === 'dash'); if (e) type = e.type; }
        if (type) break;
      }
      if (n.dead || !type) continue;
      if (Lg.solve(L, n, { grid: 6, untilX: n.x + 14 }).presses) valid.set(sh, type);
    }
    let lo = 0, hi = 0;
    if (valid.has(0)) { while (valid.has(lo - 1)) lo--; while (valid.has(hi + 1)) hi++; }
    let center = Math.round((lo + hi) / 2);
    // 가운데로 옮겨도 끝까지 갈 수 있는지 확인, 안 되면 원래 시점 유지
    const chk = { ...base };
    while (!chk.dead && chk.step < p + center) Lg.stepState(L, chk, chk.step + 1 === p + center);
    if (chk.dead || !Lg.solve(L, chk, { grid: 6 }).presses) center = 0;
    fixed.push(p + center);
    out.push({ bar: Math.floor(Lg.TPB * (p + center) / Lg.SUB / 16), ms: (hi - lo + 1) * msPerStep, type: valid.get(center) || '?' });
  }
  return out;
}

module.exports = { centeredWindows };

if (require.main === module) {
  const L = Lg.buildLevel(Lg.COURSE);
  const w = centeredWindows(L);
  const byBar = {};
  for (const x of w) (byBar[x.bar] = byBar[x.bar] || []).push(`${x.type === 'jump' ? '점프' : '대시'} ${x.ms >= 290 ? '290+' : x.ms.toFixed(0)}`);
  for (const [b, list] of Object.entries(byBar)) console.log(String(b).padStart(3), Lg.COURSE.bars[b].padEnd(10), list.join('  '));
}

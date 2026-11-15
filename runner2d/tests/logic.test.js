// 실행: node runner2d/tests/logic.test.js
// 코스가 실제로 깰 수 있는지(처음부터, 각 체크포인트부터), 타이밍 여유가 너무 좁지 않은지 확인한다.
const Lg = require('../logic.js');
const L = Lg.buildLevel(Lg.COURSE);
const msPerStep = 60000 / L.bpm / Lg.SUB;
let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ok  ' : '  FAIL ') + msg); if (!c) fails++; };
function run(presses, from = -1) {
  const s = Lg.spawnState(L, from), set = new Set(presses), ev = [];
  while (!s.dead && !s.won) Lg.stepState(L, s, set.has(s.step + 1), ev);
  return { s, ev };
}

console.log(`코스: ${L.bars}마디, ${(L.cols / Lg.TPB * 60 / L.bpm).toFixed(1)}초, 체크포인트 마디 ${L.cps.map(c => c.bar).join(', ')}`);
const idle = run([]);
ok(idle.s.dead && idle.s.cause === 'spike' && Math.floor(idle.s.x / 16) === 2, '입력 없이 달리면 첫 가시(마디 2)에서 죽는다');

for (const [grid, offset] of [[12, 0], [12, 6], [8, 3]]) {
  const r = Lg.solve(L, Lg.spawnState(L, -1), { grid, offset });
  ok(!!r.presses, `처음부터 클리어 가능 (탐색 간격 ${grid}스텝, 어긋남 ${offset}스텝)` + (r.presses ? '' : ` — 마디 ${Math.floor(r.best / 16)} ${Lg.COURSE.bars[Math.floor(r.best / 16)]}에서 막힘`));
}
const sol = Lg.solve(L, Lg.spawnState(L, -1), { grid: 12 }).presses;
const full = run(sol);
const count = (t) => full.ev.filter(e => e.type === t).length;
ok(full.s.won, `풀이를 그대로 재생하면 완주 (점프 ${count('jump')}, 대시 ${count('dash')})`);
ok(count('checkpoint') === L.cps.length, `체크포인트 ${L.cps.length}개를 모두 지난다`);
const wallCols = new Set();
for (let c = 0; c < L.cols; c++) for (let r = 0; r < Lg.ROWS; r++) if (Lg.tile(L, c, r) === 'D') wallCols.add(c);
ok(wallCols.size > 0 && new Set(full.ev.filter(e => e.type === 'break').map(e => e.c)).size === wallCols.size, `대시벽 ${wallCols.size}개를 모두 대시로 깬다`);
ok(count('dash') >= 10, '대시가 꼭 필요한 구간이 충분히 있다');

L.cps.forEach((cp, i) => {
  const s = Lg.spawnState(L, i);
  ok(s.onGround && Math.abs(s.x - (cp.col - 4)) < 1e-9, `체크포인트 ${i + 1}: 한 박자 앞 평지에서 다시 시작`);
  ok(!!Lg.solve(L, s, { grid: 12 }).presses, `체크포인트 ${i + 1}에서 다시 시작해도 완주 가능`);
});

// 대시 없이는 못 지나가는지: 대시를 막아 보면 첫 대시 구간에서 막혀야 한다
{
  const noDash = { ...Lg.spawnState(L, -1) };
  const seen = new Set(); let best = 0; const stack = [noDash];
  while (stack.length) {
    const s = stack.pop();
    const k = `${s.step}|${Math.round(s.y * 16)}|${Math.round(s.vy * 2)}|${s.onGround}`;
    if (seen.has(k)) continue; seen.add(k);
    best = Math.max(best, s.x);
    for (const press of (s.onGround || s.coyote > 0) ? [true, false] : [false]) {
      const n = { ...s };
      Lg.stepState(L, n, press);
      for (let i = 1; i < 12 && !n.dead && !n.won; i++) Lg.stepState(L, n, false);
      if (!n.dead && !n.won) stack.push(n);
      if (n.won) best = Infinity;
    }
  }
  ok(Math.floor(best / 16) === 10, `점프만으로는 마디 10(첫 대시 구간)에서 막힌다 (마디 ${Math.floor(best / 16)})`);
}

// 타이밍 여유: 각 입력을 앞뒤로 밀어도 그 뒤를 이어 갈 수 있는 폭
const tight = {};
for (let i = 0; i < sol.length; i++) {
  const okShift = (shift) => {
    const p = new Set(sol.slice(0, i).concat([sol[i] + shift])), s = Lg.spawnState(L, -1);
    while (!s.dead && s.step < sol[i] + Math.max(shift, 0) + 1) Lg.stepState(L, s, p.has(s.step + 1));
    if (s.dead) return false;
    const until = i + 1 < sol.length ? Lg.TPB * (sol[i + 1] + Lg.SUB) / Lg.SUB : L.goalX + 1;
    return !!Lg.solve(L, s, { grid: 6, untilX: Math.min(until, L.goalX + 1) }).presses;
  };
  let early = 0, late = 0;
  while (early > -60 && okShift(early - 1)) early--;
  while (late < 60 && okShift(late + 1)) late++;
  const bar = Math.floor(Lg.TPB * sol[i] / Lg.SUB / 16), win = (late - early + 1) * msPerStep;
  tight[bar] = Math.min(tight[bar] ?? 1e9, win);
}
const line = Object.entries(tight).map(([b, w]) => `${b}:${w > 290 ? '290+' : w.toFixed(0)}`).join('  ');
console.log('  마디별 가장 좁은 타이밍 여유(ms)  ' + line);
const min = Math.min(...Object.values(tight));
ok(min >= 50, `가장 좁은 입력 여유 ${min.toFixed(0)}ms (60fps 기준 3프레임 이상)`);

console.log('실패 ' + fails + '건');
process.exit(fails ? 1 : 0);

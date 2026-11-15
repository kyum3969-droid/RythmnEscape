// 실행: node bounce2d/tests/logic.test.js
const Lg = require('../logic.js');
const L = Lg.buildLevel(Lg.COURSE);
let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ok  ' : '  FAIL ') + msg); if (!c) fails++; };
const barOf = (x) => Math.floor(x / 16);
function run(lv, plan, from = -1) {
  const s = Lg.spawnState(lv, from), inp = plan ? Lg.planInput(plan) : { dash: new Set(), hold: new Set() }, ev = [];
  while (!s.dead && !s.won) { Lg.stepState(lv, s, inp.dash.has(s.step + 1), ev, inp.hold.has(s.step + 1)); for (const e of ev) if (e.step === undefined) e.step = s.step; }
  return { s, ev };
}
const flat = Lg.buildLevel({ name: 't', bpm: 128, bars: ['flat', 'flat', 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });

console.log(`코스: ${L.bars}마디, ${(L.cols / Lg.TPB * 60 / L.bpm).toFixed(1)}초, 체크포인트 마디 ${L.cps.map(c => c.bar).join(', ')}`);

console.log('== 기본 동작 ==');
{
  const r = run(flat, null);
  const bounces = r.ev.filter(e => e.type === 'bounce');
  ok(r.s.won && bounces.length >= 10 && bounces.every(e => e.step % Lg.SUB <= 1), `평지: 아무것도 안 눌러도 박자마다 튄다 (${bounces.length}번, 전부 박자 정각)`);
  // 꼭대기에서 멈춤
  const s = Lg.spawnState(flat, -1);
  while (s.step < 49) Lg.stepState(flat, s, false, null, false);
  const h0 = 9 - s.y, x0 = s.x;
  for (let i = 0; i < 60; i++) Lg.stepState(flat, s, false, null, true);
  ok(Math.abs((9 - s.y) - h0) < 1e-9 && s.frozen && Math.abs(s.x - x0 - 60 * 4 / 96) < 1e-9, `멈춤: 누르고 있으면 높이는 그대로(${h0.toFixed(2)}칸), 세상은 계속 흐른다`);
  for (let i = 0; i < 60; i++) Lg.stepState(flat, s, false, null, true);
  ok(!s.frozen && s.freeze === 0 && (9 - s.y) < h0, '멈춤: 최대 1박자. 다 쓰면 누르고 있어도 떨어진다');
  while (!s.onGround || s.freeze === 0) Lg.stepState(flat, s, false, null, false);
  while (s.onGround) Lg.stepState(flat, s, false, null, false);
  ok(s.freeze === Lg.FREEZE_STEPS, '멈춤: 다시 튀면 가득 찬다');
  // 놓았다 다시 누르기
  const a = Lg.spawnState(flat, -1);
  while (a.step < 40) Lg.stepState(flat, a, false, null, false);
  for (let i = 0; i < 30; i++) Lg.stepState(flat, a, false, null, true);
  for (let i = 0; i < 10; i++) Lg.stepState(flat, a, false, null, false);
  Lg.stepState(flat, a, false, null, true);
  ok(a.frozen && a.freeze === Lg.FREEZE_STEPS - 31, '멈춤: 한 번 튀는 동안 남은 만큼은 나눠 쓸 수 있다');
  // 멈춘 채로 대시
  const d = Lg.spawnState(flat, -1), ev = [];
  while (d.step < 49) Lg.stepState(flat, d, false, null, false);
  for (let i = 0; i < 10; i++) Lg.stepState(flat, d, false, null, true);
  Lg.stepState(flat, d, true, ev, true);
  ok(d.dashing > 0 && !d.frozen && ev.some(e => e.type === 'dash'), '멈춘 채로 대시를 누르면 대시가 나간다');
  // 땅에서는 아무 일도 없음
  const g = Lg.spawnState(flat, -1);                 // 대시 후에는 박자가 어긋나 착지 → 다음 박자까지 굴러간다
  while (g.step < 49) Lg.stepState(flat, g, false, null, false);
  Lg.stepState(flat, g, true, null, false);
  while (!g.onGround) Lg.stepState(flat, g, false, null, false);
  const rollY = g.y;
  for (let i = 0; i < 5; i++) Lg.stepState(flat, g, true, null, true);
  ok(g.onGround && !g.frozen && g.dashing === 0 && g.y === rollY, '굴러가는 동안(땅)에는 입력이 듣지 않는다');
}

console.log('== 코스 ==');
const idle = run(L, null);
ok(idle.s.dead && idle.s.cause === 'spike' && barOf(idle.s.x) === 2, '아무것도 안 누르면 첫 가시(마디 2)에서 죽는다');
let sol = null;
for (const o of [{ grid: 12 }, { grid: 12, offset: 6 }, { grid: 8, offset: 3 }]) {
  const r = Lg.solve(L, Lg.spawnState(L, -1), o);
  if (!sol) sol = r.plan;
  ok(!!r.plan, `처음부터 클리어 가능 (탐색 간격 ${o.grid}스텝, 어긋남 ${o.offset || 0})` + (r.plan ? '' : ` — 마디 ${barOf(r.best)} ${Lg.COURSE.bars[barOf(r.best)]}에서 막힘`));
}
const full = run(L, sol);
const n = (t) => full.ev.filter(e => e.type === t).length;
ok(full.s.won, `풀이를 그대로 재생하면 완주 (대시 ${n('dash')}번, 멈춤 ${n('freeze')}번, 고리 ${n('ring')}번, 점프대 ${n('pad')}번)`);
ok(n('checkpoint') === L.cps.length && L.cps.length === 4, '체크포인트 4개를 모두 지난다');
ok(full.ev.filter(e => e.type === 'bounce').every(e => e.step % Lg.SUB <= 8), '코스 내내 박자에 맞춰 튄다(40ms 이내)');
L.cps.forEach((cp, i) => ok(!!Lg.solve(L, Lg.spawnState(L, i), { grid: 12 }).plan, `체크포인트 ${i + 1}에서 다시 시작해도 완주 가능`));
{
  const nf = Lg.solve(L, Lg.spawnState(L, -1), { grid: 12, noFreeze: true });
  ok(!nf.plan, `멈춤 없이는 못 깬다 (마디 ${barOf(nf.best)} ${Lg.COURSE.bars[barOf(nf.best)]}에서 막힘)`);
  const nd = Lg.solve(L, Lg.spawnState(L, -1), { grid: 12, noDash: true });
  ok(!nd.plan && barOf(nd.best) === 10, `대시 없이는 첫 벽(마디 10)에서 막힌다`);
}
console.log('== 조각별 ==');
for (const name of Object.keys(Lg.CHUNKS)) {
  if (['flat', 'cp', 'goal'].includes(name)) continue;
  const lv = Lg.buildLevel({ name, bpm: 128, bars: ['flat', name, 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });
  // 굵은 단위(1/4박 = 약 117ms)로만 입력해도 깰 수 있으면 타이밍이 넉넉하다고 본다
  const coarse = [0, 8, 16].every((offset) => !!Lg.solve(lv, Lg.spawnState(lv, -1), { grid: 24, offset }).plan);
  ok(run(lv, null).s.dead && coarse, `${name}: 아무것도 안 하면 죽고, 1/4박 단위 입력으로도 깰 수 있다`);
}
console.log('실패 ' + fails + '건');
process.exit(fails ? 1 : 0);

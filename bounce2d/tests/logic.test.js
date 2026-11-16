// 실행: node bounce2d/tests/logic.test.js
const Lg = require('../logic.js');
const L = Lg.buildLevel(Lg.COURSE);
let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ok  ' : '  FAIL ') + msg); if (!c) fails++; };
const barOf = (x) => Math.floor(x / 16);
function run(lv, plan, from = -1) {
  const s = Lg.spawnState(lv, from), inp = plan ? Lg.planInput(plan) : { press: new Set(), hold: new Set() }, ev = [];
  while (!s.dead && !s.won) { Lg.stepState(lv, s, inp.press.has(s.step + 1), ev, inp.hold.has(s.step + 1)); for (const e of ev) if (e.step === undefined) e.step = s.step; }
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
}

console.log('== 점프 / 이단 점프 ==');
{
  const H = (st) => 9 - st.y;
  // 공중에서 누르면 이단 점프: 꼭대기에서 한 번 더 → 높이 약 4.5칸
  const d = Lg.spawnState(flat, -1), ev = [];
  while (d.step < 49) Lg.stepState(flat, d, false, null, false);
  Lg.stepState(flat, d, true, ev, false);
  let maxH = 0; const x0 = d.x;
  while (!d.onGround) { Lg.stepState(flat, d, false, ev, false); maxH = Math.max(maxH, H(d)); if (ev.some(e => e.type === 'land')) break; }
  ok(ev.some(e => e.type === 'double') && maxH > 4.3 && maxH < 4.6, `공중에서 누르면 이단 점프 (꼭대기에서 쓰면 높이 ${maxH.toFixed(2)}칸)`);
  ok(d.x - x0 > 4.5 && d.x - x0 < 5.2, `이단 점프 뒤 ${(d.x - x0).toFixed(1)}칸을 더 날아 착지한다`);
  // 한 번 튈 때마다 한 번만
  const o = Lg.spawnState(flat, -1), ev2 = [];
  while (o.step < 30) Lg.stepState(flat, o, false, null, false);
  Lg.stepState(flat, o, true, ev2, false);
  for (let i = 0; i < 40; i++) Lg.stepState(flat, o, false, ev2, false);
  Lg.stepState(flat, o, true, ev2, false);
  for (let i = 0; i < 40; i++) Lg.stepState(flat, o, false, ev2, false);
  ok(ev2.filter(e => e.type === 'double').length === 1, '이단 점프는 한 번 튈 때마다 한 번만');
  // 이단 점프 뒤에는 박자가 어긋나 착지 → 굴러간다. 굴러가는 중에 누르면 그 자리에서 점프
  const g = Lg.spawnState(flat, -1), ev3 = [];
  while (g.step < 49) Lg.stepState(flat, g, false, null, false);
  Lg.stepState(flat, g, true, null, false);
  while (!g.onGround) Lg.stepState(flat, g, false, null, false);
  for (let i = 0; i < 5; i++) Lg.stepState(flat, g, false, ev3, true);
  ok(g.onGround && !g.frozen && g.step % Lg.SUB > 12, '박자와 어긋나게 착지하면 굴러간다(멈춤은 땅에서 듣지 않음)');
  Lg.stepState(flat, g, true, ev3, false);
  ok(!g.onGround && ev3.some(e => e.type === 'jump') && g.djAvail, '굴러가는 중에 누르면 그 자리에서 점프하고, 이단 점프도 다시 쓸 수 있다');
  let mh = 0; while (!g.onGround) { Lg.stepState(flat, g, false, null, false); mh = Math.max(mh, H(g)); }
  ok(mh > 2.1 && mh < 2.3, `눌러서 뛴 점프도 높이는 같다 (${mh.toFixed(2)}칸)`);
  // 착지 직전에 눌러 두면(이단 점프를 이미 쓴 뒤) 착지하자마자 점프
  const b = Lg.spawnState(flat, -1), ev4 = [];
  while (b.step < 49) Lg.stepState(flat, b, false, null, false);
  Lg.stepState(flat, b, true, null, false);
  while (9 - b.y > 0.35 || b.vy < 0) Lg.stepState(flat, b, false, null, false);
  Lg.stepState(flat, b, true, ev4, false);
  for (let i = 0; i < 25; i++) Lg.stepState(flat, b, false, ev4, false);
  ok(ev4.some(e => e.type === 'land') && ev4.some(e => e.type === 'jump'), '착지 직전에 누르면 착지하자마자 점프한다');
  // 멈춘 채로 점프를 누르면 손을 떼는 순간 솟는다
  const f = Lg.spawnState(flat, -1);
  while (f.step < 49) Lg.stepState(flat, f, false, null, false);
  for (let i = 0; i < 10; i++) Lg.stepState(flat, f, false, null, true);
  const fh = H(f);
  Lg.stepState(flat, f, true, null, true);
  for (let i = 0; i < 5; i++) Lg.stepState(flat, f, false, null, true);
  const still = Math.abs(H(f) - fh) < 1e-9;
  for (let i = 0; i < 20; i++) Lg.stepState(flat, f, false, null, false);
  ok(still && H(f) > fh + 0.5, '멈춘 채로 점프를 누르면, 손을 떼는 순간 위로 솟는다');
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
ok(full.s.won, `풀이를 그대로 재생하면 완주 (이단 점프 ${n('double')}번, 땅에서 점프 ${n('jump')}번, 멈춤 ${n('freeze')}번, 고리 ${n('ring')}번, 점프대 ${n('pad')}번)`);
ok(n('checkpoint') === L.cps.length && L.cps.length === 4, '체크포인트 4개를 모두 지난다');
ok(full.ev.filter(e => e.type === 'bounce').every(e => e.step % Lg.SUB <= 12), '코스 내내 박자에 맞춰 튄다(늦어도 1/8박 이내, 늦은 만큼 낮게 튀어 다음 박자에 맞춤)');
L.cps.forEach((cp, i) => ok(!!Lg.solve(L, Lg.spawnState(L, i), { grid: 12 }).plan, `체크포인트 ${i + 1}에서 다시 시작해도 완주 가능`));
{
  const nf = Lg.solve(L, Lg.spawnState(L, -1), { grid: 12, noFreeze: true });
  ok(!nf.plan, `멈춤 없이는 못 깬다 (마디 ${barOf(nf.best)} ${Lg.COURSE.bars[barOf(nf.best)]}에서 막힘)`);
  const nd = Lg.solve(L, Lg.spawnState(L, -1), { grid: 12, noJump: true });
  ok(!nd.plan && barOf(nd.best) === 10, `점프 없이는 못 깬다 (마디 ${barOf(nd.best)} ${Lg.COURSE.bars[barOf(nd.best)]}에서 막힘)`);
  ok(!!Lg.solve(L, Lg.spawnState(L, -1), { grid: 12, noGroundJump: true }).plan, '땅에서 누르는 점프는 실수를 만회하는 수단: 그것 없이도 깰 수 있다');
}
console.log('== 중간지점에 떨어졌을 때 ==');
{
  // fz1: 가시가 7~8번 칸. 그 앞 점프(0→4)에서 멈춤을 써 버리면 4~7 사이에 떨어져 가시 쪽으로 굴러간다.
  const lv = Lg.buildLevel({ name: 't', bpm: 96, bars: ['flat', 'fz1', 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });
  const sim = (jumpAtX) => { const s = Lg.spawnState(lv, -1); let pressed = false; while (!s.dead && !s.won && s.x < 16 + 14) { const hold = s.x >= 16 + 1.5 && s.x < 16 + 3.2; const press = !pressed && s.onGround && s.x >= 16 + jumpAtX; if (press) pressed = true; Lg.stepState(lv, s, press, null, hold); } return s; };
  ok(sim(99).cause === 'spike', '가시 앞 중간지점에 떨어져 그대로 두면 가시로 굴러 들어간다');
  ok(!sim(5.8).dead, '굴러가다가 가시 앞에서 점프를 누르면 뛰어넘는다');
}

console.log('== 수직 함정 / 계단 ==');
{
  const mk = (bars) => Lg.buildLevel({ name: 't', bpm: 96, bars, sections: [{ bar: 0, id: 'a' }] });
  const holdRun = (lv, fromX, toX, untilX) => { const s = Lg.spawnState(lv, -1), ev = []; let maxH = 0; while (!s.dead && !s.won && s.x < untilX) { Lg.stepState(lv, s, false, ev, s.x >= fromX && s.x < toX); maxH = Math.max(maxH, 9 - s.y); } return { s, ev, maxH }; };
  let lv = mk(['flat', 'col2', 'flat', 'goal']);
  ok(holdRun(lv, 99, 99, 30).s.cause === 'spike', '가시 기둥: 그냥 튀면 닿는다');
  ok(!holdRun(lv, 16 + 5.6, 16 + 7.6, 30).s.dead, '가시 기둥: 꼭대기 근처에서 멈추면 넘어간다');
  ok(holdRun(lv, 16 + 4.3, 16 + 7.6, 30).s.cause === 'spike', '가시 기둥: 너무 낮을 때 멈추면 닿는다');
  lv = mk(['flat', 'gate', 'flat', 'goal']);
  ok(!holdRun(lv, 99, 99, 30).s.dead, '위아래 기둥 사이의 틈: 아무것도 안 눌러도 지나간다');
  lv = mk(['flat', 'up', 'hi', 'down', 'flat', 'goal']);
  const r = holdRun(lv, 999, 999, 16 * 5);
  const climbs = r.ev.filter(e => e.type === 'climb').length;
  ok(!r.s.dead && climbs >= 2 && r.maxH > 4, `계단: 아무것도 안 눌러도 저절로 올라갔다 내려온다 (턱 ${climbs}번, 최고 높이 ${r.maxH.toFixed(1)}칸)`);
  const b = r.ev.filter(e => e.type === 'bounce').length;
  ok(b >= 18, `계단을 오르내리는 5마디 동안 ${b}번 튄다(거의 매 박자)`);
  lv = mk(['flat', 'hi', 'flat', 'goal']);
  ok(holdRun(lv, 99, 99, 30).s.cause === 'crash', '2칸 높이 벽은 저절로 못 올라간다(부딪힘)');
}

console.log('== 조각별: 꼭 필요한 입력마다의 여유 (96 BPM 기준) ==');
const { measure, context } = require('./windows.js');
const FREE = ['over', 'gate', 'up', 'hi', 'down'];        // 아무것도 안 눌러도 지나가는 마디
for (const name of Object.keys(Lg.CHUNKS)) {
  if (['flat', 'cp', 'goal'].includes(name)) continue;
  const lv = Lg.buildLevel({ name, bpm: 96, bars: context(name).bars, sections: [{ bar: 0, id: 'a' }] });
  const m = measure(name, 96);
  const idleDies = run(lv, null).s.dead;
  if (FREE.includes(name)) { ok(!idleDies && m.solvable && m.inputs.length === 0, `${name}: 아무것도 안 눌러도 지나간다`); continue; }
  const list = m.solvable && m.inputs ? m.inputs.map(i => `${i.label} ${i.ms >= 600 ? '600+' : i.ms.toFixed(0)}`).join(', ') : '풀 수 없음';
  ok(idleDies && m.solvable && m.inputs && m.min >= 140, `${name}: 아무것도 안 하면 죽고, 입력 여유 ${list}ms`);
}
console.log('실패 ' + fails + '건');
process.exit(fails ? 1 : 0);

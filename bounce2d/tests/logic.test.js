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

console.log('== 장애물 판정 ==');
{
  const mk = () => Lg.buildLevel({ name: 't', bpm: 96, bars: ['flat', 'flat', 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });
  let lv = mk(); lv.floorH[20] = 1;                       // 착지하는 자리(20번 칸)에 선 1칸 덩어리
  let r = run(lv, null);
  ok(r.s.dead && r.s.cause === 'spike' && Math.floor(r.s.x + 0.4) === 20, '바닥에서 솟은 덩어리: 그 위로 떨어지면 죽는다');
  lv = mk(); lv.floorH[22] = 1.25;                        // 꼭대기(22번 칸, 높이 2.25) 밑의 1.25칸 덩어리
  ok(!run(lv, null).s.dead, '바닥에서 솟은 덩어리: 그 위로 넘어가면 산다');
  lv = mk(); lv.ceilH[22] = 2.75;                         // 꼭대기에서 공 윗면은 3.05칸
  r = run(lv, null);
  ok(r.s.dead && Math.floor(r.s.x) >= 21 && Math.floor(r.s.x) <= 22, '매달린 덩어리: 아랫면보다 높이 뜨면 죽는다');
  lv = mk(); lv.ceilH[22] = 3.25;
  ok(!run(lv, null).s.dead, '매달린 덩어리: 그 밑으로 지나가면 산다');
}

console.log('== 피버 구간 (원버튼, 두 가지 방식) ==');
{
  const H = (st) => 9 - st.y, B = 96, SL = Lg.SLOT;
  const mk = (...bars) => Lg.buildLevel({ name: 't', bpm: 96, bars: ['flat', ...bars, 'flat', 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });
  // downs = 손가락이 [누른 스텝, 뗀 스텝) 동안 화면에 닿아 있다. 누르는 순간이 press, 닿아 있는 동안이 hold.
  const play = (lv, downs, from = -1, untilX = null) => {
    const s = Lg.spawnState(lv, from), ev = [], at = {};
    const end = untilX ?? lv.cols - 20;
    while (!s.dead && !s.won && s.x < end) {
      const st = s.step + 1, e2 = [];
      Lg.stepState(lv, s, downs.some(d => d[0] === st), e2, downs.some(d => st >= d[0] && st < d[1]));
      for (const e of e2) ev.push({ ...e, step: s.step });
      at[s.step] = H(s);
    }
    return { s, ev, at, n: (t) => ev.filter(e => e.type === t).length };
  };
  const g0 = 4 * B;                                        // 피버가 시작되는 스텝(마디 1)

  // ---- 방식 1: 크게 / 낮게 튀기
  let lv = mk('hE', 'hE');
  let r = play(lv, []);
  const hops = r.ev.filter(e => e.type === 'hop' && !e.late);
  ok(!r.s.dead && hops.length === 16 && hops.every((e, i) => e.step === g0 + i * SL && !e.high), '방식 1: 반 박마다 튄다(두 배 빠르게). 안 누르면 낮게');
  ok(Math.abs(r.at[g0 + SL / 2] - Lg.HOP_LO) < 0.01 && r.at[g0 + SL] < 1e-9, `낮게 튀면 꼭대기 ${r.at[g0 + SL / 2].toFixed(2)}칸, 반 박 만에 내려온다`);
  r = play(lv, [[g0 + 2 * SL - 10, g0 + 2 * SL + 20]]);
  ok(Math.abs(r.at[g0 + 2.5 * SL] - Lg.HOP_HI) < 0.01 && r.at[g0 + 3 * SL] < 1e-9 && Math.abs(r.at[g0 + 3.5 * SL] - Lg.HOP_LO) < 0.01, `튀는 순간 누르고 있으면 크게(꼭대기 ${r.at[g0 + 2.5 * SL].toFixed(2)}칸). 똑같이 반 박 만에 내려오고, 떼면 다음은 다시 낮게`);
  r = play(lv, [[g0 + 2 * SL + 6, g0 + 2 * SL + 30]]);
  const lateHi = Math.abs(r.at[g0 + 2.5 * SL] - Lg.HOP_HI) < 0.01;
  r = play(lv, [[g0 + 2 * SL + 12, g0 + 2 * SL + 30]]);
  ok(lateHi && Math.abs(r.at[g0 + 2.5 * SL] - Lg.HOP_LO) < 0.01, '튄 직후 8스텝(약 50ms)까지는 늦게 눌러도 크게 튄다. 그 뒤에 누르면 이번엔 낮게');
  lv = mk('hE', 'h3');                                     // HHLLHHLL
  r = play(lv, []);
  ok(r.s.dead && r.s.cause === 'spike' && r.s.x > 32 && r.s.x < 34, '크게 튀어야 하는 칸에서 낮게 튀면 바닥의 빨간 덩어리에 걸린다');
  r = play(lv, [[g0, lv.cols * 30]]);
  ok(r.s.dead && r.s.x > 36 && r.s.x < 38, '낮게 튀어야 하는 칸에서 크게 튀면 매달린 빨간 덩어리에 걸린다(계속 누르고만 있을 수는 없다)');
  const hopRef = (lvl) => lvl.ref.holds.map(h => [h[0], h[1]]);
  r = play(lv, hopRef(lv));
  ok(!r.s.dead, '패턴대로(H에서 누르고 L에서 떼고) 지나간다');

  // ---- 방식 2: 바닥과 천장 사이 튕기기
  lv = mk('zE', 'zE');
  r = play(lv, []);
  const lev = [0, 1, 2, 1, 0, 1, 2, 1, 0].map(k => k * Lg.ZIG_STEP);
  ok(!r.s.dead && lev.every((h, k) => Math.abs(r.at[g0 + k * SL] - h) < 1e-9) && r.n('rebound') === 7, `방식 2: 안 누르면 바닥(0)과 천장(공 바닥 ${lev[2].toFixed(1)}칸) 사이를 한 박에 한 번씩 튕긴다`);
  r = play(lv, [[g0 + 20, g0 + 26]]);                      // 첫 반 박 안에 누름 → 가운데 높이 지점(0.5박)에서 뒤집힌다
  ok(r.n('flip') === 1 && r.ev.find(e => e.type === 'flip').step === g0 + SL && Math.abs(r.at[g0 + 30] - 30 / SL * Lg.ZIG_STEP) < 1e-9 && r.at[g0 + 2 * SL] < 1e-9,
    '누르면 바로가 아니라 다음 반 박 지점(가운데 높이)에서 뒤집힌다 → 누르는 타이밍 여유가 반 박');
  r = play(lv, [[g0 + 5, g0 + 9], [g0 + 30, g0 + 34]]);
  ok(r.n('flip') === 1, '같은 반 박 안에 여러 번 눌러도 한 번만 뒤집힌다');
  r = play(lv, [[g0 + SL + 10, g0 + SL + 14]]);            // 다음 지점이 천장 → 무시
  ok(r.n('flip') === 0 && Math.abs(r.at[g0 + 3 * SL] - lev[3]) < 1e-9, '바닥·천장에 닿는 지점을 앞두고 누른 것은 무시된다(거기서는 그냥 튕긴다)');
  lv = mk('zE', 'z2');                                     // F.S.F.S.
  r = play(lv, []);
  ok(r.s.dead && r.s.cause === 'spike', '뒤집어야 하는 곳에서 안 뒤집으면 빨간 덩어리에 걸린다');
  r = play(lv, lv.ref.presses.map(p => [p, p + 6]));
  ok(!r.s.dead && r.n('flip') === 2, '패턴대로 누르면 지나간다');
  r = play(lv, [...lv.ref.presses.map(p => [p, p + 6]), [8 * B + 1.25 * B, 8 * B + 1.25 * B + 6]]);
  ok(r.s.dead, '뒤집으면 안 되는 곳(S)에서 뒤집어도 걸린다');

  // ---- 두 방식의 코스
  for (const kind of ['hop', 'zig']) {
    const course = Lg.buildLevel(Lg.courseFor(kind)), ride = course.rides[0];
    const full = run(course, course.ref);
    ok(full.s.won && course.rides.length === 1 && ride[2] === kind, `[${kind}] 코스 전체를 패턴대로 완주 (피버 구간: 빨간 덩어리 ${course.reds.length}개, 수정 ${course.gems.length}개)`);
    ok(!!Lg.solve(course, Lg.spawnState(course, 2), { grid: 12 }).plan, `[${kind}] 체크포인트 3(피버 바로 앞)에서 자동 풀이로 완주`);
    let pass = 0;                                          // 생각 없이 누르는 것으로는 못 지나간다
    const tries = [[], [[0, 1e9]]];
    for (const period of [12, 16, 24, 32, 48, 64, 96, 192]) for (const duty of [0.2, 0.5]) { const d = []; for (let st = ride[0] / 4 * B; st < ride[1] / 4 * B; st += period) d.push([st, st + Math.max(2, Math.round(period * duty))]); tries.push(d); }
    for (const d of tries) if (!play(course, d, 2, ride[1] + 4).s.dead) pass++;
    ok(pass === 0, `[${kind}] 안 누르기, 계속 누르기, 일정한 빠르기로 누르기(16가지)로는 피버 구간을 못 지난다`);
    const exit = full.ev.find(e => e.type === 'mode' && e.mode === 'bounce'), after = full.ev.find(e => e.type === 'bounce' && e.step >= exit.step);
    ok(exit.step === ride[1] / 4 * B && after.step - exit.step <= 1, `[${kind}] 바닥에 닿은 채로 나와서 그 박에 바로 다시 튄다`);
  }
}

console.log('== 코스 (키 패턴 → 장애물) ==');
const idle = run(L, null);
ok(idle.s.dead && idle.s.cause === 'spike' && barOf(idle.s.x) === 2, '아무것도 안 누르면 첫 패턴 마디(마디 2)에서 죽는다');
ok(L.fixed.length === 0, '패턴의 길과 겹쳐서 걷어 낸 장애물이 없다');
const full = run(L, L.ref);
const n = (t) => full.ev.filter(e => e.type === t).length;
ok(full.s.won, `코스에 적힌 키 패턴대로 누르면 완주 (이단 점프 ${n('double')}번, 땅에서 점프 ${n('jump')}번, 멈춤 ${n('freeze')}번)`);
ok(n('checkpoint') === L.cps.length && L.cps.length === 4, '체크포인트 4개를 모두 지난다');
ok(full.ev.filter(e => e.type === 'bounce').every(e => e.step % Lg.SUB <= 12), '코스 내내 박자에 맞춰 튄다(늦어도 1/8박 이내)');
{
  // 패턴 마디가 끝나면 다음 마디 첫 박에 땅에서 튀어야 한다(패턴끼리 어떤 순서로 이어 붙여도 되게)
  const bounceSteps = new Set(full.ev.filter(e => e.type === 'bounce' || e.type === 'pad').map(e => e.step));
  const bad = [];
  Lg.COURSE.bars.forEach((name, b) => { if (b > 0 && b < Lg.COURSE.bars.length - 1 && !(Lg.PATTERNS[name] && Lg.PATTERNS[name].mode === 'rush') && ![0, 1, 2].some(d => bounceSteps.has(4 * b * Lg.SUB + d))) bad.push(b + ' ' + name); });
  ok(bad.length === 0, '피버 구간을 뺀 모든 마디가 첫 박에 땅에서 튀며 시작한다(피버 구간이 끝난 다음 마디도)' + (bad.length ? ' — 어긋난 마디: ' + bad.join(', ') : ''));
}
for (const o of [{ grid: 12 }, { grid: 12, offset: 6 }]) {
  const r = Lg.solve(L, Lg.spawnState(L, -1), o);
  ok(!!r.plan, `자동 풀이로도 처음부터 클리어 (탐색 간격 ${o.grid}스텝, 어긋남 ${o.offset || 0})` + (r.plan ? '' : ` — 마디 ${barOf(r.best)} ${Lg.COURSE.bars[barOf(r.best)]}에서 막힘`));
}
L.cps.forEach((cp, i) => ok(!!Lg.solve(L, Lg.spawnState(L, i), { grid: 12 }).plan, `체크포인트 ${i + 1}에서 다시 시작해도 완주 가능`));
{
  const nf = Lg.solve(L, Lg.spawnState(L, -1), { grid: 12, noFreeze: true });
  ok(!nf.plan, `멈춤 없이는 못 깬다 (마디 ${barOf(nf.best)} ${Lg.COURSE.bars[barOf(nf.best)]}에서 막힘)`);
  const nd = Lg.solve(L, Lg.spawnState(L, -1), { grid: 12, noJump: true });
  ok(!nd.plan, `점프 없이는 못 깬다 (마디 ${barOf(nd.best)} ${Lg.COURSE.bars[barOf(nd.best)]}에서 막힘)`);
}
{
  // 장애물은 패턴의 길 둘레에만 생긴다: 패턴이 없는 마디(flat, idle, cp, goal)에는 아무것도 없다
  let stray = 0;
  Lg.COURSE.bars.forEach((name, b) => { const p = Lg.PATTERNS[name]; if (p && (p.holds.length || p.presses.length)) return; for (let c = b * 16; c < b * 16 + 16; c++) if (L.floorH[c] > 0 || L.ceilH[c] < 90) stray++; });
  ok(stray === 0, '쉬는 마디에는 장애물이 없다');
}

console.log('== 패턴별: 입력마다의 여유와, 장애물이 그 입력을 정말 요구하는지 (96 BPM 기준) ==');
const { measure } = require('./windows.js');
for (const name of Object.keys(Lg.PATTERNS)) {
  const pat = Lg.PATTERNS[name];
  if (!pat.holds.length && !pat.presses.length) continue;      // 쉬는 마디, 그냥 타는 언덕
  const m = measure(name, 96);
  if (!m.ok) { ok(false, `${name}: 패턴대로 눌러도 죽는다`); continue; }
  const f = (v) => (v >= 600 ? '600+' : v.toFixed(0));
  const width = Math.min(...m.inputs.map(i => i.early + i.late));
  ok(pat.mode === 'rush' ? m.min >= 100 : m.min >= 60 && width >= 170, `${name}: 입력 여유 ${m.inputs.map(i => `${i.label} -${f(i.early)}/+${f(i.late)}`).join(', ')}ms`);
  ok(m.idleDies && m.needed.every(Boolean), `${name}: 안 누르면 죽고, 입력을 하나라도 빼먹으면 죽는다`);
}
console.log('실패 ' + fails + '건');
process.exit(fails ? 1 : 0);

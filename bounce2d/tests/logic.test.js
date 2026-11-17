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
  // 이단 점프 뒤에는 박자가 어긋나 착지 → 굴러간다. 한참 구르는 중에 누르면 그 자리에서 점프
  const g = Lg.spawnState(flat, -1), ev3 = [];
  while (g.step < 49) Lg.stepState(flat, g, false, null, false);
  Lg.stepState(flat, g, true, null, false);
  while (!g.onGround) Lg.stepState(flat, g, false, null, false);
  for (let i = 0; i < 5; i++) Lg.stepState(flat, g, false, ev3, true);
  ok(g.onGround && !g.frozen && g.step % Lg.SUB > 12, '박자와 어긋나게 착지하면 굴러간다(멈춤은 땅에서 듣지 않음)');
  g.step = Lg.SUB * 5 + 20;                                // 다음 박까지 0.79박 남은 자리로 옮겨서(튀기까지 멀다)
  Lg.stepState(flat, g, true, ev3, false);
  ok(!g.onGround && ev3.some(e => e.type === 'jump') && g.djAvail, '한참 구르는 중에(다음 박이 멀 때) 누르면 그 자리에서 점프하고, 이단 점프도 다시 쓸 수 있다');
  let mh = 0; while (!g.onGround) { Lg.stepState(flat, g, false, null, false); mh = Math.max(mh, H(g)); }
  ok(mh > 2.1 && mh < 2.3, `눌러서 뛴 점프도 높이는 같다 (${mh.toFixed(2)}칸)`);
  // ---- 이단 점프 보정: 땅 언저리에서 누른 이단 점프는 꼭대기에서 한다
  const assist = (pressAt, pre = () => {}) => {            // pressAt = 박 4에서 튀는 것을 기준으로 한 스텝(음수 = 튀기 전). 결과: 그 튐의 꼭대기 높이와 이단 점프를 한 시각
    const a = Lg.spawnState(flat, -1), evA = []; let top = 0, at = null;
    while (a.step < Lg.SUB * 4 + pressAt - 1) Lg.stepState(flat, a, false, null, false);
    pre(a);
    Lg.stepState(flat, a, true, evA, false);
    if (evA.some(q => q.type === 'double')) at = (a.step - Lg.SUB * 4) / Lg.SUB;
    while (a.step < Lg.SUB * 6) { const e = []; Lg.stepState(flat, a, false, e, false); if (a.step > Lg.SUB * 4) top = Math.max(top, H(a)); if (e.some(q => q.type === 'double') && at === null) at = (a.step - Lg.SUB * 4) / Lg.SUB; evA.push(...e); }
    return { top, at, queued: evA.some(q => q.type === 'queue'), dead: a.dead };
  };
  const cases = [-14, -8, -3, 0, 1, 6, 15, 28].map(k => [k, assist(k)]);
  ok(cases.every(([, r]) => r.queued && Math.abs(r.at - 0.5) < 0.03 && r.top > 4.3 && r.top < 4.6), `이단 점프 보정: 튀기 0.15박 전부터 튄 뒤 0.3박까지 누른 것은 모두 꼭대기(0.5박)에서 이단 점프가 된다 — ${cases.map(([k, r]) => `${(k / 96).toFixed(2)}박:${r.top.toFixed(1)}칸`).join(', ')}`);
  const late = [30, 40, 48, 60].map(k => [k, assist(k)]);
  ok(late.every(([k, r]) => !r.queued && Math.abs(r.at - k / 96) < 0.03), `그 뒤에 누른 것은 전처럼 누른 자리에서 바로 한다 — ${late.map(([k, r]) => `${(k / 96).toFixed(2)}박에 누름 → ${r.at.toFixed(2)}박`).join(', ')}`);
  { // 앞의 점프에서 조금 늦게 누른 이단 점프(닿기 0.2박 전)는 다음 튐으로 넘기지 않는다
    const r = assist(-20);
    ok(!r.queued && r.at < 0, `닿기 0.2박 전에 누른 것은 지금 뛰고 있는 점프의 이단 점프다(다음 튐으로 넘기지 않는다) — ${r.at.toFixed(2)}박`);
    // 이번에 멈춤을 쓴 뒤 낮게 누른 것은 일부러 낮게 뛰는 것: 그대로 둔다
    const a = Lg.spawnState(flat, -1), evB = [];
    while (a.step < Lg.SUB * 3 + 60) Lg.stepState(flat, a, false, null, false);
    for (let i = 0; i < 24; i++) Lg.stepState(flat, a, false, null, true);       // 떨어지다가 잠깐 멈춤
    while (H(a) > 0.5) Lg.stepState(flat, a, false, null, false);
    Lg.stepState(flat, a, true, evB, false);
    ok(evB.some(q => q.type === 'double') && !evB.some(q => q.type === 'queue'), '멈춤을 쓴 뒤 땅 가까이에서 누른 이단 점프는 그 자리에서 한다(일부러 낮게 뛰는 동작)');
  }
  // 착지 직전에 눌러 두면(이단 점프를 이미 쓴 뒤): 맨땅이고 곧 튈 참이면 이단 점프로 맡아 둔다 → 다음 박에 튀고, 꼭대기에서 이단 점프
  const b = Lg.spawnState(flat, -1), ev4 = [];
  while (b.step < 49) Lg.stepState(flat, b, false, null, false);
  Lg.stepState(flat, b, true, null, false);
  while (9 - b.y > 0.35 || b.vy < 0) Lg.stepState(flat, b, false, null, false);
  Lg.stepState(flat, b, true, ev4, false);
  let topB = 0; for (let i = 0; i < 130; i++) { Lg.stepState(flat, b, false, ev4, false); topB = Math.max(topB, H(b)); }
  ok(ev4.some(e => e.type === 'land') && ev4.some(e => e.type === 'queue') && !ev4.some(e => e.type === 'jump') && ev4.some(e => e.type === 'bounce') && ev4.some(e => e.type === 'double') && topB > 4.3, `이단 점프를 쓴 뒤 착지 직전에 누르면: 착지 → 박에 맞춰 튐 → 꼭대기에서 이단 점프 (${topB.toFixed(2)}칸)`);
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

console.log('== 피버 구간 (원버튼) ==');
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

  // ---- 방식 2: 바닥과 천장 사이 튕기기
  let lv = mk('zE', 'zE');
  let r = play(lv, []);
  const lev = [0, 1, 2, 1, 0, 1, 2, 1, 0].map(k => k * Lg.ZIG_STEP), ZM = 2 * Lg.ZIG_STEP;
  ok(!r.s.dead && lev.every((h, k) => Math.abs(r.at[g0 + k * SL] - h) < 1e-6) && r.n('rebound') === 7, `안 누르면 바닥(0)과 천장(공 바닥 ${lev[2].toFixed(1)}칸) 사이를 한 박에 한 번씩 튕긴다`);
  r = play(lv, [[g0 + SL, g0 + SL + 6]]);                  // 가운데 높이를 지나는 박(0.5박)에 딱 맞춰 누름
  const fl = r.ev.find(e => e.type === 'flip');
  ok(fl.step === g0 + SL && r.at[g0 + SL + 5] < r.at[g0 + SL] && r.at[g0 + 2 * SL] < 1e-6, '누르는 즉시 뒤집힌다(지연 없음). 박에 맞춰 누르면 반 박 뒤에 바닥에 닿는다');
  const early = play(lv, [[g0 + SL - 14, g0 + SL - 8]]), late = play(lv, [[g0 + SL + 14, g0 + SL + 20]]);
  const onGrid = (run2) => run2.ev.filter(e => e.type === 'rebound').every(e => (e.step - g0) % SL === 0);
  ok(early.at[g0 + SL - 10] < early.at[g0 + SL - 15] && early.at[g0 + 2 * SL] < 1e-6 && late.at[g0 + SL + 13] > lev[1] && late.at[g0 + 2 * SL] < 1e-6 && onGrid(early) && onGrid(late),
    '조금 일찍(약 90ms) 누르면 천천히, 조금 늦게 누르면 빠르게 내려가서 똑같이 그 박에 바닥에 닿는다');
  const sameAfter = [3, 4, 6, 8].every(k => Math.abs(early.at[g0 + k * SL] - late.at[g0 + k * SL]) < 1e-6);
  ok(sameAfter, '그래서 타이밍 오차가 다음으로 넘어가지 않는다(일찍 누른 길과 늦게 누른 길이 그 뒤로 똑같다)');
  r = play(lv, [[g0 + 30, g0 + 34], [g0 + 40, g0 + 44]]);
  ok(r.n('flip') === 2 && Math.abs(r.at[g0 + 2 * SL] - ZM) < 1e-6, '두 번 누르면 다시 원래 방향으로 간다');
  let rnd = 7, wild = [];
  for (let st = g0 + 3; st < g0 + 8 * B - 10; st += 5 + (rnd = (rnd * 1103515245 + 12345) % 2147483648) % 60) wild.push([st, st + 3]);
  r = play(lv, wild);
  ok(!r.s.dead && r.n('flip') + r.n('spark') === wild.length && r.n('flip') >= 5 && onGrid(r) && Object.keys(r.at).every(k => r.at[k] > -1e-9 && r.at[k] < ZM + 1e-9), `아무 때나 ${wild.length}번을 눌러도 바닥·천장에는 언제나 반 박 지점에 닿는다(박자와 어긋나지 않는다)`);
  lv = mk('zE', 'z2');                                     // F.S.F.S.
  r = play(lv, []);
  ok(r.s.dead && r.s.cause === 'spike', '뒤집어야 하는 곳에서 안 뒤집으면 빨간 덩어리에 걸린다');
  r = play(lv, lv.ref.presses.map(p => [p, p + 6]));
  ok(!r.s.dead && r.n('flip') === 2, '패턴대로 누르면 지나간다');
  r = play(lv, [...lv.ref.presses.map(p => [p, p + 6]), [8 * B + 1.5 * B, 8 * B + 1.5 * B + 6]]);
  ok(r.s.dead, '뒤집으면 안 되는 곳(S)에서 뒤집어도 걸린다');

  // ---- 코스의 피버 구간
  {
    const course = Lg.buildLevel(Lg.COURSE), ride = course.rides[0], cpBefore = course.cps.findIndex(c => c.col > ride[0]) - 1;
    const full = run(course, course.ref);
    ok(full.s.won && course.rides.length === 1, `코스 전체를 패턴대로 완주 (피버 구간: 마디 ${ride[0] / 16}~${ride[1] / 16 - 1}, 구멍 뚫린 벽 ${course.reds.length}개, 수정 ${course.gems.length}개)`);
    ok(!!Lg.solve(course, Lg.spawnState(course, cpBefore), { grid: 12 }).plan, `체크포인트 ${cpBefore + 1}(피버 바로 앞)에서 자동 풀이로 완주`);
    let pass = 0;                                          // 생각 없이 누르는 것으로는 못 지나간다
    const tries = [[], [[0, 1e9]]];
    for (const period of [12, 16, 24, 32, 48, 64, 96, 192]) for (const duty of [0.2, 0.5]) { const d = []; for (let st = ride[0] / 4 * B; st < ride[1] / 4 * B; st += period) d.push([st, st + Math.max(2, Math.round(period * duty))]); tries.push(d); }
    for (const d of tries) if (!play(course, d, cpBefore, ride[1] + 4).s.dead) pass++;
    ok(pass === 0, '안 누르기, 계속 누르기, 일정한 빠르기로 누르기(16가지)로는 피버 구간을 못 지난다');
    const exit = full.ev.find(e => e.type === 'mode' && e.mode === 'bounce'), after = full.ev.find(e => e.type === 'bounce' && e.step >= exit.step);
    ok(exit.step === ride[1] / 4 * B && after.step - exit.step <= 1, '바닥에 닿은 채로 나와서 그 박에 바로 다시 튄다');
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
ok(full.ev.filter(e => e.type === 'bounce').every(e => e.step % 12 === 0 || e.step % Lg.SUB <= 12), '코스 내내 박자 눈금에 맞춰 튄다(땅에서는 박자에, 박스 위에서는 1/8박 눈금에. 늦어도 1/8박 이내)');
{
  // 패턴 마디가 끝나면 다음 마디 첫 박에 땅에서 튀어야 한다(패턴끼리 어떤 순서로 이어 붙여도 되게)
  const bounceSteps = new Set(full.ev.filter(e => e.type === 'bounce' || e.type === 'pad').map(e => e.step));
  const bad = [];
  const goalBar = Lg.COURSE.bars.indexOf('goal');
  Lg.COURSE.bars.forEach((name, b) => { if (b > 0 && b <= goalBar && !(Lg.PATTERNS[name] && Lg.PATTERNS[name].mode === 'rush') && ![0, 1, 2].some(d => bounceSteps.has(4 * b * Lg.SUB + d))) bad.push(b + ' ' + name); });
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

console.log('== 라운드마다 ==');
for (const C of Lg.COURSES) {
  const lv = Lg.buildLevel(C), tag = C.name.split(' · ')[0];
  const full = run(lv, lv.ref);
  ok(full.s.won && lv.fixed.length === 0, `[${tag}] ${C.name}: ${lv.bars}마디, 체크포인트 ${lv.cps.length}개(마디 ${lv.cps.map(c => c.bar).join(', ')}), 피버 ${lv.rides.map(r => `${r[0] / 16}~${r[1] / 16 - 1}`).join(' / ')} — 패턴대로 완주`);
  if (lv.rides.length) {
    // 피버의 이빨은 통로 밖으로 튀어나오지 않는다(피버가 끝나는 선에 걸친 이빨은 그 선에서 잘린 반쪽이다)
    const out = lv.reds.filter(q => { const r = lv.rides.find(r => q.xt >= r[0] && q.xt <= r[1]); return !r || q.x0 < r[0] - 1e-9 || q.x1 > r[1] + 1e-9; });
    ok(out.length === 0 && lv.reds.some(q => q.cut), `[${tag}] 피버의 장애물은 통로 안에만 있다: 피버가 끝나는 선에 걸친 이빨 ${lv.reds.filter(q => q.cut).length}개는 그 선에서 잘랐다`);
    // 앞 라운드의 피버 문제를 다시 내지 않는다(6라운드부터): 넓은 통로의 줄은 앞 라운드에 없던 것, 좁은 통로는 "앞 마디 → 다음 마디" 짝이 앞 라운드에 없던 것. 한 라운드 안에서도 같은 줄은 한 군데(되풀이는 빼고)
    const no = Lg.COURSES.indexOf(C);
    if (no >= 5) {
      const seq = (c) => { const o = []; let prev = null; c.bars.forEach((n, b) => { const p = Lg.PATTERNS[n]; if (!p || p.mode !== 'rush' || p.free || !p.nodes) { prev = null; return; } const k = (p.wide ? 'w' : 'z') + p.nodes; o.push({ b, k, wide: !!p.wide, pair: prev && prev !== k ? prev + '>' + k : null, rep: prev === k }); prev = k; }); return o; };
      const oldW = new Set(), oldPairs = new Set();
      Lg.COURSES.slice(0, no).forEach(c => seq(c).forEach(q => { if (q.wide) oldW.add(q.k); if (q.pair) oldPairs.add(q.pair); }));
      const mine = seq(C), dupW = mine.filter(q => q.wide && oldW.has(q.k)), dupP = mine.filter(q => q.pair && oldPairs.has(q.pair)), fresh = mine.filter(q => !q.rep), dupIn = fresh.filter((q, i) => fresh.findIndex(u => u.k === q.k) !== i);
      ok(dupW.length === 0 && dupP.length === 0 && dupIn.length === 0, `[${tag}] 피버 문제가 앞 라운드와 겹치지 않는다: 넓은 통로의 줄 ${mine.filter(q => q.wide && !q.rep).length}가지 모두 처음 나오는 것, 좁은 통로의 "되풀이 → 함정" 짝도 처음 나오는 것${dupW.length + dupP.length + dupIn.length ? ' — 겹침: ' + [...dupW, ...dupP, ...dupIn].map(q => '마디 ' + q.b).join(', ') : ''}`);
    }
  }
  let solved = 0;
  for (let k = -1; k < lv.cps.length; k++) if (Lg.solve(lv, Lg.spawnState(lv, k), { grid: 12 }).plan) solved++;
  ok(solved === lv.cps.length + 1, `[${tag}] 처음과 모든 체크포인트에서 자동 풀이로 완주 (${solved}/${lv.cps.length + 1})`);
  const idleRun = run(lv, null);
  ok(idleRun.s.dead && barOf(idleRun.s.x) <= 3, `[${tag}] 아무것도 안 누르면 마디 ${barOf(idleRun.s.x)}에서 죽는다`);
  const hard = C.bars.filter(n => ['weave', 'roller', 'lowThenUp', 'glideLow'].includes(n));
  ok(hard.length === 0, `[${tag}] 어려운 엮기 동작은 쓰지 않는다`);
    {
      // 바운스 구간의 파란 박스(쉬는 마디): 밟고 튄다. 박자가 밀리지 않고, 뭘 눌러도 그 마디 안에서는 죽지 않는다.
      const bars3 = Lg.COURSES.find(c => c.name === lv.name).bars, allBox = bars3.map((n, b) => (Lg.PATTERNS[n] && Lg.PATTERNS[n].boxes ? b : -1)).filter(b => b >= 0), boxBars = allBox.filter(b => !Lg.PATTERNS[bars3[b]].lava && !Lg.PATTERNS[bars3[b]].tall), lavaBars = allBox.filter(b => Lg.PATTERNS[bars3[b]].lava);
      const s3 = Lg.spawnState(lv, -1), inp3 = Lg.planInput(lv.ref), bounceAt = {}, snap = {};
      let lands = 0; const landBars = new Set();
      while (!s3.dead && !s3.won) {
        if (s3.step % 384 === 0) snap[s3.step / 384] = { ...s3 };
        const e3 = []; Lg.stepState(lv, s3, inp3.press.has(s3.step + 1), e3, inp3.hold.has(s3.step + 1));
        if (e3.some(e => e.type === 'bounce')) bounceAt[s3.step] = 9 - s3.y;
        if (e3.some(e => e.type === 'land') && 9 - s3.y >= 0.99) { landBars.add(Math.floor(s3.x / 16)); if (boxBars.includes(Math.floor(s3.x / 16))) lands++; }
      }
      const clean = allBox.filter(b => !Lg.PATTERNS[bars3[b]].tall).every(b => bounceAt[b * 384] < 0.2 && bounceAt[(b + 1) * 384] < 0.2);
      if (boxBars.length) ok(lands >= 2 * boxBars.length && clean, `[${tag}] 파란 박스 마디(${boxBars.join(', ')}): 박스를 ${lands}번 밟고, 마디가 끝날 때는 땅에서 박자에 맞춰 튄다`);
      let died = 0, rnd3 = 11;
      const rand = () => (rnd3 = (rnd3 * 1103515245 + 12345) % 2147483648) / 2147483648;
      for (const b of boxBars) for (let n = 0; n < 40; n++) {
        const s4 = { ...snap[b] }; let hold = false;
        while (!s4.dead && s4.step < (b + 1) * 384 - 12) {      // 마디 끝 반 칸은 뺀다(거기서는 다음 마디의 장애물에 닿을 수 있다. 쉬는 마디도 마찬가지)
          if (rand() < 0.03) hold = !hold; Lg.stepState(lv, s4, rand() < 0.02, null, hold); }
        if (s4.dead) died++;
      }
      if (boxBars.length) ok(died === 0, `[${tag}] 파란 박스 마디에서는 아무렇게나 눌러도 죽지 않는다 (마디마다 40번씩 마구 눌러 봄)`);
      const risers = boxBars.every(b => { for (let c = b * 16; c < b * 16 + 16; c++) { const hgt = (cc) => { let k = 0; while (lv.grid[8 - k][cc] === '#') k++; return k; }; if (hgt(c) - hgt(c - 1) > 1) return false; } return true; });
      if (boxBars.length) ok(risers, `[${tag}] 박스의 왼쪽 턱은 한 칸씩만 높아진다(부딪히면 저절로 올라탈 수 있게)`);
      if (lavaBars.length) {
        // 빨간 바닥과 파란 섬: 빨간 바닥은 닿으면 죽고, 그 위의 박스는 디딜 수 있다. 패턴대로 가면 마디마다 섬을 밟고 지나간다.
        const lavaCols = [], boxOnLava = [];
        for (const b of lavaBars) for (const [a, z] of Lg.PATTERNS[bars3[b]].lava) for (let c = b * 16 + a; c <= b * 16 + z; c++) (lv.grid[8][c] === '#' ? boxOnLava : lavaCols).push(c);
        ok(lavaCols.length > 0 && lavaCols.every(c => lv.floorH[c] >= 0.3) && lavaBars.every(b => landBars.has(b)), `[${tag}] 빨간 바닥 마디(${lavaBars.join(', ')}): 빨간 바닥 ${lavaCols.length}칸. 패턴대로 가면 마디마다 파란 섬을 밟는다`);
        let idleDead = 0;
        for (const b of lavaBars) { const s5 = { ...snap[b] }; while (!s5.dead && s5.step < (b + 1) * 384) Lg.stepState(lv, s5, false, null, false); if (s5.dead && s5.cause === 'spike') idleDead++; }
        ok(idleDead === lavaBars.length, `[${tag}] 그 마디에서 아무것도 안 누르면 빨간 바닥에 떨어져 죽는다 (${idleDead}/${lavaBars.length})`);
        let minClear = 9;
        { const s6 = Lg.spawnState(lv, -1); while (!s6.dead && !s6.won) { Lg.stepState(lv, s6, inp3.press.has(s6.step + 1), null, inp3.hold.has(s6.step + 1)); for (const c of lavaCols) if (s6.x + 0.32 > c + 0.1 && s6.x - 0.32 < c + 0.9) minClear = Math.min(minClear, 9 - s6.y - lv.floorH[c]); } }
        ok(minClear > 0.5, `[${tag}] 패턴대로 갈 때 공은 빨간 바닥에서 적어도 ${minClear.toFixed(2)}칸 떨어져 지나간다(아슬아슬하게 스치지 않는다)`);
      }
    }
  {
    // 충전 고리와 계단으로 박자 틀기(3라운드)
    const bars4 = C.bars, ringBars = bars4.map((n, b) => (Lg.PATTERNS[n] && Lg.PATTERNS[n].rings ? b : -1)).filter(b => b >= 0), tallBars = bars4.map((n, b) => (Lg.PATTERNS[n] && Lg.PATTERNS[n].tall === true ? b : -1)).filter(b => b >= 0);      // tall: true = 계단 구간(높은 박스의 tall: [..]과는 다르다)
    if (ringBars.length || tallBars.length) {
      const s7 = Lg.spawnState(lv, -1), inp7 = Lg.planInput(lv.ref), rings = new Set(), bounces = [];
      let groundInRing = 0;
      while (!s7.dead && !s7.won) {
        const e7 = []; Lg.stepState(lv, s7, inp7.press.has(s7.step + 1), e7, inp7.hold.has(s7.step + 1));
        for (const e of e7) { if (e.type === 'ring') rings.add(e.c); if (e.type === 'bounce' && s7.mode === 'bounce') bounces.push({ step: s7.step, h: Math.round(9 - s7.y - 0.09), bar: Math.floor(s7.x / 16) }); }
        const pb = Lg.PATTERNS[bars4[Math.floor(s7.x / 16)]];
        if (s7.onGround && pb && pb.rings && pb.presses.length >= 2 && !pb.after && s7.x % 16 > 2 && s7.x % 16 < 10) groundInRing++;
      }
      const ringCols = new Set(); ringBars.forEach(b => Lg.PATTERNS[bars4[b]].rings.forEach(([c]) => ringCols.add(b * 16 + c)));
      ok(ringBars.length >= 5 && rings.size === ringCols.size && groundInRing === 0, `[${tag}] 충전 고리 마디(${ringBars.join(', ')}): 고리 ${ringCols.size}개를 모두 지나며, 고리로 건너는 구간에서는 땅에 닿지 않는다`);
      // 높이가 튀는 박을 정한다: h칸 높이에서는 h/8박 이른 박에 튄다
      ok(bounces.length > 100 && bounces.every(b => (b.step + b.h * 12) % 96 <= 12), `[${tag}] 어느 높이에서든 그 높이의 박에 튄다: 땅은 정박, 한 칸 높을 때마다 1/8박씩 이르게 (${bounces.length}번 확인)`);
      const up = bars4.indexOf('upStairs'), at = (b, t) => bounces.find(x => x.step === b * 384 + Math.round(t * 96));
      ok(up >= 0 && [[0, 0], [0.875, 1], [1.75, 2], [2.625, 3], [3.5, 4]].every(([t, h]) => { const x = at(up, t); return x && x.h === h; }), `[${tag}] 계단을 오르면 0.875박마다 튄다(0 → 0.875 → 1.75 → 2.625 → 3.5박): 한 박보다 조금씩 빨라져, 네 단 위에서는 반 박이 당겨진다`);
      const sky = bounces.filter(b => b.h === 4), down = bars4.indexOf('downStairs');
      ok(sky.length >= 12 && sky.every(b => b.step % 96 === 48), `[${tag}] 네 칸 높이의 꼭대기에서는 언제나 엇박(반 박 지점)에 튄다 (${sky.length}번)`);
      ok(down >= 0 && [[0.5, 4], [1.625, 3], [2.75, 2], [3.875, 1], [5, 0]].every(([t, h]) => { const x = at(down, t); return x && x.h === h; }), `[${tag}] 내려올 때는 1.125박마다 튄다(0.5 → 1.625 → 2.75 → 3.875박). 땅에 닿으면 다음 마디 둘째 박부터 정박`);
      ok(tallBars.every(b => lv.tallBars.has(b)) && bars4.every((n, b) => !(Lg.PATTERNS[n] && Lg.PATTERNS[n].after) || bars4[b - 1] === Lg.PATTERNS[n].after) && bars4.every((n, b) => n !== 'ringRun' || (Lg.PATTERNS[bars4[b + 1]] || {}).after === 'ringRun'), `[${tag}] 이어 붙여야 하는 마디들이 제자리에 있다(고리 연타 뒤에는 ringStop·ringGlide)`);
    }
  }
  {
    // 밀도 95%(4라운드부터의 기준): 바운스 구간에서 공이 떠 있는 시간의 95% 이상이 "눌러야 하는 토막"(또는 함정이라 일부러 안 누르는 토막)이다
    { const d9 = Lg.touchDensity(C, lv);
      if (C.density) ok(d9.busy >= C.density, `[${tag}] 밀도 ${(d9.busy * 100).toFixed(1)}% (기준 ${C.density * 100}%. 누르는 토막만 ${(d9.touch * 100).toFixed(1)}%, 빈 토막 ${d9.empty.length}곳: 마디 ${[...new Set(d9.empty.map(v => Math.floor(v / 4)))].join(', ')})`);
      else console.log(`  (참고) [${tag}] 밀도 ${(d9.busy * 100).toFixed(1)}% (누르는 토막만 ${(d9.touch * 100).toFixed(1)}%)`); }
    // 밀도: 2라운드부터는 대부분의 마디에서 누르거나 함정을 만난다
    const pat = C.bars.map(n => Lg.PATTERNS[n]).filter(p => p && p.mode !== 'rush'), busy = pat.filter(p => p.holds.length || p.presses.length || p.traps).length;
    const rushBars = C.bars.map(n => Lg.PATTERNS[n]).filter(p => p && p.mode === 'rush'), rushBusy = rushBars.filter(p => /[FS]/.test(p.nodes)).length;
    const perBar = (lv.ref.presses.length + lv.ref.holds.length) / (pat.length + rushBars.length);
    if (tag !== 'ROUND 1' && !C.lab) ok(busy / pat.length >= 0.8 && perBar >= 1.5, `[${tag}] 바운스 마디 ${pat.length}개 가운데 ${busy}개(${Math.round(100 * busy / pat.length)}%)에서 누르거나 함정을 만난다. 피버는 ${rushBars.length}마디 가운데 ${rushBusy}마디. 마디당 입력 ${perBar.toFixed(1)}번`);
    else console.log(`  (참고) [${tag}] 바운스 마디 ${pat.length}개 가운데 ${busy}개(${Math.round(100 * busy / pat.length)}%), 마디당 입력 ${perBar.toFixed(1)}번`);
  }
  {
    // 함정 마디: 패턴대로 가면 지나가고, 버릇대로(앞 마디들처럼) 누르면 그 마디에서 죽는다
    const trapBars = C.bars.map((n, b) => (Lg.PATTERNS[n] && Lg.PATTERNS[n].traps ? b : -1)).filter(b => b >= 0);
    if (trapBars.length) {
      const inp8 = Lg.planInput(lv.ref);
      let caught = 0, total = 0;
      for (const b of trapBars) for (const t of Lg.PATTERNS[C.bars[b]].traps) {
        total++;
        const p8 = Lg.PATTERNS[C.bars[b]], lo = b * 384, hi = lo + 384;
        const press = new Set((t.full ? t.full.presses : [...p8.presses, ...(t.presses || [])]).map(v => lo + Math.round(v * 96))), holds = (t.full ? t.full.holds : t.holds || p8.holds).map(([a, z]) => [lo + Math.round(a * 96), lo + Math.round(z * 96)]);   // full = 앞 마디의 입력을 통째로
        const s8 = Lg.spawnState(lv, -1);
        while (!s8.dead && !s8.won && s8.step < hi + 96) { const st = s8.step + 1, inBar = st >= lo && st < hi; Lg.stepState(lv, s8, inBar ? press.has(st) : inp8.press.has(st), null, inBar ? holds.some(h => st >= h[0] && st < h[1]) : inp8.hold.has(st)); }
        if (s8.dead && s8.x >= b * 16 && s8.x < b * 16 + 16.5) caught++;
      }
      ok(caught === total, `[${tag}] 함정 마디(${trapBars.join(', ')}): 버릇대로 누르면 그 마디에서 죽는다 (${caught}/${total})`);
      // 한 번 더 누르면 죽는 함정(뚝)은 그 자리 바로 위에 빨간 덩어리가 매달려 있다
      const stopBars = trapBars.filter(b => !Lg.PATTERNS[C.bars[b]].caps && Lg.PATTERNS[C.bars[b]].traps.some(t => !t.full && t.presses));   // (파란 천장 마디는 빨간 덩어리 대신 천장이 막는다)
      const hang = stopBars.filter(b => { const p9 = Lg.PATTERNS[C.bars[b]]; for (const t of p9.traps) for (const v of t.presses || []) { const c = b * 16 + Math.round(v * 4); for (let k = c - 1; k <= c + 3; k++) if (lv.ceilH[k] < 90) return true; } return false; });
      ok(hang.length === stopBars.length && trapBars.every(b => !Lg.PATTERNS[C.bars[b]].sneaky), `[${tag}] "한 번 더 누르면 죽는" 함정 자리마다 바로 위에 빨간 덩어리가 매달려 있다 — ${hang.length}/${stopBars.length}`);
      // 도구가 뽑은 함정: 같은 마디를 두 번 한 바로 다음에 오고, 그 마디의 입력과 한 군데만 다르다
      const gen = trapBars.filter(b => Lg.PATTERNS[C.bars[b]].traps[0].full);
      const same = (u, v) => JSON.stringify(u) === JSON.stringify(v), remix = Lg.COURSES.indexOf(C) >= 5;      // 리믹스 라운드(6라운드)에는 한 번만 보여 주고 내는 함정, 함정 뒤에 원래 마디를 한 번 하고 또 내는 함정도 있다
      ok(gen.every(b => { const f = Lg.PATTERNS[C.bars[b]].traps[0].full, pv = Lg.PATTERNS[C.bars[b - 1]]; return (remix || C.bars[b - 1] === C.bars[b - 2]) && same(pv.presses, f.presses) && same(pv.holds, f.holds); }), `[${tag}] 뽑은 함정 ${gen.length}곳: ${remix ? '바로 앞 마디(한 번 또는 두 번 한 마디)' : '같은 마디를 두 번 한 바로 다음에 오고, 앞 마디'}의 입력 그대로는 통하지 않는다`);
      const follows = trapBars.every(b => { const n = C.bars[b], prev = C.bars[b - 1], prev2 = C.bars[b - 2]; return n === 'goStop' ? prev === 'peak' && prev2 === 'peak' : n === 'ringStop' ? prev === 'ringRun' : n === 'holdStop' ? (prev === 'mix' && prev2 === 'mix') || (prev === 'glideHigh' && prev2 === 'glideHigh') : n === 'stopGo' ? prev === 'peak' : true; });
      if (!C.lab) ok(follows, `[${tag}] "뚝" 함정은 같은 손을 이어서 친 마디들 바로 다음에 온다(오른쪽 다섯 번 → 뚝, 왼·오 다섯 번 → 뚝, 고리 연타 → 뚝)`);
      // 손이 바뀌는 함정: 같은 손만 이어지다가 다른 손. 그 자리에서 버릇대로(같은 손으로) 누르면 죽는다
      const joined = C.bars.join(','), swaps = [];
      C.bars.forEach((n, b) => { if (n === 'mix2' && C.bars[b - 1] === 'peak' && C.bars[b - 2] === 'peak') swaps.push([b, { presses: [0.5, 2.5], holds: [] }]); if (n === 'holdStop' && C.bars[b - 1] === 'glideHigh') swaps.push([b, { presses: [], holds: [[0.5, 1.375], [2.5, 3.25]] }]); if (n === 'ringGlide') swaps.push([b, { presses: [0.375, 1.375], holds: [] }]); });
      let swapDead = 0;
      for (const [b, w] of swaps) {
        const lo = b * 384, hi = lo + 384, press = new Set(w.presses.map(v => lo + Math.round(v * 96))), holds = w.holds.map(([a, z]) => [lo + Math.round(a * 96), lo + Math.round(z * 96)]);
        const s9 = Lg.spawnState(lv, -1);
        while (!s9.dead && !s9.won && s9.step < hi + 96) { const st = s9.step + 1, inBar = st >= lo && st < hi; Lg.stepState(lv, s9, inBar ? press.has(st) : inp8.press.has(st), null, inBar ? holds.some(h => st >= h[0] && st < h[1]) : inp8.hold.has(st)); }
        if (s9.dead && s9.x >= b * 16 && s9.x < b * 16 + 16.5) swapDead++;
      }
      if (!C.lab) ok(swaps.length + gen.length >= 1 && swapDead === swaps.length, `[${tag}] 같은 손으로 이어 치다가 어긋나는 자리 ${swaps.length}곳(오른쪽만 치다가 왼쪽, 왼쪽만 치다가 뚝, 고리 연타 뒤 왼쪽): 버릇대로 같은 손으로 누르면 그 마디에서 죽는다 (${swapDead}/${swaps.length})`);
      let streams = 0, more = 0;                                 // 피버: 앞 마디와 같은 글자로 가다가, 누르던 자리(F)가 누르면 안 되는 자리(S)로 바뀌는 마디
      C.bars.forEach((n, b) => { const u = Lg.PATTERNS[C.bars[b - 1]], v = Lg.PATTERNS[n]; if (!u || !v || u.mode !== 'rush' || v.mode !== 'rush' || !!u.wide !== !!v.wide || u.free || v.free) return; let k = 0; while (k < 8 && u.nodes[k] === v.nodes[k]) k++; if (k >= 2 && k < 7 && u.nodes[k] === 'F' && v.nodes[k] === 'S') streams++; else if (k >= 2 && k < 7 && u.nodes[k] !== 'F' && v.nodes[k] === 'F') more++; });
      if (!C.lab) ok(streams >= 1 && streams + more >= 2, `[${tag}] 피버의 함정: 앞 마디와 똑같이 가다가 누르던 자리에서 끊기는 마디(뚝) ${streams}곳, 안 누르던 자리에서 한 번 더 누르는 마디(하나 더) ${more}곳`);
    }
  }
  if (lv.freeBars.size) {
    // 연출 마디: 장애물이 없고, 아무리 눌러도 길이 바뀌지 않는다(그래서 다음 마디와 어긋나지 않는다)
    const noReds = lv.reds.every(q => !lv.freeBars.has(Math.floor(q.xt / 16)) || !lv.freeBars.has(Math.floor((q.xt - 2.1) / 16)));
    const inp = Lg.planInput(lv.ref), s = Lg.spawnState(lv, -1), ev = [];
    let rnd = 3;
    while (!s.dead && !s.won) {
      const st = s.step + 1, bar = Math.floor(4 * st / 96 / 16), mash = lv.freeBars.has(bar) && (rnd = (rnd * 1103515245 + 12345) % 2147483648) % 9 === 0;
      const e2 = []; Lg.stepState(lv, s, inp.press.has(st) || mash, e2, inp.hold.has(st)); ev.push(...e2);
    }
    const sparks = ev.filter(e => e.type === 'spark').length;
    ok(s.won && sparks > 20 && noReds, `[${tag}] 연출 마디(${[...lv.freeBars].join(', ')})에서는 마구 눌러도(${sparks}번) 길이 그대로라 완주한다`);
    if (lv.wideBars.size) {
      // 넓은 통로: 천장이 두 배 높이, 높이 다섯 단계. 틀린 쪽이 공중이면 떠 있는 장애물이 놓인다
      const kinds = [...new Set(lv.reds.map(q => q.kind))].sort(), wb = [...lv.wideBars][0];
      const floats = lv.reds.filter(q => q.kind === 'float');
      ok(kinds.join(',') === 'ceil,float,floor' && floats.every(q => lv.wideBars.has(Math.floor((q.xt - 0.01) / 16))), `[${tag}] 넓은 통로 마디(${[...lv.wideBars].join(', ')})에는 바닥·천장 이빨 말고 가운데에 떠 있는 장애물도 나온다 (${floats.length}개)`);
      ok(Math.abs(Lg.ceilAt(lv, wb * 16 + 1) - (4 * Lg.ZIG_STEP + 0.8)) < 1e-9 && Math.abs(Lg.ceilAt(lv, lv.rides[0][0] + 1) - Lg.ZIG_TOP) < 1e-9, `[${tag}] 넓은 통로의 천장은 ${Lg.ceilAt(lv, wb * 16 + 1).toFixed(1)}칸(보통 ${Lg.ZIG_TOP}칸)`);
      // 넓은 통로로는 파란 계단을 튕기며 올라가고(wUp), 안에서는 천장에서 시작해 천장에서 끝나며(w1: 바닥까지 갔다 온다), 계단으로 내려온다(wDn)
      const s2 = Lg.spawnState(lv, -1), inp2 = Lg.planInput(lv.ref), at2 = {}, bars2 = Lg.COURSES.find(c => c.name === lv.name).bars;
      let inside = true, steps = 0;
      while (!s2.dead && !s2.won) {
        const st = s2.step + 1, e3 = []; Lg.stepState(lv, s2, inp2.press.has(st), e3, inp2.hold.has(st)); at2[s2.step] = 9 - s2.y;
        steps += e3.filter(e => e.type === 'rebound' && e.step).length;
        if (s2.mode === 'rush') for (const dx of [-0.25, 0, 0.25]) if (9 - s2.y < Lg.stairFloor(lv, s2.x + dx) - 1e-6 || 9 - s2.y + 0.8 > Lg.stairCeil(lv, s2.x + dx) + 1e-6) inside = false;
      }
      const seq = (name, want) => { const b = bars2.indexOf(name); return b >= 0 && want.every((l, k) => Math.abs(at2[b * 4 * 96 + k * 48] - l * Lg.ZIG_STEP) < 0.15); };    // 누른 지점에서는 곧바로 꺾이므로 아주 조금 못 미친다
      ok(seq('wUp', [0, 1, 2, 1, 2, 3, 2, 3, 4]) && seq('wDn', [4, 3, 2, 3, 2, 1, 2, 1, 0]), `[${tag}] 넓은 통로로는 파란 계단을 타닥타닥 튕기며 올라가고, 같은 식으로 내려온다`);
      if (bars2.includes('w5')) ok(seq('w5', [4, 3, 2, 3, 2, 3, 2, 3, 4]), `[${tag}] 넓은 통로의 연타(w5): 천장에서 내려와 가운데 두 단계 사이를 반 박마다 오가고(다섯 번 누름) 천장으로 돌아간다`);
      ok(s2.won && inside && steps >= 8 && lv.stairLo.size > 0 && lv.stairHi.size > 0, `[${tag}] 파란 발판은 닿아도 죽지 않고 튕기기만 한다(${steps}번 닿음). 공이 발판 속으로 들어가는 일은 없다`);
      ok([...lv.stairLo.keys(), ...lv.stairHi.keys()].every(n => lv.freeBars.has(Math.floor(n / 8))), `[${tag}] 파란 발판은 장애물이 없는 연출 마디에만 있다`);
      ok(lv.reds.every(q => { const sp = Lg.hazardSpan(q, 0); return q.kind === 'floor' ? sp[0] === 0 && Math.abs(sp[1] - q.tip) < 1e-9 : q.kind === 'ceil' ? Math.abs(sp[0] - q.tip) < 1e-9 : (Math.abs(sp[1] - sp[0] - 3.2) < 1e-6 || Math.abs(sp[1] - sp[0] - 2.7) < 1e-6) && Lg.hazardSpan(q, q.w)[1] - Lg.hazardSpan(q, q.w)[0] < 1e-6; }), `[${tag}] 장애물 모양: 이빨은 삼각형, 떠 있는 것은 길이 3.2칸(연타 패턴에서는 2.7칸)의 마름모(양 끝이 뾰족)`);
    }
    if (lv.squeezes.some(q => !q.mid)) {      // (얇은 굴만 있고 조여드는 통로는 없는 라운드도 있다)
      // 조여드는 통로: 닿는 간격이 1박에서 1/32박까지 반씩 줄고, 통로 폭도 그만큼 좁아진다(끝에서는 공 크기와 거의 같다)
      const sq = lv.squeezes.find(q => !q.mid), allHits = ev.filter(e => e.type === 'rebound' && e.tight).length, others = lv.squeezes.filter(q => q !== sq).reduce((u, q) => u + q.pts.length - 2, 0), hits = allHits - others;      // (조여드는 통로가 여럿이면 나머지 것들이 치는 횟수를 뺀다. mid = 피버 한가운데의 얇은 굴)
      const gaps = sq.pts.slice(1).map((p, i) => (p.step - sq.pts[i].step) / 96);
      const uniq = [...new Set(gaps)];
      ok(uniq.join(',') === '1,0.5,0.25,0.125,0.0625,0.03125' && hits === sq.pts.length - 2, `[${tag}] 조여드는 통로(마디 ${sq.x0 / 16}~${sq.x1 / 16 - 1}): 닿는 간격 ${uniq.join(' → ')}박, 모두 ${hits}번 친다`);
      ok(Math.abs(Lg.squeezeGap(lv, sq.x0) - 2 * Lg.ZIG_STEP) < 1e-9 && Lg.squeezeGap(lv, sq.x1) < 0.13 && Lg.squeezeGap(lv, sq.x0 - 1) === null, `[${tag}] 통로 폭이 ${(2 * Lg.ZIG_STEP).toFixed(1)}칸에서 ${Lg.squeezeGap(lv, sq.x1).toFixed(2)}칸까지 좁아진다`);
      const goalBar = C.bars.indexOf('goal');
      { const endBar = sq.x1 / 16, after = C.bars[endBar]; ok(sq.x1 === goalBar * 16 || after === 'cp', `[${tag}] 조여드는 통로는 피버의 맨 끝에 있다: 끝나는 순간이 ${sq.x1 === goalBar * 16 ? '곡의 끝맺는 한 방' : '체크포인트 마디의 첫 박'}(마디 ${endBar})`); }
    }
  }
}

console.log('== 이후 라운드용으로 보관한 함정(매달린 덩어리 없이, 착지 자리의 빨간 바닥으로 죽는다) ==');
for (const [name, lead] of [['goStopB', 'peak'], ['stopGoB', 'peak'], ['holdStopB', 'mix'], ['ringFake', 'ringWave'], ['ringStopB', 'ringRun']]) {
  const p10 = Lg.PATTERNS[name], lvB = Lg.buildLevel({ name: 't', bpm: 152, bars: ['flat', lead, name, 'flat', 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });
  const inpB = Lg.planInput(lvB.ref), lo = 2 * 384, extra = new Set(p10.traps[0].presses.map(v => lo + Math.round(v * 96)));
  const runB = (trap) => { const sB = Lg.spawnState(lvB, -1); while (!sB.dead && !sB.won && sB.step < lo + 384 + 96) { const st = sB.step + 1; Lg.stepState(lvB, sB, inpB.press.has(st) || (trap && extra.has(st)), null, inpB.hold.has(st)); } return sB; };
  const ref = runB(false), tr = runB(true);
  let hangB = false; for (const v of p10.traps[0].presses) for (let k = 32 + Math.round(v * 4) - 1; k <= 32 + Math.round(v * 4) + 3; k++) if (lvB.ceilH[k] < 90) hangB = true;
  ok(!ref.dead && tr.dead && tr.cause === 'spike' && 9 - tr.y < 0.5 && !hangB && !Lg.COURSES.some(c => c.bars.includes(name)), `${name}: 패턴대로 가면 지나가고, 한 번 더 누르면 빨간 바닥에 떨어져 죽는다. 그 자리 위에 덩어리는 없다. 지금 코스에서는 쓰지 않는다`);
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
console.log('== 높은 박스: 이단 점프로만 넘는 빨간 박스 ==');
{
  Lg.PATTERNS.__tall = { holds: [], presses: [0.5], tol: 0.18, tall: [0.5] };
  const lvT = Lg.buildLevel({ name: 't', bpm: 152, bars: ['flat', '__tall', 'flat', 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });
  const runT = (press, holds) => { const sT = Lg.spawnState(lvT, -1), P = new Set(press); while (!sT.dead && !sT.won && sT.step < 96 * 12) { const st = sT.step + 1; Lg.stepState(lvT, sT, P.has(st), null, holds.some(q => st >= q[0] && st < q[1])); } return sT; };
  const at = Math.round(4.5 * 96), q = lvT.talls[0];
  ok(lvT.talls.length === 1 && q.x === 16 + 4 && q.h === 2.5 && q.w === 1 && q.h > Lg.JUMP_H, `패턴의 tall: [0.5] → 이단 점프의 꼭대기 바로 밑(마디 넷째 칸)에 높이 ${q.h}칸, 너비 ${q.w}칸의 박스가 선다. 튀는 높이(${Lg.JUMP_H}칸)보다 높다`);
  ok(!runT([at], []).dead && runT([], []).dead, '꼭대기에서 이단 점프하면 넘고, 그냥 튀면 박스에 걸린다');
  let holdPass = 0; for (let a = -30; a <= 30; a += 3) for (let d = 12; d <= 96; d += 6) if (!runT([], [[at + a, at + a + d]]).dead) holdPass++;
  ok(holdPass === 0, '멈춤(왼쪽)으로는 언제 얼마나 누르든 못 넘는다(멈춰서 뜬 높이보다 박스가 높다) — 231가지 모두 걸림');
  let lo = 0, hi = 0; while (lo > -48 && !runT([at + lo - 1], []).dead) lo--; while (hi < 48 && !runT([at + hi + 1], []).dead) hi++;
  ok(-lo * 4.11 >= 70 && hi * 4.11 >= 70, `이단 점프를 누르는 여유 ${(lo * 4.11).toFixed(0)}/+${(hi * 4.11).toFixed(0)}ms (다른 동작과 비슷하다)`);
  delete Lg.PATTERNS.__tall;
  for (const C of Lg.COURSES) {
    const lvC = Lg.buildLevel(C); if (!lvC.talls.length) continue;
    const tag = C.name.split(' · ')[0], inpC = lvC.ref;
    let cleared = 0, habitDead = 0;
    for (const t of lvC.talls) {                       // 박스마다: 그 박스를 넘는 이단 점프를 멈춤으로 바꿔 누르면 죽는다
      const pressStep = Math.round((t.x - 2) / 4 * 96);
      if (inpC.presses.includes(pressStep)) cleared++;
      const sC = Lg.spawnState(lvC, -1), P = new Set(inpC.presses.filter(v => v !== pressStep)), H = [...inpC.holds, [pressStep, pressStep + 72]];
      while (!sC.dead && !sC.won && sC.step < pressStep + 96 * 3) { const st = sC.step + 1; Lg.stepState(lvC, sC, P.has(st), null, H.some(h => st >= h[0] && st < h[1])); }
      if (sC.dead && Math.abs(sC.x - t.x) < 1.2) habitDead++;
    }
    ok(lvC.talls.length >= 3 && cleared === lvC.talls.length && habitDead === lvC.talls.length, `[${tag}] 높은 박스 ${lvC.talls.length}개: 모두 패턴의 이단 점프 바로 앞에 서 있고, 그 자리를 멈춤으로 누르면 그 박스에서 죽는다 (${habitDead}/${lvC.talls.length})`);
  }
}
console.log('== 떠 있는 박스: 이단 점프로 올라타는 파란 박스, 떠 있는 빨간 박스 ==');
{
  // 떠 있는 파란 박스 하나(마디 넷째 칸, 윗면 4칸)만 있는 평지에서 규칙을 본다(빨간 덩어리 없음)
  Lg.PATTERNS.__fl = { holds: [], presses: [], floats: [[4, 4, 4]] };
  const lvF = Lg.buildLevel({ name: 'f', bpm: 152, bars: ['flat', '__fl', 'flat', 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });
  const runF = (press, holds = [], until = 96 * 12) => { const sF = Lg.spawnState(lvF, -1), P = new Set(press), evs = []; while (!sF.dead && !sF.won && sF.step < until) { const st = sF.step + 1, ev = []; Lg.stepState(lvF, sF, P.has(st), ev, holds.some(q => st >= q[0] && st < q[1])); for (const e of ev) evs.push({ t: st / 96 - 4, type: e.type, h: 9 - sF.y }); } return { s: sF, evs }; };
  const dj = Math.round(4.5 * 96);
  let r = runF([dj]);
  const landP = r.evs.find(e => e.type === 'land' && e.h > 3.9), landG = r.evs.find(e => e.type === 'land' && e.t > 1.3 && e.h < 0.01), bounceG = r.evs.find(e => e.type === 'bounce' && e.t > 1.3);
  ok(lvF.grid[5][20] === '#' && lvF.grid[6][20] === '.' && landP && Math.abs(landP.h - 4) < 1e-9 && landP.t > 1.1 && landP.t < 1.3, `이단 점프의 꼭대기(4.5칸) 바로 밑, 윗면 4칸의 떠 있는 박스에 내려앉는다 (${landP && landP.t.toFixed(2)}박)`);
  ok(landG && bounceG && Math.abs(landG.t - 2) < 0.03 && Math.abs(bounceG.t - 2) < 0.03 && !r.s.dead, `가만히 있으면 잠깐 구르다 끝에서 떨어지고, 다음 박에 맞춰 땅에 닿아 바로 튄다 (땅에 닿음 ${landG && landG.t.toFixed(2)}박)`);
  r = runF([dj, Math.round(5.125 * 96)]);
  const jumpP = r.evs.find(e => e.type === 'jump' && e.h > 3.9), top = Math.max(...r.evs.filter(e => e.t < 3).map(e => e.h), 0);
  { const sF = Lg.spawnState(lvF, -1), P = new Set([dj, Math.round(5.125 * 96)]); let mx = 0; while (sF.step < 96 * 7) { Lg.stepState(lvF, sF, P.has(sF.step + 1), null, false); mx = Math.max(mx, 9 - sF.y); }
    ok(jumpP && mx > 6.1 && mx < 6.3, `박스에 닿기 직전이나 구르는 동안 누르면 박스에서 다시 뛴다 (${jumpP && jumpP.t.toFixed(2)}박에 뜀, ${mx.toFixed(2)}칸까지 올라감)`); }
  let lo = 0, hi = 0; const at2 = Math.round(5.125 * 96); const jumps = (d) => runF([dj, at2 + d]).evs.some(e => e.type === 'jump' && e.h > 3.9);
  while (lo > -60 && jumps(lo - 1)) lo--; while (hi < 60 && jumps(hi + 1)) hi++;
  ok(-lo * 4.11 >= 70 && hi * 4.11 >= 70, `박스에서 다시 뛰는 입력의 여유 ${(lo * 4.11).toFixed(0)}/+${(hi * 4.11).toFixed(0)}ms`);
  r = runF([]);
  ok(!r.s.dead && r.evs.filter(e => e.type === 'bounce').length >= 6 && !r.evs.some(e => e.type === 'land' && e.h > 1), '그냥 튀면 박스 밑으로 지나간다(박스 밑면 3칸, 공 윗면 3.05칸: 꼭대기에서 살짝 스칠 뿐 박자는 그대로)');
  // 밑에서 들이받기: 박스 바로 밑에서 이단 점프 → 머리가 닿고 떨어진다. 죽지 않는다.
  r = runF([Math.round(4.75 * 96)]);
  ok(!r.s.dead && !r.evs.some(e => e.type === 'land' && e.h > 1) && Math.max(...r.evs.map(e => e.h)) < 3.3, '박스 밑에서 뛰어올라 들이받아도 죽지 않는다(머리가 닿고 떨어진다)');
  // 옆에서: 윗부분에 걸치면 올라타고, 아랫부분에 걸치면 밑으로 밀려난다
  let climbs = 0, bonks = 0, deadF = 0, inside = 0;
  for (let d = -40; d <= 60; d += 2) { const q = runF([dj + d]); if (q.s.dead) deadF++; if (q.evs.some(e => e.type === 'climb')) climbs++; if (q.evs.some(e => e.type === 'bonk')) bonks++; }
  ok(deadF === 0 && climbs > 0 && bonks > 0, `이단 점프가 이르거나 늦어 박스 옆에 걸쳐도 죽지 않는다: 윗부분에 걸치면 올라타고(${climbs}번), 아랫부분에 걸치면 밑으로 밀려난다(${bonks}번)`);
  delete Lg.PATTERNS.__fl;

  // 떠 있는 빨간 박스: floatReds 코스에서는 매달린 덩어리가 하늘 끝까지 이어지지 않는다
  for (const C of Lg.COURSES) {
    const lvC = Lg.buildLevel(C), tag = C.name.split(' · ')[0];
    let fr = 0, thin = 0, fb = 0; for (let c = 0; c < lvC.cols; c++) { if (lvC.ceilH[c] < 90 && lvC.ceilTop[c] < 90) { fr++; if (lvC.ceilTop[c] - lvC.ceilH[c] < 1 - 1e-9) thin++; } if (lvC.floorLo[c] > 0) fb++; }
    let fl = 0; for (let rr = 0; rr < 8; rr++) for (let c = 0; c < lvC.cols; c++) if (lvC.grid[rr][c] === '#' && lvC.grid[rr + 1][c] !== '#') fl++;
    if (!C.floatReds) { ok(fr === 0 && fb === 0 && fl === 0, `[${tag}] 떠 있는 박스를 쓰지 않는 라운드: 빨간 덩어리는 전처럼 땅·하늘에 붙어 있다`); continue; }
    ok(fl >= 20 && fr >= 30 && thin === 0, `[${tag}] 떠 있는 파란 박스 ${fl}칸, 떠 있는 빨간 박스 ${fr}칸(두께 1칸 이상, 위쪽은 비어 있다)`);
    // 떠 있는 박스 마디마다: 올라탄 뒤 "떨어지기/다시 뛰기"를 반대로 하면 그 마디에서 죽는다
    let n = 0, deadN = 0;
    C.bars.forEach((name, b) => {
      const p = Lg.PATTERNS[name]; if (!p || !p.floats) return;
      const alts = [];
      for (const t of p.traps || []) if (t.presses) alts.push({ presses: [...p.presses, ...t.presses], holds: t.holds || p.holds });      // 떨어져야 하는데 뛴다(파란 천장 밑에서는: 멈춰야 하는데 뛴다)
      p.presses.forEach((t, i) => { if (p.presses.some(u => Math.abs(u - (t - 0.625)) < 1e-9)) alts.push({ presses: p.presses.filter((_, j) => j !== i), holds: p.holds }); });   // 뛰어야 하는데 떨어진다
      for (const alt of alts) {
        n++;
        const lo = b * 384, inBar = (st) => st >= lo && st < lo + 384;       // 이 마디의 입력만 바꾼다(다른 마디는 피버까지 패턴대로)
        const P = new Set([...lvC.ref.presses.filter(v => !inBar(v)), ...alt.presses.map(t => lo + Math.round(t * 96))]), H = [...lvC.ref.holds.filter(h => !inBar(h[0])), ...alt.holds.map(h => [lo + Math.round(h[0] * 96), lo + Math.round(h[1] * 96)])];
        const sC = Lg.spawnState(lvC, -1); while (!sC.dead && !sC.won && sC.x < (b + 1) * 16 + 4) { const st = sC.step + 1; Lg.stepState(lvC, sC, P.has(st), null, H.some(h => st >= h[0] && st < h[1])); }
        if (sC.dead && sC.x >= b * 16 && sC.x < (b + 1) * 16 + 0.5) deadN++;
      }
    });
    ok(deadN === n, `[${tag}] 떠 있는 박스 위에서 반대로 하면(떨어질 자리에서 뛰기, 뛸 자리에서 떨어지기) 그 마디에서 죽는다 (${deadN}/${n})`);
    // 아무렇게나 눌러도 파란 박스 속에 끼이지 않는다
    let seed = 7, stuck = 0; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let k = 0; k < 400; k++) { const sR = Lg.spawnState(lvC, Math.floor(rnd() * (lvC.cps.length + 1)) - 1); let hold = false; const pp = 0.01 + rnd() * 0.05;
      for (let i = 0; i < 96 * 40 && !sR.dead && !sR.won; i++) { if (rnd() < 0.02) hold = !hold; Lg.stepState(lvC, sR, rnd() < pp, null, hold);
        for (let rr = Math.floor(sR.y - 0.8 + 0.02); rr <= Math.floor(sR.y - 0.02); rr++) for (let c = Math.floor(sR.x - 0.37); c <= Math.floor(sR.x + 0.37); c++) if (rr >= 0 && rr < 9 && lvC.grid[rr][c] === '#') stuck++; if (!isFinite(sR.y)) stuck++; } }
    ok(stuck === 0, `[${tag}] 아무렇게나 400번 달려 봐도 공이 파란 박스 속에 끼이지 않는다`);
  }
}
console.log('== 피버: 벽을 친 직후에 누른 것도 먹힌다 ==');
{
  // z5 = "F.F.F.F.": 바닥을 치고 반 박 뒤(가운데 높이)에서 눌러 되돌아가기를 네 번. 벽을 친 순간부터 누르는 자리까지가 반 박(약 197ms)이다
  const lvZ = Lg.buildLevel({ name: 'z', bpm: 152, bars: ['flat', 'zE', 'z5', 'zE', 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });
  const refZ = lvZ.ref.presses.slice();
  const runZ = (pr) => { const sZ = Lg.spawnState(lvZ, -1), P = new Set(pr), evs = []; while (!sZ.dead && !sZ.won) { const ev = []; Lg.stepState(lvZ, sZ, P.has(sZ.step + 1), ev, false); for (const e of ev) evs.push(e); } return { won: sZ.won, evs }; };
  const wall = refZ[0] - 48;                              // 첫 누름의 반 박 앞 = 바닥을 친 순간
  const early = [2, 6, 12, 20, 23].map(d => [d, runZ(refZ.map((v, i) => (i === 0 ? wall + d : v)))]);
  ok(early.every(([, r]) => r.won && r.evs.some(e => e.type === 'flip' && e.early)), `벽을 치고 ${early.map(([d]) => (d * 4.11).toFixed(0)).join(', ')}ms 뒤에 눌러도 다음 지점에서 꺾인다(전에는 벽에서 99ms 안에 누르면 버려졌다)`);
  let lo = 0, hi = 0; while (lo > -60 && runZ(refZ.map((v, i) => (i === 0 ? v + lo - 1 : v))).won) lo--; while (hi < 60 && runZ(refZ.map((v, i) => (i === 0 ? v + hi + 1 : v))).won) hi++;
  ok(-lo * 4.11 >= 180 && hi * 4.11 >= 90, `그 누름의 여유 ${(lo * 4.11).toFixed(0)}/+${(hi * 4.11).toFixed(0)}ms (벽을 친 순간부터 받는다)`);
  // 벽으로 다가가는 중에 누른 것은 여전히 길을 바꾸지 않는다(불꽃만)
  const toWall = runZ([...refZ, refZ[0] + 30]);
  ok(toWall.won && toWall.evs.filter(e => e.type === 'spark').length === 1, '벽으로 다가가는 중에 누른 것은 길을 바꾸지 않는다');
  // 두 번 누르면 원래대로
  const twice = runZ([wall + 4, wall + 12, ...refZ.slice(1)]);
  ok(!twice.won, '벽을 친 직후에 두 번 누르면 없던 일이 된다(그 지점에서 안 꺾여서 죽는다)');
}
console.log('== 징검다리: 두 칸짜리 파란 돌에서 돌로 저절로 튄다. 빨간 돌은 멈춰서 넘는다 ==');
{
  const mk = (seq) => Lg.buildLevel({ name: 's', bpm: 152, bars: ['idle', 'idle', ...seq, 'idle', 'idle', 'goal', 'flat'], floatReds: true, sections: [{ bar: 0, id: 'a' }] });
  const runS = (lvS, presses, holds) => { const sS = Lg.spawnState(lvS, -1), P = new Set(presses), evs = []; let mx = 0; while (!sS.dead && !sS.won) { const st = sS.step + 1, ev = []; Lg.stepState(lvS, sS, P.has(st), ev, holds.some(h => st >= h[0] && st < h[1])); mx = Math.max(mx, 9 - sS.y); for (const e of ev) evs.push({ t: st / 96 - 8, type: e.type, h: 9 - sS.y }); } return { s: sS, evs, mx }; };
  // 들어가기 + 나오기: 입력은 처음의 이단 점프 하나. 돌 여섯 개를 엇박마다 밟고, 땅에 내려와 박자에 맞춰 튄다
  let lvS = mk(['stIn', 'stOut']), r = runS(lvS, lvS.ref.presses, lvS.ref.holds);
  const hops = r.evs.filter(e => e.type === 'bounce' && Math.abs(e.h - 4) < 0.2).map(e => e.t), back = r.evs.find(e => e.type === 'bounce' && e.t > 7 && e.h < 0.2);
  ok(r.s.won && lvS.ref.presses.length === 1 && hops.length === 6 && hops.every((t, i) => Math.abs(t - (1.5 + i)) < 0.03) && back && Math.abs(back.t - 8) < 0.03, `이단 점프 한 번으로 올라타면 돌 여섯 개를 저절로 건넌다(엇박마다: ${hops.map(t => t.toFixed(2)).join(', ')}박). 내려와서는 박자에 맞춰 튄다`);
  let dead = 0, tried = 0; for (let st = 9 * 96; st < 16 * 96; st += 4) { tried++; if (!runS(lvS, [...lvS.ref.presses, st], []).s.won) dead++; }
  ok(dead === 0, `돌 위에서, 또는 돌 사이를 날다가 한 번 더 눌러도 죽지 않는다(${tried}가지 시각. 박스에서 다시 뛰던 버릇이 벌이 되지 않는다)`);
  // 빨간 돌: 그 앞에서 멈추면 한 박 떠서 그다음 돌에 내린다
  for (const seq of [['stIn', 'stOutR'], ['stInR', 'stOut'], ['stIn', 'stMidR', 'stOut']]) {
    lvS = mk(seq); r = runS(lvS, lvS.ref.presses, lvS.ref.holds);
    const h0 = lvS.ref.holds[0];
    const none = runS(lvS, lvS.ref.presses, []), dj = runS(lvS, [...lvS.ref.presses, h0[0]], []);
    let lo = 0, hi = 0; while (lo > -150 && runS(lvS, lvS.ref.presses, [[h0[0] + lo - 1, h0[1]]]).s.won) lo--; while (hi < 150 && runS(lvS, lvS.ref.presses, [[h0[0] + hi + 1, h0[1]]]).s.won) hi++;
    const long = runS(lvS, lvS.ref.presses, [[h0[0], h0[1] + 96]]).s.won;       // 한 박 넘게 누르고 있어도 된다(멈춤은 한 박에서 저절로 풀린다)
    ok(r.s.won && r.mx < 6.3 && none.s.dead && dj.s.dead && -lo * 4.11 >= 150 && hi * 4.11 >= 150 && long, `[${seq.join(' → ')}] 빨간 돌 앞에서 멈추면 그다음 돌에 내린다. 안 멈추면 빨간 돌에, 대신 뛰면 위의 빨간 덩어리에 걸린다. 누르기 시작하는 여유 ${(lo * 4.11).toFixed(0)}/+${(hi * 4.11).toFixed(0)}ms, 오래 누르고 있어도 된다`);
  }
  // 마지막 돌에서 내려올 땅이 빨간 박스
  lvS = mk(['stIn', 'stOutG', 'gAfter']); r = runS(lvS, lvS.ref.presses, lvS.ref.holds);
  { const hG = lvS.ref.holds[0], none = runS(lvS, lvS.ref.presses, lvS.ref.holds.slice(1));
    let lo = 0, hi = 0; while (lo > -150 && runS(lvS, lvS.ref.presses, [[hG[0] + lo - 1, hG[1]], ...lvS.ref.holds.slice(1)]).s.won) lo--; while (hi < 150 && runS(lvS, lvS.ref.presses, [[hG[0] + hi + 1, hG[1]], ...lvS.ref.holds.slice(1)]).s.won) hi++;
    ok(r.s.won && none.s.dead && -lo * 4.11 >= 120 && hi * 4.11 >= 120, `[stIn → stOutG → gAfter] 마지막 돌에서 튄 뒤 멈춰서 빨간 박스 위를 건넌다. 안 멈추면 죽는다. 누르기 시작하는 여유 ${(lo * 4.11).toFixed(0)}/+${(hi * 4.11).toFixed(0)}ms`); }
}
console.log('== 뒤 라운드를 위해 보관한 장치(지금 코스에서는 쓰지 않는다): 충전 고리, 계단으로 박자 틀기 ==');
{
  const lvK = Lg.buildLevel({ name: 't', bpm: 152, bars: ['flat', 'flat', 'ring1', 'ringWave', 'ringRun', 'ringStop', 'flat', 'ringRun', 'ringGlide', 'flat', 'upStairs', 'skyHold', 'skyDj', 'downStairs', 'dj2', 'flat', 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });
  const inpK = Lg.planInput(lvK.ref), sK = Lg.spawnState(lvK, -1), rings = new Set(), sky = [];
  while (!sK.dead && !sK.won) { const e = []; Lg.stepState(lvK, sK, inpK.press.has(sK.step + 1), e, inpK.hold.has(sK.step + 1)); for (const x of e) { if (x.type === 'ring') rings.add(x.c); if (x.type === 'bounce' && Math.round(9 - sK.y - 0.09) === 4) sky.push(sK.step); } }
  ok(sK.won && lvK.fixed.length === 0 && rings.size === 11, `충전 고리: 고리 하나 · 둘 · 연타 → 뚝 · 연타 → 왼쪽이 이어 붙여도 패턴대로 지나간다(고리 ${rings.size}개)`);
  ok(sky.length >= 6 && sky.every(st => st % 96 === 48), `계단으로 박자 틀기: 네 단을 오르면 꼭대기에서는 엇박에 튄다 (${sky.length}번)`);
}
console.log('== 구간 모음(sections.js): 함정을 중심으로 짠, 어디에 놓아도 되는 구간들 ==');
{
  const { SECTIONS, registerSections } = require('../sections.js');
  registerSections(Lg.PATTERNS);
  let pass = 0, clean = 0, traps = 0, lethal = 0;
  for (const sec of SECTIONS) {
    const lvS = Lg.buildLevel({ name: 't', bpm: 152, bars: ['flat', 'flat', ...sec.bars, 'flat', 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });
    const runS = (plan, until) => { const inpS = Lg.planInput(plan), sS = Lg.spawnState(lvS, -1), bS = new Set(); while (!sS.dead && !sS.won && sS.step < until) { const e = []; Lg.stepState(lvS, sS, inpS.press.has(sS.step + 1), e, inpS.hold.has(sS.step + 1)); if (e.some(x => x.type === 'bounce')) bS.add(sS.step); } return { sS, bS }; };
    const ref = runS(lvS.ref, 1e9);
    if (ref.sS.won && lvS.fixed.length === 0) pass++;
    if (ref.bS.has((2 + sec.len) * 384) && (sec.kind === 'fever' || ref.bS.has(2 * 384))) clean++;
    for (const tr of sec.diff.traps) {                 // 함정: 되풀이하던 그대로(앞 마디의 입력대로) 누르면 그 마디에서 죽는다
      if (tr.kind === 'blind' || tr.kind === 'switch') continue;      // 안내를 지운 마디와 리믹스는 죽이는 함정이 아니다
      traps++;
      const lo = (2 + tr.bar) * 384, mine = (st) => st >= lo && st < lo + 384;
      const habit = tr.kind === 'break' ? { presses: Lg.PATTERNS[sec.bars[tr.bar - 1]].presses, holds: [] } : Lg.PATTERNS[sec.bars[tr.bar]].traps[0].full;
      const r = runS({ presses: [...lvS.ref.presses.filter(v => !mine(v)), ...habit.presses.map(v => lo + Math.round(v * 96))], holds: [...lvS.ref.holds.filter(v => !mine(v[0])), ...habit.holds.map(([a, z]) => [lo + Math.round(a * 96), lo + Math.round(z * 96)])] }, lo + 384 + 96);
      if (r.sS.dead && r.sS.x >= (2 + tr.bar) * 16 && r.sS.x < (2 + tr.bar) * 16 + 16.5) lethal++;
    }
  }
  const lens = [...new Set(SECTIONS.map(s => s.len))].sort((a, b) => a - b), grades = [1, 2, 3, 4, 5].map(g => SECTIONS.filter(s => s.diff.grade === g).length), kinds = [...new Set(SECTIONS.flatMap(s => s.diff.traps.map(t => t.kind)))].sort();
  ok(SECTIONS.length === 50 && pass === 50, `구간 ${SECTIONS.length}개 모두, 평지 사이에 놓고 패턴대로 달리면 지나간다 (${pass}/50)`);
  ok(clean === 50, `모든 구간이 땅에서 박자에 맞춰 튀며 끝난다(바운스 구간은 들어올 때도) — 그래서 어떤 순서로든 이어 붙일 수 있다 (${clean}/50)`);
  ok(SECTIONS.every(s => s.diff.traps.length >= 1) && traps >= 55 && lethal === traps, `모든 구간에 함정이 있고(죽이는 함정 ${traps}개), 되풀이하던 그대로 누르면 그 마디에서 죽는다 (${lethal}/${traps})`);
  ok(kinds.length === 8, `함정의 종류 ${kinds.length}가지: ${kinds.join(', ')}`);
  // 조사한 원칙: 예측되는 함정은 함정이 아니다 → 되풀이 횟수가 들쭉날쭉하고, 함정 없이 지나가는 되풀이(헛다리)도 있다
  const repsSeen = [...new Set(SECTIONS.flatMap(s => s.diff.traps.filter(t => !['blind', 'switch'].includes(t.kind)).map(t => t.reps)))].sort(), bluffs = SECTIONS.filter(s => s.diff.bluffs > 0).length;
  ok(repsSeen.length >= 4 && bluffs >= 5, `함정 앞의 되풀이 횟수가 ${repsSeen.join('·')}번으로 여러 가지이고, 헛다리가 있는 구간이 ${bluffs}개다`);
  // 안내를 지운 마디: 입력은 되풀이하던 마디와 같고, 길잡이(수정·누르는 표시)가 없다
  const blindOk = SECTIONS.filter(s => s.diff.traps.some(t => t.kind === 'blind')).every(sec => {
    const lvB = Lg.buildLevel({ name: 't', bpm: 152, bars: ['flat', 'flat', ...sec.bars, 'flat', 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });
    return sec.diff.traps.filter(t => t.kind === 'blind').every(t => { const x0 = (2 + t.bar) * 16, p = Lg.PATTERNS[sec.bars[t.bar]], q = Lg.PATTERNS[sec.bars[t.bar - 1]]; return p.blind && JSON.stringify([p.holds, p.presses]) === JSON.stringify([q.holds, q.presses]) && !lvB.gems.some(g => g.x >= x0 && g.x < x0 + 16) && lvB.gems.some(g => g.x >= x0 - 16 && g.x < x0); });
  });
  ok(blindOk, '안내를 지운 마디는 앞 마디와 입력이 같고, 그 마디에만 길잡이가 없다');
  ok(lens.length >= 5 && grades.every(n => n >= 5), `길이 ${lens.join('·')}마디, 등급별 개수 ${grades.join(' / ')} (쉬움 → 어려움. 등급은 함정으로만 매긴다)`);
  ok(SECTIONS.every(s => s.diff.minWin >= 80), `타이밍은 난이도가 아니다: 누르는 여유는 모든 구간이 넉넉하다 (가장 좁은 것도 ±${Math.min(...SECTIONS.map(s => s.diff.minWin))}ms)`);
}
console.log('실패 ' + fails + '건');
process.exit(fails ? 1 : 0);

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

console.log('== 돌파 구간 ==');
{
  const H = (st) => 9 - st.y, B = 96;
  const mk = (...bars) => Lg.buildLevel({ name: 't', bpm: 96, bars: ['flat', ...bars, 'flat', 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });
  // presses = 누르는 스텝들, holds = [시작, 끝) 스텝 구간들
  const play = (lv, presses, holds = []) => {
    const s = Lg.spawnState(lv, -1), ev = [], P = new Set(presses);
    while (!s.dead && !s.won && s.x < lv.cols - 20) {
      const st = s.step + 1, e2 = [];
      Lg.stepState(lv, s, P.has(st), e2, holds.some(h => st >= h[0] && st < h[1]));
      for (const e of e2) ev.push({ ...e, step: s.step, h: H(s) });
    }
    return { s, ev, n: (t) => ev.filter(e => e.type === t).length };
  };
  let lv = mk('rTap3');                                  // 벽: 5, 6, 7박
  const W = lv.walls.map(w => w.step);
  let r = play(lv, []);
  ok(r.s.dead && r.s.cause === 'crash' && r.s.step === W[0] + Lg.TAP_LATE + 1, `안 누르면 첫 벽에 부딪힌다 (벽 한가운데를 ${Lg.TAP_LATE}스텝 지난 뒤)`);
  r = play(lv, W);
  const sm = r.ev.filter(e => e.type === 'smash');
  ok(!r.s.dead && sm.length === 3 && sm.every((e, i) => e.step === W[i]) && r.n('whiff') === 0, '박에 맞춰 탁 치면 그 순간 벽이 깨진다 (3개)');
  ok(Math.abs(sm[0].h - (Lg.RUSH_H - Lg.RUSH_WAVE)) < 1e-6 && Math.abs(sm[1].h - (Lg.RUSH_H + Lg.RUSH_WAVE)) < 1e-6 && r.ev.every(e => e.type !== 'bounce' || e.step < 4 * B || e.step >= 8 * B),
    `튀지 않고 위아래로 물결치며 난다: 박마다 바닥(${sm[0].h.toFixed(1)}칸)과 꼭대기(${sm[1].h.toFixed(1)}칸)에 번갈아 닿는다`);
  ok(r.ev.some(e => e.type === 'mode' && e.mode === 'rush' && e.step === 4 * B) && r.ev.some(e => e.type === 'mode' && e.mode === 'bounce' && e.step === 8 * B) && r.ev.some(e => e.type === 'bounce' && e.step <= 8 * B + 1 && e.step >= 8 * B), '관문: 마디 시작에 들어가고, 나오는 박에 바로 다시 튄다');
  r = play(lv, [W[0] - Lg.TAP_EARLY, W[1] + Lg.TAP_LATE, W[2]]);
  ok(!r.s.dead && r.n('smash') === 3, `일찍(${Lg.TAP_EARLY}스텝 전) 치거나 늦게(${Lg.TAP_LATE}스텝 뒤) 쳐도 깨진다`);
  r = play(lv, [W[0] - Lg.TAP_EARLY - 3]);
  ok(r.s.dead && r.n('whiff') === 1 && r.n('smash') === 0, '너무 일찍 치면 헛손질이 되고, 그 벽에 부딪힌다');
  r = play(lv, [W[0] - 40, W[0] - 40 + Lg.TAP_EARLY + Lg.TAP_COOL + 2, W[1], W[2]]);
  ok(!r.s.dead && r.n('whiff') === 1 && r.n('smash') === 3, '헛손질 뒤 빈틈이 지나면 다시 칠 수 있다');
  r = play(lv, [W[0] - 40, W[0] - 40 + Lg.TAP_EARLY + 5, W[1], W[2]]);
  ok(r.s.dead && r.n('smash') === 0, '헛손질 직후의 빈틈 동안에는 쳐도 듣지 않는다');
  // 아무 때나 연타해서는 못 지나간다
  const course = Lg.buildLevel(Lg.COURSE);
  const sp = Lg.spawnState(course, 2);                   // 체크포인트 3 → 바로 돌파 구간
  const upTo = course.rides[0][1];
  let mashOk = 0;
  for (const period of [5, 7, 9, 11, 13, 16, 19, 23]) for (const phase of [0, 3]) {
    const s = { ...sp };
    while (!s.dead && s.x < upTo) Lg.stepState(course, s, s.mode === 'rush' && (s.step + phase) % period === 0, null, false);
    if (!s.dead) mashOk++;
  }
  ok(mashOk === 0, '일정한 빠르기로 연타만 해서는 돌파 구간을 지나지 못한다 (16가지 빠르기 모두 실패)');
  // 꾹: 긴 덩어리
  lv = mk('rEmpty', 'rDrill');                           // 덩어리: 8.5~9.5박, 벽: 10, 11박
  const blk = lv.blocks[0], W2 = lv.walls.map(w => w.step);
  ok(blk.a === 8.5 * B && blk.b === 9.5 * B, '긴 덩어리는 패턴에 적힌 구간(8.4~9.6박)보다 양 끝이 0.1박씩 짧다');
  r = play(lv, W2, [[blk.a - 10, blk.b + 5]]);
  ok(!r.s.dead && r.n('through') === 1 && r.n('drill') === 1, '꾹 누른 채로 지나가면 뚫린다');
  r = play(lv, W2, []);
  ok(r.s.dead && r.s.step === blk.a + Math.round(0.12 * B), '안 누르면 덩어리에 부딪힌다');
  r = play(lv, W2, [[blk.a + 8, blk.b - 8]]);
  ok(!r.s.dead, '조금 늦게 누르거나 조금 일찍 떼도 된다');
  r = play(lv, W2, [[blk.a - 10, blk.b - 30]]);
  ok(r.s.dead, '덩어리 안에서 손을 떼면 부딪힌다');
  r = play(lv, W2, [[blk.a - Lg.DRILL_MAX + 20, blk.b + 5]]);
  ok(r.s.dead, `계속 누르고만 있을 수는 없다: 한 번에 최대 ${Lg.DRILL_MAX / B}박`);
  // 원버튼: 손가락 하나로 누르는 순간이 탁, 누르고 있으면 꾹. (탁도 손가락이 6스텝쯤 붙어 있고, 꾹도 누르는 순간이 함께 들어온다)
  {
    const finger = (lvl, downs) => {                       // downs = [누른 스텝, 뗀 스텝]들
      const s = Lg.spawnState(lvl, lvl.cps.length ? 2 : -1), ev = [];
      const end = lvl.rides[0][1] + 8;
      while (!s.dead && !s.won && s.x < end) {
        const st = s.step + 1, e2 = [];
        Lg.stepState(lvl, s, downs.some(d => d[0] === st), e2, downs.some(d => st >= d[0] && st < d[1]));
        ev.push(...e2);
      }
      return { s, n: (t) => ev.filter(e => e.type === t).length };
    };
    const downs = [...course.walls.map(w => [w.step, w.step + 6]), ...course.blocks.map(b => [b.a - 12, b.b + 6])];
    let f = finger(course, downs);
    ok(!f.s.dead && f.n('smash') === course.walls.length && f.n('through') === course.blocks.length && f.n('whiff') === 0, `원버튼으로 피버 구간 전체를 지난다 (탁 ${f.n('smash')}번, 꾹 ${f.n('through')}번, 헛손질 0번)`);
    const early = downs.map(d => d.slice());
    early[course.walls.length][0] = course.blocks[0].a - Lg.DRILL_LEAD - 10;       // 첫 덩어리를 한참 전부터 누른다
    f = finger(course, early);
    ok(!f.s.dead && f.n('whiff') === 1 && f.n('through') === course.blocks.length, '긴 덩어리를 너무 일찍부터 누르면 헛손질 한 번으로 치지만, 누르고 있으면 뚫린다');
  }
  // 코스의 돌파 구간: 관문 가까이에는 벽을 두지 않는다
  const ride = course.rides[0], first = course.walls[0].x - ride[0], last = ride[1] - course.walls[course.walls.length - 1].x;
  ok(course.rides.length === 1 && first >= 4 && last >= 4, `코스: 들어가서 ${first / 4}박 뒤에 첫 벽, 마지막 벽 ${last / 4}박 뒤에 나온다 (벽 ${course.walls.length}개, 긴 덩어리 ${course.blocks.length}개)`);
}

console.log('== 코스 (키 패턴 → 장애물) ==');
const idle = run(L, null);
ok(idle.s.dead && idle.s.cause === 'spike' && barOf(idle.s.x) === 2, '아무것도 안 누르면 첫 패턴 마디(마디 2)에서 죽는다');
ok(L.fixed.length === 0, '패턴의 길과 겹쳐서 걷어 낸 장애물이 없다');
const full = run(L, L.ref);
const n = (t) => full.ev.filter(e => e.type === t).length;
ok(full.s.won, `코스에 적힌 키 패턴대로 누르면 완주 (이단 점프 ${n('double')}번, 땅에서 점프 ${n('jump')}번, 멈춤 ${n('freeze')}번, 깬 벽 ${n('smash')}개, 뚫은 덩어리 ${n('through')}개)`);
ok(n('checkpoint') === L.cps.length && L.cps.length === 4, '체크포인트 4개를 모두 지난다');
ok(full.ev.filter(e => e.type === 'bounce').every(e => e.step % Lg.SUB <= 12), '코스 내내 박자에 맞춰 튄다(늦어도 1/8박 이내)');
{
  // 패턴 마디가 끝나면 다음 마디 첫 박에 땅에서 튀어야 한다(패턴끼리 어떤 순서로 이어 붙여도 되게)
  const bounceSteps = new Set(full.ev.filter(e => e.type === 'bounce' || e.type === 'pad').map(e => e.step));
  const bad = [];
  Lg.COURSE.bars.forEach((name, b) => { if (b > 0 && b < Lg.COURSE.bars.length - 1 && !(Lg.PATTERNS[name] && Lg.PATTERNS[name].mode === 'rush') && ![0, 1, 2].some(d => bounceSteps.has(4 * b * Lg.SUB + d))) bad.push(b + ' ' + name); });
  ok(bad.length === 0, '돌파 구간을 뺀 모든 마디가 첫 박에 땅에서 튀며 시작한다(돌파 구간이 끝난 다음 마디도)' + (bad.length ? ' — 어긋난 마디: ' + bad.join(', ') : ''));
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
  ok(pat.mode === 'rush' ? m.min >= 90 : m.min >= 60 && width >= 170, `${name}: 입력 여유 ${m.inputs.map(i => `${i.label} -${f(i.early)}/+${f(i.late)}`).join(', ')}ms`);
  ok(m.idleDies && m.needed.every(Boolean), `${name}: 안 누르면 죽고, 입력을 하나라도 빼먹으면 죽는다`);
}
console.log('실패 ' + fails + '건');
process.exit(fails ? 1 : 0);

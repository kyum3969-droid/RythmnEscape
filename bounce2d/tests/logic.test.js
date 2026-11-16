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

console.log('== 질주 모드 ==');
{
  const H = (st) => 9 - st.y;
  Lg.PATTERNS.tFlat = { mode: 'ride', terrain: [0, 0, 0, 0, 0, 0, 0, 0], holds: [], presses: [] };
  Lg.PATTERNS.tUp = { mode: 'ride', terrain: [0, 0, 0.6, 1.4, 2.0, 1.2, 0.4, 0], holds: [], presses: [] };
  const mk = (...bars) => Lg.buildLevel({ name: 't', bpm: 96, bars: ['flat', ...bars, 'flat', 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });
  // 그냥 타기: 땅을 따라가고, 도약대 끝에서 저절로 뜬다. 저절로 튀지는 않는다.
  let lv = mk('rRamp');
  let s = Lg.spawnState(lv, -1), ev = [], off = 0, modes = [];
  while (!s.dead && !s.won && s.x < 16 * 3 + 2) {
    const e2 = []; Lg.stepState(lv, s, false, e2, false);
    for (const e of e2) { ev.push({ ...e, x: s.x }); if (e.type === 'mode') modes.push(e.mode + '@' + (s.x / 16).toFixed(2)); }
    if (s.mode === 'ride' && s.onGround) off = Math.max(off, Math.abs(H(s) - Lg.terrainAt(lv, s.x)));
  }
  const inside = (e) => e.x >= 16 && e.x < 32;
  ok(!s.dead && off < 1e-6, '땅에 있을 때는 언덕 높이를 그대로 따라간다');
  ok(ev.filter(e => inside(e) && e.type === 'lift').length === 1 && ev.filter(e => inside(e) && e.type === 'land').length === 1, '도약대 끝에서 저절로 떴다가 내려앉는다');
  ok(!ev.some(e => inside(e) && e.type === 'bounce'), '질주 구간에서는 저절로 튀지 않는다');
  ok(modes.join(' ') === 'ride@1.00 bounce@2.00' && ev.some(e => e.type === 'bounce' && Math.abs(e.x - 32) < 0.1), `관문: ${modes.join(', ')} — 나오자마자 첫 박에 다시 튄다`);
  // 점프: 평지에서 높이 약 2.25칸, 1.4박
  lv = mk('tFlat', 'tFlat');
  const jumpRun = (level, pressBeat, holdFrom, holdTo, until) => {
    const st = Lg.spawnState(level, -1), e2 = []; let maxH = 0, landAt = null, hAt = {}, h0 = 0, top = 0;
    while (!st.dead && st.step < until * 96) {
      const b = (st.step + 1) / 96;
      Lg.stepState(level, st, st.step + 1 === Math.round(pressBeat * 96), e2, b >= holdFrom && b < holdTo);
      maxH = Math.max(maxH, H(st) - Lg.terrainAt(level, st.x));
      if (st.step === Math.round(pressBeat * 96)) h0 = H(st);
      if (st.step > pressBeat * 96 && landAt === null) top = Math.max(top, H(st));
      if (landAt === null && st.step > pressBeat * 96 && e2.some(e => e.type === 'land')) landAt = st.step / 96;
      if (st.step % 48 === 0) hAt[st.step / 96] = H(st);
      e2.length = 0;
    }
    return { maxH, landAt, hAt, st, rise: top - h0 };
  };
  let r = jumpRun(lv, 5, 99, 99, 10);
  ok(r.maxH > 2.15 && r.maxH < 2.35 && Math.abs(r.landAt - 6.42) < 0.05, `점프: 높이 ${r.maxH.toFixed(2)}칸, ${(r.landAt - 5).toFixed(2)}박 동안 뜬다`);
  // 활공: 꼭대기(5.8박)부터 누르고 있으면 거의 수평으로 간다. 최대 2박.
  const g = jumpRun(lv, 5, 5.8, 99, 10);
  ok(g.hAt[6.5] > r.hAt[6.5] + 1 && g.hAt[7] > 1.2, `활공: 1.2박 뒤에도 높이 ${g.hAt[7].toFixed(2)}칸 (안 누르면 이미 착지)`);
  ok(g.landAt > 7.9 && g.landAt < 8.9, `활공은 최대 2박(5.8~7.8박): 다 쓰면 떨어져서 ${g.landAt.toFixed(2)}박에 착지`);
  const up = jumpRun(lv, 5, 5.2, 5.7, 10);
  ok(Math.abs(up.maxH - r.maxH) < 0.01, '올라가는 동안에는 활공을 눌러도 달라지지 않는다');
  // 오르막에서 뛰면 더 높이
  const hill = mk('tUp');
  const u = jumpRun(hill, 4 + 1.25, 99, 99, 8);
  ok(u.rise > r.rise + 0.3, `오르막에서 뛰면 더 높이 솟는다 (뛴 자리에서 ${u.rise.toFixed(2)}칸, 평지는 ${r.rise.toFixed(2)}칸)`);
  // 공중에서 한 번 더
  const d = Lg.spawnState(lv, -1), e3 = [];
  while (d.step < 5.8 * 96) Lg.stepState(lv, d, d.step + 1 === 5 * 96, e3, false);
  Lg.stepState(lv, d, true, e3, false);
  for (let i = 0; i < 30; i++) Lg.stepState(lv, d, i === 10, e3, false);
  ok(e3.filter(e => e.type === 'double').length === 1 && d.vy < 0, '공중에서 누르면 이단 점프, 한 번만');
  // 화면에서 가로를 2배로 늘려 그리므로 공의 판정 폭은 절반: 덩어리 앞 0.06칸(화면으로 0.12칸)까지 다가가야 닿는다
  lv = mk('tFlat'); lv.floorH[24] = 1;
  const w = Lg.spawnState(lv, -1);
  while (!w.dead && !w.won) Lg.stepState(lv, w, false, null, false);
  ok(w.dead && w.mode === 'ride' && Math.abs(w.x - 23.95) < 0.03 && Lg.RIDE_STRETCH === 2, `질주 구간의 판정 폭은 절반 (덩어리 왼쪽 끝 24.0, 닿은 순간 공 중심 ${w.x.toFixed(2)})`);
  delete Lg.PATTERNS.tFlat; delete Lg.PATTERNS.tUp;
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
  Lg.COURSE.bars.forEach((name, b) => { if (b > 0 && b < Lg.COURSE.bars.length - 1 && !(Lg.PATTERNS[name] && Lg.PATTERNS[name].mode === 'ride') && ![0, 1, 2].some(d => bounceSteps.has(4 * b * Lg.SUB + d))) bad.push(b + ' ' + name); });
  ok(bad.length === 0, '질주 구간을 뺀 모든 마디가 첫 박에 땅에서 튀며 시작한다(질주 구간이 끝난 다음 마디도)' + (bad.length ? ' — 어긋난 마디: ' + bad.join(', ') : ''));
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
  ok(pat.mode === 'ride' ? m.min >= 100 : m.min >= 60 && width >= 170, `${name}: 입력 여유 ${m.inputs.map(i => `${i.label} -${f(i.early)}/+${f(i.late)}`).join(', ')}ms`);
  ok(m.idleDies && m.needed.every(Boolean), `${name}: 안 누르면 죽고, 입력을 하나라도 빼먹으면 죽는다`);
}
console.log('실패 ' + fails + '건');
process.exit(fails ? 1 : 0);

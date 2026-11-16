// 실행: node bounce2d/tests/logic.test.js
const Lg = require('../logic.js');
const L = Lg.buildLevel(Lg.COURSE);                 // 기본 설정: 일정 속도 + 줄에 붙이기
let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ok  ' : '  FAIL ') + msg); if (!c) fails++; };
const barOf = (x) => Math.floor(x / 16);
function run(lv, plan, from = -1) {
  const s = Lg.spawnState(lv, from), inp = plan ? Lg.planInput(plan) : { dash: new Set(), hold: new Set() }, ev = [];
  while (!s.dead && !s.won) { Lg.stepState(lv, s, inp.dash.has(s.step + 1), ev, inp.hold.has(s.step + 1)); for (const e of ev) if (e.step === undefined) e.step = s.step; }
  return { s, ev };
}
const FLAT = { name: 't', bpm: 128, bars: ['flat', 'flat', 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] };
const flat = Lg.buildLevel(FLAT, { linear: false, snap: false });     // 아래 '기본 동작'은 포물선·붙이기 없음 기준

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

console.log('== 일정 속도 / 줄에 붙이기 ==');
{
  const lin = Lg.buildLevel(FLAT, { linear: true, snap: false });
  const hAt = (lv, step) => { const s = Lg.spawnState(lv, -1); while (s.step < step) Lg.stepState(lv, s, false, null, false); return 9 - s.y; };
  // 첫 바운스는 스텝 1에서 시작 → 1/4박(스텝 25), 1/2박(49), 3/4박(73)
  const q = hAt(lin, 25), half = hAt(lin, 49), tq = hAt(lin, 73);
  ok(Math.abs(q - Lg.JUMP_H / 2) < 0.06 && Math.abs(half - Lg.JUMP_H) < 0.06 && Math.abs(tq - Lg.JUMP_H / 2) < 0.06, `일정 속도: 1/4박에 절반 높이(${q.toFixed(2)}), 반 박자에 꼭대기(${half.toFixed(2)}), 3/4박에 다시 절반(${tq.toFixed(2)})`);
  const pq = hAt(flat, 25);
  ok(pq > Lg.JUMP_H * 0.7, `포물선은 1/4박에 이미 ${(pq / Lg.JUMP_H * 100).toFixed(0)}% 높이 → 중간 높이를 빨리 지나간다`);
  const r = run(lin, null), b = r.ev.filter(e => e.type === 'bounce');
  ok(r.s.won && b.every(e => e.step % Lg.SUB <= 1), '일정 속도에서도 박자마다 정확히 튄다');

  const snap = Lg.buildLevel(FLAT, { linear: true, snap: true });
  const freezeAt = (lv, step, n = 5) => { const s = Lg.spawnState(lv, -1), ev = []; while (s.step < step) Lg.stepState(lv, s, false, null, false); const before = 9 - s.y; for (let i = 0; i < n; i++) Lg.stepState(lv, s, false, ev, true); return { before, after: 9 - s.y, s, ev }; };
  let f = freezeAt(snap, 1 + 14);     // 올라가는 중 높이 약 0.66
  ok(Math.abs(f.after - Lg.LANES[0]) < 1e-9 && f.ev.some(e => e.type === 'snap'), `붙이기: 높이 ${f.before.toFixed(2)}에서 멈추면 아래 줄(${Lg.LANES[0]})에 붙는다`);
  f = freezeAt(snap, 1 + 30);         // 약 1.41 → 아래 줄
  ok(Math.abs(f.after - Lg.LANES[0]) < 1e-9, `붙이기: 높이 ${f.before.toFixed(2)}도 아래 줄`);
  f = freezeAt(snap, 1 + 40);         // 약 1.88 → 위 줄
  ok(Math.abs(f.after - Lg.LANES[1]) < 1e-9, `붙이기: 높이 ${f.before.toFixed(2)}에서 멈추면 위 줄(${Lg.LANES[1]})에 붙는다`);
  f = freezeAt(lin, 1 + 30);
  ok(Math.abs(f.after - f.before) < 1e-9 && !f.ev.some(e => e.type === 'snap'), '붙이기를 끄면 누른 그 높이에 멈춘다');
  // 대시도 줄에 붙는다
  const d = Lg.spawnState(snap, -1); while (d.step < 1 + 40) Lg.stepState(snap, d, false, null, false);
  Lg.stepState(snap, d, true, null, false);
  ok(d.dashing > 0 && Math.abs((9 - d.y) - Lg.LANES[1]) < 1e-9, '붙이기: 대시도 가까운 줄에서 나간다');
  // 줄마다 누를 수 있는 시간
  const windows = (lv) => { const out = [0, 0]; for (let st = 2; st <= 96; st++) { const s = Lg.spawnState(lv, -1); while (s.step < st) Lg.stepState(lv, s, false, null, false); if (s.onGround) continue; Lg.stepState(lv, s, false, null, true); const h = 9 - s.y; out[Math.abs(h - Lg.LANES[0]) < 1e-9 ? 0 : 1]++; } return out.map(n => n * 60000 / 128 / 96); };
  const wl = windows(snap), wp = windows(Lg.buildLevel(FLAT, { linear: false, snap: true }));
  console.log(`      한 번 튀는 동안 줄마다 누를 수 있는 시간 — 일정 속도: 아래 ${wl[0].toFixed(0)}ms / 위 ${wl[1].toFixed(0)}ms,  포물선: 아래 ${wp[0].toFixed(0)}ms / 위 ${wp[1].toFixed(0)}ms`);
  ok(wl[1] >= 120 && wl[0] >= 250, '일정 속도 + 붙이기: 위 줄 120ms 이상, 아래 줄 250ms 이상(올라갈 때와 내려올 때 합)');
}

console.log('== 기둥 / 매달린 톱날 ==');
{
  const mk = (name, cfg) => Lg.buildLevel({ name, bpm: 128, bars: ['flat', name, 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] }, cfg);
  const holdRun = (lv, fromX, toX) => { const s = Lg.spawnState(lv, -1); while (!s.dead && !s.won && s.x < 16 + 12) Lg.stepState(lv, s, false, null, s.x >= 16 + fromX && s.x < 16 + toX); return s; };
  let lv = mk('pillar');
  ok(holdRun(lv, 99, 99).cause === 'crash', '기둥: 그냥 튀면 부딪힌다');
  ok(!holdRun(lv, 5.7, 8.6).dead, '기둥: 꼭대기 근처에서 멈추면(위 줄) 넘어간다');
  ok(holdRun(lv, 4.6, 8.6).cause === 'crash', '기둥: 낮을 때 멈추면(아래 줄) 부딪힌다');
  {   // 위 줄에 붙일 수 있는 시점부터 기둥에 닿기 전까지 = 누를 수 있는 시간
    let n = 0;
    for (let st = 96 * 4 + 96; st < 96 * 4 + 96 * 2; st++) { const s = Lg.spawnState(lv, -1); while (!s.dead && !s.won && s.x < 16 + 12) Lg.stepState(lv, s, false, null, s.step >= st && s.x < 16 + 8.6); if (!s.dead) n++; }
    const ms = n * 60000 / 128 / 96;
    ok(ms >= 110, `기둥: 멈춤을 누르기 시작할 수 있는 시간 ${ms.toFixed(0)}ms`);
  }
  lv = mk('hang');
  ok(holdRun(lv, 99, 99).cause === 'saw', '매달린 톱날: 그냥 튀면 닿는다');
  ok(!holdRun(lv, 4.6, 7.2).dead, '매달린 톱날: 낮을 때 멈추면(아래 줄) 밑으로 지나간다');
  ok(holdRun(lv, 5.8, 7.2).cause === 'saw', '매달린 톱날: 꼭대기에서 멈추면(위 줄) 닿는다');
  {
    let n = 0;
    for (let st = 96 * 4 + 96; st < 96 * 4 + 96 * 2; st++) { const s = Lg.spawnState(lv, -1); while (!s.dead && !s.won && s.x < 16 + 12) Lg.stepState(lv, s, false, null, s.step >= st && s.x < 16 + 7.3); if (!s.dead) n++; }
    const ms = n * 60000 / 128 / 96;
    ok(ms >= 110, `매달린 톱날: 멈춤을 누르기 시작할 수 있는 시간 ${ms.toFixed(0)}ms`);
  }
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
console.log('== 다른 설정 조합에서도 깰 수 있는지 ==');
for (const cfg of [{ linear: true, snap: false }, { linear: false, snap: true }, { linear: false, snap: false }]) {
  const lv = Lg.buildLevel(Lg.COURSE, cfg);
  const okAll = !!Lg.solve(lv, Lg.spawnState(lv, -1), { grid: 12 }).plan && lv.cps.every((_, i) => !!Lg.solve(lv, Lg.spawnState(lv, i), { grid: 12 }).plan);
  ok(okAll, `움직임 ${cfg.linear ? '일정 속도' : '포물선'} · 줄에 붙이기 ${cfg.snap ? '켜짐' : '꺼짐'}: 처음부터, 각 체크포인트부터 완주 가능`);
}
console.log('실패 ' + fails + '건');
process.exit(fails ? 1 : 0);

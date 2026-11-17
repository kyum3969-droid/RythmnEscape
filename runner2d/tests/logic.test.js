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
const brokenCols = new Set(full.ev.filter(e => e.type === 'break').map(e => e.c));
ok(brokenCols.size >= wallCols.size - 1 && L.switches.every(sw => brokenCols.has(sw.col)), `대시벽 ${wallCols.size}개 중 ${brokenCols.size}개를 대시로 깬다 (점프대로 넘을 수 있는 벽 1개 제외, 관문 2개 포함)`);
ok(count('dash') >= 10, '대시가 꼭 필요한 구간이 충분히 있다');

// ---- 바운스 모드
ok(L.switches.length === 2 && L.switches[0].mode === 'bounce' && L.switches[1].mode === 'run', '모드 관문 2개: 바운스로 들어갔다가 달리기로 돌아온다');
{
  const s = Lg.spawnState(L, -1), set = new Set(sol); let bounces = 0, offBeat = 0, jumpsInBounce = 0, modes = [];
  while (!s.dead && !s.won) {
    const ev = []; Lg.stepState(L, s, set.has(s.step + 1), ev);
    for (const e of ev) {
      if (e.type === 'bounce') { bounces++; if (s.step % Lg.SUB > 8) offBeat++; }
      if (e.type === 'jump' && s.mode === 'bounce') jumpsInBounce++;
      if (e.type === 'mode') modes.push(e.mode);
    }
  }
  ok(bounces >= 12 && offBeat === 0, `바운스 모드에서 ${bounces}번 저절로 튀고, 전부 박자에 맞음(40ms 이내)`);
  ok(jumpsInBounce === 0 && modes.join() === 'bounce,run', '바운스 모드에는 직접 점프가 없고, 관문을 지날 때 모드가 바뀐다');
  const gateIn = L.switches[0].col, bar1 = Math.floor(gateIn / 16) + 1;
  const cut = sol.filter(st => Lg.TPB * st / Lg.SUB < bar1 * 16);       // 바운스 첫 마디부터는 아무것도 안 누름
  const r = run(cut);
  ok(r.s.dead && r.s.cause === 'spike' && Math.floor(r.s.x / 16) === bar1, '바운스에서 대시를 안 하면 착지점 가시에 죽는다');
  const noGate = run(sol.filter(st => Lg.TPB * st / Lg.SUB < gateIn - 8));   // 관문 앞에서 입력을 끊음
  ok(noGate.s.dead && noGate.s.cause === 'wall' && Math.abs(noGate.s.x - gateIn) < 1, '모드 관문은 대시 없이는 못 지나간다');
}

// ---- 새 장애물: 작은 시험 코스로 하나씩 확인
{
  const mini = (name) => Lg.buildLevel({ name, bpm: 128, bars: ['flat', name, 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });
  const sim = (lv, presses, untilX = 1e9) => {       // presses: 누를 x 좌표 목록
    const s = Lg.spawnState(lv, -1), ev = [], todo = [...presses]; let maxH = 0;
    while (!s.dead && !s.won && s.x < untilX) {
      const press = todo.length && s.x >= todo[0]; if (press) todo.shift();
      Lg.stepState(lv, s, press, ev); maxH = Math.max(maxH, 9 - s.y);
    }
    return { s, ev, maxH };
  };
  let lv = mini('saws1'), r = sim(lv, [], 16 + 7);
  ok(!r.s.dead, '톱날: 위에 올라가 있는 톱날 밑은 그냥 달려서 지나간다');
  r = sim(lv, [16 + 3], 16 + 7);
  ok(r.s.dead && r.s.cause === 'saw', '톱날: 그 밑에서 뛰면 톱날에 닿아 죽는다');
  r = sim(lv, []);
  ok(r.s.dead && r.s.cause === 'saw' && Math.abs(r.s.x - (16 + 8.5)) < 1, '톱날: 내려와 있는 톱날은 뛰지 않으면 죽는다');
  ok(!!Lg.solve(lv, Lg.spawnState(lv, -1), { grid: 12 }).presses, '톱날 마디는 깰 수 있다');

  lv = mini('pad1'); r = sim(lv, [], 16 + 11);
  ok(!r.s.dead && r.ev.some(e => e.type === 'pad') && r.maxH > 4.5, `점프대: 아무것도 안 눌러도 저절로 솟아 높은 벽을 넘는다 (높이 ${r.maxH.toFixed(1)}칸)`);
  r = sim(lv, [16 + 2]);
  ok(r.s.dead && r.s.cause === 'crash', '점프대: 점프대를 뛰어넘어 버리면 벽에 부딪힌다');

  lv = mini('nojump'); r = sim(lv, [], 16 + 13);
  ok(!r.s.dead, '천장 가시: 뛰지 않으면 통과');
  r = sim(lv, [16 + 6], 16 + 13);
  ok(r.s.dead && r.s.cause === 'spike', '천장 가시: 그 밑에서 뛰면 죽는다');

  lv = mini('rings1');
  const rs = Lg.solve(lv, Lg.spawnState(lv, -1), { grid: 12 }).presses;
  r = rs ? sim(lv, []) : null;
  const replay = (() => { const s = Lg.spawnState(lv, -1), set = new Set(rs || []), ev = []; while (!s.dead && !s.won) Lg.stepState(lv, s, set.has(s.step + 1), ev); return { s, ev }; })();
  const airDashes = (() => { let best = 0, cur = 0; for (const e of replay.ev) { if (e.type === 'dash') best = Math.max(best, ++cur); if (e.type === 'land') cur = 0; } return best; })();
  ok(replay.s.won && replay.ev.some(e => e.type === 'ring') && airDashes >= 2, `고리: 한 번 뛰어서 대시를 ${airDashes}번 이어 긴 허공을 건넌다`);
  {   // 고리가 없으면 못 건넘
    const noRing = Lg.buildLevel({ name: 'x', bpm: 128, bars: ['flat', 'rings1', 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });
    for (const row of noRing.grid) for (let c = 0; c < row.length; c++) if (row[c] === 'O') row[c] = '.';
    ok(!Lg.solve(noRing, Lg.spawnState(noRing, -1), { grid: 6 }).presses, '고리: 고리를 없애면 같은 허공을 건널 수 없다');
  }
  for (const name of ['sawlow', 'padwall', 'rings2', 'sawmix', 'ringfinal']) {
    const l2 = mini(name);
    ok(!!Lg.solve(l2, Lg.spawnState(l2, -1), { grid: 12 }).presses && sim(l2, []).s.dead, `${name}: 깰 수 있고, 아무것도 안 하면 죽는다`);
  }
}
{
  const evs = full.ev.map(e => e.type);
  const n = (t) => evs.filter(e => e === t).length;
  ok(n('pad') >= 2 && n('ring') >= 3, `전체 코스 풀이에 점프대 ${n('pad')}번, 고리 ${n('ring')}번이 쓰인다`);
  ok(L.saws.length >= 7 && L.saws.some(w => w.kind !== 'static'), `톱날 ${L.saws.length}개 (움직이는 것 ${L.saws.filter(w => w.kind !== 'static').length}개)`);
}

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

// ---- 대시 예약 / 벽 깨짐
{
  const mini = (name) => Lg.buildLevel({ name, bpm: 128, bars: ['flat', name, 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });
  const sim = (lv, presses, untilX = 1e9) => {       // presses: 누를 x 좌표 목록
    const s = Lg.spawnState(lv, -1), ev = [], todo = [...presses];
    while (!s.dead && !s.won && s.x < untilX) { const press = todo.length && s.x >= todo[0]; if (press) todo.shift(); Lg.stepState(lv, s, press, ev); }
    return { s, ev };
  };
  const dashes = (r) => r.ev.filter(e => e.type === 'dash').length;
  // rings1: 구덩이 4~13, 고리 9번 칸. 첫 대시가 끝나기 전에 한 번 더 눌러 둔다.
  let lv = mini('rings1');
  let r = sim(lv, [16 + 3.4, 16 + 5.4, 16 + 8.4], 16 + 15);
  ok(!r.s.dead && dashes(r) === 2, '대시 예약: 첫 대시가 끝나기 전에 누른 입력이 고리에서 다음 대시로 이어진다');
  r = sim(lv, [16 + 3.4, 16 + 5.4], 16 + 15);
  ok(r.s.dead && r.s.cause === 'fall' && dashes(r) === 1, '대시 예약: 두 번째를 안 누르면 그대로 떨어진다(저절로 대시하지 않음)');
  r = sim(lv, [16 + 3.4, 16 + 5.4, 16 + 6.0], 16 + 15);
  ok(dashes(r) === 1, '대시 예약: 너무 일찍(150ms보다 전에) 누른 입력은 잊는다');
  // wall: 가시 6번 칸, 벽 9번 칸
  lv = mini('wall');
  r = sim(lv, [16 + 5.5, 16 + 6.0], 16 + 12);        // 대시가 벽 안에서 끝난다
  ok(!r.s.dead && r.ev.some(e => e.type === 'break'), '벽: 대시가 벽 안에서 끝나도, 대시로 닿은 벽은 깨져서 죽지 않는다');
  r = sim(lv, [16 + 4.6, 16 + 4.95], 16 + 12);       // 대시가 벽 바로 앞에서 끝난다
  ok(!r.s.dead && r.ev.some(e => e.type === 'break'), '벽: 대시가 벽 바로 앞에서 끝나도 직후(80ms)에 닿으면 깨진다');
  r = sim(lv, [16 + 4.6], 16 + 12);
  ok(r.s.dead && r.s.cause === 'wall', '벽: 대시 없이 닿으면 죽는다');
  lv = mini('thick');                                  // 두 칸짜리 벽(6·7번 칸)
  r = sim(lv, [16 + 2.5, 16 + 3.0], 16 + 10);        // 대시가 첫 칸에서 끝난다
  ok(!r.s.dead && new Set(r.ev.filter(e => e.type === 'break').map(e => e.c)).size === 2, '두꺼운 벽: 대시로 닿으면 붙어 있는 칸이 한꺼번에 깨진다');
}

// ---- 타이밍 여유(ms): 앞의 입력을 모두 여유 한가운데에서 눌렀을 때, 다음 입력을 얼마나 일찍/늦게 눌러도 되는가
const { centeredWindows } = require('./windows.js');
const wins = centeredWindows(L);
const tight = {};
for (const w of wins) tight[w.bar] = Math.min(tight[w.bar] ?? 1e9, w.ms);
console.log('  마디별 가장 좁은 타이밍 여유(ms)  ' + Object.entries(tight).map(([b, w]) => `${b}:${w > 290 ? '290+' : w.toFixed(0)}`).join('  '));
const worst = wins.reduce((a, b) => (b.ms < a.ms ? b : a));
ok(worst.ms >= 80, `가장 좁은 입력 여유 ${worst.ms.toFixed(0)}ms (마디 ${worst.bar} ${Lg.COURSE.bars[worst.bar]}의 ${worst.type === 'jump' ? '점프' : '대시'})`);
L.cps.forEach((cp, i) => {
  const w = centeredWindows(L, i);
  ok(w.every(x => x.ms >= 80), `체크포인트 ${i + 1}에서 다시 시작해도 모든 입력 여유가 80ms 이상`);
});

console.log('실패 ' + fails + '건');
process.exit(fails ? 1 : 0);

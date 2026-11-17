// 시안(LAB) A~D 검사. 실행: node bounce2d/tests/lab.test.js
// 모든 시안에서: 패턴대로 가면 완주하고, 틀리게(버릇대로) 누르면 바로 그 마디에서 죽는다.
const Lg = require('../logic.js');
let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ok  ' : '  FAIL ') + msg); if (!c) fails++; };
const SUB = Lg.SUB, BAR = 4 * SUB;
const [A, B, C, D] = Lg.LABS;

// b번 마디의 입력만 acts(마디 안의 박)로 바꿔서 처음부터 달린다. 끝난 상태를 돌려준다.
function runWith(L, b, acts) {
  const ref = Lg.planInput(L.ref), lo = b * BAR, hi = lo + BAR;
  const press = new Set(acts.presses.map((t) => lo + Math.round(t * SUB)));
  const holds = acts.holds.map(([a, z]) => [lo + Math.round(a * SUB), lo + Math.round(z * SUB)]);
  const s = Lg.spawnState(L, -1);
  while (!s.dead && !s.won) {
    const st = s.step + 1, inBar = st >= lo && st < hi;
    Lg.stepState(L, s, inBar ? press.has(st) : ref.press.has(st), null, inBar ? holds.some((h) => st >= h[0] && st < h[1]) : ref.hold.has(st));
  }
  return s;
}
const diesIn = (L, b, acts) => { const s = runWith(L, b, acts); return s.dead && Math.floor(s.x / 16) === b; };
const inputs = (name) => ({ presses: Lg.PATTERNS[name].presses, holds: Lg.PATTERNS[name].holds });
const gemsIn = (L, b) => L.gems.filter((g) => g.x >= b * 16 && g.x < b * 16 + 16).length;

for (const Cs of Lg.LABS) {
  const L = Lg.buildLevel(Cs), { end } = Lg.traceRun(L, L.ref);
  ok(end.won && L.fixed.length === 0, `${Cs.name}: 패턴대로 가면 완주한다(걷어 낸 장애물 없음)`);
}

console.log('== A 따라 치기 ==');
{
  const L = Lg.buildLevel(A), tr = Lg.traceRun(L, L.ref).trace, hAt = new Map(tr.map((t, i) => [i + 1, t.h]));
  const calls = A.bars.map((n, b) => [n, b]).filter(([n]) => Lg.PATTERNS[n] && Lg.PATTERNS[n].call);
  // 유령은 언제나 맞게 친다: 부르는 마디의 유령 자취 = 다음 마디에서 패턴대로 친 공의 자취
  let worst = 0, same = true;
  for (const [n, b] of calls) {
    const next = A.bars[b + 1], q = Lg.PATTERNS[n].call;
    if (JSON.stringify(inputs(next)) !== JSON.stringify(inputs(q))) same = false;
    for (let k = 1; k <= BAR; k++) { const g = L.ghost.get(b * BAR + k), r = hAt.get((b + 1) * BAR + k); if (g && r !== undefined) worst = Math.max(worst, Math.abs(g.h - r)); else same = false; }
  }
  ok(same && worst < 1e-6, `유령이 보여 준 것 = 다음 마디의 정답 (부르는 마디 ${calls.length}개, 높이 차이 최대 ${worst.toExponential(1)})`);
  ok(calls.every(([n, b]) => !gemsIn(L, b) && !L.floorH.slice(b * 16, b * 16 + 16).some((v) => v > 0) && !L.ceilH.slice(b * 16, b * 16 + 16).some((v) => v < 90)), '부르는 마디에는 장애물도 길잡이도 없다(유령만 친다)');
  const resp = A.bars.map((n, b) => [n, b]).filter(([n]) => n.startsWith('b_'));
  ok(resp.every(([, b]) => gemsIn(L, b) === 0), `따라 치는 마디 ${resp.length}개에는 길잡이가 없다`);
  ok(resp.every(([, b]) => diesIn(L, b, { presses: [], holds: [] })), '따라 치는 마디는 아무것도 안 누르면 죽는다(유령을 봐야 한다)');
  // 버릇 함정: 앞의 따라 치기(두 마디 앞)대로 누르면 그 마디에서 죽는다
  for (const name of ['b_goStop', 'b_holdStop', 'b_mix2']) {
    const b = A.bars.indexOf(name), habit = A.bars[b - 2];
    ok(diesIn(L, b, inputs(habit)), `${name}(마디 ${b}): 앞에서 따라 치던 ${habit}대로 누르면 죽는다 — 유령은 다르게 쳐 보였다`);
  }
}

console.log('== B 사라지는 장애물 ==');
{
  const L = Lg.buildLevel(B), hid = B.bars.map((n, b) => [n, b]).filter(([n]) => Lg.PATTERNS[n] && Lg.PATTERNS[n].hidden);
  ok(hid.every(([, b]) => gemsIn(L, b) === 0), `흐려지는 마디 ${hid.length}개에는 길잡이가 없다`);
  ok(hid.every(([, b]) => L.floorH.slice(b * 16, b * 16 + 16).some((v) => v > 0) || L.ceilH.slice(b * 16, b * 16 + 16).some((v) => v < 90)), '흐려지는 마디에도 빨간 덩어리가 있다(멀리서는 보인다)');
  ok(hid.every(([, b]) => diesIn(L, b, { presses: [], holds: [] })), '흐려지는 마디는 아무것도 안 누르면 죽는다');
  for (const name of ['h_goStop', 'h_holdStop']) for (let b = B.bars.indexOf(name); b >= 0; b = B.bars.indexOf(name, b + 1)) {
    const habit = B.bars[b - 1];
    ok(diesIn(L, b, inputs(habit)), `${name}(마디 ${b}): 바로 앞의 ${habit}대로 누르면 죽는다`);
  }
}

console.log('== C 정지·변속 ==');
{
  const L = Lg.buildLevel(C);
  const blk = (b) => JSON.stringify([Array.from(L.floorH.slice(b * 16, b * 16 + 16)), Array.from(L.ceilH.slice(b * 16, b * 16 + 16))]);
  const mixB = C.bars.indexOf('mix'), s2 = C.bars.indexOf('s2_mix'), s05 = C.bars.indexOf('s05_mix');
  ok(blk(mixB) === blk(s2) && blk(mixB) === blk(s05) && Lg.PATTERNS.s2_mix.scroll === 2 && Lg.PATTERNS.s05_mix.scroll === 0.5, '늘린 마디·줄인 마디의 장애물은 보통 mix와 칸마다 똑같다(그림만 바뀐다)');
  const lids = C.bars.map((n, b) => [n, b]).filter(([n]) => n === 's_lid');
  for (const [, b] of lids) {
    ok(diesIn(L, b, inputs('peak')), `멈춘 마디의 뚜껑(마디 ${b}): 이어 치던 peak대로 이단 점프하면 죽는다`);
    ok([0.5, 1.5, 2.5, 3.5].every((t) => diesIn(L, b, { presses: [t], holds: [] })), `  (마디 ${b}) 어느 박에 이단 점프해도 뚜껑에 걸린다`);
  }
}

console.log('== D 오르내리는 문 ==');
{
  const L = Lg.buildLevel(D);
  // 공은 정박에 문을 지나간다: 지나가는 동안(±1/4박) 문은 자리를 잡고 있다
  ok(L.gates.every((g) => { const n = g.x / 4; const a = Lg.gateSpan(g, n - 0.25), z = Lg.gateSpan(g, n + 0.25), m = Lg.gateSpan(g, n); return a.lo === m.lo && z.lo === m.lo; }), `문 ${L.gates.length}개 모두, 공이 지나가는 동안에는 움직이지 않는다`);
  ok(L.gates.some((g) => g.seq.length > 1), '움직이는 문이 있다');
  let flips = 0, flipOk = 0, wins = [];
  D.bars.forEach((name, b) => {
    const p = Lg.PATTERNS[name];
    if (!p || !p.gates) return;
    for (const [c, seq, shift = 0] of p.gates) {
      const n = c / 4, low = p.presses.includes(n - 0.5), others = p.presses.filter((t) => t !== n - 0.5);
      // 거꾸로 하면 죽는다: 땅의 문인데 안 뛰면, 공중의 문인데 뛰면. 그리고 멈춤으로는 어느 쪽도 못 지나간다
      const wrong = [low ? { presses: others, holds: [] } : { presses: [...others, n - 0.5].sort(), holds: [] }, { presses: others, holds: [[n - 0.5, n + 0.375]] }];
      for (const w of wrong) { flips++; if (diesIn(L, b, w)) flipOk++; }
      if (low) {                                        // 이단 점프의 여유: 일찍·늦게
        const pass = (d) => !runWith(L, b, { presses: [...others, n - 0.5 + d].sort(), holds: [] }).dead;
        let e = 0, z = 0; while (e < 0.4 && pass(-(e + 0.01))) e += 0.01; while (z < 0.4 && pass(z + 0.01)) z += 0.01;
        wins.push([e, z]);
      }
    }
  });
  ok(flipOk === flips, `문마다 반대로 하면(땅인데 안 뜀 / 공중인데 뜀 / 멈춤) 그 마디에서 죽는다 (${flipOk}/${flips})`);
  const ms = (v) => Math.round(v * 60000 / D.bpm), minE = Math.min(...wins.map((w) => w[0])), minZ = Math.min(...wins.map((w) => w[1]));
  ok(minE >= 0.15 && minZ >= 0.15, `땅의 문을 넘는 이단 점프의 여유: 일찍 ${ms(minE)}ms, 늦게 ${ms(minZ)}ms 이상 (타이밍은 어렵지 않다)`);
}
console.log('실패 ' + fails + '건');
process.exit(fails ? 1 : 0);

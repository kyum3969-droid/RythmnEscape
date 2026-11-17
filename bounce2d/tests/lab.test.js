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

console.log('== D 박자 악보 ==');
{
  const L = Lg.buildLevel(D), act = { o: 'none', T: 'jump', S: 'hold' };
  const doing = (kind, k) => kind === 'jump' ? { presses: [k - 0.5], holds: [] } : kind === 'hold' ? { presses: [], holds: [[k - 0.5, k + 0.375]] } : { presses: [], holds: [] };
  // 기호마다 맞는 손은 하나뿐: 같은 마디의 다른 박은 정답대로 두고, 그 박만 세 가지(그냥 / 이단 점프 / 멈춤)로 해 본다
  let right = 0, wrong = 0, total = 0;
  const wins = { T: [], S: [] };
  D.bars.forEach((name, b) => {
    const p = Lg.PATTERNS[name];
    if (!p || !p.notes) return;
    for (let k = 1; k < 4; k++) {
      const c = p.notes[k], prev = p.notes[k - 1], next = p.notes[k + 1];
      if ((prev === 'T' || prev === 'S')) continue;              // 동작 바로 뒤 박은 쉬는 자리(공이 아직 그 동작 중이다)
      const others = { presses: p.presses.filter((t) => Math.abs(t - (k - 0.5)) > 1e-9), holds: p.holds.filter((h) => Math.abs(h[0] - (k - 0.5)) > 1e-9) };
      for (const kind of ['none', 'jump', 'hold']) {
        const d = doing(kind, k), s = runWith(L, b, { presses: [...others.presses, ...d.presses], holds: [...others.holds, ...d.holds] });
        const died = s.dead && Math.floor(s.x / 16) === b;
        total++;
        if (kind === act[c] ? !s.dead || Math.floor(s.x / 16) > b : died) (kind === act[c] ? right++ : wrong++);
      }
      if (c === 'T' || c === 'S') {                               // 누르는 여유
        const pass = (dt) => { const d = doing(act[c], k); if (d.presses.length) d.presses[0] += dt; else d.holds[0] = [d.holds[0][0] + dt, d.holds[0][1]]; const s = runWith(L, b, { presses: [...others.presses, ...d.presses], holds: [...others.holds, ...d.holds] }); return !(s.dead && Math.floor(s.x / 16) === b); };
        let e = 0, z = 0; while (e < 0.4 && pass(-(e + 0.01))) e += 0.01; while (z < 0.4 && pass(z + 0.01)) z += 0.01;
        wins[c].push([e, z]);
      }
    }
  });
  ok(right + wrong === total, `박마다 맞는 손 하나로만 지나가고, 나머지 둘은 그 마디에서 죽는다 (${right + wrong}/${total})`);
  const ms = (v) => Math.round(v * 60000 / D.bpm);
  for (const c of ['T', 'S']) { const e = Math.min(...wins[c].map((w) => w[0])), z = Math.min(...wins[c].map((w) => w[1])); ok(e >= 0.15 && z >= 0.15, `${c === 'T' ? '기둥(이단 점프)' : '틈(멈춤 시작)'}의 여유: 일찍 ${ms(e)}ms, 늦게 ${ms(z)}ms 이상`); }
  // 버릇 함정: 같은 악보를 두 번 친 뒤의 마디를, 앞 마디대로 치면 죽는다
  for (const name of ['n_oToS', 'n_oSoo', 'n_ooSo']) {
    const b = D.bars.findIndex((n, i) => n === name && i > 8 && D.bars[i - 1] !== 'cp' && Lg.PATTERNS[D.bars[i - 1]].notes !== Lg.PATTERNS[n].notes);
    if (b < 0) continue;
    ok(diesIn(L, b, inputs(D.bars[b - 1])), `${name}(마디 ${b}): 앞 마디(${Lg.PATTERNS[D.bars[b - 1]].notes})대로 치면 죽는다`);
  }
  ok(D.bars.every((n) => !Lg.PATTERNS[n] || !Lg.PATTERNS[n].notes || Lg.PATTERNS[n].notes.split('').every((c, k) => Lg.NOTE_SHAPES[c].length > 0)), '모든 박에 기호가 하나씩 있다(빈 박이 없다)');
}
console.log('실패 ' + fails + '건');
process.exit(fails ? 1 : 0);

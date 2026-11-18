// 시안 · 박자 악보 검사. 실행: node bounce2d/tests/lab.test.js
// 공이 정박에 닿는 자리마다 기존 장치로 만든 기호가 하나씩 선다. 정답대로 가면 지나가고, 기호마다 다른 손을 쓰면 그 마디에서 죽는다.
const Lg = require('../logic.js');
let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ok  ' : '  FAIL ') + msg); if (!c) fails++; };
const SUB = Lg.SUB, BAR = 4 * SUB;
const C = Lg.LABS[0], L = Lg.buildLevel(C);
const ms = (beats) => Math.round(beats * 60000 / C.bpm);

// b번 마디의 입력만 acts(마디 안의 박)로 바꿔서 처음부터 달린다
function runWith(b, acts) {
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
const diesIn = (b, acts) => { const s = runWith(b, acts); return s.dead && s.step >= b * BAR && s.step < (b + 1) * BAR + SUB / 2; };
const P = (b) => Lg.PATTERNS[C.bars[b]];
const noteBars = C.bars.map((n, b) => b).filter((b) => P(b) && P(b).notes);

console.log('== 코스 ==');
{
  const { end } = Lg.traceRun(L, L.ref);
  ok(end.won && L.fixed.length === 0, `패턴대로 가면 완주한다 (${C.bars.length}마디, 악보 마디 ${noteBars.length}개, 걷어 낸 장애물 없음)`);
  const used = new Set(noteBars.flatMap((b) => P(b).notes.split('')));
  ok(['o', 'T', 'S', 'B', 'R'].every((c) => used.has(c)), `기호를 다 쓴다: ${[...used].join(' ')}`);
  ok(noteBars.every((b) => Lg.noteCheck(P(b).notes).ok), '모든 악보 마디가 따로 만들어 봐도 통과한다(정답만 살아남는다)');
}

console.log('== 박마다 맞는 손은 하나 ==');
{
  // 코스 안에서 다시 확인: 입력을 하나 빼거나, 이단 점프 ↔ 멈춤으로 손을 바꾸면 그 마디에서 죽는다
  let tries = 0, died = 0;
  for (const b of noteBars) {
    const p = P(b), ring = p.notes.includes('R');
    p.presses.forEach((t) => { tries++; if (diesIn(b, { presses: p.presses.filter((v) => v !== t), holds: p.holds })) died++; });
    p.holds.forEach((h) => { tries++; if (diesIn(b, { presses: p.presses, holds: p.holds.filter((v) => v !== h) })) died++; });
    // (고리에서 뛰는 누름은 멈춤으로 바꿔도 지나간다 — 일부러 허용한 것. logic.js의 R 설명 참고)
    p.presses.filter((t) => !(ring && p.presses.includes(t - 0.875))).forEach((t) => { tries++; if (diesIn(b, { presses: p.presses.filter((v) => v !== t), holds: [...p.holds, [t, t + 0.875]] })) died++; });
    p.holds.forEach((h) => { tries++; if (diesIn(b, { presses: [...p.presses, h[0]].sort((u, v) => u - v), holds: p.holds.filter((v) => v !== h) })) died++; });
  }
  ok(died === tries, `입력을 빼거나 손을 바꾸면 그 마디에서 죽는다 (${died}/${tries})`);
}

console.log('== 리듬이 섞인다 ==');
{
  const frac = new Map();
  for (const b of noteBars) { for (const t of P(b).presses) frac.set(t % 1, (frac.get(t % 1) || 0) + 1); for (const h of P(b).holds) frac.set(h[0] % 1, (frac.get(h[0] % 1) || 0) + 1); }
  const list = [...frac.entries()].sort((u, v) => u[0] - v[0]).map(([f, n]) => `${f}박 ${n}번`);
  ok(frac.size >= 2 && frac.has(0.5) && frac.has(0.375), `누르는 자리가 한 가지가 아니다: ${list.join(', ')} (0.5 = 보통 꼭대기, 0.375 = 파란 섬이 당긴 꼭대기·고리)`);
  const perBar = noteBars.map((b) => new Set(P(b).notes.replace('~', '').split('').filter((c) => c !== '.' && c !== 'o')).size);
  ok(perBar.filter((n) => n >= 2).length >= 10, `서로 다른 기호 둘 이상이 섞인 마디 ${perBar.filter((n) => n >= 2).length}개`);
}

console.log('== 버릇 함정 ==');
for (let b = 2; b < C.bars.length; b++) {
  if (!P(b) || !P(b).notes || !P(b - 1) || !P(b - 2) || !P(b - 1).notes || P(b - 1).notes !== P(b - 2).notes || P(b).notes === P(b - 1).notes) continue;
  ok(diesIn(b, { presses: P(b - 1).presses, holds: P(b - 1).holds }), `마디 ${b} ${P(b).notes}: 앞의 ${P(b - 1).notes}를 두 번 친 버릇대로 치면 죽는다`);
}

console.log('== 타이밍은 어렵지 않다 ==');
{
  let worst = { e: 9, z: 9, at: '' };
  for (const b of noteBars) {
    const p = P(b);
    const shift = (kind, i, d) => kind === 'p' ? { presses: p.presses.map((v, j) => (j === i ? v + d : v)), holds: p.holds } : { presses: p.presses, holds: p.holds.map((h, j) => (j === i ? [h[0] + d, h[1]] : h)) };
    const win = (kind, i) => { const pass = (d) => !runWith(b, shift(kind, i, d)).dead; let e = 0, z = 0; while (e < 0.4 && pass(-(e + 0.01))) e += 0.01; while (z < 0.4 && pass(z + 0.01)) z += 0.01; return { e, z }; };
    const take = (w, tag) => { if (Math.min(w.e, w.z) < Math.min(worst.e, worst.z)) worst = { ...w, at: tag }; };
    p.presses.forEach((t, i) => take(win('p', i), `${p.notes} ${t}박 누름`));
    p.holds.forEach((h, i) => take(win('h', i), `${p.notes} ${h[0]}박 멈춤`));
  }
  ok(ms(worst.e) >= 75 && ms(worst.z) >= 75, `가장 빡빡한 입력(${worst.at})도 일찍 ${ms(worst.e)}ms, 늦게 ${ms(worst.z)}ms 여유가 있다`);
}
console.log('== 5라운드 · 반 박 튀기(시범) ==');
{
  const H = Lg.LABS[1], LH = Lg.buildLevel(H), { end } = Lg.traceRun(LH, LH.ref), PH = (b) => Lg.PATTERNS[H.bars[b]];
  ok(H.sub === 2 && H.track.file.includes('concrete_pulse') && end.won && LH.fixed.length === 0, `5라운드 곡에 공이 반 박마다 튀는 코스를 짠다: 패턴대로 가면 완주 (${H.bars.length}마디 = 곡 ${H.bars.length / 2}마디)`);
  ok(H.bars.indexOf('goal') === 158, '결승선은 곡의 79번째 마디(원래 5라운드의 결승선)와 같은 자리다');
  ok(H.bars.every((n) => !Lg.PATTERNS[n] || !!Lg.PATTERNS[n].notes), '마디는 전부 박자 악보다(피버 없음)');
  const ref = Lg.planInput(LH.ref);
  const dies = (b, a) => { const lo = b * BAR, hi = lo + BAR, pr = new Set(a.presses.map((t) => lo + Math.round(t * SUB))), hl = a.holds.map(([x, z]) => [lo + Math.round(x * SUB), lo + Math.round(z * SUB)]), st = Lg.spawnState(LH, -1); while (!st.dead && !st.won) { const k = st.step + 1, i = k >= lo && k < hi; Lg.stepState(LH, st, i ? pr.has(k) : ref.press.has(k), null, i ? hl.some((h) => k >= h[0] && k < h[1]) : ref.hold.has(k)); } return st.dead && st.step >= lo && st.step < hi + SUB / 2; };
  let traps = 0, caught = 0;
  for (let b = 2; b < H.bars.length; b++) { if (!PH(b) || !PH(b - 1) || !PH(b - 2) || !PH(b).notes || !PH(b - 1).notes || PH(b - 1).notes !== PH(b - 2).notes || PH(b).notes === PH(b - 1).notes) continue; traps++; if (dies(b, { presses: PH(b - 1).presses, holds: PH(b - 1).holds })) caught++; }
  ok(traps >= 20 && caught === traps, `버릇 함정 ${traps}곳 모두, 앞 마디 버릇대로 치면 죽는다`);
}
console.log('== 시안 · 보이는 것 ≠ 정답 ==');
{
  const T = Lg.LABS[2], LT = Lg.buildLevel(T), { end } = Lg.traceRun(LT, LT.ref), ref = Lg.planInput(LT.ref);
  ok(end.won && LT.fixed.length === 0, `패턴대로 가면 완주한다 (${T.bars.length}마디, 장면 ${Lg.TRICKS.length}개, 걷어 낸 장애물 없음)`);
  const runT = (b, a) => { const lo = b * BAR, hi = lo + BAR, pr = new Set(a.presses.map((t) => lo + Math.round(t * SUB))), hl = a.holds.map(([x, z]) => [lo + Math.round(x * SUB), lo + Math.round(z * SUB)]), st = Lg.spawnState(LT, -1); while (!st.dead && !st.won) { const k = st.step + 1, i = k >= lo && k < hi; Lg.stepState(LT, st, i ? pr.has(k) : ref.press.has(k), null, i ? hl.some((h) => k >= h[0] && k < h[1]) : ref.hold.has(k)); } return st; };
  const diesT = (b, a) => { const st = runT(b, a); return st.dead && st.step >= b * BAR && st.step < (b + 1) * BAR + SUB / 2; };
  const inp = (n) => ({ presses: Lg.PATTERNS[n].presses, holds: Lg.PATTERNS[n].holds });
  for (const [scene, pair, what] of Lg.TRICKS) {
    const b = T.bars.indexOf(scene), pb = T.bars.indexOf(pair), a = inp(scene);
    const wob = [-0.15, 0.15].every((d) => !runT(b, { presses: a.presses.map((t) => t + d), holds: a.holds.map((h) => [h[0] + d, h[1]]) }).dead);
    ok(wob, `${scene}(${what}): 정답대로 ±0.15박 흔들어도 지나간다`);
    ok(diesT(b, inp(pair)), `  보이는 손(앞의 ${pair}대로)으로 하면 그 마디에서 죽는다`);
    ok(diesT(pb, a), `  짝 장면 ${pair}에서는 반대로 이 장면의 정답대로 하면 죽는다(버릇이 강요된다)`);
    ok(Lg.PATTERNS[scene].blind && LT.gems.every((g) => g.x < b * 16 || g.x >= b * 16 + 16), '  장면에는 길잡이가 없다');
  }
}
console.log('실패 ' + fails + '건');
process.exit(fails ? 1 : 0);

#!/usr/bin/env node
// 구간 모음 만들기: 길이와 단계가 다른 구간(마디 묶음)을 무작위로 여러 개 뽑고, 구간마다 난이도를 재서 sections.js와 SECTIONS.md에 적는다.
//  - 뽑는 방법은 tools_gen_course.js와 같다(키 패턴을 뽑아 실제로 달려 보고 통과한 것만 남긴다. 되풀이한 뒤에는 한 군데만 바꾼 함정).
//  - 구간은 어디에 놓아도 되게 만든다: 평지에서 박자에 맞춰 튀며 들어와서, 끝날 때도 땅에서 박자에 맞춰 튄다.
//  - 난이도는 "실수하는 사람"을 흉내 내서 잰다: 입력마다 타이밍을 무작위로 흔들어 여러 번 달려 보고, 절반이 통과하는 흔들림의 크기(ms)를 구한다. 작을수록 어렵다.
// 사용: node bounce2d/tools_gen_sections.js
const fs = require('fs'), path = require('path');
const Lg = require('./logic.js');
const { generate, G, mulberry } = require('./tools_gen_course.js');
const BPM = 152, SUB = Lg.SUB, BAR = 4 * SUB, MS = 60000 / BPM / SUB;      // 한 스텝 = 약 4.1ms

// ---- 뽑을 구간 50개: 바운스 38개(길이 2~8마디, 단계 0~4) + 피버 12개(좁은 통로만 / 넓은 통로를 끼운 것)
const B = (len, lv) => ({ kind: 'bounce', lv, slots: Array.from({ length: len }, () => G(lv)) });
const z = { z: 1 }, w = { w: 1 };
const F = (slots) => ({ kind: 'fever', lv: slots.some((s) => s.w) ? 3 : 2, slots });
const PLAN = [
  ...[1, 2, 3, 4, 2, 3].map((lv) => B(2, lv)),
  ...[0, 1, 2, 3, 4, 3].map((lv) => B(3, lv)),
  ...[0, 1, 1, 2, 2, 2, 3, 3, 4, 4].map((lv) => B(4, lv)),
  ...[1, 2, 3, 4].map((lv) => B(5, lv)),
  ...[1, 2, 2, 3, 3, 4].map((lv) => B(6, lv)),
  ...[1, 2, 2, 3, 3, 4].map((lv) => B(8, lv)),
  F([z, z]), F([z, z]), F([z, z, z]), F([z, z, z]), F([z, z, z, z]), F([z, z, z, z]),
  F(['wUp', w, 'wDn']), F(['wUp', w, w, 'wDn']), F(['wUp', w, w, 'wDn']), F(['wUp', w, w, w, 'wDn']), F(['wUp', w, w, w, 'wDn']), F([z, 'wUp', w, w, 'wDn', z]),
];

const levelOf = (bars) => Lg.buildLevel({ name: 't', bpm: BPM, bars: ['flat', 'flat', ...bars, 'flat', 'flat', 'goal'], sections: [{ bar: 0, id: 'a' }] });
function run(L, plan, until) {
  const press = new Set(plan.presses), holds = plan.holds, s = Lg.spawnState(L, -1), bounces = [];
  while (!s.dead && !s.won && s.step < until) { const st = s.step + 1, ev = []; Lg.stepState(L, s, press.has(st), ev, holds.some((h) => st >= h[0] && st < h[1])); if (ev.some((e) => e.type === 'bounce')) bounces.push(s.step); }
  return { s, bounces };
}

// ---- 구간 하나 뽑기: 통과할 때까지 씨앗을 바꾼다
function makeSection(spec, idx) {
  const id = (spec.kind === 'bounce' ? 'B' : 'F') + String(idx).padStart(2, '0'), prefix = 's' + id, len = spec.slots.length;
  for (let seed = 1000 + idx * 37; seed < 1000 + idx * 37 + 400; seed++) {
    for (const k of Object.keys(Lg.PATTERNS)) if (k.startsWith(prefix)) delete Lg.PATTERNS[k];
    let g;
    try { g = generate({ prefix, bpm: BPM, sections: [['', spec.slots]] }, seed); } catch (e) { continue; }
    if (g.bars.some((n) => n === 'box' || n === 'idle')) continue;          // 뽑지 못해 쉬는 마디가 들어간 것은 버린다
    let L; try { L = levelOf(g.bars); } catch (e) { continue; }
    if (L.fixed.length) continue;
    const end = (2 + len) * BAR, ref = run(L, L.ref, end + BAR);
    if (ref.s.dead || (spec.kind === 'bounce' && !ref.bounces.includes(2 * BAR)) || !ref.bounces.includes(end)) continue;      // 들어올 때와 나갈 때 땅에서 박자에 맞춰 튀는가(피버는 관문에서 바로 시작하므로 나갈 때만 본다)
    if (!Lg.solve(L, Lg.spawnState(L, -1), { grid: 12 }).plan) continue;
    const patterns = {};
    for (const [name, d] of Object.entries(g.made)) { const { __clean, ...rest } = d; patterns[name] = rest.mode === 'rush' ? { mode: 'rush', nodes: rest.nodes, ...(rest.wide ? { wide: true } : {}), ...(rest.gap ? { gap: rest.gap } : {}) } : rest; }
    const traps = Object.values(g.notes).filter((n) => /함정|뚝/.test(n)).length;
    return { id, kind: spec.kind, len, lv: spec.lv, seed, bars: g.bars, patterns, traps, L };
  }
  throw new Error('구간을 못 뽑았다: ' + id);
}

// ---- 난이도 재기
function measureSection(sec) {
  const L = sec.L, end = (2 + sec.len) * BAR + BAR, P = L.ref.presses, H = L.ref.holds;
  const alive = (plan) => !run(L, plan, end).s.dead;
  // ① 입력마다의 여유: 다른 입력은 그대로 두고 하나만 일찍·늦게 밀어서 죽지 않는 범위
  const wins = [];
  const slack = (make) => { let lo = 0, hi = 0; while (lo > -48 && alive(make(lo - 1))) lo--; while (hi < 48 && alive(make(hi + 1))) hi++; wins.push(Math.min(-lo, hi) * MS); };
  P.forEach((_, i) => slack((d) => ({ presses: P.map((v, j) => (j === i ? v + d : v)), holds: H })));
  H.forEach((_, i) => { slack((d) => ({ presses: P, holds: H.map((v, j) => (j === i ? [v[0] + d, v[1]] : v)) })); slack((d) => ({ presses: P, holds: H.map((v, j) => (j === i ? [v[0], Math.max(v[0] + 2, v[1] + d)] : v)) })); });
  // ② 실수하는 사람: 입력마다 타이밍을 정규분포(표준편차 σ ms)로 흔들어 여러 번 달린다
  const rnd = mulberry(7000 + sec.seed), gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const sigmas = [20, 30, 40, 50, 60, 75, 95, 120], N = 80, pass = [];
  for (const sg of sigmas) {
    let ok = 0;
    for (let n = 0; n < N; n++) {
      const j = () => Math.round(gauss() * sg / MS);
      if (alive({ presses: P.map((v) => v + j()), holds: H.map(([a, zz]) => { const a2 = a + j(); return [a2, Math.max(a2 + 2, zz + j())]; }) })) ok++;
    }
    pass.push(ok / N);
  }
  let s50 = 125;                                      // 절반이 통과하는 흔들림. 120ms에서도 절반 넘게 통과하면 125로 적는다
  for (let i = 0; i < sigmas.length; i++) if (pass[i] < 0.5) { s50 = i === 0 ? sigmas[0] : sigmas[i - 1] + (sigmas[i] - sigmas[i - 1]) * (pass[i - 1] - 0.5) / (pass[i - 1] - pass[i]); break; }
  // ③ 모양: 얼마나 촘촘하고, 누르는 자리가 얼마나 여러 가지이고, 손이 얼마나 자주 바뀌는가
  const ins = [...P.map((t) => ({ t, k: 'R' })), ...H.map(([a]) => ({ t: a, k: 'L' }))].sort((u, v) => u.t - v.t);
  const fever = sec.kind === 'fever';
  let sw = 0; for (let i = 1; i < ins.length; i++) if (ins[i].k !== ins[i - 1].k) sw++;
  const gaps = []; for (let i = 1; i < ins.length; i++) gaps.push((ins[i].t - ins[i - 1].t) / SUB);
  return {
    inputs: ins.length, perBar: +(ins.length / sec.len).toFixed(2), spots: new Set(ins.map((i) => i.t % SUB)).size,
    switches: fever || ins.length < 2 ? 0 : +(sw / (ins.length - 1)).toFixed(2), fast: gaps.filter((g) => g <= 0.75).length,
    minWin: Math.round(Math.min(...wins)), s50: Math.round(s50), pass40: pass[2],
  };
}
// 등급(1 쉬움 ~ 5 어려움): 절반이 통과하는 흔들림(ms)으로 나눈다. 사람이 박자에 맞춰 누를 때의 흔들림은 보통 20~50ms쯤이다
const gradeOf = (s50) => (s50 >= 78 ? 1 : s50 >= 65 ? 2 : s50 >= 55 ? 3 : s50 >= 47 ? 4 : 5);

const out = [];
PLAN.forEach((spec, i) => {
  const sec = makeSection(spec, i + 1), d = measureSection(sec);
  d.grade = gradeOf(d.s50);
  const { L, ...rest } = sec;
  out.push({ ...rest, diff: d });
  console.error(`${sec.id} ${sec.kind} ${sec.len}마디 단계 ${sec.lv} 씨앗 ${sec.seed} | 입력 ${d.inputs}(마디당 ${d.perBar}) 함정 ${sec.traps} | 가장 좁은 여유 ${d.minWin}ms, 절반 통과 흔들림 ${d.s50}ms → 등급 ${d.grade}`);
});

// ---- 적기
const fmt = (v) => JSON.stringify(v).replace(/"([a-zA-Z_][a-zA-Z0-9_]*)":/g, '$1: ').replace(/,/g, ', ');
const js = `// 구간 모음: 도구(tools_gen_sections.js)가 무작위로 뽑아, 실제로 달려 보고 통과한 구간 ${out.length}개. 손으로 고치지 말고 도구를 다시 돌린다.
// 구간은 어디에 놓아도 된다: 평지에서 박자에 맞춰 튀며 들어와서, 끝날 때도 땅에서 박자에 맞춰 튄다. 곡의 템포는 152 BPM 기준.
//   id      B = 바운스, F = 피버
//   len     마디 수
//   lv      뽑을 때 쓴 단계(0 아주 쉬움 ~ 4 어려움). 실제 난이도는 diff를 본다
//   bars    마디 이름들(패턴은 patterns에 있다. wUp·wDn 같은 것은 logic.js의 것)
//   traps   함정(되풀이한 뒤 한 군데만 바꾼 마디)의 수
//   diff    inputs 입력 수 / perBar 마디당 입력 / spots 누르는 자리의 가짓수 / switches 손이 바뀌는 비율 / fast 0.75박 안에 이어 누르는 횟수
//           minWin 가장 좁은 입력의 여유(ms, 한쪽) / s50 타이밍을 무작위로 흔들었을 때 절반이 통과하는 흔들림(ms. 작을수록 어렵다) / pass40 흔들림 40ms일 때 통과율
//           grade 등급 1(쉬움) ~ 5(어려움): s50이 78 이상 / 65 이상 / 55 이상 / 47 이상 / 그 아래
const SECTIONS = [
${out.map((s) => '  ' + fmt(s) + ',').join('\n')}
];
// 구간의 패턴들을 PATTERNS에 넣는다(코스에서 쓰려면 먼저 불러야 한다)
function registerSections(PATTERNS, list = SECTIONS) {
  for (const sec of list) for (const [name, d] of Object.entries(sec.patterns)) {
    const p = JSON.parse(JSON.stringify(d));
    if (p.mode === "rush") { p.holds = []; p.presses = []; for (let k = 1; k <= 8; k++) if (p.nodes[k - 1] === "F") p.presses.push(k * 0.5); }
    PATTERNS[name] = p;
  }
}
if (typeof module !== "undefined") module.exports = { SECTIONS, registerSections };
`;
fs.writeFileSync(path.join(__dirname, 'sections.js'), js);

const stars = (g) => '★'.repeat(g) + '☆'.repeat(5 - g);
const rows = out.slice().sort((a, b) => a.diff.grade - b.diff.grade || b.diff.s50 - a.diff.s50);
const md = `# 구간 모음 (${out.length}개)

\`tools_gen_sections.js\`가 뽑은 구간들이다. 데이터는 \`sections.js\`에 있다. 이 표는 도구가 다시 적으므로 손으로 고치지 않는다.

- **등급**은 "실수하는 사람"을 흉내 내서 정했다: 입력마다 타이밍을 무작위로 흔들어 80번씩 달려 보고, 절반이 통과하는 흔들림의 크기(ms)를 구한다. 그 값이 작을수록 어렵다(사람이 박자에 맞춰 누를 때의 흔들림은 보통 20~50ms쯤).
- 등급의 경계: 절반 통과 흔들림이 78ms 이상이면 ★, 65ms 이상 ★★, 55ms 이상 ★★★, 47ms 이상 ★★★★, 그 아래 ★★★★★.
- 구간이 길수록 끝까지 가기 어려우므로, 같은 패턴이라도 긴 구간의 등급이 더 높게 나온다.
- 피버 구간의 "넓은"은 넓은 통로(계단으로 올라갔다 내려온다)를 끼운 것.

| 등급 | 개수 | 구간 |
|---|---|---|
${[1, 2, 3, 4, 5].map((g) => `| ${stars(g)} | ${rows.filter((r) => r.diff.grade === g).length} | ${rows.filter((r) => r.diff.grade === g).map((r) => r.id).join(', ')} |`).join('\n')}

| 구간 | 종류 | 길이 | 등급 | 절반 통과 흔들림 | 40ms 흔들림 통과율 | 가장 좁은 여유 | 입력 | 마디당 | 함정 | 누르는 자리 | 손 바뀜 |
|---|---|---|---|---|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.id} | ${r.kind === 'bounce' ? '바운스' : r.bars.includes('wUp') ? '피버(넓은)' : '피버'} | ${r.len}마디 | ${stars(r.diff.grade)} | ${r.diff.s50 >= 125 ? '120ms+' : r.diff.s50 + 'ms'} | ${Math.round(r.diff.pass40 * 100)}% | ±${r.diff.minWin}ms | ${r.diff.inputs} | ${r.diff.perBar} | ${r.traps} | ${r.diff.spots}가지 | ${r.kind === 'bounce' ? Math.round(r.diff.switches * 100) + '%' : '-'} |`).join('\n')}
`;
fs.writeFileSync(path.join(__dirname, 'SECTIONS.md'), md);
console.error(`sections.js, SECTIONS.md에 적었다: ${out.length}개. 등급별 ${[1, 2, 3, 4, 5].map((g) => `${g}: ${out.filter((s) => s.diff.grade === g).length}`).join(', ')}`);

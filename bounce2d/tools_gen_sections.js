#!/usr/bin/env node
// 구간 모음 만들기: 함정을 중심으로 짠 구간(마디 묶음)을 여러 개 뽑고, 구간마다 함정으로 난이도를 매겨 sections.js와 SECTIONS.md에 적는다.
//  - 뼈대는 "같은 마디를 되풀이해서 버릇을 만든 다음, 한 군데만 다른 마디(함정)를 놓는다"이다.
//    되풀이할 마디의 키 패턴은 무작위로 뽑고(tools_gen_course.js와 같은 방법: 실제로 달려 보고 통과한 것만), 함정은 그 마디에서 만든다.
//  - 리듬 게임의 함정 설계를 조사한 결과(DESIGN.md)를 따른다:
//      · 예측되는 함정은 함정이 아니다 → 되풀이 횟수를 들쭉날쭉하게 하고, 함정 없이 지나가는 되풀이(헛다리)도 섞는다
//      · 먼저 가르치고 나서 비튼다 → 함정은 언제나 그 마디를 한 번 이상 한 뒤에 온다
//      · 종류를 여러 가지로 → 끊기·손 바꾸기·하나 더 말고도, 안내 지우기(기억으로 치기)와 리믹스(배운 마디를 번갈아)
//      · 죽은 까닭이 바로 보여야 한다 → 함정마다 "되풀이하던 그대로 누르면 그 마디에서 죽는다"를 확인한다
//  - 구간은 어디에 놓아도 되게 만든다: 평지에서 박자에 맞춰 튀며 들어와서, 끝날 때도 땅에서 박자에 맞춰 튄다.
//  - 난이도는 타이밍으로 재지 않는다. 누르는 여유는 모든 구간이 똑같이 넉넉하고(장애물을 만들 때 0.18박을 봐준다), 등급은 함정으로만 매긴다.
// 사용: node bounce2d/tools_gen_sections.js
const fs = require('fs'), path = require('path');
const Lg = require('./logic.js');
const { generate, mulberry } = require('./tools_gen_course.js');
const BPM = 152, SUB = Lg.SUB, BAR = 4 * SUB, MS = 60000 / BPM / SUB;

// ---- 짜임: m 새 마디 / r 한 번 더 / x 안내 없이 한 번 더 / t 함정
const m = (k, add) => ({ m: k, g: 2, add }), r = (k) => ({ r: k }), x = (k) => ({ r: k, blind: true }), t = (k, kind) => ({ t: k, kind });
const SL = 'stop-last', SF = 'stop-first', HL = 'hand-last', HF = 'hand-first', AD = 'add';
const ph = (k, reps, kind) => [m(k, kind === AD), ...Array.from({ length: reps - 1 }, () => r(k)), t(k, kind)];      // 되풀이 reps번 → 함정
const run_ = (k, reps) => [m(k), ...Array.from({ length: reps - 1 }, () => r(k))];                                   // 되풀이만(함정 없이 지나간다 = 헛다리)
const B = (...slots) => ({ kind: 'bounce', slots: slots.flat() });
const zm = (k) => ({ zm: k }), zr = (k) => ({ zr: k }), zt = (k) => ({ zt: k }), wm = (k) => ({ wm: k }), wr = (k) => ({ wr: k }), wt = (k) => ({ wt: k });
const F = (...slots) => ({ kind: 'fever', slots: slots.flat() });
const PLAN = [
  // 2~3마디: 함정 하나. 되풀이 횟수는 한 번 또는 두 번
  B(ph('A', 1, SL)), B(ph('A', 1, HL)),
  B(ph('A', 2, SL)), B(ph('A', 2, SF)), B(ph('A', 2, HL)), B(ph('A', 2, HF)), B(ph('A', 2, AD)),
  B(run_('A', 2), x('A')),                                                   // 안내 지우기: 두 번 하고, 세 번째는 안내 없이
  // 4마디
  B(ph('A', 3, SL)), B(ph('A', 3, HL)), B(ph('A', 3, AD)),                   // 버릇을 깊게 들인 뒤
  B(run_('A', 3), x('A')),
  B(ph('A', 2, SL), r('A')), B(ph('A', 2, HL), r('A')),                      // 함정 뒤에 원래 마디로 돌아온다
  B(ph('A', 2, SF), t('A', HL)), B(ph('A', 2, HF), t('A', SL)),              // 함정이 연달아 둘
  B(m('A'), m('B'), r('A'), r('B')),                                         // 리믹스: 배운 두 마디를 번갈아
  B(run_('A', 2), x('A'), t('A', SL)),                                       // 안내 없이 한 번 더, 그리고 함정
  // 5마디: 되풀이 횟수가 서로 다르다
  B(ph('A', 2, SL), r('A'), t('A', HL)), B(ph('A', 2, HL), r('A'), t('A', SF)),
  B(ph('A', 1, SL), ph('B', 2, HL)),
  B(ph('A', 2, HF), r('A'), x('A')),
  B(ph('A', 4, SL)), B(ph('A', 4, HL)),                                      // 네 번이나 되풀이한 뒤
  // 6마디
  B(ph('A', 2, SL), ph('B', 2, HL)),
  B(ph('A', 3, HL), ph('B', 1, SF)), B(ph('A', 1, SF), ph('B', 3, HF)),      // 3번 → 1번, 1번 → 3번
  B(run_('A', 3), ph('B', 2, SL)), B(run_('A', 2), ph('B', 3, HL)),          // 헛다리: 첫 마디는 함정 없이 지나가고 다음 마디에서 걸린다
  B(m('A'), m('B'), r('A'), r('B'), r('A'), t('B', SL)),                     // 리믹스 끝에 함정
  B(ph('A', 2, AD), ph('B', 2, SL)),
  B(ph('A', 2, HL), r('A'), x('A'), t('A', SF)),
  // 8마디
  B(ph('A', 3, SL), ph('B', 3, HL)),
  B(ph('A', 2, HL), ph('B', 4, SF)), B(ph('A', 4, HF), ph('B', 2, AD)),
  B(run_('A', 3), ph('B', 2, SL), r('B'), t('B', HL)),
  B(ph('A', 2, SL), r('A'), t('A', HL), ph('B', 2, SF)),
  B(run_('A', 2), run_('B', 2), r('A'), r('B'), t('A', HL), t('B', SL)),     // 둘을 가르치고, 번갈아 내고, 둘 다 함정
  // 피버: 좁은 통로
  F(zm('A'), zt('A')), F(zm('A'), zr('A'), zt('A')), F(zm('A'), zr('A'), zr('A'), zt('A')),
  F(zm('A'), zr('A'), zm('B'), zt('B')),                                     // 헛다리
  F(zm('A'), zr('A'), zt('A'), zm('B'), zt('B')), F(zm('A'), zt('A'), zm('B'), zr('B'), zt('B')),
  // 피버: 넓은 통로(계단으로 올라갔다 내려온다)
  F('wUp', wm('A'), wt('A'), 'wDn'), F('wUp', wm('A'), wr('A'), wt('A'), 'wDn'), F('wUp', wm('A'), wr('A'), wr('A'), wt('A'), 'wDn'),
  F('wUp', wm('A'), wr('A'), wm('B'), wt('B'), 'wDn'),
  F(zm('A'), zt('A'), 'wUp', wm('B'), wt('B'), 'wDn'),
  F(zm('A'), zr('A'), zt('A'), 'wUp', wm('B'), wr('B'), wt('B'), 'wDn'),
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
  for (let seed = 1000 + idx * 37; seed < 1000 + idx * 37 + 600; seed++) {
    for (const k of Object.keys(Lg.PATTERNS)) if (k.startsWith(prefix)) delete Lg.PATTERNS[k];
    let g;
    try { g = generate({ prefix, bpm: BPM, sections: [['', spec.slots]] }, seed); } catch (e) { continue; }
    let L; try { L = levelOf(g.bars); } catch (e) { continue; }
    if (L.fixed.length) continue;
    const end = (2 + len) * BAR, ref = run(L, L.ref, end + BAR);
    if (ref.s.dead || (spec.kind === 'bounce' && !ref.bounces.includes(2 * BAR)) || !ref.bounces.includes(end)) continue;      // 들어올 때와 나갈 때 땅에서 박자에 맞춰 튀는가(피버는 나갈 때만)
    if (!Lg.solve(L, Lg.spawnState(L, -1), { grid: 12 }).plan) continue;
    // 함정마다: 되풀이하던 그대로 누르면 그 마디에서 죽는가(코스 안에서 한 번 더 확인)
    let lethal = true;
    for (const tr of g.traps) {
      if (tr.kind === 'blind') continue;                 // 안내를 지운 마디는 입력이 같다(죽이는 함정이 아니다)
      const lo = (2 + tr.bar) * BAR, mine = (st) => st >= lo && st < lo + BAR;
      let habit;
      if (tr.kind === 'break') { const prevNodes = [...g.bars.slice(0, tr.bar)].reverse().map((n) => Lg.PATTERNS[n]).find((p) => p && p.mode === 'rush' && !p.free && p.presses.length); habit = { presses: prevNodes.presses, holds: [] }; }
      else habit = Lg.PATTERNS[g.bars[tr.bar]].traps[0].full;
      const plan = { presses: [...L.ref.presses.filter((v) => !mine(v)), ...habit.presses.map((v) => lo + Math.round(v * SUB))], holds: [...L.ref.holds.filter((v) => !mine(v[0])), ...habit.holds.map(([a, z]) => [lo + Math.round(a * SUB), lo + Math.round(z * SUB)])] };
      const res = run(L, plan, lo + BAR + SUB);
      if (!res.s.dead || res.s.x < (2 + tr.bar) * 16 || res.s.x >= (2 + tr.bar) * 16 + 16.5) lethal = false;
    }
    if (!lethal) continue;
    const patterns = {};
    for (const [name, d] of Object.entries(g.made)) { const { __clean, ...rest } = d; patterns[name] = rest.mode === 'rush' ? { mode: 'rush', nodes: rest.nodes, ...(rest.wide ? { wide: true } : {}), ...(rest.gap ? { gap: rest.gap } : {}) } : rest; }
    return { id, kind: spec.kind, len, seed, bars: g.bars, patterns, traps: g.traps, roles: g.roles, L };
  }
  throw new Error('구간을 못 뽑았다: ' + id);
}

// ---- 난이도: 함정으로만 매긴다
//   조사한 바로는 함정의 어려움 = 기대의 세기 × 차이를 알아보기 어려운 정도 × 대응할 시간의 짧음, 그리고 예측되는 함정은 쉽다.
//   함정 하나의 무게 = 종류 × 버릇의 깊이 × 연달아 오는가 × 함정 자리 앞에 똑같이 누르는 입력의 수 × 예측하기 쉬운가
//   종류: 끝에서 끊기 1.0 / 앞에서 끊기 1.2(대응할 시간이 짧다) / 끝에서 손 바꾸기 1.3 / 앞에서 손 바꾸기 1.5 / 하나 더 누르기 0.8 / 피버에서 끊기 1.0
//         안내 지우기 0.9(죽이는 함정은 아니지만 기억으로 쳐야 한다) / 리믹스 0.4(배운 마디가 바로 앞 마디와 다른 것으로 바뀔 때마다)
//   버릇의 깊이: 그 마디를 이 구간에서 몇 번 했는가, 바로 앞에 몇 번 이어서 했는가
//   예측: 바로 앞 함정과 되풀이 횟수가 같으면 0.9배(읽힌다), 앞에 헛다리(함정 없이 지나간 되풀이)가 있었으면 1.15배(언제 올지 모른다)
const KIND_W = { 'stop-last': 1.0, 'stop-first': 1.2, 'hand-last': 1.3, 'hand-first': 1.5, add: 0.8, break: 1.0, blind: 0.9, switch: 0.4 };
const KIND_KO = { 'stop-last': '끝에서 뚝', 'stop-first': '앞에서 뚝', 'hand-last': '끝에서 손 바꿈', 'hand-first': '앞에서 손 바꿈', add: '하나 더', break: '뚝', blind: '안내 없음' };
function measureSection(sec) {
  const L = sec.L, end = (2 + sec.len) * BAR + BAR, P = L.ref.presses, H = L.ref.holds;
  const alive = (plan) => !run(L, plan, end).s.dead;
  const wins = [];                                    // 누르는 여유(난이도에는 쓰지 않는다. 모든 구간이 넉넉한지 확인하는 용도)
  const slack = (make) => { let lo = 0, hi = 0; while (lo > -48 && alive(make(lo - 1))) lo--; while (hi < 48 && alive(make(hi + 1))) hi++; wins.push(Math.min(-lo, hi) * MS); };
  P.forEach((_, i) => slack((d) => ({ presses: P.map((v, j) => (j === i ? v + d : v)), holds: H })));
  H.forEach((_, i) => { slack((d) => ({ presses: P, holds: H.map((v, j) => (j === i ? [v[0] + d, v[1]] : v)) })); slack((d) => ({ presses: P, holds: H.map((v, j) => (j === i ? [v[0], Math.max(v[0] + 2, v[1] + d)] : v)) })); });
  const motifAt = (b) => (sec.roles[b] ? sec.roles[b].replace(/[!?]/, '') : null), plain = (b) => !!sec.roles[b] && !/[!?]/.test(sec.roles[b]);
  const isTrap = (b) => sec.traps.some((o) => o.bar === b && o.kind !== 'blind');
  // 헛다리: 같은 마디를 두 번 넘게 이어서 했는데 함정 없이 다른 마디로 넘어간 자리(그 뒤로는 언제 함정이 올지 읽기 어렵다)
  const bluffEnd = [];
  for (let b = 1; b < sec.len; b++) if (plain(b - 1) && motifAt(b) && motifAt(b) !== motifAt(b - 1) && b >= 2 && motifAt(b - 2) === motifAt(b - 1)) bluffEnd.push(b);
  let score = 0, lastReps = null;
  const list = [];
  for (let b = 0; b < sec.len; b++) {
    const tr = sec.traps.find((o) => o.bar === b);
    if (tr) {
      let seen = 0, streak = 0;
      for (let k = 0; k < b; k++) if (motifAt(k) === tr.of && !isTrap(k)) seen++;
      for (let k = b - 1; k >= 0 && motifAt(k) === tr.of && !isTrap(k); k--) streak++;
      const p = Lg.PATTERNS[sec.bars[b]];
      const shared = tr.kind === 'stop-last' || tr.kind === 'hand-last' || tr.kind === 'add' ? Math.max(0, (p.traps ? p.traps[0].full.presses.length + p.traps[0].full.holds.length : 1) - 1) : tr.kind === 'break' ? 2 : 0;
      const lethal = tr.kind !== 'blind';
      const predict = !lethal ? 1 : (lastReps !== null && lastReps === streak ? 0.9 : 1) * (bluffEnd.some((e) => e <= b) ? 1.15 : 1);
      const w = KIND_W[tr.kind] * (0.5 + 0.25 * seen + 0.25 * streak) * (isTrap(b - 1) ? 1.3 : 1) * (1 + 0.15 * shared) * predict;
      if (lethal) lastReps = streak;
      score += w; list.push({ bar: b, kind: tr.kind, of: tr.of, reps: streak, w: +w.toFixed(2) });
    } else if (plain(b) && b > 0 && motifAt(b - 1) && motifAt(b - 1) !== motifAt(b)) {
      let seen = 0; for (let k = 0; k < b; k++) if (motifAt(k) === motifAt(b)) seen++;
      if (seen >= 1) { score += KIND_W.switch; list.push({ bar: b, kind: 'switch', of: motifAt(b), reps: 0, w: KIND_W.switch }); }      // 리믹스: 이미 배운 마디로 바로 갈아탄다
    }
  }
  const inputs = P.length + H.length;
  return { traps: list, score: +score.toFixed(2), perBar: +(score / sec.len).toFixed(2), bluffs: bluffEnd.length, inputs, minWin: Math.round(Math.min(...wins)) };
}
// 등급(1 쉬움 ~ 5 어려움): 함정 점수(무게의 합)로 나눈다
const gradeOf = (score) => (score < 1.6 ? 1 : score < 2.3 ? 2 : score < 3.3 ? 3 : score < 4.2 ? 4 : 5);
// 짜임을 글자로: A A A! = A를 두 번 하고 A의 함정
const shapeOf = (sec) => sec.bars.map((n, b) => (sec.roles[b] ? sec.roles[b].replace(/[!?]/, '') + (/[!?]$/.test(sec.roles[b]) ? `(${KIND_KO[sec.traps.find((o) => o.bar === b).kind]})` : '') : n === 'wUp' ? '↗' : n === 'wDn' ? '↘' : n)).join(' ');

const out = [];
PLAN.forEach((spec, i) => {
  const sec = makeSection(spec, i + 1), d = measureSection(sec);
  d.grade = gradeOf(d.score);
  const shape = shapeOf(sec);
  const { L, roles, traps, ...rest } = sec;
  out.push({ ...rest, shape, diff: d });
  console.error(`${sec.id} ${sec.len}마디 | ${shape} | 함정 점수 ${d.score} → 등급 ${d.grade} | 입력 ${d.inputs}, 가장 좁은 여유 ±${d.minWin}ms`);
});

// ---- 적기
const fmt = (v) => JSON.stringify(v).replace(/"([a-zA-Z_][a-zA-Z0-9_]*)":/g, '$1: ').replace(/,/g, ', ');
const js = `// 구간 모음: 도구(tools_gen_sections.js)가 뽑은, 함정을 중심으로 짠 구간 ${out.length}개. 손으로 고치지 말고 도구를 다시 돌린다.
// 구간은 어디에 놓아도 된다: 평지에서 박자에 맞춰 튀며 들어와서, 끝날 때도 땅에서 박자에 맞춰 튄다. 곡의 템포는 152 BPM 기준.
//   id      B = 바운스, F = 피버
//   len     마디 수
//   bars    마디 이름들(패턴은 patterns에 있다. wUp·wDn은 logic.js의 것)
//   shape   짜임. 같은 글자 = 같은 마디를 되풀이, 괄호 = 그 마디의 함정(끝에서 뚝 / 앞에서 뚝 / 끝에서 손 바꿈 / 앞에서 손 바꿈 / 하나 더 / 뚝 / 안내 없음)
//   diff    traps 함정들(bar 몇 번째 마디, kind 종류, reps 바로 앞에 되풀이한 횟수, w 무게. kind가 blind면 안내 없이 한 번 더, switch면 배운 마디로 갈아타는 자리)
//           score 함정 점수(무게의 합) / perBar 마디당 점수 / bluffs 헛다리(함정 없이 지나간 되풀이)의 수
//           inputs 입력 수 / minWin 가장 좁은 입력의 여유(ms, 한쪽. 난이도에는 쓰지 않는다) / grade 등급 1(쉬움) ~ 5(어려움)
//   난이도는 타이밍으로 재지 않는다. 함정의 수·종류·버릇의 깊이·예측하기 쉬운 정도로만 매긴다.
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
const rows = out.slice().sort((a, b) => a.diff.grade - b.diff.grade || a.diff.score - b.diff.score);
const md = `# 구간 모음 (${out.length}개)

\`tools_gen_sections.js\`가 뽑은 구간들이다. 데이터는 \`sections.js\`에 있다. 이 표는 도구가 다시 적으므로 손으로 고치지 않는다.

- 구간은 **함정을 중심으로** 짰다: 같은 마디를 되풀이해서 버릇을 만든 다음, 한 군데만 다른 마디를 놓는다. 죽이는 함정마다 "되풀이하던 그대로 누르면 그 마디에서 죽는다"를 확인했다.
- 리듬 게임의 함정 설계를 조사한 결과(\`DESIGN.md\`)를 따랐다: 되풀이 횟수가 들쭉날쭉하고(1~4번), 함정 없이 지나가는 되풀이(헛다리)가 섞여 있고, 안내를 지운 마디와 배운 마디를 번갈아 내는 리믹스가 있다.
- **등급은 타이밍으로 매기지 않는다.** 누르는 여유는 모든 구간이 똑같이 넉넉하다(가장 좁은 것도 ±${Math.min(...out.map((s) => s.diff.minWin))}ms). 등급은 함정 점수로만 매긴다.
- **함정 점수** = 함정마다의 무게를 더한 것. 무게 = 종류 × 버릇의 깊이 × (함정이 연달아 오면 1.3배) × (함정 자리 앞에 똑같이 누르는 입력이 많을수록 더) × 예측.
  - 종류: 끝에서 뚝 1.0 / 앞에서 뚝 1.2 / 끝에서 손 바꿈 1.3 / 앞에서 손 바꿈 1.5 / 하나 더 누르기 0.8 / 피버에서 뚝 1.0 / 안내 없음 0.9 / 리믹스(갈아탈 때마다) 0.4
  - 버릇의 깊이: 그 마디를 이 구간에서 몇 번 했는지, 바로 앞에 몇 번 이어서 했는지
  - 예측: 바로 앞 함정과 되풀이 횟수가 같으면 0.9배, 앞에 헛다리가 있었으면 1.15배
  - 등급의 경계: 1.6 미만 ★, 2.3 미만 ★★, 3.3 미만 ★★★, 4.2 미만 ★★★★, 그 위 ★★★★★
- 짜임 읽는 법: 같은 글자는 같은 마디를 되풀이한 것, 괄호는 그 마디의 함정. "안내 없음"은 입력은 같지만 수정과 누르는 표시가 없는 마디. ↗ ↘ 는 넓은 통로로 올라가고 내려오는 계단 마디.

| 등급 | 개수 | 구간 |
|---|---|---|
${[1, 2, 3, 4, 5].map((g) => `| ${stars(g)} | ${rows.filter((x) => x.diff.grade === g).length} | ${rows.filter((x) => x.diff.grade === g).map((x) => x.id).join(', ')} |`).join('\n')}

| 구간 | 종류 | 길이 | 등급 | 함정 점수 | 함정 | 짜임 | 입력 |
|---|---|---|---|---|---|---|---|
${rows.map((x) => `| ${x.id} | ${x.kind === 'bounce' ? '바운스' : x.bars.includes('wUp') ? '피버(넓은)' : '피버'} | ${x.len}마디 | ${stars(x.diff.grade)} | ${x.diff.score} | ${x.diff.traps.filter((o) => o.kind !== 'switch').length} | ${x.shape} | ${x.diff.inputs} |`).join('\n')}
`;
fs.writeFileSync(path.join(__dirname, 'SECTIONS.md'), md);
console.error(`sections.js, SECTIONS.md에 적었다: ${out.length}개. 등급별 ${[1, 2, 3, 4, 5].map((g) => `${g}: ${out.filter((s) => s.diff.grade === g).length}`).join(', ')}`);

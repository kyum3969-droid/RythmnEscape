#!/usr/bin/env node
// 박자 악보로 코스 짜기(지금은 "5라운드 · 반 박 튀기" 하나).
//  1) 가능한 네 박 악보를 전부 만들어 보고(noteCheck) 통과한 것만 모은다: 정답대로 가면 지나가고, 기호마다 다른 손을 쓰면 죽고, 입력이 ±0.2박 어긋나도 지나간다.
//  2) 곡의 구간(조용함 / 셈)에 맞춰 여덟 마디씩(일곱 마디 + 체크포인트) 채운다.
//     조용한 구간: 동작 하나 이하의 악보. 센 구간: 동작 둘의 악보로 버릇 함정 둘(같은 악보 두 번 → 한 군데만 다르게) + 한 마디.
//  3) 코스 전체를 달려 보고(완주, 함정마다 "앞 마디 버릇대로 치면 죽는다") 통과한 씨앗을 logic.js의 <gen:notes:R5H> 사이에 적는다.
// 사용: node bounce2d/tools_gen_notes.js [씨앗]
const fs = require('fs'), path = require('path'), Module = require('module');
const FILE = path.join(__dirname, 'logic.js');
const SRC = fs.readFileSync(FILE, 'utf8');
// 코스 부분(R5H_NOTES 안)은 비운 채로 불러온다(다시 짤 것이므로)
const load = (src) => { const m = new Module(FILE); m.filename = FILE; m.paths = Module._nodeModulePaths(__dirname); m._compile(src, FILE); return m.exports; };
const blank = (src) => src.replace(/\/\/ <gen:notes:R5H>[\s\S]*?\/\/ <\/gen:notes:R5H>/, '// <gen:notes:R5H>\n  // </gen:notes:R5H>');
const Lg = load(blank(SRC));
const SUB = Lg.SUB, BAR = 4 * SUB;
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// 1) 통과하는 악보
const K = Lg.NOTE_KINDS.split(''), valid = [];
for (const a of ['.', 'o']) for (const b of K) for (const c of K) for (const d of K) {
  const n = (a + b + c + d).replace(/R./g, 'R~');
  if (n.length === 4 && !valid.includes(n) && Lg.noteCheck(n).ok) valid.push(n);
}
const acts = (n) => (n.match(/[TSR]/g) || []).length;
const calm = valid.filter((n) => acts(n) <= 1 && n.replace(/[.o]/g, '').length >= 1);
const hot = valid.filter((n) => acts(n) >= 2 || (acts(n) === 1 && n.includes('R')));
console.log(`통과한 악보 ${valid.length}개 (조용한 것 ${calm.length}, 센 것 ${hot.length})`);

// 한 군데만 다른 악보(함정): 바뀐 자리의 새 기호가 "버릇대로 쓴 손"을 막아야 한다
//   전에 이단 점프(T)하던 자리 → o·S·B(모두 이단 점프를 막는다) / 멈추던 자리(S) → o·T / 그냥 가던 자리(. o B) → T·S
const BLOCKS = { T: 'oSB', S: 'oT', '.': 'TS', o: 'TS', B: 'TS' };
const variants = (n) => valid.filter((v) => { const d = [...v].map((c, i) => i).filter((i) => v[i] !== n[i]); return d.length === 1 && n[d[0]] in BLOCKS && BLOCKS[n[d[0]]].includes(v[d[0]]); });

function compose(seed) {
  const rnd = mulberry(seed), pick = (a) => a[Math.floor(rnd() * a.length)], out = [];
  const SONG = Lg.LABS[1].sections;                 // 게임 마디 단위로 바꾼 곡의 구간
  const idAt = (bar) => { let id = SONG[0].id; for (const q of SONG) if (bar >= q.bar) id = q.id; return id; };
  const HOT = new Set(['rush', 'd']);
  let bar = 2;
  // 도입: 기호를 하나씩(처음 보는 것만 안내)
  out.push(['oToo', 0], ['oooo'], ['ooSo', 0], ['oooo'], ['o.B.', 0], ['.BoB'], ['oR~o', 0], 'cp');
  bar += 8;
  while (bar + 8 <= 154) {
    const hotHere = HOT.has(idAt(bar + 3));
    const g = [];
    if (hotHere) {
      for (let k = 0; k < 2; k++) {
        let a, v; for (let t = 0; t < 50 && !v; t++) { a = pick(hot); const vs = variants(a); if (vs.length) v = pick(vs); }
        g.push([a], [a], [v]);
      }
      g.push([pick(hot)]);
    } else {
      let a, v; for (let t = 0; t < 50 && !v; t++) { a = pick(calm); const vs = variants(a).filter((x) => acts(x) <= 1); if (vs.length) v = pick(vs); }
      g.push([pick(calm)], [pick(calm)], [a], [a], [v], [pick(calm)], [pick(hot)]);
    }
    out.push(...g, 'cp');
    bar += 8;
  }
  while (bar < 158) { out.push([pick(hot)]); bar++; }
  return out;
}

// 3) 확인
function check(notes) {
  const src = SRC.replace(/\/\/ <gen:notes:R5H>[\s\S]*?\/\/ <\/gen:notes:R5H>/, '// <gen:notes:R5H>\n' + body(notes) + '\n  // </gen:notes:R5H>');
  const M = load(src), C = M.LABS[1], L = M.buildLevel(C), { end } = M.traceRun(L, L.ref);
  if (!end.won || L.fixed.length) return { ok: false, why: '완주 못 함' };
  const P = (b) => M.PATTERNS[C.bars[b]], ref = M.planInput(L.ref);
  const run = (b, a) => {
    const lo = b * BAR, hi = lo + BAR, pr = new Set(a.presses.map((t) => lo + Math.round(t * SUB))), hl = a.holds.map(([x, z]) => [lo + Math.round(x * SUB), lo + Math.round(z * SUB)]), s = M.spawnState(L, -1);
    while (!s.dead && !s.won) { const st = s.step + 1, inB = st >= lo && st < hi; M.stepState(L, s, inB ? pr.has(st) : ref.press.has(st), null, inB ? hl.some((h) => st >= h[0] && st < h[1]) : ref.hold.has(st)); }
    return s.dead && s.step >= lo && s.step < hi + SUB / 2;
  };
  let traps = 0;
  for (let b = 2; b < C.bars.length; b++) {
    if (!P(b) || !P(b).notes || !P(b - 1) || !P(b - 2) || P(b - 1).notes !== P(b - 2).notes || P(b).notes === P(b - 1).notes) continue;
    if (!run(b, { presses: P(b - 1).presses, holds: P(b - 1).holds })) return { ok: false, why: `마디 ${b} 함정이 안 걸린다` };
    traps++;
  }
  return { ok: true, traps, bars: C.bars.length };
}
const body = (notes) => {
  const lines = [], row = [];
  for (const e of notes) { if (e === 'cp') { row.push('"cp"'); lines.push('  ' + row.join(', ') + ','); row.length = 0; } else row.push(e[1] === 0 ? `["${e[0]}", 0]` : `["${e[0]}"]`); }
  if (row.length) lines.push('  ' + row.join(', ') + ',');
  return '  // 도구(tools_gen_notes.js)가 뽑았다. 손으로 고치지 말고 도구를 다시 돌린다.\n' + lines.join('\n');
};
let seed = +(process.argv[2] || 1);
for (let tries = 0; tries < 40; tries++, seed++) {
  const notes = compose(seed), r = check(notes);
  console.log(`씨앗 ${seed}: ${r.ok ? `통과 (${r.bars}마디, 함정 ${r.traps})` : r.why}`);
  if (!r.ok) continue;
  fs.writeFileSync(FILE, SRC.replace(/\/\/ <gen:notes:R5H>[\s\S]*?\/\/ <\/gen:notes:R5H>/, '// <gen:notes:R5H>\n' + body(notes).replace('뽑았다.', `뽑았다(씨앗 ${seed}).`) + '\n  // </gen:notes:R5H>'));
  console.log('logic.js에 적었다');
  break;
}

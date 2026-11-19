// 데이터를 순수 JSON으로 내보내기(다른 엔진 — 예: Godot — 로 옮길 때 쓴다). 원본은 그대로 JS로 둔다:
//   패턴과 코스에는 "왜 이렇게 짰는가"를 적은 주석과, 움직이는 장애물을 만드는 도우미(BOMB(...), VINE(...) 등)가 있어서 JSON으로 바꾸면 그 기록이 사라진다.
//   대신 이 도구가 언제든 같은 데이터를 JSON으로 뽑는다. 도우미는 이미 풀린 값(일반 객체)으로 나온다.
// 사용: node tools_export_json.js 출력.json [--levels]
//   기본: 상수, 라운드별 코스(곡·템포·첫 박·색·마디 순서·구간 등), 코스에 쓰인 패턴, 구간 모음(sections.js)
//   --levels: 라운드마다 만들어진 레벨(buildLevel 결과: 칸 격자, 빨간 덩어리 높이, 움직이는 장애물, 길잡이 수정, 체크포인트, 패턴대로의 입력 등)도 넣는다
//             — 다른 엔진에서는 이것만 읽고 물리·그림만 옮기면 같은 코스가 된다
const fs = require('fs'), Lg = require('./logic.js');
const out = process.argv[2] || 'pulse_bounce_data.json', withLevels = process.argv.includes('--levels');
const plain = (k, v) => {      // Map·Set·타입 배열을 JSON으로
  if (v instanceof Map) return { $map: [...v.entries()] };
  if (v instanceof Set) return { $set: [...v] };
  if (ArrayBuffer.isView(v)) return Array.from(v);
  if (typeof v === 'function') return undefined;
  return v;
};
const used = new Set(['flat', 'goal']); Lg.COURSES.forEach((C) => C.bars.forEach((n) => used.add(n)));
let sections = []; try { sections = require('./sections.js').SECTIONS; } catch (e) { /* 없으면 빈 채로 */ }
const data = {
  format: 'pulse-bounce-data', version: 1,
  units: '거리 = 칸, 시간 = 박. 공은 한 박에 TPB칸 전진하고, 행(row) 0이 맨 위, ROWS-1이 바닥',
  constants: Object.fromEntries(['TPB', 'SUB', 'ROWS', 'SIZE', 'HALF', 'JUMP_H', 'FREEZE_STEPS', 'RUSH_STRETCH', 'ZIG_TOP', 'ZIG_STEP', 'ZIG_GAP', 'WIDE_TOP', 'TOOTH_W', 'TOOTH_H', 'KITE_W', 'TALL_H', 'TALL_W', 'PAD_TH', 'PAD_W', 'RED_SKY'].filter((k) => Lg[k] !== undefined).map((k) => [k, Lg[k]])),
  courses: Lg.COURSES,
  patterns: Object.fromEntries([...used].filter((n) => Lg.PATTERNS[n]).sort().map((n) => [n, Lg.PATTERNS[n]])),
  sections,
};
if (withLevels) data.levels = Lg.COURSES.map((C) => { const L = Lg.buildLevel(C); return { name: C.name, level: L, redOutlines: Lg.redOutlines(L) }; });
fs.writeFileSync(out, JSON.stringify(data, plain));
console.log(`${out}: 라운드 ${data.courses.length}개, 패턴 ${Object.keys(data.patterns).length}개, 구간 ${sections.length}개${withLevels ? ', 만든 레벨 포함' : ''} — ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);

#!/usr/bin/env node
// 코스의 키 패턴을 무작위로 뽑는 도구.
//   1) 마디마다 키 패턴(멈춤·점프의 시각)을 무작위로 뽑고
//   2) 실제로 달려 봐서(패턴 → 장애물 → 패턴대로 달리기, 입력 빼 보기, 일찍·늦게 눌러 보기) 통과한 것만 남기고
//   3) 같은 마디를 되풀이한 뒤 한 군데를 바꾼 "함정" 마디를 끼워 넣는다.
// 결과는 logic.js의 <gen:patterns:라운드>, <gen:bars:라운드> 표시 사이에 적힌다(코스는 고정된다. 게임을 켤 때마다 바뀌는 것이 아니다).
// 사용: node bounce2d/tools_gen_course.js R2 [첫 씨앗] [돌려 볼 씨앗 수]  → 통과한 것 가운데 점수가 가장 높은 코스를 적는다
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, 'logic.js');
const Lg = require('./logic.js');
const { measure } = require('./tests/windows.js');
const St = require('./tools_stairs.js');

const round = process.argv[2] || 'R2', seed0 = +(process.argv[3] || 1);
const SUB = Lg.SUB, BAR = 4 * SUB;
const q8 = (v) => Math.round(v * 8) / 8;

// ---- 라운드의 틀: 고정된 마디는 이름으로, 뽑을 마디는 { g: 단계 }(바운스) / { z: 1 }(좁은 피버) / { w: 1 }(넓은 피버)
const G = (g, sets) => ({ g, sets });
const TEMPLATES = {
  R2: {
    prefix: 'g2', bpm: 151.9867,
    rise: [{ at: 37, bars: 2, key: 'U', need: { kind: ['hlong', 'hshort'] } }, { at: 57, bars: 2, trap: 'U' }],      // 음이 올라가는 구간(곡에서 잰 자리: 마디 37~38, 57~58)
    sections: [
      ['도입: 앞에서 배운 동작을 섞어서. 끝에서 곡이 잠깐 빠지는 자리만 쉰다', ['flat', 'flat', G(1), G(1), G(1), G(1), 'box', 'cp']],
      ['첫 큰 구간(멈춤의 철학: 긴 멈춤과 가벼운 공중 사슬, 멈춤 길이의 함정이 처음 나온다)', [G('a2'), G('a2'), G('a2'), G('a2'), G('a2'), G('a2'), G('a2'), G('a2')]],
      ['', [G('a2'), G('a2'), G('a2'), G('a2'), G('a2'), G('a2'), G('a2'), 'cp']],
      ['밝고 가벼운 구간: 첫 피버. 파란 발판 → 좁은 통로 → 계단으로 올라가 넓은 통로 → 계단으로 내려와 다시 좁은 통로', ['zT', { z: 1 }, { z: 1 }, 'wUp', { w: 1 }, { w: 1 }, 'wDn', { z: 1 }]],
      ['새 장치(빨간 바닥과 파란 섬)를 하나씩 보여 주고, 사이는 뽑은 패턴으로 채운다', ['lavaHop', G(2), 'lavaLeap', G(2), 'lavaGlide', G(2), G(2), 'cp']],
      ['두 번째 큰 구간: 뽑은 패턴에 빨간 바닥 마디가 섞인다', [G('a2', 1), G('a2', 1), G('a2', 1), G('a2', 1), G('a2', 1), G('a2', 1), G('a2', 1), G('a2', 1)]],
      ['', [G(3, 1), G(3, 1), G(3, 1), G(3, 1), G(3, 1), G(3, 1), G(3, 1), 'cp']],
      ['절정', [G('a2', 1), G('a2', 1), G('a2', 1), G('a2', 1), G('a2', 1), G('a2', 1), G('a2', 1), 'cp']],
      ['가장 센 절정: 마지막 피버. 들어서자마자 계단으로 넓은 통로에 올라간다. 끝의 두 마디는 연출만 — 통로가 조여들며 타다다다닥, 끝맺는 한 방에 터져 나온다', ['wUp', { w: 1 }, { w: 1 }, { w: 1 }, 'wDn', { z: 1 }, 'zS1', 'zS2']],
      ['', ['goal', 'flat', 'flat']],
    ],
  },
};
const SETS = ['lavaHop', 'lavaLeap', 'lavaGlide'];

// ---- 조건으로 채우는 틀(함정 배분안을 따르는 라운드): 구간마다 마디 수만 정해 두고, 그 안은 조건(recipe)대로 "되풀이 → 함정" 짜임과 채움 마디로 메운다
//   kinds   이 라운드에 나오는 함정의 종류와 비중 / reps 함정 앞의 되풀이 횟수와 비중 / traps 함정의 수(바운스 구간 전체)
//   intro   새로 소개하는 함정: 몇 번째 구간의 맨 앞(체크포인트 바로 뒤)에, 두 번 되풀이한 다음에 놓는다(처음엔 읽기 쉽게)
//   fill    함정이 아닌 마디의 비중: one 새 마디 하나 / pair 같은 마디 두 번(함정 없이 지나간다) / set 빨간 바닥과 파란 섬 / rest 파란 박스(쉬는 마디)
function fillStretches(lens, R, seed) {
  const rng = mulberry(seed * 7919 + 13), pickW = (obj) => { let r = rng() * Object.values(obj).reduce((u, v) => u + v, 0); for (const [k, v] of Object.entries(obj)) { r -= v; if (r <= 0) return k; } return Object.keys(obj)[0]; };
  let key = 0;
  const K = () => 'M' + key++;
  // 손을 바꾸는 함정: 오른쪽 → 왼쪽이면 머리 위 덩어리에 걸리고, 왼쪽 → 오른쪽이면 그 자리에 높은 박스가 서서 멈춤으로는 못 넘는다
  // hard = 소개하는 함정: 반드시 그 종류로 만든다(못 만들면 이 씨앗은 버린다). 나머지는 안 되면 다른 종류, 그것도 안 되면 그냥 한 번 더
  const phrase = (reps, kind, hard) => { const k = K(), others = Object.keys(R.kinds).filter((x) => x !== kind && x !== 'add'); const hk = /^(long|short)-/.test(kind), alt = kind.startsWith('long') ? kind.replace('long', 'short') : kind.replace('short', 'long');      // 멈춤 길이 함정: 되풀이할 마디가 멈춤으로 끝나고(또는 시작하고) 그 함정이 성립하는 것만 뽑는다
    return [{ m: k, g: R.g, add: kind === 'add', ...(hk ? { need: [kind, alt], [kind.endsWith('last') ? 'last' : 'first']: 'L' } : {}) }, ...Array.from({ length: reps - 1 }, () => ({ r: k })), { t: k, kind: kind === 'add' || hard ? [kind] : hk ? [kind, alt, ...others] : [kind, ...others], soft: !hard }]; };
  const GF = R.gf || R.g; const filler = (room) => { const kind = pickW(R.fill); if (kind === 'pair' && room >= 2) { const k = K(); return [{ m: k, g: GF }, { r: k }]; } if (kind === 'set') return [SETS[Math.floor(rng() * SETS.length)]]; if (kind === 'rest') return [['box', 'twin', 'stairs'][Math.floor(rng() * 3)]]; return [{ m: K(), g: GF }]; };
  // 함정을 구간들에 나눈다: 소개하는 것부터 놓고, 나머지는 긴 구간부터 하나씩
  const plan = lens.map(() => []);
  for (const it of R.intro) plan[it.stretch].push(phrase(2, it.kind, true));
  let left = R.traps - R.intro.length;
  for (let guard = 0; left > 0 && guard < 200; guard++) {
    const i = R.from + Math.floor(rng() * (lens.length - R.from)), used = plan[i].reduce((u, p) => u + p.length, 0), reps = +pickW(R.reps);
    if (used + reps + 1 + plan[i].length > lens[i]) continue;                       // 함정 짜임 사이에 채움 마디가 하나씩은 들어가게
    plan[i].push(phrase(reps, pickW(R.kinds))); left--;
  }
  return lens.map((n, i) => {
    const out = [], phrases = plan[i];
    let room = n - phrases.reduce((u, p) => u + p.length, 0);
    phrases.forEach((p, k) => {
      if (k > 0 || !R.intro.some((it) => it.stretch === i)) { const gap = Math.min(room, k === 0 ? Math.floor(rng() * 2) : 1); for (let q = 0; q < gap;) { const f = filler(gap - q); out.push(...f); q += f.length; room -= f.length; } }
      out.push(...p);
    });
    while (room > 0) { const f = filler(room); out.push(...f); room -= f.length; }
    return out;
  });
}
// 3라운드: 버릇 묶음(2~6라운드)의 둘째. 앞 라운드의 "끝에서 뚝"에 더해 "끝에서 손 바꿈"과 "하나 더"를 소개한다
TEMPLATES.R3 = {
  prefix: 'g3', bpm: 152.0183, cpFill: true, cpLevel: 'a3',      // cpFill = 체크포인트 마디에도 패턴(개발하는 동안)
  rise: [{ at: 4, bars: 2, key: 'U', need: { kind: ['hlong', 'hshort'] } }, { at: 55, bars: 2, trap: 'U' }],      // 음이 올라가는 구간(곡에서 잰 자리: 마디 4~5, 55~56)
  recipe: { g: 'a3', traps: 8, from: 1, kinds: { 'stop-last': 1, 'hand-last': 2, add: 2, 'short-last': 4, 'long-last': 3 }, reps: { 2: 7, 3: 3 }, intro: [{ stretch: 1, kind: 'hand-last' }, { stretch: 2, kind: 'add' }, { stretch: 3, kind: 'short-last' }], fill: { one: 6, pair: 2, set: 1.2, rest: 0.6 } },
  sections(seed) {
    const [s0, s1, s2, s3, s4, s5, s6, s7] = fillStretches([4, 7, 7, 7, 6, 7, 7, 7], this.recipe, seed);
    s0.splice(0, s0.length, ...[1, 1, '1t', '1t'].map((g) => ({ g, plain: true })));     // 도입은 함정도 되풀이도 없이 쉬운 것만. 뒤의 두 마디에서 높은 박스를 먼저 보여 준다
    return [
      ['도입(조용함): 쉬운 패턴만. 뒤의 두 마디에서 높은 박스(이단 점프로만 넘는다)를 처음 보여 준다. 구간의 마지막 마디마다 체크포인트', ['flat', 'flat', ...s0, 'cp']],
      ['본 리듬: 새 함정 "끝에서 손 바꿈"을 체크포인트 바로 뒤에서 소개한다(두 번 되풀이 → 마지막 입력의 손이 반대)', [...s1, 'cp']],
      ['더 밝게: 새 함정 "하나 더"를 소개한다(두 번 되풀이 → 이번엔 하나 더 눌러야 한다)', [...s2, 'cp']],
      ['낮게 깔림: 새 함정 "멈춤이 짧다"를 소개한다(두 번 되풀이 → 마지막 멈춤을 일찍 놓아야 한다). 배운 함정들을 섞는다', [...s3, 'cp']],
      ['첫 절정: 피버. 좁은 통로 → 계단으로 올라가 넓은 통로 → 계단으로 내려와 다시 좁은 통로', [{ z: 1 }, { z: 1 }, 'wUp', { w: 1 }, { w: 1 }, 'wDn', { z: 1 }, { z: 1 }]],
      ['가라앉는 구간', ['cp', ...s4, 'cp']],
      ['본 리듬 다시', [...s5, 'cp']],
      ['더 밝게', [...s6, 'cp']],
      ['낮게 깔렸다가 쌓아 올림', [...s7, 'cp']],
      ['마지막 절정: 피버. 들어서자마자 넓은 통로 → 계단으로 내려와 좁은 통로. 곡이 후렴 그대로 끝까지 가므로 조여드는 연출 없이 끝까지 친다. 곡이 끊기는 순간에 결승선을 지난다', ['wUp', { w: 1 }, { w: 1 }, { w: 1 }, 'wDn', { z: 1 }, { z: 1 }]],
      ['', ['goal', 'flat', 'flat']],
    ];
  },
};

// 4라운드: 높이로 속이는 함정을 소개한다(떠 있는 파란 박스, 파란 천장, 떠 있는 빨간 박스). 이 마디들은 손으로 만든 것이라 자리를 정해 두고,
// 그 사이를 조건대로 뽑은 마디가 채운다(손 함정은 앞 라운드의 것을 복습: 끝에서 뚝, 끝에서 손 바꿈, 하나 더).
TEMPLATES.R4 = {
  prefix: 'g4', bpm: 152.005, floatReds: true, vary: true, density: 0.95, cpFill: true, cpLevel: 'a4',
  rise: [{ at: 12, bars: 2, key: 'U', need: { kind: ['hlong', 'hshort'] } }, { at: 67, bars: 2, trap: 'U' }],      // 음이 올라가는 구간(곡에서 잰 자리: 마디 12~13, 67~68)
  // g = 되풀이 → 함정 짜임에 쓰는 단계(높이 장치 없음), gf = 그 사이를 채우는 마디의 단계(높이 장치를 섞는다)
  recipe: { g: 'a4', gf: 'a4', traps: 7, from: 0, kinds: { 'stop-last': 1, 'hand-last': 1, 'short-last': 5, 'long-last': 4 },      // ("하나 더"는 되풀이하는 마디의 절반이 비게 돼서 뺐다)
    reps: { 2: 7, 3: 3 }, intro: [], fill: { one: 6, pair: 2, set: 0, rest: 0 } },
  sections(seed) {
    const [s1, s2, s3, s4, s5, s6, s7] = fillStretches([4, 2, 2, 3, 7, 4, 4], this.recipe, seed);
    return [
      ['도입(조용함): 떠 있는 파란 박스를 함정 없이 보여 준다. 올라타서 그냥 떨어지기 두 번 → 올라타서 다시 뛰기 두 번', ['flat', 'flat', 'fDropH', 'fDropH', { g: '4d', plain: true }, 'fJump', 'fJump', 'cp']],
      ['잔잔한 리듬: 높이 함정 하나. 다시 뛰기를 두 번 한 뒤 같은 박스에서 그냥 떨어져야 한다(위에 빨간 박스가 떠 있다)', ['fJump', 'fJump', 'fDropH', ...s1, 'cp']],
      ['첫 후렴: 파란 천장을 소개한다. 이단 점프로 기둥을 두 번 넘은 뒤, 같은 기둥 위에 천장이 생긴다(멈춤으로 건넌다). 이어서 낮은 천장', ['djT', 'djT', 'cHoldT', 'cLowD', 'cLowD', ...s2, 'cp']],
      ['거의 무음 → 조용히 쌓아 올림: 떨어지며 멈추기를 함정 없이 보여 준다', ['fGlide', 'fGlide', 'fLateH', 'fTwice', 'cLowH', ...s3, 'cp']],
      ['둘째 후렴: 첫 피버. 좁은 통로 → 계단으로 올라가 넓은 통로 → 계단으로 내려와 다시 좁은 통로', [{ z: 1 }, { z: 1 }, 'wUp', { w: 1 }, { w: 1 }, 'wDn', { z: 1 }, { z: 1 }]],
      ['낮게 깔린 베이스: 올라타기를 두 번 한 뒤, 올라가면 안 되는 박스(앞을 빨간 박스가 막고 있다)', ['cp', 'fDropH', 'fDropH', 'fLow3', ...s4, 'cp']],
      ['쌓아 올림: 손 함정을 촘촘하게', [...s5, 'cp']],
      ['절정: 둘째 피버. 들어서자마자 넓은 통로 → 계단으로 내려와 좁은 통로', ['wUp', { w: 1 }, { w: 1 }, { w: 1 }, 'wDn', { z: 1 }, { z: 1 }, { z: 1 }]],
      ['여운과 무음 → 조용히 쌓아 올림: 박스 셋을 건너뛰기, 높이 장치와 손 함정을 섞는다', ['cp', 'fJump3', 'cHoldLD', ...s6, 'cp']],
      ['마지막 후렴: 배운 것을 다 섞는다. 곡이 끝맺는 박에 결승선', ['fJump3', 'fDropH', ...s7, 'cHoldT', 'cLowD']],
      ['', ['goal', 'flat', 'flat']],
    ];
  },
};

// 5라운드: 피버 위주. 피버의 짜임은 "새 마디 → 한 번 더 → 함정"이고, 함정은 뚝(누르던 자리에서 끊김)과 하나 더(안 누르던 자리에서 한 번 더) 두 가지다.
// 통로의 굽이는 코스의 cam 표에 있다(logic.js의 ROUND5). 굽이가 걸리는 넓은 통로의 짜임(H와 그 뒤 마디)은 성기게 뽑는다(calm: 마디의 첫 박은 누르지 않는다, run: 반 박 간격으로 이어 누르기는 두 번까지) — 굽이를 볼 틈이 있어야 한다. 좁은 통로는 원래 한 박에 한 번까지라 그대로 둔다. 바운스 구간은 4라운드와 같은 조건(밀도 95%, 변주)에 새 함정 fJ3G를 넣는다.
TEMPLATES.R5 = {
  prefix: 'g5', bpm: 152.0, floatReds: true, vary: true, density: 0.95, cpFill: true, cpLevel: 'a5',
  rise: [{ at: 29, bars: 2, key: 'U', need: { kind: ['hlong', 'hshort'] } }, { at: 61, bars: 2, trap: 'U' }],      // 음이 올라가는 구간(곡에서 잰 자리: 마디 29~30, 61~62)      // cpFill = 체크포인트 마디에도 패턴(개발하는 동안)
  recipe: { g: 'a5', gf: 'a5', traps: 4, from: 0, kinds: { 'stop-last': 2, 'hand-last': 2, 'short-last': 3, 'long-last': 3, 'short-first': 2 }, reps: { 2: 7, 3: 3 }, intro: [], fill: { one: 6, pair: 2, set: 0, rest: 0 } },
  sections(seed) {
    const [s1, s3, s4] = fillStretches([3, 5, 2], this.recipe, seed);
    return [
      ['도입(조용함): 그려 준 공중 사슬을 소개한다 — 높이 떠서 멈추고, 파란 단에 내려 튀어 또 멈추고, 충전 고리로 다시 올라 멈추고, 고리로 크게 뛰어 땅으로(두 마디 동안 거의 땅을 밟지 않는다)', ['flat', 'flat', 'airStep', 'airRing', ...s1, 'cp']],
      ['첫 피버(곧은 통로): 피버의 함정 두 가지를 차례로. 되풀이 → 뚝, 되풀이 → 하나 더', [{ zm: 'A' }, { zr: 'A' }, { zt: 'A', kind: 'break' }, { zm: 'B' }, { zr: 'B' }, { zt: 'B', kind: 'add' }, { z: 1 }, { z: 1 }]],
      ['', ['cp']],
      ['둘째 피버(굽은 통로): 장애물 없는 마디에서 통로가 비스듬히 위로 굽는다. 중간에 아래로 굽고, 마지막 함정 마디에서 다시 곧게 펴진다', ['zF', { zm: 'C' }, { zr: 'C' }, { zt: 'C', kind: 'add' }, { zm: 'D' }, { zr: 'D' }, { zt: 'D', kind: 'break' }]],
      ['가라앉음: 징검다리. 이단 점프로 첫 돌에 올라타면 돌에서 돌로 저절로 튄다(두 마디). 그다음에는 빨간 돌이 섞인다 — 그 앞에서 멈추면 한 박 떠서 그다음 돌에 내린다', ['cp', 'stIn', 'stOut', 'stIn', 'stOutR', 'stInR', 'stOut', 'cp']],
      ['셋째 피버(솟는 통로): 계단을 오르며 통로가 곧장 위로 굽는다. 넓은 통로를 위로 달리고, 계단을 내려오며 다시 가로로. 끝의 두 마디는 조여드는 통로(곡이 점점 세지는 자리. 가늘어질수록 화면이 다가간다)', ['wUp', { wm: 'E' }, { wr: 'E' }, { wt: 'E', kind: 'break' }, 'wDn', 'zS1', 'zS2']],
      ['', ['cp']],
      ['넷째 피버: 아래로 굽었다가, 한가운데의 얇은 굴(통로가 가늘어져 화면이 다가간다)을 지나, 위로 굽는다', [{ zm: 'F' }, { zr: 'F' }, { zt: 'F', kind: 'add' }, 'zThin', { zm: 'G' }, { zr: 'G' }, { zt: 'G', kind: 'break' }]],
      ['', ['cp']],
      ['다섯째 피버(솟는 넓은 통로): 위로 굽고, 왼쪽 위로 넘어갔다가, 다시 가로로', ['wUp', { wm: 'H', calm: 2, run: 2 }, { wr: 'H' }, { wt: 'H', kind: 'add' }, { w: 1, calm: 2, run: 2 }, 'wDn', { z: 1 }, { z: 1 }]],
      ['더 꽉 찬 리듬: 바운스. 공중 사슬을 한 번 더, 이어서 멈춤 길이의 함정과 손 함정', ['cp', 'airStep', 'airRing', ...s3, 'cp']],
      ['가라앉음: 징검다리 세 마디. 가운데에 빨간 돌, 마지막 돌에서 내려올 땅이 빨간 박스(마지막으로 튄 뒤 멈춰서 건넌다)', ['stIn', 'stMidR', 'stOutG', 'gAfter', ...s4, 'cp']],
      ['마지막 피버: 위로, 아래로 굽이친다. 끝의 두 마디는 조여드는 통로, 곡의 끝맺는 한 방에 터져 나온다', [{ zm: 'I' }, { zr: 'I' }, { zt: 'I', kind: 'break' }, { zm: 'J' }, { zt: 'J', kind: 'add' }, 'zS1', 'zS2']],
      ['', ['goal', 'flat', 'flat']],
    ];
  },
};

// 6라운드: 버릇 묶음(2~6)의 마지막, 리믹스. 새것 없이 2~5라운드의 것을 구간마다 다르게 섞고, 앞에서 든 버릇을 다른 장치로 뒤집는다(logic.js의 "6라운드의 꼬아 놓은 마디들").
// 피버는 곡의 절정 두 곳에만 둔다(남발하지 않는다): 얇은 굴이 있는 굽은 통로 / 왼쪽 위로 넘어가는 넓은 통로. 굽이는 코스의 cam 표에 있다(logic.js의 ROUND6).
// 조여드는 통로는 없다(곡에 점점 세지는 자리가 없다). 징검다리는 구간의 끝(체크포인트 앞)이나 gAfter 앞에 둔다.
TEMPLATES.R6 = {
  prefix: 'g6', bpm: 152.0, floatReds: true, vary: true, density: 0.95, fresh: true, cpFill: true, cpLevel: 'a6',
  rise: [{ at: 8, bars: 2, key: 'U', need: { kind: ['hlong', 'hshort'] } }, { at: 56, bars: 2, trap: 'U' }],      // 음이 올라가는 구간(곡에서 잰 자리: 마디 8~9, 56~57)      // fresh = 앞 라운드에 나온 피버 문제를 다시 내지 않는다
  recipe: { g: 'a6', gf: 'a6', traps: 9, from: 0, kinds: { 'stop-last': 2, 'hand-last': 3, 'short-last': 3, 'long-last': 3 }, reps: { 2: 7, 3: 3 }, intro: [], fill: { one: 6, pair: 2, set: 0, rest: 0 } },      // (점수 계산용. 뽑을 마디의 자리는 아래에 손으로 정했다)
  sections() {
    // 뽑을 마디의 자리를 손으로 정한다(무작위로 나누면 같은 함정이 연달아 나오거나, 한 마디만 세 번 되풀이하고 끝나는 구간이 생긴다).
    //   one() 높이 장치를 섞은 새 마디 하나 / phrase(함정) 새 마디 → 한 번 더 → 함정(안 되면 다른 종류) / quick(함정) 새 마디 → 곧바로 함정(한 번만 보여 준다)
    //   twice() 새 마디 → 한 번 더 → 끝에서 뚝 → 다시 원래대로 → 끝에서 손 바꿈 (한 마디로 함정 둘. 처음부터 뒤쪽 구간만큼 어렵게 하려고 도입에 쓴다)
    let key = 0;
    const one = () => ({ m: 'f' + key++, g: 'a6' });
    const kindsOf = (kind) => ({ 'stop-last': ['stop-last', 'hand-last'], 'hand-last': ['hand-last', 'stop-last'], 'short-last': ['short-last', 'long-last', 'stop-last'], 'long-last': ['long-last', 'short-last', 'hand-last'] })[kind];      // (멈춤 길이 함정이 안 되면 다른 길이, 그다음 손 함정)
    const phrase = (kind) => { const k = 'p' + key++; return [{ m: k, g: 'a6', need: kindsOf(kind) }, { r: k }, { t: k, kind: kindsOf(kind) }]; };
    const quick = (kind) => { const k = 'p' + key++; return [{ m: k, g: 'a6', need: kindsOf(kind) }, { t: k, kind: kindsOf(kind) }]; };
    const twice = () => { const k = 'p' + key++; return [{ m: k, g: 'a6', need: [['short-last', 'long-last'], ['hand-last', 'stop-last']] }, { r: k }, { t: k, kind: ['short-last', 'long-last'] }, { r: k }, { t: k, kind: ['hand-last', 'stop-last'] }]; };
    return [
      ['도입(조용함)이지만 쉬어 가지 않는다: 한 마디로 함정 둘. 두 번 되풀이 → 끝의 멈춤 길이가 다르다 → 다시 원래대로 → 끝에서 손 바꿈', ['flat', 'flat', ...twice(), 'cp']],
      ['리듬: 마디마다 다르다. 떠 있는 박스에서 다시 뛰기 두 번 → 같은 박스에서 그냥 떨어지기 → 이단 점프로 기둥 → 앞에 파란 천장(멈춤으로) → 천장이 뒤에(앞뒤 뒤집기) → 천장 없이 원래대로', ['fJump', 'fJump', 'fDropH', 'djT', 'cHoldT', 'cHoldLDx', 'djT', 'cp']],
      ['더 꽉 찬 리듬: 빨간 바닥과 파란 섬. 섬에서 한 번 더 뛰어 둘째 빨간 바닥을 넘기 두 번 → 그 위에 파란 천장(멈춤으로). 뒤는 높이 장치 마디와 손 함정', ['lavaLeap2', 'lavaLeap2', 'lavaCap', one(), ...phrase('short-last'), 'cp']],      // (천장 뒤에 섬 마디를 한 번 더 놓는 것은 뺐다: 거기서는 멈춤으로도 건너져서 함정이 되지 않고, 못 건너게 막으면 누르는 여유가 40ms로 줄어든다)
      ['낮게 깔린 베이스: 한 번만 보여 주고 함정, 이어서 징검다리. 빨간 돌을 멈춰서 넘고 → 같은 자리가 파란 돌인데 위에 빨간 뚜껑(멈추면 걸린다) → 내려올 땅이 빨간 박스(멈춰서 건넌다)', [...quick('short-last'), 'stIn', 'stMidR', 'stMidL', 'stOutG', 'gAfter', 'cp']],
      ['첫 절정 — 피버 하나(얇은 굴): 위로 굽었다가, 한가운데의 얇은 굴을 지나, 아래로 굽는다. 되풀이 → 뚝, 되풀이 → 하나 더. 곡이 뚝 끊기는 마디가 체크포인트', [{ zm: 'F' }, { zr: 'F' }, { zt: 'F', kind: 'break' }, 'zThin', { zm: 'G', kind: 'add' }, { zr: 'G' }, { zt: 'G', kind: 'add' }, 'cp']],
      ['조용함: 떠 있는 박스에 올라타 떨어지며 멈추기 두 번 → 올라가면 안 되는 박스 → 다시 원래대로(함정 뒤에 또 함정일 줄 알았다면 걸린다). 뒤는 손 함정', ['fGlide', 'fGlide', 'fLow3', 'fGlide', ...phrase('long-last'), 'cp']],
      ['꽉 찬 리듬: 그림의 공중 사슬 → 한 번 보여 주고 멈춤이 길다, 이어서 앞에서 박스·뒤에서 멈춤을 두 번 → 앞뒤 뒤집기(앞에서 멈춤·뒤에서 박스)', ['airStep', 'airRing', ...quick('long-last'), 'fDropH', 'fDropH', 'fLateHx', 'cp']],      // (뒤집기 마디는 구간의 끝에: 박스에서 떨어진 공은 한 틱 늦게 땅에 닿아서 바로 뒤에 뽑은 마디를 붙일 수 없다)
      ['꽉 찬 리듬: 손 함정 둘을 촘촘하게', [...phrase('short-last'), one(), ...phrase('hand-last'), 'cp']],
      ['가라앉음: 한 번 보여 주고 멈춤이 길다 → 그림의 공중 사슬 → 징검다리(내려올 땅이 빨간 박스라 멈춰서 건넌다)', [...quick('long-last'), 'airStep', 'airRing', 'stIn', 'stOutG', 'gAfter', 'cp']],
      ['마지막 절정 — 피버 둘(비스듬한 넓은 통로): 계단을 오르며 비스듬히 위로, 함정 마디에서 크게 휘어 아래로, 계단을 내려오며 다시 가로로. 곡의 끝맺는 한 방에 결승선', ['wUp', { wm: 'H', calm: 1, run: 2, kind: 'add' }, { wr: 'H' }, { wt: 'H', kind: 'add' }, { w: 1 }, 'wDn', { z: 1 }]],
      ['', ['goal', 'flat', 'flat']],
    ];
  },
};

// 7라운드: 예측을 깨는 라운드. 지금까지 함정은 늘 "두 번 되풀이한 다음, 마디의 끝에서" 왔다. 그것을 흩는다.
//   헛다리      되풀이했는데 함정이 안 온다(세 번째도 같다). 함정을 기다리던 손이 헛짚고, 방심한 다음 짜임에서 걸린다
//   들쭉날쭉    함정 앞의 되풀이가 한 번·두 번·세 번
//   앞에서 뚝 / 앞에서 손 바꿈   마디의 끝이 아니라 첫 입력이 다르다(처음 나오는 자리는 체크포인트 바로 뒤, 두 번 되풀이한 다음)
// 되풀이할 마디에도 높이 장치(떠 있는 박스, 파란 천장)가 섞인다 — 함정은 장치가 달리지 않은 입력에 건다.
// 피버는 절정 두 곳에만. 새 장치 튕김판(B: 공중에 뜬 파란 판. 닿으면 누르지 않아도 꺾인다)이 나온다: 판이 있는 마디를 세 번 → 네 번째엔 판이 없다(눌러야 한다).
// 좁은 통로의 줄(19가지)은 바닥났지만, 튕김판이 있는 줄은 새것이라 좁은 통로에도 쓴다. 바운스에는 삼단 점프(충전 고리)와 미끼 고리를 넣었다.
TEMPLATES.R7 = {
  prefix: 'g7', bpm: 152.0, floatReds: true, vary: true, density: 0.95, fresh: true, cpFill: true, cpLevel: 'a7',
  rise: [{ at: 21, bars: 2, key: 'U', need: { kind: ['hlong', 'hshort'] } }, { at: 69, bars: 2, trap: 'U' }],      // 음이 올라가는 구간(곡에서 잰 자리: 마디 21~22, 69~70)
  recipe: { g: 'a7', gf: 'a7', traps: 13, from: 0, kinds: { 'stop-last': 2, 'hand-last': 2, 'stop-first': 2, 'hand-first': 2, 'short-last': 2, 'long-last': 2, 'short-first': 2, 'long-first': 2 }, reps: { 1: 3, 2: 4, 3: 3 }, intro: [], fill: { one: 6, pair: 2, set: 0, rest: 0 } },      // (점수 계산용. 뽑을 마디의 자리는 아래에 손으로 정했다)
  sections() {
    //   one() 새 마디 하나 / phrase(함정, 되풀이 횟수) 새 마디를 그만큼 되풀이한 뒤 함정 / feint(횟수) 헛다리: 그만큼 되풀이하고 함정 없이 넘어간다
    //   함정의 종류를 배열로 주면 그 종류로만 만든다(처음 소개하는 자리), 글자로 주면 안 될 때 다른 종류로 바꾼다
    let key = 0;
    const one = () => ({ m: 'f' + key++, g: 'a7' });
    const ALL = ['short-last', 'long-last', 'stop-last', 'hand-last', 'short-first', 'long-first', 'stop-first', 'hand-first'];      // (멈춤 길이 함정을 먼저 해 본다)
    const kindsOf = (kind) => (Array.isArray(kind) ? kind : [kind, ...ALL.filter((x) => x !== kind && x.slice(-5) === kind.slice(-5))]);      // 안 되면 같은 자리(앞·끝)의 다른 종류로. 자리는 바꾸지 않는다(앞에서 걸 함정은 앞에서)
    const phrase = (kind, reps = 2) => { const k = 'p' + key++; return [{ m: k, g: 'a7', need: kindsOf(kind) }, ...Array.from({ length: reps - 1 }, () => ({ r: k })), { t: k, kind: kindsOf(kind) }]; };
    const feint = (reps) => { const k = 'h' + key++; return [{ m: k, g: 'a7' }, ...Array.from({ length: reps - 1 }, () => ({ r: k }))]; };
    return [
      ['도입(조용함)이지만 쉬어 가지 않는다: 두 번 되풀이 → 끝에서 뚝, 한 번 보여 주고 → 끝에서 손 바꿈', ['flat', 'flat', ...phrase('stop-last', 2), ...phrase('hand-last', 1), 'cp']],
      ['리듬 — 헛다리를 소개한다: 같은 마디가 세 번 온다(세 번째에 함정이 없다). 이어지는 마디는 세 번 되풀이한 뒤에야 함정이 온다(끝의 멈춤이 길다)', [...feint(3), ...phrase('long-last', 3), 'cp']],
      ['더 꽉 찬 리듬 — "앞에서 뚝"을 소개한다: 두 번 되풀이 → 이번엔 첫 입력이 없다. 이어서 헛다리(두 번 하고 그냥 넘어간다), 한 번 보여 주고 함정', [...phrase(['stop-first'], 2), ...feint(2), ...phrase('stop-last', 1), 'cp']],
      ['성긴 리듬 — "앞에서 손 바꿈"을 소개한다: 두 번 되풀이 → 이번엔 첫 입력의 손이 반대. 이어서 새 마디 하나, 앞에서 뚝', [...phrase(['hand-first'], 2), one(), ...phrase('stop-first', 2), 'cp']],
      ['첫 절정 — 피버 하나(넓은 통로, 비스듬히 아래로): 튕김판을 소개한다(공중에 뜬 파란 판 — 닿으면 누르지 않아도 꺾인다). 같은 마디가 세 번(헛다리) → 네 번째엔 판이 없다(눌러야 꺾인다). 통로는 두 번째 마디에서 아래로 굽고 함정 마디에서 펴진다', ['wUp', { wm: 'A', pads: 1, calm: 1, run: 2, kind: 'pad' }, { wr: 'A' }, { wr: 'A' }, { wt: 'A', kind: 'pad' }, 'wDn', { zm: 'Z1', pads: 1, kind: 'none' }, 'cp']],
      ['절정이 이어진다 — 삼단 점프를 소개한다(이단 점프의 꼭대기에 충전 고리: 공중에서 한 번 더 뛴다): 한 번 보여 주고 앞에서 뚝 → 삼단 점프 두 번 → 미끼 고리(헛다리: 고리는 있는데 뛰면 안 된다) → 한 번 보여 주고 앞에서 손 바꿈', [...phrase('stop-first', 1), 'ring3', 'ring3', 'ring3Bait', ...phrase('hand-first', 1), 'cp']],
      ['아주 조용함(오르골): 손 함정 하나, 그리고 삼단 점프를 섞는다 — 꼭대기에서 멈춰 긴 벽 건너기 → 미끼 고리 → 이번엔 진짜(미끼 다음이라 망설이면 걸린다)', [...phrase('short-last', 2), 'ring3Far', 'ring3Bait', 'ring3', one(), 'cp']],
      ['리듬 다시: 그림의 공중 사슬(두 마디 동안 멈춤 셋) → 세 번 되풀이한 뒤 앞의 멈춤이 짧다 → 새 마디 하나', ['airStep', 'airRing', ...phrase('short-first', 3), one(), 'cp']],
      ['더 꽉 찬 리듬: 한 번 보여 주고 앞에서 뚝 → 두 번 되풀이 뒤 끝에서 손 바꿈 → 헛다리(함정 없이 피버로 들어간다)', [...phrase('stop-first', 1), ...phrase('long-last', 2), ...feint(2), 'cp']],
      ['마지막 절정 — 피버 둘(넓은 통로, 곧장 위로 섰다가 계단처럼 눕는다): 한 번 보여 주고 뚝 → 새 마디를 두 번 하고 함정 없이 끝난다(헛다리). 곡이 끝맺는 소리에 결승선', ['wUp', { wm: 'B' }, { wt: 'B', kind: 'break' }, { wm: 'C', pads: 1, calm: 1, run: 2, kind: 'none' }, { wr: 'C' }, 'wDn', { zm: 'Z2', pads: 1, kind: 'none' }]],
      ['', ['goal', 'flat', 'flat']],
    ];
  },
};

// 8라운드: 계단의 라운드. 평지는 거의 없고(처음·체크포인트·결승선뿐), 바운스 구간은 전부 공중에 뜬 파란 박스의 계단이다. 공이 실제로 딛고 오르내린다(tools_stairs.js).
//   오르면서 함정: 이단 점프로 오르던 단이 낮아졌다(뚜껑) / 그 자리에 빨간 단(손 바꿈) / 건너뛰던 빨간 단이 한 칸 뒤로 밀렸다
//   내려오면서 함정: 건너뛰던 빨간 단이 한 칸 뒤로 밀렸다
// 계단 하나는 땅에서 시작해 땅에서 끝나고, 길이는 한 마디·두 마디·네 마디(큰 산: 여덟 칸 높이까지). 짜임은 7라운드와 같다(되풀이 → 함정, 헛다리, 한 번 보여 주고 함정).
// 피버는 곡의 가장 센 절정 한 곳(40~46)에만 둔다. 마지막 절정은 큰 산을 넘어 결승선으로 간다.
TEMPLATES.R8 = {
  prefix: 'g8', bpm: 150.0, floatReds: true, fresh: true, density: 0.9, cpFill: true, cpStairs: true, holdW: 5, hds: [0.5, 1],      // hds: 멈춰서 건너뛰는 단의 멈춤 길이(1/2박·1박) — 멈춤 길이 함정을 낼 수 있게
       // holdW: 멈춰서 건너뛰는 단을 5배 자주(공중에서 멈추는 시간을 늘린다)
  recipe: { traps: 8, intro: [] },
  sections() {
    const cont = (n) => Array.from({ length: n - 1 }, () => ({ cont: 1 }));
    const hill = (key, n, o = {}) => [{ hill: key, bars: n, ...o }, ...cont(n)], rep = (key, n) => [{ hr: key }, ...cont(n)], trap = (key, n, kind, where) => [{ ht: key, kind, where }, ...cont(n)];
    const J = (to) => ({ to, how: 'j' }), H = (to, red) => ({ to, how: 'h', red }), A = (to) => ({ to });
    return [
      ['도입(조용함): 계단을 하나씩 보여 준다. 그냥 딛고 오르내리기(누를 것이 없다) → 높은 단은 이단 점프로 ×2 → 빨간 단은 멈춰서 건너뛰기 ×2', ['flat', 'flat', ...hill('I0', 1, { hops: [A(1), A(2), A(1), A(0)] }), ...hill('I1', 1, { hops: [J(3), A(2), A(0)] }), ...rep('I1', 1), ...hill('I2', 1, { hops: [A(1), H(3, 2), A(0)] }), ...rep('I2', 1), 'cp']],
      ['리듬 — 오르면서 함정: 한 마디짜리 계단을 두 번 → 이단 점프로 오르던 단이 낮아졌다. 이어서 두 마디짜리 계단을 두 번(헛다리: 함정이 없다)', [...hill('A', 1, { need: { kind: ['lidJ'], where: 'up' } }), ...rep('A', 1), ...trap('A', 1, ['lidJ'], 'up'), ...hill('B', 2, { peak: 5 }), ...rep('B', 2), 'cp']],
      ['더 꽉 찬 리듬 — 내려오면서 함정: 두 마디짜리 계단을 두 번 → 내려오는 길의 빨간 단이 한 칸 뒤로 밀렸다. 이어서 새 계단 하나', [...hill('C', 2, { peak: 5, need: { kind: ['shift'], where: 'down' } }), ...rep('C', 2), ...trap('C', 2, ['shift'], 'down'), ...hill('D', 1), 'cp']],
      ['조용함 — 큰 산: 네 마디에 걸쳐 여덟 칸 높이까지 올랐다가 내려온다. 이어서 한 마디짜리를 두 번 → 손 바꿈(이단 점프로 오르던 자리에 빨간 단)', [...hill('M1', 4, { peak: 8 }), ...hill('E', 1, { need: { kind: ['swap'], where: 'up' } }), ...rep('E', 1), ...trap('E', 1, ['swap'], 'up'), 'cp']],
      ['다시 꽉 찬 리듬 — 한 번만 보여 주고 함정(오르면서), 이어서 헛다리(두 번 하고 그냥 넘어간다)와 새 계단', [...hill('F', 2, { peak: 5, need: { kind: ['hlong'], where: 'up' } }), ...trap('F', 2, ['hlong', 'lidJ', 'swap'], 'up'), ...hill('G', 1), ...rep('G', 1), ...hill('H', 1), 'cp']],
      ['가장 센 절정 — 피버 하나(넓은 통로, 튕김판): 판이 있는 마디를 두 번 → 판이 없다(눌러야 꺾인다). 끝은 좁은 통로의 튕김판', ['wUp', { wm: 'FA', pads: 1, calm: 1, run: 2, kind: 'pad' }, { wr: 'FA' }, { wt: 'FA', kind: 'pad' }, 'wDn', { zm: 'Z1', pads: 1, kind: 'none' }, { zm: 'Z2', pads: 1, kind: 'none' }, 'cp']],
      ['엇박 베이스 — 내려오면서 함정: 두 마디짜리 계단을 두 번 → 밀린 빨간 단. 이어서 새 계단 하나', [...hill('J', 2, { peak: 5, need: { kind: ['hshort', 'hlong'], where: 'down' } }), ...rep('J', 2), ...trap('J', 2, ['hshort', 'hlong', 'shift'], 'down'), ...hill('K', 1), 'cp']],
      ['엇박 베이스, 더 꽉 차게 — 헛다리(같은 계단 세 번), 이어서 한 번만 보여 주고 함정', [...hill('L', 1), ...rep('L', 1), ...rep('L', 1), ...hill('N', 2, { peak: 5, need: { kind: ['hlong', 'hshort'] } }), ...trap('N', 2, ['hlong', 'hshort', 'lidJ', 'swap', 'shift']), 'cp']],
      ['조용함 — 두 번째 큰 산, 이어서 한 마디짜리를 두 번 → 밀린 빨간 단', [...hill('M2', 4, { peak: 8 }), ...hill('P', 1, { need: { kind: ['hlong', 'shift'] } }), ...rep('P', 1), ...trap('P', 1, ['hlong', 'shift']), 'cp']],
      ['마지막 절정 — 세 번째 큰 산을 넘고, 그림의 공중 사슬(파란 단에 내려 튀며 멈추고, 충전 고리로 다시 올라 멈추고)을 지나 결승선으로', [...hill('M3', 4, { peak: 8 }), 'airStep', 'airRing']],
      ['', ['goal', 'flat', 'flat']],
    ];
  },
};

// 9라운드: 속도감 있는 곡이라 피버 위주(81마디 가운데 34마디, 다섯 구간). 새것은 움직이는 장애물 — 바운스 구간에 손으로 짠 세트 마디로 놓는다(logic.js의 pressRow 등):
//   내려찍는 프레스, 내리꽂히는 톱날 / 오가는 톱날 / 도는 톱날, 풍차처럼 도는 막대, 실어 나르는 파란 발판.
//   장애물은 공이 지나가는 그 순간에 맞춰 짜여 있다(맞는 길은 아슬아슬하게 비켜 가고, 틀린 길은 막는다). 그 밖의 시간에는 박에 맞춰 움직인다.
//   짜임은 그대로: 세트 마디를 두 번 보여 주고 → 뒤집기(pressHop×2 → pressRow, sawGate×2 → sawGateT, platRide×2 → platRideT).
//   충전 고리(삼단 점프)와 높이 장치(떠 있는 박스, 징검다리)도 움직이는 장애물과 섞는다: fJumpP, stPress, ring3Saw, ring3, ring3Far, ring3Bait.
//   피버는 다섯 곳(질주 구간). 지난 시안의 "움직이는 이빨"은 뺐다(벽 속의 이빨이 튀어나오는 것은 읽기 어렵고 세련돼 보이지 않았다).
TEMPLATES.R9 = {
  prefix: 'g9', bpm: 150.0, freshWideAll: true, floatReds: true, vary: true, density: 0.95, fresh: true, cpFill: true, cpLevel: 'a7',
  rise: [{ at: 19, bars: 2, key: 'U', need: { kind: ['hlong', 'hshort'] } }, { at: 66, bars: 2, trap: 'U' }],      // 음이 올라가는 구간(곡에서 잰 자리: 마디 19~20, 66~67)
  recipe: { g: '7v', gf: '7v', traps: 4, from: 0, kinds: { 'stop-last': 3, 'hand-last': 3, 'stop-first': 3, 'hand-first': 3 }, reps: { 1: 3, 2: 4, 3: 3 }, intro: [], fill: { one: 6, pair: 2, set: 0, rest: 0 } },      // (점수 계산용)
  sections() {
    let key = 0;
    const one = () => ({ m: 'f' + key++, g: 'a7' });
    const phrase = (kind, reps = 2) => { const k = 'p' + key++, ks = [kind, ...['short-last', 'long-last', 'hand-last', 'stop-last'].filter((x) => x !== kind)]; return [{ m: k, g: 'a7', need: ks }, ...Array.from({ length: reps - 1 }, () => ({ r: k })), { t: k, kind: ks }]; };
    return [
      ['도입: 곡이 크게 한 번 치고 가라앉는다. 프레스를 소개한다 — 프레스 둘 밑을 지나 기둥을 뛰어 넘기 ×2 → 뒤집기: 기둥 자리에 프레스(뛰면 머리를 박는다). 이어서 프레스 밑을 멈춰서 미끄러지듯 건너고(멈춤의 라운드), 충전 고리로 솟는 톱날 위를 넘는다', ['flat', 'flat', 'pressHop', 'pressHop', 'pressRow', 'pressGlide', 'ring3Saw', 'cp']],
      ['첫 질주 — 피버 하나(좁은 통로): 되풀이 → 뚝, 되풀이 → 하나 더', [{ zm: 'A' }, { zr: 'A' }, { zt: 'A', kind: 'break' }, { zm: 'B', kind: 'add' }, { zr: 'B' }, { zt: 'B', kind: 'add' }, { zm: 'B2', kind: 'none' }, 'cp']],
      ['낮게 깔린 그루브 — 톱날: 내려설 자리로 내리꽂히는 톱날 ×2 → 뒤집기(첫 톱날이 안 내려온다). 이어서 오가는 톱날 밑을 멈춰서, 도는 톱날, 프레스 밑을 멈춰서 미끄러지기, 미끼 고리', ['sawGate', 'sawGate', 'sawGateT', 'sawDive', 'sawOrbit', 'pressGlide', 'ring3Bait', 'cp']],
      ['둘째 질주 — 넓은 통로, 이어서 튕김판(판이 있는 마디 → 판이 없다)', ['wUp', { wm: 'E', calm: 1, run: 2 }, { wr: 'E' }, { wt: 'E', kind: 'break' }, { wm: 'F', pads: 1, kind: 'pad' }, { wt: 'F', kind: 'pad' }, 'wDn', 'cp']],
      ['떨어짐과 숨 고르기 — 발판: 빨간 바닥 위를 실어 나르는 파란 발판 ×2 → 뒤집기(발판이 높다: 뛰어서 올라탄다). 이어서 풍차 막대, 충전 고리 꼭대기에서 멈춰 긴 벽 건너기, 프레스 밑을 멈춰서 미끄러지기', ['platRide', 'platRide', 'platRideT', 'barSpin', 'ring3Far', 'pressGlide', one(), 'cp']],
      ['가장 센 절정 — 넓은 통로: 튕김판 ×2 → 판이 없다, 이어서 하나 더', ['wUp', { wm: 'G', pads: 1, kind: 'pad', calm: 1, run: 2 }, { wr: 'G' }, { wt: 'G', kind: 'pad' }, { wm: 'H', kind: 'add' }, { wt: 'H', kind: 'add' }, 'wDn', 'cp']],
      ['거의 무음 — 높은 곳: 징검다리에 올라 프레스 밑을 지난다(공이 떠나자마자 돌을 내리찍는다) ×2, 내려올 땅이 빨간 박스(멈춰서 건넌다). 이어서 그림의 공중 사슬(멈춤 셋)', ['stIn', 'stPress', 'stPress', 'stOutG', 'gAfter', 'airStep', 'airRing', 'cp']],
      ['다시 질주 — 좁은 통로(하나 더 → 튕김판 → 판이 없다)', [{ zm: 'I', kind: 'add' }, { zr: 'I' }, { zt: 'I', kind: 'add' }, { zm: 'J', pads: 1, kind: 'pad' }, { zr: 'J' }, { zt: 'J', kind: 'pad' }, { zm: 'K', kind: 'none' }, 'cp']],
      ['그루브와 쌓아 올림 — 장애물을 한 번씩(프레스 밑 미끄러지기, 오가는 톱날, 풍차), 이어서 멈춤 길이의 함정(두 번 되풀이 → 끝의 멈춤이 짧다)', ['pressGlide', 'sawDive', 'barSpin', ...phrase('short-last'), one(), 'cp']],
      ['마지막 절정 — 넓은 통로가 굽이친 채로 곡의 끝까지 가고(마지막에 한 마디 더), 마지막 마디에 계단으로 내려와 곡이 사그라드는 첫 박(마디 78)에 결승선. (전에는 끝 두 마디에 피버 → 계단 → 좁은 피버 한 마디 → 결승선으로 모드가 세 번 바뀌어 어색했다)', ['wUp', { wm: 'L', calm: 1, run: 2 }, { wr: 'L' }, { wt: 'L', kind: 'break' }, { w: 1, calm: 1, run: 2 }, 'wDn']],
      ['', ['goal', 'flat', 'flat']],
    ];
  },
};

// 10라운드(Anvil and Piston, 인더스트리얼 신스웨이브): 공장의 라운드. 새것은 수평 패턴 — 옆으로 튀어나오는 망치(낮은 망치 = 내려설 자리, 높은 망치 = 이단 점프한 공)와
// 분쇄 롤러(바닥에 박힌 구덩이, 멈춘 높이에 뜬 롤러), 내려찍는 망치(logic.js의 hamGlide 등). 짜임은 그대로: 두 번 보여 주고 뒤집기(hamGlide×2 → hamMix, ramHop×2 → grindPit).
// 앞 라운드의 것도 다 섞는다: 멈춤 길이 함정, 공중 사슬, 그림의 공중 사슬, 징검다리 위 프레스, 프레스 밑 미끄러지기, 충전 고리, 음이 올라가는 구간의 계단(17~18, 36~37 → 69~70에서 같은 오르막의 멈춤 길이 함정).
// 피버는 곡의 꽉 찬 구간 셋(24~30, 40~46, 72~78)에만 — 공장의 기계를 보는 라운드다.
TEMPLATES.R10 = {
  prefix: 'g10', bpm: 150.0, floatReds: true, vary: true, density: 0.95, fresh: true, cpFill: true, cpLevel: 'a7',
  rise: [{ at: 17, bars: 2, key: 'U' }, { at: 36, bars: 2, key: 'V', need: { kind: ['hlong', 'hshort'] } }, { at: 69, bars: 2, trap: 'V' }],      // 음이 올라가는 구간(곡에서 잰 자리. 빌드업 67~70 가운데 공중 사슬 뒤의 두 마디)
  recipe: { g: 'a7', gf: 'a7', traps: 6, from: 0, kinds: { 'short-last': 3, 'long-last': 3, 'hand-last': 2, 'stop-last': 2 }, reps: { 2: 7, 3: 3 }, intro: [], fill: { one: 6, pair: 2, set: 0, rest: 0 } },      // (점수 계산용)
  sections() {
    let key = 0;
    const one = () => ({ m: 'f' + key++, g: 'a7' });
    const phrase = (kind, reps = 2) => { const k = 'p' + key++, ks = [kind, ...['short-last', 'long-last', 'hand-last', 'stop-last'].filter((x) => x !== kind)]; return [{ m: k, g: 'a7', need: ks }, ...Array.from({ length: reps - 1 }, () => ({ r: k })), { t: k, kind: ks }]; };
    const RISE = 'flat';      // (음이 올라가는 구간의 계단이 이 자리를 대신한다: 틀의 rise)
    return [
      ['도입(킥만): 내려찍는 망치를 소개한다 — 망치 둘 밑을 지나 셋째 박을 쓸어 가는 낮은 망치를 뛰어 넘기 ×2 → 구덩이 위를 멈춰서(뛰면 망치에). 이어서 옆 망치가 내려설 자리를 쓸어 가는 것을 뛰어 넘기 ×2', ['flat', 'flat', 'hamDrop', 'hamDrop', 'hamPit', 'ramHop', 'ramHop', 'cp']],
      ['꽉 찬 A — 수평 패턴을 소개한다: 낮은 망치와 높은 망치 사이로 멈춰서 빠져나가기 ×2 → 뒤집기(뒤쪽에 롤러가 멈춘 높이에 떠 있다: 뛰어 넘는다). 옆 망치 뛰어 넘기 → 뒤집기(구덩이 위에 높은 망치: 멈춰서). 새 마디 둘', ['hamGlide', 'hamGlide', 'hamMix', 'ramHop', 'grindPit', one(), one(), 'cp']],
      ['가라앉음: 음이 올라가는 두 마디는 오르는 계단. 이어서 멈춤 길이 함정(두 번 되풀이 → 끝의 멈춤이 짧다)과 새 마디. 곡이 끊기는 마디가 체크포인트', [one(), RISE, RISE, ...phrase('short-last'), one(), 'cp']],
      ['꽉 찬 B — 피버 하나(좁은 통로): 되풀이 → 뚝, 튕김판 → 판이 없다', [{ zm: 'A' }, { zr: 'A' }, { zt: 'A', kind: 'break' }, { zm: 'B', pads: 1, kind: 'pad' }, { zr: 'B' }, { zt: 'B', kind: 'pad' }, { zm: 'C', kind: 'none' }, 'cp']],
      ['가라앉음과 빌드업: 망치 밑 구덩이, 멈춤 길이 함정(길다), 빌드업의 두 마디는 오르는 계단', ['hamPit', ...phrase('long-last'), RISE, RISE, one(), 'cp']],
      ['가장 센 드롭 — 피버 둘(넓은 통로): 되풀이 → 뚝, 튕김판 → 판이 없다', ['wUp', { wm: 'E', calm: 1, run: 2 }, { wr: 'E' }, { wt: 'E', kind: 'break' }, { wm: 'F', pads: 1, kind: 'pad' }, { wt: 'F', kind: 'pad' }, 'wDn', 'cp']],
      ['브레이크다운(조용함) — 높은 곳: 징검다리 위의 프레스 ×2, 내려올 땅이 빨간 박스, 프레스 밑을 멈춰서 미끄러지기, 삼단 점프', ['stIn', 'stPress', 'stPress', 'stOutG', 'gAfter', 'pressGlide', 'ring3', 'cp']],
      ['꽉 찬 — 공장을 지나간다: 멈춰서 빠져나가기 → 뒤집기, 옆 망치 → 뒤집기(구덩이), 망치 밑, 새 마디 둘', ['hamGlide', 'hamMix', 'ramHop', 'grindPit', 'hamDrop', one(), one(), 'cp']],
      ['가라앉음과 빌드업: 멈춤 길이 함정(짧다), 그림의 공중 사슬, 빌드업은 같은 오르막 — 이번엔 멈춤 길이가 다르다', [...phrase('short-last'), 'airStep', 'airRing', RISE, RISE, 'cp']],
      ['큰 드롭 — 피버 셋(좁은 통로): 하나 더 ×2, 튕김판 → 판이 없다', [{ zm: 'G', kind: 'add' }, { zr: 'G' }, { zt: 'G', kind: 'add' }, { zm: 'I', pads: 1, kind: 'pad' }, { zr: 'I' }, { zt: 'I', kind: 'pad' }, { zm: 'J', kind: 'none' }, 'cp']],
      ['마지막 후렴 — 모든 기계: 멈춰서 빠져나가기 ×2 → 뒤집기, 그림의 공중 사슬, 옆 망치 → 구덩이, 망치. 곡이 끝맺는 한 방에 결승선', ['hamGlide', 'hamGlide', 'hamMix', 'airStep', 'airRing', 'ramHop', 'grindPit', 'hamDrop']],
      ['', ['goal', 'flat', 'flat']],
    ];
  },
};

// 11라운드(Velocity of Silk): 속임수의 라운드 — "보이는 것과 정답이 다르다". 두 번 보여 주고 뒤집되, 뒤집은 장면은 앞의 것과 거의 같아 보인다.
//   fenceJ×2 → fence(기둥이 그대로인데 이번엔 아무것도 안 누른다), djHold×2 → duckDrop(이단 점프 뒤 멈추던 자리에 매달린 덩어리: 손을 떼고 떨어진다),
//   grindPit×2 → liftSwap(같은 구덩이와 롤러인데 박이 반대: 멈춤과 이단 점프가 바뀐다), ring3×2 → ring3Bait(고리가 있는데 뛰면 안 된다),
//   음이 올라가는 11~12마디의 오르는 계단 → 같은 멜로디의 59~60마디에서 멈춤 길이가 다른 계단. 멈춤 길이 함정도 섞는다.
// 피버는 가장 센 드롭(40~46)과 마지막 드롭(72~77) 두 곳.
TEMPLATES.R11 = {
  prefix: 'g11', bpm: 150.0, floatReds: true, vary: true, density: 0.95, fresh: true, cpFill: true, cpLevel: 'a7',
  rise: [{ at: 11, bars: 2, key: 'U', need: { kind: ['hlong', 'hshort'] } }, { at: 59, bars: 2, trap: 'U' }],      // 음이 올라가는 구간(곡에서 잰 자리. 같은 멜로디가 두 번)
  recipe: { g: 'a7', gf: 'a7', traps: 8, from: 0, kinds: { 'short-last': 3, 'long-last': 3, 'hand-last': 2, 'stop-last': 2 }, reps: { 2: 7, 3: 3 }, intro: [], fill: { one: 6, pair: 2, set: 0, rest: 0 } },      // (점수 계산용)
  sections() {
    let key = 0;
    const one = () => ({ m: 'f' + key++, g: 'a7' });
    const phrase = (kind, reps = 2) => { const k = 'p' + key++, ks = [kind, ...['short-last', 'long-last', 'hand-last', 'stop-last'].filter((x) => x !== kind)]; return [{ m: k, g: 'a7', need: ks }, ...Array.from({ length: reps - 1 }, () => ({ r: k })), { t: k, kind: ks }]; };
    const RISE = 'flat';      // (음이 올라가는 구간의 계단이 이 자리를 대신한다: 틀의 rise)
    return [
      ['조용한 도입 — 속임수를 소개한다: 내려설 자리의 기둥을 뛰어 넘기 ×2 → 기둥은 그대로 서 있는데 이번엔 모두 튀는 길 밑이다(아무것도 안 누른다. 뛰면 다음 기둥에 떨어진다)', ['flat', 'flat', 'fenceJ', 'fenceJ', 'fence', one(), one(), 'cp']],
      ['차오름 A: 높은 기둥을 이단 점프 → 땅의 덩어리 위를 멈춰서 ×2 → 같은 기둥 뒤에 덩어리가 매달려 있다(손을 떼고 떨어져 그 밑으로). 음이 올라가는 두 마디는 오르는 계단', ['djHold', 'djHold', 'duckDrop', RISE, RISE, one(), one(), 'cp']],
      ['더 꽉 찬 B: 엇갈려 오르내리는 롤러의 두 구덩이(이단 점프 → 멈춤) ×2 → 박이 반대(멈춤 → 이단 점프). 이어서 멈춤 길이 함정', ['grindPit', 'grindPit', 'liftSwap', ...phrase('short-last'), one(), 'cp']],
      ['고음만 남는 브레이크 — 고리: 삼단 점프 ×2 → 미끼 고리(고리가 있는데 뛰면 안 된다). 그림의 공중 사슬', ['ring3', 'ring3', 'ring3Bait', 'airStep', 'airRing', one(), one(), 'cp']],
      ['저음 그루브 — 울타리: 내려설 자리의 기둥 뛰어 넘기 → 한 박 일찍 → 위에 빨간 막대(멈춰서). 멈춤 길이 함정', ['fenceJ', 'fenceJ1', 'fenceH', ...phrase('long-last'), one(), 'cp']],
      ['가장 센 드롭 — 피버 하나(넓은 통로): 되풀이 → 뚝, 튕김판 → 판이 없다', ['wUp', { wm: 'A', calm: 1, run: 2 }, { wr: 'A' }, { wt: 'A', kind: 'break' }, { wm: 'B', pads: 1, kind: 'pad', calm: 1, run: 2 }, { wt: 'B', kind: 'pad' }, 'wDn', 'cp']],
      ['조용함: 한 번 보여 주고 바로 뒤집기(멈춤 → 떨어지기), 망치 사이로 멈춰서 → 뒤집기, 멈춤 길이 함정', ['djHold', 'duckDrop', 'hamGlide', 'hamMix', ...phrase('short-last'), 'cp']],
      ['A 다시: 기둥 뒤 덩어리 ×2 → 떨어지기, 같은 멜로디의 오르막은 이번엔 멈춤 길이가 다르다. 롤러 구덩이 → 박이 반대', ['djHold', 'djHold', 'duckDrop', RISE, RISE, 'grindPit', 'liftSwap', 'cp']],
      ['조용한 빌드업: 그림의 공중 사슬, 멈춤 길이 함정, 삼단 점프 → 미끼 고리', ['airStep', 'airRing', ...phrase('long-last'), 'ring3', 'ring3Bait', 'cp']],
      ['마지막 드롭 — 피버 둘(좁은 통로): 되풀이 → 뚝, 튕김판 → 판이 없다. 곡이 끝나는 박에 결승선', [{ zm: 'C' }, { zr: 'C' }, { zt: 'C', kind: 'break' }, { zm: 'D', pads: 1, kind: 'pad' }, { zt: 'D', kind: 'pad' }, { zm: 'E', kind: 'none' }]],
      ['', ['goal', 'flat', 'flat']],
    ];
  },
};

// 12라운드(Across the Iron Peak): 봉우리의 라운드. 새것은 쇠 봉우리(iron) — 계단을 딛고 오르면 방금 떠난 단을 프레스가 박에 맞춰 내리찍는다(뒤에서 쾅, 쾅).
//   짜임은 8라운드의 계단과 같다(같은 계단 두 번 → 함정). 계단의 함정은 멈춤 길이(길게·짧게)를 먼저 쓰고, 안 되면 낮아진 단·손 바꿈·밀린 빨간 단.
//   가장 밝은 후렴(56~)과 마지막 후렴(72~)은 네 마디짜리 큰 봉우리(여덟 칸)를 넘는다. 피버는 후렴 둘(16~22, 48~54)에만.
//   앞 라운드의 것도 섞는다: 속임수(djHold→duckDrop, grindPit→liftSwap, ring3→ring3Bait), 망치, 징검다리 위 프레스, 그림의 공중 사슬, 멈춤 길이 함정.
TEMPLATES.R12 = {
  prefix: 'g12', bpm: 150.0, floatReds: true, vary: true, density: 0.9, fresh: true, cpFill: true, cpLevel: 'a7', holdW: 3, hds: [0.5, 1],
  recipe: { g: 'a7', gf: 'a7', traps: 8, from: 0, kinds: { 'short-last': 3, 'long-last': 3, 'hand-last': 2, 'stop-last': 2 }, reps: { 2: 7, 3: 3 }, intro: [], fill: { one: 6, pair: 2, set: 0, rest: 0 } },      // (점수 계산용)
  sections() {
    let key = 0;
    const one = () => ({ m: 'f' + key++, g: 'a7' });
    const phrase = (kind, reps = 2) => { const k = 'p' + key++, ks = [kind, ...['short-last', 'long-last', 'hand-last', 'stop-last'].filter((x) => x !== kind)]; return [{ m: k, g: 'a7', need: ks }, ...Array.from({ length: reps - 1 }, () => ({ r: k })), { t: k, kind: ks }]; };
    const cont = (n) => Array.from({ length: n - 1 }, () => ({ cont: 1 }));
    const K = ['hlong', 'hshort', 'lidJ', 'swap', 'shift'];      // 계단의 함정: 멈춤 길이를 먼저
    const hill = (k, n, o = {}) => [{ hill: k, bars: n, ...o }, ...cont(n)], rep = (k, n) => [{ hr: k }, ...cont(n)], trap = (k, n) => [{ ht: k, kind: K }, ...cont(n)];
    return [
      ['조용한 도입: 한 마디짜리 계단을 두 번 → 같은 계단인데 멈춤 길이가 다르다(또는 다른 함정). 새 마디 둘', ['flat', 'flat', ...hill('A', 1, { need: { kind: K } }), ...rep('A', 1), ...trap('A', 1), one(), one(), 'cp']],
      ['벌스 — 쇠 봉우리를 소개한다: 두 마디짜리 계단을 오르면 방금 떠난 단을 프레스가 내리찍는다 ×2 → 같은 봉우리의 함정. 이어서 이단 점프 → 멈춤', [...hill('B', 2, { peak: 5, iron: true, need: { kind: K } }), ...rep('B', 2), ...trap('B', 2), 'djHold', 'cp']],
      ['후렴 — 피버 하나(좁은 통로, 튕김판): 판이 있는 마디 ×2 → 판이 없다, 되풀이 → 뚝. (판이 없는 좁은 통로의 줄은 앞 라운드들에서 거의 다 나왔다)', [{ zm: 'A', pads: 1, kind: 'pad' }, { zr: 'A' }, { zt: 'A', kind: 'pad' }, { zm: 'B', pads: 1 }, { zr: 'B' }, { zt: 'B', kind: 'break' }, { zm: 'C', pads: 1, kind: 'none' }, 'cp']],
      ['저음만 남는 브레이크 — 속임수: 엇갈림 롤러 ×2 → 박이 반대, 이단 점프 → 멈춤 ×2 → 떠 있는 빨간 계단 밑으로 떨어지기', ['grindPit', 'grindPit', 'liftSwap', 'djHold', 'djHold', 'duckDrop', one(), 'cp']],
      ['벌스 둘: 더 높은 쇠 봉우리(여섯 칸) → 같은 봉우리의 함정, 이어서 멈춤 길이 함정', [...hill('D', 2, { peak: 6, iron: true, need: { kind: K } }), ...trap('D', 2), ...phrase('short-last'), 'cp']],
      ['빌드업: 그림의 공중 사슬, 삼단 점프 → 미끼 고리, 멈춤 길이 함정', ['airStep', 'airRing', 'ring3', 'ring3Bait', ...phrase('long-last'), 'cp']],
      ['후렴 둘 — 피버 둘(넓은 통로, 튕김판): 판이 있는 마디 ×2 → 판이 없다, 하나 더', ['wUp', { wm: 'E', pads: 1, kind: 'pad', calm: 1, run: 2 }, { wr: 'E' }, { wt: 'E', kind: 'pad' }, { wm: 'F', pads: 1, kind: 'pad', calm: 1, run: 2 }, { wt: 'F', kind: 'pad' }, 'wDn', 'cp']],
      ['후렴 셋(가장 밝다) — 큰 쇠 봉우리: 네 마디에 걸쳐 여덟 칸까지 오르고 내려온다(프레스가 뒤에서 쫓아온다). 이어서 망치 사이로 멈추기 → 뒤집기, 옆 망치', [...hill('P', 4, { peak: 8, iron: true }), 'hamGlide', 'hamMix', 'ramHop', 'cp']],
      ['조용함 — 높은 곳: 징검다리 위의 프레스, 내려올 땅이 빨간 박스, 새 마디 셋', ['stIn', 'stPress', 'stOutG', 'gAfter', one(), one(), one(), 'cp']],
      ['마지막 후렴 — 봉우리를 넘어: 큰 쇠 봉우리, 이어서 두 마디짜리 봉우리, 곡의 한 방에 결승선', [...hill('Q', 4, { peak: 8, iron: true }), ...hill('R', 2, { peak: 5, iron: true }), one()]],
      ['', ['goal', 'flat', 'flat']],
    ];
  },
};

// 13라운드(Final Level Sprint): 마지막 판 — 총정리. 구간마다 앞 라운드 하나의 대표 장치가 돌아오고, 늘 "두 번 보여 주고 뒤집기"로 끝난다.
//   도입은 멈춤 길이 함정(2라운드~), 벌스는 쇠 봉우리(12)와 속임수(11), 브레이크는 울타리(11)와 음이 오르는 계단, 벌스 둘은 망치와 롤러(10),
//   거의 소리가 없는 여덟 마디는 공중(멈춤과 고리, 5~7), 빌드업은 움직이는 장애물(9), 후렴 둘은 큰 쇠 봉우리, 조용함은 징검다리 위 프레스와 같은 오르막의 함정.
//   피버는 후렴 하나(24~30, 좁은 통로)와 마지막 질주(72~78, 넓은 통로) 두 곳. 곡이 한 마디 멈췄다가 다시 치는 박(마디 80)에 결승선.
TEMPLATES.R13 = {
  prefix: 'g13', bpm: 150.0, floatReds: true, vary: true, density: 0.9, fresh: true, cpFill: true, cpLevel: 'a7', holdW: 3, hds: [0.5, 1],
  rise: [{ at: 17, bars: 2, key: 'U', need: { kind: ['hlong', 'hshort'] } }, { at: 68, bars: 2, trap: 'U' }],      // 음이 올라가는 구간(곡에서 잰 자리: 브레이크의 17~18, 조용한 빌드업의 68~69)
  recipe: { g: 'a7', gf: 'a7', traps: 8, from: 0, kinds: { 'short-last': 3, 'long-last': 3, 'hand-last': 2, 'stop-last': 2 }, reps: { 2: 7, 3: 3 }, intro: [], fill: { one: 6, pair: 2, set: 0, rest: 0 } },      // (점수 계산용)
  sections() {
    let key = 0;
    const one = () => ({ m: 'f' + key++, g: 'a7' });
    const phrase = (kind, reps = 2) => { const k = 'p' + key++, ks = [kind, ...['short-last', 'long-last', 'hand-last', 'stop-last'].filter((x) => x !== kind)]; return [{ m: k, g: 'a7', need: ks }, ...Array.from({ length: reps - 1 }, () => ({ r: k })), { t: k, kind: ks }]; };
    const cont = (n) => Array.from({ length: n - 1 }, () => ({ cont: 1 }));
    const K = ['hlong', 'hshort', 'lidJ', 'swap', 'shift'];
    const hill = (k, n, o = {}) => [{ hill: k, bars: n, ...o }, ...cont(n)], rep = (k, n) => [{ hr: k }, ...cont(n)], trap = (k, n) => [{ ht: k, kind: K }, ...cont(n)];
    const RISE = 'flat';      // (음이 올라가는 구간의 계단이 이 자리를 대신한다: 틀의 rise)
    return [
      ['도입 — 처음처럼: 멈춤 함정(같은 공중 사슬 두 번 → 마지막 멈춤이 짧거나 없다), 새 마디 둘', ['flat', 'flat', ...phrase('short-last'), one(), one(), 'cp']],
      ['벌스 — 쇠 봉우리(12라운드): 봉우리 → 같은 봉우리의 함정, 더 높은 봉우리(여섯 칸) → 그 봉우리의 함정(둘째 마디가 체크포인트)', [...hill('B', 2, { peak: 5, iron: true, need: { kind: K } }), ...trap('B', 2), ...hill('C', 2, { peak: 6, iron: true, need: { kind: K } }), { ht: 'C', kind: K, cpAt: 1 }, { cont: 1 }]],
      ['브레이크: 한 마디짜리 쇠 봉우리, 음이 올라가는 두 마디는 오르는 계단, 울타리(11라운드) 한 번 → 기둥은 그대로인데 이번엔 아무것도 안 누른다', [...hill('E', 1, { peak: 3, iron: true }), RISE, RISE, 'fenceJ', 'fence', one(), one(), 'cp']],
      ['후렴 — 피버 하나(좁은 통로, 튕김판): 판이 있는 마디 ×2 → 판이 없다, 되풀이 → 뚝', [{ zm: 'A', pads: 1, kind: 'pad' }, { zr: 'A' }, { zt: 'A', kind: 'pad' }, { zm: 'B', pads: 1 }, { zr: 'B' }, { zt: 'B', kind: 'break' }, { zm: 'C', pads: 1, kind: 'none' }, 'cp']],
      ['벌스 둘 — 공장(10라운드): 망치 사이로 멈추기 ×2 → 뒤집기, 엇갈림 롤러 ×2 → 박이 반대, 옆 망치', ['hamGlide', 'hamGlide', 'hamMix', 'grindPit', 'grindPit', 'liftSwap', 'ramHop', 'cp']],
      ['거의 소리가 없는 여덟 마디 — 공중(5~7라운드): 그림의 공중 사슬, 삼단 점프 ×2 → 미끼 고리, 새 마디 둘', ['airStep', 'airRing', 'ring3', 'ring3', 'ring3Bait', one(), one(), 'cp']],
      ['빌드업 — 움직이는 장애물(9라운드): 톱날 문 ×2 → 뒤집기, 움직이는 판 ×2 → 뒤집기, 프레스 밑 미끄러지기', ['sawGate', 'sawGate', 'sawGateT', 'platRide', 'platRide', 'platRideT', 'pressGlide', 'cp']],
      ['후렴 둘 — 큰 쇠 봉우리: 네 마디에 걸쳐 여덟 칸까지(프레스가 뒤에서 쫓아온다). 이어서 이단 점프 → 떨어지기, 고리 셋과 톱날', [...hill('P', 4, { peak: 8, iron: true }), 'djHold', 'duckDrop', 'ring3Saw', 'cp']],
      ['조용함과 빌드업: 징검다리 위 프레스, 같은 멜로디의 오르막은 이번엔 멈춤 길이가 다르다', ['stIn', 'stPress', 'stOutG', 'gAfter', RISE, RISE, one(), 'cp']],
      ['마지막 질주 — 피버 둘(넓은 통로, 튕김판): 판이 있는 마디 ×2 → 판이 없다, 하나 더. 곡이 한 마디 멈추는 동안 한 마디 더', ['wUp', { wm: 'E', pads: 1, kind: 'pad', calm: 1, run: 2 }, { wr: 'E' }, { wt: 'E', kind: 'pad' }, { wm: 'F', pads: 1, kind: 'pad', calm: 1, run: 2 }, { wt: 'F', kind: 'pad' }, 'wDn', one()]],
      ['', ['goal', 'flat', 'flat']],
    ];
  },
};

// 14라운드(Temple Canopy Pursuit): 정글 신전. 새것은 흔들리는 돌추(swing) — 나무 위에 덩굴로 매달린 빨간 돌이 박에 맞춰 오간다.
//   낮은 돌(땅을 쓴다) → 멈춰서 넘기 ×2 → 덩굴이 짧은 높은 돌(멈춘 높이를 지난다) → 아무것도 안 누르고 밑으로. 한 마디에 둘(낮고 높게) ×2 → 순서가 바뀐다.
//   나무 위로 오르는 계단(쇠 봉우리 없이), 음이 오르는 50~51 → 61~62(멈춤 길이가 다르다). 피버는 후렴 둘(16~22, 40~46)에만, 세 번째 후렴(64~)은 큰 계단.
TEMPLATES.R14 = {
  prefix: 'g14', bpm: 150.0, floatReds: true, vary: true, density: 0.9, fresh: true, cpFill: true, cpLevel: 'a8', holdW: 3, hds: [0.5, 1],
  rise: [{ at: 50, bars: 2, key: 'U', need: { kind: ['hlong', 'hshort'] } }, { at: 61, bars: 2, trap: 'U' }],      // 음이 올라가는 구간(곡에서 잰 자리: 브레이크다운의 50~51, 벌스의 61~62)
  recipe: { g: 'a8', gf: 'a7', traps: 8, from: 0, kinds: { 'short-last': 3, 'long-last': 3, 'hand-last': 2, 'stop-last': 2 }, reps: { 2: 7, 3: 3 }, intro: [], fill: { one: 6, pair: 2, set: 0, rest: 0 } },      // (점수 계산용)
  sections() {
    let key = 0;
    const one = () => ({ m: 'f' + key++, g: 'a8' });
    const phrase = (kind, reps = 2) => { const k = 'p' + key++, ks = [kind, ...['short-last', 'long-last', 'hand-last', 'stop-last'].filter((x) => x !== kind)]; return [{ m: k, g: 'a8', need: ks }, ...Array.from({ length: reps - 1 }, () => ({ r: k })), { t: k, kind: ks }]; };
    const cont = (n) => Array.from({ length: n - 1 }, () => ({ cont: 1 }));
    const K = ['hlong', 'hshort', 'lidJ', 'swap', 'shift'];
    const hill = (k, n, o = {}) => [{ hill: k, bars: n, ...o }, ...cont(n)], rep = (k, n) => [{ hr: k }, ...cont(n)], trap = (k, n) => [{ ht: k, kind: K }, ...cont(n)];
    const RISE = 'flat';      // (음이 올라가는 구간의 계단이 이 자리를 대신한다: 틀의 rise)
    return [
      ['조용한 도입(첫 박의 한 방 뒤 거의 소리가 없다): 나무 위로 오르는 한 마디짜리 계단 ×2 → 같은 계단의 함정, 새 마디 둘', ['flat', 'flat', ...hill('A', 1, { need: { kind: K } }), ...rep('A', 1), ...trap('A', 1), one(), one(), 'cp']],
      ['벌스 — 돌추: 땅을 쓰는 돌을 멈춰서 넘기 ×2 → 반 박 늦게 되돌아오는 돌(짧게 멈춘다). 느린 돌(짧게 멈춤) ×2 → 덩굴이 짧은 돌(아무것도 안 누른다)', ['vineDuck', 'vineDuck', 'vineShort', 'vineSlow', 'vineSlow', 'vineHigh', one(), 'cp']],
      ['후렴 — 피버 하나(좁은 통로, 튕김판): 판이 있는 마디 ×2 → 판이 없다, 되풀이 → 뚝', [{ zm: 'A', pads: 1, kind: 'pad' }, { zr: 'A' }, { zt: 'A', kind: 'pad' }, { zm: 'B', pads: 1 }, { zr: 'B' }, { zt: 'B', kind: 'break' }, { zm: 'C', pads: 1, kind: 'none' }, 'cp']],
      ['벌스 둘 — 공중의 돌추: 멈춤 → 고리 → 멈춤으로 돌 둘을 넘기 ×2 → 셋째 돌이 되돌아온다(둘째 멈춤을 일찍 놓는다). 한 마디에 돌 둘(낮고 높게) ×2 → 순서가 바뀐다', ['vineChain', 'vineChain', 'vineChainS', 'vineTwin', 'vineTwin', 'vineSwap', one(), 'cp']],
      ['벌스 셋 — 나무 위로: 두 마디짜리 계단(다섯 칸) → 같은 계단의 함정, 그림의 공중 사슬', [...hill('B', 2, { peak: 5, need: { kind: K } }), ...trap('B', 2), 'airStep', 'airRing', one(), 'cp']],
      ['후렴 둘 — 피버 둘(넓은 통로, 튕김판): 판이 있는 마디 ×2 → 판이 없다, 하나 더', ['wUp', { wm: 'E', pads: 1, kind: 'pad', calm: 1, run: 2 }, { wr: 'E' }, { wt: 'E', kind: 'pad' }, { wm: 'F', pads: 1, kind: 'pad', calm: 1, run: 2 }, { wt: 'F', kind: 'pad' }, 'wDn', 'cp']],
      ['브레이크다운(저음만): 울타리 ×2, 음이 올라가는 두 마디는 오르는 계단 → 기둥은 그대로인데 아무것도 안 누른다. 삼단 점프 → 미끼 고리', ['fenceJ', 'fenceJ', RISE, RISE, 'fence', 'ring3', 'ring3Bait', 'cp']],
      ['벌스 넷 — 한 번만 보여 주고 뒤집기: 낮은 돌 → 되돌아오는 돌, 공중의 돌 둘 → 셋째 돌. 같은 멜로디의 오르막은 이번엔 멈춤 길이가 다르다', ['vineDuck', 'vineShort', 'vineChain', 'vineChainS', one(), RISE, RISE, 'cp']],
      ['후렴 셋 — 가장 높은 나무: 네 마디에 걸쳐 여덟 칸까지 오르고 내려온다. 이어서 돌 둘 → 순서가 바뀐다', [...hill('P', 4, { peak: 8 }), 'vineTwin', 'vineSwap', one(), 'cp']],
      ['마지막 — 피버 셋(의견: "피버로, 장애물 없이 좁아지면서 다다다 하며 끝내자"): 좁은 통로(튕김판) → 판이 없다, 하나 더. 끝의 두 마디는 장애물 없이 조여드는 통로(닿는 간격이 한 박에서 1/32박까지 — 다다다다 드르르륵), 심벌이 크게 치는 박(마디 78)에 터져 나와 결승선', [{ zm: 'G', pads: 1, kind: 'pad' }, { zr: 'G' }, { zt: 'G', kind: 'pad' }, { zm: 'H', pads: 1, kind: 'none' }, 'zS1', 'zS2']],
      ['', ['goal', 'flat', 'flat']],
    ];
  },
};

// 15라운드(Orbital Momentum): 우주. 새것은 궤도 고리(oring) — 행성 둘레를 도는 충전 고리를 지나가는 순간에 맞춰 잡는다(orbRing ×2 → 1/4박 늦은 orbLate).
//   붉은 달(궤도를 도는 톱날의 다른 그림), 음이 오르는 29~30 → 69~70(멈춤 길이가 다르다), 별까지 오르는 네 마디 계단. 피버는 셋(16~22, 40~46, 72~78), 마지막은 조여드는 통로.
TEMPLATES.R15 = {
  prefix: 'g15', bpm: 150.0, floatReds: true, vary: true, density: 0.9, fresh: true, freshWindow: 6, cpFill: true, cpLevel: 'a8', holdW: 3, hds: [0.5, 1],
  rise: [{ at: 29, bars: 2, key: 'U', need: { kind: ['hlong', 'hshort'] } }, { at: 69, bars: 2, trap: 'U' }],      // 음이 올라가는 구간(곡에서 잰 자리: 빌드업 29~30, 같은 빌드업 69~70)
  recipe: { g: 'a8', gf: 'a7', traps: 8, from: 0, kinds: { 'short-last': 3, 'long-last': 3, 'hand-last': 2, 'stop-last': 2 }, reps: { 2: 7, 3: 3 }, intro: [], fill: { one: 6, pair: 2, set: 0, rest: 0 } },      // (점수 계산용)
  sections() {
    let key = 0;
    const one = () => ({ m: 'f' + key++, g: 'a8' });
    const phrase = (kind, reps = 2) => { const k = 'p' + key++, ks = [kind, ...['short-last', 'long-last', 'hand-last', 'stop-last'].filter((x) => x !== kind)]; return [{ m: k, g: 'a8', need: ks }, ...Array.from({ length: reps - 1 }, () => ({ r: k })), { t: k, kind: ks }]; };
    const cont = (n) => Array.from({ length: n - 1 }, () => ({ cont: 1 }));
    const hill = (k, n, o = {}) => [{ hill: k, bars: n, ...o }, ...cont(n)];
    const RISE = 'flat';
    return [
      ['도입(첫 박의 한 방 뒤 거의 소리가 없다): 멈춤 함정(같은 마디 두 번 → 마지막 멈춤이 짧다), 새 마디 둘', ['flat', 'flat', ...phrase('short-last'), one(), one(), 'cp']],
      ['조용한 도입 — 궤도 고리를 소개한다: 멈춰서 기다렸다 고리를 잡고 이단 점프 → 높이 멈춤 ×2 → 고리가 1/4박 늦다(더 오래 멈췄다 잡는다). 붉은 달 ×2', ['orbRing', 'orbRing', 'orbLate', 'moonOrbit', 'moonOrbit', one(), one(), 'cp']],
      ['첫 드롭 — 피버 하나(좁은 통로, 튕김판): 판이 있는 마디 ×2 → 판이 없다, 되풀이 → 뚝', [{ zm: 'A', pads: 1, kind: 'pad' }, { zr: 'A' }, { zt: 'A', kind: 'pad' }, { zm: 'B', pads: 1 }, { zr: 'B' }, { zt: 'B', kind: 'break' }, { zm: 'C', pads: 1, kind: 'none' }, 'cp']],
      ['가라앉음과 빌드업: 이단 점프 → 멈춤 ×2 → 덩어리가 길다(오래 멈춘다), 새 마디 둘, 음이 올라가는 두 마디는 오르는 계단', ['djHold', 'djHold', 'djHoldL', one(), one(), RISE, RISE, 'cp']],
      ['후렴 하나 — 별까지: 네 마디에 걸쳐 여덟 칸까지 오르고 내려온다. 이어서 궤도 고리 → 늦은 고리', [...hill('P', 4, { peak: 8 }), 'orbRing', 'orbLate', one(), 'cp']],
      ['저음 그루브 — 피버 둘(넓은 통로, 튕김판): 판이 있는 마디 ×2 → 판이 없다, 하나 더', ['wUp', { wm: 'E', pads: 1, kind: 'pad', calm: 1, run: 2 }, { wr: 'E' }, { wt: 'E', kind: 'pad' }, { wm: 'F', pads: 1, kind: 'pad', calm: 1, run: 2 }, { wt: 'F', kind: 'pad' }, 'wDn', 'cp']],
      ['무음과 조용함: 울타리 ×2 → 기둥은 그대로인데 아무것도 안 누른다. 삼단 점프 → 미끼 고리', ['fenceJ', 'fenceJ', 'fence', 'ring3', 'ring3Bait', one(), one(), 'cp']],
      ['다시 드롭 — 한 번만 보여 주고 뒤집기: 궤도 고리 → 늦은 고리, 붉은 달, 그림의 공중 사슬', ['orbRing', 'orbLate', 'moonOrbit', 'airStep', 'airRing', one(), one(), 'cp']],
      ['빌드업: 멈춤 길이 함정(길다), 새 마디 둘, 같은 멜로디의 오르막은 이번엔 멈춤 길이가 다르다', [...phrase('long-last'), one(), one(), RISE, RISE, 'cp']],
      ['마지막 후렴 — 피버 셋: 좁은 통로(튕김판) → 판이 없다, 되풀이 → 뚝. 끝의 두 마디는 장애물 없이 조여드는 통로, 곡의 한 방(마디 79)에 터져 나와 결승선', [{ zm: 'G', pads: 1, kind: 'pad' }, { zr: 'G' }, { zt: 'G', kind: 'pad' }, { zm: 'H', pads: 1 }, { zt: 'H', kind: 'break' }, 'zS1', 'zS2']],
      ['', ['goal', 'flat', 'flat']],
    ];
  },
};

// 16라운드(Searing Horizon): 사막. 새것은 불기둥(flame) — 낮은 불은 멈춰서(위에 바위 처마), 높은 불은 이단 점프로 넘는다. flameHold ×2 → flameJump, flameJump ×2 → flameHold.
//   모래 언덕 계단, 음이 오르는 12~13 → 37~38(멈춤 길이가 다르다). 피버 셋(첫 드롭, 가장 큰 후렴, 마지막 드롭), 끝은 조용한 아웃트로.
TEMPLATES.R16 = {
  prefix: 'g16', bpm: 152.0, floatReds: true, vary: true, density: 0.9, fresh: true, freshWindow: 6, cpFill: true, cpLevel: 'a8', holdW: 3, hds: [0.5, 1],
  rise: [{ at: 12, bars: 2, key: 'U', need: { kind: ['hlong', 'hshort'] } }, { at: 37, bars: 2, trap: 'U' }],      // 음이 올라가는 구간(곡에서 잰 자리: 벌스 12~13, 빌드업 37~38)
  recipe: { g: 'a8', gf: 'a7', traps: 8, from: 0, kinds: { 'short-last': 3, 'long-last': 3, 'hand-last': 2, 'stop-last': 2 }, reps: { 2: 7, 3: 3 }, intro: [], fill: { one: 6, pair: 2, set: 0, rest: 0 } },      // (점수 계산용)
  sections() {
    let key = 0;
    const one = () => ({ m: 'f' + key++, g: 'a8' });
    const phrase = (kind, reps = 2) => { const k = 'p' + key++, ks = [kind, ...['short-last', 'long-last', 'hand-last', 'stop-last'].filter((x) => x !== kind)]; return [{ m: k, g: 'a8', need: ks }, ...Array.from({ length: reps - 1 }, () => ({ r: k })), { t: k, kind: ks }]; };
    const cont = (n) => Array.from({ length: n - 1 }, () => ({ cont: 1 }));
    const K = ['hlong', 'hshort', 'lidJ', 'swap', 'shift'];
    const hill = (k, n, o = {}) => [{ hill: k, bars: n, ...o }, ...cont(n)], rep = (k, n) => [{ hr: k }, ...cont(n)], trap = (k, n) => [{ ht: k, kind: K }, ...cont(n)];
    const RISE = 'flat';
    return [
      ['도입(킥이 한 마디씩 걸러 나온다): 모래 언덕 한 마디짜리 계단 ×2 → 같은 계단의 함정, 새 마디 둘', ['flat', 'flat', ...hill('A', 1, { need: { kind: K } }), ...rep('A', 1), ...trap('A', 1), one(), one(), 'cp']],
      ['벌스 — 불기둥을 소개한다: 낮은 불을 멈춰서 넘기(위에 바위 처마) ×2 → 높은 불(이단 점프로). 음이 올라가는 12~13마디는 오르는 계단', ['flameHold', 'flameHold', 'flameJump', one(), RISE, RISE, one(), 'cp']],
      ['첫 드롭 — 피버 하나(좁은 통로, 튕김판): 판이 있는 마디 ×2 → 판이 없다, 되풀이 → 뚝', [{ zm: 'A', pads: 1, kind: 'pad' }, { zr: 'A' }, { zt: 'A', kind: 'pad' }, { zm: 'B', pads: 1 }, { zr: 'B' }, { zt: 'B', kind: 'break' }, { zm: 'C', pads: 1, kind: 'none' }, 'cp']],
      ['가라앉음 — 뒤집기를 거꾸로: 높은 불 ×2 → 낮은 불(이번엔 멈춘다). 이단 점프 → 멈춤 → 덩어리가 길다', ['flameJump', 'flameJump', 'flameHold', 'djHold', 'djHoldL', one(), one(), 'cp']],
      ['중간과 빌드업: 멈춤 길이 함정(짧다), 새 마디 둘, 같은 오르막(37~38)은 이번엔 멈춤 길이가 다르다', [...phrase('short-last'), one(), one(), RISE, RISE, 'cp']],
      ['저음 그루브 — 불을 섞어서: 낮은 불 → 높은 불 → 낮은 불, 삼단 점프 → 미끼 고리, 울타리 → 그대로 두기', ['flameHold', 'flameJump', 'flameHold', 'ring3', 'ring3Bait', 'fenceJ', 'fence', 'cp']],
      ['가장 큰 후렴 — 피버 둘(넓은 통로, 튕김판): 판이 있는 마디 ×2 → 판이 없다, 하나 더', ['wUp', { wm: 'E', pads: 1, kind: 'pad', calm: 1, run: 2 }, { wr: 'E' }, { wt: 'E', kind: 'pad' }, { wm: 'F', pads: 1, kind: 'pad', calm: 1, run: 2 }, { wt: 'F', kind: 'pad' }, 'wDn', 'cp']],
      ['저음만 남는 브레이크다운 — 큰 모래 언덕: 네 마디에 걸쳐 여덟 칸까지, 그림의 공중 사슬, 새 마디 하나', [...hill('P', 4, { peak: 8 }), 'airStep', 'airRing', one(), 'cp']],
      ['마지막 드롭 — 피버 셋(좁은 통로): 판이 있는 마디 ×2 → 판이 없다, 되풀이 → 뚝', [{ zm: 'G', pads: 1, kind: 'pad' }, { zr: 'G' }, { zt: 'G', kind: 'pad' }, { zm: 'H', pads: 1 }, { zr: 'H' }, { zt: 'H', kind: 'break' }, { zm: 'I', pads: 1, kind: 'none' }, 'cp']],
      ['아웃트로(고음만 남아 사그라든다): 낮은 불 → 높은 불, 새 마디 다섯. 곡이 사그라드는 마디 79에 결승선', ['flameHold', 'flameJump', one(), one(), one(), one(), one()]],
      ['', ['goal', 'flat', 'flat']],
    ];
  },
};

// ---- 바운스 한 번(공이 땅에서 튀는 순간 τ부터)에 넣을 수 있는 동작. 시각은 모두 1/8박 눈금
//  H 꼭대기 언저리에서 멈춤 / D 이단 점프 / DH 이단 점프 뒤 그 꼭대기에서 멈춤 / HD 멈췄다가 놓자마자 이단 점프
const LEVELS = {
  0: { plain: 0.45, H: 0.3, D: 0.25, DH: 0, HD: 0, hs: [0.5], hd: [0.75, 0.875], dt: [0.5], one: true },                       // 아주 쉬움: 한 마디에 한 번쯤, 늘 꼭대기에서
  1: { plain: 0.25, H: 0.4, D: 0.35, DH: 0, HD: 0, hs: [0.5], hd: [0.625, 0.75, 0.875], dt: [0.5], one: true },
  2: { plain: 0.16, H: 0.32, D: 0.3, DH: 0.22, HD: 0, hs: [0.375, 0.5, 0.625], hd: [0.5, 0.625, 0.75, 0.875, 1.0], dt: [0.375, 0.5, 0.625], dhd: [0.5, 0.75, 0.875] },
  '1t': { plain: 0.45, H: 0, D: 0, DH: 0, HD: 0, T: 0.55, hs: [0.5], hd: [0.75], dt: [0.5], one: true },      // 높은 박스만 나오는 쉬운 마디(처음 보여 줄 때)
  // 2t: 2단계에 높은 박스를 섞은 것(조건으로 채우는 라운드용. 앞의 단계들은 그대로 둬서 이미 뽑은 라운드가 달라지지 않게 한다)
  '2t': { plain: 0.14, H: 0.28, D: 0.2, DH: 0.2, HD: 0, T: 0.18, hs: [0.375, 0.5, 0.625], hd: [0.5, 0.625, 0.75, 0.875, 1.0], dt: [0.375, 0.5, 0.625], dhd: [0.5, 0.75, 0.875] },
  // 4d: 촘촘한 단계(밀도 95%용). 튈 때마다 거의 늘 동작이 있고, 세 박짜리 동작(DH)은 한 박짜리 빈틈을 남기므로 드물게만
  '4d': { plain: 0.03, H: 0.34, D: 0.24, DH: 0.05, HD: 0, T: 0.34, hs: [0.375, 0.5, 0.625], hd: [0.5, 0.625, 0.75, 0.875, 1.0], dt: [0.375, 0.5, 0.625], dhd: [0.5, 0.75, 0.875] },
  // 4v: 4d에 높이 장치를 섞은 것. FD 떠 있는 박스에 올라타 떨어지기 / CH 파란 천장 밑 멈춤 / CL 낮은 천장 밑에서 낮게 떠서 건너기
  '4v': { plain: 0.03, H: 0.2, D: 0.13, DH: 0.04, HD: 0, T: 0.14, FD: 0.2, CH: 0.13, CL: 0.13, hs: [0.375, 0.5, 0.625], hd: [0.5, 0.625, 0.75, 0.875, 1.0], dt: [0.375, 0.5, 0.625], dhd: [0.5, 0.75, 0.875] },
  // 7v: 4v에서 낮은 천장(CL)을 줄인 것. 낮은 천장 마디는 멈춤을 일찍(1/4박에) 시작해야 해서 여유가 좁다 — 되풀이하는 마디에 자주 나오면 타이밍 싸움이 된다
  '7v': { plain: 0.03, H: 0.22, D: 0.15, DH: 0.04, HD: 0, T: 0.15, FD: 0.22, CH: 0.15, CL: 0.04, hs: [0.375, 0.5, 0.625], hd: [0.5, 0.625, 0.75, 0.875, 1.0], dt: [0.375, 0.5, 0.625], dhd: [0.5, 0.75, 0.875] },
  // ---- 공중 단계(멈춤의 라운드부터): 땅에서 그냥 튀는 시간보다 공중에서 멈추는 시간을 늘린다. 라운드마다 조금씩 많아진다
  //   ch1 = 사슬의 첫 멈춤 길이, ch2 = 고리 뒤 멈춤 길이(충전 고리가 멈춤을 다시 채운다). 멈춤은 길게(hd 0.75~1박)
  a2: { plain: 0.06, H: 0.4, D: 0.14, DH: 0.12, T: 0.06, HDH: 0.14, HRH: 0.08, hs: [0.5], hd: [0.625, 0.75, 0.875, 1.0], dt: [0.375, 0.5, 0.625], dhd: [0.5, 0.75], ch1: [0.5], ch2: [0.5, 0.75] },
  a3: { plain: 0.04, H: 0.34, D: 0.1, DH: 0.12, T: 0.06, HDH: 0.14, HRH: 0.14, DHRH: 0.06, hs: [0.5], hd: [0.75, 0.875, 1.0], dt: [0.375, 0.5, 0.625], dhd: [0.5, 0.75, 0.875], ch1: [0.5, 0.625], ch2: [0.5, 0.75] },
  a4: { plain: 0.02, H: 0.34, D: 0.03, DH: 0.1, T: 0.04, FD: 0.04, CH: 0.05, HDH: 0.12, HRH: 0.16, DHRH: 0.1, hs: [0.5], hd: [0.75, 0.875, 1.0], dt: [0.375, 0.5, 0.625], dhd: [0.5, 0.75, 0.875], ch1: [0.5, 0.625, 0.75], ch2: [0.5, 0.75, 1.0] },
  a5: { plain: 0.02, H: 0.26, D: 0.04, DH: 0.08, T: 0.05, FD: 0.05, CH: 0.04, HDH: 0.12, HRH: 0.18, DHRH: 0.16, hs: [0.5], hd: [0.75, 0.875, 1.0], dt: [0.375, 0.5, 0.625], dhd: [0.5, 0.75, 0.875], ch1: [0.5, 0.625, 0.75], ch2: [0.5, 0.75, 1.0] },
  a6: { plain: 0.02, H: 0.32, D: 0.02, DH: 0.06, T: 0.03, FD: 0.04, CH: 0.03, HDH: 0.1, HRH: 0.2, DHRH: 0.18, hs: [0.5], hd: [0.75, 0.875, 1.0], dt: [0.375, 0.5, 0.625], dhd: [0.5, 0.75, 0.875], ch1: [0.5, 0.625, 0.75], ch2: [0.5, 0.75, 1.0] },
  a7: { plain: 0.02, H: 0.32, D: 0.02, DH: 0.06, T: 0.03, FD: 0.04, CH: 0.03, CL: 0.01, HDH: 0.09, HRH: 0.2, DHRH: 0.18, hs: [0.5], hd: [0.75, 0.875, 1.0], dt: [0.375, 0.5, 0.625], dhd: [0.5, 0.75, 0.875], ch1: [0.5, 0.625, 0.75], ch2: [0.5, 0.75, 1.0] },
  // a8(14라운드부터): 쉬운 박을 더 줄이고 공중 사슬과 "이단 점프 → 멈춤"을 늘린다. 마디당 입력이 a7보다 많다(판정 폭 ±0.15박은 그대로)
  a8: { plain: 0, H: 0.2, D: 0.02, DH: 0.14, T: 0.03, FD: 0.03, CH: 0.03, CL: 0.01, HDH: 0.12, HRH: 0.2, DHRH: 0.22, hs: [0.5], hd: [0.75, 0.875, 1.0], dt: [0.375, 0.5, 0.625], dhd: [0.5, 0.75, 0.875], ch1: [0.5, 0.625, 0.75], ch2: [0.5, 0.75, 1.0] },
  3: { plain: 0.1, H: 0.28, D: 0.28, DH: 0.2, HD: 0.14, hs: [0.375, 0.5, 0.625], hd: [0.5, 0.625, 0.75, 0.875, 1.0], dt: [0.375, 0.5, 0.625, 0.75], dhd: [0.5, 0.75, 0.875], hdd: [0.375, 0.5, 0.625] },
  // 어려움: 쉬는 박이 거의 없고, 엮인 동작이 많고, 통로가 좁다(tol = 장애물을 만들 때 봐주는 타이밍 오차. 작을수록 빡빡하다)
  4: { plain: 0.05, H: 0.22, D: 0.25, DH: 0.26, HD: 0.22, hs: [0.25, 0.375, 0.5, 0.625, 0.75], hd: [0.375, 0.5, 0.625, 0.75, 0.875, 1.0], dt: [0.25, 0.375, 0.5, 0.625, 0.75], dhd: [0.375, 0.5, 0.75, 0.875], hdd: [0.25, 0.375, 0.5, 0.625], tol: 0.13 },
};

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function generate(T, seed) {
  const rng = mulberry(seed), pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const made = {};                                     // 이번에 만든 패턴: 이름 → 정의
  const bars = [], notes = {};
  const isPat = (n) => Lg.PATTERNS[n] && Lg.PATTERNS[n].mode !== 'rush';
  const ctxOf = (cand) => {                            // 이 마디를 시험할 짧은 코스: 앞의 네 마디(패턴이면) + 이 마디 + 평지. (징검다리처럼 앞 마디에서 이어지는 마디가 있어서 넉넉히 붙인다)
    let n0 = Math.max(0, bars.length - 4);
    while (n0 > 0 && isPat(bars[n0]) && Lg.PATTERNS[bars[n0]].lead && bars.length - n0 < 8) n0--;      // 앞 마디에서 이어져야 하는 마디(징검다리의 둘째·셋째 마디)에서 끊지 않는다
    const prev = bars.slice(n0).map((n) => (isPat(n) ? n : 'flat'));
    while (prev.length < 4) prev.unshift('flat');
    return { bars: ['flat', ...prev, cand, 'flat', 'flat', 'goal'], at: prev.length + 1 };
  };
  const build = (ctx) => Lg.buildLevel({ name: 't', bpm: T.bpm, bars: ctx.bars, floatReds: !!T.floatReds, vary: !!T.vary, sections: [{ bar: 0, id: 'a' }] });
  const run = (L, plan, until, from = 0) => {      // from = 높이를 재기 시작하는 스텝(앞 마디가 떠 있는 박스에서 높이 뛴 것은 세지 않는다)
    const inp = Lg.planInput(plan), s = Lg.spawnState(L, -1), bounces = [];
    let maxH = 0;
    while (!s.dead && !s.won && s.step < until) { const ev = []; Lg.stepState(L, s, inp.press.has(s.step + 1), ev, inp.hold.has(s.step + 1)); if (s.step >= from) maxH = Math.max(maxH, 9 - s.y); if (ev.some((e) => e.type === 'bounce')) bounces.push(s.step); }
    return { s, bounces, maxH };
  };
  // 통과 조건: 패턴대로 가면 지나가고, 걷어 낸 장애물이 없고, 입력을 하나라도 빼면 죽고, 입력마다 0.15박(약 58ms) 일찍·늦게 눌러도 지나간다
  const validate = (name, habit) => {
    const ctx = ctxOf(name), L = build(ctx), lo = ctx.at * BAR, end = (ctx.at + 2) * BAR;
    const slack = Lg.PATTERNS[name].tol >= 0.17 ? 14 : 10;      // 일찍·늦게 눌러 보는 폭(스텝): 보통은 0.15박(약 58ms), 빡빡한 단계는 0.1박(약 41ms)
    if (L.fixed.length) return null;
    const ref = run(L, L.ref, end, lo);
    if (ref.s.dead || ref.maxH > 5.7) return null;
    const mine = (st) => st >= lo && st < lo + BAR;
    const P = L.ref.presses, H = L.ref.holds;
    for (let i = 0; i < P.length; i++) if (mine(P[i])) {
      if (!run(L, { presses: P.filter((_, j) => j !== i), holds: H }, end).s.dead) return null;
      for (const d of [-slack, slack]) if (run(L, { presses: P.map((v, j) => (j === i ? v + d : v)), holds: H }, end).s.dead) return null;
    }
    for (let i = 0; i < H.length; i++) if (mine(H[i][0])) {
      if (!run(L, { presses: P, holds: H.filter((_, j) => j !== i) }, end).s.dead) return null;
      for (const d of [-slack, slack]) for (const e of [0, 1]) if (run(L, { presses: P, holds: H.map((v, j) => (j === i ? (e ? [v[0], v[1] + d] : [v[0] + d, v[1]]) : v)) }, end).s.dead) return null;
    }
    if (habit) {                                       // 함정: 앞 마디의 입력을 그대로 누르면 이 마디 안에서 죽어야 한다
      const plan = { presses: [...P.filter((v) => !mine(v)), ...habit.presses.map((t) => lo + Math.round(t * SUB))], holds: [...H.filter((v) => !mine(v[0])), ...habit.holds.map(([a, z]) => [lo + Math.round(a * SUB), lo + Math.round(z * SUB)])] };
      const r = run(L, plan, lo + BAR + SUB);
      if (!r.s.dead || r.s.x < ctx.at * 16 || r.s.x >= ctx.at * 16 + 16.5) return null;
    }
    return { clean: ref.bounces.includes(lo + BAR), startClean: ref.bounces.includes(lo) };
  };
  const randomBar = (name, lv) => {                    // 공이 튀는 순간마다 동작을 하나씩 뽑는다(앞의 선택에 따라 다음에 튀는 순간이 달라지므로 달려 보면서 정한다)
    const cfg = LEVELS[lv], def = { holds: [], presses: [], tol: cfg.tol || 0.18 };
    Lg.PATTERNS[name] = def;
    const decided = new Set(), ctx = ctxOf(name), lo = ctx.at * BAR;
    for (let guard = 0; guard < 8; guard++) {
      const L = build(ctx), ref = run(L, L.ref, lo + BAR);
      if (ref.s.dead) return null;
      const taus = ref.bounces.filter((st) => st >= lo && st < lo + BAR).map((st) => (st - lo) / SUB).filter((t) => !decided.has(t));
      if (!taus.length) break;
      const tau = taus[0]; decided.add(tau);
      let r = rng(), kind = 'plain';
      for (const k of ['plain', 'H', 'D', 'DH', 'HD', 'T', 'FD', 'CH', 'CL', 'HDH', 'HRH', 'DHRH']) { if (r < (cfg[k] || 0)) { kind = k; break; } r -= cfg[k] || 0; }
      const tb = Math.round(tau * 8) / 8;               // 높이 장치는 칸에 맞춰 놓는다(떠 있는 박스에서 떨어진 뒤에는 한 틱 늦게 튀므로 반올림)
      if ((kind === 'FD' && tb > 2.75) || ((kind === 'CH' || kind === 'CL') && tb > 2) || (kind === 'CL' && def.tall) || ((kind === 'FD' || kind === 'CH' || kind === 'CL') && tb !== Math.round(tb))) kind = 'D';
      if (kind === 'FD' || kind === 'CH' || kind === 'CL') (def.__dev = def.__dev || []).push({ kind, tb, t: kind === 'CL' ? tb + 0.25 : tb + 0.5 });      // 이 입력에 높이 장치가 달렸다(함정으로 바꿀 때 건드리지 않는다)
      if (kind === 'FD') { def.presses.push(tb + 0.5); (def.floats = def.floats || []).push([4 * tb + 4, 4 * tb + 4, 4]); (def.traps = def.traps || []).push({ presses: [tb + 1.125] }); continue; }
      if (kind === 'CH') { def.holds.push([tb + 0.5, tb + 1.25]); (def.caps = def.caps || []).push([4 * tb + 1, 4 * tb + 7, 3]); (def.__ch = def.__ch || []).push(tb + 0.5); continue; }
      if (kind === 'CL') { def.holds.push([tb + 0.25, tb + 1.25]); (def.caps = def.caps || []).push([4 * tb + 1, 4 * tb + 6, 2]); (def.lava = def.lava || []).push([4 * tb + 2, 4 * tb + 4]); def.tol = Math.min(def.tol, 0.15); continue; }
      if (kind === 'H') { const s = tau + pick(cfg.hs), d = pick(cfg.hd); if (s + d <= 4) def.holds.push([q8(s), q8(s + d)]); }
      else if (kind === 'D') { const t = tau + pick(cfg.dt); if (t < 4) def.presses.push(q8(t)); }
      else if (kind === 'DH') { const t = tau + 0.5, d = pick(cfg.dhd); if (t + 0.5 + d <= 4) { def.presses.push(q8(t)); def.holds.push([q8(t + 0.5), q8(t + 0.5 + d)]); } }
      else if (kind === 'T') { const t = tau + 0.5; if (t < 4) { def.presses.push(q8(t)); (def.tall = def.tall || []).push(q8(t)); } }      // 높은 박스: 꼭대기에서 이단 점프해야만 넘는다(멈춤으로는 못 넘는다)
      else if (kind === 'HD') { const d = pick(cfg.hdd), t = tau + 0.5 + d + 0.125; if (t < 4) { def.holds.push([tau + 0.5, q8(tau + 0.5 + d)]); def.presses.push(q8(t)); } }
      // ---- 공중 사슬(2라운드부터 조금씩, 뒤로 갈수록 많이): 땅에 내려오지 않고 멈춤 → 점프 → 멈춤. 멈춤은 늘 꼭대기에서 시작한다(높이가 타이밍에 덜 흔들린다)
      //   HDH   꼭대기에서 멈춤 → 놓고 곧 이단 점프 → 새 꼭대기에서 또 멈춤(두 멈춤을 합해 1박 안)
      //   HRH   HDH와 같은데, 이단 점프 자리에 충전 고리가 있어 멈춤이 다시 1박 채워진다(둘째 멈춤이 길다)
      //   DHRH  이단 점프로 높이 올라 멈춤 → 충전 고리에서 한 번 더 점프 → 더 높은 꼭대기에서 멈춤(그림의 "고리로 다시 오르며 멈춤")
      else if (kind === 'HDH' || kind === 'HRH' || kind === 'DHRH') {
        const dj = kind === 'DHRH', t1 = tau + (dj ? 1.0 : 0.5), d1 = pick(cfg.ch1 || [0.5]), g = pick([0.125, 0.25]), p = q8(t1 + d1 + g);
        const d2 = pick(kind === 'HDH' ? [Math.min(0.5, 1 - d1)] : cfg.ch2 || [0.5, 0.75]), t2 = q8(p + 0.5), fall = dj ? 0.95 : 0.75;
        if (t2 + d2 + fall <= 3.95 && t2 + d2 + fall >= 3.05 && d1 + (kind === 'HDH' ? d2 : 0) <= 1) {      // (마디의 끝 박 직전에 내려와야 한다: 일찍 내려오면 마지막 박이 빈다)
          if (dj) def.presses.push(q8(tau + 0.5));
          def.holds.push([q8(t1), q8(t1 + d1)]); def.presses.push(p); def.holds.push([t2, q8(t2 + d2)]);
          if (kind !== 'HDH') (def.__rings = def.__rings || []).push(p);
        } else if (tau + 1.25 <= 3.25) def.holds.push([q8(tau + 0.5), q8(tau + 0.5 + Math.min(1, d1 + 0.25))]);      // (자리가 맞지 않으면 꼭대기에서 긴 멈춤 하나)
      }
    }
    // 충전 고리를 그 점프 자리에 놓는다: 패턴대로 달려 누르는 순간의 공의 자리를 재고, ±0.1박 일찍·늦게 눌러도 고리에 닿게 세로로 길게(2~3칸)
    if (def.__rings) {
      const L = build(ctx), inp = Lg.planInput(L.ref), s = Lg.spawnState(L, -1), at = new Map();
      const want = new Set(def.__rings.map((p) => lo + Math.round(p * SUB) - 1));
      while (!s.dead && !s.won && s.step < lo + BAR) { Lg.stepState(L, s, inp.press.has(s.step + 1), null, inp.hold.has(s.step + 1)); if (want.has(s.step)) at.set(s.step, { x: s.x - ctx.at * 16, h: 9 - s.y }); }
      def.rings = [];
      for (const [, q] of at) { const c = Math.round(q.x - 0.5); for (let r = Math.max(0, Math.floor(q.h - 1.1)); r <= Math.floor(q.h + 0.5); r++) def.rings.push([c, r]); }
      if (at.size !== def.__rings.length) return null;
      def.chain = def.__rings.length;
      delete def.__rings;
    }
    // 파란 천장 밑에서 버릇대로 이단 점프하면(멈춤 대신) 죽어야 한다: 그 멈춤을 누르기로 바꾼 달리기를 함정으로 적는다
    for (const t of def.__ch || []) (def.traps = def.traps || []).push({ presses: [t], holds: def.holds.filter((h) => h[0] !== t) });
    delete def.__ch;
    { const hs = def.holds.slice().sort((u, v) => u[0] - v[0]);      // 멈춤이 겹치거나 멈춤 사이에 누름이 끼면 버린다(앞의 동작이 뜻대로 안 됐을 때 생긴다)
      for (let i = 1; i < hs.length; i++) if (hs[i][0] < hs[i - 1][1] + 0.125) return null;
      if (def.presses.some((t) => hs.some((h) => t > h[0] && t < h[1]))) return null; }
    const n = def.holds.length + def.presses.length;
    return n >= 2 || (n === 1 && (cfg.one || rng() < 0.15)) ? def : null;      // 2단계부터는 대개 한 마디에 두 번 이상 누른다
  };
  const inputsOf = (def) => [...def.presses.map((t) => ({ t, k: 'R', tall: !!(def.tall && def.tall.includes(t)) })), ...def.holds.map(([a, z]) => ({ t: a, z, k: 'L' }))].sort((u, v) => u.t - v.t);
  const trapOf = (A) => {                              // 함정으로 바꾸기: 마지막 입력을 빼거나(뚝), 마지막 입력의 손을 바꾼다
    const ins = inputsOf(A), last = ins[ins.length - 1], rest = ins.slice(0, -1);
    const base = { holds: rest.filter((i) => i.k === 'L').map((i) => [i.t, i.z]), presses: rest.filter((i) => i.k === 'R').map((i) => i.t), tol: A.tol , ...(A.rings ? { rings: A.rings, chain: A.chain } : {}) };
    const habit = { presses: A.presses.slice(), holds: A.holds.map((h) => h.slice()) };
    const out = [];
    if (rest.length) out.push({ ...base, traps: [{ full: habit }], how: 'stop' });
    if (last.k === 'R' && last.t + 0.75 <= 4) out.push({ ...base, holds: [...base.holds, [last.t, q8(last.t + 0.75)]], traps: [{ full: habit }], how: 'toL' });
    if (last.k === 'L') out.push({ ...base, presses: [...base.presses, last.t], traps: [{ full: habit }], how: 'toR' });
    // 멈춤 길이의 함정: 마지막 멈춤이 1/4~3/8박 짧거나 길다(앞의 두 마디와 똑같이 가다가 놓는 순간만 다르다)
    if (last.k === 'L') for (const dd of [-0.375, -0.25, 0.25, 0.375]) {
      const z = q8(last.z + dd), used = A.holds.reduce((u, h) => u + h[1] - h[0], 0);
      if (z - last.t < 0.25 || z > 3.75 || (dd > 0 && used + dd > 1 && !A.chain)) continue;
      out.push({ ...base, holds: [...base.holds, [last.t, z]], traps: [{ full: habit }], how: dd > 0 ? 'long' : 'short' });
    }
    return out;
  };

  // ---- 피버: 가능한 글자 줄을 모두 구해 두고 거기서 뽑는다
  const walk = (str, top, start) => { let zl = start, zin = start === 0 ? -1 : 1; const path = [zl];
    for (let k = 0; k < 8; k++) { const c = k ? str[k - 1] : '.', surf = zl <= 0 || zl >= top; if (surf && c !== '.') return null; const nat = zl <= 0 ? 1 : zl >= top ? -1 : zin, dir = c === 'F' || c === 'B' ? -nat : nat; zl += dir; zin = dir; path.push(zl); }
    return str[7] === '.' && zl === start ? path : null; };
  const allStr = (top, start, abc = 'FS.') => { const out = []; const rec = (pre) => { if (pre.length === 8) { if (walk(pre, top, start)) out.push(pre); return; } for (const c of abc) rec(pre + c); }; rec(''); return out; };
  const count = (s, c) => s.split(c).length - 1;
  const zAll = allStr(2, 0).filter((s) => count(s, 'F') >= 2 && count(s, '.') <= 5), wAll = allStr(4, 4).filter((s) => count(s, 'F') >= 2 && count(s, 'F') + count(s, 'S') >= 4);
  const feverOk = {};
  // 앞 라운드의 피버 문제를 다시 내지 않는다(T.fresh): 넓은 통로(가능한 줄 100가지)는 앞의 어느 라운드에서든 나온 줄을 쓰지 않는다.
  // 좁은 통로는 가능한 줄이 19가지뿐이라(5라운드까지 18가지가 이미 나왔다) 줄 자체는 다시 나올 수밖에 없다. 대신 어느 라운드에서든 나온 "앞 마디 → 다음 마디" 짝(되풀이 → 함정)을 다시 쓰지 않고,
  // 되풀이할 마디는 되도록 바로 앞 라운드에 안 나온 줄에서 고른다. 이 라운드 안에서도 같은 줄을 두 군데에 쓰지 않는다.
  const myNo = +String(T.prefix).replace(/\D/g, ''), usedW = new Set(), usedZ = new Set(), usedPairs = new Set(), usedHere = new Set();
  if (T.fresh) Lg.COURSES.forEach((C) => {
    const no = +(/ROUND (\d+)/.exec(C.name) || [])[1];
    if (!(no < myNo) && !(T.freshWideAll && no > myNo)) return;      // (freshWideAll: 뒤 라운드의 넓은 통로 줄도 피한다 — 앞 라운드를 나중에 고칠 때 뒤 라운드와 겹치지 않게)
    if (T.freshWindow && no < myNo - T.freshWindow) return;      // (freshWindow: 바로 앞 몇 라운드와만 겹치지 않게. 15라운드부터 — 14라운드를 지나며 처음 나오는 줄이 바닥났다. 피버는 연출이 바뀌어 같은 줄이 오래 뒤에 다시 나와도 같아 보이지 않는다)
    let prev = null;
    C.bars.forEach((n) => {
      const p = Lg.PATTERNS[n];
      if (!p || p.mode !== 'rush' || p.free || !p.nodes) { prev = null; return; }
      if (p.wide) usedW.add(p.nodes); else if (no === myNo - 1) usedZ.add(p.nodes);
      if (no > myNo) { prev = null; return; }      // (뒤 라운드는 넓은 통로 줄만 본다)
      if (prev && !!prev.wide === !!p.wide && prev.nodes !== p.nodes) usedPairs.add((p.wide ? 'w' : 'z') + prev.nodes + '>' + p.nodes);
      prev = p;
    });
  });
  const stale = (s, wide) => !!T.fresh && ((wide && usedW.has(s)) || usedHere.has((wide ? 'w' : 'z') + s));
  const worn = (s, wide) => !!T.fresh && !wide && usedZ.has(s);      // 바로 앞 라운드에 나온 좁은 통로의 줄(되도록 피한다)
  const stalePair = (a, s, wide) => !!T.fresh && usedPairs.has((wide ? 'w' : 'z') + a + '>' + s);
  const took = (s, wide) => usedHere.add((wide ? 'w' : 'z') + s);
  // 튕김판(B)이 있는 줄: 필요할 때만 구한다. 판은 한 마디에 한두 개, 누르는 자리는 둘 이상
  let zPad = null, wPad = null;
  const padPool = (wide) => (wide ? (wPad = wPad || allStr(4, 4, 'FSB.').filter((s) => count(s, 'B') >= 1 && count(s, 'B') <= 2 && count(s, 'F') >= 2 && count(s, 'F') + count(s, 'S') + count(s, 'B') >= 4)) : (zPad = zPad || allStr(2, 0, 'FSB.').filter((s) => count(s, 'B') >= 1 && count(s, 'F') >= 2)));
  const padTraps = (M, wide, lim) => { const out = []; for (let i = 2; i < 7; i++) if (M[i] === 'B') { const q = M.slice(0, i) + 'F' + M.slice(i + 1); if (fits(q, lim) && !stale(q, wide) && !stalePair(M, q, wide) && feverTry(q, wide)) out.push(q); } return out; };      // 판 하나를 없애고 그 자리를 "눌러야 하는 자리"로
  const feverDef = (nodes, wide) => { const d = { mode: 'rush', nodes }; if (wide) d.wide = true; if (/[FSB][FSB]/.test(nodes)) d.gap = 1.5; d.holds = []; d.presses = []; for (let k = 1; k <= 8; k++) if (nodes[k - 1] === 'F') d.presses.push(k * 0.5); return d; };
  const feverTry = (nodes, wide) => {            // 입력 여유가 0.16박(약 62ms) 이상이고, 입력이 모두 꼭 필요한가
    const key = (wide ? 'w' : 'z') + nodes;
    if (key in feverOk) return feverOk[key];
    Lg.PATTERNS.__f = feverDef(nodes, wide);
    let m = null; try { m = measure('__f', T.bpm); } catch (e) { m = null; }
    delete Lg.PATTERNS.__f;
    return (feverOk[key] = !!(m && m.ok && m.min >= 60 && m.idleDies && m.needed.every(Boolean)));
  };

  // ---- 짜임을 정해 주는 자리(구간 모음용): { m: 'A', g } 새 마디(되풀이할 수 있는 것) / { r: 'A' } 그 마디 한 번 더 / { t: 'A', kind } 그 마디의 함정
  //   kind: stop-last 마지막 입력을 뺀다 / stop-first 첫 입력을 뺀다 / hand-last 마지막 입력의 손을 바꾼다 / hand-first 첫 입력의 손을 바꾼다
  //         add 되풀이하던 것보다 하나 더 눌러야 한다({ m, add: true }로 뽑은 마디에만)
  //   { r: 'A', blind: true } 그 마디를 안내(수정·누르는 표시) 없이 한 번 더
  //   피버는 { zm } / { zr } / { zt } (넓은 통로는 wm / wr / wt): 함정은 "앞쪽은 같고 누르던 자리에서 끊기는" 줄
  const motifs = {}, trapList = [], roles = {};
  const same = (u, v) => JSON.stringify([u.holds, u.presses]) === JSON.stringify([v.holds, v.presses]);
  const toDef = (list, tol) => { const d = { holds: list.filter((i) => i.k === 'L').map((i) => [i.t, i.z]), presses: list.filter((i) => i.k === 'R').map((i) => i.t), tol }, tall = list.filter((i) => i.k === 'R' && i.tall).map((i) => i.t); if (tall.length) d.tall = tall; return d; };
  // 높이 장치(떠 있는 박스, 파란 천장)가 있는 마디도 함정으로 바꿀 수 있다: 장치가 달린 입력은 건드리지 않고, 장치와 그 장치의 함정을 그대로 가져간다
  const carry = (A, d) => {
    for (const k of ['floats', 'caps', 'lava', 'rings']) if (A[k]) d[k] = JSON.parse(JSON.stringify(A[k]));
    if (A.chain) d.chain = A.chain;
    if (A.__dev) { d.__dev = A.__dev; for (const v of A.__dev) d.traps.push(v.kind === 'FD' ? { presses: [v.tb + 1.125] } : v.kind === 'CH' ? { presses: [v.t], holds: d.holds.filter((h) => h[0] !== v.t) } : null); d.traps = d.traps.filter(Boolean); }
    return d;
  };
  const variant = (A, kind) => {
    const ins = inputsOf(A), habit = { presses: A.presses.slice(), holds: A.holds.map((h) => h.slice()) };
    const devT = new Set((A.__dev || []).map((v) => v.t)), free = (i) => !devT.has(i.t);
    const sw = (i) => (i.k === 'R' ? (i.t + 0.75 <= 4 ? { t: i.t, z: q8(i.t + 0.75), k: 'L' } : null) : { t: i.t, k: 'R', tall: true });      // 왼쪽 → 오른쪽: 그 자리에 높은 박스를 세운다(버릇대로 멈추면 못 넘는다)
    let list = null;
    if (kind === 'stop-last' && free(ins[ins.length - 1])) list = ins.slice(0, -1);
    else if (kind === 'stop-first' && ins.length >= 2 && free(ins[0])) list = ins.slice(1);
    else if (kind === 'hand-last' && free(ins[ins.length - 1])) { const x = sw(ins[ins.length - 1]); if (x) list = [...ins.slice(0, -1), x]; }
    else if (kind === 'hand-first' && ins.length >= 2 && free(ins[0])) { const x = sw(ins[0]); if (x) list = [x, ...ins.slice(1)]; }
    // 멈춤 길이의 함정(2라운드부터): 되풀이하던 마디와 똑같이 가다가, 마지막(또는 첫) 멈춤만 길이가 다르다. 버릇대로 놓으면(또는 계속 누르면) 걸린다
    //   long  멈춤이 1/4~3/8박 길다(버릇대로 일찍 놓으면 떨어진다) / short 1/4~3/8박 짧다(버릇대로 계속 누르면 앞의 덩어리에 걸린다)
    else if (/^(long|short)-(last|first)/.test(kind)) {
      const hs = ins.filter((i) => i.k === 'L' && free(i)), h = kind.endsWith('last') ? hs[hs.length - 1] : hs[0];
      if (h) {
        const k = ins.indexOf(h), nxt = ins[k + 1], used = ins.filter((i) => i.k === 'L').reduce((u, i) => u + i.z - i.t, 0);
        for (const dd of [+(kind.split(':')[1] || 0.25)]) {
          const z = q8(kind.startsWith('long') ? h.z + dd : h.z - dd);
          if (z - h.t < 0.25 || z > 3.75 || (nxt && z > nxt.t - 0.125) || (kind.startsWith('long') && used + dd > 1 && !A.chain)) continue;
          list = ins.map((i) => (i === h ? { ...i, z } : i)); break;
        }
      }
    }
    return list && list.length ? carry(A, { ...toDef(list, A.tol), traps: [{ full: habit }] }) : null;
  };
  const spread = (kinds) => kinds.flatMap((k) => (/^(long|short)-/.test(k) && !k.includes(':') ? [k + ':0.25', k + ':0.375'] : [k]));      // 멈춤 길이 함정은 길이 차이 둘(1/4, 3/8박)을 차례로 해 본다
  const phraseSlot = (slot, b) => {
    const name = `${T.prefix}_${b}`;
    if (slot.m) {
      for (let tries = 0; tries < 120; tries++) {
        const def = randomBar(name, slot.g);
        if (!def) continue;
        let v = validate(name);
        if (!v || !v.clean || !v.startClean) continue;
        if (Object.values(motifs).some((mm) => mm.def && (same(mm.def, def) || (mm.full && same(mm.full, def))))) continue;
        { const ins0 = inputsOf(def); if ((slot.last && ins0[ins0.length - 1].k !== slot.last) || (slot.first && ins0[0].k !== slot.first)) continue; }
        if (slot.need) {                               // 이 마디를 두 번 한 뒤에 놓을 함정이 성립하는 것만 받는다(안 그러면 함정 자리에서 통째로 실패한다)
          const tn = `${T.prefix}_${b + 2}`; bars.push(name, name);
          const groups = Array.isArray(slot.need[0]) ? slot.need : [slot.need];      // 함정을 둘 낼 마디는 묶음 둘: 묶음마다 하나씩은 성립해야 한다
          const okT = groups.every((g) => spread(g).some((kind) => { const d = variant(def, kind); if (!d) return false; Lg.PATTERNS[tn] = d; const v2 = validate(tn, d.traps[0].full); delete Lg.PATTERNS[tn]; return !!(v2 && v2.clean); }));
          bars.length -= 2;
          if (!okT) continue;
        }
        if (slot.add) {                                // 되풀이할 것은 "마지막 입력을 뺀 것", 함정 자리에는 온전한 것을 놓는다
          const ins = inputsOf(def);
          if (ins.length < 2) continue;
          const red = toDef(ins.slice(0, -1), def.tol);
          Lg.PATTERNS[name] = red; v = validate(name);
          if (!v || !v.clean || !v.startClean) continue;
          made[name] = red; bars.push(name); motifs[slot.m] = { name, def: red, full: def }; roles[b] = slot.m; return;
        }
        made[name] = def; bars.push(name); motifs[slot.m] = { name, def }; roles[b] = slot.m; return;
      }
      delete Lg.PATTERNS[name]; throw new Error('되풀이할 마디를 못 뽑았다(마디 ' + b + ')');
    }
    if ((slot.r || slot.t) && (riseCut.has(slot.r || slot.t) || !motifs[slot.r || slot.t])) return phraseSlot({ m: (slot.r || slot.t) + '#' + b, g: T.recipe ? T.recipe.gf || T.recipe.g : 'a5' }, b);      // (짜임의 앞마디가 올라가는 계단으로 바뀌었다: 함정 없이 새 마디 하나로)
    if (slot.r && slot.blind) {                        // 안내 없이 한 번 더: 같은 입력이지만 길잡이(수정·누르는 표시)가 없다
      const def = { ...JSON.parse(JSON.stringify(motifs[slot.r].def)), blind: true };
      Lg.PATTERNS[name] = def; made[name] = def; bars.push(name); trapList.push({ bar: b, kind: 'blind', of: slot.r }); roles[b] = slot.r + '?'; return;
    }
    if (slot.r) { bars.push(motifs[slot.r].name); roles[b] = slot.r; return; }
    const M = motifs[slot.t], KO = { 'stop-last': '끝에서 뚝', 'stop-first': '앞에서 뚝', 'hand-last': '끝에서 손 바꿈', 'hand-first': '앞에서 손 바꿈', add: '하나 더', 'long-last': '끝의 멈춤이 길다', 'short-last': '끝의 멈춤이 짧다', 'long-first': '앞의 멈춤이 길다', 'short-first': '앞의 멈춤이 짧다' };
    for (const kind of spread([].concat(slot.kind))) {         // 종류를 여러 개 주면 차례로 해 보고, 통과한 첫 번째를 쓴다
      const def = kind === 'add' ? (M.full ? { ...JSON.parse(JSON.stringify(M.full)), traps: [{ full: { presses: M.def.presses.slice(), holds: M.def.holds.map((h) => h.slice()) } }] } : null) : variant(M.def, kind);
      if (!def) continue;
      Lg.PATTERNS[name] = def;
      const v = validate(name, def.traps[0].full);
      if (!v || !v.clean) { delete Lg.PATTERNS[name]; continue; }
      if (process.env.DBGT) console.error('  함정', b, JSON.stringify(slot.kind), '→', kind);
      made[name] = def; bars.push(name); trapList.push({ bar: b, kind: kind.split(':')[0], of: slot.t }); roles[b] = slot.t + '!';
      notes[b] = `함정(${KO[kind.split(':')[0]]}${kind.includes(':') ? ' ' + kind.split(':')[1] + '박' : ''}): 앞 마디와 같이 가다가 한 군데가 다르다`;
      return;
    }
    if (!slot.soft) throw new Error('함정이 통과하지 못했다(마디 ' + b + '): ' + slot.kind);
    bars.push(M.name); roles[b] = slot.t;              // soft: 함정을 못 만들면 그냥 한 번 더 한다
  };
  const breaksOf = (nodes, wide) => (wide ? wAll : zAll).filter((s) => { let k = 0; while (k < 8 && s[k] === nodes[k]) k++; return k >= 2 && k < 7 && nodes[k] === 'F' && s[k] === 'S'; }).filter((s) => feverTry(s, wide));
  const addsOf = (nodes, wide) => (wide ? wAll : zAll).filter((s) => { let k = 0; while (k < 8 && s[k] === nodes[k]) k++; return k >= 2 && k < 7 && nodes[k] !== 'F' && s[k] === 'F' && feverTry(s, wide); });
  // 굽은 통로의 마디는 성기게: calm = 마디 앞쪽의 이만큼(반 박 단위)은 누르지 않는다(굽이를 볼 틈), run = 반 박 간격으로 이어 누르는 횟수의 한도
  const fits = (s, o) => !o || ((!o.calm || /^\.*$/.test(s.slice(0, o.calm))) && (!o.run || !new RegExp('F{' + (o.run + 1) + '}').test(s)));
  const feverSlot = (slot, b) => {
    const wide = !!(slot.wm || slot.wr || slot.wt), key = slot.zm || slot.wm || slot.zr || slot.wr || slot.zt || slot.wt, all = slot.pads ? padPool(wide) : wide ? wAll : zAll, name = `${T.prefix}${wide ? 'w' : 'z'}${b}`;
    if (slot.zr || slot.wr) { bars.push(motifs[key].name); roles[b] = key; return; }
    if (slot.zt || slot.wt) {                            // 피버의 함정: break = 누르던 자리에서 뚝 / add = 안 누르던 자리에서 하나 더(둘 다 앞쪽은 되풀이한 마디와 같다)
      if (slot.kind === 'pad') {                         // 튕김판의 함정: 앞 마디에서 저절로 튕기던 자리의 판이 없다. 이번엔 거기서 눌러야 꺾인다(안 누르면 그대로 가서 걸린다)
        const M0 = motifs[key].nodes, pool0 = padTraps(M0, wide, motifs[key].lim);
        if (!pool0.length) throw new Error('튕김판 함정으로 쓸 줄이 없다');
        const nodes = pick(pool0); took(nodes, wide); made[name] = Lg.PATTERNS[name] = feverDef(nodes, wide);
        notes[b] = `함정(판이 없다): 앞 마디(${M0})에서는 튕김판에 닿아 저절로 꺾이던 자리를, 이번엔 눌러야 한다`;
        bars.push(name); trapList.push({ bar: b, kind: 'pad', of: key }); roles[b] = key + '!'; return;
      }
      const M = motifs[key].nodes, lim = motifs[key].lim, fresh = (q) => !stale(q, wide) && !stalePair(M, q, wide), adds = addsOf(M, wide).filter((q) => fits(q, lim) && fresh(q)), brk = breaksOf(M, wide).filter((q) => fits(q, lim) && fresh(q));
      const useAdd = slot.kind === 'add' && adds.length, pool = useAdd ? adds : brk;
      if (!pool.length) throw new Error('피버 함정으로 쓸 줄이 없다');
      const nodes = pick(pool); took(nodes, wide); made[name] = Lg.PATTERNS[name] = feverDef(nodes, wide);
      notes[b] = useAdd ? `하나 더: 앞 마디(${M})와 같이 가다가 한 번 더 누른다` : `뚝: 앞 마디(${M})와 같이 가다가 끊긴다`;
      bars.push(name); trapList.push({ bar: b, kind: useAdd ? 'fever-add' : 'break', of: key }); roles[b] = key + '!'; return;
    }
    const weight = (s) => Math.pow(count(s, 'F'), 2) + 4 * (s.match(/FF/g) || []).length, total = all.reduce((u, s) => u + weight(s), 0);
    for (let tries = 0; tries < 300; tries++) {
      let r = rng() * total, s = all[0]; for (const c of all) { r -= weight(c); if (r <= 0) { s = c; break; } }
      const lim = slot.calm || slot.run ? { calm: slot.calm, run: slot.run } : null;
      if (!fits(s, lim) || stale(s, wide) || (tries < 200 && worn(s, wide)) || !feverTry(s, wide) || Object.values(motifs).some((mm) => mm.nodes === s) || (slot.kind !== 'add' && slot.kind !== 'pad' && slot.kind !== 'none' && !breaksOf(s, wide).filter((q) => fits(q, lim) && !stale(q, wide) && !stalePair(s, q, wide)).length)) continue;
      { const pp = Lg.PATTERNS[bars[bars.length - 1]]; if (pp && pp.mode === 'rush' && pp.nodes && !!pp.wide === wide && pp.nodes !== s && stalePair(pp.nodes, s, wide)) continue; }      // 바로 앞 피버 마디와의 짝도 앞 라운드에 없던 것
      if (slot.kind === 'pad' && !padTraps(s, wide, lim).length) continue;
      if (slot.kind === 'add' && !addsOf(s, wide).filter((q) => fits(q, lim) && !stale(q, wide) && !stalePair(s, q, wide)).length) continue;      // 이 마디의 함정을 "하나 더"로 낼 거면 그럴 줄이 있어야 한다
      took(s, wide); made[name] = Lg.PATTERNS[name] = feverDef(s, wide); bars.push(name); motifs[key] = { name, nodes: s, wide, lim }; roles[b] = key;
      return;
    }
    throw new Error('피버 마디를 못 뽑았다');
  };

  // ---- 계단(8라운드부터): { hill: 'A', bars: n } 새 계단(n마디. 뒤에 { cont: 1 }을 n-1개 붙인다) / { hr: 'A' } 한 번 더 / { ht: 'A', kind: [...], where: 'up' | 'down' } 그 계단의 함정
  //   cpAt: i = 그 계단의 i번째 마디를 체크포인트 마디로(cp: true). hops를 직접 주면 그대로 쓴다(처음 보여 주는 계단). peak = 꼭대기 높이의 하한, need = 나중에 낼 함정({ kind, where })이 성립하는 계단만 받는다
  const stairs = {};
  const hopName = (h) => (h.how === 'j' ? '이단 점프로 ' : h.how === 'h' ? '빨간 단을 건너뛰어 ' : '') + h.to;
  // 쇠 봉우리(12라운드): 공이 딛고 튀는 단마다(2칸 넘는 단) 튀고 0.45박 뒤에 프레스가 그 단을 내리찍는다(두 박마다). 단 위 3.7칸에 떠 있다가
  const ironPresses = (C, pats) => {
    for (const st of C.steps) {
      if (st.lv < 2) continue;
      const xb = 4 * st.t, bi = Math.floor(xb / 16); if (bi >= pats.length) continue;
      const X = xb - 16 * bi, at = st.t + 0.45 - 4 * bi, low = st.lv, hov = st.lv + 3.7;
      if (X - 0.9 < 0.2 || X + 0.9 > 15.8) continue;
      (pats[bi].movers = pats[bi].movers || []).push({ kind: 'press', x0: +(X - 0.9).toFixed(3), x1: +(X + 0.9).toFixed(3), hover: hov, low, track: { P: 2, at: +at.toFixed(4), keys: [[0, low, 'in'], [0.08, low, 'lin'], [0.5, hov, 'out'], [1.88, hov, 'lin']] } });
    }
  };
  const putHill = (hops, b, iron) => {
    const C = St.compile(hops), nm = (i) => `${T.prefix}_${b + i}`, pats = St.slice(C, nm), names = pats.map((_, i) => nm(i));
    if (iron) { ironPresses(C, pats); if (!pats.some((q) => q.movers)) return null; }
    pats.forEach((q, i) => { Lg.PATTERNS[names[i]] = q; });
    const r = St.check(names, T.bpm);
    if (!r.ok) { names.forEach((n) => delete Lg.PATTERNS[n]); return null; }
    return { names, pats, top: r.top };
  };
  const trapOfHill = (hops, kinds, where, b, iron) => {       // 함정으로 바꾼 계단: 종류와 자리(오르는 뜀 / 내려오는 뜀)를 섞어 해 보고, 통과하는 첫 번째
    const cand = [];
    hops.forEach((h, i) => { const from = i ? hops[i - 1].to : 0, up = h.to > from; if (where && (where === 'up') !== up) return; for (const kind of kinds) cand.push([i, kind]); });
    cand.sort((u, v) => kinds.indexOf(u[1]) - kinds.indexOf(v[1]) || rng() - 0.5);      // (앞에 적은 종류부터)
    for (const [i, kind] of cand) {
      const v = St.variant(hops, i, kind, rng);
      if (!v) continue;
      const put = putHill(v, b, iron);
      if (put && put.pats.some((q) => q.traps)) return { ...put, hops: v, kind, at: i };
      if (put) put.names.forEach((n) => delete Lg.PATTERNS[n]);
    }
    return null;
  };
  const KOS = { hlong: '멈춤이 길다: 멈춰서 건너뛰던 단에서 이번엔 더 오래 멈춘다. 버릇대로 일찍 놓으면 내려설 단 앞의 빨간 단에 내려앉는다', hshort: '멈춤이 짧다: 이번엔 일찍 놓아 내려간다. 버릇대로 계속 멈추면 멈춘 높이의 빨간 덩어리에 부딪힌다', lidJ: '낮아진 단: 이단 점프로 오르던 단이 한 칸 위에 있다. 버릇대로 뛰면 뚜껑에 걸린다', shift: '밀린 빨간 단: 건너뛰던 자리는 파란 단이고 그다음이 빨갛다. 버릇대로 먼저 멈추면 빨간 단에 내려앉는다', swap: '손 바꿈: 이단 점프로 오르던 자리에 빨간 단. 멈춰서 건너뛴다(뛰면 걸린다)' };
  const stairSlot = (slot, b) => {
    if (slot.cont) return;
    if (slot.hr) { bars.push(...stairs[slot.hr].names); roles[b] = slot.hr; return; }
    if (slot.ht) {
      const M = stairs[slot.ht], tv = trapOfHill(M.hops, slot.kind, slot.where, b, M.iron);
      if (!tv) throw new Error(`계단 함정을 못 만들었다(마디 ${b})`);
      if (slot.cpAt !== undefined) tv.pats[slot.cpAt].cp = true;      // 계단 안의 마디를 체크포인트로(13라운드 15마디)
      tv.names.forEach((n, i) => { made[n] = tv.pats[i]; });
      bars.push(...tv.names); trapList.push({ bar: b, kind: tv.kind, of: slot.ht }); roles[b] = slot.ht + '!';
      const tb = tv.pats.findIndex((q) => q.traps);
      notes[b + tb] = `함정(${KOS[tv.kind]})`;
      return;
    }
    const n = slot.bars || 1;
    for (let tries = 0; tries < 400; tries++) {
      const hops = slot.hops || St.randomHill(4 * n, rng, { peak: slot.peak, max: slot.max, inputs: slot.inputs, holdW: slot.holdW || T.holdW, hds: slot.hds || T.hds });
      if (!hops) continue;
      if (!slot.hops && Object.values(stairs).some((q) => JSON.stringify(q.hops) === JSON.stringify(hops))) continue;      // 같은 계단을 두 번 뽑지 않는다
      const put = putHill(hops, b, slot.iron);
      if (!put) { if (slot.hops) throw new Error(`정해 준 계단이 통과하지 못했다(마디 ${b})`); continue; }
      if (slot.need) {                                   // 나중에 낼 함정이 성립하는가(이름이 겹치지 않게 멀리 떨어진 번호로 시험한다)
        const tv = trapOfHill(hops, slot.need.kind, slot.need.where, 900, slot.iron);
        if (!tv) { put.names.forEach((nm) => delete Lg.PATTERNS[nm]); continue; }
        tv.names.forEach((nm) => delete Lg.PATTERNS[nm]);
      }
      if (slot.cpAt !== undefined) put.pats[slot.cpAt].cp = true;
      put.names.forEach((nm, i) => { made[nm] = put.pats[i]; });
      stairs[slot.hill] = { hops, names: put.names, iron: !!slot.iron };
      bars.push(...put.names); roles[b] = slot.hill;
      notes[b] = '계단: ' + hops.map(hopName).join(' → ');
      return;
    }
    throw new Error(`계단을 못 뽑았다(마디 ${b})`);
  };

  // ---- 체크포인트 마디에도 패턴(5~8라운드, 개발하는 동안만. cp: true를 단 마디가 체크포인트가 된다 — 나중에 체크포인트를 다 빼면 그냥 마디다)
  //   계단의 라운드(T.cpStairs)는 한 마디짜리 계단, 나머지는 높이 장치를 섞은 새 마디(T.cpLevel). 앞뒤 마디와 땅에서 박자에 맞춰 이어져야 한다
  const cpSlot = (b) => {
    const name = `${T.prefix}_${b}`;
    for (let tries = 0; tries < 300; tries++) {
      if (T.cpStairs) {
        const hops = St.randomHill(4, rng, { inputs: 1, holdW: T.holdW, hds: T.hds });
        if (!hops) continue;
        const put = putHill(hops, b);
        if (!put) continue;
        const def = put.pats[0]; def.cp = true;
        made[name] = def; bars.push(name); notes[b] = '체크포인트 마디. 계단: ' + hops.map(hopName).join(' → ');
        return;
      }
      const def = randomBar(name, T.cpLevel || '4v');
      if (!def) continue;
      const v = validate(name);
      if (!v || !v.clean || (!v.startClean && tries < 150)) continue;      // (앞 마디가 박스에서 떨어지며 끝나면 한 틱 늦게 시작한다: 그때는 시작은 봐준다)
      def.cp = true; made[name] = def; bars.push(name); notes[b] = '체크포인트 마디';
      return;
    }
    throw new Error(`체크포인트 마디를 못 뽑았다(마디 ${b})`);
  };
  if (T.fill) {                                        // 있는 코스의 체크포인트 마디만 채운다(다른 마디는 그대로)
    for (const n of T.fill) { const b = bars.length; if (n === 'cp') cpSlot(b); else bars.push(n); }
    return { bars, made, notes, traps: trapList, roles };
  }

  let A = null, reps = 0, feverA = null, feverReps = 0, lastHow = '';
  const flatSlots = T.sections.flatMap(([, slots]) => slots);
  // 음이 올라가는 구간(곡에서 잰 자리, T.rise): 그 마디들을 오르는 계단으로 바꾼다. 같은 오르막이 곡에서 다시 나오면 두 번째는 멈춤 길이가 다른 계단(함정)
  let riseSkip = 0; const riseCut = new Set();      // 계단으로 바뀐 자리에 있던 짜임(새 마디)의 이름
  const riseAt = new Map((T.rise || []).map((r) => [r.at, r]));
  T.sections.forEach(([, slots]) => slots.forEach((slot) => {
    if (riseSkip > 0) { riseSkip--; if (typeof slot !== 'string' && slot.m) riseCut.add(slot.m); return; }
    const b = bars.length;
    if (riseAt.has(b)) {
      const r = riseAt.get(b); riseSkip = r.bars - 1; if (typeof slot !== 'string' && slot.m) riseCut.add(slot.m);
      if (r.key) stairSlot({ hill: r.key, bars: r.bars, peak: r.peak || 2 + 2 * r.bars, holdW: 3, hds: [0.5, 1], need: r.need }, b);
      else stairSlot({ ht: r.trap, kind: r.kind || ['hlong', 'hshort', 'shift', 'lidJ', 'swap'] }, b);
      notes[b] = (r.key ? '음이 올라가는 구간 — 오르는 계단: ' : '같은 오르막이 다시(멈춤 길이가 다르다): ') + (notes[b] || '');
      A = null; reps = 0;
      return;
    }
    if (slot === 'cp' && T.cpFill) { cpSlot(b); A = null; reps = 0; return; }
    if (typeof slot !== 'string' && (slot.hill || slot.hr || slot.ht || slot.cont)) { stairSlot(slot, b); return; }
    if (typeof slot !== 'string' && (slot.m || slot.r || slot.t)) { phraseSlot(slot, b); return; }
    if (typeof slot !== 'string' && (slot.zm || slot.wm || slot.zr || slot.wr || slot.zt || slot.wt)) { feverSlot(slot, b); return; }
    if (typeof slot === 'string') { bars.push(slot); A = null; reps = 0; if (!(Lg.PATTERNS[slot] && Lg.PATTERNS[slot].mode === 'rush')) { feverA = null; feverReps = 0; } return; }
    if (slot.z || slot.w) {                            // 피버: 새로 뽑기 → (절반은) 한 번 더 → 앞쪽은 같고 뒤에서 끊기는 것
      const wide = !!slot.w, all = wide ? wAll : zAll, name = `${T.prefix}${wide ? 'w' : 'z'}${b}`;
      let nodes = null, how = '';
      const lim = slot.calm || slot.run ? { calm: slot.calm, run: slot.run } : null;
      if (feverA && !fits(feverA.nodes, lim)) { feverA = null; feverReps = 0; }
      if (feverA && feverA.wide === wide && feverReps >= 1 && rng() < (feverReps === 2 ? 0.9 : 0.4)) {
        const brk = all.filter((s) => { let k = 0; while (k < 8 && s[k] === feverA.nodes[k]) k++; return k >= 2 && k < 7 && feverA.nodes[k] === 'F' && s[k] === 'S'; }).filter((s) => fits(s, lim) && !stale(s, wide) && !stalePair(feverA.nodes, s, wide) && feverTry(s, wide));
        if (brk.length) { nodes = pick(brk); how = 'break'; }
      }
      if (!nodes && feverA && feverA.wide === wide && feverReps === 1 && rng() < 0.6) { bars.push(feverA.name); feverReps = 2; notes[b] = '한 번 더'; return; }
      const weight = (s) => Math.pow(count(s, 'F'), 2) + 4 * (s.match(/FF/g) || []).length;       // 많이 누르는 것, 이어 누르는 것을 더 자주 뽑는다
      const total = all.reduce((u, s) => u + weight(s), 0);
      for (let tries = 0; !nodes && tries < 200; tries++) { let r = rng() * total, s = all[0]; for (const c of all) { r -= weight(c); if (r <= 0) { s = c; break; } } if (fits(s, lim) && !stale(s, wide) && !(tries < 120 && worn(s, wide)) && feverTry(s, wide) && (!feverA || s !== feverA.nodes)) nodes = s; }
      if (!nodes) throw new Error('피버 패턴을 못 뽑았다');
      took(nodes, wide);
      made[name] = Lg.PATTERNS[name] = feverDef(nodes, wide);
      bars.push(name); notes[b] = how === 'break' ? `뚝: 앞 마디(${feverA.nodes})와 같이 가다가 끊긴다` : '';
      feverA = how === 'break' ? null : { name, nodes, wide }; feverReps = how === 'break' ? 0 : 1; A = null; reps = 0;
      return;
    }
    const name = `${T.prefix}_${b}`, prevName = bars[b - 1], prevClean = !isPat(prevName) || (A && A.clean) || (made[prevName] && made[prevName].__clean) || ['box', 'twin', 'stairs', 'lavaHop', 'lavaLeap', 'lavaGlide'].includes(prevName);
    // ① 같은 마디를 두 번 한 뒤에는 함정(한 군데만 다른 마디)
    if (A && reps === 2 && !slot.plain && rng() < 0.95) {
      const cands = trapOf(A.def).filter((c) => c.how !== lastHow || rng() < 0.3);
      for (const c of cands.map((c) => [c, rng() - (c.how === 'long' || c.how === 'short' ? 0.45 : 0)]).sort((u, v) => u[1] - v[1]).map((u) => u[0])) {      // (멈춤 길이의 함정을 먼저 해 본다)
        const { how, ...def } = c; Lg.PATTERNS[name] = def;
        const v = validate(name, def.traps[0].full), nx = flatSlots[b + 1];
        if (v && !v.clean && typeof nx === 'string' && Lg.PATTERNS[nx] && Lg.PATTERNS[nx].mode !== 'rush' && !['flat', 'cp', 'goal', 'idle'].includes(nx)) { delete Lg.PATTERNS[name]; continue; }
        if (v) { def.__clean = v.clean; made[name] = def; bars.push(name); notes[b] = how === 'stop' ? '함정(뚝): 앞의 두 마디와 같이 가다가 마지막은 누르지 않는다' : how === 'toL' ? '함정(손 바꿈): 마지막이 오른쪽이 아니라 왼쪽' : how === 'toR' ? '함정(손 바꿈): 마지막이 왼쪽이 아니라 오른쪽' : how === 'long' ? '함정(멈춤이 길다): 앞의 두 마디보다 더 오래 멈춰야 한다' : '함정(멈춤이 짧다): 앞의 두 마디보다 일찍 놓아야 한다'; lastHow = how; A = null; reps = 0; return; }
        delete Lg.PATTERNS[name];
      }
    }
    // ② 방금 새로 뽑은 마디는 절반쯤 한 번 더 한다(버릇이 생기게)
    if (A && reps === 1 && !slot.plain && A.clean && A.startClean && prevClean && rng() < 0.6) { bars.push(A.name); reps = 2; notes[b] = '한 번 더'; return; }
    // ③ 빨간 바닥 마디를 가끔 섞는다
    if (slot.sets && prevClean && rng() < 0.16) { const n = pick(SETS); bars.push(n); A = null; reps = 0; return; }
    // ④ 새로 뽑는다
    for (let tries = 0; tries < 60; tries++) {
      const def = randomBar(name, slot.g);
      if (!def) continue;
      if (A && JSON.stringify([def.holds, def.presses]) === JSON.stringify([A.def.holds, A.def.presses])) continue;
      const v = validate(name);
      if (v && T.density && !(v.clean && v.startClean)) continue;      // 촘촘한 라운드: 마디가 땅에서 박자에 맞춰 시작하고 끝나야 한다(다음 마디의 높이 장치가 어긋나지 않게)
      { const nx = flatSlots[b + 1]; if (v && !v.clean && typeof nx === 'string' && Lg.PATTERNS[nx] && Lg.PATTERNS[nx].mode !== 'rush' && !['flat', 'cp', 'goal', 'idle'].includes(nx)) continue; }      // 다음 마디가 손으로 놓은 장치(박스, 빨간 바닥)면 땅에서 박자에 맞춰 끝나야 한다
      if (v) { def.__clean = v.clean; made[name] = def; bars.push(name); A = { name, def, clean: v.clean, startClean: v.startClean }; reps = 1; notes[b] = ''; return; }
    }
    delete Lg.PATTERNS[name];
    bars.push(prevClean ? 'box' : 'idle'); A = null; reps = 0; notes[b] = '(뽑지 못해 쉬는 마디)';
  }));
  return { bars, made, notes, traps: trapList, roles };
}

module.exports = { generate, G, LEVELS, mulberry };

// 있는 코스의 체크포인트 마디("cp")만 패턴으로 채워서 logic.js에 적는다(다른 마디와 주석은 그대로). 사용: node tools_gen_course.js R5 fillcp [씨앗]
function fillCp(T, course0) {
  const seed1 = +(process.argv[4] || 1);
  const fmt = (v) => JSON.stringify(v).replace(/"([a-zA-Z_]+)":/g, '$1: ').replace(/,/g, ', ').replace(/\[ /g, '[').replace(/: \[\[/g, ': [[');
  for (let seed = seed1; seed < seed1 + 30; seed++) {
    let g;
    try { g = generate({ ...T, fill: course0.bars }, seed); } catch (e) { console.error(`씨앗 ${seed}: ${e.message}`); continue; }
    const course = { ...course0, bars: g.bars };
    let L; try { L = Lg.buildLevel(course); } catch (e) { console.error(`씨앗 ${seed}: ${e.message}`); continue; }
    const inp = Lg.planInput(L.ref), s = Lg.spawnState(L, -1);
    while (!s.dead && !s.won) Lg.stepState(L, s, inp.press.has(s.step + 1), null, inp.hold.has(s.step + 1));
    const solved = s.won && [-1, ...L.cps.keys()].every((k) => Lg.solve(L, Lg.spawnState(L, k), { grid: 12 }).plan);
    const snaps = L.cps.every((c) => !c.snap || c.lead);
    // 체크포인트 마디의 함정(높이 장치의 버릇: 떠 있는 박스에서 다시 뛰기, 천장 밑에서 뛰기)이 실제 코스에서도 그 마디에서 죽이는가
    const trapOk = Object.keys(g.made).every((n) => {
      const b = g.bars.indexOf(n), p = Lg.PATTERNS[n], lo = b * BAR, hi = lo + BAR;
      return (p.traps || []).every((t) => {
        const press = new Set((t.full ? t.full.presses : [...p.presses, ...(t.presses || [])]).map((v) => lo + Math.round(v * SUB))), holds = (t.full ? t.full.holds : t.holds || p.holds).map(([a, z]) => [lo + Math.round(a * SUB), lo + Math.round(z * SUB)]);
        const s2 = Lg.spawnState(L, -1);
        while (!s2.dead && !s2.won && s2.step < hi + SUB) { const st = s2.step + 1, inBar = st >= lo && st < hi; Lg.stepState(L, s2, inBar ? press.has(st) : inp.press.has(st), null, inBar ? holds.some((h) => st >= h[0] && st < h[1]) : inp.hold.has(st)); }
        return s2.dead && s2.x >= b * 16 && s2.x < b * 16 + 16.5;
      });
    });
    if (!trapOk) console.error(`  (체크포인트 마디의 함정이 실제 코스에서 통하지 않는다)`);
    console.error(`씨앗 ${seed}: ${s.won ? '완주' : '죽음(마디 ' + Math.floor(s.x / 16) + ')'}, 걷어 낸 칸 ${L.fixed.length}, 자동 풀이 ${solved ? '통과' : '실패'}, 체크포인트 ${L.cps.length}개(패턴 있는 것 ${L.cps.filter((c) => c.snap).length})`);
    if (!s.won || L.fixed.length || !solved || !snaps || !trapOk) { for (const n of Object.keys(g.made)) delete Lg.PATTERNS[n]; continue; }
    let src = fs.readFileSync(FILE, 'utf8');
    const lines = Object.entries(g.made).map(([name, d]) => `  ${name}: { holds: ${fmt(d.holds)}, presses: ${fmt(d.presses)}, tol: ${d.tol}${d.tall ? ', tall: ' + fmt(d.tall) : ''}${d.boxes ? ', boxes: ' + fmt(d.boxes) : ''}${d.bands ? ', bands: ' + fmt(d.bands) : ''}${d.redBox ? ', redBox: ' + fmt(d.redBox) : ''}${d.loose ? ', loose: ' + fmt(d.loose) : ''}${d.floats ? ', floats: ' + fmt(d.floats) : ''}${d.caps ? ', caps: ' + fmt(d.caps) : ''}${d.lava ? ', lava: ' + fmt(d.lava) : ''}${d.rings ? ', rings: ' + fmt(d.rings) : ''}${d.chain ? ', chain: ' + d.chain : ''}${d.traps ? ', traps: ' + fmt(d.traps) : ''}${d.movers ? ', movers: ' + JSON.stringify(d.movers) : ''}${d.stair ? ', stair: true' : ''}, cp: true },   // ${g.notes[+name.replace(/^\D+\d*\D/, '')] || '체크포인트 마디'}`);
    const z = `  // </gen:patterns:${round}>`, zi = src.indexOf(z);
    if (zi < 0) throw new Error('표시가 없다: ' + z);
    src = src.slice(0, zi) + `  // 체크포인트 마디(tools_gen_course.js ${round} fillcp ${seed}): 개발하는 동안 체크포인트로 쓰는 마디에도 패턴을 넣었다. cp: true를 빼면 그냥 마디다\n` + lines.join('\n') + '\n' + src.slice(zi);
    const a = `// <gen:bars:${round}>`, b2 = `// </gen:bars:${round}>`, i = src.indexOf(a), j = src.indexOf(b2);
    let k = 0, block = src.slice(i, j);
    block = block.replace(/"([A-Za-z0-9_]+)"/g, (m, n) => { const nn = g.bars[k++]; if (nn !== n && n !== 'cp') throw new Error(`마디 이름이 어긋났다: ${k - 1} ${n} ${nn}`); return JSON.stringify(nn); });
    if (k !== g.bars.length) throw new Error('마디 수가 어긋났다: ' + k + ' / ' + g.bars.length);
    src = src.slice(0, i) + block + src.slice(j);
    fs.writeFileSync(FILE, src);
    console.error(`logic.js에 적었다: 씨앗 ${seed}, 체크포인트 마디 ${Object.keys(g.made).length}개`);
    return;
  }
  console.error('채우지 못했다'); process.exit(1);
}
if (require.main === module) main();

function main() {
// ---- 씨앗을 여러 개 돌려서, 코스 전체가 통과하는 것 가운데 점수가 가장 높은 것을 고른다
//   점수: 함정이 많고, 누르는 자리가 여러 가지이고, 입력이 많고, 쉬는 마디가 적을수록 높다
const T = TEMPLATES[round];
if (!T) { console.error('모르는 라운드:', round); process.exit(1); }
const course0 = Lg.COURSES.find((c) => c.name.startsWith('ROUND ' + round.slice(1)));
const tries = +(process.argv[4] || 12);
if (process.argv[3] === 'fillcp') return fillCp(T, course0);
let result = null;
for (let seed = seed0; seed < seed0 + tries; seed++) {
  for (const k of Object.keys(Lg.PATTERNS)) if (k.startsWith(T.prefix)) delete Lg.PATTERNS[k];
  let g;
  const sections = typeof T.sections === 'function' ? T.sections(seed) : T.sections;
  try { g = generate({ ...T, sections }, seed); g.sections = sections; } catch (e) { console.error(`씨앗 ${seed}: ${e.message}`); continue; }
  const course = { ...course0, bars: g.bars };
  let L; try { L = Lg.buildLevel(course); } catch (e) { console.error(`씨앗 ${seed}: ${e.message}`); continue; }
  const inp = Lg.planInput(L.ref), s = Lg.spawnState(L, -1);
  while (!s.dead && !s.won) Lg.stepState(L, s, inp.press.has(s.step + 1), null, inp.hold.has(s.step + 1));
  const solved = s.won && [-1, ...L.cps.keys()].every((k) => Lg.solve(L, Lg.spawnState(L, k), { grid: 12 }).plan);
  const traps = Object.values(g.notes).filter((n) => /함정|뚝/.test(n)).length, rests = g.bars.filter((n) => n === 'idle' || n === 'box').length;
  const spots = new Set([...L.ref.presses, ...L.ref.holds.map((h) => h[0])].map((st) => st % BAR)).size, inputs = L.ref.presses.length + L.ref.holds.length;
  const dens = Lg.touchDensity(course, L);
  const kindsGot = new Set(g.traps.map((x) => x.kind)), want = T.recipe ? T.recipe.traps + 2 : null;      // 조건이 있는 라운드: 함정 수가 목표에 가깝고, 소개할 함정이 다 나와야 한다
  const score = T.recipe ? (T.recipe.intro.every((it) => kindsGot.has(it.kind)) ? 0 : -100) - Math.abs(traps - want) * 3 + spots * 0.5 + inputs * 0.05 - rests + (T.density ? (dens.busy >= T.density ? 0 : -100) + dens.busy * 20 : 0) : traps * 3 + spots * 0.5 + inputs * 0.1 - rests * 2;
  console.error(`씨앗 ${seed}: ${s.won ? '완주' : '죽음(마디 ' + Math.floor(s.x / 16) + ')'}, 걷어 낸 칸 ${L.fixed.length}, 자동 풀이 ${solved ? '통과' : '실패'} | 함정 ${traps}, 누르는 자리 ${spots}가지, 입력 ${inputs}번, 쉬는 마디 ${rests}, 밀도 ${(dens.busy * 100).toFixed(1)}%(누르기만 ${(dens.touch * 100).toFixed(1)}%) → 점수 ${score.toFixed(1)}`);
  if (s.won && !L.fixed.length && solved && (!result || score > result.score)) result = { ...g, seed, score };
}
if (!result) { console.error('통과하는 코스를 찾지 못했다'); process.exit(1); }
for (const k of Object.keys(Lg.PATTERNS)) if (k.startsWith(T.prefix)) delete Lg.PATTERNS[k];

// ---- logic.js에 적는다
const fmt = (v) => JSON.stringify(v).replace(/"([a-zA-Z_]+)":/g, '$1: ').replace(/,/g, ', ').replace(/\[ /g, '[').replace(/: \[\[/g, ': [[');
const lines = [`  // 도구(tools_gen_course.js ${round} ${result.seed})가 무작위로 뽑아, 실제로 달려 보고 통과한 패턴들. 손으로 고치지 말고 도구를 다시 돌린다.`];
for (const [name, d] of Object.entries(result.made)) {
  const b = +name.replace(/^\D+\d*\D/, ''), note = result.notes[b];
  if (d.mode === 'rush') lines.push(`  ${name}: { mode: "rush"${d.wide ? ', wide: true' : ''}${d.gap ? ', gap: ' + d.gap : ''}, nodes: "${d.nodes}" },${note ? '   // ' + note : ''}`);
  else lines.push(`  ${name}: { holds: ${fmt(d.holds)}, presses: ${fmt(d.presses)}, tol: ${d.tol}${d.tall ? ', tall: ' + fmt(d.tall) : ''}${d.boxes ? ', boxes: ' + fmt(d.boxes) : ''}${d.bands ? ', bands: ' + fmt(d.bands) : ''}${d.redBox ? ', redBox: ' + fmt(d.redBox) : ''}${d.loose ? ', loose: ' + fmt(d.loose) : ''}${d.lead ? ', lead: ' + JSON.stringify(d.lead) : ''}${d.tail ? ', tail: ' + JSON.stringify(d.tail) : ''}${d.stair ? ', stair: true' : ''}${d.cp ? ', cp: true' : ''}${d.floats ? ', floats: ' + fmt(d.floats) : ''}${d.caps ? ', caps: ' + fmt(d.caps) : ''}${d.lava ? ', lava: ' + fmt(d.lava) : ''}${d.rings ? ', rings: ' + fmt(d.rings) : ''}${d.chain ? ', chain: ' + d.chain : ''}${d.traps ? ', traps: ' + fmt(d.traps) : ''}${d.movers ? ', movers: ' + JSON.stringify(d.movers) : ''} },${note ? '   // ' + note : ''}`);
}
const barLines = [];
let at = 0;
for (const [title, slots] of result.sections) {
  if (title) barLines.push(`    // ${title}`);
  const names = result.bars.slice(at, at + slots.length); at += slots.length;
  barLines.push('    ' + names.map((n, i) => JSON.stringify(n) + ',' + (i % 4 === 3 && i < names.length - 1 ? '  ' : '')).join(' '));
}
let src = fs.readFileSync(FILE, 'utf8');
const put = (tag, body) => { const a = `// <gen:${tag}:${round}>`, z = `// </gen:${tag}:${round}>`, i = src.indexOf(a), j = src.indexOf(z); if (i < 0 || j < 0) throw new Error('표시가 없다: ' + a); src = src.slice(0, i + a.length) + '\n' + body + '\n' + src.slice(src.lastIndexOf('\n', j) + 1); };
put('patterns', lines.join('\n'));
put('bars', barLines.join('\n'));
fs.writeFileSync(FILE, src);
console.error(`logic.js에 적었다: 씨앗 ${result.seed}, 새 패턴 ${Object.keys(result.made).length}개`);
}

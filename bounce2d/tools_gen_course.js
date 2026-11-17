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

const round = process.argv[2] || 'R2', seed0 = +(process.argv[3] || 1);
const SUB = Lg.SUB, BAR = 4 * SUB;
const q8 = (v) => Math.round(v * 8) / 8;

// ---- 라운드의 틀: 고정된 마디는 이름으로, 뽑을 마디는 { g: 단계 }(바운스) / { z: 1 }(좁은 피버) / { w: 1 }(넓은 피버)
const G = (g, sets) => ({ g, sets });
const TEMPLATES = {
  R2: {
    prefix: 'g2', bpm: 151.9867,
    sections: [
      ['도입: 앞에서 배운 동작을 섞어서. 끝에서 곡이 잠깐 빠지는 자리만 쉰다', ['flat', 'flat', G(1), G(1), G(1), G(1), 'box', 'cp']],
      ['첫 큰 구간', [G(2), G(2), G(2), G(2), G(2), G(2), G(2), G(2)]],
      ['', [G(2), G(2), G(2), G(2), G(2), G(2), G(2), 'cp']],
      ['밝고 가벼운 구간: 첫 피버. 파란 발판 → 좁은 통로 → 계단으로 올라가 넓은 통로 → 계단으로 내려와 다시 좁은 통로', ['zT', { z: 1 }, { z: 1 }, 'wUp', { w: 1 }, { w: 1 }, 'wDn', { z: 1 }]],
      ['새 장치(빨간 바닥과 파란 섬)를 하나씩 보여 주고, 사이는 뽑은 패턴으로 채운다', ['lavaHop', G(2), 'lavaLeap', G(2), 'lavaGlide', G(2), G(2), 'cp']],
      ['두 번째 큰 구간: 뽑은 패턴에 빨간 바닥 마디가 섞인다', [G(3, 1), G(3, 1), G(3, 1), G(3, 1), G(3, 1), G(3, 1), G(3, 1), G(3, 1)]],
      ['', [G(3, 1), G(3, 1), G(3, 1), G(3, 1), G(3, 1), G(3, 1), G(3, 1), 'cp']],
      ['절정', [G(3, 1), G(3, 1), G(3, 1), G(3, 1), G(3, 1), G(3, 1), G(3, 1), 'cp']],
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
  const phrase = (reps, kind, hard) => { const k = K(), others = Object.keys(R.kinds).filter((x) => x !== kind && x !== 'add'); return [{ m: k, g: R.g, add: kind === 'add' }, ...Array.from({ length: reps - 1 }, () => ({ r: k })), { t: k, kind: kind === 'add' || hard ? [kind] : [kind, ...others], soft: !hard }]; };
  const filler = (room) => { const kind = pickW(R.fill); if (kind === 'pair' && room >= 2) { const k = K(); return [{ m: k, g: R.g }, { r: k }]; } if (kind === 'set') return [SETS[Math.floor(rng() * SETS.length)]]; if (kind === 'rest') return [['box', 'twin', 'stairs'][Math.floor(rng() * 3)]]; return [{ m: K(), g: R.g }]; };
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
  prefix: 'g3', bpm: 152.0183,
  recipe: { g: '2t', traps: 6, from: 1, kinds: { 'stop-last': 3, 'hand-last': 4, add: 3 }, reps: { 2: 7, 3: 3 }, intro: [{ stretch: 1, kind: 'hand-last' }, { stretch: 2, kind: 'add' }], fill: { one: 6, pair: 2, set: 1.2, rest: 0.6 } },
  sections(seed) {
    const [s0, s1, s2, s3, s4, s5, s6, s7] = fillStretches([4, 7, 7, 7, 6, 7, 7, 7], this.recipe, seed);
    s0.splice(0, s0.length, ...[1, 1, '1t', '1t'].map((g) => ({ g, plain: true })));     // 도입은 함정도 되풀이도 없이 쉬운 것만. 뒤의 두 마디에서 높은 박스를 먼저 보여 준다
    return [
      ['도입(조용함): 쉬운 패턴만. 뒤의 두 마디에서 높은 박스(이단 점프로만 넘는다)를 처음 보여 준다. 구간의 마지막 마디마다 체크포인트', ['flat', 'flat', ...s0, 'cp']],
      ['본 리듬: 새 함정 "끝에서 손 바꿈"을 체크포인트 바로 뒤에서 소개한다(두 번 되풀이 → 마지막 입력의 손이 반대)', [...s1, 'cp']],
      ['더 밝게: 새 함정 "하나 더"를 소개한다(두 번 되풀이 → 이번엔 하나 더 눌러야 한다)', [...s2, 'cp']],
      ['낮게 깔림: 배운 함정들을 섞는다', [...s3, 'cp']],
      ['첫 절정: 피버. 좁은 통로 → 계단으로 올라가 넓은 통로 → 계단으로 내려와 다시 좁은 통로', [{ z: 1 }, { z: 1 }, 'wUp', { w: 1 }, { w: 1 }, 'wDn', { z: 1 }, { z: 1 }]],
      ['가라앉는 구간', ['cp', ...s4, 'cp']],
      ['본 리듬 다시', [...s5, 'cp']],
      ['더 밝게', [...s6, 'cp']],
      ['낮게 깔렸다가 쌓아 올림', [...s7, 'cp']],
      ['마지막 절정: 피버. 들어서자마자 넓은 통로. 끝의 두 마디는 연출 — 통로가 조여들다 터져 나오고, 곡이 끊기는 순간에 결승선을 지난다', ['wUp', { w: 1 }, { w: 1 }, { w: 1 }, 'wDn', 'zS1', 'zS2']],
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
  const ctxOf = (cand) => {                            // 이 마디를 시험할 짧은 코스: 앞의 두 마디(패턴이면) + 이 마디 + 평지
    const prev = bars.slice(-2).map((n) => (isPat(n) ? n : 'flat'));
    while (prev.length < 2) prev.unshift('flat');
    return { bars: ['flat', ...prev, cand, 'flat', 'flat', 'goal'], at: 3 };
  };
  const build = (ctx) => Lg.buildLevel({ name: 't', bpm: T.bpm, bars: ctx.bars, sections: [{ bar: 0, id: 'a' }] });
  const run = (L, plan, until) => {
    const inp = Lg.planInput(plan), s = Lg.spawnState(L, -1), bounces = [];
    let maxH = 0;
    while (!s.dead && !s.won && s.step < until) { const ev = []; Lg.stepState(L, s, inp.press.has(s.step + 1), ev, inp.hold.has(s.step + 1)); maxH = Math.max(maxH, 9 - s.y); if (ev.some((e) => e.type === 'bounce')) bounces.push(s.step); }
    return { s, bounces, maxH };
  };
  // 통과 조건: 패턴대로 가면 지나가고, 걷어 낸 장애물이 없고, 입력을 하나라도 빼면 죽고, 입력마다 0.15박(약 58ms) 일찍·늦게 눌러도 지나간다
  const validate = (name, habit) => {
    const ctx = ctxOf(name), L = build(ctx), lo = ctx.at * BAR, end = (ctx.at + 2) * BAR;
    const slack = Lg.PATTERNS[name].tol >= 0.17 ? 14 : 10;      // 일찍·늦게 눌러 보는 폭(스텝): 보통은 0.15박(약 58ms), 빡빡한 단계는 0.1박(약 41ms)
    if (L.fixed.length) return null;
    const ref = run(L, L.ref, end);
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
      for (const k of ['plain', 'H', 'D', 'DH', 'HD', 'T']) { if (r < (cfg[k] || 0)) { kind = k; break; } r -= cfg[k] || 0; }
      if (kind === 'H') { const s = tau + pick(cfg.hs), d = pick(cfg.hd); if (s + d <= 4) def.holds.push([q8(s), q8(s + d)]); }
      else if (kind === 'D') { const t = tau + pick(cfg.dt); if (t < 4) def.presses.push(q8(t)); }
      else if (kind === 'DH') { const t = tau + 0.5, d = pick(cfg.dhd); if (t + 0.5 + d <= 4) { def.presses.push(q8(t)); def.holds.push([q8(t + 0.5), q8(t + 0.5 + d)]); } }
      else if (kind === 'T') { const t = tau + 0.5; if (t < 4) { def.presses.push(q8(t)); (def.tall = def.tall || []).push(q8(t)); } }      // 높은 박스: 꼭대기에서 이단 점프해야만 넘는다(멈춤으로는 못 넘는다)
      else if (kind === 'HD') { const d = pick(cfg.hdd), t = tau + 0.5 + d + 0.125; if (t < 4) { def.holds.push([tau + 0.5, q8(tau + 0.5 + d)]); def.presses.push(q8(t)); } }
    }
    const n = def.holds.length + def.presses.length;
    return n >= 2 || (n === 1 && (cfg.one || rng() < 0.15)) ? def : null;      // 2단계부터는 대개 한 마디에 두 번 이상 누른다
  };
  const inputsOf = (def) => [...def.presses.map((t) => ({ t, k: 'R', tall: !!(def.tall && def.tall.includes(t)) })), ...def.holds.map(([a, z]) => ({ t: a, z, k: 'L' }))].sort((u, v) => u.t - v.t);
  const trapOf = (A) => {                              // 함정으로 바꾸기: 마지막 입력을 빼거나(뚝), 마지막 입력의 손을 바꾼다
    const ins = inputsOf(A), last = ins[ins.length - 1], rest = ins.slice(0, -1);
    const base = { holds: rest.filter((i) => i.k === 'L').map((i) => [i.t, i.z]), presses: rest.filter((i) => i.k === 'R').map((i) => i.t), tol: A.tol };
    const habit = { presses: A.presses.slice(), holds: A.holds.map((h) => h.slice()) };
    const out = [];
    if (rest.length) out.push({ ...base, traps: [{ full: habit }], how: 'stop' });
    if (last.k === 'R' && last.t + 0.75 <= 4) out.push({ ...base, holds: [...base.holds, [last.t, q8(last.t + 0.75)]], traps: [{ full: habit }], how: 'toL' });
    if (last.k === 'L') out.push({ ...base, presses: [...base.presses, last.t], traps: [{ full: habit }], how: 'toR' });
    return out;
  };

  // ---- 피버: 가능한 글자 줄을 모두 구해 두고 거기서 뽑는다
  const walk = (str, top, start) => { let zl = start, zin = start === 0 ? -1 : 1; const path = [zl];
    for (let k = 0; k < 8; k++) { const c = k ? str[k - 1] : '.', surf = zl <= 0 || zl >= top; if (surf && c !== '.') return null; const nat = zl <= 0 ? 1 : zl >= top ? -1 : zin, dir = c === 'F' ? -nat : nat; zl += dir; zin = dir; path.push(zl); }
    return str[7] === '.' && zl === start ? path : null; };
  const allStr = (top, start) => { const out = []; const rec = (pre) => { if (pre.length === 8) { if (walk(pre, top, start)) out.push(pre); return; } for (const c of 'FS.') rec(pre + c); }; rec(''); return out; };
  const count = (s, c) => s.split(c).length - 1;
  const zAll = allStr(2, 0).filter((s) => count(s, 'F') >= 2 && count(s, '.') <= 5), wAll = allStr(4, 4).filter((s) => count(s, 'F') >= 2 && count(s, 'F') + count(s, 'S') >= 4);
  const feverOk = {};
  const feverDef = (nodes, wide) => { const d = { mode: 'rush', nodes }; if (wide) d.wide = true; if (/[FS][FS]/.test(nodes)) d.gap = 1.5; d.holds = []; d.presses = []; for (let k = 1; k <= 8; k++) if (nodes[k - 1] === 'F') d.presses.push(k * 0.5); return d; };
  const feverTry = (nodes, wide) => {                  // 입력 여유가 0.16박(약 62ms) 이상이고, 입력이 모두 꼭 필요한가
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
  const variant = (A, kind) => {
    const ins = inputsOf(A), habit = { presses: A.presses.slice(), holds: A.holds.map((h) => h.slice()) };
    const sw = (i) => (i.k === 'R' ? (i.t + 0.75 <= 4 ? { t: i.t, z: q8(i.t + 0.75), k: 'L' } : null) : { t: i.t, k: 'R', tall: true });      // 왼쪽 → 오른쪽: 그 자리에 높은 박스를 세운다(버릇대로 멈추면 못 넘는다)
    let list = null;
    if (kind === 'stop-last') list = ins.slice(0, -1);
    else if (kind === 'stop-first' && ins.length >= 2) list = ins.slice(1);
    else if (kind === 'hand-last') { const x = sw(ins[ins.length - 1]); if (x) list = [...ins.slice(0, -1), x]; }
    else if (kind === 'hand-first' && ins.length >= 2) { const x = sw(ins[0]); if (x) list = [x, ...ins.slice(1)]; }
    return list ? { ...toDef(list, A.tol), traps: [{ full: habit }] } : null;
  };
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
      delete Lg.PATTERNS[name]; throw new Error('되풀이할 마디를 못 뽑았다');
    }
    if (slot.r && slot.blind) {                        // 안내 없이 한 번 더: 같은 입력이지만 길잡이(수정·누르는 표시)가 없다
      const def = { ...JSON.parse(JSON.stringify(motifs[slot.r].def)), blind: true };
      Lg.PATTERNS[name] = def; made[name] = def; bars.push(name); trapList.push({ bar: b, kind: 'blind', of: slot.r }); roles[b] = slot.r + '?'; return;
    }
    if (slot.r) { bars.push(motifs[slot.r].name); roles[b] = slot.r; return; }
    const M = motifs[slot.t], KO = { 'stop-last': '끝에서 뚝', 'stop-first': '앞에서 뚝', 'hand-last': '끝에서 손 바꿈', 'hand-first': '앞에서 손 바꿈', add: '하나 더' };
    for (const kind of [].concat(slot.kind)) {         // 종류를 여러 개 주면 차례로 해 보고, 통과한 첫 번째를 쓴다
      const def = kind === 'add' ? (M.full ? { ...JSON.parse(JSON.stringify(M.full)), traps: [{ full: { presses: M.def.presses.slice(), holds: M.def.holds.map((h) => h.slice()) } }] } : null) : variant(M.def, kind);
      if (!def) continue;
      Lg.PATTERNS[name] = def;
      const v = validate(name, def.traps[0].full);
      if (!v || !v.clean) { delete Lg.PATTERNS[name]; continue; }
      made[name] = def; bars.push(name); trapList.push({ bar: b, kind, of: slot.t }); roles[b] = slot.t + '!';
      notes[b] = `함정(${KO[kind]}): 앞 마디와 같이 가다가 한 군데가 다르다`;
      return;
    }
    if (!slot.soft) throw new Error('함정이 통과하지 못했다: ' + slot.kind);
    bars.push(M.name); roles[b] = slot.t;              // soft: 함정을 못 만들면 그냥 한 번 더 한다
  };
  const breaksOf = (nodes, wide) => (wide ? wAll : zAll).filter((s) => { let k = 0; while (k < 8 && s[k] === nodes[k]) k++; return k >= 2 && k < 7 && nodes[k] === 'F' && s[k] === 'S'; }).filter((s) => feverTry(s, wide));
  const feverSlot = (slot, b) => {
    const wide = !!(slot.wm || slot.wr || slot.wt), key = slot.zm || slot.wm || slot.zr || slot.wr || slot.zt || slot.wt, all = wide ? wAll : zAll, name = `${T.prefix}${wide ? 'w' : 'z'}${b}`;
    if (slot.zr || slot.wr) { bars.push(motifs[key].name); roles[b] = key; return; }
    if (slot.zt || slot.wt) {
      const brk = breaksOf(motifs[key].nodes, wide);
      if (!brk.length) throw new Error('끊기는 줄이 없다');
      const nodes = pick(brk); made[name] = Lg.PATTERNS[name] = feverDef(nodes, wide);
      bars.push(name); trapList.push({ bar: b, kind: 'break', of: key }); roles[b] = key + '!'; return;
    }
    const weight = (s) => Math.pow(count(s, 'F'), 2) + 4 * (s.match(/FF/g) || []).length, total = all.reduce((u, s) => u + weight(s), 0);
    for (let tries = 0; tries < 300; tries++) {
      let r = rng() * total, s = all[0]; for (const c of all) { r -= weight(c); if (r <= 0) { s = c; break; } }
      if (!feverTry(s, wide) || Object.values(motifs).some((mm) => mm.nodes === s) || !breaksOf(s, wide).length) continue;
      made[name] = Lg.PATTERNS[name] = feverDef(s, wide); bars.push(name); motifs[key] = { name, nodes: s, wide }; roles[b] = key; return;
    }
    throw new Error('피버 마디를 못 뽑았다');
  };

  let A = null, reps = 0, feverA = null, feverReps = 0, lastHow = '';
  T.sections.forEach(([, slots]) => slots.forEach((slot) => {
    const b = bars.length;
    if (typeof slot !== 'string' && (slot.m || slot.r || slot.t)) { phraseSlot(slot, b); return; }
    if (typeof slot !== 'string' && (slot.zm || slot.wm || slot.zr || slot.wr || slot.zt || slot.wt)) { feverSlot(slot, b); return; }
    if (typeof slot === 'string') { bars.push(slot); A = null; reps = 0; if (!(Lg.PATTERNS[slot] && Lg.PATTERNS[slot].mode === 'rush')) { feverA = null; feverReps = 0; } return; }
    if (slot.z || slot.w) {                            // 피버: 새로 뽑기 → (절반은) 한 번 더 → 앞쪽은 같고 뒤에서 끊기는 것
      const wide = !!slot.w, all = wide ? wAll : zAll, name = `${T.prefix}${wide ? 'w' : 'z'}${b}`;
      let nodes = null, how = '';
      if (feverA && feverA.wide === wide && feverReps >= 1 && rng() < (feverReps === 2 ? 0.9 : 0.4)) {
        const brk = all.filter((s) => { let k = 0; while (k < 8 && s[k] === feverA.nodes[k]) k++; return k >= 2 && k < 7 && feverA.nodes[k] === 'F' && s[k] === 'S'; }).filter((s) => feverTry(s, wide));
        if (brk.length) { nodes = pick(brk); how = 'break'; }
      }
      if (!nodes && feverA && feverA.wide === wide && feverReps === 1 && rng() < 0.6) { bars.push(feverA.name); feverReps = 2; notes[b] = '한 번 더'; return; }
      const weight = (s) => Math.pow(count(s, 'F'), 2) + 4 * (s.match(/FF/g) || []).length;       // 많이 누르는 것, 이어 누르는 것을 더 자주 뽑는다
      const total = all.reduce((u, s) => u + weight(s), 0);
      for (let tries = 0; !nodes && tries < 200; tries++) { let r = rng() * total, s = all[0]; for (const c of all) { r -= weight(c); if (r <= 0) { s = c; break; } } if (feverTry(s, wide) && (!feverA || s !== feverA.nodes)) nodes = s; }
      if (!nodes) throw new Error('피버 패턴을 못 뽑았다');
      made[name] = Lg.PATTERNS[name] = feverDef(nodes, wide);
      bars.push(name); notes[b] = how === 'break' ? `뚝: 앞 마디(${feverA.nodes})와 같이 가다가 끊긴다` : '';
      feverA = how === 'break' ? null : { name, nodes, wide }; feverReps = how === 'break' ? 0 : 1; A = null; reps = 0;
      return;
    }
    const name = `${T.prefix}_${b}`, prevName = bars[b - 1], prevClean = !isPat(prevName) || (A && A.clean) || (made[prevName] && made[prevName].__clean) || ['box', 'twin', 'stairs', 'lavaHop', 'lavaLeap', 'lavaGlide'].includes(prevName);
    // ① 같은 마디를 두 번 한 뒤에는 함정(한 군데만 다른 마디)
    if (A && reps === 2 && !slot.plain && rng() < 0.95) {
      const cands = trapOf(A.def).filter((c) => c.how !== lastHow || rng() < 0.3);
      for (const c of cands.sort(() => rng() - 0.5)) {
        const { how, ...def } = c; Lg.PATTERNS[name] = def;
        const v = validate(name, def.traps[0].full);
        if (v) { def.__clean = v.clean; made[name] = def; bars.push(name); notes[b] = how === 'stop' ? '함정(뚝): 앞의 두 마디와 같이 가다가 마지막은 누르지 않는다' : how === 'toL' ? '함정(손 바꿈): 마지막이 오른쪽이 아니라 왼쪽' : '함정(손 바꿈): 마지막이 왼쪽이 아니라 오른쪽'; lastHow = how; A = null; reps = 0; return; }
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
      if (v) { def.__clean = v.clean; made[name] = def; bars.push(name); A = { name, def, clean: v.clean, startClean: v.startClean }; reps = 1; notes[b] = ''; return; }
    }
    delete Lg.PATTERNS[name];
    bars.push(prevClean ? 'box' : 'idle'); A = null; reps = 0; notes[b] = '(뽑지 못해 쉬는 마디)';
  }));
  return { bars, made, notes, traps: trapList, roles };
}

module.exports = { generate, G, LEVELS, mulberry };
if (require.main === module) main();

function main() {
// ---- 씨앗을 여러 개 돌려서, 코스 전체가 통과하는 것 가운데 점수가 가장 높은 것을 고른다
//   점수: 함정이 많고, 누르는 자리가 여러 가지이고, 입력이 많고, 쉬는 마디가 적을수록 높다
const T = TEMPLATES[round];
if (!T) { console.error('모르는 라운드:', round); process.exit(1); }
const course0 = Lg.COURSES.find((c) => c.name.startsWith('ROUND ' + round.slice(1)));
const tries = +(process.argv[4] || 12);
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
  const kindsGot = new Set(g.traps.map((x) => x.kind)), want = T.recipe ? T.recipe.traps + 2 : null;      // 조건이 있는 라운드: 함정 수가 목표에 가깝고, 소개할 함정이 다 나와야 한다
  const score = T.recipe ? (T.recipe.intro.every((it) => kindsGot.has(it.kind)) ? 0 : -100) - Math.abs(traps - want) * 3 + spots * 0.5 + inputs * 0.05 - rests : traps * 3 + spots * 0.5 + inputs * 0.1 - rests * 2;
  console.error(`씨앗 ${seed}: ${s.won ? '완주' : '죽음(마디 ' + Math.floor(s.x / 16) + ')'}, 걷어 낸 칸 ${L.fixed.length}, 자동 풀이 ${solved ? '통과' : '실패'} | 함정 ${traps}, 누르는 자리 ${spots}가지, 입력 ${inputs}번, 쉬는 마디 ${rests} → 점수 ${score.toFixed(1)}`);
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
  else lines.push(`  ${name}: { holds: ${fmt(d.holds)}, presses: ${fmt(d.presses)}, tol: ${d.tol}${d.tall ? ', tall: ' + fmt(d.tall) : ''}${d.traps ? ', traps: ' + fmt(d.traps) : ''} },${note ? '   // ' + note : ''}`);
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

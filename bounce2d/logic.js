// ===================== 바운스 버전 로직 (렌더링/오디오와 분리, 결정적) =====================
// 공은 박자마다 저절로 튄다. 입력은 둘뿐:
//   멈춤(왼쪽 누르고 있기): 공중에서 그 높이에 멈춘다. 세상은 계속 흐른다. 한 번 튈 때마다 최대 1박자.
//   점프(오른쪽 누르기): 땅에 있으면(굴러가는 중) 그 자리에서 점프, 공중이면 이단 점프(한 번 튈 때마다 한 번).
// 단위: 거리 = 칸, 시간 = 박자. 공은 박자당 TPB칸씩 전진하고, 평지에서 한 번 튀면 정확히 1박자(4칸) 뒤에 착지한다.
const TPB = 4;                 // 박자당 칸
const SUB = 96;                // 박자당 물리 스텝
const DT = 1 / SUB;
const JUMP_H = 2.25;           // 튀는 높이(칸)
const G = 8 * JUMP_H;          // 중력 → 체공 1박자
const V0 = 4 * JUMP_H;
const V_PAD = G * 1.5 / 2;     // 점프대: 체공 1.5박자, 높이 약 5칸
const JUMP_BUF_STEPS = 30;     // 점프할 수 없을 때 누른 입력을 기억하는 시간(약 1/3박). 착지 직전·고리 직전에 눌러도 이어진다
const FREEZE_STEPS = SUB;      // 한 번 튈 때마다 멈출 수 있는 시간: 1박자
const BOUNCE_TOL = 12;         // 박자 직후 이 스텝(1/8박) 안에 땅에 닿으면 바로 튄다. 늦은 만큼 낮게 튀어 다음 박자에 맞춰 착지한다
const CLIMB = 1.05;            // 이 높이(한 칸) 이하의 턱은 부딪혀도 저절로 올라탄다 → 계단
const SAW_R = 0.4, SAW_TRAVEL = 2.2;
const SIZE = 0.8, HALF = 0.4;
const ROWS = 10;               // row 0 = 맨 위, row 9 = 바닥
const STEP_UP = 0.22;

// ===================== 코스: 키 패턴을 먼저 정하고, 그 길을 장애물로 감싼다 =====================
// 마디(4박자 = 16칸)마다 키 패턴을 적는다. 시간은 그 마디 시작부터의 박자.
//   holds:   [[시작, 끝], ...]  멈춤(왼쪽)을 누르고 있는 구간
//   presses: [시각, ...]        점프(오른쪽)를 누르는 순간. 공중이면 이단 점프, 굴러가는 중이면 그 자리에서 점프
//   tol:     각 입력을 이만큼(박자) 일찍·늦게 눌러도 지나가도록 통로를 넓힌다. 기본 0.1박(96 BPM에서 약 60ms)
//   mF / mC: 그렇게 넓힌 통로와 바닥 쪽 / 천장 쪽 장애물 사이에 더 두는 여유(칸)
// buildLevel이 이 패턴대로 공을 실제로 달려 본 뒤, 그 길 아래에는 블록·가시를, 멈춰서 지나가는 구간 위에는 매달린 블록을 놓는다.
// 공은 박자마다(0·1·2·3박) 저절로 튀고, 한 번 튀면 1박자 뒤 4칸 앞에 착지한다. 꼭대기는 0.5박, 높이 2.25칸.
const PATTERNS = {
  idle:      { holds: [], presses: [] },
  // 떨어지는 길에 낮게 멈춰 미끄러지기 → 착지 → 그냥 튀기
  glideLow:  { holds: [[0.86, 1.72]], presses: [] },
  // 꼭대기에서 멈춰 넘어가기를 두 번
  glideHigh: { holds: [[0.5, 1.38], [2.5, 3.3]], presses: [] },
  // 꼭대기에서 이단 점프로 높은 기둥 넘기 → 착지 직전에 한 번 더 뛰어 박자 맞추기
  peak:      { holds: [], presses: [0.5, 2.5] },
  // 그림의 패턴: 올라가다 낮게 멈춤 → 놓고 솟아오름 → 이단 점프로 기둥 넘기 → 내려오다 중간 높이에서 멈춰 틈 지나가기
  weave:     { holds: [[0.14, 0.5], [1.86, 2.44]], presses: [0.86] },
  // 이단 점프한 꼭대기에서 길게 멈춰 높은 곳으로 지나가기
  skyGlide:  { holds: [[1.0, 1.9]], presses: [0.5] },
  // 낮게 멈췄다가 놓자마자 이단 점프, 다음 점프에서는 꼭대기 멈춤
  lowThenUp: { holds: [[0.88, 1.3], [2.1, 2.6]], presses: [1.32] },
  // 굴러가다 땅에서 점프 → 공중에서 멈춤
  roller:    { holds: [[2.25, 2.95]], presses: [0.5, 1.75], mF: 0.1 },
  // ---- 피버 구간(rush). 원버튼, 반 박(SLOT)마다 둘 중 하나를 고른다. 방식은 두 가지를 만들어 비교 중.
  // 방식 1 "hop": 두 배 빠르게 튄다. 튀는 순간 누르고 있으면 크게, 아니면 낮게.  slots = 반 박 8칸: H 크게 튀어야 함 / L 낮게 튀어야 함 / . 아무거나
  hE: { mode: "rush", kind: "hop", slots: "........" },
  h1: { mode: "rush", kind: "hop", slots: "...H...H" },
  h2: { mode: "rush", kind: "hop", slots: ".H.H.HLH" },
  h3: { mode: "rush", kind: "hop", slots: "HHLLHHLL" },
  h4: { mode: "rush", kind: "hop", slots: "HLHLHLHL" },
  h5: { mode: "rush", kind: "hop", slots: "HHHLHLLH" },
  h6: { mode: "rush", kind: "hop", slots: "LHLHHLHH" },
  h7: { mode: "rush", kind: "hop", slots: "HLHLHHH." },
  // 방식 2 "zig": 바닥과 천장 사이를 비스듬히 튕긴다. 누르면 다음 반 박 지점에서 위아래 방향이 뒤집힌다(가운데 높이에 있을 때만).
  //   nodes = 반 박 지점 8개(마디 안 0.5박, 1박, …, 4박): F 여기서 뒤집어야 함 / S 뒤집으면 안 됨 / . 상관없음. 마디는 바닥에서 시작해 바닥에서 끝나야 한다(뒤집기는 짝수 번).
  zE: { mode: "rush", kind: "zig", nodes: "........" },
  z1: { mode: "rush", kind: "zig", nodes: "..S.F.F." },
  z2: { mode: "rush", kind: "zig", nodes: "F.S.F.S." },
  z3: { mode: "rush", kind: "zig", nodes: "S.F.S.F." },
  z4: { mode: "rush", kind: "zig", nodes: "F.F.S.S." },
  z5: { mode: "rush", kind: "zig", nodes: "F.F.F.F." },
  z6: { mode: "rush", kind: "zig", nodes: "S.F.F.S." },
  z7: { mode: "rush", kind: "zig", nodes: "F.F.S.S." },
};

// 피버 패턴에 적힌 칸을 "어떻게 누르는가"(holds/presses)로 풀어 둔다. 다른 패턴과 같은 도구로 재고 검사할 수 있게.
for (const p of Object.values(PATTERNS)) {
  if (p.mode !== "rush") continue;
  p.holds = []; p.presses = [];
  if (p.kind === "hop") {                    // 크게 튈 칸이 이어지는 동안 누르고 있는다(튀는 순간보다 0.2박 먼저 누르고, 마지막으로 튄 뒤 0.28박에 뗀다)
    for (let i = 0; i < 8; i++) if (p.slots[i] === "H") { let j = i; while (j + 1 < 8 && p.slots[j + 1] === "H") j++; p.holds.push([i * 0.5 - 0.2, j * 0.5 + 0.28]); i = j; }
  } else for (let k = 1; k <= 8; k++) if (p.nodes[k - 1] === "F") p.presses.push(k * 0.5 - 0.2);   // 뒤집을 지점보다 0.2박 먼저 누른다
}
const FEVER_BARS = { hop: ["h1", "h2", "h3", "h4", "h5", "h6", "h7"], zig: ["z1", "z2", "z3", "z4", "z5", "z6", "z7"] };

const COURSE_BASE = {
  name: "패턴 코스", bpm: 96,
  bars: [
    "flat", "flat",
    "glideLow", "idle", "glideHigh", "idle", "glideLow", "glideHigh", "peak", "cp",
    "weave", "idle", "weave", "skyGlide", "idle", "lowThenUp", "weave", "cp",
    "roller", "peak", "lowThenUp", "idle", "skyGlide", "weave", "roller", "cp",
    "fever", "fever", "fever", "fever", "fever", "fever", "fever", "cp",          // 피버 구간(방식에 따라 채운다)
    "roller", "weave", "lowThenUp", "peak", "glideLow", "skyGlide", "weave", "goal",
    "flat",
  ],
  sections: [
    { bar: 0, id: "intro" }, { bar: 2, id: "a" }, { bar: 10, id: "b" }, { bar: 18, id: "c" }, { bar: 26, id: "rush" }, { bar: 34, id: "d" }, { bar: 41, id: "outro" },
  ],
};

// 피버 방식(hop | zig)을 골라 코스를 만든다
function courseFor(kind) {
  let i = 0;
  return { ...COURSE_BASE, fever: kind, bars: COURSE_BASE.bars.map((n) => (n === "fever" ? FEVER_BARS[kind][i++] : n)) };
}
const COURSE = courseFor("hop");

// ---- 피버 구간(rush): 튀는 것 자체가 세지는 구간. 원버튼.
// 속도: 물리는 다른 구간과 똑같이 한 박에 4칸이고, 화면에서 이 구간의 가로를 RUSH_STRETCH배로 늘려 그린다 → 눈에는 2배로 달리지만 박자(음악)와는 그대로 맞는다.
// 공은 늘리지 않으므로 이 구간에서 공의 판정 폭은 절반이다.
const RUSH_STRETCH = 2;
const HALF_RUSH = HALF / RUSH_STRETCH;
const SLOT = SUB / 2;                        // 피버의 한 칸 = 반 박
const HOP_LO = 0.9, HOP_HI = 2.6;            // hop: 낮게 / 크게 튈 때의 꼭대기 높이(칸). 어느 쪽이든 반 박 만에 내려온다
const HOP_LATE = 8;                          //      튄 직후 이만큼(스텝, 약 50ms)까지는 누르거나 뗀 것을 반영한다
const ZIG_TOP = 4.6;                         // zig: 천장 높이(칸)
const ZIG_STEP = (ZIG_TOP - SIZE) / 2;       //      반 박에 오르내리는 높이. 바닥·가운데·천장 세 높이를 오간다
const RED_T = 1.3;                           // 틀린 길을 막는 빨간 덩어리의 두께(칸)
const HAZ_MAX_H = 4;       // 바닥에서 솟는 장애물의 최대 높이(칸)
const WRONG_SHIFT = [-0.3, 0.3];   // "크게 어긋난 입력"으로 치는 박자 차이
const BLOCK_GROW = 1;      // 막는 칸에서 양옆으로 넓히는 칸 수
const CEIL_MAX_H = 6;      // 이 높이보다 위에서 시작하는 천장은 화면 밖이라 놓지 않는다

// 코스의 키 패턴을 스텝 단위 입력 계획으로 바꾼다
function coursePlan(course) {
  const presses = [], holds = [];
  course.bars.forEach((name, b) => {
    const p = PATTERNS[name];
    if (!p) return;
    for (const t of p.presses) presses.push(Math.round((4 * b + t) * SUB));
    for (const [a, z] of p.holds) holds.push([Math.round((4 * b + a) * SUB), Math.round((4 * b + z) * SUB)]);
  });
  return { presses, holds };
}

function emptyLevel(course) {
  const cols = course.bars.length * 16;
  const grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(cols).fill(r === ROWS - 1 ? "#" : "."));
  const cps = [], rides = [], reds = [], gems = [];
  let goalX = cols - 8;
  let zl = 0, zd = 1;                                   // zig: 패턴대로 갈 때의 높이 단계(0 바닥, 1 가운데, 2 천장)와 방향
  course.bars.forEach((name, b) => {
    const p = PATTERNS[name], x0 = b * 16;
    if (p && p.mode === "rush") {
      const last = rides[rides.length - 1];
      if (last && last[1] === x0 && last[2] === p.kind) last[1] = x0 + 16; else { rides.push([x0, x0 + 16, p.kind]); zl = 0; zd = 1; }
      if (p.kind === "hop") {
        if (rides[rides.length - 1][0] === x0 && p.slots[0] === "H") throw new Error("피버 첫 칸은 크게 튀게 할 수 없다: " + name);
        for (let i = 0; i < 8; i++) {
          const xs = x0 + 2 * i, c = p.slots[i];
          if (c === "H") reds.push({ x0: xs + 0.55, x1: xs + 1.45, lo: 0, hi: 1.25, kind: "floor" });          // 낮게 튀면 걸린다
          else if (c === "L") reds.push({ x0: xs + 0.4, x1: xs + 1.6, lo: 2.0, hi: 99, kind: "ceil" });       // 크게 튀면 걸린다
          if (c !== ".") for (const u of [0.25, 0.5, 0.75]) gems.push({ x: xs + 2 * u, h: (c === "H" ? HOP_HI : HOP_LO) * 4 * u * (1 - u) + HALF, big: u === 0.5 });
        }
      } else {
        for (let k = 1; k <= 8; k++) {
          const from = zl; zl += zd;
          const c = p.nodes[k - 1], xk = x0 + 2 * k;
          for (const u of [0.5, 1]) gems.push({ x: xk - 2 + 2 * u, h: (from + (zl - from) * u) * ZIG_STEP + HALF, big: u === 1 && zl === 1 });
          if (zl === 0 || zl === 2) { if (c !== ".") throw new Error(`바닥·천장에서는 고를 수 없다: ${name}의 ${k}번째 지점`); zd = -zd; continue; }
          const wrong = c === "F" ? zl + zd : c === "S" ? zl - zd : -1;       // 틀리게 갔을 때 다음 지점에서 닿는 곳(0 바닥 / 2 천장)
          if (c === "F") zd = -zd;
          if (wrong === 0) reds.push({ x0: xk + 2 - 0.6, x1: xk + 2 + 0.6, lo: 0, hi: RED_T, kind: "floor" });
          else if (wrong === 2) reds.push({ x0: xk + 2 - 0.6, x1: xk + 2 + 0.6, lo: ZIG_TOP - RED_T, hi: ZIG_TOP, kind: "ceil" });
        }
        if (zl !== 0) throw new Error("zig 마디는 바닥에서 끝나야 한다(뒤집기는 짝수 번): " + name);
      }
    }
    if (name === "cp") cps.push({ col: b * 16 + 6, beat: (b * 16 + 6) / TPB, bar: b });
    else if (name === "goal") goalX = b * 16 + 8;
    else if (name !== "flat" && !PATTERNS[name]) throw new Error("없는 패턴: " + name);
  });
  return { grid, cols, cps, rides, reds, gems, fever: course.fever || (rides[0] && rides[0][2]) || null, saws: [], sawCols: new Map(), switches: [], goalX, bpm: course.bpm, bars: course.bars.length, sections: course.sections, name: course.name };
}

// 패턴대로 달린 공의 자취(스텝마다 위치·상태)
function traceRun(L, plan) {
  const inp = planInput(plan), s = spawnState(L, -1), out = [];
  let air = 0, wasGround = true;
  while (!s.dead && !s.won) {
    const ev = [];
    stepState(L, s, inp.press.has(s.step + 1), ev, inp.hold.has(s.step + 1));
    if (!s.onGround && wasGround) air++;
    wasGround = s.onGround;
    out.push({ x: s.x, h: (ROWS - 1) - s.y, ground: s.onGround, frozen: s.frozen, air: s.onGround ? 0 : air, input: s.frozen || ev.some((e) => e.type === "double" || e.type === "jump") });
  }
  return { trace: out, end: s };
}

// 공이 닿은 패턴 장애물: { c, kind: "floor" | "ceil" }. 없으면 null. (판정은 그림보다 조금 작다)
function hazardAt(L, s) {
  const half = HALF, grace = 0.08;
  const c0 = Math.floor(s.x - half + 0.03), c1 = Math.floor(s.x + half - 0.03), fh = (ROWS - 1) - s.y;
  for (let c = c0; c <= c1; c++) {
    if (c < 0 || c >= L.cols || !(s.x + half - grace > c + 0.1 && s.x - half + grace < c + 0.9)) continue;
    if (fh + 0.06 < L.floorH[c]) return { c, kind: "floor" };
    if (fh + SIZE - 0.06 > L.ceilH[c]) return { c, kind: "ceil" };
  }
  return null;
}

// 코스 만들기: 키 패턴이 먼저, 장애물은 그 길에 맞춰 나중에.
//  1) 패턴대로 달린 길 + 입력을 하나씩 tol만큼 일찍/늦게 누른 길 = 공이 지나가도 되는 통로
//  2) 통로 바깥을 전부 장애물로 채운 "가장 빡빡한 코스"를 만든 뒤
//  3) 패턴을 틀리게 누른 달리기(안 누름, 하나 빼먹음, 멈춤↔점프를 바꿈, 크게 어긋남)를 실제로 막아 주는 덩어리만 남긴다
function buildLevel(course) {
  const L = emptyLevel(course);
  const plan = coursePlan(course);
  L.ref = plan;
  L.floorH = new Float32Array(L.cols);                 // 칸마다 바닥에서 솟는 장애물의 높이
  L.ceilH = new Float32Array(L.cols).fill(99);         // 칸마다 매달린 장애물의 아랫면 높이
  const base = planInput(plan), BAR = 4 * SUB;

  const env = [];                                      // 칸마다 통로: 공 바닥 높이의 범위와 땅에 닿는지
  for (let c = 0; c < L.cols; c++) env.push({ lo: 99, hi: -99, ground: false });
  const sweep = (s) => {
    const h = (ROWS - 1) - s.y, half = HALF;
    for (let c = Math.max(0, Math.ceil(s.x - 1 - half + 1e-9)); c <= Math.floor(s.x + half - 1e-9) && c < L.cols; c++) {
      const k = env[c];
      if (s.onGround) k.ground = true;
      if (h < k.lo) k.lo = h;
      if (h > k.hi) k.hi = h;
    }
  };
  // 기준 달리기. 마디가 시작될 때의 상태를 적어 두고, 달리 눌러 보는 달리기는 거기서부터 돌린다.
  const snaps = [];
  { const s = spawnState(L, -1);
    while (!s.dead && !s.won) {
      if (s.step % BAR === 0) snaps[s.step / BAR] = { ...s };
      stepState(L, s, base.press.has(s.step + 1), null, base.hold.has(s.step + 1));
      sweep(s);
    } }
  // b번 마디의 입력만 acts로 바꿔서 달린다(다른 마디는 패턴대로)
  const runBar = (b, acts, extraBeats, onStep) => {
    const lo = b * BAR, hi = lo + BAR, end = hi + extraBeats * SUB;
    const press = new Set(acts.presses.map((t) => lo + Math.round(t * SUB)));
    const holds = acts.holds.map(([a, z]) => [lo + Math.round(a * SUB), lo + Math.round(z * SUB)]);
    const s = { ...snaps[b] };
    while (!s.dead && !s.won && s.step < end) {
      const st = s.step + 1, inBar = st >= lo && st < hi;
      stepState(L, s, press.has(st) || (!inBar && base.press.has(st)), null, holds.some((h) => st >= h[0] && st < h[1]) || (!inBar && base.hold.has(st)));
      if (onStep) onStep(s);
    }
    return s;
  };
  const patternBars = [];
  course.bars.forEach((name, b) => { const p = PATTERNS[name]; if (p && p.mode !== "rush" && (p.holds.length || p.presses.length) && snaps[b]) patternBars.push([b, p]); });   // 피버 구간의 장애물은 패턴에서 바로 나온다

  // 1) 통로
  for (const [b, p] of patternBars) {
    const d = p.tol ?? 0.1;
    p.presses.forEach((t, i) => { for (const k of [-d, d]) runBar(b, { presses: p.presses.map((v, j) => (j === i ? v + k : v)), holds: p.holds }, 4, sweep); });
    p.holds.forEach((h, i) => { for (const k of [-d, d]) for (const e of [0, 1]) runBar(b, { presses: p.presses, holds: p.holds.map((v, j) => (j === i ? (e ? [v[0], v[1] + k] : [v[0] + k, v[1]]) : v)) }, 4, sweep); });
  }
  // 2) 통로 바깥을 전부 채운다
  for (const [b, p] of patternBars) {
    const mF = p.mF ?? 0.2, mC = p.mC ?? 0.2;
    for (let c = b * 16; c < b * 16 + 16; c++) {
      const k = env[c];
      if (k.lo > 90) continue;
      const fh = Math.min(HAZ_MAX_H, Math.floor((k.lo - mF) * 4) / 4);
      if (!k.ground && fh >= 0.5) L.floorH[c] = fh;
      const ch = Math.ceil((k.hi + SIZE + mC) * 4) / 4;
      if (ch <= CEIL_MAX_H) L.ceilH[c] = ch;
    }
  }
  // 3) 틀리게 누른 달리기를 실제로 막는 자리만 남긴다. 막은 칸의 높이 그대로, 통로가 허락하는 만큼 양옆으로 BLOCK_GROW칸까지 넓힌 네모 덩어리.
  const outF = new Float32Array(L.cols), outC = new Float32Array(L.cols).fill(99);
  const keep = (hit) => {
    const fl = hit.kind === "floor", v = fl ? L.floorH[hit.c] : L.ceilH[hit.c];
    for (const dir of [-1, 1]) for (let n = dir < 0 ? 0 : 1, c = hit.c + (dir < 0 ? 0 : 1); n <= BLOCK_GROW && c >= 0 && c < L.cols; n++, c += dir) {
      if (fl ? L.floorH[c] < v : L.ceilH[c] > v) break;
      if (fl) outF[c] = Math.max(outF[c], v); else outC[c] = Math.min(outC[c], v);
    }
  };
  for (const [b, p] of patternBars) {
    const wrong = [{ presses: [], holds: [] }];
    p.presses.forEach((t, i) => {
      const rest = p.presses.filter((_, j) => j !== i);
      wrong.push({ presses: rest, holds: p.holds }, { presses: rest, holds: [...p.holds, [t, t + 0.5]] });
      for (const k of WRONG_SHIFT) wrong.push({ presses: [...rest, t + k], holds: p.holds });
    });
    p.holds.forEach((h, i) => {
      const rest = p.holds.filter((_, j) => j !== i);
      wrong.push({ presses: p.presses, holds: rest }, { presses: [...p.presses, h[0]], holds: rest });
      for (const k of WRONG_SHIFT) wrong.push({ presses: p.presses, holds: [...rest, [h[0] + k, h[1] + k]] });
    });
    for (const w of wrong) {
      const s = runBar(b, w, 2);
      const hit = s.dead ? hazardAt(L, s) : null;
      if (hit && hit.c >= b * 16 && hit.c < b * 16 + 16) keep(hit);
    }
  }
  // 1/4칸짜리 잔턱은 없앤다(길이 넓어지는 쪽으로 맞춤)
  for (let c = 1; c < L.cols; c++) {
    if (outF[c] > 0 && outF[c - 1] > 0 && Math.abs(outF[c] - outF[c - 1]) <= 0.25) { const v = Math.min(outF[c], outF[c - 1]); for (let k = c; k >= 0 && outF[k] > 0 && outF[k] - v <= 0.25 && outF[k] !== v; k--) outF[k] = v; outF[c] = v; }
    if (outC[c] < 90 && outC[c - 1] < 90 && Math.abs(outC[c] - outC[c - 1]) <= 0.25) { const v = Math.max(outC[c], outC[c - 1]); for (let k = c; k >= 0 && outC[k] < 90 && v - outC[k] <= 0.25 && outC[k] !== v; k--) outC[k] = v; outC[c] = v; }
  }
  L.floorH = outF; L.ceilH = outC;
  // 패턴대로 달려 죽는 곳이 있으면 그 둘레의 장애물을 걷어 낸다(드물게 생긴다)
  L.fixed = [];
  for (let guard = 0; guard < 60; guard++) {
    const { end } = traceRun(L, plan);
    if (!end.dead) break;
    const c0 = Math.floor(end.x);
    for (let c = c0 - 1; c <= c0 + 1; c++) { L.floorH[c] = 0; L.ceilH[c] = 99; }
    L.fixed.push(c0);
  }
  return L;
}

// 디버그: 코스의 한 마디를 글자로 그린다 (o = 패턴대로 달린 공의 길)
function drawBar(L, b) {
  const { trace } = traceRun(L, L.ref);
  const H = 12, rows = [];                              // 반 칸 단위 12줄(높이 0~6)
  for (let i = 0; i < H; i++) rows.push(new Array(16).fill("."));
  for (let c = 0; c < 16; c++) for (let i = 0; i < H; i++) {
    const h = (H - 1 - i) * 0.5 + 0.25, col = b * 16 + c;
    if (h < L.floorH[col] || h > L.ceilH[col]) rows[i][c] = "X";
  }
  for (const t of trace) {
    const c = Math.floor(t.x) - b * 16, i = H - 1 - Math.floor((t.h + 0.4) / 0.5);
    if (c >= 0 && c < 16 && i >= 0 && i < H && rows[i][c] === ".") rows[i][c] = t.frozen ? "=" : "o";
  }
  return rows.map((r) => r.join("")).join("\n") + "\n################";
}

const rideAt = (L, x) => { for (const r of L.rides) if (x >= r[0] && x < r[1]) return r; return null; };
const inRide = (L, x) => !!rideAt(L, x);
// 원버튼: 화면 어디든 누르는 순간이 press, 누르고 있는 동안이 hold다.
// 피버 구간의 한 스텝. 반 박 지점(node)마다 갈 길이 정해진다.
function rushStep(L, s, press, ev, hold, r) {
  const local = s.step - Math.round(r[0] / TPB * SUB), t = local % SLOT, u = t / SLOT, node = t === 0;
  s.vy = 0; s.onGround = false; s.djAvail = false;
  let h;
  if (r[2] === "hop") {                                  // 두 배 빠르게 튄다. 튀는 순간 누르고 있으면 크게.
    if (node || t <= HOP_LATE) {
      const want = hold ? HOP_HI : HOP_LO;
      if (node || want !== s.hopT) { s.hopT = want; if (ev) ev.push({ type: "hop", high: !!hold, late: !node }); }
      if (local === 0) s.hopA = want;
    }
    s.hopA += (s.hopT - s.hopA) * 0.4;
    h = s.hopA * 4 * u * (1 - u);
  } else {                                               // 바닥과 천장 사이를 튕긴다. 누르면 다음 지점에서 뒤집힌다(가운데 높이에서만).
    if (press) s.zflip = 1;
    if (node && local > 0) {
      s.zlev += s.zdir;
      if (s.zlev <= 0 || s.zlev >= 2) { s.zdir = -s.zdir; if (ev) ev.push({ type: "rebound", top: s.zlev >= 2 }); }
      else if (s.zflip) { s.zdir = -s.zdir; if (ev) ev.push({ type: "flip" }); }
      s.zflip = 0;
    }
    h = (s.zlev + s.zdir * u) * ZIG_STEP;
  }
  s.y = (ROWS - 1) - h;
  const xa = s.x - HALF_RUSH * 0.8, xb = s.x + HALF_RUSH * 0.8, lo = h + 0.06, hi = h + SIZE - 0.06;
  for (const q of L.reds) if (xb > q.x0 && xa < q.x1 && hi > q.lo && lo < q.hi) return die(s, "spike", ev);
}

const tile = (L, c, r) => (r < 0 || r >= ROWS ? "." : c < 0 || c >= L.cols ? (r === ROWS - 1 ? "#" : ".") : L.grid[r][c]);
const isSolid = (L, c, r) => tile(L, c, r) === "#";

function sawY(w, beat) {
  const low = w.r + 0.5;
  if (w.kind === "static") return low;
  const k = Math.cos(Math.PI * beat);
  return low - SAW_TRAVEL * (w.kind === "even" ? 1 - k : 1 + k) / 2;
}

function groundY(L, col) {
  for (let r = 0; r < ROWS; r++) if (isSolid(L, col, r)) return r;
  return ROWS - 1;
}

// cp = -1이면 처음부터. 체크포인트에서는 한 박자 앞 평지에서 다시 시작한다.
function spawnState(L, cp = -1) {
  const beat = cp < 0 ? 0 : L.cps[cp].beat - 1;
  const step = Math.round(beat * SUB);
  const x = TPB * step / SUB;
  return {
    mode: "bounce", step, x, lead: 0, dashing: 0, y: groundY(L, Math.floor(x)), vy: 0, onGround: true,
    zlev: 0, zdir: 1, zflip: 0, hopA: 0, hopT: 0,
    djAvail: false, jbuf: 0, ring: -1,
    freeze: 0, frozen: false,
    cp, dead: false, cause: "", won: false,
  };
}

// 땅에서 뛰어오른다. kind: "bounce"(박자에 맞춰 저절로) | "jump"(눌러서) | "pad"(점프대)
function launch(s, kind, ev) {
  // 저절로 튈 때 박자보다 조금 늦었으면 그만큼 낮게 튀어 다음 박자에 맞춰 착지한다(계단을 내려갈 때 박자가 밀리지 않게)
  s.vy = kind === "pad" ? -V_PAD : kind === "jump" ? -V0 : -G * (1 - (s.step % SUB) / SUB) / 2;
  s.onGround = false; s.djAvail = true; s.jbuf = 0; s.freeze = FREEZE_STEPS;
  if (ev) ev.push({ type: kind });
}

// 박자에 맞춰 땅에 있으면 저절로 튄다
function tryBounce(L, s, ev) {
  if (s.step % SUB > BOUNCE_TOL) return;
  launch(s, tile(L, Math.floor(s.x), s.y - 1) === "J" ? "pad" : "bounce", ev);
}

function die(s, cause, ev) { s.dead = true; s.cause = cause; s.frozen = false; if (ev) ev.push({ type: "die", cause }); }

// 한 스텝 진행. press = 이 스텝에 점프를 눌렀는가, hold = 멈춤을 누르고 있는가.
function stepState(L, s, press, ev, hold) {
  if (s.dead || s.won) return;
  s.step++;
  if (press) s.jbuf = JUMP_BUF_STEPS;
  const ride = L.rides.length > 0 ? rideAt(L, TPB * s.step / SUB) : null;
  if (!!ride !== (s.mode === "rush")) {               // 관문을 지남
    s.mode = ride ? "rush" : "bounce";
    if (s.frozen) { s.frozen = false; if (ev) ev.push({ type: "unfreeze" }); }
    s.jbuf = 0; s.freeze = 0;
    s.zlev = 0; s.zdir = 1; s.zflip = 0; s.hopA = s.hopT = HOP_LO;
    if (!ride) { s.y = ROWS - 1; s.vy = 0; s.onGround = true; s.djAvail = false; }   // 바닥에 닿은 채로 나오고, 바로 이 박에 다시 튄다
    if (ev) ev.push({ type: "mode", mode: s.mode, kind: ride ? ride[2] : null });
  }
  if (ride) {
    s.x = TPB * s.step / SUB;
    rushStep(L, s, press, ev, hold, ride);
    if (s.dead) return;
  } else {
  if (s.onGround) {
    if (s.jbuf > 0) launch(s, "jump", ev);            // 굴러가는 중에 누르면 그 자리에서 점프
    else tryBounce(L, s, ev);
  } else if (s.jbuf > 0 && s.djAvail) {              // 공중: 이단 점프
    s.vy = -V0; s.djAvail = false; s.jbuf = 0;
    if (ev) ev.push({ type: "double" });
  }
  if (s.jbuf > 0) s.jbuf--;

  const frozen = !!hold && !s.onGround && s.freeze > 0;
  if (frozen !== s.frozen) { s.frozen = frozen; if (ev) ev.push({ type: frozen ? "freeze" : "unfreeze" }); }

  const prevFeet = s.y;
  if (frozen) s.freeze--;                             // 높이·속도 그대로. 세상만 흐른다.
  else if (!s.onGround) { s.vy += G * DT; s.y += s.vy * DT; }
  s.x = TPB * s.step / SUB;

  const c0 = Math.floor(s.x - HALF + 0.03), c1 = Math.floor(s.x + HALF - 0.03);
  if (s.onGround) {
    let support = false;
    for (let c = c0; c <= c1; c++) if (isSolid(L, c, s.y)) support = true;
    if (!support) { s.onGround = false; s.vy = 0; }  // 끝에서 굴러떨어짐(이단 점프는 그대로 남아 있다)
  } else if (!frozen) {
    if (s.vy >= 0) {
      const T = Math.floor(s.y);
      if (T >= Math.ceil(prevFeet - 1e-9) && T <= s.y) {
        for (let c = c0; c <= c1; c++) if (isSolid(L, c, T)) {
          s.y = T; s.vy = 0; s.onGround = true; s.djAvail = false;
          if (ev) ev.push({ type: "land" });
          if (s.jbuf === 0) tryBounce(L, s, ev);
          break;
        }
      }
    } else {
      const head = s.y - SIZE, B = Math.ceil(head);
      if (B <= prevFeet - SIZE + 1e-9 && B > head) {
        for (let c = c0; c <= c1; c++) if (isSolid(L, c, B - 1)) { s.y = B + SIZE; s.vy = 0; break; }
      }
    }
  }

  const top = s.y - SIZE;
  const r0 = Math.floor(top + 0.02), r1 = Math.floor(s.y - 0.02);
  for (let r = r0; r <= r1 && !s.dead; r++) for (let c = c0; c <= c1 && !s.dead; c++) {
    const t = tile(L, c, r);
    if (t === ".") continue;
    if (t === "#") {
      let rt = r;
      while (isSolid(L, c, rt - 1)) rt--;                 // 그 블록 기둥의 꼭대기
      if (s.y - rt <= CLIMB) {                           // 한 칸짜리 턱: 저절로 올라탄다
        s.y = rt;
        if (!frozen && !s.onGround) {
          s.vy = 0; s.onGround = true; s.djAvail = false;
          if (ev) ev.push({ type: "land" });
          if (s.jbuf === 0) tryBounce(L, s, ev);
        }
        if (ev) ev.push({ type: "climb" });
        r = r1 + 1; break;                                // 높이가 바뀌었으니 이번 스텝의 나머지 검사는 건너뛴다
      } else die(s, "crash", ev);
    } else if (t === "X") {
      if (s.x + HALF - 0.08 > c + 0.12 && s.x - HALF + 0.08 < c + 0.88 && s.y - 0.08 > r && top + 0.08 < r + 1) die(s, "spike", ev);
    } else if (t === "J") {
      if (s.onGround && r === s.y - 1) launch(s, "pad", ev);
    } else if (t === "O") {
      if (s.ring !== c) { s.ring = c; s.djAvail = true; if (ev) ev.push({ type: "ring", c, r }); }
    } else if (t === "^" || t === "v") {
      const hx0 = c + 0.22, hx1 = c + 0.78;
      const hy0 = t === "^" ? r + 0.4 : r, hy1 = t === "^" ? r + 1 : r + 0.6;
      if (s.x + HALF - 0.08 > hx0 && s.x - HALF + 0.08 < hx1 && s.y - 0.08 > hy0 && top + 0.08 < hy1) die(s, "spike", ev);
    }
  }
  }
  const top = s.y - SIZE, c0 = Math.floor(s.x - HALF + 0.03), c1 = Math.floor(s.x + HALF - 0.03);
  if (L.floorH && hazardAt(L, s)) die(s, "spike", ev);   // 패턴 통로의 장애물(바닥에서 솟은 덩어리와 매달린 덩어리)
  for (let c = c0 - 1; c <= c1 + 1 && !s.dead; c++) {
    const list = L.sawCols.get(c);
    if (!list) continue;
    for (const w of list) {
      const cx = w.c + 0.5, cy = sawY(w, s.step / SUB);
      const bx = Math.max(s.x - HALF + 0.06, Math.min(cx, s.x + HALF - 0.06));
      const by = Math.max(top + 0.06, Math.min(cy, s.y - 0.06));
      if ((bx - cx) ** 2 + (by - cy) ** 2 < SAW_R * SAW_R) { die(s, "saw", ev); break; }
    }
  }
  if (!s.dead && s.y > ROWS + 1.5) die(s, "fall", ev);
  if (s.dead) return;
  while (s.cp + 1 < L.cps.length && s.x >= L.cps[s.cp + 1].col + 0.5) { s.cp++; if (ev) ev.push({ type: "checkpoint", index: s.cp }); }
  if (s.x >= L.goalX + 0.5) { s.won = true; s.frozen = false; if (ev) ev.push({ type: "win" }); }
}

// ---------- 자동 풀이(검증용): grid 스텝마다 [아무것도 안 함 / 멈춤 누르고 있기 / 점프]를 탐색.
// opts.noFreeze, opts.noJump, opts.noGroundJump으로 입력을 막아 볼 수 있다. 결과: { presses: [스텝], holds: [[시작, 끝)] }
function solve(L, start, opts = {}) {
  const grid = opts.grid || 12, untilX = opts.untilX ?? Infinity;
  const s0 = { ...start };
  for (let i = 0; i < (opts.offset || 0); i++) stepState(L, s0, false, null, false);
  if (s0.dead) return { plan: null, best: s0.x };
  const seen = new Set();
  const key = (s) => `${s.step}|${Math.round(s.y * 16)}|${Math.round(s.vy * 2)}|${s.onGround ? 1 : 0}${s.djAvail ? 1 : 0}|${Math.ceil(s.freeze / 8)}|${s.zlev}${s.zdir}${s.zflip}|${s.hopT}`;
  const stack = [{ s: s0, node: null }];
  let best = s0.x;
  while (stack.length) {
    const { s, node } = stack.pop();
    if (s.won || s.x >= untilX) {
      const presses = [], holds = [];
      for (let n = node; n; n = n.prev) { if (n.a === "j") presses.push(n.step); else holds.push([n.step, n.step + grid]); }
      return { plan: { presses: presses.reverse(), holds: holds.reverse() }, best: s.x };
    }
    const k = key(s);
    if (seen.has(k)) continue;
    seen.add(k);
    if (s.x > best) best = s.x;
    const options = [];
    if (s.mode === "rush") options.push("j", "h");       // 피버는 원버튼이라 막지 않는다
    else {
      if (!opts.noJump && (s.onGround ? !opts.noGroundJump && s.step % SUB > BOUNCE_TOL : s.djAvail)) options.push("j");
      if (!s.onGround && s.freeze > 0 && !opts.noFreeze) options.push("h");
    }
    options.push("");                                  // 스택이라 마지막에 넣은 것(아무것도 안 함)을 먼저 시도
    for (const a of options) {
      const n = { ...s };
      stepState(L, n, a === "j", null, a === "h");
      for (let i = 1; i < grid && !n.dead && !n.won; i++) stepState(L, n, false, null, a === "h");
      if (n.dead) continue;
      stack.push({ s: n, node: a ? { step: s.step + 1, a, prev: node } : node });
    }
  }
  return { plan: null, best };
}

// 풀이를 스텝별 입력으로 바꾼다
function planInput(plan) {
  const press = new Set(plan.presses), hold = new Set();
  for (const [a, b] of plan.holds) for (let i = a; i < b; i++) hold.add(i);
  return { press, hold };
}

if (typeof module !== "undefined") module.exports = { TPB, SUB, ROWS, SIZE, HALF, FREEZE_STEPS, SAW_TRAVEL, JUMP_H, PATTERNS, COURSE, coursePlan, courseFor, FEVER_BARS, hazardAt, inRide, rideAt, RUSH_STRETCH, SLOT, HOP_LO, HOP_HI, ZIG_TOP, ZIG_STEP, traceRun, drawBar, buildLevel, spawnState, stepState, solve, planInput, groundY, tile, sawY };

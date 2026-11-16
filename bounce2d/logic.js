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
  // 누르는 시각은 모두 1/8박 단위다(곡의 음 단위). 누르는 순간이 곡의 소리와 겹치게 하려는 것.
  // tol = 통로를 만들 때 봐주는 타이밍 오차(박). 곡이 빨라서(한 박 0.39초) 넓게 잡았다. 너무 넓히면 장애물이 그 입력을 요구하지 못하게 되므로 패턴마다 다르다.
  // 떨어지는 길에 낮게 멈춰 미끄러지기 → 착지 → 그냥 튀기
  glideLow:  { holds: [[0.875, 1.75]], presses: [], tol: 0.14 },
  // 꼭대기에서 멈춰 넘어가기를 두 번
  glideHigh: { holds: [[0.5, 1.375], [2.5, 3.25]], presses: [], tol: 0.18 },
  // 꼭대기에서 이단 점프로 높은 기둥 넘기를 두 번
  peak:      { holds: [], presses: [0.5, 2.5], tol: 0.18 },
  // 그림의 패턴: 올라가다 낮게 멈춤 → 놓고 솟아오름 → 이단 점프로 기둥 넘기 → 내려오다 중간 높이에서 멈춰 틈 지나가기
  weave:     { holds: [[0.125, 0.5], [1.875, 2.5]], presses: [0.875], tol: 0.12 },
  // 이단 점프한 꼭대기에서 길게 멈춰 높은 곳으로 지나가기
  skyGlide:  { holds: [[1.0, 1.875]], presses: [0.5], tol: 0.18 },
  // 낮게 멈췄다가 놓자마자 이단 점프, 내려오다 한 번 더 멈춤
  lowThenUp: { holds: [[0.875, 1.25], [2.125, 2.625]], presses: [1.375], tol: 0.14 },
  // 이단 점프 → 굴러가다 땅에서 점프 → 공중에서 멈춤
  roller:    { holds: [[2.25, 3.0]], presses: [0.5, 1.75], mF: 0.1 },
  // ---- 피버 구간(rush). 원버튼(화면 어디든). 공이 바닥과 천장 사이를 비스듬히 튕기고, 누르는 즉시 위아래 방향이 뒤집힌다.
  //   nodes = 반 박 지점 8개(마디 안 0.5박, 1박, …, 4박): F 이 박에 뒤집어야 함 / S 뒤집으면 안 됨 / . 상관없음. F·S는 공이 가운데 높이를 지나는 지점에만 쓴다.
  //   마디는 바닥에서 시작해 바닥에서 끝나야 한다(뒤집기는 짝수 번).
  zE: { mode: "rush", nodes: "........" },
  z1: { mode: "rush", nodes: "..S.F.F." },
  z2: { mode: "rush", nodes: "F.S.F.S." },
  z3: { mode: "rush", nodes: "S.F.S.F." },
  z4: { mode: "rush", nodes: "F.F.S.S." },
  z5: { mode: "rush", nodes: "F.F.F.F." },
  z6: { mode: "rush", nodes: "S.F.F.S." },
  z7: { mode: "rush", nodes: "F.F.S.S." },
};

// 피버 패턴에 적힌 칸을 "어떻게 누르는가"(holds/presses)로 풀어 둔다. 다른 패턴과 같은 도구로 재고 검사할 수 있게.
for (const p of Object.values(PATTERNS)) {
  if (p.mode !== "rush") continue;
  p.holds = []; p.presses = [];
  for (let k = 1; k <= 8; k++) if (p.nodes[k - 1] === "F") p.presses.push(k * 0.5);   // 뒤집을 지점(가운데 높이를 지나는 반 박)에 맞춰 누른다
}

// 코스: "Octane Horizon" (Gemini로 만든 곡)에 맞춰 짰다.
// 곡은 분당 152박(킥이 매 박)이고, 공은 매 박(킥)마다 땅에 닿는다. 한 번 튀는 데 0.39초.
// (처음에는 두 박에 한 번 튀게 했는데 너무 느려서 바꿨다.)
// 한 마디(4박) = 약 1.58초. 곡은 64마디이고 65번째 마디 첫 박에 끝맺는 한 방이 있다.
// 곡의 구간(마디): 0~15 조용한 도입 / 16~27 첫 큰 구간 / 28~39 가장 밝고 센 구간 / 40~43 쉬어 감 / 44~51 다시 쌓음 / 52~63 마지막 절정
const COURSE = {
  name: "Octane Horizon",
  bpm: 152.0285,                                 // 곡에서 잰 값(킥 256개를 직선에 맞춤). 구간별 어긋남은 ±12ms 안쪽
  track: { file: "music/octane_horizon.mp3", offset: 0.8689 },   // offset = 첫 박이 나오는 곡 속 시각(초)
  bars: [
    // 도입: 멈춤과 이단 점프를 하나씩, 사이사이 쉬는 마디
    "flat", "flat", "glideLow", "idle", "glideLow", "idle", "glideHigh", "idle", "glideHigh", "idle", "peak", "idle", "peak", "idle", "glideLow", "cp",
    // 첫 큰 구간: 엮기 시작
    "glideHigh", "idle", "skyGlide", "idle", "weave", "idle", "skyGlide", "idle", "lowThenUp", "idle", "weave", "cp",
    // 가장 센 구간: 피버
    "z1", "z2", "z3", "z4", "z2", "z5", "z6", "z3", "z7", "z5", "z4", "cp",
    // 쉬어 감
    "idle", "glideLow", "idle", "glideHigh",
    // 다시 쌓음
    "peak", "idle", "roller", "idle", "weave", "idle", "lowThenUp", "cp",
    // 마지막 절정: 두 마디씩 이어 붙이고 한 마디 쉰다
    "weave", "lowThenUp", "idle", "roller", "skyGlide", "idle", "weave", "roller", "idle", "lowThenUp", "weave", "peak",
    "goal", "flat", "flat",
  ],
  sections: [
    { bar: 0, id: "intro" }, { bar: 16, id: "a" }, { bar: 28, id: "rush" }, { bar: 40, id: "c" }, { bar: 44, id: "b" }, { bar: 52, id: "d" }, { bar: 64, id: "outro" },
  ],
};

// ---- 피버 구간(rush): 튀는 것 자체가 세지는 구간. 원버튼.
// 속도: 물리는 다른 구간과 똑같이 한 박에 4칸이고, 화면에서 이 구간의 가로를 RUSH_STRETCH배로 늘려 그린다 → 눈에는 2배로 달리지만 박자(음악)와는 그대로 맞는다.
// 공은 늘리지 않으므로 이 구간에서 공의 판정 폭은 절반이다.
const RUSH_STRETCH = 1.5;
const HALF_RUSH = HALF / RUSH_STRETCH;
const SLOT = SUB / 2;                        // 피버의 한 칸 = 반 박
const ZIG_TOP = 4.6;                         // 천장 높이(칸)
const ZIG_STEP = (ZIG_TOP - SIZE) / 2;       //      반 박에 오르내리는 높이. 바닥·가운데·천장 세 높이를 오간다
const ZIG_GAP = 1.8;                         // 이빨 끝과 맞은편 면 사이의 틈(공은 0.8칸)
const TOOTH_W = 1.1;                         // 이빨의 반 너비(칸). 끝에서 밑동까지
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
      if (last && last[1] === x0) last[1] = x0 + 16; else { rides.push([x0, x0 + 16]); zl = 0; zd = 1; }
      {
        for (let k = 1; k <= 8; k++) {
          const from = zl; zl += zd;
          const c = p.nodes[k - 1], xk = x0 + 2 * k;
          gems.push({ x: xk - 1, h: (from + zl) / 2 * ZIG_STEP + HALF });
          gems.push({ x: xk, h: zl * ZIG_STEP + HALF, flip: c === "F" ? -zd : 0 });        // flip = 여기서 눌러야 한다(+1 위로, -1 아래로 바뀜)
          if (zl === 0 || zl === 2) { if (c !== ".") throw new Error(`바닥·천장에서는 고를 수 없다: ${name}의 ${k}번째 지점`); zd = -zd; continue; }
          const wrong = c === "F" ? zl + zd : c === "S" ? zl - zd : -1;       // 틀리게 갔을 때 다음 지점에서 닿는 곳(0 바닥 / 2 천장)
          if (c === "F") zd = -zd;
          // 다음 지점(바닥이나 천장에 닿는 곳)의 틀린 쪽 면에 삼각 이빨을 세운다. 이빨 끝은 맞은편 면에서 ZIG_GAP만큼 떨어져 있다.
          // → 틀린 쪽으로 가도, 가운데에 떠 있어도 걸린다. 이빨들 사이로 열린 길이 공이 가는 지그재그 모양 그대로다.
          if (wrong === 0) reds.push({ x0: xk + 2 - TOOTH_W, xt: xk + 2, x1: xk + 2 + TOOTH_W, kind: "floor", tip: ZIG_TOP - ZIG_GAP });
          else if (wrong === 2) reds.push({ x0: xk + 2 - TOOTH_W, xt: xk + 2, x1: xk + 2 + TOOTH_W, kind: "ceil", tip: ZIG_GAP });
        }
        if (zl !== 0) throw new Error("zig 마디는 바닥에서 끝나야 한다(뒤집기는 짝수 번): " + name);
      }
    }
    if (name === "cp") cps.push({ col: b * 16 + 6, beat: (b * 16 + 6) / TPB, bar: b });
    else if (name === "goal") goalX = b * 16 + 8;
    else if (name !== "flat" && !PATTERNS[name]) throw new Error("없는 패턴: " + name);
  });
  return { grid, cols, cps, rides, reds, gems, track: course.track || null, saws: [], sawCols: new Map(), switches: [], goalX, bpm: course.bpm, bars: course.bars.length, sections: course.sections, name: course.name };
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
    const d = p.tol ?? course.tol ?? 0.1;
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
  {
    // 바닥과 천장 사이를 튕긴다. 누르는 즉시 위아래 방향이 뒤집힌다.
    // 다만 바닥·천장에는 언제나 반 박 지점에 닿도록 속도를 맞춘다(누른 시각에서 가장 가까운 반 박 지점 + 반 박 뒤에 도착).
    // → 조금 일찍 누르면 천천히, 조금 늦게 누르면 빠르게 가서 같은 박에 닿는다. 타이밍 오차가 다음으로 넘어가지 않는다.
    const ZMAX = ZIG_TOP - SIZE;
    if (local > 0) s.zh = Math.max(0, Math.min(ZMAX, s.zh + s.zdir * s.zv * DT));
    if (s.step >= s.zarr) {                                // 바닥·천장에 닿음(항상 반 박 지점) → 튕겨서 한 박 뒤 반대쪽에 닿는다
      s.zh = s.zdir > 0 ? ZMAX : 0; s.zdir = -s.zdir; s.zv = ZMAX; s.zarr = s.step + 2 * SLOT;
      if (ev) ev.push({ type: "rebound", top: s.zdir < 0 });
    }
    if (press) {
      s.zdir = -s.zdir;
      const dist = s.zdir > 0 ? ZMAX - s.zh : s.zh;
      let arrive = (Math.round(local / SLOT) + 1) * SLOT;
      if (arrive - local < 8) arrive += SLOT;
      s.zarr = s.step - local + arrive; s.zv = dist / ((arrive - local) / SUB);
      if (ev) ev.push({ type: "flip" });
    }
    h = s.zh;
  }
  s.y = (ROWS - 1) - h;
  const xa = s.x - HALF_RUSH * 0.8, xb = s.x + HALF_RUSH * 0.8, lo = h + 0.06, hi = h + SIZE - 0.06;
  for (const q of L.reds) {
    if (xb <= q.x0 || xa >= q.x1) continue;
    const near = Math.abs(Math.max(xa, Math.min(q.xt, xb)) - q.xt) / TOOTH_W;      // 공에서 이빨 끝에 가장 가까운 x까지(0 = 끝, 1 = 밑동)
    if (q.kind === "ceil" ? hi > q.tip + (ZIG_TOP - q.tip) * near : lo < q.tip * (1 - near)) return die(s, "spike", ev);
  }
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
    zh: 0, zdir: 1, zv: 0, zarr: 0,
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
    if (ride) { s.zh = 0; s.zdir = 1; s.zv = ZIG_TOP - SIZE; s.zarr = s.step + 2 * SLOT; }
    else if (s.y > ROWS - 1 - 0.3) { s.y = ROWS - 1; s.vy = 0; s.onGround = true; s.djAvail = false; }   // 바닥에 닿은 채로 나오면 바로 이 박에 다시 튄다
    else { s.vy = 0; s.onGround = false; s.djAvail = false; }                                              // 공중에서 나오면 그대로 떨어진다
    if (ev) ev.push({ type: "mode", mode: s.mode });
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
  const key = (s) => `${s.step}|${Math.round(s.y * 16)}|${Math.round(s.vy * 2)}|${s.onGround ? 1 : 0}${s.djAvail ? 1 : 0}|${Math.ceil(s.freeze / 8)}|${s.zdir}|${s.zarr}`;
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

if (typeof module !== "undefined") module.exports = { TPB, SUB, ROWS, SIZE, HALF, FREEZE_STEPS, SAW_TRAVEL, JUMP_H, PATTERNS, COURSE, coursePlan, hazardAt, inRide, rideAt, RUSH_STRETCH, SLOT, ZIG_TOP, ZIG_STEP, ZIG_GAP, TOOTH_W, traceRun, drawBar, buildLevel, spawnState, stepState, solve, planInput, groundY, tile, sawY };

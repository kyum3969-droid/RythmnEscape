// ===================== 코스 로직 (렌더링/오디오와 분리, 결정적) =====================
// 단위: 거리 = 칸(tile), 시간 = 박자(beat). BPM이 달라도 물리는 같다.
// 플레이어는 박자당 TPB칸씩 자동 전진한다. 평지 점프는 정확히 1박자(= TPB칸) 걸린다.
const TPB = 4;                 // 박자당 칸
const SUB = 96;                // 박자당 물리 스텝
const DT = 1 / SUB;
const JUMP_H = 2.25;           // 점프 높이(칸)
const G = 8 * JUMP_H;          // 중력 (칸/박자²) → 체공 1박자
const V0 = 4 * JUMP_H;         // 점프 초속
const DASH_STEPS = SUB / 2;    // 대시 길이: 반 박자 동안 수평 비행
const DASH_LEAD = 1.5;         // 대시로 실제로 앞서 나가는 거리(칸)
const LEAD_DECAY = 1.0;        // 대시 후 원래 자리로 돌아오는 속도(칸/박자)
const GRACE_STEPS = 16;        // 대시가 끝난 직후에도 잠깐은 벽을 깬다(약 80ms)
const DASH_BUF_STEPS = 30;     // 대시할 수 없을 때 누른 입력을 기억하는 시간(약 150ms). 대시 중·고리 직전에 눌러도 이어진다
const COYOTE_STEPS = 8;        // 발판 끝을 벗어난 직후에도 점프 허용
const BUFFER_STEPS = 13;       // 착지 직전 입력을 점프로 예약
const SIZE = 0.8, HALF = 0.4;  // 플레이어 판정 상자
const ROWS = 10;               // 화면 세로 칸 수 (row 0 = 맨 위, row 9 = 바닥)
const STEP_UP = 0.22;          // 모서리에 살짝 걸렸을 때 올려주는 여유
const V_PAD = G * 1.5 / 2;     // 점프대: 체공 1.5박자(6칸), 높이 약 5칸
const SAW_R = 0.4;             // 톱날 판정 반지름
const SAW_TRAVEL = 2.2;        // 움직이는 톱날이 오르내리는 거리(칸)
const BOUNCE_TOL = 8;          // 바운스 모드: 박자 직후 이 스텝 안에 땅에 있으면 바로 튄다(그 뒤면 다음 박자까지 구름)

// 마디(16칸) 조각. 아래 6줄(row 4~9)만 적는다.  # 블록  ^ 바닥 가시  v 천장 가시  D 대시벽  C 체크포인트  G 결승선
// o 고정 톱날   S / s 박자에 맞춰 위아래로 움직이는 톱날(S는 짝수 박자에, s는 홀수 박자에 아래)
// J 점프대(밟으면 저절로 높이 솟음)   O 대시 충전 고리(지나가면 공중에서 대시가 다시 참)
// B / R = 화면 높이의 거대한 대시벽(모드 관문). 깨고 지나가면 B는 바운스 모드, R은 달리기 모드가 된다.
// 바운스 모드: 구슬이 박자마다 저절로 튄다(평지에서는 0·4·8·12번 칸에 착지). 플레이어는 공중 대시만 한다.
const E = "................", F = "################";
const CHUNKS = {
  flat:      [E, E, E, E, E, F],
  cp:        [E, E, E, E, "......C.........", F],
  goal:      [E, E, E, E, "........G.......", F],
  hop:       [E, E, E, E, "......^.......^.", F],
  double:    [E, E, E, E, "......^^......^^", F],
  double2:   [E, E, E, E, "....^^....^^....", F],
  gaps:      [E, E, E, E, E, "#####...####...#"],
  gaps2:     [E, E, E, E, E, "####...###...###"],
  steps:     [E, E, E, "........####....", "....########....", F],
  hopgap:    [E, E, E, E, "....^...........", "########...#####"],
  dashgap6:  [E, E, E, E, E, "####......######"],
  dashgap7:  [E, E, E, E, E, "####.......#####"],
  wall:      [E, ".........D......", ".........D......", ".........D......", "......^..D......", F],
  wallspike: [E, ".....D..........", ".....D..........", ".....D..........", ".....D.....^^...", F],
  wall2:     [E, ".....D......D...", ".....D......D...", ".....D......D...", ".....D......D...", F],
  wallgap:   [E, ".....D..........", ".....D..........", ".....D..........", ".....D..........", "######...#######"],   // 벽을 깨고 그대로 구덩이까지 건넘
  thick:     [E, "......DD........", "......DD........", "......DD........", "......DD....^^..", F],                  // 두꺼운 벽: 대시 시작이 정확해야 함
  up:        [E, E, E, "..........######", "......##########", F],
  bridge:    [E, E, E, "####.......#####", "####^^^^^^^#####", F],
  down:      [E, E, E, "####............", "####......^.....", F],
  mix1:      [E, "........D.......", "........D.......", "........D.......", "....^...D.....^^", F],
  mix2:      [E, E, E, E, E, "#####...###....#"],
  final:     [E, E, E, E, "....^^..........", "########.......#"],
  // ---- 톱날 · 점프대 · 고리 · 천장 가시
  sawlow:    [E, E, E, E, "......o......o..", F],                                                        // 바닥 톱날: 뛰어넘기
  nojump:    [E, "....########....", "....vvvvvvvv....", E, "...............^", F],                      // 낮은 천장 가시: 뛰지 말고 달리기
  pad1:      [E, E, "......###.......", "......###.......", "....J.###...^^..", F],                     // 점프대로 높은 벽 넘기
  saws1:     [E, E, E, E, "....S...S...S...", F],                                                        // 톱날이 위에 있으면 달리고, 아래 있으면 뛰기
  rings1:    [E, E, ".........O......", E, E, "####..........##"],                                       // 고리로 대시를 이어 긴 허공 건너기
  rings2:    [E, E, "........O..O....", E, E, "###............#"],
  padwall:   [E, ".......D........", ".......D........", ".......D........", "...J...D....^^..", F],     // 점프대로 벽 위를 넘거나, 대시로 깨거나
  sawmix:    [E, "........D.......", "........D.......", "........D.......", "....S...D...S..^", F],     // 톱날 밑은 달리고 → 벽은 대시 → 다시 톱날 밑 → 가시
  ringfinal: [E, "..........D.....", "........O.D.O...", "..........D.....", "..........D.....", "###............#"],
  // ---- 바운스 구간
  bgate_in:  [E, E, E, E, "........B.......", F],
  bb1:       [E, E, E, E, ".......^^.......", F],                                                        // 착지점에 가시 → 대시로 넘기
  bb2:       [E, "......D.........", "......D.........", "......D.........", "......D.........", F],     // 정점에 벽 → 대시로 깨기
  bb3:       [E, E, E, E, E, "#######..#######"],                                                         // 착지점에 구덩이
  bb4:       [E, "..D.............", "..D.............", "..D.............", "..D.......^^....", F],     // 벽을 깬 뒤에는 대시를 참아야 함
  bb5:       [E, E, E, E, ".......###..^^..", F],                                                        // 발판에서 튄 다음 착지점에 가시
  bbpad:     [E, E, E, E, "....J.^^^^^^....", F],                                                        // 점프대 = 큰 바운스. 가시밭이 넓어 대시도 필요
  bbring:    [E, "......D.........", "......D.O.......", "......D.O.......", "......D.........", "#########....###"],   // 벽을 깨고, 고리에서 한 번 더 대시
  bgate_out: [E, E, E, E, "......R.........", F],
};

// 곡 구성: 마디 순서. 8마디 단위, 각 구간의 마지막 마디는 체크포인트(숨 고르기).
const COURSE = {
  name: "첫 번째 코스", bpm: 128,
  bars: [
    "flat", "flat",
    "hop", "double", "gaps", "steps", "sawlow", "nojump", "hopgap", "cp",
    "dashgap6", "hop", "wall", "pad1", "dashgap7", "wallspike", "saws1", "cp",
    "rings1", "up", "bridge", "down", "wall2", "padwall", "rings2", "cp",
    "bgate_in", "bb1", "bb2", "bb3", "bbpad", "bbring", "bgate_out", "cp",
    "mix1", "sawmix", "up", "bridge", "down", "thick", "ringfinal", "goal",
    "flat",
  ],
  sections: [   // 음악/색 구간 (시작 마디)
    { bar: 0, id: "intro" }, { bar: 2, id: "a" }, { bar: 10, id: "b" }, { bar: 18, id: "c" }, { bar: 26, id: "bounce" }, { bar: 34, id: "d" }, { bar: 41, id: "outro" },
  ],
};

function buildLevel(course) {
  const cols = course.bars.length * 16;
  const grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(cols).fill("."));
  const cps = [], switches = [], saws = [];
  let goalX = cols - 8;
  course.bars.forEach((name, b) => {
    const ch = CHUNKS[name];
    if (!ch) throw new Error("없는 조각: " + name);
    ch.forEach((row, i) => {
      if (row.length !== 16) throw new Error(`조각 ${name}의 ${i}번째 줄 길이가 16이 아님`);
      for (let c = 0; c < 16; c++) {
        const t = row[c], col = b * 16 + c;
        if (t === "C") cps.push({ col, beat: col / TPB, bar: b });
        else if (t === "G") goalX = col;
        else if (t === "B" || t === "R") {
          switches.push({ col, mode: t === "B" ? "bounce" : "run" });
          for (let r = 0; r <= 4 + i; r++) grid[r][col] = "D";
        } else if (t === "o" || t === "S" || t === "s") {
          saws.push({ c: col, r: 4 + i, kind: t === "o" ? "static" : t === "S" ? "even" : "odd" });
        } else grid[4 + i][col] = t;
      }
    });
  });
  switches.sort((a, b) => a.col - b.col);
  const sawCols = new Map();
  for (const w of saws) { if (!sawCols.has(w.c)) sawCols.set(w.c, []); sawCols.get(w.c).push(w); }
  return { grid, cols, cps, switches, saws, sawCols, goalX, bpm: course.bpm, bars: course.bars.length, sections: course.sections, name: course.name };
}

const tile = (L, c, r) => (r < 0 || r >= ROWS ? "." : c < 0 || c >= L.cols ? (r === ROWS - 1 ? "#" : ".") : L.grid[r][c]);   // 코스 앞뒤는 평지
const isSolid = (L, c, r) => tile(L, c, r) === "#";

// 톱날 중심의 높이(row 좌표). 움직이는 톱날은 2박자 주기로 오르내린다.
function sawY(w, beat) {
  const low = w.r + 0.5;
  if (w.kind === "static") return low;
  const k = Math.cos(Math.PI * beat);            // 짝수 박자 +1, 홀수 박자 -1
  return low - SAW_TRAVEL * (w.kind === "even" ? 1 - k : 1 + k) / 2;
}

// 그 칸 열에서 서 있을 바닥 높이(위에서부터 처음 만나는 블록의 윗면)
function groundY(L, col) {
  for (let r = 0; r < ROWS; r++) if (isSolid(L, col, r)) return r;
  return ROWS - 1;
}

// cp = -1이면 처음부터. 체크포인트에서는 한 박자 앞(평지)에서 다시 달려 들어온다.
function spawnState(L, cp = -1) {
  const beat = cp < 0 ? 0 : L.cps[cp].beat - 1;
  const step = Math.round(beat * SUB);
  const x = TPB * step / SUB;
  let sw = 0;
  while (sw < L.switches.length && x >= L.switches[sw].col + 0.5) sw++;
  return {
    mode: sw > 0 ? L.switches[sw - 1].mode : "run", sw,
    step, x, lead: 0, y: groundY(L, Math.floor(x)), vy: 0, onGround: true,
    dashAvail: false, dashing: 0, grace: 0, coyote: 0, buffer: 0, dashBuf: 0, ring: -1,
    bA: -1, bB: -1,                // 마지막으로 깬 대시벽의 칸 범위(깨진 벽은 다시 닿아도 안전)
    cp, dead: false, cause: "", won: false,
  };
}

// 공중에서 대시가 가능하면 시작한다
function tryDash(s, ev) {
  if (s.onGround || !s.dashAvail || s.dashing > 0) return false;
  s.dashing = DASH_STEPS; s.dashAvail = false; s.vy = 0; s.dashBuf = 0;
  if (ev) ev.push({ type: "dash" });
  return true;
}

// 바운스 모드: 박자에 맞춰 땅에 있으면 저절로 튄다
function tryBounce(L, s, ev) {
  if (s.step % SUB > BOUNCE_TOL) return;
  const pad = tile(L, Math.floor(s.x), s.y - 1) === "J";     // 점프대 위라면 큰 바운스
  s.vy = pad ? -V_PAD : -V0; s.onGround = false; s.coyote = 0; s.dashAvail = true; s.dashBuf = 0;
  if (ev) ev.push({ type: pad ? "pad" : "bounce" });
}

function die(s, cause, ev) { s.dead = true; s.cause = cause; if (ev) ev.push({ type: "die", cause }); }

// 한 스텝 진행. press = 이 스텝에 버튼을 눌렀는가. ev에 연출용 이벤트가 쌓인다.
function stepState(L, s, press, ev) {
  if (s.dead || s.won) return;
  s.step++;
  if (s.mode === "bounce") {            // 점프는 박자가 해 준다. 입력은 공중 대시뿐.
    s.buffer = 0;
    if (s.onGround) tryBounce(L, s, ev);
    else { if (press) s.dashBuf = DASH_BUF_STEPS; if (s.dashBuf > 0) tryDash(s, ev); }
  } else {
    if (press) s.buffer = BUFFER_STEPS;
    if (s.buffer > 0 && (s.onGround || s.coyote > 0)) {
      s.vy = -V0; s.onGround = false; s.coyote = 0; s.dashAvail = true; s.buffer = 0; s.dashBuf = 0;
      if (ev) ev.push({ type: "jump" });
    } else {
      if (press && !s.onGround) s.dashBuf = DASH_BUF_STEPS;
      if (s.dashBuf > 0 && tryDash(s, ev)) s.buffer = 0;
    }
  }
  if (s.dashBuf > 0) s.dashBuf--;
  if (s.buffer > 0) s.buffer--;
  if (s.coyote > 0) s.coyote--;

  const prevFeet = s.y;
  if (s.dashing > 0) {
    s.lead += DASH_LEAD / DASH_STEPS;
    s.dashing--;
    if (s.dashing === 0) s.grace = GRACE_STEPS;
  } else {
    // 앞서 나간 만큼 서서히 제자리로. 연속 대시로 많이 앞섰으면 땅에서는 더 빨리 돌아온다(공중에서는 그대로 → 멀리 난다)
    if (s.lead > 0) s.lead = Math.max(0, s.lead - (s.onGround ? Math.min(2.5, LEAD_DECAY + Math.max(0, s.lead - DASH_LEAD) * 1.5) : LEAD_DECAY) * DT);
    if (s.grace > 0) s.grace--;
    if (!s.onGround) { s.vy += G * DT; s.y += s.vy * DT; }
  }
  s.x = TPB * s.step / SUB + s.lead;

  const c0 = Math.floor(s.x - HALF + 0.03), c1 = Math.floor(s.x + HALF - 0.03);
  if (s.onGround) {
    let support = false;
    for (let c = c0; c <= c1; c++) if (isSolid(L, c, s.y)) support = true;
    if (!support) { s.onGround = false; s.coyote = COYOTE_STEPS; s.dashAvail = true; s.vy = 0; }
  } else if (s.dashing === 0) {
    if (s.vy >= 0) {            // 떨어지는 중: 블록 윗면을 지났으면 착지
      const T = Math.floor(s.y);
      if (T >= Math.ceil(prevFeet - 1e-9) && T <= s.y) {
        for (let c = c0; c <= c1; c++) if (isSolid(L, c, T)) {
          s.y = T; s.vy = 0; s.onGround = true; s.dashAvail = false;
          if (ev) ev.push({ type: "land" });
          if (s.mode === "bounce") tryBounce(L, s, ev);
          break;
        }
      }
    } else {                    // 올라가는 중: 머리가 블록 아랫면에 닿으면 멈춤
      const head = s.y - SIZE, B = Math.ceil(head);
      if (B <= prevFeet - SIZE + 1e-9 && B > head) {
        for (let c = c0; c <= c1; c++) if (isSolid(L, c, B - 1)) { s.y = B + SIZE; s.vy = 0; break; }
      }
    }
  }

  // 몸이 겹친 칸 검사
  const top = s.y - SIZE;
  const r0 = Math.floor(top + 0.02), r1 = Math.floor(s.y - 0.02);
  for (let r = r0; r <= r1 && !s.dead; r++) for (let c = c0; c <= c1 && !s.dead; c++) {
    const t = tile(L, c, r);
    if (t === ".") continue;
    if (t === "#") {
      if (!s.onGround && s.dashing === 0 && s.vy >= 0 && s.y - r <= STEP_UP) {   // 모서리에 살짝 걸림 → 올려줌
        s.y = r; s.vy = 0; s.onGround = true; s.dashAvail = false;
        if (ev) ev.push({ type: "land" });
        if (s.mode === "bounce") tryBounce(L, s, ev);
      } else die(s, "crash", ev);
    } else if (t === "J") {                // 점프대: 밟는 순간 저절로 솟는다
      if (s.onGround && r === s.y - 1) {
        s.vy = -V_PAD; s.onGround = false; s.coyote = 0; s.dashAvail = true; s.buffer = 0; s.dashBuf = 0;
        if (ev) ev.push({ type: "pad" });
      }
    } else if (t === "O") {                // 충전 고리: 공중에서 대시가 다시 찬다
      if (s.ring !== c) { s.ring = c; s.dashAvail = true; if (ev) ev.push({ type: "ring", c, r }); }
    } else if (t === "D") {
      if (c >= s.bA && c <= s.bB) continue;          // 이미 깬 벽
      if (s.dashing > 0 || s.grace > 0) {            // 대시로 닿는 순간 그 벽(붙어 있는 칸 전부)이 깨져 사라진다
        let a = c, b = c;
        while (tile(L, a - 1, r) === "D") a--;
        while (tile(L, b + 1, r) === "D") b++;
        s.bA = a; s.bB = b;
        if (ev) for (let k = a; k <= b; k++) ev.push({ type: "break", c: k, r });
      } else die(s, "wall", ev);
    } else if (t === "^" || t === "v") {
      const hx0 = c + 0.22, hx1 = c + 0.78;
      const hy0 = t === "^" ? r + 0.4 : r, hy1 = t === "^" ? r + 1 : r + 0.6;
      if (s.x + HALF - 0.08 > hx0 && s.x - HALF + 0.08 < hx1 && s.y - 0.08 > hy0 && top + 0.08 < hy1) die(s, "spike", ev);
    }
  }
  for (let c = c0 - 1; c <= c1 + 1 && !s.dead; c++) {      // 톱날(원)과 몸(상자)
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
  while (s.sw < L.switches.length && s.x >= L.switches[s.sw].col + 0.5) {
    s.mode = L.switches[s.sw].mode; s.sw++; s.buffer = 0;
    if (ev) ev.push({ type: "mode", mode: s.mode });
  }
  if (s.x >= L.goalX + 0.5) { s.won = true; if (ev) ev.push({ type: "win" }); }
}

// ---------- 자동 풀이(검증용): grid 스텝마다 누를지 말지를 탐색. 깰 수 있으면 누른 스텝 목록을 돌려준다.
function solve(L, start, opts = {}) {
  const grid = opts.grid || 12, offset = opts.offset || 0;
  const untilX = opts.untilX ?? Infinity;      // 이 x까지만 가면 성공으로 침(구간 검증)
  const s0 = { ...start };
  for (let i = 0; i < offset; i++) stepState(L, s0, false);
  if (s0.dead) return null;
  const seen = new Set();
  const key = (s) => `${s.step}|${Math.round(s.y * 16)}|${Math.round(s.vy * 2)}|${s.onGround ? 1 : 0}${s.dashAvail ? 1 : 0}|${s.dashing}|${Math.round(s.lead * 8)}|${s.grace}|${s.mode}|${s.bB}`;
  const stack = [{ s: s0, node: null }];
  let best = s0.x;
  while (stack.length) {
    const { s, node } = stack.pop();
    if (s.won || s.x >= untilX) {
      const presses = [];
      for (let n = node; n; n = n.prev) presses.push(n.step);
      return { presses: presses.reverse(), best: s.x };
    }
    const k = key(s);
    if (seen.has(k)) continue;
    seen.add(k);
    if (s.x > best) best = s.x;
    const canDash = !s.onGround && s.dashAvail && s.dashing === 0;
    const canAct = s.mode === "bounce" ? canDash : s.onGround || s.coyote > 0 || canDash;
    const options = canAct ? [true, false] : [false];   // 스택이라 뒤에 넣은 것(안 누름)을 먼저 시도
    for (const press of options) {
      const n = { ...s };
      stepState(L, n, press);
      for (let i = 1; i < grid && !n.dead && !n.won; i++) stepState(L, n, false);
      if (n.dead) continue;
      stack.push({ s: n, node: press ? { step: s.step + 1, prev: node } : node });
    }
  }
  return { presses: null, best };
}

if (typeof module !== "undefined") module.exports = { TPB, SUB, ROWS, SIZE, HALF, DASH_STEPS, SAW_TRAVEL, CHUNKS, COURSE, buildLevel, spawnState, stepState, solve, groundY, tile, sawY };

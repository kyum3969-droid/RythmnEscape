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
const GRACE_STEPS = 6;         // 대시 직후 대시벽 통과 유예
const COYOTE_STEPS = 8;        // 발판 끝을 벗어난 직후에도 점프 허용
const BUFFER_STEPS = 13;       // 착지 직전 입력을 점프로 예약
const SIZE = 0.8, HALF = 0.4;  // 플레이어 판정 상자
const ROWS = 10;               // 화면 세로 칸 수 (row 0 = 맨 위, row 9 = 바닥)
const STEP_UP = 0.22;          // 모서리에 살짝 걸렸을 때 올려주는 여유

// 마디(16칸) 조각. 아래 6줄(row 4~9)만 적는다.  # 블록  ^ 바닥 가시  v 천장 가시  D 대시벽  C 체크포인트
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
  tunnel:    [E, ".....#####......", ".....vvvvv......", E, "......^^^.......", F],
  tunnel2:   [E, "....########....", "....vvvvvvvv....", E, "......^^^^......", F],
  up:        [E, E, E, "..........######", "......##########", F],
  bridge:    [E, E, E, "####.......#####", "####^^^^^^^#####", F],
  down:      [E, E, E, "####............", "####......^.....", F],
  mix1:      [E, "........D.......", "........D.......", "........D.......", "....^...D.....^^", F],
  mix2:      [E, E, E, E, E, "#####...###....#"],
  final:     [E, E, E, E, "....^^..........", "########.......#"],
};

// 곡 구성: 마디 순서. 8마디 단위, 각 구간의 마지막 마디는 체크포인트(숨 고르기).
const COURSE = {
  name: "첫 번째 코스", bpm: 128,
  bars: [
    "flat", "flat",
    "hop", "hop", "double", "gaps", "steps", "hopgap", "double2", "cp",
    "dashgap6", "hop", "wall", "double", "dashgap7", "wallspike", "gaps2", "cp",
    "tunnel", "up", "bridge", "down", "wall2", "tunnel", "hopgap", "cp",
    "mix1", "mix2", "up", "bridge", "down", "tunnel2", "final", "goal",
    "flat",
  ],
  sections: [   // 음악/색 구간 (시작 마디)
    { bar: 0, id: "intro" }, { bar: 2, id: "a" }, { bar: 10, id: "b" }, { bar: 18, id: "c" }, { bar: 26, id: "d" }, { bar: 33, id: "outro" },
  ],
};

function buildLevel(course) {
  const cols = course.bars.length * 16;
  const grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(cols).fill("."));
  const cps = [];
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
        else grid[4 + i][col] = t;
      }
    });
  });
  return { grid, cols, cps, goalX, bpm: course.bpm, bars: course.bars.length, sections: course.sections, name: course.name };
}

const tile = (L, c, r) => (r < 0 || r >= ROWS ? "." : c < 0 || c >= L.cols ? (r === ROWS - 1 ? "#" : ".") : L.grid[r][c]);   // 코스 앞뒤는 평지
const isSolid = (L, c, r) => tile(L, c, r) === "#";

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
  return {
    step, x, lead: 0, y: groundY(L, Math.floor(x)), vy: 0, onGround: true,
    dashAvail: false, dashing: 0, grace: 0, coyote: 0, buffer: 0,
    cp, dead: false, cause: "", won: false,
  };
}

function die(s, cause, ev) { s.dead = true; s.cause = cause; if (ev) ev.push({ type: "die", cause }); }

// 한 스텝 진행. press = 이 스텝에 버튼을 눌렀는가. ev에 연출용 이벤트가 쌓인다.
function stepState(L, s, press, ev) {
  if (s.dead || s.won) return;
  s.step++;
  if (press) s.buffer = BUFFER_STEPS;
  if (s.buffer > 0) {
    if (s.onGround || s.coyote > 0) {
      s.vy = -V0; s.onGround = false; s.coyote = 0; s.dashAvail = true; s.buffer = 0;
      if (ev) ev.push({ type: "jump" });
    } else if (press && s.dashAvail && s.dashing === 0) {
      s.dashing = DASH_STEPS; s.dashAvail = false; s.vy = 0; s.buffer = 0;
      if (ev) ev.push({ type: "dash" });
    }
  }
  if (s.buffer > 0) s.buffer--;
  if (s.coyote > 0) s.coyote--;

  const prevFeet = s.y;
  if (s.dashing > 0) {
    s.lead += DASH_LEAD / DASH_STEPS;
    s.dashing--;
    if (s.dashing === 0) s.grace = GRACE_STEPS;
  } else {
    if (s.lead > 0) s.lead = Math.max(0, s.lead - LEAD_DECAY * DT);
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
      } else die(s, "crash", ev);
    } else if (t === "D") {
      if (s.dashing > 0 || s.grace > 0) { if (ev) ev.push({ type: "break", c, r }); }
      else die(s, "wall", ev);
    } else if (t === "^" || t === "v") {
      const hx0 = c + 0.22, hx1 = c + 0.78;
      const hy0 = t === "^" ? r + 0.4 : r, hy1 = t === "^" ? r + 1 : r + 0.6;
      if (s.x + HALF - 0.08 > hx0 && s.x - HALF + 0.08 < hx1 && s.y - 0.08 > hy0 && top + 0.08 < hy1) die(s, "spike", ev);
    }
  }
  if (!s.dead && s.y > ROWS + 1.5) die(s, "fall", ev);
  if (s.dead) return;
  while (s.cp + 1 < L.cps.length && s.x >= L.cps[s.cp + 1].col + 0.5) { s.cp++; if (ev) ev.push({ type: "checkpoint", index: s.cp }); }
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
  const key = (s) => `${s.step}|${Math.round(s.y * 16)}|${Math.round(s.vy * 2)}|${s.onGround ? 1 : 0}${s.dashAvail ? 1 : 0}|${s.dashing}|${Math.round(s.lead * 8)}|${s.grace}`;
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
    const canAct = s.onGround || s.coyote > 0 || (s.dashAvail && s.dashing === 0);
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

if (typeof module !== "undefined") module.exports = { TPB, SUB, ROWS, SIZE, HALF, DASH_STEPS, CHUNKS, COURSE, buildLevel, spawnState, stepState, solve, groundY, tile };

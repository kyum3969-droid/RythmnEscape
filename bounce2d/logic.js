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

// 마디(16칸) 조각. 아래 6줄(row 4~9). 평지에서 공은 0·4·8·12번 칸에 착지한다.
// X 가시 기둥(닿으면 죽는 세로 구조)
// # 블록(한 칸 턱은 저절로 올라탐)  ^ 가시  O 점프 충전 고리  J 점프대  S/s 움직이는 톱날(S: 짝수 박자에 아래)  C 체크포인트  G 결승선
const E = "................", F = "################";
// 설계 규칙
//  - 공은 4칸마다(0·4·8·12번 칸) 착지한다. 착지 칸에 위험이 있으면 그 칸을 "건너뛰어야" 한다.
//  - 멈춤(최대 1박자 = 4칸)이나 이단 점프(꼭대기에서 쓰면 약 2.8칸 더) 하나로 착지 칸 하나를, 둘을 이으면 두 칸을 건너뛴다.
//  - 박자와 어긋나게 착지하면 다음 박자 칸까지 굴러간다. 굴러가는 동안에도 점프를 누르면 바로 뛴다.
//  - 착지 칸 사이의 가시는 그냥 튀면 넘어간다(쉬어 가는 박자).
//  - 가시 기둥(X): 닿으면 죽는 세로 구조. 2칸 높이 기둥은 꼭대기 근처(발 높이 2칸 이상)에서 멈춰서 넘는다.
//    튀어 오른 지 2~3칸째(예: 6번 칸)에 둬야 누를 시간이 넉넉하다. 3칸 높이는 이단 점프(높이 4.5칸)로 넘는다.
//  - 한 칸짜리 턱(#)은 저절로 올라탄다. 계단은 착지 칸(4의 배수)에서 한 칸씩 올린다.
//  - 움직이는 톱날을 착지 칸 위에 띄워 "멈추지 말라"는 함정으로 쓰지 않는다: 튀어 오르는 공이 내려오는 톱날에 걸린다.
const P = "################";       // 높은 길(2칸 높이 고원)의 한 줄
const CHUNKS = {
  flat:       [E, E, E, E, E, F],
  cp:         [E, E, E, E, "......C.........", F],
  goal:       [E, E, E, E, "........G.......", F],
  // ---- 멈춤
  fz1:        [E, E, E, E, ".......^^.......", F],                                                    // 착지 칸(8)에 가시
  fz3:        [E, E, E, E, E, "#######...######"],                                                     // 착지 칸에 구덩이
  fz4:        [E, E, E, E, "...^^......^^...", F],                                                    // 4번, 12번 칸: 한 마디에 두 번
  fz2:        [E, E, E, E, "......^^^^^.....", F],                                                    // 넓은 가시밭: 꼭대기 근처에서 길게
  sawland:    [E, E, E, E, "........S.......", F],                                                    // 착지 칸에서 오르내리는 톱날
  over:       [E, E, E, E, ".....^^......^^.", F],                                                    // 착지 칸 사이의 가시: 아무것도 안 해도 넘어간다
  // ---- 수직 함정
  col2:       [E, E, E, "......X.........", "......X.........", F],                                   // 2칸 기둥: 높은 곳에서 멈춰 넘기
  gate:       ["......X.........", "......X.........", E, E, "......X.........", F],                 // 위아래 기둥 사이의 틈: 그냥 튀면 꼭대기에서 지나간다
  colpair:    [E, E, E, "......X...X.....", "......X...X.....", F],                                   // 기둥 두 개: 멈춰서 하나 넘고, 이어서 이단 점프
  col3:       [E, E, ".......X........", ".......X........", ".......X........", F],                  // 3칸 기둥: 이단 점프로 넘기
  padcol:     [E, E, ".......X........", ".......X........", "....J..X.^^.....", F],                  // 점프대로 3칸 기둥을 넘고, 착지 칸의 가시는 멈춤이나 이단 점프로
  // ---- 계단과 높은 길
  up:         [E, E, E, "........########", "....############", F],                                   // 저절로 올라가는 계단
  hi:         [E, E, E, P, P, F],
  hi_fz:      [E, E, ".......^^.......", P, P, F],                                                    // 높은 길 위의 가시
  hi_gap:     [E, E, E, "#######...######", "#######...######", "#######...######"],                 // 높은 길이 끊긴 곳
  hi_col:     [E, "......X.........", "......X.........", P, P, F],                                   // 높은 길 위의 기둥
  down:       [E, E, E, "####............", "########........", F],                                   // 내려가는 계단
  // ---- 고리와 점프대
  ringchain:  [E, E, "..........O.....", "..........O.....", E, "###...........##"],                   // 긴 허공: 멈춤 + 이단 점프, 고리에서 충전해 한 번 더
  pad:        [E, E, E, E, "....J...^^^.....", F],
  padfield:   [E, E, E, E, "....J.^^^^^^....", F],
  long:       [E, E, E, E, ".....^^^^^^^....", F],                                                    // 착지 칸 두 개를 덮는 가시밭: 멈춤 + 이단 점프
};

const COURSE = {
  name: "바운스 코스", bpm: 96,
  bars: [
    "flat", "flat",
    "fz1", "over", "fz3", "fz4", "col2", "fz2", "sawland", "cp",
    "col3", "gate", "up", "hi_fz", "hi_gap", "down", "padcol", "cp",
    "long", "ringchain", "colpair", "pad", "long", "fz4", "padfield", "cp",
    "up", "hi_col", "hi_fz", "down", "colpair", "ringchain", "long", "cp",
    "col2", "long", "up", "hi_gap", "down", "col3", "colpair", "goal",
    "flat",
  ],
  sections: [
    { bar: 0, id: "intro" }, { bar: 2, id: "a" }, { bar: 10, id: "b" }, { bar: 18, id: "c" }, { bar: 26, id: "bounce" }, { bar: 34, id: "d" }, { bar: 41, id: "outro" },
  ],
};

function buildLevel(course) {
  const cols = course.bars.length * 16;
  const grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(cols).fill("."));
  const cps = [], saws = [];
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
        else if (t === "o" || t === "S" || t === "s") saws.push({ c: col, r: 4 + i, kind: t === "o" ? "static" : t === "S" ? "even" : "odd" });
        else {
          grid[4 + i][col] = t;
          if (t === "X" && i === 0) for (let r = 0; r < 4; r++) grid[r][col] = "X";   // 맨 윗줄의 기둥은 천장까지 이어진다
        }
      }
    });
  });
  const sawCols = new Map();
  for (const w of saws) { if (!sawCols.has(w.c)) sawCols.set(w.c, []); sawCols.get(w.c).push(w); }
  return { grid, cols, cps, saws, sawCols, switches: [], goalX, bpm: course.bpm, bars: course.bars.length, sections: course.sections, name: course.name };
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
  const key = (s) => `${s.step}|${Math.round(s.y * 16)}|${Math.round(s.vy * 2)}|${s.onGround ? 1 : 0}${s.djAvail ? 1 : 0}|${Math.ceil(s.freeze / 8)}`;
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
    if (!opts.noJump && (s.onGround ? !opts.noGroundJump && s.step % SUB > BOUNCE_TOL : s.djAvail)) options.push("j");
    if (!s.onGround && s.freeze > 0 && !opts.noFreeze) options.push("h");
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

if (typeof module !== "undefined") module.exports = { TPB, SUB, ROWS, SIZE, HALF, FREEZE_STEPS, SAW_TRAVEL, JUMP_H, CHUNKS, COURSE, buildLevel, spawnState, stepState, solve, planInput, groundY, tile, sawY };

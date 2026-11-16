// ===================== 바운스 버전 로직 (렌더링/오디오와 분리, 결정적) =====================
// 공은 박자마다 저절로 튄다. 입력은 둘뿐:
//   멈춤(누르고 있기): 공중에서 그 높이에 멈춘다. 세상은 계속 흐른다. 한 번 튈 때마다 최대 1박자.
//   대시(누르기): 반 박자 동안 수평으로 날며 1.5칸 앞서 나간다. 대시벽을 깬다.
// 단위: 거리 = 칸, 시간 = 박자. 공은 박자당 TPB칸씩 전진하고, 평지에서 한 번 튀면 정확히 1박자(4칸) 뒤에 착지한다.
const TPB = 4;                 // 박자당 칸
const SUB = 96;                // 박자당 물리 스텝
const DT = 1 / SUB;
const JUMP_H = 2.25;           // 튀는 높이(칸)
const G = 8 * JUMP_H;          // 중력 → 체공 1박자
const V0 = 4 * JUMP_H;
const V_PAD = G * 1.5 / 2;     // 점프대: 체공 1.5박자, 높이 약 5칸
const DASH_STEPS = SUB / 2;    // 대시 길이: 반 박자
const DASH_LEAD = 1.5;         // 대시로 앞서 나가는 거리(칸)
const LEAD_DECAY = 1.0;        // 앞선 거리가 줄어드는 속도(칸/박자)
const GRACE_STEPS = 16;        // 대시 직후에도 잠깐은 벽을 깬다
const DASH_BUF_STEPS = 30;     // 대시할 수 없을 때 누른 입력을 기억하는 시간
const FREEZE_STEPS = SUB;      // 한 번 튈 때마다 멈출 수 있는 시간: 1박자
const BOUNCE_TOL = 8;          // 박자 직후 이 스텝 안에 땅에 있으면 바로 튄다(그 뒤면 다음 박자까지 구름)
const SAW_R = 0.4, SAW_TRAVEL = 2.2;
const SIZE = 0.8, HALF = 0.4;
const ROWS = 10;               // row 0 = 맨 위, row 9 = 바닥
const STEP_UP = 0.22;

// 마디(16칸) 조각. 아래 6줄(row 4~9). 평지에서 공은 0·4·8·12번 칸에 착지한다.
// # 블록  ^ 가시  D 대시벽  O 대시 충전 고리  J 점프대  S/s 움직이는 톱날(S: 짝수 박자에 아래)  C 체크포인트  G 결승선
const E = "................", F = "################";
// 설계 규칙
//  - 공은 4칸마다(0·4·8·12번 칸) 착지한다. 착지 칸에 위험이 있으면 그 칸을 "건너뛰어야" 한다.
//  - 멈춤(최대 1박자 = 4칸)이나 대시(약 3.5칸) 하나로 착지 칸 하나를, 둘을 이으면 두 칸을 건너뛴다.
//  - 박자와 어긋나게 착지하면 다음 박자 칸까지 굴러간다. 그 길(다음 착지 칸까지)은 비워 둔다.
//  - 착지 칸 사이의 가시는 그냥 튀면 넘어간다(쉬어 가는 박자).
//  - 움직이는 톱날을 착지 칸 위에 띄워 "멈추지 말라"는 함정으로 쓰지 않는다: 튀어 오르는 공이 내려오는 톱날에 걸린다.
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
  // ---- 대시
  wall1:      [E, "......D.........", "......D.........", "......D.........", "......D.........", F], // 꼭대기의 벽
  walldouble: [E, "......D.......D.", "......D.......D.", "......D.......D.", "......D.......D.", F], // 벽 두 장: 대시, 착지, 다시 대시
  ringpit:    [E, "......D.........", "......D.O.......", "......D.O.......", "......D.........", "#########....###"],   // 벽을 깨고 고리에서 한 번 더
  ringchain:  [E, E, ".........O......", ".........O......", E, "#####.........##"],                   // 고리로 대시를 이어 허공 건너기
  // ---- 점프대
  pad:        [E, E, E, E, "....J...^^^.....", F],                                                    // 큰 바운스로 넘기(착지 칸 12가 안전해지도록 10번까지만)
  padfield:   [E, E, E, E, "....J.^^^^^^....", F],                                                    // 큰 바운스 + 공중에서 멈춤이나 대시
  padwall:    [E, E, ".......D........", ".......D........", "....J..D.^^.....", F],                  // 큰 바운스로 벽 위를 넘고, 착지 칸의 가시는 멈춰서 넘기
  // ---- 둘 다
  wallfield:  [E, "......D.........", "......D.........", "......D.........", "......D..^^^^...", F], // 대시로 벽을 깨고, 이어서 멈춰 가시밭 넘기
  long:       [E, E, E, E, ".....^^^^^^^....", F],                                                    // 착지 칸 두 개를 덮는 가시밭: 멈춤 + 대시
};

const COURSE = {
  name: "바운스 코스", bpm: 96,
  bars: [
    "flat", "flat",
    "fz1", "over", "fz3", "fz4", "sawland", "fz2", "fz4", "cp",
    "wall1", "over", "wallfield", "pad", "walldouble", "ringpit", "ringchain", "cp",
    "long", "fz4", "padfield", "wallfield", "sawland", "ringchain", "long", "cp",
    "walldouble", "long", "ringpit", "padwall", "fz2", "wallfield", "padfield", "cp",
    "long", "ringchain", "walldouble", "padwall", "fz4", "ringpit", "long", "goal",
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
        else grid[4 + i][col] = t;
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
    mode: "bounce", step, x, lead: 0, y: groundY(L, Math.floor(x)), vy: 0, onGround: true,
    dashAvail: false, dashing: 0, grace: 0, dashBuf: 0, ring: -1, bA: -1, bB: -1,
    freeze: 0, frozen: false,
    cp, dead: false, cause: "", won: false,
  };
}

function tryDash(s, ev) {
  if (s.onGround || !s.dashAvail || s.dashing > 0) return false;
  s.dashing = DASH_STEPS; s.dashAvail = false; s.vy = 0; s.dashBuf = 0;
  if (ev) ev.push({ type: "dash" });
  return true;
}

// 박자에 맞춰 땅에 있으면 저절로 튄다. 튈 때마다 대시와 멈춤이 다시 찬다.
function tryBounce(L, s, ev) {
  if (s.step % SUB > BOUNCE_TOL) return;
  const pad = tile(L, Math.floor(s.x), s.y - 1) === "J";
  launch(s, pad, ev);
}
function launch(s, pad, ev) {
  s.vy = pad ? -V_PAD : -V0; s.onGround = false; s.dashAvail = true; s.dashBuf = 0; s.freeze = FREEZE_STEPS;
  if (ev) ev.push({ type: pad ? "pad" : "bounce" });
}

function die(s, cause, ev) { s.dead = true; s.cause = cause; s.frozen = false; if (ev) ev.push({ type: "die", cause }); }

// 한 스텝 진행. press = 이 스텝에 대시를 눌렀는가, hold = 멈춤을 누르고 있는가.
function stepState(L, s, press, ev, hold) {
  if (s.dead || s.won) return;
  s.step++;
  if (s.onGround) tryBounce(L, s, ev);
  else { if (press) s.dashBuf = DASH_BUF_STEPS; if (s.dashBuf > 0) tryDash(s, ev); }
  if (s.dashBuf > 0) s.dashBuf--;

  const frozen = !!hold && !s.onGround && s.dashing === 0 && s.freeze > 0;
  if (frozen !== s.frozen) { s.frozen = frozen; if (ev) ev.push({ type: frozen ? "freeze" : "unfreeze" }); }

  const prevFeet = s.y;
  if (s.dashing > 0) {
    s.lead += DASH_LEAD / DASH_STEPS;
    s.dashing--;
    if (s.dashing === 0) s.grace = GRACE_STEPS;
  } else if (frozen) {
    s.freeze--;                                   // 높이·속도·앞선 거리 모두 그대로. 세상만 흐른다.
    if (s.grace > 0) s.grace--;
  } else {
    if (s.lead > 0) s.lead = Math.max(0, s.lead - (s.onGround ? Math.min(2.5, LEAD_DECAY + Math.max(0, s.lead - DASH_LEAD) * 1.5) : LEAD_DECAY) * DT);
    if (s.grace > 0) s.grace--;
    if (!s.onGround) { s.vy += G * DT; s.y += s.vy * DT; }
  }
  s.x = TPB * s.step / SUB + s.lead;

  const c0 = Math.floor(s.x - HALF + 0.03), c1 = Math.floor(s.x + HALF - 0.03);
  if (s.onGround) {
    let support = false;
    for (let c = c0; c <= c1; c++) if (isSolid(L, c, s.y)) support = true;
    if (!support) { s.onGround = false; s.dashAvail = true; s.vy = 0; }
  } else if (s.dashing === 0 && !frozen) {
    if (s.vy >= 0) {
      const T = Math.floor(s.y);
      if (T >= Math.ceil(prevFeet - 1e-9) && T <= s.y) {
        for (let c = c0; c <= c1; c++) if (isSolid(L, c, T)) {
          s.y = T; s.vy = 0; s.onGround = true; s.dashAvail = false;
          if (ev) ev.push({ type: "land" });
          tryBounce(L, s, ev);
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
      if (!s.onGround && s.dashing === 0 && !frozen && s.vy >= 0 && s.y - r <= STEP_UP) {
        s.y = r; s.vy = 0; s.onGround = true; s.dashAvail = false;
        if (ev) ev.push({ type: "land" });
        tryBounce(L, s, ev);
      } else die(s, "crash", ev);
    } else if (t === "J") {
      if (s.onGround && r === s.y - 1) launch(s, true, ev);
    } else if (t === "O") {
      if (s.ring !== c) { s.ring = c; s.dashAvail = true; if (ev) ev.push({ type: "ring", c, r }); }
    } else if (t === "D") {
      if (c >= s.bA && c <= s.bB) continue;
      if (s.dashing > 0 || s.grace > 0) {
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

// ---------- 자동 풀이(검증용): grid 스텝마다 [아무것도 안 함 / 멈춤 누르고 있기 / 대시]를 탐색.
// opts.noFreeze, opts.noDash로 한쪽 입력을 막아 볼 수 있다. 결과: { dashes: [스텝], holds: [[시작, 끝)] }
function solve(L, start, opts = {}) {
  const grid = opts.grid || 12, untilX = opts.untilX ?? Infinity;
  const s0 = { ...start };
  for (let i = 0; i < (opts.offset || 0); i++) stepState(L, s0, false, null, false);
  if (s0.dead) return { plan: null, best: s0.x };
  const seen = new Set();
  const key = (s) => `${s.step}|${Math.round(s.y * 16)}|${Math.round(s.vy * 2)}|${s.onGround ? 1 : 0}${s.dashAvail ? 1 : 0}|${s.dashing}|${Math.round(s.lead * 8)}|${s.grace}|${Math.ceil(s.freeze / 8)}|${s.bB}`;
  const stack = [{ s: s0, node: null }];
  let best = s0.x;
  while (stack.length) {
    const { s, node } = stack.pop();
    if (s.won || s.x >= untilX) {
      const dashes = [], holds = [];
      for (let n = node; n; n = n.prev) { if (n.a === "d") dashes.push(n.step); else holds.push([n.step, n.step + grid]); }
      return { plan: { dashes: dashes.reverse(), holds: holds.reverse() }, best: s.x };
    }
    const k = key(s);
    if (seen.has(k)) continue;
    seen.add(k);
    if (s.x > best) best = s.x;
    const air = !s.onGround && s.dashing === 0;
    const options = [];
    if (air && s.dashAvail && !opts.noDash) options.push("d");
    if (air && s.freeze > 0 && !opts.noFreeze) options.push("h");
    options.push("");                                  // 스택이라 마지막에 넣은 것(아무것도 안 함)을 먼저 시도
    for (const a of options) {
      const n = { ...s };
      stepState(L, n, a === "d", null, a === "h");
      for (let i = 1; i < grid && !n.dead && !n.won; i++) stepState(L, n, false, null, a === "h");
      if (n.dead) continue;
      stack.push({ s: n, node: a ? { step: s.step + 1, a, prev: node } : node });
    }
  }
  return { plan: null, best };
}

// 풀이를 스텝별 입력으로 바꾼다
function planInput(plan) {
  const dash = new Set(plan.dashes), hold = new Set();
  for (const [a, b] of plan.holds) for (let i = a; i < b; i++) hold.add(i);
  return { dash, hold };
}

if (typeof module !== "undefined") module.exports = { TPB, SUB, ROWS, SIZE, HALF, DASH_STEPS, FREEZE_STEPS, SAW_TRAVEL, JUMP_H, CHUNKS, COURSE, buildLevel, spawnState, stepState, solve, planInput, groundY, tile, sawY };

// ===================== 코어 엔진: 물리·판정·레벨 빌더(렌더링/오디오와 분리, 결정적) =====================
// 파일 나눔(유지보수): engine.js(이 파일: 상수·물리·움직이는 장애물·레벨 만들기) → patterns.js(마디 패턴과 그 도우미) → courses.js(라운드별 코스 데이터).
// 브라우저는 셋을 이 순서로 <script>로 읽는다(한 전역 공간을 같이 쓴다). Node는 logic.js가 같은 순서로 읽어 module.exports로 내보낸다.
//
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
// 이단 점프 보정: 이단 점프를 하려고 눌렀는데 땅 언저리에서 눌러 버린 경우를 뜻대로 해 준다.
// 튀어서 꼭대기까지가 반 박(약 0.2초)밖에 안 돼서, 박에 맞춰 누르면 공이 아직 땅 근처다. 그러면 전에는 낮은 데서 한 번 뛴 것으로 끝났다(땅에서 한 번 뛴 것처럼 보인다).
// 이제는 그런 누름을 "이번에 튀면 꼭대기에서 이단 점프"로 맡아 두었다가 꼭대기에서 한다.
const DJ_PRE = 0.15;                       // 땅에 닿기 이만큼(박, 약 59ms) 전부터 누른 것 → 다음에 튈 때의 꼭대기에서. (더 넓히면 "조금 늦게 누른 이단 점프"까지 다음 튐으로 넘어가 버린다)
const DJ_EARLY = Math.round(0.3 * SUB);    // 튀고 나서 이 스텝 안에 누른 것 → 이번 꼭대기에서(그 뒤에 누른 것은 전처럼 바로 한다)
const DJ_ROLL = Math.round(0.35 * SUB);    // 땅에서 구르는 중: 튀기까지 이 스텝이 안 남았으면 → 튄 뒤 꼭대기에서(더 일찍 누르면 전처럼 그 자리에서 뛴다)
const BOUNCE_TOL = 12;         // 박자 직후 이 스텝(1/8박) 안에 땅에 닿으면 바로 튄다. 늦은 만큼 낮게 튀어 다음 박자에 맞춰 착지한다
const SAW_R = 0.4, SAW_TRAVEL = 2.2;
const SIZE = 0.8, HALF = 0.4;
const ROWS = 10;               // row 0 = 맨 위, row 9 = 바닥
const STEP_UP = 0.22;

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
const TOOTH_H = ZIG_TOP - ZIG_GAP;           // 이빨의 길이(칸)
const KITE_W = 0.85;                         // 떠 있는 장애물(마름모)의 반 너비
const WIDE_TOP = 4;                          // 넓은 통로의 맨 위 단계(보통 통로는 2)
// 높은 박스: 이단 점프로만 넘는 빨간 박스. 멈춤으로 떠 있는 높이(2.25칸)보다 조금 높아서, 왼쪽(멈춤)으로는 못 넘고 오른쪽(이단 점프)으로만 넘는다.
//   패턴에 tall: [누르는 시각, ...]을 적으면, 그 이단 점프의 꼭대기 바로 밑(누른 자리에서 두 칸 앞)에 한 칸 너비로 선다.
//   높이 2.5칸이면 누르는 여유가 다른 동작과 비슷하다(약 ±0.2박). 더 높이면 그만큼 빡빡해진다(3칸이면 ±0.17박).
const TALL_H = 2.5, TALL_W = 1;
const RED_MIN = 1, RED_PAD = 0.3;   // 떠 있는 빨간 박스: 최소 두께(칸), 부딪힌 자리에서 더 남겨 두는 여유
const LAVA_H = 0.375;       // 빨간 바닥의 두께(칸)
const HAZ_MAX_H = 4;       // 바닥에서 솟는 장애물의 최대 높이(칸)
const WRONG_SHIFT = [-0.3, 0.3];   // "크게 어긋난 입력"으로 치는 박자 차이
const DECOR_GAP = 1;       // 꾸밈 박스와 공이 지나가는 통로 사이의 위아래 여유(칸)
const DECOR_TOP = 6;       // 꾸밈 박스 윗면의 최고 높이(칸): 가로 화면에서 땅 위로 7칸쯤 보이고, 맨 위 한 칸에는 진행 막대와 일시정지 버튼이 있다
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

// 틀린 길을 막는 장애물 하나. 공이 반 박 지점 xt에서 ok 단계에 있으면 지나가고, bad 단계에 있거나 그 사이에 떠 있으면 걸린다.
//  - bad가 바닥·천장이면 그 면에서 뻗은 삼각 이빨(floor / ceil)
//  - bad가 공중이면 떠 있는 마름모(float). 뾰족한 끝(tip)이 지나가는 쪽을 향한다
// tip은 언제나 지나가는 공에서 1칸 떨어져 있고, 그쪽 비탈의 기울기도 이빨과 같아서 타이밍 여유는 어떤 장애물이든 같다.
function hazard(xt, ok, bad, top, gap = 1) {       // gap = 지나가는 공과 뾰족한 끝 사이의 거리(칸). 연타 패턴은 조금 더 띄운다
  const up = bad > ok;                                              // 틀린 쪽이 위
  const tip = up ? ok * ZIG_STEP + SIZE + gap : ok * ZIG_STEP - gap;
  if (bad === 0) return { kind: "floor", xt, tip, far: 0, w: TOOTH_W, x0: xt - TOOTH_W, x1: xt + TOOTH_W };
  if (bad === top) return { kind: "ceil", xt, tip, far: top * ZIG_STEP + SIZE, w: TOOTH_W, x0: xt - TOOTH_W, x1: xt + TOOTH_W };
  return { kind: "float", xt, tip, far: up ? bad * ZIG_STEP + SIZE + 0.4 : bad * ZIG_STEP - 0.4, w: KITE_W, x0: xt - KITE_W, x1: xt + KITE_W };
}
// 튕김판(피버): 공중에 떠 있는 얇은 파란 판. 판에 닿으면 누르지 않아도 튕겨서 되돌아간다(바닥·천장에 닿은 것과 같다). 닿아서 죽는 일은 없다. 양쪽 면이 다 튕긴다.
//  - 앞면: 반 박 지점에서, 높이 단계 lv에 "from 방향으로 움직이며" 닿는 공을 되돌린다(from +1 = 올라오던 공 → 판이 공 바로 위에 있다, -1 = 내려오던 공 → 판이 공 바로 밑에 있다).
//    패턴(줄의 B)이 쓰는 면이다. 판이 놓이는 높이(padFace)는 그 공이 닿는 면: from +1이면 lv 단계의 공 윗면, -1이면 공 밑면.
//  - 뒷면: 반대쪽에서 오는 공도 튕긴다. 판이 얇아서(두께 PAD_TH) 뒷면에는 "지점과 지점의 한가운데"에서 닿는다 — 반 단계만 가다가 되돌아서, 다음 지점에는 떠난 높이로 돌아와 있다.
//    (두께를 반 단계 - 공의 크기로 잡으면 딱 한가운데에서 닿는다. 판의 반 너비 PAD_W = 1칸이라 판의 양 끝이 바로 그 자리다.)
//    지금 코스의 패턴은 앞면만 쓴다. 뒷면은 길을 벗어난 공이 닿을 때와, 나중에 뒷면을 쓰는 패턴을 위해 만들어 두었다.
//  - 처음에는 판 뒤에 빨간 몸통을 붙여 반대쪽에서 오면 죽게 했다가(한 변만 파란 세모), 파란 판만 있는 쪽이 깔끔하다는 의견으로 뺐다. 그 뒤로 뒷면은 그냥 지나가게 했다가, 양쪽 다 튕기게 바꿨다.
const PAD_TH = ZIG_STEP / 2 - SIZE, PAD_W = 1;
const padFace = (q) => (q.from > 0 ? q.lv * ZIG_STEP + SIZE : q.lv * ZIG_STEP);
// ---- 움직이는 장애물(movers, 9라운드부터): 프레스, 톱날(레일·궤도), 도는 막대, 움직이는 파란 발판.
// 패턴에 movers: [...]로 적는다. 자리(x)는 마디 안의 칸(0~16), 시각은 마디 안의 박(0~4). 레벨을 만들 때 코스의 칸·박으로 옮긴다.
// 움직임은 곡의 박에 맞춘 "궤적"이다: track = { P: 주기(박), at: 기준 박, keys: [[주기 안의 박, 값, 이음]] } — 이음은 lin(고르게), io(천천히-빠르게-천천히), in(점점 빠르게: 내려찍기), out(점점 느리게).
// 공의 자리는 시간에 묶여 있다(한 박에 네 칸). 그래서 움직이는 장애물은 "공이 그 자리를 지나가는 바로 그 순간" 어디에 있느냐로 길을 막고 연다.
// 늘 그 순간이 맞는 길에는 비켜 있고 틀린 길에는 걸리도록 짜 두고, 나머지 시간에는 박에 맞춰 크게 움직인다(곡과 함께 움직이는 무대).
//   press  { x0, x1, hover, low, track(아랫면 높이) }   천장에서 내려온 빨간 프레스. 아랫면 위로 하늘까지가 몸통이다
//   saw    { r, rail: [x0, h0, x1, h1], track(0~1) } 또는 { r, orbit: [x, h, R], P, at, a0, dir }   빨간 톱날(원). 레일을 오가거나 한 점을 돈다
//   bar    { pivot: [x, h], len, w, P, at, a0, dir }   한쪽 팔만 있는 빨간 막대가 축을 돈다(풍차)
//   plat   { w, h, track(왼쪽 끝 x) }   파란 발판(두께 한 칸, 윗면 높이 h칸). 오가며 공을 받는다
//   bomb   { x, H, r, P, at, fly }   용암 덩이(19라운드부터): 바닥의 분화구(x)에서 P박마다 at에 솟구쳐, fly박 동안 포물선으로 올라갔다(가장 높이 H칸, 가운데 높이) 다시 떨어진다.
//          솟아 있는 동안만 닿으면 죽는다(덩이 반지름 r). 땅속에 있는 동안은 분화구만 보인다 — 언제 솟는가(그때 덩이가 얼마나 높은가)가 손을 정한다
//   blink  { x0, x1, y0, y1, P, at, len }   깜빡이는 등롱(18라운드부터): 제자리에 걸린 등롱이 P박마다 at에 켜져 len박 동안 빛난다. 켜져 있을 때만 닿으면 죽는다(꺼진 등롱은 지나가도 된다)
//   jelly  { x, y, r0, r1, P, at }   해파리(17라운드부터): 제자리에서 박에 맞춰 부푼다. at에 가장 크게(r1) 부풀었다가(0.1박에 확) 반 주기 동안 천천히 줄어들고(r0) 그대로 쉰다. 몸통 전체(반지름 r)가 닿으면 죽는다
//   flame  { x0, x1, track(불길 윗면의 높이) }   불기둥(16라운드부터): 바닥의 환풍구에서 박에 맞춰 솟는 불길. 프레스를 뒤집은 것 — 바닥에서 윗면까지가 몸통이다
//   oring  { orbit: [x, h, R], P, at, a0, dir, r }   궤도 고리(15라운드부터): 충전 고리가 한 점(행성)을 돈다. 닿으면 충전 고리와 같다(이단 점프와 멈춤 1박을 다시 채운다). 닿아도 죽지 않는다
//   swing  { pivot: [x, h], len, r, amp, P, at }   흔들리는 돌추(14라운드부터): 나무 위(축)에 매달린 덩굴 끝의 빨간 돌덩이가 좌우로 흔들린다.
//          기울기 = amp·cos(2π(박 − at)/P)(라디안, +는 오른쪽): at에 오른쪽 끝, at + P/2에 왼쪽 끝, 그 사이 P/4마다 가장 낮은 곳(축 바로 밑)을 지난다. 닿으면 죽는 것은 돌덩이(반지름 r)뿐, 덩굴은 닿아도 된다
const EASE = { lin: (u) => u, io: (u) => u * u * (3 - 2 * u), in: (u) => u * u * u, out: (u) => 1 - (1 - u) * (1 - u) * (1 - u) };
function trackAt(tr, beat) {
  const P = tr.P, k = tr.keys, ph = ((((beat - tr.at) % P) + P) % P);
  for (let i = 0; i < k.length; i++) {
    const a = k[i], b = k[(i + 1) % k.length], ta = a[0], tb = i + 1 < k.length ? b[0] : b[0] + P;
    const t = ph >= ta ? ph : ph + P;
    if (t >= ta && t <= tb) return a[1] + (b[1] - a[1]) * (EASE[b[2] || "io"])(tb > ta ? (t - ta) / (tb - ta) : 1);
  }
  return k[0][1];
}
// 지금(박) 그 장애물의 모양: press → { x0, x1, y0 }(y0 = 아랫면), saw → { x, y, r }, bar → { ax, ay, bx, by, w }, plat → { x0, x1, y }(y = 윗면)
function moverShape(m, beat) {
  if (m.kind === "press") return { x0: m.x0, x1: m.x1, y0: trackAt(m.track, beat) };
  if (m.kind === "saw") {
    if (m.orbit) { const a = m.a0 + m.dir * 2 * Math.PI * (beat - m.at) / m.P; return { x: m.orbit[0] + m.orbit[2] * Math.cos(a), y: m.orbit[1] + m.orbit[2] * Math.sin(a), r: m.r }; }
    const u = trackAt(m.track, beat); return { x: m.rail[0] + (m.rail[2] - m.rail[0]) * u, y: m.rail[1] + (m.rail[3] - m.rail[1]) * u, r: m.r };
  }
  if (m.kind === "bar") { const a = m.a0 + m.dir * 2 * Math.PI * (beat - m.at) / m.P; return { ax: m.pivot[0], ay: m.pivot[1], bx: m.pivot[0] + m.len * Math.cos(a), by: m.pivot[1] + m.len * Math.sin(a), w: m.w, a }; }
  if (m.kind === "plat") { const x0 = trackAt(m.track, beat); return { x0, x1: x0 + m.w, y: m.h }; }
  if (m.kind === "flame") return { x0: m.x0, x1: m.x1, y1: trackAt(m.track, beat) };
  if (m.kind === "blink") { const ph = ((((beat - m.at) % m.P) + m.P) % m.P); return { x0: m.x0, x1: m.x1, y0: m.y0, y1: m.y1, on: ph < m.len, ph }; }
  if (m.kind === "bomb") { const ph = ((((beat - m.at) % m.P) + m.P) % m.P), u = ph / m.fly; return u < 1 ? { x: m.x, y: 4 * m.H * u * (1 - u), r: m.r, up: true, u, ph } : { x: m.x, y: -9, r: m.r, up: false, u: 1, ph }; }
  if (m.kind === "jelly") { const ph = ((((beat - m.at) % m.P) + m.P) % m.P) / m.P, back = ((((beat - m.at + 0.1) % m.P) + m.P) % m.P) / m.P, k = back < 0.1 / m.P ? back / (0.1 / m.P) : Math.max(0, 1 - ph / 0.5); return { x: m.x, y: m.y + 0.12 * Math.sin(2 * Math.PI * (beat - m.at) / m.P), r: m.r0 + (m.r1 - m.r0) * k, k }; }
  if (m.kind === "oring") { const a = m.a0 + m.dir * 2 * Math.PI * (beat - m.at) / m.P; return { x: m.orbit[0] + m.orbit[2] * Math.cos(a), y: m.orbit[1] + m.orbit[2] * Math.sin(a), r: m.r ?? 0.5, a }; }
  if (m.kind === "swing") { const a = m.amp * Math.cos(2 * Math.PI * (beat - m.at) / m.P); return { ax: m.pivot[0], ay: m.pivot[1], x: m.pivot[0] + m.len * Math.sin(a), y: m.pivot[1] - m.len * Math.cos(a), r: m.r, a }; }
  if (m.kind === "ram") {      // 옆으로 튀어나오는 망치: 집(xw에 붙은 쇳덩이)에서 머리가 dir 쪽으로 reach칸까지 나온다
    const e = m.reach * trackAt(m.track, beat), d = m.dir, hd = m.head ?? 0.7, hw = m.house ?? 1.0, yc = (m.y0 + m.y1) / 2;
    const tip = m.xw + d * e, hx0 = d < 0 ? tip - hd : tip, hx1 = d < 0 ? tip : tip + hd;
    return { e, u: e / m.reach, hx0, hx1, y0: m.y0, y1: m.y1, rx0: Math.min(m.xw, tip), rx1: Math.max(m.xw, tip), ry0: yc - 0.18, ry1: yc + 0.18,
      bx0: d < 0 ? m.xw : m.xw - hw, bx1: d < 0 ? m.xw + hw : m.xw, by0: m.y0 - 0.15, by1: m.y1 + 0.15 };
  }
  if (m.kind === "roller") {      // 분쇄 롤러: 제자리에서 돈다(둘이 맞물려 안쪽으로). rail이 있으면 레일을 따라 오르내린다
    const a = m.dir * beat * Math.PI * (m.spin ?? 1);
    if (m.rail) { const u = trackAt(m.track, beat); return { x: m.rail[0] + (m.rail[2] - m.rail[0]) * u, y: m.rail[1] + (m.rail[3] - m.rail[1]) * u, r: m.r, a }; }
    return { x: m.x, y: m.y, r: m.r, a };
  }
  return null;
}
// 공(가운데 x, 발 높이 h)이 그 장애물에 닿았나. 판정은 그림보다 조금 작다(공 둘레 0.06칸)
function moverKills(m, beat, x, h) {
  const g = 0.06, bx0 = x - HALF + g, bx1 = x + HALF - g, by0 = h + g, by1 = h + SIZE - g;
  const q = moverShape(m, beat);
  if (m.kind === "press") return bx1 > q.x0 && bx0 < q.x1 && by1 > q.y0;
  if (m.kind === "flame") return q.y1 > 0.05 && bx1 > q.x0 && bx0 < q.x1 && by0 < q.y1;
  if (m.kind === "blink") return q.on && bx1 > q.x0 && bx0 < q.x1 && by1 > q.y0 && by0 < q.y1;
  if (m.kind === "bomb" && !q.up) return false;
  if (m.kind === "saw" || m.kind === "roller" || m.kind === "swing" || m.kind === "jelly" || m.kind === "bomb") { const cx = Math.max(bx0, Math.min(q.x, bx1)), cy = Math.max(by0, Math.min(q.y, by1)); return (cx - q.x) ** 2 + (cy - q.y) ** 2 < q.r * q.r; }
  if (m.kind === "ram") { const hit = (x0, x1, y0, y1) => bx1 > x0 && bx0 < x1 && by1 > y0 && by0 < y1; return hit(q.hx0, q.hx1, q.y0, q.y1) || hit(q.rx0, q.rx1, q.ry0, q.ry1) || hit(q.bx0, q.bx1, q.by0, q.by1); }
  if (m.kind === "bar") {      // 공(원)과 막대(두께 있는 선분)
    const px = x, py = h + HALF, vx = q.bx - q.ax, vy = q.by - q.ay, u = Math.max(0, Math.min(1, ((px - q.ax) * vx + (py - q.ay) * vy) / (vx * vx + vy * vy)));
    const dx = px - (q.ax + vx * u), dy = py - (q.ay + vy * u);
    return dx * dx + dy * dy < (q.w / 2 + HALF - g) ** 2;
  }
  return false;
}
// 공이 딛을 수 있는 움직이는 발판: 그 칸 높이(행)에 윗면이 있고 공과 겹치는 것
function platUnder(L, x, row, beat) {
  if (!L.movers) return null;
  for (const m of L.movers) if (m.kind === "plat" && ROWS - 1 - m.h === row) { const q = moverShape(m, beat); if (x + HALF - 0.03 > q.x0 && x - HALF + 0.03 < q.x1) return m; }
  return null;
}
// 장애물이 가운데에서 dx만큼 떨어진 곳에서 차지하는 높이 범위 [아래, 위]
function hazardSpan(q, dx) {
  const a = Math.min(1, Math.abs(dx) / q.w), slope = TOOTH_H / TOOTH_W * q.w;      // 뾰족한 쪽 비탈: 이빨과 같은 기울기
  if (q.kind === "floor") return [0, q.tip * (1 - a)];
  if (q.kind === "ceil") return [q.tip + (q.far - q.tip) * a, q.far];
  return q.far > q.tip ? [q.tip + slope * a, q.far - (q.far - q.tip - slope) * a] : [q.far + (q.tip - slope - q.far) * a, q.tip - slope * a];
}

// 공중 사슬 마디(고리로 이어 뛰는 마디)에서, 공이 땅에서 굴러가는 자리 위에는 밑면이 이보다 낮은 덩어리를 두지 않는다. 1칸까지 내려오면 굴러가는 공 위로 0.2칸 틈뿐이라,
// 공중 사슬 뒤에 조금이라도 늦게 내려오면 걸렸다(6라운드 2-R4: "바닥으로 잘 들어가게끔")
const CEIL_MIN_H = 3;
function emptyLevel(course) {
  const cols = course.bars.length * 16;
  const grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(cols).fill(r === ROWS - 1 ? "#" : "."));
  const cps = [], rides = [], reds = [], gems = [], freeBars = new Set(), wideBars = new Set(), tallBars = new Set(), squeezes = [];
  const talls = [];                                     // 높은 박스: { x 가운데, w 너비, h 높이 }
  const capRed = new Map();                             // 파란 천장: 칸 → 그 위 빨간 덩어리의 밑면 높이
  const stairLo = new Map(), stairHi = new Map();       // 파란 발판: 반 박 지점 번호(x / 2) → 바닥 쪽·천장 쪽 높이 단계
  const movers = [];                                    // 움직이는 장애물(프레스, 톱날, 막대, 파란 발판)
  const pads = new Map();                               // 튕김판: 반 박 지점 번호 → { lv 높이 단계, from 공이 오던 방향 }
  let goalX = cols - 8;
  let zl = 0, zin = -1;                                 // 피버: 패턴대로 갈 때, 반 박 지점에서의 높이 단계(0 = 바닥)와 거기로 들어온 방향
  course.bars.forEach((name, b) => {
    const p = PATTERNS[name], x0 = b * 16;
    if (p && p.mode === "rush") {
      const last = rides[rides.length - 1];
      if (last && last[1] === x0) last[1] = x0 + 16; else { rides.push([x0, x0 + 16]); zl = 0; zin = -1; }
      if (p.free) freeBars.add(b);
      if (p.wide) wideBars.add(b);
      if (p.squeeze) {                                  // 조여드는 통로: 닿는 시각과 그때의 통로 폭(공이 오르내리는 거리)을 적어 둔다
        if (zl !== 0) throw new Error("조여드는 통로는 바닥에서 시작해야 한다: " + name);
        let sq = squeezes[squeezes.length - 1];
        if (!sq || sq.x1 !== x0 || sq.mid || p.mid) { sq = { x0, x1: x0, pts: [], mid: !!p.mid }; squeezes.push(sq); }
        let t = 0;
        for (const iv of p.squeeze) {
          const prev = sq.pts[sq.pts.length - 1];
          sq.pts.push({ step: Math.round((4 * b + t) * SUB), x: x0 + TPB * t, g: 2 * ZIG_STEP * Math.min(1, iv), top: prev ? !prev.top : false });
          t += iv;
        }
        if (Math.abs(t - 4) > 1e-9) throw new Error("squeeze는 한 마디에 4박어치여야 한다: " + name);
        sq.x1 = x0 + 16;
      } else if (squeezes.length && squeezes[squeezes.length - 1].x1 === x0 && !squeezes[squeezes.length - 1].mid) throw new Error("조여드는 통로 뒤에는 피버가 끝나야 한다: " + name);
      else {
        const top = p.wide ? WIDE_TOP : 2;
        if (zl !== (p.start ?? (p.wide ? WIDE_TOP : 0))) throw new Error("이 마디가 시작하는 높이가 앞 마디와 맞지 않는다: " + name);
        if ((p.lo || p.hi) && !p.free) throw new Error("파란 발판은 연출 마디에만 쓴다: " + name);
        for (let k = 0; k < 8; k++) {                   // k번째 반 박 지점에서 어디로 갈지 정한다
          const lo = p.lo ? +p.lo[k] : 0, hi = p.hi ? +p.hi[k] : top;
          if (lo > 0) stairLo.set(x0 / 2 + k, lo);
          if (hi < top) stairHi.set(x0 / 2 + k, hi);
          if (zl < lo || zl > hi) throw new Error(`공이 발판 속에 있다: ${name}의 ${k}번째 지점`);
          const c = k ? p.nodes[k - 1] : ".", xk = x0 + 2 * k, surface = zl <= lo || zl >= hi;
          if (surface && c !== ".") throw new Error(`바닥·천장에서는 고를 수 없다: ${name}의 ${k}번째 지점`);
          const nat = zl <= lo ? 1 : zl >= hi ? -1 : zin, dir = c === "F" || c === "B" ? -nat : nat;
          if (c === "B") pads.set(x0 / 2 + k, { lv: zl, from: zin, x: xk });      // B = 튕김판: 누르지 않아도 여기서 되돌아간다
          if (k) gems.push({ x: xk, h: zl * ZIG_STEP + HALF, flip: c === "F" ? dir : 0 });      // flip = 여기서 눌러야 한다(+1 위로, -1 아래로 바뀜)
          gems.push({ x: xk + 1, h: (zl + dir / 2) * ZIG_STEP + HALF });
          if (c === "F" || c === "S") {
            const q = hazard(xk + 2, zl + dir, zl - dir, top, p.gap);       // 다음 지점의 틀린 쪽을 막는다
            reds.push(q);
          }
          zl += dir; zin = dir;
        }
        const next = PATTERNS[course.bars[b + 1]];
        if (p.nodes[7] !== "." || zl !== (next && next.mode === "rush" ? next.start ?? (next.wide ? WIDE_TOP : 0) : 0)) throw new Error("피버 마디는 바닥에서(넓은 통로로 이어지면 천장에서) 끝나야 한다: " + name);
        gems.push({ x: x0 + 16, h: zl * ZIG_STEP + HALF });
      }
    }
    if (p && p.tall === true) tallBars.add(b);          // (계단 구간의 tall: true는 화면이 물러나야 하는 마디)
    if (p && Array.isArray(p.tall)) for (const t of p.tall) talls.push({ x: x0 + TPB * (t + 0.5), w: TALL_W, h: TALL_H });
    if (p && p.boxes) for (const [a, z, hh] of p.boxes) for (let c = x0 + a; c <= x0 + z; c++) for (let r = ROWS - 1 - hh; r < ROWS - 1; r++) grid[r][c] = "#";
    // 떠 있는 파란 박스: [첫 칸, 끝 칸, 윗면 높이]. 두께는 한 칸이고 밑은 비어 있다(밑으로 지나갈 수 있다).
    if (p && p.floats) for (const [a, z, hh] of p.floats) { if (hh < 2) throw new Error("떠 있는 박스는 밑으로 공이 지나갈 수 있어야 한다(윗면 2칸 이상): " + name); for (let c = x0 + a; c <= x0 + z; c++) grid[ROWS - 1 - hh][c] = "#"; }
    // 파란 천장: [첫 칸, 끝 칸, 밑면 높이]. 그 높이에 한 칸 두께의 파란 박스가 깔리고, 그 위는 하늘까지 빨간 덩어리다.
    // 밑에서는 파란 면에만 닿으므로 죽지 않고 머리가 닿아 떨어진다(점프 높이가 막힌다). 옆이나 위에서 빨간 부분에 닿으면 죽는다.
    if (p && p.caps) for (const [a, z, hb] of p.caps) { if (hb < 2) throw new Error("파란 천장 밑으로 공이 튈 수 있어야 한다(밑면 2칸 이상): " + name); for (let c = x0 + a; c <= x0 + z; c++) { grid[ROWS - 2 - hb][c] = "#"; capRed.set(c, hb + 1); } }
    if (p && p.rings) for (const [c, hh] of p.rings) grid[ROWS - 2 - hh][x0 + c] = "O";
    if (p && p.movers) for (const m0 of p.movers) {      // 마디 안의 칸·박 → 코스의 칸·박
      const m = JSON.parse(JSON.stringify(m0)), B = b * 4, X = x0;
      if (m.track) m.track.at += B;
      if (m.at !== undefined) m.at += B;
      if (m.x0 !== undefined) { m.x0 += X; m.x1 += X; }
      if (m.rail) { m.rail[0] += X; m.rail[2] += X; }
      if (m.orbit) m.orbit[0] += X;
      if (m.pivot) m.pivot[0] += X;
      if (m.xw !== undefined) m.xw += X;
      if ((m.kind === "roller" || m.kind === "jelly" || m.kind === "bomb") && m.x !== undefined) m.x += X;
      if (m.kind === "plat") m.track.keys = m.track.keys.map(([t, v, e]) => [t, v + X, e]);
      m.bar = b; m.id = movers.length; movers.push(m);
    }
    if (name === "cp") cps.push({ col: b * 16 + 6, beat: (b * 16 + 6) / TPB, bar: b });
    // 패턴이 있는 체크포인트 마디(cp: true. 5~8라운드, 개발하는 동안만): 그 마디가 시작하는 곳이 체크포인트다. 다시 시작하는 상태는 코스를 다 만든 뒤 패턴대로 달려서 정한다(buildLevel 끝)
    else if (p && p.cp) cps.push({ col: b * 16, beat: b * 4, bar: b, snap: null });
    else if (name === "goal") goalX = course.goalAt == null ? b * 16 + 8 : b * 16 + 4 * course.goalAt - 0.5;   // goalAt = 결승선을 지나는 박(그 마디 안에서). 안 적으면 둘째 박을 조금 지나서
    else if (name !== "flat" && !PATTERNS[name]) throw new Error("없는 패턴: " + name);
  });
  for (const sq of squeezes) { const e = sq.pts[sq.pts.length - 1]; sq.pts.push({ step: Math.round(sq.x1 / TPB * SUB), x: sq.x1, g: e.g, top: !e.top }); }   // 끝에서 한 번 더 닿는다
  // 피버가 끝나는(시작하는) 자리에 걸친 이빨은 벽이 끝나는 선에서 자른다. 안 자르면 이빨의 절반이 벽 밖 허공에 튀어나와 보인다(피버가 끝나는 지점의 천장 이빨이 늘 그랬다).
  // cut = +1 오른쪽 절반을 잘랐다 / -1 왼쪽 절반을 잘랐다. 판정도 잘린 쪽에는 없다.
  for (const q of reds) for (const r of rides) if (q.xt >= r[0] && q.xt <= r[1]) {
    if (q.x1 > r[1] + 1e-9) { q.x1 = r[1]; q.cut = 1; }
    if (q.x0 < r[0] - 1e-9) { q.x0 = r[0]; q.cut = -1; }
  }
  // 결승선 너머의 수정은 뺀다(피버가 결승선 바로 앞에서 끝나면, 마지막 마디 끝의 수정이 결승선 너머에 놓여 아무도 못 먹는다)
  for (let i = gems.length - 1; i >= 0; i--) if (gems[i].x > goalX) gems.splice(i, 1);
  // 사슬 고리: 1~3칸 앞뒤에 다른 고리가 있는 고리(칸 번호). 점프만 다시 채운다(멈춤은 채우지 않는다 — 고리마다 멈춤이 차면 멈춤을 쭉 누르고만 있어도 사슬을 건넌다)
  const chainCols = new Set();
  for (let c = 0; c < cols; c++) for (let r = 0; r < ROWS - 1; r++) {
    if (grid[r][c] !== "O") continue;
    for (let d = -3; d <= 3; d++) { if (!d || c + d < 0 || c + d >= cols) continue; for (let rr = Math.max(0, r - 2); rr <= Math.min(ROWS - 2, r + 2); rr++) if (grid[rr][c + d] === "O") chainCols.add(c); }
  }
  return { chainCols, grid, cols, cps, rides, reds, gems, freeBars, wideBars, tallBars, talls, capRed, squeezes, stairLo, stairHi, pads, movers, track: course.track || null, saws: [], sawCols: new Map(), switches: [], goalX, bpm: course.bpm, bars: course.bars.length, sections: course.sections, name: course.name };
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
    if (fh + 0.06 < L.floorH[c] && (!L.floorLo || fh + SIZE - 0.06 > L.floorLo[c])) return { c, kind: "floor" };
    if (fh + SIZE - 0.06 > L.ceilH[c] && (!L.ceilTop || fh + 0.06 < L.ceilTop[c])) return { c, kind: "ceil" };
    if (L.decor) { const q = L.decor.get(c); if (q) for (const [lo, hi] of q) if (fh + SIZE - 0.06 > lo && fh + 0.06 < hi) return { c, kind: "decor" }; }      // 꾸밈 박스
    if (L.bands) { const q = L.bands.get(c); if (q) for (const [lo, hi] of q) if (fh + SIZE - 0.06 > lo && fh + 0.06 < hi) return { c, kind: "band" }; }      // 계단의 빨간 단과 그 위의 뚜껑(한 칸에 여러 개 놓일 수 있다)
  }
  return null;
}

// 코스 만들기: 키 패턴이 먼저, 장애물은 그 길에 맞춰 나중에.
//  1) 패턴대로 달린 길 + 입력을 하나씩 tol만큼 일찍/늦게 누른 길 = 공이 지나가도 되는 통로
//  2) 통로 바깥을 전부 장애물로 채운 "가장 빡빡한 코스"를 만든 뒤
//  3) 패턴을 틀리게 누른 달리기(안 누름, 하나 빼먹음, 멈춤↔점프를 바꿈, 크게 어긋남)를 실제로 막아 주는 덩어리만 남긴다
// ---- 빨간 덩어리의 그림 모양: 바닥 덩어리·매달린 덩어리·떠 있는 덩어리·계단 덩어리를 따로 그리면, 맞닿은 둘 사이에 테두리가 그어져 두 개로 보였다.
//   맞닿거나 겹치는 것은 한 덩어리로 합쳐, 바깥 둘레만 테두리로 두른다. 결과는 칸 단위의 둘레(고리) 목록: 꼭짓점마다 { x, y, s, open }
//   s = 세로 변을 안쪽으로 조금 들이는 방향(-1 오른쪽 변, +1 왼쪽 변), open = 그 꼭짓점에서 다음 꼭짓점까지의 변을 긋지 않는다(땅에 붙은 밑변, 하늘 끝).
//   떠 있는 덩어리는 칸마다 밑이 다를 수 있다(11라운드) — 전에는 첫 칸의 밑으로 그려서 빈 곳까지 칠했다. 이제 칸마다 제 밑으로.
const RED_SKY = 40;
function redOutlines(L) {
  if (!L.floorH) return [];
  const n = L.floorH.length, R = [], eps = 1e-6;
  const F2 = Array.from({ length: n * 2 }, (_, k) => (L.floorLo[k >> 1] > 0 ? 0 : L.floorH[k >> 1]));
  for (const q of L.talls || []) for (let k = Math.round((q.x - q.w / 2) * 2); k < Math.round((q.x + q.w / 2) * 2); k++) if (k >= 0 && k < F2.length) F2[k] = Math.max(F2[k], q.h);
  for (let k = 0; k < F2.length; k++) if (F2[k] > 0) R.push({ x0: k / 2, x1: k / 2 + 0.5, y0: 0, y1: F2[k], k: "g" });
  for (let c = 0; c < n; c++) {
    if (L.ceilH[c] < 90 && L.ceilTop[c] >= 90) R.push({ x0: c, x1: c + 1, y0: L.ceilH[c], y1: RED_SKY, k: "s" });
    if (L.floorLo[c] > 0 && L.floorH[c] > L.floorLo[c]) R.push({ x0: c, x1: c + 1, y0: L.floorLo[c], y1: L.floorH[c], k: "f" });
    if (L.ceilTop[c] < 90 && L.ceilTop[c] > L.ceilH[c]) R.push({ x0: c, x1: c + 1, y0: L.ceilH[c], y1: L.ceilTop[c], k: "c" });
  }
  if (L.bands) for (const [c, q] of L.bands) for (const [lo, hi] of q) if (hi > lo) R.push({ x0: c, x1: c + 1, y0: lo, y1: hi, k: "b" });
  if (L.decor) for (const [c, q] of L.decor) for (const [lo, hi] of q) if (hi > lo) R.push({ x0: c, x1: c + 1, y0: lo, y1: hi, k: "b" });
  R.sort((a, b) => a.x0 - b.x0);
  const par = R.map((_, i) => i), find = (i) => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length && R[j].x0 <= R[i].x1 + eps; j++) {
    const p = R[i], q = R[j], xo = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0), yo = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
    if ((xo > eps && yo > -eps) || (yo > eps && xo > -eps)) par[find(i)] = find(j);
  }
  const groups = new Map();
  R.forEach((r, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); });
  const out = [];
  for (const rs of groups.values()) {
    const xs = [...new Set(rs.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b), ys = [...new Set(rs.flatMap((r) => [r.y0, r.y1]))].sort((a, b) => a - b);
    const xi = new Map(xs.map((v, i) => [v, i])), yi = new Map(ys.map((v, i) => [v, i])), W = xs.length - 1, H = ys.length - 1;
    const fill = new Uint8Array(W * H), F = (i, j) => i >= 0 && j >= 0 && i < W && j < H && fill[i * H + j] === 1;
    for (const r of rs) for (let i = xi.get(r.x0); i < xi.get(r.x1); i++) for (let j = yi.get(r.y0); j < yi.get(r.y1); j++) fill[i * H + j] = 1;
    // 둘레의 변: 칠한 칸이 왼쪽에 오도록(반시계) 방향을 준다
    const edges = [];
    for (let i = 0; i < W; i++) for (let j = 0; j < H; j++) {
      if (!F(i, j)) continue;
      if (!F(i, j - 1)) edges.push([i, j, i + 1, j]);
      if (!F(i + 1, j)) edges.push([i + 1, j, i + 1, j + 1]);
      if (!F(i, j + 1)) edges.push([i + 1, j + 1, i, j + 1]);
      if (!F(i - 1, j)) edges.push([i, j + 1, i, j]);
    }
    const from = new Map(); edges.forEach((e, k) => { const key = e[0] + "," + e[1]; if (!from.has(key)) from.set(key, []); from.get(key).push(k); });
    const used = new Uint8Array(edges.length), loops = [];
    for (let k0 = 0; k0 < edges.length; k0++) {
      if (used[k0]) continue;
      const seq = []; let k = k0;
      while (k !== undefined && !used[k]) { used[k] = 1; seq.push(edges[k]); const e = edges[k]; k = (from.get(e[2] + "," + e[3]) || []).find((q) => !used[q]); }
      // 같은 방향으로 이어지는 변을 하나로
      const pts = [];
      for (let t = 0; t < seq.length; t++) {
        const e = seq[t], pv = seq[(t - 1 + seq.length) % seq.length];
        const d = [Math.sign(e[2] - e[0]), Math.sign(e[3] - e[1])], dp = [Math.sign(pv[2] - pv[0]), Math.sign(pv[3] - pv[1])];
        if (d[0] !== dp[0] || d[1] !== dp[1]) pts.push({ i: e[0], j: e[1], d });
      }
      const m = pts.length;
      loops.push(pts.map((v, t) => {
        const nx = pts[(t + 1) % m], pv = pts[(t - 1 + m) % m];
        const vert = v.d[0] === 0 ? v.d : pv.d;                 // 이 꼭짓점에 닿은 세로 변의 방향
        const y = ys[v.j], horiz = v.d[1] === 0;
        return { x: xs[v.i], y, s: vert[1] > 0 ? -1 : 1, open: horiz && (y <= eps || y >= RED_SKY - eps) && ys[nx.j] === y };
      }));
    }
    out.push({ x0: xs[0], x1: xs[W], sky: rs.some((r) => r.k === "s"), ground: rs.some((r) => r.k === "g"), allC: rs.every((r) => r.k === "c"), loops, n: rs.length });
  }
  return out.sort((a, b) => a.x0 - b.x0);
}
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
  course.bars.forEach((name, b) => { const p = PATTERNS[name]; if (p && p.mode !== "rush" && !p.stair && !p.set && (p.holds.length || p.presses.length || (p.traps && !p.sneaky)) && snaps[b]) patternBars.push([b, p]); });      // (계단 마디(stair)에는 장애물을 따로 만들지 않는다: 빨간 단·뚜껑·빨간 바닥을 손으로 다 놓았다)   // 피버 구간의 장애물은 패턴에서 바로 나온다

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
      // 파란 박스가 있는 칸에는, 박스 위로 반 칸 넘게 솟을 때만 빨간 덩어리를 세운다(박스 위에 얹힌 덩어리가 된다)
      let bh = 0; while (isSolid(L, c, ROWS - 2 - bh)) bh++;
      // 떠 있는 파란 박스가 있는 칸: 길이 박스 위면 빨간 덩어리는 박스 밑에서 멈추고, 길이 박스 밑이면 매달린 덩어리를 두지 않는다(박스가 천장 노릇을 한다)
      let fb = 99, ft = -1; for (let r = ROWS - 2 - bh; r >= 0; r--) if (isSolid(L, c, r)) { if (fb > 90) fb = ROWS - 2 - r; ft = ROWS - 1 - r; }
      const fh2 = Math.min(HAZ_MAX_H + bh, Math.floor((k.lo - mF) * 4) / 4, fb > 90 || k.hi < fb ? 99 : fb - 0.5);
      if (!k.ground && fh2 >= bh + 0.5) L.floorH[c] = fh2;
      const ch = Math.max(Math.ceil((k.hi + SIZE + mC) * 4) / 4, ft + 0.5);
      if (p.chain && k.ground && ch < CEIL_MIN_H) continue;      // (공중 사슬 마디: 땅에 내려서 굴러가는 자리 바로 위의 낮은 덩어리는 두지 않는다 — 사슬 끝에 조금 늦게 내려와도 그 자리로 들어가게)
      if (ch <= CEIL_MAX_H + (fb < 90 ? 2 : 0) && !(fb < 90 && k.hi < fb)) L.ceilH[c] = ch;
    }
  }
  // 3) 틀리게 누른 달리기를 실제로 막는 자리만 남긴다. 막은 칸의 높이 그대로, 통로가 허락하는 만큼 양옆으로 BLOCK_GROW칸까지 넓힌 네모 덩어리.
  const outF = new Float32Array(L.cols), outC = new Float32Array(L.cols).fill(99);
  const hitLo = new Float32Array(L.cols).fill(99), hitHi = new Float32Array(L.cols).fill(-99);   // 그 덩어리에 걸려 죽은 공들의 바닥 높이의 최솟값 / 윗면 높이의 최댓값
  // 덩어리 하나를 남긴다: 막은 칸에서 양옆으로 grow칸까지(통로가 허락하는 만큼) 넓힌다. v = 높이(안 적으면 통로가 허락하는 끝까지).
  // 바로 적지 않고 ops에 모아 둔다(마디마다 여러 방식으로 만들어 보고 하나를 고르기 때문).
  const keep = (ops, hit, feet, v = hit.kind === "floor" ? L.floorH[hit.c] : L.ceilH[hit.c], grow = BLOCK_GROW) => {
    const fl = hit.kind === "floor";
    for (const dir of [-1, 1]) for (let n = dir < 0 ? 0 : 1, c = hit.c + (dir < 0 ? 0 : 1); n <= grow && c >= 0 && c < L.cols; n++, c += dir) {
      if (fl ? L.floorH[c] < v : L.ceilH[c] > v) break;
      ops.push({ c, fl, v, feet });
    }
  };
  const apply = (ops) => { for (const o of ops) { if (o.fl) { outF[o.c] = Math.max(outF[o.c], o.v); hitLo[o.c] = Math.min(hitLo[o.c], o.feet); } else { outC[o.c] = Math.min(outC[o.c], o.v); hitHi[o.c] = Math.max(hitHi[o.c], o.feet + SIZE); } } };
  // 변주(course.vary): 같은 패턴이 여러 번 나오면, 누르는 것은 같아도 빨간 덩어리의 자리·높이·위아래를 나올 때마다 달리한다.
  //   틀린 달리기를 빨간 덩어리 없이 끝까지 돌려서 그 길이 스치는 덩어리 후보를 모두 모은다. 처음 나올 때는 맨 처음 닿는 후보를 통로가 허락하는 끝까지 높게 세우고(보통),
  //   다시 나올 때는 후보 가운데 하나를 무작위로(매달린 것과 바닥 것을 반반으로), 높이는 "걸릴 만큼"에서 "허락하는 끝"까지 가운데 하나로, 너비도 0~2칸으로 고른다.
  //   그렇게 여러 벌을 만들어 보고, 그 패턴이 앞에서 나왔던 모양들과 가장 많이 다른 것을 쓴다.
  //   어느 후보를 골라도 그 달리기는 거기서(또는 그 앞에서) 죽고, 후보는 모두 통로 바깥이라 패턴대로 가면 닿지 않는다.
  //   바꾸지 않는 것: 함정을 막는 덩어리(누르면 안 되는 자리 위에 매달려 있어야 읽힌다), 그리고 cue 패턴에서 입력을 빼먹으면 걸리는 덩어리(그 자리가 "뛰어라/멈춰라"는 신호다).
  const occ = {}, sigs = {};
  const rngOf = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const contactsOf = (b, w) => {
    const F = L.floorH, C = L.ceilH, list = [], seen = new Map();
    L.floorH = null;                                    // 빨간 덩어리를 끄고 달린다(높은 박스와 파란 박스는 그대로)
    runBar(b, w, 2, (st) => {
      if (st.dead) return;
      const fh = (ROWS - 1) - st.y;
      for (let c = Math.floor(st.x - HALF + 0.03); c <= Math.floor(st.x + HALF - 0.03); c++) {
        if (c < b * 16 || c >= b * 16 + 16 || !(st.x + HALF - 0.08 > c + 0.1 && st.x - HALF + 0.08 < c + 0.9)) continue;
        for (const kind of ["floor", "ceil"]) {
          if (kind === "floor" ? !(fh + 0.06 < F[c]) : !(fh + SIZE - 0.06 > C[c])) continue;
          let q = seen.get(kind + c);
          if (!q) { q = { c, kind, lo: fh, hi: fh + SIZE }; seen.set(kind + c, q); list.push(q); }
          q.lo = Math.min(q.lo, fh); q.hi = Math.max(q.hi, fh + SIZE);
        }
      }
    });
    L.floorH = F;
    return list;
  };
  for (const [b, p] of patternBars) {
    const wrong = [{ presses: [], holds: [] }];
    p.presses.forEach((t, i) => {
      const rest = p.presses.filter((_, j) => j !== i);
      wrong.push({ presses: rest, holds: p.holds }, { presses: rest, holds: [...p.holds, [t, t + 0.5]] });
      for (const k of WRONG_SHIFT) wrong.push({ presses: [...rest, t + k], holds: p.holds });
    });
    p.holds.forEach((h, i) => {
      if (p.loose && p.loose.includes(h[0])) return;      // 손으로 놓은 빨간 박스가 막는 멈춤
      const rest = p.holds.filter((_, j) => j !== i);
      wrong.push({ presses: p.presses, holds: rest }, { presses: [...p.presses, h[0]], holds: rest });
      for (const k of WRONG_SHIFT) wrong.push({ presses: p.presses, holds: [...rest, [h[0] + k, h[1] + k]] });
    });
    // 함정: 버릇대로 한 번 더 누른 달리기. 이것을 막는 덩어리(누르면 안 되는 자리 위에 매달린 것)를 남긴다
    // (full = 앞 마디의 입력을 통째로 다시 누른 달리기)
    // (계단 마디(stair)의 함정은 손으로 놓은 빨간 단·뚜껑이 막는다. 여기서 덩어리를 따로 만들지 않는다)
    if (!p.sneaky && !p.stair && !p.own) for (const t of p.traps || []) wrong.push(t.full || { presses: [...p.presses, ...(t.presses || [])], holds: t.holds || p.holds });
    const nTrap = !p.sneaky && !p.stair && !p.own && p.traps ? p.traps.length : 0, name = course.bars[b];
    // 갈래: 0번(아무것도 안 누름)과 "하나 빼먹음"은 A, 손을 바꾸거나 크게 어긋난 것은 B, 맨 뒤 nTrap개(함정)는 T
    const catOf = (w, wi) => (wi >= wrong.length - nTrap ? "T" : wi === 0 || w.presses.length + w.holds.length < p.presses.length + p.holds.length ? "A" : "B");
    const nearBlue = (c) => { for (let k = c - 3; k <= c + 3; k++) for (let r = 0; r < ROWS - 1; r++) if (isSolid(L, k, r)) return true; return false; };
    // 꾸밈 덩어리를 둘 수 있는 칸: 바닥 쪽은 통로가 1.25칸 넘게 비는 곳, 위쪽은 통로의 천장이 화면 안(4.5칸 아래)에 있는 곳. 파란 박스 둘레는 뺀다
    const decoF = [], decoC = [];
    if (course.vary) for (let c = b * 16 + 1; c < b * 16 + 15; c++) { if (nearBlue(c)) continue; if (L.floorH[c] >= 1.25) decoF.push(c); if (L.ceilH[c] <= 4.5) decoC.push(c); }
    const lists = course.vary ? wrong.map((w, wi) => (catOf(w, wi) === "T" || (p.cue && catOf(w, wi) === "A") ? null : contactsOf(b, w))) : null;
    const build = (rnd) => {
      const ops = [];
      wrong.forEach((w, wi) => {
        const list = rnd && lists[wi];
        if (!list) {                                     // 보통: 맨 처음 닿는 덩어리, 끝까지 높게
          const st = runBar(b, w, 2), hit = st.dead ? hazardAt(L, st) : null;
          if (hit && hit.c >= b * 16 && hit.c < b * 16 + 16) keep(ops, hit, (ROWS - 1) - st.y);
          return;
        }
        if (!list.length) return;
        const ceils = list.filter((q) => q.kind === "ceil"), floors = list.filter((q) => q.kind === "floor");
        const pool = ceils.length && floors.length ? (rnd() < 0.5 ? ceils : floors) : list, q = pool[Math.floor(rnd() * pool.length)];
        const full = q.kind === "floor" ? L.floorH[q.c] : L.ceilH[q.c];
        const need = q.kind === "floor" ? Math.min(full, Math.max(0.75, Math.ceil((q.lo + 0.5) * 4) / 4)) : Math.max(full, Math.floor((q.hi - 0.5) * 4) / 4);
        const v = Math.round((need + (full - need) * [0, 0.5, 1][Math.floor(rnd() * 3)]) * 4) / 4;      // 높이: 걸릴 만큼 / 그 사이 / 허락하는 끝
        keep(ops, q, q.kind === "floor" ? q.lo : q.hi - SIZE, v, Math.floor(rnd() * 3));
      });
      // 꾸밈 덩어리(다시 나온 마디에만): 통로 바깥의 빈 곳에, 아무 틀린 달리기도 막지 않는 덩어리를 두세 개 더 세운다. 위·아래와 높이·너비를 무작위로.
      // 꼭 필요한 덩어리보다 반 칸 더 물러나 있고(길에서 멀다), 파란 박스 둘레 세 칸에는 두지 않는다(파란 박스 옆의 빨간 덩어리는 "뛰어라/떨어져라"로 읽히기 때문).
      if (rnd) {
        const n = 2 + Math.floor(rnd() * 2);
        for (let k = 0; k < n; k++) {
          const side = rnd() < 0.5 ? decoF : decoC, other = side === decoF ? decoC : decoF, list = side.length ? side : other;
          if (!list.length) break;
          const c = list[Math.floor(rnd() * list.length)];
          if (list === decoF) {
            const v = Math.round((0.75 + rnd() * (L.floorH[c] - 0.5 - 0.75)) * 4) / 4;
            keep(ops, { c, kind: "floor" }, rnd() < 0.5 ? 0 : v - 0.7, v, Math.floor(rnd() * 3));
          } else {
            const v = Math.round((L.ceilH[c] + 0.5 + rnd() * 0.75) * 4) / 4;
            keep(ops, { c, kind: "ceil" }, v + 0.3 + rnd() * 0.8 - SIZE, v, Math.floor(rnd() * 3));
          }
        }
      }
      return ops;
    };
    let ops = build(null);
    if (course.vary) {
      const nth = (occ[name] = (occ[name] ?? -1) + 1), seen = (sigs[name] = sigs[name] || []);
      if (nth > 0) {
        // 여러 벌 가운데, 앞에서 나온 모양들과 가장 많이 다른 것(바로 앞의 것과의 차이를 가장 무겁게 친다)
        const cols = (o) => { const m = new Map(); for (const q of o) { const k = (q.fl ? "F" : "C") + (q.c - b * 16); m.set(k, q.fl ? Math.max(m.get(k) || 0, q.v) : Math.min(m.get(k) ?? 99, q.v)); } return m; };
        const dist = (m1, m2) => { let d = 0; for (const [k, v] of m1) d += m2.has(k) ? Math.min(1, Math.abs(m2.get(k) - v)) : 1.5; for (const k of m2.keys()) if (!m1.has(k)) d += 1.5; return d; };
        let best = null;
        for (let a = 0; a < 10; a++) {
          const o = build(rngOf(b * 7919 + a * 104729 + 17)), m = cols(o);
          const score = seen.reduce((u, m2, i) => u + dist(m, m2) * (i === seen.length - 1 ? 3 : 1), 0) / (seen.length + 2);
          if (!best || score > best.score) best = { o, score };
        }
        if (best && best.score > 0) ops = best.o;
      }
      { const m = new Map(); for (const q of ops) { const k = (q.fl ? "F" : "C") + (q.c - b * 16); m.set(k, q.fl ? Math.max(m.get(k) || 0, q.v) : Math.min(m.get(k) ?? 99, q.v)); } seen.push(m); }
    }
    apply(ops);
  }
  // 1/4칸짜리 잔턱은 없앤다(길이 넓어지는 쪽으로 맞춤)
  for (let c = 1; c < L.cols; c++) {
    if (outF[c] > 0 && outF[c - 1] > 0 && Math.abs(outF[c] - outF[c - 1]) <= 0.25) { const v = Math.min(outF[c], outF[c - 1]); for (let k = c; k >= 0 && outF[k] > 0 && outF[k] - v <= 0.25 && outF[k] !== v; k--) outF[k] = v; outF[c] = v; }
    if (outC[c] < 90 && outC[c - 1] < 90 && Math.abs(outC[c] - outC[c - 1]) <= 0.25) { const v = Math.max(outC[c], outC[c - 1]); for (let k = c; k >= 0 && outC[k] < 90 && v - outC[k] <= 0.25 && outC[k] !== v; k--) outC[k] = v; outC[c] = v; }
  }
  L.floorH = outF; L.ceilH = outC;
  // 떠 있는 빨간 박스(course.floatReds): 덩어리를 땅이나 하늘 끝까지 잇지 않고, 틀린 달리기가 실제로 부딪힌 높이만 남긴다.
  //   바닥에서 솟은 덩어리: 가장 낮게 부딪힌 자리 밑을 비운다(밑이 1칸 넘게 빌 때만). 매달린 덩어리: 가장 높이 부딪힌 자리 위를 비운다.
  //   틀린 달리기는 저마다 부딪혔던 그 자리에서 그대로 죽는다. 대신 위로 넘거나 밑으로 지나가는 길이 열린다.
  L.floorLo = new Float32Array(L.cols); L.ceilTop = new Float32Array(L.cols).fill(99);
  if (course.floatReds) {
    for (let c = 0; c < L.cols; c++) {
      if (outF[c] > 0 && !(c > 0 && outF[c - 1] > 0)) {
        let e = c, lo = 99, hMin = 99; while (e < L.cols && outF[e] > 0) { lo = Math.min(lo, hitLo[e]); hMin = Math.min(hMin, outF[e]); e++; }
        const bottom = Math.min(Math.floor((lo - RED_PAD) * 4) / 4, hMin - RED_MIN);
        if (bottom >= 1) for (let k = c; k < e; k++) L.floorLo[k] = bottom;
      }
      if (outC[c] < 90 && !(c > 0 && outC[c - 1] < 90)) {
        let e = c, hi = -99, cMax = -99; while (e < L.cols && outC[e] < 90) { hi = Math.max(hi, hitHi[e]); cMax = Math.max(cMax, outC[e]); e++; }
        const top = Math.max(Math.ceil((hi + RED_PAD) * 4) / 4, cMax + RED_MIN);
        for (let k = c; k < e; k++) L.ceilTop[k] = top;
      }
    }
  }
  // 파란 천장 위의 빨간 덩어리: 파란 박스 윗면부터 하늘까지
  for (const [c, h] of L.capRed) { L.ceilH[c] = Math.min(L.ceilH[c], h); L.ceilTop[c] = 99; }
  // 손으로 놓는 빨간 박스(redBox): 패턴에 적힌 칸에 그 높이로 선다(파란 박스가 있는 칸은 뺀다)
  course.bars.forEach((name, b) => {
    const p = PATTERNS[name];
    if (p && p.redBox) for (const [a, z, hh] of p.redBox) for (let c = b * 16 + a; c <= b * 16 + z && c < L.cols; c++) if (!isSolid(L, c, ROWS - 2)) L.floorH[c] = Math.max(L.floorH[c], hh);
  });
  // 계단의 빨간 덩어리(bands: [첫 칸, 끝 칸, 밑면, 윗면]): 한 칸에 몇 개든 놓을 수 있다(redFloat는 한 칸에 아래쪽 하나, 위쪽 하나뿐이다 — 계단에서는 빨간 단과 그 위의 뚜껑이 어느 높이에든 겹친다)
  L.bands = new Map();
  for (let b = 0; b < L.bars; b++) {
    const p = PATTERNS[course.bars[b]];
    if (p && p.bands) for (const [a, z, lo, hi] of p.bands) for (let c = b * 16 + a; c <= b * 16 + z && c < L.cols; c++) { if (!L.bands.has(c)) L.bands.set(c, []); L.bands.get(c).push([lo, hi]); }
  }
  // 손으로 놓는 떠 있는 빨간 박스(redFloat: [첫 칸, 끝 칸, 밑면, 윗면]): 파란 징검돌 자리에 놓는 빨간 돌
  course.bars.forEach((name, b) => {
    const p = PATTERNS[name];
    // (밑면이 5칸 넘는 것은 위쪽 덩어리로 친다: 한 칸에 아래 덩어리와 위 덩어리를 하나씩 둘 수 있다)
    if (p && p.redFloat) for (const [a, z, lo, hi] of p.redFloat) for (let c = b * 16 + a; c <= b * 16 + z && c < L.cols; c++) { if (lo >= 5) { L.ceilH[c] = lo; L.ceilTop[c] = hi; } else { L.floorH[c] = hi; L.floorLo[c] = lo; } }
  });
  // 빨간 바닥(lava): 패턴에 적힌 칸의 땅은 닿으면 죽는다. 그 위에 놓인 파란 박스만 디딜 수 있다.
  course.bars.forEach((name, b) => {
    const p = PATTERNS[name];
    if (p && p.lava) for (const [a, z] of p.lava) for (let c = b * 16 + a; c <= b * 16 + z; c++) if (!isSolid(L, c, ROWS - 2)) L.floorH[c] = Math.max(L.floorH[c], LAVA_H);
  });
  // 패턴대로 달려 죽는 곳이 있으면 그 둘레의 장애물을 걷어 낸다(드물게 생긴다)
  L.fixed = [];
  for (let guard = 0; guard < 60; guard++) {
    const { end } = traceRun(L, plan);
    if (!end.dead) break;
    const c0 = Math.floor(end.x);
    for (let c = c0 - 1; c <= c0 + 1; c++) { L.floorH[c] = 0; L.ceilH[c] = 99; }
    L.fixed.push(c0);
  }
  // 꾸밈 박스(course.decor: 마디당 개수(자리가 없으면 덜 놓인다). 라운드 코스에만 적는다 — 테스트용으로 짜 맞춘 작은 코스에는 없다): 쓰임새는 없지만 코스가 제멋대로이고 빽빽해 보이게, 공중 여기저기 떠 있는 작은 빨간 박스.
  //   빨간 것은 모두 닿으면 죽는다는 약속은 그대로다(진짜 장애물). 대신 공이 지나가는 통로(패턴대로 + 입력마다 tol만큼 일찍·늦게 누른 길) 밖으로
  //   위아래 DECOR_GAP칸, 양옆 한 칸 넘게 떨어진 곳에만 놓는다 — 패턴대로 치면 절대 닿지 않는다. 다른 장애물·파란 박스·고리와도 한 칸 넘게 띄운다(붙어서 한 덩어리로 보이지 않게).
  //   피버·계단·세트(움직이는 장애물) 마디와 결승선 뒤에는 두지 않는다. 자리·크기는 코스 이름으로 정한 난수라 늘 같다.
  L.decor = new Map();
  if (course.decor) {
    const per = typeof course.decor === "number" ? course.decor : 3, GAP = DECOR_GAP;
    let h0 = 7; for (const ch of course.name) h0 = (Math.imul(h0, 31) + ch.charCodeAt(0)) | 0;
    const rnd = rngOf(h0 ^ 0x5bd1e995), pick = (a) => a[Math.floor(rnd() * a.length)];
    const goalBar = course.bars.indexOf("goal"), moverBars = new Set(L.movers.map((m) => m.bar));
    const redX = (c) => L.reds.some((r) => c + 1 > r.x0 - 1 && c < r.x1 + 1);
    const tallAt = (c) => L.talls.some((q) => c + 1 > q.x - q.w / 2 - 1 && c < q.x + q.w / 2 + 1);
    const free = (c, lo, hi) => {                         // 이 칸의 [lo-1, hi+1]에 다른 것이 없다
      if (c < 0 || c >= L.cols) return false;
      const a = lo - 1, z = hi + 1;
      if (L.floorH[c] > a && (L.floorLo[c] || 0) < z) return false;
      if (L.ceilH[c] < z && (L.ceilTop[c] ?? 99) > a) return false;
      for (const q of [L.bands.get(c), L.decor.get(c - 1), L.decor.get(c), L.decor.get(c + 1)]) if (q && q.some(([u, v]) => u < z && v > a)) return false;
      for (let r = 0; r < ROWS - 1; r++) { const t = tile(L, c, r), y0 = ROWS - 2 - r; if (t !== "." && t !== undefined && y0 < z && y0 + 1 > a) return false; }
      return !redX(c) && !tallAt(c);
    };
    const clear = (c, lo, hi) => { const k = env[c]; return !!k && k.lo < 90 && (hi + GAP <= k.lo || lo >= k.hi + SIZE + GAP); };
    for (let b = 1; b < (goalBar < 0 ? L.bars : goalBar); b++) {
      const p = PATTERNS[course.bars[b]];
      if (!p || p.mode === "rush" || p.stair || p.set || p.boxes || p.free || moverBars.has(b) ||      // (파란 박스 마디는 아무렇게나 눌러도 죽지 않는 놀이터다)
          inRide(L, b * 16 + 0.5) || inRide(L, b * 16 + 15.5)) continue;
      const want = Math.max(0, Math.round(per - 0.5 + rnd()));
      for (let n = 0, tries = 0; n < want && tries < 60; tries++) {
        const w = pick([1, 2, 2, 2, 3, 3]), h = pick([0.5, 0.75, 0.75, 1]);
        const c0 = b * 16 + Math.floor(rnd() * (17 - w)), lo = 0.75 + Math.floor(rnd() * 20) / 4, hi = lo + h;
        if (hi > DECOR_TOP) continue;
        let ok = true;
        for (let c = c0 - 1; c <= c0 + w && ok; c++) if (!clear(c, lo, hi)) ok = false;
        for (let c = c0 - 1; c <= c0 + w && ok; c++) if (!free(c, lo, hi)) ok = false;      // (양옆 한 칸도 비어 있어야: 붙으면 다른 덩어리와 한 덩어리로 그려진다)
        if (!ok) continue;
        for (let c = c0; c < c0 + w; c++) { if (!L.decor.has(c)) L.decor.set(c, []); L.decor.get(c).push([lo, hi]); }
        n++;
      }
    }
    // 그래도 패턴대로 달려 닿으면 그 둘레의 꾸밈 박스를 걷어 낸다
    for (let guard = 0; guard < 40; guard++) {
      const { end } = traceRun(L, plan);
      if (!end.dead) break;
      const c0 = Math.floor(end.x); let hit = false;
      for (let c = c0 - 2; c <= c0 + 2; c++) if (L.decor.delete(c)) hit = true;
      if (!hit) break;
    }
  }
  // 길잡이: 패턴대로 달린 길 위에 수정을 놓고(입력이 있는 점프에만, 반의 반 박마다), 눌러야 하는 자리에는 표시를 둔다.
  // 판정에는 영향이 없다. 길이 보여서 쉬워지고, 뚫을 때마다 소리가 난다.
  { const s = spawnState(L, -1), recs = [], active = new Set();
    let air = 0, wasGround = true;
    while (!s.dead && !s.won) {
      const ev = [];
      stepState(L, s, base.press.has(s.step + 1), ev, base.hold.has(s.step + 1));
      if (!s.onGround && wasGround) air++;
      wasGround = s.onGround;
      if (s.mode === "rush" || s.onGround) continue;
      const mark = ev.some((e) => e.type === "double" || e.type === "jump") ? "jump" : ev.some((e) => e.type === "freeze") ? "hold" : "";
      if (mark) active.add(air);
      if (mark || s.step % (SUB / 4) === 0) recs.push({ air, x: s.x, h: (ROWS - 1) - s.y + HALF, mark });
    }
    // blind: true인 마디에는 길잡이를 두지 않는다(같은 마디를 되풀이한 뒤, 안내 없이 기억으로 한 번 더 하게 하는 마디)
    const blindAt = (x) => { const p = PATTERNS[course.bars[Math.floor(x / 16)]]; return !!(p && p.blind); };
    for (const r of recs) if (active.has(r.air) && !blindAt(r.x)) L.gems.push(r.mark === "jump" ? { x: r.x, h: r.h, flip: 1 } : r.mark === "hold" ? { x: r.x, h: r.h, hold: true } : { x: r.x, h: r.h });
    L.gems.sort((u, v) => u.x - v.x);
  }
  // 패턴이 있는 체크포인트: 패턴대로 달렸을 때의 상태를 적어 둔다. 거기서 다시 시작한다(그 마디 한가운데의 평지가 없으니, 땅에 새로 세울 수가 없다).
  //   snap = 조작을 넘겨받는 순간의 상태(마디가 시작하는 박. 그때 멈춘 채 떠 있거나 멈춤을 누르고 있어야 하면, 그게 풀리는 첫 순간으로 미룬다)
  //   lead = 그보다 한 마디 앞의 상태. 화면은 여기서 다시 시작해 한 마디를 패턴대로 저절로 달린 뒤 조작을 넘긴다(곡에 다시 올라탈 틈)
  if (L.cps.some((c) => c.snap === null) && L.ref) {
    const inp = planInput(L.ref), s = spawnState(L, -1), want = L.cps.filter((c) => c.snap === null).map((c) => c);
    const states = new Map();
    for (const c of want) states.set(c.bar * 4 * SUB - 4 * SUB, null);
    let k = 0;
    while (!s.dead && !s.won && k < want.length) {
      if (states.has(s.step) && states.get(s.step) === null) states.set(s.step, { ...s });
      const c = want[k];
      if (s.step >= c.bar * 4 * SUB && !s.frozen && !inp.hold.has(s.step + 1) && (s.mode === "rush" || s.onGround || s.vy < 0)) {
        c.snap = { ...s }; c.col = s.x - 0.5 - 1e-6; c.beat = s.step / SUB; c.lead = states.get(c.bar * 4 * SUB - 4 * SUB);      // (체크포인트는 공이 col + 0.5를 지날 때 켜진다: 넘겨받는 바로 그 자리에서 켜지게)
        k++; continue;
      }
      stepState(L, s, inp.press.has(s.step + 1), null, inp.hold.has(s.step + 1));
    }
    L.cps.forEach((c, i) => { if (c.snap) { c.snap.cp = i; if (c.lead) c.lead.cp = i - 1; } });
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
// x 지점의 피버 천장 높이(칸). 넓은 통로 마디는 두 배.
const ceilAt = (L, x) => (L.wideBars.has(Math.floor(x / 16)) ? WIDE_TOP : 2) * ZIG_STEP + SIZE;
// 파란 발판의 높이(칸). 반 박 지점마다 앞뒤 한 칸씩을 그 지점의 발판이 차지한다(마디 선은 넘지 않는다). 발판이 없으면 바닥 0 / 천장 그대로.
const stairNode = (x) => { const b = Math.floor(x / 16), t = x - 16 * b; return 8 * b + (t >= 15 ? 7 : Math.floor((t + 1) / 2)); };
const stairFloor = (L, x) => (L.stairLo.get(stairNode(x)) || 0) * ZIG_STEP;
const stairCeil = (L, x) => { const v = L.stairHi.get(stairNode(x)); return v === undefined ? ceilAt(L, x) : Math.min(ceilAt(L, x), v * ZIG_STEP + SIZE); };
// 조여드는 통로에서 x 지점의 통로 폭(공이 오르내리는 거리). 통로 밖이면 null.
function squeezeGap(L, x) {
  for (const sq of L.squeezes) if (x >= sq.x0 && x <= sq.x1) {
    const P = sq.pts;
    for (let i = 0; i + 1 < P.length; i++) if (x <= P[i + 1].x) return P[i].g + (P[i + 1].g - P[i].g) * (x - P[i].x) / (P[i + 1].x - P[i].x);
    return P[P.length - 1].g;
  }
  return null;
}
// 원버튼: 화면 어디든 누르는 순간이 press, 누르고 있는 동안이 hold다.
// 피버 구간의 한 스텝. 반 박 지점(node)마다 갈 길이 정해진다.
function rushStep(L, s, press, ev, hold, r) {
  const local = s.step - Math.round(r[0] / TPB * SUB), t = local % SLOT, u = t / SLOT, node = t === 0;
  s.vy = 0; s.onGround = false; s.djAvail = false;
  let h;
  const sq = L.squeezes.length ? L.squeezes.find((q) => s.x >= q.x0 && s.x < q.x1) : null;
  if (sq) {                                              // 조여드는 통로: 정해진 시각에 바닥과 천장을 번갈아 친다(누르는 것과 무관)
    const P = sq.pts, mid = ZIG_STEP;
    let i = 0;
    while (i + 2 < P.length && P[i + 1].step <= s.step) i++;
    const a = P[i], b = P[i + 1], ha = mid + (a.top ? 1 : -1) * a.g / 2, hb = mid + (b.top ? 1 : -1) * b.g / 2;
    s.zh = ha + (hb - ha) * (s.step - a.step) / (b.step - a.step);
    s.zdir = hb > ha ? 1 : -1; s.zv = Math.abs(hb - ha) / ((b.step - a.step) / SUB);
    if (s.step === a.step && i > 0 && ev) ev.push({ type: "rebound", top: a.top, tight: true });
    if (press && ev) ev.push({ type: "spark" });
    s.y = (ROWS - 1) - s.zh;
    return;
  }
  {
    // 공은 반 박 지점(node)마다 높이 한 단계씩 오르내린다. 바닥과 천장에서는 튕기고, 그 사이 단계에서는 가던 방향으로 계속 간다.
    // 누르면 "가장 가까운 지점에서 갈 방향"이 뒤집힌다(그 지점 앞뒤 1/4박 안에 누른 것). 반응은 즉시:
    //   지점에 닿기 전에 누르면 그 자리에서 바로 돌아서 천천히, 지난 뒤에 누르면 바로 꺾어서 빠르게 — 어느 쪽이든 다음 지점에는 같은 높이에 닿는다.
    // 그래서 타이밍 오차가 다음으로 넘어가지 않는다. 한 번 더 누르면 원래대로 돌아간다.
    // 파란 발판이 있는 지점에서는 바닥·천장 대신 그 발판에서 튕긴다.
    const n0 = r[0] / 2;
    const botAt = (k) => L.stairLo.get(n0 + k) || 0;
    const topAt = (k) => { const v = L.stairHi.get(n0 + k); return v === undefined ? (L.wideBars.has(Math.floor((r[0] + 2 * k) / 16)) ? WIDE_TOP : 2) : v; };
    const padHit = (lev, zin, k) => { const q = L.pads.get(n0 + k); return !!q && q.lv === lev && q.from === zin; };      // 이 지점의 튕김판에 닿는가(판이 막는 쪽에서 왔는가)
    const dirAt = (lev, zin, tog, k) => (lev <= botAt(k) ? 1 : lev >= topAt(k) ? -1 : padHit(lev, zin, k) ? -zin : tog ? -zin : zin);
    // 판의 뒷면: k번째 지점의 lev 단계를 떠나 d 쪽으로 가는 공이, 이 지점이나 다음 지점에 있는 판의 뒷면에 닿는가(내려가는 공은 바로 아래 단계를 막는 판의 윗면에, 올라가는 공은 바로 위 단계를 막는 판의 밑면에)
    const padBack = (lev, d, k) => [k, k + 1].some((n) => { const q = L.pads.get(n0 + n); return !!q && q.from === -d && q.lv === lev + d; });
    while (local >= s.zk * SLOT + SLOT / 2) {              // 지난 지점의 선택을 굳히고, 다음 지점으로 넘어간다
      const d = dirAt(s.zlk, s.zin, s.ztog, s.zk);
      if (padBack(s.zlk, d, s.zk)) { s.zin = -d; if (ev) ev.push({ type: "rebound", top: d > 0, step: true, pad: true, back: true }); }      // 판의 뒷면에 닿았다(지점과 지점의 한가운데): 반 단계만 갔다가 되돌아가, 다음 지점에는 같은 높이로 와 있다
      else { s.zlk += d; s.zin = d; }
      s.zk++; s.ztog = s.zpend ? 1 : 0; s.zpend = 0;      // 벽을 친 직후에 눌러 둔 것은 이 지점의 누름이 된다
    }
    const tk = s.zk * SLOT, top = topAt(s.zk), bot = botAt(s.zk);
    if (press) {
      const free = L.freeBars.has(Math.floor(s.x / 16));
      if (!free && s.zlk > bot && s.zlk < top && !padHit(s.zlk, s.zin, s.zk)) { s.ztog ^= 1; if (ev) ev.push({ type: "flip" }); }      // (튕김판에 닿는 지점은 바닥·천장과 같다: 방향을 고를 수 없다)
      else {
        // 바닥·천장에 닿는 지점에서는 방향을 고를 수 없다. 그런데 벽을 치고 나서 바로 누른 것은 "다음 지점에서 꺾겠다"는 뜻이다(다음 지점이 가까워지기 전에 일찍 누른 것).
        // 전에는 이런 누름이 그냥 버려졌다(벽에서 1/4박, 약 99ms 안에 누르면 안 먹혔다). 이제는 다음 지점의 누름으로 넘긴다. 반응은 다음 지점이 가까워질 때(1/4박 앞) 나타난다.
        const nl = s.zlk + dirAt(s.zlk, s.zin, 0, s.zk);
        if (!free && local > tk && nl > botAt(s.zk + 1) && nl < topAt(s.zk + 1) && !padHit(nl, nl - s.zlk, s.zk + 1) && !L.freeBars.has(Math.floor((r[0] + 2 * (s.zk + 1)) / 16))) { s.zpend ^= 1; if (ev) ev.push({ type: "flip", early: true }); }
        else if (ev) ev.push({ type: "spark" });             // 연출 마디, 또는 벽으로 다가가는 중: 길은 그대로(불꽃만 튄다)
      }
    }
    // 이 지점을 떠나는 길에 판의 뒷면이 있으면(dip): 다음 높이까지 가지 못하고, 지점과 지점의 한가운데에서 반 단계만 간 곳(판의 면)에 닿는다. 언제 눌러서 꺾었든 그 순간 그 자리에 닿도록 간다.
    // 그리고 그럴 때는 지점에 닿기 전에 미리 돌아서지 않는다(미리 돌아서면 판을 뚫고 지나가게 된다).
    const dNext = dirAt(s.zlk, s.zin, s.ztog, s.zk), dip = padBack(s.zlk, dNext, s.zk);
    const toNode = local <= tk && (!s.ztog || dip);          // 지점을 향해 가는 중인가, 지점 다음 높이를 향해 가는 중인가
    const wpStep = toNode ? tk : dip ? tk + SLOT / 2 : tk + SLOT, wpH = (toNode ? s.zlk : s.zlk + (dip ? dNext / 2 : dNext)) * ZIG_STEP;
    const prev = s.zh;
    s.zh = local === 0 ? s.zlk * ZIG_STEP : wpStep - local <= 0 ? wpH : prev + (wpH - prev) / (wpStep - local + 1);
    s.zv = Math.abs(s.zh - prev) * SUB;
    if (s.zh !== prev) s.zdir = s.zh > prev ? 1 : -1;
    if (local === tk && local > 0 && (s.zlk <= bot || s.zlk >= top) && ev) ev.push({ type: "rebound", top: s.zlk > bot, step: s.zlk > bot ? L.stairHi.has(n0 + s.zk) : bot > 0 });   // step = 파란 발판에 닿았다
    else if (local === tk && local > 0 && padHit(s.zlk, s.zin, s.zk) && ev) ev.push({ type: "rebound", top: s.zin > 0, step: true, pad: true });      // 튕김판에 닿았다
    h = s.zh;
    if (h + SIZE > ceilAt(L, s.x) + 0.3) return die(s, "crash", ev);     // 넓은 통로에서 좁은 통로로 넘어갈 때 천장보다 높이 있으면 부딪힌다
  }
  s.y = (ROWS - 1) - h;
  const xa = s.x - HALF_RUSH * 0.8, xb = s.x + HALF_RUSH * 0.8, lo = h + 0.06, hi = h + SIZE - 0.06;
  for (const q of L.reds) {
    if (xb <= q.x0 || xa >= q.x1) continue;
    const span = hazardSpan(q, Math.max(xa, Math.min(q.xt, xb)) - q.xt);       // 공에서 장애물 가운데에 가장 가까운 x에서 본다
    if (hi > span[0] && lo < span[1]) return die(s, "spike", ev);
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

function groundY(L, col) {                             // 그 칸에서 딛는 땅(땅에서 쌓아 올린 박스의 꼭대기). 떠 있는 박스와 파란 천장은 세지 않는다
  let r = ROWS - 1;
  while (r > 0 && isSolid(L, col, r - 1)) r--;
  return r;
}

// cp = -1이면 처음부터. 체크포인트에서는 한 박자 앞 평지에서 다시 시작한다.
function spawnState(L, cp = -1) {
  if (cp >= 0 && L.cps[cp].snap) return { ...L.cps[cp].snap, cp };      // 패턴이 있는 체크포인트: 패턴대로 달렸을 때 그 순간의 상태(buildLevel 끝 참고)
  const beat = cp < 0 ? 0 : L.cps[cp].beat - 1;
  const step = Math.round(beat * SUB);
  const x = TPB * step / SUB;
  return {
    mode: "bounce", step, x, lead: 0, dashing: 0, y: groundY(L, Math.floor(x)), vy: 0, onGround: true,
    zh: 0, zdir: 1, zv: 0, zk: 0, zlk: 0, zin: -1, ztog: 0, zpend: 0,
    djAvail: false, jbuf: 0, ring: -1, djq: 0, since: 0, ringed: 0, ringK: 0,      // djq = 맡아 둔 이단 점프(2 = 다음에 튀면, 1 = 이번 꼭대기에서), since = 튄 뒤 지난 스텝
    freeze: 0, frozen: false,
    cp, dead: false, cause: "", won: false,
  };
}

// 땅에서 뛰어오른다. kind: "bounce"(박자에 맞춰 저절로) | "jump"(눌러서) | "pad"(점프대)
// 충전 고리로 얻은 이단 점프의 세기(위로의 속도). ringK > 0: 다음 고리(k칸 앞)까지 같은 높이로 건너가는 작은 뜀(k/4박 뒤 같은 높이로 돌아온다)
//   ringK = -1: 사슬의 마지막 고리 — 다음 박(반 박 넘게 남은 첫 박)에 땅에 닿게. 0: 보통 이단 점프
function ringHop(s) {
  if (s.ringK > 0) return G * (s.ringK / TPB) / 2;
  if (s.ringK < 0) { const now = s.step / SUB, h = (ROWS - 1) - s.y; let T = Math.ceil(now + 1e-6) - now; if (T < 0.5) T += 1; return Math.max(0, (G * T * T / 2 - h) / T); }
  return V0;
}
function launch(s, kind, ev, late = 0) {
  // 저절로 튈 때 박자보다 조금 늦었으면 그만큼 낮게 튀어 다음 박자에 맞춰 착지한다(계단을 내려갈 때 박자가 밀리지 않게)
  s.vy = kind === "pad" ? -V_PAD : kind === "jump" ? -V0 : -G * (1 - late / SUB) / 2;
  s.onGround = false; s.djAvail = true; s.jbuf = 0; s.freeze = FREEZE_STEPS;
  s.since = 0; s.djq = s.djq === 2 ? 1 : 0; s.ringed = 0; s.ringK = 0;
  if (ev) ev.push({ type: kind });
}

// 박자에 맞춰 땅에 있으면 저절로 튄다
// 딛고 있는 곳의 높이가 튀는 박을 정한다. 땅에서는 박자에, 파란 박스 위에서는 한 칸 높을 때마다 1/8박씩 이른 박에 튄다.
// 공은 한 칸 높은 곳에 약 1/8박 일찍 닿으므로(한 칸 낮은 곳에는 그만큼 늦게), 계단을 오르내릴 때는 닿자마자 튀게 된다:
// 오를 때는 한 박보다 조금씩 빠르게, 내려올 때는 조금씩 느리게. 네 칸 높이에서는 반 박이 당겨져 엇박에 튄다. 높이가 박자를 바꾼다.
// (닿는 대로 무조건 바로 튀게 하면 멈춤·이단 점프를 한 뒤의 박이 누른 타이밍마다 달라져서, 높이마다 정해진 박에 맞춘다.)
const BOX_GRID = SUB / 8;
const bouncePhase = (s) => (((ROWS - 1) - s.y) * BOX_GRID) % SUB;    // 이 높이에서 튀는 박이 정박보다 얼마나 이른가(스텝)
function tryBounce(L, s, ev) {
  const late = (s.step + bouncePhase(s)) % SUB;
  if (late > BOUNCE_TOL) return;
  launch(s, tile(L, Math.floor(s.x), s.y - 1) === "J" ? "pad" : "bounce", ev, late);
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
    if (ride) { s.zh = 0; s.zdir = 1; s.zv = 0; s.zk = 0; s.zlk = 0; s.zin = -1; s.ztog = 0; s.zpend = 0; }
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
    if (s.jbuf > 0) {
      // 땅(박스 위가 아니라 맨땅)에서 곧 튈 참에 누른 것은 이단 점프로 맡아 둔다. 그 밖에는 그 자리에서 점프(박스 위에서 다시 뛰기, 한참 구르다 뛰기)
      const wait = (SUB - (s.step + bouncePhase(s)) % SUB) % SUB;
      if (s.y === ROWS - 1 && (wait <= DJ_ROLL || SUB - wait <= BOUNCE_TOL)) { s.djq = 2; s.jbuf = 0; if (ev) ev.push({ type: "queue" }); tryBounce(L, s, ev); }
      else launch(s, "jump", ev);
    } else tryBounce(L, s, ev);
  } else if (s.jbuf > 0 && s.djAvail) {              // 공중: 이단 점프
    const hh = (ROWS - 1) - s.y, tl = s.vy > 0 ? (-s.vy + Math.sqrt(s.vy * s.vy + 2 * G * hh)) / G : 99;      // 맨땅에 닿기까지 남은 박
    if (s.ringed) { s.vy = -ringHop(s); s.djAvail = false; s.jbuf = 0; s.djq = 0; if (ev) ev.push({ type: "double", chain: s.ringK || 0 }); }      // 충전 고리로 얻은 이단 점프는 누른 자리에서 바로(보정하지 않는다)
    else if (s.vy < 0 && s.since < DJ_EARLY) { s.djq = 1; s.jbuf = 0; if (ev) ev.push({ type: "queue" }); }              // 튀자마자 누름 → 꼭대기에서
    // (이번에 멈춤을 쓴 뒤라면 일부러 낮게 뛰는 것이므로 그대로 둔다)
    else if (tl <= DJ_PRE && s.freeze === FREEZE_STEPS && !isSolid(L, Math.floor(s.x + TPB * tl), ROWS - 2)) { s.djq = 2; s.jbuf = 0; if (ev) ev.push({ type: "queue" }); }   // 닿기 직전에 누름 → 다음에 튀면 꼭대기에서
    else { s.vy = -V0; s.djAvail = false; s.jbuf = 0; s.djq = 0; if (ev) ev.push({ type: "double" }); }
  }
  if (!s.onGround) {
    s.since++;
    if (s.djq === 1 && s.djAvail && s.vy >= 0 && !(hold && s.freeze > 0)) { s.vy = -V0; s.djAvail = false; s.djq = 0; if (ev) ev.push({ type: "double" }); }   // 맡아 둔 이단 점프: 꼭대기에서
  }
  if (s.jbuf > 0) s.jbuf--;

  const frozen = !!hold && !s.onGround && s.freeze > 0;
  if (frozen !== s.frozen) { s.frozen = frozen; if (ev) ev.push({ type: frozen ? "freeze" : "unfreeze" }); }

  const prevFeet = s.y;
  if (frozen) s.freeze--;                             // 높이·속도 그대로. 세상만 흐른다.
  else if (!s.onGround) { s.vy += G * DT; s.y += s.vy * DT; }
  s.x = TPB * s.step / SUB;

  const c0 = Math.floor(s.x - HALF + 0.03), c1 = Math.floor(s.x + HALF - 0.03);
  const beatNow = s.step / SUB;
  if (s.onGround) {
    let support = false;
    for (let c = c0; c <= c1; c++) if (isSolid(L, c, s.y)) support = true;
    if (!support && platUnder(L, s.x, s.y, beatNow)) support = true;     // 움직이는 파란 발판 위
    if (!support) { s.onGround = false; s.vy = 0; }  // 끝에서 굴러떨어짐(이단 점프는 그대로 남아 있다)
  } else if (!frozen) {
    if (s.vy >= 0) {
      const T = Math.floor(s.y);
      if (T >= Math.ceil(prevFeet - 1e-9) && T <= s.y) {
        let on = false;
        for (let c = c0; c <= c1; c++) if (isSolid(L, c, T)) on = true;
        const pm = on ? null : platUnder(L, s.x, T, beatNow);
        if (on || pm) {
          s.y = T; s.vy = 0; s.onGround = true; s.djAvail = false;
          if (ev) ev.push({ type: "land", plat: !!pm });
          if (s.jbuf === 0) tryBounce(L, s, ev);
        }
      }
    } else {
      const head = s.y - SIZE, B = Math.ceil(head);
      if (B <= prevFeet - SIZE + 1e-9 && B > head) {
        for (let c = c0; c <= c1; c++) if (isSolid(L, c, B - 1)) { s.y = B + SIZE; s.vy = 0; if (ev) ev.push({ type: "bonk" }); break; }
      }
    }
  }

  const top = s.y - SIZE;
  const r0 = Math.floor(top + 0.02), r1 = Math.floor(s.y - 0.02);
  for (let r = r0; r <= r1 && !s.dead; r++) for (let c = c0; c <= c1 && !s.dead; c++) {
    const t = tile(L, c, r);
    if (t === ".") continue;
    if (t === "#") {
      let rt = r, rb = r;
      while (isSolid(L, c, rt - 1)) rt--;                 // 그 블록 기둥의 꼭대기
      while (rb + 1 < ROWS && isSolid(L, c, rb + 1)) rb++;   //            밑바닥(땅까지 이어지면 ROWS - 1)
      if (rb < ROWS - 1 && (rb + 1) - top < s.y - rt) {  // 떠 있는 박스에 아래쪽으로 걸쳤다: 올라타지 않고 밑으로 밀려난다(죽지 않는다)
        s.y = rb + 1 + SIZE;
        if (s.vy < 0) s.vy = 0;
        if (ev) ev.push({ type: "bonk" });
        r = r1 + 1; break;
      }
      {                                                  // 파란 박스의 옆면: 죽지 않고 저절로 올라탄다(박스는 한 칸씩만 높아지게 놓는다)
        s.y = rt;
        if (!frozen && !s.onGround) {
          s.vy = 0; s.onGround = true; s.djAvail = false;
          if (ev) ev.push({ type: "land" });
          if (s.jbuf === 0) tryBounce(L, s, ev);
        }
        if (ev) ev.push({ type: "climb" });
        r = r1 + 1; break;                                // 높이가 바뀌었으니 이번 스텝의 나머지 검사는 건너뛴다
      }
    } else if (t === "X") {
      if (s.x + HALF - 0.08 > c + 0.12 && s.x - HALF + 0.08 < c + 0.88 && s.y - 0.08 > r && top + 0.08 < r + 1) die(s, "spike", ev);
    } else if (t === "J") {
      if (s.onGround && r === s.y - 1) launch(s, "pad", ev);
    } else if (t === "O") {
      if (s.ring !== c) {      // 충전 고리: 이단 점프와 멈춤(1박)을 다시 채운다
        // 고리 사슬(20라운드부터 쓴다): 바로 앞(1~3칸)에 다음 고리가 있으면, 이 고리로 얻은 이단 점프는 그 고리까지 낮게 건너가는 작은 뜀이 된다 → 고리마다 탁탁 쳐서 직선으로 달린다.
        //   사슬의 마지막 고리는 다음 박에 땅에 닿게 튕겨 준다(그대로 박자에 맞춰 다시 튄다). 앞뒤에 고리가 없는 고리(4칸 넘게 떨어진 것)는 전처럼 보통 이단 점프다
        //   사슬 안에서는 4칸(한 박) 간격도 잇는다: 사슬 고리끼리면 보통 이단 점프만큼 크게 건너간다(탁탁 — 탁탁)
        const inChain = L.chainCols && L.chainCols.has(c);
        let k = 0; for (let d = 1; d <= (inChain ? 4 : 3) && !k; d++) { if (d === 4 && !L.chainCols.has(c + 4)) continue; for (let rr = r - 2; rr <= r + 2; rr++) if (tile(L, c + d, rr) === "O") { k = d; break; } }
        const prev = s.ring >= 0 && c - s.ring >= 1 && c - s.ring <= (inChain ? 4 : 3) && s.ringK !== 0;
        s.ringK = k ? k : prev ? -1 : 0;
        s.ring = c; s.djAvail = true; s.ringed = 1; if (!(L.chainCols && L.chainCols.has(c))) s.freeze = FREEZE_STEPS; if (ev) ev.push({ type: "ring", c, r, chain: s.ringK });      // (사슬 고리는 점프만 채운다)
      }
    } else if (t === "^" || t === "v") {
      const hx0 = c + 0.22, hx1 = c + 0.78;
      const hy0 = t === "^" ? r + 0.4 : r, hy1 = t === "^" ? r + 1 : r + 0.6;
      if (s.x + HALF - 0.08 > hx0 && s.x - HALF + 0.08 < hx1 && s.y - 0.08 > hy0 && top + 0.08 < hy1) die(s, "spike", ev);
    }
  }
  }
  const top = s.y - SIZE, c0 = Math.floor(s.x - HALF + 0.03), c1 = Math.floor(s.x + HALF - 0.03);
  if (L.floorH && hazardAt(L, s)) die(s, "spike", ev);
  if (!s.dead && L.movers && L.movers.length) {
    const bt = s.step / SUB, fh = (ROWS - 1) - s.y;
    for (const m of L.movers) {
      if (Math.abs(m.bar * 16 + 8 - s.x) > 24) continue;
      if (m.kind === "oring") {                        // 궤도 고리: 공의 가운데가 고리 안(반지름 + 공의 반)에 들어오면 충전 고리처럼 채운다. 같은 고리는 한 번만
        const q = moverShape(m, bt), key = "o" + m.id;
        if (s.ring !== key && Math.hypot(s.x - q.x, (fh + HALF) - q.y) < q.r + HALF * 0.9) { s.ring = key; s.ringK = 0; s.djAvail = true; s.ringed = 1; s.freeze = FREEZE_STEPS; if (ev) ev.push({ type: "ring", c: key, r: ROWS - 1 - q.y, x: q.x, y: ROWS - 1 - q.y }); }
        continue;
      }
      if (m.kind === "plat") {                         // 파란 발판의 몸통: 위에서가 아니라 옆·밑에서 겹치면 밑으로 밀려난다(죽지 않는다)
        if (s.mode !== "bounce" || s.onGround) continue;
        const q = moverShape(m, bt);
        if (s.x + HALF - 0.08 > q.x0 && s.x - HALF + 0.08 < q.x1 && fh + SIZE - 0.06 > q.y - 1 && fh + 0.06 < q.y - 0.05) {
          s.y = (ROWS - 1) - (q.y - 1 - SIZE); if (s.vy < 0) s.vy = 0; if (ev) ev.push({ type: "bonk" });
        }
        continue;
      }
      if (moverKills(m, bt, s.x, fh)) { die(s, "spike", ev); break; }
    }
  }
  if (!s.dead && s.mode === "bounce" && L.talls.length) {    // 높은 박스: 공의 바닥이 박스 꼭대기보다 낮은 채로 겹치면 죽는다
    const fh = (ROWS - 1) - s.y;
    for (const q of L.talls) if (Math.abs(s.x - q.x) < q.w / 2 + HALF - 0.08 && fh + 0.06 < q.h) { die(s, "spike", ev); break; }
  }   // 패턴 통로의 장애물(바닥에서 솟은 덩어리와 매달린 덩어리)
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

// 밀도: 바운스 구간에서 "눌러야 하는 시간"의 비율. 공이 땅에서 뜬 순간부터 다음에 땅에서 뜰 때까지를 한 토막으로 보고,
// 그 토막 안에 입력(누르기, 멈춤의 시작)이 있으면 찬 토막이다. 함정이라 일부러 안 눌러야 하는 자리가 든 토막은 trap으로 따로 센다.
// 세지 않는 마디: 평지(flat), 체크포인트(cp: 다시 시작하는 자리라 비워 둔다), 결승선과 그 뒤, 피버.
// 결과: { touch = 누르는 토막의 시간 비율, busy = 누르는 토막 + 함정 토막, empty = [빈 토막의 시작 박, ...] }
function touchDensity(course, L) {
  const counted = (b) => { const n = course.bars[b], p = PATTERNS[n]; return !!p && p.mode !== "rush" && (p.holds.length || p.presses.length || p.traps || p.boxes || p.floats || p.caps || n === "idle"); };
  const marks = [], traps = [];
  course.bars.forEach((n, b) => {
    const p = PATTERNS[n]; if (!p || p.mode === "rush") return;
    const mine = new Set([...p.presses, ...p.holds.map((h) => h[0])]);
    for (const t of p.presses) marks.push(4 * b + t);
    for (const h of p.holds) marks.push(4 * b + h[0]);
    for (const t of p.traps || []) { const src = t.full || t; for (const v of [...(src.presses || []), ...(src.holds || []).map((h) => h[0])]) if (!mine.has(v)) traps.push(4 * b + v); }
  });
  const inp = planInput(L.ref), s = spawnState(L, -1), launches = [];
  while (!s.dead && !s.won) { const ev = []; stepState(L, s, inp.press.has(s.step + 1), ev, inp.hold.has(s.step + 1)); if (s.mode === "bounce" && (ROWS - 1) - s.y < 0.2 && ev.some((e) => e.type === "bounce" || e.type === "jump")) launches.push(s.step / SUB); }
  let total = 0, touch = 0, busy = 0; const empty = [];
  for (let i = 0; i + 1 < launches.length; i++) {
    const a = launches[i], z = launches[i + 1], b = Math.floor((a + 1e-6) / 4);
    if (!counted(b) || z - a > 6) continue;             // (피버를 사이에 둔 토막은 뺀다)
    const has = (list) => list.some((t) => t >= a - 0.34 && t < z - 0.34);      // 뜨기 직전(1/3박 안)에 미리 누른 것은 다음 토막의 입력이다
    total += z - a;
    // 함정: 일부러 안 누르는 자리. 눌렀다면 두 박쯤 떠 있었을 것이므로, 그 자리가 든 토막과 바로 다음 토막(같은 마디 안)까지 함정 토막으로 친다
    const trapHere = traps.some((t) => Math.floor(t / 4) === b && t >= a - 0.34 - 1.1 && t < z - 0.34);
    if (has(marks)) { touch += z - a; busy += z - a; } else if (trapHere) busy += z - a; else empty.push(+a.toFixed(2));
  }
  return { touch: total ? touch / total : 0, busy: total ? busy / total : 0, beats: total, empty };
}

// ---------- 자동 풀이(검증용): grid 스텝마다 [아무것도 안 함 / 멈춤 누르고 있기 / 점프]를 탐색.
// opts.noFreeze, opts.noJump, opts.noGroundJump으로 입력을 막아 볼 수 있다. 결과: { presses: [스텝], holds: [[시작, 끝)] }
function solve(L, start, opts = {}) {
  const grid = opts.grid || 12, untilX = opts.untilX ?? Infinity;
  const s0 = { ...start };
  for (let i = 0; i < (opts.offset || 0); i++) stepState(L, s0, false, null, false);
  if (s0.dead) return { plan: null, best: s0.x };
  const seen = new Set();
  const key = (s) => `${s.step}|${Math.round(s.y * 16)}|${Math.round(s.vy * 2)}|${s.onGround ? 1 : 0}${s.djAvail ? 1 : 0}${s.djq || 0}${s.ringK || 0}|${Math.ceil(s.freeze / 8)}|${s.zk}|${s.zlk}${s.zin}${s.ztog}${s.zpend || 0}`;
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

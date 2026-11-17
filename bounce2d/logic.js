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
  // ---- 함정 마디: 앞의 마디들과 똑같이 누르면 죽는다. "연속으로 치다가 뚝 끊기".
  //   traps = [{ presses: 더 누르면 죽어야 하는 시각들 }, ...]. 코스를 만들 때 이 "버릇대로 누른 달리기"도 틀린 달리기에 넣어서,
  //   그걸 막는 빨간 덩어리가 남는다: 누르면 안 되는 자리 바로 위에 매달린 덩어리. 한 번 더 뛰면 거기에 부딪힌다(죽는 까닭이 그 자리에서 바로 보인다).
  //   그 자리에 ✕ 표시를 두는 것은 너무 친절해서 뺐다.
  goStop:    { holds: [], presses: [0.5], tol: 0.18, traps: [{ presses: [2.5] }] },                 // peak의 앞 절반만: 탁, (뚝)
  stopGo:    { holds: [], presses: [2.5], tol: 0.18, traps: [{ presses: [0.5] }] },                 // 뒤 절반만: (뚝), 탁
  // mix·glideHigh의 앞 절반만: 멈춤, (뚝). 뒤에서 오른쪽을 눌러도, 왼쪽(멈춤)을 눌러도 죽는다(뜬 공이 내려앉을 자리에 낮은 덩어리가 하나 더 놓인다)
  holdStop:  { holds: [[0.5, 1.375]], presses: [], tol: 0.18, traps: [{ presses: [2.5] }, { holds: [[0.5, 1.375], [2.5, 3.25]] }] },
  // ---- 이후 라운드용으로 보관(지금 코스에서는 쓰지 않는다): 매달린 덩어리가 없는 함정. sneaky: true = 함정을 막는 덩어리를 세우지 않는다.
  //   버릇대로 한 번 더 뛰면 멀리 날아가서 착지할 자리의 빨간 바닥(lava)에 떨어진다. 죽는 것이 한 박쯤 늦게 와서 더 어렵고, 미리 알아채기도 어렵다.
  goStopB:   { holds: [], presses: [0.5], tol: 0.18, sneaky: true, lava: [[13, 14]], traps: [{ presses: [2.5] }] },
  stopGoB:   { holds: [], presses: [2.5], tol: 0.18, sneaky: true, lava: [[5, 6]], traps: [{ presses: [0.5] }] },
  holdStopB: { holds: [[0.5, 1.375]], presses: [], tol: 0.18, sneaky: true, lava: [[13, 14]], traps: [{ presses: [2.5] }] },
  ringFake:  { holds: [], presses: [0.5, 1.375], tol: 0.18, sneaky: true, rings: [[6, 1], [6, 2], [10, 1], [10, 2]], lava: [[2, 8], [14, 14]], traps: [{ presses: [2.375] }] },   // 고리 둘 가운데 뒤의 것은 미끼
  // ---- 파란 박스가 있는 쉬는 마디. 파란 박스는 닿아도 죽지 않는다: 위에 내려앉아 박자에 맞춰 다시 튀고, 옆에서 부딪히면 저절로 올라탄다.
  //   boxes = [[첫 칸, 끝 칸, 높이(칸)], ...] (마디 안의 칸 0~15). 누를 것은 없다. 쉬는 마디가 비어 보이지 않게 하려는 것.
  //   마디가 끝날 때는 공이 땅에서 박자에 맞춰 튀고 있어야 한다(다음 마디의 패턴이 그대로 맞도록) — 테스트가 확인한다.
  box:       { holds: [], presses: [], boxes: [[3, 9, 1]] },                       // 한 단: 올라타서 한 번 튀고 내려온다
  twin:      { holds: [], presses: [], boxes: [[3, 5, 1], [7, 9, 1]] },            // 박스 둘: 하나를 밟고 다음 박스로 건너뛴다
  stairs:    { holds: [], presses: [], boxes: [[3, 6, 1], [7, 10, 2]] },           // 두 단 계단: 타닥 타닥 올라가서 뛰어내린다
  // ---- 빨간 바닥과 파란 섬: 박스를 써야 지나가는 마디. lava = [[첫 칸, 끝 칸], ...]의 땅은 닿으면 죽고, 그 위의 파란 박스만 디딜 수 있다.
  //   그냥 튀면 빨간 바닥에 떨어진다. 박스에서는 박자에 맞춰 저절로 다시 튀어 빨간 바닥 밖으로 나간다.
  lavaHop:   { holds: [[0.5, 1.0]], presses: [], tol: 0.18, boxes: [[5, 9, 1]], lava: [[1, 4]] },               // 꼭대기에서 멈춰 빨간 바닥을 건너 박스 섬에 내려앉는다
  lavaLeap:  { holds: [], presses: [0.5], tol: 0.18, boxes: [[5, 9, 2]], lava: [[1, 4]] },                      // 이단 점프로 높은 박스 섬에 올라탄다
  lavaGlide: { holds: [[1.375, 2.25]], presses: [], tol: 0.18, boxes: [[3, 5, 1]], lava: [[6, 9]] },            // 박스를 밟고 튀어, 꼭대기에서 멈춰 빨간 바닥을 건넌다
  // 누르는 시각은 모두 1/8박 단위다(곡의 음 단위). 누르는 순간이 곡의 소리와 겹치게 하려는 것.
  // tol = 통로를 만들 때 봐주는 타이밍 오차(박). 곡이 빨라서(한 박 0.39초) 넓게 잡았다. 너무 넓히면 장애물이 그 입력을 요구하지 못하게 되므로 패턴마다 다르다.
  // ---- 쉬운 동작(입력 한두 번, 모두 엇박). 라운드 1의 바탕.
  // 꼭대기에서 멈춰 건너가기: 마디 앞쪽 / 뒤쪽
  hA:        { holds: [[0.5, 1.375]], presses: [], tol: 0.18 },
  hB:        { holds: [[2.5, 3.375]], presses: [], tol: 0.18 },
  // 꼭대기에서 이단 점프: 마디 앞쪽 / 뒤쪽
  dj1:       { holds: [], presses: [0.5], tol: 0.18 },
  dj2:       { holds: [], presses: [2.5], tol: 0.18 },
  // 섞기: 멈춤 → 이단 점프 / 이단 점프 → 멈춤
  mix:       { holds: [[0.5, 1.375]], presses: [2.5], tol: 0.18 },
  mix2:      { holds: [[2.5, 3.25]], presses: [0.5], tol: 0.18 },
  // ---- 조금 더 어려운 동작
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
  // ---- 충전 고리(3라운드): 공중에 뜬 고리를 지나면 이단 점프가 다시 찬다. 고리마다 눌러서 땅에 닿지 않고 빨간 바닥을 건넌다.
  //   rings = [[칸, 높이], ...] (그 칸의 높이~높이+1칸. 같은 칸에 둘을 쌓아 세로로 긴 고리 하나로 쓴다).
  //   고리에 닿기 조금 전에 눌러도 닿는 순간 뛴다(입력을 1/3박 기억한다). 그래서 누르는 자리를 고리 바로 앞(1/8박 앞)에 둔다:
  //   조금 일찍 눌러도 고리에서 뛰고, 늦게 눌러도 빨간 바닥에 닿기 전이면 된다(처음엔 고리를 지난 뒤에 누르게 했더니 늦는 쪽 여유가 60ms뿐이었다).
  ring1:     { holds: [], presses: [0.5, 1.375], tol: 0.18, rings: [[6, 1], [6, 2]], lava: [[2, 8]] },                             // 이단 점프 → 고리에서 한 번 더
  ringWave:  { holds: [], presses: [0.5, 1.375, 2.375], tol: 0.18, rings: [[6, 1], [6, 2], [10, 1], [10, 2]], lava: [[2, 12]] },   // 고리 둘: 탁, 탁, 탁으로 물결치듯 건넌다
  // <gen:patterns:R2>
  // 도구(tools_gen_course.js R2 13)가 무작위로 뽑아, 실제로 달려 보고 통과한 패턴들. 손으로 고치지 말고 도구를 다시 돌린다.
  g2_2: { holds: [[0.5, 1.125]], presses: [], tol: 0.18 },
  g2_4: { holds: [[0.5, 1.375]], presses: [2.5], tol: 0.18 },
  g2_8: { holds: [[0.5, 1.125]], presses: [2.5], tol: 0.18 },
  g2_10: { holds: [[0.5, 1.125], [2.5, 3.25]], presses: [], tol: 0.18, traps: [{full: {presses: [2.5], holds: [[0.5, 1.125]]}}] },   // 함정(손 바꿈): 마지막이 오른쪽이 아니라 왼쪽
  g2_11: { holds: [], presses: [0.5, 3.5], tol: 0.18 },
  g2_12: { holds: [[2, 2.75]], presses: [1.5], tol: 0.18 },
  g2_13: { holds: [[2.375, 3.25]], presses: [0.375], tol: 0.18 },
  g2_15: { holds: [], presses: [0.375], tol: 0.18, traps: [{full: {presses: [0.375], holds: [[2.375, 3.25]]}}] },   // 함정(뚝): 앞의 두 마디와 같이 가다가 마지막은 누르지 않는다
  g2_16: { holds: [[0.5, 1], [2.375, 3.375]], presses: [], tol: 0.18 },
  g2_18: { holds: [[0.5, 1]], presses: [2.375], tol: 0.18, traps: [{full: {presses: [], holds: [[0.5, 1], [2.375, 3.375]]}}] },   // 함정(손 바꿈): 마지막이 왼쪽이 아니라 오른쪽
  g2_19: { holds: [[0.375, 1], [3, 3.875]], presses: [2.5], tol: 0.18 },
  g2_20: { holds: [], presses: [1.375], tol: 0.18 },
  g2_21: { holds: [[0.375, 1.25], [3, 3.875]], presses: [2.5], tol: 0.18 },
  g2_22: { holds: [], presses: [1.625, 3.625], tol: 0.18 },
  g2z25: { mode: "rush", nodes: "F...F.S." },
  g2w28: { mode: "rush", wide: true, gap: 1.5, nodes: ".FFFFFS." },
  g2w29: { mode: "rush", wide: true, gap: 1.5, nodes: ".FFSFS.." },   // 뚝: 앞 마디(.FFFFFS.)와 같이 가다가 끊긴다
  g2z31: { mode: "rush", nodes: "S.F.F.S." },
  g2_33: { holds: [[0.375, 0.875]], presses: [2.375], tol: 0.18 },
  g2_35: { holds: [[1, 1.875]], presses: [0.5], tol: 0.18 },
  g2_37: { holds: [[1.375, 2.125], [3.5, 4]], presses: [], tol: 0.18 },
  g2_38: { holds: [], presses: [1.625, 3.625], tol: 0.18 },
  g2_40: { holds: [[1.5, 2.125]], presses: [2.25], tol: 0.18 },
  g2_42: { holds: [[1.5, 2.125], [2.25, 3]], presses: [], tol: 0.18, traps: [{full: {presses: [2.25], holds: [[1.5, 2.125]]}}] },   // 함정(손 바꿈): 마지막이 오른쪽이 아니라 왼쪽
  g2_43: { holds: [[1, 1.5]], presses: [0.5], tol: 0.18 },
  g2_45: { holds: [], presses: [0.5], tol: 0.18, traps: [{full: {presses: [0.5], holds: [[1, 1.5]]}}] },   // 함정(뚝): 앞의 두 마디와 같이 가다가 마지막은 누르지 않는다
  g2_46: { holds: [[3, 3.875]], presses: [0.375, 2.5], tol: 0.18 },
  g2_47: { holds: [[1.625, 2.25]], presses: [3.5], tol: 0.18 },
  g2_48: { holds: [[2, 2.875]], presses: [1.5], tol: 0.18 },
  g2_49: { holds: [[1, 1.875]], presses: [0.5], tol: 0.18 },
  g2_51: { holds: [[0.625, 1.125], [2.5, 3.125]], presses: [3.25], tol: 0.18 },
  g2_52: { holds: [], presses: [1.375, 3.375], tol: 0.18 },
  g2_53: { holds: [[1.5, 1.875]], presses: [2], tol: 0.18 },
  g2_54: { holds: [[1, 1.75]], presses: [0.5], tol: 0.18 },
  g2_56: { holds: [[0.625, 1.375], [2.5, 3.125]], presses: [3.25], tol: 0.18 },
  g2_57: { holds: [[2.5, 3.125]], presses: [], tol: 0.18 },
  g2_58: { holds: [[0.375, 1.125], [2.375, 3]], presses: [], tol: 0.18 },
  g2_59: { holds: [[0.5, 1.125]], presses: [1.25], tol: 0.18 },
  g2_61: { holds: [[0.5, 1.125], [1.25, 2]], presses: [], tol: 0.18, traps: [{full: {presses: [1.25], holds: [[0.5, 1.125]]}}] },   // 함정(손 바꿈): 마지막이 오른쪽이 아니라 왼쪽
  g2_62: { holds: [[0.375, 1.375], [2.5, 3.125]], presses: [3.25], tol: 0.18 },
  g2w65: { mode: "rush", wide: true, gap: 1.5, nodes: "..FSFFS." },
  g2w66: { mode: "rush", wide: true, gap: 1.5, nodes: "..FSS.F." },   // 뚝: 앞 마디(..FSFFS.)와 같이 가다가 끊긴다
  g2w67: { mode: "rush", wide: true, gap: 1.5, nodes: "F.SFFF.." },
  g2z69: { mode: "rush", nodes: "..F.F.S." },
  // </gen:patterns:R2>
  // ---- 고리 연타(3라운드): 고리 셋을 이어서 탁탁탁탁. 마디 끝에서도 공중에 떠 있으므로, 바로 다음 마디는 ringStop이나 ringGlide여야 한다.
  ringRun:   { holds: [], presses: [0.5, 1.375, 2.375, 3.375], tol: 0.18, rings: [[6, 1], [6, 2], [10, 1], [10, 2], [14, 1], [14, 2]], lava: [[2, 15]] },
  // 연타 끝의 함정 ①(뚝): 고리가 하나 더 있지만 미끼다. 누르지 않고 내려앉아야 한다. 누르면 바로 위의 빨간 덩어리에 부딪힌다
  ringStop:  { holds: [], presses: [], after: "ringRun", rings: [[2, 1], [2, 2]], lava: [[0, 1]], traps: [{ presses: [0.375] }] },
  ringStopB: { holds: [], presses: [], after: "ringRun", sneaky: true, rings: [[2, 1], [2, 2]], lava: [[0, 1], [5, 6]], traps: [{ presses: [0.375] }] },   // (보관) 누르면 멀리 날아가 빨간 바닥에 떨어진다
  // 연타 끝의 함정 ②(왼쪽): 다음 고리가 두 배로 멀다. 오른쪽을 한 번 더 누르면 헛손질이고, 왼쪽(멈춤)으로 떠서 건너가야 닿는다
  ringGlide: { holds: [[0.0, 1.0]], presses: [1.375], tol: 0.18, after: "ringRun", rings: [[6, 1], [6, 2]], lava: [[0, 8]] },
  // ---- 계단으로 박자 틀기(3라운드, 시험): 박스 한 칸을 오를 때마다 1/8박씩 일찍 닿아, 네 칸을 오르면 반 박이 당겨진다(엇박).
  //   꼭대기(네 칸 높이)에 있는 동안은 공이 박자와 박자 사이에 닿는다. 내려올 때는 한 칸에 1/8박씩 늦어져 정박으로 돌아온다.
  //   tall: true = 화면이 물러나야 다 보이는 마디. 이어 붙여 쓴다: upStairs … downStairs, 그리고 그다음 마디는 첫 박을 건너뛰고 둘째 박부터 튄다.
  upStairs:   { holds: [], presses: [], tall: true, boxes: [[3, 6, 1], [7, 9, 2], [10, 13, 3], [14, 15, 4]] },    // 타 닥 닥 닥: 한 박보다 조금씩 빠르게 네 단을 오른다
  skyRun:     { holds: [], presses: [], tall: true, sky: true, boxes: [[0, 15, 4]] },                              // 꼭대기: 엇박으로 튀며 간다
  skyHold:    { holds: [[1.0, 1.875]], presses: [], tol: 0.18, tall: true, sky: true, boxes: [[0, 15, 4]] },       // 꼭대기에서 멈춰 건너가기(누르는 자리가 정박에 온다)
  skyDj:      { holds: [], presses: [1.0], tol: 0.18, tall: true, sky: true, boxes: [[0, 15, 4]] },                // 꼭대기에서 이단 점프
  downStairs: { holds: [], presses: [], tall: true, sky: true, boxes: [[0, 3, 4], [4, 8, 3], [9, 13, 2], [14, 15, 1]] },   // 한 박보다 조금씩 느리게 네 단을 내려온다
  // ---- 피버 구간(rush). 원버튼(화면 어디든). 공이 바닥과 천장 사이를 비스듬히 튕기고, 누르는 즉시 위아래 방향이 뒤집힌다.
  //   nodes = 반 박 지점 8개(마디 안 0.5박, 1박, …, 4박): F 이 박에 뒤집어야 함 / S 뒤집으면 안 됨 / . 상관없음. F·S는 공이 가운데 높이를 지나는 지점에만 쓴다.
  //   좁은 통로의 마디는 바닥에서 시작해 바닥에서 끝난다(뒤집기는 짝수 번). 넓은 통로의 마디는 천장에서 시작해 천장에서 끝난다(계단으로 올라가서 시작한다).
  zE: { mode: "rush", nodes: "........" },
  // 연출만 있는 마디: 장애물이 없고, 공이 저절로 바닥과 천장을 오간다. 눌러도 길은 바뀌지 않는다(다음 마디와 박자가 어긋나지 않게).
  zF: { mode: "rush", nodes: "........", free: true },
  // 파란 발판·계단: 닿아도 죽지 않고 튕기기만 한다. 연출 마디가 비어 보이지 않게 채운다.
  //   lo/hi = 반 박 지점(마디 안 0박, 0.5박, …, 3.5박)마다 바닥 쪽·천장 쪽 발판의 높이 단계. 공은 그 사이에서 튕긴다.
  zT: { mode: "rush", nodes: "........", free: true, lo: "00000110", hi: "21122222" },                // 천장에 매달린 발판 밑을 낮게, 이어서 바닥 발판 위를 높게
  // 넓은 통로로 들어가는 계단: 바닥 계단과 천장 계단 사이를 타닥타닥 튕기며 천장까지 올라간다. 화면이 여기서 "확" 물러난다.
  wUp: { mode: "rush", nodes: "........", free: true, wide: true, start: 0, lo: "00111222", hi: "22223334" },
  // 넓은 통로에서 나오는 계단: 천장에서 바닥까지 같은 식으로 내려온다. 화면이 여기서 다시 다가온다.
  wDn: { mode: "rush", nodes: "........", free: true, wide: true, lo: "22221110", hi: "44333222" },
  // 넓은 통로(wide): 천장이 두 배 높이로 물러나, 높이가 다섯 단계(바닥 0 ~ 천장 4)가 된다. 바닥에서 천장까지 두 박.
  //   가운데 단계(1~3)에서 뒤집을 수 있고, 틀린 쪽이 공중이면 거기에 떠 있는 장애물(마름모)이 놓인다.
  w1: { mode: "rush", wide: true, nodes: ".S...S.." },     // 바닥까지 크게 내려갔다 올라온다(안 누름). 천장과 바닥의 이빨 사이를 지난다
  w2: { mode: "rush", wide: true, nodes: ".F...F.." },     // 천장으로 한 번 되돌아간 뒤 깊이 내려갔다가, 바닥 직전에 눌러 올라온다
  w3: { mode: "rush", wide: true, nodes: "..F...F." },     // 통로 위쪽 절반에서만 오르내린다. 아래에 떠 있는 장애물 위를 지난다
  // 연타(넓은 통로 가운데에서 반 박마다 누른다)와 그 끝의 "뚝". 장애물을 공에서 1.5칸 띄운다(1칸이면 다음 것을 조금 일찍 누를 때 앞의 장애물에 걸려서 일찍 쪽 여유가 62ms뿐이었다).
  // 누르지 말아야 할 자리에서 한 번 더 누르면 장애물 쪽으로 꺾인다.
  w5: { mode: "rush", wide: true, gap: 1.5, nodes: "SFFFFFS." },     // 다섯 번 연타, 그리고 뚝
  w6: { mode: "rush", wide: true, gap: 1.5, nodes: "SSFFFSS." },     // 깊이 내려가서 세 번 연타
  w7: { mode: "rush", wide: true, gap: 1.5, nodes: "F.SFFFS." },     // 한 번, 쉬고, 세 번, 뚝
  w8: { mode: "rush", wide: true, gap: 1.5, nodes: "SFFFS.F." },     // 세 번에서 뚝(w5 다음에 놓는다: 다섯 번을 치던 손이 세 번에서 멈춰야 한다), 그리고 한 번
  w4: { mode: "rush", wide: true, nodes: "F.F.F.F." },     // 천장을 스치듯: 한 박마다 눌러 천장으로 되돌아간다. 바로 밑에 장애물이 줄지어 떠 있다
  // 조여드는 통로(연출): 바닥과 천장이 가운데로 모여들어, 공이 닿는 간격이 한 박 → 반 박 → … → 1/32박까지 빨라진다("타다다다닥" → "드르르륵").
  // squeeze = 닿는 간격(박)을 차례로 적은 것. 한 마디에 4박어치. 피버의 맨 끝에만 쓴다(통로가 좁아진 채로 끝난다).
  zS1: { mode: "rush", nodes: "........", free: true, squeeze: [1, 1, 0.5, 0.5, 0.5, 0.5] },
  // 둘째 마디: 한 박마다 간격을 반으로. 마지막 박에는 1/32박(약 12ms)마다 닿아 통로가 공 크기와 거의 같아진다(폭 0.92칸, 공 0.8칸)
  zS2: { mode: "rush", nodes: "........", free: true, squeeze: [...Array(4).fill(1 / 4), ...Array(8).fill(1 / 8), ...Array(16).fill(1 / 16), ...Array(32).fill(1 / 32)] },
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
const ROUND1 = {
  name: "ROUND 1 · Octane Horizon",
  bpm: 152.0285,                                 // 곡에서 잰 값(킥 256개를 직선에 맞춤). 구간별 어긋남은 ±12ms 안쪽
  track: { file: "music/octane_horizon.mp3", offset: 0.8689 },   // offset = 첫 박이 나오는 곡 속 시각(초)
  // 라운드 1: 어렵지 않게, 그래도 손맛은 있게.
  //  - 입력은 마디당 한두 번이고 전부 엇박(킥과 킥 사이). 킥은 공이 저절로 치고, 그 사이의 "탁"을 손이 친다.
  //  - 한 번에 하나씩 가르친다(멈춤 → 이단 점프 → 섞기). 4마디가 한 마디 말: 해 보기 · 한 번 더 · 살짝 비틀기 · 쉬기.
  //  - 어려운 엮기(weave, roller, lowThenUp)는 쓰지 않는다. 쉬운 동작을 이어 붙여 흐름을 만든다.
  bars: [
    // 도입(조용함): 멈춤만 → 이단 점프만
    "flat", "flat", "hA", "idle",   "hA", "idle", "hB", "box",   "glideHigh", "idle", "dj1", "twin",   "dj2", "stairs", "peak", "cp",
    // 첫 큰 구간: 둘을 섞는다
    "mix", "box", "mix", "stairs",   "mix2", "idle", "glideHigh", "peak",   "twin", "mix", "skyGlide", "cp",
    // 가장 센 구간: 피버. 같은 마디를 두 번씩(한 번 보고, 한 번 더)
    "z1", "z1", "z2", "z2",   "z3", "z3", "z4", "z4",   "z6", "z5", "z2", "cp",
    // 쉬어 감
    "stairs", "hA", "box", "dj2",
    // 다시 쌓음: 쉬는 마디를 줄인다
    "mix", "mix2", "twin", "glideHigh",   "peak", "stairs", "skyGlide", "cp",
    // 마지막 절정: 배운 것을 세 마디씩 이어 붙인다
    "mix", "mix2", "skyGlide", "box",   "glideHigh", "peak", "mix", "stairs",   "mix2", "skyGlide", "peak", "glideHigh",
    "goal", "flat", "flat",
  ],
  sections: [
    { bar: 0, id: "intro" }, { bar: 16, id: "a" }, { bar: 28, id: "rush" }, { bar: 40, id: "c" }, { bar: 44, id: "b" }, { bar: 52, id: "d" }, { bar: 64, id: "outro" },
  ],
};

// 라운드 2: "Terminal Pursuit". 분당 152박(1라운드와 같다), 첫 박 0.281초, 72마디이고 73번째 마디 첫 박에 끝맺는 한 방.
// 곡의 구간(마디): 0~7 도입(끝 두 마디는 조용) / 8~22 첫 큰 구간(16부터 멜로디) / 23 채움 / 24~31 밝고 가벼운 구간 / 32~39 쉬어 감
//                / 40~54 두 번째 큰 구간(48부터 더 밝게) / 55 채움 / 56~63 절정 / 64~71 가장 센 절정
// 1라운드와 같은 동작에, 후반부터 "빨간 바닥과 파란 섬"이 더해진다. 쉬는 마디가 조금 줄고, 피버가 두 번 나오며, 피버 안에 장애물 없이 연출만 있는 마디(파란 발판·계단, 조여드는 통로)가 있다.
const ROUND2 = {
  name: "ROUND 2 · Terminal Pursuit",
  bpm: 151.9867,
  track: { file: "music/terminal_pursuit.mp3", offset: 0.2809 },
  // 2라운드의 마디는 도구(tools_gen_course.js R2)가 뽑는다: 무작위로 뽑은 키 패턴을 실제로 달려 보고 통과한 것만 남긴다.
  // 틀(어느 마디가 체크포인트·피버·빨간 바닥인지)은 도구 안의 TEMPLATES에 있다.
  bars: [
    // <gen:bars:R2>
    // 도입: 앞에서 배운 동작을 섞어서. 끝에서 곡이 잠깐 빠지는 자리만 쉰다
    "flat", "flat", "g2_2", "g2_2",   "g2_4", "g2_4", "box", "cp",
    // 첫 큰 구간
    "g2_8", "g2_8", "g2_10", "g2_11",   "g2_12", "g2_13", "g2_13", "g2_15",
    "g2_16", "g2_16", "g2_18", "g2_19",   "g2_20", "g2_21", "g2_22", "cp",
    // 밝고 가벼운 구간: 첫 피버. 파란 발판 → 좁은 통로 → 계단으로 올라가 넓은 통로 → 계단으로 내려와 다시 좁은 통로
    "zT", "g2z25", "g2z25", "wUp",   "g2w28", "g2w29", "wDn", "g2z31",
    // 새 장치(빨간 바닥과 파란 섬)를 하나씩 보여 주고, 사이는 뽑은 패턴으로 채운다
    "lavaHop", "g2_33", "lavaLeap", "g2_35",   "lavaGlide", "g2_37", "g2_38", "cp",
    // 두 번째 큰 구간: 뽑은 패턴에 빨간 바닥 마디가 섞인다
    "g2_40", "g2_40", "g2_42", "g2_43",   "g2_43", "g2_45", "g2_46", "g2_47",
    "g2_48", "g2_49", "g2_49", "g2_51",   "g2_52", "g2_53", "g2_54", "cp",
    // 절정
    "g2_56", "g2_57", "g2_58", "g2_59",   "g2_59", "g2_61", "g2_62", "cp",
    // 가장 센 절정: 마지막 피버. 들어서자마자 계단으로 넓은 통로에 올라간다. 끝의 두 마디는 연출만 — 통로가 조여들며 타다다다닥, 끝맺는 한 방에 터져 나온다
    "wUp", "g2w65", "g2w66", "g2w67",   "wDn", "g2z69", "zS1", "zS2",
    "goal", "flat", "flat",
    // </gen:bars:R2>
  ],
  sections: [
    { bar: 0, id: "intro" }, { bar: 8, id: "a" }, { bar: 24, id: "rush" }, { bar: 32, id: "c" }, { bar: 40, id: "b" }, { bar: 56, id: "d" }, { bar: 64, id: "rush" }, { bar: 72, id: "outro" },
  ],
};
// 라운드 3: "Final Quarter Credit". 분당 152박(앞의 두 라운드와 같다). 곡은 0.26초에 시작하고 첫 킥은 2.63초.
// 코스의 첫 박은 첫 킥보다 한 마디 앞(1.052초)으로 잡았다: 그래야 본 리듬이 시작하는 자리(12.1초)가 마디 7의 첫 박이 되고, 그 뒤로 여덟 마디마다 구간이 바뀐다.
// 곡의 구간(마디): 0~6 조용한 도입(킥이 두 마디에 한 번) / 7~14 본 리듬 / 15~22 더 밝게(22는 숨 고르기) / 23~30 낮게 깔림(30에서 올라감)
//                / 31~38 첫 절정 / 39~46 가라앉음 / 47~54 본 리듬 다시 / 55~62 더 밝게 / 63~70 낮게 깔렸다가 쌓아 올림 / 71~77 마지막 절정 / 78의 둘째 박에서 곡이 끊긴다
// (디스코 펑크 곡 "Chasing the Gold Token"으로 한 번 만들었다가 곡을 바꿨다.)
// 새 요소 둘: 충전 고리(본 리듬 첫 구간에서 가르친다)와 계단으로 박자 틀기(가라앉는 구간에서 시험한다). 쉬는 마디는 거의 없다.
const ROUND3 = {
  name: "ROUND 3 · Final Quarter Credit",
  bpm: 152.0183,
  track: { file: "music/final_quarter_credit.mp3", offset: 1.0518 },
  pal: {                                               // 이 라운드의 색: 금빛과 청록
    intro: { top: "#0a1f1c", bottom: "#14594f", accent: "#ffd84a", sun: "#ffb347" },
    a:     { top: "#10231a", bottom: "#1f7a4d", accent: "#ffe066", sun: "#ffd166" },
    b:     { top: "#0b1030", bottom: "#3a2a7a", accent: "#7df9ff", sun: "#c9a0ff" },
    c:     { top: "#2a1606", bottom: "#a8501a", accent: "#fff1a8", sun: "#ffd84a" },
    d:     { top: "#1a0a2a", bottom: "#7a1f6e", accent: "#ffd84a", sun: "#ff9a3c" },
    rush:  { top: "#141006", bottom: "#8a6a10", accent: "#ffffff", sun: "#ffe066" },
  },
  bars: [
    // 도입(조용함): 앞에서 배운 것을 두 번씩 누르는 마디로. 구간의 마지막 마디마다 체크포인트
    "flat", "flat", "mix", "peak",   "mix2", "glideHigh", "cp",
    // 본 리듬: 충전 고리를 가르친다(하나 두 번 → 둘 두 번). 사이는 아는 동작으로 채운다
    "ring1", "ring1", "peak", "ringWave",   "ringWave", "mix", "lavaHop", "cp",
    // 더 밝게: 고리 연타. 탁탁탁(ringWave) → 탁탁탁탁(ringRun) → 뚝(ringStop: 다음 고리는 미끼) … 다시 연타 → 이번엔 왼쪽(ringGlide: 다음 고리가 두 배로 멀다)
    "ringWave", "ringRun", "ringStop", "lavaLeap",   "skyGlide", "ringRun", "ringGlide", "cp",
    // 낮게 깔림: 손 함정. 오른쪽만 다섯 번 → 뚝 / 왼쪽만 다섯 번 → 뚝
    "peak", "peak", "goStop", "lavaGlide",   "glideHigh", "glideHigh", "holdStop", "cp",
    // 첫 절정: 피버. 매 박 누르다 뚝(z5 → z4) → 계단으로 넓은 통로 → 다섯 번 연타 두 번 뒤 세 번에서 뚝(w5, w5 → w8) → 계단으로 내려온다
    "z5", "z4", "wUp", "w5",   "w5", "w8", "wDn", "z7",
    "cp",
    // 가라앉는 구간: 계단으로 박자 틀기(시험). 네 단을 오르면 엇박 → 꼭대기에서 멈춤 → 이단 점프 → 멈춤 → 네 단을 내려오면 정박(내려온 마디는 뒤 절반에서만 누른다)
    "upStairs", "skyHold", "skyDj", "skyHold",   "downStairs", "dj2", "cp",
    // 본 리듬 다시: 고리 연타 뒤 왼쪽 → 왼·오 다섯 번 → 뚝
    "ringWave", "ringRun", "ringGlide", "mix",   "mix", "holdStop", "lavaLeap", "cp",
    // 더 밝게: 계단을 한 번 더(꼭대기에서 이단 점프) → 오른쪽만 다섯 번 → 뚝
    "upStairs", "skyDj", "downStairs", "hB",   "peak", "peak", "goStop", "cp",
    // 낮게 깔렸다가 쌓아 올림: 빨간 바닥 → 고리 연타 → 뚝 → 오, 그리고 뚝 → 오
    "lavaHop", "lavaGlide", "ringWave", "ringRun",   "ringStop", "peak", "stopGo", "cp",
    // 마지막 절정: 피버. 들어서자마자 넓은 통로의 연타. 끝의 두 마디는 연출 — 통로가 조여들다 터져 나오고, 곡이 끊기는 순간에 결승선을 지난다
    "wUp", "w6", "w5", "w8",   "wDn", "zS1", "zS2",
    "goal", "flat", "flat",
  ],
  sections: [
    { bar: 0, id: "intro" }, { bar: 7, id: "a" }, { bar: 15, id: "d" }, { bar: 23, id: "c" }, { bar: 31, id: "rush" }, { bar: 39, id: "b" }, { bar: 47, id: "a" }, { bar: 55, id: "d" }, { bar: 63, id: "c" }, { bar: 71, id: "rush" }, { bar: 78, id: "outro" },
  ],
};
const COURSES = [ROUND1, ROUND2, ROUND3];
const COURSE = ROUND1;

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
const LAVA_H = 0.375;       // 빨간 바닥의 두께(칸)
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
// 장애물이 가운데에서 dx만큼 떨어진 곳에서 차지하는 높이 범위 [아래, 위]
function hazardSpan(q, dx) {
  const a = Math.min(1, Math.abs(dx) / q.w), slope = TOOTH_H / TOOTH_W * q.w;      // 뾰족한 쪽 비탈: 이빨과 같은 기울기
  if (q.kind === "floor") return [0, q.tip * (1 - a)];
  if (q.kind === "ceil") return [q.tip + (q.far - q.tip) * a, q.far];
  return q.far > q.tip ? [q.tip + slope * a, q.far - (q.far - q.tip - slope) * a] : [q.far + (q.tip - slope - q.far) * a, q.tip - slope * a];
}

function emptyLevel(course) {
  const cols = course.bars.length * 16;
  const grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(cols).fill(r === ROWS - 1 ? "#" : "."));
  const cps = [], rides = [], reds = [], gems = [], freeBars = new Set(), wideBars = new Set(), tallBars = new Set(), squeezes = [];
  const stairLo = new Map(), stairHi = new Map();       // 파란 발판: 반 박 지점 번호(x / 2) → 바닥 쪽·천장 쪽 높이 단계
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
        if (!sq || sq.x1 !== x0) { sq = { x0, x1: x0, pts: [] }; squeezes.push(sq); }
        let t = 0;
        for (const iv of p.squeeze) {
          const prev = sq.pts[sq.pts.length - 1];
          sq.pts.push({ step: Math.round((4 * b + t) * SUB), x: x0 + TPB * t, g: 2 * ZIG_STEP * Math.min(1, iv), top: prev ? !prev.top : false });
          t += iv;
        }
        if (Math.abs(t - 4) > 1e-9) throw new Error("squeeze는 한 마디에 4박어치여야 한다: " + name);
        sq.x1 = x0 + 16;
      } else if (squeezes.length && squeezes[squeezes.length - 1].x1 === x0) throw new Error("조여드는 통로 뒤에는 피버가 끝나야 한다: " + name);
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
          const nat = zl <= lo ? 1 : zl >= hi ? -1 : zin, dir = c === "F" ? -nat : nat;
          if (k) gems.push({ x: xk, h: zl * ZIG_STEP + HALF, flip: c === "F" ? dir : 0 });      // flip = 여기서 눌러야 한다(+1 위로, -1 아래로 바뀜)
          gems.push({ x: xk + 1, h: (zl + dir / 2) * ZIG_STEP + HALF });
          if (c === "F" || c === "S") reds.push(hazard(xk + 2, zl + dir, zl - dir, top, p.gap));       // 다음 지점의 틀린 쪽을 막는다
          zl += dir; zin = dir;
        }
        const next = PATTERNS[course.bars[b + 1]];
        if (p.nodes[7] !== "." || zl !== (next && next.mode === "rush" ? next.start ?? (next.wide ? WIDE_TOP : 0) : 0)) throw new Error("피버 마디는 바닥에서(넓은 통로로 이어지면 천장에서) 끝나야 한다: " + name);
        gems.push({ x: x0 + 16, h: zl * ZIG_STEP + HALF });
      }
    }
    if (p && p.tall) tallBars.add(b);
    if (p && p.boxes) for (const [a, z, hh] of p.boxes) for (let c = x0 + a; c <= x0 + z; c++) for (let r = ROWS - 1 - hh; r < ROWS - 1; r++) grid[r][c] = "#";
    if (p && p.rings) for (const [c, hh] of p.rings) grid[ROWS - 2 - hh][x0 + c] = "O";
    if (name === "cp") cps.push({ col: b * 16 + 6, beat: (b * 16 + 6) / TPB, bar: b });
    else if (name === "goal") goalX = b * 16 + 8;
    else if (name !== "flat" && !PATTERNS[name]) throw new Error("없는 패턴: " + name);
  });
  for (const sq of squeezes) { const e = sq.pts[sq.pts.length - 1]; sq.pts.push({ step: Math.round(sq.x1 / TPB * SUB), x: sq.x1, g: e.g, top: !e.top }); }   // 끝에서 한 번 더 닿는다
  return { grid, cols, cps, rides, reds, gems, freeBars, wideBars, tallBars, squeezes, stairLo, stairHi, track: course.track || null, saws: [], sawCols: new Map(), switches: [], goalX, bpm: course.bpm, bars: course.bars.length, sections: course.sections, name: course.name };
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
  course.bars.forEach((name, b) => { const p = PATTERNS[name]; if (p && p.mode !== "rush" && (p.holds.length || p.presses.length || (p.traps && !p.sneaky)) && snaps[b]) patternBars.push([b, p]); });   // 피버 구간의 장애물은 패턴에서 바로 나온다

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
      const fh2 = Math.min(HAZ_MAX_H + bh, Math.floor((k.lo - mF) * 4) / 4);
      if (!k.ground && fh2 >= bh + 0.5) L.floorH[c] = fh2;
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
    // 함정: 버릇대로 한 번 더 누른 달리기. 이것을 막는 덩어리(누르면 안 되는 자리 위에 매달린 것)를 남긴다
    // (full = 앞 마디의 입력을 통째로 다시 누른 달리기)
    if (!p.sneaky) for (const t of p.traps || []) wrong.push(t.full || { presses: [...p.presses, ...(t.presses || [])], holds: t.holds || p.holds });
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
    const dirAt = (lev, zin, tog, k) => (lev <= botAt(k) ? 1 : lev >= topAt(k) ? -1 : tog ? -zin : zin);
    while (local >= s.zk * SLOT + SLOT / 2) {              // 지난 지점의 선택을 굳히고, 다음 지점으로 넘어간다
      const d = dirAt(s.zlk, s.zin, s.ztog, s.zk);
      s.zlk += d; s.zin = d; s.zk++; s.ztog = 0;
    }
    const tk = s.zk * SLOT, top = topAt(s.zk), bot = botAt(s.zk);
    if (press) {
      if (!L.freeBars.has(Math.floor(s.x / 16)) && s.zlk > bot && s.zlk < top) { s.ztog ^= 1; if (ev) ev.push({ type: "flip" }); }
      else if (ev) ev.push({ type: "spark" });               // 연출 마디, 또는 바닥·천장에 닿는 지점: 길은 그대로(불꽃만 튄다)
    }
    const toNode = local <= tk && !s.ztog;                   // 지점을 향해 가는 중인가, 지점 다음 높이를 향해 가는 중인가
    const wpStep = toNode ? tk : tk + SLOT, wpH = (toNode ? s.zlk : s.zlk + dirAt(s.zlk, s.zin, s.ztog, s.zk)) * ZIG_STEP;
    const prev = s.zh;
    s.zh = local === 0 ? s.zlk * ZIG_STEP : wpStep - local <= 0 ? wpH : prev + (wpH - prev) / (wpStep - local + 1);
    s.zv = Math.abs(s.zh - prev) * SUB;
    if (s.zh !== prev) s.zdir = s.zh > prev ? 1 : -1;
    if (local === tk && local > 0 && (s.zlk <= bot || s.zlk >= top) && ev) ev.push({ type: "rebound", top: s.zlk > bot, step: s.zlk > bot ? L.stairHi.has(n0 + s.zk) : bot > 0 });   // step = 파란 발판에 닿았다
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
    zh: 0, zdir: 1, zv: 0, zk: 0, zlk: 0, zin: -1, ztog: 0,
    djAvail: false, jbuf: 0, ring: -1,
    freeze: 0, frozen: false,
    cp, dead: false, cause: "", won: false,
  };
}

// 땅에서 뛰어오른다. kind: "bounce"(박자에 맞춰 저절로) | "jump"(눌러서) | "pad"(점프대)
function launch(s, kind, ev, late = 0) {
  // 저절로 튈 때 박자보다 조금 늦었으면 그만큼 낮게 튀어 다음 박자에 맞춰 착지한다(계단을 내려갈 때 박자가 밀리지 않게)
  s.vy = kind === "pad" ? -V_PAD : kind === "jump" ? -V0 : -G * (1 - late / SUB) / 2;
  s.onGround = false; s.djAvail = true; s.jbuf = 0; s.freeze = FREEZE_STEPS;
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
    if (ride) { s.zh = 0; s.zdir = 1; s.zv = 0; s.zk = 0; s.zlk = 0; s.zin = -1; s.ztog = 0; }
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
  const key = (s) => `${s.step}|${Math.round(s.y * 16)}|${Math.round(s.vy * 2)}|${s.onGround ? 1 : 0}${s.djAvail ? 1 : 0}|${Math.ceil(s.freeze / 8)}|${s.zk}|${s.zlk}${s.zin}${s.ztog}`;
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

if (typeof module !== "undefined") module.exports = { TPB, SUB, ROWS, SIZE, HALF, FREEZE_STEPS, SAW_TRAVEL, JUMP_H, PATTERNS, COURSE, COURSES, coursePlan, hazardAt, inRide, rideAt, RUSH_STRETCH, SLOT, squeezeGap, ceilAt, stairFloor, stairCeil, hazardSpan, WIDE_TOP, KITE_W, TOOTH_H, ZIG_TOP, ZIG_STEP, ZIG_GAP, TOOTH_W, traceRun, drawBar, buildLevel, spawnState, stepState, solve, planInput, groundY, tile, sawY };

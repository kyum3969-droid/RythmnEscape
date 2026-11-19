// ===================== 코어 로직의 Node 입구 =====================
// 코드는 셋으로 나뉘어 있다: engine.js(상수·물리·판정·레벨 만들기) → patterns.js(마디 패턴) → courses.js(라운드별 코스 데이터).
// 브라우저(index.html)는 셋을 이 순서로 <script>로 읽어 한 전역 공간을 같이 쓴다. Node(테스트·도구)는 이 파일을 require하면
// 같은 순서로 같은 전역 공간(vm.runInThisContext)에서 읽고 아래 이름들을 내보낸다 — 그래서 테스트와 도구는 전처럼 require('./logic.js')를 쓴다.
// (파일마다 따로 돌리므로 오류 위치는 그 파일의 줄로 나온다. 같은 realm이라 Map·배열 등도 그대로다)
const fs = require("fs"), path = require("path"), vm = require("vm");
const PARTS = ["engine.js", "patterns.js", "courses.js"];
for (const f of PARTS) { const file = path.join(__dirname, f); vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file }); }
module.exports = vm.runInThisContext("({ redOutlines, RED_SKY, TPB, SUB, ROWS, SIZE, HALF, FREEZE_STEPS, SAW_TRAVEL, JUMP_H, PATTERNS, COURSE, COURSES, coursePlan, hazardAt, inRide, rideAt, RUSH_STRETCH, SLOT, squeezeGap, ceilAt, stairFloor, stairCeil, TALL_H, TALL_W, hazardSpan, WIDE_TOP, KITE_W, TOOTH_H, ZIG_TOP, ZIG_STEP, ZIG_GAP, TOOTH_W, padFace, PAD_TH, PAD_W, moverShape, moverKills, trackAt, traceRun, drawBar, buildLevel, touchDensity, spawnState, stepState, solve, planInput, groundY, tile, sawY })");
module.exports.PARTS = PARTS;

# RythmnEscape 3D 웹 프로토타입 (Three.js)

휴대폰 브라우저에서 바로 해보며 조작감·카메라·난이도·스테이지를 다듬는 용도입니다. 확정된 것은 `../godot/`으로 옮깁니다.

- 파일 하나(`index.html`), 빌드 없음. Three.js r128(cdnjs)만 불러옵니다.
- Godot 버전과 **같은 규칙·판정·치수**: 로직(`<script id="logic">`)은 Godot `scripts/core`, `scripts/rhythm`과 1:1로 대응하고, 병아리·적·보드 메시와 툰 셰이더/외곽선도 같은 수치를 씁니다.

## 조작 (메뉴에서 선택)
- **스와이프**(기본): 화면 아무 데서나 가고 싶은 방향으로 밀기, 톡 치면 대기. 판정 시각은 **손가락이 닿은 순간**, 방향은 18px 움직인 순간 확정(손 뗄 때까지 안 기다림). 방향이 정해지기 전에는 그 박자를 최대 0.3초 붙잡아 '대기'로 넘어가지 않게 함.
- **십자 패드**: 아래쪽 고정 버튼(▲◀▶▼ + 가운데 대기). 누르는 순간 판정. 모서리에 메뉴/다시/되돌리기.
- **칸 탭**: 가고 싶은 옆 칸을 탭(이전 방식).
- PC: 방향키/WASD, Space 대기.

## 카메라
- **따라가기**(플레이 중): 병아리 근처에서 화면 가로에 약 6칸(`VIEW_TILES`)이 보이게 고정 → 어느 스테이지든 칸 크기가 같습니다. 맵 끝에서는 바깥이 보이지 않게 멈춥니다.
- **전체 맵**: 시작 전 준비 화면, 또는 오른쪽 위 미니맵을 탭했을 때. 다시 탭하면 따라가기로 돌아갑니다.
- **미니맵**: 벽·출구·구멍·적·적의 예고 칸·병아리와 지금 화면에 보이는 영역을 표시합니다.

## 테스트
```bash
node web3d/tests/logic.test.js web3d/index.html     # 최소 턴(8/10/10/13/18/15), 판정·점수 — Godot 테스트와 같은 기대값
curl -o web3d/tests/three.min.js https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js
node web3d/tests/e2e.js                              # 헤드리스 Chromium(WebGL): 실제 탭, 예약, 클리어/실패, 화면 크기별 보드 배치
```

## Godot으로 옮길 때 대응표
| 웹 (index.html) | Godot |
|---|---|
| `initState`, `step`, `solve` | `GameLogic` |
| `createJudge()` | `RhythmJudge` |
| `squircle`, `cone` | `Shapes` |
| `TOON_*`, `OUTLINE_*`, `MARKER_FS` | `shaders/*.gdshader` |
| `Chick`, `Enemy`, `Actor` | `ChickView`, `EnemyView`, `ActorView` |
| `board` | `BoardView` |
| 오디오(Web Audio 스케줄) | `MusicSynth` + `Conductor` |

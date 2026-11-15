# RythmnEscape 3D 웹 프로토타입 (Three.js)

휴대폰 브라우저에서 바로 해보며 조작감·카메라·난이도·스테이지를 다듬는 용도입니다. 확정된 것은 `../godot/`으로 옮깁니다.

- 파일 하나(`index.html`), 빌드 없음. Three.js r128(cdnjs)만 불러옵니다.
- Godot 버전과 **같은 규칙·판정·치수**: 로직(`<script id="logic">`)은 Godot `scripts/core`, `scripts/rhythm`과 1:1로 대응하고, 병아리·적·보드 메시와 툰 셰이더/외곽선도 같은 수치를 씁니다.

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

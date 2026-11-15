# RythmnEscape (Godot 4 / 3D)

리듬 턴제 탈출 게임의 3D 버전. 웹 프로토타입(`../index.html`)의 규칙·스테이지·조작을 그대로 옮겼습니다.

- 엔진: **Godot 4.4** (GL Compatibility 렌더러 — 중저가 안드로이드까지 고려)
- 화면: 세로(720×1280), 고정 원근 카메라, 4단계 툰 셰이딩 + 잉크 외곽선(뒤집힌 껍질)
- 모델/음악: **외부 파일 없음.** 병아리·적·보드는 코드로 만든 메시, 음악은 코드로 합성 (글꼴 Jua만 포함, OFL)

## 실행
Godot 4.4 에디터에서 `godot/project.godot`를 열고 ▶ 실행.
데스크톱에서는 마우스 클릭이 터치로 동작하고, 방향키/WASD = 점프, Space = 대기, R = 다시하기, Z = 되돌리기(퍼즐 모드), Esc = 일시정지.

## 구조
```
scripts/core/    GameState · GameLogic(턴 규칙, BFS solver) · Levels · SaveData   ← 렌더링과 무관한 순수 로직
scripts/rhythm/  RhythmJudge  (PERFECT/GOOD/예약/대기 판정 — 시간을 인자로 받는 순수 로직)
scripts/audio/   MusicSynth(곡 합성) · Conductor(재생 위치 + 출력 지연 보정한 곡 시간)
scripts/view/    Shapes(둥근 상자/원뿔 메시) · Mats · ChickView · EnemyView · BoardView · BeatBar · GameUI
scripts/main.gd  로직·리듬·오디오를 3D 화면에 연결하는 컨트롤러
shaders/         toon · outline · marker · blob
```

## 조작/리듬 규칙
- 보드에서 **가고 싶은 옆 칸을 탭**, 병아리를 탭하면 대기. 병아리 기준 방향으로 인식하므로 정확히 못 눌러도 됩니다.
- 박자 ±70ms = PERFECT, ±160ms = GOOD. 더 일찍 누르면 **예약**되어 다음 박자에 자동 점프. 안 누르면 **벌점 없이 대기**.
- 메뉴의 **소리 지연 보정**(±10ms): 블루투스 등으로 소리가 늦게 들리면 +로 올립니다.

## 테스트
```bash
godot --headless --path godot --import                        # 처음 한 번(클래스 등록)
godot --headless --path godot --script res://tests/test_logic.gd    # 규칙 + BFS solver (웹 프로토타입과 같은 최소 턴)
godot --headless --path godot --script res://tests/test_rhythm.gd   # 판정, 점수/랭크, 음악 합성
godot --headless --path godot --script res://tests/test_game.gd     # 씬 통합: 탭→방향, 예약, 클리어/실패, 퍼즐 모드
godot --headless --path godot --script res://tests/test_clock.gd    # 실제 오디오 시계 단조성/루프
# 화면 캡처(가상 디스플레이): 시나리오 menu|ready|idle|play|mid|win|dead
xvfb-run -a godot --rendering-driver opengl3 --resolution 720x1280 --path godot \
  --script res://tests/screenshot.gd -- mid 4 /tmp/shot.png
```

## 안드로이드 빌드
패키지 이름 `com.kyum3969.rythmnescape`, arm64-v8a, 세로 고정, Min/Target SDK는 Godot 기본값. 설정은 `export_presets.cfg`에 있습니다.

필요한 것 (한 번만):
1. Godot 4.4.1 + 같은 버전의 **내보내기 템플릿** (에디터: Editor → Manage Export Templates, 또는 `Godot_v4.4.1-stable_export_templates.tpz`)
2. JDK 17 이상 (`keytool` 사용)
3. **Android SDK** — 명령줄 도구를 받은 뒤 (라이선스에 동의해야 설치됩니다):
   ```bash
   sdkmanager --licenses            # 직접 읽고 동의
   sdkmanager "platform-tools" "build-tools;35.0.1" "platforms;android-35"
   ```

빌드:
```bash
ANDROID_HOME=/path/to/android-sdk GODOT=/path/to/godot ./godot/tools/build_android.sh debug
adb install -r godot/build/RythmnEscape-debug.apk
```
`debug`는 디버그 키스토어(`~/.android/rythmnescape-debug.keystore`, 없으면 자동 생성)로 서명합니다. 스토어 출시용은 `release` 모드와 별도 릴리스 키스토어가 필요하고, 키스토어는 저장소에 올리지 마세요(`.gitignore`에 `*.keystore`).

검증 상태: 이 저장소의 프리셋은 Godot 내보내기 검사를 통과했습니다(템플릿, 패키지 이름, 키스토어 OK). SDK가 없는 환경이라 **APK를 실제로 만들어 기기에 설치해 보지는 못했습니다.**

## 알려진 한계
- **실제 기기에서 박자감/소리 지연은 아직 못 재봤습니다.** 곡 시간은 `재생 위치 + 믹서 보정 − 출력 지연`으로 계산하지만, 기기별 편차는 위 보정 설정으로 맞추게 했습니다.
- 5·6스테이지는 가로로 긴 맵(11×6)이라 세로 화면에서 칸이 작게 보입니다. 세로형 맵으로 다시 설계하는 게 좋습니다.
- 글꼴(Jua)에 없는 기호(▶ ☰ ♪ 이모지 등)는 쓰지 않습니다. 기기마다 대체 글꼴이 달라 깨질 수 있어서입니다.

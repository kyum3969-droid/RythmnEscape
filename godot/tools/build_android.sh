#!/usr/bin/env bash
# 안드로이드 APK 빌드 (Godot 4.4.1 + 내보내기 템플릿 + Android SDK 필요)
#
# 사용법:
#   ANDROID_HOME=/path/to/android-sdk GODOT=/path/to/godot ./godot/tools/build_android.sh [debug|release]
#
# debug  : 디버그 키스토어로 서명한 APK (기기에 바로 설치해 테스트). 키스토어가 없으면 만든다.
# release: 아래 환경변수의 릴리스 키스토어로 서명. 키스토어는 저장소에 올리지 말 것.
#   GODOT_ANDROID_KEYSTORE_RELEASE_PATH / _USER / _PASSWORD
set -euo pipefail

MODE="${1:-debug}"
GODOT="${GODOT:-godot}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
: "${ANDROID_HOME:?ANDROID_HOME(안드로이드 SDK 경로)를 지정하세요}"

OUT="$PROJECT_DIR/build"
mkdir -p "$OUT"

if [ "$MODE" = "debug" ]; then
  KS="${GODOT_ANDROID_KEYSTORE_DEBUG_PATH:-$HOME/.android/rythmnescape-debug.keystore}"
  if [ ! -f "$KS" ]; then
    mkdir -p "$(dirname "$KS")"
    keytool -genkeypair -v -keystore "$KS" -storepass android -alias androiddebugkey -keypass android \
      -keyalg RSA -keysize 2048 -validity 9999 -dname "CN=Android Debug,O=Android,C=US" >/dev/null
  fi
  export GODOT_ANDROID_KEYSTORE_DEBUG_PATH="$KS"
  export GODOT_ANDROID_KEYSTORE_DEBUG_USER="${GODOT_ANDROID_KEYSTORE_DEBUG_USER:-androiddebugkey}"
  export GODOT_ANDROID_KEYSTORE_DEBUG_PASSWORD="${GODOT_ANDROID_KEYSTORE_DEBUG_PASSWORD:-android}"
  "$GODOT" --headless --path "$PROJECT_DIR" --import
  "$GODOT" --headless --path "$PROJECT_DIR" --export-debug "Android" "$OUT/RythmnEscape-debug.apk"
  echo "만들어짐: $OUT/RythmnEscape-debug.apk"
  echo "설치: adb install -r \"$OUT/RythmnEscape-debug.apk\""
else
  : "${GODOT_ANDROID_KEYSTORE_RELEASE_PATH:?릴리스 키스토어 경로를 지정하세요}"
  : "${GODOT_ANDROID_KEYSTORE_RELEASE_USER:?}"
  : "${GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD:?}"
  "$GODOT" --headless --path "$PROJECT_DIR" --import
  "$GODOT" --headless --path "$PROJECT_DIR" --export-release "Android" "$OUT/RythmnEscape.apk"
  echo "만들어짐: $OUT/RythmnEscape.apk"
fi

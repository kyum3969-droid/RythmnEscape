class_name RhythmJudge
extends RefCounted
## 박자 판정(순수 로직 — 시간은 호출자가 넘겨준다).
##  - 박자 ±GOOD 안에 입력 → 즉시 실행 + PERFECT/GOOD
##  - 그보다 일찍 입력 → 예약: 다음 박자에 자동 실행
##  - 입력 없이 박자가 지나감 → 벌점 없이 제자리 대기

const COUNT_IN := 3          ## 3·2·1 다음 박자부터 입력
const PERFECT := 0.07        ## 초
const GOOD := 0.16
const SCORE := {"perfect": 100, "good": 60, "queued": 30}

var spb := 0.6               ## 한 박자 길이(초)
var t0 := 0.0                ## 박자 0의 곡 시간
var next_beat := 0
var pending := ""            ## 예약된 행동("" = 없음)

var combo := 0
var max_combo := 0
var score := 0
var actions := 0
var counts := {"perfect": 0, "good": 0, "queued": 0}


func reset_stats() -> void:
	combo = 0
	max_combo = 0
	score = 0
	actions = 0
	counts = {"perfect": 0, "good": 0, "queued": 0}
	pending = ""
	next_beat = 0


## 새 박자 타임라인 시작(처음 시작하거나 일시정지에서 재개할 때). 점수는 유지.
func reset_clock(new_spb: float, new_t0: float) -> void:
	spb = new_spb
	t0 = new_t0
	next_beat = 0
	pending = ""


func beat_time(k: int) -> float:
	return t0 + k * spb


## 박자 순간 1 → 다음 박자까지 0으로 줄어드는 값(연출용)
func beat_pulse(now: float) -> float:
	var p := (now - t0) / spb
	if p < 0.0:
		return 0.0
	return pow(1.0 - (p - floor(p)), 4.0)


## 예약된 칸이 표시될 박자 번호
func reserved_beat() -> int:
	return maxi(next_beat, COUNT_IN)


func _hit(kind: String) -> void:
	counts[kind] += 1
	actions += 1
	score += SCORE[kind]
	if kind == "queued":
		combo = 0
		return
	combo += 1
	max_combo = maxi(max_combo, combo)
	if combo >= 2:
		score += mini(combo, 10) * 5   # 콤보 보너스


## 시간이 흐르며 지나간 박자를 처리한다. 반환: [{action, kind}] (kind: wait|queued)
func advance(now: float) -> Array:
	var events: Array = []
	while true:
		var k := next_beat
		if k < COUNT_IN:
			if now >= beat_time(k):
				next_beat += 1
				continue
			break
		if pending != "" and now >= beat_time(k):
			var a := pending
			pending = ""
			next_beat += 1
			_hit("queued")
			events.append({"action": a, "kind": "queued"})
			continue
		if now > beat_time(k) + GOOD:
			next_beat += 1
			events.append({"action": "wait", "kind": "wait"})   # 입력 없음 → 벌점 없이 대기
			continue
		break
	return events


## 입력 처리. 반환: 실행해야 할 [{action, kind}] (kind: perfect|good|queued|wait)
func input(action: String, now: float) -> Array:
	var events := advance(now)
	var k := reserved_beat()
	var dt := now - beat_time(k)
	if next_beat >= COUNT_IN and absf(dt) <= GOOD:
		pending = ""
		next_beat += 1
		var kind := "perfect" if absf(dt) <= PERFECT else "good"
		_hit(kind)
		events.append({"action": action, "kind": kind})
	else:
		pending = action   # 다음 박자에 자동 실행 (다시 누르면 바뀜)
	return events


## 박자 정확도로 랭크: PERFECT 1.0 · GOOD 0.6 · 예약 0.3
func rank() -> String:
	var acc: float = (counts["perfect"] + counts["good"] * 0.6 + counts["queued"] * 0.3) / float(maxi(actions, 1))
	if acc >= 0.9:
		return "S"
	if acc >= 0.7:
		return "A"
	if acc >= 0.45:
		return "B"
	return "C"

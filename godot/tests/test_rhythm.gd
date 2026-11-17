extends SceneTree
## godot --headless --path godot --script res://tests/test_rhythm.gd

var fails := 0

func check(cond: bool, msg: String) -> void:
	if cond:
		print("  ok  ", msg)
	else:
		fails += 1
		print("  FAIL ", msg)


func fresh() -> RhythmJudge:
	var j := RhythmJudge.new()
	j.reset_clock(0.5, 0.3)   # 박자 k = 0.3 + 0.5k, 입력 가능 첫 박자(3) = 1.8초
	return j


func _init() -> void:
	print("== 판정 ==")
	var j := fresh()
	var ev := j.input("right", 1.8)
	check(ev.size() == 1 and ev[0]["kind"] == "perfect", "정각 입력 = PERFECT")
	j = fresh()
	ev = j.input("right", 1.8 + 0.12)
	check(ev.size() == 1 and ev[0]["kind"] == "good", "+120ms = GOOD")
	j = fresh()
	ev = j.input("right", 1.8 - 0.12)
	check(ev.size() == 1 and ev[0]["kind"] == "good", "-120ms = GOOD (일찍도 허용)")

	print("== 예약 ==")
	j = fresh()
	ev = j.input("down", 1.4)      # 박자보다 0.4초 일찍
	check(ev.is_empty() and j.pending == "down", "너무 일찍 누르면 예약만 됨")
	ev = j.advance(1.7)
	check(ev.is_empty(), "박자 전에는 실행 안 됨")
	ev = j.advance(1.81)
	check(ev.size() == 1 and ev[0]["kind"] == "queued" and ev[0]["action"] == "down", "다음 박자에 자동 실행")
	check(j.combo == 0 and j.counts["queued"] == 1, "예약은 콤보를 끊는다")
	j = fresh()
	j.input("down", 1.4)
	j.input("left", 1.5)
	ev = j.advance(1.85)
	check(ev.size() == 1 and ev[0]["action"] == "left", "다시 누르면 예약이 바뀐다")

	print("== 안 누르면 벌점 없는 대기 ==")
	j = fresh()
	ev = j.advance(1.8 + 0.17)
	check(ev.size() == 1 and ev[0]["kind"] == "wait" and j.actions == 0 and j.combo == 0, "GOOD 범위를 지나면 대기(점수/콤보 변화 없음)")
	ev = j.advance(1.8 + 0.5 + 0.17)
	check(ev.size() == 1 and ev[0]["kind"] == "wait", "다음 박자도 대기")

	print("== 카운트인 ==")
	j = fresh()
	ev = j.input("up", 0.9)        # 카운트인 중(박자 1)
	check(ev.is_empty() and j.pending == "up", "카운트인 중 입력은 예약")
	ev = j.advance(1.81)
	check(ev.size() == 1 and ev[0]["kind"] == "queued", "카운트인이 끝나면 첫 박자에 실행")

	print("== 콤보/점수/랭크 ==")
	j = fresh()
	for i in 6:
		j.input("right", 1.8 + 0.5 * i)
	check(j.combo == 6 and j.max_combo == 6 and j.counts["perfect"] == 6, "정확히 6번 = 콤보 6")
	check(j.score == 600 + (2 + 3 + 4 + 5 + 6) * 5, "점수 = 판정 + 콤보 보너스")
	check(j.rank() == "S", "전부 PERFECT면 S")
	j = fresh()
	for i in 4:
		j.input("right", 1.4 + 0.5 * i)   # 전부 예약
		j.advance(1.81 + 0.5 * i)
	check(j.rank() == "C", "전부 예약이면 C")
	check(absf(j.beat_pulse(0.3 + 0.5 * 10) - 1.0) < 0.001 and j.beat_pulse(0.3 + 0.5 * 10.5) < 0.1, "박자 펄스는 박자 순간 1, 중간쯤 0 근처")

	print("== 음악 합성 ==")
	var t0 := Time.get_ticks_msec()
	var stream := MusicSynth.build(96.0)
	var spb := 60.0 / 96.0
	var expect := int((MusicSynth.LEAD + 19 * spb) * MusicSynth.RATE)
	check(stream.data.size() == expect * 2, "96BPM 곡 길이 = LEAD + 19박 (%d ms)" % (Time.get_ticks_msec() - t0))
	check(stream.loop_end == expect and stream.loop_begin == int((MusicSynth.LEAD + 3 * spb) * MusicSynth.RATE), "루프 구간 = 카운트인 이후 16박")
	var peak := 0
	for i in range(0, stream.data.size(), 2):
		peak = maxi(peak, absi(stream.data.decode_s16(i)))
	check(peak > 4000 and peak < 32768, "소리가 비어 있지도 깨지지도 않는다 (peak %d)" % peak)
	var kick_zone := 0
	var first_kick := int((MusicSynth.LEAD + 3 * spb) * MusicSynth.RATE)
	for i in range(first_kick, first_kick + 800):
		kick_zone = maxi(kick_zone, absi(stream.data.decode_s16(i * 2)))
	check(kick_zone > 8000, "첫 박자 정각에 킥이 시작된다")
	for k in ["perfect", "good", "won", "dead"]:
		check(MusicSynth.sting(k).data.size() > 1000, "효과음 %s" % k)

	print("실패 %d건" % fails)
	quit(1 if fails > 0 else 0)

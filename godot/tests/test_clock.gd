extends SceneTree
## 실제 오디오 시계 확인: 곡 시간이 실제 시간과 같은 속도로 흐르고 루프를 넘어도 이어지는지.
## godot --headless --path godot --script res://tests/test_clock.gd

var fails := 0

func check(cond: bool, msg: String) -> void:
	if cond:
		print("  ok  ", msg)
	else:
		fails += 1
		print("  FAIL ", msg)


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var c := Conductor.new()
	root.add_child(c)
	await process_frame
	c.start(240.0)               # 빠른 곡: 한 루프 = 16박 * 0.25초 = 4초 → 루프 경계를 빨리 넘는다
	var real0 := Time.get_ticks_msec()
	var t_prev := -1.0
	var mono := true
	var samples: Array = []
	for i in 140:                # 약 7초
		await create_timer(0.05).timeout
		var t := c.song_time()
		if t < t_prev:
			mono = false
		t_prev = t
		if i % 20 == 19:
			samples.append([float(Time.get_ticks_msec() - real0) / 1000.0, t])
	for s in samples:
		print("   real %.2fs  song %.2fs  diff %+.3f" % [s[0], s[1], s[1] - s[0]])
	check(mono, "곡 시간은 거꾸로 가지 않는다 (루프 포함)")
	var last: Array = samples[samples.size() - 1]
	check(last[1] > 5.0, "루프(4초+0.3초 LEAD+카운트인)를 넘어도 계속 흐른다 (%.2f초)" % last[1])
	check(absf((last[1] - last[0]) - (samples[0][1] - samples[0][0])) < 0.12, "실제 시간과 같은 속도 (드리프트 120ms 미만)")
	c.stop()
	print("실패 %d건" % fails)
	quit(1 if fails > 0 else 0)

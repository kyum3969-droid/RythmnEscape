extends SceneTree
## 씬 전체 통합 테스트 (가짜 시계로 박자를 정확히 제어).
## godot --headless --path godot --script res://tests/test_game.gd

var fails := 0
var main: Main

func check(cond: bool, msg: String) -> void:
	if cond:
		print("  ok  ", msg)
	else:
		fails += 1
		print("  FAIL ", msg)


func tick(t: float) -> void:
	main.conductor.fake_time = t
	main._process(0.016)


func fresh(stage: int) -> void:
	main.ui.hide_select()
	main.load_stage(stage)
	main.start_run()


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	main = load("res://scenes/main.tscn").instantiate()
	main.conductor.use_fake_clock = true
	root.add_child(main)
	await process_frame
	var j := main.judge
	var names := {"u": "up", "d": "down", "l": "left", "r": "right", "w": "wait"}

	print("== 시작 흐름 ==")
	check(main.phase == "menu" or main.ui.overlay_visible(), "시작하면 스테이지 선택 화면")
	main.ui.hide_select()
	main.load_stage(0)
	check(main.phase == "ready", "스테이지를 고르면 준비 화면")
	main.start_run()
	check(main.phase == "playing", "시작하면 플레이 중")

	print("== 화면 탭 → 방향 ==")
	# 스테이지 1: 플레이어 (1,1). 오른쪽 칸(2,1)을 정확히 탭
	tick(j.beat_time(3))
	var target := main.cam.unproject_position(main.board.world_pos(Vector2i(2, 1)))
	main._tap(target)
	check(main.state.player == Vector2i(2, 1) and j.counts["perfect"] == 1, "옆 칸 탭 = 그쪽으로 점프 (PERFECT)")
	# 대각선 쪽을 탭하면 지배적인 축으로
	tick(j.beat_time(4))
	var diag := main.cam.unproject_position(main.board.world_pos(Vector2i(3, 1)) + Vector3(0.2, 0, 0.45))
	main._tap(diag)
	check(main.state.player == Vector2i(3, 1), "대각선 근처 탭도 가까운 방향으로 (오른쪽)")
	# 병아리를 탭하면 대기
	tick(j.beat_time(5))
	var self_pos := main.cam.unproject_position(main.board.world_pos(main.state.player))
	main._tap(self_pos)
	check(main.state.player == Vector2i(3, 1) and main.state.turn == 3, "병아리 탭 = 제자리 대기(턴은 지남)")

	print("== 예약 입력 ==")
	fresh(0)
	tick(j.beat_time(3) - 0.35)
	main.act("right")
	check(main.state.player == Vector2i(1, 1) and j.pending == "right", "박자 전에 누르면 예약만 됨")
	tick(j.beat_time(3) + 0.01)
	check(main.state.player == Vector2i(2, 1) and j.counts["queued"] == 1, "박자가 오면 자동으로 점프")

	print("== 안 누르면 벌점 없는 대기 ==")
	fresh(0)
	tick(j.beat_time(3) + 0.17)
	tick(j.beat_time(4) + 0.17)
	check(main.state.turn == 2 and main.state.player == Vector2i(1, 1) and j.actions == 0, "입력 없이 2박자 = 2턴 대기, 점수/콤보 그대로")

	print("== 벽에 부딪혀도 박자는 지나감 ==")
	fresh(0)
	tick(j.beat_time(3))
	main.act("left")      # (0,1)은 벽
	check(main.state.turn == 1 and main.state.player == Vector2i(1, 1), "벽 방향 입력 = 제자리 + 1턴")

	print("== 스테이지 4 클리어 ==")
	fresh(3)
	var seq := "dddddwdrrrrrr"
	for i in seq.length():
		tick(j.beat_time(3 + i))
		main.act(names[seq[i]])
	check(main.state.status == "won", "알려진 풀이대로 박자에 맞춰 클리어")
	check(j.counts["perfect"] == seq.length() and j.rank() == "S", "전부 PERFECT → 랭크 S")
	await create_timer(1.6).timeout
	check(main.ui.overlay_visible() and main.phase == "won", "클리어 결과 화면이 뜬다")
	check(main.save.cleared.has(3), "클리어 기록이 저장된다")

	print("== 실패 ==")
	fresh(5)
	var bad := "rrrrddllll"
	for i in bad.length():
		if main.state.status != "playing":
			break
		tick(j.beat_time(3 + i))
		main.act(names[bad[i]])
	check(main.state.status == "dead", "스테이지 6: 무작정 가면 잡힌다")
	await create_timer(1.6).timeout
	check(main.ui.overlay_visible() and main.phase == "dead", "실패 결과 화면이 뜬다")
	main.restart()
	check(main.phase == "playing" and main.state.turn == 0, "다시하기는 바로 새 판을 시작")

	print("== 퍼즐 모드 ==")
	main.rhythm_mode = false
	main.load_stage(0)
	check(main.phase == "playing", "퍼즐 모드는 바로 시작")
	main.act("right")
	main.act("right")
	check(main.state.turn == 2 and main.state.player == Vector2i(3, 1), "입력 즉시 한 칸씩 이동")
	main.act("up")           # 벽
	check(main.state.turn == 2, "벽 방향은 턴을 쓰지 않는다")
	main.undo()
	check(main.state.turn == 1 and main.state.player == Vector2i(2, 1), "되돌리기")

	print("실패 %d건" % fails)
	quit(1 if fails > 0 else 0)

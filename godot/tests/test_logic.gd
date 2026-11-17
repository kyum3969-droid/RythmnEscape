extends SceneTree
## 실행: godot --headless --path godot --script res://tests/test_logic.gd
## 웹 프로토타입(JS)에서 검증한 값과 같은 결과가 나오는지 확인한다.

var fails := 0

func check(cond: bool, msg: String) -> void:
	if cond:
		print("  ok  ", msg)
	else:
		fails += 1
		print("  FAIL ", msg)


func play(level_idx: int, seq: String) -> GameState:
	var m := {"u": "up", "d": "down", "l": "left", "r": "right", "w": "wait"}
	var s := GameLogic.init_state(Levels.DATA[level_idx])
	for c in seq:
		var n := GameLogic.step(s, m[c])
		if n == null:
			return null
		s = n
		if s.status != "playing":
			break
	return s


func _init() -> void:
	# JS 프로토타입 solver가 찾은 최단 풀이(턴 수, 경로)
	var expected := [
		[0, "rrrrddll"], [1, "ddddrrrrrr"], [2, "ddddrrddll"],
		[3, "dddddwdrrrrrr"], [4, "drdrrruurrrrdddllu"], [5, "rwrrrddrruurrdd"],
	]
	print("== 알려진 풀이 재생 ==")
	for e in expected:
		var s := play(e[0], e[1])
		check(s != null and s.status == "won" and s.turn == (e[1] as String).length(),
			"스테이지 %d: %d턴 클리어" % [e[0] + 1, (e[1] as String).length()])

	print("== 규칙 ==")
	var s := play(5, "rrrrddllll")
	check(s != null and s.status == "dead", "스테이지 6: 무작정 가면 잡힌다")
	s = play(3, "rrrrrrdddddd")
	check(s != null and s.status != "won", "스테이지 4: 벽 따라 직진하면 추적자에게 잡힌다")
	var st := GameLogic.init_state(Levels.DATA[0])
	check(GameLogic.step(st, "left") == null, "벽으로는 점프할 수 없다")
	var st2 := GameLogic.step(st, "right")
	check(st.turn == 0 and st2.turn == 1, "step은 원본 상태를 바꾸지 않는다")
	# 무너지는 발판
	var cs := GameLogic.init_state(Levels.DATA[4])
	var crumble_pos := Vector2i(4, 3)
	check(cs.tile_at(crumble_pos.x, crumble_pos.y) == GameState.Tile.CRUMBLE, "발판 위치 파싱")
	var after := play(4, "drdrrr")  # 발판 위를 밟고 지나가면 구멍이 된다
	check(after != null and after.tile_at(crumble_pos.x, crumble_pos.y) == GameState.Tile.PIT,
		"발판은 밟고 떠나면 구멍이 된다")

	print("== BFS solver (JS와 같은 최소 턴) ==")
	var want := [8, 10, 10, 13, 18, 15]
	for i in want.size():
		var t0 := Time.get_ticks_msec()
		var sol := GameLogic.solve(Levels.DATA[i])
		check(sol.size() == want[i], "스테이지 %d 최소 %d턴 (%d ms)" % [i + 1, want[i], Time.get_ticks_msec() - t0])

	print("실패 %d건" % fails)
	quit(1 if fails > 0 else 0)

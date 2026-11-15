class_name Main
extends Node3D
## 게임 진행을 맡는 컨트롤러: 로직(GameLogic) + 리듬(RhythmJudge) + 오디오(Conductor)를 3D 화면에 연결한다.
## phase: menu | ready | playing | paused | won | dead

const CAM_FOV := 30.0
const CAM_PITCH := 52.0

var conductor := Conductor.new()
var judge := RhythmJudge.new()
var ui := GameUI.new()
var board := BoardView.new()
var chick := ChickView.new()
var cam := Camera3D.new()
var save := SaveData.load_save()

var state: GameState
var history: Array[GameState] = []
var level_idx := 0
var rhythm_mode := true
var phase := "menu"
var enemy_views := {}            # id -> EnemyView
var _clock_started := false


func _ready() -> void:
	rhythm_mode = save.rhythm_mode
	conductor.offset_s = save.offset_ms / 1000.0
	_setup_world()
	add_child(conductor)
	add_child(ui)
	ui.beat_bar.judge = judge
	ui.beat_bar.conductor = conductor
	ui.start_pressed.connect(start_run)
	ui.pause_pressed.connect(pause)
	ui.restart_pressed.connect(restart)
	ui.undo_pressed.connect(undo)
	ui.menu_pressed.connect(open_menu)
	ui.stage_chosen.connect(func(i: int) -> void: load_stage(i))
	ui.mode_toggled.connect(_toggle_mode)
	ui.offset_changed.connect(_change_offset)
	get_viewport().size_changed.connect(_frame_camera)
	load_stage(0)
	open_menu()


func _setup_world() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#0d0f1e")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_DISABLED
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55.0, -28.0, 0.0)
	sun.shadow_enabled = false
	sun.light_energy = 1.3
	add_child(sun)
	cam.keep_aspect = Camera3D.KEEP_WIDTH
	cam.fov = CAM_FOV
	cam.current = true
	add_child(cam)
	add_child(board)
	add_child(chick)


# ---------------------------------------------------------------- 스테이지 / 진행

func load_stage(i: int) -> void:
	level_idx = i
	var level: Dictionary = Levels.DATA[i]
	state = GameLogic.init_state(level)
	history.clear()
	conductor.stop()
	judge.reset_stats()
	judge.reset_clock(60.0 / float(level["bpm"]), MusicSynth.LEAD)
	_clock_started = false
	ui.beat_bar.active = false
	_rebuild_views()
	ui.hide_overlay()
	ui.show_count("", 1.0, 0.0)
	ui.set_stage_info(level["name"], level["bpm"], level["hint"], rhythm_mode)
	_refresh_hud()
	if rhythm_mode:
		phase = "ready"
		ui.show_overlay("준비됐나요?",
			"가고 싶은 옆 칸을 탭!\n박자 전에 미리 눌러두면 다음 박자에 자동으로 점프해요.\n안 누르면 제자리에서 기다려요.",
			[["시작", start_run, true]], Mats.YELLOW)
	else:
		phase = "playing"


func _rebuild_views() -> void:
	board.build(state)
	for v in enemy_views.values():
		v.queue_free()
	enemy_views.clear()
	for e in state.enemies:
		var ev := EnemyView.new(e["type"])
		add_child(ev)
		ev.position = board.world_pos(e["pos"])
		ev.face_now(_enemy_look(e))
		enemy_views[e["id"]] = ev
	chick.position = board.world_pos(state.player)
	chick.face_now(Vector2i(0, 1))
	chick.body_root.rotation.z = 0.0
	chick.body_root.position = Vector3.ZERO
	board.show_intents(state)
	_frame_camera()


func _enemy_look(e: Dictionary) -> Vector2i:
	if e["has_intent"]:
		return (e["intent"] as Vector2i) - (e["pos"] as Vector2i)
	return e["dir"]


## 가로 폭이 꽉 차도록 카메라 거리를 계산하고, 보드를 화면 위쪽 영역에 둔다.
func _frame_camera() -> void:
	if board.width == 0:
		return
	var half_w := board.width * 0.5 + 0.55
	var dist := half_w / tan(deg_to_rad(CAM_FOV * 0.5))
	var pitch := deg_to_rad(CAM_PITCH)
	var target := Vector3(0.0, 0.0, 1.0)         # 살짝 앞을 보게 해서 보드를 위로 올림
	cam.position = target + Vector3(0.0, sin(pitch) * dist, cos(pitch) * dist)
	cam.look_at(target, Vector3.UP)


func start_run() -> void:
	if phase != "ready" and phase != "paused":
		return
	phase = "playing"
	ui.hide_overlay()
	var level: Dictionary = Levels.DATA[level_idx]
	judge.reset_clock(60.0 / float(level["bpm"]), MusicSynth.LEAD)
	conductor.start(float(level["bpm"]))
	ui.beat_bar.active = true
	_clock_started = true


func restart() -> void:
	var autostart := rhythm_mode and _clock_started
	load_stage(level_idx)
	if autostart:
		start_run()


func open_menu() -> void:
	conductor.stop()
	if phase == "playing":
		phase = "paused"
	ui.hide_overlay()
	ui.show_select(save.cleared, save.best_rank, level_idx, rhythm_mode, save.offset_ms)


func pause() -> void:
	if phase != "playing" or not rhythm_mode:
		return
	phase = "paused"
	conductor.stop()
	ui.beat_bar.active = false
	ui.show_overlay("일시정지", "다시 시작하면 카운트다운 후 이어서 진행해요.",
		[["계속하기", start_run, true], ["메뉴", open_menu]], Mats.YELLOW)


func _toggle_mode() -> void:
	rhythm_mode = not rhythm_mode
	save.rhythm_mode = rhythm_mode
	save.write()
	ui.update_settings(rhythm_mode, save.offset_ms)
	load_stage(level_idx)
	open_menu()


func _change_offset(delta_ms: int) -> void:
	save.offset_ms = clampi(save.offset_ms + delta_ms, -300, 300)
	conductor.offset_s = save.offset_ms / 1000.0
	save.write()
	ui.update_settings(rhythm_mode, save.offset_ms)


func undo() -> void:
	if rhythm_mode or history.is_empty() or phase == "menu":
		return
	state = history.pop_back()
	phase = "playing"
	ui.hide_overlay()
	_rebuild_views()
	_refresh_hud()


# ---------------------------------------------------------------- 입력

## 행동 입력(키보드/탭 공용). action: up|down|left|right|wait
func act(action: String) -> void:
	if ui.overlay_visible() and phase != "ready":
		return
	if phase == "ready":
		start_run()
		return
	if phase != "playing":
		return
	if rhythm_mode:
		_apply_events(judge.input(action, conductor.song_time()))
	else:
		_do_step(action, "puzzle")


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_UP, KEY_W: act("up")
			KEY_DOWN, KEY_S: act("down")
			KEY_LEFT, KEY_A: act("left")
			KEY_RIGHT, KEY_D: act("right")
			KEY_SPACE, KEY_PERIOD: act("wait")
			KEY_R: restart()
			KEY_Z: undo()
			KEY_ESCAPE: pause()
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_tap(event.position)


## 화면 탭 → 병아리 기준 방향. 병아리 근처를 탭하면 대기, 그 밖은 지배적인 축 방향.
func _tap(screen_pos: Vector2) -> void:
	if phase != "playing" and phase != "ready":
		return
	var origin := cam.project_ray_origin(screen_pos)
	var normal := cam.project_ray_normal(screen_pos)
	if absf(normal.y) < 0.0001:
		return
	var hit := origin + normal * (-origin.y / normal.y)
	var rel := hit - board.world_pos(state.player)
	if absf(rel.x) < 0.5 and absf(rel.z) < 0.5:
		act("wait")
	elif absf(rel.x) > absf(rel.z):
		act("right" if rel.x > 0.0 else "left")
	else:
		act("down" if rel.z > 0.0 else "up")


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_APPLICATION_PAUSED:
		pause()


# ---------------------------------------------------------------- 진행

func _apply_events(events: Array) -> void:
	for ev in events:
		if phase != "playing":
			break
		_do_step(ev["action"], ev["kind"])


## 한 턴 진행. 벽에 막혀도(리듬 모드) 박자는 지나가므로 대기로 처리한다.
func _do_step(action: String, kind: String) -> void:
	var next := GameLogic.step(state, action)
	var bumped := false
	if next == null:
		if not rhythm_mode:
			chick.bump(_dir3(action))
			return
		bumped = true
		next = GameLogic.step(state, "wait")
	var prev := state
	history.append(prev)
	state = next
	var dur := minf(0.17, judge.spb * 0.35) if rhythm_mode else 0.19

	var d: Vector2i = GameLogic.DIRS[action]
	if action != "wait":
		chick.face(d)
	if bumped:
		chick.bump(_dir3(action))
	elif action != "wait":
		chick.hop(board.world_pos(prev.player), board.world_pos(state.player), dur)
	for i in state.enemies.size():
		var e: Dictionary = state.enemies[i]
		var pe: Dictionary = prev.enemies[i]
		var ev: EnemyView = enemy_views[e["id"]]
		if e["pos"] != pe["pos"]:
			ev.hop(board.world_pos(pe["pos"]), board.world_pos(e["pos"]), dur)
		ev.face(_enemy_look(e))
	board.sync_tiles(state)
	board.show_intents(state)

	match kind:
		"perfect":
			ui.show_judge("PERFECT", Mats.YELLOW)
			conductor.play_sfx("perfect")
		"good":
			ui.show_judge("GOOD", Mats.GREEN)
			conductor.play_sfx("good")
	_refresh_hud()
	if state.status != "playing":
		_finish(dur)


func _dir3(action: String) -> Vector3:
	var d: Vector2i = GameLogic.DIRS[action]
	return Vector3(d.x, 0, d.y)


func _finish(anim_dur: float) -> void:
	var status := state.status
	phase = status
	conductor.stop()
	ui.beat_bar.active = false
	conductor.play_sfx("won" if status == "won" else "dead")
	if status == "won":
		save.mark_cleared(level_idx, judge.rank() if rhythm_mode else "S")
		await get_tree().create_timer(anim_dur).timeout
		chick.celebrate()
	else:
		await get_tree().create_timer(anim_dur).timeout
		chick.fall_over()
	await get_tree().create_timer(0.7).timeout
	if phase != status:
		return    # 그 사이 다시하기 등을 눌렀다
	_show_result(status)


func _show_result(status: String) -> void:
	var last := level_idx >= Levels.DATA.size() - 1
	if status == "won":
		var sub := "%d턴 만에 탈출했어요." % state.turn
		if rhythm_mode:
			var c: Dictionary = judge.counts
			sub = "랭크 %s   점수 %d\nPERFECT %d   GOOD %d   예약 %d   최대 콤보 %d" % [
				judge.rank(), judge.score, c["perfect"], c["good"], c["queued"], judge.max_combo]
		if last:
			sub += "\n모든 스테이지 클리어!"
		var buttons: Array = []
		if not last:
			buttons.append(["다음 스테이지 →", _next_stage, true])
		buttons.append(["다시하기", restart, last])
		buttons.append(["메뉴", open_menu])
		ui.show_overlay("탈출 성공!", sub, buttons, Mats.GREEN)
	else:
		var buttons: Array = [["다시하기", restart, true], ["메뉴", open_menu]]
		if not rhythm_mode:
			buttons.push_front(["한 턴 되돌리기", undo])
		ui.show_overlay("실패", state.cause, buttons, Mats.RED)


func _next_stage() -> void:
	var go_on := rhythm_mode
	load_stage(level_idx + 1)
	if go_on:
		start_run()


func _refresh_hud() -> void:
	ui.set_score(judge.score, judge.combo, state.turn, rhythm_mode)


# ---------------------------------------------------------------- 매 프레임

func _process(_delta: float) -> void:
	var pulse := 0.0
	if phase == "playing" and rhythm_mode and conductor.running:
		var now := conductor.song_time()
		_apply_events(judge.advance(now))
		pulse = judge.beat_pulse(now)
		_update_countdown(now)
	elif phase == "ready" or phase == "menu" or not rhythm_mode:
		pulse = 0.5 + 0.5 * sin(Time.get_ticks_msec() / 300.0) if phase != "playing" else 0.0
	if phase == "playing" or phase == "ready" or phase == "menu":
		chick.set_pulse(pulse)
		for ev in enemy_views.values():
			ev.set_pulse(pulse)
	board.pulse(pulse)
	var pending := judge.pending if (rhythm_mode and phase == "playing") else ""
	board.show_move_targets(state, pending, pulse)


func _update_countdown(now: float) -> void:
	var p := (now - judge.t0) / judge.spb
	var c := int(floor(p))
	if p < 0.0 or c > RhythmJudge.COUNT_IN:
		ui.show_count("", 1.0, 0.0)
		return
	var f := p - float(c)
	var text := "GO!" if c == RhythmJudge.COUNT_IN else str(RhythmJudge.COUNT_IN - c)
	ui.show_count(text, 1.0 + (1.0 - f) * 0.25, 1.0 - f * f)

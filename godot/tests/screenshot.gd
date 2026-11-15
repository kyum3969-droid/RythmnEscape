extends SceneTree
## 화면 캡처 도구. 사용:
##   xvfb-run -a godot --rendering-driver opengl3 --resolution 720x1280 --path godot \
##     --script res://tests/screenshot.gd -- <시나리오> <스테이지(1~6)> <출력.png>
## 시나리오: menu | ready | play | mid | dead | win

func shot(path: String) -> void:
	await process_frame
	await process_frame
	var img := root.get_viewport().get_texture().get_image()
	img.save_png(path)
	print("saved ", path, " ", img.get_size())


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var scenario := args[0] if args.size() > 0 else "menu"
	var stage := (int(args[1]) - 1) if args.size() > 1 else 0
	var out := args[2] if args.size() > 2 else "/tmp/shot.png"
	_run.call_deferred(scenario, stage, out)


func _run(scenario: String, stage: int, out: String) -> void:
	var main: Main = load("res://scenes/main.tscn").instantiate()
	root.add_child(main)
	await process_frame
	await process_frame
	main.conductor.use_fake_clock = true
	if scenario == "menu":
		await shot(out)
		quit()
		return
	main.ui.hide_select()
	main.load_stage(stage)
	await process_frame
	if scenario == "ready" or scenario == "idle":
		if scenario == "idle":
			main.ui.hide_overlay()
		await shot(out)
		quit()
		return
	main.start_run()
	var j := main.judge
	# 카운트다운 중간(3 표시)
	main.conductor.fake_time = j.beat_time(0) + 0.1
	await process_frame
	if scenario == "play":
		await shot(out)
		quit()
		return
	# 정각에 한 번 점프 후 짧게 기다렸다가 캡처
	main.conductor.fake_time = j.beat_time(3)
	var seq := {"0": "rrrrddll", "1": "ddddrrrrrr", "2": "ddddrrddll", "3": "dddddwdrrrrrr", "4": "drdrrruurrrrdddllu", "5": "rwrrrddrruurrdd"}[str(stage)] as String
	var names := {"u": "up", "d": "down", "l": "left", "r": "right", "w": "wait"}
	var n := seq.length() if scenario == "win" else 3
	for i in n:
		main.conductor.fake_time = j.beat_time(3 + i)
		main.act(names[seq[i]])
		await create_timer(0.3).timeout
		main.conductor.fake_time = j.beat_time(3 + i) + 0.2
	if scenario == "mid":
		main.conductor.fake_time = j.beat_time(3 + n)
		main.act(names[seq[n]])
		await create_timer(0.07).timeout
		await shot(out)
		quit()
		return
	if scenario == "dead":
		for i in 6:
			main.conductor.fake_time = j.beat_time(3 + n + i)
			main.act("up")
			await create_timer(0.3).timeout
	await create_timer(1.4).timeout
	await shot(out)
	quit()

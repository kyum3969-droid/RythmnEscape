class_name EnemyView
extends ActorView
## 적: 순찰병(빨간 네모) / 추적자(보라 가시공). 눈은 다음에 갈 방향을 바라본다.

var type := "patrol"


func _init(kind: String = "patrol") -> void:
	super._init()
	type = kind
	hop_height = 0.3
	base_scale = 1.0
	var ink := Mats.toon(Mats.INK, false)
	var white := Mats.toon(Mats.WHITE, false, 0.0, 0.3)
	var eye_y := 0.34
	var eye_z := -0.3
	if kind == "patrol":
		add_part(body_root, Shapes.squircle(Vector3(0.64, 0.6, 0.62), 0.4, 0.4, 12, 18), Mats.toon(Mats.RED), Vector3(0, 0.3, 0))
	else:
		var purple := Mats.toon(Mats.PURPLE)
		add_part(body_root, Shapes.squircle(Vector3(0.56, 0.56, 0.56), 1.0, 1.0, 10, 16), purple, Vector3(0, 0.32, 0))
		var spike := Shapes.cone(0.1, 0.2, 7)
		for i in 8:
			var a := TAU * float(i) / 8.0
			var d := Vector3(sin(a), 0, -cos(a))
			if i != 0:       # 정면(눈 자리)은 비워 둔다
				_spike(spike, purple, d)
			var diag := (d + Vector3.UP).normalized()
			if i % 2 == 1:
				_spike(spike, purple, diag)
		_spike(spike, purple, Vector3.UP)
		eye_z = -0.25
		eye_y = 0.36
	for side in [-1.0, 1.0]:
		add_part(body_root, Shapes.squircle(Vector3(0.07, 0.12, 0.05), 0.8, 0.8, 8, 12), ink, Vector3(side * 0.12, eye_y, eye_z))
		add_part(body_root, Shapes.squircle(Vector3(0.028, 0.036, 0.02), 1.0, 1.0, 6, 8), white, Vector3(side * 0.12 - 0.01, eye_y + 0.035, eye_z - 0.027))
		# 화난 눈썹: 안쪽이 아래로
		add_part(body_root, Shapes.squircle(Vector3(0.15, 0.035, 0.03), 0.6, 0.6, 6, 10), ink,
				Vector3(side * 0.125, eye_y + 0.1, eye_z - 0.01), Vector3(0, 0, 22.0 * side))
	face_now(Vector2i(0, 1))
	_apply()


func _spike(mesh: Mesh, mat: Material, dir: Vector3) -> void:
	var mi := add_part(body_root, mesh, mat, Vector3(0, 0.32, 0) + dir * 0.25)
	mi.basis = Basis(Quaternion(Vector3.UP, dir))

class_name ChickView
extends ActorView
## 노란 유치원 모자를 쓴 병아리 (kong 저장소의 기본 병아리 느낌을 참고해 새로 만든 모델).
## 비율은 머리 0.70x0.54x0.58, 몸 0.40x0.38x0.35, 발 바닥 Y=0, 앞은 -Z.

var wing_l := Node3D.new()
var wing_r := Node3D.new()
var _eyes: Array[MeshInstance3D] = []


func _init() -> void:
	super._init()
	hop_height = 0.55
	base_scale = 0.95
	var cream := Mats.toon(Mats.CREAM)
	var yellow := Mats.toon(Mats.YELLOW)
	var orange := Mats.toon(Mats.ORANGE)
	var ink := Mats.toon(Mats.INK, false)
	var white := Mats.toon(Mats.WHITE, false, 0.0, 0.3)

	# 발 → 몸 → 머리
	for side in [-1.0, 1.0]:
		add_part(body_root, Shapes.squircle(Vector3(0.17, 0.07, 0.22), 0.6, 0.6, 8, 12), orange, Vector3(side * 0.11, 0.035, -0.06))
	add_part(body_root, Shapes.squircle(Vector3(0.40, 0.38, 0.35), 0.5, 0.5), cream, Vector3(0, 0.29, 0))
	add_part(body_root, Shapes.squircle(Vector3(0.70, 0.54, 0.58), 0.38, 0.38, 14, 22), cream, Vector3(0, 0.70, 0))

	# 날개(어깨 축에서 펄럭)
	for i in 2:
		var side := -1.0 if i == 0 else 1.0
		var w := wing_l if i == 0 else wing_r
		w.position = Vector3(side * 0.24, 0.42, 0)
		body_root.add_child(w)
		add_part(w, Shapes.squircle(Vector3(0.10, 0.22, 0.2), 0.7, 0.7, 8, 12), cream, Vector3(side * 0.02, -0.07, 0))

	# 얼굴: 콩알 눈 + 하이라이트 + 부리
	for side in [-1.0, 1.0]:
		_eyes.append(add_part(body_root, Shapes.squircle(Vector3(0.075, 0.125, 0.05), 0.8, 0.8, 8, 12), ink, Vector3(side * 0.155, 0.72, -0.285)))
		add_part(body_root, Shapes.squircle(Vector3(0.03, 0.04, 0.02), 1.0, 1.0, 6, 8), white, Vector3(side * 0.155 - 0.012, 0.755, -0.312))
	add_part(body_root, Shapes.squircle(Vector3(0.15, 0.095, 0.14), 0.8, 0.8, 8, 12), orange, Vector3(0, 0.645, -0.31))

	# 노란 모자: 둥근 정수리 + 넓은 챙
	add_part(body_root, Shapes.squircle(Vector3(0.5, 0.28, 0.5), 0.6, 1.0, 10, 20), yellow, Vector3(0, 1.03, 0))
	add_part(body_root, Shapes.squircle(Vector3(0.86, 0.06, 0.86), 0.3, 1.0, 6, 24), yellow, Vector3(0, 0.97, 0.02))

	face_now(Vector2i(0, 1))   # 처음엔 카메라 쪽을 본다
	_apply()


## 점프 중 날개를 펄럭이게 하려고 ActorView._apply를 확장
func _apply() -> void:
	super._apply()
	var flap := 0.0
	if _hop_t >= 0.0:
		flap = sin(PI * _hop_t) * 0.9
	wing_l.rotation.z = -flap
	wing_r.rotation.z = flap


## 적에게 당함: 옆으로 쓰러진다.
func fall_over() -> void:
	_kill_tween()
	_tween = create_tween().set_parallel(true)
	_tween.tween_property(body_root, "rotation:z", PI * 0.5, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_tween.tween_property(body_root, "position:y", 0.3, 0.25)
	shadow.scale = Vector3(1.2, 1, 1.2)


## 탈출 성공: 제자리에서 한 바퀴 돌며 뛴다.
func celebrate() -> void:
	_kill_tween()
	var start := body_root.rotation.y
	_tween = create_tween().set_parallel(true)
	_tween.tween_property(body_root, "rotation:y", start + TAU, 0.6).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_tween.tween_method(func(t: float) -> void:
		body_root.position.y = sin(PI * t) * 0.5, 0.0, 1.0, 0.5)

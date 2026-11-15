class_name ActorView
extends Node3D
## 칸 위에 서는 캐릭터의 공통 동작: 점프(포물선+찌그러짐), 박자 맥박, 부딪힘, 바라보기.
## 이 노드의 position이 "땅 위 위치". 높이/회전/크기는 body_root가 맡는다.

var body_root := Node3D.new()
var shadow := MeshInstance3D.new()
var hop_height := 0.55
var base_scale := 1.0

var _hop_t := -1.0
var _pulse := 0.0
var _bump := Vector3.ZERO
var _tween: Tween
var _face_tween: Tween


func _init() -> void:
	add_child(body_root)
	var quad := PlaneMesh.new()
	quad.size = Vector2(0.8, 0.8)
	shadow.mesh = quad
	shadow.material_override = Mats.blob()
	shadow.position = Vector3(0, 0.02, 0.02)
	shadow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(shadow)


func add_part(parent: Node3D, mesh: Mesh, mat: Material, pos: Vector3, rot_deg: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	mi.rotation_degrees = rot_deg
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi


## from → to 로 한 칸 점프. 끝나면 await 가능.
func hop(from: Vector3, to: Vector3, dur: float) -> void:
	_kill_tween()
	position = from
	_tween = create_tween()
	_tween.tween_method(_hop_step.bind(from, to), 0.0, 1.0, dur)
	_tween.finished.connect(_hop_done.bind(to), CONNECT_ONE_SHOT)


func _hop_step(t: float, from: Vector3, to: Vector3) -> void:
	_hop_t = t
	position = from.lerp(to, t)
	_apply()


func _hop_done(to: Vector3) -> void:
	position = to
	_hop_t = -1.0
	_apply()


## 벽에 막힘: 그쪽으로 살짝 밀렸다가 돌아온다.
func bump(dir: Vector3, dur: float = 0.14) -> void:
	_kill_tween()
	_tween = create_tween()
	_tween.tween_method(func(t: float) -> void:
		_bump = dir * sin(PI * t) * 0.16
		_apply(), 0.0, 1.0, dur)
	_tween.finished.connect(func() -> void:
		_bump = Vector3.ZERO
		_apply(), CONNECT_ONE_SHOT)


func set_pulse(p: float) -> void:
	_pulse = p
	if _hop_t < 0.0:
		_apply()


## dir(칸 단위 방향)을 바라보게 부드럽게 돈다. 모델의 앞은 -Z.
func face(dir: Vector2i) -> void:
	if dir == Vector2i.ZERO:
		return
	var target := atan2(-float(dir.x), -float(dir.y))
	if _face_tween:
		_face_tween.kill()
	_face_tween = create_tween()
	var start := body_root.rotation.y
	_face_tween.tween_method(func(t: float) -> void:
		body_root.rotation.y = lerp_angle(start, target, t), 0.0, 1.0, 0.1)


func face_now(dir: Vector2i) -> void:
	if dir != Vector2i.ZERO:
		body_root.rotation.y = atan2(-float(dir.x), -float(dir.y))


func _kill_tween() -> void:
	if _tween:
		_tween.kill()
	_hop_t = -1.0
	_bump = Vector3.ZERO


## 점프/맥박 상태를 한 곳에서 합쳐 높이와 찌그러짐으로 적용
func _apply() -> void:
	var h := 0.0
	var sy := 1.0
	if _hop_t >= 0.0:
		var s := sin(PI * _hop_t)
		h = s * hop_height
		sy = 1.0 + 0.2 * s
		var land := clampf((_hop_t - 0.8) / 0.2, 0.0, 1.0)   # 착지 직전 찌그러짐
		sy -= sin(PI * land) * 0.14
	else:
		h = 0.05 * _pulse
		sy = 1.0 + 0.05 * _pulse
	var sxz := 1.0 / sqrt(sy)
	body_root.position = Vector3(_bump.x, h, _bump.z)
	body_root.scale = Vector3(sxz, sy, sxz) * base_scale
	var sh := 1.0 - clampf(h / (hop_height * 1.6), 0.0, 0.6)
	shadow.scale = Vector3(sh, 1, sh)

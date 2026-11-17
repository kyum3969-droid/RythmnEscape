class_name BoardView
extends Node3D
## 바닥/벽/출구/구멍과 타일 위 표시(적 이동 예고, 갈 수 있는 칸)를 그린다.
## 격자 (x, y) → 월드 (x - (w-1)/2, 0, y - (h-1)/2). 격자 위쪽(y 작음)이 화면 안쪽(-Z).

const FLOOR_A := Color("#3a4180")
const FLOOR_B := Color("#434b8f")
const WALL_COLOR := Color("#525baa")
const CRUMBLE_COLOR := Color("#a8793f")
const PIT_COLOR := Color("#05060d")
const MARKER_Y := 0.035

var width := 0
var height := 0
var _crumbles := {}              # Vector2i -> MeshInstance3D
var _pits := {}
var _exit_door: Node3D
var _exit_glow: MeshInstance3D
var _intent_nodes: Array[Node3D] = []
var _move_markers := {}          # "up".."right" -> MeshInstance3D
var _wait_marker: MeshInstance3D


func world_pos(p: Vector2i) -> Vector3:
	return Vector3(p.x - (width - 1) * 0.5, 0.0, p.y - (height - 1) * 0.5)


## 월드 좌표를 소수 격자 좌표로 (정수+0.5 = 칸 중심)
func to_grid(v: Vector3) -> Vector2:
	return Vector2(v.x + (width - 1) * 0.5 + 0.5, v.z + (height - 1) * 0.5 + 0.5)


func build(s: GameState) -> void:
	for c in get_children():
		c.queue_free()
	_crumbles.clear()
	_pits.clear()
	_intent_nodes.clear()
	_move_markers.clear()
	width = s.width
	height = s.height

	var floor_mesh := Shapes.squircle(Vector3(0.96, 0.24, 0.96), 0.3, 0.3, 6, 12)
	var wall_mesh := Shapes.squircle(Vector3(0.96, 0.52, 0.96), 0.28, 0.3, 8, 12)
	var floors := _multi(floor_mesh)
	var walls := _multi(wall_mesh)
	var floor_list: Array = []
	var wall_list: Array = []
	for y in height:
		for x in width:
			var t := s.tile_at(x, y)
			var p := world_pos(Vector2i(x, y))
			if t == GameState.Tile.WALL:
				wall_list.append(p)
			else:
				floor_list.append([p, FLOOR_A if (x + y) % 2 == 0 else FLOOR_B])
	floors.multimesh.instance_count = floor_list.size()
	for i in floor_list.size():
		floors.multimesh.set_instance_transform(i, Transform3D(Basis.IDENTITY, (floor_list[i][0] as Vector3) + Vector3(0, -0.12, 0)))
		floors.multimesh.set_instance_color(i, floor_list[i][1])
	walls.multimesh.instance_count = wall_list.size()
	for i in wall_list.size():
		walls.multimesh.set_instance_transform(i, Transform3D(Basis.IDENTITY, (wall_list[i] as Vector3) + Vector3(0, 0.08, 0)))
		walls.multimesh.set_instance_color(i, WALL_COLOR)

	var slab := Shapes.squircle(Vector3(0.88, 0.14, 0.88), 0.3, 0.3, 6, 12)
	var pit_mesh := Shapes.squircle(Vector3(0.8, 0.04, 0.8), 0.3, 0.3, 4, 12)
	for y in height:
		for x in width:
			var pos := Vector2i(x, y)
			var t := s.tile_at(x, y)
			var wp := world_pos(pos)
			if t == GameState.Tile.CRUMBLE:
				var mi := _mesh_at(slab, Mats.toon(CRUMBLE_COLOR), wp + Vector3(0, -0.01, 0))
				_crumbles[pos] = mi
			elif t == GameState.Tile.PIT:
				_pits[pos] = _mesh_at(pit_mesh, Mats.toon(PIT_COLOR, false), wp + Vector3(0, 0.02, 0))
			elif t == GameState.Tile.EXIT:
				_build_exit(wp)
	for dir in ["up", "down", "left", "right"]:
		_move_markers[dir] = _make_marker(Mats.marker(Mats.YELLOW, 0.05, 1.0))
	_wait_marker = _make_marker(Mats.marker(Mats.GREEN, 0.0, 1.0))
	_wait_marker.scale = Vector3(0.6, 1, 0.6)


func _multi(mesh: Mesh) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = mesh
	var inst := MultiMeshInstance3D.new()
	inst.multimesh = mm
	inst.material_override = Mats.toon(Color.WHITE, false, 0.0, 0.1)
	inst.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(inst)
	return inst


func _mesh_at(mesh: Mesh, mat: Material, pos: Vector3) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi


func _make_marker(mat: Material) -> MeshInstance3D:
	var quad := PlaneMesh.new()
	quad.size = Vector2(0.96, 0.96)
	var mi := _mesh_at(quad, mat, Vector3(0, MARKER_Y, 0))
	mi.visible = false
	return mi


func _build_exit(wp: Vector3) -> void:
	_exit_door = Node3D.new()
	_exit_door.position = wp
	add_child(_exit_door)
	var green := Mats.toon(Mats.GREEN, true, 0.024, 0.45)
	var door := _mesh_at(Shapes.squircle(Vector3(0.58, 0.84, 0.2), 0.5, 0.5, 10, 16), green, Vector3(0, 0.42, 0))
	remove_child(door)
	_exit_door.add_child(door)
	var inner := _mesh_at(Shapes.squircle(Vector3(0.36, 0.64, 0.06), 0.6, 0.6, 8, 12), Mats.toon(Color("#0b3b2a"), false), Vector3(0, 0.4, 0.1))
	remove_child(inner)
	_exit_door.add_child(inner)
	var quad := PlaneMesh.new()
	quad.size = Vector2(0.96, 0.96)
	_exit_glow = _mesh_at(quad, Mats.marker(Mats.GREEN, 0.38, 1.0), wp + Vector3(0, MARKER_Y, 0))


func pulse(p: float) -> void:
	if _exit_door:
		var s := 1.0 + 0.06 * p
		_exit_door.scale = Vector3(s, s, s)
	if _exit_glow:
		(_exit_glow.material_override as ShaderMaterial).set_shader_parameter("pulse", p)


## 무너진 발판을 구멍으로 바꾸는 등, 상태에 맞게 타일을 갱신
func sync_tiles(s: GameState) -> void:
	for pos in _crumbles.keys():
		if s.tile_at(pos.x, pos.y) == GameState.Tile.PIT:
			var node: MeshInstance3D = _crumbles[pos]
			_crumbles.erase(pos)
			var wp := world_pos(pos)
			var tw := create_tween()
			tw.tween_property(node, "position:y", -0.5, 0.25).set_ease(Tween.EASE_IN)
			tw.tween_callback(node.queue_free)
			_pits[pos] = _mesh_at(Shapes.squircle(Vector3(0.8, 0.04, 0.8), 0.3, 0.3, 4, 12), Mats.toon(PIT_COLOR, false), wp + Vector3(0, 0.02, 0))


## 적이 다음 턴에 갈 칸을 점선+화살표로 예고
func show_intents(s: GameState) -> void:
	for n in _intent_nodes:
		n.queue_free()
	_intent_nodes.clear()
	if s.status != "playing":
		return
	for e in s.enemies:
		if not e["has_intent"]:
			continue
		var color: Color = Mats.RED if e["type"] == "patrol" else Mats.PURPLE
		var from: Vector2i = e["pos"]
		var to: Vector2i = e["intent"]
		var root := Node3D.new()
		root.position = world_pos(to)
		add_child(root)
		var quad := PlaneMesh.new()
		quad.size = Vector2(0.96, 0.96)
		var m := MeshInstance3D.new()
		m.mesh = quad
		m.material_override = Mats.marker(color, 0.22, 1.0, true)
		m.position.y = MARKER_Y
		root.add_child(m)
		var d := to - from
		var dir3 := Vector3(d.x, 0, d.y).normalized()
		var arrow := MeshInstance3D.new()
		arrow.mesh = Shapes.cone(0.13, 0.3, 8)
		arrow.material_override = Mats.toon(color, false, 0.0, 0.25)
		arrow.position = Vector3(0, 0.1, 0) - dir3 * 0.15
		arrow.basis = Basis(Quaternion(Vector3.UP, dir3))
		root.add_child(arrow)
		_intent_nodes.append(root)


## 병아리 옆 4칸(갈 수 있는 곳)을 박자마다 반짝이게 보여주고, 예약된 칸은 초록으로 표시
func show_move_targets(s: GameState, pending: String, pulse_v: float) -> void:
	for dir in _move_markers.keys():
		var mk: MeshInstance3D = _move_markers[dir]
		var d: Vector2i = GameLogic.DIRS[dir]
		var p := s.player + d
		var t := s.tile_at(p.x, p.y)
		var ok := s.status == "playing" and t != GameState.Tile.WALL and t != GameState.Tile.PIT
		mk.visible = ok
		if not ok:
			continue
		mk.position = world_pos(p) + Vector3(0, MARKER_Y + 0.005, 0)
		var mat := mk.material_override as ShaderMaterial
		var reserved: bool = pending == dir
		var danger := _danger_at(s, p)
		mat.set_shader_parameter("color", Mats.GREEN if reserved else (Mats.RED if danger else Mats.YELLOW))
		mat.set_shader_parameter("fill", 0.4 if reserved else 0.05)
		mat.set_shader_parameter("border", 1.0 if (reserved or not danger) else 0.4)
		mat.set_shader_parameter("pulse", 1.0 if reserved else pulse_v)
	_wait_marker.visible = pending == "wait" and s.status == "playing"
	_wait_marker.position = world_pos(s.player) + Vector3(0, MARKER_Y + 0.01, 0)


func _danger_at(s: GameState, p: Vector2i) -> bool:
	for e in s.enemies:
		if (e["pos"] as Vector2i) == p or (e["has_intent"] and (e["intent"] as Vector2i) == p):
			return true
	return false

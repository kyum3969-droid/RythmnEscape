class_name GameLogic
extends RefCounted
## 턴제 규칙(순수 함수). 플레이어가 한 칸 점프하면 모든 적이 한 칸 움직인다.
## 적의 다음 이동("intent")은 미리 확정되어 화면에 예고된다.

const DIRS := {
	"up": Vector2i(0, -1),
	"down": Vector2i(0, 1),
	"left": Vector2i(-1, 0),
	"right": Vector2i(1, 0),
	"wait": Vector2i(0, 0),
}
const ACTIONS: Array[String] = ["up", "down", "left", "right", "wait"]
## BFS 탐색 순서(추적자 경로 결정에 영향 — 웹 프로토타입과 동일하게 유지)
const _BFS_ORDER: Array[Vector2i] = [Vector2i(0, -1), Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0)]


static func init_state(level: Dictionary) -> GameState:
	var s := GameState.new()
	var rows: Array = level["map"]
	s.height = rows.size()
	s.width = (rows[0] as String).length()
	s.grid.resize(s.width * s.height)
	var eid := 0
	for y in s.height:
		var row: String = rows[y]
		for x in s.width:
			var ch := row[x]
			var t: int = GameState.Tile.FLOOR
			match ch:
				"#":
					t = GameState.Tile.WALL
				"~":
					t = GameState.Tile.CRUMBLE
				"E":
					t = GameState.Tile.EXIT
				"P":
					s.player = Vector2i(x, y)
				">":
					s.enemies.append(_make_enemy(eid, "patrol", x, y, Vector2i(1, 0)))
					eid += 1
				"<":
					s.enemies.append(_make_enemy(eid, "patrol", x, y, Vector2i(-1, 0)))
					eid += 1
				"v":
					s.enemies.append(_make_enemy(eid, "patrol", x, y, Vector2i(0, 1)))
					eid += 1
				"^":
					s.enemies.append(_make_enemy(eid, "patrol", x, y, Vector2i(0, -1)))
					eid += 1
				"C":
					s.enemies.append(_make_enemy(eid, "chaser", x, y, Vector2i.ZERO))
					eid += 1
			s.grid[y * s.width + x] = t
	_plan_intents(s)
	return s


static func _make_enemy(id: int, type: String, x: int, y: int, dir: Vector2i) -> Dictionary:
	return {"id": id, "type": type, "pos": Vector2i(x, y), "dir": dir,
			"intent": Vector2i.ZERO, "has_intent": false}


static func _player_can_enter(t: int) -> bool:
	return t != GameState.Tile.WALL and t != GameState.Tile.PIT


static func _enemy_can_enter(t: int) -> bool:
	return t == GameState.Tile.FLOOR or t == GameState.Tile.CRUMBLE


## 추적자: BFS로 플레이어까지 최단 경로의 첫 칸. 경로가 없으면 has=false.
static func _chase_step(s: GameState, from: Vector2i) -> Dictionary:
	var goal := s.player
	var prev := {from: from}
	var queue: Array[Vector2i] = [from]
	var head := 0
	while head < queue.size():
		var cur := queue[head]
		head += 1
		if cur == goal:
			break
		for d in _BFS_ORDER:
			var n := cur + d
			if n.x < 0 or n.y < 0 or n.x >= s.width or n.y >= s.height or prev.has(n):
				continue
			if n != goal and not _enemy_can_enter(s.tile_at(n.x, n.y)):
				continue
			prev[n] = cur
			queue.append(n)
	if not prev.has(goal):
		return {"has": false}
	var cur: Vector2i = goal
	while prev[cur] != from:
		cur = prev[cur]
	return {"has": true, "pos": cur}


static func _blocked(s: GameState, e: Dictionary, p: Vector2i, reserved: Dictionary) -> bool:
	if not _enemy_can_enter(s.tile_at(p.x, p.y)) or reserved.has(p):
		return true
	for o in s.enemies:
		if o != e and (o["pos"] as Vector2i) == p:
			return true
	return false


## 각 적의 "다음 턴 이동"을 미리 확정한다.
static func _plan_intents(s: GameState) -> void:
	var reserved := {}
	for e in s.enemies:
		var has := false
		var target := Vector2i.ZERO
		var pos: Vector2i = e["pos"]
		if e["type"] == "patrol":
			var d: Vector2i = e["dir"]
			if _blocked(s, e, pos + d, reserved):
				d = -d
				e["dir"] = d
			if not _blocked(s, e, pos + d, reserved):
				target = pos + d
				has = true
		else:
			var r := _chase_step(s, pos)
			if r["has"] and not _blocked(s, e, r["pos"], reserved):
				target = r["pos"]
				has = true
		e["intent"] = target
		e["has_intent"] = has
		reserved[target if has else pos] = true


## 한 턴 진행: 플레이어 점프 → 적 이동 → 다음 예고 계산.
## 불가능한 이동(벽 등)이면 null.
static func step(prev: GameState, action: String) -> GameState:
	if prev.status != "playing" or not DIRS.has(action):
		return null
	var d: Vector2i = DIRS[action]
	var np := prev.player + d
	if action != "wait" and not _player_can_enter(prev.tile_at(np.x, np.y)):
		return null

	var s := prev.clone()
	s.turn += 1
	var from := s.player
	if action != "wait" and s.tile_at(from.x, from.y) == GameState.Tile.CRUMBLE:
		s.set_tile(from.x, from.y, GameState.Tile.PIT)
	s.player = np

	for e in s.enemies:
		if (e["pos"] as Vector2i) == np:
			s.status = "dead"
			s.cause = "적에게 뛰어들었어요!"
			return s
	if s.tile_at(np.x, np.y) == GameState.Tile.EXIT:
		s.status = "won"
		return s

	for e in s.enemies:
		if e["has_intent"]:
			e["pos"] = e["intent"]
	for e in s.enemies:
		if (e["pos"] as Vector2i) == np:
			s.status = "dead"
			s.cause = "적에게 잡혔어요!"
			return s
	_plan_intents(s)
	return s


## 레벨 검증용: 최소 턴 수 탐색(BFS). 풀 수 없으면 빈 배열.
static func solve(level: Dictionary, max_depth: int = 80) -> Array[String]:
	var start := init_state(level)
	var frontier: Array = [{"s": start, "path": [] as Array[String]}]
	var seen := {start.key(): true}
	for depth in max_depth:
		if frontier.is_empty():
			break
		var next: Array = []
		for item in frontier:
			var cs: GameState = item["s"]
			for a in ACTIONS:
				var n := step(cs, a)
				if n == null or n.status == "dead":
					continue
				var path: Array[String] = (item["path"] as Array[String]).duplicate()
				path.append(a)
				if n.status == "won":
					return path
				var k := n.key()
				if seen.has(k):
					continue
				seen[k] = true
				next.append({"s": n, "path": path})
		frontier = next
	return [] as Array[String]

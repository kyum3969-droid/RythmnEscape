class_name GameState
extends RefCounted
## 한 판의 상태(순수 데이터). 렌더링/오디오와 완전히 분리되어 있다.

enum Tile { FLOOR, WALL, CRUMBLE, PIT, EXIT }

var width := 0
var height := 0
var grid := PackedInt32Array()        # width*height, Tile 값
var player := Vector2i.ZERO
## 적: {id:int, type:String("patrol"|"chaser"), pos:Vector2i, dir:Vector2i,
##       intent:Vector2i, has_intent:bool}
var enemies: Array = []
var turn := 0
var status := "playing"               # playing | won | dead
var cause := ""


func tile_at(x: int, y: int) -> int:
	if x < 0 or y < 0 or x >= width or y >= height:
		return Tile.WALL
	return grid[y * width + x]


func set_tile(x: int, y: int, t: int) -> void:
	grid[y * width + x] = t


func clone() -> GameState:
	var s := GameState.new()
	s.width = width
	s.height = height
	s.grid = grid.duplicate()
	s.player = player
	s.enemies = []
	for e in enemies:
		s.enemies.append((e as Dictionary).duplicate())
	s.turn = turn
	s.status = status
	s.cause = cause
	return s


## 탐색 중복 제거용 키
func key() -> String:
	var parts := PackedStringArray([str(player.x), str(player.y), grid.to_byte_array().hex_encode()])
	for e in enemies:
		var p: Vector2i = e["pos"]
		var d: Vector2i = e["dir"]
		parts.append("%d,%d,%d,%d" % [p.x, p.y, d.x, d.y])
	return "|".join(parts)

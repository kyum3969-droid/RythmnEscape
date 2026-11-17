class_name SaveData
extends RefCounted
## 클리어 기록과 설정(소리 지연 보정, 모드)을 user://save.cfg에 저장한다.

const PATH := "user://save.cfg"

var cleared: Array[int] = []
var best_rank := {}            # 스테이지 번호(문자열) -> "S".."C"
var offset_ms := 0
var rhythm_mode := true


static func load_save() -> SaveData:
	var d := SaveData.new()
	var cf := ConfigFile.new()
	if cf.load(PATH) != OK:
		return d
	for v in cf.get_value("progress", "cleared", []):
		d.cleared.append(int(v))
	d.best_rank = cf.get_value("progress", "best_rank", {})
	d.offset_ms = int(cf.get_value("settings", "offset_ms", 0))
	d.rhythm_mode = bool(cf.get_value("settings", "rhythm_mode", true))
	return d


func write() -> void:
	var cf := ConfigFile.new()
	cf.set_value("progress", "cleared", cleared)
	cf.set_value("progress", "best_rank", best_rank)
	cf.set_value("settings", "offset_ms", offset_ms)
	cf.set_value("settings", "rhythm_mode", rhythm_mode)
	cf.save(PATH)


func mark_cleared(level: int, rank: String) -> void:
	if not cleared.has(level):
		cleared.append(level)
	var key := str(level)
	var order := "SABC"
	if not best_rank.has(key) or order.find(rank) < order.find(best_rank[key]):
		best_rank[key] = rank
	write()

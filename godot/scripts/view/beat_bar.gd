class_name BeatBar
extends Control
## 박자 바: 양쪽에서 노란 막대가 가운데 링으로 다가온다. 링에 닿는 순간이 박자.
## 예약된 입력은 초록 막대로 표시된다.

var judge: RhythmJudge
var conductor: Conductor
var active := false

var _box := StyleBoxFlat.new()
var _bar := StyleBoxFlat.new()


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(640, 104)
	_box.bg_color = Color("#171a33")
	_box.set_corner_radius_all(26)
	_bar.set_corner_radius_all(8)


func _process(_d: float) -> void:
	if visible:
		queue_redraw()


func _draw() -> void:
	var w := size.x
	var h := size.y
	var c := Vector2(w * 0.5, h * 0.5)
	draw_style_box(_box, Rect2(Vector2.ZERO, size))
	var pulse := 0.0
	if active and judge and conductor:
		var now := conductor.song_time()
		pulse = judge.beat_pulse(now)
		var gap := minf(w * 0.2, 150.0)
		var reserved_k := judge.reserved_beat()
		for k in range(judge.next_beat, judge.next_beat + 5):
			var dx := (judge.beat_time(k) - now) / judge.spb * gap
			if dx > c.x or dx < -gap * 0.5:
				continue
			var col := Mats.YELLOW
			if k < RhythmJudge.COUNT_IN:
				col = Color("#8b90b8")
			elif judge.pending != "" and k == reserved_k:
				col = Mats.GREEN
			col.a = clampf(1.0 - absf(dx) / c.x + 0.25, 0.0, 1.0)
			_bar.bg_color = col
			for side in [-1.0, 1.0]:
				draw_style_box(_bar, Rect2(Vector2(c.x + side * dx - 8.0, c.y - 28.0), Vector2(16.0, 56.0)))
	else:
		var font := get_theme_default_font()
		var txt := "탭하면 시작"
		var fs := 30
		var ts := font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
		draw_string(font, Vector2(c.x + w * 0.2 - ts.x * 0.5, c.y + fs * 0.35), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#8b90b8"))
	draw_circle(c, 26.0, Color(1.0, 0.82, 0.25, 0.14 + pulse * 0.5))
	draw_arc(c, 30.0 + pulse * 8.0, 0.0, TAU, 48, Mats.YELLOW, 5.0, true)

class_name GameUI
extends CanvasLayer
## 화면 UI(코드로 구성): 상단 HUD, 판정/카운트 글자, 박자 바, 오버레이, 스테이지 선택.

signal start_pressed
signal pause_pressed
signal restart_pressed
signal undo_pressed
signal menu_pressed
signal stage_chosen(index: int)
signal mode_toggled
signal offset_changed(ms: int)

const MUTED := Color("#8b90b8")
const PANEL := Color("#171a33")

var font: Font = load("res://assets/fonts/Jua-Regular.ttf")
var beat_bar := BeatBar.new()

var _root := Control.new()
var _stage_label := Label.new()
var _bpm_label := Label.new()
var _score_label := Label.new()
var _info_label := Label.new()
var _judge := Label.new()
var _count := Label.new()
var _hint := Label.new()
var _undo_btn: Button
var _judge_tween: Tween

var _overlay := Control.new()
var _ov_title := Label.new()
var _ov_sub := Label.new()
var _ov_buttons := VBoxContainer.new()

var _select := Control.new()
var _stage_grid := GridContainer.new()
var _mode_btn: Button
var _offset_label := Label.new()


func _ready() -> void:
	var theme := Theme.new()
	theme.default_font = font
	theme.default_font_size = 30
	_root.theme = theme
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)
	_build_hud()
	_build_bottom()
	_build_floating_labels()
	_build_overlay()
	_build_select()
	hide_overlay()
	_select.visible = false


# ---------------------------------------------------------------- 만들기

func _label(l: Label, size: int, color: Color = Color.WHITE, align := HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.horizontal_alignment = align
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func _stylebox(color: Color, radius: int = 22, border: Color = Color.TRANSPARENT) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	sb.set_corner_radius_all(radius)
	sb.content_margin_left = 24
	sb.content_margin_right = 24
	sb.content_margin_top = 12
	sb.content_margin_bottom = 12
	if border != Color.TRANSPARENT:
		sb.set_border_width_all(3)
		sb.border_color = border
	return sb


func make_button(text: String, primary: bool = false, min_size: Vector2 = Vector2(0, 80)) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = min_size
	var base := Mats.YELLOW if primary else Color("#2a2f5c")
	b.add_theme_stylebox_override("normal", _stylebox(base))
	b.add_theme_stylebox_override("hover", _stylebox(base.lightened(0.08)))
	b.add_theme_stylebox_override("pressed", _stylebox(base.darkened(0.12)))
	b.add_theme_stylebox_override("disabled", _stylebox(Color("#1d2040")))
	var fc := Color("#231c00") if primary else Color("#e8eaff")
	for n in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		b.add_theme_color_override(n, fc)
	b.add_theme_font_size_override("font_size", 32)
	return b


func _build_hud() -> void:
	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_TOP_WIDE)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for side in ["left", "right", "top"]:
		margin.add_theme_constant_override("margin_" + side, 28)
	_root.add_child(margin)
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(row)
	var left := VBoxContainer.new()
	left.mouse_filter = Control.MOUSE_FILTER_IGNORE
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(left)
	left.add_child(_label(_stage_label, 38))
	left.add_child(_label(_bpm_label, 26, MUTED))
	var right := VBoxContainer.new()
	right.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(right)
	right.add_child(_label(_score_label, 38, Mats.YELLOW, HORIZONTAL_ALIGNMENT_RIGHT))
	right.add_child(_label(_info_label, 26, MUTED, HORIZONTAL_ALIGNMENT_RIGHT))
	var pause := make_button("II", false, Vector2(84, 84))
	pause.pressed.connect(func() -> void: pause_pressed.emit())
	row.add_child(pause)


func _build_bottom() -> void:
	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	margin.grow_vertical = Control.GROW_DIRECTION_BEGIN
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_theme_constant_override("margin_left", 40)
	margin.add_theme_constant_override("margin_right", 40)
	margin.add_theme_constant_override("margin_bottom", 40)
	_root.add_child(margin)
	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_theme_constant_override("separation", 14)
	margin.add_child(col)
	_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(_label(_hint, 26, MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	col.add_child(beat_bar)
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", 14)
	col.add_child(row)
	var menu := make_button("메뉴", false, Vector2(0, 72))
	menu.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	menu.pressed.connect(func() -> void: menu_pressed.emit())
	row.add_child(menu)
	var restart := make_button("다시하기", false, Vector2(0, 72))
	restart.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	restart.pressed.connect(func() -> void: restart_pressed.emit())
	row.add_child(restart)
	_undo_btn = make_button("되돌리기", false, Vector2(0, 72))
	_undo_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_undo_btn.pressed.connect(func() -> void: undo_pressed.emit())
	row.add_child(_undo_btn)


func _build_floating_labels() -> void:
	_judge.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_judge.offset_left = -300
	_judge.offset_right = 300
	_judge.offset_top = 196
	_judge.pivot_offset = Vector2(300, 30)
	_label(_judge, 52, Color.WHITE, HORIZONTAL_ALIGNMENT_CENTER)
	_outline(_judge, 10)
	_root.add_child(_judge)
	_count.set_anchors_preset(Control.PRESET_FULL_RECT)
	_count.anchor_top = 0.30
	_count.anchor_bottom = 0.52
	_count.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_label(_count, 150, Color.WHITE, HORIZONTAL_ALIGNMENT_CENTER)
	_outline(_count, 18)
	_count.resized.connect(func() -> void: _count.pivot_offset = _count.size * 0.5)
	_root.add_child(_count)
	_judge.modulate.a = 0.0
	_count.modulate.a = 0.0


func _outline(l: Label, size: int) -> void:
	l.add_theme_constant_override("outline_size", size)
	l.add_theme_color_override("font_outline_color", Mats.INK)


func _panel_style() -> StyleBoxFlat:
	var sb := _stylebox(Color(PANEL, 0.96), 36, Color("#2c3160"))
	sb.content_margin_left = 40
	sb.content_margin_right = 40
	sb.content_margin_top = 36
	sb.content_margin_bottom = 36
	return sb


func _build_overlay() -> void:
	_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	_root.add_child(_overlay)
	var dim := ColorRect.new()
	dim.color = Color(0.03, 0.035, 0.08, 0.6)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.add_child(center)
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _panel_style())
	panel.custom_minimum_size = Vector2(580, 0)
	center.add_child(panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 22)
	panel.add_child(col)
	col.add_child(_label(_ov_title, 64, Color.WHITE, HORIZONTAL_ALIGNMENT_CENTER))
	_ov_sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(_label(_ov_sub, 28, MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	_ov_buttons.add_theme_constant_override("separation", 14)
	col.add_child(_ov_buttons)


func _build_select() -> void:
	_select.set_anchors_preset(Control.PRESET_FULL_RECT)
	_select.mouse_filter = Control.MOUSE_FILTER_STOP
	_root.add_child(_select)
	var bg := ColorRect.new()
	bg.color = Color("#0d0f1e")
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_select.add_child(bg)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_select.add_child(center)
	var col := VBoxContainer.new()
	col.custom_minimum_size = Vector2(600, 0)
	col.add_theme_constant_override("separation", 26)
	center.add_child(col)
	var title := Label.new()
	title.text = "RythmnEscape"
	_label(title, 76, Mats.YELLOW, HORIZONTAL_ALIGNMENT_CENTER)
	col.add_child(title)
	var sub := Label.new()
	sub.text = "비트에 맞춰 점프! 적을 피해 탈출하세요"
	_label(sub, 28, MUTED, HORIZONTAL_ALIGNMENT_CENTER)
	col.add_child(sub)
	_stage_grid.columns = 3
	_stage_grid.add_theme_constant_override("h_separation", 16)
	_stage_grid.add_theme_constant_override("v_separation", 16)
	col.add_child(_stage_grid)
	_mode_btn = make_button("", false, Vector2(0, 84))
	_mode_btn.pressed.connect(func() -> void: mode_toggled.emit())
	col.add_child(_mode_btn)
	var off := HBoxContainer.new()
	off.add_theme_constant_override("separation", 14)
	col.add_child(off)
	var cap := Label.new()
	cap.text = "소리 지연 보정"
	_label(cap, 28, MUTED)
	cap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	off.add_child(cap)
	var minus := make_button("-", false, Vector2(84, 72))
	minus.pressed.connect(func() -> void: offset_changed.emit(-10))
	off.add_child(minus)
	_label(_offset_label, 30, Color.WHITE, HORIZONTAL_ALIGNMENT_CENTER)
	_offset_label.custom_minimum_size = Vector2(150, 0)
	_offset_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	off.add_child(_offset_label)
	var plus := make_button("+", false, Vector2(84, 72))
	plus.pressed.connect(func() -> void: offset_changed.emit(10))
	off.add_child(plus)
	var help := Label.new()
	help.text = "소리가 화면보다 늦게 들리면 + 를 눌러 보세요."
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_label(help, 24, MUTED, HORIZONTAL_ALIGNMENT_CENTER)
	col.add_child(help)


# ---------------------------------------------------------------- 공개 API

func set_stage_info(stage_name: String, bpm: int, hint: String, rhythm: bool) -> void:
	_stage_label.text = stage_name
	_bpm_label.text = ("%d BPM" % bpm) if rhythm else "퍼즐 모드"
	_hint.text = hint
	beat_bar.visible = rhythm
	_undo_btn.visible = not rhythm


func set_score(score: int, combo: int, turn: int, rhythm: bool) -> void:
	_score_label.text = str(score) if rhythm else "턴 %d" % turn
	_info_label.text = ("콤보 %d  /  턴 %d" % [combo, turn]) if rhythm else ""


func show_judge(text: String, color: Color) -> void:
	_judge.text = text
	_judge.add_theme_color_override("font_color", color)
	if _judge_tween:
		_judge_tween.kill()
	_judge.modulate.a = 1.0
	_judge.scale = Vector2(1.25, 1.25)
	_judge_tween = create_tween().set_parallel(true)
	_judge_tween.tween_property(_judge, "scale", Vector2.ONE, 0.12)
	_judge_tween.tween_property(_judge, "modulate:a", 0.0, 0.35).set_delay(0.25)


## 카운트다운 글자(3·2·1·GO!). text가 ""이면 숨김.
func show_count(text: String, scale_v: float, alpha: float) -> void:
	_count.text = text
	_count.scale = Vector2(scale_v, scale_v)
	_count.modulate.a = alpha if text != "" else 0.0
	_count.add_theme_color_override("font_color", Mats.YELLOW if text == "GO!" else Color.WHITE)


func show_overlay(title: String, sub: String, buttons: Array, color: Color = Color.WHITE) -> void:
	_ov_title.text = title
	_ov_title.add_theme_color_override("font_color", color)
	_ov_sub.text = sub
	_ov_sub.visible = sub != ""
	for c in _ov_buttons.get_children():
		c.queue_free()
	for b in buttons:
		var btn := make_button(b[0], b[2] if b.size() > 2 else false)
		btn.pressed.connect(b[1])
		_ov_buttons.add_child(btn)
	_overlay.visible = true


func hide_overlay() -> void:
	_overlay.visible = false


func overlay_visible() -> bool:
	return _overlay.visible or _select.visible


func show_select(cleared: Array, best: Dictionary, current: int, rhythm: bool, offset_ms: int) -> void:
	for c in _stage_grid.get_children():
		c.queue_free()
	for i in Levels.DATA.size():
		var rank_txt := ""
		if cleared.has(i):
			rank_txt = "\n★ " + str(best.get(str(i), ""))
		var b := make_button("%d%s" % [i + 1, rank_txt], i == current, Vector2(184, 130))
		b.pressed.connect(func() -> void:
			_select.visible = false
			stage_chosen.emit(i))
		_stage_grid.add_child(b)
	update_settings(rhythm, offset_ms)
	_select.visible = true


func update_settings(rhythm: bool, offset_ms: int) -> void:
	_mode_btn.text = "리듬 모드" if rhythm else "퍼즐 모드 (박자 없음)"
	_offset_label.text = "%+d ms" % offset_ms


func hide_select() -> void:
	_select.visible = false

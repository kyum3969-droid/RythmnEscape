class_name Mats
extends RefCounted
## 색마다 하나씩 캐시되는 툰 머티리얼(+ 잉크 외곽선).

const INK := Color("#1b1d24")
const CREAM := Color("#fff1b8")
const YELLOW := Color("#ffd23f")
const ORANGE := Color("#ff9f30")
const WHITE := Color("#fffdf0")
const RED := Color("#ff5a6a")
const PURPLE := Color("#b46bff")
const GREEN := Color("#3ee6a0")

static var _toon: Shader = load("res://shaders/toon.gdshader")
static var _outline: Shader = load("res://shaders/outline.gdshader")
static var _marker: Shader = load("res://shaders/marker.gdshader")
static var _blob: Shader = load("res://shaders/blob.gdshader")
static var _cache := {}


static func toon(color: Color, outline: bool = true, width: float = 0.024, glow: float = 0.12) -> ShaderMaterial:
	var key := "%s:%s:%.3f:%.2f" % [color.to_html(), outline, width, glow]
	if _cache.has(key):
		return _cache[key]
	var m := ShaderMaterial.new()
	m.shader = _toon
	m.set_shader_parameter("albedo", color)
	m.set_shader_parameter("glow", glow)
	if outline:
		var o := ShaderMaterial.new()
		o.shader = _outline
		o.set_shader_parameter("outline_color", INK)
		o.set_shader_parameter("width", width)
		m.next_pass = o
	_cache[key] = m
	return m


## 타일 위 표시(채움/테두리/점선). 표시마다 값이 달라서 새로 만든다.
static func marker(color: Color, fill: float = 0.2, border: float = 1.0, dashed: bool = false) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = _marker
	m.set_shader_parameter("color", color)
	m.set_shader_parameter("fill", fill)
	m.set_shader_parameter("border", border)
	m.set_shader_parameter("dashed", 1.0 if dashed else 0.0)
	m.render_priority = 1
	return m


static func blob() -> ShaderMaterial:
	if not _cache.has("blob"):
		var m := ShaderMaterial.new()
		m.shader = _blob
		m.render_priority = 0
		_cache["blob"] = m
	return _cache["blob"]

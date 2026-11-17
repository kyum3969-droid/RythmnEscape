class_name Conductor
extends Node
## 곡 재생 + 정확한 곡 시간. 오디오 믹서 위치에 출력 지연을 보정해서 계산한다.
## 테스트에서는 use_fake_clock으로 시간을 직접 흘려보낸다.

var player := AudioStreamPlayer.new()
var sfx: Array[AudioStreamPlayer] = []
var use_fake_clock := false
var fake_time := 0.0
var offset_s := 0.0          ## 사용자 지연 보정(초). +면 입력 판정이 그만큼 늦게 인정됨
var spb := 0.6
var running := false

var _loop_len := 1.0
var _loops := 0
var _last_raw := 0.0
var _last_total := 0.0
var _sfx_cursor := 0
var _sfx_cache := {}


func _ready() -> void:
	player.bus = &"Master"
	add_child(player)
	for i in 4:
		var p := AudioStreamPlayer.new()
		add_child(p)
		sfx.append(p)


func start(bpm: float) -> void:
	spb = 60.0 / bpm
	var stream := MusicSynth.build(bpm)
	_loop_len = float(stream.loop_end - stream.loop_begin) / MusicSynth.RATE
	_loops = 0
	_last_raw = 0.0
	_last_total = 0.0
	fake_time = 0.0
	player.stream = stream
	if not use_fake_clock:
		player.play()
	running = true


func stop() -> void:
	player.stop()
	running = false


## 곡 시작을 0으로 하는 현재 곡 시간(초)
func song_time() -> float:
	if use_fake_clock:
		return fake_time - offset_s
	if not player.playing:
		return _last_total
	var raw := player.get_playback_position()
	if raw < _last_raw - _loop_len * 0.5:
		_loops += 1
	_last_raw = raw
	var total := raw + _loops * _loop_len + AudioServer.get_time_since_last_mix() - AudioServer.get_output_latency() - offset_s
	_last_total = maxf(total, _last_total)   # 시간이 거꾸로 가지 않게
	return _last_total


func play_sfx(kind: String) -> void:
	if not _sfx_cache.has(kind):
		_sfx_cache[kind] = MusicSynth.sting(kind)
	var p := sfx[_sfx_cursor]
	_sfx_cursor = (_sfx_cursor + 1) % sfx.size()
	p.stream = _sfx_cache[kind]
	if not use_fake_clock:
		p.play()

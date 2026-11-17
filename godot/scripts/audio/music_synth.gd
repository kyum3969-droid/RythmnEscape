class_name MusicSynth
extends RefCounted
## 음원 파일 없이 코드로 곡을 합성한다 (킥·스네어·하이햇·베이스·코드·멜로디).
## 곡 구조: [LEAD 무음] + [카운트인 3박] + [4마디(16박) 루프]
## → 박자 k는 LEAD + k*spb 시각에 있고, 루프는 카운트인 뒤부터 반복된다.

const RATE := 22050
const LEAD := 0.3
const COUNT_IN := 3
const LOOP_BEATS := 16
## 4마디 코드 진행 (Am - F - C - G)
const CHORDS := [
	{"root": 110.0, "notes": [220.0, 261.63, 329.63]},
	{"root": 87.31, "notes": [174.61, 220.0, 261.63]},
	{"root": 130.81, "notes": [261.63, 329.63, 392.0]},
	{"root": 98.0, "notes": [196.0, 246.94, 293.66]},
]

static var _cache := {}        # bpm -> AudioStreamWAV
static var _notes := {}        # "type:freq:dur:vol:slide" -> PackedFloat32Array
static var _rng := RandomNumberGenerator.new()


static func build(bpm: float) -> AudioStreamWAV:
	if _cache.has(bpm):
		return _cache[bpm]
	var spb := 60.0 / bpm
	var n := int((LEAD + (COUNT_IN + LOOP_BEATS) * spb) * RATE)
	var loop_begin := int((LEAD + COUNT_IN * spb) * RATE)
	var mix := PackedFloat32Array()
	mix.resize(n)

	for k in COUNT_IN:
		_add(mix, _note("square", 880.0, 0.06, 0.08), LEAD + k * spb, n, loop_begin)
	for b in LOOP_BEATS:
		var t := LEAD + (COUNT_IN + b) * spb
		var chord: Dictionary = CHORDS[(b / 4) % 4]
		var in_bar := b % 4
		_add(mix, _note("kick", 150.0, 0.16, 0.9, 45.0), t, n, loop_begin)
		if in_bar % 2 == 1:
			_add(mix, _note("snare", 1800.0, 0.12, 0.28), t, n, loop_begin)
			_add(mix, _note("triangle", 220.0, 0.06, 0.12, 160.0), t, n, loop_begin)
		_add(mix, _note("hat", 7000.0, 0.035, 0.10), t + spb * 0.5, n, loop_begin)
		_add(mix, _note("hat", 7000.0, 0.035, 0.05), t, n, loop_begin)
		var bass: float = chord["root"] * (2.0 if in_bar == 2 else 1.0)
		_add(mix, _note("triangle", bass, 0.25, 0.28), t, n, loop_begin)
		if in_bar == 0 or in_bar == 2:
			for f in chord["notes"]:
				_add(mix, _note("square", f, 0.14, 0.025), t, n, loop_begin)
		if (b / 4) % 2 == 1:
			var mf: float = chord["notes"][(b * 2) % 3] * 2.0
			_add(mix, _note("triangle", mf, 0.1, 0.06), t + spb * 0.5, n, loop_begin)

	var stream := _to_stream(mix)
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_begin = loop_begin
	stream.loop_end = n
	_cache[bpm] = stream
	return stream


## 효과음: "perfect" | "good" | "won" | "dead"
static func sting(kind: String) -> AudioStreamWAV:
	var mix := PackedFloat32Array()
	match kind:
		"perfect":
			mix.resize(int(0.18 * RATE))
			_add(mix, _note("triangle", 1568.0, 0.12, 0.22), 0.0, mix.size(), 0)
		"good":
			mix.resize(int(0.14 * RATE))
			_add(mix, _note("triangle", 1175.0, 0.09, 0.16), 0.0, mix.size(), 0)
		"won":
			mix.resize(int(0.9 * RATE))
			var freqs := [523.25, 659.25, 783.99, 1046.5]
			for i in freqs.size():
				_add(mix, _note("triangle", freqs[i], 0.3, 0.22), i * 0.08, mix.size(), 0)
		_:
			mix.resize(int(0.7 * RATE))
			_add(mix, _note("saw", 330.0, 0.5, 0.12, 80.0), 0.0, mix.size(), 0)
			_add(mix, _note("snare", 900.0, 0.25, 0.2), 0.0, mix.size(), 0)
	return _to_stream(mix)


static func _to_stream(mix: PackedFloat32Array) -> AudioStreamWAV:
	var data := PackedByteArray()
	data.resize(mix.size() * 2)
	for i in mix.size():
		data.encode_s16(i * 2, clampi(int(tanh(mix[i]) * 30000.0), -32768, 32767))
	var s := AudioStreamWAV.new()
	s.format = AudioStreamWAV.FORMAT_16_BITS
	s.mix_rate = RATE
	s.stereo = false
	s.data = data
	return s


## mix에 buf를 at초 위치로 더한다. 끝을 넘는 꼬리는 루프 시작으로 되감아 자연스럽게 이어 붙인다.
static func _add(mix: PackedFloat32Array, buf: PackedFloat32Array, at: float, n: int, loop_begin: int) -> void:
	var start := int(at * RATE)
	for i in buf.size():
		var idx := start + i
		if idx >= n:
			if loop_begin <= 0:
				return
			idx = loop_begin + (idx - n)
			if idx >= n:
				return
		mix[idx] += buf[i]


## 음 하나를 렌더링(캐시). type: sine|triangle|square|saw|kick|snare|hat
static func _note(type: String, freq: float, dur: float, vol: float, slide_to: float = 0.0) -> PackedFloat32Array:
	var key := "%s:%.2f:%.3f:%.3f:%.2f" % [type, freq, dur, vol, slide_to]
	if _notes.has(key):
		return _notes[key]
	var len := int((dur + 0.02) * RATE)
	var out := PackedFloat32Array()
	out.resize(len)
	_rng.seed = 12345
	var phase := 0.0
	var prev_noise := 0.0
	var lp := 0.0
	for i in len:
		var t := float(i) / RATE
		var env := minf(t / 0.004, 1.0) * exp(-5.0 * t / maxf(dur, 0.001))
		var f := freq
		if slide_to > 0.0:
			f = freq * pow(slide_to / freq, minf(t / dur, 1.0))
		phase += f / RATE
		var ph: float = phase - floor(phase)
		var v := 0.0
		match type:
			"sine", "kick":
				v = sin(TAU * phase)
			"triangle":
				v = 4.0 * absf(ph - 0.5) - 1.0
			"square":
				v = 1.0 if ph < 0.5 else -1.0
			"saw":
				v = 2.0 * ph - 1.0
			"hat":
				var nz := _rng.randf() * 2.0 - 1.0
				v = nz - prev_noise            # 간이 하이패스
				prev_noise = nz
			"snare":
				var nz := _rng.randf() * 2.0 - 1.0
				lp += (nz - lp) * 0.45         # 간이 밴드(고역 일부)
				v = lp
		out[i] = v * env * vol
	_notes[key] = out
	return out

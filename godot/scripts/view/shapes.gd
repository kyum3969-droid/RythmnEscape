class_name Shapes
extends RefCounted
## 코드로 만드는 모양들. 모두 부드러운 법선을 가지므로 외곽선(뒤집힌 껍질)에 틈이 생기지 않는다.

static var _cache := {}


## 슈퍼엘립소이드: e=1 타원체, e가 작을수록 둥근 상자. 정점마다 해석적 법선을 쓴다.
## e1: 위아래(위도) 모양, e2: 가로(경도) 모양.
static func squircle(size: Vector3, e1: float = 0.45, e2: float = 0.45, lat: int = 12, lon: int = 20) -> ArrayMesh:
	var key := "sq:%s:%.2f:%.2f:%d:%d" % [str(size), e1, e2, lat, lon]
	if _cache.has(key):
		return _cache[key]
	var a := size.x * 0.5
	var b := size.y * 0.5
	var c := size.z * 0.5
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	for i in lat + 1:
		var v := -PI * 0.5 + PI * float(i) / lat
		for j in lon + 1:
			var u := TAU * float(j) / lon
			var cv := _spow(cos(v), e1)
			var sv := _spow(sin(v), e1)
			var cu := _spow(cos(u), e2)
			var su := _spow(sin(u), e2)
			verts.append(Vector3(a * cv * cu, b * sv, c * cv * su))
			var ncv := _spow(cos(v), 2.0 - e1)
			var nsv := _spow(sin(v), 2.0 - e1)
			var ncu := _spow(cos(u), 2.0 - e2)
			var nsu := _spow(sin(u), 2.0 - e2)
			var n := Vector3(ncv * ncu / a, nsv / b, ncv * nsu / c)
			norms.append(n.normalized() if n.length() > 0.00001 else Vector3.UP)
	var idx := PackedInt32Array()
	for i in lat:
		for j in lon:
			var i0 := i * (lon + 1) + j
			var i1 := i0 + 1
			var i2 := i0 + lon + 1
			var i3 := i2 + 1
			_tri(idx, verts, norms, i0, i2, i1)
			_tri(idx, verts, norms, i1, i2, i3)
	var mesh := _finish(verts, norms, idx)
	_cache[key] = mesh
	return mesh


## 원뿔(가시/화살표용). 밑면은 생략(몸통 안에 묻힘). 법선은 옆면과 위쪽의 평균.
static func cone(radius: float, height: float, seg: int = 8) -> ArrayMesh:
	var key := "cone:%.3f:%.3f:%d" % [radius, height, seg]
	if _cache.has(key):
		return _cache[key]
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	verts.append(Vector3(0, height, 0))       # 꼭짓점
	norms.append(Vector3.UP)
	for j in seg:
		var u := TAU * float(j) / seg
		var r := Vector3(cos(u), 0, sin(u))
		verts.append(r * radius)
		norms.append((r * height + Vector3.UP * radius * 0.6).normalized())
	var base_center := verts.size()
	verts.append(Vector3.ZERO)
	norms.append(Vector3.DOWN)
	var idx := PackedInt32Array()
	for j in seg:
		var a := 1 + j
		var b := 1 + (j + 1) % seg
		_tri(idx, verts, norms, 0, a, b)
		_tri(idx, verts, norms, base_center, b, a)
	var mesh := _finish(verts, norms, idx)
	_cache[key] = mesh
	return mesh


static func _spow(x: float, e: float) -> float:
	return signf(x) * pow(absf(x), e)


## 삼각형이 바깥(법선) 쪽에서 볼 때 시계방향이 되도록 감는다(Godot 앞면 규칙).
static func _tri(idx: PackedInt32Array, verts: PackedVector3Array, norms: PackedVector3Array, a: int, b: int, c: int) -> void:
	var face := (verts[b] - verts[a]).cross(verts[c] - verts[a])
	if face.length_squared() < 1e-12:
		return   # 극점의 찌그러진 삼각형
	var n := norms[a] + norms[b] + norms[c]
	if face.dot(n) > 0.0:      # 반시계 → 시계로 뒤집기
		idx.append(a)
		idx.append(c)
		idx.append(b)
	else:
		idx.append(a)
		idx.append(b)
		idx.append(c)


static func _finish(verts: PackedVector3Array, norms: PackedVector3Array, idx: PackedInt32Array) -> ArrayMesh:
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = norms
	arrays[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh

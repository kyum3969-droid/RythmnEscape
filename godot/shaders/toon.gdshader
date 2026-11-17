shader_type spatial;
render_mode specular_disabled;
// 4단계 밝기 띠 + 살짝 스스로 빛나는 색(그늘도 칙칙하지 않게). 인스턴스 색(COLOR)을 곱한다.

uniform vec4 albedo : source_color = vec4(1.0);
uniform float glow = 0.12;

void fragment() {
	vec3 c = albedo.rgb * COLOR.rgb;
	ALBEDO = c;
	EMISSION = c * glow;
}

void light() {
	float nl = clamp(dot(NORMAL, LIGHT) * 0.5 + 0.5, 0.0, 0.999);
	float band = floor(nl * 4.0);
	float ramp = 0.44 + band * 0.17;              // 0.44 / 0.61 / 0.78 / 0.95
	DIFFUSE_LIGHT += ramp * ATTENUATION * LIGHT_COLOR / PI;
}

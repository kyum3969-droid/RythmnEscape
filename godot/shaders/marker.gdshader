shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled;
// 타일 위에 얹는 둥근 사각 표시. 안쪽 채움 + 테두리(점선 선택).

uniform vec4 color : source_color = vec4(1.0, 0.82, 0.25, 1.0);
uniform float fill = 0.2;
uniform float border = 1.0;
uniform float dashed = 0.0;
uniform float pulse = 0.0;
uniform float half_size = 0.84;

float rbox(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float d = rbox(p, vec2(half_size), 0.24);
	float inside = 1.0 - smoothstep(-0.03, 0.0, d);
	float ring = smoothstep(-0.2, -0.16, d) * (1.0 - smoothstep(-0.03, 0.0, d));
	float a = atan(p.y, p.x);
	float dash = mix(1.0, step(0.0, sin(a * 12.0)), dashed);
	float alpha = max(inside * fill, ring * border * dash) * (0.65 + 0.35 * pulse);
	ALBEDO = color.rgb;
	ALPHA = alpha * color.a;
}

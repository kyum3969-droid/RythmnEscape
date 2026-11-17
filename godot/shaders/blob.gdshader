shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled;
// 캐릭터 발밑의 둥근 그림자(싼 가짜 그림자)

uniform float strength = 0.38;

void fragment() {
	float d = length(UV * 2.0 - 1.0);
	ALBEDO = vec3(0.0);
	ALPHA = (1.0 - smoothstep(0.55, 1.0, d)) * strength;
}

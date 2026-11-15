shader_type spatial;
render_mode cull_front, unshaded;
// 뒤집힌 껍질(inverted hull) 외곽선: 법선 방향으로 부풀린 뒷면을 잉크색으로 칠한다.

uniform vec4 outline_color : source_color = vec4(0.106, 0.114, 0.141, 1.0);
uniform float width = 0.024;

void vertex() {
	VERTEX += NORMAL * width;
}

void fragment() {
	ALBEDO = outline_color.rgb;
}

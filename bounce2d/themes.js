// 월드 테마: 라운드를 일곱 개의 월드로 묶고, 월드마다 그림을 따로 한다(의견: "각 테마(음악)별로 아트디자인을 분리하고 싶다", "월드로 묶고, 일단 코드로 그려 봐").
// 판정과는 상관없는 그림뿐이다. 바뀌는 것:
//   sky     하늘의 장식(별, 구름, 주사선, 성운 …)          sun     박자 고리의 가운데(해, 픽셀 해, 달, 행성, 물 위의 빛 …)
//   far     먼 풍경 두 겹(뒤 겹, 앞 겹)                   ground  땅·천장·벽의 결(타일 무늬)         edge  땅 윗선 바로 밑의 장식
//   grain   빨간 덩어리 안쪽의 결(윤곽과 색은 그대로)       ambient 평소에 깔리는 날씨(피버에서는 피버 연출로 바뀐다)
//   trail   공이 지나가며 남기는 입자                      fever   피버 연출(바탕 둘을 번갈아, 벽 속 장식)
//   box     파란 박스의 재질(얼음 …)                       red     빨간 덩어리·프레스 머리의 바탕색(용암석 …). 분홍 빛 테두리는 모든 월드 공통(= 닿으면 죽는다)
// 지키는 것:
//   - 색 약속: 빨강은 죽음, 파랑은 안전. 풍경·날씨·꼬리에는 빨강·분홍을 쓰지 않는다(빨간 덩어리의 결만 빨강 계열).
//   - 통로 안에는 아무것도 더 그리지 않는다: 풍경과 날씨는 땅·장애물보다 먼저(뒤에) 그린다. 꼬리 입자는 작고 금방 사라진다.
//   - 가볍게: 번짐(shadowBlur)을 쓰지 않는다. 땅의 결은 미리 그려 둔 타일을 무늬로 깐다.
// 각 그리기 함수는 e(그리는 데 필요한 것 묶음)를 받는다:
//   e.g 캔버스, e.w·e.h 화면, e.BT 한 칸(확대 전), e.T 한 칸(지금 배율), e.gy 땅 윗면의 화면 y, e.beat·e.now·e.pulse 박자·시각·박마다 1→0,
//   e.pal 지금 구간의 색({top, bottom, accent, sun}, [r,g,b]), e.camS 카메라 x(칸), e.camY 카메라가 올라간 높이(칸), e.cx·e.cy·e.r0 해의 자리와 크기, e.skyGrad 하늘 그라데이션
(function (root) {
  "use strict";
  const TAU = Math.PI * 2, WHITE = [255, 255, 255], BLACK = [0, 0, 0];
  const H = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
  const vn = (u, s) => { const i = Math.floor(u), f = u - i, t = f * f * (3 - 2 * f); return H(i, s) * (1 - t) + H(i + 1, s) * t; };   // 부드러운 잡음 0~1
  const tri = (u) => { const f = u - Math.floor(u); return 1 - Math.abs(2 * f - 1); };                                           // 뾰족한 물결 0~1
  const pm = (a, n) => ((a % n) + n) % n;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a))})`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ================================================================ 월드
  // color: 라운드 고르기 화면에서 버튼 옆 줄의 색
  const WORLDS = {
    neon:     { name: "네온 하이웨이", color: "#7df9ff", sky: "neon",  sun: "synth",   far: ["neonPeaks", "skyline"],  ground: "asphalt", edge: "lane",   grain: "scan",    ambient: null,     trail: "spark", box: "plain", red: "plain" },
    digital:  { name: "디지털 그리드", color: "#5cf2ff", sky: "scan",  sun: "pixel",   far: ["eq", "circuitCity"],     ground: "circuit", edge: "bits",   grain: "pixel",   ambient: null,     trail: "pixel", box: "plain", red: "plain" },
    works:    { name: "강철 공장",     color: "#ffd23f", sky: "smog",  sun: "smog",    far: ["chimneys", "works"],     ground: "plate",   edge: "hazard", grain: "stripes", ambient: "dust",   trail: "ember", box: "plain", red: "plain" },
    peaks:    { name: "새벽 산맥",     color: "#cfe6ff", sky: "dawn",  sun: "radiant", far: ["peaks", "pines"],        ground: "rockface", edge: "snowcap", grain: "magma", ambient: "motes",  trail: "mote", box: "ice", red: "magma" },
    ruins:    { name: "잃어버린 유적", color: "#d6f07a", sky: "birds", sun: "radiant", far: ["ziggurat", "canopy"],    ground: "stone",   edge: "moss",   grain: "cracks",  ambient: "leaves", trail: "leaf", box: "plain", red: "plain" },
    abyss:    { name: "깊은 곳",       color: "#8fd8ff", sky: "space", sun: "planet",  far: ["asteroids", "moonscape"], ground: "pores",  edge: "glow",   grain: "cells",   ambient: "motes",  trail: "stardust", box: "plain", red: "plain" },
    festival: { name: "꿈의 축제",     color: "#ffd27a", sky: "dream", sun: "moon",    far: ["pagoda", "roofs"],       ground: "tiles",   edge: "stitch", grain: "diamond", ambient: null,     trail: "glitter", box: "plain", red: "plain" },
  };

  // ================================================================ 라운드 → 월드 (+ 라운드마다 바꾸는 것)
  // fever: 피버 연출(라운드의 곡과 주제에 맞춘 바탕 둘을 피버마다 번갈아, 벽 속 장식).
  //   바탕: tunnel 빛의 굴 / ring 소리 고리 / stars 빛줄기 / road 달리는 길 / code 디지털 비 / confetti 꽃종이 / rays 햇살 / grid 지평선 격자 / lamps 가로등 / bubbles 방울 / embers 불티
  //         rain 빗줄기 / gears 톱니바퀴 / ribbons 비단 띠 / snow 눈 / leaves 나뭇잎 / planets 행성 / haze 아지랑이 / lanterns 등불
  //   벽: eq 막대 / wave 물결 / dots 점 격자
  const ROUND_THEME = [
    { world: "neon",     fever: { back: ["road", "stars"], wall: "eq" } },                                         // 1 Octane Horizon: 달리는 길
    { world: "digital",  ambient: "code", fever: { back: ["code", "grid"], wall: "dots" } },                       // 2 Terminal Pursuit: 화면 속 추격
    { world: "digital",  fever: { back: ["confetti", "ring"], wall: "eq" } },                                      // 3 Final Quarter Credit: 오락실
    { world: "peaks",    fever: { back: ["rays", "haze"], wall: "wave" } },                                        // 4 Miles Before Sunrise: 해 뜨기 전
    { world: "works",    far: ["skyline", "works"], ambient: null, fever: { back: ["grid", "ring"], wall: "dots" } }, // 5 Concrete Pulse: 도시의 맥박
    { world: "neon",     fever: { back: ["lamps", "road"], wall: "eq" } },                                         // 6 Streetlight Velocity: 가로등
    { world: "festival", far: ["toys", "blocks"], sun: "moon", fever: { back: ["confetti", "bubbles"], wall: "dots" } }, // 7 Sunday in the Playroom: 놀이방
    { world: "peaks",    fever: { back: ["rays", "embers"], wall: "wave" } },                                      // 8 Velocity of a Thousand Suns: 천 개의 해
    { world: "neon",     ambient: "rain", fever: { back: ["rain", "road"], wall: "eq" } },                         // 9 Midnight Asphalt Rush: 한밤의 젖은 도로
    { world: "works",    ambient: "embers", fever: { back: ["gears", "embers"], wall: "dots" } },                  // 10 Anvil and Piston: 공장의 불꽃
    { world: "festival", far: ["pagoda", "silkHills"], fever: { back: ["ribbons", "tunnel"], wall: "wave" } },     // 11 Velocity of Silk: 비단
    { world: "peaks",    ambient: "snow", fever: { back: ["snow", "rays"], wall: "wave" } },                       // 12 Across the Iron Peak: 눈 덮인 봉우리
    { world: "digital",  fever: { back: ["stars", "tunnel"], wall: "eq" } },                                       // 13 Final Level Sprint: 결승선을 향해
    { world: "ruins",    fever: { back: ["leaves", "rays"], wall: "wave" } },                                      // 14 Temple Canopy Pursuit: 정글 신전
    { world: "abyss",    fever: { back: ["planets", "stars"], wall: "dots" } },                                    // 15 Orbital Momentum: 우주
    { world: "ruins",    far: ["mesa", "dunes"], ambient: "haze", trail: "ember", fever: { back: ["haze", "embers"], wall: "eq" } }, // 16 Searing Horizon: 사막
    { world: "abyss",    sky: "water", sun: "surface", far: ["spires", "reef"], ambient: "marine", trail: "bubble", fever: { back: ["bubbles", "rays"], wall: "wave" } }, // 17 Coral Cathedral: 바다 밑 성당
    { world: "festival", ambient: "lanterns", fever: { back: ["lanterns", "embers"], wall: "dots" } },             // 18 The Midnight Procession: 한밤의 행렬
  ];
  const KEYS = ["sky", "sun", "far", "ground", "edge", "grain", "ambient", "trail", "box", "red"];
  // 평소의 날씨의 세기(피버 연출 그림을 빌려 쓰는 것은 피버보다 훨씬 옅게). 여기 없으면 0.42
  const AMBIENT_A = { code: 0.15, leaves: 0.26, lanterns: 0.3, rain: 0.55, snow: 0.5, haze: 0.55, embers: 0.45 };
  // 라운드의 테마. world를 주면(개발자 모드의 월드 미리 보기) 그 월드의 기본 그림으로 바꾼다(피버 연출은 라운드 것 그대로).
  function themeFor(roundNo, world) {
    const r = ROUND_THEME[roundNo] || ROUND_THEME[0], id = world && WORLDS[world] ? world : r.world, base = WORLDS[id], t = { world: id, name: base.name, color: base.color };
    for (const k of KEYS) t[k] = !world && k in r ? r[k] : base[k];
    t.fever = r.fever;
    t.ambientA = AMBIENT_A[t.ambient] ?? 0.42;
    return t;
  }

  // ================================================================ 공통 도구
  function halo(e, x, y, r1, r2, c, a) {
    const g = e.g, gr = g.createRadialGradient(x, y, r1, x, y, r2);
    gr.addColorStop(0, rgba(c, a)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r2, 0, TAU); g.fill();
  }
  // 박마다 퍼지는 고리(원래의 것)
  function beatRings(e, a = 0.5, c = e.pal.sun) {
    const g = e.g; g.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const p = pm(e.beat + i * 0.5, 1.5) / 1.5;
      g.strokeStyle = rgba(c, (1 - p) * a);
      g.beginPath(); g.arc(e.cx, e.cy, e.r0 * (1.1 + p * 2.6), 0, TAU); g.stroke();
    }
  }
  const base = (e, sp) => e.gy + sp.drop;
  // 먼 풍경을 칸(bw*k 픽셀)마다 나눠 그린다. i는 풍경에 붙은 번호라 화면이 흘러도 같은 칸은 같은 모양이다
  function cells(e, sp, k, fn) { const bw = sp.bw * k; for (let i = Math.floor(sp.off / bw) - 1; i * bw - sp.off < e.w + bw; i++) fn(i, i * bw - sp.off, bw); }
  // 능선: f(u) = 높이(픽셀), u = 풍경 위의 자리(칸)
  function ridgePath(e, sp, f, step = 8) {
    const g = e.g, yb = base(e, sp);
    g.beginPath(); g.moveTo(-20, e.h + 80);
    for (let x = -20; x <= e.w + 28; x += step) g.lineTo(x, yb - f((x + sp.off) / e.BT));
    g.lineTo(e.w + 28, e.h + 80); g.closePath();
  }
  function ridgeLine(e, sp, f, step = 8) {
    const g = e.g, yb = base(e, sp);
    g.beginPath();
    for (let x = -20; x <= e.w + 28; x += step) { const y = yb - f((x + sp.off) / e.BT); if (x === -20) g.moveTo(x, y); else g.lineTo(x, y); }
  }
  // 처마가 위로 휜 지붕(탑·집)
  function roofPath(g, cx, y, hw, hr) {
    g.moveTo(cx - hw * 1.25, y - hr * 0.42);
    g.quadraticCurveTo(cx - hw * 0.95, y + hr * 0.05, cx - hw * 0.7, y);
    g.lineTo(cx + hw * 0.7, y);
    g.quadraticCurveTo(cx + hw * 0.95, y + hr * 0.05, cx + hw * 1.25, y - hr * 0.42);
    g.lineTo(cx + hw * 0.42, y - hr); g.lineTo(cx - hw * 0.42, y - hr); g.closePath();
  }

  // ================================================================ 하늘의 장식
  function stars(e, n, reach, sz = 1) {
    const g = e.g, yMax = e.gy * reach, W2 = e.w + 40, par = e.camS * e.BT * 0.02;
    for (let i = 0; i < n; i++) {
      const x = pm(H(i, 11) * W2 * 3 - par, W2) - 20, y = H(i, 12) * yMax + e.camY * e.BT * 0.03, s = (0.8 + 1.6 * H(i, 13) * H(i, 13)) * sz;
      let a = 0.3 + 0.45 * H(i, 14) + 0.2 * Math.sin(e.now * (0.8 + 2 * H(i, 15)) + i);
      if (H(i, 16) > 0.88) a += 0.5 * e.pulse;
      g.fillStyle = rgba(H(i, 17) > 0.75 ? mix(WHITE, e.pal.accent, 0.5) : WHITE, a * (1 - 0.6 * y / Math.max(1, yMax)));
      g.fillRect(x, y, s, s);
    }
  }
  function horizonGlow(e, c, a, hgt = 2.6) {
    const g = e.g, y0 = e.gy - e.BT * hgt + e.camY * e.BT * 0.1, gr = g.createLinearGradient(0, y0, 0, e.gy + e.camY * e.BT * 0.1);
    gr.addColorStop(0, rgba(c, 0)); gr.addColorStop(1, rgba(c, a));
    g.fillStyle = gr; g.fillRect(0, y0, e.w, e.BT * hgt + 2);
  }
  function clouds(e, n, a) {
    const g = e.g, span = e.w + 500;
    for (let i = 0; i < n; i++) {
      const s = e.BT * (1.0 + 1.5 * H(i, 22)), x = pm(H(i, 21) * span * 3 - e.now * 5 * (0.5 + H(i, 23)) - e.camS * e.BT * (0.03 + 0.03 * H(i, 24)), span) - 250;
      const y = e.gy * (0.1 + 0.42 * H(i, 25)) + e.camY * e.BT * 0.04;
      const body = mix(e.pal.top, e.pal.sun, 0.18 + 0.2 * H(i, 26)), lit = mix(e.pal.sun, WHITE, 0.4);
      g.fillStyle = rgba(body, a * 0.55);
      g.beginPath();
      for (let k = 0; k < 5; k++) { const ox = (k - 2) * s * 0.55, oy = -Math.sin((k / 4) * Math.PI) * s * 0.28 * (0.6 + H(i * 5 + k, 27)); g.ellipse(x + ox, y + oy, s * (0.55 + 0.25 * H(i * 5 + k, 28)), s * 0.3, 0, 0, TAU); }
      g.fill();
      g.fillStyle = rgba(lit, a * 0.16);
      g.beginPath(); g.ellipse(x - s * 0.1, y - s * 0.22, s * 0.9, s * 0.16, 0, 0, TAU); g.fill();
    }
  }
  const SKY = {
    none() {},
    neon(e) { stars(e, 70, 0.7); horizonGlow(e, e.pal.accent, 0.16 + 0.08 * e.pulse); },
    scan(e) {      // 디지털: 칸에 붙은 픽셀 별(박마다 일부가 깜빡), 주사선, 천천히 내려가는 밝은 띠
      const g = e.g, q = 4;
      for (let i = 0; i < 70; i++) {
        const x = Math.round((pm(H(i, 31) * (e.w + 40) * 3 - e.camS * e.BT * 0.02, e.w + 40) - 20) / q) * q, y = Math.round(H(i, 32) * e.gy * 0.75 / q) * q;
        const on = H(i, 33) > 0.3 || H(i, Math.floor(e.beat)) > 0.5;
        if (!on) continue;
        g.fillStyle = rgba(H(i, 34) > 0.6 ? e.pal.accent : WHITE, 0.25 + 0.4 * H(i, 35)); g.fillRect(x, y, H(i, 36) > 0.8 ? q : q / 2, H(i, 36) > 0.8 ? q : q / 2);
      }
      const yb = pm(e.now * 0.12, 1.3) * e.h - e.h * 0.15, gr = g.createLinearGradient(0, yb, 0, yb + e.h * 0.15);
      gr.addColorStop(0, rgba(e.pal.accent, 0)); gr.addColorStop(0.5, rgba(e.pal.accent, 0.05)); gr.addColorStop(1, rgba(e.pal.accent, 0));
      g.fillStyle = gr; g.fillRect(0, yb, e.w, e.h * 0.15);
      g.fillStyle = "rgba(0,0,0,0.14)";
      for (let y = 0; y < e.h; y += 4) g.fillRect(0, y, e.w, 1.5);
      horizonGlow(e, e.pal.accent, 0.1);
    },
    smog(e) {      // 공장: 옅은 별 몇 개, 천천히 흐르는 매연의 띠
      const g = e.g; stars(e, 22, 0.35);
      const c = mix(e.pal.bottom, e.pal.sun, 0.3);
      for (let i = 0; i < 9; i++) {
        const span = e.w + 600, x = pm(H(i, 41) * span * 2 - e.now * 8 * (0.4 + H(i, 42)) - e.camS * e.BT * 0.035, span) - 300, y = e.gy * (0.3 + 0.55 * H(i, 43));
        g.fillStyle = rgba(c, 0.07 + 0.05 * H(i, 44)); g.beginPath(); g.ellipse(x, y, e.w * (0.2 + 0.2 * H(i, 45)), e.BT * (0.3 + 0.35 * H(i, 46)), 0, 0, TAU); g.fill();
      }
      horizonGlow(e, e.pal.sun, 0.12);
    },
    dawn(e) { stars(e, 30, 0.35); clouds(e, 7, 0.9); horizonGlow(e, e.pal.sun, 0.14); },
    birds(e) {     // 유적: 구름, 멀리 나는 새 떼(날갯짓)
      const g = e.g; clouds(e, 5, 0.6); horizonGlow(e, e.pal.sun, 0.12);
      g.strokeStyle = rgba(mix(e.pal.top, BLACK, 0.35), 0.7); g.lineWidth = 1.6; g.lineCap = "round"; g.beginPath();
      for (let i = 0; i < 7; i++) {
        const span = e.w + 200, x = pm(H(i, 51) * span + e.now * 22 * (0.7 + 0.5 * H(i, 52)) - e.camS * e.BT * 0.05, span) - 100, y = e.gy * (0.16 + 0.3 * H(i, 53)) + Math.sin(e.now * 0.7 + i) * 6;
        const s = e.BT * (0.14 + 0.1 * H(i, 54)), f = Math.sin(e.now * 7 + i * 2) * 0.6;
        g.moveTo(x - s, y - s * (0.2 + f)); g.quadraticCurveTo(x - s * 0.4, y - s * 0.1, x, y); g.quadraticCurveTo(x + s * 0.4, y - s * 0.1, x + s, y - s * (0.2 + f));
      }
      g.stroke(); g.lineCap = "butt";
    },
    space(e) {     // 우주: 성운(색 번짐 셋), 촘촘한 별
      const g = e.g;
      for (let i = 0; i < 3; i++) {
        const x = pm(H(i, 61) * e.w * 2 - e.camS * e.BT * 0.015, e.w + 400) - 200, y = e.gy * (0.15 + 0.45 * H(i, 62)), r = e.w * (0.18 + 0.12 * H(i, 63));
        halo(e, x, y, 0, r, mix(e.pal.bottom, i % 2 ? e.pal.accent : e.pal.sun, 0.45), 0.16);
      }
      stars(e, 130, 0.9);
    },
    water(e) {     // 바다 밑: 물결무늬 빛(수면 근처), 아래로 갈수록 짙어진다
      const g = e.g; g.lineWidth = 1.5;
      for (let j = 0; j < 7; j++) {
        const y0 = e.h * 0.02 + j * e.h * 0.045;
        g.strokeStyle = rgba(mix(e.pal.sun, WHITE, 0.4), 0.1 * (1 - j / 7)); g.beginPath();
        for (let x = -10; x <= e.w + 10; x += 10) { const y = y0 + Math.sin(x * 0.02 + e.now * 1.4 + j * 1.7) * 4 + Math.sin(x * 0.051 - e.now * 0.9 + j) * 3; if (x === -10) g.moveTo(x, y); else g.lineTo(x, y); }
        g.stroke();
      }
    },
    dream(e) {     // 꿈: 별, 천천히 떠오르는 흐릿한 빛망울
      const g = e.g; stars(e, 60, 0.65);
      for (let i = 0; i < 14; i++) {
        const span = e.w + 120, x = pm(H(i, 71) * span * 2 - e.camS * e.BT * (0.03 + 0.04 * H(i, 72)), span) - 60, y = pm(H(i, 73) * e.gy - e.now * 6 * (0.3 + H(i, 74)), e.gy + 60) - 30;
        const r = e.BT * (0.12 + 0.26 * H(i, 75)), c = mix(i % 2 ? e.pal.accent : e.pal.sun, WHITE, 0.3), a = 0.05 + 0.07 * H(i, 76) + (H(i, 77) > 0.7 ? 0.1 * e.pulse : 0);
        g.fillStyle = rgba(c, a); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        g.fillStyle = rgba(c, a * 1.4); g.beginPath(); g.arc(x, y, r * 0.55, 0, TAU); g.fill();
      }
    },
  };

  // ================================================================ 해(박자 고리의 가운데. 피버 연출의 소실점이기도 하다)
  const SUN = {
    disc(e) {      // 원래의 것: 둥근 해와 고리
      const g = e.g;
      g.fillStyle = rgba(e.pal.sun, 0.9); g.beginPath(); g.arc(e.cx, e.cy, e.r0 * (1 + 0.07 * e.pulse), 0, TAU); g.fill();
      beatRings(e);
    },
    synth(e) {     // 네온: 아래쪽에 가로 틈이 있는 해. 틈은 박마다 한 줄씩 아래로 흘러내린다
      const g = e.g, r = e.r0 * 1.3 * (1 + 0.05 * e.pulse);
      halo(e, e.cx, e.cy, r * 0.9, r * 2.3, e.pal.sun, 0.3 + 0.1 * e.pulse);
      beatRings(e, 0.35);
      const gr = g.createLinearGradient(0, e.cy - r, 0, e.cy + r);
      gr.addColorStop(0, rgba(mix(e.pal.sun, [255, 236, 160], 0.65))); gr.addColorStop(0.55, rgba(mix(e.pal.sun, [255, 236, 160], 0.2))); gr.addColorStop(1, rgba(e.pal.sun));
      g.save(); g.beginPath(); g.arc(e.cx, e.cy, r, 0, TAU); g.fillStyle = gr; g.fill(); g.clip();
      g.fillStyle = e.skyGrad || rgba(e.pal.bottom);
      const ph = pm(e.beat, 1);
      for (let k = 0; k < 7; k++) { const t = (k + ph) / 7, y = e.cy - r * 0.02 + t * r * 1.05; g.fillRect(e.cx - r - 2, y, 2 * r + 4, r * (0.015 + t * 0.1)); }
      g.restore();
    },
    pixel(e) {     // 디지털: 픽셀로 찍은 해, 네모난 고리. 아래쪽 줄은 박마다 한 줄씩 꺼졌다 켜진다
      const g = e.g, q = Math.max(3, Math.round(e.r0 / 4.5)), R = e.r0 * 1.1 * (1 + 0.06 * e.pulse), cx = Math.round(e.cx / q) * q, cy = Math.round(e.cy / q) * q, n = Math.ceil(R / q) + 1;
      halo(e, cx, cy, R * 0.8, R * 2.2, e.pal.sun, 0.22);
      g.lineWidth = Math.max(2, q * 0.45);
      for (let i = 0; i < 3; i++) { const p = pm(e.beat + i * 0.5, 1.5) / 1.5, s = Math.round(R * (1.2 + p * 2.3) / q) * q; g.strokeStyle = rgba(e.pal.sun, (1 - p) * 0.45); g.strokeRect(cx - s, cy - s, 2 * s, 2 * s); }
      const off = Math.floor(e.beat * 2);
      for (let yy = -n; yy < n; yy++) for (let xx = -n; xx < n; xx++) {
        if (Math.hypot(xx + 0.5, yy + 0.5) * q > R) continue;
        if (yy > 0 && pm(yy - off, 3) === 0) continue;
        g.fillStyle = rgba(mix(e.pal.sun, WHITE, yy < 0 ? 0.45 * (-yy / n) : 0), 0.95);
        g.fillRect(cx + xx * q, cy + yy * q, q - 1, q - 1);
      }
    },
    smog(e) {      // 공장: 매연에 가린 흐린 해
      const g = e.g, r = e.r0 * 1.15;
      halo(e, e.cx, e.cy, r * 0.7, r * 2.6, e.pal.sun, 0.22 + 0.08 * e.pulse);
      beatRings(e, 0.22);
      g.fillStyle = rgba(mix(e.pal.sun, e.pal.bottom, 0.15), 0.85); g.beginPath(); g.arc(e.cx, e.cy, r * (1 + 0.04 * e.pulse), 0, TAU); g.fill();
      const c = mix(e.pal.bottom, e.pal.top, 0.4);
      for (let j = 0; j < 3; j++) {
        const x = e.cx + Math.sin(e.now * 0.25 + j * 2.1) * r * 0.6, y = e.cy - r * 0.45 + j * r * 0.48;
        g.fillStyle = rgba(c, 0.38); g.beginPath(); g.ellipse(x, y, r * 1.7, r * 0.12 + j * r * 0.03, 0, 0, TAU); g.fill();
      }
    },
    radiant(e) {   // 산·유적: 빛살이 천천히 도는 눈부신 해(박마다 빛살이 길어진다)
      const g = e.g, r = e.r0 * 1.05 * (1 + 0.06 * e.pulse);
      halo(e, e.cx, e.cy, r * 0.6, r * 4.0, e.pal.sun, 0.24 + 0.1 * e.pulse);
      g.fillStyle = rgba(e.pal.sun, 0.1 + 0.08 * e.pulse); g.beginPath();
      for (let i = 0; i < 14; i++) {
        const th = (i / 14) * TAU + e.now * 0.05, L = r * (1.9 + 0.8 * H(i, 81) + 0.6 * e.pulse), wd = 0.075;
        g.moveTo(e.cx + Math.cos(th - wd) * r * 1.05, e.cy + Math.sin(th - wd) * r * 1.05); g.lineTo(e.cx + Math.cos(th) * L, e.cy + Math.sin(th) * L); g.lineTo(e.cx + Math.cos(th + wd) * r * 1.05, e.cy + Math.sin(th + wd) * r * 1.05);
      }
      g.fill();
      beatRings(e, 0.28);
      const gr = g.createRadialGradient(e.cx, e.cy, 0, e.cx, e.cy, r);
      gr.addColorStop(0, rgba(mix(e.pal.sun, WHITE, 0.5))); gr.addColorStop(0.6, rgba(e.pal.sun)); gr.addColorStop(1, rgba(mix(e.pal.sun, e.pal.accent, 0.25)));
      g.fillStyle = gr; g.beginPath(); g.arc(e.cx, e.cy, r, 0, TAU); g.fill();
    },
    moon(e) {      // 축제: 초승달(구름 사이로), 은은한 달무리
      const g = e.g, r = e.r0 * 1.05, c = mix(e.pal.sun, WHITE, 0.45);
      halo(e, e.cx, e.cy, r * 0.7, r * 3.4, c, 0.2 + 0.08 * e.pulse);
      beatRings(e, 0.25, c);
      g.save(); g.beginPath(); g.rect(e.cx - r * 2, e.cy - r * 2, r * 4, r * 4); g.arc(e.cx + r * 0.5, e.cy - r * 0.28, r * 0.88, 0, TAU, true); g.clip("evenodd");
      g.fillStyle = rgba(c, 0.97); g.beginPath(); g.arc(e.cx, e.cy, r, 0, TAU); g.fill();
      g.fillStyle = rgba(mix(c, e.pal.top, 0.25), 0.5);
      for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(e.cx - r * (0.2 + 0.55 * H(i, 91)), e.cy + (H(i, 92) - 0.3) * r * 1.2, r * (0.07 + 0.09 * H(i, 93)), 0, TAU); g.fill(); }
      g.restore();
    },
    planet(e) {    // 우주: 고리 행성. 박마다 기운 고리가 퍼진다
      const g = e.g, r = e.r0 * 1.15, tilt = -0.32, ring = mix(e.pal.sun, WHITE, 0.3);
      halo(e, e.cx, e.cy, r * 0.9, r * 2.6, e.pal.accent, 0.16 + 0.06 * e.pulse);
      g.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const p = pm(e.beat + i * 0.5, 1.5) / 1.5; g.strokeStyle = rgba(ring, (1 - p) * 0.35); g.beginPath(); g.ellipse(e.cx, e.cy, r * (2.1 + p * 2.6), r * (0.5 + p * 0.6), tilt, 0, TAU); g.stroke(); }
      const band = (a0, a1) => { g.strokeStyle = rgba(ring, 0.75); g.lineWidth = r * 0.14; g.beginPath(); g.ellipse(e.cx, e.cy, r * 1.85, r * 0.44, tilt, a0, a1); g.stroke(); g.strokeStyle = rgba(ring, 0.3); g.lineWidth = r * 0.06; g.beginPath(); g.ellipse(e.cx, e.cy, r * 2.12, r * 0.52, tilt, a0, a1); g.stroke(); };
      band(Math.PI, TAU);
      g.save(); g.beginPath(); g.arc(e.cx, e.cy, r, 0, TAU); g.clip();
      g.fillStyle = rgba(mix(e.pal.sun, e.pal.accent, 0.35)); g.fillRect(e.cx - r, e.cy - r, 2 * r, 2 * r);
      for (let j = -5; j <= 5; j++) { g.fillStyle = rgba(j % 2 ? e.pal.accent : mix(e.pal.sun, WHITE, 0.3), 0.18); g.fillRect(e.cx - r, e.cy + j * r * 0.19 + Math.sin(e.now * 0.4 + j) * 2, 2 * r, r * 0.1 + 0.04 * r * H(j + 9, 94)); }
      const sh = g.createRadialGradient(e.cx - r * 0.35, e.cy - r * 0.35, r * 0.2, e.cx, e.cy, r * 1.05);
      sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,10,0.55)"); g.fillStyle = sh; g.fillRect(e.cx - r, e.cy - r, 2 * r, 2 * r);
      g.restore();
      band(0, Math.PI);
    },
    surface(e) {   // 바다 밑: 해가 없다. 수면의 빛 덩어리, 아래로 넓어지며 흔들리는 빛줄기, 박마다 수면에 퍼지는 물결
      const g = e.g, x0 = e.cx, ys = e.h * 0.02, c = mix(e.pal.sun, WHITE, 0.4);
      halo(e, x0, ys, e.r0 * 0.4, e.r0 * 3.4, c, 0.32 + 0.1 * e.pulse);
      for (let i = 0; i < 7; i++) {
        const x = x0 + (i - 3) * e.r0 * 0.95 + Math.sin(e.now * 0.45 + i * 1.3) * e.r0 * 0.4, sw = e.r0 * (0.22 + 0.22 * H(i, 101)), len = e.gy * 1.05, lean = (i - 3) * e.r0 * 0.55;
        const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, rgba(c, 0.16 + 0.07 * e.pulse)); gr.addColorStop(1, rgba(c, 0));
        g.fillStyle = gr; g.beginPath(); g.moveTo(x - sw * 0.4, 0); g.lineTo(x + sw * 0.4, 0); g.lineTo(x + lean + sw * 1.7, len); g.lineTo(x + lean - sw * 1.7, len); g.closePath(); g.fill();
      }
      g.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const p = pm(e.beat + i * 0.5, 1.5) / 1.5; g.strokeStyle = rgba(c, (1 - p) * 0.4); g.beginPath(); g.ellipse(x0, ys, e.r0 * (0.6 + p * 3.6), e.r0 * (0.12 + p * 0.55), 0, 0, TAU); g.stroke(); }
    },
  };

  // ================================================================ 먼 풍경 (두 겹. sp = { layer: 1 뒤 / 2 앞, off 흐른 양(픽셀), drop 내려앉은 양, col 실루엣 색, amp 높이 폭, bw 칸 너비(픽셀) })
  // 실루엣은 한 가지 색(col)으로 칠하고, 불빛·윤곽만 구간의 강조색으로 조금 얹는다. 박마다 들썩이는 것을 하나씩 둔다(창문, 연기, 꼭대기 불빛 …)
  const FAR = {
    eq(e, sp) {    // 원래의 것: 이퀄라이저 막대
      const g = e.g, yb = base(e, sp); g.fillStyle = rgba(sp.col);
      cells(e, sp, 1, (i, x, bw) => { const hh = (0.6 + sp.amp * H(i, sp.layer)) * e.BT * (1 + 0.22 * e.pulse * H(i, sp.layer + 9)); g.fillRect(x, yb - hh, bw - 3, hh + e.h); });
    },
    neonPeaks(e, sp) {      // 네온 산: 꼭짓점이 이어진 산줄기, 네온 윤곽, 속에 가로 등고선
      const g = e.g, yb = base(e, sp), step = sp.bw * 1.5, pts = [];
      for (let k = Math.floor(sp.off / step) - 1; k * step - sp.off < e.w + step * 2; k++) {
        const peak = pm(k, 2) === 0, hh = (peak ? 1.5 + sp.amp * 0.85 * H(k, sp.layer + 120) : 0.5 + 0.7 * H(k, sp.layer + 121)) * e.BT;
        pts.push([k * step - sp.off + (H(k, sp.layer + 122) - 0.5) * step * 0.5, yb - hh]);
      }
      g.beginPath(); g.moveTo(pts[0][0], e.h + 80); for (const p of pts) g.lineTo(p[0], p[1]); g.lineTo(pts[pts.length - 1][0], e.h + 80); g.closePath();
      g.fillStyle = rgba(sp.col); g.fill();
      g.save(); g.clip();
      g.strokeStyle = rgba(e.pal.accent, 0.1); g.lineWidth = 1; g.beginPath();
      for (let j = 1; j < 9; j++) { const y = yb - j * e.BT * 0.36; g.moveTo(0, y); g.lineTo(e.w, y); }
      for (const p of pts) { g.moveTo(p[0], p[1]); g.lineTo(p[0] + (p[0] - e.cx) * 0.25, yb + e.BT); }
      g.stroke(); g.restore();
      g.beginPath(); pts.forEach((p, j) => (j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.lineJoin = "round";
      g.strokeStyle = rgba(e.pal.accent, 0.1 + 0.08 * e.pulse); g.lineWidth = 6; g.stroke();
      g.strokeStyle = rgba(e.pal.accent, 0.5 + 0.3 * e.pulse); g.lineWidth = 1.5; g.stroke();
    },
    skyline(e, sp) {        // 도시: 빌딩, 계단식 옥상과 안테나, 앞 겹에는 불 켜진 창(몇 개는 박마다 깜빡)
      const g = e.g, yb = base(e, sp), BT = e.BT, near = sp.layer === 2, s = sp.layer * 7, win = mix(e.pal.sun, WHITE, 0.45);
      cells(e, sp, near ? 1.35 : 1.1, (i, x, bw) => {
        const wd = bw * (0.62 + 0.33 * H(i, s + 1)), hh = (1.3 + sp.amp * 1.05 * H(i, s + 2)) * BT * (near ? 1 : 1.15), x0 = x + (bw - wd) * H(i, s + 3), r = H(i, s + 4);
        g.fillStyle = rgba(sp.col); g.fillRect(x0, yb - hh, wd, hh + e.h);
        if (r > 0.6) g.fillRect(x0 + wd * 0.2, yb - hh - BT * 0.45, wd * 0.6, BT * 0.46);
        if (r > 0.82) { g.fillRect(x0 + wd * 0.5 - 1, yb - hh - BT * 1.5, 2, BT * 1.1); g.fillStyle = rgba(e.pal.accent, 0.35 + 0.65 * e.pulse); g.fillRect(x0 + wd * 0.5 - 2, yb - hh - BT * 1.55, 4, 4); }
        if (near) {
          const cw = Math.max(2.5, BT * 0.12), gx = BT * 0.3, gy = BT * 0.36, nc = Math.floor((wd - BT * 0.3) / gx), nr = Math.floor((hh - BT * 0.5) / gy);
          for (let c = 0; c < nc; c++) for (let rr = 0; rr < nr; rr++) {
            const hk = H(i * 31 + c, rr + 7); if (hk < 0.64) continue;
            const blink = hk > 0.95 ? (H(i * 7 + c * 3 + rr, Math.floor(e.beat)) > 0.5 ? 1 : 0.15) : 1;
            g.fillStyle = rgba(win, (0.14 + 0.3 * (hk - 0.64) / 0.36) * blink);
            g.fillRect(x0 + BT * 0.18 + c * gx, yb - hh + BT * 0.32 + rr * gy, cw, cw * 1.35);
          }
        } else { g.fillStyle = rgba(e.pal.accent, 0.16 + 0.22 * e.pulse * H(i, s + 5)); g.fillRect(x0, yb - hh, wd, 1.5); }
      });
    },
    circuitCity(e, sp) {    // 디지털: 칸에 맞춘 계단식 탑, 픽셀 불빛(박마다 몇 개씩 바뀐다), 윗선
      const g = e.g, yb = base(e, sp), q = Math.max(4, Math.round(e.BT * 0.25)), s = sp.layer * 13;
      cells(e, sp, 1.25, (i, x, bw) => {
        const wd = Math.max(2, Math.round(bw * (0.55 + 0.4 * H(i, s + 1)) / q)) * q, hh = Math.round((1.1 + sp.amp * H(i, s + 2)) * e.BT / q) * q, x0 = Math.round((x + (bw - wd) * H(i, s + 3)) / 1) | 0;
        g.fillStyle = rgba(sp.col); g.fillRect(x0, yb - hh, wd, hh + e.h);
        const tier = H(i, s + 4) > 0.4 && wd > 3 * q;
        if (tier) g.fillRect(x0 + q, yb - hh - 2 * q, wd - 2 * q, 2 * q + 1);
        g.fillStyle = rgba(e.pal.accent, 0.4); g.fillRect(x0, yb - hh, wd, 1.5); if (tier) g.fillRect(x0 + q, yb - hh - 2 * q, wd - 2 * q, 1.5);
        const nc = wd / q, nr = Math.floor(hh / q) - 1;
        for (let c = 0; c < nc; c++) for (let r = 1; r < nr; r++) {
          const lit = H(i * 17 + c, r + 3) > 0.84 || H(i * 5 + c * 11 + r, Math.floor(e.beat)) > 0.95;
          if (!lit) continue;
          g.fillStyle = rgba(c % 3 ? e.pal.accent : e.pal.sun, 0.3 + 0.25 * H(c, r)); g.fillRect(x0 + c * q + q * 0.3, yb - hh + r * q + q * 0.3, q * 0.4, q * 0.4);
        }
      });
    },
    chimneys(e, sp) {       // 공장(뒤): 톱니 지붕의 공장 건물, 굴뚝, 박마다 하나씩 피어오르는 연기
      const g = e.g, yb = base(e, sp), BT = e.BT, smoke = mix(sp.col, mix(e.pal.sun, WHITE, 0.4), 0.3);
      const stacks = [];
      cells(e, sp, 1.5, (i, x, bw) => {
        const hh = (0.9 + 0.7 * H(i, 131)) * BT;
        g.fillStyle = rgba(sp.col); g.fillRect(x, yb - hh, bw + 1, hh + e.h);
        g.beginPath(); const n = 3, tw = bw / n;
        for (let t = 0; t < n; t++) { g.moveTo(x + t * tw, yb - hh); g.lineTo(x + (t + 1) * tw, yb - hh - BT * 0.42); g.lineTo(x + (t + 1) * tw, yb - hh); }
        g.fill();
        g.fillStyle = rgba(e.pal.sun, 0.18); for (let t = 0; t < n; t++) g.fillRect(x + (t + 1) * tw - 2.5, yb - hh - BT * 0.36, 2, BT * 0.3);
        if (H(i, 132) > 0.45) {
          const cx = x + bw * (0.25 + 0.5 * H(i, 133)), ch = (2.5 + sp.amp * 0.5 * H(i, 134)) * BT, cw = BT * 0.3;
          g.fillStyle = rgba(sp.col); g.fillRect(cx - cw / 2, yb - ch, cw, ch); g.fillRect(cx - cw * 0.68, yb - ch, cw * 1.36, BT * 0.14);
          g.fillStyle = rgba(e.pal.accent, 0.3); g.fillRect(cx - cw / 2, yb - ch + BT * 0.4, cw, BT * 0.07); g.fillRect(cx - cw / 2, yb - ch + BT * 0.62, cw, BT * 0.07);
          stacks.push([cx, yb - ch, i]);
        }
      });
      const fb = pm(e.beat, 1);
      for (const [cx, top, i] of stacks) for (let j = 0; j < 5; j++) {
        const t = fb + j, px = cx - t * BT * 0.38 + Math.sin(t * 1.6 + i) * BT * 0.12, py = top - BT * 0.15 - t * BT * 0.5, rr = BT * (0.16 + 0.15 * t) * (j === 0 ? 0.6 + 0.4 * fb : 1);
        g.fillStyle = rgba(smoke, 0.3 * (1 - t / 5)); g.beginPath(); g.arc(px, py, rr, 0, TAU); g.fill();
      }
    },
    works(e, sp) {          // 공장(앞): 둥근 탱크, 창문 띠가 있는 건물, 기중기(꼭대기 불빛이 박마다), 이어진 관
      const g = e.g, yb = base(e, sp), BT = e.BT, col = rgba(sp.col);
      g.fillStyle = col; g.fillRect(0, yb - BT * 0.75, e.w, BT * 0.1);
      cells(e, sp, 1.4, (i, x, bw) => {
        const r = H(i, 141); g.fillStyle = col;
        if (r < 0.32) {            // 탱크
          const tw = bw * 0.62, th = (1.0 + 0.5 * H(i, 142)) * BT, tx = x + bw * 0.18;
          g.fillRect(tx, yb - th, tw, th + e.h); g.beginPath(); g.ellipse(tx + tw / 2, yb - th, tw / 2, tw * 0.22, 0, Math.PI, TAU); g.fill();
          g.fillStyle = rgba(e.pal.accent, 0.16); for (let k = 1; k < 3; k++) g.fillRect(tx, yb - th + k * th * 0.3, tw, 1.5);
        } else if (r < 0.62) {     // 건물
          const hh = (1.2 + sp.amp * 0.5 * H(i, 143)) * BT, wd = bw * 0.8;
          g.fillRect(x, yb - hh, wd, hh + e.h);
          g.fillStyle = rgba(mix(e.pal.sun, WHITE, 0.4), 0.2); g.fillRect(x + BT * 0.12, yb - hh + BT * 0.3, wd - BT * 0.24, BT * 0.1);
          if (H(i, 144) > 0.5) g.fillRect(x + BT * 0.12, yb - hh + BT * 0.62, wd - BT * 0.24, BT * 0.1);
        } else if (r < 0.8) {      // 기중기
          const mx = x + bw * 0.4, mh = (2.8 + sp.amp * 0.5 * H(i, 145)) * BT, jl = bw * 1.6, mw = BT * 0.16;
          g.fillRect(mx - mw / 2, yb - mh, mw, mh); g.fillRect(mx - jl * 0.3, yb - mh, jl, BT * 0.1); g.fillRect(mx - jl * 0.3, yb - mh, BT * 0.25, BT * 0.25);
          g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(mx, yb - mh - BT * 0.5); g.lineTo(mx - jl * 0.3, yb - mh); g.moveTo(mx, yb - mh - BT * 0.5); g.lineTo(mx + jl * 0.7, yb - mh);
          const hx = mx + jl * (0.35 + 0.25 * H(i, 146)); g.moveTo(hx, yb - mh); g.lineTo(hx, yb - mh + BT * 1.1); g.stroke(); g.fillRect(hx - BT * 0.08, yb - mh + BT * 1.1, BT * 0.16, BT * 0.12);
          g.fillRect(mx - mw / 2, yb - mh - BT * 0.5, mw, BT * 0.5);
          g.fillStyle = rgba(e.pal.accent, 0.3 + 0.7 * e.pulse); g.fillRect(mx - 2, yb - mh - BT * 0.56, 4, 4);
        }
      });
    },
    peaks(e, sp) {          // 산맥: 뾰족한 봉우리, 눈 덮인 꼭대기(눈 선 아래는 들쭉날쭉)
      const g = e.g, yb = base(e, sp), s = sp.layer * 3.7, BT = e.BT;
      const f = (u) => (0.7 + sp.amp * 0.62 * (0.55 * tri(u / 6.1 + s) + 0.3 * tri(u / 2.6 + s * 2) + 0.15 * tri(u / 1.15 + s * 3))) * BT;
      ridgePath(e, sp, f, 6); g.fillStyle = rgba(sp.col); g.fill();
      const snowY = (u) => yb - (0.7 + sp.amp * 0.62 * 0.62) * BT + (vn(u * 1.6, 151 + sp.layer) - 0.5) * BT * 0.5;
      const snow = mix(sp.col, mix(WHITE, e.pal.sun, 0.25), sp.layer === 1 ? 0.42 : 0.3);
      g.beginPath(); const top = [], bot = [];
      for (let x = -20; x <= e.w + 28; x += 6) { const u = (x + sp.off) / BT, y = yb - f(u), sy = snowY(u); top.push([x, y]); bot.push([x, Math.max(y, sy)]); }
      g.moveTo(top[0][0], top[0][1]); for (const p of top) g.lineTo(p[0], p[1]); for (let k = bot.length - 1; k >= 0; k--) g.lineTo(bot[k][0], bot[k][1]); g.closePath();
      g.fillStyle = rgba(snow); g.fill();
      ridgeLine(e, sp, f, 6); g.strokeStyle = rgba(mix(e.pal.sun, WHITE, 0.5), 0.12 + 0.12 * e.pulse); g.lineWidth = 1.2; g.stroke();
    },
    pines(e, sp) {          // 산(앞): 둥근 언덕과 전나무 숲(박마다 살짝 들썩)
      const g = e.g, yb = base(e, sp), BT = e.BT, hill = (u) => (0.45 + 0.75 * vn(u / 3.2, 161)) * BT;
      ridgePath(e, sp, hill, 8); g.fillStyle = rgba(sp.col); g.fill();
      g.beginPath();
      cells(e, sp, 0.42, (i, x, bw) => {
        if (H(i, 162) < 0.3) return;
        const cx = x + bw / 2, by = yb - hill((cx + sp.off) / BT) + 2, th = (0.8 + 1.0 * H(i, 163)) * BT * (1 + 0.05 * e.pulse * H(i, 164)), tw = th * 0.42;
        for (let k = 0; k < 3; k++) { const y0 = by - th * (k * 0.28), w0 = tw * (1 - k * 0.25); g.moveTo(cx - w0, y0); g.lineTo(cx, y0 - th * 0.5); g.lineTo(cx + w0, y0); }
        g.rect(cx - th * 0.04, by - th * 0.05, th * 0.08, th * 0.12);
      });
      g.fill();
    },
    ziggurat(e, sp) {       // 유적(뒤): 계단 피라미드와 꼭대기 신전, 부서진 기둥
      const g = e.g, yb = base(e, sp), BT = e.BT, edgeC = rgba(e.pal.sun, 0.14 + 0.08 * e.pulse);
      g.fillStyle = rgba(sp.col); g.fillRect(0, yb - BT * 0.35, e.w, BT * 0.35 + e.h);
      cells(e, sp, 1.7, (i, x, bw) => {
        const r = H(i, 171);
        g.fillStyle = rgba(sp.col);
        if (r < 0.5) {
          const n = 4 + Math.floor(H(i, 172) * 3), th = BT * (0.34 + 0.08 * sp.amp), w0 = bw * 0.95, inset = w0 / (2 * n + 3), cx = x + bw / 2;
          for (let k = 0; k < n; k++) { const ww = w0 - 2 * k * inset; g.fillRect(cx - ww / 2, yb - (k + 1) * th, ww, th + 1); }
          const sw = w0 - 2 * n * inset; g.fillRect(cx - sw * 0.35, yb - n * th - th * 1.3, sw * 0.7, th * 1.3);
          g.beginPath(); g.moveTo(cx - sw * 0.45, yb - n * th - th * 1.3); g.lineTo(cx, yb - n * th - th * 2); g.lineTo(cx + sw * 0.45, yb - n * th - th * 1.3); g.fill();
          g.fillStyle = edgeC; for (let k = 0; k < n; k++) { const ww = w0 - 2 * k * inset; g.fillRect(cx - ww / 2, yb - (k + 1) * th, ww, 1.5); }
          g.fillStyle = rgba(e.pal.sun, 0.25 + 0.35 * e.pulse); g.fillRect(cx - sw * 0.1, yb - n * th - th * 0.95, sw * 0.2, th * 0.95);
        } else if (r < 0.8) {
          const n = 2 + Math.floor(H(i, 173) * 3), gap = bw / (n + 1), pw = BT * 0.28;
          for (let k = 0; k < n; k++) {
            const px = x + gap * (k + 0.7), ph = (1.2 + 1.3 * H(i * 5 + k, 174)) * BT, cut = BT * 0.25 * (H(i * 5 + k, 175) - 0.5);
            g.beginPath(); g.moveTo(px, yb); g.lineTo(px, yb - ph - cut); g.lineTo(px + pw, yb - ph + cut); g.lineTo(px + pw, yb); g.fill();
            g.fillRect(px - pw * 0.2, yb - BT * 0.2, pw * 1.4, BT * 0.2);
          }
          if (H(i, 176) > 0.5) g.fillRect(x + gap * 0.6, yb - BT * 1.25, gap + pw * 1.3, BT * 0.2);
        }
      });
    },
    canopy(e, sp) {         // 정글(앞): 둥근 나무 꼭대기들, 늘어진 덩굴(흔들린다), 덤불
      const g = e.g, yb = base(e, sp), BT = e.BT, col = rgba(sp.col), vines = [];
      g.fillStyle = col; g.beginPath();
      cells(e, sp, 0.95, (i, x, bw) => {
        if (H(i, 187) < 0.25) return;
        const cx = x + bw / 2, th = (1.2 + 1.1 * H(i, 181)) * BT, cr = BT * (0.48 + 0.3 * H(i, 182)) * (1 + 0.04 * e.pulse);
        g.rect(cx - BT * 0.09, yb - th, BT * 0.18, th + e.h);
        for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + H(i, 183) * 3, ox = Math.cos(a) * cr * 0.7, oy = Math.sin(a) * cr * 0.35; g.moveTo(cx + ox + cr * 0.7, yb - th + oy); g.arc(cx + ox, yb - th + oy, cr * 0.7, 0, TAU); }
        g.moveTo(x + bw * 0.9, yb); g.ellipse(x + bw * 0.5, yb, bw * 0.4, bw * 0.3, 0, 0, Math.PI, true);
        if (H(i, 184) > 0.4) vines.push([cx + cr * (H(i, 185) - 0.5), yb - th + cr * 0.3, BT * (0.6 + 1.2 * H(i, 186)), i]);
      });
      g.fill();
      g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath();
      for (const [vx, vy, len, i] of vines) { const sw = Math.sin(e.now * 1.3 + i) * BT * 0.15; g.moveTo(vx, vy); g.quadraticCurveTo(vx + sw, vy + len * 0.6, vx + sw * 1.6, vy + len); }
      g.stroke();
    },
    mesa(e, sp) {           // 사막(뒤): 꼭대기가 평평한 바위산과 뾰족한 바위탑, 가로 지층
      const g = e.g, yb = base(e, sp), BT = e.BT;
      g.fillStyle = rgba(sp.col); g.fillRect(0, yb - BT * 0.3, e.w, BT * 0.3 + e.h);
      cells(e, sp, 2.1, (i, x, bw) => {
        const r = H(i, 191); if (r > 0.75) return;
        const butte = r > 0.55, ww = bw * (butte ? 0.28 : 0.75 + 0.2 * H(i, 192)), hh = (butte ? 2.3 : 1.4 + sp.amp * 0.35 * H(i, 193)) * BT, x0 = x + (bw - ww) * H(i, 194), sl = ww * 0.12;
        g.beginPath(); g.moveTo(x0 - sl, yb); g.lineTo(x0 + sl * 0.3, yb - hh * 0.75); g.lineTo(x0 + sl * 0.6, yb - hh); g.lineTo(x0 + ww - sl * 0.6, yb - hh); g.lineTo(x0 + ww - sl * 0.3, yb - hh * 0.75); g.lineTo(x0 + ww + sl, yb); g.closePath();
        g.fillStyle = rgba(sp.col); g.fill();
        g.save(); g.clip(); g.fillStyle = rgba(e.pal.sun, 0.07); for (let k = 1; k < 5; k++) g.fillRect(x0 - sl, yb - hh * (k / 5) - BT * 0.05, ww + 2 * sl, BT * 0.07); g.restore();
        g.fillStyle = rgba(e.pal.sun, 0.2 + 0.1 * e.pulse); g.fillRect(x0 + sl * 0.6, yb - hh, ww - sl * 1.2, 1.5);
      });
    },
    dunes(e, sp) {          // 사막(앞): 능선이 날카로운 모래 언덕, 햇빛 받는 능선, 선인장
      const g = e.g, yb = base(e, sp), BT = e.BT, f = (u) => (0.35 + 0.9 * Math.pow(tri(u / 4.3 + 0.3), 1.6) * (0.7 + 0.3 * vn(u / 9, 201)) + 0.25 * tri(u / 1.9)) * BT;
      ridgePath(e, sp, f, 6); g.fillStyle = rgba(sp.col); g.fill();
      ridgeLine(e, sp, f, 6); g.strokeStyle = rgba(mix(e.pal.sun, WHITE, 0.2), 0.22 + 0.1 * e.pulse); g.lineWidth = 1.5; g.stroke();
      g.fillStyle = rgba(sp.col);
      cells(e, sp, 1.6, (i, x, bw) => {
        if (H(i, 202) < 0.72) return;
        const cx = x + bw * 0.5, by = yb - f((cx + sp.off) / BT) + 3, ch = BT * (0.9 + 0.5 * H(i, 203)), cw = BT * 0.14;
        g.beginPath(); g.roundRect(cx - cw / 2, by - ch, cw, ch + 4, cw / 2);
        g.roundRect(cx - cw * 2.2, by - ch * 0.75, cw * 0.8, ch * 0.4, cw * 0.4); g.rect(cx - cw * 2.2, by - ch * 0.42, cw * 1.8, cw * 0.7);
        g.roundRect(cx + cw * 1.4, by - ch * 0.85, cw * 0.8, ch * 0.45, cw * 0.4); g.rect(cx + cw * 0.4, by - ch * 0.5, cw * 1.6, cw * 0.7);
        g.fill();
      });
    },
    spires(e, sp) {         // 바다 밑 성당(뒤): 뾰족탑, 둥근 창(박마다 빛난다)과 뾰족 아치 창
      const g = e.g, yb = base(e, sp), BT = e.BT, glow = mix(e.pal.accent, WHITE, 0.2);
      cells(e, sp, 2.1, (i, x, bw) => {
        const r = H(i, 211); g.fillStyle = rgba(sp.col);
        if (r < 0.55) {
          const cx = x + bw / 2, bwid = bw * 0.62, bh = (1.6 + 0.4 * H(i, 212)) * BT, sh = (3.2 + sp.amp * 0.4 * H(i, 213)) * BT, tw = bwid * 0.22;
          g.fillRect(cx - bwid / 2, yb - bh, bwid, bh + e.h);
          g.beginPath(); g.moveTo(cx - bwid * 0.3, yb - bh); g.lineTo(cx, yb - sh); g.lineTo(cx + bwid * 0.3, yb - bh); g.fill();
          for (const sx of [-1, 1]) { const tx = cx + sx * (bwid / 2 - tw / 2); g.fillRect(tx - tw / 2, yb - bh * 1.35, tw, bh * 1.35); g.beginPath(); g.moveTo(tx - tw / 2, yb - bh * 1.35); g.lineTo(tx, yb - bh * 1.35 - tw * 2.2); g.lineTo(tx + tw / 2, yb - bh * 1.35); g.fill(); }
          g.fillStyle = rgba(glow, 0.22 + 0.4 * e.pulse); g.beginPath(); g.arc(cx, yb - bh * 0.72, bwid * 0.13, 0, TAU); g.fill();
          g.fillStyle = rgba(glow, 0.14);
          for (const sx of [-1, 1]) { const wx = cx + sx * bwid * 0.28, ww = bwid * 0.07; g.beginPath(); g.moveTo(wx - ww, yb - BT * 0.2); g.lineTo(wx - ww, yb - bh * 0.5); g.lineTo(wx, yb - bh * 0.62); g.lineTo(wx + ww, yb - bh * 0.5); g.lineTo(wx + ww, yb - BT * 0.2); g.fill(); }
        } else if (r < 0.8) {
          const cx = x + bw * 0.5, sh = (2.2 + 1.2 * H(i, 214)) * BT, sw = BT * 0.3;
          g.fillRect(cx - sw / 2, yb - sh * 0.7, sw, sh * 0.7 + e.h); g.beginPath(); g.moveTo(cx - sw / 2, yb - sh * 0.7); g.lineTo(cx, yb - sh); g.lineTo(cx + sw / 2, yb - sh * 0.7); g.fill();
        } else {
          const ax = x + bw * 0.2, aw = bw * 0.6, ah = BT * 1.4;
          g.beginPath(); g.moveTo(ax, yb); g.lineTo(ax, yb - ah); g.lineTo(ax + aw, yb - ah); g.lineTo(ax + aw, yb); g.lineTo(ax + aw * 0.82, yb); g.lineTo(ax + aw * 0.82, yb - ah * 0.6); g.quadraticCurveTo(ax + aw / 2, yb - ah * 0.98, ax + aw * 0.18, yb - ah * 0.6); g.lineTo(ax + aw * 0.18, yb); g.closePath(); g.fill();
        }
      });
    },
    reef(e, sp) {           // 산호초(앞): 가지 산호(끝이 박마다 빛난다), 흔들리는 해초, 관 해면, 바위
      const g = e.g, yb = base(e, sp), BT = e.BT, col = rgba(sp.col), tips = [];
      g.fillStyle = col; ridgePath(e, sp, (u) => (0.3 + 0.35 * vn(u / 1.4, 221)) * BT, 8); g.fill();
      g.strokeStyle = col; g.lineCap = "round";
      const branch = (x, y, len, ang, d, seed) => {
        const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
        g.lineWidth = Math.max(1.5, BT * 0.05 * (d + 1)); g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
        if (d === 0) { tips.push([x2, y2, seed]); return; }
        branch(x2, y2, len * 0.72, ang - 0.45 - 0.2 * H(seed, 1), d - 1, seed * 3 + 1);
        branch(x2, y2, len * 0.72, ang + 0.45 + 0.2 * H(seed, 2), d - 1, seed * 3 + 2);
      };
      cells(e, sp, 0.9, (i, x, bw) => {
        const r = H(i, 222), cx = x + bw / 2, sway = Math.sin(e.now * 1.2 + i * 1.7);
        if (r < 0.35) branch(cx, yb, BT * (0.55 + 0.35 * H(i, 223)), -Math.PI / 2 + sway * 0.05, 3, i + 1);
        else if (r < 0.65) {
          g.lineWidth = BT * 0.1; g.beginPath();
          for (let k = 0; k < 3; k++) { const kx = cx + (k - 1) * BT * 0.22, kh = BT * (1.6 + 1.4 * H(i * 3 + k, 224)), s2 = Math.sin(e.now * 1.3 + i + k) * BT * 0.35; g.moveTo(kx, yb); g.bezierCurveTo(kx + s2, yb - kh * 0.35, kx - s2, yb - kh * 0.7, kx + s2 * 1.4, yb - kh); }
          g.stroke();
        } else if (r < 0.85) {
          g.fillStyle = col; g.beginPath();
          for (let k = 0; k < 3; k++) { const tw = BT * 0.26, th = BT * (0.6 + 0.9 * H(i * 3 + k, 225)); g.roundRect(cx + (k - 1) * tw * 1.1 - tw / 2, yb - th, tw, th + 4, tw * 0.4); }
          g.fill();
        }
      });
      g.lineCap = "butt";
      for (const [tx, ty, s] of tips) { const on = H(s, Math.floor(e.beat)) > 0.55; g.fillStyle = rgba(e.pal.accent, on ? 0.35 + 0.4 * e.pulse : 0.15); g.beginPath(); g.arc(tx, ty, BT * 0.07, 0, TAU); g.fill(); }
    },
    asteroids(e, sp) {      // 우주(뒤): 천천히 도는 작은 떠다니는 바위(햇빛 쪽 가장자리가 밝다, 구덩이 두엇)
      const g = e.g, yb = base(e, sp), BT = e.BT, body = mix(sp.col, e.pal.top, 0.25);
      cells(e, sp, 1.2, (i, x, bw) => {
        if (H(i, 231) < 0.35) return;
        const cx = x + bw * H(i, 232), cy = yb - (1.4 + 4.2 * H(i, 233)) * BT + Math.sin(e.now * 0.5 + i) * BT * 0.12, rr = BT * (0.12 + 0.28 * H(i, 234) * H(i, 234)), rot = e.now * 0.4 * (H(i, 235) - 0.5);
        if (Math.hypot(cx - e.cx, cy - e.cy) < e.r0 * 2.3) return;      // 행성 앞은 비운다
        g.beginPath();
        for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + rot, d = rr * (0.72 + 0.28 * H(i * 8 + k, 236)); if (k) g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); else g.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); }
        g.closePath(); g.fillStyle = rgba(body); g.fill();
        g.save(); g.clip(); g.strokeStyle = rgba(mix(e.pal.sun, WHITE, 0.3), 0.35); g.lineWidth = Math.max(1.5, rr * 0.25); g.beginPath(); g.arc(cx + rr * 0.35, cy + rr * 0.35, rr * 1.15, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
        g.fillStyle = rgba(BLACK, 0.25); g.beginPath(); g.arc(cx + rr * 0.2 * Math.cos(rot), cy - rr * 0.15, rr * 0.22, 0, TAU); g.arc(cx - rr * 0.3, cy + rr * 0.3 * Math.sin(rot), rr * 0.14, 0, TAU); g.fill(); g.restore();
      });
    },
    moonscape(e, sp) {      // 우주(앞): 낮은 달 표면, 운석 구덩이, 가끔 기지(돔과 안테나, 박마다 불빛)
      const g = e.g, yb = base(e, sp), BT = e.BT, f = (u) => (0.55 + 0.45 * vn(u / 2.4, 241) + 0.2 * vn(u / 0.9, 242)) * BT;
      ridgePath(e, sp, f, 8); g.fillStyle = rgba(sp.col); g.fill();
      cells(e, sp, 1.2, (i, x, bw) => {
        const cx = x + bw / 2, top = yb - f((cx + sp.off) / BT), r = H(i, 243);
        if (r < 0.45) { const cw = BT * (0.3 + 0.4 * H(i, 244)); g.strokeStyle = rgba(mix(sp.col, e.pal.sun, 0.25), 0.8); g.lineWidth = 1.5; g.beginPath(); g.ellipse(cx, top + cw * 0.35, cw, cw * 0.22, 0, Math.PI * 1.05, TAU * 0.98); g.stroke(); }
        else if (r > 0.86) {
          const dr = BT * 0.55; g.fillStyle = rgba(sp.col); g.beginPath(); g.arc(cx, top + 2, dr, Math.PI, TAU); g.fill(); g.fillRect(cx + dr * 0.5, top - dr * 1.9, 2, dr * 1.4);
          g.fillStyle = rgba(e.pal.accent, 0.3 + 0.7 * e.pulse); g.fillRect(cx + dr * 0.5 - 1.5, top - dr * 1.95, 5, 5);
          g.fillStyle = rgba(e.pal.sun, 0.25); g.fillRect(cx - dr * 0.5, top - dr * 0.35, dr, BT * 0.08);
        }
      });
    },
    pagoda(e, sp) {         // 축제(뒤): 처마가 휜 여러 층의 탑과 둥근 나무
      const g = e.g, yb = base(e, sp), BT = e.BT;
      g.fillStyle = rgba(sp.col); g.fillRect(0, yb - BT * 0.3, e.w, BT * 0.3 + e.h);
      cells(e, sp, 2.3, (i, x, bw) => {
        const r = H(i, 251), cx = x + bw * (0.3 + 0.4 * H(i, 252));
        g.fillStyle = rgba(sp.col); g.beginPath();
        if (r < 0.6) {
          const n = 3 + Math.floor(H(i, 253) * 3), lh = BT * (0.62 + 0.1 * sp.amp), hw0 = bw * 0.24;
          for (let k = 0; k < n; k++) { const hw = hw0 * (1 - k * 0.13), y = yb - k * lh; g.rect(cx - hw * 0.62, y - lh * 0.75, hw * 1.24, lh * 0.75 + 1); roofPath(g, cx, y - lh * 0.62, hw, lh * 0.45); }
          g.rect(cx - 1, yb - n * lh - BT * 0.9, 2, BT * 1.0);
          g.fill();
          g.fillStyle = rgba(e.pal.sun, 0.18 + 0.25 * e.pulse); for (let k = 0; k < n; k++) { const y = yb - k * lh; g.fillRect(cx - BT * 0.06, y - lh * 0.55, BT * 0.12, lh * 0.35); }
        } else {
          for (let k = 0; k < 3; k++) { const tr = BT * (0.45 + 0.3 * H(i * 3 + k, 254)); g.moveTo(cx + k * tr * 0.9 + tr, yb - tr * 0.6); g.arc(cx + k * tr * 0.9, yb - tr * 0.6, tr, 0, TAU); }
          g.fill();
        }
      });
    },
    roofs(e, sp) {          // 축제(앞): 처마가 휜 지붕의 집들, 창의 불빛, 집과 집 사이에 걸린 등롱 줄(박마다 몇 개씩 밝아진다)
      const g = e.g, yb = base(e, sp), BT = e.BT, poles = [], lamp = mix(e.pal.sun, [255, 205, 120], 0.5);
      cells(e, sp, 1.6, (i, x, bw) => {
        const hw = bw * (0.3 + 0.08 * H(i, 261)), cx = x + bw / 2, hh = (1.0 + 0.5 * H(i, 262)) * BT, rh = BT * (0.4 + 0.15 * H(i, 263));
        g.fillStyle = rgba(sp.col); g.beginPath(); g.rect(cx - hw * 0.72, yb - hh, hw * 1.44, hh + e.h); roofPath(g, cx, yb - hh, hw, rh); g.fill();
        // 창: 하나, 창살이 있는 넓은 창(둘을 나란히 두면 얼굴처럼 보였다)
        const ww = hw * 0.8, wh = hh * 0.32, wx = cx - ww / 2 + (H(i, 264) - 0.5) * hw * 0.4, wy = yb - hh * 0.66;
        g.fillStyle = rgba(lamp, 0.16 + 0.1 * H(i, 265)); g.fillRect(wx, wy, ww, wh);
        g.fillStyle = rgba(sp.col); for (let k = 1; k < 4; k++) g.fillRect(wx + (ww * k) / 4 - 0.75, wy, 1.5, wh);
        if (H(i, 266) > 0.35) { const px = cx + hw * 0.55, pt = yb - hh - rh - BT * 0.9; g.fillStyle = rgba(sp.col); g.fillRect(px - 1, pt, 2, yb - hh - pt); poles.push([px, pt, i]); }      // 장대: 지붕 위로 솟아 등롱 줄을 건다
      });
      g.strokeStyle = rgba(sp.col); g.lineWidth = 1.2;
      for (let k = 0; k + 1 < poles.length; k++) {
        const [x1, y1, i] = poles[k], [x2, y2] = poles[k + 1], mx = (x1 + x2) / 2, my = Math.max(y1, y2) + BT * 0.55;
        if (x2 - x1 > sp.bw * 4) continue;
        g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(mx, my, x2, y2); g.stroke();
        for (let j = 1; j < 4; j++) {
          const t = j / 4, lx = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2, ly = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2 + BT * 0.06, on = H(i * 4 + j, Math.floor(e.beat)) > 0.6;
          const a = on ? 0.55 + 0.4 * e.pulse : 0.38;
          g.fillStyle = rgba(lamp, a * 0.18); g.beginPath(); g.arc(lx, ly + BT * 0.12, BT * 0.2, 0, TAU); g.fill();
          g.fillStyle = rgba(lamp, a); g.beginPath(); g.ellipse(lx, ly + BT * 0.12, BT * 0.075, BT * 0.1, 0, 0, TAU); g.fill();
          g.fillStyle = rgba(sp.col); g.fillRect(lx - BT * 0.05, ly + BT * 0.01, BT * 0.1, BT * 0.03); g.fillRect(lx - BT * 0.05, ly + BT * 0.21, BT * 0.1, BT * 0.03);
        }
      }
    },
    silkHills(e, sp) {      // 비단(앞): 부드러운 언덕, 바람에 나부끼는 비단 깃발
      const g = e.g, yb = base(e, sp), BT = e.BT, hill = (u) => (0.4 + 0.6 * vn(u / 3.6, 271)) * BT;
      ridgePath(e, sp, hill, 8); g.fillStyle = rgba(sp.col); g.fill();
      cells(e, sp, 1.3, (i, x, bw) => {
        if (H(i, 272) < 0.45) return;
        const px = x + bw * 0.4, by = yb - hill((px + sp.off) / BT) + 2, ph = (1.8 + 0.7 * H(i, 273)) * BT, fl = BT * (1.0 + 0.4 * H(i, 274)), fh = BT * 0.42;
        g.fillStyle = rgba(sp.col); g.fillRect(px - 1, by - ph, 2.2, ph);
        const c = i % 2 ? e.pal.accent : e.pal.sun, wave = (t) => Math.sin(e.now * 3.2 + i + t * 5) * BT * 0.12 * t;
        g.fillStyle = rgba(c, 0.28 + 0.12 * e.pulse); g.beginPath(); g.moveTo(px, by - ph);
        for (let k = 1; k <= 6; k++) { const t = k / 6; g.lineTo(px + fl * t, by - ph + wave(t)); }
        for (let k = 6; k >= 0; k--) { const t = k / 6; g.lineTo(px + fl * t, by - ph + fh * (1 - 0.3 * t) + wave(t)); }
        g.closePath(); g.fill();
      });
    },
    toys(e, sp) {           // 놀이방(뒤): 고리 쌓기, 곰 인형, 장난감 로켓, 블록 집. 둥근 모양만 쓴다(네모난 상자는 게임의 박스와 헷갈린다). 테두리만 장난감 색
      const g = e.g, yb = base(e, sp), BT = e.BT, body = mix(sp.col, e.pal.top, 0.2), cols = [e.pal.accent, e.pal.sun, [125, 255, 200], [122, 215, 255], [255, 230, 109], [201, 167, 255]];
      cells(e, sp, 1.7, (i, x, bw) => {
        const r = H(i, 281), cx = x + bw * (0.3 + 0.4 * H(i, 282));
        g.fillStyle = rgba(body); g.lineWidth = 2;
        if (r < 0.3) {             // 고리 쌓기: 아래가 넓은 고리들, 고리마다 다른 색 테두리
          const n = 4 + Math.floor(H(i, 283) * 2), rh = BT * 0.36;
          g.fillRect(cx - BT * 0.06, yb - (n + 0.8) * rh, BT * 0.12, (n + 0.8) * rh);
          for (let k = 0; k < n; k++) { const rw = BT * (0.75 - k * 0.11), y = yb - (k + 0.5) * rh; g.beginPath(); g.ellipse(cx, y, rw, rh * 0.55, 0, 0, TAU); g.fill(); g.strokeStyle = rgba(cols[pm(i + k, cols.length)], 0.42); g.beginPath(); g.ellipse(cx, y, rw, rh * 0.55, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
          g.beginPath(); g.arc(cx, yb - (n + 0.8) * rh, BT * 0.13, 0, TAU); g.fill();
        } else if (r < 0.55) {     // 곰 인형(앉은 모습)
          const s = BT * (0.8 + 0.3 * H(i, 284)), hop = H(i, 285) > 0.6 ? -BT * 0.12 * e.pulse : 0, by = yb + hop;
          g.beginPath(); g.ellipse(cx, by - s * 0.55, s * 0.55, s * 0.6, 0, 0, TAU); g.arc(cx, by - s * 1.35, s * 0.42, 0, TAU);
          g.moveTo(cx - s * 0.3, by - s * 1.68); g.arc(cx - s * 0.32, by - s * 1.7, s * 0.15, 0, TAU); g.moveTo(cx + s * 0.47, by - s * 1.7); g.arc(cx + s * 0.32, by - s * 1.7, s * 0.15, 0, TAU);
          g.ellipse(cx - s * 0.45, by - s * 0.12, s * 0.22, s * 0.14, 0, 0, TAU); g.ellipse(cx + s * 0.45, by - s * 0.12, s * 0.22, s * 0.14, 0, 0, TAU); g.fill();
          g.strokeStyle = rgba(cols[pm(i, cols.length)], 0.4); g.beginPath(); g.arc(cx, by - s * 1.35, s * 0.42, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
          g.fillStyle = rgba(mix(e.pal.sun, WHITE, 0.5), 0.2); g.beginPath(); g.ellipse(cx, by - s * 0.5, s * 0.28, s * 0.32, 0, 0, TAU); g.fill();
        } else if (r < 0.75) {     // 장난감 로켓
          const rh = BT * 2.4, rw = BT * 0.4;
          g.beginPath(); g.moveTo(cx - rw, yb - BT * 0.3); g.lineTo(cx - rw, yb - rh * 0.65); g.quadraticCurveTo(cx - rw, yb - rh * 0.95, cx, yb - rh); g.quadraticCurveTo(cx + rw, yb - rh * 0.95, cx + rw, yb - rh * 0.65); g.lineTo(cx + rw, yb - BT * 0.3);
          g.lineTo(cx + rw * 1.8, yb); g.lineTo(cx - rw * 1.8, yb); g.closePath(); g.fill();
          g.fillStyle = rgba(e.pal.accent, 0.25 + 0.3 * e.pulse); g.beginPath(); g.arc(cx, yb - rh * 0.6, rw * 0.42, 0, TAU); g.fill();
          g.strokeStyle = rgba(cols[pm(i + 2, cols.length)], 0.4); g.beginPath(); g.moveTo(cx - rw, yb - rh * 0.4); g.lineTo(cx + rw, yb - rh * 0.4); g.stroke();
        } else {                   // 큰 공(줄무늬)
          const br = BT * (0.55 + 0.25 * H(i, 286)), hop = -BT * 0.18 * e.pulse;
          g.beginPath(); g.arc(cx, yb - br + hop, br, 0, TAU); g.fill();
          g.save(); g.clip(); g.strokeStyle = rgba(cols[pm(i, cols.length)], 0.4); g.lineWidth = br * 0.22; g.beginPath(); g.ellipse(cx, yb - br + hop, br * 0.35, br * 1.1, 0.4, 0, TAU); g.stroke(); g.restore();
        }
      });
    },
    blocks(e, sp) {         // 놀이방(앞): 낮은 장난감들 — 둥근 블록, 공, 작은 자동차. 몇 개는 박마다 통통 튄다
      const g = e.g, yb = base(e, sp), BT = e.BT, cols = [e.pal.accent, e.pal.sun, [125, 255, 200], [255, 230, 109]];
      g.fillStyle = rgba(sp.col); g.fillRect(0, yb - BT * 0.12, e.w, BT * 0.12 + e.h);
      cells(e, sp, 0.95, (i, x, bw) => {
        const r = H(i, 291); if (r < 0.35) return;
        const hop = H(i, 292) > 0.7 ? -BT * 0.2 * e.pulse : 0, s = BT * (0.4 + 0.2 * H(i, 293)), cx = x + bw / 2, c = cols[pm(i, cols.length)];
        g.fillStyle = rgba(sp.col); g.strokeStyle = rgba(c, 0.38); g.lineWidth = 1.5; g.beginPath();
        if (r < 0.6) { g.moveTo(cx - s * 0.6, yb + hop); g.lineTo(cx, yb - s * 1.1 + hop); g.lineTo(cx + s * 0.6, yb + hop); g.closePath(); }
        else if (r < 0.8) { g.arc(cx, yb - s * 0.5 + hop, s * 0.5, 0, TAU); }
        else { g.roundRect(cx - s, yb - s * 0.75, s * 2, s * 0.5, s * 0.2); g.roundRect(cx - s * 0.5, yb - s * 1.1, s, s * 0.45, s * 0.2); g.moveTo(cx - s * 0.45, yb - s * 0.2); g.arc(cx - s * 0.6, yb - s * 0.2, s * 0.2, 0, TAU); g.moveTo(cx + s * 0.8, yb - s * 0.2); g.arc(cx + s * 0.6, yb - s * 0.2, s * 0.2, 0, TAU); }
        g.fill(); g.stroke();
      });
    },
  };

  // ================================================================ 땅·천장·벽의 결: 미리 그린 타일(두 칸 × 두 칸)을 무늬로 깐다. 바탕은 원래의 검정, 결은 아주 옅게(통로의 경계가 먼저 보이게)
  const SIL = "#07070f";
  function tile(kind, S = 128) {
    if (typeof document === "undefined") return null;
    const cv = document.createElement("canvas"); cv.width = cv.height = S;
    const c = cv.getContext("2d"); c.fillStyle = SIL; c.fillRect(0, 0, S, S);
    const wrap = (fn) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { c.save(); c.translate(dx, dy); fn(); c.restore(); } };
    (TILE[kind] || TILE.plain)(c, S, wrap);
    return cv;
  }
  const TILE = {
    plain() {},
    asphalt(c, S, wrap) {
      for (let i = 0; i < 260; i++) { const x = H(i, 301) * S, y = H(i, 302) * S, s = 1 + 1.6 * H(i, 303); c.fillStyle = `rgba(255,255,255,${0.025 + 0.06 * H(i, 304)})`; c.fillRect(x, y, s, s); }
      c.strokeStyle = "rgba(255,255,255,0.05)"; c.lineWidth = 1.5;
      wrap(() => { c.beginPath(); let x = S * 0.2, y = S * 0.55; c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += S * 0.12; y += (H(k, 305) - 0.5) * S * 0.12; c.lineTo(x, y); } c.stroke(); });
    },
    circuit(c, S, wrap) {
      c.strokeStyle = "rgba(125,249,255,0.075)"; c.fillStyle = "rgba(125,249,255,0.1)"; c.lineWidth = 2;
      const q = S / 8;
      for (let i = 0; i < 9; i++) wrap(() => {
        let x = Math.floor(H(i, 311) * 8) * q, y = Math.floor(H(i, 312) * 8) * q + q / 2;
        c.beginPath(); c.moveTo(x, y);
        const l1 = (1 + Math.floor(H(i, 313) * 3)) * q; x += l1; c.lineTo(x, y);
        const d = (H(i, 314) > 0.5 ? 1 : -1) * q; x += q; y += d; c.lineTo(x, y);
        x += (1 + Math.floor(H(i, 315) * 2)) * q; c.lineTo(x, y); c.stroke();
        c.beginPath(); c.arc(x, y, 3.5, 0, TAU); c.stroke();
      });
      for (let i = 0; i < 6; i++) { const x = Math.floor(H(i, 316) * 8) * q + 2, y = Math.floor(H(i, 317) * 8) * q + 2; c.fillRect(x, y, q * 0.4, q * 0.4); }
    },
    plate(c, S) {
      c.strokeStyle = "rgba(255,255,255,0.06)"; c.lineWidth = 2;
      for (let k = 0; k <= 2; k++) { c.beginPath(); c.moveTo(0, k * S / 2 + 1); c.lineTo(S, k * S / 2 + 1); c.moveTo(k * S / 2 + 1, 0); c.lineTo(k * S / 2 + 1, S); c.stroke(); }
      c.fillStyle = "rgba(255,255,255,0.1)";
      for (const px of [0, S / 2]) for (const py of [0, S / 2]) for (const [ox, oy] of [[8, 8], [S / 2 - 8, 8], [8, S / 2 - 8], [S / 2 - 8, S / 2 - 8]]) { c.beginPath(); c.arc(px + ox, py + oy, 2.6, 0, TAU); c.fill(); }
      c.strokeStyle = "rgba(255,255,255,0.03)"; c.lineWidth = 3;
      for (let k = -S; k < S * 2; k += 12) { c.beginPath(); c.moveTo(k, S); c.lineTo(k + S, 0); c.stroke(); }
    },
    strata(c, S) {
      c.lineWidth = 2;
      for (let j = 0; j < 7; j++) { c.strokeStyle = `rgba(255,255,255,${0.035 + 0.03 * H(j, 321)})`; c.beginPath(); for (let x = 0; x <= S; x += 4) { const y = j * S / 7 + 6 + Math.sin((x / S) * TAU * (1 + (j % 2)) + j) * 4; if (x) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); }
      for (let i = 0; i < 18; i++) { c.fillStyle = "rgba(255,255,255,0.04)"; c.beginPath(); c.ellipse(H(i, 322) * S, H(i, 323) * S, 2 + 4 * H(i, 324), 1.5 + 2 * H(i, 325), 0, 0, TAU); c.fill(); }
    },
    rockface(c, S, wrap) {     // 새벽 산맥: 크고 작은 바위가 박힌 절벽(테두리만 옅게), 사이의 지층
      for (let i = 0; i < 14; i++) wrap(() => {
        const x = H(i, 531) * S, y = H(i, 532) * S, rx = 8 + 18 * H(i, 533), ry = 6 + 10 * H(i, 534);
        c.beginPath(); for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU, d = 0.75 + 0.25 * H(i * 7 + k, 535); c.lineTo(x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d); } c.closePath();
        c.fillStyle = "rgba(200,225,255,0.025)"; c.fill(); c.strokeStyle = "rgba(200,225,255,0.075)"; c.lineWidth = 1.5; c.stroke();
        c.beginPath(); c.moveTo(x - rx * 0.5, y - ry * 0.45); c.lineTo(x + rx * 0.3, y - ry * 0.7); c.strokeStyle = "rgba(220,240,255,0.06)"; c.stroke();
      });
      c.strokeStyle = "rgba(200,225,255,0.035)"; c.lineWidth = 2;
      for (let j = 0; j < 4; j++) { c.beginPath(); for (let x = 0; x <= S; x += 4) { const y = j * S / 4 + 10 + Math.sin((x / S) * TAU * 2 + j) * 3; if (x) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); }
    },
    stone(c, S) {
      c.strokeStyle = "rgba(255,255,255,0.065)"; c.lineWidth = 2;
      const rh = S / 4;
      for (let r = 0; r < 4; r++) {
        c.beginPath(); c.moveTo(0, r * rh + 1); c.lineTo(S, r * rh + 1); c.stroke();
        const off = r % 2 ? S / 4 : 0;
        for (let k = 0; k < 2; k++) { const x = off + k * S / 2; c.beginPath(); c.moveTo(x, r * rh); c.lineTo(x, (r + 1) * rh); c.stroke(); }
      }
      for (let i = 0; i < 26; i++) { c.fillStyle = `rgba(130,210,120,${0.05 + 0.06 * H(i, 331)})`; c.beginPath(); c.arc(H(i, 332) * S, Math.floor(H(i, 333) * 4) * rh + 2 + 3 * H(i, 334), 1.5 + 2.5 * H(i, 335), 0, TAU); c.fill(); }
    },
    pores(c, S, wrap) {
      for (let i = 0; i < 30; i++) wrap(() => { const r = 2 + 6 * H(i, 341); c.strokeStyle = `rgba(160,230,255,${0.04 + 0.05 * H(i, 342)})`; c.lineWidth = 1.5; c.beginPath(); c.arc(H(i, 343) * S, H(i, 344) * S, r, 0, TAU); c.stroke(); });
      for (let i = 0; i < 40; i++) { c.fillStyle = "rgba(160,230,255,0.05)"; c.fillRect(H(i, 345) * S, H(i, 346) * S, 1.5, 1.5); }
    },
    tiles(c, S) {
      c.strokeStyle = "rgba(255,235,200,0.05)"; c.lineWidth = 2;
      for (let k = -1; k <= 2; k++) { c.beginPath(); c.moveTo(k * S / 2, 0); c.lineTo(k * S / 2 + S, S); c.moveTo(k * S / 2 + S, 0); c.lineTo(k * S / 2, S); c.stroke(); }
      c.fillStyle = "rgba(255,235,200,0.1)";
      for (const [x, y] of [[0, 0], [S / 2, S / 2], [S, 0], [0, S], [S, S], [S / 2, 0], [0, S / 2], [S, S / 2], [S / 2, S]]) { if ((x + y) % S) continue; c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x + 1.5, y - 1.5); c.lineTo(x + 5, y); c.lineTo(x + 1.5, y + 1.5); c.lineTo(x, y + 5); c.lineTo(x - 1.5, y + 1.5); c.lineTo(x - 5, y); c.lineTo(x - 1.5, y - 1.5); c.fill(); }
    },
  };

  // ================================================================ 땅 윗선 바로 밑의 장식(땅 속에만. 위로는 아무것도 솟지 않는다). x0~x1 = 그 토막의 땅, ox = 세계 x 0칸의 화면 x(무늬를 세상에 붙인다)
  function each(e, x0, x1, ox, step, fn) { for (let k = Math.ceil((x0 - ox) / step), x = ox + k * step; x <= x1; k++, x += step) fn(k, x); }
  const EDGE = {
    none() {},
    lane(e, x0, x1, ox) {      // 도로의 끊어진 차선
      const g = e.g, T = e.T, P = T * 1.6;
      g.setLineDash([T * 0.8, T * 0.8]); g.lineDashOffset = pm(x0 - ox, P);
      g.strokeStyle = rgba(e.pal.accent, 0.18 + 0.1 * e.pulse); g.lineWidth = Math.max(1.5, T * 0.07);
      g.beginPath(); g.moveTo(x0, e.gy + T * 0.42); g.lineTo(x1, e.gy + T * 0.42); g.stroke(); g.setLineDash([]);
    },
    bits(e, x0, x1, ox) {      // 줄지은 픽셀(박마다 바뀐다)
      const g = e.g, T = e.T, s = T * 0.12;
      each(e, x0, x1, ox, T * 0.5, (k, x) => { const on = H(k, Math.floor(e.beat)) > 0.6; g.fillStyle = rgba(e.pal.accent, on ? 0.45 : 0.1); g.fillRect(x, e.gy + T * 0.22, s, s); });
    },
    hazard(e, x0, x1, ox) {    // 노랑·검정 경고 띠
      const g = e.g, T = e.T, y0 = e.gy + T * 0.14, hh = T * 0.18;
      g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, hh); g.clip();
      g.fillStyle = rgba(e.pal.accent, 0.22); g.beginPath();
      each(e, x0 - T, x1 + T, ox, T * 0.5, (k, x) => { g.moveTo(x, y0 + hh); g.lineTo(x + T * 0.25, y0 + hh); g.lineTo(x + T * 0.25 + hh, y0); g.lineTo(x + hh, y0); g.closePath(); });
      g.fill(); g.restore();
    },
    frost(e, x0, x1, ox) {     // 서리: 옅은 흰 띠와 고드름
      const g = e.g, T = e.T, c = mix(e.pal.accent, WHITE, 0.6), gr = g.createLinearGradient(0, e.gy, 0, e.gy + T * 0.55);
      gr.addColorStop(0, rgba(c, 0.16)); gr.addColorStop(1, rgba(c, 0)); g.fillStyle = gr; g.fillRect(x0, e.gy, x1 - x0, T * 0.55);
      g.fillStyle = rgba(c, 0.2); g.beginPath();
      each(e, x0, x1, ox, T * 0.33, (k, x) => { const l = T * (0.08 + 0.22 * H(k, 351)); g.moveTo(x - T * 0.05, e.gy + 1); g.lineTo(x, e.gy + l); g.lineTo(x + T * 0.05, e.gy + 1); });
      g.fill();
    },
    moss(e, x0, x1, ox) {      // 이끼: 아래로 늘어진 짧은 덩굴
      const g = e.g, T = e.T;
      g.strokeStyle = "rgba(120,200,110,0.32)"; g.lineWidth = Math.max(1.5, T * 0.07); g.lineCap = "round"; g.beginPath();
      each(e, x0, x1, ox, T * 0.21, (k, x) => { if (H(k, 361) < 0.3) return; const l = T * (0.06 + 0.4 * H(k, 362) * H(k, 362)); g.moveTo(x, e.gy + 2); g.lineTo(x + Math.sin(e.now + k) * T * 0.02, e.gy + 2 + l); });
      g.stroke(); g.lineCap = "butt";
    },
    glow(e, x0, x1, ox) {      // 발광 점(박마다 몇 개씩 밝아진다)
      const g = e.g, T = e.T;
      each(e, x0, x1, ox, T * 0.55, (k, x) => { const d = T * (0.25 + 0.7 * H(k, 371)), on = H(k, Math.floor(e.beat)) > 0.65; g.fillStyle = rgba(e.pal.accent, on ? 0.3 + 0.5 * e.pulse : 0.14); g.beginPath(); g.arc(x + T * 0.2 * H(k, 372), e.gy + d, T * (0.03 + 0.03 * H(k, 373)), 0, TAU); g.fill(); });
    },
    snowcap(e, x0, x1, ox) {   // 눈 덮인 바위: 윗선 밑에 쌓인 눈(아래 끝이 둥글게 들쭉날쭉, 세상에 붙어 흐른다), 박마다 반짝이는 눈 알갱이
      const g = e.g, T = e.T, y = e.gy, st = T * 0.34, dep = (k) => T * (0.16 + 0.14 * H(k, 521));
      const k0 = Math.floor((x0 - ox) / st) - 1, k1 = Math.ceil((x1 - ox) / st) + 1;
      g.fillStyle = rgba(mix(WHITE, e.pal.accent, 0.12), 0.5);
      g.save(); g.beginPath(); g.rect(x0, y - 2, x1 - x0, T); g.clip();
      g.beginPath(); g.moveTo(ox + k0 * st, y); g.lineTo(ox + k1 * st, y); g.lineTo(ox + k1 * st, y + dep(k1));
      for (let k = k1 - 1; k >= k0; k--) g.quadraticCurveTo(ox + (k + 0.5) * st, y + dep(k) + T * 0.1, ox + k * st, y + dep(k));
      g.closePath(); g.fill();
      g.fillStyle = rgba(WHITE, 0.4 + 0.5 * e.pulse);
      for (let k = k0; k <= k1; k++) if (H(k, Math.floor(e.beat) + 900) > 0.75) g.fillRect(ox + (k + H(k, 522)) * st, y + T * 0.06, 2, 2);
      g.restore();
    },
    stitch(e, x0, x1, ox) {    // 바느질 땀(천 인형의 솔기)
      const g = e.g, T = e.T, P = T * 0.5;
      g.setLineDash([T * 0.22, T * 0.28]); g.lineDashOffset = pm(x0 - ox, P);
      g.strokeStyle = rgba(mix(e.pal.sun, WHITE, 0.3), 0.3); g.lineWidth = Math.max(1.5, T * 0.06);
      g.beginPath(); g.moveTo(x0, e.gy + T * 0.3); g.lineTo(x1, e.gy + T * 0.3); g.stroke(); g.setLineDash([]);
    },
  };

  // ================================================================ 파란 박스의 재질. 색은 파랑 계열 그대로(= 딛는 곳), 윤곽(= 판정)은 index.html이 그대로 긋는다.
  //   lo·hi 땅 위 박스의 아래·윗면 쪽 색, lit 떠 있는 박스의 밑면(밝은 쪽), deep·deepSky 떠 있는 박스·파란 천장의 어두운 쪽,
  //   flash(h) 공이 딛는 순간의 밝은 색(h 1 → 0), line·glow 테두리와 번짐 색, inner(e, b, tops, seed, hit) 안쪽(클립 안): b 범위, tops 윗면 토막들 [[xa, xb, y], …]
  const BOX = {
    plain: {       // 원래의 것: 파란 유리판, 가로 줄
      lo: "#081a3d", hi: "#1f6ee0", lit: "#1f6ee0", deep: "#0b2a5e", deepSky: "#0a1f47", line: "#9fdcff", glow: "#3aa0ff",
      flash: (h) => `rgb(${40 + 60 * h | 0},${110 + 80 * h | 0},255)`,
      inner(e, b) { const g = e.g; g.strokeStyle = "rgba(150,210,255,0.16)"; g.lineWidth = 2; g.beginPath(); for (let y = b.y1 - e.T * 0.48; y > b.y0; y -= e.T * 0.48) { g.moveTo(b.x0, y); g.lineTo(b.x1, y); } g.stroke(); },
    },
    ice: {         // 새벽 산맥: 눈 얹힌 얼음 블록 — 비스듬한 반사광, 속의 금, 윗면에 쌓인 눈(박스 안쪽에만)
      lo: "#0a2c5e", hi: "#3f9be8", lit: "#4aa6ee", deep: "#103a72", deepSky: "#0b2550", line: "#d9f2ff", glow: "#7cc6ff",
      flash: (h) => `rgb(${63 + 110 * h | 0},${155 + 80 * h | 0},${232 + 23 * h | 0})`,
      inner(e, b, tops, seed, hit) {
        const g = e.g, T = e.T, hh = b.y1 - b.y0;
        g.fillStyle = rgba(WHITE, 0.13 + 0.12 * hit); g.beginPath();
        for (let x = b.x0 + T * (0.15 + 0.3 * H(seed, 511)); x < b.x1; x += T * 2.4) for (const [o, ww] of [[0, 0.18], [0.32, 0.06]]) {
          const xa = x + T * o, lean = Math.min(hh, T * 3) * 0.55; g.moveTo(xa, b.y1); g.lineTo(xa + T * ww, b.y1); g.lineTo(xa + T * ww + lean, b.y1 - Math.min(hh, T * 3)); g.lineTo(xa + lean, b.y1 - Math.min(hh, T * 3)); g.closePath();
        }
        g.fill();
        g.strokeStyle = rgba(WHITE, 0.2); g.lineWidth = 1.2; g.beginPath();
        const n = clamp(Math.round((b.x1 - b.x0) / T), 1, 5);
        for (let k = 0; k < n; k++) { const sd = seed * 7 + k; let x = b.x0 + (b.x1 - b.x0) * ((k + 0.25 + 0.5 * H(sd, 512)) / n), y = b.y1 - Math.min(hh, T) * (0.25 + 0.4 * H(sd, 513)); g.moveTo(x, y); for (let j = 0; j < 3; j++) { x += (H(sd + j, 514) - 0.5) * T * 0.4; y -= T * (0.08 + 0.12 * H(sd + j, 515)); g.lineTo(x, y); } }
        g.stroke();
        const snow = rgba([236, 248, 255], 0.92);
        for (const [xa, xb, y] of tops) {
          g.fillStyle = snow; g.beginPath(); g.moveTo(xa - 1, y - 1); g.lineTo(xb + 1, y - 1);
          const st = T * 0.24, n2 = Math.max(1, Math.round((xb - xa) / st)), d = (xb - xa) / n2;
          g.lineTo(xb + 1, y + T * 0.1);
          for (let k = n2 - 1; k >= 0; k--) { const x = xa + k * d, dep = T * (0.12 + 0.09 * H(seed * 3 + k, 516)); g.quadraticCurveTo(x + d / 2, y + dep + T * 0.05, x, y + T * 0.08); }
          g.closePath(); g.fill();
          g.fillStyle = rgba(WHITE, 0.5 + 0.5 * e.pulse); for (let k = 0; k < n2; k++) if (H(seed * 5 + k, Math.floor(e.beat)) > 0.7) g.fillRect(xa + (k + 0.5) * d - 1, y + T * 0.03, 2, 2);
        }
      },
    },
  };
  // 빨간 덩어리의 바탕색(어두운 쪽 → 밝은 쪽). head = 프레스 머리
  const RED_SKIN = {
    plain: { lo: "#12050d", hi: "#6d1236", headLo: "#2a0816", headHi: "#86173f" },      /* 위험색 */
    magma: { lo: "#120506", hi: "#5c1419", headLo: "#140607", headHi: "#681a1e" },      /* 위험색: 용암석(검붉은 돌, 금에서 빛이 샌다) */
  };

  // ================================================================ 빨간 덩어리 안쪽의 결(클립 안에서 그린다. 색은 빨강 계열 그대로). b = { x0, x1, y0, y1 } 덩어리의 화면 범위, ox = 세계 x 0칸의 화면 x, seed = 덩어리마다 다른 수
  const RED = [255, 107, 144], HOT = [255, 104, 56], HOTCORE = [255, 196, 130];      /* 위험색: 빨간 덩어리의 결에만 쓴다 */
  const GRAIN = {
    stripes: null,     // 원래의 빗금(index.html에서 그린다)
    scan(e, b) {       // 가로 주사선, 박마다 위에서 아래로 훑는 밝은 줄
      const g = e.g, T = e.T;
      g.fillStyle = rgba(RED, 0.16); for (let y = b.y1 - T * 0.2; y > b.y0; y -= T * 0.2) g.fillRect(b.x0, y, b.x1 - b.x0, 1.5);
      const y = b.y0 + pm(e.beat, 1) * (b.y1 - b.y0); g.fillStyle = rgba(RED, 0.35 * (1 - pm(e.beat, 1))); g.fillRect(b.x0, y, b.x1 - b.x0, 2.5);
    },
    pixel(e, b, ox) {  // 칸에 붙은 깨진 픽셀(박마다 몇 개씩 바뀐다)
      const g = e.g, q = e.T * 0.34, kx0 = Math.floor((b.x0 - ox) / q), ky0 = Math.floor((b.y0 - e.gy) / q);
      for (let kx = kx0; ox + kx * q < b.x1; kx++) for (let ky = ky0; e.gy + ky * q < b.y1; ky++) {
        const h = H(kx * 7 + ky, 381), hb = H(kx + ky * 13, Math.floor(e.beat));
        if (h < 0.62 && hb < 0.93) continue;
        g.fillStyle = rgba(RED, 0.08 + 0.2 * Math.max(h - 0.62, hb > 0.93 ? 0.4 : 0)); g.fillRect(ox + kx * q + 1.5, e.gy + ky * q + 1.5, q - 3, q - 3);
      }
    },
    cracks(e, b, ox, seed) {   // 돌·얼음의 금(덩어리마다 늘 같은 자리)
      const g = e.g, T = e.T, n = clamp(Math.round((b.x1 - b.x0) / T), 1, 6);
      g.fillStyle = rgba(RED, 0.06); g.beginPath(); g.moveTo(b.x0, b.y0); g.lineTo(b.x0 + (b.x1 - b.x0) * 0.6, b.y0); g.lineTo(b.x0, b.y0 + (b.y1 - b.y0) * 0.5); g.fill();
      g.strokeStyle = rgba(RED, 0.3); g.lineWidth = 1.4; g.lineJoin = "miter"; g.beginPath();
      for (let k = 0; k < n; k++) {
        let x = b.x0 + (b.x1 - b.x0) * ((k + 0.3 + 0.4 * H(seed * 7 + k, 391)) / n), y = H(seed + k, 392) > 0.5 ? b.y0 : b.y1;
        const dir = y === b.y0 ? 1 : -1;
        g.moveTo(x, y);
        for (let s = 0; s < 4; s++) { x += (H(seed * 13 + k * 5 + s, 393) - 0.5) * T * 0.5; y += dir * T * (0.15 + 0.25 * H(seed * 3 + k * 7 + s, 394)); g.lineTo(x, y); if (s === 1 && H(seed + k * 11, 395) > 0.5) { g.lineTo(x + T * 0.25, y + dir * T * 0.15); g.moveTo(x, y); } }
      }
      g.stroke();
    },
    cells(e, b, ox) {  // 구멍 난 산호·말미잘 같은 결(벌집처럼 엇갈린 동그라미)
      const g = e.g, q = e.T * 0.36, kx0 = Math.floor((b.x0 - ox) / q) - 1, ky0 = Math.floor((b.y0 - e.gy) / (q * 0.87)) - 1;
      g.strokeStyle = rgba(RED, 0.2); g.lineWidth = 1.3; g.beginPath();
      for (let ky = ky0; e.gy + ky * q * 0.87 < b.y1 + q; ky++) for (let kx = kx0; ox + kx * q < b.x1 + q; kx++) {
        const x = ox + kx * q + (pm(ky, 2) ? q / 2 : 0), y = e.gy + ky * q * 0.87, r = q * (0.22 + 0.14 * H(kx * 5 + ky, 401));
        g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU);
      }
      g.stroke();
    },
    magma(e, b, ox, seed) {    // 용암석: 금 사이로 빛이 샌다(박마다 달아오른다). 금은 덩어리마다 늘 같은 자리. 하늘까지 이어진 덩어리는 화면 안쪽만
      const g = e.g, T = e.T, y0 = Math.max(b.y0, -T), cell = T * 1.1, nx = Math.max(1, Math.round((b.x1 - b.x0) / cell)), ny = clamp(Math.round((b.y1 - y0) / cell), 1, 12);
      g.beginPath();
      for (let kx = 0; kx < nx; kx++) for (let ky = 0; ky < ny; ky++) {
        const sd = seed * 31 + kx * 7 + ky * 13; if (H(sd, 501) < 0.12) continue;
        let x = b.x0 + (b.x1 - b.x0) * ((kx + 0.2 + 0.6 * H(sd, 502)) / nx), y = y0 + (b.y1 - y0) * ((ky + 0.2 + 0.6 * H(sd, 503)) / ny), a = H(sd, 504) * TAU;
        g.moveTo(x, y);
        for (let k = 0; k < 4; k++) { a += (H(sd + k, 505) - 0.5) * 1.6; const l = T * (0.18 + 0.2 * H(sd + k, 506)); x += Math.cos(a) * l; y += Math.sin(a) * l; g.lineTo(x, y); if (k === 1) { g.lineTo(x + Math.cos(a + 1.2) * l * 0.7, y + Math.sin(a + 1.2) * l * 0.7); g.moveTo(x, y); } }
      }
      g.lineJoin = "round"; g.lineCap = "round";
      g.strokeStyle = rgba(HOT, 0.16 + 0.12 * e.pulse); g.lineWidth = T * 0.16; g.stroke();
      g.strokeStyle = rgba(HOT, 0.55 + 0.3 * e.pulse); g.lineWidth = Math.max(1.2, T * 0.05); g.stroke();
      g.strokeStyle = rgba(HOTCORE, 0.35 + 0.45 * e.pulse); g.lineWidth = Math.max(0.8, T * 0.018); g.stroke();
      g.lineCap = "butt";
    },
    diamond(e, b, ox) {        // 마름모 격자(광대 옷)
      const g = e.g, q = e.T * 0.5, span = b.y1 - b.y0;
      g.strokeStyle = rgba(RED, 0.2); g.lineWidth = 1.5; g.beginPath();
      for (let x = ox + Math.floor((b.x0 - span - ox) / q) * q; x < b.x1 + span; x += q) { g.moveTo(x, b.y1); g.lineTo(x + span, b.y0); g.moveTo(x, b.y0); g.lineTo(x + span, b.y1); }
      g.stroke();
    },
  };

  // ================================================================ 공의 꼬리 입자(세계 좌표, 칸). make(x, y)가 입자 하나를 만든다. every = 몇 초마다
  const rnd = Math.random;
  const TRAIL = {
    spark:    { every: 0.035, make: (x, y) => ({ x: x - 0.25, y: y + (rnd() - 0.5) * 0.5, vx: -2 - 2 * rnd(), vy: (rnd() - 0.5) * 0.6, life: 0.3, max: 0.3, size: 0.07, g: 0, kind: "spark" }) },
    pixel:    { every: 0.05, make: (x, y) => ({ x: Math.round((x - 0.3) * 4) / 4, y: Math.round((y + (rnd() - 0.5) * 0.6) * 4) / 4, vx: 0, vy: 0, life: 0.4, max: 0.4, size: 0.18, g: 0, kind: "pixel" }) },
    ember:    { every: 0.04, make: (x, y) => ({ x: x - 0.2, y: y + (rnd() - 0.5) * 0.4, vx: -1 - rnd(), vy: -1 - 1.5 * rnd(), life: 0.5, max: 0.5, size: 0.07, g: -1, kind: "ember" }) },
    mote:     { every: 0.06, make: (x, y) => ({ x: x - 0.2, y: y + (rnd() - 0.5) * 0.6, vx: -0.5 * rnd(), vy: -0.3 * rnd(), life: 0.7, max: 0.7, size: 0.08, g: 0, kind: "mote" }) },
    leaf:     { every: 0.11, make: (x, y) => ({ x: x - 0.2, y, vx: -1.5 - rnd(), vy: -0.5, life: 0.8, max: 0.8, size: 0.16, g: 2, rot: rnd() * 6, kind: "leaf" }) },
    bubble:   { every: 0.07, make: (x, y) => ({ x: x - 0.2 + (rnd() - 0.5) * 0.3, y: y + (rnd() - 0.5) * 0.4, vx: -0.4, vy: -1.2 - rnd(), life: 0.8, max: 0.8, size: 0.07 + 0.08 * rnd(), g: -0.6, kind: "bubble" }) },
    stardust: { every: 0.035, make: (x, y) => ({ x: x - 0.2, y: y + (rnd() - 0.5) * 0.5, vx: -1 - rnd(), vy: (rnd() - 0.5) * 0.8, life: 0.5, max: 0.5, size: 0.06 + 0.05 * rnd(), g: 0, kind: "star" }) },
    glitter:  { every: 0.05, make: (x, y) => ({ x: x - 0.2 + (rnd() - 0.5) * 0.3, y: y + (rnd() - 0.5) * 0.6, vx: -0.6, vy: 0.4, life: 0.55, max: 0.55, size: 0.12 + 0.08 * rnd(), g: 0.5, kind: "glitter" }) },
  };
  // 꼬리 입자 하나 그리기: X·Y 화면 자리, s 크기(픽셀), a 남은 수명(1 → 0)
  function particle(g, p, X, Y, s, a, pal) {
    switch (p.kind) {
      case "spark": g.fillStyle = rgba(mix(pal.accent, WHITE, 0.4), a * 0.8); g.fillRect(X - s * 1.5, Y - s / 3, s * 3, s * 0.66); break;
      case "pixel": g.fillStyle = rgba(pal.accent, a * 0.55); g.fillRect(X - s / 2, Y - s / 2, s * 0.9, s * 0.9); break;
      case "ember": g.fillStyle = rgba(mix(pal.sun, [255, 214, 110], 0.6), a * 0.9); g.beginPath(); g.arc(X, Y, s * (0.4 + 0.6 * a), 0, TAU); g.fill(); break;
      case "mote": g.fillStyle = rgba(mix(pal.sun, WHITE, 0.4), a * a * 0.6); g.beginPath(); g.arc(X, Y, s * 0.6, 0, TAU); g.fill(); break;
      case "leaf": g.save(); g.translate(X, Y); g.rotate(p.rot + p.life * 5); g.fillStyle = `rgba(140,215,100,${a * 0.85})`; g.beginPath(); g.ellipse(0, 0, s, s * 0.45, 0, 0, TAU); g.fill(); g.restore(); break;
      case "bubble": g.strokeStyle = rgba(mix(pal.accent, WHITE, 0.5), a * 0.7); g.lineWidth = 1.2; g.beginPath(); g.arc(X, Y, s, 0, TAU); g.stroke(); break;
      case "star": g.fillStyle = rgba(WHITE, a * 0.85); g.fillRect(X - s / 2, Y - s / 2, s, s); break;
      case "glitter": { const r = s * (0.5 + 0.5 * a); g.fillStyle = rgba(p.k ? pal.accent : mix(pal.sun, WHITE, 0.3), a * 0.9); g.beginPath(); g.moveTo(X, Y - r); g.lineTo(X + r * 0.25, Y - r * 0.25); g.lineTo(X + r, Y); g.lineTo(X + r * 0.25, Y + r * 0.25); g.lineTo(X, Y + r); g.lineTo(X - r * 0.25, Y + r * 0.25); g.lineTo(X - r, Y); g.lineTo(X - r * 0.25, Y - r * 0.25); g.fill(); break; }
      default: g.fillStyle = rgba(WHITE, a * 0.6); g.fillRect(X - s / 2, Y - s / 2, s, s);
    }
  }

  // ================================================================ 평소의 날씨 (여기 없는 이름은 index.html의 피버 연출 그림(feverPrim)을 옅게 쓴다: rain, snow, leaves, embers, lanterns, code, haze …)
  const AMBIENT = {
    motes(e, a) {      // 빛 속에 떠다니는 먼지
      const g = e.g;
      for (let i = 0; i < 40; i++) {
        const span = e.w + 40, x = pm(H(i, 411) * span * 3 + Math.sin(e.now * 0.3 + i) * 20 - e.camS * e.BT * (0.1 + 0.1 * H(i, 412)), span) - 20, y = pm(H(i, 413) * e.gy - e.now * 4 * (0.3 + H(i, 414)), e.gy) ;
        g.fillStyle = rgba(mix(e.pal.sun, WHITE, 0.5), a * (0.25 + 0.4 * H(i, 415)) * (0.6 + 0.4 * Math.sin(e.now * 2 + i))); g.beginPath(); g.arc(x, y, 1 + 1.5 * H(i, 416), 0, TAU); g.fill();
      }
    },
    dust(e, a) {       // 공장: 비스듬히 흐르는 먼지
      const g = e.g; g.fillStyle = rgba(mix(e.pal.sun, WHITE, 0.3), a * 0.3);
      for (let i = 0; i < 50; i++) { const span = e.w + 40, x = pm(H(i, 421) * span * 3 - e.now * 30 * (0.5 + H(i, 422)) - e.camS * e.BT * 0.15, span) - 20, y = pm(H(i, 423) * e.gy + e.now * 8 * H(i, 424), e.gy); g.fillRect(x, y, 1.5 + 1.5 * H(i, 425), 1.2); }
    },
    marine(e, a) {     // 바다 눈: 천천히 가라앉는 흰 알갱이와 가끔 떠오르는 방울
      const g = e.g;
      for (let i = 0; i < 60; i++) { const span = e.w + 40, x = pm(H(i, 431) * span * 3 + Math.sin(e.now * 0.5 + i) * 12 - e.camS * e.BT * 0.12, span) - 20, y = pm(H(i, 432) * e.gy + e.now * 7 * (0.3 + H(i, 433)), e.gy); g.fillStyle = rgba(WHITE, a * (0.2 + 0.35 * H(i, 434))); g.fillRect(x, y, 1.6, 1.6); }
      g.strokeStyle = rgba(mix(e.pal.accent, WHITE, 0.5), a * 0.4); g.lineWidth = 1.2;
      for (let i = 0; i < 10; i++) { const span = e.w + 40, x = pm(H(i, 435) * span * 3 + Math.sin(e.now * 1.5 + i) * 6 - e.camS * e.BT * 0.2, span) - 20, y = e.gy - pm(H(i, 436) * e.gy + e.now * 30 * (0.5 + H(i, 437)), e.gy), r = 2 + 3 * H(i, 438); g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); }
    },
  };

  const ART = { sky: SKY, sun: SUN, far: FAR, edge: EDGE, grain: GRAIN, trail: TRAIL, ambient: AMBIENT, box: BOX, red: RED_SKIN, tile, particle };
  // 피버 연출 그림(index.html의 feverPrim)이 아는 이름: 평소의 날씨로 빌려 쓸 수 있다
  const FEVER_PRIMS = ["tunnel", "ring", "stars", "road", "code", "confetti", "rays", "grid", "lamps", "bubbles", "embers", "rain", "gears", "ribbons", "snow", "leaves", "planets", "haze", "lanterns"];
  const THEMES = { WORLDS, ROUND_THEME, themeFor, ART, TILE, FEVER_PRIMS };
  root.THEMES = THEMES;
  if (typeof module !== "undefined") module.exports = THEMES;
})(typeof window !== "undefined" ? window : globalThis);

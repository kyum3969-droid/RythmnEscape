// 실행: node bounce2d/tests/themes.test.js
// 월드 테마(themes.js): 라운드마다 월드가 있고, 쓰는 그림이 다 있고, 그림 함수가 오류 없이 돌고, 풍경에 빨강·분홍을 쓰지 않는지
const fs = require('fs'), path = require('path');
const T = require('../themes.js');
const Lg = require('../logic.js');
let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ok  ' : '  FAIL ') + msg); if (!c) fails++; };
const { WORLDS, ROUND_THEME, themeFor, ART, FEVER_PRIMS } = T;

console.log('== 라운드와 월드 ==');
ok(ROUND_THEME.length === Lg.COURSES.length, `라운드마다 테마가 있다 (${ROUND_THEME.length}/${Lg.COURSES.length})`);
const byWorld = {};
ROUND_THEME.forEach((r, i) => (byWorld[r.world] = byWorld[r.world] || []).push(i + 1));
ok(Object.keys(byWorld).every((w) => WORLDS[w]), '라운드가 가리키는 월드가 다 있다');
ok(Object.keys(WORLDS).every((w) => byWorld[w]), '쓰지 않는 월드가 없다');
for (const [w, rs] of Object.entries(byWorld)) console.log(`        ${WORLDS[w].name} (${w}): ${rs.join(', ')}라운드`);

console.log('== 연출 단계: 라운드가 갈수록 한 겹씩 더해진다 ==');
{
  const ts = ROUND_THEME.map((_, i) => themeFor(i));
  ok(ts.every((t, i) => i === 0 || t.tier >= ts[i - 1].tier), `단계는 뒤로 갈수록 내려가지 않는다 (${ts.map((t) => t.tier).join('')})`);
  ok(ts.every((t) => (t.tier === 1) === (t.world === 'classic')), '1단계 = 기본 그림, 2단계부터 월드');
  ok(ts.filter((t) => t.tier >= 2).every((t) => t.box !== 'plain' && t.red !== 'plain' && t.ground !== 'plain' && t.trail), '2단계부터: 눈이 가는 곳(길의 결, 박스·장애물 재질, 공 꼬리)이 바뀐다');
  ok(ts.every((t) => (t.tier >= 3) === !!t.ambient), '3단계부터: 평소의 날씨가 있다(그 전에는 없다)');
  ok([1, 2, 3, 4].every((k) => ts.some((t) => t.tier === k)), '네 단계가 모두 쓰인다');
}

console.log('== 쓰는 그림이 다 있다 ==');
const WALLS = ['eq', 'wave', 'dots'];
const themes = [...ROUND_THEME.map((_, i) => themeFor(i)), ...Object.keys(WORLDS).map((w) => themeFor(0, w))];
const miss = [];
for (const t of themes) {
  if (!ART.sky[t.sky]) miss.push('sky ' + t.sky);
  if (!ART.sun[t.sun]) miss.push('sun ' + t.sun);
  if (t.far.length !== 2) miss.push('far 두 겹이 아니다');
  for (const f of t.far) if (!ART.far[f]) miss.push('far ' + f);
  if (!ART.tile || !T.TILE[t.ground]) miss.push('ground ' + t.ground);
  if (!ART.edge[t.edge]) miss.push('edge ' + t.edge);
  if (!(t.grain in ART.grain)) miss.push('grain ' + t.grain);
  if (t.trail && !ART.trail[t.trail]) miss.push('trail ' + t.trail);
  if (!ART.box[t.box]) miss.push('box ' + t.box);
  if (!ART.red[t.red]) miss.push('red ' + t.red);
  if (t.ambient && !ART.ambient[t.ambient] && !FEVER_PRIMS.includes(t.ambient)) miss.push('ambient ' + t.ambient);
  if (!t.fever || !t.fever.back.every((b) => FEVER_PRIMS.includes(b) || ART.fever[b]) || !(WALLS.includes(t.fever.wall) || ART.feverWall[t.fever.wall]) || (t.fever.props && !ART.props[t.fever.props])) miss.push('fever ' + JSON.stringify(t.fever));
}
ok(miss.length === 0, `모든 라운드·월드의 그림 이름이 있다${miss.length ? ': ' + [...new Set(miss)].join(', ') : ''}`);
ok(themeFor(1, 'peaks').fever === ROUND_THEME[1].fever && themeFor(1, 'peaks').sky === WORLDS.peaks.sky, '월드 미리 보기: 그림은 그 월드 것, 피버 연출은 라운드 것');

console.log('== 피버의 물건 장애물 ==');
for (let i = 0; i < Lg.COURSES.length; i++) {
  const c = Lg.COURSES[i], t = themeFor(i);
  if (!c.rushProps && !t.fever.props) continue;
  const lv = Lg.buildLevel(c), shapes = new Set(lv.reds.map((q) => q.shape));
  ok(c.rushProps === t.fever.props && lv.reds.every((q) => q.shape && ART.props[t.fever.props][q.shape]), `${i + 1}라운드: 피버 장애물이 모두 물건(${[...shapes].join(', ')})이고 그 그림이 있다 (코스와 테마가 같은 무대: ${c.rushProps})`);
}

console.log('== 그림 함수가 오류 없이 돈다 (가짜 캔버스) ==');
// 가짜 캔버스: 어떤 호출도 받아 준다. 숫자 인자에 NaN·무한대가 들어가면 기록한다(그림이 사라지거나 깨지는 원인)
const bad = [];
function fakeCtx(tag) {
  const grad = { addColorStop: (o, c) => { if (!(o >= 0 && o <= 1)) bad.push(`${tag}: addColorStop(${o})`); } };
  return new Proxy({}, {
    get(o, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...a) => { if (a.some((v) => !Number.isFinite(v))) bad.push(`${tag}: ${k}(${a})`); if (k === 'createRadialGradient' && (a[2] < 0 || a[5] < 0)) bad.push(`${tag}: 음수 반지름`); return grad; };
      if (k === 'getTransform') return () => ({ a: 1, b: 0 });
      if (k in o) return o[k];
      return (...a) => {
        if (a.some((v) => typeof v === 'number' && !Number.isFinite(v))) bad.push(`${tag}: ${String(k)}(${a.join(',')})`);
        if ((k === 'arc' || k === 'ellipse') && a.slice(2, k === 'arc' ? 3 : 4).some((v) => v < 0)) bad.push(`${tag}: ${String(k)} 음수 반지름`);
      };
    },
    set(o, k, v) { o[k] = v; return true; },
  });
}
const pal = { top: [16, 26, 58], bottom: [42, 111, 151], accent: [125, 249, 255], sun: [255, 224, 102] };
let calls = 0, threw = [];
for (const [w, h] of [[844, 390], [390, 844]]) for (const beat of [-0.5, 0, 3.7, 41.25, 300]) for (const camY of [0, 3]) {
  const BT = Math.min(h / 8.6, w / 11), gy = w > h ? h - 1.5 * BT : h * 0.66;
  const e = { g: null, w, h, BT, T: BT * 0.9, gy, beat, now: beat * 0.4, pulse: Math.pow(1 - (beat - Math.floor(beat)), 3), pal, camS: beat * 4, camY, cx: w * 0.68, cy: gy - BT * 3.4, r0: BT * 1.5, skyGrad: {} };
  const run = (tag, fn) => { e.g = fakeCtx(tag); try { fn(); calls++; } catch (err) { threw.push(`${tag}: ${err.message}`); } };
  for (const k in ART.sky) run('sky ' + k, () => ART.sky[k](e));
  for (const k in ART.sun) run('sun ' + k, () => ART.sun[k](e));
  for (const k in ART.far) for (const [layer, bwk, par, dark, amp] of [[1, 1.7, 0.18, 0.45, 3.6], [2, 1.0, 0.42, 0.68, 2.4]]) run(`far ${k}/${layer}`, () => ART.far[k](e, { layer, bw: BT * bwk, par, amp, off: e.camS * BT * par, drop: camY * BT * par * 0.8, col: [20, 30, 40] }));
  for (const k in ART.edge) run('edge ' + k, () => ART.edge[k](e, -30, w + 30, -e.camS * e.T + 100));
  for (const k in ART.grain) if (ART.grain[k]) run('grain ' + k, () => ART.grain[k](e, { x0: 100, x1: 100 + e.T * 3, y0: -40, y1: gy }, -e.camS * e.T + 100, 17));
  for (const k in ART.box) run('box ' + k, () => { const B = ART.box[k]; for (const f of ['lo', 'hi', 'lit', 'deep', 'deepSky', 'line', 'glow']) if (typeof B[f] !== 'string') throw new Error(f + ' 색이 없다'); for (const hit of [0, 0.5, 1]) { if (!/^rgb/.test(B.flash(hit))) throw new Error('flash'); B.inner(e, { x0: 100, x1: 100 + e.T * 4, y0: gy - e.T * 2, y1: gy }, [[100, 100 + e.T * 2, gy - e.T], [100 + e.T * 2, 100 + e.T * 4, gy - e.T * 2]], 5, hit); B.inner(e, { x0: 100, x1: 300, y0: -40, y1: 80 }, [], 6, hit); } });
  for (const k in ART.red) run('red ' + k, () => { const R = ART.red[k]; for (const f of ['lo', 'hi', 'headLo', 'headHi']) if (typeof R[f] !== 'string') throw new Error(f + ' 색이 없다'); if (R.deco) { R.deco(e, { x0: 100, x1: 100 + e.T * 3, y0: -40, y1: gy }, 9, () => e.g.beginPath()); R.deco(e, { x0: 100, x1: 100 + e.T * 0.5, y0: gy - e.T, y1: gy }, 2, () => e.g.beginPath()); } });
  for (const k in ART.fever) run('fever ' + k, () => { ART.fever[k](e, 1); ART.fever[k](e, 0.4); });
  for (const k in ART.feverWall) run('feverWall ' + k, () => ART.feverWall[k](e, 0, w, gy - e.T * 3, gy, -e.camS * e.T + 100));
  for (const k in ART.props) run('props ' + k, () => { const Z = ART.props[k], pt = (x, hh) => [100 + x * e.T * 1.5, gy - hh * e.T];
    const fr = { B: [100, gy], A: [e.T * 1.5, 0], U: [0, -e.T], h0: 0 }; Z.chair(e.g, pt, { shape: 'chair', h: 1.5, w: 0.52 }, e, 1, fr); Z.chair(e.g, pt, { shape: 'chair', h: 0.9, w: 0.52 }, e, 1, fr);
    Z.strap(e.g, pt, { shape: 'strap', far: 4.6, len: 0.9, rr: 0.32, rw: 0.21, bw: 0.05 }, e, 3, fr); Z.ring(e.g, pt, { shape: 'ring', cy: 2.3, rr: 0.45, rw: 0.3 }, e, 3, fr); });
  for (const k in ART.ambient) run('ambient ' + k, () => ART.ambient[k](e, 0.4));
  for (const k in ART.trail) run('trail ' + k, () => { const p = ART.trail[k].make(10, 5); if (!(p.life > 0 && p.max > 0 && p.size > 0 && p.kind)) throw new Error('입자 모양이 이상하다'); for (const a of [1, 0.5, 0.01]) ART.particle(e.g, p, 100, 100, p.size * e.T, a, pal); });
}
ok(threw.length === 0, `그림 함수 ${calls}번 호출, 예외 없음${threw.length ? ': ' + [...new Set(threw)].slice(0, 5).join(' / ') : ''}`);
ok(bad.length === 0, `NaN·무한대·음수 반지름 없음${bad.length ? ': ' + [...new Set(bad)].slice(0, 5).join(' / ') : ''}`);

console.log('== 색 약속: 풍경·날씨·꼬리에 빨강·분홍을 쓰지 않는다 (빨간 덩어리의 결만 빨강) ==');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'themes.js'), 'utf8').split('\n');
  const hue = (r, g, b) => { [r, g, b] = [r / 255, g / 255, b / 255]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2; if (!d) return [0, 0]; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return [h, d / (1 - Math.abs(2 * l - 1))]; };
  const hits = [];
  src.forEach((line, n) => {
    if (/위험색/.test(line)) return;      // 빨간 덩어리에만 쓰는 색(표시해 둔 줄)
    const cols = [...line.matchAll(/\[(\d{1,3}), (\d{1,3}), (\d{1,3})\]/g), ...line.matchAll(/rgba\((\d{1,3}),(\d{1,3}),(\d{1,3})/g)].map((m) => m.slice(1, 4).map(Number));
    for (const m of line.matchAll(/#([0-9a-f]{6})\b/gi)) cols.push([0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)));
    for (const c of cols) { const [h, s] = hue(...c); if (s > 0.35 && (h >= 320 || h <= 15)) hits.push(`${n + 1}: rgb(${c})`); }
  });
  ok(hits.length === 0, `themes.js의 고정 색에 빨강·분홍이 없다${hits.length ? ': ' + hits.join(', ') : ''}`);
}

console.log('== 참고: 구간 색이 붉은 곳 (빨간 장애물과 헷갈릴 수 있다. 실패로 치지 않는다) ==');
{
  const DEF = { intro: '#3b1c6b', a: '#7a1f6e', b: '#0f6b78', c: '#8c1c3a', d: '#3d0f7a', rush: '#1b6ca8', outro: '#2a6f97' };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  Lg.COURSES.forEach((c, i) => {
    const P = Object.assign({}, DEF, Object.fromEntries(Object.entries(c.pal || {}).map(([k, v]) => [k, v.bottom])));
    const red = Object.entries(P).filter(([, v]) => { const [r, g, b] = hex(v).map((x) => x / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return false; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; return d / (1 - Math.abs(mx + mn - 1)) > 0.3 && (h >= 320 || h <= 25); });
    if (red.length) console.log(`        ${i + 1}라운드: ${red.map(([k, v]) => `${k} ${v}`).join(', ')}`);
  });
}

console.log(fails ? `\n${fails}개 실패` : '\n모두 통과');
process.exit(fails ? 1 : 0);

const { chromium } = require('playwright');
// 실행: curl -o web3d/tests/three.min.js https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js
//       node web3d/tests/e2e.js   (스크린샷은 web3d/tests/out/ 에 저장)
const path = require('path'), fs = require('fs');
const out = path.join(__dirname, 'out') + '/';
fs.mkdirSync(out, { recursive: true });
const FILE = 'file://' + path.join(__dirname, '..', 'index.html');
let fails = 0; const ok = (c, msg) => { console.log((c ? '  ok  ' : '  FAIL ') + msg); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ path: __dirname + '/three.min.js', contentType: 'application/javascript' }));
  await p.goto(FILE); await p.waitForTimeout(1200);
  await p.screenshot({ path: out + 'w_menu.png' });
  ok(await p.isVisible('#select'), '시작하면 스테이지 선택 화면');
  ok(await p.evaluate(() => window.__game.control) === 'pad' && (await p.textContent('#controlBtn')) === '조작: 십자 패드', '기본 조작은 십자 패드');
  const G = (fn, arg) => p.evaluate(fn, arg);
  await G(() => { window.__game.fake.on = true; });
  await p.click('#stages button:nth-child(1)'); await p.waitForTimeout(200);
  ok(await G(() => window.__game.phase) === 'ready' && await p.isVisible('#overlay'), '스테이지를 고르면 준비 화면');
  await p.screenshot({ path: out + 'w_ready.png' });
  await p.click('#ovButtons button'); await p.waitForTimeout(100);
  ok(await G(() => window.__game.phase) === 'playing', '시작 버튼 → 플레이 중');

  console.log('== 칸 탭 모드 (실제 포인터 이벤트) ==');
  await G(() => window.__game.setControl('tap'));
  const beat = (k) => G((k) => window.__game.tick(window.__game.J.beatTime(k)), k);
  const tapTile = async (x, y, dx = 0, dy = 0) => { const pt = await G(([x, y]) => window.__game.project({ x, y }), [x, y]); await p.touchscreen.tap(pt.x + dx, pt.y + dy); };
  await beat(3); await tapTile(2, 1);
  let st = await G(() => ({ p: window.__game.state.player, c: window.__game.J.counts }));
  ok(st.p.x === 2 && st.p.y === 1 && st.c.perfect === 1, '옆 칸 탭 = 그쪽으로 점프 (PERFECT)');
  await p.waitForTimeout(250);
  await beat(4); await tapTile(3, 1, 8, 14);
  st = await G(() => window.__game.state.player); ok(st.x === 3 && st.y === 1, '칸 중앙에서 살짝 벗어나도 같은 방향');
  await p.waitForTimeout(250);
  await beat(5); await tapTile(3, 1);
  st = await G(() => ({ p: window.__game.state.player, t: window.__game.state.turn })); ok(st.p.x === 3 && st.t === 3, '병아리 탭 = 대기');
  // 예약: 반 박자 일찍 탭 → 다음 박자에 실행
  await G((k) => { window.__game.fake.t = window.__game.J.beatTime(k) - 0.3; }, 6);
  await tapTile(4, 1);
  st = await G(() => ({ p: window.__game.state.player, pend: window.__game.J.pending })); ok(st.p.x === 3 && st.pend === 'right', '일찍 탭 = 예약(아직 안 움직임)');
  await p.waitForTimeout(120);
  await p.screenshot({ path: out + 'w_reserve.png' });
  await beat(6);
  st = await G(() => window.__game.state.player); ok(st.x === 4, '박자가 오면 예약대로 점프');

  console.log('== 스와이프 모드 (실제 마우스 드래그) ==');
  await G(() => { const g = window.__game; g.setControl('swipe'); g.loadStage(0); g.startRun(); });
  const stageCenter = () => p.$eval('#stage', (e) => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height * 0.75 }; });
  const swipeFrom = async (pt, dx, dy) => { await p.mouse.move(pt.x, pt.y); await p.mouse.down(); await p.mouse.move(pt.x + dx, pt.y + dy, { steps: 4 }); await p.mouse.up(); };
  const info = () => G(() => ({ p: window.__game.state.player, t: window.__game.state.turn, c: { ...window.__game.J.counts }, pend: window.__game.J.pending }));
  await beat(3); await swipeFrom(await stageCenter(), 60, 5);
  let s1 = await info(); ok(s1.p.x === 2 && s1.c.perfect === 1, '오른쪽으로 밀기 = 오른쪽 점프 (PERFECT)');
  await p.waitForTimeout(250);
  await beat(4); await swipeFrom(await stageCenter(), 0, 0);
  s1 = await info(); ok(s1.p.x === 2 && s1.t === 2, '움직이지 않고 톡 = 대기');
  await p.waitForTimeout(250);
  // 박자 +0.1초에 손가락이 닿고, 방향은 박자 범위가 지난 뒤(+0.4초)에 정해져도 손가락이 닿은 시각으로 판정
  let pt = await stageCenter();
  await G((k) => { window.__game.fake.t = window.__game.J.beatTime(k) + 0.1; }, 5);
  await p.mouse.move(pt.x, pt.y); await p.mouse.down();
  await G((k) => { window.__game.fake.t = window.__game.J.beatTime(k) + 0.4; }, 5);
  await p.waitForTimeout(120);       // 그 사이 프레임이 돌아도 박자가 '대기'로 넘어가면 안 됨
  s1 = await info(); ok(s1.t === 2, '방향이 정해지기 전에는 박자를 붙잡아 둔다');
  await p.mouse.move(pt.x + 50, pt.y, { steps: 3 }); await p.mouse.up();
  s1 = await info(); ok(s1.p.x === 3 && s1.t === 3 && s1.c.good === 1, '손가락이 닿은 순간(+0.1초) 기준 GOOD으로 점프');
  await p.waitForTimeout(250);
  // 아래쪽 박자 바 위에서 밀어도 된다 (엄지 자리)
  const bar = await p.$eval('#beatbar', (e) => { const b = e.getBoundingClientRect(); return { x: b.left + b.width * 0.3, y: b.top + b.height / 2 }; });
  await beat(6); await swipeFrom(bar, 55, -4);
  s1 = await info(); ok(s1.p.x === 4, '박자 바 위에서 밀어도 점프 (엄지 위치)');
  await p.waitForTimeout(250);
  // 일찍 밀기 = 예약
  await G((k) => { window.__game.fake.t = window.__game.J.beatTime(k) - 0.3; }, 7);
  await swipeFrom(await stageCenter(), 60, 0);
  s1 = await info(); ok(s1.p.x === 4 && s1.pend === 'right', '박자 전에 밀기 = 예약');
  await beat(7); s1 = await info(); ok(s1.p.x === 5, '박자에 예약대로 점프');
  await p.waitForTimeout(150);
  await p.screenshot({ path: out + 'w_swipe.png' });

  console.log('== 십자 패드 모드 ==');
  await G(() => { const g = window.__game; g.setControl('pad'); g.loadStage(0); g.startRun(); });
  ok(await p.isVisible('#pad') && !(await p.isVisible('#hint')) && !(await p.isVisible('#bottomRow')), '패드 표시, 힌트/아래 버튼 줄은 숨김');
  await beat(3); await p.click('#pad [data-act=right]');
  s1 = await info(); ok(s1.p.x === 2 && s1.c.perfect === 1, '패드 ▶ = 오른쪽 점프 (PERFECT)');
  await p.waitForTimeout(250);
  await beat(4); await p.click('#pad [data-act=wait]');
  s1 = await info(); ok(s1.t === 2 && s1.p.x === 2, '패드 대기');
  await p.screenshot({ path: out + 'w_pad.png' });
  await p.click('#padMenu'); await p.waitForTimeout(150);
  ok(await p.isVisible('#select'), '패드의 메뉴 버튼');
  await p.click('#controlBtn');
  ok((await p.textContent('#controlBtn')) === '조작: 스와이프' && await G(() => window.__game.control) === 'swipe', '메뉴에서 조작 방식 바꾸기 (패드 → 스와이프)');
  await p.click('#stages button:nth-child(1)'); await p.waitForTimeout(100);
  ok((await p.textContent('#ovSub')).includes('밀기'), '준비 화면 안내가 조작 방식에 맞게 바뀜');

  console.log('== 스테이지 4 클리어 / 6 실패 ==');
  const run = async (stage, seq) => {
    await G((i) => { const g = window.__game; g.loadStage(i); g.startRun(); }, stage);
    const M = { u: 'up', d: 'down', l: 'left', r: 'right', w: 'wait' };
    for (let i = 0; i < seq.length; i++) {
      if (await G(() => window.__game.state.status) !== 'playing') break;
      await beat(3 + i);
      await G((a) => window.__game.act(a), M[seq[i]]);
      if (i === 4 && stage === 3) { await p.waitForTimeout(70); await p.screenshot({ path: out + 'w_mid.png' }); }
    }
  };
  await run(3, 'dddddwdrrrrrr');
  ok(await G(() => window.__game.state.status) === 'won', '스테이지 4: 박자에 맞춰 클리어');
  ok(await G(() => window.__game.J.rank()) === 'S', '전부 PERFECT → S');
  await p.waitForTimeout(1400);
  ok(await p.isVisible('#overlay') && (await p.textContent('#ovTitle')) === '탈출 성공!', '클리어 결과 화면');
  await p.screenshot({ path: out + 'w_win.png' });
  await run(5, 'rrrrddllll');
  ok(await G(() => window.__game.state.status) === 'dead', '스테이지 6: 무작정 가면 잡힘');
  await p.waitForTimeout(1400);
  ok((await p.textContent('#ovTitle')) === '실패', '실패 결과 화면');
  await p.screenshot({ path: out + 'w_dead.png' });

  console.log('== 퍼즐 모드 ==');
  await G(() => { const g = window.__game; g.setRhythm(false); g.loadStage(0); g.act('right'); g.act('right'); g.act('up'); g.undo(); });
  st = await G(() => ({ p: window.__game.state.player, t: window.__game.state.turn }));
  ok(st.t === 1 && st.p.x === 2, '즉시 이동 · 벽은 턴 안 씀 · 되돌리기');

  console.log('== 따라가는 카메라: 칸 크기 일정 / 병아리는 늘 화면 안 ==');
  await G(() => window.__game.setRhythm(true));
  const tileSize = () => G(() => {
    const g = window.__game, pl = g.state.player;
    const a = g.project(pl), b = g.project({ x: pl.x + 1, y: pl.y });
    const r = document.getElementById('stage').getBoundingClientRect();
    return { size: Math.hypot(b.x - a.x, b.y - a.y), inside: a.x > r.left && a.x < r.right && a.y > r.top && a.y < r.bottom };
  });
  for (const [w, h] of [[390, 844], [360, 640], [430, 932]]) {
    await p.setViewportSize({ width: w, height: h });
    const sizes = [];
    for (let s = 0; s < 6; s++) {
      await G((i) => { const g = window.__game; g.loadStage(i); g.startRun(); g.settle(); }, s);
      await p.waitForTimeout(60);
      const t = await tileSize();
      sizes.push(t.size);
      if (!t.inside) ok(false, `${w}x${h} 스테이지 ${s + 1}: 병아리가 화면 밖`);
    }
    const mn = Math.min(...sizes), mx = Math.max(...sizes);
    // 원근 때문에 병아리가 화면 아래쪽(가까운 줄)에 있으면 칸이 조금 커 보인다 → ±15% 허용
    ok(mx / mn < 1.15 && mn > w / 9, `${w}x${h}: 6개 스테이지 칸 크기 ${mn.toFixed(0)}~${mx.toFixed(0)}px (원근 차 15% 이내, 화면폭의 1/9 이상)`);
  }
  await p.setViewportSize({ width: 390, height: 844 });
  // 스테이지 6을 끝까지 따라가며 병아리가 계속 화면 안에 있는지
  await G(() => { const g = window.__game; g.loadStage(5); g.startRun(); g.settle(); });
  const M2 = { u: 'up', d: 'down', l: 'left', r: 'right', w: 'wait' }, path6 = 'rwrrrddrruurrdd';
  let allIn = true;
  for (let i = 0; i < path6.length; i++) {
    await beat(3 + i); await G((a) => window.__game.act(a), M2[path6[i]]);
    await p.waitForTimeout(260);
    if (!(await tileSize()).inside) allIn = false;
    if (i === 8) await p.screenshot({ path: out + 'w_follow.png' });
  }
  ok(allIn && await G(() => window.__game.state.status) === 'won', '스테이지 6 내내 병아리가 화면 안 + 클리어');

  console.log('== 미니맵 / 전체 맵 보기 ==');
  await p.waitForTimeout(1300);
  await G(() => { const g = window.__game; g.loadStage(4); g.startRun(); });
  await p.waitForTimeout(700);
  ok(await p.isVisible('#mapBtn') && !(await G(() => window.__game.overview)), '플레이 중에는 따라가기 + 미니맵 표시');
  await p.click('#mapBtn'); await p.waitForTimeout(900);
  const corners = await G(() => {
    const g = window.__game, st = g.state, r = document.getElementById('stage').getBoundingClientRect();
    const W = st.grid[0].length, H = st.grid.length;
    return [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]].map(([x, y]) => g.project({ x, y })).every((pt) => pt.x >= r.left && pt.x <= r.right && pt.y >= r.top && pt.y <= r.bottom);
  });
  ok(corners && await G(() => window.__game.overview), '미니맵 탭 → 전체 맵(네 모서리 모두 화면 안)');
  await p.screenshot({ path: out + 'w_overview.png' });
  await p.click('#mapBtn'); await p.waitForTimeout(300);
  ok(!(await G(() => window.__game.overview)), '다시 탭 → 따라가기');
  await G(() => window.__game.loadStage(2)); await p.waitForTimeout(300);
  ok(await G(() => window.__game.overview), '시작 전(준비 화면)에는 전체 맵');
  await p.setViewportSize({ width: 390, height: 844 });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '가로 스크롤 없음');
  console.log('콘솔/페이지 오류:', errs.length ? errs : '없음');
  console.log('실패 ' + fails + '건');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();

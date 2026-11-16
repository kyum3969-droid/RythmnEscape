// 실행: node bounce2d/tests/e2e.js   (스크린샷은 bounce2d/tests/out/)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const out = path.join(__dirname, 'out') + '/';
fs.mkdirSync(out, { recursive: true });
const FILE = 'file://' + path.join(__dirname, '..', 'index.html');
let fails = 0; const ok = (c, msg) => { console.log((c ? '  ok  ' : '  FAIL ') + msg); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(FILE); await p.waitForTimeout(900);
  const G = (fn, arg) => p.evaluate(fn, arg);
  const tick = (beat) => G((bt) => window.__game.tickTo(bt), beat);
  ok(await G(() => window.__game.phase) === 'title' && (await p.textContent('#ovTitle')).includes('BOUNCE'), '타이틀 화면');
  await p.screenshot({ path: out + 'title.png' });

  console.log('== 실제 시계로 저절로 튀는지 ==');
  await p.click('#ovButtons button'); await p.waitForTimeout(1500);
  let st = await G(() => ({ step: window.__game.state.step, phase: window.__game.phase }));
  const expect = 1.4 / (60 / await G(() => window.__game.bpm)) * 96;
  ok(st.phase === 'running' && st.step > expect * 0.7 && st.step < expect * 1.2 && await G(() => window.__game.bpm) === 96, `기본 속도 96 BPM, 1.5초 뒤 약 ${Math.round(expect)}스텝 진행 (실제 ${st.step})`);

  console.log('== 왼쪽 누르고 있기 = 멈춤, 오른쪽 누르기 = 대시 (실제 포인터) ==');
  await G(() => { const g = window.__game; g.pause(); g.fake.on = true; g.startFresh(); });
  await tick(4.5);                                          // 두 번째 박자에서 튄 뒤 꼭대기
  const h0 = await G(() => 9 - window.__game.state.y);
  await p.mouse.move(150, 200); await p.mouse.down();
  await tick(4.9);
  st = await G(() => ({ f: window.__game.state.frozen, h: 9 - window.__game.state.y, zone: document.getElementById('zoneL').classList.contains('on') }));
  ok(st.f && Math.abs(st.h - h0) < 0.02 && st.zone, `왼쪽을 누르고 있으면 공이 그 높이(${h0.toFixed(2)}칸)에 멈춘다`);
  await p.waitForTimeout(80); await p.screenshot({ path: out + 'freeze.png' });
  await p.mouse.up();
  await tick(5.1);
  st = await G(() => ({ f: window.__game.state.frozen, h: 9 - window.__game.state.y }));
  ok(!st.f && st.h < h0 - 0.1, '손을 떼면 다시 떨어진다');
  await G(() => window.__game.startFresh());
  await tick(4.4);
  await p.mouse.click(700, 200);
  await tick(4.5);
  st = await G(() => ({ d: window.__game.state.dashing, lead: window.__game.state.lead }));
  ok(st.d > 0 && st.lead > 0, '오른쪽을 누르면 대시');
  await G(() => window.__game.startFresh());
  await tick(4.5);
  await p.keyboard.down('ArrowLeft'); await tick(4.7);
  const kf = await G(() => window.__game.state.frozen);
  await p.keyboard.up('ArrowLeft'); await p.keyboard.press('ArrowRight'); await tick(4.75);
  ok(kf && await G(() => window.__game.state.dashing) > 0, '키보드: ← 누르고 있기 = 멈춤, → = 대시');

  console.log('== 속도 단계 ==');
  await G(() => window.__game.pause()); await p.waitForTimeout(80);
  ok((await p.textContent('#speedBtn')).startsWith('속도: 보통'), '기본값은 보통');
  await p.screenshot({ path: out + 'options.png' });
  await p.click('#speedBtn'); await p.waitForTimeout(40);
  ok((await p.textContent('#speedBtn')).startsWith('속도: 빠름') && await G(() => window.__game.bpm) === 96, '버튼을 누르면 표시가 바뀌고, 달리기 전에는 아직 적용 안 됨');
  await G(() => window.__game.startFresh());
  ok(await G(() => window.__game.bpm) === 112 && Math.abs(await G(() => window.__game.spb) - 60 / 112) < 1e-9, '다시 시작하면 적용 (112 BPM)');
  await p.reload(); await p.waitForTimeout(700);
  ok((await p.textContent('#speedBtn')).startsWith('속도: 빠름'), '새로고침해도 유지');
  await p.click('#speedBtn'); await p.click('#speedBtn'); await p.click('#speedBtn');
  ok((await p.textContent('#speedBtn')).startsWith('속도: 보통'), '느림 → 보통 → 빠름 → 아주 빠름 순서로 돈다');
  await G(() => { const g = window.__game; g.fake.on = true; g.startFresh(); });

  console.log('== 죽음과 재도전 ==');
  await G(() => window.__game.startFresh());
  await tick(12);
  st = await G(() => ({ phase: window.__game.phase, cause: window.__game.state.cause, bar: Math.floor(window.__game.state.x / 16) }));
  ok(st.phase === 'dead' && st.cause === 'spike' && st.bar === 2, '아무것도 안 누르면 첫 가시에서 죽는다');
  await p.waitForTimeout(250); await p.mouse.click(150, 200); await p.waitForTimeout(50);
  ok(await G(() => window.__game.phase) === 'running' && await G(() => window.__game.tries) === 2 && !(await G(() => window.__game.holding())), '죽은 뒤 어디든 누르면 바로 재도전');

  console.log('== 자동 풀이로 끝까지 ==');
  await G(() => { const g = window.__game; g.setBot(solve(g.L, spawnState(g.L, -1), { grid: 12 }).plan); g.startFresh(); });
  const shots = { 10: 'a_fz1', 13.5: 'a_over', 25.75: 'a_sawland', 29.5: 'a_fz2', 41.5: 'b_wall', 57.5: 'b_walldouble', 73.5: 'c_long', 118.5: 'd_padwall' };
  for (let beat = 0; beat <= 172; beat += 0.25) {
    await tick(beat);
    if (shots[beat]) { await p.waitForTimeout(80); await p.screenshot({ path: out + shots[beat] + '.png' }); }
    if (await G(() => window.__game.phase) !== 'running') break;
  }
  st = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp, cause: window.__game.state.cause, x: window.__game.state.x }));
  ok(st.phase === 'won' && st.cp === 3, '풀이대로 누르면 완주, 체크포인트 4개 통과' + (st.phase === 'won' ? '' : ` (${st.cause} @마디 ${Math.floor(st.x / 16)})`));
  await p.waitForTimeout(200);
  ok((await p.textContent('#ovTitle')).includes('CLEAR') && (await p.textContent('#pct')) === '100%', '완주 화면, 진행률 100%');

  console.log('== 개발자 모드 / 화면 방향 ==');
  await p.click('#devToggle'); await p.waitForTimeout(50);
  await p.click('#devJumps button:nth-child(3)'); await p.waitForTimeout(80);
  st = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp, x: window.__game.state.x, col: window.__game.L.cps[1].col }));
  ok(st.phase === 'running' && st.cp === 1 && st.x === st.col - 4, '개발자 모드: CP2 버튼으로 바로 이동');
  for (const [w, h, name] of [[390, 844, 'portrait'], [844, 390, 'landscape'], [360, 640, 'small']]) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(150);
    await G(() => { const g = window.__game; g.devJump(-1); });
    for (let beat = 0; beat <= 21; beat += 0.25) await tick(beat);
    await p.waitForTimeout(80);
    const v = await G(() => { const v = window.__game.view; const z = document.getElementById('zoneL').getBoundingClientRect(); return { ahead: (v.w - v.px) / v.T, rows: v.groundY / v.T, scroll: document.documentElement.scrollWidth <= window.innerWidth, zone: z.bottom <= window.innerHeight + 1 && z.top > v.groundY }; });
    ok(v.ahead >= 8 && v.rows >= 6.5 && v.scroll && v.zone, `${name} ${w}x${h}: 앞쪽 ${v.ahead.toFixed(1)}칸 보임, 위쪽 ${v.rows.toFixed(1)}칸, 조작 안내는 바닥 아래쪽`);
    await p.screenshot({ path: out + name + '.png' });
  }
  console.log('콘솔/페이지 오류:', errs.length ? errs : '없음');
  console.log('실패 ' + fails + '건');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();

// 실행: node runner2d/tests/e2e.js   (스크린샷은 runner2d/tests/out/)
// 헤드리스 Chromium에서 실제 화면을 띄워 흐름을 확인한다. 박자는 가짜 시계로 제어.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const out = path.join(__dirname, 'out') + '/';
fs.mkdirSync(out, { recursive: true });
const FILE = 'file://' + path.join(__dirname, '..', 'index.html');
let fails = 0; const ok = (c, msg) => { console.log((c ? '  ok  ' : '  FAIL ') + msg); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(FILE); await p.waitForTimeout(900);
  const G = (fn, arg) => p.evaluate(fn, arg);
  ok(await p.isVisible('#overlay') && await G(() => window.__game.phase) === 'title', '시작하면 타이틀 화면');
  await p.screenshot({ path: out + 'title.png' });

  console.log('== 실제 시계(오디오)로 달리는지 ==');
  await p.click('#ovButtons button'); await p.waitForTimeout(1500);
  const real = await G(() => ({ step: window.__game.state.step, phase: window.__game.phase }));
  const expect = 1.4 / (60 / 128) * 96;
  ok(real.phase === 'running' && real.step > expect * 0.7 && real.step < expect * 1.2, `1.5초 뒤 약 ${Math.round(expect)}스텝 진행 (실제 ${real.step})`);

  console.log('== 가짜 시계로 흐름 확인 ==');
  await G(() => { const g = window.__game; g.pause(); g.fake.on = true; g.startFresh(); });
  await G(() => window.__game.tickTo(12));
  let st = await G(() => ({ phase: window.__game.phase, cause: window.__game.state.cause, bar: Math.floor(window.__game.state.x / 16) }));
  ok(st.phase === 'dead' && st.cause === 'spike' && st.bar === 2, '아무것도 안 누르면 첫 가시에서 죽는다');
  await p.waitForTimeout(250);
  await p.touchscreen.tap(400, 200); await p.waitForTimeout(50);
  st = await G(() => ({ phase: window.__game.phase, tries: window.__game.tries, step: window.__game.state.step }));
  ok(st.phase === 'running' && st.tries === 2 && st.step === 0, '죽은 뒤 화면을 누르면 바로 재도전 (시도 2, 처음부터)');

  console.log('== 화면 누르기: 점프 → 공중에서 한 번 더 = 대시 ==');
  await G(() => window.__game.tickTo(8.5));
  await p.touchscreen.tap(400, 200);
  await G(() => window.__game.tickTo(8.75));
  st = await G(() => ({ g: window.__game.state.onGround, d: window.__game.state.dashing }));
  ok(!st.g && st.d === 0, '땅에서 누르면 점프');
  await p.touchscreen.tap(400, 200);
  await G(() => window.__game.tickTo(8.85));
  st = await G(() => ({ d: window.__game.state.dashing, lead: window.__game.state.lead, vy: window.__game.state.vy }));
  ok(st.d > 0 && st.lead > 0 && st.vy === 0, '공중에서 한 번 더 누르면 대시 (떨어지지 않고 앞으로 나감)');
  await p.waitForTimeout(60);
  await p.screenshot({ path: out + 'dash.png' });
  await p.touchscreen.tap(400, 200);
  await G(() => window.__game.tickTo(9.0));
  st = await G(() => window.__game.state.dashAvail);
  ok(st === false, '대시는 한 번 점프에 한 번만');

  console.log('== 자동 풀이로 끝까지 ==');
  await G(() => { const g = window.__game; g.setBot(solve(g.L, spawnState(g.L, -1), { grid: 12 }).presses); g.startFresh(); });
  const shots = { 26.25: 'a_sawlow', 30: 'a_nojump', 53.75: 'b_pad', 65.25: 'b_saws', 74: 'c_rings', 94: 'c_padwall', 98.5: 'c_rings2', 105.75: 'e_gate', 113.5: 'e_bounce', 125.75: 'e_bbpad', 129.75: 'e_bbring', 141.75: 'd_sawmix', 162.5: 'd_ringfinal' };
  const modes = {};
  for (let beat = 0; beat <= 172; beat += 0.25) {
    await G((bt) => window.__game.tickTo(bt), beat);
    if (beat === 100 || beat === 112 || beat === 134) modes[beat] = await G(() => window.__game.state.mode);
    if (shots[beat]) { await p.waitForTimeout(80); await p.screenshot({ path: out + shots[beat] + '.png' }); }
    if (await G(() => window.__game.phase) !== 'running') break;
  }
  st = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp, broken: window.__game.broken.size, cause: window.__game.state.cause, x: window.__game.state.x }));
  ok(st.phase === 'won', '풀이대로 누르면 완주' + (st.phase === 'won' ? '' : ` (${st.cause} @마디 ${Math.floor(st.x / 16)})`));
  ok(st.cp === 3 && st.broken > 0, '체크포인트 4개 통과, 대시벽이 깨져 사라짐');
  ok(modes[100] === 'run' && modes[112] === 'bounce' && modes[134] === 'run', '관문을 깨면 바운스 모드, 다시 깨면 달리기 모드');
  await p.waitForTimeout(200);
  ok(await p.isVisible('#overlay') && (await p.textContent('#ovTitle')).includes('CLEAR'), '완주 화면');
  ok((await p.textContent('#pct')) === '100%' && (await p.textContent('#best')).includes('100'), '진행률 100%, 최고 기록 저장');
  await p.screenshot({ path: out + 'clear.png' });

  console.log('== 바운스 모드: 점프는 저절로, 입력은 대시만 ==');
  await G(() => { const g = window.__game; g.startFresh(); });
  for (let beat = 0; beat <= 108; beat += 0.25) await G((bt) => window.__game.tickTo(bt), beat);
  await G(() => window.__game.setBot(null));
  await G(() => window.__game.tickTo(109.5));
  st = await G(() => ({ mode: window.__game.state.mode, g: window.__game.state.onGround, phase: window.__game.phase }));
  ok(st.mode === 'bounce' && !st.g && st.phase === 'running', '아무것도 안 눌러도 박자에 맞춰 튀어 오른다');
  await p.touchscreen.tap(400, 200);
  await G(() => window.__game.tickTo(109.6));
  st = await G(() => ({ d: window.__game.state.dashing }));
  ok(st.d > 0, '공중에서 누르면 대시');
  await G(() => { const g = window.__game; g.respawn(); });
  for (let beat = 99; beat <= 108; beat += 0.25) await G((bt) => window.__game.tickTo(bt), beat);
  st = await G(() => ({ phase: window.__game.phase, cause: window.__game.state.cause, cp: window.__game.state.cp }));
  ok(st.phase === 'dead' && st.cause === 'wall' && st.cp === 2, '입력 없이 달리면 모드 관문에 부딪혀 죽는다 (체크포인트 3에서 재시작한 상태)');
  await G(() => { const g = window.__game; g.setBot(solve(g.L, spawnState(g.L, -1), { grid: 12 }).presses); });

  console.log('== 체크포인트에서 다시 시작 ==');
  await G(() => { const g = window.__game; g.startFresh(); });
  for (let beat = 0; beat <= 39; beat += 0.25) await G((bt) => window.__game.tickTo(bt), beat);
  ok(await G(() => window.__game.state.cp) === 0 && (await p.$$eval('#bar .tick.on', (e) => e.length)) === 1, '체크포인트 1 통과 (진행 막대 표시 켜짐)');
  await G(() => { const g = window.__game; g.setBot(null); g.tickTo(48); });
  st = await G(() => ({ phase: window.__game.phase, bar: Math.floor(window.__game.state.x / 16), tries: window.__game.tries }));
  ok(st.phase === 'dead' && st.bar === 10, '그 뒤 아무것도 안 누르면 첫 대시 구간에서 죽는다');
  await p.waitForTimeout(250);
  await p.touchscreen.tap(400, 200); await p.waitForTimeout(50);
  st = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp, x: window.__game.state.x, tries: window.__game.tries, beat: window.__game.fake.beat, cpCol: window.__game.L.cps[0].col }));
  ok(st.phase === 'running' && st.cp === 0 && st.x === st.cpCol - 4 && st.beat === st.cpCol / 4 - 1 && st.tries === 2, '체크포인트 한 박자 앞에서 재시작, 음악 위치도 거기로');

  console.log('== 개발자 모드: 체크포인트로 바로 이동 ==');
  await p.click('#pauseBtn'); await p.waitForTimeout(100);
  ok(!(await p.isVisible('#devJumps')) && !(await p.isVisible('#devTag')), '꺼져 있으면 이동 버튼이 안 보인다');
  await p.keyboard.press('3'); await p.waitForTimeout(50);
  ok(await G(() => window.__game.phase) === 'paused', '꺼져 있으면 숫자 키도 동작하지 않는다');
  await p.click('#devToggle'); await p.waitForTimeout(50);
  const labels = await p.$$eval('#devJumps button', (bs) => bs.map((b) => b.textContent));
  ok(labels.length === 5 && labels[0].startsWith('처음') && labels[4].startsWith('CP4') && await p.isVisible('#devTag'), `켜면 이동 버튼 5개: ${labels.join(' / ')}`);
  const bestBefore = await G(() => window.__game.best);
  await p.click('#devJumps button:nth-child(4)'); await p.waitForTimeout(80);       // CP3
  st = await G(() => { const g = window.__game; return { phase: g.phase, cp: g.state.cp, x: g.state.x, col: g.L.cps[2].col, beat: g.fake.beat, mode: g.state.mode, overlay: !document.getElementById('overlay').hidden, ticks: document.querySelectorAll('#bar .tick.on').length }; });
  ok(st.phase === 'running' && st.cp === 2 && st.x === st.col - 4 && st.beat === st.col / 4 - 1 && !st.overlay && st.ticks === 3, 'CP3 버튼: 세 번째 체크포인트 한 박자 앞에서 바로 시작 (음악 위치·진행 막대도 맞춤)');
  await G(() => { const g = window.__game; g.setBot(null); g.tickTo(g.fake.beat + 12); });
  ok(await G(() => window.__game.phase) === 'dead' && await G(() => window.__game.best) === bestBefore, '건너뛰어 시작한 판은 죽어도 최고 기록이 바뀌지 않는다');
  await p.keyboard.press('4'); await p.waitForTimeout(80);
  st = await G(() => ({ cp: window.__game.state.cp, mode: window.__game.state.mode, phase: window.__game.phase }));
  ok(st.cp === 3 && st.mode === 'run' && st.phase === 'running', '숫자 키 4: 바운스 구간 뒤의 체크포인트 4로 이동 (달리기 모드)');
  await p.keyboard.press('0'); await p.waitForTimeout(80);
  ok(await G(() => window.__game.state.cp) === -1 && await G(() => window.__game.state.step) === 0, '숫자 키 0: 처음으로');
  await p.reload(); await p.waitForTimeout(700);
  ok(await G(() => window.__game.dev) === true && await p.isVisible('#devJumps'), '새로고침해도 개발자 모드가 유지된다');
  await G(() => { const g = window.__game; g.fake.on = true; g.setBot(solve(g.L, spawnState(g.L, -1), { grid: 12 }).presses); g.devJump(0); });

  console.log('== 일시정지 / 화면 방향 ==');
  await p.click('#pauseBtn'); await p.waitForTimeout(100);
  ok(await G(() => window.__game.phase) === 'paused' && await p.isVisible('#overlay'), '일시정지');
  await p.click('#ovButtons button'); await p.waitForTimeout(100);
  ok(await G(() => window.__game.phase) === 'running' && await G(() => window.__game.state.cp) === 0, '계속하기 = 마지막 체크포인트부터');
  for (const [w, h, name] of [[390, 844, 'portrait'], [844, 390, 'landscape'], [360, 640, 'small']]) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(150);
    await G(() => { const g = window.__game; g.setBot(solve(g.L, spawnState(g.L, -1), { grid: 12 }).presses); g.startFresh(); });
    for (let beat = 0; beat <= 26; beat += 0.25) await G((bt) => window.__game.tickTo(bt), beat);
    await p.waitForTimeout(80);
    const v = await G(() => { const g = window.__game, v = g.view; return { ahead: (v.w - v.px) / v.T, rows: v.groundY / v.T, scroll: document.documentElement.scrollWidth <= window.innerWidth }; });
    ok(v.ahead >= 8 && v.rows >= 6.5 && v.scroll, `${name} ${w}x${h}: 앞쪽 ${v.ahead.toFixed(1)}칸(${(v.ahead / 4).toFixed(1)}박자) 보임, 위쪽 ${v.rows.toFixed(1)}칸, 가로 스크롤 없음`);
    await p.screenshot({ path: out + name + '.png' });
  }
  console.log('콘솔/페이지 오류:', errs.length ? errs : '없음');
  console.log('실패 ' + fails + '건');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();

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

  console.log('== 왼쪽 누르고 있기 = 멈춤, 오른쪽 누르기 = 점프 (실제 포인터) ==');
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
  st = await G(() => ({ dj: window.__game.state.djAvail, vy: window.__game.state.vy, g: window.__game.state.onGround }));
  ok(!st.dj && st.vy < -5 && !st.g, '공중에서 오른쪽을 누르면 이단 점프 (다시 위로 솟음, 한 번만)');
  await p.waitForTimeout(60); await p.screenshot({ path: out + 'double.png' });
  // 이단 점프 뒤 박자와 어긋나게 착지 → 굴러가는 중에 오른쪽을 누르면 그 자리에서 점프
  let bt = 4.5; while (!(await G(() => window.__game.state.onGround)) && bt < 8) { bt += 0.05; await tick(bt); }
  const rollX = await G(() => window.__game.state.x);
  await tick(bt + 0.05);
  ok(await G(() => window.__game.state.onGround), `박자와 어긋나게 착지하면 굴러간다 (x=${rollX.toFixed(1)})`);
  await p.mouse.click(700, 200); await tick(bt + 0.1);
  st = await G(() => ({ g: window.__game.state.onGround, vy: window.__game.state.vy, dj: window.__game.state.djAvail }));
  ok(!st.g && st.vy < 0 && st.dj, '굴러가는 중에 오른쪽을 누르면 그 자리에서 점프');
  await G(() => window.__game.startFresh());
  await tick(4.5);
  await p.keyboard.down('ArrowLeft'); await tick(4.7);
  const kf = await G(() => window.__game.state.frozen);
  await p.keyboard.up('ArrowLeft'); await p.keyboard.press('ArrowRight'); await tick(4.75);
  ok(kf && await G(() => !window.__game.state.djAvail && window.__game.state.vy < 0), '키보드: ← 누르고 있기 = 멈춤, → = 점프');

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
  ok(st.phase === 'dead' && st.cause === 'spike' && st.bar === 2, '아무것도 안 누르면 첫 장애물(매달린 덩어리)에서 죽는다');
  await p.waitForTimeout(250); await p.mouse.click(150, 200); await p.waitForTimeout(50);
  ok(await G(() => window.__game.phase) === 'running' && await G(() => window.__game.tries) === 2 && !(await G(() => window.__game.holding())), '죽은 뒤 어디든 누르면 바로 재도전');

  console.log('== 코스에 적힌 키 패턴대로 끝까지 ==');
  await G(() => { const g = window.__game; g.setBot(g.L.ref); g.startFresh(); });
  const shots = { 9.25: 'p_glideLow', 16.75: 'p_glideHigh', 32.75: 'p_peak', 40.5: 'p_weave1', 42: 'p_weave2', 53.25: 'p_skyGlide', 61.25: 'p_lowThenUp', 74.5: 'p_roller', 103.75: 'rush_gate', 110: 'rush_empty', 131.5: 'rush_exit' };
  const modeSeen = {}; let shardsSeen = null;
  for (let beat = 0; beat <= 172; beat += 0.25) {
    await tick(beat);
    if (shots[beat]) { await p.waitForTimeout(80); await p.screenshot({ path: out + shots[beat] + '.png' }); }
    if (beat === 112) shardsSeen = await G(() => [...document.querySelectorAll('canvas')].length && window.__game.shards);
    if (beat === 100 || beat === 110 || beat === 134) modeSeen[beat] = await G(() => window.__game.state.mode + ':' + document.querySelector('#zoneL span').textContent);
    if (await G(() => window.__game.phase) !== 'running') break;
  }
  st = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp, cause: window.__game.state.cause, x: window.__game.state.x }));
  ok(st.phase === 'won' && st.cp === 3, '패턴대로 누르면 완주, 체크포인트 4개 통과' + (st.phase === 'won' ? '' : ` (${st.cause} @마디 ${Math.floor(st.x / 16)})`));
  ok(modeSeen[100] === 'bounce:누르고 있기 = 멈춤' && modeSeen[110] === 'ride:누르고 있기 = 활공' && modeSeen[134] === 'bounce:누르고 있기 = 멈춤', `질주 구간(마디 26~32)에서는 모드와 조작 안내가 바뀐다 (${Object.values(modeSeen).join(' → ')})`);
  ok(shardsSeen && shardsSeen.got >= 20 && shardsSeen.got === shardsSeen.passed, `패턴대로 달리면 길 위의 빛 조각을 전부 부순다 (마디 28 시작까지 ${shardsSeen && shardsSeen.got}/${shardsSeen && shardsSeen.passed}개)`);
  await p.waitForTimeout(200);
  ok((await p.textContent('#ovTitle')).includes('CLEAR') && (await p.textContent('#pct')) === '100%', '완주 화면, 진행률 100%');

  console.log('== 개발자 모드 / 화면 방향 ==');
  await p.click('#devToggle'); await p.waitForTimeout(50);
  await p.click('#devJumps button:nth-child(3)'); await p.waitForTimeout(80);
  st = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp, x: window.__game.state.x, col: window.__game.L.cps[1].col }));
  ok(st.phase === 'running' && st.cp === 1 && st.x === st.col - 4, '개발자 모드: CP2 버튼으로 바로 이동');
  for (let beat = 74; beat <= 81; beat += 0.25) await tick(beat);
  await p.waitForTimeout(80); await p.screenshot({ path: out + 'dev_path.png' });
  ok(await G(() => window.__game.phase) === 'running', '개발자 모드: 패턴대로 눌렀을 때의 길을 점선으로 보여 준다(스크린샷 dev_path.png)');
  for (const [w, h, name] of [[390, 844, 'portrait'], [844, 390, 'landscape'], [360, 640, 'small']]) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(150);
    await G(() => { const g = window.__game; g.devJump(-1); });
    for (let beat = 0; beat <= 21; beat += 0.25) await tick(beat);
    await p.waitForTimeout(80);
    const v = await G(() => { const v = window.__game.view; const z = document.getElementById('zoneL').getBoundingClientRect(); return { ahead: (v.w - v.px) / v.T, rows: v.groundY / v.T, scroll: document.documentElement.scrollWidth <= window.innerWidth, zone: z.bottom <= window.innerHeight + 1 && z.top > v.groundY }; });
    ok(v.ahead >= 8 && v.rows >= 6.5 && v.scroll && v.zone, `${name} ${w}x${h}: 앞쪽 ${v.ahead.toFixed(1)}칸 보임, 위쪽 ${v.rows.toFixed(1)}칸, 조작 안내는 바닥 아래쪽`);
    await p.screenshot({ path: out + name + '.png' });
  }
  console.log('== 곡 넣기 ==');
  {
    // 100 BPM, 첫 박 0.3초짜리 곡을 wav 파일로 만들어 실제 파일 선택으로 넣는다
    const sr = 22050, secs = 30, bpm = 100, off = 0.3, x = new Float32Array(sr * secs);
    for (let k = 0; off + k * 60 / bpm < secs; k++) {
      const i0 = Math.round((off + k * 60 / bpm) * sr);
      for (let i = 0; i < sr * 0.2 && i0 + i < x.length; i++) { const u = i / sr; x[i0 + i] += 0.8 * Math.exp(-u * 18) * Math.sin(2 * Math.PI * (45 * u + 95 * (1 - Math.exp(-u * 30)) / 30)); }
      const h0 = Math.round((off + (k + 0.5) * 60 / bpm) * sr);
      for (let i = 0; i < sr * 0.03 && h0 + i < x.length; i++) x[h0 + i] += 0.15 * (Math.random() * 2 - 1) * Math.exp(-i / sr * 90);
    }
    const wav = Buffer.alloc(44 + x.length * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + x.length * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(x.length * 2, 40);
    for (let i = 0; i < x.length; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
    fs.writeFileSync(out + 'test-100bpm.wav', wav);
    await p.setViewportSize({ width: 844, height: 390 });
    await G(() => { const g = window.__game; g.pause(); g.fake.on = false; g.setBot(null); });
    await p.setInputFiles('#trackFile', out + 'test-100bpm.wav');
    await p.waitForFunction(() => window.__game.track, null, { timeout: 15000 });
    let tr = await G(() => ({ bpm: window.__game.track.bpm, zero: window.__game.trackZero, wob: window.__game.track.wobbleMs, info: document.getElementById('trackInfo').textContent, speed: document.getElementById('speedBtn').textContent, dis: document.getElementById('speedBtn').disabled }));
    ok(Math.abs(tr.bpm - 100) < 0.03 && Math.abs(tr.zero - 0.3) < 0.01 && tr.wob < 6, `wav 파일을 넣으면 템포와 첫 박을 잰다 (${tr.bpm.toFixed(2)} BPM, 첫 박 ${tr.zero.toFixed(3)}초, 흔들림 ${tr.wob.toFixed(1)}ms)`);
    ok(tr.info.includes('100.0') && tr.speed.includes('곡 템포 100.0') && tr.dis, '곡 정보가 보이고, 속도 버튼은 곡 템포로 고정된다');
    await p.waitForTimeout(80); await p.screenshot({ path: out + 'track.png' });
    await p.click('[data-adj="shift"][data-d="1"]'); await p.click('[data-adj="nudge"][data-d="10"]');
    tr = await G(() => window.__game.trackZero);
    ok(Math.abs(tr - (0.3 + 0.6 - 0.01)) < 0.01, `첫 박 ▶ / 소리 ▶ 10ms: 한 박 뒤, 10ms 늦게 (곡 속 0박 = ${tr.toFixed(3)}초)`);
    await G(() => window.__game.startFresh()); await p.waitForTimeout(1500);
    st = await G(() => ({ step: window.__game.state.step, bpm: window.__game.bpm, phase: window.__game.phase }));
    const want = 1.4 / 0.6 * 96;
    ok(st.bpm > 99.9 && st.bpm < 100.1 && st.step > want * 0.7 && st.step < want * 1.2, `그 곡의 템포로 달린다 (1.5초 뒤 약 ${Math.round(want)}스텝, 실제 ${st.step})`);
    await p.reload(); await p.waitForFunction(() => window.__game && window.__game.track, null, { timeout: 15000 });
    tr = await G(() => ({ bpm: window.__game.track.bpm, zero: window.__game.trackZero }));
    ok(Math.abs(tr.bpm - 100) < 0.03 && Math.abs(tr.zero - 0.89) < 0.01, '새로고침해도 곡과 보정값이 남아 있다');
    await p.click('[data-adj="remove"]'); await p.waitForTimeout(50);
    ok(await G(() => !window.__game.track && !document.getElementById('speedBtn').disabled) && (await p.textContent('#trackBtn')) === '곡 넣기', '곡 빼기: 임시 음악과 속도 단계로 돌아간다');
    await p.reload(); await p.waitForTimeout(700);
    ok(await G(() => !window.__game.track), '뺀 곡은 새로고침해도 돌아오지 않는다');
  }
  console.log('콘솔/페이지 오류:', errs.length ? errs : '없음');
  console.log('실패 ' + fails + '건');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();

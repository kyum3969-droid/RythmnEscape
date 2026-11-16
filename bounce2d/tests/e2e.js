// 실행: node bounce2d/tests/e2e.js   (스크린샷은 bounce2d/tests/out/)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const out = path.join(__dirname, 'out') + '/';
fs.mkdirSync(out, { recursive: true });
const http = require('http');
// 곡 파일을 fetch로 읽으므로 file:// 이 아니라 작은 서버로 연다
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const srv = http.createServer((q, r) => { const f = path.join(__dirname, '..', decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); } }); });
let fails = 0; const ok = (c, msg) => { console.log((c ? '  ok  ' : '  FAIL ') + msg); if (!c) fails++; };
(async () => {
  await new Promise(res => srv.listen(0, '127.0.0.1', res));
  const FILE = `http://127.0.0.1:${srv.address().port}/index.html`;
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const ready = () => p.waitForFunction(() => window.__game && !window.__game.songLoading, null, { timeout: 30000 });
  await p.goto(FILE); await ready();
  const G = (fn, arg) => p.evaluate(fn, arg);
  const tick = (beat) => G((bt) => window.__game.tickTo(bt), beat);
  ok(await G(() => window.__game.phase) === 'title' && (await p.textContent('#ovTitle')).includes('BOUNCE'), '타이틀 화면');
  await p.screenshot({ path: out + 'title.png' });

  console.log('== 기본 곡과 실제 시계 ==');
  let st = await G(() => { const t = window.__game.track; return t && { name: t.name, bpm: t.bpm, dur: t.duration, off: t.offset, info: document.getElementById('trackInfo').textContent }; });
  ok(st && st.name.includes('Octane Horizon') && Math.abs(st.bpm - 152.0285) < 0.01 && Math.abs(st.dur - 106.66) < 0.1 && st.off === 0.8689 && st.info.includes('Octane Horizon'), `코스에 실린 곡이 불러와진다 (${st && st.name}, 게임 템포 ${st && st.bpm.toFixed(2)}, ${st && st.dur.toFixed(1)}초)`);
  await p.click('#ovButtons button'); await p.waitForTimeout(1500);
  st = await G(() => ({ step: window.__game.state.step, phase: window.__game.phase, bpm: window.__game.bpm }));
  const expect = 1.4 / (60 / st.bpm) * 96;
  ok(st.phase === 'running' && st.step > expect * 0.7 && st.step < expect * 1.2, `곡 템포로 달린다: 1.5초 뒤 약 ${Math.round(expect)}스텝 진행 (실제 ${st.step})`);

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

  console.log('== 죽음과 재도전 ==');
  await G(() => window.__game.startFresh());
  await tick(12);
  st = await G(() => ({ phase: window.__game.phase, cause: window.__game.state.cause, bar: Math.floor(window.__game.state.x / 16) }));
  ok(st.phase === 'dead' && st.cause === 'spike' && st.bar === 2, '아무것도 안 누르면 첫 장애물(매달린 덩어리)에서 죽는다');
  await p.waitForTimeout(250); await p.mouse.click(150, 200); await p.waitForTimeout(50);
  ok(await G(() => window.__game.phase) === 'running' && await G(() => window.__game.tries) === 2 && !(await G(() => window.__game.holding())), '죽은 뒤 어디든 누르면 바로 재도전');

  console.log('== 코스에 적힌 키 패턴대로 끝까지 ==');
  await G(() => { const g = window.__game; g.setBot(g.L.ref); g.startFresh(); });
  const shots = { 8.5: 'r1_hold', 9.25: 'r1_holding', 32.75: 'r1_holdhold', 40.5: 'r1_jump', 64.75: 'r1_mix', 80.75: 'r1_mix2', 106.75: 'r1_skyGlide', 111.75: 'fever_gate', 114.25: 'fever_a', 129.25: 'fever_b', 145.25: 'fever_c', 155.75: 'fever_exit', 176.75: 'r1_build', 209.5: 'final_a', 233.5: 'final_b', 255.5: 'final_end' };
  const modeSeen = {}; let shardsSeen = null;
  for (let beat = 0; beat <= 268; beat += 0.25) {
    await tick(beat);
    if (shots[beat]) { await p.waitForTimeout(80); await p.screenshot({ path: out + shots[beat] + '.png' }); }
    if (beat === 160) shardsSeen = await G(() => window.__game.gems);
    if (beat === 100 || beat === 120 || beat === 160) modeSeen[beat] = await G(() => window.__game.state.mode + ':' + document.querySelector('#zoneL span').textContent + ' / ' + document.querySelector('#zoneR span').textContent);
    if (await G(() => window.__game.phase) !== 'running') break;
  }
  st = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp, cause: window.__game.state.cause, x: window.__game.state.x }));
  ok(st.phase === 'won' && st.cp === 3, '패턴대로 누르면 완주, 체크포인트 4개 통과' + (st.phase === 'won' ? '' : ` (${st.cause} @마디 ${Math.floor(st.x / 16)})`));
  ok(modeSeen[100].startsWith('bounce:누르고 있기 = 멈춤') && modeSeen[120] === 'rush:어디든 누르면 = 위아래 방향이 바뀐다 / 누르는 즉시 바뀐다' && modeSeen[160] === modeSeen[100], `피버 구간(마디 28~38)에서는 원버튼이 되고 조작 안내가 바뀐다 (${modeSeen[120]})`);
  ok(shardsSeen && shardsSeen.got >= shardsSeen.passed - 2 && shardsSeen.passed > 200, `패턴대로 가면 길 위의 수정을 전부 뚫는다 (피버가 끝날 때까지 ${shardsSeen && shardsSeen.got}/${shardsSeen && shardsSeen.passed}개)`);
  await p.waitForTimeout(200);
  ok((await p.textContent('#ovTitle')).includes('CLEAR') && (await p.textContent('#pct')) === '100%', '완주 화면, 진행률 100%');

  console.log('== 개발자 모드 / 화면 방향 ==');
  await p.click('#devToggle'); await p.waitForTimeout(50);
  await p.click('#devJumps button:nth-child(3)'); await p.waitForTimeout(80);
  st = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp, x: window.__game.state.x, col: window.__game.L.cps[1].col }));
  ok(st.phase === 'running' && st.cp === 1 && st.x === st.col - 4, '개발자 모드: CP2 버튼으로 바로 이동');
  for (let beat = 110; beat <= 118; beat += 0.25) await tick(beat);
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
  console.log('== 피버를 실제 터치로 ==');
  {
    await p.setViewportSize({ width: 844, height: 390 });
    const feverStart = await G(() => window.__game.L.rides[0][0] / 4);
    await G(() => { const g = window.__game; g.setBot(null); g.devJump(1); });     // 체크포인트 2 = 피버 바로 앞
    let fb = await G(() => window.__game.state.step / 96);
    const go = async (to) => { for (; fb < to; fb = Math.min(to, fb + 0.125)) await tick(fb); await tick(to); fb = to; };
    await go(feverStart + 0.5);
    const before = await G(() => window.__game.state.zdir);
    await p.mouse.click(150, 200);                                                // 가운데 높이를 지나는 박(킥)에 화면 왼쪽을 누름
    await go(feverStart + 0.5 + 2 / 96);
    st = await G(() => ({ d: window.__game.state.zdir, mode: window.__game.state.mode }));
    ok(before === 1 && st.d === -1 && st.mode === 'rush', '원버튼: 화면 왼쪽을 눌러도, 누르는 즉시 방향이 뒤집힌다');
    await go(feverStart + 1);
    ok(await G(() => 9 - window.__game.state.y) < 0.01, '박에 맞춰 눌렀으면 반 박 뒤에 바닥에 닿는다');
    await p.mouse.click(700, 200); await go(feverStart + 1 + 2 / 96);
    ok(await G(() => window.__game.state.zdir) === -1, '화면 오른쪽을 눌러도 똑같이 뒤집힌다');
    await p.waitForTimeout(60); await p.screenshot({ path: out + 'fever_touch.png' });
    await go(feverStart + 4);
    st = await G(() => ({ phase: window.__game.phase, cause: window.__game.state.cause }));
    ok(st.phase === 'dead' && st.cause === 'spike', '벽의 구멍을 못 맞추면 죽는다');
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
    await G(() => { const g = window.__game; g.startFresh(); g.pause(); g.fake.on = false; g.setBot(null); });
    await p.setInputFiles('#trackFile', out + 'test-100bpm.wav');
    await p.waitForFunction(() => window.__game.track && !window.__game.track.bundled, null, { timeout: 15000 });
    let tr = await G(() => ({ bpm: window.__game.track.bpm, zero: window.__game.trackZero, wob: window.__game.track.wobbleMs, info: document.getElementById('trackInfo').textContent }));
    ok(Math.abs(tr.bpm - 100) < 0.03 && Math.abs(tr.zero - 0.3) < 0.01 && tr.wob < 6, `wav 파일을 넣으면 템포와 첫 박을 잰다 (${tr.bpm.toFixed(2)} BPM, 첫 박 ${tr.zero.toFixed(3)}초, 흔들림 ${tr.wob.toFixed(1)}ms)`);
    ok(tr.info.includes('100.0') && tr.info.includes('test-100bpm.wav'), '넣은 곡의 정보가 보인다');
    await p.waitForTimeout(80); await p.screenshot({ path: out + 'track.png' });
    await p.click('[data-adj="shift"][data-d="1"]'); await p.click('[data-adj="nudge"][data-d="10"]');
    tr = await G(() => window.__game.trackZero);
    ok(Math.abs(tr - (0.3 + 0.6 - 0.01)) < 0.01, `첫 박 ▶ / 소리 ▶ 10ms: 한 박 뒤, 10ms 늦게 (곡 속 0박 = ${tr.toFixed(3)}초)`);
    await G(() => window.__game.startFresh()); await p.waitForTimeout(1500);
    st = await G(() => ({ step: window.__game.state.step, bpm: window.__game.bpm, phase: window.__game.phase }));
    const want = 1.4 / 0.6 * 96;
    ok(st.bpm > 99.9 && st.bpm < 100.1 && st.step > want * 0.7 && st.step < want * 1.2, `그 곡의 템포로 달린다 (1.5초 뒤 약 ${Math.round(want)}스텝, 실제 ${st.step})`);
    await p.reload(); await p.waitForFunction(() => window.__game && !window.__game.songLoading && window.__game.track && !window.__game.track.bundled, null, { timeout: 30000 });
    tr = await G(() => ({ bpm: window.__game.track.bpm, zero: window.__game.trackZero }));
    ok(Math.abs(tr.bpm - 100) < 0.03 && Math.abs(tr.zero - 0.89) < 0.01, '새로고침해도 곡과 보정값이 남아 있다');
    await p.click('[data-adj="remove"]'); await p.waitForTimeout(50);
    ok(await G(() => window.__game.track.bundled && window.__game.track.name.includes('Octane Horizon') && Math.abs(window.__game.bpm - 152.0285) < 0.01) && (await p.textContent('#trackBtn')) === '다른 곡 넣어 보기', '곡 빼기: 기본 곡으로 돌아간다');
    await p.reload(); await ready();
    ok(await G(() => window.__game.track.bundled), '뺀 곡은 새로고침해도 돌아오지 않는다');
  }
  console.log('== 라운드 2 ==');
  {
    await p.setViewportSize({ width: 844, height: 390 });
    await G(() => { const g = window.__game; g.fake.on = false; g.startFresh(); g.pause(); });
    ok((await p.textContent('#rounds button:nth-child(1)')).includes('ROUND 1') && await p.isDisabled('#rounds button:nth-child(1)'), '라운드 고르기: 지금은 1라운드');
    await Promise.all([p.waitForNavigation(), p.click('#rounds button:nth-child(2)')]); await ready();
    st = await G(() => { const g = window.__game, t = g.track; return { round: g.round, name: t.name, bpm: t.bpm, off: t.offset, cps: g.L.cps.length, free: g.L.freeBars.size }; });
    ok(st.round === 1 && st.name.includes('Terminal Pursuit') && Math.abs(st.bpm - 151.9867) < 0.01 && st.off === 0.2809 && st.cps === 5, `2라운드를 누르면 그 코스와 곡으로 다시 열린다 (${st.name}, ${st.bpm.toFixed(2)} BPM, 체크포인트 ${st.cps}개)`);
    await p.screenshot({ path: out + 'r2_title.png' });
    await G(() => { const g = window.__game; g.fake.on = true; g.setBot(g.L.ref); g.startFresh(); });
    const shots2 = { 33.25: 'r2_a', 96.75: 'r2_free_in', 98.5: 'r2_free', 105.25: 'r2_fever', 125.5: 'r2_free_out', 226.5: 'r2_peak', 257: 'r2_final_free', 285: 'r2_ending' };
    let label = null;
    for (let beat = 0; beat <= 300; beat += 0.25) {
      await tick(beat);
      if (shots2[beat]) { await p.waitForTimeout(60); await p.screenshot({ path: out + shots2[beat] + '.png' }); }
      if (beat === 98) label = await G(() => document.querySelector('#zoneL span').textContent + ' / ' + document.querySelector('#zoneR span').textContent);
      if (await G(() => window.__game.phase) !== 'running') break;
    }
    st = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp, gems: window.__game.gems }));
    ok(st.phase === 'won' && st.cp === 4 && st.gems.got === st.gems.total, `2라운드도 패턴대로 누르면 완주 (수정 ${st.gems.got}/${st.gems.total}개)`);
    ok(label === '장애물이 없는 구간 / 저절로 달려요', `피버의 연출 구간에서는 안내가 바뀐다 (${label})`);
    await G(() => { const g = window.__game; g.setBot(null); g.devJump(1); });     // 체크포인트 2 = 첫 피버 바로 앞
    const f0 = await G(() => window.__game.L.rides[0][0] / 4);
    for (let beat = await G(() => window.__game.state.step / 96); beat <= f0 + 1.25; beat += 0.125) await tick(beat);
    const before = await G(() => ({ d: window.__game.state.zdir, h: window.__game.state.zh }));
    await p.mouse.click(150, 200); await tick(f0 + 1.25 + 2 / 96);
    const after = await G(() => window.__game.state.zdir);
    for (let beat = f0 + 1.375; beat <= f0 + 8; beat += 0.125) await tick(beat);
    ok(before.d === after && await G(() => window.__game.phase) === 'running', '연출 구간에서는 눌러도 방향이 바뀌지 않고, 아무것도 안 해도 두 마디를 지나간다');
    await G(() => { const g = window.__game; g.fake.on = false; g.startFresh(); g.pause(); });
    await Promise.all([p.waitForNavigation(), p.click('#rounds button:nth-child(1)')]); await ready();
    ok(await G(() => window.__game.round) === 0, '다시 1라운드로 돌아올 수 있다');
  }
  console.log('콘솔/페이지 오류:', errs.length ? errs : '없음');
  console.log('실패 ' + fails + '건');
  await b.close(); srv.close();
  process.exit(fails || errs.length ? 1 : 0);
})();

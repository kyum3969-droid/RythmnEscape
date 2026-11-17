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
  // 이단 점프 보정: 맨땅에서 곧 튈 참에 누른 것은 이단 점프로 맡아 둔다 → 박에 맞춰 튀고, 꼭대기에서 이단 점프(4.5칸까지)
  await p.mouse.click(700, 200); await tick(bt + 0.1);
  st = await G(() => ({ g: window.__game.state.onGround, q: window.__game.state.djq, step: window.__game.state.step }));
  const nextBeat = Math.ceil(st.step / 96);
  let topQ = 0; for (let t2 = bt + 0.15; t2 <= nextBeat + 1.0; t2 += 0.05) { await tick(t2); topQ = Math.max(topQ, await G(() => 9 - window.__game.state.y)); }
  ok(st.g && st.q === 2 && topQ > 4.2, `굴러가는 중에(곧 튈 참에) 오른쪽을 누르면 그 자리에서 뛰지 않고, 박에 맞춰 튄 뒤 꼭대기에서 이단 점프한다 (${topQ.toFixed(2)}칸)`);
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
    if (beat === 100 || beat === 120 || beat === 160) modeSeen[beat] = await G(() => window.__game.state.mode + ':' + getComputedStyle(document.getElementById('zoneL')).visibility + ':' + document.querySelectorAll('.zone span').length);
    if (await G(() => window.__game.phase) !== 'running') break;
  }
  st = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp, cause: window.__game.state.cause, x: window.__game.state.x }));
  ok(st.phase === 'won' && st.cp === 3, '패턴대로 누르면 완주, 체크포인트 4개 통과' + (st.phase === 'won' ? '' : ` (${st.cause} @마디 ${Math.floor(st.x / 16)})`));
  ok(modeSeen[100] === 'bounce:visible:0' && modeSeen[120] === 'rush:hidden:0' && modeSeen[160] === modeSeen[100], `피버 구간(마디 28~38)에서는 원버튼이 되고 아래쪽 아이콘이 숨는다. 아래쪽 설명 글자는 없다 (${modeSeen[120]})`);
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
  {
    // 개발자 기능: 안내 없이 해 보기(길 위의 누르는 표시, 아래쪽 버튼 안내를 따로 끈다)
    const off = await G(() => { document.getElementById('devMarks').click(); document.getElementById('devZones').click(); document.getElementById('devGems').click(); return { marks: document.getElementById('devMarks').textContent, zones: document.getElementById('devZones').textContent, gems: document.getElementById('devGems').textContent, cls: document.getElementById('app').classList.contains('nozones'), vis: getComputedStyle(document.getElementById('zoneL')).visibility }; });
    for (let beat = 118.25; beat <= 120; beat += 0.25) await tick(beat);
    await p.waitForTimeout(80); await p.screenshot({ path: out + 'dev_nomarks.png' });
    const on = await G(() => { document.getElementById('devMarks').click(); document.getElementById('devZones').click(); document.getElementById('devGems').click(); return { gems: document.getElementById('devGems').textContent, marks: document.getElementById('devMarks').textContent, cls: document.getElementById('app').classList.contains('nozones') }; });
    ok(off.marks.endsWith('꺼짐') && off.zones.endsWith('꺼짐') && off.gems.endsWith('꺼짐') && on.gems.endsWith('켜짐') && off.cls && off.vis === 'hidden' && on.marks.endsWith('켜짐') && !on.cls && await G(() => window.__game.phase) === 'running', '개발자 기능: 길 위의 누르는 표시, 아래쪽 버튼 안내, 수정을 따로 끄고 켤 수 있다(스크린샷 dev_nomarks.png)');
  }
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
    {
      // 바운스 구간의 파란 박스(쉬는 마디): 밟고 튄다. 죽지 않는다.
      await G(() => { const g = window.__game; g.setBot(g.L.ref); g.devJump(0); });         // 체크포인트 1(마디 15). 마디 17에 박스가 있다
      let bb = await G(() => window.__game.state.step / 96);
      for (; bb < 68.875; bb += 0.125) await tick(bb);
      await tick(68.875);                                                                   // 박스는 한 칸 높아서 1/8박 일찍 닿고, 닿자마자 튄다
      const onBox = await G(() => ({ y: window.__game.state.y, phase: window.__game.phase }));
      await tick(69.4); await p.waitForTimeout(60); await p.screenshot({ path: out + 'box.png' });
      for (bb = 69.5; bb <= 72; bb += 0.125) await tick(bb);
      const after = await G(() => ({ y: window.__game.state.y, phase: window.__game.phase }));
      ok(onBox.phase === 'running' && Math.abs(onBox.y - 8) < 0.15 && after.phase === 'running' && after.y > 8.5, `바운스 구간의 파란 박스: 박보다 1/8박 일찍 박스 위(한 칸 높이)에 닿아 바로 튀고, 내려와서 다음 마디로 이어진다`);
    }
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
    await go(feverStart + 1.5);                                                   // 바닥에서 튕겨 다시 가운데 높이
    const up = await G(() => window.__game.state.zdir);
    await p.mouse.click(700, 200); await go(feverStart + 1.5 + 2 / 96);
    ok(up === 1 && await G(() => window.__game.state.zdir) === -1, '화면 오른쪽을 눌러도 똑같이 뒤집힌다');
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
    const shots2 = { 33.25: 'r2_a', 96.75: 'r2_free_in', 98.5: 'r2_free', 105.25: 'r2_fever', 125.5: 'r2_free_out', 226.5: 'r2_peak', 257: 'r2_final_free', 281.5: 'r2_squeeze1', 285.5: 'r2_squeeze2', 287.5: 'r2_squeeze3', 288: 'r2_burst' };
    for (let beat = 0; beat <= 300; beat += 0.25) {
      await tick(beat);
      if (shots2[beat]) { await p.waitForTimeout(60); await p.screenshot({ path: out + shots2[beat] + '.png' }); }
      if (await G(() => window.__game.phase) !== 'running') break;
    }
    st = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp, gems: window.__game.gems }));
    ok(st.phase === 'won' && st.cp === 4 && st.gems.got === st.gems.total, `2라운드도 패턴대로 누르면 완주 (수정 ${st.gems.got}/${st.gems.total}개)`);
    await G(() => { const g = window.__game; g.setBot(null); g.devJump(1); });     // 체크포인트 2 = 첫 피버 바로 앞
    const f0 = await G(() => window.__game.L.rides[0][0] / 4);
    for (let beat = await G(() => window.__game.state.step / 96); beat <= f0 + 1.25; beat += 0.125) await tick(beat);
    const before = await G(() => ({ d: window.__game.state.zdir, h: window.__game.state.zh }));
    await p.mouse.click(150, 200); await tick(f0 + 1.25 + 2 / 96);
    const after = await G(() => window.__game.state.zdir);
    for (let beat = f0 + 1.375; beat <= f0 + 4; beat += 0.125) await tick(beat);
    ok(before.d === after && await G(() => window.__game.phase) === 'running', '연출 마디에서는 눌러도 방향이 바뀌지 않고, 아무것도 안 해도 지나간다');
    // 넓은 통로: 파란 계단을 튕기며 올라간다. 그 계단 마디(장애물 없음)에서 화면이 "확" 물러나고, 내려오는 계단에서 다시 다가온다.
    await G(() => { const g = window.__game; g.setBot(g.L.ref); g.devJump(1); });
    const zAt = {}, shotsW = { 12.2: 'r2_zoom_out', 13.5: 'r2_stairs_up', 25.5: 'r2_stairs_down', 27: 'r2_zoom_in' };
    const runTo = async (to) => {
      for (let beat = await G(() => window.__game.state.step / 96) + 0.125; beat <= f0 + to + 1e-6; beat += 0.125) {
        await tick(beat);
        const rel = Math.round((beat - f0) * 1000) / 1000;
        if ([11.75, 12.75, 26.5, 27.75].includes(rel)) { await p.waitForTimeout(50); zAt[rel] = await G(() => window.__game.view.zT / window.__game.view.T); }
        if (shotsW[rel]) { await p.waitForTimeout(50); await p.screenshot({ path: out + shotsW[rel] + '.png' }); }
      }
    };
    await runTo(18);
    await p.waitForTimeout(60);
    const wv = await G(() => { const g = window.__game, v = g.view; return { T: v.zT, top: v.groundY - (g.L.wideBars.size ? 8.4 : 0) * v.zT, mode: g.state.mode, phase: g.phase, floats: g.L.reds.filter((q) => q.kind === 'float').length, steps: g.L.stairLo.size + g.L.stairHi.size }; });
    ok(wv.phase === 'running' && wv.mode === 'rush' && wv.top >= 0 && wv.floats >= 8 && wv.steps > 20, `넓은 통로에서는 화면이 물러나 천장까지 보인다 (천장 y=${wv.top.toFixed(0)}px, 한 칸 ${wv.T.toFixed(1)}px, 떠 있는 장애물 ${wv.floats}개)`);
    ok(Math.abs(zAt[11.75] - 1) < 0.005 && zAt[12.75] < 0.8, `화면은 올라가는 계단 마디에 들어서며 한 박 안에 "확" 물러난다 (직전 ${zAt[11.75].toFixed(2)}배 → 0.75박 뒤 ${zAt[12.75].toFixed(2)}배)`);
    await p.screenshot({ path: out + 'r2_wide.png' });
    await runTo(28);
    ok(zAt[26.5] < 0.8 && Math.abs(zAt[27.75] - 1) < 0.02 && await G(() => window.__game.phase) === 'running', `내려오는 계단 마디의 끝에서 다시 다가온다 (${zAt[26.5].toFixed(2)}배 → ${zAt[27.75].toFixed(2)}배)`);
    // 라운드 3: 충전 고리와 엇박 길
    await G(() => { const g = window.__game; g.fake.on = false; g.startFresh(); g.pause(); });
    await Promise.all([p.waitForNavigation(), p.click('#rounds button:nth-child(3)')]); await ready();
    st = await G(() => { const g = window.__game, t = g.track; return { round: g.round, name: t.name, bpm: t.bpm, off: t.offset, cps: g.L.cps.length }; });
    ok(st.round === 2 && st.name.includes('Final Quarter Credit') && Math.abs(st.bpm - 152.0183) < 0.01 && st.off === 1.0518 && st.cps === 9, `3라운드를 누르면 그 코스와 곡으로 다시 열린다 (${st.name}, ${st.bpm.toFixed(2)} BPM, 체크포인트 ${st.cps}개)`);
    await G(() => { const g = window.__game; g.fake.on = true; g.setBot(g.L.ref); g.startFresh(); });
    const shots3 = { 17.0: 'r3_tall_intro', 29.5: 'r3_repeat', 36.5: 'r3_trap_hand', 68.5: 'r3_trap_add', 137.25: 'r3_fever', 198.25: 'r3_trap_hand2', 290.5: 'r3_fever2', 309.5: 'r3_end' };
    for (let beat = 0; beat <= 322; beat += 0.25) {
      await tick(beat);
      if (shots3[beat]) { await p.waitForTimeout(60); await p.screenshot({ path: out + shots3[beat] + '.png' }); }
      if (await G(() => window.__game.phase) !== 'running') break;
    }
    st = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp, gems: window.__game.gems }));
    ok(st.phase === 'won' && st.cp === 8 && st.gems.got === st.gems.total, `3라운드도 패턴대로 누르면 완주 (수정 ${st.gems.got}/${st.gems.total}개)`);
    // 라운드 4: 떠 있는 파란 박스, 파란 천장, 떠 있는 빨간 박스
    await G(() => { const g = window.__game; g.fake.on = false; g.startFresh(); g.pause(); });
    await Promise.all([p.waitForNavigation(), p.click('#rounds button:nth-child(4)')]); await ready();
    st = await G(() => { const g = window.__game, L = g.L, t = g.track; let fb = 0, fr = 0; for (let r = 0; r < 8; r++) for (let c = 0; c < L.cols; c++) if (L.grid[r][c] === '#' && L.grid[r + 1][c] !== '#') fb++; for (let c = 0; c < L.cols; c++) if (L.ceilTop[c] < 90 && !(c > 0 && L.ceilTop[c - 1] < 90)) fr++; return { round: g.round, fb, fr, name: t.name, bpm: t.bpm, off: t.offset, cps: L.cps.length }; });
    ok(st.round === 3 && st.name.includes('Miles Before Sunrise') && Math.abs(st.bpm - 152.005) < 0.01 && st.off === 0.474 && st.cps === 9 && st.fb >= 20 && st.fr >= 10, `4라운드를 누르면 그 코스와 곡으로 다시 열린다 (${st.name}, ${st.bpm.toFixed(2)} BPM, 체크포인트 ${st.cps}개, 떠 있는 파란 박스 ${st.fb}칸, 떠 있는 빨간 박스 ${st.fr}개)`);
    await G(() => { const g = window.__game; g.fake.on = true; g.setBot(g.L.ref); g.startFresh(); });
    const shots4 = { 9.5: 'v_02', 13.5: 'v_03', 65.5: 'v_16', 69.5: 'v_17', 77.5: 'v_19', 81.5: 'v_20', 193.5: 'v_48', 197.5: 'v_49', 177.5: 'v_44', 181.5: 'v_45', 9.25: 'r4_drop', 21.25: 'r4_jump', 21.75: 'r4_jump_high', 25.25: 'r4_jump_var', 42.5: 'r4_trap_drop', 49.5: 'r4_gen_base', 53.5: 'r4_gen_var', 101.75: 'r4_glide_var', 72.75: 'r4_cap', 76.75: 'r4_cap_low', 78.25: 'r4_cap_after', 97.75: 'r4_glide', 172.5: 'r4_low', 205.0: 'r4_build', 305.0: 'r4_final', 321.5: 'r4_finish' };
    const seen4 = {};
    for (let beat = 0; beat <= 334; beat += 0.25) {
      await tick(beat);
      if (shots4[beat]) { await p.waitForTimeout(60); await p.screenshot({ path: out + shots4[beat] + '.png' }); }
      if (beat === 9.25 || beat === 21.75 || beat === 76.75) seen4[beat] = await G(() => { const g = window.__game, v = g.view; return { h: 9 - g.state.y, on: g.state.onGround, z: v.zT / v.T, topPx: v.groundY - (9 - g.state.y + 0.8) * v.zT }; });
      if (await G(() => window.__game.phase) !== 'running') break;
    }
    st = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp, gems: window.__game.gems }));
    ok(st.phase === 'won' && st.cp === 8 && st.gems.got === st.gems.total, `4라운드도 패턴대로 누르면 완주 (수정 ${st.gems.got}/${st.gems.total}개)`);
    ok(seen4[9.25] && seen4[9.25].on && Math.abs(seen4[9.25].h - 4) < 0.01, `이단 점프로 떠 있는 파란 박스에 올라탄다 (높이 ${seen4[9.25] && seen4[9.25].h.toFixed(2)}칸)`);
    ok(seen4[21.75] && seen4[21.75].h > 6 && seen4[21.75].z < 0.97 && seen4[21.75].topPx > 35, `박스에서 다시 뛰면 6칸 넘게 올라가고, 화면이 조금 물러나 공이 화면 안에 있다 (높이 ${seen4[21.75] && seen4[21.75].h.toFixed(2)}칸, ${seen4[21.75] && seen4[21.75].z.toFixed(2)}배, 공 윗면 y=${seen4[21.75] && seen4[21.75].topPx.toFixed(0)}px)`);
    ok(seen4[76.75] && seen4[76.75].h > 0.9 && seen4[76.75].h < 1.21 && !seen4[76.75].on, `낮은 파란 천장 밑에서는 낮게 뜬 채로 멈춰서 건넌다 (높이 ${seen4[76.75] && seen4[76.75].h.toFixed(2)}칸)`);
    // 라운드 5: 피버 위주. 통로가 기울고 솟는 연출
    await G(() => { const g = window.__game; g.fake.on = false; g.startFresh(); g.pause(); });
    await Promise.all([p.waitForNavigation(), p.click('#rounds button:nth-child(5)')]); await ready();
    st = await G(() => { const g = window.__game, L = g.L, t = g.track; return { round: g.round, name: t.name, bpm: t.bpm, off: t.offset, cps: L.cps.length, rush: L.rides.reduce((u, r) => u + (r[1] - r[0]) / 16, 0) }; });
    ok(st.round === 4 && st.name.includes('Concrete Pulse') && Math.abs(st.bpm - 152) < 0.01 && st.off === 0.067 && st.rush >= 40, `5라운드를 누르면 그 코스와 곡으로 다시 열린다 (${st.name}, ${st.bpm.toFixed(2)} BPM, 체크포인트 ${st.cps}개, 피버 ${st.rush}마디)`);
    await G(() => { const g = window.__game; g.fake.on = true; g.setBot(g.L.ref); g.startFresh(); });
    const shots5 = { 46.0: 'r5_fever_a', 67.0: 'r5_bend_ahead', 69.0: 'r5_bend_in', 71.0: 'r5_diag_up', 81.0: 'r5_bend_down', 83.0: 'r5_diag_down', 93.0: 'r5_back', 101.75: 'r5_stones', 105.0: 'r5_stones2', 112.75: 'r5_red_ahead', 113.5: 'r5_red_stone', 118.5: 'r5_red_stone2', 127.5: 'r5_up_ahead', 130.0: 'r5_turn_up', 134.0: 'r5_vertical', 145.5: 'r5_turn_back', 154.5: 'r5_squeeze', 173.0: 'r5_thin_in', 174.5: 'r5_thin', 198.0: 'r5_vertical_wide', 204.5: 'r5_bar51_a', 205.5: 'r5_bar51_b', 207.0: 'r5_over', 213.0: 'r5_down', 298.0: 'r5_final' };
    const cams = {};
    for (let beat = 0; beat <= 330; beat += 0.25) {
      await tick(beat);
      if (shots5[beat]) { await p.waitForTimeout(60); await p.screenshot({ path: out + shots5[beat] + '.png' }); }
      if (beat === 46 || beat === 71 || beat === 134 || beat === 174.5 || beat === 113.5 || beat === 102) cams[beat] = await G(() => { const g = window.__game, c = g.cam(g.state.x); return { rot: c.rot, zoom: c.zoom, mode: g.state.mode, h: 9 - g.state.y, frozen: g.state.frozen }; });
      if (await G(() => window.__game.phase) !== 'running') break;
    }
    st = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp, cps: window.__game.L.cps.length, gems: window.__game.gems }));
    ok(st.phase === 'won' && st.cp === st.cps - 1 && st.gems.got === st.gems.total, `5라운드도 패턴대로 누르면 완주 (수정 ${st.gems.got}/${st.gems.total}개)`);
    ok(cams[46] && cams[46].mode === 'rush' && Math.abs(cams[46].rot) < 0.01 && cams[71] && Math.abs(cams[71].rot - 45) < 1 && cams[134] && Math.abs(cams[134].rot - 90) < 1 && cams[174.5] && cams[174.5].zoom > 1.25 && Math.abs(cams[174.5].rot) < 3, `굽은 통로: 첫 피버는 곧게(${cams[46] && cams[46].rot.toFixed(0)}도), 둘째는 비스듬히 위로(${cams[71] && cams[71].rot.toFixed(0)}도), 셋째는 곧장 위로(${cams[134] && cams[134].rot.toFixed(0)}도). 얇은 굴에서는 다가간다(${cams[174.5] && cams[174.5].zoom.toFixed(2)}배)`);
    ok(cams[102] && cams[102].mode === 'bounce' && cams[102].h > 5.5 && cams[113.5] && cams[113.5].mode === 'bounce' && cams[113.5].frozen && cams[113.5].h > 5.5, `징검다리: 돌에서 돌로 저절로 튀고(높이 ${cams[102] && cams[102].h.toFixed(2)}칸), 빨간 돌 앞에서는 멈춰서 그 위의 틈을 지난다(높이 ${cams[113.5] && cams[113.5].h.toFixed(2)}칸)`);
    // 굽이를 지날 때 공이 화면에서 튀지 않는다(토막마다 다른 기울기로 그리면 토막의 이음매마다 튄다), 화면 밖의 토막은 그리지 않는다
    const sm = await G(() => {
      const g = window.__game; let now = 500, worst = 0, worstOld = 0, worstK = 0, prev = null, most = 0, total = 0;
      for (let x = 16 * 16; x <= 24 * 16; x += 4 / 96) {
        now += 60 / 152 / 96;
        const a = g.ballAt(x, 2.4, now, true), o = g.ballAt(x, 2.4, now, false);
        if (prev) { worst = Math.max(worst, Math.hypot(a.x - prev.a.x, a.y - prev.a.y)); worstOld = Math.max(worstOld, Math.hypot(o.x - prev.o.x, o.y - prev.o.y)); worstK = Math.max(worstK, Math.abs(a.k - prev.a.k)); }
        most = Math.max(most, a.shown); total = Math.max(total, a.passes);
        prev = { a, o };
      }
      return { worst, worstOld, worstK, most, total };
    });
    ok(sm.worst < 3 && sm.worstOld > 8 && sm.worstK < 0.01 && sm.most < sm.total, `굽이에서 공이 튀지 않는다: 한 스텝에 많아야 ${sm.worst.toFixed(1)}픽셀(토막 기울기로 그리면 ${sm.worstOld.toFixed(1)}픽셀), 배율은 ${sm.worstK.toFixed(4)}씩. 그리는 토막은 ${sm.total}개 중 많아야 ${sm.most}개`);
    // 개발자 기능: 코스 둘러보기(퍼센트로 이동)와 번호표
    await G(() => { const g = window.__game; g.fake.on = false; g.startFresh(); g.pause(); });
    let ins = await G(() => { const g = window.__game; g.openInspect(); g.inspectAt(g.L.goalX * 0.24); const t = g.labels.map((o) => o.text); return { phase: g.phase, x: g.state.x, want: g.L.goalX * 0.24, pct: document.getElementById('insRange').value, info: document.getElementById('tries').textContent, n: t.length, uniq: new Set(t).size, red: t.filter((v) => /-R\d+$/.test(v)).length, blue: t.filter((v) => /-B\d+$/.test(v)).length, bar: document.getElementById('inspect').hidden, ov: document.getElementById('overlay').hidden }; });
    await p.waitForTimeout(200); await p.screenshot({ path: out + 'r4_inspect.png' });
    ok(ins.phase === 'inspect' && Math.abs(ins.x - ins.want) < 0.05 && Math.abs(+ins.pct - 24) < 0.11 && !ins.bar && ins.ov, `둘러보기: 24%로 옮기면 그 자리가 보인다(플레이가 아니다) — ${ins.info} [막대 ${ins.pct}]`);
    ok(ins.n > 150 && ins.uniq === ins.n && ins.red > 100 && ins.blue >= 10, `번호표: 상자 ${ins.n}개에 서로 다른 이름이 붙는다 (빨간 것 ${ins.red}개, 파란 것 ${ins.blue}개)`);
    ins = await G(() => { const g = window.__game, el = document.getElementById('insRange'); el.value = '61.3'; el.dispatchEvent(new Event('input', { bubbles: true })); return { x: g.state.x, want: g.L.goalX * 0.613, step: g.state.step, pctHud: document.getElementById('pct').textContent }; });
    await p.waitForTimeout(150);
    const stepBefore = await G(() => window.__game.state.step);
    await p.waitForTimeout(300);
    ok(Math.abs(ins.x - ins.want) < 0.05 && ins.pctHud === '61%' && await G(() => window.__game.state.step) === stepBefore, `막대를 61.3%로 옮기면 그리로 가고, 가만히 두면 흐르지 않는다 (화면 표시 ${ins.pctHud})`);
    { const bb = await p.$eval('#view', (c) => { const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      const x0 = await G(() => window.__game.inspectX);
      await p.mouse.move(bb.x, bb.y); await p.mouse.down(); await p.mouse.move(bb.x - 200, bb.y, { steps: 4 }); await p.mouse.up();
      const x1 = await G(() => window.__game.inspectX);
      ok(x1 > x0 + 2, `화면을 왼쪽으로 끌면 앞으로 넘어간다 (${x0.toFixed(1)} → ${x1.toFixed(1)}칸)`);
      await p.click('#inspect button[data-mv="16"]');
      const x2 = await G(() => window.__game.inspectX);
      ok(x2 > x1 && x2 % 16 === 0, `"마디 ▶"는 다음 마디의 첫 박으로 간다 (${x2}칸 = 마디 ${x2 / 16})`); }
    await p.click('#insClose');
    ok(await G(() => window.__game.phase === 'title' && document.getElementById('inspect').hidden && !document.getElementById('overlay').hidden), '닫으면 처음 화면으로 돌아온다');
    // 6라운드(리믹스): 앞 라운드의 것들을 섞고 꼬아 놓은 코스. 피버는 곡의 절정 두 곳에만 있다
    await G(() => { const g = window.__game; g.fake.on = false; g.startFresh(); g.pause(); });
    await Promise.all([p.waitForNavigation(), p.click('#rounds button:nth-child(6)')]); await ready();
    st = await G(() => { const g = window.__game, L = g.L, t = g.track; return { round: g.round, name: t.name, bpm: t.bpm, off: t.offset, cps: L.cps.length, rides: L.rides.length, rush: L.rides.reduce((u, r) => u + (r[1] - r[0]) / 16, 0), thin: L.squeezes.filter((q) => q.mid).length, sq: L.squeezes.filter((q) => !q.mid).length }; });
    ok(st.round === 5 && st.name.includes('Streetlight Velocity') && Math.abs(st.bpm - 152) < 0.01 && st.off === 0.056 && st.cps === 9 && st.rides === 2 && st.rush === 14 && st.thin === 1 && st.sq === 0, `6라운드를 누르면 그 코스와 곡으로 다시 열린다 (${st.name}, ${st.bpm.toFixed(2)} BPM, 체크포인트 ${st.cps}개, 피버 ${st.rides}번 ${st.rush}마디, 얇은 굴 ${st.thin}개)`);
    await G(() => { const g = window.__game; g.fake.on = true; g.setBot(g.L.ref); g.startFresh(); });
    const shots6 = { 10.0: 'r6_intro', 37.0: 'r6_float', 58.5: 'r6_ceiling_flip', 66.0: 'r6_island', 74.5: 'r6_island_cap', 105.0: 'r6_stones_in', 114.25: 'r6_stone_lid', 119.25: 'r6_stone_gap', 134.0: 'r6_bend_up', 142.5: 'r6_thin', 151.0: 'r6_bend_down', 155.5: 'r6_fever_end', 173.0: 'r6_bluff', 218.75: 'r6_flip', 229.0: 'r6_full', 283.0: 'r6_exit_lid', 290.0: 'r6_wide_up', 296.0: 'r6_wide_diag', 302.0: 'r6_wide_swing', 306.0: 'r6_wide_down', 310.0: 'r6_wide_back' };
    const cams6 = {};
    for (let beat = 0; beat <= 330; beat += 0.25) {
      await tick(beat);
      if (shots6[beat]) { await p.waitForTimeout(60); await p.screenshot({ path: out + shots6[beat] + '.png' }); }
      if (beat === 66 || beat === 138 || beat === 142.5 || beat === 151 || beat === 296 || beat === 306) cams6[beat] = await G(() => { const g = window.__game, c = g.cam(g.state.x); return { rot: c.rot, zoom: c.zoom, mode: g.state.mode }; });
      if (await G(() => window.__game.phase) !== 'running') break;
    }
    st = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp, cps: window.__game.L.cps.length, gems: window.__game.gems }));
    ok(st.phase === 'won' && st.cp === st.cps - 1 && st.gems.got === st.gems.total, `6라운드도 패턴대로 누르면 완주 (수정 ${st.gems.got}/${st.gems.total}개)`);
    { const c = cams6, near = (b, v) => c[b] && Math.abs(c[b].rot - v) < 1;
      ok(c[66] && c[66].mode === 'bounce' && near(138, 45) && c[142.5] && c[142.5].zoom > 1.25 && near(151, -45) && near(296, 45) && near(306, -45), `6라운드의 피버 둘: 첫 번째는 비스듬히 위로(${c[138] && c[138].rot.toFixed(0)}도) → 얇은 굴(${c[142.5] && c[142.5].zoom.toFixed(2)}배) → 비스듬히 아래로(${c[151] && c[151].rot.toFixed(0)}도), 두 번째는 넓은 통로가 비스듬히 위로(${c[296] && c[296].rot.toFixed(0)}도) → 크게 휘어 아래로(${c[306] && c[306].rot.toFixed(0)}도). 앞의 꽉 찬 리듬(마디 16)은 피버가 아니다`); }
    // 7라운드(예측을 깨는 라운드): 헛다리, 들쭉날쭉한 되풀이, 앞에서 뚝·앞에서 손 바꿈. 피버는 절정 두 곳, 둘 다 넓은 통로
    await G(() => { const g = window.__game; g.fake.on = false; g.startFresh(); g.pause(); });
    await Promise.all([p.waitForNavigation(), p.click('#rounds button:nth-child(7)')]); await ready();
    st = await G(() => { const g = window.__game, L = g.L, t = g.track; return { round: g.round, name: t.name, bpm: t.bpm, off: t.offset, cps: L.cps.length, rides: L.rides.length, rush: L.rides.reduce((u, r) => u + (r[1] - r[0]) / 16, 0), goal: L.goalX }; });
    ok(st.round === 6 && st.name.includes('Sunday in the Playroom') && Math.abs(st.bpm - 152) < 0.01 && st.off === 0.064 && st.cps === 9 && st.rides === 2 && st.rush === 14 && Math.abs(st.goal - (79 * 16 + 5.5)) < 1e-9, `7라운드를 누르면 그 코스와 곡으로 다시 열린다 (${st.name}, ${st.bpm.toFixed(2)} BPM, 체크포인트 ${st.cps}개, 피버 ${st.rides}번 ${st.rush}마디, 결승선은 마디 79의 둘째 박 반)`);
    await G(() => { const g = window.__game; g.fake.on = true; g.setBot(g.L.ref); g.startFresh(); });
    const shots7 = { 10.0: 'r7_intro', 37.0: 'r7_feint', 58.0: 'r7_trap3', 74.0: 'r7_first_stop', 105.0: 'r7_first_hand', 130.0: 'r7_wide_in', 134.0: 'r7_pads', 138.0: 'r7_pads_down', 146.0: 'r7_pad_gone', 153.5: 'r7_pad_narrow', 169.25: 'r7_ring3', 173.5: 'r7_ring3_top', 177.25: 'r7_ring_bait', 206.0: 'r7_ring_far', 229.0: 'r7_groove', 262.0: 'r7_full', 290.0: 'r7_up', 297.0: 'r7_up_trap', 302.0: 'r7_lean_pads', 309.0: 'r7_flat', 317.0: 'r7_finish' };
    const cams7 = {};
    for (let beat = 0; beat <= 330; beat += 0.25) {
      await tick(beat);
      if (shots7[beat]) { await p.waitForTimeout(60); await p.screenshot({ path: out + shots7[beat] + '.png' }); }
      if (beat === 132 || beat === 142 || beat === 150 || beat === 296 || beat === 306) cams7[beat] = await G(() => { const g = window.__game, c = g.cam(g.state.x); return { rot: c.rot, mode: g.state.mode }; });
      if (await G(() => window.__game.phase) !== 'running') break;
    }
    st = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp, cps: window.__game.L.cps.length, gems: window.__game.gems }));
    ok(st.phase === 'won' && st.cp === st.cps - 1 && st.gems.got === st.gems.total, `7라운드도 패턴대로 누르면 완주 (수정 ${st.gems.got}/${st.gems.total}개)`);
    { const g7 = await G(() => { const L = window.__game.L; let rings = 0; for (let c = 0; c < L.cols; c++) if (L.grid.some((row, r) => row[c] === 'O' && (r === 0 || L.grid[r - 1][c] !== 'O'))) rings++; return { pads: L.pads.size, rings }; });
      ok(g7.pads >= 8 && g7.rings === 6, `7라운드의 새 장치: 피버의 튕김판 ${g7.pads}개(공중에 뜬 파란 판), 바운스의 충전 고리 ${g7.rings}개(삼단 점프와 미끼 고리)`); }
    { const c = cams7, near = (b, v) => c[b] && Math.abs(c[b].rot - v) < 1;
      ok(c[132] && c[132].mode === 'rush' && near(132, 0) && near(142, -45) && near(150, 0) && near(296, 90) && near(306, 45), `7라운드의 피버 둘: 첫 번째는 곧게 가다가 비스듬히 아래로(${c[142] && c[142].rot.toFixed(0)}도) 내려가서 펴지고, 두 번째는 곧장 위로(${c[296] && c[296].rot.toFixed(0)}도) 섰다가 비스듬히(${c[306] && c[306].rot.toFixed(0)}도) 눕는다`); }
    // 8라운드(계단의 라운드): 공이 공중에 뜬 파란 박스를 실제로 딛고 오르내리고, 카메라가 따라 오르내린다
    await G(() => { const g = window.__game; g.fake.on = false; g.startFresh(); g.pause(); });
    await Promise.all([p.waitForNavigation(), p.click('#rounds button:nth-child(8)')]); await ready();
    st = await G(() => { const g = window.__game, L = g.L, t = g.track; return { round: g.round, name: t.name, bpm: t.bpm, off: t.offset, cps: L.cps.length, rides: L.rides.length, bands: L.bands.size, climb: g.climb(0).any }; });
    ok(st.round === 7 && st.name.includes('Velocity of a Thousand Suns') && Math.abs(st.bpm - 150) < 0.01 && st.off === 0.073 && st.cps === 9 && st.rides === 1 && st.bands > 60 && st.climb, `8라운드를 누르면 그 코스와 곡으로 다시 열린다 (${st.name}, ${st.bpm.toFixed(2)} BPM, 체크포인트 ${st.cps}개, 피버 ${st.rides}번, 계단의 빨간 덩어리 ${st.bands}칸)`);
    await G(() => { const g = window.__game; g.fake.on = true; g.setBot(g.L.ref); g.startFresh(); });
    const shots8 = { 9.0: 'r8_first_steps', 13.5: 'r8_jump_step', 21.0: 'r8_red_step', 34.0: 'r8_hill', 41.0: 'r8_trap_lid', 50.0: 'r8_two_bar', 66.0: 'r8_down', 83.0: 'r8_shift_trap', 99.0: 'r8_mountain_up', 103.0: 'r8_mountain_top', 108.0: 'r8_mountain_down', 122.0: 'r8_swap_trap', 166.0: 'r8_fever', 200.0: 'r8_sync', 262.0: 'r8_mountain2', 292.0: 'r8_final_up', 296.0: 'r8_final_top', 312.0: 'r8_finish' };
    const cams8 = {}; let hi8 = 0, top8 = 1e9;
    for (let beat = 0; beat <= 330; beat += 0.25) {
      await tick(beat);
      if (shots8[beat]) { await p.waitForTimeout(60); await p.screenshot({ path: out + shots8[beat] + '.png' }); }
      const q = await G(() => { const g = window.__game, c = g.climb(g.state.x), cv = document.getElementById('view'), T = g.view.zT || g.view.T; return { phase: g.phase, h: 9 - g.state.y, at: c.at, cam: c.cam, y: g.view.groundY - (9 - g.state.y - c.cam + 0.8) * T, mode: g.state.mode }; });
      if (q.mode === 'bounce') { hi8 = Math.max(hi8, q.h); top8 = Math.min(top8, q.y); }
      if (beat === 103 || beat === 30 || beat === 170) { await p.waitForTimeout(400); cams8[beat] = await G(() => { const g = window.__game, c = g.climb(g.state.x); return { at: c.at, cam: c.cam, mode: g.state.mode }; }); }      // (카메라는 실제 시간으로 따라가므로 잠깐 기다렸다가 잰다)
      if (q.phase !== 'running') break;
    }
    st = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp, cps: window.__game.L.cps.length, gems: window.__game.gems }));
    ok(st.phase === 'won' && st.cp === st.cps - 1, `8라운드도 패턴대로 누르면 완주`);
    ok(hi8 > 9 && cams8[103] && cams8[103].at >= 6 && cams8[103].cam >= 5 && cams8[170] && cams8[170].mode === 'rush' && Math.abs(cams8[170].cam) < 0.2, `계단: 공이 ${hi8.toFixed(1)}칸 높이까지 올라가고(큰 산의 꼭대기에서 딛는 높이 ${cams8[103] && cams8[103].at.toFixed(1)}칸), 카메라가 따라 올라간다(${cams8[103] && cams8[103].cam.toFixed(1)}칸). 피버에서는 내려와 있다(${cams8[170] && cams8[170].cam.toFixed(2)}칸)`);
    // 카메라는 작은 계단마다 출렁이지 않는다: 한 마디짜리 계단(마디 3~6, 디딤이 0 ↔ 3칸을 오르내린다)을 지나는 동안 카메라가 움직이는 폭, 그리고 방향이 바뀌는 횟수
    { const r = await G(() => { const g = window.__game; let lo = 1e9, hi = -1e9, turns = 0, ext = null, dir = 0; for (let x = 3 * 16; x <= 7 * 16; x += 0.25) { const v = g.climb(x).line; lo = Math.min(lo, v); hi = Math.max(hi, v); if (ext === null) ext = v; else if (dir >= 0 ? v > ext : v < ext) ext = v; else if (Math.abs(v - ext) > 0.15) { if (dir) turns++; dir = Math.sign(v - ext); ext = v; } } /* 0.15칸 넘게 되돌아갈 때만 방향이 바뀌었다고 센다 */ let foot = [1e9, -1e9]; for (let x = 3 * 16; x <= 7 * 16; x += 0.25) { const a = g.climb(x).at; foot = [Math.min(foot[0], a), Math.max(foot[1], a)]; } return { lo, hi, turns, foot }; });
      ok(r.hi - r.lo < 0.6 && r.turns <= 2 && r.foot[1] - r.foot[0] >= 3, `카메라는 작은 계단마다 출렁이지 않는다: 디딤이 ${r.foot[0].toFixed(1)}~${r.foot[1].toFixed(1)}칸을 오르내리는 네 마디 동안 카메라는 ${(r.hi - r.lo).toFixed(2)}칸 안에서만 움직이고, 0.15칸 넘게 되돌아가는 것은 ${r.turns}번`); }
    // 패턴이 있는 체크포인트(5~8라운드, 개발하는 동안): 체크포인트에서 다시 시작하면 한 마디 앞에서 저절로 달리다가(공이 깜빡인다) 체크포인트에서 조작을 넘겨받는다
    { await G(() => { const g = window.__game; g.fake.on = true; g.setBot({ presses: [], holds: [] }); g.devJump(3); });
      const c = await G(() => { const g = window.__game, cp = g.L.cps[3]; return { lead: cp.lead.step, snap: cp.snap.step, bar: cp.bar, step: g.state.step, cp: g.state.cp }; });
      for (let beat = c.lead / 96; beat <= c.snap / 96 - 0.01; beat += 0.25) await tick(beat);
      const mid = await G(() => ({ phase: window.__game.phase, step: window.__game.state.step }));
      await tick(c.snap / 96 + 0.05);
      const at = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp }));
      for (let beat = c.snap / 96; beat <= c.snap / 96 + 8; beat += 0.25) { await tick(beat); if (await G(() => window.__game.phase) !== 'running') break; }
      const after = await G(() => ({ phase: window.__game.phase, x: window.__game.state.x }));
      await p.waitForTimeout(150); await p.screenshot({ path: out + 'r8_cp_restart.png' });
      ok(c.step === c.lead && c.cp === 2 && mid.phase === 'running' && at.phase === 'running' && at.cp === 3 && after.phase === 'dead' && after.x >= c.bar * 16 && after.x < c.bar * 16 + 40,
        `패턴이 있는 체크포인트: 4번째 체크포인트(마디 ${c.bar})에서 다시 시작하면 한 마디 앞에서 저절로 달리고(아무것도 안 눌러도 살아 있다), 체크포인트에서 조작을 넘겨받는다. 그 뒤 안 누르면 마디 ${(after.x / 16).toFixed(1)}에서 죽는다`); }
    // 계단의 빨간 덩어리는 모두 그린다(한 칸에 빨간 단과 뚜껑이 같이 있어도): 그리는 목록의 덩어리 수 = 판정의 덩어리 수
    { const r = await G(() => { const g = window.__game, L = g.L; let n = 0; for (const [c, q] of L.bands) for (const [lo, hi] of q) if (!(L.bands.get(c - 1) || []).some((v) => v[0] === lo && v[1] === hi)) n++; let two = 0; for (const q of L.bands.values()) if (q.length >= 2) two++; return { runs: g.bandRuns.length, n, two }; });
      ok(r.runs === r.n && r.two > 0, `계단의 빨간 덩어리 ${r.n}개를 모두 그린다(빨간 단과 그 위의 뚜껑이 한 칸에 같이 있는 칸 ${r.two}개 포함)`); }
    ok(top8 > -40, `카메라가 따라가서, 가장 높이 뛰었을 때도 공이 화면 위로 멀리 나가지 않는다(공 윗면의 가장 높은 자리 y=${top8.toFixed(0)}px)`);
    // 9라운드(피버 위주, 움직이는 장애물)
    await G(() => { const g = window.__game; g.fake.on = false; g.startFresh(); g.pause(); });
    await Promise.all([p.waitForNavigation(), p.click('#rounds button:nth-child(9)')]); await ready();
    st = await G(() => { const g = window.__game, L = g.L, t = g.track; return { round: g.round, name: t.name, bpm: t.bpm, off: t.offset, cps: L.cps.length, rush: L.rides.reduce((u, r) => u + (r[1] - r[0]) / 16, 0), mv: L.reds.filter((q) => q.mv).length }; });
    ok(st.round === 8 && st.name.includes('Midnight Asphalt Rush') && Math.abs(st.bpm - 150) < 0.01 && st.off === 0.078 && st.cps === 9 && st.rush >= 40 && st.mv >= 60, `9라운드를 누르면 그 코스와 곡으로 다시 열린다 (${st.name}, ${st.bpm.toFixed(2)} BPM, 피버 ${st.rush}마디, 움직이는 장애물 ${st.mv}개)`);
    await G(() => { const g = window.__game; g.fake.on = true; g.setBot(g.L.ref); g.startFresh(); });
    const shots9 = { 33.0: 'r9_pump_far', 34.0: 'r9_pump_hit', 34.5: 'r9_pump_hide', 65.0: 'r9_decoy_out', 66.0: 'r9_decoy_in', 105.0: 'r9_wide_sway', 170.0: 'r9_peak', 175.0: 'r9_peak2', 235.0: 'r9_mix', 300.0: 'r9_final' };
    for (let beat = 0; beat <= 330; beat += 0.25) {
      await tick(beat);
      if (shots9[beat]) { await p.waitForTimeout(60); await p.screenshot({ path: out + shots9[beat] + '.png' }); }
      if (await G(() => window.__game.phase) !== 'running') break;
    }
    st = await G(() => ({ phase: window.__game.phase, cp: window.__game.state.cp, cps: window.__game.L.cps.length, gems: window.__game.gems }));
    ok(st.phase === 'won' && st.cp === st.cps - 1 && st.gems.got === st.gems.total, `9라운드도 패턴대로 누르면 완주 (수정 ${st.gems.got}/${st.gems.total}개)`);
    await G(() => { const g = window.__game; g.fake.on = false; g.startFresh(); g.pause(); });
    await Promise.all([p.waitForNavigation(), p.click('#rounds button:nth-child(1)')]); await ready();
    ok(await G(() => window.__game.round) === 0, '다시 1라운드로 돌아올 수 있다');
  }
  console.log('콘솔/페이지 오류:', errs.length ? errs : '없음');
  console.log('실패 ' + fails + '건');
  await b.close(); srv.close();
  process.exit(fails || errs.length ? 1 : 0);
})();

// 실행: node bounce2d/tests/track.test.js
// 템포와 첫 박을 아는 곡을 만들어서 분석기가 맞게 재는지 본다.
const { analyzeTrack } = require('../track.js');
let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ok  ' : '  FAIL ') + msg); if (!c) fails++; };

// 킥(매 박) + 스네어(2·4박) + 엇박 하이햇 + 16분 베이스 + 깔리는 소리. beatAt(k) = k번째 박의 시각(초)
function makeTrack({ sr = 44100, seconds = 60, beatAt, kickFrom = 0, kickGap = null, seed = 1 }) {
  const x = new Float32Array(Math.floor(sr * seconds));
  let rnd = seed; const rand = () => ((rnd = (rnd * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const add = (t, dur, fn) => { const i0 = Math.round(t * sr); for (let i = 0; i < dur * sr && i0 + i < x.length; i++) if (i0 + i >= 0) x[i0 + i] += fn(i / sr); };
  for (let i = 0; i < x.length; i++) x[i] += 0.05 * Math.sin(2 * Math.PI * 220 * i / sr) + 0.02 * rand();     // 패드 + 잡음
  for (let k = 0; beatAt(k) < seconds; k++) {
    const t = beatAt(k), next = beatAt(k + 1), gap = kickGap && k >= kickGap[0] && k < kickGap[1];
    if (k >= kickFrom && !gap) add(t, 0.22, (u) => 0.9 * Math.exp(-u * 18) * Math.sin(2 * Math.PI * (45 * u + 95 * (1 - Math.exp(-u * 30)) / 30)));
    if (k % 2 === 1) add(t, 0.12, (u) => 0.35 * Math.exp(-u * 30) * rand());
    add((t + next) / 2, 0.04, (u) => 0.2 * Math.exp(-u * 90) * rand());
    for (let s = 0; s < 4; s++) { const ts = t + (next - t) * s / 4; add(ts, 0.1, (u) => 0.18 * Math.exp(-u * 25) * Math.sign(Math.sin(2 * Math.PI * 110 * u))); }
  }
  return { x, sr };
}
const steady = (bpm, offset) => (k) => offset + k * 60 / bpm;

console.log('== 템포가 고정된 곡 ==');
for (const [bpm, offset, hint] of [[96, 0, 96], [96.4, 0.731, 96], [100, 0.25, 96], [92.13, 1.2, 96], [128, 0.05, 128], [87, 0.4, 87]]) {
  const { x, sr } = makeTrack({ beatAt: steady(bpm, offset) });
  const r = analyzeTrack(x, sr, { hintBpm: hint });
  ok(r.ok && Math.abs(r.bpm - bpm) < 0.02 && Math.abs(r.offset - offset) < 0.008 && r.wobbleMs < 5,
    `${bpm} BPM, 첫 박 ${offset}초 → 측정 ${r.ok ? `${r.bpm.toFixed(3)} BPM, 첫 박 ${r.offset.toFixed(4)}초, 흔들림 ${r.wobbleMs.toFixed(1)}ms, 킥 잡힌 박 ${(r.coverage * 100).toFixed(0)}%` : r.reason}`);
}
{
  const { x } = makeTrack({ sr: 48000, seconds: 108, beatAt: steady(96, 0.02) });
  const t = Date.now(), r = analyzeTrack(x, 48000);
  const end = Math.abs((r.offset + 170 * r.period) - (0.02 + 170 * 0.625)) * 1000;
  ok(r.ok && end < 6, `1분 48초짜리 곡: 끝(171번째 박)에서의 어긋남 ${end.toFixed(1)}ms (분석 ${Date.now() - t}ms)`);
}

console.log('== 까다로운 곡 ==');
{
  // 인트로 4박은 킥 없이 시작 → 첫 킥이 나오는 박을 첫 박으로 잡는다(사람이 한 박씩 밀어서 고친다)
  const { x, sr } = makeTrack({ beatAt: steady(96, 0.1), kickFrom: 4 });
  const r = analyzeTrack(x, sr);
  const beatsOff = (r.offset - 0.1) / 0.625;
  ok(r.ok && Math.abs(r.bpm - 96) < 0.02 && Math.abs(beatsOff - Math.round(beatsOff)) < 0.015, `킥 없이 시작하는 인트로: 템포는 맞고, 첫 박은 박 단위로만 어긋난다(이번엔 ${Math.round(beatsOff)}박)`);
}
{
  // 중간 8마디(32박)는 킥이 빠지는 브레이크
  const { x, sr } = makeTrack({ seconds: 90, beatAt: steady(96, 0.3), kickGap: [48, 80] });
  const r = analyzeTrack(x, sr);
  ok(r.ok && Math.abs(r.bpm - 96) < 0.02 && Math.abs(r.offset - 0.3) < 0.008, `킥이 빠지는 구간이 있어도 맞게 잰다 (${r.bpm.toFixed(3)} BPM, 킥 잡힌 박 ${(r.coverage * 100).toFixed(0)}%)`);
}
{
  // 템포가 곡 안에서 서서히 빨라졌다 느려지는 곡: 박이 최대 약 40ms 밀린다 → 흔들림으로 보고해야 한다
  const { x, sr } = makeTrack({ beatAt: (k) => 0.2 + k * 0.625 + 0.04 * Math.sin(k / 96 * 2 * Math.PI) });
  const r = analyzeTrack(x, sr);
  ok(r.ok && r.wobbleMs > 15, `템포가 흔들리는 곡은 흔들림이 크게 나온다 (${r.wobbleMs.toFixed(1)}ms)`);
}
{
  const r = analyzeTrack(new Float32Array(44100 * 10), 44100);
  ok(!r.ok, `소리가 없는 파일은 거절한다 (${r.reason})`);
}
console.log('== 실제 곡 (ffmpeg가 있을 때만) ==');
{
  // 코스에 실린 곡들: 코스에 적어 둔 템포·첫 박·길이가 곡에서 잰 값과 맞는가
  const { execFileSync } = require('child_process'), path = require('path');
  const Lg = require('../logic.js');
  for (const C of Lg.COURSES) {
    let pcm = null;
    try { pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(__dirname, '..', C.track.file), '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'], { maxBuffer: 64 * 1024 * 1024 }); } catch (e) { /* ffmpeg 없음 */ }
    if (!pcm) { console.log(`  (건너뜀: ffmpeg를 찾지 못했어요 — ${C.name})`); continue; }
    const x = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
    if (C.track.measured) {
      // 게임 안 분석기가 빠르기를 틀리게 읽는 곡: 코스에 적은 박(손으로 잰 값)이 곡의 날카로운 소리와 맞는지 직접 본다.
      // 박마다 앞뒤 0.1초에서 소리가 갑자기 커지는 순간을 찾아, 그 순간이 박에서 얼마나 떨어져 있는지 잰다.
      const sr = 44100, acc = new Float64Array(x.length + 1);
      for (let i = 1; i < x.length; i++) acc[i + 1] = acc[i] + Math.abs(x[i] - x[i - 1]);
      const w = Math.round(0.002 * sr), env = (i) => (acc[Math.min(x.length, i + w)] - acc[Math.max(0, i)]) / w;
      const per = 60 / C.bpm, goalBeat = C.bars.indexOf('goal') * 4, offs = [];
      const med = (a) => { const v = Float64Array.from(a).sort(); return v[v.length >> 1]; };
      for (let k = 8; k < goalBeat; k++) {
        const t0 = C.track.offset + k * per, i0 = Math.round((t0 - 0.1) * sr), n = Math.round(0.2 * sr);
        if (i0 < Math.round(0.06 * sr) || i0 + n + w >= x.length) continue;
        const pre = []; for (let i = i0 - Math.round(0.05 * sr); i < i0 + Math.round(0.04 * sr); i += 8) pre.push(env(i));
        const base = med(pre); let pk = 0; for (let i = i0; i < i0 + n; i += 4) pk = Math.max(pk, env(i));
        if (pk < 4 * base) continue;
        const th = base + 0.35 * (pk - base); let j = 0; while (j < n && env(i0 + j) <= th) j++;
        offs.push({ k, ms: (j / sr - 0.1) * 1000 });
      }
      const near = offs.filter((o) => o.ms > -20 && o.ms < 10), m = near.length ? med(near.map((o) => o.ms)) : 99;
      const early = near.filter((o) => o.k < goalBeat / 3), late = near.filter((o) => o.k > goalBeat * 2 / 3);
      const drift = early.length > 3 && late.length > 3 ? med(late.map((o) => o.ms)) - med(early.map((o) => o.ms)) : 99;
      ok(offs.length >= 40 && near.length / offs.length > 0.75 && Math.abs(m + 5) < 6, `${C.name}: 코스에 적은 박(${C.bpm} BPM, 첫 박 ${C.track.offset}초)이 곡의 날카로운 소리와 맞는다 — ${offs.length}곳 가운데 ${near.length}곳이 박 언저리, 가운데값 ${m.toFixed(1)}ms`);
      ok(Math.abs(drift) < 12, `  곡 앞쪽과 뒤쪽의 어긋남 차이 ${drift.toFixed(1)}ms (빠르기가 맞다. 앞쪽은 악기가 달라 소리가 커지는 모양이 조금 다르므로 몇 ms는 차이 난다)`);
      const r0 = analyzeTrack(x, 44100, { hintBpm: 96 });
      console.log(`  (참고) 게임 안 분석기는 이 곡을 ${r0.ok ? r0.musicBpm.toFixed(1) + ' BPM' : '못 잼'}으로 읽는다. 코스의 값은 손으로 잰 것이다.`);
      const goal = C.bars.indexOf('goal'), endSec = C.track.offset + goal * 4 * 60 / C.bpm, dur = x.length / sr;
      ok(endSec < dur && dur - endSec < 8, `  결승선 마디(${goal})가 곡의 ${endSec.toFixed(1)}초, 곡 길이 ${dur.toFixed(1)}초`);
      continue;
    }
    const r = analyzeTrack(x, 44100, { hintBpm: 96 });
    ok(r.ok && Math.abs(r.musicBpm - C.bpm) < 0.06, `${C.name}: 곡 ${r.musicBpm.toFixed(2)} BPM (코스에 적힌 값 ${C.bpm.toFixed(3)})`);
    // 코스의 첫 박은 첫 킥과 같거나, 킥 없이 시작하는 곡이면 그보다 몇 박 앞이다(박 단위로만 다르다)
    const beatSec = 60 / r.musicBpm, lead = (r.offset - C.track.offset) / beatSec;
    ok(Math.abs(lead - Math.round(lead)) * beatSec < 0.01 && Math.round(lead) >= 0 && Math.round(lead) <= 8 && r.coverage > 0.85, `  첫 킥 ${r.offset.toFixed(3)}초, 코스의 첫 박 ${C.track.offset}초(첫 킥보다 ${Math.round(lead)}박 앞), 킥 잡힌 박 ${(r.coverage * 100).toFixed(0)}%`);
    ok(r.wobbleMs < 60, `  템포 흔들림 ±${r.wobbleMs.toFixed(0)}ms`);
    const goal = C.bars.indexOf('goal'), endSec = C.track.offset + goal * 4 * 60 / C.bpm;
    ok(endSec < r.duration && (C.lab || r.duration - endSec < 8), `  결승선 마디(${goal})가 곡의 ${endSec.toFixed(1)}초, 곡 길이 ${r.duration.toFixed(1)}초`);
  }
}
console.log('실패 ' + fails + '건');
process.exit(fails ? 1 : 0);

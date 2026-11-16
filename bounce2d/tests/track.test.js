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
    const r = analyzeTrack(x, 44100, { hintBpm: 96 });
    ok(r.ok && Math.abs(r.musicBpm - C.bpm) < 0.06, `${C.name}: 곡 ${r.musicBpm.toFixed(2)} BPM (코스에 적힌 값 ${C.bpm.toFixed(3)})`);
    ok(Math.abs(r.offset - C.track.offset) < 0.01 && r.coverage > 0.85, `  첫 박 ${r.offset.toFixed(3)}초 (코스에 적힌 값 ${C.track.offset}초), 킥 잡힌 박 ${(r.coverage * 100).toFixed(0)}%`);
    ok(r.wobbleMs < 60, `  템포 흔들림 ±${r.wobbleMs.toFixed(0)}ms`);
    const goal = C.bars.indexOf('goal'), endSec = C.track.offset + goal * 4 * 60 / C.bpm;
    ok(endSec < r.duration && r.duration - endSec < 8, `  결승선 마디(${goal})가 곡의 ${endSec.toFixed(1)}초, 곡 길이 ${r.duration.toFixed(1)}초`);
  }
}
console.log('실패 ' + fails + '건');
process.exit(fails ? 1 : 0);

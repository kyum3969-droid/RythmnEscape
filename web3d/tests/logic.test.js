// 실행: node web3d/tests/logic.test.js web3d/index.html
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const code = html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1];
const m = { exports: {} }; new Function('module', code)(m);
const { LEVELS, initState, step, solve, createJudge } = m.exports;
let fails = 0; const ok = (c, msg) => { console.log((c ? '  ok  ' : '  FAIL ') + msg); if (!c) fails++; };
const want = [8, 10, 10, 13, 18, 15];
LEVELS.forEach((l, i) => { const s = solve(l); ok(s && s.length === want[i], `스테이지 ${i + 1} 최소 ${want[i]}턴 (Godot과 같음)`); });
const M = { u: 'up', d: 'down', l: 'left', r: 'right', w: 'wait' };
const play = (i, seq) => { let s = initState(LEVELS[i]); for (const c of seq) { const n = step(s, M[c]); if (!n) return null; s = n; if (s.status !== 'playing') break; } return s; };
[[0, 'rrrrddll'], [1, 'ddddrrrrrr'], [2, 'ddddrrddll'], [3, 'dddddwdrrrrrr'], [4, 'drdrrruurrrrdddllu'], [5, 'rwrrrddrruurrdd']]
  .forEach(([i, q]) => ok(play(i, q)?.status === 'won', `스테이지 ${i + 1} Godot 테스트의 풀이로 클리어`));
const fresh = () => { const j = createJudge(); j.resetClock(0.5, 0.3); return j; };
let j = fresh(); ok(j.input('right', 1.8)[0]?.kind === 'perfect', '정각 = PERFECT');
j = fresh(); ok(j.input('right', 1.92)[0]?.kind === 'good', '+120ms = GOOD');
j = fresh(); ok(j.input('down', 1.4).length === 0 && j.pending === 'down', '일찍 = 예약');
ok(j.advance(1.81)[0]?.kind === 'queued', '예약은 다음 박자에 실행');
j = fresh(); const w = j.advance(1.97); ok(w.length === 1 && w[0].kind === 'wait' && j.actions === 0, '안 누르면 벌점 없는 대기');
j = fresh(); for (let i = 0; i < 6; i++) j.input('right', 1.8 + 0.5 * i); ok(j.score === 600 + (2 + 3 + 4 + 5 + 6) * 5 && j.rank() === 'S', '점수/랭크 Godot과 같은 공식');
console.log('실패 ' + fails + '건'); process.exit(fails ? 1 : 0);

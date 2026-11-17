// 계단을 짜는 도구(8라운드부터). 공이 실제로 딛고 오르내리는 파란 박스의 줄을 만든다.
//
// 물리(logic.js 그대로): 공은 딛고 있는 곳의 높이 h(칸)마다 정해진 박에 튄다 — 정박보다 h/8박 이르게. 그래서
//   한 칸 높은 단에는 0.875박 만에, 한 칸 낮은 단에는 1.125박 만에 닿아 바로 튄다(저절로 오르내린다).
//   높은 단(두 칸~네 칸 위)은 꼭대기에서 이단 점프를 해야 닿는다. 빨간 단은 꼭대기에서 멈춰서(한 박) 그 위를 떠서 건너뛴다.
// 뜀 하나 = { to: 내려설 높이, how: 'a' 저절로 | 'j' 이단 점프 | 'h' 멈춰서 건너뛰기, red: 건너뛸 빨간 단의 높이, lid: 'jump' | 'hold' 뚜껑(버릇대로 뛰거나 멈추면 걸리는 빨간 덩어리) }
// 줄(뜀들)은 땅에서 시작해 땅에서 끝난다. 길이(박) = 저절로 뛰는 것 하나에 1, 이단 점프·건너뛰기 하나에 2 — 그래서 4박(한 마디)의 배수로 맞추면 마디 선에서 땅에 닿는다.
const Lg = require('./logic.js');
const SUB = Lg.SUB, BAR = 4 * SUB;
const fall = (d) => Math.sqrt(Math.max(0, d) / 9);            // d칸을 떨어지는 데 걸리는 박(꼭대기에서 2.25칸을 반 박에 떨어진다)
const SLOTS = (hp) => (hp.how === 'a' || !hp.how ? 1 : 2);

// 뜀의 줄 → 닿는 시각·자리, 입력, 빨간 단, 뚜껑, 함정(버릇대로 누른 달리기)
function compile(hops) {
  let t = 0, lv = 0;
  const steps = [], reds = [], presses = [], holds = [], lids = [], traps = [], air = [];
  let off = null;                                               // 땅을 떠난 시각(빨간 바닥을 깔 구간)
  for (const hp of hops) {
    const b = hp.to, how = hp.how || 'a';
    if (lv === 0 && b > 0 && off === null) off = t;
    let land;
    if (how === 'j') { presses.push(t + 0.5); land = t + 1.0 + fall(lv + 4.5 - b); }
    else if (how === 'h') { holds.push([t + 0.5, t + 1.5]); land = t + 1.5 + fall(lv + 2.25 - b); if (hp.swap) traps.push({ swap: [t + 0.5, t + 1.5], at: t }); }
    else land = t + 0.5 + fall(lv + 2.25 - b);
    if (hp.red !== undefined) {
      // 빨간 단: 저절로 뛰면 내려설 자리에 놓인다. 그 위에는 빨간 덩어리가 떠 있어서(5라운드의 빨간 돌과 같다) 이단 점프로는 못 넘는다 — 멈춘 공만 그 사이로 지나간다
      const lr = t + 0.5 + fall(lv + 2.25 - hp.red);
      reds.push({ lv: hp.red, x0: 4 * lr - 0.9, x1: 4 * lr + 0.9 });
      lids.push({ lo: lv + 3.6, hi: lv + 5.4, x0: 4 * lr - 0.8, x1: 4 * lr + 0.8 });
    }
    if (hp.trap === 'hold') traps.push({ holds: [[t + 0.5, t + 1.5]], at: t });                    // 버릇대로 멈추면(뒤로 밀린 빨간 단에 내려앉아) 죽어야 한다
    // 낮아진 단 위의 뚜껑: 버릇대로 뛰면 걸린다. 뚜껑은 단의 앞쪽 위에만 놓는다(칸이 통째로 이 범위 안에 드는 것만) — 단을 딛고 다시 튀는 공이 뚜껑 밑을 스치지 않게
    if (hp.lid === 'jump') { lids.push({ lo: lv + 3.6, hi: lv + 5.4, x0: 4 * t + 2.0, x1: 4 * t + 3.2, inner: true }); traps.push({ presses: [t + 0.5], at: t }); }
    const ph = ((-b / 8) % 1 + 1) % 1;                         // 그 높이에서 튀는 박
    let tb = Math.ceil(land - 0.125 - ph - 1e-9) + ph;
    if (tb < land) tb = land;                                  // 1/8박 안으로 늦게 닿았으면 닿자마자 튄다
    steps.push({ lv: b, land, t: tb, how, from: lv });
    if (b === 0 && off !== null) { air.push([4 * off + 1, 4 * land - 2.5]); off = null; }      // (내려설 땅 앞의 두 칸 반은 비워 둔다: 멈춤을 조금 일찍 놓아 일찍 닿아도 빨간 바닥이 아니게)
    t = tb; lv = b;
  }
  return { steps, reds, lids, presses, holds, traps, air, end: t };
}

// 마디별 패턴으로 자른다. name(i) = i번째 마디의 패턴 이름
function slice(C, name) {
  const nbars = Math.round(C.end / 4), pats = [];
  if (Math.abs(C.end - 4 * nbars) > 1e-6) throw new Error('계단의 길이가 마디에 맞지 않는다: ' + C.end);
  const r4 = (v) => +v.toFixed(4);
  for (let b = 0; b < nbars; b++) {
    const lo = 4 * b, x0 = 16 * b, p = { holds: [], presses: [], tol: 0.18, floats: [], boxes: [], bands: [], redBox: [], lava: [] };
    const mine = (v) => v >= lo - 1e-9 && v < lo + 4 - 1e-9;
    for (const v of C.presses) if (mine(v)) p.presses.push(r4(v - lo));
    for (const h of C.holds) if (mine(h[0])) p.holds.push([r4(h[0] - lo), r4(h[1] - lo)]);
    const cols = (xa, xb) => { const a = Math.max(x0, Math.floor(xa)), z = Math.min(x0 + 15, Math.floor(xb)); return a <= z ? [a - x0, z - x0] : null; };
    for (const s of C.steps) {
      if (s.lv <= 0) continue;
      const c = cols(4 * s.land - (s.how === 'h' ? 1.6 : 0.6), 4 * s.t + 0.6);       // 건너뛰어 내려설 단은 왼쪽으로 한 칸 더(멈춤을 조금 일찍 놓아도 닿게)
      if (!c) continue;
      if (s.lv === 1) p.boxes.push([c[0], c[1], 1]); else p.floats.push([c[0], c[1], s.lv]);
    }
    for (const r of C.reds) { const c = cols(r.x0, r.x1); if (c) { if (r.lv <= 1) p.redBox.push([c[0], c[1], 1]); else p.bands.push([c[0], c[1], r.lv - 1, r.lv]); } }      // 한 칸 높이의 빨간 단은 땅에 선 빨간 박스
    for (const r of C.lids) { const c = r.inner ? cols(Math.ceil(r.x0 - 1e-9), r.x1 - 1) : cols(r.x0, r.x1); if (c) p.bands.push([c[0], c[1], r4(r.lo), r4(r.hi)]); }
    for (const [a, z] of C.air) { const c = cols(Math.max(a, x0), Math.min(z, x0 + 15.99)); if (c && z > x0 && a < x0 + 16) p.lava.push(c); }
    const tr = [];
    for (const q of C.traps) {
      if (q.presses && q.presses.some(mine)) tr.push({ presses: q.presses.filter(mine).map((v) => r4(v - lo)) });
      if (q.holds && q.holds.some((h) => mine(h[0]))) tr.push({ holds: [...p.holds, ...q.holds.filter((h) => mine(h[0])).map((h) => [r4(h[0] - lo), r4(h[1] - lo)])] });
      if (q.swap && mine(q.swap[0])) tr.push({ presses: [r4(q.swap[0] - lo)], holds: p.holds.filter((h) => Math.abs(h[0] - (q.swap[0] - lo)) > 1e-6) });      // 멈출 자리에서 버릇대로 뛴 달리기
    }
    if (tr.length) p.traps = tr;
    if (p.holds.some((h) => h[1] > 4)) p.loose = p.holds.filter((h) => h[1] > 4).map((h) => h[0]);
    for (const k of ['floats', 'boxes', 'bands', 'redBox', 'lava']) if (!p[k].length) delete p[k];
    if (b > 0) p.lead = Array.from({ length: b }, (_, i) => name(i));
    if (b < nbars - 1) p.tail = Array.from({ length: nbars - 1 - b }, (_, i) => name(b + 1 + i));
    p.stair = true;
    pats.push(p);
  }
  return pats;
}

// ---- 무작위로 짜기: 올라가는 구간 → (꼭대기에서 한두 번) → 내려오는 구간. 칸 수(slots = 박)를 꼭 맞춘다
//   올라갈 때: a+1 저절로 / j+2·+3·+4 이단 점프로 높은 단 / hu 빨간 단(+1)을 건너뛰어 +2
//   꼭대기:   a0 같은 높이의 다음 박스 / h0 같은 높이의 빨간 박스를 건너뛰기
//   내려올 때: a-1·-2·-3 저절로 / hd 빨간 단(-1)을 건너뛰어 -2
function randomHill(slots, rng, opt = {}) {
  const maxLv = opt.max || 8, wantPeak = opt.peak, pick = (arr) => arr[Math.floor(rng() * arr.length)];
  for (let tries = 0; tries < 4000; tries++) {
    const hops = [];
    let lv = 0, left = slots, phase = 'up', plain = 0, ok = true;
    while (left > 0 && ok) {
      const opts = [];
      const add = (hp, w) => { const n = SLOTS(hp); if (n <= left) opts.push([hp, w * (hp.how === 'h' ? opt.holdW || 1 : 1)]); };      // holdW = 멈춰서 건너뛰는 단을 더 자주(멈춤의 라운드부터)
      const canDown = (l, s) => l >= 1 && l <= 3 * s && s >= 1;            // 남은 칸 안에 땅까지 내려올 수 있는가(한 칸에 많아야 세 칸 내려간다)
      if (phase === 'up') {
        if (lv + 1 <= maxLv && plain < 2) add({ to: lv + 1 }, 1.2);
        for (const d of [2, 3, 4]) if (lv + d <= maxLv) add({ to: lv + d, how: 'j' }, d === 3 ? 3 : 2);
        if (lv + 2 <= maxLv && lv >= 0) add({ to: lv + 2, how: 'h', red: lv + 1 }, 2.4);
      }
      if (phase !== 'down' && lv >= 2) { add({ to: lv }, 0.5); add({ to: lv, how: 'h', red: lv }, 0.9); }
      if (lv >= 1) {
        for (const d of [1, 2, 3]) if (lv - d >= 0 && plain < 2) add({ to: lv - d }, phase === "up" ? 0.5 : d === 1 ? 1.4 : 1.0);
        if (lv - 2 >= 0) add({ to: lv - 2, how: 'h', red: lv - 1 }, phase === 'up' ? 0.6 : 2.6);
      }
      // 끝까지 갈 수 있는 것만: 이 뜀 뒤에 남은 칸으로 꼭 땅에 닿아야 한다(더 올라갈 수는 없다고 보고 센다 — 올라가는 것은 다음 번에 다시 따진다)
      const good = opts.filter(([hp]) => { const s = left - SLOTS(hp), l = hp.to; return s === 0 ? l === 0 : l >= 1 && (l <= 3 * s) && (phase === 'up' && hp.to >= lv ? true : l >= Math.ceil(s / 2)); });
      if (!good.length) { ok = false; break; }
      let r = rng() * good.reduce((u, q) => u + q[1], 0), hp = good[0][0];
      for (const q of good) { r -= q[1]; if (r <= 0) { hp = q[0]; break; } }
      if (hp.to < lv || (hp.to === lv && phase === 'up')) phase = hp.to < lv ? 'down' : 'top';
      plain = hp.how ? 0 : plain + 1;
      hops.push(hp); left -= SLOTS(hp); lv = hp.to;
      if (lv === 0 && left > 0) { ok = false; break; }
    }
    if (!ok || lv !== 0) continue;
    const peak = Math.max(...hops.map((h) => h.to)), inputs = hops.filter((h) => h.how).length;
    if (wantPeak && peak < wantPeak) continue;
    if (inputs < (opt.inputs || Math.ceil(slots / 4)) ) continue;
    if (opt.need && !opt.need(hops)) continue;
    return hops;
  }
  return null;
}

// 함정으로 바꾸기: i번째 뜀까지는 그대로 두고, 그 뜀을 바꾼 다음 나머지를 다시 짠다(남은 칸에 맞게)
//   'lidJ'  이단 점프로 오르던 단이 낮아졌다(한 칸 위). 버릇대로 뛰면 위의 빨간 덩어리에 걸린다
//   'shift' 멈춰서 건너뛰던 빨간 단이 한 칸 뒤로 밀렸다. 그 자리는 파란 단이라 그냥 딛고, 그다음에 멈춘다. 버릇대로 먼저 멈추면 밀린 빨간 단에 내려앉는다
//           (파란 단 위에 뚜껑을 씌우는 것은 안 된다: 멈춘 공과 그 단을 딛고 다시 튀는 공이 같은 높이를 지나가서, 뚜껑을 놓을 자리가 없다)
//   'swap'  이단 점프로 오르던 자리에 빨간 단이 놓였다: 멈춰서 건너뛴다(뛰면 그 위의 빨간 덩어리에 걸린다)
function variant(hops, i, kind, rng) {
  const pre = hops.slice(0, i), hp = hops[i], lv = i ? hops[i - 1].to : 0;
  let nw = null;
  if (kind === 'lidJ' && hp.how === 'j') nw = [{ to: lv + 1, lid: 'jump' }];
  else if (kind === 'shift' && hp.how === 'h') {
    // 빨간 단이 한 칸 뒤로 밀렸다: 건너뛰던 자리는 파란 단이고(그냥 딛는다), 그다음 단이 빨갛다(거기서 멈춘다). 버릇대로 먼저 멈추면 뒤로 밀린 빨간 단에 내려앉는다
    const d = Math.sign(hp.to - lv), a = hp.red, to2 = a + (d === 0 ? 0 : 2 * d), red2 = a + d;
    if (to2 < 0 || to2 > 8 || red2 < 1) return null;
    nw = [{ to: a, trap: 'hold' }, { to: to2, how: 'h', red: red2 }];
  }
  else if (kind === 'swap' && hp.how === 'j' && lv + 2 <= 8) nw = [{ to: lv + 2, how: 'h', red: lv + 1, swap: true }];
  if (!nw) return null;
  const head = [...pre, ...nw], last = head[head.length - 1].to;
  const used = head.reduce((u, h) => u + SLOTS(h), 0), total = hops.reduce((u, h) => u + SLOTS(h), 0), left = total - used;
  if (left < 0) return null;
  if (left === 0) return last === 0 ? head : null;
  if (last === 0) return null;
  // 나머지: 지금 높이에서 남은 칸으로 땅까지. 원래 줄의 뒤쪽을 되도록 닮게(같은 종류의 뜀을 먼저 해 본다)
  const rest = restOf(last, left, rng, hops.slice(i + 1));
  return rest ? [...head, ...rest] : null;
}
function restOf(lv0, slots, rng, like) {
  for (let tries = 0; tries < 600; tries++) {
    const out = [];
    let lv = lv0, left = slots, plain = 1, k = 0, ok = true;
    while (left > 0) {
      const opts = [];
      const want = like[k];
      const add = (hp, w) => { const s = left - SLOTS(hp), l = hp.to; if (s < 0 || l > 8) return; if (s === 0 ? l !== 0 : !(l >= 1 && l <= 3 * s)) return; opts.push([hp, w * (want && (want.how || 'a') === (hp.how || 'a') && Math.sign(want.to - (k ? like[k - 1].to : lv0)) === Math.sign(hp.to - lv) ? 4 : 1)]); };
      for (const d of [1, 2, 3]) if (lv - d >= 0 && plain < 2) add({ to: lv - d }, 1);
      if (lv - 2 >= 0) add({ to: lv - 2, how: 'h', red: lv - 1 }, 1.6);
      if (lv >= 2 && left >= 3) { add({ to: lv, how: 'h', red: lv }, 0.5); add({ to: lv }, 0.3); }
      if (lv + 2 <= 8 && left >= 3) { add({ to: lv + 2, how: 'j' }, 0.6); add({ to: lv + 3, how: 'j' }, 0.6); add({ to: lv + 2, how: 'h', red: lv + 1 }, 0.6); if (left >= 4) add({ to: lv + 1 }, 0.4); }
      if (!opts.length) { ok = false; break; }
      let r = rng() * opts.reduce((u, q) => u + q[1], 0), hp = opts[0][0];
      for (const q of opts) { r -= q[1]; if (r <= 0) { hp = q[0]; break; } }
      plain = hp.how ? 0 : plain + 1;
      out.push(hp); left -= SLOTS(hp); lv = hp.to; k++;
    }
    if (ok && lv === 0) return out;
  }
  return null;
}

// ---- 달려 보기: 패턴대로 완주하는가, 걷어 낸 칸이 없는가, 입력을 빼면 죽는가, 조금 일찍·늦게 눌러도 지나가는가, 함정은 버릇대로 누르면 죽는가
function check(names, bpm, slack = 14) {
  const bars = ['flat', 'flat', ...names, 'flat', 'flat', 'goal', 'flat'];
  let L; try { L = Lg.buildLevel({ name: 't', bpm, bars, floatReds: true, sections: [{ bar: 0, id: 'a' }] }); } catch (e) { return { ok: false, why: e.message }; }
  if (L.fixed.length) return { ok: false, why: '걷어 낸 칸' };
  const run = (P, H) => { const s = Lg.spawnState(L, -1), ps = new Set(P); let top = 0; while (!s.dead && !s.won) { const n = s.step + 1; Lg.stepState(L, s, ps.has(n), null, H.some((h) => n >= h[0] && n < h[1])); top = Math.max(top, 9 - s.y); } return { won: s.won, x: s.x, top }; };
  const P = L.ref.presses, H = L.ref.holds, r0 = run(P, H);
  if (!r0.won) return { ok: false, why: '패턴대로 가도 죽는다 @' + (r0.x / 16 - 2).toFixed(2) };
  for (let i = 0; i < P.length; i++) {
    if (run(P.filter((_, j) => j !== i), H).won) return { ok: false, why: '안 눌러도 되는 누름' };
    for (const d of [-slack, slack]) if (!run(P.map((v, j) => (j === i ? v + d : v)), H).won) return { ok: false, why: `누름 여유(${d})` };
  }
  for (let i = 0; i < H.length; i++) {
    if (run(P, H.filter((_, j) => j !== i)).won) return { ok: false, why: '안 멈춰도 되는 멈춤' };
    if (run([...P, H[i][0]], H.filter((_, j) => j !== i)).won) return { ok: false, why: '멈춤 대신 뛰어도 된다' };
    for (const d of [-slack, slack]) if (!run(P, H.map((v, j) => (j === i ? [v[0] + d, v[1] + d] : v))).won) return { ok: false, why: `멈춤 시작 여유(${d})` };
    if (!run(P, H.map((v, j) => (j === i ? [v[0], v[1] - slack] : v))).won) return { ok: false, why: '멈춤을 조금 일찍 놓으면 죽는다' };
  }
  // 함정: 패턴에 적힌 "버릇대로 누른 달리기"가 그 마디 언저리에서 죽어야 한다
  let nTrap = 0;
  names.forEach((n, bi) => {
    const p = Lg.PATTERNS[n], lo = (2 + bi) * BAR;
    for (const t of p.traps || []) {
      nTrap++;
      const PP = [...P, ...(t.presses || []).map((v) => lo + Math.round(v * SUB))], inb = (v) => v >= lo && v < lo + BAR;
      const HH = t.holds ? [...H.filter((h) => !inb(h[0])), ...t.holds.map(([a, z]) => [lo + Math.round(a * SUB), lo + Math.round(z * SUB)])] : H;
      const r = run(PP, HH);
      if (r.won || r.x < (2 + bi) * 16 || r.x > (2 + bi) * 16 + 24) nTrap = -99;
    }
  });
  if (nTrap < 0) return { ok: false, why: '함정이 통하지 않는다' };
  return { ok: true, top: r0.top, traps: nTrap };
}

module.exports = { compile, slice, randomHill, variant, check, SLOTS, fall };

// Bot drivers: follow the spline racing line with per-bot variation, drift through corners for boosts,
// dodge obstacles (using each obstacle's blocks() prediction) and use items.
import * as THREE from 'three';
import { clamp } from './config.js';

const _t = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3();
const DIFF = [
  { speed: 0.86, drift: 0.25, avoid: 0.55, react: 0.6 },
  { speed: 0.94, drift: 0.8, avoid: 0.85, react: 0.3 },
  { speed: 1.0, drift: 1.0, avoid: 0.97, react: 0.12 },
];

export function initBot(car) {
  const d = DIFF[clamp(car.diff, 0, 2)];
  car.bot = { d, phase: Math.random() * 10, wob: 0.5 + Math.random() * 0.8, lat: 0, itemT: 1 + Math.random() * 3, drift: false, driftDir: 0,
    skill: d.speed * (0.985 + Math.random() * 0.03), careful: Math.random() < d.avoid, recheck: 0, trick: 0, target: new THREE.Vector3(), retarget: 0 };
}

function steerTo(car, target) {
  _d.subVectors(target, car.pos);
  _r.crossVectors(car.fwd, car.up);
  return Math.atan2(_d.dot(_r), _d.dot(car.fwd));
}

function freeLat(want, cur, blocks, hw) {
  const lim = hw - 1.6, inside = (x) => blocks.some((b) => x > b[0] && x < b[1]);
  want = clamp(want, -lim, lim);
  if (!inside(want)) return want;
  let best = null, bd = Infinity;
  for (const b of blocks) for (const e of [b[0] - 0.4, b[1] + 0.4]) {
    if (e < -lim || e > lim || inside(e)) continue;
    const d = Math.abs(e - cur) + Math.abs(e - want) * 0.3;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

const blocks = [];
export function botThink(car, game, out) {
  const b = car.bot, w = game.world, t = game.simT;
  out.th = 1; out.st = 0; out.dr = false; out.it = false; out.rs = false; out.hn = false; out.ty = 0;
  const speed = car.speed;
  if (w.isArena) return arenaThink(car, game, out);
  const f = car.fr, hw = f.hw;
  // racing line: lean to the inside of upcoming corners, plus personal wobble
  const look = 9 + speed * 0.42;
  const kNear = w.curvatureAt(f.s + look), kFar = w.curvatureAt(f.s + 10 + speed * 0.9);
  let want = clamp(kNear * 30, -0.5, 0.5) * hw + Math.sin(t * 0.35 * b.wob + b.phase) * hw * 0.16 * (1 - Math.min(1, Math.abs(kNear) * 40));
  // things to aim for
  if (b.careful || car.diff > 0) for (const o of game.obstacles) {
    if (!o.attract) continue;
    const a = o.attract(car);
    if (a != null && Math.abs(a - f.lat) < hw * 0.8) { want = a; break; }
  }
  // things to avoid
  let brake = false;
  blocks.length = 0;
  if (b.careful) for (const o of game.obstacles) if (o.blocks) o.blocks(car, t, blocks);
  for (const g of w.gaps) {
    if (!g.plats.length) continue;
    const d = w.wrapD(g.s0 - f.s);
    if (d < -4 || d > 70) continue;
    const p = g.plats[0], ta = t + Math.max(0, d) / Math.max(12, speed);
    const c = p.amp * Math.sin(Math.PI * 2 * (ta / p.period + p.phase));
    blocks.push([-hw - 1, c - p.hw + 1.3], [c + p.hw - 1.3, hw + 1]);
  }
  for (const e of game.items.ents) {
    if (e.owner === car.id && e.arm > 0) continue;
    _d.subVectors(e.pos, car.pos);
    const ahead = _d.dot(f.T);
    if (ahead > 2 && ahead < 45) { const l = _d.dot(f.R) + f.lat; blocks.push([l - 2.6, l + 2.6]); }
  }
  if (blocks.length) {
    const fl = freeLat(want, f.lat, blocks, hw);
    if (fl == null) brake = true; else want = fl;
  }
  b.lat += (want - b.lat) * Math.min(1, 6 / 60 + (1 - b.d.react) * 0.1);
  const edge = f.rail ? 1.6 : 3.2;
  w.posAt(f.s + look, clamp(b.lat, -hw + edge, hw - edge), 0, _t);
  const ang = steerTo(car, _t);
  out.st = clamp(ang * 3.2, -1, 1);
  // cornering: drift when the corner needs more yaw than normal steering gives
  const need = Math.abs(kFar) * speed, dirK = Math.sign(kFar);
  if (!b.drift && need > 0.85 && speed > 22 && car.grounded && Math.random() < b.d.drift && Math.sign(ang) === dirK && !f.sticky) { b.drift = true; b.driftDir = dirK; }
  if (b.drift) {
    out.dr = true;
    if (!car.drifting) out.st = b.driftDir;
    if (ang * b.driftDir < -0.12 || need < 0.4 || car.spinT > 0 || (car.driftLevel() === 3 && need < 0.9)) { b.drift = false; out.dr = false; }
  }
  if (need > 2.3 && !f.sticky) out.th = need > 2.9 ? -1 : 0;
  if (brake) out.th = speed > 9 ? -1 : 0.25;
  // tricks
  if (!car.grounded && car.airTime > 0.2 && car.airTime < 0.3 && b.trick === 0) b.trick = Math.random() < 0.3 + car.diff * 0.2 ? (Math.random() < 0.5 ? 1 : 2) : -1;
  if (car.grounded) b.trick = 0;
  if (b.trick > 0 && car.airTime < 0.3 && !car.grounded) { if (b.trick === 1) out.ty = 1; else out.st = 1; }
  // items
  if (car.item) {
    b.itemT -= 1 / 60;
    if (b.itemT <= 0) {
      let use = false;
      const near = (r, behind) => game.cars.some((c) => c !== car && !c.out && c.pos.distanceToSquared(car.pos) < r * r && (!behind || _d.subVectors(c.pos, car.pos).dot(car.fwd) < 0));
      if (car.item === 'rocket') use = Math.abs(kNear) < 0.008 && car.grounded;
      else if (car.item === 'shield') use = true;
      else if (car.item === 'shock') use = near(13, false);
      else use = near(30, true) || Math.random() < 0.004;
      if (use) { out.it = true; b.itemT = 1.5 + Math.random() * 4; }
    }
  }
  // stuck recovery
  if (game.state === 'racing' && speed < 4 && !car.finished) { car.stuckT += 1 / 60; if (car.stuckT > 2.5) { out.rs = true; car.stuckT = 0; } } else car.stuckT = 0;
  return out;
}

function arenaThink(car, game, out) {
  const b = car.bot, w = game.world;
  b.retarget -= 1 / 60;
  const others = game.cars.filter((c) => c !== car && !c.out);
  if (game.mode === 'potato' && game.ms.bomb === car.id) {
    let best = null, bd = Infinity;
    for (const c of others) { const d = c.pos.distanceToSquared(car.pos); if (d < bd) { bd = d; best = c; } }
    if (best) b.target.copy(best.pos).addScaledVector(best.vel, 0.35);
  } else if (game.mode === 'potato') {
    const h = game.cars.find((c) => c.id === game.ms.bomb);
    if (h && h.pos.distanceToSquared(car.pos) < 45 * 45) {
      _d.subVectors(car.pos, h.pos).setY(0).normalize();
      b.target.copy(car.pos).addScaledVector(_d, 30).addScaledVector(_r.set(-_d.z, 0, _d.x), 14 * Math.sin(b.phase));
      const r = Math.hypot(b.target.x, b.target.z), lim = w.radius * 0.8;
      if (r > lim) { b.target.multiplyScalar(lim / r); b.target.addScaledVector(_r.set(-b.target.z, 0, b.target.x).normalize(), 22 * Math.sign(Math.sin(b.phase) || 1)); }
    } else if (b.retarget <= 0) { w.randomPoint(b.target, 0.75); b.retarget = 2 + Math.random() * 2; }
  } else {
    if (b.retarget <= 0 || car.pos.distanceToSquared(b.target) < 9) {
      const co = game.items.coins; let bd = Infinity, bi = -1;
      for (let i = 0; i < co.n; i++) if (co.active[i]) { const d = co.pos[i].distanceToSquared(car.pos) * (0.6 + ((i * 7 + car.id * 3) % 5) * 0.2); if (d < bd) { bd = d; bi = i; } }
      if (bi >= 0) b.target.copy(co.pos[bi]); else w.randomPoint(b.target, 0.8);
      b.retarget = 1.2 + car.diff * -0.3 + Math.random();
    }
  }
  const ang = steerTo(car, b.target);
  out.st = clamp(ang * 2.5, -1, 1);
  const sp = car.speed;
  out.th = Math.abs(ang) > 1.2 && sp > 16 ? 0 : 1;
  out.dr = Math.abs(ang) > 0.7 && sp > 18 && car.diff > 0;
  if (car.item && Math.random() < 0.01) out.it = true;
  if (game.state === 'racing' && sp < 3) { car.stuckT += 1 / 60; if (car.stuckT > 1.2) { out.th = -1; out.st = 1; if (car.stuckT > 2.2) car.stuckT = 0; } } else if (sp > 6) car.stuckT = 0;
  return out;
}

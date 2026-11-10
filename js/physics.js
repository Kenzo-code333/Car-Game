// Lightweight arcade physics. Cars "raycast" onto the track ribbon through world.sample(), which returns the
// local surface frame (normal, lateral offset, height above road). No general-purpose physics engine involved.
import * as THREE from 'three';
import { TUNE, clamp, lerp } from './config.js';

const YUP = new THREE.Vector3(0, 1, 0);
const right = new THREE.Vector3(), _n = new THREE.Vector3(), _v = new THREE.Vector3();
const TAU = Math.PI * 2;

function endDrift(car, give) {
  const lvl = car.driftLevel();
  car.stats.drift = Math.max(car.stats.drift, car.driftTime);
  if (give && lvl > 0) {
    const b = TUNE.driftBoost[lvl - 1];
    car.boost(b[0], b[1]);
    car.events.push(['dboost', lvl]);
  }
  car.drifting = false; car.driftCharge = 0; car.driftTime = 0;
}

function land(car, impact) {
  if (car.airTime > 0.3) car.stats.air += car.airTime;
  const offP = Math.abs(car.trkP / TAU - Math.round(car.trkP / TAU)) * TAU;
  const offY = Math.abs(car.trkY / TAU - Math.round(car.trkY / TAU)) * TAU;
  const rots = Math.abs(Math.round(car.trkP / TAU)) + Math.abs(Math.round(car.trkY / TAU));
  if (offP > 0.9 || offY > 0.9) {
    car.vel.multiplyScalar(0.82); car.events.push(['sloppy']);
  } else if (rots > 0) {
    car.boost(0.55 + 0.3 * rots, 12); car.stats.tricks += rots; car.events.push(['trick', rots]);
  }
  car.trkP = car.trkY = car.trkPV = car.trkYV = 0;
  if (car.airTime > 0.18) car.events.push(['land', impact]);
}

function trickAxis(car, key, vkey, want, dt) {
  const rate = TUNE.trickRate;
  if (want !== 0) car[vkey] = want * rate;
  if (car[vkey] === 0) return;
  const before = car[key];
  let after = before + car[vkey] * dt;
  if (want === 0) {          // auto-complete the current rotation, then stop
    const target = car[vkey] > 0 ? Math.ceil(before / TAU - 1e-6) * TAU : Math.floor(before / TAU + 1e-6) * TAU;
    if ((car[vkey] > 0 && after >= target) || (car[vkey] < 0 && after <= target)) { after = target; car[vkey] = 0; }
  }
  car[key] = after;
}

export function stepCar(car, inp, dt, world, t) {
  const f = car.fr, TU = TUNE, pos = car.pos, vel = car.vel, fwd = car.fwd, up = car.up;
  car.prevPos.copy(pos); car.prevQ.copy(car.q);
  if (car.boostT > 0) car.boostT -= dt;
  if (car.spinT > 0) car.spinT -= dt;
  if (car.slowT > 0) car.slowT -= dt;
  if (car.oilT > 0) car.oilT -= dt;
  if (car.invulnT > 0) car.invulnT -= dt;
  if (car.hitCd > 0) car.hitCd -= dt;
  if (car.shield > 0) car.shield -= dt;

  let th = inp.th, st = inp.st, dr = inp.dr;
  if (car.spinT > 0 || car.frozen) { th = 0; st = 0; dr = false; }
  car.steer += (st - car.steer) * Math.min(1, dt * 11);

  if (car.grounded) {
    right.crossVectors(fwd, up).normalize();
    let vf = vel.dot(fwd), vl = vel.dot(right);
    const vn = vel.dot(up);
    let maxS = TU.maxSpeed * car.speedMul, acc = TU.accel;
    if (car.boostT > 0) { maxS += car.boostPow; acc *= 2.4; }
    if (car.slipOn) maxS += 6;
    if (car.slowT > 0) maxS *= 0.45;
    if (car.frozen) vf *= 0.85;
    else if (th > 0 || car.boostT > 0) { if (vf < maxS) vf = Math.min(maxS, vf + acc * Math.max(th, car.boostT > 0 ? 1 : 0) * dt * (vf < 0 ? 2 : 1)); }
    else if (th < 0) { if (vf > 0.5) vf = Math.max(0, vf - TU.brake * dt); else vf = Math.max(-TU.reverse, vf - acc * 0.6 * dt); }
    else vf -= Math.sign(vf) * Math.min(Math.abs(vf), TU.coast * dt);
    if (vf > maxS) vf -= Math.min(vf - maxS, (vf - maxS) * 3 * dt + 5 * dt);
    if (car.spinT > 0 && vf > 10) vf -= vf * 1.1 * dt;

    if (dr && !car.drifting && Math.abs(st) > 0.25 && vf > 14) {
      car.drifting = true; car.driftDir = Math.sign(st); car.driftCharge = 0; car.driftTime = 0;
    }
    if (car.drifting && (!dr || vf < 9)) endDrift(car, vf >= 9);
    let yaw;
    if (car.drifting) {
      const along = car.steer * car.driftDir;
      yaw = car.driftDir * (1.2 + 0.85 * along);
      car.driftCharge += dt * (0.7 + 0.5 * Math.max(0, along));
      car.driftTime += dt;
    } else yaw = car.steer * lerp(2.5, 1.45, clamp(vf / TU.maxSpeed, 0, 1));
    if (car.oilT > 0) yaw += Math.sin(t * 9 + car.id * 2) * 1.3;
    fwd.applyAxisAngle(up, -yaw * clamp(vf / 12, -1, 1) * dt);
    right.crossVectors(fwd, up).normalize();
    const grip = (car.drifting ? TU.driftGrip : TU.grip) * car.surfGrip * (car.oilT > 0 ? 0.12 : 1);
    vl *= Math.exp(-grip * dt);
    vel.copy(fwd).multiplyScalar(vf).addScaledVector(right, vl).addScaledVector(up, vn);
    if (!f.sticky) vel.y -= TU.gravity * dt;
  } else {
    vel.y -= TU.gravity * dt;
    // gentle air assist: keep the car lined up with the road below so jumps on curves stay fair
    if (f.h > -2 && f.h < 30 && Math.abs(f.lat) < f.hw + 8 && !world.isArena) {
      const vlat = vel.dot(f.R), k = Math.min(1, dt * 3.5);
      vel.addScaledVector(f.R, -vlat * k);
      _v.copy(vel).addScaledVector(up, -vel.dot(up));
      if (_v.lengthSq() > 25) fwd.lerp(_v.normalize(), Math.min(1, dt * 4)).normalize();
    }
    if (car.airTime > 0.16 && !car.frozen && car.spinT <= 0) {
      trickAxis(car, 'trkP', 'trkPV', Math.abs(inp.ty) > 0.5 ? Math.sign(inp.ty) : 0, dt);
      trickAxis(car, 'trkY', 'trkYV', Math.abs(inp.st) > 0.5 ? Math.sign(inp.st) : 0, dt);
    }
  }
  pos.addScaledVector(vel, dt);

  // ---- surface resolve ----
  world.sample(car, t, f); car.si = f.si;
  const wasG = car.grounded;
  if (f.on) {
    const pen = f.h - f.gh, vn = vel.dot(f.U);
    if (pen <= 0.05 && pen > -3) {
      pos.addScaledVector(f.U, -pen);
      const climb = (f.gh - car.lastGh) / dt;
      if (wasG && f.gh > 0 && climb > 0) vel.addScaledVector(f.U, Math.min(climb, car.rampCap || 12) - vn);
      else if (vn < 0) vel.addScaledVector(f.U, -vn);
      if (!wasG) land(car, -vn);
      car.grounded = true;
    } else if (wasG && (f.sticky || (pen < 0.5 && vn < 4 && f.gh <= 0 && car.lastGh <= 0))) {
      pos.addScaledVector(f.U, -pen); vel.addScaledVector(f.U, -vn);
    } else car.grounded = false;
    car.lastGh = f.gh;
  } else { car.grounded = false; car.lastGh = 0; }
  world.constrain(car, f);

  if (car.grounded) { up.lerp(f.U, Math.min(1, dt * 14)).normalize(); car.airTime = 0; }
  else {
    up.lerp(YUP, Math.min(1, dt * 2.5)).normalize(); car.airTime += dt;
    if (f.h < -7 || pos.y < world.killY || car.airTime > 4.5) car.wantRespawn = true;
  }
  fwd.addScaledVector(up, -fwd.dot(up)).normalize();
  car.updateQuat();
  car.surfGrip = 1;
}

// Sphere-vs-sphere car collisions: push apart and bounce, never a dead stop.
// oneSided: only car `a` is moved (used by network clients predicting their own car).
export function collideCars(a, b, oneSided, onHit) {
  if (a.out || b.out || a.invulnT > 0 || b.invulnT > 0) return;
  _n.subVectors(b.pos, a.pos);
  const d2 = _n.lengthSq(), min = TUNE.carR * 2;
  if (d2 >= min * min || d2 < 1e-6) return;
  const d = Math.sqrt(d2); _n.multiplyScalar(1 / d);
  const over = min - d;
  if (oneSided) a.pos.addScaledVector(_n, -over);
  else { a.pos.addScaledVector(_n, -over / 2); b.pos.addScaledVector(_n, over / 2); }
  _v.subVectors(b.vel, a.vel);
  const rel = _v.dot(_n);
  if (rel < 0) {
    const j = -rel * 0.85 + 2.5;      // bouncy, with a minimum separation kick
    if (oneSided) a.vel.addScaledVector(_n, -j);
    else { a.vel.addScaledVector(_n, -j); b.vel.addScaledVector(_n, j); }
    if (onHit) onHit(a, b, -rel);
  }
}

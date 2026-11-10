// Car state + low-poly car mesh built from primitives.
import * as THREE from 'three';
import { TUNE, PAINTS, TRAILS, clamp } from './config.js';
import { makeFrame } from './track.js';

const _m = new THREE.Matrix4(), _r = new THREE.Vector3(), _z = new THREE.Vector3();
let nextTagId = 0;

export function paintColor(id) { const p = PAINTS.find((x) => x.id === id); return p ? p.color : (typeof id === 'number' ? id : 0xff3b4e); }
export function trailColor(id) { const p = TRAILS.find((x) => x.id === id); return p ? p.color : 0xff8a2a; }

// Merge several primitives into one vertex-coloured geometry (keeps each car to a handful of draw calls).
function merged(parts) {
  const pos = [], nor = [], col = [], c = new THREE.Color(), m = new THREE.Matrix4(), e = new THREE.Euler(), v = new THREE.Vector3(), n3 = new THREE.Matrix3();
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    m.makeRotationFromEuler(e.set(p.rx || 0, 0, p.rz || 0)).setPosition(p.x || 0, p.y || 0, p.z || 0); n3.getNormalMatrix(m);
    c.setHex(p.color);
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(N, i).applyMatrix3(n3).normalize(); nor.push(v.x, v.y, v.z);
      col.push(c.r, c.g, c.b);
    }
    if (g !== p.geo) g.dispose(); p.geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

export function buildCarMesh(cos = {}, ghost = false) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const col = paintColor(cos.paint), DARK = 0x1c1f2b, GLASS = 0x8fd8ff, TRIM = 0xf4f4f4;
  const mat = ghost ? new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false })
    : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const B = (w, h, d, color, x, y, z, rx = 0) => ({ geo: new THREE.BoxGeometry(w, h, d), color, x, y, z, rx });
  const bodyMesh = new THREE.Mesh(merged([
    B(1.9, 0.5, 3.7, col, 0, 0.55, 0), B(1.7, 0.32, 1.1, col, 0, 0.74, -1.25, 0.22), B(1.5, 0.5, 1.6, GLASS, 0, 1.02, 0.25),
    B(1.56, 0.12, 1.7, col, 0, 1.3, 0.25), B(2.0, 0.1, 0.5, DARK, 0, 1.28, 1.75), B(0.12, 0.42, 0.3, DARK, -0.8, 1.05, 1.7),
    B(0.12, 0.42, 0.3, DARK, 0.8, 1.05, 1.7), B(2.0, 0.16, 0.3, DARK, 0, 0.36, -1.85), B(0.5, 0.06, 3.72, TRIM, 0, 0.81, 0),
    B(0.4, 0.16, 0.06, 0xfff6c0, -0.62, 0.62, -1.86), B(0.4, 0.16, 0.06, 0xfff6c0, 0.62, 0.62, -1.86),
    B(0.5, 0.14, 0.06, 0xff2a3c, -0.6, 0.66, 1.86), B(0.5, 0.14, 0.06, 0xff2a3c, 0.6, 0.66, 1.86),
  ]), mat);
  bodyMesh.castShadow = !ghost; body.add(bodyMesh);
  // wheels: one merged geometry shared by all four
  const style = cos.wheel || 'classic';
  const wr = style === 'chunky' ? 0.5 : 0.42, ww = style === 'chunky' ? 0.5 : 0.34;
  const hubCol = style === 'neon' ? trailColor(cos.trail) : style === 'star' ? 0xffd23f : 0xc9ccd6;
  const parts = [{ geo: new THREE.CylinderGeometry(wr, wr, ww, style === 'chunky' ? 8 : 12), color: DARK, rz: Math.PI / 2 }];
  if (style === 'star') for (let k = 0; k < 3; k++) parts.push(B(ww + 0.04, 0.12, wr * 1.7, hubCol, 0, 0, 0, (k * Math.PI) / 3));
  else parts.push({ geo: new THREE.CylinderGeometry(wr * 0.55, wr * 0.55, ww + 0.04, 6), color: hubCol, rz: Math.PI / 2 });
  const wgeo = merged(parts);
  const wmat = ghost ? mat : style === 'neon' ? new THREE.MeshBasicMaterial({ vertexColors: true }) : mat;
  const wheels = [];
  for (const [x, z] of [[-0.98, -1.2], [0.98, -1.2], [-0.98, 1.25], [0.98, 1.25]]) {
    const piv = new THREE.Group(); piv.position.set(x, wr, z); root.add(piv);
    const w = new THREE.Mesh(wgeo, wmat); piv.add(w);
    wheels.push({ piv, w, front: z < 0 });
  }
  root.userData = { body, wheels };
  return root;
}

function nameTag(name, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(name, 128, 32);
  g.fillStyle = '#' + new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5).getHexString(); g.fillText(name, 128, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(3.6, 0.9, 1); s.position.y = 2.6;
  return s;
}

export class Car {
  constructor(spec) {
    this.id = spec.id; this.name = spec.name; this.kind = spec.kind; this.cos = spec.cos || {};
    this.diff = spec.diff == null ? 1 : spec.diff;
    this.color = paintColor(this.cos.paint); this.trail = trailColor(this.cos.trail);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.fwd = new THREE.Vector3(0, 0, -1); this.up = new THREE.Vector3(0, 1, 0);
    this.prevPos = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.prevQ = new THREE.Quaternion();
    this.fr = makeFrame(); this.si = 0;
    this.events = [];
    this.inp = { th: 0, st: 0, ty: 0, dr: false, it: false, rs: false, hn: false };
    this.prevInp = { th: 0, it: false, rs: false, hn: false };
    this.stats = { air: 0, knocks: 0, drift: 0, respawns: 0, tricks: 0 };
    this.mesh = buildCarMesh(this.cos);
    if (spec.kind !== 'local') { this.tag = nameTag(this.name, this.color); this.mesh.add(this.tag); }
    const sh = new THREE.Mesh(new THREE.SphereGeometry(2.3, 12, 8), new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.28, depthWrite: false }));
    sh.position.y = 0.8; sh.visible = false; this.mesh.add(sh); this.shieldMesh = sh;
    this.tagId = nextTagId++;
    this.resetState();
  }
  resetState() {
    this.grounded = true; this.airTime = 0; this.steer = 0; this.lastGh = 0;
    this.drifting = false; this.driftDir = 0; this.driftCharge = 0; this.driftTime = 0;
    this.boostT = 0; this.boostPow = 0; this.spinT = 0; this.spinDur = 1; this.slowT = 0; this.oilT = 0;
    this.invulnT = 0; this.shield = 0; this.item = null; this.roll = 0; this.rollPick = null;
    this.trkP = 0; this.trkY = 0; this.trkPV = 0; this.trkYV = 0;
    this.slipT = 0; this.slipOn = false; this.surfGrip = 1; this.speedMul = 1;
    this.frozen = false; this.wantRespawn = false; this.remote = false;
    this.lap = 0; this.cp = 0; this.prog = 0; this.place = 1; this.finished = false; this.finishT = 0; this.out = false;
    this.lapStart = 0; this.bestLap = Infinity; this.coins = 0; this.launchT = -1; this.stuckT = 0; this.hitCd = 0;
    this.wheelSpin = 0; this.visYaw = 0; this.visRoll = 0;
  }
  placeAt(pos, fwd, up, si = 0) {
    this.pos.copy(pos); this.fwd.copy(fwd).normalize(); this.up.copy(up).normalize();
    this.vel.set(0, 0, 0); this.si = si; this.grounded = true; this.airTime = 0;
    this.updateQuat(); this.prevPos.copy(this.pos); this.prevQ.copy(this.q);
  }
  updateQuat() {
    _r.crossVectors(this.fwd, this.up).normalize(); _z.copy(this.fwd).negate();
    _m.makeBasis(_r, this.up, _z);
    this.q.setFromRotationMatrix(_m);
  }
  get speed() { return this.vel.length(); }
  driftLevel() {
    const c = this.driftCharge, L = TUNE.driftLevels;
    return c >= L[2] ? 3 : c >= L[1] ? 2 : c >= L[0] ? 1 : 0;
  }
  boost(time, pow) {
    if (pow >= this.boostPow || this.boostT <= 0) this.boostPow = pow;
    this.boostT = Math.max(this.boostT, time);
  }
  // Knock the car around. Returns false if blocked (shield / invulnerable).
  hit(imp, spin = 0.8, src = 'ob') {
    if (this.invulnT > 0 || this.hitCd > 0 || this.out) return false;
    if (this.shield > 0) { this.shield = 0; this.hitCd = 0.6; this.events.push(['block']); return false; }
    this.vel.multiplyScalar(0.55).add(imp);
    this.spinT = this.spinDur = spin; this.hitCd = spin + 0.5;
    if (imp.y > 2) { this.grounded = false; this.pos.y += 0.15; }
    this.drifting = false; this.driftCharge = 0; this.boostT = 0;
    this.events.push(['hit', imp.length(), src, imp.x, imp.y, imp.z, spin]);
    return true;
  }
  flags() {
    return (this.grounded ? 1 : 0) | (this.drifting ? 2 : 0) | (this.boostT > 0 ? 4 : 0) | (this.shield > 0 ? 8 : 0) | (this.spinT > 0 ? 16 : 0) |
      (this.invulnT > 0 ? 32 : 0) | (this.finished ? 64 : 0) | (this.out ? 128 : 0) | (this.slipOn ? 256 : 0) | (this.slowT > 0 ? 512 : 0);
  }
  // Render-time visual update. alpha = interpolation factor between the last two physics steps.
  updateVisual(alpha, dt, time) {
    const m = this.mesh, ud = m.userData;
    if (this.out) { m.visible = false; return; }
    if (this.remote) { m.position.copy(this.pos); m.quaternion.copy(this.q); }
    else { m.position.lerpVectors(this.prevPos, this.pos, alpha); m.quaternion.slerpQuaternions(this.prevQ, this.q, alpha); }
    m.visible = !(this.invulnT > 0 && Math.floor(time * 14) % 2 === 0);
    const sp = this.vel.dot(this.fwd);
    let yaw = this.drifting ? -this.driftDir * 0.42 : 0;
    if (this.spinT > 0) yaw += (1 - this.spinT / this.spinDur) * Math.PI * 4;
    const k = Math.min(1, dt * 10);
    this.visYaw += ((this.spinT > 0 ? yaw : yaw) - this.visYaw) * (this.spinT > 0 ? 1 : k);
    this.visRoll += ((this.grounded ? this.steer * clamp(sp / 40, 0, 1) * 0.09 : 0) - this.visRoll) * k;
    ud.body.rotation.set(-this.trkP, this.visYaw - this.trkY, this.visRoll, 'YXZ');
    ud.body.position.y = this.slowT > 0 ? -0.12 : 0;
    this.wheelSpin -= sp * dt * 2.2;
    for (const w of ud.wheels) { w.w.rotation.x = this.wheelSpin; if (w.front) w.piv.rotation.y = -this.steer * 0.4; }
    this.shieldMesh.visible = this.shield > 0;
    if (this.shield > 0) this.shieldMesh.scale.setScalar(1 + Math.sin(time * 8) * 0.04);
  }
}

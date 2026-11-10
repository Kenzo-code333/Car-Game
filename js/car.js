// Car state + low-poly car mesh built from primitives.
import * as THREE from 'three';
import { TUNE, PAINTS, TRAILS, clamp } from './config.js';
import { makeFrame } from './track.js';

const _m = new THREE.Matrix4(), _r = new THREE.Vector3(), _z = new THREE.Vector3();
let nextTagId = 0;

export function paintColor(id) { const p = PAINTS.find((x) => x.id === id); return p ? p.color : (typeof id === 'number' ? id : 0xff3b4e); }
export function trailColor(id) { const p = TRAILS.find((x) => x.id === id); return p ? p.color : 0xff8a2a; }

export function buildCarMesh(cos = {}, ghost = false) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const col = paintColor(cos.paint);
  const mk = (c, extra = {}) => (ghost
    ? new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.3, depthWrite: false })
    : new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...extra }));
  const paint = mk(col), dark = mk(0x1c1f2b), glass = mk(0x8fd8ff, { emissive: 0x0a2a44 }), trim = mk(0xf4f4f4);
  const add = (geo, mat, x, y, z, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = !ghost; parent.add(m); return m; };
  add(new THREE.BoxGeometry(1.9, 0.5, 3.7), paint, 0, 0.55, 0);
  const nose = add(new THREE.BoxGeometry(1.7, 0.32, 1.1), paint, 0, 0.74, -1.25); nose.rotation.x = 0.22;
  add(new THREE.BoxGeometry(1.5, 0.5, 1.6), glass, 0, 1.02, 0.25);
  add(new THREE.BoxGeometry(1.56, 0.12, 1.7), paint, 0, 1.3, 0.25);
  add(new THREE.BoxGeometry(2.0, 0.1, 0.5), dark, 0, 1.28, 1.75);
  add(new THREE.BoxGeometry(0.12, 0.42, 0.3), dark, -0.8, 1.05, 1.7);
  add(new THREE.BoxGeometry(0.12, 0.42, 0.3), dark, 0.8, 1.05, 1.7);
  add(new THREE.BoxGeometry(2.0, 0.16, 0.3), dark, 0, 0.36, -1.85);
  add(new THREE.BoxGeometry(0.5, 0.06, 3.72), trim, 0, 0.81, 0);
  if (!ghost) {
    const hl = new THREE.MeshBasicMaterial({ color: 0xfff6c0 }), tl = new THREE.MeshBasicMaterial({ color: 0xff2a3c });
    add(new THREE.BoxGeometry(0.4, 0.16, 0.06), hl, -0.62, 0.62, -1.86); add(new THREE.BoxGeometry(0.4, 0.16, 0.06), hl, 0.62, 0.62, -1.86);
    add(new THREE.BoxGeometry(0.5, 0.14, 0.06), tl, -0.6, 0.66, 1.86); add(new THREE.BoxGeometry(0.5, 0.14, 0.06), tl, 0.6, 0.66, 1.86);
  }
  // wheels
  const style = cos.wheel || 'classic';
  const wr = style === 'chunky' ? 0.5 : 0.42, ww = style === 'chunky' ? 0.5 : 0.34;
  const wg = new THREE.CylinderGeometry(wr, wr, ww, style === 'chunky' ? 8 : 12); wg.rotateZ(Math.PI / 2);
  const hubMat = style === 'neon' ? new THREE.MeshBasicMaterial({ color: trailColor(cos.trail) }) : mk(style === 'star' ? 0xffd23f : 0xc9ccd6);
  const wheels = [];
  for (const [x, z] of [[-0.98, -1.2], [0.98, -1.2], [-0.98, 1.25], [0.98, 1.25]]) {
    const piv = new THREE.Group(); piv.position.set(x, wr, z); root.add(piv);
    const w = new THREE.Group(); piv.add(w);
    add(wg, dark, 0, 0, 0, w);
    if (style === 'star') {
      for (let k = 0; k < 3; k++) { const sp = add(new THREE.BoxGeometry(ww + 0.04, 0.12, wr * 1.7), hubMat, 0, 0, 0, w); sp.rotation.x = (k * Math.PI) / 3; }
    } else {
      const hg = new THREE.CylinderGeometry(wr * 0.55, wr * 0.55, ww + 0.04, 6); hg.rotateZ(Math.PI / 2);
      add(hg, hubMat, 0, 0, 0, w);
    }
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
  s.scale.set(5, 1.25, 1); s.position.y = 2.9;
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

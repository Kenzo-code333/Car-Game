// Flat circular arena used by Hot Potato and Coin Rush. Implements the same surface interface as Track.
import * as THREE from 'three';

const _d = new THREE.Vector3();

export class Arena {
  constructor(level, theme) {
    this.level = level; this.theme = theme; this.isArena = true; this.closed = false;
    this.radius = level.radius || 62;
    this.pillars = level.pillars || [];
    this.length = 0; this.groundY = -14; this.killY = -10; this.minY = 0;
    this.gaps = []; this.ramps = [];
  }
  sample(car, t, out) {
    out.U.set(0, 1, 0); out.R.set(1, 0, 0); out.T.set(0, 0, -1);
    out.P.set(car.pos.x, 0, car.pos.z);
    out.h = car.pos.y; out.gh = 0; out.lat = 0; out.s = 0; out.si = 0; out.hw = this.radius;
    out.on = car.pos.x * car.pos.x + car.pos.z * car.pos.z <= (this.radius + 0.5) * (this.radius + 0.5);
    out.sticky = false; out.rail = true;
    return out;
  }
  constrain(car, f) {
    const p = car.pos, r = Math.hypot(p.x, p.z), lim = this.radius - 1.2;
    if (r > lim) {
      _d.set(p.x / r, 0, p.z / r);
      p.x = _d.x * lim; p.z = _d.z * lim;
      const vn = car.vel.dot(_d);
      if (vn > 0) {
        const before = car.vel.length();
        car.vel.addScaledVector(_d, -vn * 1.6);
        const after = car.vel.length(), want = before * 0.8;
        if (after < want && after > 0.01) car.vel.multiplyScalar(want / after);
        if (vn > 5) car.events.push(['wall', vn]);
      }
      const fo = car.fwd.dot(_d);
      if (fo > 0) car.fwd.addScaledVector(_d, -fo * 0.9).normalize();
    }
    for (const c of this.pillars) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + 1.2;
      if (d < min && d > 0.001 && p.y < 3) {
        _d.set(dx / d, 0, dz / d);
        p.x = c.x + _d.x * min; p.z = c.z + _d.z * min;
        const vn = car.vel.dot(_d);
        if (vn < 0) { car.vel.addScaledVector(_d, -vn * 1.8 + 3); car.events.push(['wall', -vn]); }
      }
    }
  }
  update() {}
  wrapD(d) { return d; }
  build(scene) {
    const th = this.theme, g = this.group = new THREE.Group(), R = this.radius;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = th.road.base; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = th.road.line; x.globalAlpha = 0.5; x.lineWidth = 3;
    for (let r = 20; r < 128; r += 27) { x.beginPath(); x.arc(128, 128, r, 0, 7); x.stroke(); }
    for (let a = 0; a < 8; a++) { x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + Math.cos(a * Math.PI / 4) * 128, 128 + Math.sin(a * Math.PI / 4) * 128); x.stroke(); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshLambertMaterial({ map: tex }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R, R - 5, 3, 48), new THREE.MeshLambertMaterial({ color: th.road.body, flatShading: true }));
    base.position.y = -1.52; g.add(base);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.3, R, 1.2, 48, 1, true), new THREE.MeshBasicMaterial({ color: th.rail, side: THREE.DoubleSide }));
    wall.position.y = 0.6; g.add(wall);
    const pm = new THREE.MeshLambertMaterial({ color: th.platform || 0x8fa3c8, flatShading: true }), gm = new THREE.MeshBasicMaterial({ color: th.rail });
    for (const p of this.pillars) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 1.15, 5, 10), pm); m.position.set(p.x, 2.5, p.z); g.add(m);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(p.r + 0.15, p.r + 0.15, 0.5, 10), gm); ring.position.set(p.x, 1, p.z); g.add(ring);
    }
    scene.add(g);
  }
  gridSlot(k, outPos, outFwd, outUp) {
    const a = (k / 6) * Math.PI * 2, r = this.radius * 0.55;
    outPos.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    outFwd.set(-Math.cos(a), 0, -Math.sin(a)); outUp.set(0, 1, 0);
    return 0;
  }
  randomPoint(out, maxR = 0.9) {
    for (let k = 0; k < 20; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * this.radius * maxR;
      out.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      if (!this.pillars.some((p) => Math.hypot(out.x - p.x, out.z - p.z) < p.r + 3)) break;
    }
    return out;
  }
  minimap() { return { arena: true, radius: this.radius, pillars: this.pillars, box: [-this.radius, -this.radius, this.radius, this.radius] }; }
}

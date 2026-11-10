// Reusable, data-driven obstacles. Every obstacle is a deterministic function of the race clock, which keeps
// hosts and clients in sync for free. Each one implements:
//   update(t, dt)        animate visuals
//   touch(car, t)        apply effects to a car (hits, boosts, grip changes ...)
//   blocks(car, t, out)  optional: push [latMin, latMax] intervals the bots should avoid
//   attract(car)         optional: lateral position bots may want to aim for
import * as THREE from 'three';
import { makeFrame } from './track.js';
import { DT } from './config.js';

const frac = (x) => x - Math.floor(x);
const TAU = Math.PI * 2;
const _v = new THREE.Vector3(), _c = new THREE.Vector3();
const LOOK = 75;

let chevTex = null;
function chevronTexture() {
  if (chevTex) return chevTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#fff'; g.lineWidth = 9;
  for (let y = -8; y < 80; y += 32) { g.beginPath(); g.moveTo(4, y + 26); g.lineTo(32, y + 4); g.lineTo(60, y + 26); g.stroke(); }
  chevTex = new THREE.CanvasTexture(c); chevTex.wrapS = chevTex.wrapT = THREE.RepeatWrapping;
  return chevTex;
}
const lam = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };

class Ob {
  constructor(game, def) {
    this.game = game; this.tr = game.world; this.def = def;
    this.s = def.s != null ? def.s : this.tr.sAt(def.at || 0);
    this.lat = def.lat || 0;
    this.fr = this.tr.frameS(this.s, makeFrame());
    this.hw = this.fr.hw;
    this.group = new THREE.Group();
    this.tr.place(this.group, this.s);
    game.scene.add(this.group);
    this.theme = game.theme;
    this.init(def);
  }
  init() {}
  update() {}
  touch() {}
  ds(car) { return this.tr.wrapD(car.fr.s - this.s); }
  ahead(car) { const d = this.tr.wrapD(this.s - car.fr.s); return d > 1 && d < LOOK ? d : -1; }
  eta(car, t, d) { return t + d / Math.max(12, car.speed); }
  knock(car, lat, up, fwd, spin) {
    _v.set(0, 0, 0).addScaledVector(this.fr.R, lat).addScaledVector(this.fr.U, up).addScaledVector(this.fr.T, fwd);
    return car.hit(_v, spin, 'ob');
  }
}

class Hammer extends Ob {
  init(d) {
    this.period = d.period || 3; this.phase = d.phase || 0; this.L = 8.6; this.A = 1.15;
    const hw = this.hw, m = lam(0x4a4f63), g = this.group;
    g.add(box(0.8, 11, 0.8, m, -hw - 1.2, 5.5, 0), box(0.8, 11, 0.8, m, hw + 1.2, 5.5, 0), box(hw * 2 + 3.2, 0.8, 0.8, m, 0, 10.6, 0));
    this.arm = new THREE.Group(); this.arm.position.y = 10;
    this.arm.add(box(0.4, this.L, 0.4, lam(0x9aa0b5), 0, -this.L / 2, 0));
    this.arm.add(box(2.8, 2.2, 2.4, lam(this.theme.hazard), 0, -this.L, 0));
    this.arm.add(box(2.9, 0.5, 2.5, glow(0xffe14a), 0, -this.L, 0));
    g.add(this.arm);
  }
  ang(t) { return this.A * Math.sin(TAU * (t / this.period + this.phase)); }
  update(t) { this.arm.rotation.z = this.ang(t); }
  touch(car, t) {
    if (Math.abs(this.ds(car)) > 2) return;
    const a = this.ang(t), hl = this.L * Math.sin(a), hh = 10 - this.L * Math.cos(a);
    if (hh < 3.3 && Math.abs(car.fr.lat - hl) < 2.1 && car.fr.h < hh + 0.6) {
      const dir = Math.sign(Math.cos(TAU * (t / this.period + this.phase))) || 1;
      this.knock(car, dir * 15, 7, 0, 0.9);
    }
  }
  blocks(car, t, out) {
    const d = this.ahead(car); if (d < 0) return;
    const a = this.ang(this.eta(car, t, d)), hl = this.L * Math.sin(a);
    if (10 - this.L * Math.cos(a) < 3.8) out.push([hl - 2.8, hl + 2.8]);
  }
}

class Spinner extends Ob {
  init(d) {
    this.speed = d.speed || 1.7; this.phase = d.phase || 0; this.len = d.len || this.hw * 0.62;
    this.group.add(box(1.4, 1.6, 1.4, lam(0x4a4f63), this.lat, 0.8, 0));
    this.bar = new THREE.Group(); this.bar.position.set(this.lat, 1.0, 0);
    this.bar.add(box(this.len * 2, 0.8, 0.7, lam(this.theme.hazard)));
    this.bar.add(box(1.2, 0.9, 0.8, glow(0xffe14a), -this.len + 0.6, 0, 0), box(1.2, 0.9, 0.8, glow(0xffe14a), this.len - 0.6, 0, 0));
    this.group.add(this.bar);
  }
  update(t) { this.bar.rotation.y = this.speed * t + this.phase; }
  touch(car, t) {
    const da = this.ds(car);
    if (Math.abs(da) > this.len + 1.5 || car.fr.h > 2.1) return;
    const phi = this.speed * t + this.phase, c = Math.cos(phi), s = Math.sin(phi), dl = car.fr.lat - this.lat;
    const proj = dl * c + da * s, perp = -dl * s + da * c;
    if (Math.abs(proj) < this.len + 0.6 && Math.abs(perp) < 1.25) {
      const sg = Math.sign(proj * this.speed) || 1;
      this.knock(car, -s * sg * 13, 5, c * sg * 13, 0.8);
    }
  }
  blocks(car, t, out) {
    const d = this.ahead(car); if (d < 0) return;
    const phi = this.speed * this.eta(car, t, d) + this.phase, ext = Math.max(1.6, this.len * Math.abs(Math.cos(phi)) + 1.4);
    out.push([this.lat - ext, this.lat + ext]);
  }
}

class Piston extends Ob {
  init(d) {
    this.side = d.side || 1; this.period = d.period || 2.6; this.phase = d.phase || 0; this.ext = d.ext || this.hw * 1.15;
    const sd = this.side, hw = this.hw;
    this.group.add(box(3, 3, 3.4, lam(0x4a4f63), sd * (hw + 2), 1.5, 0));
    this.head = new THREE.Group();
    this.head.add(box(this.ext, 1.9, 2.4, lam(this.theme.hazard), 0, 1.05, 0));
    this.head.add(box(0.4, 2.1, 2.6, glow(0xffe14a), -sd * this.ext / 2, 1.05, 0));
    this.group.add(this.head);
  }
  p(t) { const u = frac(t / this.period + this.phase); return u < 0.12 ? u / 0.12 : u < 0.5 ? 1 : u < 0.7 ? 1 - (u - 0.5) / 0.2 : 0; }
  update(t) { this.head.position.x = this.side * (this.hw - this.ext * this.p(t) + this.ext / 2 + 0.3); }
  touch(car, t) {
    if (Math.abs(this.ds(car)) > 1.9 || car.fr.h > 2.3) return;
    const p = this.p(t);
    if (p > 0.05 && this.side * car.fr.lat > this.hw - this.ext * p - 1.0) this.knock(car, -this.side * 14, 4, -3, 0.7);
  }
  blocks(car, t, out) {
    const d = this.ahead(car); if (d < 0) return;
    const ta = this.eta(car, t, d), p = Math.max(this.p(ta), this.p(ta + 0.25));
    if (p > 0.05) { const e = this.hw - this.ext * p - 1.6; out.push(this.side > 0 ? [e, this.hw] : [-this.hw, -e]); }
  }
}

class Crates extends Ob {
  init(d) {
    this.period = d.period || 3.4; this.phase = d.phase || 0;
    this.lats = d.lats || [-this.hw * 0.55, 0, this.hw * 0.55];
    const cm = lam(0xb9824a), sm = glow(0xff3030, 0.5);
    this.items = this.lats.map((l) => {
      const crate = new THREE.Group();
      crate.add(box(2.4, 2.4, 2.4, cm, 0, 1.2, 0), box(2.5, 0.3, 2.5, lam(0x7a5230), 0, 1.2, 0));
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.6, 12), sm); ring.rotation.x = -Math.PI / 2; ring.position.set(l, 0.08, 0);
      crate.position.x = l; this.group.add(crate, ring);
      return { l, crate, ring, h: 99 };
    });
  }
  u(i, t) { return frac(t / this.period + this.phase + i * 0.37); }
  update(t) {
    this.items.forEach((it, i) => {
      const u = this.u(i, t);
      it.ring.visible = u < 0.42; it.ring.scale.setScalar(0.5 + u * 1.6);
      if (u < 0.3 || u > 0.8) { it.crate.visible = false; it.h = 99; }
      else { it.crate.visible = true; const k = Math.min(1, (u - 0.3) / 0.12); it.h = 22 * (1 - k * k); it.crate.position.y = it.h; }
    });
  }
  touch(car) {
    if (Math.abs(this.ds(car)) > 1.9 || car.fr.h > 2.4) return;
    for (const it of this.items) if (it.h < 2 && Math.abs(car.fr.lat - it.l) < 1.9) { this.knock(car, Math.sign(car.fr.lat - it.l || 1) * 8, 6, -5, 0.7); return; }
  }
  blocks(car, t, out) {
    const d = this.ahead(car); if (d < 0) return;
    const ta = this.eta(car, t, d);
    this.items.forEach((it, i) => { const u = this.u(i, ta); if (u > 0.22 && u < 0.82) out.push([it.l - 2.4, it.l + 2.4]); });
  }
}

class Oil extends Ob {
  init(d) {
    this.r = d.r || 3;
    const m = new THREE.Mesh(new THREE.CircleGeometry(this.r, 14), new THREE.MeshBasicMaterial({ color: 0x0b0b12, transparent: true, opacity: 0.85 }));
    m.rotation.x = -Math.PI / 2; m.position.set(this.lat, 0.06, 0); m.scale.set(1, 1.25, 1);
    const sheen = new THREE.Mesh(new THREE.CircleGeometry(this.r * 0.55, 10), glow(0x6a4dff, 0.35)); sheen.position.z = 0.01; m.add(sheen);
    this.group.add(m);
  }
  touch(car) {
    if (!car.grounded || Math.abs(this.ds(car)) > this.r * 1.2 || Math.abs(car.fr.lat - this.lat) > this.r) return;
    if (car.oilT <= 0.2) car.events.push(['oil']);
    car.oilT = 0.75;
  }
  blocks(car, t, out) { if (this.ahead(car) > 0) out.push([this.lat - this.r - 0.6, this.lat + this.r + 0.6]); }
}

class BoostPad extends Ob {
  init(d) {
    this.w = d.w || 2.6; this.len = d.len || 7; this.pow = d.pow || 13; this.time = d.time || 1.0;
    const tex = chevronTexture().clone(); tex.needsUpdate = true; tex.repeat.set(1, 2); this.tex = tex;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(this.w * 2, this.len), new THREE.MeshBasicMaterial({ map: tex, color: this.theme.boost }));
    m.rotation.x = -Math.PI / 2; m.position.set(this.lat, 0.07, 0); this.group.add(m);
  }
  update(t) { this.tex.offset.y = t * 2; }
  touch(car) {
    if (!car.grounded || Math.abs(this.ds(car)) > this.len / 2 || Math.abs(car.fr.lat - this.lat) > this.w + 0.6) return;
    if (car.boostT < this.time - 0.35) car.events.push(['pad']);
    car.boost(this.time, this.pow);
  }
  attract(car) { return this.ahead(car) > 0 ? this.lat : null; }
}

class Ramp extends Ob {
  init(d) {
    this.len = d.len || 9; this.H = d.H || 2.6; this.w = d.w || this.hw - 0.4;
    const s0 = this.tr.wrapS(this.s - this.len);
    this.tr.ramps.push({ s0, len: this.len, lat: this.lat, hw: this.w, H: this.H });
    const w = this.w, L = this.len, H = this.H, x = this.lat;
    const pos = [x - w, 0, L, x + w, 0, L, x - w, H, 0, x + w, H, 0, x - w, 0, 0, x + w, 0, 0];
    const top = new THREE.BufferGeometry();
    top.setAttribute('position', new THREE.Float32BufferAttribute([pos[0], 0.03, L, pos[3], 0.03, L, pos[6], H, 0, pos[9], H, 0], 3));
    top.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1.5, 1, 1.5], 2));
    top.setIndex([0, 1, 2, 1, 3, 2]);
    const tex = chevronTexture().clone(); tex.needsUpdate = true;
    this.group.add(new THREE.Mesh(top, new THREE.MeshBasicMaterial({ map: tex, color: this.theme.ramp || 0xffc23a })));
    const side = new THREE.BufferGeometry();
    side.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    side.setIndex([2, 3, 4, 3, 5, 4, 0, 2, 4, 1, 5, 3]);
    side.computeVertexNormals();
    this.group.add(new THREE.Mesh(side, new THREE.MeshLambertMaterial({ color: 0x3a3f52, side: THREE.DoubleSide })));
  }
  attract(car) { return this.ahead(car) > 0 ? this.lat : null; }
}

class Gate extends Ob {
  init(d) {
    this.side = d.side || 1; this.period = d.period || 6; this.open = d.open || 0.5; this.phase = d.phase || 0;
    const hw = this.hw, sd = this.side, pm = lam(0x4a4f63);
    this.group.add(box(0.7, 4, 0.7, pm, sd * 0.4, 2, 0), box(0.7, 4, 0.7, pm, sd * (hw + 0.5), 2, 0));
    this.bars = new THREE.Group();
    for (let k = 0; k < 3; k++) this.bars.add(box(hw, 0.3, 0.3, glow(0xff3344), sd * (hw / 2 + 0.4), 0.7 + k * 1.1, 0));
    this.light = box(0.9, 0.9, 0.9, glow(0x33ff66), sd * 0.4, 4.4, 0);
    this.group.add(this.bars, this.light);
  }
  closed(t) { return frac(t / this.period + this.phase) >= this.open; }
  update(t) {
    const c = this.closed(t), u = frac(t / this.period + this.phase);
    this.bars.visible = c;
    const soon = !c && u > this.open - 0.12;
    this.light.material.color.setHex(c ? 0xff3344 : soon ? (Math.floor(t * 10) % 2 ? 0xffd23a : 0x554400) : 0x33ff66);
  }
  inLane(lat) { return this.side * lat > 0.2; }
  touch(car, t) {
    if (!this.closed(t) || Math.abs(this.ds(car)) > 1.2 || car.fr.h > 3.5 || !this.inLane(car.fr.lat)) return;
    const vf = car.vel.dot(this.fr.T);
    this.knock(car, -this.side * 5, 3, -(Math.max(0, vf) * 0.55 + 10), 0.5);
  }
  blocks(car, t, out) {
    const d = this.ahead(car); if (d < 0) return;
    if (this.closed(this.eta(car, t, d))) out.push(this.side > 0 ? [-0.8, this.hw] : [-this.hw, 0.8]);
  }
}

class Train extends Ob {
  init(d) {
    this.period = d.period || 7; this.phase = d.phase || 0; this.speed = d.speed || 30; this.len = d.len || 24;
    this.X0 = this.hw + 38; this.cross = (2 * this.X0 + this.len) / this.speed;
    const g = this.group, rm = lam(0x3a3f52);
    g.add(box(this.X0 * 2, 0.15, 0.3, rm, 0, 0.1, -1.1), box(this.X0 * 2, 0.15, 0.3, rm, 0, 0.1, 1.1));
    this.train = new THREE.Group();
    const n = 3, cl = this.len / n;
    for (let k = 0; k < n; k++) {
      this.train.add(box(cl - 0.6, 3, 3, lam(k === 0 ? this.theme.hazard : 0x5d6b8f), -k * cl - cl / 2, 1.8, 0));
      this.train.add(box(cl - 1.4, 0.7, 3.05, glow(0xffe9a0), -k * cl - cl / 2, 2.3, 0));
    }
    this.train.add(box(0.2, 1, 2, glow(0xffffff), 0.05, 1.2, 0));
    g.add(this.train);
    this.lights = [-1, 1].map((sd) => { const l = box(0.8, 0.8, 0.8, glow(0xff2a2a), sd * (this.hw + 1), 4.2, 3); g.add(box(0.3, 4, 0.3, rm, sd * (this.hw + 1), 2, 3), l); return l; });
  }
  head(t) { const u = frac(t / this.period + this.phase) * this.period; return u < this.cross ? -this.X0 + this.speed * u : null; }
  onTrack(t) { const h = this.head(t); return h != null && h > -this.hw - 2 && h - this.len < this.hw + 2; }
  update(t) {
    const h = this.head(t);
    this.train.visible = h != null; if (h != null) this.train.position.x = h;
    const warn = this.onTrack(t) || this.onTrack(t + 1.4), on = warn && Math.floor(t * 6) % 2 === 0;
    for (const l of this.lights) l.material.color.setHex(on ? 0xff2a2a : 0x330808);
  }
  touch(car, t) {
    if (Math.abs(this.ds(car)) > 2.6 || car.fr.h > 3.6) return;
    const h = this.head(t);
    if (h != null && car.fr.lat < h + 1.2 && car.fr.lat > h - this.len - 1) this.knock(car, 18, 8, 0, 1.0);
  }
  blocks(car, t, out) {
    const d = this.ahead(car); if (d < 0) return;
    const ta = this.eta(car, t, d);
    if (this.onTrack(ta) || this.onTrack(ta + 0.3) || this.onTrack(ta - 0.2)) out.push([-this.hw, this.hw]);
  }
}

class Slider extends Ob {
  init(d) {
    this.amp = d.amp == null ? this.hw - 4.6 : d.amp; this.period = d.period || 4; this.phase = d.phase || 0; this.hole = d.hole || 3.7;
    const hw = this.hw, m = lam(this.theme.hazard);
    this.wall = new THREE.Group();
    for (const sd of [-1, 1]) {
      this.wall.add(box(hw * 2, 1.6, 0.8, m, sd * (this.hole + hw), 0.8, 0));
      this.wall.add(box(0.5, 1.8, 0.9, glow(0xffe14a), sd * (this.hole + 0.25), 0.9, 0));
    }
    this.group.add(this.wall);
  }
  c(t) { return this.amp * Math.sin(TAU * (t / this.period + this.phase)); }
  update(t) { this.wall.position.x = this.c(t); }
  touch(car, t) {
    if (Math.abs(this.ds(car)) > 1.2 || car.fr.h > 2.1) return;
    const c = this.c(t), dl = car.fr.lat - c;
    if (Math.abs(dl) > this.hole - 0.95) {
      const vf = car.vel.dot(this.fr.T);
      this.knock(car, -Math.sign(dl) * 6, 3, -(Math.max(0, vf) * 0.55 + 9), 0.5);
    }
  }
  blocks(car, t, out) {
    const d = this.ahead(car); if (d < 0) return;
    const c = this.c(this.eta(car, t, d));
    out.push([-this.hw - 1, c - this.hole + 1.3], [c + this.hole - 1.3, this.hw + 1]);
  }
}

class Roller extends Ob {
  init(d) {
    this.len = d.len || 90; this.speed = d.speed || 16; this.r = d.r || 2.2; this.amp = d.amp == null ? 3 : d.amp;
    this.waves = d.waves || 1.5; this.count = d.count || 1; this.phase = d.phase || 0;
    const snow = d.kind === 'snow';
    const geo = new THREE.IcosahedronGeometry(this.r, snow ? 1 : 0);
    const mat = lam(snow ? 0xf4faff : 0x8a5a3a);
    this.balls = [];
    this.group.position.set(0, 0, 0); this.group.quaternion.identity();
    for (let k = 0; k < this.count; k++) { const m = new THREE.Mesh(geo, mat); this.group.add(m); this.balls.push({ m, s: 0, lat: 0, on: false }); }
  }
  update(t) {
    this.balls.forEach((b, k) => {
      const u = frac((t * this.speed) / this.len + this.phase + k / this.count);
      b.s = this.s + this.len * (1 - u); b.lat = this.lat + this.amp * Math.sin(u * TAU * this.waves + k * 2);
      const sc = Math.min(1, u * 14, (1 - u) * 14); b.on = sc > 0.5;
      this.tr.posAt(b.s, b.lat, this.r * sc, b.m.position); b.m.scale.setScalar(Math.max(0.01, sc));
      b.m.rotation.x = -t * this.speed / this.r; b.m.rotation.z = k;
    });
  }
  touch(car) {
    for (const b of this.balls) {
      if (!b.on) continue;
      _c.copy(car.pos).addScaledVector(car.up, 0.6);
      if (_c.distanceToSquared(b.m.position) < (this.r + 1.15) * (this.r + 1.15)) {
        this.tr.frameS(b.s, this.fr);
        this.knock(car, Math.sign(car.fr.lat - b.lat || 1) * 8, 7, -10, 0.9); return;
      }
    }
  }
  blocks(car, t, out) {
    for (const b of this.balls) {
      const d = this.tr.wrapD(b.s - car.fr.s);
      if (b.on && d > 0 && d < 70) out.push([b.lat - this.r - 1.6, b.lat + this.r + 1.6]);
    }
  }
}

class Geyser extends Ob {
  init(d) {
    this.r = d.r || 2.6; this.period = d.period || 4; this.phase = d.phase || 0;
    const g = this.group;
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(this.r, this.r + 0.5, 0.3, 10), lam(0x2a1a18)); vent.position.set(this.lat, 0.12, 0); g.add(vent);
    this.glow = new THREE.Mesh(new THREE.CircleGeometry(this.r * 0.8, 10), glow(0xff5a1a)); this.glow.rotation.x = -Math.PI / 2; this.glow.position.set(this.lat, 0.3, 0); g.add(this.glow);
    this.jet = new THREE.Mesh(new THREE.CylinderGeometry(this.r * 0.5, this.r * 0.75, 1, 8, 1, true), glow(0xff8a2a, 0.8)); this.jet.position.set(this.lat, 0, 0); g.add(this.jet);
    this.wp = new THREE.Vector3(); this.tr.posAt(this.s, this.lat, 0.5, this.wp);
  }
  u(t) { return frac(t / this.period + this.phase); }
  update(t) {
    const u = this.u(t), warn = u > 0.55 && u <= 0.75, er = u > 0.75;
    this.glow.material.color.setHex(er ? 0xffe08a : warn ? (Math.floor(t * 12) % 2 ? 0xff9a2a : 0xff3a0a) : 0x5a1a08);
    this.jet.visible = er;
    if (er) {
      const k = Math.sin(((u - 0.75) / 0.25) * Math.PI); this.jet.scale.set(1, 1 + k * 9, 1); this.jet.position.y = (1 + k * 9) / 2;
      const fx = this.game.fx;
      if (fx && Math.random() < 0.6) fx.particles.emit(this.wp, _v.set((Math.random() - 0.5) * 8, 10 + Math.random() * 12, (Math.random() - 0.5) * 8), 0xff7a1a, 0.7, 1);
    }
  }
  touch(car, t) {
    if (this.u(t) <= 0.75 || Math.abs(this.ds(car)) > this.r || Math.abs(car.fr.lat - this.lat) > this.r || car.fr.h > 7) return;
    this.knock(car, 0, 17, 4, 1.0);
  }
  blocks(car, t, out) {
    const d = this.ahead(car); if (d < 0) return;
    if (this.u(this.eta(car, t, d)) > 0.5) out.push([this.lat - this.r - 1.2, this.lat + this.r + 1.2]);
  }
}

class Zone extends Ob {       // base for stretch-of-road effects
  init(d) { this.len = d.len || 40; this.group.position.set(0, 0, 0); this.group.quaternion.identity(); this.setup(d); }
  setup() {}
  inZone(car) { const d = this.ds(car); return d >= 0 && d <= this.len; }
}

class Lava extends Zone {
  setup(d) {
    this.period = d.period || 7; this.phase = d.phase || 0;
    this.mesh = new THREE.Mesh(this.tr.ribbon(this.s, this.s + this.len, -this.hw - 5, this.hw + 5, 0), glow(0xff5a12, 0.88));
    this.group.add(this.mesh);
  }
  level(t) { const u = frac(t / this.period + this.phase); return u < 0.42 ? 0 : u < 0.6 ? (u - 0.42) / 0.18 : u < 0.9 ? 1 : 1 - (u - 0.9) / 0.1; }
  update(t) { const l = this.level(t); this.mesh.position.y = -4 + l * 4.35; this.mesh.material.color.setHex(l >= 1 ? (Math.floor(t * 8) % 2 ? 0xffb03a : 0xff5a12) : 0xff5a12); }
  touch(car, t) {
    if (this.level(t) < 0.97 || car.fr.h > 0.9 || !this.inZone(car)) return;
    if (this.knock(car, 0, 13, 6, 0.8)) car.events.push(['burn']);
  }
  blocks(car, t, out) {
    const d = this.ahead(car); if (d < 0) return;
    const ta = this.eta(car, t, d);
    if (this.level(ta) > 0.9 || this.level(ta + this.len / 40) > 0.9) out.push([-this.hw, this.hw]);
  }
}

class Wind extends Zone {
  setup(d) { this.force = d.force || 15; this.period = d.period || 5; this.phase = d.phase || 0; this.dir = d.dir || 1; this.acc = 0; }
  str(t) { return Math.max(0, Math.sin(TAU * (t / this.period + this.phase))); }
  update(t, dt) {
    const k = this.str(t), fx = this.game.fx;
    if (!fx || k <= 0.05) return;
    this.acc += dt * 30 * k;
    while (this.acc > 1) {
      this.acc -= 1;
      this.tr.posAt(this.s + Math.random() * this.len, (Math.random() - 0.5) * 2 * this.hw - this.dir * 6, 0.5 + Math.random() * 4, _c);
      this.tr.frameS(this.s + this.len / 2, this.fr);
      fx.particles.emit(_c, _v.copy(this.fr.R).multiplyScalar(this.dir * (22 + Math.random() * 10)), 0xcfeaff, 0.7, 0);
    }
  }
  touch(car, t) {
    if (!this.inZone(car)) return;
    car.vel.addScaledVector(car.fr.R, this.dir * this.force * this.str(t) * DT);
    if (car === this.game.me) this.game.windK = Math.max(this.game.windK, this.str(t));
  }
}

class Sand extends Zone {
  touch(car) { if (car === this.game.me && this.inZone(car)) this.game.stormK = 1; }
}

class Ice extends Zone {
  setup(d) {
    this.l0 = d.lat0 == null ? -this.hw : d.lat0; this.l1 = d.lat1 == null ? this.hw : d.lat1;
    this.group.add(new THREE.Mesh(this.tr.ribbon(this.s, this.s + this.len, this.l0 + 0.4, this.l1 - 0.4, 0.05), glow(0xbfeaff, 0.55)));
  }
  touch(car) { if (car.grounded && this.inZone(car) && car.fr.lat >= this.l0 && car.fr.lat <= this.l1) car.surfGrip = 0.22; }
}

const TYPES = { hammer: Hammer, spinner: Spinner, piston: Piston, crate: Crates, oil: Oil, boost: BoostPad, ramp: Ramp, gate: Gate,
  train: Train, slider: Slider, roller: Roller, geyser: Geyser, lava: Lava, wind: Wind, sand: Sand, ice: Ice };

export function buildObstacles(game, defs) {
  const out = [];
  for (const d of defs || []) {
    const C = TYPES[d.type];
    if (!C) { console.warn('Unknown obstacle type', d.type); continue; }
    out.push(new C(game, d));
  }
  return out;
}

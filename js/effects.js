// Visual effects: pooled particles, speed lines, weather, shockwave rings and the follow camera.
import * as THREE from 'three';
import { TUNE, clamp, lerp } from './config.js';
import { save } from './save.js';

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Color(), _m = new THREE.Matrix4();
const YUP = new THREE.Vector3(0, 1, 0);

export class Particles {
  constructor(scene, cap) {
    this.cap = cap; this.i = 0;
    this.pos = new Float32Array(cap * 3).fill(-9999); this.col = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.base = new Float32Array(cap * 3); this.grav = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.points.frustumCulled = false; scene.add(this.points);
  }
  emit(p, v, color, life = 0.5, grav = 1, spread = 0) {
    const i = this.i; this.i = (i + 1) % this.cap;
    const k = i * 3;
    this.pos[k] = p.x; this.pos[k + 1] = p.y; this.pos[k + 2] = p.z;
    this.vel[k] = v.x + (Math.random() - 0.5) * spread; this.vel[k + 1] = v.y + (Math.random() - 0.5) * spread; this.vel[k + 2] = v.z + (Math.random() - 0.5) * spread;
    _c.setHex(color); this.base[k] = _c.r; this.base[k + 1] = _c.g; this.base[k + 2] = _c.b;
    this.life[i] = this.max[i] = life; this.grav[i] = grav;
  }
  burst(p, color, n, speed, life = 0.6) {
    for (let k = 0; k < n; k++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      this.emit(p, _v, color, life * (0.6 + Math.random() * 0.4), 1);
    }
  }
  update(dt) {
    const { pos, vel, col, base, life, max, grav } = this;
    for (let i = 0; i < this.cap; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const k = i * 3;
      if (life[i] <= 0) { pos[k + 1] = -9999; continue; }
      vel[k + 1] -= 18 * grav[i] * dt;
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
      const f = life[i] / max[i];
      col[k] = base[k] * f; col[k + 1] = base[k + 1] * f; col[k + 2] = base[k + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

class SpeedLines {
  constructor(camera) {
    this.n = 46; this.arr = new Float32Array(this.n * 6); this.seed = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n; i++) this.reseed(i, true);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.arr, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    this.lines = new THREE.LineSegments(g, this.mat); this.lines.frustumCulled = false; this.lines.renderOrder = 10;
    camera.add(this.lines);
  }
  reseed(i, any) {
    const a = Math.random() * Math.PI * 2, r = 1.7 + Math.random() * 2.2;
    this.seed[i * 3] = Math.cos(a) * r * 1.5; this.seed[i * 3 + 1] = Math.sin(a) * r; this.seed[i * 3 + 2] = any ? -3 - Math.random() * 12 : -15;
  }
  update(dt, k, color) {
    this.mat.opacity += (clamp(k, 0, 1) * 0.55 - this.mat.opacity) * Math.min(1, dt * 6);
    this.lines.visible = this.mat.opacity > 0.02;
    if (!this.lines.visible) return;
    this.mat.color.setHex(color);
    for (let i = 0; i < this.n; i++) {
      this.seed[i * 3 + 2] += dt * (38 + k * 40);
      if (this.seed[i * 3 + 2] > -2) this.reseed(i, false);
      const x = this.seed[i * 3], y = this.seed[i * 3 + 1], z = this.seed[i * 3 + 2], o = i * 6, len = 1 + k * 2.4;
      this.arr[o] = x; this.arr[o + 1] = y; this.arr[o + 2] = z; this.arr[o + 3] = x; this.arr[o + 4] = y; this.arr[o + 5] = z - len;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}

const WEATHER = {
  rain:   { lines: true,  vel: [-3, -42, 0], color: 0x9fc4ff, streak: 0.035, jitter: 2, opacity: 0.55 },
  snow:   { lines: false, vel: [-2, -5, 1],  color: 0xffffff, size: 0.28, jitter: 3, opacity: 0.9 },
  embers: { lines: false, vel: [1, 5, 0],    color: 0xff8a3a, size: 0.3, jitter: 4, opacity: 0.9 },
  sand:   { lines: true,  vel: [34, -1, 8],  color: 0xe8c48a, streak: 0.06, jitter: 5, opacity: 0.0 },
  motes:  { lines: false, vel: [3, 0.4, 1],  color: 0xffffff, size: 0.22, jitter: 2, opacity: 0.6 },
};
class Weather {
  constructor(scene, type, count) {
    this.cfg = WEATHER[type]; this.n = count; this.box = [70, 34, 70];
    this.p = new Float32Array(count * 3); this.j = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) { this.p[i] = Math.random(); this.j[i] = Math.random() - 0.5; }
    const g = new THREE.BufferGeometry(), c = this.cfg;
    this.arr = new Float32Array(count * (c.lines ? 6 : 3));
    g.setAttribute('position', new THREE.BufferAttribute(this.arr, 3));
    this.mat = c.lines ? new THREE.LineBasicMaterial({ color: c.color, transparent: true, opacity: c.opacity, depthWrite: false })
      : new THREE.PointsMaterial({ color: c.color, size: c.size, transparent: true, opacity: c.opacity, depthWrite: false });
    this.obj = c.lines ? new THREE.LineSegments(g, this.mat) : new THREE.Points(g, this.mat);
    this.obj.frustumCulled = false; scene.add(this.obj);
  }
  update(dt, cam, time) {
    const c = this.cfg, [bx, by, bz] = this.box, p = this.p;
    this.obj.visible = this.mat.opacity > 0.01;
    if (!this.obj.visible) return;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      const vx = c.vel[0] + this.j[k] * c.jitter, vy = c.vel[1] + this.j[k + 1] * c.jitter, vz = c.vel[2] + this.j[k + 2] * c.jitter;
      p[k] = (p[k] + (vx * dt) / bx + 1) % 1; p[k + 1] = (p[k + 1] + (vy * dt) / by + 1) % 1; p[k + 2] = (p[k + 2] + (vz * dt) / bz + 1) % 1;
      // wrap the box around the camera
      const x = cam.x + ((p[k] - cam.x / bx) % 1 + 1.5) % 1 * bx - bx / 2;
      const y = cam.y + ((p[k + 1] - cam.y / by) % 1 + 1.5) % 1 * by - by / 2;
      const z = cam.z + ((p[k + 2] - cam.z / bz) % 1 + 1.5) % 1 * bz - bz / 2;
      if (c.lines) { const o = i * 6; this.arr[o] = x; this.arr[o + 1] = y; this.arr[o + 2] = z; this.arr[o + 3] = x - vx * c.streak; this.arr[o + 4] = y - vy * c.streak; this.arr[o + 5] = z - vz * c.streak; }
      else { this.arr[k] = x; this.arr[k + 1] = y; this.arr[k + 2] = z; }
    }
    this.obj.geometry.attributes.position.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, camera, theme, quality) {
    this.scene = scene; this.camera = camera; this.theme = theme;
    const q = quality === 'low' ? 0 : quality === 'high' ? 2 : 1;
    this.particles = new Particles(scene, [250, 500, 900][q]);
    this.speedLines = new SpeedLines(camera);
    this.weather = theme.weather ? new Weather(scene, theme.weather, [220, 500, 900][q]) : null;
    this.sand = theme.sandstorm ? new Weather(scene, 'sand', [200, 450, 800][q]) : null;
    this.rings = [];
    const rg = new THREE.TorusGeometry(1, 0.08, 6, 28); rg.rotateX(Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false; scene.add(m); this.rings.push({ m, t: 0, size: 1 });
    }
    this.sparkAcc = 0;
  }
  ring(pos, size = 1, color = 0x9fe8ff) {
    const r = this.rings.find((x) => x.t <= 0) || this.rings[0];
    r.m.position.copy(pos); r.m.position.y += 0.6; r.t = 0.55; r.size = size; r.m.material.color.setHex(color); r.m.visible = true;
  }
  // Per-car continuous effects: drift sparks and boost flames.
  carFx(car, dt, driftColors) {
    if (car.out || !car.mesh.visible) return;
    const p = this.particles, mp = car.mesh.position;
    if (car.drifting && car.grounded) {
      const lvl = car.driftLevel ? car.driftLevel() : 0;
      const col = lvl > 0 ? driftColors[lvl - 1] : 0xfff2c0;
      const n = lvl > 0 ? 2 + lvl : 1;
      _a.crossVectors(car.fwd, car.up);
      for (let k = 0; k < n; k++) if (Math.random() < 0.7) {
        const sd = Math.random() < 0.5 ? -1 : 1;
        _v.copy(mp).addScaledVector(car.fwd, -1.3).addScaledVector(_a, sd * 0.95).addScaledVector(car.up, 0.15);
        _b.copy(_a).multiplyScalar(car.driftDir * -5).addScaledVector(car.up, 3 + Math.random() * 3).addScaledVector(car.vel, 0.4);
        p.emit(_v, _b, col, 0.3 + Math.random() * 0.2, 1, 3);
      }
    }
    if (car.boostT > 0 || car.slipOn) {
      for (let k = 0; k < 2; k++) {
        _v.copy(mp).addScaledVector(car.fwd, -1.9).addScaledVector(car.up, 0.55);
        _a.copy(car.vel).multiplyScalar(0.55).addScaledVector(car.fwd, -6);
        p.emit(_v, _a, car.boostT > 0 ? car.trail : 0xcfeaff, 0.35, 0, 2.5);
      }
    }
  }
  update(dt, time) {
    this.particles.update(dt);
    for (const r of this.rings) {
      if (r.t <= 0) continue;
      r.t -= dt;
      const k = 1 - r.t / 0.55;
      r.m.scale.setScalar(1 + k * 16 * r.size); r.m.material.opacity = (1 - k) * 0.9;
      if (r.t <= 0) r.m.visible = false;
    }
    const cp = this.camera.position;
    if (this.weather) this.weather.update(dt, cp, time);
    if (this.sand) this.sand.update(dt, cp, time);
  }
}

// Smoothed chase camera: FOV widens with speed, shakes on impacts, follows the car's own "up" through loops.
export class CameraRig {
  constructor(camera) {
    this.cam = camera; this.dir = new THREE.Vector3(0, 0, -1); this.up = new THREE.Vector3(0, 1, 0);
    this.shake = 0; this.fov = 62; this.first = true; this.orbit = 0; this.look = new THREE.Vector3(); this.side = 0;
  }
  addShake(a) { if (save.data.settings.shake) this.shake = Math.min(1.2, this.shake + a); }
  update(car, dt, mode) {
    const cam = this.cam, mp = car.mesh.position;
    const sp = car.vel.length(), sf = clamp(sp / TUNE.maxSpeed, 0, 1.4);
    _v.copy(car.fwd);
    if (sp > 6 && car.grounded) _v.multiplyScalar(0.62).addScaledVector(car.vel, 0.38 / sp);
    _v.normalize();
    const k = this.first ? 1 : Math.min(1, dt * (car.grounded ? 6.5 : 3));
    this.dir.lerp(_v, k).normalize();
    this.up.lerp(car.up, this.first ? 1 : Math.min(1, dt * 5)).normalize();
    this.first = false;
    if (mode === 'orbit') {
      this.orbit += dt * 0.5;
      _a.set(Math.cos(this.orbit) * 9, 3.6, Math.sin(this.orbit) * 9).add(mp);
      cam.position.lerp(_a, Math.min(1, dt * 3)); cam.up.lerp(YUP, 0.1).normalize();
      cam.lookAt(_v.copy(mp).addScaledVector(YUP, 0.8));
    } else {
      const dist = 7.2 + sf * 1.6, hgt = 3.1 - sf * 0.3;
      this.side += ((car.drifting ? car.driftDir * 1.6 : 0) - this.side) * Math.min(1, dt * 3);
      _a.crossVectors(this.dir, this.up).normalize();
      cam.position.copy(mp).addScaledVector(this.dir, -dist).addScaledVector(this.up, hgt).addScaledVector(_a, this.side);
      cam.up.copy(this.up);
      this.look.copy(mp).addScaledVector(this.up, 1.3).addScaledVector(this.dir, 7);
      cam.lookAt(this.look);
    }
    if (this.shake > 0.001) {
      const s = this.shake * 0.35;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; cam.position.z += (Math.random() - 0.5) * s;
      this.shake *= Math.exp(-dt * 7);
    }
    const target = 62 + Math.min(1, sf) * 15 + (car.boostT > 0 ? 9 : 0) + (car.slipOn ? 4 : 0);
    this.fov = lerp(this.fov, target, Math.min(1, dt * 4));
    if (Math.abs(cam.fov - this.fov) > 0.05) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}

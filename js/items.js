// Item boxes, coins, dropped entities (glue blobs, magnet mines) and item usage.
import * as THREE from 'three';
import { ITEM_IDS, ITEM_WEIGHTS, DT, lerp } from './config.js';

const _v = new THREE.Vector3(), _o = new THREE.Object3D(), _c = new THREE.Color();

// A set of fixed slots rendered with one InstancedMesh (item boxes or coins).
export class SlotField {
  constructor(scene, positions, kind) {
    this.pos = positions; this.kind = kind; this.n = positions.length;
    this.active = new Uint8Array(this.n).fill(1); this.timer = new Float32Array(this.n);
    const geo = kind === 'coin' ? new THREE.CylinderGeometry(0.75, 0.75, 0.18, 10) : new THREE.BoxGeometry(1.7, 1.7, 1.7);
    if (kind === 'coin') geo.rotateX(Math.PI / 2);
    const mat = kind === 'coin' ? new THREE.MeshBasicMaterial({ color: 0xffd23a }) : new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, this.n));
    this.mesh.count = this.n; this.mesh.frustumCulled = false;
    if (kind !== 'coin') for (let i = 0; i < this.n; i++) this.mesh.setColorAt(i, _c.setHSL(i * 0.17 % 1, 0.9, 0.6));
    scene.add(this.mesh);
  }
  render(t) {
    for (let i = 0; i < this.n; i++) {
      const p = this.pos[i];
      _o.position.set(p.x, p.y + (this.kind === 'coin' ? 1.1 : 1.5 + Math.sin(t * 3 + i) * 0.15), p.z);
      _o.rotation.set(this.kind === 'coin' ? 0 : t * 0.9 + i, t * (this.kind === 'coin' ? 3 : 1.3) + i, 0);
      _o.scale.setScalar(this.active[i] ? 1 : 0.0001);
      _o.updateMatrix(); this.mesh.setMatrixAt(i, _o.matrix);
      if (this.kind !== 'coin') this.mesh.setColorAt(i, _c.setHSL((t * 0.25 + i * 0.17) % 1, 0.9, 0.6));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  mask() { let s = ''; for (let i = 0; i < this.n; i++) s += this.active[i] ? '1' : '0'; return s; }
  setMask(s) { for (let i = 0; i < this.n && i < s.length; i++) this.active[i] = s.charCodeAt(i) === 49 ? 1 : 0; }
}

export class Items {
  constructor(game) {
    this.game = game; const level = game.level, w = game.world;
    this.ents = []; this.nextId = 1;
    // item boxes
    const bp = [];
    if (game.useItems) {
      if (w.isArena) for (const p of level.itemSpots || []) bp.push(new THREE.Vector3(p[0], 0, p[1]));
      else for (const at of level.items || []) {
        const s = w.sAt(at), f = w.frameS(s, game.tmpFrame), n = f.hw > 8 ? 4 : 3;
        for (let k = 0; k < n; k++) bp.push(w.posAt(s, lerp(-f.hw * 0.62, f.hw * 0.62, k / (n - 1)), 0, new THREE.Vector3()));
      }
    }
    this.boxes = new SlotField(game.scene, bp, 'box');
    // coins
    const cp = [];
    if (w.isArena) { if (game.mode === 'coins') for (let i = 0; i < 70; i++) cp.push(w.randomPoint(new THREE.Vector3())); }
    else for (const c of level.coins || []) {
      const s0 = w.sAt(c.at), n = c.n || 5;
      for (let k = 0; k < n; k++) cp.push(w.posAt(s0 + k * (c.gap || 5), (c.lat || 0) + (c.wave ? Math.sin(k * 0.9) * c.wave : 0), c.h || 0, new THREE.Vector3()));
    }
    this.coins = new SlotField(game.scene, cp, 'coin');
    if (game.mode === 'coins') { for (let i = 0; i < this.coins.n; i++) this.coins.active[i] = i < 28 ? 1 : 0; this.pending = 0; }
    this.glueGeo = new THREE.SphereGeometry(1.5, 8, 6); this.glueMat = new THREE.MeshLambertMaterial({ color: 0x5dff3a, flatShading: true, emissive: 0x0f5a08 });
    this.mineGeo = new THREE.OctahedronGeometry(1.0, 0); this.mineMat = new THREE.MeshBasicMaterial({ color: 0xff3aa0 });
  }
  pickItem(car) {
    const n = Math.max(1, this.game.activeCount() - 1), r = Math.min(1, Math.max(0, (car.place - 1) / n));
    let total = 0; const w = ITEM_IDS.map((id) => { const x = lerp(ITEM_WEIGHTS[id][0], ITEM_WEIGHTS[id][1], r); total += x; return x; });
    let x = Math.random() * total;
    for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return ITEM_IDS[i]; }
    return ITEM_IDS[0];
  }
  // Host / local authoritative update.
  update(dt) {
    const g = this.game, bx = this.boxes, co = this.coins;
    for (let i = 0; i < bx.n; i++) if (!bx.active[i]) { bx.timer[i] -= dt; if (bx.timer[i] <= 0) bx.active[i] = 1; }
    const coinRush = g.mode === 'coins';
    if (!coinRush) for (let i = 0; i < co.n; i++) if (!co.active[i]) { co.timer[i] -= dt; if (co.timer[i] <= 0) co.active[i] = 1; }
    for (const car of g.cars) {
      if (car.out) continue;
      if (car.roll > 0) { car.roll -= dt; if (car.roll <= 0) { car.item = this.pickItem(car); g.emit(['got', car.id, car.item]); } }
      if (!car.finished) {
        if (car.item == null && car.roll <= 0) for (let i = 0; i < bx.n; i++) {
          if (bx.active[i] && bx.pos[i].distanceToSquared(car.pos) < 6.5) { bx.active[i] = 0; bx.timer[i] = 4; car.roll = 1.5; g.emit(['pick', car.id]); break; }
        }
        if (coinRush || car === g.me) for (let i = 0; i < co.n; i++) {
          if (co.active[i] && co.pos[i].distanceToSquared(car.pos) < 7) {
            co.active[i] = 0; co.timer[i] = 14; car.coins++; g.emit(['coin', car.id]);
            if (coinRush) this.pending = (this.pending || 0) + 1;
          }
        }
      }
    }
    if (coinRush && this.pending > 0) {
      for (let tries = 0; tries < 8 && this.pending > 0; tries++) {
        const i = Math.floor(Math.random() * co.n);
        if (!co.active[i] && !g.cars.some((c) => !c.out && c.pos.distanceToSquared(co.pos[i]) < 100)) { co.active[i] = 1; this.pending--; }
      }
    }
    // entities
    for (let k = this.ents.length - 1; k >= 0; k--) {
      const e = this.ents[k];
      e.life -= dt; e.arm -= dt;
      let dead = e.life <= 0;
      for (const car of g.cars) {
        if (dead || car.out || car.invulnT > 0) continue;
        if (car.id === e.owner && e.arm > 0) continue;
        const d2 = car.pos.distanceToSquared(e.pos);
        if (e.type === 'glue') {
          if (d2 < 6.5) {
            if (car.shield > 0) { car.shield = 0; car.events.push(['block']); }
            else { car.slowT = 1.7; car.vel.multiplyScalar(0.5); g.emit(['slow', car.id]); }
            dead = true;
          }
        } else if (d2 < 130) {
          const d = Math.sqrt(d2);
          _v.subVectors(e.pos, car.pos).multiplyScalar(1 / (d || 1));
          car.vel.addScaledVector(_v, 34 * dt);
          e.pos.addScaledVector(_v, -9 * dt); e.pos.y = e.y0;
          if (d < 2.6) {
            const own = g.cars.find((c) => c.id === e.owner);
            if (car.hit(_v.set((Math.random() - 0.5) * 6, 9, (Math.random() - 0.5) * 6), 1.3, 'it') && own && own !== car) own.stats.knocks++;
            g.emit(['shock', +e.pos.x.toFixed(1), +e.pos.y.toFixed(1), +e.pos.z.toFixed(1), 0.5]);
            dead = true;
          }
        }
      }
      if (dead) { g.scene.remove(e.mesh); this.ents.splice(k, 1); }
    }
  }
  spawnEnt(type, pos, owner, id) {
    const mesh = new THREE.Mesh(type === 'glue' ? this.glueGeo : this.mineGeo, type === 'glue' ? this.glueMat : this.mineMat);
    if (type === 'glue') mesh.scale.set(1, 0.4, 1);
    const e = { id: id || this.nextId++, type, pos: pos.clone(), y0: pos.y, owner, life: 25, arm: 1.2, mesh };
    mesh.position.copy(pos); this.game.scene.add(mesh); this.ents.push(e);
    return e;
  }
  use(car) {
    const g = this.game, it = car.item;
    if (!it || car.spinT > 0) return;
    car.item = null;
    g.emit(['use', car.id, it]);
    if (it === 'rocket') { car.boost(2.3, 22); car.events.push(['rocket']); g.emit(['boost', car.id, 2.3, 22]); }
    else if (it === 'shield') car.shield = 12;
    else if (it === 'shock') {
      g.emit(['shock', +car.pos.x.toFixed(1), +car.pos.y.toFixed(1), +car.pos.z.toFixed(1), 1]);
      for (const o of g.cars) {
        if (o === car || o.out) continue;
        _v.subVectors(o.pos, car.pos);
        const d = _v.length();
        if (d < 16) {
          _v.multiplyScalar(17 / (d || 1)); _v.y += 7;
          if (o.hit(_v, 0.9, 'it')) car.stats.knocks++;
        }
      }
    } else {
      _v.copy(car.pos).addScaledVector(car.fwd, -3.4).addScaledVector(car.up, it === 'glue' ? 0.3 : 1.1);
      this.spawnEnt(it, _v, car.id);
    }
  }
  // Client: mirror the host's entity list.
  syncEnts(list) {
    const seen = new Set();
    for (const a of list) {
      seen.add(a[0]);
      let e = this.ents.find((x) => x.id === a[0]);
      if (!e) e = this.spawnEnt(a[1] ? 'mine' : 'glue', _v.set(a[2], a[3], a[4]), -1, a[0]);
      e.pos.set(a[2], a[3], a[4]);
    }
    for (let k = this.ents.length - 1; k >= 0; k--) if (!seen.has(this.ents[k].id)) { this.game.scene.remove(this.ents[k].mesh); this.ents.splice(k, 1); }
  }
  entList() { return this.ents.map((e) => [e.id, e.type === 'mine' ? 1 : 0, +e.pos.x.toFixed(1), +e.pos.y.toFixed(1), +e.pos.z.toFixed(1)]); }
  render(t) {
    this.boxes.render(t); this.coins.render(t);
    for (const e of this.ents) {
      e.mesh.position.copy(e.pos);
      if (e.type === 'mine') { e.mesh.rotation.y = t * 4; e.mesh.rotation.x = t * 2; e.mesh.scale.setScalar(1 + Math.sin(t * 10) * 0.15); }
    }
  }
}

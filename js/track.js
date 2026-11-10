// Spline-based track: samples a CatmullRomCurve3 into frames (position / tangent / up / right / width),
// builds the road meshes and answers "what surface is under this car?" queries for the physics.
import * as THREE from 'three';
import { clamp, lerp } from './config.js';

export const F_STICKY = 1, F_NORAIL = 2, F_GAP = 4, F_FORCERAIL = 8;
const SP = 3;                         // metres between samples
const YUP = new THREE.Vector3(0, 1, 0);
const smooth = (x) => x * x * (3 - 2 * x);
const _d = new THREE.Vector3(), _a = new THREE.Vector3(), _m = new THREE.Matrix4(), _z = new THREE.Vector3();

export function makeFrame() {
  return { P: new THREE.Vector3(), T: new THREE.Vector3(0, 0, -1), U: new THREE.Vector3(0, 1, 0), R: new THREE.Vector3(1, 0, 0),
    hw: 7, lat: 0, h: 0, gh: 0, s: 0, si: 0, on: false, sticky: false, rail: false };
}

function roadTexture(theme) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = theme.road.base; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + Math.random() * 0.05})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  g.fillStyle = theme.road.edge; g.fillRect(0, 0, 7, 128); g.fillRect(121, 0, 7, 128);
  g.fillStyle = theme.road.edge2 || theme.road.edge;
  g.fillRect(0, 0, 7, 64); g.fillRect(121, 64, 7, 64);
  g.fillStyle = theme.road.line; g.fillRect(62, 0, 4, 70);
  g.globalAlpha = 0.35; g.fillRect(9, 0, 2, 128); g.fillRect(117, 0, 2, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Track {
  constructor(level, theme) {
    this.level = level; this.theme = theme; this.closed = !!level.closed; this.isArena = false;
    this.rails = level.rails !== false;
    const pts = level.points, np = pts.length;
    const vp = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const wArr = pts.map((p) => (p[3] && p[3].w) || level.width || 14);
    const bArr = pts.map((p) => (p[3] && p[3].bank) || 0);
    const curve = new THREE.CatmullRomCurve3(vp, this.closed, 'centripetal');
    curve.arcLengthDivisions = np * 30;
    const baseLen = this.baseLen = curve.getLength();
    const M = Math.max(12, Math.round(baseLen / SP));
    const cnt = this.closed ? M : M + 1;
    let P = [], U = [], HW = [], F = [], mb = [];
    for (let i = 0; i < cnt; i++) {
      const t = curve.getUtoTmapping(i / M);
      P.push(curve.getPoint(t));
      const x = t * (this.closed ? np : np - 1), a0 = Math.floor(x), f = x - a0;
      const a = this.closed ? a0 % np : Math.min(a0, np - 1), b = this.closed ? (a + 1) % np : Math.min(a + 1, np - 1);
      HW.push(lerp(wArr[a], wArr[b], f) / 2); mb.push(lerp(bArr[a], bArr[b], f)); F.push(0);
    }
    // auto banking from smoothed lateral curvature
    let T = this._tangents(P);
    let n = P.length;
    const idx = (i) => (this.closed ? ((i % n) + n) % n : clamp(i, 0, n - 1));
    let kap = [];
    for (let i = 0; i < n; i++) {
      const r = _a.crossVectors(T[i], YUP).normalize();
      _d.subVectors(T[idx(i + 1)], T[idx(i - 1)]);
      kap.push(_d.dot(r) / (2 * SP));
    }
    for (let pass = 0; pass < 3; pass++) {
      const k2 = kap.slice();
      for (let i = 0; i < n; i++) { let s = 0; for (let j = -4; j <= 4; j++) s += k2[idx(i + j)]; kap[i] = s / 9; }
    }
    const bankGain = level.bankGain == null ? 13 : level.bankGain;
    for (let i = 0; i < n; i++) {
      const r = new THREE.Vector3().crossVectors(T[i], YUP).normalize();
      const b = clamp(kap[i] * bankGain, -0.4, 0.4) + mb[i];
      U.push(new THREE.Vector3().copy(YUP).multiplyScalar(Math.cos(b)).addScaledVector(r, Math.sin(b)));
    }
    // loops (vertical circles spliced into the sample list, shifted sideways so entry and exit don't overlap)
    this.loopInfo = [];
    const loops = (level.loops || []).slice().sort((a, b) => b.at - a.at);
    for (const lp of loops) {
      const k = clamp(Math.round(lp.at * cnt), 16, n - 17);
      const R = lp.radius || 16;
      const Tk = new THREE.Vector3(T[k].x, 0, T[k].z).normalize();
      const Rk = new THREE.Vector3().crossVectors(Tk, YUP).normalize();
      const off = 2 * HW[k] + 3, m = 14, base = P[k].clone();
      for (let j = 0; j <= m; j++) {
        const sft = (off / 2) * (1 - smooth(j / m));
        P[k - j].addScaledVector(Rk, -sft);
        if (j > 0) P[k + j].addScaledVector(Rk, sft);
        F[k - j] |= F_FORCERAIL; F[k + j] |= F_FORCERAIL;
      }
      const c = Math.round((2 * Math.PI * R) / SP), nP = [], nU = [], nH = [], nF = [];
      for (let j = 1; j < c; j++) {
        const th = (j / c) * Math.PI * 2;
        nP.push(base.clone().addScaledVector(Tk, R * Math.sin(th)).addScaledVector(YUP, R * (1 - Math.cos(th))).addScaledVector(Rk, off * (j / c - 0.5)));
        nU.push(new THREE.Vector3().copy(YUP).multiplyScalar(Math.cos(th)).addScaledVector(Tk, -Math.sin(th)));
        nH.push(HW[k]); nF.push(F_STICKY | F_FORCERAIL);
      }
      P.splice(k + 1, 0, ...nP); U.splice(k + 1, 0, ...nU); HW.splice(k + 1, 0, ...nH); F.splice(k + 1, 0, ...nF);
      n = P.length;
      this.loopInfo.push({ baseS: (k / cnt) * baseLen, len: 2 * Math.PI * R });
    }
    this.n = n; this.P = P; this.HW = HW; this.F = F;
    this.T = T = this._tangents(P);
    this.R = []; this.U = [];
    for (let i = 0; i < n; i++) {
      const r = new THREE.Vector3().crossVectors(T[i], U[i]).normalize();
      this.R.push(r); this.U.push(new THREE.Vector3().crossVectors(r, T[i]).normalize());
    }
    // cumulative distance
    this.S = new Float32Array(n + 1);
    for (let i = 0; i < n; i++) {
      const j = this.closed ? (i + 1) % n : Math.min(i + 1, n - 1);
      this.S[i + 1] = this.S[i] + P[i].distanceTo(P[j]);
    }
    this.length = this.closed ? this.S[n] : this.S[n - 1];
    // signed curvature for the bots
    this.K = new Float32Array(n);
    const nx = (i) => (this.closed ? ((i % n) + n) % n : clamp(i, 0, n - 1));
    for (let i = 0; i < n; i++) {
      _d.subVectors(T[nx(i + 2)], T[nx(i - 2)]);
      this.K[i] = _d.dot(this.R[i]) / (4 * SP);
    }
    // rails off ranges
    for (const r of level.norail || []) this._flagRange(this.sAt(r[0]), this.sAt(r[1]), F_NORAIL);
    // gaps
    this.gaps = [];
    for (const g of level.gaps || []) {
      const i0 = this.idxAtS(this.sAt(g.at)), i1 = Math.max(i0 + 1, this.idxAtS(this.sAt(g.at) + g.len));
      const gap = { s0: this.S[i0], s1: this.S[i1], i0, i1, plats: (g.platforms || []).map((p) => ({ hw: p.hw || 4.5, amp: p.amp || 0, period: p.period || 4, phase: p.phase || 0 })),
        collapse: !!g.collapse, phase: 0, timer: 0 };
      for (let i = i0; i < i1; i++) this.F[i] |= F_GAP;
      this.gaps.push(gap);
    }
    this.ramps = [];
    let minY = Infinity, maxY = -Infinity;
    this.bounds = new THREE.Box3();
    for (const p of P) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); this.bounds.expandByPoint(p); }
    this.minY = minY; this.maxY = maxY;
    this.groundY = minY - (theme.groundDrop || 14);
    this.killY = this.groundY + 1.5;
    this._makeCheckpoints();
  }

  _tangents(P) {
    const n = P.length, T = [];
    for (let i = 0; i < n; i++) {
      const a = this.closed ? P[(i + n - 1) % n] : P[Math.max(0, i - 1)];
      const b = this.closed ? P[(i + 1) % n] : P[Math.min(n - 1, i + 1)];
      T.push(new THREE.Vector3().subVectors(b, a).normalize());
    }
    return T;
  }
  _flagRange(s0, s1, flag) {
    for (let i = 0; i < this.n; i++) {
      const s = this.S[i];
      if (s0 <= s1 ? (s >= s0 && s <= s1) : (s >= s0 || s <= s1)) this.F[i] |= flag;
    }
  }
  _makeCheckpoints() {
    const L = this.length, lv = this.level;
    const count = lv.checkpoints || Math.max(4, Math.round(L / 110));
    this.cps = [];
    const finishS = this.closed ? 0 : L - (lv.runoff || 40);
    this.finishS = finishS;
    const span = this.closed ? L : finishS;
    for (let k = 0; k < count; k++) {
      let s = (k / count) * span;
      if (k > 0) s = this._safeSpot(s);
      this.cps.push(s);
    }
    if (!this.closed) this.cps.push(finishS);
  }
  // Move a respawn point backwards until it has clear road ahead (no gaps / loops for a while).
  _safeSpot(s) {
    for (let tries = 0; tries < 40; tries++) {
      let ok = true;
      for (let d = -6; d <= 45; d += 3) {
        const f = this.F[this.idxAtS(this.wrapS(s + d))];
        if (f & (F_GAP | F_STICKY)) { ok = false; break; }
      }
      if (ok) return s;
      s = this.wrapS(s - 6);
    }
    return s;
  }

  // ---- parameter helpers ----
  sAt(at) {                       // fraction of the base spline -> metres along final path (accounts for loops)
    let s = at * this.baseLen;
    for (const l of this.loopInfo) if (l.baseS < at * this.baseLen - 1) s += l.len;
    return this.length ? Math.min(s, this.length - 0.01) : s;
  }
  wrapS(s) { const L = this.length; return this.closed ? ((s % L) + L) % L : clamp(s, 0, L); }
  wrapD(d) { if (!this.closed) return d; const L = this.length; return ((d + L * 1.5) % L) - L * 0.5; }
  idxAtS(s) {
    s = this.wrapS(s);
    let lo = 0, hi = this.n - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.S[mid] <= s) lo = mid; else hi = mid - 1; }
    return lo;
  }
  next(i) { return this.closed ? (i + 1) % this.n : Math.min(i + 1, this.n - 1); }
  frameS(s, out) {
    s = this.wrapS(s);
    const i = this.idxAtS(s), j = this.next(i), seg = this.S[i + 1] - this.S[i];
    const f = seg > 0 ? clamp((s - this.S[i]) / seg, 0, 1) : 0;
    out.P.lerpVectors(this.P[i], this.P[j], f);
    out.T.lerpVectors(this.T[i], this.T[j], f).normalize();
    out.U.lerpVectors(this.U[i], this.U[j], f).normalize();
    out.R.lerpVectors(this.R[i], this.R[j], f).normalize();
    out.hw = lerp(this.HW[i], this.HW[j], f); out.s = s; out.si = i + f;
    return out;
  }
  posAt(s, lat, h, out) {
    const f = this._tf || (this._tf = makeFrame());
    this.frameS(s, f);
    return out.copy(f.P).addScaledVector(f.R, lat).addScaledVector(f.U, h);
  }
  place(obj, s, lat = 0, h = 0) {       // orient an Object3D to the track frame (x = right, y = up, -z = forward)
    const f = this._tf || (this._tf = makeFrame());
    this.frameS(s, f);
    _z.copy(f.T).negate();
    _m.makeBasis(f.R, f.U, _z);
    obj.quaternion.setFromRotationMatrix(_m);
    obj.position.copy(f.P).addScaledVector(f.R, lat).addScaledVector(f.U, h);
  }
  curvatureAt(s) { return this.K[this.idxAtS(s)]; }

  // ---- physics queries ----
  locate(pos, hint, wide) {
    const n = this.n, P = this.P;
    let best = Infinity, bi = 0;
    if (wide) {
      for (let i = 0; i < n; i++) { const d = P[i].distanceToSquared(pos); if (d < best) { best = d; bi = i; } }
    } else {
      for (let d = -8; d <= 18; d++) {
        let i = hint + d;
        if (this.closed) i = ((i % n) + n) % n; else if (i < 0 || i >= n) continue;
        const dd = P[i].distanceToSquared(pos);
        if (dd < best) { best = dd; bi = i; }
      }
      if (best > 3600) return this.locate(pos, hint, true);
    }
    let a = bi, b = this.next(a);
    if (b === a) { a = Math.max(0, a - 1); b = a + 1; }
    _d.subVectors(P[b], P[a]); _a.subVectors(pos, P[a]);
    let t = _a.dot(_d) / (_d.lengthSq() || 1);
    if (t < 0 && (this.closed || a > 0)) {
      b = a; a = this.closed ? (a + n - 1) % n : a - 1;
      _d.subVectors(P[b], P[a]); _a.subVectors(pos, P[a]);
      t = _a.dot(_d) / (_d.lengthSq() || 1);
    }
    return a + clamp(t, 0, 0.9999);
  }
  sample(car, t, out) {
    const si = this.locate(car.pos, Math.floor(car.si), false);
    const i = Math.floor(si), f = si - i, j = this.next(i);
    out.P.lerpVectors(this.P[i], this.P[j], f);
    out.T.lerpVectors(this.T[i], this.T[j], f).normalize();
    out.U.lerpVectors(this.U[i], this.U[j], f).normalize();
    out.R.lerpVectors(this.R[i], this.R[j], f).normalize();
    out.hw = lerp(this.HW[i], this.HW[j], f);
    _d.subVectors(car.pos, out.P);
    out.lat = _d.dot(out.R); out.h = _d.dot(out.U);
    const along = _d.dot(out.T);
    out.s = this.S[i] + f * (this.S[i + 1] - this.S[i]); out.si = si;
    const fl = this.F[i];
    out.on = Math.abs(out.lat) <= out.hw + 0.25;
    out.sticky = !!(fl & F_STICKY) && out.on && out.h < 4 && out.h > -2;
    out.rail = (this.rails || !!(fl & F_FORCERAIL)) && !(fl & (F_NORAIL | F_GAP));
    if (!this.closed && ((i >= this.n - 2 && f > 0.99 && along > 0.5) || (si < 0.01 && along < -0.5))) out.on = false;
    if (out.on && (fl & F_GAP)) out.on = this._gapCovers(out.s, out.lat, out.h, t);
    out.gh = 0;
    if (this.ramps.length) {
      for (const r of this.ramps) {
        const ds = this.wrapD(out.s - r.s0);
        if (ds >= 0 && ds <= r.len && Math.abs(out.lat - r.lat) <= r.hw) { out.gh = r.H * (ds / r.len); break; }
      }
    }
    return out;
  }
  _gapCovers(s, lat, h, t) {
    for (const g of this.gaps) {
      if (s < g.s0 - 0.01 || s > g.s1 + 0.01) continue;
      if (g.collapse) {
        if (g.phase === 0 && h < 1 && h > -1) { g.phase = 1; g.timer = 0.75; }
        return g.phase !== 2;
      }
      for (const p of g.plats) {
        const c = p.amp * Math.sin(Math.PI * 2 * (t / p.period + p.phase));
        if (Math.abs(lat - c) <= p.hw) return true;
      }
      return false;
    }
    return false;
  }
  constrain(car, f) {
    if (!f.rail) return;
    const lim = f.hw - 0.95, al = Math.abs(f.lat);
    if (al > lim && al < f.hw + 2.5 && f.h < 1.8 && f.h > -1.5) {
      const sg = Math.sign(f.lat), over = al - lim;
      car.pos.addScaledVector(f.R, -sg * over);
      const vl = car.vel.dot(f.R) * sg;
      if (vl > 0) {
        car.vel.addScaledVector(f.R, -sg * vl * 1.45);
        if (vl > 5) car.events.push(['wall', vl]);
      }
      f.lat = sg * lim;
    }
  }
  update(t, dt) {
    for (const g of this.gaps) {
      if (g.collapse) {
        if (g.phase === 1) { g.timer -= dt; if (g.timer <= 0) { g.phase = 2; g.timer = 3.5; } }
        else if (g.phase === 2) { g.timer -= dt; if (g.timer <= 0) g.phase = 0; }
        if (g.mesh) {
          const m = g.mesh;
          if (g.phase === 1) m.position.copy(g.home).addScaledVector(YUP, Math.sin(t * 70) * 0.12);
          else if (g.phase === 2) { const k = Math.min(1, (3.5 - g.timer) / 0.6); m.position.copy(g.home).addScaledVector(YUP, -k * k * 30); m.visible = g.timer > 0.4; }
          else { m.position.copy(g.home); m.visible = true; }
        }
      } else {
        for (const p of g.plats) if (p.mesh) {
          const c = p.amp * Math.sin(Math.PI * 2 * (t / p.period + p.phase));
          p.mesh.position.copy(p.home).addScaledVector(p.right, c);
        }
      }
    }
  }

  // ---- visuals ----
  ribbon(s0, s1, lat0, lat1, lift = 0.05) {     // strip of geometry hugging the road between two distances
    const pos = [], uv = [], idx = [];
    const steps = Math.max(1, Math.ceil((s1 - s0) / 2.5)), f = makeFrame();
    for (let k = 0; k <= steps; k++) {
      this.frameS(s0 + ((s1 - s0) * k) / steps, f);
      const l0 = Math.max(lat0, -f.hw), l1 = Math.min(lat1, f.hw);
      _a.copy(f.P).addScaledVector(f.R, l0).addScaledVector(f.U, lift); pos.push(_a.x, _a.y, _a.z);
      _a.copy(f.P).addScaledVector(f.R, l1).addScaledVector(f.U, lift); pos.push(_a.x, _a.y, _a.z);
      uv.push(0, k / steps * ((s1 - s0) / 6), 1, k / steps * ((s1 - s0) / 6));
      if (k < steps) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  build(scene, quality) {
    const { P, U, R, HW, F, n, theme } = this;
    const rows = this.closed ? n + 1 : n;
    const pos = [], nor = [], uv = [], idx = [], bpos = [], bidx = [];
    const railPos = [], railIdx = [];
    const v = new THREE.Vector3();
    for (let r = 0; r < rows; r++) {
      const i = r % n;
      const s = r === n ? this.length : this.S[i];
      v.copy(P[i]).addScaledVector(R[i], -HW[i]); pos.push(v.x, v.y, v.z);
      v.copy(P[i]).addScaledVector(R[i], HW[i]); pos.push(v.x, v.y, v.z);
      nor.push(U[i].x, U[i].y, U[i].z, U[i].x, U[i].y, U[i].z);
      uv.push(0, s / 12, 1, s / 12);
      // body cross-section: top-left, top-right, bottom-right, bottom-left
      v.copy(P[i]).addScaledVector(R[i], -HW[i]).addScaledVector(U[i], -0.04); bpos.push(v.x, v.y, v.z);
      v.copy(P[i]).addScaledVector(R[i], HW[i]).addScaledVector(U[i], -0.04); bpos.push(v.x, v.y, v.z);
      v.copy(P[i]).addScaledVector(R[i], HW[i] - 1.2).addScaledVector(U[i], -1.0); bpos.push(v.x, v.y, v.z);
      v.copy(P[i]).addScaledVector(R[i], -HW[i] + 1.2).addScaledVector(U[i], -1.0); bpos.push(v.x, v.y, v.z);
      // rails: bottom / top for left and right
      for (const sg of [-1, 1]) {
        v.copy(P[i]).addScaledVector(R[i], sg * HW[i]); railPos.push(v.x, v.y, v.z);
        v.copy(P[i]).addScaledVector(R[i], sg * (HW[i] + 0.25)).addScaledVector(U[i], 0.85); railPos.push(v.x, v.y, v.z);
      }
      if (r < rows - 1 && !(F[i] & F_GAP)) {
        const a = r * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        const b = r * 4, c = b + 4;
        bidx.push(b + 1, b + 2, c + 1, b + 2, c + 2, c + 1,  b + 2, b + 3, c + 2, b + 3, c + 3, c + 2,  b + 3, b, c + 3, b, c, c + 3);
        const hasRail = (this.rails || (F[i] & F_FORCERAIL)) && !(F[i] & F_NORAIL);
        if (hasRail) {
          const q = r * 4, q2 = q + 4;
          railIdx.push(q, q2, q + 1, q + 1, q2, q2 + 1,  q + 2, q + 3, q2 + 2, q + 3, q2 + 3, q2 + 2);
        }
      }
    }
    const group = this.group = new THREE.Group();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const road = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: roadTexture(theme) }));
    road.receiveShadow = true; group.add(road);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3));
    bg.setIndex(bidx); bg.computeVertexNormals();
    group.add(new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ color: theme.road.body, flatShading: true })));
    if (railIdx.length) {
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(railPos, 3));
      rg.setIndex(railIdx);
      group.add(new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: theme.rail, side: THREE.DoubleSide })));
    }
    // support pillars (instanced)
    if (theme.pillars) {
      const spots = [];
      for (let i = 4; i < n; i += 9) {
        if (U[i].y < 0.9 || (F[i] & (F_GAP | F_STICKY))) continue;
        let clear = true;
        for (let j = 0; j < n; j += 2) {
          const dj = Math.abs(j - i);
          if (dj < 25 || n - dj < 25) continue;
          const dx = P[j].x - P[i].x, dz = P[j].z - P[i].z;
          if (dx * dx + dz * dz < 144 && P[j].y < P[i].y - 2) { clear = false; break; }
        }
        if (clear) spots.push(i);
      }
      if (spots.length) {
        const pg = new THREE.CylinderGeometry(1.1, 1.5, 1, 6);
        const pm = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ color: theme.road.body, flatShading: true }), spots.length);
        const o = new THREE.Object3D();
        spots.forEach((i, k) => {
          const top = P[i].y - 0.9, hgt = Math.max(1, top - this.groundY);
          o.position.set(P[i].x, top - hgt / 2, P[i].z); o.scale.set(1, hgt, 1); o.updateMatrix(); pm.setMatrixAt(k, o.matrix);
        });
        group.add(pm);
      }
    }
    // start / finish gate
    const gate = new THREE.Group();
    const gs = this.closed ? 0 : this.finishS, gf = this.frameS(gs, makeFrame());
    const cm = new THREE.MeshLambertMaterial({ color: 0xffffff }), dm = new THREE.MeshBasicMaterial({ color: theme.rail });
    for (const sg of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7.5, 0.7), cm); p.position.set(sg * (gf.hw + 0.6), 3.75, 0); gate.add(p); }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(gf.hw * 2 + 2, 1.5, 0.6), this._checkerMat()); bar.position.y = 7.2; gate.add(bar);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(gf.hw * 2 + 2, 0.25, 0.7), dm); glow.position.y = 6.3; gate.add(glow);
    this.place(gate, gs); group.add(gate);
    const line = new THREE.Mesh(this.ribbon(gs - 1.2, gs + 1.2, -gf.hw, gf.hw, 0.04), this._checkerMat(8)); group.add(line);
    // moving platforms and collapsing bridges
    const slabMat = new THREE.MeshLambertMaterial({ color: theme.platform || 0x8fa3c8, flatShading: true });
    const brMat = new THREE.MeshLambertMaterial({ color: theme.bridge || 0x9a6b3d, flatShading: true });
    const f = makeFrame();
    for (const gp of this.gaps) {
      const len = gp.s1 - gp.s0, mid = (gp.s0 + gp.s1) / 2;
      this.frameS(mid, f);
      if (gp.collapse) {
        const m = new THREE.Group();
        const planks = Math.max(2, Math.round(len / 3));
        for (let k = 0; k < planks; k++) {
          const pl = new THREE.Mesh(new THREE.BoxGeometry(f.hw * 2, 0.5, len / planks - 0.25), brMat);
          pl.position.set(0, -0.27, -len / 2 + (k + 0.5) * (len / planks)); m.add(pl);
        }
        this.place(m, mid); gp.mesh = m; gp.home = m.position.clone(); group.add(m);
      } else {
        for (const p of gp.plats) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(p.hw * 2, 0.6, len + 0.5), slabMat);
          this.place(m, mid, 0, -0.32); p.mesh = m; p.home = m.position.clone(); p.right = f.R.clone(); group.add(m);
          const edge = new THREE.Mesh(new THREE.BoxGeometry(p.hw * 2, 0.08, len + 0.5), dm); edge.position.y = 0.32; m.add(edge);
        }
      }
    }
    scene.add(group);
  }
  _checkerMat(rep = 10) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 16;
    const g = c.getContext('2d');
    for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 8, y * 8, 8, 8); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep / 4, 1); t.magFilter = THREE.NearestFilter;
    return new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide });
  }
  // Starting grid slot -> position / heading
  gridSlot(k, outPos, outFwd, outUp) {
    const f = makeFrame();
    const row = Math.floor(k / 2), col = k % 2;
    const s = this.closed ? this.length - 10 - row * 8 - col * 3 : 8 + row * 8;
    this.frameS(s, f);
    outPos.copy(f.P).addScaledVector(f.R, (col ? 1 : -1) * f.hw * 0.4);
    outFwd.copy(f.T); outUp.copy(f.U);
    return f.si;
  }
  minimap() {
    const pts = [];
    for (let i = 0; i < this.n; i += 2) pts.push([this.P[i].x, this.P[i].z, (this.F[i] & F_GAP) ? 1 : 0]);
    return { pts, closed: this.closed, box: [this.bounds.min.x, this.bounds.min.z, this.bounds.max.x, this.bounds.max.z] };
  }
}

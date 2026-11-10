// Tiny "turtle" DSL for authoring tracks: chain straights and turns, dropping obstacles as you go.
// Positions are recorded as a fraction of the path ("at"), which Track converts to metres.
//
//   path({ w: 14 }).st(80).boost().turn(90, 50).ob('hammer', { period: 3 }).jump(14).st(60).build({ id, name })
//
export function path(opts = {}) { return new PathBuilder(opts); }

class PathBuilder {
  constructor({ w = 14, y = 0, heading = 0 } = {}) {
    this.x = 0; this.y = y; this.z = 0; this.h = (heading * Math.PI) / 180; this.d = 0; this.w = w;
    this.pts = [[0, y, 0, { w }]];
    this.obs = []; this.gaps = []; this.loops = []; this.itemRows = []; this.coinRows = [];
  }
  _push() { this.pts.push([+this.x.toFixed(2), +this.y.toFixed(2), +this.z.toFixed(2), { w: this.w }]); }
  width(w) { this.w = w; return this; }
  // straight: length in metres, dy = total height change
  st(len, dy = 0) {
    const n = Math.max(1, Math.round(len / 22));
    for (let k = 0; k < n; k++) {
      this.x += Math.sin(this.h) * (len / n); this.z -= Math.cos(this.h) * (len / n); this.y += dy / n; this.d += len / n; this._push();
    }
    return this;
  }
  // turn: degrees (positive = right), radius in metres
  turn(deg, r, dy = 0) {
    const ang = (deg * Math.PI) / 180, n = Math.max(2, Math.ceil(Math.abs(deg) / 15)), da = ang / n;
    for (let k = 0; k < n; k++) {
      this.h += da / 2;
      const chord = 2 * r * Math.sin(Math.abs(da) / 2);
      this.x += Math.sin(this.h) * chord; this.z -= Math.cos(this.h) * chord; this.y += dy / n;
      this.h += da / 2; this.d += r * Math.abs(da); this._push();
    }
    return this;
  }
  // obstacle at the current spot (back = metres behind the current spot)
  ob(type, o = {}, back = 0) { this.obs.push({ type, d: this.d - back, ...o }); return this; }
  boost(lat = 0, o = {}) { return this.ob('boost', { lat, ...o }); }
  // ramp ending here, followed by a gap of gapLen metres
  jump(gapLen = 14, o = {}) {
    this.ob('ramp', o);
    if (gapLen > 0) { this.gaps.push({ d: this.d + 3, len: gapLen }); this.st(gapLen + 3); }
    return this;
  }
  // hole in the road: { platforms:[{hw, amp, period, phase}] } or { collapse:true }
  gap(len, o = {}) { this.gaps.push({ d: this.d, len, ...o }); return this.st(len); }
  loop(radius = 16) { this.loops.push({ d: this.d, radius }); return this; }
  items() { this.itemRows.push(this.d); return this; }
  coins(n = 5, lat = 0, o = {}) { this.coinRows.push({ d: this.d, n, lat, ...o }); return this; }
  build(meta) {
    const L = this.d, at = (o) => { const { d, ...rest } = o; return { at: d / L, ...rest }; };
    return {
      closed: false, type: 'gauntlet', width: this.w, rails: false, ...meta,
      points: this.pts, obstacles: this.obs.map(at), gaps: this.gaps.map(at), loops: this.loops.map(at),
      items: this.itemRows.map((d) => d / L), coins: this.coinRows.map(at),
    };
  }
}

// Closed-circuit helper: n control points from a parametric function of angle.
export function ring(n, fn) {
  const pts = [];
  for (let k = 0; k < n; k++) { const p = fn((k / n) * Math.PI * 2); pts.push([+p[0].toFixed(2), +p[1].toFixed(2), +p[2].toFixed(2)]); }
  return pts;
}

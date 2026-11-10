// Per-world environment: sky dome, fog, lights, ground and instanced low-poly props.
import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function windowTexture(a, b) {
  const c = document.createElement('canvas'); c.width = 32; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#0a0d1c'; g.fillRect(0, 0, 32, 64);
  for (let y = 2; y < 64; y += 6) for (let x = 2; x < 32; x += 6) { if (Math.random() < 0.55) { g.fillStyle = Math.random() < 0.5 ? a : b; g.fillRect(x, y, 3, 3); } }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildEnvironment(scene, theme, world, quality) {
  const env = { fog: null, baseFog: theme.fog.slice(), update() {} };
  scene.background = new THREE.Color(theme.sky[1]);
  scene.fog = env.fog = new THREE.Fog(theme.fog[0], theme.fog[1], theme.fog[2]);
  // sky dome with a vertical gradient
  const sg = new THREE.SphereGeometry(900, 16, 10);
  const top = new THREE.Color(theme.sky[0]), bot = new THREE.Color(theme.sky[1]), col = [];
  const pa = sg.attributes.position;
  for (let i = 0; i < pa.count; i++) { const k = Math.max(0, Math.min(1, pa.getY(i) / 500 + 0.08)); const c = bot.clone().lerp(top, Math.pow(k, 0.7)); col.push(c.r, c.g, c.b); }
  sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const sky = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10; scene.add(sky); env.sky = sky;
  if (theme.sunDisc) {
    const sun = new THREE.Mesh(new THREE.CircleGeometry(theme.sunDisc[1], 20), new THREE.MeshBasicMaterial({ color: theme.sunDisc[0], fog: false }));
    sun.position.set(...theme.sunDir).normalize().multiplyScalar(820); sun.lookAt(0, 0, 0); sky.add(sun);
  }
  scene.add(new THREE.HemisphereLight(theme.hemi[0], theme.hemi[1], theme.hemi[2]));
  const sun = new THREE.DirectionalLight(theme.sun[0], theme.sun[1]);
  sun.position.set(...theme.sunDir).normalize().multiplyScalar(80);
  scene.add(sun, sun.target); env.sun = sun;
  if (quality === 'high') {
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    const c = sun.shadow.camera; c.left = c.bottom = -45; c.right = c.top = 45; c.near = 1; c.far = 220;
  }
  const gy = world.groundY, b = world.isArena ? { cx: 0, cz: 0, r: 260 } : (() => {
    const bb = world.bounds; return { cx: (bb.min.x + bb.max.x) / 2, cz: (bb.min.z + bb.max.z) / 2, r: Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 + 220 };
  })();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), theme.groundGlow
    ? new THREE.MeshBasicMaterial({ color: theme.ground }) : new THREE.MeshLambertMaterial({ color: theme.ground }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(b.cx, gy, b.cz);
  if (theme.props !== 'sky') scene.add(ground);

  // prop placement helper: random spots that keep clear of the road
  const rand = rng(theme.seed || 7);
  const near = (x, z, clear) => {
    if (world.isArena) return Math.hypot(x, z) < world.radius + clear;
    const P = world.P;
    for (let i = 0; i < P.length; i += 3) { const dx = P[i].x - x, dz = P[i].z - z; if (dx * dx + dz * dz < clear * clear) return true; }
    return false;
  };
  const scatter = (n, clear, fn) => {
    const out = [];
    for (let k = 0, tries = 0; k < n && tries < n * 12; tries++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * b.r, x = b.cx + Math.cos(a) * r, z = b.cz + Math.sin(a) * r;
      if (near(x, z, clear)) continue;
      out.push(fn(x, z)); k++;
    }
    return out;
  };
  const inst = (geo, mat, list) => {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
    list.forEach((it, i) => { o.position.set(it.x, it.y, it.z); o.scale.set(it.sx, it.sy, it.sz); o.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); if (it.c) m.setColorAt(i, it.c); });
    scene.add(m); return m;
  };
  const qn = quality === 'low' ? 0.45 : quality === 'high' ? 1.3 : 1;
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const C = (h) => new THREE.Color(h);

  if (theme.props === 'city') {
    const bm = new THREE.MeshBasicMaterial({ map: windowTexture('#ff4fd8', '#43e8ff'), color: 0xffffff });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    inst(geo, bm, scatter(Math.round(150 * qn), 34, (x, z) => { const h = 30 + rand() * 110, w = 14 + rand() * 18; return { x, y: gy + h / 2, z, sx: w, sy: h, sz: 14 + rand() * 18, ry: rand() * 3 }; }));
    inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), scatter(Math.round(40 * qn), 30, (x, z) => ({ x, y: gy + 40 + rand() * 70, z, sx: 10 + rand() * 14, sy: 1.2, sz: 1.2, ry: rand() * 3, c: C([0xff3fd0, 0x3fe8ff, 0xffe23f, 0x7dff5a][Math.floor(rand() * 4)]) })));
    const grid = new THREE.GridHelper(2400, 80, 0x3a2a7a, 0x1c1c4a); grid.position.set(b.cx, gy + 0.1, b.cz); scene.add(grid);
  } else if (theme.props === 'desert') {
    inst(new THREE.CylinderGeometry(0.72, 1, 1, 7), lam(0xc9703a), scatter(Math.round(70 * qn), 38, (x, z) => { const h = 18 + rand() * 60, w = 8 + rand() * 12; return { x, y: gy + h / 2, z, sx: w, sy: h, sz: w * (0.7 + rand() * 0.6), ry: rand() * 3 }; }));
    inst(new THREE.CylinderGeometry(0.9, 1, 1, 7), lam(0xe0a060), scatter(Math.round(40 * qn), 40, (x, z) => { const h = 4 + rand() * 7, w = 10 + rand() * 12; return { x, y: gy + h / 2, z, sx: w, sy: h, sz: w, ry: rand() * 3 }; }));
    inst(new THREE.CylinderGeometry(0.5, 0.6, 1, 6), lam(0x3f9a4a), scatter(Math.round(90 * qn), 14, (x, z) => { const h = 4 + rand() * 6; return { x, y: gy + h / 2, z, sx: 1.6, sy: h, sz: 1.6 }; }));
  } else if (theme.props === 'frozen') {
    inst(new THREE.ConeGeometry(1, 1, 6), lam(0xdff2ff), scatter(Math.round(60 * qn), 55, (x, z) => { const h = 30 + rand() * 90, w = 14 + rand() * 18; return { x, y: gy + h / 2, z, sx: w, sy: h, sz: w, ry: rand() * 3 }; }));
    const trees = scatter(Math.round(220 * qn), 13, (x, z) => { const h = 7 + rand() * 9; return { x, y: gy + h / 2 + 2, z, sx: 3.2 + rand() * 2, sy: h, sz: 3.2 + rand() * 2 }; });
    inst(new THREE.ConeGeometry(1, 1, 6), lam(0x2f7a5a), trees);
    inst(new THREE.CylinderGeometry(0.4, 0.5, 1, 5), lam(0x6a4a30), trees.map((t) => ({ x: t.x, y: gy + 1, z: t.z, sx: 1, sy: 2.4, sz: 1 })));
    inst(new THREE.OctahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x8fdcff, flatShading: true, emissive: 0x124a66 }), scatter(Math.round(50 * qn), 14, (x, z) => { const h = 4 + rand() * 9; return { x, y: gy + h * 0.6, z, sx: 2 + rand() * 2, sy: h, sz: 2 + rand() * 2, ry: rand() * 3 }; }));
  } else if (theme.props === 'volcano') {
    inst(new THREE.ConeGeometry(1, 1, 6), lam(0x2a1f24), scatter(Math.round(120 * qn), 30, (x, z) => { const h = 14 + rand() * 60, w = 5 + rand() * 10; return { x, y: gy + h / 2 - 1, z, sx: w, sy: h, sz: w, ry: rand() * 3 }; }));
    inst(new THREE.CylinderGeometry(1, 1.15, 1, 7), lam(0x3a2a2c), scatter(Math.round(50 * qn), 44, (x, z) => { const w = 10 + rand() * 14; return { x, y: gy + 0.6, z, sx: w, sy: 2.5, sz: w * (0.6 + rand() * 0.6), ry: rand() * 3 }; }));
    const vol = new THREE.Mesh(new THREE.ConeGeometry(260, 300, 8, 1, true), lam(0x2a1a20)); vol.position.set(b.cx + b.r + 250, gy + 150, b.cz - 100); scene.add(vol);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(60, 8), new THREE.MeshBasicMaterial({ color: 0xff7a1a, fog: false })); cap.rotation.x = -Math.PI / 2; cap.position.set(vol.position.x, gy + 262, vol.position.z); scene.add(cap);
  } else if (theme.props === 'sky') {
    const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const clouds = [];
    const rr = rng(11);
    for (let k = 0; k < Math.round(70 * qn); k++) {
      const a = rr() * Math.PI * 2, r = Math.sqrt(rr()) * (b.r + 200), x = b.cx + Math.cos(a) * r, z = b.cz + Math.sin(a) * r, y = gy - 20 - rr() * 60 + (rr() < 0.2 ? 90 + rr() * 60 : 0);
      const n = 3 + Math.floor(rr() * 3);
      for (let j = 0; j < n; j++) clouds.push({ x: x + (rr() - 0.5) * 40, y: y + (rr() - 0.5) * 8, z: z + (rr() - 0.5) * 40, sx: 18 + rr() * 22, sy: 8 + rr() * 8, sz: 18 + rr() * 22 });
    }
    inst(new THREE.IcosahedronGeometry(1, 1), cm, clouds);
    const isl = scatter(Math.round(26 * qn), 40, (x, z) => { const w = 12 + rand() * 18; return { x, y: gy + 5 + rand() * 25, z, sx: w, sy: w * 1.2, sz: w, rx: Math.PI }; });
    inst(new THREE.ConeGeometry(1, 1, 7), lam(0x8a6a52), isl);
    inst(new THREE.CylinderGeometry(1, 1, 0.12, 7), lam(0x6fd35a), isl.map((t) => ({ x: t.x, y: t.y + t.sy / 2, z: t.z, sx: t.sx, sy: 14, sz: t.sz })));
  }
  env.setStorm = (k) => {       // sandstorm: pull the fog in
    env.fog.near = env.baseFog[1] * (1 - k) + 6 * k; env.fog.far = env.baseFog[2] * (1 - k) + 70 * k;
  };
  env.follow = (p) => { sky.position.copy(p); if (sun.castShadow) { sun.target.position.copy(p); sun.position.copy(p).add(env.sunOff || (env.sunOff = new THREE.Vector3(...theme.sunDir).normalize().multiplyScalar(80))); } };
  return env;
}

// Entry point: renderer, main loop, menu showroom and the glue between UI, game sessions and networking.
import * as THREE from 'three';
import { BOT_NAMES, PAINTS, WHEELS, TRAILS, HORNS } from './config.js';
import { LEVELS, WORLDS, GAUNTLETS, THEMES, raceOf, arenaOf } from './levels/index.js';
import { save } from './save.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { buildCarMesh } from './car.js';
import { Session } from './network.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

class Showroom {
  constructor() {
    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(0x0b0d22); s.fog = new THREE.Fog(0x0b0d22, 20, 70);
    s.add(new THREE.HemisphereLight(0xaab4ff, 0x30204a, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(4, 8, 6); s.add(d);
    const p1 = new THREE.PointLight(0xff3fd0, 60, 30); p1.position.set(-6, 3, 2); s.add(p1);
    const p2 = new THREE.PointLight(0x43e8ff, 60, 30); p2.position.set(6, 3, -2); s.add(p2);
    this.turn = new THREE.Group(); s.add(this.turn);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 0.4, 28), new THREE.MeshLambertMaterial({ color: 0x23284a }));
    disc.position.y = -0.2; this.turn.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.07, 6, 40), new THREE.MeshBasicMaterial({ color: 0x43e8ff })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; this.turn.add(ring);
    const grid = new THREE.GridHelper(160, 60, 0x3a2a7a, 0x1c1c4a); grid.position.y = -0.4; s.add(grid);
    this.setCos(save.data.equip);
  }
  setCos(cos) {
    if (this.car) { this.turn.remove(this.car); this.car.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    this.car = buildCarMesh(cos); this.turn.add(this.car);
  }
  update(dt, camera, aspect) {
    this.turn.rotation.y += dt * 0.5;
    const wide = aspect > 1.2;
    camera.up.set(0, 1, 0);
    camera.position.set(wide ? 3.4 : 0, 2.6, wide ? 8.5 : 11);
    camera.lookAt(wide ? 3.4 : 0, 0.9, 0);
    this.turn.position.x = 0;
    if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
  }
}

class App {
  constructor() {
    save.load(); input.init(); audio.init();
    const canvas = document.getElementById('c');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: save.data.settings.quality !== 'low', powerPreference: 'high-performance' });
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 1400);
    this.showroom = new Showroom();
    this.game = null; this.session = null; this.paused = false; this.lastOpts = null; this.showingResults = false;
    this.ui = new UI(this);
    this.applySettings();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    input.onPause = () => this.togglePause();
    const params = new URLSearchParams(location.search);
    const room = (params.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    const auto = params.get('auto');
    if (auto) { const [mode, id] = auto.split(':'); this.startSolo({ mode, world: id, levelId: LEVELS[id] ? id : null, laps: +(params.get('laps') || 3), bots: +(params.get('bots') || 5), diff: +(params.get('diff') || 1), autopilot: params.has('autopilot') }); }
    else if (room.length === 4) this.ui.join(room);
    else this.ui.main();
    audio.music('menu');
    this.last = performance.now();
    const loop = (now) => { requestAnimationFrame(loop); this.frame(Math.min(0.1, (now - this.last) / 1000)); this.last = now; };
    requestAnimationFrame(loop);
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
  }
  applySettings() {
    const q = save.data.settings.quality, dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'low' ? Math.min(dpr, 1) * 0.7 : q === 'medium' ? Math.min(dpr, 1) : Math.min(dpr, 2));
    this.renderer.shadowMap.enabled = q === 'high';
    this.resize && this.renderer.setSize(innerWidth, innerHeight, false);
    audio.applyVolumes();
  }
  onScreen(name) { if (!this.game) audio.music('menu'); }
  frame(dt) {
    if (this.game) {
      this.game.frame(dt);
      this.renderer.render(this.game.scene, this.camera);
      if (!this.showingResults) this.ui.hudUpdate(this.game, dt);
    } else {
      this.showroom.update(dt, this.camera, this.camera.aspect);
      this.renderer.render(this.showroom.scene, this.camera);
    }
  }

  // ------------------------------------------------------------------ game lifecycle
  myCos() { return { ...save.data.equip }; }
  botSpec(id, diff, usedPaints, usedNames) {
    const name = pick(BOT_NAMES.filter((n) => !usedNames.has(n))) || 'Bot ' + id; usedNames.add(name);
    const paint = (pick(PAINTS.filter((p) => !usedPaints.has(p.id))) || pick(PAINTS)).id; usedPaints.add(paint);
    return { id, name, kind: 'bot', diff, cos: { paint, wheel: pick(WHEELS).id, trail: pick(TRAILS).id, horn: pick(HORNS).id } };
  }
  levelFor(mode, world, levelId) {
    if (levelId && LEVELS[levelId]) return LEVELS[levelId];
    const w = WORLDS.some((x) => x.id === world) ? world : 'neon';
    return mode === 'potato' || mode === 'coins' ? arenaOf(w) : raceOf(w);
  }
  startSolo(o) {
    const level = this.levelFor(o.mode, o.world, o.levelId);
    const cos = this.myCos(), players = [{ id: 0, name: save.data.name, kind: 'local', cos }];
    const usedP = new Set([cos.paint]), usedN = new Set();
    const nb = o.mode === 'gauntlet' || o.mode === 'trial' ? 0 : Math.min(5, o.bots == null ? 5 : o.bots);
    for (let i = 0; i < nb; i++) players.push(this.botSpec(i + 1, o.diff == null ? 1 : o.diff, usedP, usedN));
    this.lastOpts = o;
    this.startGame({ level, mode: o.mode, laps: o.laps || 3, players, role: 'local', autopilot: o.autopilot });
  }
  startGame(opts) {
    this.disposeGame();
    this.paused = false; this.showingResults = false;
    this.ui.show(null); this.ui.pauseMenu(false);
    try { this.game = new Game(this, opts); } catch (e) { console.error(e); this.game = null; this.ui.error('Oops', 'The level failed to load: ' + e.message); return; }
    this.ui.hudShow(this.game);
    input.enabled = true;
    audio.ensure(); audio.startEngine();
  }
  disposeGame() {
    if (!this.game) return;
    this.game.dispose(); this.game = null;
    this.ui.hudHide(); input.enabled = false;
    this.renderer.renderLists.dispose();
  }
  togglePause(force) {
    if (!this.game || this.showingResults) return;
    this.paused = force == null ? !this.paused : force;
    this.game.paused = this.paused;
    this.ui.pauseMenu(this.paused, this.game);
    if (this.paused) audio.muteEngine();
  }
  retry() { if (this.lastOpts && !this.session) this.startSolo(this.lastOpts); }
  quitToMenu() { this.disposeGame(); this.ui.main(); audio.music('menu'); }
  onGameEnd(res) {
    const g = this.game; if (!g || this.showingResults) return;
    this.showingResults = true; this.paused = false; g.paused = false;
    this.ui.pauseMenu(false); this.ui.hud.classList.add('hidden');
    audio.muteEngine(); input.enabled = false;
    const myId = g.me ? g.me.id : 0;
    const ctx = { myId, mp: !!this.session, host: this.session && this.session.isHost, reward: (res.rewards && res.rewards[myId]) || 0 };
    const d = save.data;
    if (res.mode === 'gauntlet') {
      const before = save.totalStars(), id = res.levelId;
      if (d.best[id] == null || res.time < d.best[id]) { d.best[id] = res.time; ctx.newBest = true; }
      d.stars[id] = Math.max(d.stars[id] || 0, res.stars);
      const after = save.totalStars(), w = WORLDS.find((x) => x.need > before && x.need <= after);
      if (w) ctx.unlocked = w.name;
      const list = GAUNTLETS[g.level.world], i = list.findIndex((l) => l.id === id);
      if (i >= 0 && i < list.length - 1) ctx.next = list[i + 1].id;
    }
    save.addCoins(ctx.reward);
    this.ui.results(res, ctx);
  }

  // ------------------------------------------------------------------ multiplayer
  bindSession(s) {
    this.session = s;
    s.on.lobby = () => { if (!this.game) this.ui.lobby(); };
    s.on.emoji = (id, e) => this.ui.floatEmoji(id, e);
    s.on.input = (id, m) => { if (this.game) this.game.onNetInput(id, m); };
    s.on.left = (id) => { if (this.game) this.game.onPlayerLeft(id); };
    s.on.start = (o) => this.startNetGame(o);
    s.on.snap = (m) => { if (this.game && this.game.role === 'client') this.game.onSnap(m); };
    s.on.end = (res) => this.onGameEnd(res);
    s.on.back = () => { this.disposeGame(); this.ui.lobby(); audio.music('menu'); };
    s.on.closed = (why) => { this.session = null; this.disposeGame(); audio.music('menu'); this.ui.error('Disconnected', why, null); };
  }
  hostGame() {
    this.ui.busy('Creating room…');
    Session.host(save.data.name, this.myCos()).then((s) => { this.bindSession(s); this.ui.lobby(); })
      .catch((e) => this.ui.error('Could not host', e.message, () => this.hostGame()));
  }
  joinGame(code) {
    this.ui.busy('Joining room ' + code + '…');
    Session.join(code, save.data.name, this.myCos()).then((s) => { this.bindSession(s); this.ui.lobby(); })
      .catch((e) => this.ui.join(code, e.message));
  }
  leaveSession() {
    if (this.session) { this.session.close(); this.session = null; }
    this.quitToMenu();
  }
  startMP() {
    const s = this.session; if (!s || !s.isHost) return;
    const st = s.settings;
    const level = this.levelFor(st.mode, st.world);
    const players = s.players.map((p) => ({ id: p.id, name: p.name, cos: p.cos, kind: 'human' }));
    const usedP = new Set(players.map((p) => p.cos.paint)), usedN = new Set();
    let nb = Math.min(st.bots, 6 - players.length);
    if (players.length + nb < 2) nb = 2 - players.length;
    let id = 10;
    for (let i = 0; i < nb; i++) players.push(this.botSpec(id++, st.diff, usedP, usedN));
    const o = { levelId: level.id, mode: st.mode, laps: st.laps, players, grid: shuffle(players.map((p, i) => i)) };
    s.inGame = true;
    s.broadcast({ k: 'start', o });
    this.startNetGame(o);
  }
  startNetGame(o) {
    const s = this.session; if (!s) return;
    const players = o.players.map((p) => ({ ...p, kind: p.id === s.myId ? 'local' : (s.isHost && p.kind === 'bot') ? 'bot' : 'remote' }));
    this.startGame({ level: LEVELS[o.levelId], mode: o.mode, laps: o.laps, players, grid: o.grid, role: s.isHost ? 'host' : 'client', session: s });
  }
  backToLobby() {
    const s = this.session; if (!s || !s.isHost) return;
    s.inGame = false;
    for (const p of s.players) if (!p.host) p.ready = false;
    s.broadcast({ k: 'back' });
    this.disposeGame(); audio.music('menu');
    s.pushLobby();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try { window.__nr = new App(); } catch (e) {
    console.error(e);
    document.getElementById('ui').innerHTML = '<div class="fatal"><h2>Nitro Rush could not start</h2><p>' + (e && e.message ? e.message : e) + '</p><p>Your browser needs WebGL and an internet connection (to load Three.js from the CDN).</p></div>';
  }
});

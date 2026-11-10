// One play session: owns the scene, cars, obstacles and mode rules. Runs a fixed 60 Hz simulation with
// interpolated rendering. Works in three roles: 'local' (solo), 'host' (authoritative) and 'client'.
import * as THREE from 'three';
import { DT, TUNE, DRIFT_COLORS, ITEM_IDS, ITEM_DEFS, clamp, fmtTime, ordinal } from './config.js';
import { THEMES } from './levels/index.js';
import { Track, makeFrame } from './track.js';
import { Arena } from './arena.js';
import { Car, buildCarMesh } from './car.js';
import { stepCar, collideCars } from './physics.js';
import { buildObstacles } from './obstacles.js';
import { Items } from './items.js';
import { initBot, botThink } from './bots.js';
import { Effects, CameraRig } from './effects.js';
import { buildEnvironment } from './scenery.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { save } from './save.js';

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();
const YUP = new THREE.Vector3(0, 1, 0);
const ZERO_INP = { th: 0, st: 0, ty: 0, dr: false, it: false, rs: false, hn: false };
const STATES = ['intro', 'countdown', 'racing', 'done'];
const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;
const RACE_REWARD = [100, 70, 50, 35, 30, 25], PARTY_REWARD = [80, 50, 35, 25, 20, 15];

export class Game {
  constructor(app, o) {
    this.app = app; this.o = o; this.level = o.level; this.mode = o.mode; this.role = o.role || 'local';
    this.session = o.session || null; this.laps = o.laps || 3;
    this.theme = THEMES[this.level.world];
    this.quality = save.data.settings.quality;
    this.useItems = ['race', 'elim', 'potato', 'coins'].includes(this.mode);
    this.scene = new THREE.Scene(); this.camera = app.camera; this.scene.add(this.camera);
    this.tmpFrame = makeFrame();
    this.world = this.level.type === 'arena' ? new Arena(this.level, this.theme) : new Track(this.level, this.theme);
    this.world.build(this.scene, this.quality);
    this.env = buildEnvironment(this.scene, this.theme, this.world, this.quality);
    this.fx = new Effects(this.scene, this.camera, this.theme, this.quality);
    this.obstacles = this.world.isArena ? [] : buildObstacles(this, this.level.obstacles);
    this.cars = o.players.map((p) => new Car(p));
    this.me = this.cars.find((c) => c.kind === 'local') || null;
    this.items = new Items(this);
    this.rig = new CameraRig(this.camera);
    this.state = 'intro'; this.stateT = 0; this.simT = 0; this.raceT = 0; this.cd = 3.5; this.acc = 0; this.time = 0;
    this.introLen = this.role === 'local' ? 1.0 : 2.6;
    this.paused = false; this.ended = false; this.doneT = 0; this.firstFinishT = -1;
    this.ms = { elimT: 30, bomb: -1, bombT: 0, timeLeft: 120, round: 0 };
    this.outOrder = []; this.netEv = []; this.snapTick = 0; this.seq = 0; this.hist = new Map();
    this.stormK = 0; this.windK = 0; this.stormS = 0; this.passCd = 0; this.rankT = 0; this.botInp = { ...ZERO_INP };
    this.snapLocalT = 0; this.lastSnap = null; this.lapTimes = [];
    // grid
    const order = this.cars.map((c, i) => i);
    if (this.role !== 'client' && this.mode !== 'gauntlet' && this.mode !== 'trial') {
      // humans start mid-pack / at the back for a fun chase
      order.sort((a, b) => (this.cars[a].kind === 'bot' ? 0 : 1) - (this.cars[b].kind === 'bot' ? 0 : 1));
    }
    this.gridOrder = o.grid || order;
    this.gridOrder.forEach((ci, slot) => {
      const car = this.cars[ci];
      const si = this.world.gridSlot(slot, _v, _a, _b);
      car.placeAt(_v, _a, _b, si);
      car.frozen = true; car.cp = this.world.closed ? 0 : 1;
      if (car.kind === 'bot') initBot(car);
      if (this.role === 'client' && car !== this.me) { car.remote = true; car.buf = []; }
      this.scene.add(car.mesh);
      this.world.sample(car, 0, car.fr);
    });
    if (o.autopilot && this.me) initBot(this.me);
    // time-trial ghost
    this.ghost = null; this.rec = [];
    if (this.mode === 'trial') {
      const g = save.getGhost(this.level.id);
      if (g && g.data && g.data.length > 14) {
        this.ghost = { time: g.time, data: g.data, mesh: buildCarMesh(this.me.cos, true) };
        this.ghost.mesh.visible = false; this.scene.add(this.ghost.mesh);
      }
    }
    if (this.mode === 'potato') {
      const b = this.bombMesh = new THREE.Group();
      b.add(new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), new THREE.MeshLambertMaterial({ color: 0x15151c })));
      const fuse = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffa020 })); fuse.position.y = 1; b.add(fuse);
      b.visible = false; this.scene.add(b);
    }
    this.minimap = this.world.minimap();
    audio.music(this.theme.music);
    if (this.rig && this.me) { this.me.updateVisual(1, 0, 0); this.rig.update(this.me, 0.016); }
  }

  // ------------------------------------------------------------------ helpers
  activeCount() { let n = 0; for (const c of this.cars) if (!c.out) n++; return n; }
  carById(id) { return this.cars.find((c) => c.id === id); }
  toast(text, kind = '') { if (this.app.ui) this.app.ui.toast(text, kind); }
  emit(ev) { this.fxEvent(ev); if (this.role === 'host') this.netEv.push(ev); }
  nearMe(pos, r = 60) { const v = this.viewCar(); return v ? v.pos.distanceToSquared(pos) < r * r : false; }
  viewCar() {
    if (this.me && !this.me.out) return this.me;
    let best = null; for (const c of this.cars) if (!c.out && (!best || c.place < best.place)) best = c;
    return best || this.me || this.cars[0];
  }

  fxEvent(ev) {
    const me = this.me, id = ev[1], mine = me && id === me.id;
    switch (ev[0]) {
      case 'pick': if (mine) audio.sfx('pick'); break;
      case 'got': if (mine) audio.sfx('itemget'); break;
      case 'coin': if (mine) audio.sfx('coin'); break;
      case 'use': if (mine) audio.sfx(ev[2] === 'shield' ? 'shield' : ev[2] === 'rocket' ? 'boost2' : ev[2] === 'shock' ? 'shock' : 'mine'); break;
      case 'slow': if (mine) { audio.sfx('glue'); this.toast('Glued!', 'bad'); if (this.role === 'client') { me.slowT = 1.7; me.vel.multiplyScalar(0.5); } } break;
      case 'boost': if (mine && this.role === 'client') me.boost(ev[2], ev[3]); break;
      case 'shock': _v.set(ev[1], ev[2], ev[3]); this.fx.ring(_v, ev[4] || 1); if (this.nearMe(_v, 50)) { audio.sfx('shock'); this.rig.addShake(0.4); } break;
      case 'hitx': {
        const car = this.carById(id); if (!car) break;
        if (mine && this.role === 'client') { if (ev[6] === 'it' || me.hitCd <= 0) { me.hitCd = 0; me.invulnT = 0; me.hit(_v.set(ev[2], ev[3], ev[4]), ev[5], 'net'); } }
        else if (this.role === 'client') this.fx.particles.burst(car.pos, 0xffe08a, 14, 12);
        break;
      }
      case 'elim': {
        const car = this.carById(id); if (!car) break;
        car.out = true; this.fx.particles.burst(car.pos, 0xff7a3a, 40, 18, 1); this.fx.ring(car.pos, 0.8, 0xff7a3a);
        audio.sfx('elim'); this.toast(mine ? 'You\'re OUT!' : car.name + ' is out!', mine ? 'bad' : '');
        if (!this.outOrder.includes(id)) this.outOrder.push(id);
        break;
      }
      case 'pass': audio.sfx('warn'); if (ev[2] === (me && me.id)) this.toast('You have the bomb!', 'bad'); break;
      case 'lap': if (mine) { me.lapStart = this.raceT; if (ev[2] > 1) { audio.sfx('lap'); if (this.mode === 'race') this.toast(ev[2] === this.laps ? 'FINAL LAP!' : 'Lap ' + ev[2], 'good'); } } break;
      case 'fin': if (mine) { audio.sfx('finish'); this.toast('FINISH!', 'good'); } else { const c = this.carById(id); if (c && this.mode === 'race') this.toast(c.name + ' finished'); } break;
      case 'horn': { const c = this.carById(id); if (c && this.nearMe(c.pos, 90)) audio.horn(ev[2]); break; }
      case 'start': if (mine) { audio.sfx('boost2'); this.toast('PERFECT START!', 'good'); } break;
      case 'toast': this.toast(ev[1], ev[2] || ''); break;
    }
  }

  drainCar(car) {
    const mine = car === this.me, ev = car.events;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      switch (e[0]) {
        case 'land': if (mine) { audio.sfx('land', clamp(e[1] / 14, 0.3, 1)); this.rig.addShake(clamp(e[1] / 30, 0.1, 0.6)); } break;
        case 'wall': if (mine) { audio.sfx('wall', clamp(e[1] / 12, 0.4, 1)); this.rig.addShake(0.15); } this.fx.particles.burst(car.pos, 0xffe9a0, 5, 7, 0.3); break;
        case 'dboost': if (mine) audio.sfx(e[1] === 3 ? 'boost2' : 'boost'); break;
        case 'trick': if (mine) { audio.sfx('trick'); audio.sfx('boost'); this.toast(e[1] > 1 ? 'TRICK x' + e[1] + '!' : 'CLEAN LANDING!', 'good'); } break;
        case 'sloppy': if (mine) this.toast('Sloppy landing', 'bad'); break;
        case 'hit':
          this.fx.particles.burst(car.pos, 0xffe08a, 16, 12);
          if (mine) { audio.sfx('hit'); this.rig.addShake(0.7); }
          if (this.role === 'host') this.netEv.push(['hitx', car.id, r2(e[3]), r2(e[4]), r2(e[5]), e[6], e[2]]);
          break;
        case 'block': if (mine) { audio.sfx('block'); this.toast('Blocked!', 'good'); } this.fx.ring(car.pos, 0.3); break;
        case 'pad': if (mine) audio.sfx('boost'); break;
        case 'oil': if (mine) this.toast('Oil slick!', 'bad'); break;
        case 'burn': if (mine) this.toast('Too hot!', 'bad'); break;
        case 'respawn': if (mine) audio.sfx('respawn'); break;
      }
    }
    ev.length = 0;
  }

  respawn(car) {
    const w = this.world;
    car.wantRespawn = false;
    if (w.isArena) {
      w.randomPoint(_v, 0.6); _a.copy(_v).multiplyScalar(-1).normalize(); if (_a.lengthSq() < 0.5) _a.set(0, 0, -1);
      car.placeAt(_v, _a, YUP, 0);
    } else {
      const C = w.cps.length;
      let s = w.closed ? (car.lap === 0 ? w.length - 12 : w.cps[(car.cp - 1 + C) % C]) : Math.max(8, w.cps[Math.max(0, car.cp - 1)]);
      const f = w.frameS(s, this.tmpFrame);
      _v.copy(f.P).addScaledVector(f.R, ((car.id % 3) - 1) * 3).addScaledVector(f.U, 0.2);
      car.placeAt(_v, f.T, f.U, Math.floor(f.si));
      car.vel.copy(f.T).multiplyScalar(22);
    }
    car.invulnT = 1.6; car.spinT = 0; car.drifting = false; car.driftCharge = 0; car.boostT = 0; car.slowT = 0; car.oilT = 0;
    car.trkP = car.trkY = car.trkPV = car.trkYV = 0; car.slipT = 0; car.stats.respawns++;
    car.events.push(['respawn']);
    w.sample(car, this.simT, car.fr);
  }

  inputFor(car) {
    if (car.kind === 'bot' || (car.finished && car.bot) || (this.o.autopilot && car === this.me)) return botThink(car, this, this.botInp);
    if (car === this.me) return this.localInp || ZERO_INP;
    return car.netInp || ZERO_INP;
  }

  // ------------------------------------------------------------------ main loop
  frame(dt) {
    this.time += dt;
    if (!this.paused || this.role !== 'local') {
      this.acc += Math.min(dt, 0.1);
      this.localInp = input.poll();
      let n = 0;
      while (this.acc >= DT && n++ < 8) { this.step(); this.acc -= DT; }
      if (this.acc >= DT) this.acc = 0;
    }
    this.render(clamp(this.acc / DT, 0, 1), dt);
  }

  step() {
    this.simT += DT; this.stateT += DT;
    if (this.role === 'client') return this.stepClient();
    // --- state machine
    if (this.state === 'intro' && this.stateT >= this.introLen) this.setState('countdown');
    else if (this.state === 'countdown') {
      const before = Math.ceil(this.cd); this.cd -= DT; const after = Math.ceil(this.cd);
      if (after < before && after > 0 && after <= 3) audio.sfx('beep');
      if (this.cd <= 0) this.go();
    } else if (this.state === 'racing') this.raceT += DT;
    const racing = this.state === 'racing';
    // --- cars
    for (const car of this.cars) {
      if (car.out) continue;
      const inp = this.inputFor(car), pi = car.prevInp;
      if (this.state === 'countdown') { if (inp.th > 0 && pi.th <= 0) car.launchT = this.cd; else if (inp.th <= 0) car.launchT = -1; }
      car.frozen = !racing && this.state !== 'done';
      if (racing || this.state === 'done') {
        if (inp.it && !pi.it && !car.finished) this.items.use(car);
        if (inp.rs && !pi.rs && !car.finished) this.respawn(car);
      }
      if (inp.hn && !pi.hn) this.emit(['horn', car.id, car.cos.horn || 'beep']);
      pi.th = inp.th; pi.it = inp.it; pi.rs = inp.rs; pi.hn = inp.hn;
      if (car.finished && this.mode === 'gauntlet') { this.botInp.th = -1; this.botInp.st = 0; this.botInp.dr = false; stepCar(car, this.botInp, DT, this.world, this.simT); }
      else stepCar(car, inp, DT, this.world, this.simT);
      if (car.wantRespawn) this.respawn(car);
    }
    for (const o of this.obstacles) o.update(this.simT, DT);
    for (const car of this.cars) if (!car.out) for (const o of this.obstacles) o.touch(car, this.simT);
    this.world.update(this.simT, DT);
    if (racing) this.items.update(DT);
    // --- car vs car
    this.passCd -= DT;
    for (let i = 0; i < this.cars.length; i++) for (let j = i + 1; j < this.cars.length; j++) collideCars(this.cars[i], this.cars[j], false, this._onBump || (this._onBump = (a, b, rel) => this.onBump(a, b, rel)));
    this.slipstream();
    if (racing) this.updateMode();
    for (const car of this.cars) this.drainCar(car);
    if (this.state === 'done' && !this.ended) { this.doneT -= DT; if (this.doneT <= 0) this.end(); }
    if (this.role === 'host' && ++this.snapTick >= 3) { this.snapTick = 0; this.session.broadcast(this.makeSnap()); }
  }

  setState(s) { this.state = s; this.stateT = 0; }
  go() {
    this.setState('racing'); audio.sfx('go');
    for (const car of this.cars) {
      let perfect = car.launchT > 0.02 && car.launchT < 0.4;
      if (car.kind === 'bot') perfect = Math.random() < [0.1, 0.35, 0.6][car.diff];
      if (perfect) { car.boost(1.3, 14); this.emit(['start', car.id]); if (this.role === 'host') this.netEv.push(['boost', car.id, 1.3, 14]); }
      car.lapStart = 0;
    }
    if (this.mode === 'potato') this.newBomb();
  }

  onBump(a, b, rel) {
    if (rel > 6) {
      (a.speed > b.speed ? a : b).stats.knocks++;
      if (a === this.me || b === this.me) { audio.sfx('wall', clamp(rel / 14, 0.5, 1)); this.rig.addShake(clamp(rel / 30, 0.15, 0.5)); }
      this.fx.particles.burst(_v.copy(a.pos).lerp(b.pos, 0.5), 0xffffff, 6, 8, 0.3);
    }
    if (this.mode === 'potato' && this.passCd <= 0 && this.state === 'racing') {
      const from = a.id === this.ms.bomb ? a : b.id === this.ms.bomb ? b : null;
      if (from) { const to = from === a ? b : a; this.ms.bomb = to.id; this.passCd = 0.8; this.emit(['pass', from.id, to.id]); }
    }
  }

  slipstream() {
    for (const a of this.cars) {
      let found = false;
      if (!a.out && a.grounded && a.speed > 24) for (const b of this.cars) {
        if (b === a || b.out || b.speed < 18) continue;
        _v.subVectors(b.pos, a.pos);
        const ahead = _v.dot(a.fwd);
        if (ahead > 3 && ahead < 24 && _v.lengthSq() - ahead * ahead < 9) { found = true; break; }
      }
      a.slipT = found ? Math.min(3, a.slipT + DT) : Math.max(0, a.slipT - DT * 2);
      const on = a.slipT >= 2;
      if (on && !a.slipOn && a === this.me) this.toast('SLIPSTREAM!', 'good');
      a.slipOn = on;
    }
  }

  // ------------------------------------------------------------------ mode rules
  updateProgress(car) {
    const w = this.world;
    if (w.isArena || car.finished) return;
    const f = car.fr, C = w.cps.length, L = w.length;
    if (w.closed) {
      const d = w.wrapD(f.s - w.cps[car.cp]);
      if (d >= 0 && d < 30 && Math.abs(f.lat) < f.hw + 4) {
        if (car.cp === 0) {
          if (car.lap > 0) {
            const lt = this.raceT - car.lapStart;
            car.bestLap = Math.min(car.bestLap, lt);
            if (car === this.me) this.onMyLap(lt);
          }
          car.lap++; car.lapStart = this.raceT;
          if ((this.mode === 'race') && car.lap > this.laps) { this.finish(car); return; }
          this.emit(['lap', car.id, car.lap]);
        }
        car.cp = (car.cp + 1) % C;
      }
      if (car.lap === 0) car.prog = w.wrapD(f.s);
      else {
        const last = (car.cp - 1 + C) % C, span = ((w.cps[car.cp] - w.cps[last] + L) % L || L) + 30;
        let rel = ((f.s - w.cps[last]) % L + L) % L; if (rel > span) rel = 0;
        car.prog = (car.lap - 1) * L + w.cps[last] + rel;
      }
    } else {
      while (car.cp < C && f.s >= w.cps[car.cp] && f.on) car.cp++;
      car.prog = f.s;
      if (car.cp >= C) this.finish(car);
    }
  }
  finish(car) {
    car.finished = true; car.finishT = this.raceT; car.drifting = false;
    if (car.kind !== 'bot' && this.mode !== 'gauntlet') initBot(car);
    if (car.bot) car.bot.skill = 0.7;
    if (this.firstFinishT < 0) this.firstFinishT = this.raceT;
    this.emit(['fin', car.id]);
  }
  onMyLap(lt) {
    this.lapTimes.push(lt);
    if (this.mode !== 'trial') return;
    const best = save.data.best[this.level.id];
    if (best == null || lt < best) {
      save.data.best[this.level.id] = lt; save.persist();
      save.setGhost(this.level.id, { time: lt, data: this.rec });
      this.toast('NEW BEST LAP  ' + fmtTime(lt), 'good'); audio.sfx('star');
      if (!this.ghost) { this.ghost = { mesh: buildCarMesh(this.me.cos, true) }; this.scene.add(this.ghost.mesh); }
      this.ghost.time = lt; this.ghost.data = this.rec;
    } else this.toast('Lap ' + fmtTime(lt));
    this.rec = [];
  }
  rank() {
    const list = this.cars.slice();
    const key = (c) => (c.out ? -1e9 + this.outOrder.indexOf(c.id) : c.finished ? 1e9 - c.finishT : this.mode === 'coins' ? c.coins : c.prog);
    list.sort((a, b) => key(b) - key(a));
    list.forEach((c, i) => { c.place = i + 1; });
    return list;
  }
  eliminate(car) { this.emit(['elim', car.id]); car.out = true; if (!this.outOrder.includes(car.id)) this.outOrder.push(car.id); }
  newBomb() {
    const alive = this.cars.filter((c) => !c.out);
    if (alive.length < 2) return;
    const c = alive[Math.floor(Math.random() * alive.length)];
    this.ms.bomb = c.id; this.ms.bombT = Math.max(12, 20 - this.ms.round * 2); this.ms.round++;
    this.emit(['pass', -1, c.id]);
  }
  updateMode() {
    const ms = this.ms, mode = this.mode, me = this.me, solo = this.role === 'local';
    for (const car of this.cars) if (!car.out) this.updateProgress(car);
    this.rankT -= DT;
    if (this.rankT <= 0) { this.rankT = 0.15; this.rank(); this.rubberBand(); }
    let over = false;
    if (mode === 'race') {
      const humans = this.cars.filter((c) => c.kind !== 'bot' || (c.finished && c.name === (me && me.name)));
      const allHumans = this.cars.every((c) => c.kind === 'bot' ? true : c.finished);
      over = solo ? me.finished : (allHumans || (this.firstFinishT >= 0 && this.raceT - this.firstFinishT > 30)) && humans.length >= 0;
      if (this.cars.every((c) => c.finished)) over = true;
    } else if (mode === 'gauntlet') over = me.finished;
    else if (mode === 'trial') over = false;
    else if (mode === 'elim') {
      ms.elimT -= DT;
      if (ms.elimT <= 0) {
        ms.elimT = 30;
        let last = null; for (const c of this.cars) if (!c.out && (!last || c.prog < last.prog)) last = c;
        if (last && this.activeCount() > 1) this.eliminate(last);
      }
      over = this.activeCount() <= 1 || (solo && me.out);
    } else if (mode === 'potato') {
      if (ms.bomb >= 0) {
        ms.bombT -= DT;
        const h = this.carById(ms.bomb);
        if (h) h.speedMul = 1.07;
        if (ms.bombT <= 0) {
          if (h) { this.emit(['shock', r2(h.pos.x), r2(h.pos.y), r2(h.pos.z), 1.2]); this.eliminate(h); }
          ms.bomb = -1; ms.bombT = 2.5;
        }
      } else { ms.bombT -= DT; if (ms.bombT <= 0) this.newBomb(); }
      over = this.activeCount() <= 1 || (solo && me.out);
    } else if (mode === 'coins') { ms.timeLeft -= DT; over = ms.timeLeft <= 0; }
    if (over) { this.setState('done'); this.doneT = mode === 'gauntlet' ? 1.6 : 2.6; }
  }
  rubberBand() {
    let lead = -Infinity; for (const c of this.cars) if (c.kind !== 'bot' && !c.out && !c.finished) lead = Math.max(lead, c.prog);
    for (const c of this.cars) {
      if (!c.bot) { if (this.mode !== 'potato') c.speedMul = 1; continue; }
      const rb = isFinite(lead) && !this.world.isArena ? clamp((lead - c.prog) / 400, -0.05, 0.07) : 0;
      c.speedMul = c.bot.skill * (1 + rb);
    }
  }

  end() {
    if (this.ended) return; this.ended = true;
    const res = this.results();
    if (this.role === 'host') this.session.broadcast({ k: 'end', res });
    this.app.onGameEnd(res);
  }
  results() {
    const list = this.rank(), mode = this.mode;
    const ranking = list.map((c) => ({ id: c.id, name: c.name, color: c.color, bot: c.kind === 'bot' && !c.finished || (c.kind === 'bot'), place: c.place,
      time: c.finished ? c.finishT : null, coins: c.coins, out: c.out, best: isFinite(c.bestLap) ? c.bestLap : null }));
    const award = (title, key, fmt, min) => { let b = null; for (const c of this.cars) if (!b || c.stats[key] > b.stats[key]) b = c; return b && b.stats[key] > min ? { title, name: b.name, color: b.color, value: fmt(b.stats[key]) } : null; };
    const awards = [award('Most Airtime', 'air', (v) => v.toFixed(1) + 's', 0.5), award('Most Knockbacks', 'knocks', (v) => v + ' hits', 0), award('Best Drift', 'drift', (v) => v.toFixed(1) + 's', 0.8)].filter(Boolean);
    const res = { mode, levelId: this.level.id, levelName: this.level.name, ranking, awards, laps: this.laps };
    const rewards = {};
    for (const r of ranking) {
      const table = mode === 'race' || mode === 'elim' ? RACE_REWARD : PARTY_REWARD;
      rewards[r.id] = (table[r.place - 1] || 15) + (mode === 'coins' ? Math.round(r.coins / 2) : r.coins);
    }
    res.rewards = rewards;
    if (mode === 'gauntlet' && this.me) {
      const t = this.me.finishT, resp = this.me.stats.respawns, par = this.parTimes();
      res.time = t; res.respawns = resp; res.par = par;
      res.stars = t <= par[0] && resp <= 1 ? 3 : t <= par[1] && resp <= 4 ? 2 : 1;
      rewards[this.me.id] = res.stars * 25 + this.me.coins;
    }
    if (mode === 'trial' && this.me) {
      res.laps = this.lapTimes.slice(); res.best = save.data.best[this.level.id] || null;
      rewards[this.me.id] = Math.min(60, this.lapTimes.length * 12) + this.me.coins;
    }
    return res;
  }
  parTimes() {
    if (this.level.stars) return this.level.stars;
    const L = this.world.finishS;
    return [Math.round(L / 31 + 2), Math.round(L / 24 + 5)];
  }

  // ------------------------------------------------------------------ networking (host side)
  makeSnap() {
    const cars = this.cars.map((c) => [c.id, r2(c.pos.x), r2(c.pos.y), r2(c.pos.z), r2(c.vel.x), r2(c.vel.y), r2(c.vel.z), r3(c.fwd.x), r3(c.fwd.y), r3(c.fwd.z),
      r3(c.up.x), r3(c.up.y), r3(c.up.z), r2(c.steer), c.flags(), c.lap, c.cp, c.place, c.item ? ITEM_IDS.indexOf(c.item) : -1, c.roll > 0 ? 1 : 0, c.coins,
      c.driftLevel(), r2(c.trkP), r2(c.trkY), c.lastSeq || 0, c.driftDir]);
    const ms = this.ms;
    const snap = { k: 'snap', t: r3(this.raceT), s: r3(this.simT), st: STATES.indexOf(this.state), cd: r2(this.cd),
      ms: [r2(ms.elimT), ms.bomb, r2(ms.bombT), r2(ms.timeLeft)], c: cars, b: this.items.boxes.mask(), e: this.items.entList(), ev: this.netEv };
    if (this.mode === 'coins') snap.o = this.items.coins.mask();
    this.netEv = [];
    return snap;
  }
  onNetInput(id, m) {
    const car = this.carById(id); if (!car || car.kind !== 'remote') return;
    const i = m.i, bits = i[2];
    car.netInp = { th: i[0], st: i[1], ty: i[3], dr: !!(bits & 1), it: !!(bits & 2), rs: !!(bits & 4), hn: !!(bits & 8) };
    car.lastSeq = m.q;
  }
  onPlayerLeft(id) {
    const car = this.carById(id); if (!car || car.kind === 'bot') return;
    car.kind = 'bot'; car.diff = 1; initBot(car);
    this.emit(['toast', car.name + ' left - a bot took over']);
  }

  // ------------------------------------------------------------------ networking (client side)
  onSnap(s) {
    const now = performance.now() / 1000, me = this.me;
    this.lastSnap = s; this.snapLocalT = now;
    const st = STATES[s.st];
    if (st !== this.state) {
      if (st === 'racing' && this.state !== 'racing') audio.sfx('go');
      this.setState(st);
    }
    if (st === 'countdown') { const b = Math.ceil(this.cd), a = Math.ceil(s.cd); if (a < b && a > 0 && a <= 3) audio.sfx('beep'); }
    this.cd = s.cd; this.raceT = s.t;
    const err = s.s + 0.06 - this.simT;
    if (Math.abs(err) > 0.3) this.simT = s.s + 0.06; else this.simT += err * 0.1;
    this.ms.elimT = s.ms[0]; this.ms.bomb = s.ms[1]; this.ms.bombT = s.ms[2]; this.ms.timeLeft = s.ms[3];
    for (const a of s.c) {
      const car = this.carById(a[0]); if (!car) continue;
      const fl = a[14];
      car.lap = a[15]; car.cp = a[16]; car.place = a[17]; car.coins = a[20];
      car.finished = !!(fl & 64);
      if (fl & 128) car.out = true;
      if (car === me) {
        car.item = a[18] >= 0 ? ITEM_IDS[a[18]] : null; car.roll = a[19] ? Math.max(car.roll, 0.3) : 0;
        if ((fl & 8) && car.shield <= 0) car.shield = 12; else if (!(fl & 8)) car.shield = 0;
        // reconcile prediction against the host's authoritative state for the input it has processed
        const h = this.hist.get(a[24]);
        _v.set(a[1], a[2], a[3]);
        if (h) {
          _a.subVectors(_v, h);
          const e = _a.length();
          if (e > 14) this.hardSync(car, a);
          else if (e > 0.4) { _a.multiplyScalar(0.18); car.pos.add(_a); car.prevPos.add(_a); for (const p of this.hist.values()) p.add(_a); }
        } else if (car.pos.distanceToSquared(_v) > 400) this.hardSync(car, a);
      } else {
        car.buf.push({ t: now, p: [a[1], a[2], a[3]], v: [a[4], a[5], a[6]], f: [a[7], a[8], a[9]], u: [a[10], a[11], a[12]], steer: a[13], fl, dl: a[21], tp: a[22], ty: a[23], dd: a[25] });
        if (car.buf.length > 8) car.buf.shift();
      }
    }
    this.items.boxes.setMask(s.b); if (s.o) this.items.coins.setMask(s.o);
    this.items.syncEnts(s.e);
    for (const ev of s.ev) this.fxEvent(ev);
  }
  hardSync(car, a) {
    car.pos.set(a[1], a[2], a[3]); car.vel.set(a[4], a[5], a[6]); car.fwd.set(a[7], a[8], a[9]).normalize(); car.up.set(a[10], a[11], a[12]).normalize();
    car.prevPos.copy(car.pos); car.updateQuat(); car.prevQ.copy(car.q); car.grounded = !!(a[14] & 1); this.hist.clear();
    if (!this.world.isArena) car.si = Math.floor(this.world.locate(car.pos, 0, true));
  }
  stepClient() {
    const me = this.me, racing = this.state === 'racing';
    for (const o of this.obstacles) o.update(this.simT, DT);
    this.world.update(this.simT, DT);
    if (me && !me.out) {
      const inp = this.inputFor(me), pi = me.prevInp;
      me.frozen = !racing && this.state !== 'done';
      const rsEdge = inp.rs && !pi.rs && racing;
      if (rsEdge && !me.finished) this.respawn(me);
      pi.rs = inp.rs;
      stepCar(me, me.finished ? ZERO_INP : inp, DT, this.world, this.simT);
      if (me.wantRespawn) this.respawn(me);
      for (const o of this.obstacles) o.touch(me, this.simT);
      for (const c of this.cars) if (c !== me) collideCars(me, c, true, null);
      if (me.roll > 0) me.roll -= DT;
      this.seq++;
      this.hist.set(this.seq, (this.hist.get(this.seq - 150) || new THREE.Vector3()).copy(me.pos)); this.hist.delete(this.seq - 150);
      if (this.seq % 2 === 0) this.session.send({ k: 'in', q: this.seq, i: [inp.th, r2(inp.st), (inp.dr ? 1 : 0) | (inp.it ? 2 : 0) | (inp.rs ? 4 : 0) | (inp.hn ? 8 : 0), inp.ty] });
      this.drainCar(me);
    }
    if (racing) this.raceT += DT;
  }
  interpRemote(car, now) {
    const buf = car.buf; if (!buf || !buf.length) return;
    const rt = now - 0.11;
    let a = buf[0], b = buf[buf.length - 1];
    for (let i = buf.length - 1; i > 0; i--) if (buf[i - 1].t <= rt) { a = buf[i - 1]; b = buf[i]; break; }
    const k = b.t > a.t ? clamp((rt - a.t) / (b.t - a.t), 0, 1.5) : 1;
    const L = (x, y) => x + (y - x) * k;
    car.pos.set(L(a.p[0], b.p[0]), L(a.p[1], b.p[1]), L(a.p[2], b.p[2]));
    car.vel.set(b.v[0], b.v[1], b.v[2]);
    car.fwd.set(L(a.f[0], b.f[0]), L(a.f[1], b.f[1]), L(a.f[2], b.f[2])).normalize();
    car.up.set(L(a.u[0], b.u[0]), L(a.u[1], b.u[1]), L(a.u[2], b.u[2])).normalize();
    car.fwd.addScaledVector(car.up, -car.fwd.dot(car.up)).normalize();
    car.updateQuat();
    const fl = b.fl;
    car.steer = b.steer; car.grounded = !!(fl & 1); car.drifting = !!(fl & 2); car.driftDir = b.dd; car.boostT = fl & 4 ? 0.2 : 0; car.shield = fl & 8 ? 1 : 0;
    if ((fl & 16) && car.spinT <= 0) { car.spinT = car.spinDur = 0.9; } else if (!(fl & 16)) car.spinT = 0;
    car.invulnT = fl & 32 ? 0.2 : 0; car.slipOn = !!(fl & 256); car.slowT = fl & 512 ? 0.2 : 0;
    car.driftCharge = [0, TUNE.driftLevels[0], TUNE.driftLevels[1], TUNE.driftLevels[2]][b.dl] || 0;
    car.trkP = b.tp; car.trkY = b.ty;
  }

  // ------------------------------------------------------------------ rendering
  render(alpha, dt) {
    const now = performance.now() / 1000, t = this.simT + (this.paused ? 0 : this.acc);
    const view = this.viewCar(), me = this.me;
    for (const car of this.cars) {
      if (car.remote) { this.interpRemote(car, now); if (car.spinT > 0) car.spinT -= dt; }
      car.updateVisual(alpha, dt, this.time);
      if (!this.paused) this.fx.carFx(car, dt, DRIFT_COLORS);
    }
    // time-trial ghost: record + playback at 20 Hz
    if (this.mode === 'trial' && me && this.state === 'racing' && me.lap > 0) {
      const lt = this.raceT - me.lapStart, idx = Math.floor(lt * 20);
      while (this.rec.length <= idx && this.rec.length < 4000) {
        const p = me.mesh.position, q = me.mesh.quaternion;
        this.rec.push([r2(p.x), r2(p.y), r2(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w)]);
      }
      const g = this.ghost;
      if (g && g.data) {
        const fi = lt * 20, i0 = Math.floor(fi), d = g.data;
        if (i0 + 1 < d.length) {
          const a = d[i0], b = d[i0 + 1], k = fi - i0;
          g.mesh.visible = true; g.mesh.position.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
          g.mesh.quaternion.set(a[3], a[4], a[5], a[6]).slerp(_q.set(b[3], b[4], b[5], b[6]), k);
        } else g.mesh.visible = false;
      }
    }
    if (this.bombMesh) {
      const h = this.carById(this.ms.bomb);
      this.bombMesh.visible = !!h && !h.out;
      if (h) { this.bombMesh.position.copy(h.mesh.position).addScaledVector(YUP, 2.6 + Math.sin(this.time * 12) * 0.12); this.bombMesh.scale.setScalar(1 + (this.ms.bombT < 5 ? Math.sin(this.time * 20) * 0.15 : 0)); }
    }
    this.items.render(t);
    if (view) {
      this.rig.update(view, dt, (this.state === 'done' && view === me) || (me && me.finished && this.mode === 'gauntlet') ? 'orbit' : 'chase');
      const sf = view.speed / TUNE.maxSpeed;
      this.fx.speedLines.update(dt, view.slipOn ? 1 : view.boostT > 0 ? 0.9 : clamp((sf - 0.88) * 5, 0, 0.7), view.slipOn ? 0xaee6ff : 0xffffff);
      this.env.follow(this.camera.position);
      if (view === me && !this.paused) audio.updateEngine(sf, this.localInp ? this.localInp.th : 0, me.drifting && me.grounded, me.boostT > 0);
    }
    // sandstorm / wind visuals
    this.stormS += (this.stormK - this.stormS) * Math.min(1, dt * 2.5); this.stormK = 0;
    if (this.theme.sandstorm) { this.env.setStorm(this.stormS); if (this.fx.sand) this.fx.sand.mat.opacity = this.stormS * 0.8; }
    this.windK = Math.max(0, this.windK - dt * 2);
    this.fx.update(dt, this.time);
  }

  dispose() {
    audio.stopEngine();
    this.camera.remove(this.fx.speedLines.lines);
    this.scene.remove(this.camera);
    this.camera.up.set(0, 1, 0);
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (m.map) m.map.dispose(); m.dispose(); }
    });
    this.fx.speedLines.lines.geometry.dispose(); this.fx.speedLines.mat.dispose();
  }
}

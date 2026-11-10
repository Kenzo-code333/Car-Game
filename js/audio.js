// Fully synthesized audio: engine, SFX and per-world music loops (Web Audio API).
import { save } from './save.js';

const MUSIC = {
  menu:    { bpm: 96,  root: 45, scale: [0, 2, 4, 7, 9],        prog: [0, 3, 4, 2], bass: 'triangle', lead: 'sine',     kick: [1, 0, 0, 0, 1, 0, 0, 0], hat: 0.25, arp: [0, 2, 4, 2, 1, 2, 4, 2] },
  neon:    { bpm: 112, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 4], bass: 'sawtooth', lead: 'square',   kick: [1, 0, 0, 0, 1, 0, 0, 0], hat: 0.5,  arp: [0, 2, 4, 2, 0, 2, 4, 6] },
  desert:  { bpm: 102, root: 43, scale: [0, 1, 4, 5, 7, 8, 10], prog: [0, 1, 0, 4], bass: 'triangle', lead: 'sawtooth', kick: [1, 0, 0, 1, 0, 0, 1, 0], hat: 0.4,  arp: [0, 1, 2, 4, 2, 1, 0, 4] },
  frozen:  { bpm: 98,  root: 48, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 4, 5, 3], bass: 'sine',     lead: 'triangle', kick: [1, 0, 0, 0, 0, 0, 1, 0], hat: 0.3,  arp: [4, 2, 0, 2, 4, 6, 4, 2] },
  volcano: { bpm: 128, root: 40, scale: [0, 2, 3, 5, 7, 8, 11], prog: [0, 0, 5, 4], bass: 'sawtooth', lead: 'sawtooth', kick: [1, 0, 1, 0, 1, 0, 1, 0], hat: 0.6,  arp: [0, 0, 2, 0, 4, 0, 2, 3] },
  sky:     { bpm: 120, root: 47, scale: [0, 2, 4, 6, 7, 9, 11], prog: [0, 1, 4, 3], bass: 'triangle', lead: 'triangle', kick: [1, 0, 0, 0, 1, 0, 0, 1], hat: 0.45, arp: [0, 2, 4, 6, 4, 2, 4, 2] },
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const audio = {
  ctx: null, ready: false, engine: null, musicId: null, wantMusic: null,
  init() {
    const unlock = () => { this.ensure(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  },
  ensure() {
    if (this.ready) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain(); this.master.connect(ctx.destination);
      this.sfxG = ctx.createGain(); this.sfxG.connect(this.master);
      this.musG = ctx.createGain(); this.musG.connect(this.master);
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.ready = true;
      this.applyVolumes();
      if (this.wantMusic) this.music(this.wantMusic);
    } catch (e) { this.ready = false; }
    return this.ready;
  },
  applyVolumes() {
    if (!this.ready) return;
    const s = save.data.settings;
    this.master.gain.value = s.master;
    this.sfxG.gain.value = s.sfx;
    this.musG.gain.value = s.music * 0.6;
  },
  tone(freq, dur, type = 'square', vol = 0.2, slide = 0, delay = 0, dest = null) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxG);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.3, f0 = 1200, f1 = 0, delay = 0, type = 'lowpass', dest = null) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfxG);
    src.start(t, Math.random()); src.stop(t + dur + 0.02);
  },
  sfx(name, a = 1) {
    if (!this.ready) return;
    switch (name) {
      case 'beep': this.tone(440, 0.18, 'square', 0.22); break;
      case 'go': this.tone(880, 0.5, 'square', 0.25); this.tone(1320, 0.5, 'triangle', 0.15); break;
      case 'boost': this.noise(0.6, 0.3, 400, 4000); this.tone(180, 0.5, 'sawtooth', 0.14, 720); break;
      case 'boost2': this.noise(0.9, 0.35, 300, 6000); this.tone(140, 0.8, 'sawtooth', 0.18, 980); break;
      case 'hit': this.noise(0.3, 0.5 * a, 900, 120); this.tone(120, 0.25, 'square', 0.2 * a, 50); break;
      case 'wall': this.noise(0.12, 0.25 * a, 700, 200); break;
      case 'land': this.noise(0.15, 0.3 * a, 300, 80); this.tone(80, 0.15, 'sine', 0.3 * a, 40); break;
      case 'pick': [660, 880, 1100].forEach((f, i) => this.tone(f, 0.09, 'square', 0.14, 0, i * 0.06)); break;
      case 'tick': this.tone(1200, 0.03, 'square', 0.07); break;
      case 'itemget': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.2, 0, i * 0.07)); break;
      case 'coin': this.tone(1318, 0.07, 'square', 0.12); this.tone(1760, 0.16, 'square', 0.12, 0, 0.06); break;
      case 'shock': this.noise(0.5, 0.5, 200, 3000); this.tone(90, 0.5, 'sawtooth', 0.3, 30); break;
      case 'shield': this.tone(520, 0.4, 'sine', 0.2, 1040); this.tone(780, 0.4, 'sine', 0.12, 1560); break;
      case 'block': this.tone(900, 0.2, 'triangle', 0.25, 300); this.noise(0.15, 0.2, 3000, 800); break;
      case 'glue': this.tone(200, 0.25, 'sine', 0.3, 80); this.noise(0.2, 0.15, 500, 200); break;
      case 'mine': this.tone(300, 0.1, 'square', 0.15); this.tone(600, 0.1, 'square', 0.15, 0, 0.1); break;
      case 'drift1': this.tone(660, 0.1, 'triangle', 0.15); break;
      case 'drift2': this.tone(880, 0.1, 'triangle', 0.17); break;
      case 'drift3': this.tone(1175, 0.14, 'triangle', 0.2); break;
      case 'trick': [523, 784, 1046].forEach((f, i) => this.tone(f, 0.1, 'triangle', 0.18, 0, i * 0.05)); break;
      case 'respawn': this.tone(300, 0.3, 'sine', 0.2, 900); break;
      case 'lap': [659, 784, 988].forEach((f, i) => this.tone(f, 0.14, 'square', 0.16, 0, i * 0.1)); break;
      case 'finish': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.25, 'square', 0.18, 0, i * 0.12)); break;
      case 'elim': this.noise(0.7, 0.5, 2000, 100); this.tone(400, 0.6, 'sawtooth', 0.2, 60); break;
      case 'ui': this.tone(700, 0.05, 'triangle', 0.12); break;
      case 'buy': [880, 1108, 1318, 1760].forEach((f, i) => this.tone(f, 0.1, 'square', 0.13, 0, i * 0.06)); break;
      case 'deny': this.tone(160, 0.2, 'square', 0.15, 110); break;
      case 'warn': this.tone(980, 0.08, 'square', 0.1); break;
      case 'star': this.tone(1318, 0.3, 'triangle', 0.2, 1976); break;
    }
  },
  horn(id) {
    if (!this.ready) return;
    if (id === 'duck') { this.tone(900, 0.12, 'sawtooth', 0.2, 500); this.tone(950, 0.14, 'sawtooth', 0.2, 480, 0.16); }
    else if (id === 'laser') { this.tone(1800, 0.3, 'sawtooth', 0.18, 200); }
    else if (id === 'fanfare') { [523, 523, 784].forEach((f, i) => this.tone(f, i === 2 ? 0.35 : 0.1, 'square', 0.18, 0, i * 0.12)); }
    else { this.tone(392, 0.14, 'square', 0.2); this.tone(392, 0.2, 'square', 0.2, 0, 0.2); }
  },
  // ---- Engine ----
  startEngine() {
    if (!this.ready || this.engine) return;
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'square';
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 2;
    const g = ctx.createGain(); g.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(this.sfxG);
    const sk = ctx.createBufferSource(); sk.buffer = this.noiseBuf; sk.loop = true;
    const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1900; sf.Q.value = 3;
    const sg = ctx.createGain(); sg.gain.value = 0;
    sk.connect(sf); sf.connect(sg); sg.connect(this.sfxG);
    o1.start(); o2.start(); sk.start();
    this.engine = { o1, o2, f, g, sk, sg };
  },
  updateEngine(sf, throttle, drifting, boosting) {
    const e = this.engine; if (!e) return;
    const t = this.ctx.currentTime;
    const x = Math.min(1.25, Math.max(0, sf));
    const gear = Math.min(4, Math.floor(x * 5)), within = x * 5 - gear;
    const rpm = 0.3 + 0.7 * Math.min(1, within);
    const freq = 52 + rpm * 95 + gear * 9 + (boosting ? 22 : 0);
    e.o1.frequency.setTargetAtTime(freq, t, 0.04);
    e.o2.frequency.setTargetAtTime(freq * 0.5, t, 0.04);
    e.f.frequency.setTargetAtTime(350 + rpm * 1300 + (throttle > 0 ? 500 : 0), t, 0.05);
    e.g.gain.setTargetAtTime(0.07 + (throttle > 0 ? 0.05 : 0) + (boosting ? 0.03 : 0), t, 0.05);
    e.sg.gain.setTargetAtTime(drifting ? 0.11 : 0, t, 0.05);
  },
  stopEngine() {
    const e = this.engine; if (!e) return;
    try { e.o1.stop(); e.o2.stop(); e.sk.stop(); } catch (err) { /* ignore */ }
    try { e.g.disconnect(); e.sg.disconnect(); } catch (err) { /* ignore */ }
    this.engine = null;
  },
  muteEngine() {
    const e = this.engine; if (!e) return;
    const t = this.ctx.currentTime;
    e.g.gain.setTargetAtTime(0, t, 0.03); e.sg.gain.setTargetAtTime(0, t, 0.03);
  },
  // ---- Music ----
  music(id) {
    this.wantMusic = id;
    if (!this.ready) return;
    if (this.musicId === id) return;
    this.stopMusic();
    if (!id || !MUSIC[id]) return;
    this.musicId = id;
    const m = MUSIC[id];
    const stepDur = 60 / m.bpm / 2;   // 8th notes
    let step = 0, next = this.ctx.currentTime + 0.1;
    const deg = (d, oct = 0) => m.root + m.scale[((d % m.scale.length) + m.scale.length) % m.scale.length] + 12 * (oct + Math.floor(d / m.scale.length));
    const tick = () => {
      if (!this.ready || this.ctx.state !== 'running') { next = this.ctx ? this.ctx.currentTime + 0.1 : 0; return; }
      while (next < this.ctx.currentTime + 0.2) {
        const delay = Math.max(0, next - this.ctx.currentTime);
        const bar = Math.floor(step / 8) % m.prog.length, s8 = step % 8;
        const chord = m.prog[bar];
        // bass
        if (s8 % 2 === 0 || s8 === 7) this.tone(mtof(deg(chord, -1)), stepDur * 0.9, m.bass, 0.16, 0, delay, this.musG);
        // arp / lead
        const a = m.arp[s8];
        this.tone(mtof(deg(chord + a, 1)), stepDur * 0.8, m.lead, 0.05, 0, delay, this.musG);
        if (s8 === 0) this.tone(mtof(deg(chord + 2, 0)), stepDur * 7, 'triangle', 0.04, 0, delay, this.musG);
        // drums
        if (m.kick[s8]) this.tone(120, 0.16, 'sine', 0.3, 40, delay, this.musG);
        if (s8 === 2 || s8 === 6) this.noise(0.1, 0.12, 1800, 600, delay, 'bandpass', this.musG);
        if (Math.random() < m.hat || s8 % 2 === 1) this.noise(0.03, 0.05, 7000, 0, delay, 'highpass', this.musG);
        step++; next += stepDur;
      }
    };
    this.musicTimer = setInterval(tick, 60);
  },
  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null; this.musicId = null;
  },
};

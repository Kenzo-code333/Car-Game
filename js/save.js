// Persistent progress (localStorage, always wrapped in try/catch).
const KEY = 'nitroRush.save.v1';

const defaults = () => ({
  name: 'Racer' + Math.floor(100 + Math.random() * 900),
  coins: 0,
  stars: {},            // levelId -> 0..3
  best: {},             // levelId -> best time (gauntlet) or best lap (trial)
  owned: { paint: ['cherry', 'ocean', 'lime', 'sun'], wheel: ['classic'], trail: ['flame'], horn: ['beep'] },
  equip: { paint: 'cherry', wheel: 'classic', trail: 'flame', horn: 'beep' },
  settings: { quality: 'medium', master: 0.8, music: 0.5, sfx: 0.8, shake: true },
});

function merge(base, extra) {
  for (const k in extra) {
    if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && base[k] && typeof base[k] === 'object') merge(base[k], extra[k]);
    else base[k] = extra[k];
  }
  return base;
}

export const save = {
  data: defaults(),
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) merge(this.data, JSON.parse(raw));
    } catch (e) { /* storage unavailable: play with defaults */ }
    return this.data;
  },
  persist() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  },
  reset() {
    const name = this.data.name, settings = this.data.settings;
    this.data = defaults();
    this.data.name = name; this.data.settings = settings;
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('nitroRush.ghost.')) localStorage.removeItem(k);
      }
    } catch (e) { /* ignore */ }
    this.persist();
  },
  totalStars() {
    let n = 0;
    for (const k in this.data.stars) n += this.data.stars[k];
    return n;
  },
  addCoins(n) { this.data.coins = Math.max(0, Math.round(this.data.coins + n)); this.persist(); },
  getGhost(id) {
    try { const raw = localStorage.getItem('nitroRush.ghost.' + id); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  },
  setGhost(id, ghost) {
    try { localStorage.setItem('nitroRush.ghost.' + id, JSON.stringify(ghost)); } catch (e) { /* ignore */ }
  },
};

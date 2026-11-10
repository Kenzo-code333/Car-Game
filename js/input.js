// Keyboard + Gamepad input. poll() returns a fresh input state each frame.
const keys = new Set();
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyH']);

export const input = {
  enabled: false,       // true while a game is running (prevents page scrolling etc.)
  onPause: null,
  padName: null,
  _padStart: false,
  init() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Escape') { if (this.onPause) this.onPause(); e.preventDefault(); return; }
      if (this.enabled && GAME_KEYS.has(e.code)) e.preventDefault();
      keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => keys.clear());
    window.addEventListener('gamepadconnected', (e) => { this.padName = e.gamepad.id; });
    window.addEventListener('gamepaddisconnected', () => { this.padName = null; });
  },
  poll() {
    const k = (c) => keys.has(c);
    const up = k('KeyW') || k('ArrowUp'), down = k('KeyS') || k('ArrowDown');
    const left = k('KeyA') || k('ArrowLeft'), right = k('KeyD') || k('ArrowRight');
    const s = {
      th: (up ? 1 : 0) - (down ? 1 : 0),
      st: (right ? 1 : 0) - (left ? 1 : 0),
      ty: (up ? 1 : 0) - (down ? 1 : 0),
      dr: k('Space'),
      it: k('ShiftLeft') || k('ShiftRight'),
      rs: k('KeyR'),
      hn: k('KeyH'),
    };
    let pad = null;
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) if (p && p.connected) { pad = p; break; }
    } catch (e) { pad = null; }
    if (pad) {
      const b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
      const v = (i) => (pad.buttons[i] ? pad.buttons[i].value : 0);
      const dead = (x) => (Math.abs(x) < 0.15 ? 0 : (x - Math.sign(x) * 0.15) / 0.85);
      const ax = dead(pad.axes[0] || 0), ay = dead(pad.axes[1] || 0);
      const gas = v(7), brake = v(6);
      if (Math.abs(ax) > Math.abs(s.st)) s.st = ax;
      if (b(14)) s.st = -1; if (b(15)) s.st = 1;
      if (gas - brake !== 0 && s.th === 0) s.th = gas - brake;
      if (Math.abs(ay) > 0.5 && s.ty === 0) s.ty = -Math.sign(ay);
      s.dr = s.dr || b(0) || b(5);
      s.it = s.it || b(2) || b(1);
      s.rs = s.rs || b(3);
      s.hn = s.hn || b(4);
      const start = b(9);
      if (start && !this._padStart && this.onPause) this.onPause();
      this._padStart = start;
    }
    return s;
  },
};

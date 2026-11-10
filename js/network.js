// Multiplayer over PeerJS (WebRTC data channels). Host-authoritative: the host owns the lobby and the simulation;
// clients send inputs and receive ~20 Hz snapshots. Add ?net=local to the URL to use a BroadcastChannel transport
// instead (two tabs on one computer, no internet needed) - handy for testing.
import { PAINTS } from './config.js';

const PREFIX = 'nitrorush-v1-';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const useLocal = () => new URLSearchParams(location.search).get('net') === 'local';
export const makeCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
export const netAvailable = () => useLocal() || typeof window.Peer !== 'undefined';

// ---- transports: both expose conn = { send(obj), close(), onData, onClose } ----
function peerConn(c) {
  const conn = { send: (o) => { try { if (c.open) c.send(o); } catch (e) { /* dropped */ } }, close: () => { try { c.close(); } catch (e) { /* */ } }, onData: null, onClose: null, closed: false };
  c.on('data', (d) => conn.onData && conn.onData(d));
  const closed = () => { if (!conn.closed) { conn.closed = true; if (conn.onClose) conn.onClose(); } };
  c.on('close', closed); c.on('error', closed);
  return conn;
}
function hostPeer(code, cb) {
  let peer;
  try { peer = new window.Peer(PREFIX + code, { debug: 0 }); } catch (e) { cb.onError('Could not start networking.'); return { destroy() {} }; }
  peer.on('open', () => cb.onOpen());
  peer.on('connection', (c) => { c.on('open', () => cb.onConn(peerConn(c))); });
  peer.on('error', (e) => cb.onError(e.type === 'unavailable-id' ? 'retry' : e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error'
    ? 'Could not reach the matchmaking server. Check your internet connection.' : null, e));
  peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* */ } });
  return { destroy: () => { try { peer.destroy(); } catch (e) { /* */ } } };
}
function clientPeer(code, cb) {
  let peer, done = false;
  const fail = (msg) => { if (!done) { done = true; cb.onError(msg); try { peer.destroy(); } catch (e) { /* */ } } };
  try { peer = new window.Peer(undefined, { debug: 0 }); } catch (e) { cb.onError('Could not start networking.'); return { destroy() {} }; }
  const timer = setTimeout(() => fail('Timed out connecting to room ' + code + '. The host may be behind a strict firewall.'), 15000);
  peer.on('open', () => {
    const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
    c.on('open', () => { if (done) return; done = true; clearTimeout(timer); cb.onOpen(peerConn(c)); });
    c.on('error', () => fail('Connection to the host failed.'));
  });
  peer.on('error', (e) => { clearTimeout(timer); fail(e.type === 'peer-unavailable' ? 'Room ' + code + ' was not found. Check the code and try again.'
    : 'Could not reach the matchmaking server. Check your internet connection.'); });
  return { destroy: () => { clearTimeout(timer); try { peer.destroy(); } catch (e) { /* */ } } };
}
// BroadcastChannel versions (same-browser testing)
function hostLocal(code, cb) {
  const ch = new BroadcastChannel(PREFIX + code), conns = new Map();
  ch.onmessage = (ev) => {
    const m = ev.data;
    if (m.to !== 'host') return;
    if (m.t === 'conn') {
      if (!conns.has(m.from)) {
        const conn = { send: (o) => ch.postMessage({ t: 'data', to: m.from, d: o }), close: () => { ch.postMessage({ t: 'bye', to: m.from }); conns.delete(m.from); }, onData: null, onClose: null };
        conns.set(m.from, conn); cb.onConn(conn);
      }
      ch.postMessage({ t: 'ack', to: m.from });
    } else if (m.t === 'data') { const c = conns.get(m.from); if (c && c.onData) c.onData(m.d); }
    else if (m.t === 'bye') { const c = conns.get(m.from); if (c) { conns.delete(m.from); if (c.onClose) c.onClose(); } }
  };
  setTimeout(() => cb.onOpen(), 30);
  return { destroy: () => { for (const id of conns.keys()) ch.postMessage({ t: 'bye', to: id }); ch.close(); } };
}
function clientLocal(code, cb) {
  const ch = new BroadcastChannel(PREFIX + code), id = 'c' + Math.random().toString(36).slice(2, 8);
  let open = false, tries = 0;
  const conn = { send: (o) => ch.postMessage({ t: 'data', to: 'host', from: id, d: o }), close: () => { ch.postMessage({ t: 'bye', to: 'host', from: id }); ch.close(); }, onData: null, onClose: null };
  const iv = setInterval(() => {
    if (open) return clearInterval(iv);
    if (++tries > 10) { clearInterval(iv); ch.close(); return cb.onError('Room ' + code + ' was not found. Check the code and try again.'); }
    ch.postMessage({ t: 'conn', to: 'host', from: id });
  }, 150);
  ch.onmessage = (ev) => {
    const m = ev.data; if (m.to !== id) return;
    if (m.t === 'ack' && !open) { open = true; cb.onOpen(conn); }
    else if (m.t === 'data') { if (conn.onData) conn.onData(m.d); }
    else if (m.t === 'bye') { if (conn.onClose) conn.onClose(); }
  };
  window.addEventListener('pagehide', () => { try { conn.close(); } catch (e) { /* */ } });
  return { destroy: () => { clearInterval(iv); try { conn.close(); } catch (e) { /* */ } } };
}

// ---- session: lobby state + message routing ----
export class Session {
  constructor() {
    this.isHost = false; this.code = ''; this.myId = 0; this.players = []; this.inGame = false; this.closed = false;
    this.settings = { mode: 'race', world: 'neon', laps: 3, bots: 3, diff: 1 };
    this.on = {};      // lobby, emoji, start, snap, input, end, left, closed, back
    this.conns = new Map(); this.transport = null;
  }
  fire(name, ...a) { if (this.on[name]) this.on[name](...a); }
  link() { const u = new URL(location.href); u.searchParams.set('room', this.code); u.hash = ''; return u.toString(); }

  static host(name, cos) {
    return new Promise((resolve, reject) => {
      const s = new Session(); s.isHost = true; s.myId = 0;
      s.players = [{ id: 0, name, cos, ready: true, host: true }];
      let tries = 0;
      const open = () => {
        s.code = makeCode();
        s.transport = (useLocal() ? hostLocal : hostPeer)(s.code, {
          onOpen: () => resolve(s),
          onConn: (conn) => s._hostConn(conn),
          onError: (msg) => {
            if (msg === 'retry' && tries++ < 5) { s.transport.destroy(); open(); }
            else if (msg) { if (!s.code || !s._opened) reject(new Error(msg)); }
          },
        });
      };
      if (!netAvailable()) return reject(new Error('Multiplayer library failed to load. Check your connection and reload.'));
      open(); s._opened = false;
      const r0 = resolve; resolve = (v) => { s._opened = true; r0(v); };
    });
  }
  static join(code, name, cos) {
    return new Promise((resolve, reject) => {
      if (!netAvailable()) return reject(new Error('Multiplayer library failed to load. Check your connection and reload.'));
      const s = new Session(); s.code = code;
      let settled = false;
      s.transport = (useLocal() ? clientLocal : clientPeer)(code, {
        onOpen: (conn) => {
          s.conn = conn;
          conn.onData = (m) => {
            if (m.k === 'welcome') { s.myId = m.id; if (!settled) { settled = true; resolve(s); } }
            else if (m.k === 'reject') { if (!settled) { settled = true; reject(new Error(m.why)); } s.close(true); }
            else s._clientMsg(m);
          };
          conn.onClose = () => { if (!settled) { settled = true; reject(new Error('The host closed the connection.')); } else if (!s.closed) { s.closed = true; s.fire('closed', 'Lost connection to the host.'); } };
          conn.send({ k: 'hello', name, cos });
        },
        onError: (msg) => { if (!settled) { settled = true; reject(new Error(msg)); } },
      });
    });
  }

  // host side
  _hostConn(conn) {
    let pid = -1;
    conn.onData = (m) => {
      if (m.k === 'hello' && pid < 0) {
        if (this.inGame) { conn.send({ k: 'reject', why: 'That game is already in progress. Try again when it returns to the lobby.' }); return; }
        if (this.players.length >= 6) { conn.send({ k: 'reject', why: 'That room is full (6 players).' }); return; }
        for (pid = 1; this.players.some((p) => p.id === pid); pid++);
        const used = new Set(this.players.map((p) => p.cos.paint));
        const cos = { ...m.cos };
        if (used.has(cos.paint)) cos.paint = (PAINTS.find((p) => !used.has(p.id)) || PAINTS[0]).id;
        this.players.push({ id: pid, name: String(m.name || 'Racer').slice(0, 14), cos, ready: false, host: false });
        this.conns.set(pid, conn);
        conn.send({ k: 'welcome', id: pid });
        this.pushLobby();
      } else if (pid < 0) return;
      else if (m.k === 'ready') { const p = this.players.find((x) => x.id === pid); if (p) { p.ready = !!m.v; this.pushLobby(); } }
      else if (m.k === 'cos') { const p = this.players.find((x) => x.id === pid); if (p) { p.cos = { ...p.cos, ...m.cos }; this.pushLobby(); } }
      else if (m.k === 'emoji') { this.broadcast({ k: 'emoji', id: pid, e: String(m.e).slice(0, 4) }); this.fire('emoji', pid, m.e); }
      else if (m.k === 'in') this.fire('input', pid, m);
    };
    conn.onClose = () => {
      if (pid < 0) return;
      this.conns.delete(pid);
      this.players = this.players.filter((p) => p.id !== pid);
      this.fire('left', pid);
      this.pushLobby();
    };
  }
  pushLobby() {
    const m = { k: 'lobby', players: this.players, settings: this.settings };
    if (this.isHost) { this.broadcast(m); this.fire('lobby'); }
  }
  broadcast(m) { for (const c of this.conns.values()) c.send(m); }
  send(m) { if (this.conn) this.conn.send(m); }
  // client side
  _clientMsg(m) {
    if (m.k === 'lobby') { this.players = m.players; this.settings = m.settings; this.fire('lobby'); }
    else if (m.k === 'emoji') this.fire('emoji', m.id, m.e);
    else if (m.k === 'start') this.fire('start', m.o);
    else if (m.k === 'snap') this.fire('snap', m);
    else if (m.k === 'end') this.fire('end', m.res);
    else if (m.k === 'back') this.fire('back');
  }
  // shared lobby actions
  setReady(v) { const me = this.players.find((p) => p.id === this.myId); if (me) me.ready = v; if (this.isHost) this.pushLobby(); else this.send({ k: 'ready', v }); }
  setCos(cos) {
    const me = this.players.find((p) => p.id === this.myId);
    if (me) me.cos = { ...me.cos, ...cos };
    if (this.isHost) this.pushLobby(); else this.send({ k: 'cos', cos });
  }
  emoji(e) { if (this.isHost) { this.broadcast({ k: 'emoji', id: 0, e }); this.fire('emoji', 0, e); } else this.send({ k: 'emoji', e }); }
  close(silent) {
    this.closed = true;
    try { if (this.conn) this.conn.close(); } catch (e) { /* */ }
    try { if (this.transport) this.transport.destroy(); } catch (e) { /* */ }
    if (!silent) this.on = {};
  }
}

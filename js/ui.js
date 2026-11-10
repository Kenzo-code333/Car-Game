// All DOM UI: menus, lobby, garage, HUD, pause and results screens.
import { CATALOG, PAINTS, MODE_INFO, DIFF_NAMES, EMOJIS, ITEM_DEFS, ITEM_IDS, TUNE, DRIFT_COLORS, fmtTime, ordinal, clamp } from './config.js';
import { WORLDS, THEMES, GAUNTLETS, LEVELS, raceOf } from './levels/index.js';
import { save } from './save.js';
import { audio } from './audio.js';
import { input } from './input.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const stars = (n, max = 3) => '<span class="stars">' + '★'.repeat(n) + '<i>' + '★'.repeat(max - n) + '</i></span>';

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.root.innerHTML = `
      <div id="screens"></div>
      <div id="hud" class="hidden">
        <div class="hud-tl"><div id="h-pos"></div><div id="h-lap"></div><div id="h-board"></div></div>
        <div class="hud-tc"><div id="h-time"></div><div id="h-mode"></div></div>
        <canvas id="h-map" width="170" height="170"></canvas>
        <div class="hud-bl"><div id="h-item"><span id="h-item-icon"></span></div><div id="h-item-name"></div></div>
        <div class="hud-bc"><div id="h-boost"><div id="h-boost-fill"></div><i></i><i></i><i></i></div></div>
        <div class="hud-br"><span id="h-speed">0</span><small>km/h</small></div>
        <div id="h-count"></div>
        <div id="h-toasts"></div>
        <div id="h-wind" class="hidden">💨 WIND</div>
      </div>
      <div id="pause" class="overlay hidden"></div>
      <div id="modal" class="overlay hidden"></div>
      <div id="floaters"></div>`;
    this.screensEl = this.root.querySelector('#screens');
    this.hud = this.root.querySelector('#hud');
    this.el = {};
    for (const id of ['h-pos', 'h-lap', 'h-board', 'h-time', 'h-mode', 'h-map', 'h-item', 'h-item-icon', 'h-item-name', 'h-boost', 'h-boost-fill', 'h-speed', 'h-count', 'h-toasts', 'h-wind', 'pause', 'modal', 'floaters'])
      this.el[id] = this.root.querySelector('#' + id);
    this.current = null; this.setup = { mode: 'race', world: 'neon', laps: 3, bots: 5, diff: 1 };
    this.garageTab = 'paint'; this.hudT = 0; this.lastCount = ''; this.rollT = 0; this.rollI = 0;
    this.root.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a || a.classList.contains('disabled')) return;
      audio.ensure(); audio.sfx('ui');
      const fn = this.actions[a.dataset.act];
      if (fn) fn.call(this, a.dataset, a);
    });
    this.root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.set) { save.data.settings[t.dataset.set] = parseFloat(t.value); save.persist(); this.app.applySettings(); }
      if (t.id === 'name-input') { save.data.name = t.value.slice(0, 14) || 'Racer'; save.persist(); }
    });
    this.actions = this.makeActions();
  }

  // ------------------------------------------------------------------ screen management
  show(name, html) {
    const old = this.screensEl.querySelector('.screen.active');
    if (old) { old.classList.remove('active'); setTimeout(() => old.remove(), 320); }
    this.current = name;
    if (!name) return;
    const el = document.createElement('div');
    el.className = 'screen s-' + name; el.innerHTML = html;
    this.screensEl.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('active')));
    this.app.onScreen(name);
  }
  refresh(name, html) {       // re-render the current screen without the transition
    const el = this.screensEl.querySelector('.screen.s-' + name + ':last-child');
    if (el && this.current === name) el.innerHTML = html; else this.show(name, html);
  }
  wallet() { return `<div class="wallet"><span>🪙 ${save.data.coins}</span><span>★ ${save.totalStars()}</span></div>`; }
  back(to = 'main') { return `<button class="btn ghost back" data-act="go" data-to="${to}">◀ Back</button>`; }
  unlocked(w) { return save.totalStars() >= w.need; }

  main() {
    this.show('main', `
      <div class="title"><h1><span>NITRO</span> <b>RUSH</b></h1><p>Arcade racing · drift · boost · bump</p></div>
      ${this.wallet()}
      <div class="menu">
        <button class="btn big primary" data-act="go" data-to="solo">▶ Play Solo</button>
        <button class="btn big" data-act="host">📡 Host Game</button>
        <button class="btn big" data-act="go" data-to="join">🔗 Join Game</button>
        <button class="btn" data-act="go" data-to="garage">🔧 Garage</button>
        <div class="row"><button class="btn" data-act="go" data-to="controls">🎮 Controls</button><button class="btn" data-act="go" data-to="settings">⚙ Settings</button></div>
        <label class="name">Driver name <input id="name-input" maxlength="14" value="${esc(save.data.name)}"></label>
      </div>`);
  }
  solo() {
    const card = (m) => `<button class="card mode" data-act="mode" data-mode="${m}"><span class="icon">${MODE_INFO[m].icon}</span><h3>${MODE_INFO[m].name}</h3><p>${MODE_INFO[m].desc}</p></button>`;
    this.show('solo', `<h2>Choose a mode</h2>${this.back()}${this.wallet()}
      <div class="grid modes">${['race', 'gauntlet', 'trial', 'elim', 'potato', 'coins'].map(card).join('')}</div>`);
  }
  chips(key, opts, cur) {
    return `<div class="chips">${opts.map(([v, label, dis]) => `<button class="chip ${String(v) === String(cur) ? 'on' : ''} ${dis ? 'disabled' : ''}" data-act="set" data-key="${key}" data-val="${v}">${label}</button>`).join('')}</div>`;
  }
  worldCards(cur, act = 'set', all = false) {
    return `<div class="grid worlds">${WORLDS.map((w) => {
      const ok = all || this.unlocked(w), lv = this.setup.mode === 'potato' || this.setup.mode === 'coins' ? w.name.split(' ')[0] + ' Bowl' : raceOf(w.id).name;
      return `<button class="card world ${cur === w.id ? 'on' : ''} ${ok ? '' : 'disabled locked'}" style="--c:${THEMES[w.id].css}" data-act="${act}" data-key="world" data-val="${w.id}">
        <h3>${w.name}</h3><p>${ok ? lv : '🔒 Need ' + w.need + ' ★'}</p></button>`;
    }).join('')}</div>`;
  }
  setupHtml() {
    const s = this.setup, m = s.mode, info = MODE_INFO[m];
    const best = m === 'trial' ? save.data.best[raceOf(s.world).id] : null;
    return `<h2>${info.icon} ${info.name}</h2>${this.back('solo')}${this.wallet()}
      <div class="panel wide">
        <label>Track</label>${this.worldCards(s.world)}
        ${m === 'race' ? `<label>Laps</label>${this.chips('laps', [1, 2, 3, 4, 5].map((n) => [n, n]), s.laps)}` : ''}
        ${m !== 'trial' ? `<label>Rivals</label>${this.chips('bots', (m === 'race' ? [0, 1, 2, 3, 4, 5] : [2, 3, 4, 5]).map((n) => [n, n]), s.bots)}
        <label>Bot skill</label>${this.chips('diff', DIFF_NAMES.map((n, i) => [i, n]), s.diff)}` : `<p class="hint">Best lap: <b>${fmtTime(best)}</b>${best ? ' — your ghost will race with you.' : ' — set a lap to create a ghost.'}</p>`}
        <button class="btn big primary" data-act="startSolo">Start ▶</button>
      </div>`;
  }
  gauntlet() {
    const rows = WORLDS.map((w) => {
      const ok = this.unlocked(w);
      return `<div class="grow ${ok ? '' : 'locked'}" style="--c:${THEMES[w.id].css}"><div class="gname"><h3>${w.name}</h3><p>${ok ? w.blurb : '🔒 Earn ' + w.need + ' ★ to unlock'}</p></div>
        ${GAUNTLETS[w.id].map((l, i) => `<button class="card level ${ok ? '' : 'disabled'}" data-act="startGauntlet" data-id="${l.id}"><h4>${i + 1}. ${l.name}</h4>${stars(save.data.stars[l.id] || 0)}<small>${save.data.best[l.id] ? fmtTime(save.data.best[l.id]) : '—'}</small></button>`).join('')}</div>`;
    }).join('');
    this.show('gauntlet', `<h2>⭐ Gauntlet</h2>${this.back('solo')}${this.wallet()}<div class="panel wide scroll">${rows}</div>`);
  }
  garageHtml() {
    const tab = this.garageTab, d = save.data;
    const tabs = [['paint', 'Paint'], ['wheel', 'Wheels'], ['trail', 'Boost Trail'], ['horn', 'Horn']];
    const items = CATALOG[tab].map((it) => {
      const owned = d.owned[tab].includes(it.id), eq = d.equip[tab] === it.id;
      const sw = it.color != null ? `<span class="swatch" style="background:${hex(it.color)}"></span>` : `<span class="swatch txt">${tab === 'horn' ? '📯' : '🛞'}</span>`;
      return `<button class="card item ${eq ? 'on' : ''}" data-act="garageItem" data-id="${it.id}">${sw}<h4>${it.name}</h4><small>${eq ? 'Equipped' : owned ? 'Owned' : '🪙 ' + it.price}</small></button>`;
    }).join('');
    return `<h2>🔧 Garage</h2>${this.back()}${this.wallet()}
      <div class="panel side"><div class="chips">${tabs.map(([k, n]) => `<button class="chip ${k === tab ? 'on' : ''}" data-act="garageTab" data-tab="${k}">${n}</button>`).join('')}</div>
      <div class="grid items">${items}</div><p class="hint">Earn coins by racing, clearing gauntlets and grabbing coins on track.</p></div>`;
  }
  settingsHtml(inPause) {
    const s = save.data.settings;
    const slider = (k, label) => `<label>${label}</label><input type="range" min="0" max="1" step="0.05" value="${s[k]}" data-set="${k}">`;
    return `<label>Graphics quality</label>${this.chips('quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], s.quality)}
      ${slider('master', 'Master volume')}${slider('music', 'Music')}${slider('sfx', 'Sound effects')}
      <label>Camera shake</label>${this.chips('shake', [[1, 'On'], [0, 'Off']], s.shake ? 1 : 0)}
      ${inPause ? '' : '<button class="btn danger" data-act="resetSave">Reset progress</button>'}`;
  }
  settings() { this.show('settings', `<h2>⚙ Settings</h2>${this.back()}<div class="panel">${this.settingsHtml()}</div>`); }
  controlsHtml() {
    const row = (k, d, p) => `<tr><td>${k.split('|').map((x) => `<kbd>${x}</kbd>`).join(' ')}</td><td>${d}</td><td>${p}</td></tr>`;
    return `<table class="controls"><tr><th>Keyboard</th><th>Action</th><th>Gamepad</th></tr>
      ${row('W|↑', 'Accelerate', 'RT')}${row('S|↓', 'Brake / reverse', 'LT')}${row('A|D|←|→', 'Steer', 'Left stick')}
      ${row('Space', 'Drift (hold while turning, release for boost)', 'A / RB')}${row('Shift', 'Use item', 'X / B')}
      ${row('R', 'Respawn at last checkpoint', 'Y')}${row('H', 'Horn', 'LB')}${row('Esc', 'Pause', 'Start')}</table>
      <ul class="tips"><li><b>Drift boost:</b> sparks go <span style="color:#3aa0ff">blue</span> → <span style="color:#ff9a2e">orange</span> → <span style="color:#c04dff">purple</span>. Release for a bigger boost.</li>
      <li><b>Air tricks:</b> hold a direction while airborne to flip or spin. Land it cleanly for a mini-boost.</li>
      <li><b>Slipstream:</b> tuck in behind a rival for 2 seconds for a speed surge.</li>
      <li><b>Boost start:</b> hit accelerate just before GO!</li></ul>`;
  }
  controls() { this.show('controls', `<h2>🎮 Controls</h2>${this.back()}<div class="panel wide">${this.controlsHtml()}<p class="hint">${input.padName ? 'Gamepad connected: ' + esc(input.padName) : 'Plug in a gamepad and press any button to use it.'}</p></div>`); }
  join(code = '', error = '') {
    this.show('join', `<h2>🔗 Join Game</h2>${this.back()}<div class="panel">
      <label>Room code</label><input id="code-input" class="code" maxlength="4" placeholder="ABCD" value="${esc(code)}" autocomplete="off">
      ${error ? `<p class="error">${esc(error)}</p>` : ''}
      <button class="btn big primary" data-act="join">${error ? 'Retry' : 'Join'}</button>
      <p class="hint">Ask the host for their 4-letter code, or open their share link.</p></div>`);
    const inp = this.screensEl.querySelector('.screen:last-child #code-input');
    if (inp) { inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z]/g, ''); }); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.actions.join.call(this); }); }
  }
  busy(text) { this.show('busy', `<div class="panel center"><div class="spinner"></div><p>${esc(text)}</p></div>`); }
  error(title, msg, retry) {
    this.retryFn = retry;
    this.show('error', `<h2>${esc(title)}</h2><div class="panel center"><p class="error">${esc(msg)}</p>
      ${retry ? '<button class="btn big primary" data-act="retry">Try again</button>' : ''}<button class="btn" data-act="go" data-to="main">Main menu</button></div>`);
  }

  lobbyHtml() {
    const s = this.app.session, st = s.settings, me = s.players.find((p) => p.id === s.myId) || {};
    const plist = s.players.map((p) => `<div class="prow" data-pid="${p.id}"><span class="dot" style="background:${hex((PAINTS.find((x) => x.id === p.cos.paint) || PAINTS[0]).color)}"></span>
      <b>${esc(p.name)}</b>${p.host ? '<i class="tag">HOST</i>' : ''}${p.id === s.myId ? '<i class="tag you">YOU</i>' : ''}<span class="rdy ${p.ready ? 'yes' : ''}">${p.ready ? 'READY' : 'not ready'}</span></div>`).join('');
    const empty = Array.from({ length: Math.max(0, Math.min(6 - s.players.length, st.bots)) }, () => '<div class="prow bot"><span class="dot"></span><b>Bot</b><span class="rdy yes">CPU</span></div>').join('');
    const used = new Set(s.players.filter((p) => p.id !== s.myId).map((p) => p.cos.paint));
    const colors = PAINTS.filter((p) => save.data.owned.paint.includes(p.id)).map((p) => `<button class="swatch ${me.cos && me.cos.paint === p.id ? 'on' : ''} ${used.has(p.id) ? 'disabled' : ''}" style="background:${hex(p.color)}" data-act="lobbyColor" data-id="${p.id}" title="${p.name}"></button>`).join('');
    const modes = ['race', 'elim', 'potato', 'coins'];
    const settings = s.isHost ? `
      <label>Mode</label>${this.chips('lmode', modes.map((m) => [m, MODE_INFO[m].icon + ' ' + MODE_INFO[m].name]), st.mode)}
      <label>World</label>${this.chips('lworld', WORLDS.map((w) => [w.id, w.name]), st.world)}
      ${st.mode === 'race' ? `<label>Laps</label>${this.chips('llaps', [1, 2, 3, 4, 5].map((n) => [n, n]), st.laps)}` : ''}
      <label>Bots</label>${this.chips('lbots', [0, 1, 2, 3, 4, 5].map((n) => [n, n]), st.bots)}
      <label>Bot skill</label>${this.chips('ldiff', DIFF_NAMES.map((n, i) => [i, n]), st.diff)}`
      : `<div class="summary"><b>${MODE_INFO[st.mode].icon} ${MODE_INFO[st.mode].name}</b> · ${WORLDS.find((w) => w.id === st.world).name}${st.mode === 'race' ? ' · ' + st.laps + ' laps' : ''} · ${st.bots} bots (${DIFF_NAMES[st.diff]})<p class="hint">The host picks the settings.</p></div>`;
    const allReady = s.players.every((p) => p.ready);
    return `<h2>Lobby</h2><button class="btn ghost back" data-act="leaveLobby">◀ Leave</button>
      <div class="lobby">
        <div class="panel"><div class="room">Room <b>${s.code}</b><button class="btn small" data-act="copyLink">Copy link</button></div>
          <div class="plist">${plist}${empty}</div>
          <label>Your colour</label><div class="swatches">${colors}</div>
          <div class="emojis">${EMOJIS.map((e) => `<button class="emoji" data-act="emoji" data-e="${e}">${e}</button>`).join('')}</div></div>
        <div class="panel">${settings}
          ${s.isHost ? `<button class="btn big primary ${allReady ? '' : 'disabled'}" data-act="startMP">${allReady ? 'Start ▶' : 'Waiting for players…'}</button>`
    : `<button class="btn big ${me.ready ? '' : 'primary'}" data-act="ready">${me.ready ? 'Not ready' : 'Ready!'}</button>`}</div>
      </div>`;
  }
  lobby() { if (this.current === 'lobby') this.refresh('lobby', this.lobbyHtml()); else this.show('lobby', this.lobbyHtml()); }
  floatEmoji(pid, e) {
    const row = this.screensEl.querySelector(`.prow[data-pid="${pid}"]`), f = document.createElement('div');
    f.className = 'floater'; f.textContent = e;
    const r = row ? row.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0 };
    f.style.left = r.left + r.width * (0.5 + Math.random() * 0.3) + 'px'; f.style.top = r.top + 'px';
    this.el.floaters.appendChild(f); setTimeout(() => f.remove(), 1600);
    audio.sfx('tick');
  }

  results(res, ctx) {
    const mine = ctx.myId, rk = res.ranking, top = rk.slice(0, 3);
    let head = '', body = '';
    if (res.mode === 'gauntlet') {
      head = `<div class="bigstars">${[1, 2, 3].map((i) => `<span class="${i <= res.stars ? 'on' : ''}" style="animation-delay:${i * 0.35}s">★</span>`).join('')}</div>
        <p class="bigtime">${fmtTime(res.time)}</p><p class="hint">Respawns: ${res.respawns} · ★★★ under ${fmtTime(res.par[0])} with ≤1 respawn · ★★ under ${fmtTime(res.par[1])}</p>
        ${ctx.newBest ? '<p class="good">New best time!</p>' : ''}${ctx.unlocked ? `<p class="good">🔓 ${ctx.unlocked} unlocked!</p>` : ''}`;
    } else if (res.mode === 'trial') {
      head = `<p class="bigtime">${fmtTime(res.best)}</p><p class="hint">Best lap on ${esc(res.levelName)}</p>
        <div class="laps">${res.laps.map((t, i) => `<span>Lap ${i + 1}: ${fmtTime(t)}</span>`).join('') || '<span>No laps completed</span>'}</div>`;
    } else {
      const order = [1, 0, 2];
      head = `<div class="podium">${order.map((i) => top[i] ? `<div class="pod p${i + 1}" style="--c:${hex(top[i].color)};animation-delay:${[0.5, 0.9, 0.1][i]}s"><span class="pname">${esc(top[i].name)}</span><div class="bar"><b>${i + 1}</b></div></div>` : '<div class="pod"></div>').join('')}</div>`;
      body = `<div class="rank">${rk.map((r) => `<div class="rrow ${r.id === mine ? 'me' : ''}"><span>${ordinal(r.place)}</span><span class="dot" style="background:${hex(r.color)}"></span><b>${esc(r.name)}</b>
        <span>${res.mode === 'coins' ? '🪙 ' + r.coins : res.mode === 'race' ? (r.time != null ? fmtTime(r.time) : 'still racing') : r.out ? 'OUT' : 'WINNER'}</span></div>`).join('')}</div>`;
    }
    const awards = res.awards.length ? `<div class="awards">${res.awards.map((a, i) => `<div class="award" style="animation-delay:${1.2 + i * 0.25}s"><small>${a.title}</small><b style="color:${hex(a.color)}">${esc(a.name)}</b><span>${a.value}</span></div>`).join('')}</div>` : '';
    const btns = ctx.mp ? (ctx.host ? '<button class="btn big primary" data-act="backToLobby">Back to lobby</button>' : '<p class="hint">Waiting for the host…</p>') + '<button class="btn" data-act="leaveLobby">Leave</button>'
      : `<button class="btn big primary" data-act="retryGame">Retry</button>${ctx.next ? `<button class="btn big" data-act="startGauntlet" data-id="${ctx.next}">Next level ▶</button>` : ''}<button class="btn" data-act="quit">Menu</button>`;
    this.show('results', `<h2>${res.mode === 'gauntlet' ? esc(res.levelName) + ' cleared!' : res.mode === 'trial' ? 'Time Trial' : (rk[0] && rk[0].id === mine ? '🏆 You win!' : 'Results')}</h2>
      <div class="panel wide center">${head}${body}${awards}<p class="reward">+${ctx.reward} 🪙</p><div class="row">${btns}</div></div>`);
    if (res.mode === 'gauntlet') for (let i = 1; i <= res.stars; i++) setTimeout(() => audio.sfx('star'), i * 350);
  }

  pauseMenu(show, game) {
    const p = this.el.pause;
    p.classList.toggle('hidden', !show);
    if (!show) return;
    const solo = game.role === 'local';
    p.innerHTML = `<div class="panel"><h2>Paused</h2>
      <button class="btn big primary" data-act="resume">Resume</button>
      ${solo ? '<button class="btn" data-act="retryGame">Restart</button>' : '<p class="hint">Online games keep running while paused.</p>'}
      ${game.mode === 'trial' ? '<button class="btn" data-act="finishTrial">Finish session</button>' : ''}
      <details><summary>Settings</summary>${this.settingsHtml(true)}</details>
      <details><summary>Controls</summary>${this.controlsHtml()}</details>
      <button class="btn danger" data-act="${solo ? 'quit' : 'leaveLobby'}">${solo ? 'Quit to menu' : 'Leave game'}</button></div>`;
  }

  // ------------------------------------------------------------------ actions
  makeActions() {
    const app = this.app;
    return {
      go(d) { this.goto(d.to); },
      mode(d) { this.setup.mode = d.mode; if (d.mode === 'gauntlet') return this.gauntlet(); if (d.mode !== 'race' && this.setup.bots < 2) this.setup.bots = 3; this.show('setup', this.setupHtml()); },
      set(d) {
        const k = d.key, v = d.val;
        if (k === 'quality') { save.data.settings.quality = v; save.persist(); app.applySettings(); return this.rerenderSettings(); }
        if (k === 'shake') { save.data.settings.shake = v === '1'; save.persist(); return this.rerenderSettings(); }
        if (['lmode', 'lworld', 'llaps', 'lbots', 'ldiff'].includes(k)) {
          if (!app.session || !app.session.isHost) return;
          const st = app.session.settings, key = k.slice(1);
          st[key] = key === 'mode' || key === 'world' ? v : parseInt(v, 10);
          app.session.pushLobby(); return;
        }
        this.setup[k] = k === 'world' ? v : parseInt(v, 10);
        this.refresh('setup', this.setupHtml());
      },
      startSolo() { const s = this.setup; app.startSolo({ mode: s.mode, world: s.world, laps: s.laps, bots: s.mode === 'trial' ? 0 : s.bots, diff: s.diff }); },
      startGauntlet(d) { app.startSolo({ mode: 'gauntlet', levelId: d.id }); },
      garageTab(d) { this.garageTab = d.tab; this.refresh('garage', this.garageHtml()); },
      garageItem(d) {
        const tab = this.garageTab, it = CATALOG[tab].find((x) => x.id === d.id), sd = save.data;
        if (!sd.owned[tab].includes(it.id)) {
          if (sd.coins < it.price) { audio.sfx('deny'); return; }
          sd.coins -= it.price; sd.owned[tab].push(it.id); audio.sfx('buy');
        }
        sd.equip[tab] = it.id; save.persist();
        if (tab === 'horn') audio.horn(it.id);
        app.showroom.setCos(sd.equip);
        this.refresh('garage', this.garageHtml());
      },
      resetSave() { if (confirm('Reset all progress, coins and unlocks?')) { save.reset(); app.showroom.setCos(save.data.equip); this.main(); } },
      host() { app.hostGame(); },
      join() { const inp = this.screensEl.querySelector('.screen:last-child #code-input'); const code = inp ? inp.value.trim().toUpperCase() : ''; if (code.length !== 4) { audio.sfx('deny'); return; } app.joinGame(code); },
      retry() { if (this.retryFn) this.retryFn(); },
      leaveLobby() { app.leaveSession(); },
      copyLink(d, el) {
        const link = app.session.link();
        const done = () => { el.textContent = 'Copied!'; setTimeout(() => { el.textContent = 'Copy link'; }, 1500); };
        try { navigator.clipboard.writeText(link).then(done, () => prompt('Share this link:', link)); } catch (e) { prompt('Share this link:', link); }
      },
      lobbyColor(d) { app.session.setCos({ paint: d.id }); if (!app.session.isHost) this.lobby(); },
      emoji(d) { app.session.emoji(d.e); },
      ready() { const s = app.session, me = s.players.find((p) => p.id === s.myId); s.setReady(!(me && me.ready)); this.lobby(); },
      startMP() { app.startMP(); },
      backToLobby() { app.backToLobby(); },
      resume() { app.togglePause(false); },
      retryGame() { app.retry(); },
      finishTrial() { app.togglePause(false); if (app.game) { app.game.setState('done'); app.game.doneT = 0.1; } },
      quit() { app.quitToMenu(); },
    };
  }
  goto(to) {
    if (to === 'main') this.main(); else if (to === 'solo') this.solo(); else if (to === 'garage') this.show('garage', this.garageHtml());
    else if (to === 'settings') this.settings(); else if (to === 'controls') this.controls(); else if (to === 'join') this.join();
  }
  rerenderSettings() {
    if (this.current === 'settings') this.refresh('settings', `<h2>⚙ Settings</h2>${this.back()}<div class="panel">${this.settingsHtml()}</div>`);
    else if (this.app.game && this.app.paused) this.pauseMenu(true, this.app.game);
  }

  // ------------------------------------------------------------------ HUD
  hudShow(game) {
    this.hud.classList.remove('hidden');
    this.el['h-toasts'].innerHTML = ''; this.el['h-count'].textContent = ''; this.lastCount = '';
    this.hud.className = 'mode-' + game.mode;
    // pre-render the minimap background
    const mm = game.minimap, c = document.createElement('canvas'); c.width = c.height = 170;
    const g = c.getContext('2d'), [x0, z0, x1, z1] = mm.box, sc = 150 / Math.max(x1 - x0, z1 - z0, 1);
    this.mapT = (x, z) => [85 + (x - (x0 + x1) / 2) * sc, 85 + (z - (z0 + z1) / 2) * sc];
    g.lineJoin = g.lineCap = 'round';
    if (mm.arena) {
      g.fillStyle = 'rgba(10,12,30,0.55)'; g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.beginPath(); g.arc(85, 85, mm.radius * sc, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#fff'; for (const p of mm.pillars) { const [x, y] = this.mapT(p.x, p.z); g.beginPath(); g.arc(x, y, p.r * sc + 1, 0, 7); g.fill(); }
    } else {
      for (const [w, col] of [[8, 'rgba(10,12,30,0.7)'], [4, '#fff']]) {
        g.strokeStyle = col; g.lineWidth = w; g.beginPath();
        let pen = false;
        const pts = mm.closed ? mm.pts.concat([mm.pts[0]]) : mm.pts;
        for (const p of pts) { const [x, y] = this.mapT(p[0], p[1]); if (p[2]) { pen = false; continue; } if (pen) g.lineTo(x, y); else g.moveTo(x, y); pen = true; }
        g.stroke();
      }
    }
    this.mapBg = c;
  }
  hudHide() { this.hud.classList.add('hidden'); this.el.pause.classList.add('hidden'); }
  toast(text, kind = '') {
    const box = this.el['h-toasts'], t = document.createElement('div');
    t.className = 'toast ' + kind; t.textContent = text; box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), 1900);
  }
  hudUpdate(game, dt) {
    const el = this.el, me = game.me, view = game.viewCar();
    if (!me) return;
    // every frame: speed, boost meter, countdown, item roulette
    const sp = Math.round(view.speed * 4.2);
    el['h-speed'].textContent = sp;
    const L = TUNE.driftLevels, ch = me.drifting ? me.driftCharge : 0, lvl = me.driftLevel();
    el['h-boost-fill'].style.width = clamp(ch / (L[2] * 1.05), 0, 1) * 100 + '%';
    el['h-boost-fill'].style.background = me.boostT > 0 && !me.drifting ? '#fff' : lvl > 0 ? hex(DRIFT_COLORS[lvl - 1]) : '#8892b0';
    if (me.boostT > 0 && !me.drifting) el['h-boost-fill'].style.width = clamp(me.boostT / 1.7, 0, 1) * 100 + '%';
    let count = '';
    if (game.state === 'intro') count = '';
    else if (game.state === 'countdown') count = game.cd <= 3 ? String(Math.max(1, Math.ceil(game.cd))) : '';
    else if (game.state === 'racing' && game.stateT < 0.9) count = 'GO!';
    if (count !== this.lastCount) { this.lastCount = count; const c = el['h-count']; c.textContent = count; c.className = ''; void c.offsetWidth; c.className = count ? 'pop' + (count === 'GO!' ? ' go' : '') : ''; }
    if (me.roll > 0) {
      this.rollT -= dt;
      if (this.rollT <= 0) { this.rollT = 0.08; this.rollI = (this.rollI + 1) % ITEM_IDS.length; el['h-item-icon'].textContent = ITEM_DEFS[ITEM_IDS[this.rollI]].icon; audio.sfx('tick'); }
      el['h-item'].className = 'rolling'; el['h-item-name'].textContent = '';
    } else {
      el['h-item-icon'].textContent = me.item ? ITEM_DEFS[me.item].icon : '';
      el['h-item'].className = me.item ? 'has' : ''; el['h-item-name'].textContent = me.item ? ITEM_DEFS[me.item].name + ' · Shift' : '';
    }
    el['h-wind'].classList.toggle('hidden', game.windK < 0.3);
    // ~12 Hz: text and minimap
    this.hudT -= dt; if (this.hudT > 0) return; this.hudT = 0.08;
    const mode = game.mode, ms = game.ms, n = game.cars.length;
    if (mode === 'gauntlet') {
      el['h-pos'].innerHTML = ''; el['h-lap'].textContent = 'Respawns: ' + me.stats.respawns;
      el['h-time'].textContent = fmtTime(game.raceT); const par = game.parTimes(); el['h-mode'].textContent = '★★★ ' + fmtTime(par[0]);
    } else if (mode === 'trial') {
      el['h-pos'].innerHTML = ''; el['h-lap'].textContent = 'Lap ' + Math.max(1, me.lap);
      el['h-time'].textContent = fmtTime(me.lap > 0 ? game.raceT - me.lapStart : 0);
      el['h-mode'].textContent = 'Best ' + fmtTime(save.data.best[game.level.id]);
    } else {
      el['h-pos'].innerHTML = me.out ? '<b>OUT</b>' : `<b>${ordinal(me.place)}</b><small>/${mode === 'race' || mode === 'coins' ? n : game.activeCount()}</small>`;
      if (mode === 'race') { el['h-lap'].textContent = 'Lap ' + clamp(me.lap, 1, game.laps) + '/' + game.laps; el['h-time'].textContent = fmtTime(game.raceT); el['h-mode'].textContent = me.lap > 0 && !me.finished ? 'Lap ' + fmtTime(game.raceT - me.lapStart) : ''; }
      else if (mode === 'elim') { el['h-lap'].textContent = 'Lap ' + Math.max(1, me.lap); el['h-time'].textContent = '💀 ' + Math.ceil(Math.max(0, ms.elimT)); el['h-time'].className = ms.elimT < 6 ? 'warn' : ''; el['h-mode'].textContent = me.place === game.activeCount() && !me.out ? 'YOU ARE LAST!' : 'Last place is out'; }
      else if (mode === 'potato') {
        const h = game.carById(ms.bomb);
        el['h-lap'].textContent = ''; el['h-time'].textContent = h ? '💣 ' + Math.ceil(Math.max(0, ms.bombT)) : '…'; el['h-time'].className = h && ms.bombT < 5 ? 'warn' : '';
        el['h-mode'].textContent = h ? (h === me ? 'YOU have the bomb — bump someone!' : h.name + ' has the bomb') : 'Next round…';
      } else if (mode === 'coins') {
        el['h-lap'].textContent = ''; el['h-time'].textContent = fmtTime(Math.max(0, ms.timeLeft)); el['h-time'].className = ms.timeLeft < 10 ? 'warn' : ''; el['h-mode'].textContent = '';
        el['h-board'].innerHTML = game.cars.slice().sort((a, b) => b.coins - a.coins).map((c) => `<div class="${c === me ? 'me' : ''}"><span class="dot" style="background:${hex(c.color)}"></span>${esc(c.name)} <b>${c.coins}</b></div>`).join('');
      }
    }
    if (mode !== 'coins') el['h-board'].innerHTML = '';
    // minimap
    const g = el['h-map'].getContext('2d');
    g.clearRect(0, 0, 170, 170); g.drawImage(this.mapBg, 0, 0);
    for (const c of game.cars) {
      if (c.out || c === me) continue;
      const [x, y] = this.mapT(c.pos.x, c.pos.z);
      g.fillStyle = hex(c.color); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); g.stroke();
      if (mode === 'potato' && c.id === ms.bomb) { g.fillStyle = '#ff3030'; g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
    }
    if (!me.out) { const [x, y] = this.mapT(me.pos.x, me.pos.z); g.fillStyle = '#fff'; g.strokeStyle = hex(me.color); g.lineWidth = 3; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.stroke(); }
  }
}

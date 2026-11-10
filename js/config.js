// Global tuning constants and catalog data for Nitro Rush.
export const DT = 1 / 60;

export const TUNE = {
  maxSpeed: 44,        // m/s on flat ground without boost
  accel: 27,
  brake: 52,
  reverse: 12,
  coast: 9,
  grip: 11,            // lateral velocity damping (higher = more grip)
  driftGrip: 2.4,
  gravity: 30,
  carR: 1.3,           // collision radius
  driftLevels: [0.55, 1.35, 2.3],          // charge needed for blue / orange / purple
  driftBoost: [[0.7, 9], [1.15, 13], [1.7, 18]], // [seconds, extra top speed]
  trickRate: 12,
};

export const DRIFT_COLORS = [0x3aa0ff, 0xff9a2e, 0xc04dff];

export const ITEM_IDS = ['shock', 'rocket', 'shield', 'glue', 'mine'];
export const ITEM_DEFS = {
  shock:  { name: 'Shockwave',   icon: '💥' },
  rocket: { name: 'Rocket',      icon: '🚀' },
  shield: { name: 'Shield',      icon: '🛡️' },
  glue:   { name: 'Glue Blob',   icon: '🟢' },
  mine:   { name: 'Magnet Mine', icon: '🧲' },
};
// Item weights at the front of the pack vs. the back (rubber-banding).
export const ITEM_WEIGHTS = {
  shock:  [1.0, 3.0],
  rocket: [0.4, 4.5],
  shield: [3.0, 1.0],
  glue:   [3.0, 0.6],
  mine:   [2.6, 1.0],
};

export const PAINTS = [
  { id: 'cherry',  name: 'Cherry Pop',   color: 0xff3b4e, price: 0 },
  { id: 'ocean',   name: 'Ocean Dash',   color: 0x2f8bff, price: 0 },
  { id: 'lime',    name: 'Lime Zest',    color: 0x7be03a, price: 0 },
  { id: 'sun',     name: 'Sunburst',     color: 0xffc928, price: 0 },
  { id: 'grape',   name: 'Grape Jam',    color: 0x9b4dff, price: 150 },
  { id: 'tang',    name: 'Tangerine',    color: 0xff7a1a, price: 150 },
  { id: 'mint',    name: 'Mint Chip',    color: 0x3fe0b0, price: 200 },
  { id: 'bubble',  name: 'Bubblegum',    color: 0xff6fc8, price: 200 },
  { id: 'snow',    name: 'Snowdrift',    color: 0xf2f6ff, price: 300 },
  { id: 'night',   name: 'Midnight',     color: 0x23263a, price: 300 },
  { id: 'gold',    name: 'Solid Gold',   color: 0xe8b923, price: 800 },
  { id: 'plasma',  name: 'Plasma Teal',  color: 0x00e5ff, price: 600 },
];
export const WHEELS = [
  { id: 'classic', name: 'Classic',    price: 0 },
  { id: 'chunky',  name: 'Chunky',     price: 250 },
  { id: 'neon',    name: 'Neon Rims',  price: 400 },
  { id: 'star',    name: 'Star Spoke', price: 500 },
];
export const TRAILS = [
  { id: 'flame',  name: 'Flame',      color: 0xff8a2a, price: 0 },
  { id: 'ice',    name: 'Ice',        color: 0x66d9ff, price: 200 },
  { id: 'toxic',  name: 'Toxic',      color: 0x8dff3a, price: 200 },
  { id: 'rose',   name: 'Rose',       color: 0xff5fa8, price: 300 },
  { id: 'void',   name: 'Void',       color: 0xb06bff, price: 400 },
  { id: 'star',   name: 'Stardust',   color: 0xfff3b0, price: 600 },
];
export const HORNS = [
  { id: 'beep',   name: 'Beep Beep',  price: 0 },
  { id: 'duck',   name: 'Rubber Duck', price: 150 },
  { id: 'laser',  name: 'Laser Zap',  price: 300 },
  { id: 'fanfare', name: 'Fanfare',   price: 500 },
];
export const CATALOG = { paint: PAINTS, wheel: WHEELS, trail: TRAILS, horn: HORNS };

export const BOT_NAMES = ['Zippy Zed', 'Turbo Tess', 'Rocket Rae', 'Dizzy Dot', 'Captain Skid',
  'Nova Nell', 'Blitz Bo', 'Mango Max', 'Pixel Pip', 'Lady Lugnut', 'Sir Vroom', 'Wobble Wes'];

export const DIFF_NAMES = ['Easy', 'Medium', 'Hard'];
export const MODE_INFO = {
  race:     { name: 'Race',        icon: '🏁', desc: '3 laps against 5 rivals. Items on!' },
  gauntlet: { name: 'Gauntlet',    icon: '⭐', desc: 'Solo obstacle courses. Earn stars to unlock worlds.' },
  trial:    { name: 'Time Trial',  icon: '⏱️', desc: 'Chase your best lap against your own ghost.' },
  elim:     { name: 'Elimination', icon: '💀', desc: 'Last place is knocked out every 30 seconds.' },
  potato:   { name: 'Hot Potato',  icon: '💣', desc: 'Bump to pass the bomb. Don\'t hold it at zero!' },
  coins:    { name: 'Coin Rush',   icon: '🪙', desc: 'Grab the most coins in 2 minutes.' },
};
export const EMOJIS = ['👍', '😂', '😎', '🔥', '😱', '🏁', '💀', '🎉'];

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const fmtTime = (t) => {
  if (t == null || !isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
};
export const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)]);

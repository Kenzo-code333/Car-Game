import { path, ring } from './builder.js';

export const skyRace = {
  id: 'sky-race', name: 'Halo Circuit', world: 'sky', type: 'race', closed: true, width: 16, rails: false,
  points: ring(28, (a) => [270 * Math.cos(a), 30 + 10 * Math.cos(2 * a), 175 * Math.sin(a)]),
  items: [0.06, 0.34, 0.6, 0.86],
  loops: [{ at: 0.25, radius: 17 }],
  gaps: [{ at: 0.553, len: 14 }, { at: 0.8, len: 16, platforms: [{ hw: 3.6, amp: 4, period: 4 }] }],
  obstacles: [
    { type: 'boost', at: 0.03 }, { type: 'boost', at: 0.21, pow: 15 }, { type: 'wind', at: 0.37, len: 110, dir: 1 },
    { type: 'boost', at: 0.52 }, { type: 'ramp', at: 0.55, H: 2.8 }, { type: 'spinner', at: 0.66, speed: 1.4 },
    { type: 'boost', at: 0.73, lat: 0 }, { type: 'wind', at: 0.88, len: 90, dir: -1, phase: 0.5 }, { type: 'boost', at: 0.96, lat: 4 },
  ],
  coins: [{ at: 0.1, n: 6 }, { at: 0.42, n: 6, lat: -3 }, { at: 0.556, n: 4, h: 3, gap: 6 }, { at: 0.9, n: 6, lat: 2, wave: 2 }],
};

export const skyGauntlets = [
  path({ w: 14, y: 30 }).st(70).boost().st(40).jump(12).st(50).coins(5).turn(60, 65).st(40).ob('wind', { len: 80, dir: 1 }).st(90).boost().st(30)
    .jump(14).st(40).turn(-70, 60).st(30).gap(16, { platforms: [{ hw: 3.6, amp: 3.4, period: 5 }] }).st(60).ob('wind', { len: 60, dir: -1, phase: 0.5 })
    .st(70).boost().st(90)
    .build({ id: 'sky-1', name: 'Cloud Hop', world: 'sky' }),
  path({ w: 14, y: 30 }).st(60).boost().st(60).loop(16).st(70).coins(5).turn(80, 55).st(20).ob('wind', { len: 90, dir: -1 }).st(60)
    .gap(16, { platforms: [{ hw: 3.4, amp: 3.6, period: 4 }] }).st(50).boost().st(30).jump(15, { H: 3 }).st(40).turn(-80, 55).st(30).boost(0, { pow: 15 })
    .st(60).loop(18).st(70).ob('spinner', { speed: 1.6 }).st(40).gap(14, { platforms: [{ hw: 3.4, amp: 3.6, period: 3.4, phase: 0.5 }] }).st(90)
    .build({ id: 'sky-2', name: 'Loop de Loop', world: 'sky' }),
  path({ w: 12, y: 30 }).st(60).boost().st(40).ob('wind', { len: 120, dir: 1, force: 46 }).st(40).ob('spinner', { speed: 2 }).st(60).jump(18, { H: 3.2 })
    .st(30).turn(-90, 45).st(10).gap(16, { platforms: [{ hw: 3, amp: 3, period: 3 }] }).st(26).gap(16, { platforms: [{ hw: 3, amp: 3, period: 3, phase: 0.5 }] })
    .st(40).boost(0, { pow: 15 }).st(60).loop(15).st(60).turn(90, 45).ob('wind', { len: 100, dir: -1, force: 46, phase: 0.4 }).st(30).ob('hammer', { period: 2.6 })
    .st(40).ob('hammer', { period: 2.6, phase: 0.5 }).st(30).boost().st(30).jump(24, { H: 4, len: 11 }).st(40).ob('slider', { period: 3.2 }).st(50)
    .gap(14, { platforms: [{ hw: 3, amp: 3, period: 2.6 }] }).st(90)
    .build({ id: 'sky-3', name: 'Stratosphere', world: 'sky' }),
];

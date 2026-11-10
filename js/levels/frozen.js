import { path, ring } from './builder.js';

export const frozenRace = {
  id: 'frozen-race', name: 'Glacier Ring', world: 'frozen', type: 'race', closed: true, width: 15, rails: true,
  points: ring(30, (a) => [235 * Math.cos(a) + 45 * Math.cos(3 * a), 10 + 9 * Math.cos(a), 140 * Math.sin(a) + 62 * Math.sin(3 * a)]),
  items: [0.07, 0.32, 0.57, 0.82],
  obstacles: [
    { type: 'boost', at: 0.03 }, { type: 'ice', at: 0.12, len: 70 }, { type: 'roller', at: 0.22, len: 100, speed: 14, amp: 4, count: 2, kind: 'snow', r: 2.4 },
    { type: 'boost', at: 0.36, lat: -4 }, { type: 'ramp', at: 0.44, H: 3, len: 10, w: 3.2, lat: 3.4 }, { type: 'boost', at: 0.425, lat: 3.4 },
    { type: 'ice', at: 0.5, len: 60, lat0: -7.5, lat1: 0 }, { type: 'spinner', at: 0.62, speed: 1.5 },
    { type: 'ice', at: 0.7, len: 80 }, { type: 'boost', at: 0.79 }, { type: 'roller', at: 0.87, len: 80, speed: 12, amp: 3, kind: 'snow', r: 3 },
    { type: 'piston', at: 0.95, side: 1 }, { type: 'piston', at: 0.962, side: -1, phase: 0.5 },
  ],
  coins: [{ at: 0.1, n: 6, lat: 2 }, { at: 0.3, n: 6 }, { at: 0.45, n: 5, lat: 3.4, h: 2.5, gap: 6 }, { at: 0.74, n: 6, lat: -3, wave: 2 }],
};

export const frozenGauntlets = [
  path({ w: 14 }).st(70).boost().st(40).ob('ice', { len: 50 }).st(50).turn(60, 70).ob('ice', { len: 40 }).st(60).coins(5)
    .ob('roller', { len: 80, speed: 11, amp: 3, kind: 'snow' }).st(100, -5).turn(-70, 65).st(30).boost().st(50).ob('ramp', { H: 2.4 }).st(60)
    .ob('ice', { len: 60 }).turn(-50, 70).st(40).ob('spinner', { speed: 1.4 }).st(100)
    .build({ id: 'frozen-1', name: 'Slip Road', world: 'frozen', rails: true }),
  path({ w: 14 }).st(60).boost().st(20).ob('roller', { len: 150, speed: 17, amp: 4.5, count: 3, kind: 'snow', r: 2.4 }).st(160, -18).ob('ice', { len: 70 })
    .turn(90, 55, -4).st(30).ob('piston', { side: 1 }).st(28).ob('piston', { side: -1, phase: 0.4 }).st(40).boost().st(40).jump(16, { H: 3 }).st(40)
    .ob('ice', { len: 90 }).turn(-80, 60).turn(60, 60).coins(5).ob('roller', { len: 90, speed: 15, amp: 2, kind: 'snow', r: 3 }).st(100, -8)
    .ob('hammer', { period: 2.6 }).st(90)
    .build({ id: 'frozen-2', name: 'Avalanche Pass', world: 'frozen', rails: true }),
  path({ w: 13 }).st(50).boost().st(60, -14).st(40, -6).jump(24, { H: 4.2, len: 12 }).st(50, -4).ob('ice', { len: 45 }).turn(100, 50).st(20)
    .ob('spinner', { speed: 1.8 }).st(40).ob('ice', { len: 40 }).ob('spinner', { speed: -1.8 }, -20).st(50).boost().st(50, -12).jump(28, { H: 4.4, len: 12 })
    .st(40).ob('roller', { len: 90, speed: 16, amp: 4, count: 2, kind: 'snow' }).st(100, -6).turn(-90, 50).ob('ice', { len: 70 }).st(70).ob('crate', {})
    .st(40).boost().st(30).jump(18, { H: 3.4 }).st(90)
    .build({ id: 'frozen-3', name: 'Ski Jump Summit', world: 'frozen', rails: true }),
];

import { path, ring } from './builder.js';

export const desertRace = {
  id: 'desert-race', name: 'Canyon Run', world: 'desert', type: 'race', closed: true, width: 15, rails: true,
  points: ring(30, (a) => { const r = 172 * (1 + 0.27 * Math.sin(3 * a)); return [r * Math.cos(a), 9 + 8 * Math.sin(2 * a + 1), r * Math.sin(a)]; }),
  items: [0.1, 0.36, 0.62, 0.86],
  norail: [[0.46, 0.56]],
  gaps: [{ at: 0.502, len: 15 }],
  obstacles: [
    { type: 'boost', at: 0.05 }, { type: 'roller', at: 0.16, len: 110, speed: 15, amp: 3.5, count: 2 },
    { type: 'boost', at: 0.31, lat: -4 }, { type: 'hammer', at: 0.41, period: 3 },
    { type: 'boost', at: 0.47 }, { type: 'ramp', at: 0.5, H: 3.2, len: 10 },
    { type: 'sand', at: 0.64, len: 130 }, { type: 'spinner', at: 0.7, speed: 1.4 },
    { type: 'boost', at: 0.78, lat: 4 }, { type: 'roller', at: 0.88, len: 80, speed: 13, amp: 4, r: 2.6 }, { type: 'boost', at: 0.96 },
  ],
  coins: [{ at: 0.08, n: 6 }, { at: 0.33, n: 6, lat: -3 }, { at: 0.58, n: 6, lat: 2, wave: 2 }, { at: 0.8, n: 6, lat: 3 }],
};

export const desertGauntlets = [
  path({ w: 14 }).st(80).boost().st(50).coins(5).turn(50, 70, -4).st(40, -2).ob('roller', { len: 90, speed: 12, amp: 3 }).st(110, -6).turn(-50, 70)
    .st(40).boost().st(40).jump(14, { H: 2.8 }).st(60).ob('sand', { len: 110 }).st(50).ob('oil', { lat: 2 }).turn(-60, 60).st(60).coins(5)
    .ob('hammer', { period: 3.2 }).st(50).turn(60, 60).st(90)
    .build({ id: 'desert-1', name: 'Dusty Trail', world: 'desert' }),
  path({ w: 14 }).st(60).boost().st(30).ob('roller', { len: 130, speed: 16, amp: 4, count: 2 }).st(140, -14).turn(80, 55, -4).st(30)
    .ob('hammer', { period: 2.8 }).st(40).ob('hammer', { period: 2.8, phase: 0.5 }).st(40).boost().st(40).jump(22, { H: 3.6, len: 10 }).st(50)
    .turn(-100, 50).ob('roller', { len: 100, speed: 18, amp: 2, r: 2.8 }).st(110, -8).coins(6).turn(50, 60).ob('crate', {}).st(50)
    .ob('spinner', { speed: 1.6 }).st(100)
    .build({ id: 'desert-2', name: 'Boulder Alley', world: 'desert' }),
  path({ w: 13 }).st(60).boost().st(30).jump(18, { H: 3.2 }).st(50).ob('sand', { len: 160 }).st(30).ob('spinner', { speed: 2 }).st(45)
    .ob('spinner', { speed: -2 }).st(40).turn(90, 50).st(20).boost().st(40).jump(26, { H: 4, len: 11 }).st(40).gap(15, { collapse: true }).st(40)
    .turn(-70, 50, -6).ob('roller', { len: 110, speed: 18, amp: 4, count: 3 }).st(120, -10).ob('crate', {}).st(40).turn(-60, 50).boost()
    .st(40).jump(20, { H: 3.4 }).st(30).ob('piston', { side: 1 }).st(26).ob('piston', { side: -1, phase: 0.5 }).st(90)
    .build({ id: 'desert-3', name: 'Canyon Leap', world: 'desert' }),
];

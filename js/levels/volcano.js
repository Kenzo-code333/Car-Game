import { path, ring } from './builder.js';

export const volcanoRace = {
  id: 'volcano-race', name: 'Magma Ring', world: 'volcano', type: 'race', closed: true, width: 15, rails: true,
  points: ring(32, (a) => { const r = 185 * (1 + 0.15 * Math.sin(2 * a) + 0.07 * Math.cos(5 * a)); return [r * Math.cos(a), 9 + 6 * Math.sin(3 * a), r * Math.sin(a)]; }),
  items: [0.09, 0.34, 0.6, 0.85],
  gaps: [{ at: 0.52, len: 15, collapse: true }],
  obstacles: [
    { type: 'boost', at: 0.04 }, { type: 'geyser', at: 0.14, lat: -3.5, period: 4 }, { type: 'geyser', at: 0.15, lat: 3.5, period: 4, phase: 0.5 },
    { type: 'geyser', at: 0.16, lat: 0, period: 4, phase: 0.25 }, { type: 'boost', at: 0.24, lat: 4 },
    { type: 'lava', at: 0.4, len: 45, period: 8 }, { type: 'boost', at: 0.48 },
    { type: 'crate', at: 0.66 }, { type: 'boost', at: 0.72, lat: -4 },
    { type: 'geyser', at: 0.79, lat: 2.5, period: 3.4 }, { type: 'geyser', at: 0.8, lat: -2.5, period: 3.4, phase: 0.5 },
    { type: 'hammer', at: 0.93, period: 3 },
  ],
  coins: [{ at: 0.07, n: 6 }, { at: 0.28, n: 6, lat: 3 }, { at: 0.56, n: 6, lat: -2, wave: 2 }, { at: 0.88, n: 6, lat: -3 }],
};

export const volcanoGauntlets = [
  path({ w: 14 }).st(70).boost().st(50).ob('geyser', { lat: -3 }).ob('geyser', { lat: 3, phase: 0.5 }, -18).st(60).turn(70, 60).coins(5).st(40)
    .ob('lava', { len: 40, period: 7 }).st(80).boost().turn(-80, 60).st(40).ob('geyser', { lat: 0, period: 3 }).st(40).ob('geyser', { lat: -4, period: 3, phase: 0.3 })
    .ob('geyser', { lat: 4, period: 3, phase: 0.6 }).st(50).gap(14, { collapse: true }).st(50).turn(-40, 70).ob('hammer', { period: 3 }).st(90)
    .build({ id: 'volcano-1', name: 'Ember Road', world: 'volcano' }),
  path({ w: 14 }).st(60).boost().st(40).gap(15, { collapse: true }).st(30).gap(15, { collapse: true }).st(40).turn(90, 50).st(20).ob('hammer', { period: 2.6 })
    .st(40).ob('geyser', { lat: -3.5, period: 3 }).ob('geyser', { lat: 3.5, period: 3, phase: 0.5 }).st(40).boost().st(40).jump(16, { H: 3 }).st(40)
    .turn(-90, 50).coins(5).st(30).ob('lava', { len: 50, period: 6 }).st(70).gap(18, { collapse: true }).st(30).ob('spinner', { speed: 1.9 }).st(40)
    .turn(60, 55).ob('crate', {}).st(40).ob('geyser', { lat: 0, period: 2.6 }).st(90)
    .build({ id: 'volcano-2', name: 'Crumble Crossing', world: 'volcano' }),
  path({ w: 13 }).st(60).boost().st(30).ob('lava', { len: 60, period: 6 }).st(40).ob('geyser', { lat: 0, period: 3 }, 10).st(50).turn(-90, 45).st(20)
    .ob('gate', { side: 1, period: 5 }).boost(4, { pow: 16 }).st(40).gap(16, { collapse: true }).st(24).ob('geyser', { lat: -3, period: 2.8 })
    .ob('geyser', { lat: 3, period: 2.8, phase: 0.5 }).st(30).gap(16, { collapse: true }).st(30).turn(90, 45).boost().st(40).jump(22, { H: 3.6, len: 10 })
    .st(30).ob('lava', { len: 70, period: 7, phase: 0.3 }).st(50).ob('hammer', { period: 2.4 }, 10).st(40).turn(70, 50).ob('piston', { side: -1 }).st(26)
    .ob('piston', { side: 1, phase: 0.5 }).st(30).ob('geyser', { lat: -4, period: 2.4 }).ob('geyser', { lat: 0, period: 2.4, phase: 0.33 })
    .ob('geyser', { lat: 4, period: 2.4, phase: 0.66 }).st(90)
    .build({ id: 'volcano-3', name: 'Magma Surge', world: 'volcano' }),
];

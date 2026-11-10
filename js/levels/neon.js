import { path, ring } from './builder.js';

export const neonRace = {
  id: 'neon-race', name: 'Midnight Loop', world: 'neon', type: 'race', closed: true, width: 15, rails: true,
  // figure-eight with an overpass
  points: ring(28, (a) => [200 * Math.sin(a), 6 + 6 * Math.cos(a), 125 * Math.sin(2 * a) + 28 * Math.sin(4 * a)]),
  items: [0.08, 0.33, 0.58, 0.83],
  obstacles: [
    { type: 'boost', at: 0.04, lat: 0 }, { type: 'boost', at: 0.2, lat: -4 }, { type: 'boost', at: 0.2, lat: 4 },
    { type: 'train', at: 0.27, period: 7 }, { type: 'boost', at: 0.4, lat: 3 },
    { type: 'slider', at: 0.46, period: 5 }, { type: 'boost', at: 0.54, lat: 0 },
    { type: 'oil', at: 0.63, lat: -3.5 }, { type: 'oil', at: 0.645, lat: 3 },
    { type: 'boost', at: 0.7, lat: -4 }, { type: 'train', at: 0.77, period: 6, phase: 0.4 },
    { type: 'gate', at: 0.9, side: 1, period: 6 }, { type: 'boost', at: 0.915, lat: 4.5, pow: 16 },
  ],
  coins: [{ at: 0.12, n: 6, lat: -3 }, { at: 0.36, n: 6, lat: 3, wave: 2 }, { at: 0.6, n: 6, lat: 0 }, { at: 0.86, n: 6, lat: -2, wave: 2 }],
};

export const neonGauntlets = [
  path({ w: 14 }).st(70).boost().st(60).coins(5).ob('slider', { period: 5 }).st(45).turn(70, 55).st(60).ob('train', { period: 6, phase: 0.2 })
    .st(70).coins(5, 2).turn(-70, 55).st(30).boost().st(70).ob('slider', { period: 4, phase: 0.3 }).st(50).turn(-40, 70).st(55)
    .ob('oil', { lat: -3 }).ob('oil', { lat: 3.5 }, -16).st(70).boost().st(90)
    .build({ id: 'neon-1', name: 'Rush Hour', world: 'neon' }),
  path({ w: 14 }).st(60).boost(-3).st(50).ob('gate', { side: 1, period: 5 }).boost(4, { pow: 16 }).coins(4, 4).st(60).turn(-80, 50).st(40)
    .ob('piston', { side: 1 }).st(28).ob('piston', { side: -1, phase: 0.5 }).st(28).ob('piston', { side: 1, phase: 0.25 }).st(50).turn(60, 60)
    .st(40).ob('hammer', { period: 2.8 }).st(60).boost().st(40).jump(13).st(40).coins(5).turn(80, 55).st(40).ob('train', { period: 5 })
    .st(60).ob('gate', { side: -1, period: 5, phase: 0.5 }).boost(-4, { pow: 16 }).st(50).ob('slider', { period: 3.6 }).st(90)
    .build({ id: 'neon-2', name: 'Laser Lanes', world: 'neon' }),
  path({ w: 13 }).st(60).boost().st(40).ob('train', { period: 5 }).st(26).ob('train', { period: 5, phase: 0.5 }).st(50).turn(90, 45).st(30)
    .ob('spinner', { speed: 1.8 }).st(50).ob('slider', { period: 3 }).st(22).ob('slider', { period: 3, phase: 0.5 }).st(40).turn(-90, 45)
    .boost().st(50).jump(15).st(30).ob('crate', {}).st(40).ob('crate', { phase: 0.5 }).st(40).turn(-60, 50).st(30).ob('oil', { lat: 0 })
    .st(30).ob('hammer', { period: 2.4 }).st(26).ob('hammer', { period: 2.4, phase: 0.5 }).st(50).turn(60, 50).coins(6).boost().st(50)
    .ob('train', { period: 4.5, speed: 36 }).st(40).ob('spinner', { speed: -2.2 }).st(90)
    .build({ id: 'neon-3', name: 'Grid Lock', world: 'neon' }),
];

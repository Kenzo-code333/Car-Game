// Level registry. To add a track: describe it as a data object (see README) and register it here.
import { WORLDS, THEMES } from './themes.js';
import { neonRace, neonGauntlets } from './neon.js';
import { desertRace, desertGauntlets } from './desert.js';
import { frozenRace, frozenGauntlets } from './frozen.js';
import { volcanoRace, volcanoGauntlets } from './volcano.js';
import { skyRace, skyGauntlets } from './sky.js';

export { WORLDS, THEMES };

const arenas = WORLDS.map((w) => ({
  id: 'arena-' + w.id, name: w.name.split(' ')[0] + ' Bowl', world: w.id, type: 'arena', radius: 62,
  pillars: [[24, 24], [-24, 24], [24, -24], [-24, -24]].map(([x, z]) => ({ x, z, r: 3.6 })),
  itemSpots: [0, 1, 2, 3, 4, 5].map((k) => [Math.cos(k * Math.PI / 3 + 0.5) * 42, Math.sin(k * Math.PI / 3 + 0.5) * 42]).concat([[0, 0]]),
}));

export const RACES = [neonRace, desertRace, frozenRace, volcanoRace, skyRace];
export const GAUNTLETS = { neon: neonGauntlets, desert: desertGauntlets, frozen: frozenGauntlets, volcano: volcanoGauntlets, sky: skyGauntlets };
export const ARENAS = arenas;

export const LEVELS = {};
for (const l of [...RACES, ...arenas, ...Object.values(GAUNTLETS).flat()]) LEVELS[l.id] = l;

export const raceOf = (worldId) => RACES.find((r) => r.world === worldId);
export const arenaOf = (worldId) => arenas.find((r) => r.world === worldId);

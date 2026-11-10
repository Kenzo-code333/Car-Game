// Look & feel for each world: colours, lighting, sky, weather and music.
export const WORLDS = [
  { id: 'neon',    name: 'Neon City',     need: 0,  blurb: 'Rainy night streets, trains and glowing boost pads.' },
  { id: 'desert',  name: 'Desert Canyon', need: 3,  blurb: 'Sunset mesas, rolling boulders and huge jumps.' },
  { id: 'frozen',  name: 'Frozen Peak',   need: 7,  blurb: 'Slippery ice, avalanches and ski jumps.' },
  { id: 'volcano', name: 'Volcano Core',  need: 12, blurb: 'Geysers, crumbling bridges and rising lava.' },
  { id: 'sky',     name: 'Sky Circuit',   need: 18, blurb: 'Floating roads, loops, wind and moving platforms.' },
];

export const THEMES = {
  neon: {
    sky: [0x05061a, 0x2a1050], fog: [0x1a0f3a, 70, 560], hemi: [0x9a8aff, 0x2a1450, 1.7], sun: [0xff9ae6, 1.3], sunDir: [0.4, 1, 0.3],
    road: { base: '#22242f', line: '#43e8ff', edge: '#ff3fd0', edge2: '#43e8ff', body: 0x2a2d44 }, rail: 0xff3fd0,
    ground: 0x0a0a1e, groundDrop: 16, pillars: true, props: 'city', weather: 'rain',
    hazard: 0xff3f6a, boost: 0x43e8ff, ramp: 0xffe23f, platform: 0x5a6aa8, bridge: 0x7a6aa8, seed: 3, music: 'neon', css: '#ff3fd0',
  },
  desert: {
    sky: [0x3a2a6a, 0xffa35a], fog: [0xf0a070, 90, 680], hemi: [0xffd9b0, 0x8a4a24, 2.0], sun: [0xffc080, 2.4], sunDir: [-0.7, 0.35, -0.5], sunDisc: [0xfff0b0, 60],
    road: { base: '#5a4636', line: '#ffe9b0', edge: '#d9482a', edge2: '#fff0d0', body: 0x8a5a3a }, rail: 0xd9482a,
    ground: 0xd9955a, groundDrop: 16, pillars: true, props: 'desert', weather: null, sandstorm: true,
    hazard: 0xd9482a, boost: 0x3ae8c0, ramp: 0xffc23a, platform: 0xb07a4a, bridge: 0x9a6b3d, seed: 5, music: 'desert', css: '#ff9a4a',
  },
  frozen: {
    sky: [0x3a80e0, 0xdff2ff], fog: [0xdff2ff, 80, 620], hemi: [0xffffff, 0x8aaad0, 2.3], sun: [0xffffff, 2.0], sunDir: [0.5, 0.8, 0.2],
    road: { base: '#5c6f8a', line: '#ffffff', edge: '#2f8bff', edge2: '#ffffff', body: 0x7a90b0 }, rail: 0x6fc8ff,
    ground: 0xf2f8ff, groundDrop: 16, pillars: true, props: 'frozen', weather: 'snow',
    hazard: 0xff5a5a, boost: 0xffe23f, ramp: 0xff9a3a, platform: 0x9fc0e0, bridge: 0x8a6a4a, seed: 9, music: 'frozen', css: '#6fc8ff',
  },
  volcano: {
    sky: [0x120408, 0x6a1a0a], fog: [0x3a0f08, 60, 520], hemi: [0xffa070, 0x501408, 1.6], sun: [0xff8a4a, 1.9], sunDir: [0.3, 0.7, -0.5],
    road: { base: '#2c2426', line: '#ffb03a', edge: '#ff4a1a', edge2: '#3a2a2a', body: 0x3a2a2c }, rail: 0xff5a1a,
    ground: 0xff4a10, groundGlow: true, groundDrop: 14, pillars: true, props: 'volcano', weather: 'embers',
    hazard: 0xffb03a, boost: 0x7dff5a, ramp: 0xffe23f, platform: 0x5a4a4c, bridge: 0x6a4a3a, seed: 13, music: 'volcano', css: '#ff5a1a',
  },
  sky: {
    sky: [0x2a7aff, 0xbfe8ff], fog: [0xcfeaff, 140, 820], hemi: [0xffffff, 0xa0c8ff, 2.3], sun: [0xfff4d0, 2.2], sunDir: [0.4, 0.9, 0.4], sunDisc: [0xffffff, 40],
    road: { base: '#dfe6f5', line: '#ff9a3a', edge: '#7a5cff', edge2: '#ffd23a', body: 0x8a9ad0 }, rail: 0x7a5cff,
    ground: 0xffffff, groundDrop: 60, pillars: false, props: 'sky', weather: 'motes',
    hazard: 0xff5a8a, boost: 0x2fd0ff, ramp: 0xff9a3a, platform: 0xa0b4e8, bridge: 0xc0a070, seed: 17, music: 'sky', css: '#7a9cff',
  },
};

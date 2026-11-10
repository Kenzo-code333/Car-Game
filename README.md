# Nitro Rush

A browser-based 3D arcade racing game: drift-to-boost, air tricks, items, obstacle gauntlets, party modes and
online multiplayer. Plain HTML / CSS / JavaScript ES modules — **no build step, no npm install**. Three.js and
PeerJS are loaded from the jsDelivr CDN, so the whole game is just static files.

## Play

- **Online:** deploy to GitHub Pages (below) and open the page.
- **Locally:** ES modules need to be served over http, so opening `index.html` as a `file://` URL will not work.
  Any static server is fine, e.g. `python3 -m http.server` in this folder, then open `http://localhost:8000`.

### Controls

| Keyboard | Action | Gamepad |
| --- | --- | --- |
| `W` / `↑` | Accelerate | RT |
| `S` / `↓` | Brake / reverse | LT |
| `A` `D` / `←` `→` | Steer | Left stick |
| `Space` | Drift (hold while turning, release to boost) | A / RB |
| `Shift` | Use item | X / B |
| `R` | Respawn at last checkpoint | Y |
| `H` | Horn | LB |
| `Esc` | Pause | Start |

### Techniques

- **Drift boost** – hold Space while turning. Sparks charge blue → orange → purple; release for a matching boost.
- **Air tricks** – hold a direction while airborne to flip or spin. Finish the rotation before landing for a mini-boost.
- **Slipstream** – stay right behind another car for 2 seconds for a speed surge.
- **Boost start** – press accelerate just before "GO!".

### Modes

- **Race** – 3 laps (1–5 selectable), up to 6 cars, bots fill empty slots, items on.
- **Gauntlet** – 15 solo obstacle courses (3 per world). 1–3 stars for time and respawns; stars unlock worlds.
- **Time Trial** – chase your best lap against a translucent ghost of it.
- **Elimination** – last place is knocked out every 30 seconds.
- **Hot Potato** – bump another car to pass the bomb; don't be holding it at zero.
- **Coin Rush** – most coins in the arena after 2 minutes wins.

Worlds: Neon City, Desert Canyon, Frozen Peak, Volcano Core, Sky Circuit. Coins buy paint, wheels, boost trails
and horns in the Garage. Progress is saved in `localStorage`.

### Multiplayer

**Host Game** creates a room with a 4-letter code and a share link (`?room=CODE`); friends use **Join Game** or
open the link. The host picks mode / world / laps / bots, everyone readies up, host presses Start.

The host's browser runs the simulation (host-authoritative) and broadcasts state ~20 times a second; clients send
inputs, predict their own car and interpolate the others. If a player drops, a bot takes over their car.
Connections are peer-to-peer WebRTC via the free public PeerJS broker — some school / strict networks block
WebRTC, in which case joining shows an error with a retry button. The host should keep their tab in the foreground
(browsers pause background tabs).

Tip: add `?net=local` to the URL to use a same-computer transport (two tabs, no internet) for testing.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository (the files must be at the repo root, or in `/docs`).
2. On GitHub: **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**.
3. Pick the branch (e.g. `main`) and folder (`/ (root)`), then **Save**.
4. After a minute the game is live at `https://<user>.github.io/<repo>/`.

All paths are relative, so it works from a sub-folder URL without changes.

## Project layout

```
index.html            page shell, import map (Three.js) and PeerJS script tag
css/style.css         menus + HUD styling
js/main.js            app entry: renderer, main loop, menu showroom, session glue
js/game.js            one play session: fixed 60 Hz step, mode rules, snapshots, rendering
js/physics.js         arcade car physics + car-vs-car collisions
js/track.js           spline -> frames -> road mesh; surface queries ("raycast" onto the ribbon)
js/arena.js           flat arena surface for Hot Potato / Coin Rush
js/car.js             car state and low-poly car mesh
js/obstacles.js       hammers, spinners, pistons, crates, oil, boost pads, ramps, gates, trains, sliders,
                      boulders/snowballs, geysers, lava, wind, sandstorm, ice
js/items.js           item boxes, coins, glue blobs, magnet mines, item use
js/bots.js            bot drivers
js/effects.js         particles, speed lines, weather, camera rig
js/scenery.js         sky, lights, ground and instanced props per world
js/network.js         PeerJS / local transports, lobby session
js/ui.js              all menus, lobby, garage, HUD, results
js/audio.js           synthesized engine, SFX and music (Web Audio)
js/input.js           keyboard + gamepad
js/save.js            localStorage progress
js/config.js          tuning constants and cosmetic catalog
js/levels/            themes.js (world looks), builder.js (track DSL), one file per world, index.js (registry)
```

## Adding a new track

Tracks are data. A level is an object with spline control points plus obstacle / item placements; `Track`
turns the points into a banked road (CatmullRomCurve3), checkpoints and a minimap automatically.

### Option A – the path builder (easiest, great for gauntlets)

In a world file such as `js/levels/neon.js`:

```js
import { path } from './builder.js';

const myLevel = path({ w: 14 })          // road width in metres
  .st(80)                                 // straight, 80 m   (second arg = height change)
  .boost()                                // boost pad here    (.boost(lateralOffset))
  .turn(90, 50)                           // 90° right turn, radius 50 m (negative = left)
  .ob('hammer', { period: 3 })            // any obstacle type at the current spot
  .st(40).jump(14)                        // ramp followed by a 14 m gap
  .gap(16, { collapse: true })            // collapsing bridge; or { platforms: [{ hw: 3.5, amp: 3, period: 4 }] }
  .loop(16)                               // vertical loop (keep ~50 m of straight before and after)
  .coins(5).items()                       // coin row / item-box row
  .st(90)                                 // leave ~40 m of run-off after the finish
  .build({ id: 'neon-4', name: 'My Level', world: 'neon' });
```

Add it to that world's exported array (gauntlets appear in the menu automatically).

### Option B – explicit points (closed race circuits)

```js
export const myRace = {
  id: 'my-race', name: 'My Circuit', world: 'desert', type: 'race', closed: true, width: 15, rails: true,
  points: [[0, 0, 0], [120, 4, -40], [200, 8, 60], /* ... [x, y, z] ... */],
  items: [0.1, 0.4, 0.7],                                  // item-box rows ("at" = fraction of the lap)
  obstacles: [{ type: 'boost', at: 0.05 }, { type: 'spinner', at: 0.5, speed: 1.6 }],
  gaps: [{ at: 0.3, len: 14 }], loops: [{ at: 0.6, radius: 16 }], norail: [[0.28, 0.34]],
  coins: [{ at: 0.2, n: 6, lat: -3 }],
};
```

Register it in `js/levels/index.js` (`RACES` holds one race per world; `LEVELS` is the id lookup).
Keep corner radius above ~25 m and put jumps on fairly straight sections.

Obstacle types and their options live at the top of each class in `js/obstacles.js`
(`hammer, spinner, piston, crate, oil, boost, ramp, gate, train, slider, roller, geyser, lava, wind, sand, ice`).
A new world needs an entry in `WORLDS` and `THEMES` in `js/levels/themes.js`.

Quick test URLs: `?auto=race:neon`, `?auto=gauntlet:sky-2`, `?auto=coins:volcano`; add `&autopilot` to let a
bot drive your car.

## Settings & performance

Graphics quality defaults to **Medium** (1× pixel ratio, no shadows). **Low** lowers the render resolution and
particle counts; **High** enables shadows and full-resolution rendering. Repeated objects (props, coins, item
boxes, pillars) are instanced and each car is merged into a few meshes to keep draw calls low.

## Credits

All code, names, characters and designs are original to this project. Libraries: [Three.js](https://threejs.org)
and [PeerJS](https://peerjs.com) (both MIT).

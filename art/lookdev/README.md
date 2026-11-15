# Look-dev

The concept art in `art/concept/` is rendered from real three.js scenes, not painted. The same
models, palette and lighting are meant to carry straight into the game, so what you see in the
stills is what the engine can actually draw.

```
npm install
node render.cjs              # every shot -> ../concept/*.jpg
node render.cjs keyart arena # just these
node render.cjs --scale 0.5  # quick half-size previews
```

Rendering needs Playwright's Chromium (`npx playwright install chromium`). It runs WebGL through
SwiftShader, so it works on machines without a GPU.

| File | What it holds |
| --- | --- |
| `src/palette.js` | Every colour in the game. Start here when changing the look. |
| `src/kit.js` | Modelling helpers: faceted blobs, limbs, spikes, halos, bolts. |
| `src/gloam.js` | Enemy models: Husk, Spitter, Brute, Wraith, Bloater, the Tidecaller. |
| `src/warden.js` | Player: staves, first-person hands, spells, full figure. |
| `src/arena.js` | The Sanctum: floor, pillars, braziers, rifts, Wellspring, sky. |
| `src/overlays.js`, `src/ui.css` | HUD, boon draft, title screen (HTML over the render). |
| `src/shots.js` | Camera, blocking and overlay for each still. |

Open `index.html?shot=keyart` through any static server rooted at `art/` to look at a shot in a browser.

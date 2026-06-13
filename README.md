# MiniCraft 🧱

A small **Minecraft-style voxel game** built with plain **HTML + JavaScript + Three.js** — no build step required. Designed to be dropped into a website as a tab/iframe (and later ported to React for a Next.js app).

## Play it

Because it uses ES modules + an import map, it must be served over HTTP (not opened as a `file://`):

```bash
# any static server works, e.g.:
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed URL and click **Play**.

## Controls

| Action            | Key                       |
| ----------------- | ------------------------- |
| Move              | `W` `A` `S` `D`           |
| Look              | Mouse                     |
| Jump              | `Space`                   |
| Break block       | Left click                |
| Place block       | Right click               |
| Select block      | `1`–`6` or scroll wheel   |
| Pause             | `Esc`                     |

## Features

- Procedurally generated rolling terrain with trees
- 6 block types (grass, dirt, stone, wood, leaves, sand)
- Break & place blocks via raycasting from the crosshair
- First-person controller with gravity, jumping, and AABB collision
- Hotbar UI, FPS + position HUD
- Fully self-contained in three files

## Files

| File         | Purpose                                  |
| ------------ | ---------------------------------------- |
| `index.html` | Markup, HUD, hotbar, Three.js import map |
| `style.css`  | Layout and UI styling                    |
| `game.js`    | The game engine (world, physics, input)  |

## Embedding in your site

The whole game lives inside `#game-container`, so the simplest integration is an iframe:

```html
<iframe src="/minicraft/index.html" style="width:100%;height:600px;border:0"></iframe>
```

## Roadmap / integration with your stack

This prototype is intentionally framework-agnostic. To fit your existing
**TypeScript monorepo** (Next.js 14 / React 18 / NestJS / Socket.IO / Prisma):

- **Next.js (`apps/web`)** — wrap `game.js` as a client component (`"use client"`),
  mounting the canvas in a `useEffect` and cleaning up on unmount.
- **Multiplayer** — emit block break/place events over **Socket.IO** and broadcast
  them so multiple players share one world.
- **Persistence** — store the block edits in **PostgreSQL** via **Prisma** so worlds
  survive a refresh.

These are the "logic" pieces we can build out next.

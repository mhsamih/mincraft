# MiniCraft 🧱🔫

A Minecraft-style game with **two modes** that share **one Three.js engine**,
launched from a menu (`index.html`):

- **🔫 Strike Mode** (`strike.html`) — a voxel shooter with **Socket.IO**
  multiplayer: big open map, visible animated character, first/third-person,
  hitscan gun combat vs **real players**, sound effects, kill feed & scoreboard.
- **🏗️ Classic Mode** (`classic.html`) — a relaxed solo build & break sandbox:
  place/mine blocks, creative flight, first/third-person, block-outline
  highlight. No combat.

No build step for the client; the Node server hosts everything and runs the
Strike multiplayer.

---

## Quick start (with multiplayer)

```bash
npm install
npm start
```

Then open **http://localhost:3000** in two browser tabs/devices and click **Play**.
Both clients share the same seeded world and can shoot each other.

> The server also serves the static files, so this is all you need.

## Play the client alone (no server)

The client degrades gracefully to **solo/offline** if no server is reachable —
just serve the folder statically:

```bash
npx serve .          # then open the printed URL
```

## Connect to a remote server

```
index.html?server=https://your-server-host:3000
```

---

## Controls

| Action | Key |
| --- | --- |
| Move | `W` `A` `S` `D` |
| Look | Mouse |
| Jump | `Space` |
| **Shoot** | Left click (hold to auto-fire) |
| Reload | `R` |
| Place block | Right click |
| Break block | `B` |
| Select block | `1`–`8` or scroll |
| Toggle 1st/3rd person | `F5` |
| Pause | `Esc` |

---

## Features

- **Big procedural map** (seeded so every player sees the same world) with water,
  beaches, forests, and drifting clouds.
- **Procedurally-generated pixel textures** — authentic Minecraft look with zero
  image assets (drawn to canvas, idea borrowed from the *Minecraft JS Edition*
  CodePen).
- **Instanced rendering** — one draw call per block type, so a large world stays
  fast.
- **Visible character** with limb animation; toggle first/third person.
- **Hitscan gun combat** — tracers, muzzle flash, recoil, ammo + reload, hitmarker.
- **Real-time multiplayer (Socket.IO)** — player sync, PvP damage, kill feed,
  scoreboard, respawns, and synced block edits.

---

## Project layout

```
index.html        mode launcher (Strike / Classic)
strike.html       Strike Mode page (the shooter)
classic.html      Classic Mode page (build & break sandbox)
style.css         HUD + UI styling
server.js         Express + Socket.IO server (also serves the files)
package.json      server deps + npm start
src/
  game.js         Strike controller: loop, input, HUD, network glue
  classic-game.js Classic controller: build/break, flight, block outline
  world.js        instanced voxel world, terrain, animated water, clouds
  textures.js     procedural canvas textures + block definitions
  noise.js        deterministic seeded noise + RNG
  character.js    humanoid model (face, limbs) + name tags
  weapons.js      gun view-model, hitscan shooting, tracers
  player.js       physics (accel/sprint/bob/flight) + 1st/3rd-person camera
  network.js      Socket.IO client wrapper (offline fallback)
  sound.js        WebAudio sound effects (no asset files)
```

Both modes import the same `world.js`, `player.js`, `textures.js` and `sound.js`
— one engine, two front-ends.

---

## Wiring into your stack (Next.js + NestJS + Socket.IO + Prisma)

This prototype is structured to drop into your TypeScript monorepo:

- **Frontend (`apps/web`, Next.js 14):** wrap `src/game.js` as a `"use client"`
  component that mounts the canvas in `useEffect` and disposes the renderer on
  unmount. The whole UI lives inside `#game-container`, so it can be a tab.
- **Backend (`apps/api`, NestJS 10):** the protocol in `network.js` / `server.js`
  maps 1:1 onto a `@WebSocketGateway`. Each `socket.on(event)` becomes a
  `@SubscribeMessage(event)` handler; `io.emit` becomes `server.emit`.

  | Client → Server | Server → Client |
  | --- | --- |
  | `join`, `state`, `shoot`, `hit`, `blockEdit` | `init`, `playerJoined`, `playerLeft`, `playerState`, `tracer`, `health`, `death`, `respawn`, `blockEdit`, `scoreboard` |

- **Persistence (Prisma + PostgreSQL):** store `blockEdit`s and per-player kills so
  worlds and stats survive restarts. The server already keeps an ordered
  `blockEdits` log that late joiners replay — swap that array for a Prisma table.

### Security note for a real deployment

This reference server trusts client-reported hits (fine for a prototype/LAN). For
a public game, move hit validation server-side (the server already relays shots),
and add auth (your JWT) to the socket handshake.

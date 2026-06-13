# MiniCraft 🧱🔫

A Minecraft-style game with **two modes**, launched from a menu (`index.html`):

- **🔫 Strike Mode** (`strike.html`) — a voxel shooter built with **Three.js** +
  **Socket.IO**: big open map, visible animated character, first/third-person,
  hitscan gun combat vs **real players**, sound effects, kill feed & scoreboard.
- **🏗️ Classic Mode** (`classic.html`) — build & break the world with the exact
  *Minecraft: JavaScript Edition* engine (by its original author). See
  "Enabling Classic Mode" below — the third-party engine ships empty and you
  paste it into `classic.js` in one step.

No build step for the client; the Node server hosts everything and runs the
Strike multiplayer.

---

## Enabling Classic Mode

`classic.html` loads its engine from `classic.js`, which is intentionally empty
because that engine is a large third-party work. To turn it on:

1. Open the CodePen and copy **only the JavaScript** (the big block that was
   inside `<script type="application/javascript">`, from `var MathGlob = Math`
   to the final `init()`).
2. Paste it at the bottom of **`classic.js`**, below the marker line.
3. Save. `classic.html` already provides the canvas, inputs and shader tags the
   engine needs.

Keep the original author's credit (it shows on the title screen).

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
classic.html      Classic Mode page (build & break engine host)
classic.js        place to paste the Minecraft-JS-Edition engine
style.css         HUD + UI styling
server.js         Express + Socket.IO server (also serves the files)
package.json      server deps + npm start
src/
  game.js         main controller: loop, input, HUD, network glue
  world.js        instanced voxel world, terrain, animated water, clouds
  textures.js     procedural canvas textures + block definitions
  noise.js        deterministic seeded noise + RNG
  character.js    humanoid model (face, limbs) + name tags
  weapons.js      gun view-model, hitscan shooting, tracers
  player.js       physics (accel/sprint/bob) + 1st/3rd-person camera
  network.js      Socket.IO client wrapper (offline fallback)
  sound.js        WebAudio sound effects (no asset files)
```

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

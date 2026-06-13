// MiniCraft reference multiplayer server.
// - Serves the static game files (so you can just run `node server.js`).
// - Runs the Socket.IO game server: player sync, shooting, damage, scoreboard
//   and block-edit broadcasting.
//
// This is intentionally close to a NestJS @WebSocketGateway so the same protocol
// can move into your `apps/api` later: each `socket.on(...)` becomes a
// @SubscribeMessage handler, and `io.emit(...)` becomes `server.emit(...)`.

const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Serve the game (index.html, style.css, src/*).
app.use(express.static(__dirname));

// --- Authoritative-ish game state -------------------------------------------
const SEED = Math.floor(Math.random() * 1e9); // shared map seed for all clients
const players = new Map(); // id -> { id, name, color, x,y,z, yaw, pitch, speed, hp, kills }
const blockEdits = []; // ordered list so late joiners can replay edits

const SPAWN = () => ({
  x: Math.floor((Math.random() - 0.5) * 40) + 0.5,
  y: 30,
  z: Math.floor((Math.random() - 0.5) * 40) + 0.5,
});

function scoreboard() {
  return [...players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    kills: p.kills,
  }));
}

io.on("connection", (socket) => {
  socket.on("join", ({ name }) => {
    const spawn = SPAWN();
    const player = {
      id: socket.id,
      name: name || "Player",
      color: Math.floor(Math.random() * 0xffffff),
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      yaw: 0,
      pitch: 0,
      speed: 0,
      hp: 100,
      kills: 0,
    };
    players.set(socket.id, player);

    // Tell the new player about the world + everyone already here.
    socket.emit("init", {
      id: socket.id,
      seed: SEED,
      players: [...players.values()],
      blocks: blockEdits,
    });

    // Tell everyone else about the new player.
    socket.broadcast.emit("playerJoined", player);
    io.emit("scoreboard", scoreboard());
  });

  socket.on("state", (s) => {
    const p = players.get(socket.id);
    if (!p) return;
    Object.assign(p, s);
    socket.broadcast.emit("playerState", { id: socket.id, ...s });
  });

  socket.on("shoot", ({ origin, dir }) => {
    // Relay the tracer so others can see the shot.
    socket.broadcast.emit("tracer", { shooterId: socket.id, origin, dir });
  });

  socket.on("hit", ({ targetId, damage }) => {
    const victim = players.get(targetId);
    const shooter = players.get(socket.id);
    if (!victim || victim.hp <= 0) return;
    victim.hp = Math.max(0, victim.hp - (damage || 0));
    io.emit("health", { id: targetId, hp: victim.hp });

    if (victim.hp <= 0) {
      if (shooter) shooter.kills += 1;
      io.emit("death", {
        id: targetId,
        victimName: victim.name,
        killerName: shooter ? shooter.name : "world",
      });
      io.emit("scoreboard", scoreboard());

      // Respawn after 3 seconds.
      setTimeout(() => {
        const v = players.get(targetId);
        if (!v) return;
        v.hp = 100;
        const s = SPAWN();
        v.x = s.x;
        v.y = s.y;
        v.z = s.z;
        io.emit("respawn", { id: targetId, pos: { x: v.x, y: v.y, z: v.z } });
      }, 3000);
    }
  });

  socket.on("blockEdit", (edit) => {
    blockEdits.push(edit);
    // Keep the replay log from growing unbounded.
    if (blockEdits.length > 5000) blockEdits.shift();
    socket.broadcast.emit("blockEdit", edit);
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    io.emit("playerLeft", { id: socket.id });
    io.emit("scoreboard", scoreboard());
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`MiniCraft server running:  http://localhost:${PORT}`);
  console.log(`Shared world seed: ${SEED}`);
});

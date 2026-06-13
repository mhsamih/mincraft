// Socket.IO client wrapper. Connects to the multiplayer server, syncs player
// state, shots, hits and block edits. Falls back to a quiet "offline" mode if
// no server is reachable so the game is still playable solo.
//
// The event protocol below is intentionally simple and framework-agnostic so it
// maps directly onto a NestJS @WebSocketGateway in your `apps/api`:
//
//   client -> server : join, state, shoot, hit, blockEdit
//   server -> client : init, playerJoined, playerLeft, playerState,
//                       tracer, health, death, respawn, blockEdit, scoreboard
//
// `io` is provided globally by the socket.io client script in index.html.

export class Network {
  constructor(handlers) {
    this.handlers = handlers; // callbacks into game.js
    this.id = null;
    this.connected = false;
    this.socket = null;
    this._lastSend = 0;
  }

  connect(url, name) {
    if (typeof io === "undefined") {
      console.warn("[net] socket.io not loaded — running offline (solo).");
      this.handlers.onOffline && this.handlers.onOffline();
      return;
    }
    this.name = name;
    // Same-origin if url is empty; otherwise connect to the given server.
    this.socket = url ? io(url, { reconnection: true }) : io({ reconnection: true });

    this.socket.on("connect", () => {
      this.connected = true;
      this.socket.emit("join", { name });
    });

    this.socket.on("disconnect", () => {
      this.connected = false;
    });

    this.socket.on("connect_error", () => {
      // Server not available — degrade to solo so the page still works.
      if (!this._erroredOnce) {
        this._erroredOnce = true;
        console.warn("[net] could not reach server — running offline (solo).");
        this.handlers.onOffline && this.handlers.onOffline();
      }
    });

    // Wire each server event to a handler.
    const h = this.handlers;
    this.socket.on("init", (d) => {
      this.id = d.id;
      h.onInit && h.onInit(d);
    });
    this.socket.on("playerJoined", (d) => h.onPlayerJoined && h.onPlayerJoined(d));
    this.socket.on("playerLeft", (d) => h.onPlayerLeft && h.onPlayerLeft(d));
    this.socket.on("playerState", (d) => h.onPlayerState && h.onPlayerState(d));
    this.socket.on("tracer", (d) => h.onTracer && h.onTracer(d));
    this.socket.on("health", (d) => h.onHealth && h.onHealth(d));
    this.socket.on("death", (d) => h.onDeath && h.onDeath(d));
    this.socket.on("respawn", (d) => h.onRespawn && h.onRespawn(d));
    this.socket.on("blockEdit", (d) => h.onBlockEdit && h.onBlockEdit(d));
    this.socket.on("scoreboard", (d) => h.onScoreboard && h.onScoreboard(d));
  }

  // Throttled position/orientation updates (~20 Hz).
  sendState(state) {
    if (!this.connected) return;
    const now = performance.now();
    if (now - this._lastSend < 50) return;
    this._lastSend = now;
    this.socket.emit("state", state);
  }

  sendShoot(origin, dir) {
    if (this.connected) this.socket.emit("shoot", { origin, dir });
  }

  sendHit(targetId, damage) {
    if (this.connected) this.socket.emit("hit", { targetId, damage });
  }

  sendBlockEdit(action, x, y, z, type) {
    if (this.connected)
      this.socket.emit("blockEdit", { action, x, y, z, type });
  }
}

// MiniCraft — main game controller.
// Wires together the world, local player, weapon, remote players and networking,
// drives the render loop and updates the HUD.

import * as THREE from "three";
import { World, WORLD_RADIUS } from "./world.js";
import { Player } from "./player.js";
import { Weapon, GUN } from "./weapons.js";
import { Network } from "./network.js";
import {
  buildCharacter,
  animateCharacter,
  buildNameTag,
  updateNameTag,
} from "./character.js";
import { BLOCK_NAMES, BLOCK_TYPES, BLOCK_ID } from "./textures.js";
import { Sound, unlockAudio } from "./sound.js";

// --- Renderer / scene --------------------------------------------------------
const canvas = document.getElementById("game-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 30, WORLD_RADIUS * 1.8);

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
scene.add(camera); // so the gun view-model (a child) renders

scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x556b2f, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 0.7);
sun.position.set(30, 60, 20);
scene.add(sun);

// --- Core objects ------------------------------------------------------------
const world = new World(scene);
const myColor = new THREE.Color().setHSL(Math.random(), 0.6, 0.55).getHex();
let player = new Player(scene, camera, world, myColor);
player.sfx = { jump: Sound.jump, step: Sound.step, death: Sound.death };
const weapon = new Weapon(scene, camera);

// Remote players: id -> { group, hitbox, tag, target, hp, name }
const remotes = new Map();

// Generate an initial (offline) world immediately so there's something to see.
world.generate(world.seed);

// --- HUD references ----------------------------------------------------------
const hud = {
  fps: document.getElementById("fps"),
  position: document.getElementById("position"),
  healthFill: document.getElementById("health-fill"),
  ammo: document.getElementById("ammo"),
  scoreboard: document.getElementById("scoreboard"),
  killfeed: document.getElementById("killfeed"),
  hitmarker: document.getElementById("hitmarker"),
  damageFlash: document.getElementById("damage-flash"),
  respawn: document.getElementById("respawn"),
  view: document.getElementById("view-mode"),
  netStatus: document.getElementById("net-status"),
};

// --- Networking --------------------------------------------------------------
const net = new Network({
  onOffline: () => {
    hud.netStatus.textContent = "Offline (solo)";
  },
  onInit: (d) => {
    hud.netStatus.textContent = "Online";
    if (typeof d.seed === "number") {
      world.seed = d.seed;
      world.generate(d.seed);
    }
    // Apply any block edits made before we joined.
    (d.blocks || []).forEach((b) => applyBlockEdit(b, false));
    // Spawn already-connected players.
    (d.players || []).forEach((pl) => {
      if (pl.id !== net.id) addRemote(pl);
    });
    player.respawn();
    updateScoreboard(d.players || []);
  },
  onPlayerJoined: (pl) => addRemote(pl),
  onPlayerLeft: (d) => removeRemote(d.id),
  onPlayerState: (d) => {
    const r = remotes.get(d.id);
    if (r) r.target = d;
  },
  onTracer: (d) => {
    // Visualize someone else's shot.
    const from = new THREE.Vector3(d.origin.x, d.origin.y, d.origin.z);
    const to = from
      .clone()
      .add(new THREE.Vector3(d.dir.x, d.dir.y, d.dir.z).multiplyScalar(GUN.range));
    weapon._spawnTracer(from, to);
  },
  onHealth: (d) => {
    if (d.id === net.id) {
      const dmg = player.hp - d.hp;
      player.hp = d.hp;
      if (dmg > 0) {
        flashDamage();
        Sound.hurt();
      }
      if (player.hp <= 0) player.die();
    } else {
      const r = remotes.get(d.id);
      if (r) {
        r.hp = d.hp;
        updateNameTag(r.tag, d.hp);
      }
    }
  },
  onDeath: (d) => {
    addKillFeed(d.killerName, d.victimName);
    if (d.id === net.id) showRespawn();
  },
  onRespawn: (d) => {
    if (d.id === net.id) {
      player.respawn(d.pos);
      hideRespawn();
    } else {
      const r = remotes.get(d.id);
      if (r) {
        r.hp = 100;
        updateNameTag(r.tag, 100);
      }
    }
  },
  onBlockEdit: (b) => applyBlockEdit(b, false),
  onScoreboard: (list) => updateScoreboard(list),
});

// Read an optional ?server=URL param; default to same-origin.
const params = new URLSearchParams(location.search);
const serverUrl = params.get("server") || "";
const playerName = "Player" + Math.floor(Math.random() * 1000);
net.connect(serverUrl, playerName);

// --- Remote player helpers ---------------------------------------------------
function addRemote(pl) {
  if (remotes.has(pl.id)) return;
  const group = buildCharacter(pl.color || 0xff5555);
  scene.add(group);

  // Invisible hitbox used for shooting (a bit larger than the visible body).
  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 2, 0.8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitbox.position.y = 1;
  group.add(hitbox);

  const tag = buildNameTag(pl.name || "Player");
  group.add(tag);

  remotes.set(pl.id, {
    group,
    hitbox,
    tag,
    hp: pl.hp ?? 100,
    name: pl.name,
    target: pl,
    current: { x: pl.x || 0, y: pl.y || 0, z: pl.z || 0, yaw: 0, speed: 0 },
  });
}

function removeRemote(id) {
  const r = remotes.get(id);
  if (!r) return;
  scene.remove(r.group);
  remotes.delete(id);
}

function updateRemotes(dt) {
  remotes.forEach((r) => {
    const t = r.target;
    const c = r.current;
    // Smoothly interpolate toward the latest network state.
    const k = Math.min(1, dt * 12);
    c.x += (t.x - c.x) * k;
    c.y += (t.y - c.y) * k;
    c.z += (t.z - c.z) * k;
    c.yaw += (t.yaw - c.yaw) * k;
    c.speed = t.speed || 0;
    // Avatar feet sit HEIGHT below the eye position the remote reports.
    r.group.position.set(c.x, c.y - 1.7, c.z);
    r.group.rotation.y = c.yaw;
    animateCharacter(r.group, c.speed, dt, c.speed < 0.2);
  });
}

// --- Block editing -----------------------------------------------------------
function applyBlockEdit(b, broadcast) {
  if (b.action === "remove") world.removeBlock(b.x, b.y, b.z);
  else world.addBlock(b.x, b.y, b.z, BLOCK_NAMES[b.type] || b.type);
  if (broadcast) net.sendBlockEdit(b.action, b.x, b.y, b.z, b.type);
}

// --- Input -------------------------------------------------------------------
const keys = {};
let selectedSlot = 0;

window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code.startsWith("Digit")) {
    const n = parseInt(e.code.slice(5), 10) - 1;
    if (n >= 0 && n < BLOCK_NAMES.length) selectSlot(n);
  }
  if (e.code === "KeyR") {
    if (!weapon.reloading && weapon.ammo < GUN.magSize) Sound.reload();
    weapon.reload();
  }
  if (e.code === "F5") {
    e.preventDefault();
    player.toggleView();
    hud.view.textContent = player.firstPerson ? "1st person" : "3rd person";
  }
});
window.addEventListener("keyup", (e) => (keys[e.code] = false));

const overlay = document.getElementById("overlay");
const playButton = document.getElementById("play-button");
playButton.addEventListener("click", () => {
  unlockAudio();
  canvas.requestPointerLock();
});
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas;
  overlay.classList.toggle("hidden", locked);
});

document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas) return;
  const s = 0.0024;
  player.yaw -= e.movementX * s;
  player.pitch -= e.movementY * s;
  const lim = Math.PI / 2 - 0.01;
  player.pitch = Math.max(-lim, Math.min(lim, player.pitch));
});

// Mouse: left = shoot, right = place block, middle handled elsewhere.
const raycaster = new THREE.Raycaster();
raycaster.far = 8; // reach for placing/breaking blocks
let leftDown = false;

canvas.addEventListener("mousedown", (e) => {
  if (document.pointerLockElement !== canvas) return;
  if (e.button === 0) {
    leftDown = true;
  } else if (e.button === 2) {
    placeBlock();
  }
});
canvas.addEventListener("mouseup", (e) => {
  if (e.button === 0) leftDown = false;
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("wheel", (e) => {
  if (document.pointerLockElement !== canvas) return;
  const dir = e.deltaY > 0 ? 1 : -1;
  selectSlot((selectedSlot + dir + BLOCK_NAMES.length) % BLOCK_NAMES.length);
});

function fire() {
  if (player.dead) return;
  if (!weapon.canShoot()) return;
  const targets = [];
  remotes.forEach((r, id) => targets.push({ id, hitbox: r.hitbox }));
  const origin = new THREE.Vector3();
  camera.getWorldPosition(origin);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);

  const hit = weapon.shoot(world, targets);
  Sound.shoot();
  net.sendShoot(origin, dir);
  if (hit) {
    net.sendHit(hit.id, GUN.damage);
    showHitmarker();
    Sound.hitMark();
  }
}

function placeBlock() {
  if (player.dead) return;
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const target = world.raycast(raycaster);
  if (!target) return;
  const p = target.place;
  // Don't place a block inside the player.
  const dx = p.x + 0.5 - player.pos.x;
  const dz = p.z + 0.5 - player.pos.z;
  const dy = p.y + 0.5 - (player.pos.y - 0.85);
  if (Math.abs(dx) < 0.8 && Math.abs(dz) < 0.8 && Math.abs(dy) < 1.2) return;
  const type = BLOCK_NAMES[selectedSlot];
  world.addBlock(p.x, p.y, p.z, type);
  Sound.place();
  net.sendBlockEdit("add", p.x, p.y, p.z, selectedSlot);
}

function breakBlock() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const target = world.raycast(raycaster);
  if (!target) return;
  const b = target.block;
  world.removeBlock(b.x, b.y, b.z);
  Sound.breakBlock();
  net.sendBlockEdit("remove", b.x, b.y, b.z, 0);
}

// --- Hotbar UI ---------------------------------------------------------------
const hotbarEl = document.getElementById("hotbar");
function buildHotbar() {
  BLOCK_NAMES.forEach((name, i) => {
    const slot = document.createElement("div");
    slot.className = "hotbar-slot";
    const sw = document.createElement("div");
    sw.className = "swatch";
    sw.style.background = BLOCK_TYPES[name].color;
    const label = document.createElement("span");
    label.textContent = `${i + 1}`;
    slot.append(sw, label);
    slot.addEventListener("click", () => selectSlot(i));
    hotbarEl.appendChild(slot);
  });
  selectSlot(0);
}
function selectSlot(i) {
  selectedSlot = i;
  [...hotbarEl.children].forEach((el, idx) =>
    el.classList.toggle("selected", idx === i)
  );
}

// --- HUD feedback ------------------------------------------------------------
function showHitmarker() {
  hud.hitmarker.classList.add("show");
  setTimeout(() => hud.hitmarker.classList.remove("show"), 120);
}
function flashDamage() {
  hud.damageFlash.classList.add("show");
  setTimeout(() => hud.damageFlash.classList.remove("show"), 150);
}
function showRespawn() {
  hud.respawn.classList.remove("hidden");
}
function hideRespawn() {
  hud.respawn.classList.add("hidden");
}
function addKillFeed(killer, victim) {
  const div = document.createElement("div");
  div.className = "kill-entry";
  div.innerHTML = `<b>${killer || "?"}</b> 🔫 <span>${victim || "?"}</span>`;
  hud.killfeed.prepend(div);
  setTimeout(() => div.remove(), 5000);
}
function updateScoreboard(list) {
  if (!Array.isArray(list)) return;
  list.sort((a, b) => (b.kills || 0) - (a.kills || 0));
  hud.scoreboard.innerHTML =
    "<h4>Players</h4>" +
    list
      .map(
        (p) =>
          `<div><span>${p.name || "Player"}</span><b>${p.kills || 0}</b></div>`
      )
      .join("");
}

// Solo respawn (offline) — clicking respawn button restarts the player.
document.getElementById("respawn-btn").addEventListener("click", () => {
  if (!net.connected) {
    player.respawn();
    hideRespawn();
    canvas.requestPointerLock();
  }
});

// --- Main loop ---------------------------------------------------------------
let last = performance.now();
let frames = 0;
let fpsTimer = 0;

function animate(now) {
  requestAnimationFrame(animate);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;

  const playing = document.pointerLockElement === canvas;
  if (playing && !player.dead) {
    player.update(dt, keys);
    // Auto-fire while holding left mouse.
    if (leftDown) fire();
    net.sendState(player.getState());
  } else {
    player.update(dt, {}); // keep camera/gravity sane while paused
  }

  // Smooth FOV kick while sprinting for a sense of speed.
  const targetFov = player.sprinting && player.speed2d > 1 ? 82 : 75;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8);
    camera.updateProjectionMatrix();
  }

  weapon.update(dt);
  world.update(dt);
  updateRemotes(dt);

  // Make name tags face the camera.
  remotes.forEach((r) => r.tag.lookAt(camera.position));

  renderer.render(scene, camera);

  // HUD numbers.
  frames++;
  fpsTimer += dt;
  if (fpsTimer >= 0.4) {
    hud.fps.textContent = `FPS: ${Math.round(frames / fpsTimer)}`;
    hud.position.textContent = `XYZ: ${player.pos.x.toFixed(0)}, ${player.pos.y.toFixed(
      0
    )}, ${player.pos.z.toFixed(0)} | Players: ${remotes.size + 1}`;
    frames = 0;
    fpsTimer = 0;
  }
  hud.healthFill.style.width = Math.max(0, player.hp) + "%";
  hud.ammo.textContent = weapon.reloading
    ? "RELOADING…"
    : `${weapon.ammo} / ${GUN.magSize}`;
}

// We separate "break" from auto-fire: left mouse shoots. Breaking blocks is done
// by holding the secondary action — here we map it to the B key for clarity.
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyB") breakBlock();
});

// --- Resize ------------------------------------------------------------------
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

// --- Boot --------------------------------------------------------------------
buildHotbar();
resize();
requestAnimationFrame(animate);

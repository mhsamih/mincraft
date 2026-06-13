// =============================================================================
//  MiniCraft — a small Minecraft-style voxel game in Three.js
//  -----------------------------------------------------------
//  Everything is plain ES modules so it runs with no build step. To embed it in
//  a website (e.g. a tab/iframe), just serve these three files. Later this can
//  be ported to a React component for the Next.js `apps/web` workspace.
// =============================================================================

import * as THREE from "three";

// -----------------------------------------------------------------------------
//  Block types
//  Each block has a flat color per face (top / side / bottom) so it reads like
//  classic Minecraft without needing texture image assets.
// -----------------------------------------------------------------------------
const BLOCKS = {
  grass: { name: "Grass", top: 0x6abe30, side: 0x8b6d3f, bottom: 0x6b4e2e },
  dirt: { name: "Dirt", top: 0x8b6d3f, side: 0x8b6d3f, bottom: 0x8b6d3f },
  stone: { name: "Stone", top: 0x8f8f8f, side: 0x8f8f8f, bottom: 0x8f8f8f },
  wood: { name: "Wood", top: 0xa9743b, side: 0x6e4a24, bottom: 0xa9743b },
  leaves: { name: "Leaves", top: 0x3f8f3f, side: 0x3f8f3f, bottom: 0x3f8f3f },
  sand: { name: "Sand", top: 0xe0d8a0, side: 0xe0d8a0, bottom: 0xe0d8a0 },
};

// The order blocks appear in the hotbar.
const HOTBAR = ["grass", "dirt", "stone", "wood", "leaves", "sand"];

// World generation parameters.
const WORLD_SIZE = 24; // terrain is WORLD_SIZE x WORLD_SIZE columns
const BASE_HEIGHT = 4; // average ground height

// Player physics constants.
const PLAYER_HEIGHT = 1.7; // eye height above feet
const PLAYER_RADIUS = 0.3;
const GRAVITY = 24;
const JUMP_SPEED = 8.5;
const MOVE_SPEED = 5.0;
const REACH = 6; // how far the player can break/place blocks

// =============================================================================
//  Core engine state
// =============================================================================
const canvas = document.getElementById("game-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 20, 60);

const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);

// Lighting: a soft ambient plus a directional "sun".
scene.add(new THREE.AmbientLight(0xffffff, 0.75));
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(20, 40, 10);
scene.add(sun);

// -----------------------------------------------------------------------------
//  World data
//  Blocks are stored in a Map keyed by "x,y,z" so lookups are O(1). Each entry
//  holds the block type and its Three.js mesh (for removal).
// -----------------------------------------------------------------------------
const world = new Map();
const key = (x, y, z) => `${x},${y},${z}`;

// Shared cube geometry — reused by every block for efficiency.
const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);

// Cache materials per block type so we don't recreate them for every block.
const materialCache = {};
function getMaterials(type) {
  if (materialCache[type]) return materialCache[type];
  const b = BLOCKS[type];
  // BoxGeometry face order: +x, -x, +y(top), -y(bottom), +z, -z
  const mats = [
    new THREE.MeshLambertMaterial({ color: b.side }),
    new THREE.MeshLambertMaterial({ color: b.side }),
    new THREE.MeshLambertMaterial({ color: b.top }),
    new THREE.MeshLambertMaterial({ color: b.bottom }),
    new THREE.MeshLambertMaterial({ color: b.side }),
    new THREE.MeshLambertMaterial({ color: b.side }),
  ];
  materialCache[type] = mats;
  return mats;
}

function addBlock(x, y, z, type) {
  const k = key(x, y, z);
  if (world.has(k)) return;
  const mesh = new THREE.Mesh(cubeGeometry, getMaterials(type));
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  mesh.userData = { x, y, z, type };
  scene.add(mesh);
  world.set(k, { type, mesh });
}

function removeBlock(x, y, z) {
  const k = key(x, y, z);
  const entry = world.get(k);
  if (!entry) return;
  scene.remove(entry.mesh);
  world.delete(k);
}

function hasBlock(x, y, z) {
  return world.has(key(x, y, z));
}

// -----------------------------------------------------------------------------
//  Terrain generation
//  A cheap value-noise heightmap gives gentle rolling hills, then we scatter a
//  few trees on top. Deterministic-ish so the world looks intentional.
// -----------------------------------------------------------------------------
function heightAt(x, z) {
  const n =
    Math.sin(x * 0.3) * 1.5 +
    Math.cos(z * 0.3) * 1.5 +
    Math.sin((x + z) * 0.15) * 2.0;
  return Math.floor(BASE_HEIGHT + n);
}

function generateWorld() {
  const half = WORLD_SIZE / 2;
  for (let x = -half; x < half; x++) {
    for (let z = -half; z < half; z++) {
      const h = heightAt(x, z);
      for (let y = 0; y <= h; y++) {
        let type;
        if (y === h) type = h <= 2 ? "sand" : "grass";
        else if (y > h - 3) type = "dirt";
        else type = "stone";
        addBlock(x, y, z, type);
      }
      // Occasionally grow a tree on grass.
      if (h > 2 && Math.random() < 0.02) {
        growTree(x, h + 1, z);
      }
    }
  }
}

function growTree(x, y, z) {
  const trunk = 4;
  for (let i = 0; i < trunk; i++) addBlock(x, y + i, z, "wood");
  const topY = y + trunk;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) > 3) continue;
        if (dx === 0 && dz === 0 && dy < 1) continue;
        addBlock(x + dx, topY + dy, z + dz, "leaves");
      }
    }
  }
}

// =============================================================================
//  Player & controls
// =============================================================================
const player = {
  // Spawn above the centre column so we drop onto the terrain.
  pos: new THREE.Vector3(0.5, heightAt(0, 0) + 3, 0.5),
  vel: new THREE.Vector3(),
  yaw: 0, // left/right look
  pitch: 0, // up/down look
  onGround: false,
};

const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  // Number keys select hotbar slots.
  if (e.code.startsWith("Digit")) {
    const n = parseInt(e.code.slice(5), 10) - 1;
    if (n >= 0 && n < HOTBAR.length) selectSlot(n);
  }
});
window.addEventListener("keyup", (e) => (keys[e.code] = false));

// --- Pointer lock for mouse look -------------------------------------------
const overlay = document.getElementById("overlay");
const playButton = document.getElementById("play-button");

playButton.addEventListener("click", () => canvas.requestPointerLock());

document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas;
  overlay.classList.toggle("hidden", locked);
});

document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas) return;
  const sensitivity = 0.0025;
  player.yaw -= e.movementX * sensitivity;
  player.pitch -= e.movementY * sensitivity;
  // Clamp so you can't flip upside-down.
  const limit = Math.PI / 2 - 0.01;
  player.pitch = Math.max(-limit, Math.min(limit, player.pitch));
});

// =============================================================================
//  Block interaction (raycast break / place)
// =============================================================================
const raycaster = new THREE.Raycaster();
raycaster.far = REACH;

function getTargetBlock() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera); // centre of screen
  const meshes = [];
  world.forEach((entry) => meshes.push(entry.mesh));
  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length === 0) return null;
  const hit = hits[0];
  const { x, y, z } = hit.object.userData;
  // The face normal tells us which side was hit -> where a new block would go.
  const normal = hit.face.normal;
  return {
    block: { x, y, z },
    place: { x: x + normal.x, y: y + normal.y, z: z + normal.z },
  };
}

canvas.addEventListener("mousedown", (e) => {
  if (document.pointerLockElement !== canvas) return;
  const target = getTargetBlock();
  if (!target) return;

  if (e.button === 0) {
    // Left click: break.
    removeBlock(target.block.x, target.block.y, target.block.z);
  } else if (e.button === 2) {
    // Right click: place selected block, unless it would intersect the player.
    const p = target.place;
    if (!wouldCollideWithPlayer(p.x, p.y, p.z)) {
      addBlock(p.x, p.y, p.z, HOTBAR[selectedSlot]);
    }
  }
});

// Stop the browser context menu so right-click can place blocks.
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// Scroll wheel cycles the hotbar.
canvas.addEventListener("wheel", (e) => {
  if (document.pointerLockElement !== canvas) return;
  const dir = e.deltaY > 0 ? 1 : -1;
  selectSlot((selectedSlot + dir + HOTBAR.length) % HOTBAR.length);
});

// =============================================================================
//  Hotbar UI
// =============================================================================
let selectedSlot = 0;
const hotbarEl = document.getElementById("hotbar");

function buildHotbar() {
  HOTBAR.forEach((type, i) => {
    const slot = document.createElement("div");
    slot.className = "hotbar-slot";
    const swatch = document.createElement("div");
    swatch.className = "swatch";
    swatch.style.background =
      "#" + BLOCKS[type].top.toString(16).padStart(6, "0");
    const label = document.createElement("span");
    label.textContent = `${i + 1} ${BLOCKS[type].name}`;
    slot.appendChild(swatch);
    slot.appendChild(label);
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

// =============================================================================
//  Physics & collision
//  AABB collision against the voxel grid, resolved one axis at a time so the
//  player slides along walls instead of sticking.
// =============================================================================
function wouldCollideWithPlayer(bx, by, bz) {
  const px = player.pos.x;
  const py = player.pos.y;
  const pz = player.pos.z;
  // Player AABB spans from feet (py - PLAYER_HEIGHT) to head (py).
  return (
    bx + 1 > px - PLAYER_RADIUS &&
    bx < px + PLAYER_RADIUS &&
    bz + 1 > pz - PLAYER_RADIUS &&
    bz < pz + PLAYER_RADIUS &&
    by + 1 > py - PLAYER_HEIGHT &&
    by < py
  );
}

function collidesAt(px, py, pz) {
  const minX = Math.floor(px - PLAYER_RADIUS);
  const maxX = Math.floor(px + PLAYER_RADIUS);
  const minZ = Math.floor(pz - PLAYER_RADIUS);
  const maxZ = Math.floor(pz + PLAYER_RADIUS);
  const minY = Math.floor(py - PLAYER_HEIGHT);
  const maxY = Math.floor(py);
  for (let x = minX; x <= maxX; x++)
    for (let y = minY; y <= maxY; y++)
      for (let z = minZ; z <= maxZ; z++)
        if (hasBlock(x, y, z)) return true;
  return false;
}

function updatePhysics(dt) {
  // Build a movement vector from input, relative to where we're looking.
  const forward = new THREE.Vector3(
    -Math.sin(player.yaw),
    0,
    -Math.cos(player.yaw)
  );
  const right = new THREE.Vector3(
    Math.cos(player.yaw),
    0,
    -Math.sin(player.yaw)
  );

  const move = new THREE.Vector3();
  if (keys["KeyW"]) move.add(forward);
  if (keys["KeyS"]) move.sub(forward);
  if (keys["KeyD"]) move.add(right);
  if (keys["KeyA"]) move.sub(right);
  if (move.lengthSq() > 0) move.normalize().multiplyScalar(MOVE_SPEED);

  player.vel.x = move.x;
  player.vel.z = move.z;

  // Gravity.
  player.vel.y -= GRAVITY * dt;

  if (keys["Space"] && player.onGround) {
    player.vel.y = JUMP_SPEED;
    player.onGround = false;
  }

  // Move and resolve collisions per-axis.
  const p = player.pos;

  p.x += player.vel.x * dt;
  if (collidesAt(p.x, p.y, p.z)) {
    p.x -= player.vel.x * dt;
    player.vel.x = 0;
  }

  p.z += player.vel.z * dt;
  if (collidesAt(p.x, p.y, p.z)) {
    p.z -= player.vel.z * dt;
    player.vel.z = 0;
  }

  player.onGround = false;
  p.y += player.vel.y * dt;
  if (collidesAt(p.x, p.y, p.z)) {
    if (player.vel.y < 0) player.onGround = true; // landed
    p.y -= player.vel.y * dt;
    player.vel.y = 0;
  }

  // Safety net: if you somehow fall out of the world, respawn.
  if (p.y < -20) {
    p.set(0.5, heightAt(0, 0) + 3, 0.5);
    player.vel.set(0, 0, 0);
  }
}

// =============================================================================
//  Render loop
// =============================================================================
const fpsEl = document.getElementById("fps");
const posEl = document.getElementById("position");
let lastTime = performance.now();
let frameCount = 0;
let fpsTimer = 0;

function animate(now) {
  requestAnimationFrame(animate);
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.1) dt = 0.1; // clamp big hitches (e.g. tab was backgrounded)

  // Only run player physics while actively playing (pointer locked).
  if (document.pointerLockElement === canvas) {
    updatePhysics(dt);
  }

  // Sync camera to the player's eyes and look direction.
  camera.position.copy(player.pos);
  const dir = new THREE.Vector3(
    -Math.sin(player.yaw) * Math.cos(player.pitch),
    Math.sin(player.pitch),
    -Math.cos(player.yaw) * Math.cos(player.pitch)
  );
  camera.lookAt(player.pos.clone().add(dir));

  renderer.render(scene, camera);

  // Update the HUD a few times a second.
  frameCount++;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    fpsEl.textContent = `FPS: ${Math.round(frameCount / fpsTimer)}`;
    posEl.textContent = `XYZ: ${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(
      1
    )}, ${player.pos.z.toFixed(1)}`;
    frameCount = 0;
    fpsTimer = 0;
  }
}

// =============================================================================
//  Resize handling — keeps the game crisp inside any container size
// =============================================================================
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

// =============================================================================
//  Boot
// =============================================================================
generateWorld();
buildHotbar();
resize();
requestAnimationFrame(animate);

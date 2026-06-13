// Classic Mode — a Three.js build & break sandbox that shares the same engine
// as Strike Mode (world, player, textures, sound). Solo/offline, no combat:
// left click breaks a block, right click places the selected block. Creative
// flight (double-tap Space), first/third-person, and a targeted-block outline.

import * as THREE from "three";
import { World } from "./world.js";
import { Player } from "./player.js";
import { BLOCK_NAMES, BLOCK_TYPES } from "./textures.js";
import { Sound, unlockAudio } from "./sound.js";

// --- Renderer / scene --------------------------------------------------------
const canvas = document.getElementById("game-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const world = new World(scene);
scene.fog = new THREE.Fog(0x87ceeb, 30, 120);

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x556b2f, 0.95));
const sun = new THREE.DirectionalLight(0xffffff, 0.7);
sun.position.set(30, 60, 20);
scene.add(sun);

const player = new Player(scene, camera, world, 0x9acd32);
player.sfx = { jump: Sound.jump, step: Sound.step };

// Targeted-block outline (wireframe cube that snaps to the block under the
// crosshair).
const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.001, 1.001, 1.001)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 })
);
outline.visible = false;
scene.add(outline);

// --- HUD references ----------------------------------------------------------
const hud = {
  fps: document.getElementById("fps"),
  position: document.getElementById("position"),
  view: document.getElementById("view-mode"),
  fly: document.getElementById("fly-mode"),
};
const hotbarEl = document.getElementById("hotbar");
let selectedSlot = 0;

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

// --- Input -------------------------------------------------------------------
const keys = {};
let lastSpace = 0;

window.addEventListener("keydown", (e) => {
  if (e.repeat) {
    keys[e.code] = true;
    return;
  }
  keys[e.code] = true;

  if (e.code.startsWith("Digit")) {
    const n = parseInt(e.code.slice(5), 10) - 1;
    if (n >= 0 && n < BLOCK_NAMES.length) selectSlot(n);
  }
  if (e.code === "F5") {
    e.preventDefault();
    player.toggleView();
    hud.view.textContent = player.firstPerson ? "1st person" : "3rd person";
  }
  // Double-tap Space toggles creative flight.
  if (e.code === "Space") {
    const now = performance.now();
    if (now - lastSpace < 300) {
      player.flying = !player.flying;
      player.vel.y = 0;
      hud.fly.textContent = player.flying ? "Flying: ON" : "Flying: OFF";
    }
    lastSpace = now;
  }
});
window.addEventListener("keyup", (e) => (keys[e.code] = false));

// --- World creation menu -----------------------------------------------------
const creation = document.getElementById("creation");
const overlay = document.getElementById("overlay");
const opts = { type: true, trees: true, caves: true, seed: (Math.random() * 1e9) | 0 };

// Each toggle button flips its state and updates its own label.
function bindToggle(id, key, onLabel, offLabel) {
  const btn = document.getElementById(id);
  btn.addEventListener("click", () => {
    opts[key] = !opts[key];
    btn.dataset.on = opts[key];
    btn.textContent = opts[key] ? onLabel : offLabel;
  });
}
bindToggle("opt-type", "type", "World Type: Normal", "World Type: Superflat");
bindToggle("opt-trees", "trees", "Trees: On", "Trees: Off");
bindToggle("opt-caves", "caves", "Caves: On", "Caves: Off");
document.getElementById("opt-seed").addEventListener("click", () => {
  opts.seed = (Math.random() * 1e9) | 0;
});

let started = false;
document.getElementById("create-button").addEventListener("click", () => {
  world.seed = opts.seed;
  world.generate(opts.seed, {
    superflat: !opts.type, // "type" true = Normal, false = Superflat
    trees: opts.trees,
    caves: opts.caves,
  });
  player.respawn();
  started = true;
  creation.classList.add("hidden");
  overlay.classList.remove("hidden");
});

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

const raycaster = new THREE.Raycaster();
raycaster.far = 7;

canvas.addEventListener("mousedown", (e) => {
  if (document.pointerLockElement !== canvas) return;
  if (e.button === 0) breakBlock();
  else if (e.button === 2) placeBlock();
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("wheel", (e) => {
  if (document.pointerLockElement !== canvas) return;
  const dir = e.deltaY > 0 ? 1 : -1;
  selectSlot((selectedSlot + dir + BLOCK_NAMES.length) % BLOCK_NAMES.length);
});

function targetBlock() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  return world.raycast(raycaster);
}

function breakBlock() {
  const t = targetBlock();
  if (!t) return;
  world.removeBlock(t.block.x, t.block.y, t.block.z);
  Sound.breakBlock();
}

function placeBlock() {
  const t = targetBlock();
  if (!t) return;
  const p = t.place;
  // Don't place inside the player's body.
  const dx = p.x + 0.5 - player.pos.x;
  const dz = p.z + 0.5 - player.pos.z;
  const dy = p.y + 0.5 - (player.pos.y - 0.85);
  if (Math.abs(dx) < 0.8 && Math.abs(dz) < 0.8 && Math.abs(dy) < 1.2) return;
  world.addBlock(p.x, p.y, p.z, BLOCK_NAMES[selectedSlot]);
  Sound.place();
}

// --- Loop --------------------------------------------------------------------
let last = performance.now();
let frames = 0;
let fpsTimer = 0;

function animate(now) {
  requestAnimationFrame(animate);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;

  // Don't simulate until a world has been created.
  if (!started) {
    world.update(dt);
    renderer.render(scene, camera);
    return;
  }

  const playing = document.pointerLockElement === canvas;
  player.update(dt, playing ? keys : {});
  world.update(dt);

  // Update the block-outline highlight.
  if (playing) {
    const t = targetBlock();
    if (t) {
      outline.visible = true;
      outline.position.set(t.block.x + 0.5, t.block.y + 0.5, t.block.z + 0.5);
    } else {
      outline.visible = false;
    }
  } else {
    outline.visible = false;
  }

  renderer.render(scene, camera);

  frames++;
  fpsTimer += dt;
  if (fpsTimer >= 0.4) {
    hud.fps.textContent = `FPS: ${Math.round(frames / fpsTimer)}`;
    hud.position.textContent = `XYZ: ${player.pos.x.toFixed(0)}, ${player.pos.y.toFixed(
      0
    )}, ${player.pos.z.toFixed(0)}`;
    frames = 0;
    fpsTimer = 0;
  }
}

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

buildHotbar();
resize();
requestAnimationFrame(animate);

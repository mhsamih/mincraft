// Blocky, Minecraft-style passive animals that wander the world. Each animal is
// built from simple boxes, follows the terrain surface, walks in a slow random
// walk and turns back at water / map edges. Pure cosmetic ambience — no
// collision or combat. Includes camels, cows, sheep and chickens (no pigs).

import * as THREE from "three";
import { WORLD_RADIUS, WATER_LEVEL } from "./world.js";

function box(w, h, d, color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
}

// A leg as a pivot group at hip height so it can swing. The mesh hangs down so
// the animal's feet rest at the group's y=0 plane.
function makeLeg(parent, w, h, d, color, x, z, hipY) {
  const pivot = new THREE.Group();
  pivot.position.set(x, hipY, z);
  const mesh = box(w, h, d, color);
  mesh.position.y = -h / 2;
  pivot.add(mesh);
  parent.add(pivot);
  return pivot;
}

// --- Per-species builders. Each returns { group, legs, walkSpeed, scale } -----

function buildCamel() {
  const g = new THREE.Group();
  const tan = 0xc99a5b;
  const dark = 0x9c7240;
  const legH = 1.0;
  const legs = [
    makeLeg(g, 0.18, legH, 0.18, dark, -0.22, -0.5, legH),
    makeLeg(g, 0.18, legH, 0.18, dark, 0.22, -0.5, legH),
    makeLeg(g, 0.18, legH, 0.18, dark, -0.22, 0.5, legH),
    makeLeg(g, 0.18, legH, 0.18, dark, 0.22, 0.5, legH),
  ];
  const body = box(0.7, 0.6, 1.5, tan);
  body.position.set(0, legH + 0.3, 0);
  g.add(body);
  const hump = box(0.5, 0.45, 0.7, tan);
  hump.position.set(0, legH + 0.75, 0.05);
  g.add(hump);
  // Long neck angled up toward the front (-z).
  const neck = box(0.28, 0.8, 0.3, tan);
  neck.position.set(0, legH + 0.7, -0.7);
  neck.rotation.x = 0.5;
  g.add(neck);
  const head = box(0.34, 0.34, 0.55, tan);
  head.position.set(0, legH + 1.05, -0.95);
  g.add(head);
  for (const ex of [-0.1, 0.1]) {
    const ear = box(0.08, 0.12, 0.08, dark);
    ear.position.set(ex, legH + 1.25, -0.85);
    g.add(ear);
  }
  return { group: g, legs, walkSpeed: 1.3, scale: 1.15 };
}

function buildCow() {
  const g = new THREE.Group();
  const body = 0x6f4f38;
  const white = 0xefe7d8;
  const legH = 0.55;
  const legColor = 0x4a3525;
  const legs = [
    makeLeg(g, 0.18, legH, 0.18, legColor, -0.22, -0.42, legH),
    makeLeg(g, 0.18, legH, 0.18, legColor, 0.22, -0.42, legH),
    makeLeg(g, 0.18, legH, 0.18, legColor, -0.22, 0.42, legH),
    makeLeg(g, 0.18, legH, 0.18, legColor, 0.22, 0.42, legH),
  ];
  const torso = box(0.66, 0.62, 1.2, body);
  torso.position.set(0, legH + 0.28, 0);
  g.add(torso);
  // A white patch on the flank.
  const patch = box(0.68, 0.34, 0.5, white);
  patch.position.set(0, legH + 0.25, 0.25);
  g.add(patch);
  const head = box(0.46, 0.44, 0.42, white);
  head.position.set(0, legH + 0.5, -0.72);
  g.add(head);
  const snout = box(0.3, 0.22, 0.12, 0xc99a9a);
  snout.position.set(0, legH + 0.42, -0.94);
  g.add(snout);
  for (const ex of [-0.26, 0.26]) {
    const horn = box(0.08, 0.08, 0.14, white);
    horn.position.set(ex, legH + 0.66, -0.66);
    g.add(horn);
  }
  return { group: g, legs, walkSpeed: 1.0, scale: 1.0 };
}

function buildSheep() {
  const g = new THREE.Group();
  const wool = 0xe9e9e4;
  const skin = 0xd9b08c;
  const legH = 0.5;
  const legColor = 0x3a3a3a;
  const legs = [
    makeLeg(g, 0.16, legH, 0.16, legColor, -0.2, -0.36, legH),
    makeLeg(g, 0.16, legH, 0.16, legColor, 0.2, -0.36, legH),
    makeLeg(g, 0.16, legH, 0.16, legColor, -0.2, 0.36, legH),
    makeLeg(g, 0.16, legH, 0.16, legColor, 0.2, 0.36, legH),
  ];
  const fleece = box(0.78, 0.74, 1.0, wool);
  fleece.position.set(0, legH + 0.34, 0);
  g.add(fleece);
  const head = box(0.36, 0.4, 0.36, skin);
  head.position.set(0, legH + 0.5, -0.6);
  g.add(head);
  const woolTuft = box(0.42, 0.2, 0.2, wool);
  woolTuft.position.set(0, legH + 0.66, -0.5);
  g.add(woolTuft);
  return { group: g, legs, walkSpeed: 1.1, scale: 1.0 };
}

function buildChicken() {
  const g = new THREE.Group();
  const white = 0xf4f4f4;
  const legColor = 0xe0992a;
  const legH = 0.28;
  const legs = [
    makeLeg(g, 0.07, legH, 0.07, legColor, -0.1, 0, legH),
    makeLeg(g, 0.07, legH, 0.07, legColor, 0.1, 0, legH),
  ];
  const body = box(0.36, 0.4, 0.5, white);
  body.position.set(0, legH + 0.22, 0);
  g.add(body);
  // Little wings on the sides.
  for (const ex of [-0.2, 0.2]) {
    const wing = box(0.06, 0.3, 0.36, 0xe6e6e6);
    wing.position.set(ex, legH + 0.24, 0);
    g.add(wing);
  }
  const head = box(0.26, 0.28, 0.26, white);
  head.position.set(0, legH + 0.56, -0.22);
  g.add(head);
  const comb = box(0.1, 0.1, 0.18, 0xd23a3a);
  comb.position.set(0, legH + 0.74, -0.2);
  g.add(comb);
  const beak = box(0.1, 0.08, 0.14, legColor);
  beak.position.set(0, legH + 0.54, -0.4);
  g.add(beak);
  return { group: g, legs, walkSpeed: 1.4, scale: 0.9 };
}

const BUILDERS = {
  camel: buildCamel,
  cow: buildCow,
  sheep: buildSheep,
  chicken: buildChicken,
};

// --- Herd manager ------------------------------------------------------------
export class Animals {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
  }

  clear() {
    for (const a of this.list) this.scene.remove(a.group);
    this.list = [];
  }

  // Find a random land spot (above water) and return [x, z, surfaceY] or null.
  _findSpot() {
    const R = WORLD_RADIUS - 3;
    for (let tries = 0; tries < 30; tries++) {
      const x = Math.floor((Math.random() - 0.5) * 2 * R);
      const z = Math.floor((Math.random() - 0.5) * 2 * R);
      const sy = this.world.surfaceY(x, z);
      if (sy > WATER_LEVEL) return [x + 0.5, z + 0.5, sy];
    }
    return null;
  }

  spawnOne(kind) {
    const spot = this._findSpot();
    if (!spot) return;
    const build = (BUILDERS[kind] || buildCow)();
    const g = build.group;
    g.scale.setScalar(build.scale);
    g.position.set(spot[0], spot[2] + 1, spot[1]);
    g.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(g);
    this.list.push({
      kind,
      group: g,
      legs: build.legs,
      walkSpeed: build.walkSpeed,
      heading: g.rotation.y,
      speed: 0,
      moving: Math.random() < 0.6,
      timer: 1 + Math.random() * 3,
      phase: Math.random() * 6,
    });
  }

  // Populate a fresh herd. Guarantees a couple of camels (as requested).
  populate(total = 9) {
    this.clear();
    this.spawnOne("camel");
    this.spawnOne("camel");
    const kinds = ["cow", "sheep", "chicken", "camel"];
    for (let i = 0; i < total - 2; i++) {
      this.spawnOne(kinds[Math.floor(Math.random() * kinds.length)]);
    }
  }

  update(dt) {
    const R = WORLD_RADIUS - 2;
    for (const a of this.list) {
      // Occasionally change behaviour: start/stop walking and pick a new heading.
      a.timer -= dt;
      if (a.timer <= 0) {
        a.timer = 1.5 + Math.random() * 3.5;
        a.moving = Math.random() < 0.7;
        if (a.moving) a.heading += (Math.random() - 0.5) * 2.2;
      }

      const target = a.moving ? a.walkSpeed : 0;
      a.speed += (target - a.speed) * Math.min(1, dt * 4);

      const g = a.group;
      if (a.speed > 0.05) {
        const nx = g.position.x - Math.sin(a.heading) * a.speed * dt;
        const nz = g.position.z - Math.cos(a.heading) * a.speed * dt;
        const sy = this.world.surfaceY(Math.floor(nx), Math.floor(nz));
        const blocked =
          Math.abs(nx) > R || Math.abs(nz) > R || sy <= WATER_LEVEL || sy < 0;
        if (blocked) {
          // Turn away from the obstacle/water and wait a beat.
          a.heading += 2.0 + Math.random();
          a.moving = false;
          a.timer = 0.6 + Math.random();
        } else {
          g.position.x = nx;
          g.position.z = nz;
          // Glide vertically toward the new ground height (top of surface block).
          const groundY = sy + 1;
          g.position.y += (groundY - g.position.y) * Math.min(1, dt * 8);
        }
      }

      // Face the heading and swing the legs while moving.
      g.rotation.y += (a.heading - g.rotation.y) * Math.min(1, dt * 6);
      a.phase += dt * (a.speed * 5 + 0.5);
      const amp = Math.min(a.speed * 0.5, 0.7);
      a.legs.forEach((leg, i) => {
        // Diagonal gait: legs 0 & 3 swing together, 1 & 2 opposite.
        const sign = i === 0 || i === 3 ? 1 : -1;
        leg.rotation.x = Math.sin(a.phase) * amp * sign;
      });
    }
  }
}

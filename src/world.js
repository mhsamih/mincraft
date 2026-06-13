// The voxel world. Uses one THREE.InstancedMesh per block type so a large map
// renders in a handful of draw calls instead of thousands of meshes. Terrain is
// generated deterministically from a shared seed so all networked players see
// the same world.

import * as THREE from "three";
import { heightAt, hash2 } from "./noise.js";
import { BLOCK_TYPES, BLOCK_NAMES, BLOCK_ID } from "./textures.js";

export const WORLD_RADIUS = 40; // map spans [-R, R] on X and Z
export const WATER_LEVEL = 5;
const MAX_INSTANCES = 60000; // per block type

const _matrix = new THREE.Matrix4();
const _vec = new THREE.Vector3();

export class World {
  constructor(scene) {
    this.scene = scene;
    this.seed = 1337;

    // Source of truth: key "x,y,z" -> { type, id, index }
    this.blocks = new Map();

    // Per block-type instanced mesh + bookkeeping for add/swap-remove.
    this.meshes = {};
    const geo = new THREE.BoxGeometry(1, 1, 1);
    BLOCK_NAMES.forEach((name) => {
      const inst = new THREE.InstancedMesh(geo, BLOCK_TYPES[name].materials, MAX_INSTANCES);
      inst.count = 0;
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.frustumCulled = false;
      scene.add(inst);
      this.meshes[name] = { inst, keys: [] }; // keys[index] = world key
    });

    this._buildSky();
  }

  key(x, y, z) {
    return x + "," + y + "," + z;
  }

  has(x, y, z) {
    return this.blocks.has(this.key(x, y, z));
  }

  // --- Instance management ---------------------------------------------------
  addBlock(x, y, z, type) {
    const k = this.key(x, y, z);
    if (this.blocks.has(k)) return;
    const m = this.meshes[type];
    if (!m) return;
    const index = m.inst.count;
    if (index >= MAX_INSTANCES) return;
    _matrix.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
    m.inst.setMatrixAt(index, _matrix);
    m.inst.count = index + 1;
    m.inst.instanceMatrix.needsUpdate = true;
    m.keys[index] = k;
    this.blocks.set(k, { type, index });
  }

  removeBlock(x, y, z) {
    const k = this.key(x, y, z);
    const entry = this.blocks.get(k);
    if (!entry) return;
    const m = this.meshes[entry.type];
    const last = m.inst.count - 1;
    // Swap-remove: move the last instance into the freed slot.
    if (entry.index !== last) {
      m.inst.getMatrixAt(last, _matrix);
      m.inst.setMatrixAt(entry.index, _matrix);
      const movedKey = m.keys[last];
      m.keys[entry.index] = movedKey;
      const moved = this.blocks.get(movedKey);
      if (moved) moved.index = entry.index;
    }
    m.inst.count = last;
    m.inst.instanceMatrix.needsUpdate = true;
    m.keys.length = last;
    this.blocks.delete(k);
  }

  // --- Terrain generation ----------------------------------------------------
  generate(seed) {
    this.seed = seed;
    // Clear any existing blocks.
    BLOCK_NAMES.forEach((name) => {
      this.meshes[name].inst.count = 0;
      this.meshes[name].keys.length = 0;
      this.meshes[name].inst.instanceMatrix.needsUpdate = true;
    });
    this.blocks.clear();

    const R = WORLD_RADIUS;
    for (let x = -R; x <= R; x++) {
      for (let z = -R; z <= R; z++) {
        const h = heightAt(x, z, seed);
        for (let y = 0; y <= h; y++) {
          let type;
          if (y === h) {
            if (h <= WATER_LEVEL + 1) type = "sand";
            else if (h > 16) type = "stone";
            else type = "grass";
          } else if (y > h - 3) {
            type = h <= WATER_LEVEL + 1 ? "sand" : "dirt";
          } else {
            type = "stone";
          }
          this.addBlock(x, y, z, type);
        }
        // Deterministic trees on grass above the waterline.
        if (h > WATER_LEVEL + 1 && h <= 16 && hash2(x, z, seed ^ 0x9e37) < 0.018) {
          this._growTree(x, h + 1, z);
        }
      }
    }
  }

  _growTree(x, y, z) {
    // Trunk height varies a little for a more natural forest.
    const trunk = 4 + Math.floor(hash2(x, z, this.seed ^ 0x55) * 3); // 4..6
    for (let i = 0; i < trunk; i++) this.addBlock(x, y + i, z, "log");
    const topY = y + trunk;

    // Full leaf canopy: two wide 5x5 layers, then a tighter 3x3, then a cap —
    // closer to the dense oak canopies in the reference screenshots.
    const layer = (cy, radius, skipCorners) => {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx === 0 && dz === 0 && cy < topY) continue; // keep trunk clear
          if (skipCorners && Math.abs(dx) === radius && Math.abs(dz) === radius) {
            // Randomly trim corners so the canopy isn't a perfect square.
            if (hash2(x + dx, z + dz, this.seed ^ cy) < 0.5) continue;
          }
          this.addBlock(x + dx, cy, z + dz, "leaves");
        }
      }
    };
    layer(topY - 2, 2, true);
    layer(topY - 1, 2, true);
    layer(topY, 1, false);
    this.addBlock(x, topY + 1, z, "leaves");
  }

  // --- Sky: gradient backdrop, water plane, drifting clouds ------------------
  _buildSky() {
    const R = WORLD_RADIUS;

    // Translucent, gently rippling water plane across the whole map. The plane
    // is subdivided so we can animate small waves in update().
    const seg = 40;
    const waterGeo = new THREE.PlaneGeometry((R + 1) * 2, (R + 1) * 2, seg, seg);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshLambertMaterial({
      color: 0x2f78c4,
      transparent: true,
      opacity: 0.72,
    });
    this.water = new THREE.Mesh(waterGeo, waterMat);
    this.water.position.set(0, WATER_LEVEL + 0.85, 0);
    this.scene.add(this.water);
    // Cache the flat baseline so waves are applied relative to it each frame.
    this.waterBaseY = Float32Array.from(
      waterGeo.attributes.position.array
    );

    // A few blocky clouds that drift slowly.
    this.clouds = new THREE.Group();
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
    });
    const cloudGeo = new THREE.BoxGeometry(6, 1.2, 4);
    for (let i = 0; i < 18; i++) {
      const c = new THREE.Mesh(cloudGeo, cloudMat);
      c.position.set(
        (Math.random() - 0.5) * R * 2.5,
        34 + Math.random() * 6,
        (Math.random() - 0.5) * R * 2.5
      );
      c.scale.set(1 + Math.random() * 2, 1, 1 + Math.random() * 2);
      this.clouds.add(c);
    }
    this.scene.add(this.clouds);
  }

  update(dt) {
    // Drift clouds and wrap them around the map.
    const R = WORLD_RADIUS;
    for (const c of this.clouds.children) {
      c.position.x += dt * 1.2;
      if (c.position.x > R * 1.5) c.position.x = -R * 1.5;
    }
    // Ripple the water surface by displacing its vertices around the baseline.
    const t = performance.now() * 0.0012;
    const pos = this.water.geometry.attributes.position;
    const base = this.waterBaseY;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const z = base[i * 3 + 2];
      pos.array[i * 3 + 1] =
        Math.sin(x * 0.25 + t * 2) * 0.06 + Math.cos(z * 0.3 + t * 1.6) * 0.05;
    }
    pos.needsUpdate = true;
  }

  // Raycast helper: returns { block:{x,y,z}, place:{x,y,z} } or null.
  raycast(raycaster) {
    const objects = BLOCK_NAMES.map((n) => this.meshes[n].inst).filter(
      (m) => m.count > 0
    );
    const hits = raycaster.intersectObjects(objects, false);
    if (hits.length === 0) return null;
    const hit = hits[0];
    const m = Object.values(this.meshes).find((mm) => mm.inst === hit.object);
    const k = m.keys[hit.instanceId];
    if (!k) return null;
    const [x, y, z] = k.split(",").map(Number);
    const n = hit.face.normal;
    return {
      block: { x, y, z },
      place: { x: x + n.x, y: y + n.y, z: z + n.z },
      distance: hit.distance,
      point: hit.point,
    };
  }
}

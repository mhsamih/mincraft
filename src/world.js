// The voxel world. Uses one THREE.InstancedMesh per block type. Only blocks that
// touch air (an exposed face) get an instance — interior-face culling — so a
// large map renders far fewer instances and stays fast. Terrain is generated
// deterministically from a shared seed (so networked players match) and can
// carve 3D-noise caves.

import * as THREE from "three";
import { heightAt, hash2, isCave } from "./noise.js";
import { BLOCK_TYPES, BLOCK_NAMES } from "./textures.js";

export const WORLD_RADIUS = 40; // map spans [-R, R] on X and Z
export const WATER_LEVEL = 20; // low ground below this is beach / water
const MAX_INSTANCES = 60000; // per block type

const _matrix = new THREE.Matrix4();
const NEIGHBORS = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

export class World {
  constructor(scene) {
    this.scene = scene;
    this.seed = 1337;

    // Logical world (collision + neighbour lookups): key "x,y,z" -> type name.
    this.solid = new Map();
    // Rendered subset: key -> { type, index }. Only exposed blocks are here.
    this.rendered = new Map();

    // Per block-type instanced mesh + the world-key for each instance index.
    this.meshes = {};
    const geo = new THREE.BoxGeometry(1, 1, 1);
    BLOCK_NAMES.forEach((name) => {
      const inst = new THREE.InstancedMesh(geo, BLOCK_TYPES[name].materials, MAX_INSTANCES);
      inst.count = 0;
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.frustumCulled = false;
      // A fixed, huge bounding sphere so raycasting never early-outs (even for
      // blocks placed far from origin, where the auto-computed sphere would be
      // stale). Per-instance tests still give exact hits.
      inst.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 100000);
      scene.add(inst);
      this.meshes[name] = { inst, keys: [] };
    });

    this._buildSky();
  }

  key(x, y, z) {
    return x + "," + y + "," + z;
  }

  has(x, y, z) {
    return this.solid.has(this.key(x, y, z));
  }

  _isExposed(x, y, z) {
    for (const [dx, dy, dz] of NEIGHBORS) {
      if (!this.solid.has(this.key(x + dx, y + dy, z + dz))) return true;
    }
    return false;
  }

  // --- Instance management (driven by `refresh`) -----------------------------
  _create(x, y, z, key, type) {
    const m = this.meshes[type];
    const index = m.inst.count;
    if (index >= MAX_INSTANCES) return;
    _matrix.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
    m.inst.setMatrixAt(index, _matrix);
    m.inst.count = index + 1;
    m.inst.instanceMatrix.needsUpdate = true;
    m.keys[index] = key;
    this.rendered.set(key, { type, index });
  }

  _destroy(key) {
    const r = this.rendered.get(key);
    if (!r) return;
    const m = this.meshes[r.type];
    const last = m.inst.count - 1;
    if (r.index !== last) {
      m.inst.getMatrixAt(last, _matrix);
      m.inst.setMatrixAt(r.index, _matrix);
      const movedKey = m.keys[last];
      m.keys[r.index] = movedKey;
      const moved = this.rendered.get(movedKey);
      if (moved) moved.index = r.index;
    }
    m.inst.count = last;
    m.inst.instanceMatrix.needsUpdate = true;
    m.keys.length = last;
    this.rendered.delete(key);
  }

  // Ensure a block's instance presence matches "is solid AND exposed".
  refresh(x, y, z) {
    const key = this.key(x, y, z);
    const type = this.solid.get(key);
    const want = type !== undefined && this._isExposed(x, y, z);
    const have = this.rendered.has(key);
    if (want && !have) this._create(x, y, z, key, type);
    else if (!want && have) this._destroy(key);
  }

  _refreshAround(x, y, z) {
    this.refresh(x, y, z);
    for (const [dx, dy, dz] of NEIGHBORS) this.refresh(x + dx, y + dy, z + dz);
  }

  // --- Public edit API (used by both modes + network) ------------------------
  addBlock(x, y, z, type) {
    const key = this.key(x, y, z);
    if (this.solid.has(key)) return;
    this.solid.set(key, type);
    this._refreshAround(x, y, z); // self may render; neighbours may get hidden
  }

  removeBlock(x, y, z) {
    const key = this.key(x, y, z);
    const type = this.solid.get(key);
    if (type === undefined) return;
    // Bedrock (and anything flagged unbreakable) can't be mined — this is what
    // stops you from ever digging out the bottom of the world.
    if (BLOCK_TYPES[type] && BLOCK_TYPES[type].unbreakable) return;
    this.solid.delete(key);
    this._refreshAround(x, y, z); // self hidden; neighbours may be revealed
  }

  // Highest solid block in a column (its surface y), or -1 if the column is air.
  // Used to drop the player / animals onto the ground.
  surfaceY(x, z) {
    for (let y = WORLD_RADIUS + 60; y >= 0; y--) {
      if (this.solid.has(this.key(x, y, z))) return y;
    }
    return -1;
  }

  // --- Terrain generation ----------------------------------------------------
  // options: { trees, caves, superflat }
  generate(seed, options = {}) {
    const opts = { trees: true, caves: true, superflat: false, ...options };
    this.seed = seed;

    // Reset everything.
    BLOCK_NAMES.forEach((name) => {
      this.meshes[name].inst.count = 0;
      this.meshes[name].keys.length = 0;
      this.meshes[name].inst.instanceMatrix.needsUpdate = true;
    });
    this.solid.clear();
    this.rendered.clear();

    const R = WORLD_RADIUS;
    const treePositions = [];

    // Pass 1: fill the logical solid map (with caves carved out). Every column
    // runs from a bedrock floor at y=0 up to its surface height `h`, giving a
    // deep underground to mine through.
    const FLAT_H = WATER_LEVEL + 4; // superflat surface (kept above the water plane)
    for (let x = -R; x <= R; x++) {
      for (let z = -R; z <= R; z++) {
        const h = opts.superflat ? FLAT_H : heightAt(x, z, seed);
        for (let y = 0; y <= h; y++) {
          // Carve caves below the surface, but never the bottom two layers so the
          // floor stays sealed.
          if (opts.caves && !opts.superflat && y > 1 && y < h && isCave(x, y, z, seed)) {
            continue;
          }
          let type;
          if (y === 0) {
            type = "bedrock"; // unbreakable world floor
          } else if (y === h) {
            if (opts.superflat) type = "grass";
            else if (h <= WATER_LEVEL + 1) type = "sand";
            else if (h > 32) type = "stone"; // bare rocky mountain peaks
            else type = "grass";
          } else if (y > h - 4) {
            type = h <= WATER_LEVEL + 1 && !opts.superflat ? "sand" : "dirt";
          } else {
            type = "stone";
          }
          this.solid.set(this.key(x, y, z), type);
        }
        if (
          opts.trees &&
          !opts.superflat &&
          h > WATER_LEVEL + 1 &&
          h <= 30 &&
          this.solid.has(this.key(x, h, z)) && // surface not carved by a cave
          hash2(x, z, seed ^ 0x9e37) < 0.018
        ) {
          treePositions.push([x, h + 1, z]);
        }
      }
    }

    // Trees (added to the solid map before instancing).
    for (const [x, y, z] of treePositions) this._growTree(x, y, z);

    // Pass 2: create instances only for exposed blocks.
    this.solid.forEach((type, key) => {
      const [x, y, z] = key.split(",").map(Number);
      if (this._isExposed(x, y, z)) this._create(x, y, z, key, type);
    });
  }

  _growTree(x, y, z) {
    const trunk = 4 + Math.floor(hash2(x, z, this.seed ^ 0x55) * 3); // 4..6
    for (let i = 0; i < trunk; i++) this.solid.set(this.key(x, y + i, z), "log");
    const topY = y + trunk;

    const leaf = (cx, cy, cz) => {
      const k = this.key(cx, cy, cz);
      if (!this.solid.has(k)) this.solid.set(k, "leaves");
    };
    const layer = (cy, radius, trimCorners) => {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx === 0 && dz === 0 && cy < topY) continue;
          if (trimCorners && Math.abs(dx) === radius && Math.abs(dz) === radius) {
            if (hash2(x + dx, z + dz, this.seed ^ cy) < 0.5) continue;
          }
          leaf(x + dx, cy, z + dz);
        }
      }
    };
    layer(topY - 2, 2, true);
    layer(topY - 1, 2, true);
    layer(topY, 1, false);
    leaf(x, topY + 1, z);
  }

  // --- Sky: water plane + drifting clouds ------------------------------------
  _buildSky() {
    const R = WORLD_RADIUS;

    // Translucent, gently rippling water plane. Subdivided so update() can wave it.
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
    this.waterBaseY = Float32Array.from(waterGeo.attributes.position.array);

    // Blocky drifting clouds.
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
        46 + Math.random() * 8, // above the new, taller mountains
        (Math.random() - 0.5) * R * 2.5
      );
      c.scale.set(1 + Math.random() * 2, 1, 1 + Math.random() * 2);
      this.clouds.add(c);
    }
    this.scene.add(this.clouds);
  }

  update(dt) {
    const R = WORLD_RADIUS;
    for (const c of this.clouds.children) {
      c.position.x += dt * 1.2;
      if (c.position.x > R * 1.5) c.position.x = -R * 1.5;
    }
    // Ripple the water surface around its flat baseline.
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

  // Raycast helper: returns { block, place, distance, point } or null.
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

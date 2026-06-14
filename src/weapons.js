// Weapons for Strike Mode. Several distinct guns — each with its own stats and a
// hand-built first-person view-model — sharing one hitscan Weapon class. The
// player is handed a random weapon on spawn (and can re-roll with a key). Hit
// detection against remote players and the world happens here; the actual damage
// is sent over the network by game.js.

import * as THREE from "three";

// Tunable per-weapon stats. `spread` is radian jitter per pellet; `pellets` > 1
// makes a shotgun-style spray; `auto` weapons keep firing while the mouse is held.
export const WEAPONS = {
  pistol: { name: "Pistol", damage: 26, fireDelay: 240, magSize: 12, reloadTime: 1100, range: 60, auto: false, spread: 0.005, pellets: 1, recoil: 0.05 },
  smg: { name: "SMG", damage: 15, fireDelay: 75, magSize: 30, reloadTime: 1400, range: 55, auto: true, spread: 0.03, pellets: 1, recoil: 0.04 },
  rifle: { name: "Rifle", damage: 26, fireDelay: 130, magSize: 30, reloadTime: 1600, range: 90, auto: true, spread: 0.012, pellets: 1, recoil: 0.06 },
  shotgun: { name: "Shotgun", damage: 11, fireDelay: 750, magSize: 6, reloadTime: 2100, range: 28, auto: false, spread: 0.07, pellets: 8, recoil: 0.12 },
  sniper: { name: "Sniper", damage: 95, fireDelay: 1250, magSize: 5, reloadTime: 2300, range: 220, auto: false, spread: 0.0, pellets: 1, recoil: 0.16 },
};

export const WEAPON_KEYS = Object.keys(WEAPONS);
export const TRACER_RANGE = 90; // used to draw remote players' shots

export function randomWeaponKey(exclude) {
  const pool = WEAPON_KEYS.filter((k) => k !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}

// Backwards-compatible default export some code referenced as `GUN`.
export const GUN = WEAPONS.rifle;

// --- View-model builders: a distinct silhouette per weapon --------------------
function part(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  m.position.set(x, y, z);
  return m;
}

const METAL = 0x2b2b30;
const DARK = 0x111114;
const WOOD = 0x6e4a24;

function buildModel(key) {
  const g = new THREE.Group();
  if (key === "pistol") {
    g.add(part(0.1, 0.14, 0.26, METAL, 0, 0, -0.18)); // slide
    g.add(part(0.09, 0.18, 0.12, DARK, 0, -0.16, -0.02)); // grip
    g.add(part(0.05, 0.05, 0.12, DARK, 0, 0.02, -0.34)); // muzzle
  } else if (key === "smg") {
    g.add(part(0.11, 0.14, 0.42, METAL, 0, 0, -0.22));
    g.add(part(0.05, 0.05, 0.2, DARK, 0, 0.02, -0.5)); // barrel
    g.add(part(0.08, 0.22, 0.1, DARK, 0, -0.18, -0.08)); // mag
    g.add(part(0.08, 0.14, 0.1, DARK, 0, -0.06, 0.1)); // stub stock
  } else if (key === "rifle") {
    g.add(part(0.1, 0.12, 0.6, METAL, 0, 0, -0.3));
    g.add(part(0.05, 0.05, 0.4, DARK, 0, 0.02, -0.65)); // long barrel
    g.add(part(0.08, 0.2, 0.1, DARK, 0, -0.16, -0.18)); // mag
    g.add(part(0.09, 0.1, 0.2, DARK, 0, -0.02, 0.18)); // stock
  } else if (key === "shotgun") {
    g.add(part(0.06, 0.06, 0.62, METAL, -0.05, 0.03, -0.32)); // twin barrels
    g.add(part(0.06, 0.06, 0.62, METAL, 0.05, 0.03, -0.32));
    g.add(part(0.13, 0.1, 0.26, WOOD, 0, -0.02, -0.02)); // wood receiver
    g.add(part(0.1, 0.12, 0.24, WOOD, 0, -0.06, 0.2)); // wood stock
    g.add(part(0.12, 0.06, 0.16, DARK, 0, -0.08, -0.22)); // pump
  } else if (key === "sniper") {
    g.add(part(0.09, 0.1, 0.8, METAL, 0, 0, -0.4));
    g.add(part(0.04, 0.04, 0.5, DARK, 0, 0.01, -0.9)); // very long barrel
    g.add(part(0.08, 0.08, 0.22, DARK, 0, 0.14, -0.2)); // scope tube
    g.add(part(0.05, 0.05, 0.05, 0x224488, 0, 0.14, -0.31)); // scope lens
    g.add(part(0.09, 0.12, 0.26, DARK, 0, -0.03, 0.22)); // stock
    g.add(part(0.08, 0.18, 0.1, DARK, 0, -0.16, -0.1)); // mag
  }
  return g;
}

export class Weapon {
  constructor(scene, camera, key = "rifle") {
    this.scene = scene;
    this.camera = camera;
    this.lastShot = 0;
    this.recoil = 0;
    this.tracers = [];

    this.viewModel = new THREE.Group();
    this.viewModel.position.set(0.22, -0.2, -0.4);
    camera.add(this.viewModel);

    // Muzzle flash (hidden until firing).
    this.flash = new THREE.PointLight(0xffcc66, 0, 6);
    this.flash.position.set(0, 0.05, -0.85);
    this.viewModel.add(this.flash);

    this.model = null;
    this.setWeapon(key);
  }

  // Swap to a different weapon: rebuild the view-model and reset ammo.
  setWeapon(key) {
    this.key = key;
    this.def = WEAPONS[key] || WEAPONS.rifle;
    this.ammo = this.def.magSize;
    this.reloading = false;
    if (this.reloadTimer) clearTimeout(this.reloadTimer);

    if (this.model) {
      this.viewModel.remove(this.model);
      this.model.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    this.model = buildModel(this.key);
    this.viewModel.add(this.model);
  }

  get magSize() {
    return this.def.magSize;
  }

  canShoot() {
    return (
      !this.reloading &&
      this.ammo > 0 &&
      performance.now() - this.lastShot >= this.def.fireDelay
    );
  }

  // Fire a (possibly multi-pellet) hitscan shot. `targets` is a list of
  // { id, hitbox }. Returns an array of hits: [{ id, damage, point }].
  shoot(world, targets) {
    if (!this.canShoot()) return [];
    this.lastShot = performance.now();
    this.ammo--;
    this.recoil = this.def.recoil;
    this.flash.intensity = 3;

    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const baseDir = new THREE.Vector3();
    this.camera.getWorldDirection(baseDir);

    const def = this.def;
    const hits = [];
    for (let p = 0; p < def.pellets; p++) {
      const dir = baseDir.clone();
      if (def.spread > 0) {
        dir.x += (Math.random() - 0.5) * def.spread;
        dir.y += (Math.random() - 0.5) * def.spread;
        dir.z += (Math.random() - 0.5) * def.spread;
        dir.normalize();
      }
      const ray = new THREE.Raycaster(origin, dir, 0, def.range);

      // Bullets stop at the nearest world block.
      let worldDist = def.range;
      const worldHit = world.raycast(ray);
      if (worldHit) worldDist = worldHit.distance;

      // Closest player in front of that wall.
      let best = null;
      let bestDist = worldDist;
      for (const t of targets) {
        const ph = ray.intersectObject(t.hitbox, false);
        if (ph.length && ph[0].distance < bestDist) {
          bestDist = ph[0].distance;
          best = { id: t.id, damage: def.damage, point: ph[0].point.clone() };
        }
      }
      if (best) hits.push(best);

      // Tracer to whatever this pellet hit (player, wall, or max range).
      const endPoint = best
        ? best.point
        : origin.clone().add(dir.clone().multiplyScalar(bestDist));
      this._spawnTracer(origin, endPoint);
    }
    return hits;
  }

  reload() {
    if (this.reloading || this.ammo === this.def.magSize) return;
    this.reloading = true;
    this.reloadTimer = setTimeout(() => {
      this.ammo = this.def.magSize;
      this.reloading = false;
    }, this.def.reloadTime);
  }

  _spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xfff2a0, transparent: true })
    );
    line.userData.life = 0.08; // seconds
    this.scene.add(line);
    this.tracers.push(line);
  }

  update(dt) {
    // Decay recoil and muzzle flash.
    this.recoil *= Math.max(0, 1 - dt * 12);
    this.viewModel.position.z = -0.4 + this.recoil;
    this.flash.intensity *= Math.max(0, 1 - dt * 20);

    // Fade and remove tracers.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.userData.life -= dt;
      t.material.opacity = Math.max(0, t.userData.life / 0.08);
      if (t.userData.life <= 0) {
        this.scene.remove(t);
        t.geometry.dispose();
        t.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }
}

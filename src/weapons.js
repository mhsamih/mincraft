// The gun: a first-person view-model attached to the camera, hitscan shooting
// with tracer lines + muzzle flash, recoil, ammo and reloading. Hit detection
// against remote players and the world is done here; the actual damage is sent
// over the network by game.js.

import * as THREE from "three";

export const GUN = {
  damage: 25,
  fireDelay: 120, // ms between shots
  magSize: 30,
  reloadTime: 1500, // ms
  range: 80,
};

export class Weapon {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.ammo = GUN.magSize;
    this.reloading = false;
    this.lastShot = 0;
    this.recoil = 0;
    this.tracers = [];

    // First-person view-model: a simple gun parented to the camera so it moves
    // with the view.
    this.viewModel = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.6),
      new THREE.MeshLambertMaterial({ color: 0x2a2a2a })
    );
    body.position.z = -0.3;
    const barrel = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    barrel.position.set(0, 0.02, -0.6);
    this.viewModel.add(body, barrel);
    this.viewModel.position.set(0.22, -0.2, -0.4);
    camera.add(this.viewModel);

    // Muzzle flash (hidden until firing).
    this.flash = new THREE.PointLight(0xffcc66, 0, 6);
    this.flash.position.set(0, 0.05, -0.85);
    this.viewModel.add(this.flash);

    this.muzzlePos = new THREE.Vector3();
  }

  canShoot() {
    return (
      !this.reloading &&
      this.ammo > 0 &&
      performance.now() - this.lastShot >= GUN.fireDelay
    );
  }

  // Fire a hitscan shot. `targets` is a list of { id, hitbox } for other
  // players. Returns a hit descriptor { id, point } if a player was hit.
  shoot(world, targets) {
    if (!this.canShoot()) return null;
    this.lastShot = performance.now();
    this.ammo--;
    this.recoil = 0.06;
    this.flash.intensity = 3;

    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);

    const ray = new THREE.Raycaster(origin, dir, 0, GUN.range);

    // Distance to the nearest world block along the ray (bullets stop at walls).
    let worldDist = GUN.range;
    const worldHit = world.raycast(ray);
    if (worldHit) worldDist = worldHit.distance;

    // Closest player hitbox in front of the wall.
    let best = null;
    let bestDist = worldDist;
    for (const t of targets) {
      const hits = ray.intersectObject(t.hitbox, false);
      if (hits.length && hits[0].distance < bestDist) {
        bestDist = hits[0].distance;
        best = { id: t.id, point: hits[0].point.clone() };
      }
    }

    // Draw a tracer to whatever we hit (player, wall, or max range).
    const endPoint = best
      ? best.point
      : origin.clone().add(dir.clone().multiplyScalar(bestDist));
    this._spawnTracer(origin, endPoint);

    return best;
  }

  reload() {
    if (this.reloading || this.ammo === GUN.magSize) return;
    this.reloading = true;
    setTimeout(() => {
      this.ammo = GUN.magSize;
      this.reloading = false;
    }, GUN.reloadTime);
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

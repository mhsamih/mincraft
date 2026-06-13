// The local player: movement, gravity, AABB collision against the voxel world,
// health/respawn, and a camera that toggles between first- and third-person.

import * as THREE from "three";
import { buildCharacter, animateCharacter } from "./character.js";
import { heightAt } from "./noise.js";
import { WORLD_RADIUS } from "./world.js";

const HEIGHT = 1.7; // eye height above feet
const RADIUS = 0.3;
const GRAVITY = 24;
const JUMP = 8.5;
const SPEED = 5.2;

export class Player {
  constructor(scene, camera, world, color) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;

    this.pos = new THREE.Vector3(0.5, heightAt(0, 0, world.seed) + 3, 0.5);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;

    this.hp = 100;
    this.dead = false;

    this.firstPerson = true;

    // Visible avatar (shown in third-person and hidden in first-person).
    this.avatar = buildCharacter(color);
    this.avatar.visible = false;
    scene.add(this.avatar);
    this.speed2d = 0;
  }

  toggleView() {
    this.firstPerson = !this.firstPerson;
  }

  collidesAt(px, py, pz) {
    const minX = Math.floor(px - RADIUS);
    const maxX = Math.floor(px + RADIUS);
    const minZ = Math.floor(pz - RADIUS);
    const maxZ = Math.floor(pz + RADIUS);
    const minY = Math.floor(py - HEIGHT);
    const maxY = Math.floor(py);
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++)
          if (this.world.has(x, y, z)) return true;
    return false;
  }

  update(dt, keys) {
    if (this.dead) return;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const move = new THREE.Vector3();
    if (keys["KeyW"]) move.add(forward);
    if (keys["KeyS"]) move.sub(forward);
    if (keys["KeyD"]) move.add(right);
    if (keys["KeyA"]) move.sub(right);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(SPEED);

    this.vel.x = move.x;
    this.vel.z = move.z;
    this.vel.y -= GRAVITY * dt;

    if (keys["Space"] && this.onGround) {
      this.vel.y = JUMP;
      this.onGround = false;
    }

    const p = this.pos;
    p.x += this.vel.x * dt;
    if (this.collidesAt(p.x, p.y, p.z)) {
      p.x -= this.vel.x * dt;
      this.vel.x = 0;
    }
    p.z += this.vel.z * dt;
    if (this.collidesAt(p.x, p.y, p.z)) {
      p.z -= this.vel.z * dt;
      this.vel.z = 0;
    }
    this.onGround = false;
    p.y += this.vel.y * dt;
    if (this.collidesAt(p.x, p.y, p.z)) {
      if (this.vel.y < 0) this.onGround = true;
      p.y -= this.vel.y * dt;
      this.vel.y = 0;
    }

    // Fell off the world / into a void -> take it as a respawn trigger.
    if (p.y < -20) this.die();

    this.speed2d = Math.hypot(this.vel.x, this.vel.z);
    this._updateCamera(dt);
  }

  _updateCamera(dt) {
    const eye = this.pos.clone();
    const dir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );

    if (this.firstPerson) {
      this.avatar.visible = false;
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.clone().add(dir));
    } else {
      // Third-person: place the camera behind and above the player.
      this.avatar.visible = true;
      this.avatar.position.set(this.pos.x, this.pos.y - HEIGHT, this.pos.z);
      this.avatar.rotation.y = this.yaw;
      animateCharacter(this.avatar, this.speed2d, dt, false);

      const back = dir.clone().multiplyScalar(-4);
      const camPos = eye.clone().add(back).add(new THREE.Vector3(0, 1.2, 0));
      this.camera.position.copy(camPos);
      this.camera.lookAt(eye.clone().add(dir.clone().multiplyScalar(2)));
    }
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
  }

  respawn(pos) {
    this.dead = false;
    this.hp = 100;
    this.vel.set(0, 0, 0);
    if (pos) {
      this.pos.set(pos.x, pos.y, pos.z);
    } else {
      // Random spawn somewhere on the map, dropped from above the surface.
      const rx = Math.floor((Math.random() - 0.5) * WORLD_RADIUS);
      const rz = Math.floor((Math.random() - 0.5) * WORLD_RADIUS);
      this.pos.set(rx + 0.5, heightAt(rx, rz, this.world.seed) + 3, rz + 0.5);
    }
  }

  // Snapshot for the network.
  getState() {
    return {
      x: this.pos.x,
      y: this.pos.y,
      z: this.pos.z,
      yaw: this.yaw,
      pitch: this.pitch,
      speed: this.speed2d,
      hp: this.hp,
    };
  }
}

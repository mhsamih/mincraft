// The local player: weighty acceleration-based movement, gravity, AABB collision
// against the voxel world, sprint, head-bob, health/respawn, and a camera that
// toggles between first- and third-person. Sound hooks fire on jump/step/death.

import * as THREE from "three";
import { buildCharacter, animateCharacter } from "./character.js";
import { heightAt } from "./noise.js";
import { WORLD_RADIUS } from "./world.js";

const HEIGHT = 1.7; // eye height above feet
const RADIUS = 0.3;
const GRAVITY = 26;
const JUMP = 8.8;
const WALK_SPEED = 5.0;
const SPRINT_SPEED = 7.6;
const GROUND_ACCEL = 55; // how quickly we reach target velocity on ground
const AIR_ACCEL = 10; // limited air control
const GROUND_FRICTION = 10; // deceleration when not pressing keys

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
    this.sprinting = false;

    this.hp = 100;
    this.dead = false;
    this.firstPerson = true;

    this.speed2d = 0;
    this.bobPhase = 0;
    this.stepDist = 0;

    // Sound callbacks (set by game.js): { jump, step, death }.
    this.sfx = {};

    this.avatar = buildCharacter(color);
    this.avatar.visible = false;
    scene.add(this.avatar);
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
    if (this.dead) {
      this._updateCamera(dt);
      return;
    }

    this.sprinting = !!keys["ShiftLeft"] || !!keys["ShiftRight"];
    const maxSpeed = this.sprinting ? SPRINT_SPEED : WALK_SPEED;

    // Desired horizontal direction from input, relative to look yaw.
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (keys["KeyW"]) wish.add(forward);
    if (keys["KeyS"]) wish.sub(forward);
    if (keys["KeyD"]) wish.add(right);
    if (keys["KeyA"]) wish.sub(right);
    const hasInput = wish.lengthSq() > 0;
    if (hasInput) wish.normalize().multiplyScalar(maxSpeed);

    // Accelerate horizontal velocity toward the wish velocity (weighty feel).
    const accel = this.onGround ? GROUND_ACCEL : AIR_ACCEL;
    this.vel.x += (wish.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wish.z - this.vel.z) * Math.min(1, accel * dt);

    // Extra ground friction when idle so you stop crisply.
    if (!hasInput && this.onGround) {
      const f = Math.max(0, 1 - GROUND_FRICTION * dt);
      this.vel.x *= f;
      this.vel.z *= f;
    }

    // Gravity + jump.
    this.vel.y -= GRAVITY * dt;
    if (keys["Space"] && this.onGround) {
      this.vel.y = JUMP;
      this.onGround = false;
      this.sfx.jump && this.sfx.jump();
    }

    // Move and resolve collisions per axis.
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
    const wasAir = !this.onGround;
    this.onGround = false;
    p.y += this.vel.y * dt;
    if (this.collidesAt(p.x, p.y, p.z)) {
      if (this.vel.y < 0) this.onGround = true;
      p.y -= this.vel.y * dt;
      this.vel.y = 0;
    }

    if (p.y < -20) this.die();

    this.speed2d = Math.hypot(this.vel.x, this.vel.z);

    // Footstep sounds at distance intervals while grounded.
    if (this.onGround && this.speed2d > 0.5) {
      this.stepDist += this.speed2d * dt;
      const interval = this.sprinting ? 1.8 : 2.4;
      if (this.stepDist >= interval) {
        this.stepDist = 0;
        this.sfx.step && this.sfx.step();
      }
    }

    this._updateCamera(dt);
  }

  _updateCamera(dt) {
    const eye = this.pos.clone();

    // Head-bob in first person, scaled by speed.
    if (this.firstPerson && this.onGround) {
      this.bobPhase += dt * this.speed2d * 2.0;
      eye.y += Math.sin(this.bobPhase * 2) * Math.min(this.speed2d * 0.012, 0.05);
    }

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
      this.avatar.visible = true;
      this.avatar.position.set(this.pos.x, this.pos.y - HEIGHT, this.pos.z);
      this.avatar.rotation.y = this.yaw;
      animateCharacter(this.avatar, this.speed2d, dt, false);

      // Camera behind/above, but pulled in if a wall is close.
      const back = dir.clone().multiplyScalar(-1);
      let dist = 4;
      const probe = eye.clone();
      for (let d = 0.5; d <= 4; d += 0.5) {
        const test = eye.clone().add(back.clone().multiplyScalar(d)).add(new THREE.Vector3(0, 1.0, 0));
        if (this.world.has(Math.floor(test.x), Math.floor(test.y), Math.floor(test.z))) {
          dist = Math.max(1, d - 0.5);
          break;
        }
      }
      const camPos = eye.clone().add(back.multiplyScalar(dist)).add(new THREE.Vector3(0, 1.1, 0));
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
    this.sfx.death && this.sfx.death();
  }

  respawn(pos) {
    this.dead = false;
    this.hp = 100;
    this.vel.set(0, 0, 0);
    if (pos) {
      this.pos.set(pos.x, pos.y, pos.z);
    } else {
      const rx = Math.floor((Math.random() - 0.5) * WORLD_RADIUS);
      const rz = Math.floor((Math.random() - 0.5) * WORLD_RADIUS);
      this.pos.set(rx + 0.5, heightAt(rx, rz, this.world.seed) + 3, rz + 0.5);
    }
  }

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

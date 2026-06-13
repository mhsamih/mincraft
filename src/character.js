// A blocky humanoid character (Steve-style), built from boxes. Used both for the
// local player in third-person view and for every remote player. Includes simple
// limb-swing animation and an attached gun so you can see other players shooting.

import * as THREE from "three";

// Build a humanoid. `color` tints the shirt so players are distinguishable.
export function buildCharacter(color = 0x3aa0ff) {
  const group = new THREE.Group();

  const skin = new THREE.MeshLambertMaterial({ color: 0xe0a070 });
  const shirt = new THREE.MeshLambertMaterial({ color });
  const pants = new THREE.MeshLambertMaterial({ color: 0x33408a });
  const hair = new THREE.MeshLambertMaterial({ color: 0x4a3424 });

  // Proportions roughly match Minecraft's 8px-per-block model.
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), [
    skin, skin, hair, skin, skin, skin,
  ]);
  head.position.y = 1.5;
  group.add(head);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.25), shirt);
  torso.position.y = 0.875;
  group.add(torso);

  // Arms and legs are pivoted at the top so they swing naturally.
  function limb(w, h, d, material, x, y) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.y = -h / 2;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }

  const leftArm = limb(0.22, 0.75, 0.22, shirt, -0.36, 1.25);
  const rightArm = limb(0.22, 0.75, 0.22, shirt, 0.36, 1.25);
  const leftLeg = limb(0.24, 0.75, 0.24, pants, -0.13, 0.75);
  const rightLeg = limb(0.24, 0.75, 0.24, pants, 0.13, 0.75);

  // A little gun in the right hand.
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x222222 })
  );
  gun.position.set(0, -0.7, 0.2);
  rightArm.add(gun);

  group.userData = {
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    walkPhase: 0,
  };
  return group;
}

// Animate a character's limbs. `speed` ~ horizontal movement speed.
export function animateCharacter(group, speed, dt, aiming) {
  const d = group.userData;
  d.walkPhase += dt * Math.min(speed, 6) * 2.2;
  const swing = Math.sin(d.walkPhase) * Math.min(speed * 0.18, 0.7);
  d.leftLeg.rotation.x = swing;
  d.rightLeg.rotation.x = -swing;
  d.leftArm.rotation.x = -swing;
  // The right (gun) arm points forward when aiming, otherwise it swings.
  d.rightArm.rotation.x = aiming ? -Math.PI / 2 : swing;
}

// Create a floating name + health label that always faces the camera.
export function buildNameTag(name) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false })
  );
  sprite.scale.set(2, 0.5, 1);
  sprite.position.y = 2.2;
  sprite.userData = { canvas, ctx, tex, name };
  updateNameTag(sprite, 100);
  return sprite;
}

export function updateNameTag(sprite, hp) {
  const { canvas, ctx, tex, name } = sprite.userData;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Name.
  ctx.font = "bold 28px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, canvas.width, 34);
  ctx.fillStyle = "#fff";
  ctx.fillText(name, canvas.width / 2, 26);
  // Health bar.
  ctx.fillStyle = "#400";
  ctx.fillRect(28, 42, 200, 14);
  ctx.fillStyle = hp > 30 ? "#4caf50" : "#e04040";
  ctx.fillRect(28, 42, 200 * Math.max(0, hp) / 100, 14);
  tex.needsUpdate = true;
}

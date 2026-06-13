// A blocky humanoid character with Minecraft-style proportions and a drawn face.
// Used for the local player (third-person) and every remote player. Includes
// limb-swing animation, an attached gun, and a billboard name/health tag.

import * as THREE from "three";

// --- Face texture: a small canvas with eyes + mouth, for the front of the head.
function makeFaceTexture(skin) {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext("2d");
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, 16, 16);
  // Hair fringe along the top.
  ctx.fillStyle = "#3a2a1a";
  ctx.fillRect(0, 0, 16, 3);
  // Eyes (white + pupil).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(3, 7, 3, 2);
  ctx.fillRect(10, 7, 3, 2);
  ctx.fillStyle = "#3a5bd0";
  ctx.fillRect(4, 7, 2, 2);
  ctx.fillRect(11, 7, 2, 2);
  // Brow + mouth.
  ctx.fillStyle = "#7a5230";
  ctx.fillRect(3, 11, 10, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCharacter(color = 0x3aa0ff) {
  const group = new THREE.Group();

  const skinHex = "#d9a074";
  const skin = new THREE.MeshLambertMaterial({ color: skinHex });
  const shirt = new THREE.MeshLambertMaterial({ color });
  const pants = new THREE.MeshLambertMaterial({ color: 0x33408a });
  const shoes = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  const hair = new THREE.MeshLambertMaterial({ color: 0x3a2a1a });
  const face = new THREE.MeshLambertMaterial({ map: makeFaceTexture(skinHex) });

  // Head with a face on the +Z side. Box face order: +x,-x,+y,-y,+z,-z.
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), [
    skin, skin, hair, skin, face, skin,
  ]);
  head.position.y = 1.52;
  group.add(head);

  // Torso (taller, slimmer — closer to real proportions than a cube).
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.26), shirt);
  torso.position.y = 0.88;
  group.add(torso);

  // Limbs pivot at the shoulder/hip so they swing naturally.
  function limb(w, h, d, material, x, y, footMat) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.y = -h / 2;
    pivot.add(mesh);
    if (footMat) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.14, d + 0.04), footMat);
      foot.position.y = -h + 0.07;
      pivot.add(foot);
    }
    group.add(pivot);
    return pivot;
  }

  const leftArm = limb(0.2, 0.72, 0.2, shirt, -0.35, 1.26);
  const rightArm = limb(0.2, 0.72, 0.2, shirt, 0.35, 1.26);
  const leftLeg = limb(0.22, 0.72, 0.22, pants, -0.13, 0.78, shoes);
  const rightLeg = limb(0.22, 0.72, 0.22, pants, 0.13, 0.78, shoes);

  // Hands (skin) at the end of the arms.
  for (const arm of [leftArm, rightArm]) {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.16, 0.21), skin);
    hand.position.y = -0.66;
    arm.add(hand);
  }

  // Rifle in the right hand.
  const gun = new THREE.Group();
  const gunBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.12, 0.55),
    new THREE.MeshLambertMaterial({ color: 0x202020 })
  );
  const gunBarrel = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.05, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x111111 })
  );
  gunBarrel.position.z = 0.4;
  gun.add(gunBody, gunBarrel);
  gun.position.set(0, -0.7, 0.18);
  rightArm.add(gun);

  group.userData = { head, leftArm, rightArm, leftLeg, rightLeg, walkPhase: 0 };
  return group;
}

// Animate a character's limbs. `speed` ~ horizontal movement speed.
export function animateCharacter(group, speed, dt, aiming) {
  const d = group.userData;
  const moving = speed > 0.2;
  d.walkPhase += dt * (moving ? Math.min(speed, 7) * 2.4 : 6);
  const amp = moving ? Math.min(speed * 0.16, 0.7) : 0;
  const swing = Math.sin(d.walkPhase) * amp;
  d.leftLeg.rotation.x = swing;
  d.rightLeg.rotation.x = -swing;
  d.leftArm.rotation.x = -swing;
  // The gun arm aims forward when shooting; otherwise it counter-swings.
  d.rightArm.rotation.x = aiming ? -Math.PI / 2 : swing;
  // Subtle idle breathing on the head.
  d.head.rotation.y = moving ? 0 : Math.sin(d.walkPhase * 0.3) * 0.08;
}

// Floating name + health label that faces the camera.
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
  sprite.position.y = 2.15;
  sprite.userData = { canvas, ctx, tex, name };
  updateNameTag(sprite, 100);
  return sprite;
}

export function updateNameTag(sprite, hp) {
  const { canvas, ctx, tex, name } = sprite.userData;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "bold 28px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, canvas.width, 34);
  ctx.fillStyle = "#fff";
  ctx.fillText(name, canvas.width / 2, 26);
  ctx.fillStyle = "#400";
  ctx.fillRect(28, 42, 200, 14);
  ctx.fillStyle = hp > 30 ? "#4caf50" : "#e04040";
  ctx.fillRect(28, 42, (200 * Math.max(0, hp)) / 100, 14);
  tex.needsUpdate = true;
}

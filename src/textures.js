// Procedurally-generated 16x16 pixel textures, drawn to canvases and turned into
// THREE textures. This is the technique borrowed (in spirit) from the reference
// CodePen: authentic blocky Minecraft looks with zero image asset files.

import * as THREE from "three";

const SIZE = 16;

// Small helper: make a 16x16 canvas and let a callback paint each pixel.
function makeCanvas(paint) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b, a = 255] = paint(x, y);
      const i = (y * SIZE + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Random-ish per-pixel brightness gives the speckled Minecraft surface look.
function noisy(base, range) {
  const d = 1 - Math.random() * range;
  return [base[0] * d, base[1] * d, base[2] * d];
}

// --- Per-texture painters ----------------------------------------------------
const painters = {
  grassTop: () => noisy([106, 170, 80], 0.25),
  grassSide: (x, y) => {
    // Dirt with a green grassy lip along the top few rows.
    const lip = 3 + Math.floor(Math.random() * 2);
    return y < lip ? noisy([106, 170, 80], 0.25) : noisy([134, 96, 67], 0.2);
  },
  dirt: () => noisy([134, 96, 67], 0.22),
  stone: () => noisy([130, 130, 130], 0.18),
  sand: () => noisy([224, 216, 160], 0.12),
  cobblestone: (x, y) => {
    const v = Math.random();
    const base = v < 0.5 ? [110, 110, 110] : [140, 140, 140];
    return noisy(base, 0.25);
  },
  logSide: (x, y) => {
    // Vertical bark streaks.
    const streak = (x % 4 === 0 || x % 7 === 0) ? 0.85 : 1;
    return noisy([110, 74, 36].map((c) => c * streak), 0.18);
  },
  logTop: (x, y) => {
    // Concentric rings.
    const cx = x - 7.5;
    const cy = y - 7.5;
    const r = Math.sqrt(cx * cx + cy * cy);
    const ring = Math.sin(r * 2) * 0.12 + 1;
    return noisy([160, 120, 70].map((c) => c * ring), 0.12);
  },
  planks: (x, y) => {
    const seam = y % 4 === 3 ? 0.78 : 1;
    const grain = x === 8 ? 0.9 : 1;
    return noisy([190, 154, 96].map((c) => c * seam * grain), 0.1);
  },
  leaves: (x, y) => {
    return noisy([60, 130, 50], 0.4);
  },
  bedrock: (x, y) => {
    // Very dark, high-contrast speckle so the unbreakable floor reads clearly.
    const v = Math.random();
    const base = v < 0.5 ? [40, 40, 44] : [70, 70, 76];
    return noisy(base, 0.4);
  },
};

// Build a THREE.CanvasTexture for a painter, configured for crisp pixels.
function makeTexture(name) {
  const tex = new THREE.CanvasTexture(makeCanvas(painters[name]));
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Cache textures so identical faces share one GPU texture.
const texCache = {};
function tex(name) {
  if (!texCache[name]) texCache[name] = makeTexture(name);
  return texCache[name];
}

function mat(name) {
  return new THREE.MeshLambertMaterial({ map: tex(name) });
}

// BoxGeometry material order: +x, -x, +y (top), -y (bottom), +z, -z.
// Build the 6-material array for a block defined by top/side/bottom textures.
function faceMaterials(top, side, bottom) {
  const s = mat(side);
  return [s, mat(side), mat(top), mat(bottom), mat(side), mat(side)];
}

// --- Public block definitions ------------------------------------------------
// Each entry: display name, hotbar swatch color, and its 6-material array.
export const BLOCK_TYPES = {
  grass: { name: "Grass", color: "#6aaa50", materials: faceMaterials("grassTop", "grassSide", "dirt") },
  dirt: { name: "Dirt", color: "#866043", materials: faceMaterials("dirt", "dirt", "dirt") },
  stone: { name: "Stone", color: "#828282", materials: faceMaterials("stone", "stone", "stone") },
  sand: { name: "Sand", color: "#e0d8a0", materials: faceMaterials("sand", "sand", "sand") },
  log: { name: "Wood", color: "#6e4a24", materials: faceMaterials("logTop", "logSide", "logTop") },
  planks: { name: "Planks", color: "#be9a60", materials: faceMaterials("planks", "planks", "planks") },
  leaves: { name: "Leaves", color: "#3c8232", materials: faceMaterials("leaves", "leaves", "leaves") },
  cobblestone: { name: "Cobble", color: "#828282", materials: faceMaterials("cobblestone", "cobblestone", "cobblestone") },
  // Unbreakable floor block. Kept LAST so existing block ids/network indices are
  // unchanged, and excluded from the hotbar via PLACEABLE_NAMES below.
  bedrock: { name: "Bedrock", color: "#2a2a2e", unbreakable: true, materials: faceMaterials("bedrock", "bedrock", "bedrock") },
};

// Stable index <-> name maps so blocks can be referenced by a small integer id
// over the network.
export const BLOCK_NAMES = Object.keys(BLOCK_TYPES);
export const BLOCK_ID = {};
BLOCK_NAMES.forEach((name, i) => (BLOCK_ID[name] = i));

// Blocks the player can actually select/place (everything except unbreakable
// ones like bedrock). Indices line up with BLOCK_NAMES because the excluded
// blocks are last, so network block ids stay compatible.
export const PLACEABLE_NAMES = BLOCK_NAMES.filter((n) => !BLOCK_TYPES[n].unbreakable);

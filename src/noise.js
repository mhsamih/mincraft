// Deterministic noise + RNG so every networked client generates the *same* map
// from a shared integer seed. No external state — pure functions of (x, z, seed).

// 32-bit integer hash -> float in [0, 1). Inspired by the xxHash-style mixer in
// the reference CodePen, simplified for our needs.
export function hash2(x, z, seed) {
  let h = (seed | 0) + 0x165667b1;
  h = Math.imul(h ^ (x | 0), 0x27d4eb2f);
  h = (h << 17) | (h >>> 15);
  h = Math.imul(h ^ (z | 0), 0x85ebca77);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae3d);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Smooth 2D value noise built on the hashed integer lattice.
export function valueNoise(x, z, seed) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const xf = x - x0;
  const zf = z - z0;
  const v00 = hash2(x0, z0, seed);
  const v10 = hash2(x0 + 1, z0, seed);
  const v01 = hash2(x0, z0 + 1, seed);
  const v11 = hash2(x0 + 1, z0 + 1, seed);
  const u = fade(xf);
  const v = fade(zf);
  return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
}

// Layered octaves -> rolling hills. Returns an integer terrain height.
// BASE_HEIGHT lifts the whole world up off y=0 so there's a deep underground to
// mine and explore (and a bedrock floor far below your feet).
export const BASE_HEIGHT = 16;
export function heightAt(x, z, seed) {
  let n = 0;
  n += valueNoise(x * 0.035, z * 0.035, seed) * 16; // broad hills
  n += valueNoise(x * 0.09, z * 0.09, seed + 1) * 6; // medium bumps
  n += valueNoise(x * 0.22, z * 0.22, seed + 2) * 2; // fine detail
  return BASE_HEIGHT + Math.floor(n);
}

// --- 3D noise for caves ------------------------------------------------------

// 32-bit integer hash over three coordinates -> float in [0, 1).
export function hash3(x, y, z, seed) {
  let h = (seed | 0) + 0x9e3779b1;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h = (h << 13) | (h >>> 19);
  h = Math.imul(h ^ (y | 0), 0xc2b2ae35);
  h = (h << 17) | (h >>> 15);
  h = Math.imul(h ^ (z | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca77);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// Smooth 3D value noise via trilinear interpolation of the hashed lattice.
export function valueNoise3D(x, y, z, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const xf = fade(x - x0);
  const yf = fade(y - y0);
  const zf = fade(z - z0);
  const c = (dx, dy, dz) => hash3(x0 + dx, y0 + dy, z0 + dz, seed);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), xf);
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), xf);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), xf);
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), xf);
  const y0i = lerp(x00, x10, yf);
  const y1i = lerp(x01, x11, yf);
  return lerp(y0i, y1i, zf);
}

// Carve tunnels by overlapping two thin 3D-noise "shells" — where both are near
// their midline you get connected cave passages (same idea as the CodePen).
export function isCave(x, y, z, seed) {
  const s = 0.055;
  const a = valueNoise3D(x * s, y * s * 1.4, z * s, seed);
  const b = valueNoise3D((x + 71) * s, (y + 53) * s * 1.4, (z + 17) * s, seed + 7);
  const t = 0.085; // wider band -> longer, more connected tunnels
  return Math.abs(a - 0.5) < t && Math.abs(b - 0.5) < t;
}

// Simple seedable PRNG (mulberry32) for non-terrain randomness if ever needed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

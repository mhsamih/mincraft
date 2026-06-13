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
export function heightAt(x, z, seed) {
  let n = 0;
  n += valueNoise(x * 0.035, z * 0.035, seed) * 14; // broad hills
  n += valueNoise(x * 0.09, z * 0.09, seed + 1) * 5; // medium bumps
  n += valueNoise(x * 0.22, z * 0.22, seed + 2) * 2; // fine detail
  return Math.floor(n);
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

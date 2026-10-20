// Gerador pseudoaleatório com semente (mulberry32). No duelo online os dois aparelhos
// recebem a mesma `semente` do servidor e geram exatamente as mesmas contas.

/** Devolve uma função que sorteia números em [0, 1), sempre na mesma ordem para a mesma semente. */
export function createRng(seed) {
  let state = Number(seed) >>> 0;
  return function rng() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

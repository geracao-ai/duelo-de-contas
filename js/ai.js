// Oponente controlado pelo computador: "pensa", digita a resposta e confirma.

import { randInt } from './problems.js';

export const CPU_PROFILES = {
  facil: { delay: [5, 8], accuracy: 0.7 },
  medio: { delay: [3.5, 6], accuracy: 0.82 },
  dificil: { delay: [2.2, 4], accuracy: 0.92 },
};

const TYPE_INTERVAL = 0.28; // segundos entre dígitos
const SUBMIT_PAUSE = 0.45; // pausa antes de apertar OK

/** Sorteia o tempo de reflexão (em segundos) do perfil. */
export function pickDelay(difficulty, rng = Math.random) {
  const [min, max] = CPU_PROFILES[difficulty].delay;
  return min + rng() * (max - min);
}

/**
 * Resposta do computador: certa com probabilidade `accuracy`, senão um erro plausível.
 * Na múltipla escolha, o erro sai das opções ainda disponíveis.
 */
export function pickCpuAnswer(problem, accuracy, rng = Math.random, options = null) {
  if (rng() < accuracy) return problem.answer;
  const { answer, a, b } = problem;
  const wrongOptions = options?.filter((n) => n !== answer);
  if (wrongOptions?.length) return wrongOptions[randInt(rng, 0, wrongOptions.length - 1)];
  const candidates = [answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, answer - 10, answer + b, answer - b, answer + a]
    .filter((n) => n >= 0 && n !== answer && n <= 999);
  return candidates[randInt(rng, 0, candidates.length - 1)];
}

export class CpuPlayer {
  constructor(difficulty, rng = Math.random, side = 1) {
    this.difficulty = difficulty;
    this.rng = rng;
    this.side = side;
    this.phase = 'idle'; // idle | thinking | typing | confirming
    this.problem = null;
    this.timer = 0;
    this.target = '';
    this.typed = 0;
  }

  get thinking() {
    return this.phase === 'thinking';
  }

  startThinking(player) {
    const { problem } = player;
    const options = player.choices?.filter((n) => !player.eliminated.includes(n)) ?? null;
    this.problem = problem;
    this.phase = 'thinking';
    this.timer = pickDelay(this.difficulty, this.rng);
    this.target = String(pickCpuAnswer(problem, CPU_PROFILES[this.difficulty].accuracy, this.rng, options));
    this.typed = 0;
  }

  update(dt, game) {
    const player = game.players[this.side];
    if (game.state !== 'playing' || player.reveal) {
      this.phase = 'idle';
      return;
    }
    if (this.problem !== player.problem) this.startThinking(player);
    this.timer -= dt;
    if (this.phase === 'thinking' && this.timer <= 0) this.enterTyping();
    else if (this.phase === 'typing') this.stepTyping(game);
    else if (this.phase === 'confirming' && this.timer <= 0) this.confirm(game, player);
  }

  enterTyping() {
    this.phase = 'typing';
    this.timer = 0;
  }

  stepTyping(game) {
    if (this.timer > 0) return;
    game.typeDigit(this.side, this.target[this.typed]);
    this.typed += 1;
    this.timer = TYPE_INTERVAL;
    if (this.typed >= this.target.length) {
      this.phase = 'confirming';
      this.timer = SUBMIT_PAUSE;
    }
  }

  confirm(game, player) {
    const problem = player.problem;
    if (player.choices) game.choose(this.side, Number(this.target));
    else game.submit(this.side);
    // Se errou e a mesma conta continua, tenta de novo; se mudou, o update reinicia sozinho.
    this.phase = 'idle';
    if (player.problem === problem && !player.reveal && game.state === 'playing') {
      this.startThinking(player);
    }
  }
}

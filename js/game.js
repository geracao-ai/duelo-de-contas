// Estado de uma partida de cabo de guerra. Sem DOM e sem relógio próprio:
// o tempo avança por tick(dt), então pausar é só parar de chamar tick().
//
// Lado 0 = esquerda, lado 1 = direita.
// A corda vai de -ropeMax a +ropeMax. Acerto do lado 0 puxa para -1; do lado 1, para +1.

import { generateProblem, checkAnswer } from './problems.js';

export const ROPE_MAX = 5;
export const MAX_ATTEMPTS = 2;
export const MAX_INPUT_LENGTH = 3;
export const COUNTDOWN_SECONDS = 3;
export const REVEAL_SECONDS = 2;

export function createPlayer(side) {
  return {
    side,
    problem: null,
    input: '',
    attempts: 0,
    problemStart: 0,
    reveal: null, // { answer, left } enquanto a resposta é mostrada
    correct: 0,
    wrong: 0,
    times: [],
    streak: 0,
    bestStreak: 0,
    byOp: {},
  };
}

export function averageTime(player) {
  if (player.times.length === 0) return 0;
  return player.times.reduce((sum, t) => sum + t, 0) / player.times.length;
}

export class Game {
  constructor({
    ops, difficulty, rng = Math.random, ropeMax = ROPE_MAX,
    countdown = COUNTDOWN_SECONDS, onEvent = () => {},
  }) {
    this.ops = ops;
    this.difficulty = difficulty;
    this.rng = rng;
    this.ropeMax = ropeMax;
    this.onEvent = onEvent;
    this.rope = 0;
    this.winner = null;
    this.time = 0;
    this.countdownLeft = countdown;
    this.state = countdown > 0 ? 'countdown' : 'playing';
    this.players = [createPlayer(0), createPlayer(1)];
    if (this.state === 'playing') this.begin();
  }

  emit(type, payload = {}) {
    this.onEvent(type, payload);
  }

  begin() {
    this.state = 'playing';
    this.players.forEach((p) => this.nextProblem(p));
    this.emit('start');
  }

  nextProblem(player) {
    player.problem = generateProblem(this.ops, this.difficulty, this.rng, player.problem);
    player.input = '';
    player.attempts = 0;
    player.reveal = null;
    player.problemStart = this.time;
    this.emit('problem', { side: player.side, problem: player.problem });
  }

  canInput(side) {
    return this.state === 'playing' && !this.players[side].reveal;
  }

  tick(dt) {
    if (this.state === 'countdown') {
      this.countdownLeft -= dt;
      if (this.countdownLeft <= 0) this.begin();
      return;
    }
    if (this.state !== 'playing') return;
    this.time += dt;
    for (const player of this.players) {
      if (!player.reveal) continue;
      player.reveal.left -= dt;
      if (player.reveal.left <= 0) this.nextProblem(player);
    }
  }

  typeDigit(side, digit) {
    if (!this.canInput(side) || !/^\d$/.test(String(digit))) return false;
    const player = this.players[side];
    if (player.input === '0') player.input = '';
    if (player.input.length >= MAX_INPUT_LENGTH) return false;
    player.input += String(digit);
    return true;
  }

  erase(side) {
    if (!this.canInput(side)) return false;
    const player = this.players[side];
    if (player.input === '') return false;
    player.input = player.input.slice(0, -1);
    return true;
  }

  /** Confirma a resposta. Devolve 'correct', 'wrong', 'reveal' ou null (nada feito). */
  submit(side) {
    if (!this.canInput(side)) return null;
    const player = this.players[side];
    if (player.input === '') return null;
    return checkAnswer(player.problem, player.input)
      ? this.onCorrect(player)
      : this.onWrong(player);
  }

  opStats(player, op) {
    if (!player.byOp[op]) player.byOp[op] = { correct: 0, wrong: 0 };
    return player.byOp[op];
  }

  onCorrect(player) {
    const { problem } = player;
    const seconds = Math.max(0, this.time - player.problemStart);
    player.correct += 1;
    player.streak += 1;
    player.bestStreak = Math.max(player.bestStreak, player.streak);
    player.times.push(seconds);
    this.opStats(player, problem.op).correct += 1;

    const step = player.side === 0 ? -1 : 1;
    this.rope = Math.max(-this.ropeMax, Math.min(this.ropeMax, this.rope + step));
    this.emit('correct', {
      side: player.side, problem, seconds, streak: player.streak, rope: this.rope,
    });

    if (Math.abs(this.rope) >= this.ropeMax) {
      this.state = 'over';
      this.winner = player.side;
      player.input = '';
      this.emit('win', { side: player.side });
    } else {
      this.nextProblem(player);
    }
    return 'correct';
  }

  onWrong(player) {
    const { problem } = player;
    player.wrong += 1;
    player.streak = 0;
    player.attempts += 1;
    player.input = '';
    this.opStats(player, problem.op).wrong += 1;
    this.emit('wrong', { side: player.side, problem, attempts: player.attempts });
    if (player.attempts >= MAX_ATTEMPTS) {
      player.reveal = { answer: problem.answer, left: REVEAL_SECONDS };
      this.emit('reveal', { side: player.side, answer: problem.answer });
      return 'reveal';
    }
    return 'wrong';
  }
}

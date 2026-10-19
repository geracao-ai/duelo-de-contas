import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, MAX_ATTEMPTS, REVEAL_SECONDS } from '../js/game.js';
import { CpuPlayer, pickCpuAnswer, CPU_PROFILES } from '../js/ai.js';
import {
  emptyStats, recordAnswer, recordMatch, loadStats, saveStats, loadSettings, saveSettings,
} from '../js/stats.js';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function newGame(extra = {}) {
  return new Game({ ops: ['add'], difficulty: 'facil', countdown: 0, ...extra });
}

function answer(game, side, value) {
  for (const ch of String(value)) game.typeDigit(side, ch);
  return game.submit(side);
}

test('acerto puxa a corda para o lado de quem respondeu', () => {
  const game = newGame();
  answer(game, 0, game.players[0].problem.answer);
  assert.equal(game.rope, -1);
  answer(game, 1, game.players[1].problem.answer);
  assert.equal(game.rope, 0);
  answer(game, 1, game.players[1].problem.answer);
  assert.equal(game.rope, 1);
});

test('vence ao chegar na marca e bloqueia novas respostas', () => {
  const game = newGame();
  for (let i = 0; i < game.ropeMax; i++) answer(game, 0, game.players[0].problem.answer);
  assert.equal(game.state, 'over');
  assert.equal(game.winner, 0);
  assert.equal(game.typeDigit(0, 1), false);
});

test('erro não mexe na corda; 2 erros revelam a resposta e trocam a conta', () => {
  const events = [];
  const game = newGame({ onEvent: (t) => events.push(t) });
  const p = game.players[0];
  const first = p.problem;
  const wrongValue = first.answer + 1;
  assert.equal(answer(game, 0, wrongValue), 'wrong');
  assert.equal(game.rope, 0);
  assert.equal(p.problem, first);
  assert.equal(answer(game, 0, wrongValue), 'reveal');
  assert.equal(MAX_ATTEMPTS, 2);
  assert.ok(p.reveal);
  assert.equal(game.typeDigit(0, 1), false);
  game.tick(REVEAL_SECONDS + 0.1);
  assert.equal(p.reveal, null);
  assert.notEqual(p.problem, first);
  assert.ok(events.includes('reveal'));
  assert.equal(p.wrong, 2);
});

test('entrada: limite de dígitos, apagar, zero à esquerda e OK vazio', () => {
  const game = newGame();
  assert.equal(game.submit(0), null);
  game.typeDigit(0, 0);
  game.typeDigit(0, 5);
  assert.equal(game.players[0].input, '5');
  game.typeDigit(0, 1);
  game.typeDigit(0, 2);
  game.typeDigit(0, 3);
  assert.equal(game.players[0].input, '512');
  game.erase(0);
  assert.equal(game.players[0].input, '51');
});

test('contagem regressiva bloqueia a entrada até começar', () => {
  const game = new Game({ ops: ['add'], difficulty: 'facil', countdown: 3 });
  assert.equal(game.typeDigit(0, 1), false);
  game.tick(3.1);
  assert.equal(game.state, 'playing');
  assert.ok(game.players[0].problem);
});

test('computador: precisão e erros plausíveis', () => {
  const problem = { op: 'add', a: 4, b: 5, answer: 9 };
  assert.equal(pickCpuAnswer(problem, 1, () => 0.5), 9);
  for (let i = 0; i < 200; i++) {
    const v = pickCpuAnswer(problem, 0, Math.random);
    assert.ok(v !== 9 && v >= 0);
  }
  assert.ok(CPU_PROFILES.facil.accuracy < CPU_PROFILES.dificil.accuracy);
});

test('computador responde sozinho e puxa a corda', () => {
  const game = newGame({ difficulty: 'dificil' });
  const cpu = new CpuPlayer('dificil', () => 0.01, 1); // sempre acerta, atraso mínimo
  for (let i = 0; i < 400 && game.state === 'playing'; i++) {
    game.tick(0.1);
    cpu.update(0.1, game);
  }
  assert.equal(game.state, 'over');
  assert.equal(game.winner, 1);
});

test('estatísticas: registro, persistência e preferências', () => {
  const storage = fakeStorage();
  const stats = emptyStats();
  recordAnswer(stats, { op: 'add', correct: true, seconds: 4, streak: 3 });
  recordAnswer(stats, { op: 'add', correct: false });
  recordMatch(stats, { mode: 'cpu', humanWon: true });
  saveStats(stats, storage);
  const loaded = loadStats(storage);
  assert.equal(loaded.byOp.add.correct, 1);
  assert.equal(loaded.byOp.add.wrong, 1);
  assert.equal(loaded.bestStreak, 3);
  assert.equal(loaded.winsVsCpu, 1);
  storage.setItem('duelo-de-contas:stats:v1', '{lixo');
  assert.equal(loadStats(storage).matches, 0);

  const animals = ['urso', 'coelho', 'gato'];
  saveSettings({ mode: '2p', ops: ['mul'], difficulty: 'medio', p1: 'gato', p2: 'gato' }, storage);
  const s = loadSettings(animals, ['facil', 'medio', 'dificil'], storage);
  assert.equal(s.mode, '2p');
  assert.deepEqual(s.ops, ['mul']);
  assert.notEqual(s.p1, s.p2);
});

test('múltipla escolha: acerto puxa, erro apaga a opção e o 2º erro revela', () => {
  const game = newGame({ choices: true });
  const player = game.players[0];
  assert.equal(player.choices.length, 4);
  assert.ok(player.choices.includes(player.problem.answer));

  assert.equal(game.choose(0, player.problem.answer), 'correct');
  assert.equal(game.rope, -1);

  const [w1, w2] = player.choices.filter((n) => n !== player.problem.answer);
  assert.equal(game.choose(0, w1), 'wrong');
  assert.deepEqual(player.eliminated, [w1]);
  assert.equal(game.choose(0, w1), null, 'opção apagada não vale de novo');
  assert.equal(game.choose(0, 999), null, 'valor fora das opções é ignorado');
  assert.equal(game.choose(0, w2), 'reveal');
  game.tick(REVEAL_SECONDS + 0.1);
  assert.deepEqual(player.eliminated, []);
  assert.equal(player.choices.length, 4);
});

test('modo teclado não gera opções', () => {
  const game = newGame();
  assert.equal(game.players[0].choices, null);
});

test('computador na múltipla escolha só responde com opções disponíveis', () => {
  const problem = { op: 'add', a: 2, b: 3, answer: 5 };
  for (let i = 0; i < 50; i++) {
    const n = pickCpuAnswer(problem, 0, Math.random, [5, 4, 6, 1]);
    assert.ok([4, 6, 1].includes(n));
  }
  const game = newGame({ choices: true });
  const cpu = new CpuPlayer('facil', () => 0.01, 1); // sempre acerta, atraso mínimo
  for (let i = 0; i < 400 && game.rope === 0; i++) {
    cpu.update(0.05, game);
    game.tick(0.05);
  }
  assert.equal(game.rope, 1);
});

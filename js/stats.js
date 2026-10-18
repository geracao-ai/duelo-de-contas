// Estatísticas e preferências guardadas no localStorage (com tolerância a falhas).

import { OPERATIONS } from './problems.js';

export const STATS_KEY = 'duelo-de-contas:stats:v1';
export const SETTINGS_KEY = 'duelo-de-contas:settings:v1';

export function getStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function safeGet(key, storage = getStorage()) {
  try {
    return storage ? storage.getItem(key) : null;
  } catch {
    return null;
  }
}

export function safeSet(key, value, storage = getStorage()) {
  try {
    if (storage) storage.setItem(key, value);
  } catch {
    // Armazenamento indisponível: o jogo continua funcionando sem salvar.
  }
}

export function safeRemove(key, storage = getStorage()) {
  try {
    if (storage) storage.removeItem(key);
  } catch {
    // ignorado
  }
}

export function emptyStats() {
  const byOp = {};
  for (const op of OPERATIONS) byOp[op] = { correct: 0, wrong: 0 };
  return {
    version: 1,
    matches: 0,
    winsVsCpu: 0,
    lossesVsCpu: 0,
    byOp,
    totalTime: 0,
    timedAnswers: 0,
    bestStreak: 0,
  };
}

const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);

function sanitize(raw) {
  const stats = emptyStats();
  if (!raw || typeof raw !== 'object') return stats;
  stats.matches = num(raw.matches);
  stats.winsVsCpu = num(raw.winsVsCpu);
  stats.lossesVsCpu = num(raw.lossesVsCpu);
  stats.totalTime = num(raw.totalTime);
  stats.timedAnswers = num(raw.timedAnswers);
  stats.bestStreak = num(raw.bestStreak);
  for (const op of OPERATIONS) {
    stats.byOp[op].correct = num(raw.byOp?.[op]?.correct);
    stats.byOp[op].wrong = num(raw.byOp?.[op]?.wrong);
  }
  return stats;
}

export function loadStats(storage = getStorage()) {
  const text = safeGet(STATS_KEY, storage);
  if (!text) return emptyStats();
  try {
    return sanitize(JSON.parse(text));
  } catch {
    return emptyStats();
  }
}

export function saveStats(stats, storage = getStorage()) {
  safeSet(STATS_KEY, JSON.stringify(stats), storage);
}

export function resetStats(storage = getStorage()) {
  safeRemove(STATS_KEY, storage);
  return emptyStats();
}

/** Registra uma resposta de jogador humano. `streak` é a sequência atual de acertos. */
export function recordAnswer(stats, { op, correct, seconds = 0, streak = 0 }) {
  const entry = stats.byOp[op];
  if (!entry) return stats;
  if (correct) {
    entry.correct += 1;
    stats.totalTime += num(seconds);
    stats.timedAnswers += 1;
    stats.bestStreak = Math.max(stats.bestStreak, streak);
  } else {
    entry.wrong += 1;
  }
  return stats;
}

/** Registra o fim de uma partida. `humanWon` só importa contra o computador. */
export function recordMatch(stats, { mode, humanWon }) {
  stats.matches += 1;
  if (mode === 'cpu') {
    if (humanWon) stats.winsVsCpu += 1;
    else stats.lossesVsCpu += 1;
  }
  return stats;
}

export function accuracyPercent(correct, wrong) {
  const total = correct + wrong;
  return total === 0 ? 0 : Math.round((correct / total) * 100);
}

export function averageTime(stats) {
  return stats.timedAnswers === 0 ? 0 : stats.totalTime / stats.timedAnswers;
}

export const DEFAULT_SETTINGS = {
  mode: 'cpu',
  ops: ['add', 'sub'],
  difficulty: 'facil',
  p1: 'urso',
  p2: 'coelho',
};

export function loadSettings(validAnimals, validDifficulties, storage = getStorage()) {
  const settings = { ...DEFAULT_SETTINGS, ops: [...DEFAULT_SETTINGS.ops] };
  const text = safeGet(SETTINGS_KEY, storage);
  if (!text) return settings;
  try {
    const raw = JSON.parse(text);
    if (raw.mode === 'cpu' || raw.mode === '2p') settings.mode = raw.mode;
    const ops = Array.isArray(raw.ops) ? raw.ops.filter((o) => OPERATIONS.includes(o)) : [];
    if (ops.length > 0) settings.ops = ops;
    if (validDifficulties.includes(raw.difficulty)) settings.difficulty = raw.difficulty;
    if (validAnimals.includes(raw.p1)) settings.p1 = raw.p1;
    if (validAnimals.includes(raw.p2) && raw.p2 !== settings.p1) settings.p2 = raw.p2;
    if (settings.p2 === settings.p1) {
      settings.p2 = validAnimals.find((a) => a !== settings.p1);
    }
  } catch {
    // preferências corrompidas: usa o padrão
  }
  return settings;
}

export function saveSettings(settings, storage = getStorage()) {
  safeSet(SETTINGS_KEY, JSON.stringify(settings), storage);
}

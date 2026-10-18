// Gerador de contas (puro, sem DOM). Sempre 2 operandos.
// Subtração nunca é negativa e a divisão é sempre exata.

export const OPERATIONS = ['add', 'sub', 'mul', 'div'];
export const DIFFICULTIES = ['facil', 'medio', 'dificil'];

export const OP_SYMBOLS = { add: '+', sub: '−', mul: '×', div: '÷' };
export const OP_NAMES = { add: 'Soma', sub: 'Subtração', mul: 'Multiplicação', div: 'Divisão' };
export const OP_WORDS = { add: 'mais', sub: 'menos', mul: 'vezes', div: 'dividido por' };
export const DIFFICULTY_LABELS = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' };

/**
 * Intervalos [min, max] (inclusivos) por dificuldade e operação.
 * add/sub: operandos de 1..max (no Difícil a soma fica <= 100).
 * mul: a = tabuada, b = multiplicador.
 * div: divisor e quociente (o dividendo é divisor * quociente).
 */
export const RANGES = {
  facil: {
    add: { a: [1, 10], b: [1, 10] },
    sub: { a: [2, 10] },
    mul: { a: [2, 5], b: [1, 10] },
    div: { divisor: [2, 5], quotient: [1, 5] },
  },
  medio: {
    add: { a: [1, 20], b: [1, 20] },
    sub: { a: [2, 20] },
    mul: { a: [2, 10], b: [2, 10] },
    div: { divisor: [2, 10], quotient: [1, 10] },
  },
  dificil: {
    add: { a: [10, 90], sumMax: 100 },
    sub: { a: [11, 100] },
    mul: { a: [2, 12], b: [2, 12] },
    div: { divisor: [2, 12], quotient: [1, 12] },
  },
};

const MAX_REPEAT_TRIES = 60;

export function randInt(rng, min, max) {
  const n = Math.floor(rng() * (max - min + 1)) + min;
  return Math.min(max, Math.max(min, n));
}

function buildProblem(op, a, b, answer) {
  const symbol = OP_SYMBOLS[op];
  return { op, a, b, answer, symbol, text: `${a} ${symbol} ${b}` };
}

const builders = {
  add(range, rng) {
    const a = randInt(rng, ...range.a);
    const b = range.sumMax ? randInt(rng, 1, range.sumMax - a) : randInt(rng, ...range.b);
    return buildProblem('add', a, b, a + b);
  },
  sub(range, rng) {
    const a = randInt(rng, ...range.a);
    const b = randInt(rng, 1, a - 1);
    return buildProblem('sub', a, b, a - b);
  },
  mul(range, rng) {
    const a = randInt(rng, ...range.a);
    const b = randInt(rng, ...range.b);
    return buildProblem('mul', a, b, a * b);
  },
  div(range, rng) {
    const divisor = randInt(rng, ...range.divisor);
    const quotient = randInt(rng, ...range.quotient);
    return buildProblem('div', divisor * quotient, divisor, quotient);
  },
};

function validateOps(ops) {
  if (!Array.isArray(ops) || ops.length === 0) {
    throw new Error('Selecione ao menos uma operação.');
  }
  for (const op of ops) {
    if (!OPERATIONS.includes(op)) throw new Error(`Operação inválida: ${op}`);
  }
}

function isSameProblem(p, q) {
  return Boolean(p && q) && p.op === q.op && p.a === q.a && p.b === q.b;
}

/**
 * Gera uma conta aleatória.
 * @param {string[]} ops subconjunto não vazio de OPERATIONS
 * @param {string} difficulty 'facil' | 'medio' | 'dificil'
 * @param {() => number} rng função que devolve [0, 1)
 * @param {object|null} previous conta anterior (evita repetição imediata)
 */
export function generateProblem(ops, difficulty, rng = Math.random, previous = null) {
  validateOps(ops);
  if (!RANGES[difficulty]) throw new Error(`Dificuldade inválida: ${difficulty}`);
  let problem = null;
  for (let i = 0; i < MAX_REPEAT_TRIES; i++) {
    const op = ops[randInt(rng, 0, ops.length - 1)];
    problem = builders[op](RANGES[difficulty][op], rng);
    if (!isSameProblem(problem, previous)) break;
  }
  return problem;
}

/** Confere a resposta (número ou texto só com dígitos). */
export function checkAnswer(problem, value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return Number.isInteger(value) && value === problem.answer;
  const text = String(value).trim();
  return /^\d+$/.test(text) && Number(text) === problem.answer;
}

export function formatProblem(problem) {
  return `${problem.text} = ?`;
}

export function spokenProblem(problem) {
  return `${problem.a} ${OP_WORDS[problem.op]} ${problem.b}`;
}

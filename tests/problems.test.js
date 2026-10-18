import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATIONS, DIFFICULTIES, RANGES, generateProblem, checkAnswer, formatProblem,
} from '../js/problems.js';

// PRNG determinístico (mulberry32) para testes reprodutíveis.
function seeded(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const inRange = (n, [min, max]) => n >= min && n <= max;
const ITER = 1500;

for (const difficulty of DIFFICULTIES) {
  for (const op of OPERATIONS) {
    test(`${op} / ${difficulty}: valores válidos e resposta correta`, () => {
      const rng = seeded(42);
      const range = RANGES[difficulty][op];
      for (let i = 0; i < ITER; i++) {
        const p = generateProblem([op], difficulty, rng);
        assert.equal(p.op, op);
        assert.ok(Number.isInteger(p.answer) && p.answer >= 0, `resposta inválida: ${p.text}`);
        assert.ok(checkAnswer(p, p.answer));
        assert.ok(!checkAnswer(p, p.answer + 1));
        if (op === 'add') {
          assert.equal(p.answer, p.a + p.b);
          assert.ok(inRange(p.a, range.a));
          if (range.sumMax) assert.ok(p.a + p.b <= range.sumMax && p.b >= 1);
          else assert.ok(inRange(p.b, range.b));
        } else if (op === 'sub') {
          assert.equal(p.answer, p.a - p.b);
          assert.ok(p.a >= p.b && p.b >= 1 && p.a <= (range.a[1]), `sub fora do intervalo: ${p.text}`);
          assert.ok(inRange(p.a, range.a));
        } else if (op === 'mul') {
          assert.equal(p.answer, p.a * p.b);
          assert.ok(inRange(p.a, range.a) && inRange(p.b, range.b));
        } else {
          assert.notEqual(p.b, 0);
          assert.equal(p.a % p.b, 0, `divisão inexata: ${p.text}`);
          assert.equal(p.answer, p.a / p.b);
          assert.ok(inRange(p.b, range.divisor) && inRange(p.answer, range.quotient));
        }
      }
    });
  }
}

test('limites da especificação por dificuldade', () => {
  assert.ok(RANGES.facil.add.a[1] <= 10 && RANGES.facil.mul.a[1] <= 5 && RANGES.facil.div.divisor[1] <= 5);
  assert.ok(RANGES.facil.div.quotient[1] <= 5);
  assert.ok(RANGES.medio.add.a[1] <= 20 && RANGES.medio.mul.a[1] <= 10 && RANGES.medio.div.quotient[1] <= 10);
  assert.ok(RANGES.dificil.mul.a[1] <= 12 && RANGES.dificil.div.divisor[1] <= 12);
});

test('apenas operações selecionadas aparecem', () => {
  const rng = seeded(7);
  const selected = ['add', 'mul'];
  const seen = new Set();
  for (let i = 0; i < 600; i++) {
    seen.add(generateProblem(selected, 'medio', rng).op);
  }
  assert.deepEqual([...seen].sort(), ['add', 'mul']);
});

test('todas as operações selecionadas acabam aparecendo', () => {
  const rng = seeded(11);
  const seen = new Set();
  for (let i = 0; i < 600; i++) seen.add(generateProblem(OPERATIONS, 'dificil', rng).op);
  assert.equal(seen.size, 4);
});

test('nunca repete a conta imediatamente anterior', () => {
  for (const difficulty of DIFFICULTIES) {
    const rng = seeded(99);
    let previous = null;
    for (let i = 0; i < 2000; i++) {
      const p = generateProblem(OPERATIONS, difficulty, rng, previous);
      if (previous) {
        assert.ok(!(p.op === previous.op && p.a === previous.a && p.b === previous.b),
          `repetiu ${p.text}`);
      }
      previous = p;
    }
  }
});

test('não repete mesmo com uma única operação e pouco espaço', () => {
  const rng = seeded(5);
  let previous = null;
  for (let i = 0; i < 1000; i++) {
    const p = generateProblem(['div'], 'facil', rng, previous);
    if (previous) assert.notEqual(p.text, previous.text);
    previous = p;
  }
});

test('operações vazias ou inválidas lançam erro', () => {
  assert.throws(() => generateProblem([], 'facil'));
  assert.throws(() => generateProblem(undefined, 'facil'));
  assert.throws(() => generateProblem(null, 'facil'));
  assert.throws(() => generateProblem(['pow'], 'facil'));
  assert.throws(() => generateProblem(['add', 'xyz'], 'medio'));
});

test('dificuldade inválida lança erro', () => {
  assert.throws(() => generateProblem(['add'], 'impossivel'));
});

test('checkAnswer aceita texto e número, rejeita vazio e inválido', () => {
  const p = { op: 'mul', a: 6, b: 7, answer: 42 };
  assert.ok(checkAnswer(p, 42));
  assert.ok(checkAnswer(p, '42'));
  assert.ok(checkAnswer(p, ' 42 '));
  assert.ok(!checkAnswer(p, ''));
  assert.ok(!checkAnswer(p, '   '));
  assert.ok(!checkAnswer(p, null));
  assert.ok(!checkAnswer(p, undefined));
  assert.ok(!checkAnswer(p, '4a'));
  assert.ok(!checkAnswer(p, '-42'));
  assert.ok(!checkAnswer(p, 42.5));
  assert.ok(!checkAnswer(p, 41));
});

test('formatProblem mostra a conta com interrogação', () => {
  assert.equal(formatProblem({ text: '3 × 4' }), '3 × 4 = ?');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPERATIONS, DIFFICULTIES, generateProblem } from '../js/problems.js';
import { buildHelpModel, layoutHelp, fitLayout, TENS_ABOVE } from '../js/visual-help.js';

const cells = (layout) => layout.items.filter((it) => it.type === 'cell');
const texts = (layout) => layout.items.filter((it) => it.type === 'text');

/** Quantos "uns" uma parte representa (barra = 10). */
const valueOf = (part) => part.pieces.reduce((sum, p) => sum + (p.kind === 'ten' ? 10 : 1), 0);

test('soma: duas partes com os valores certos, cores diferentes', () => {
  const model = buildHelpModel({ op: 'add', a: 3, b: 4, answer: 7 }, 'facil');
  assert.deepEqual(model.parts.map(valueOf), [3, 4]);
  const layout = layoutHelp(model);
  assert.equal(cells(layout).length, 7);
  assert.equal(cells(layout).filter((c) => c.color === 'a').length, 3);
  assert.ok(texts(layout).some((t) => t.text === '+'));
});

test('subtração: risca exatamente o que é tirado', () => {
  const layout = layoutHelp(buildHelpModel({ op: 'sub', a: 9, b: 3, answer: 6 }, 'facil'));
  assert.equal(cells(layout).length, 9);
  assert.equal(cells(layout).filter((c) => c.crossed).length, 3);
});

test('subtração com dezenas: barra "quebrada" para tirar unidades', () => {
  const model = buildHelpModel({ op: 'sub', a: 63, b: 27, answer: 36 }, 'dificil');
  assert.ok(model.tens);
  assert.equal(model.parts[0].pieces.filter((p) => p.kind === 'ten').length, 6);
  const layout = layoutHelp(model);
  assert.equal(cells(layout).length, 63);
  assert.equal(cells(layout).filter((c) => c.crossed).length, 27);
});

test('multiplicação: grade a × b; divisão: b caixas com a resposta em cada', () => {
  const grid = layoutHelp(buildHelpModel({ op: 'mul', a: 3, b: 4, answer: 12 }, 'medio'));
  assert.equal(cells(grid).length, 12);
  const div = buildHelpModel({ op: 'div', a: 12, b: 3, answer: 4 }, 'medio');
  const boxes = layoutHelp(div);
  assert.equal(boxes.items.filter((it) => it.type === 'box').length, 3);
  assert.equal(cells(boxes).length, 12);
});

test('números embaixo dos grupos só no Fácil e no Médio', () => {
  const p = { op: 'add', a: 5, b: 6, answer: 11 };
  assert.ok(texts(layoutHelp(buildHelpModel(p, 'facil'))).some((t) => t.text === '5'));
  assert.ok(texts(layoutHelp(buildHelpModel(p, 'medio'))).some((t) => t.text === '6'));
  assert.ok(!texts(layoutHelp(buildHelpModel(p, 'dificil'))).some((t) => /\d/.test(t.text)));
});

test('todas as contas geradas: blocos batem com a conta e o layout tem tamanho válido', () => {
  for (const difficulty of DIFFICULTIES) {
    for (const op of OPERATIONS) {
      for (let i = 0; i < 300; i++) {
        const p = generateProblem([op], difficulty);
        const model = buildHelpModel(p, difficulty);
        const layout = layoutHelp(model);
        const n = cells(layout).length;
        const label = `${difficulty} ${p.text}`;
        assert.ok(layout.width > 0 && layout.height > 0, label);
        assert.ok(cells(layout).every((c) => Number.isFinite(c.x) && Number.isFinite(c.y)), label);
        if (op === 'add') assert.equal(n, p.a + p.b, label);
        if (op === 'sub') {
          assert.equal(n, p.a, label);
          assert.equal(cells(layout).filter((c) => c.crossed).length, p.b, label);
        }
        if (op === 'mul') assert.equal(n, p.a * p.b, label);
        if (op === 'div') assert.equal(n, p.a, label);
        if (model.parts) assert.equal(model.tens, Math.max(p.a, p.b, p.answer) > TENS_ABOVE || (op === 'sub' && p.a > TENS_ABOVE), label);
      }
    }
  }
});

test('lousa estreita: escolhe fileiras de 5 quando os blocos ficam maiores', () => {
  const model = buildHelpModel({ op: 'add', a: 10, b: 6, answer: 16 }, 'medio');
  const standard = layoutHelp(model); // fileiras de 10
  const narrow = fitLayout(model, 140, 120);
  assert.ok(narrow.width < standard.width);
  // uma conta curta continua no arranjo padrão
  const small = buildHelpModel({ op: 'add', a: 3, b: 4, answer: 7 }, 'facil');
  assert.equal(fitLayout(small, 300, 180).width, layoutHelp(small).width);
  assert.equal(narrow.items.filter((it) => it.type === 'cell').length, 16);
});

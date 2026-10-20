import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  visitEvents, matchProps, finishProps, abandonProps, shouldEnable,
  isOptedOut, setOptOut, track, isActive, OPTOUT_KEY,
} from '../js/analytics.js';
import { createPlayer } from '../js/game.js';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const at = (y, m, d) => new Date(y, m - 1, d, 12);

test('primeira visita envia os três eventos e guarda só datas', () => {
  const { events, record } = visitEvents(null, at(2026, 10, 20));
  assert.deepEqual(events, ['primeira_visita', 'visita_dia', 'visita_mes']);
  assert.deepEqual(record, { first: true, day: '2026-10-20', month: '2026-10' });
});

test('mesmo dia: nenhum evento', () => {
  const record = { first: true, day: '2026-10-20', month: '2026-10' };
  assert.deepEqual(visitEvents(record, at(2026, 10, 20)).events, []);
});

test('novo dia no mesmo mês: só visita_dia', () => {
  const record = { first: true, day: '2026-10-20', month: '2026-10' };
  const result = visitEvents(record, at(2026, 10, 21));
  assert.deepEqual(result.events, ['visita_dia']);
  assert.equal(result.record.day, '2026-10-21');
});

test('novo mês: visita_dia e visita_mes', () => {
  const record = { first: true, day: '2026-10-31', month: '2026-10' };
  assert.deepEqual(visitEvents(record, at(2026, 11, 1)).events, ['visita_dia', 'visita_mes']);
});

test('registro corrompido conta como primeira visita', () => {
  assert.equal(visitEvents('lixo', at(2026, 10, 20)).events[0], 'primeira_visita');
  assert.equal(visitEvents({ day: 'x' }, at(2026, 10, 20)).events[0], 'primeira_visita');
});

const settings = { difficulty: 'facil', ops: ['add', 'mul'] };

test('matchProps usa só valores fixos', () => {
  assert.deepEqual(matchProps(settings, true, 'choices', 'urso'), {
    modo: 'cpu',
    nivel: 'facil',
    entrada: 'opcoes',
    op_soma: true,
    op_subtracao: false,
    op_multiplicacao: true,
    op_divisao: false,
    bichinho: 'urso',
  });
  const props = matchProps({ difficulty: 'dificil', ops: ['div'] }, false, 'keypad', 'gato');
  assert.equal(props.modo, '2p');
  assert.equal(props.entrada, 'teclado');
  assert.equal(props.op_divisao, true);
});

function player(side, correct, wrong, byOp, times) {
  return { ...createPlayer(side), correct, wrong, byOp, times };
}

test('finishProps contra o computador: vitória e derrota', () => {
  const base = matchProps(settings, true, 'choices', 'urso');
  const human = player(0, 5, 2, { add: { correct: 3, wrong: 1 }, mul: { correct: 2, wrong: 1 } }, [2, 4, 3, 3, 3]);
  const win = finishProps(base, [human], { winner: 0, seconds: 61.6, glassesActivations: 2 });
  assert.equal(win.resultado, 'vitoria');
  assert.equal(win.duracao_s, 62);
  assert.equal(win.acertos, 5);
  assert.equal(win.erros, 2);
  assert.equal(win.acertos_soma, 3);
  assert.equal(win.erros_multiplicacao, 1);
  assert.equal(win.acertos_divisao, 0);
  assert.equal(win.tempo_medio_s, 3);
  assert.equal(win.usou_oculos, true);
  assert.equal(win.ativacoes_oculos, 2);
  assert.equal(finishProps(base, [human], { winner: 1, seconds: 10 }).resultado, 'derrota');
  assert.equal(finishProps(base, [human], { winner: 1, seconds: 10 }).usou_oculos, false);
});

test('finishProps em 2 jogadores soma os dois e usa vencedor_j1/j2', () => {
  const base = matchProps(settings, false, 'keypad', 'urso');
  const a = player(0, 5, 1, { add: { correct: 5, wrong: 1 } }, [2, 2]);
  const b = player(1, 3, 2, { add: { correct: 3, wrong: 2 } }, [4, 4]);
  const props = finishProps(base, [a, b], { winner: 1, seconds: 30 });
  assert.equal(props.resultado, 'vencedor_j2');
  assert.equal(props.acertos, 8);
  assert.equal(props.erros, 3);
  assert.equal(props.acertos_soma, 8);
  assert.equal(props.tempo_medio_s, 3);
  assert.equal(finishProps(base, [a, b], { winner: 0, seconds: 1 }).resultado, 'vencedor_j1');
});

test('nenhuma propriedade é texto livre', () => {
  const base = matchProps(settings, true, 'choices', 'urso');
  const human = player(0, 0, 0, {}, []);
  const enums = ['cpu', '2p', 'facil', 'medio', 'dificil', 'opcoes', 'teclado', 'urso',
    'vitoria', 'derrota', 'vencedor_j1', 'vencedor_j2'];
  for (const props of [base, finishProps(base, [human], { winner: 0, seconds: 5 }), abandonProps(base, [human], 5)]) {
    for (const value of Object.values(props)) {
      if (typeof value === 'string') assert.ok(enums.includes(value), value);
      else assert.ok(typeof value === 'boolean' || Number.isFinite(value), String(value));
    }
  }
  assert.equal(finishProps(base, [human], { winner: 0, seconds: 5 }).tempo_medio_s, 0);
});

test('abandonProps traz duração, acertos e erros', () => {
  const base = matchProps(settings, true, 'choices', 'urso');
  const props = abandonProps(base, [player(0, 2, 1, {}, [1])], 12.4);
  assert.equal(props.duracao_s, 12);
  assert.equal(props.acertos, 2);
  assert.equal(props.erros, 1);
  assert.equal(props.modo, 'cpu');
});

test('opt-out persiste no armazenamento', () => {
  const storage = fakeStorage();
  assert.equal(isOptedOut(storage), false);
  setOptOut(true, storage);
  assert.equal(storage.getItem(OPTOUT_KEY), '1');
  assert.equal(isOptedOut(storage), true);
  setOptOut(false, storage);
  assert.equal(isOptedOut(storage), false);
});

test('opt-out tolera armazenamento quebrado', () => {
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(isOptedOut(broken), false);
  assert.doesNotThrow(() => setOptOut(true, broken));
});

test('shouldEnable respeita opt-out, GPC, localhost e protocolo', () => {
  const site = { protocol: 'https:', hostname: 'duelo.example.com' };
  assert.equal(shouldEnable(site), true);
  assert.equal(shouldEnable({ ...site, optedOut: true }), false);
  assert.equal(shouldEnable({ ...site, gpc: true }), false);
  assert.equal(shouldEnable({ protocol: 'file:', hostname: '' }), false);
  assert.equal(shouldEnable({ protocol: 'http:', hostname: 'localhost' }), false);
  assert.equal(shouldEnable({ protocol: 'http:', hostname: '127.0.0.1', search: '?x=1' }), false);
  assert.equal(shouldEnable({ protocol: 'http:', hostname: 'localhost', search: '?analytics=1' }), true);
  assert.equal(shouldEnable({ ...site, optedOut: true, search: '?analytics=1' }), false);
});

test('track não faz nada quando desativado', () => {
  let calls = 0;
  globalThis.posthog = { capture: () => { calls += 1; } };
  assert.equal(isActive(), false);
  assert.doesNotThrow(() => track('partida_iniciada', { modo: 'cpu' }, { beacon: true }));
  assert.equal(calls, 0);
  delete globalThis.posthog;
});

// Arquivo separado: initAnalytics liga as estatísticas para o módulo inteiro (estado global).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initAnalytics, track, isActive, SUPER_PROPS } from '../js/analytics.js';

test('initAnalytics registra app e $lib em todo evento, antes do primeiro envio', () => {
  const scripts = [];
  globalThis.location = { protocol: 'https:', hostname: 'duelo-de-contas.pages.dev', search: '' };
  globalThis.document = {
    createElement: () => ({}),
    head: { appendChild: (el) => scripts.push(el) },
  };
  globalThis.localStorage = {
    getItem: () => null, setItem: () => {}, removeItem: () => {},
  };

  initAnalytics();
  assert.equal(isActive(), true);
  assert.equal(scripts.length, 1);

  const fila = [...globalThis.posthog];
  const registro = fila.findIndex(([metodo]) => metodo === 'register');
  const primeiroEnvio = fila.findIndex(([metodo]) => metodo === 'capture');
  assert.ok(registro >= 0, 'register foi chamado');
  assert.deepEqual(fila[registro][1], { app: 'duelo-de-contas', $lib: 'duelo-de-contas-web' });
  assert.ok(registro < primeiroEnvio, 'register vem antes dos eventos de visita');
  assert.deepEqual(SUPER_PROPS, { app: 'duelo-de-contas', $lib: 'duelo-de-contas-web' });

  track('partida_iniciada', { modo: 'cpu' });
  assert.deepEqual(globalThis.posthog.at(-1), ['capture', 'partida_iniciada', { modo: 'cpu' }, undefined]);
});

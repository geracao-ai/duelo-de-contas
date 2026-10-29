import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEMAS, PASSOS, TITULO_DO_TEMA, sistemaDoAparelho, temasDaAjuda, temaValido, ajudaProps,
} from '../js/ajuda.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';

test('sistemaDoAparelho reconhece iPhone, Android e iPad que se apresenta como Mac', () => {
  assert.equal(sistemaDoAparelho(IPHONE), 'ios');
  assert.equal(sistemaDoAparelho(ANDROID), 'android');
  assert.equal(sistemaDoAparelho(MAC, { toques: 5 }), 'ios');
  assert.equal(sistemaDoAparelho(MAC), null);
  assert.equal(sistemaDoAparelho(WINDOWS), null);
  assert.equal(sistemaDoAparelho(), null);
});

test('temasDaAjuda: amigo primeiro; o do aparelho logo depois e em destaque; todos sempre na lista', () => {
  const ids = (lista) => lista.map((t) => t.id);
  assert.deepEqual(ids(temasDaAjuda(null)), ['amigo', 'iphone', 'android']);
  assert.deepEqual(ids(temasDaAjuda('ios')), ['amigo', 'iphone', 'android']);
  assert.deepEqual(ids(temasDaAjuda('android')), ['amigo', 'android', 'iphone']);
  assert.deepEqual(temasDaAjuda('android').filter((t) => t.destaque).map((t) => t.id), ['android']);
  assert.deepEqual(temasDaAjuda('ios').filter((t) => t.destaque).map((t) => t.id), ['iphone']);
  assert.equal(temasDaAjuda(null).some((t) => t.destaque), false);
});

test('cada tema tem título e passos curtos para o leitor de tela', () => {
  for (const { id } of TEMAS) {
    assert.ok(TITULO_DO_TEMA[id], id);
    assert.ok(PASSOS[id].length >= 3, id);
    for (const passo of PASSOS[id]) assert.ok(passo.length <= 140, passo);
  }
  assert.match(PASSOS.amigo.join(' '), /recebeu/); // o PIN vem do amigo
  assert.match(PASSOS.iphone.join(' '), /Adicionar à Tela de Início/);
  assert.match(PASSOS.android.join(' '), /Instalar e criar atalho/); // nome no Chrome do Android (2026)
});

test('ajudaProps só envia valores conhecidos', () => {
  assert.deepEqual(ajudaProps('iphone', 'menu'), { tema: 'iphone', origem: 'menu' });
  assert.deepEqual(ajudaProps('amigo', 'desafiar'), { tema: 'amigo', origem: 'desafiar' });
  assert.deepEqual(ajudaProps('<script>', 'qualquer'), { tema: 'amigo', origem: 'menu' });
  assert.equal(temaValido('android'), true);
  assert.equal(temaValido('outro'), false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newUrl } from '../redirect/redirect.js';

test('raiz antiga vai para a raiz nova, mantendo query e hash', () => {
  assert.equal(newUrl({ pathname: '/duelo-de-contas/', search: '?pin=123', hash: '' }),
    'https://duelo-de-contas.pages.dev/?pin=123');
  assert.equal(newUrl({ pathname: '/duelo-de-contas', search: '', hash: '#x' }),
    'https://duelo-de-contas.pages.dev/#x');
});

test('mantém o caminho depois de /duelo-de-contas', () => {
  assert.equal(newUrl({ pathname: '/duelo-de-contas/assets/demo.mp4', search: '?a=1', hash: '#t' }),
    'https://duelo-de-contas.pages.dev/assets/demo.mp4?a=1#t');
});

test('caminhos fora do prefixo não ganham prefixo extra', () => {
  assert.equal(newUrl({ pathname: '/outra/pagina', search: '', hash: '' }),
    'https://duelo-de-contas.pages.dev/outra/pagina');
  assert.equal(newUrl({ pathname: '/duelo-de-contasX', search: '', hash: '' }),
    'https://duelo-de-contas.pages.dev/duelo-de-contasX');
});

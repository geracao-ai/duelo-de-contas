import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../scripts/build.mjs';

test('build copia o jogo e deixa de fora testes, ferramentas e funções', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'duelo-dist-'));
  const saida = join(pasta, 'dist');
  try {
    build(saida);
    for (const f of [
      'index.html', 'css/style.css', 'js/game.js', 'assets/og-image.png', 'apple-touch-icon.png',
      'manifest.webmanifest', 'assets/icone-192.png', 'assets/icone-512.png', 'assets/fontes/patrick-hand.woff2',
    ]) {
      assert.ok(existsSync(join(saida, f)), `deveria existir: ${f}`);
    }
    for (const f of ['tests', 'tools', '.github', 'node_modules', 'functions', 'redirect', 'package.json']) {
      assert.ok(!existsSync(join(saida, f)), `não deveria existir: ${f}`);
    }
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('manifest.webmanifest: nome, tela cheia e ícones que existem', () => {
  const manifesto = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifesto.name, 'Duelo de Contas');
  assert.equal(manifesto.display, 'standalone');
  assert.equal(manifesto.start_url, '/');
  assert.deepEqual(manifesto.icons.map((i) => i.sizes), ['192x192', '512x512']);
  for (const icone of manifesto.icons) {
    assert.ok(existsSync(new URL(`..${icone.src}`, import.meta.url)), icone.src);
  }
});

test('build limpa a pasta de saída antes de copiar', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'duelo-dist-'));
  try {
    build(pasta);
    writeFileSync(join(pasta, 'velho.txt'), 'x');
    build(pasta);
    assert.ok(!existsSync(join(pasta, 'velho.txt')));
    assert.ok(existsSync(join(pasta, 'index.html')));
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../scripts/build.mjs';

test('build copia o jogo e deixa de fora testes, ferramentas e funções', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'duelo-dist-'));
  const saida = join(pasta, 'dist');
  try {
    build(saida);
    for (const f of ['index.html', 'css/style.css', 'js/game.js', 'assets/og-image.png']) {
      assert.ok(existsSync(join(saida, f)), `deveria existir: ${f}`);
    }
    for (const f of ['tests', 'tools', '.github', 'node_modules', 'functions', 'redirect', 'package.json']) {
      assert.ok(!existsSync(join(saida, f)), `não deveria existir: ${f}`);
    }
  } finally {
    rmSync(pasta, { recursive: true, force: true });
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

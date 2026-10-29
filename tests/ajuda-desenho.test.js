// As ilustrações da Ajuda desenham sem erro nos três temas, deitado e em pé (contexto 2D falso).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desenharAjuda } from '../js/ajuda-desenho.js';

function canvasFalso(largura, altura) {
  const chamadas = { fillText: [], stroke: 0 };
  const ctx = new Proxy({}, {
    get(alvo, nome) {
      if (nome in alvo) return alvo[nome];
      if (nome === 'fillText') return (texto) => chamadas.fillText.push(texto);
      if (nome === 'stroke') return () => { chamadas.stroke += 1; };
      if (nome === 'createLinearGradient' || nome === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (nome === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set(alvo, nome, valor) { alvo[nome] = valor; return true; },
  });
  return {
    chamadas,
    canvas: {
      width: 0, height: 0,
      getBoundingClientRect: () => ({ width: largura, height: altura }),
      getContext: () => ctx,
    },
  };
}

test('desenharAjuda: três temas, deitado e em pé, com as notas dos passos', async () => {
  globalThis.document = { fonts: { load: async () => [] } };
  for (const tema of ['amigo', 'iphone', 'android']) {
    for (const [l, a] of [[800, 300], [360, 640]]) {
      const { canvas, chamadas } = canvasFalso(l, a);
      await desenharAjuda(canvas, tema);
      assert.ok(chamadas.stroke > 20, `${tema} ${l}x${a}: traços`);
      const textos = chamadas.fillText.join(' | ');
      assert.match(textos, /1\. toque/, `${tema} ${l}x${a}`);
      assert.match(textos, /3\./, `${tema} ${l}x${a}`);
      assert.equal(canvas.width, l);
    }
  }
});

test('desenharAjuda não desenha num canvas sem tamanho e não falha sem a fonte', async () => {
  globalThis.document = { fonts: { load: async () => { throw new Error('offline'); } } };
  const vazio = canvasFalso(0, 0);
  await desenharAjuda(vazio.canvas, 'amigo');
  assert.equal(vazio.chamadas.stroke, 0);
  const cheio = canvasFalso(800, 300);
  await desenharAjuda(cheio.canvas, 'amigo');
  assert.ok(cheio.chamadas.stroke > 0);
});

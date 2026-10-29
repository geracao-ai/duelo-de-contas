import { test } from 'node:test';
import assert from 'node:assert/strict';

const { onRequest } = await import(new URL('../functions/sala/[[path]].js', import.meta.url));

// Service binding falso: guarda a requisição que chegaria ao Worker.
function bindingFalso() {
  const visto = {};
  return {
    visto,
    SALA: { fetch: async (req) => { visto.req = req; return new Response('ok', { status: 200 }); } },
  };
}

test('/sala/ws?criar=1 chega ao Worker como /ws?criar=1, com Upgrade e Origin', async () => {
  const { visto, SALA } = bindingFalso();
  const req = new Request('https://duelo-de-contas.pages.dev/sala/ws?criar=1', {
    headers: { Upgrade: 'websocket', Origin: 'https://duelo-de-contas.pages.dev' },
  });
  const res = await onRequest({ request: req, env: { SALA } });
  assert.equal(res.status, 200);
  const url = new URL(visto.req.url);
  assert.equal(url.pathname, '/ws');
  assert.equal(url.search, '?criar=1');
  assert.equal(visto.req.headers.get('upgrade'), 'websocket');
  assert.equal(visto.req.headers.get('origin'), 'https://duelo-de-contas.pages.dev');
});

test('/sala/saude vira /saude e /sala vira /', async () => {
  const { visto, SALA } = bindingFalso();
  await onRequest({ request: new Request('https://duelo-de-contas.pages.dev/sala/saude'), env: { SALA } });
  assert.equal(new URL(visto.req.url).pathname, '/saude');
  await onRequest({ request: new Request('https://duelo-de-contas.pages.dev/sala'), env: { SALA } });
  assert.equal(new URL(visto.req.url).pathname, '/');
});

test('sem o service binding responde 503 (nunca tenta outro endereço)', async () => {
  const res = await onRequest({ request: new Request('https://duelo-de-contas.pages.dev/sala/ws?criar=1'), env: {} });
  assert.equal(res.status, 503);
});

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const { onRequest } = await import(new URL('../functions/e/[[path]].js', import.meta.url));

const fetchOriginal = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchOriginal; });

// Troca o fetch por um que guarda a requisição recebida.
function espiar() {
  const visto = {};
  globalThis.fetch = async (req) => {
    visto.req = req;
    visto.corpo = req.body ? await req.text() : '';
    return new Response('ok', { status: 200 });
  };
  return visto;
}

test('caminhos static/ vão para o host de assets, mantendo a query', async () => {
  const visto = espiar();
  const req = new Request('https://duelo-de-contas.pages.dev/e/static/array.js?v=1');
  const res = await onRequest({ request: req, params: { path: ['static', 'array.js'] } });
  assert.equal(res.status, 200);
  assert.equal(visto.req.url, 'https://us-assets.i.posthog.com/static/array.js?v=1');
});

test('os demais caminhos vão para a API, com método, corpo e sem cookie', async () => {
  const visto = espiar();
  const req = new Request('https://duelo-de-contas.pages.dev/e/i/v0/e/?ip=0', {
    method: 'POST',
    body: '{"a":1}',
    headers: { cookie: 'segredo=1', 'content-type': 'application/json' },
  });
  await onRequest({ request: req, params: { path: ['i', 'v0', 'e'] } });
  assert.equal(visto.req.method, 'POST');
  assert.equal(visto.req.url, 'https://us.i.posthog.com/i/v0/e/?ip=0', 'mantém a barra final');
  assert.equal(visto.req.headers.get('cookie'), null);
  assert.equal(visto.req.headers.get('content-type'), 'application/json');
  assert.equal(visto.corpo, '{"a":1}');
});

test('encaminha o IP do visitante para o PostHog calcular a região', async () => {
  const visto = espiar();
  const req = new Request('https://duelo-de-contas.pages.dev/e/e/', {
    method: 'POST',
    body: '{}',
    headers: { 'cf-connecting-ip': '203.0.113.7' },
  });
  await onRequest({ request: req, params: { path: ['e'] } });
  assert.equal(visto.req.headers.get('x-forwarded-for'), '203.0.113.7');
});

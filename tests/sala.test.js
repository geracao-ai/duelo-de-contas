import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tratar, sair, alarme, avancar, podeEntrar, proximoAlarme, OCIOSA_MS } from '../worker/src/regras.js';
import { origemPermitida } from '../worker/src/origem.js';

const T0 = 1_000_000;
const j = (o) => JSON.stringify(o);
const CRIAR = { t: 'criar', v: 1, ops: ['add', 'sub'], nivel: 'facil', bichinho: 'urso' };
const ENTRAR = { t: 'entrar', v: 1, bichinho: 'gato' };

// Simula a sala: guarda o estado e as mensagens recebidas por lado.
function sim() {
  const x = {
    state: null,
    now: T0,
    recebidas: [[], []],
    fechados: [],
    semente: 12345,
    aplicar(r) {
      x.state = r.state;
      for (const { to, msg } of r.send) {
        for (const l of to === 'todos' ? [0, 1] : [to]) x.recebidas[l].push(msg);
      }
      x.fechados.push(...r.close);
      return r;
    },
    envia(lado, msg, dt = 0) {
      x.now += dt;
      const texto = typeof msg === 'string' ? msg : j(msg);
      return x.aplicar(tratar(x.state, lado, texto, x.now, { pin: '482913', semente: () => x.semente }));
    },
    sai(lado, dt = 0) {
      x.now += dt;
      return x.aplicar(sair(x.state, lado, x.now));
    },
    ultima: (l) => x.recebidas[l].at(-1),
    tipos: (l) => x.recebidas[l].map((m) => m.t),
    limpa: () => { x.recebidas = [[], []]; x.fechados = []; },
  };
  return x;
}

function salaPronta() {
  const x = sim();
  x.envia(0, CRIAR);
  x.envia(1, ENTRAR);
  x.envia(1, { t: 'pronto' });
  return x;
}

function jogando() {
  const x = salaPronta();
  x.envia(0, { t: 'comecar' });
  x.now += 3000;
  return x;
}

test('criar: anfitrião recebe sala em espera', () => {
  const x = sim();
  x.envia(0, CRIAR);
  assert.deepEqual(x.ultima(0), {
    t: 'sala', pin: '482913', voce: 0, ops: ['add', 'sub'], nivel: 'facil',
    jogadores: [{ bichinho: 'urso', pronto: true }, null], estado: 'espera',
  });
});

test('fluxo completo: entrar, pronto, começar, contagem de 3 s e vitória', () => {
  const x = sim();
  x.envia(0, CRIAR);
  assert.equal(podeEntrar(x.state), null);
  x.envia(1, ENTRAR);
  assert.equal(x.ultima(0).jogadores[1].bichinho, 'gato');
  assert.equal(x.ultima(0).jogadores[1].pronto, false);
  assert.equal(x.ultima(1).voce, 1);
  assert.equal(podeEntrar(x.state), 'sala-cheia');
  x.envia(1, { t: 'pronto' });
  assert.equal(x.ultima(0).jogadores[1].pronto, true);

  x.limpa();
  x.envia(0, { t: 'comecar' });
  assert.deepEqual(x.tipos(0), ['sala', 'contagem']);
  assert.deepEqual(x.tipos(1), ['sala', 'contagem']);
  assert.deepEqual(x.ultima(0), { t: 'contagem', semente: 12345, segundos: 3 });
  assert.equal(x.state.estado, 'contagem');

  x.now += 3000;
  x.limpa();
  for (let n = 0; n < 5; n++) x.envia(1, { t: 'acertei', n });
  assert.equal(x.state.estado, 'fim');
  assert.deepEqual(x.recebidas[0].at(-1), { t: 'fim', vencedor: 1, motivo: 'corda' });
  assert.deepEqual(x.recebidas[1].at(-1), { t: 'fim', vencedor: 1, motivo: 'corda' });
  assert.deepEqual(x.recebidas[0].at(-2), { t: 'corda', valor: 5, lado: 1, acertos: [0, 5] });
});

test('lado 0 puxa para -1 e o lado 1 para +1', () => {
  const x = jogando();
  x.envia(0, { t: 'acertei', n: 0 });
  assert.equal(x.ultima(1).valor, -1);
  x.envia(1, { t: 'acertei', n: 0 });
  x.envia(1, { t: 'acertei', n: 1 });
  assert.deepEqual(x.ultima(0), { t: 'corda', valor: 1, lado: 1, acertos: [1, 2] });
});

test('lado 0 vence com a corda em -5', () => {
  const x = jogando();
  for (let n = 0; n < 5; n++) x.envia(0, { t: 'acertei', n });
  assert.deepEqual(x.ultima(1), { t: 'fim', vencedor: 0, motivo: 'corda' });
});

test('acertos só contam em jogando', () => {
  const x = salaPronta();
  x.envia(0, { t: 'acertei', n: 0 }); // espera
  assert.equal(x.state.corda, 0);
  x.envia(0, { t: 'comecar' });
  x.limpa();
  x.envia(0, { t: 'acertei', n: 0 }, 1000); // ainda na contagem (1 s)
  assert.equal(x.state.corda, 0);
  assert.equal(x.recebidas[1].length, 0);
  x.envia(0, { t: 'acertei', n: 0 }, 2000); // 3 s depois do comecar
  assert.equal(x.state.corda, -1);
});

test('contagem: 2999 ms ainda é contagem, 3000 ms vira jogando', () => {
  const x = salaPronta();
  x.envia(0, { t: 'comecar' });
  const inicio = x.now;
  assert.equal(avancar(structuredClone(x.state), inicio + 2999).estado, 'contagem');
  assert.equal(avancar(structuredClone(x.state), inicio + 3000).estado, 'jogando');
  assert.equal(proximoAlarme(x.state), inicio + 3000);
});

test('alarme vira jogando sem enviar nada', () => {
  const x = salaPronta();
  x.envia(0, { t: 'comecar' });
  const r = alarme(x.state, x.now + 3000);
  assert.equal(r.state.estado, 'jogando');
  assert.deepEqual(r.send, []);
  assert.deepEqual(r.close, []);
});

test('alarme encerra sala parada há 30 minutos', () => {
  const x = salaPronta();
  const r = alarme(x.state, x.now + OCIOSA_MS);
  assert.equal(r.state, null);
  assert.deepEqual(r.close, [0, 1]);
  assert.deepEqual(r.send, [{ to: 'todos', msg: { t: 'erro', codigo: 'ociosa' } }]);
  assert.equal(alarme(x.state, x.now + OCIOSA_MS - 1).state.estado, 'espera');
  assert.equal(proximoAlarme(x.state), x.now + OCIOSA_MS);
});

test('n é monotônico: repetido ou menor é ignorado', () => {
  const x = jogando();
  x.envia(0, { t: 'acertei', n: 3 });
  x.limpa();
  x.envia(0, { t: 'acertei', n: 3 });
  x.envia(0, { t: 'acertei', n: 2 });
  assert.equal(x.state.corda, -1);
  assert.equal(x.recebidas[1].length, 0);
  x.envia(0, { t: 'acertei', n: 4 });
  assert.equal(x.state.corda, -2);
  // o contador de um lado não afeta o outro
  x.envia(1, { t: 'acertei', n: 0 });
  assert.equal(x.state.corda, -1);
});

test('n inválido gera mensagem-invalida', () => {
  const x = jogando();
  for (const n of [-1, 1.5, '2', null]) {
    x.limpa();
    x.envia(0, { t: 'acertei', n });
    assert.deepEqual(x.ultima(0), { t: 'erro', codigo: 'mensagem-invalida' });
  }
  assert.equal(x.state.corda, 0);
});

test('errei repassa errou ao outro lado', () => {
  const x = jogando();
  x.limpa();
  x.envia(1, { t: 'errei', n: 0 });
  assert.deepEqual(x.recebidas[0], [{ t: 'errou', lado: 1 }]);
  assert.equal(x.recebidas[1].length, 0);
});

test('oculos repassa ao outro lado', () => {
  const x = jogando();
  x.limpa();
  x.envia(0, { t: 'oculos', on: true });
  assert.deepEqual(x.recebidas[1], [{ t: 'oculos', lado: 0, on: true }]);
  x.envia(0, { t: 'oculos', on: 'sim' });
  assert.equal(x.ultima(0).codigo, 'mensagem-invalida');
});

test('ping responde pong, com ou sem sala', () => {
  const x = sim();
  x.envia(0, { t: 'ping' });
  assert.deepEqual(x.recebidas[0], [{ t: 'pong' }]);
  x.envia(0, CRIAR);
  x.envia(0, { t: 'ping' });
  assert.deepEqual(x.ultima(0), { t: 'pong' });
});

test('validação do criar', () => {
  const casos = [
    { ...CRIAR, ops: [] },
    { ...CRIAR, ops: ['pot'] },
    { ...CRIAR, ops: 'add' },
    { ...CRIAR, nivel: 'impossivel' },
    { ...CRIAR, bichinho: 'dragao' },
    { ...CRIAR, ops: undefined },
  ];
  for (const c of casos) {
    const x = sim();
    x.envia(0, c);
    assert.deepEqual(x.ultima(0), { t: 'erro', codigo: 'mensagem-invalida' }, j(c));
    assert.equal(x.state, null);
  }
  for (const nivel of ['facil', 'medio', 'dificil']) {
    const x = sim();
    x.envia(0, { ...CRIAR, nivel, ops: ['add', 'sub', 'mul', 'div'] });
    assert.equal(x.ultima(0).nivel, nivel);
  }
});

test('versão diferente: erro versao e fecha', () => {
  const x = sim();
  x.envia(0, { ...CRIAR, v: 2 });
  assert.deepEqual(x.ultima(0), { t: 'erro', codigo: 'versao' });
  assert.deepEqual(x.fechados, [0]);
  x.envia(0, CRIAR);
  x.limpa();
  x.envia(1, { ...ENTRAR, v: 9 });
  assert.deepEqual(x.ultima(1), { t: 'erro', codigo: 'versao' });
  assert.deepEqual(x.fechados, [1]);
});

test('JSON inválido, tamanho e formato', () => {
  const x = sim();
  for (const texto of ['{nao e json', '[]', '"oi"', 'null', j({ x: 1 }), j({ t: 'inexistente' }), 'a'.repeat(2000)]) {
    x.limpa();
    x.envia(0, texto);
    assert.deepEqual(x.recebidas[0], [{ t: 'erro', codigo: 'mensagem-invalida' }], texto.slice(0, 20));
  }
  const grande = j({ ...CRIAR, extra: 'x'.repeat(1100) });
  x.limpa();
  x.envia(0, grande);
  assert.equal(x.ultima(0).codigo, 'mensagem-invalida');
  assert.equal(x.state, null);
  x.envia(0, null);
  assert.equal(x.ultima(0).codigo, 'mensagem-invalida');
});

test('sem sala criada, só criar do anfitrião vale', () => {
  const x = sim();
  x.envia(0, { t: 'comecar' });
  assert.equal(x.ultima(0).codigo, 'mensagem-invalida');
  assert.equal(podeEntrar(null), 'sala-inexistente');
});

test('bichinho do convidado igual ao do anfitrião', () => {
  const x = sim();
  x.envia(0, CRIAR);
  x.envia(1, { ...ENTRAR, bichinho: 'urso' });
  assert.deepEqual(x.ultima(1), { t: 'erro', codigo: 'bichinho-igual' });
  assert.equal(x.state.jogadores[1], null);
  x.envia(1, ENTRAR); // pode tentar de novo
  assert.equal(x.state.jogadores[1].bichinho, 'gato');
});

test('convidado troca de bichinho na espera (mas não por o do anfitrião)', () => {
  const x = salaPronta();
  x.limpa();
  x.envia(1, { t: 'bichinho', bichinho: 'panda' });
  assert.equal(x.ultima(0).jogadores[1].bichinho, 'panda');
  assert.equal(x.ultima(1).jogadores[1].bichinho, 'panda');
  x.envia(1, { t: 'bichinho', bichinho: 'urso' });
  assert.equal(x.ultima(1).codigo, 'bichinho-igual');
  assert.equal(x.state.jogadores[1].bichinho, 'panda');
  x.envia(1, { t: 'bichinho', bichinho: 'dragao' });
  assert.equal(x.ultima(1).codigo, 'mensagem-invalida');
  x.envia(0, { t: 'bichinho', bichinho: 'sapo' }); // anfitrião não troca
  assert.equal(x.ultima(0).codigo, 'mensagem-invalida');
  assert.equal(x.state.jogadores[0].bichinho, 'urso');
});

test('trocar de bichinho fora da espera é ignorado', () => {
  const x = jogando();
  x.limpa();
  x.envia(1, { t: 'bichinho', bichinho: 'sapo' });
  assert.equal(x.state.jogadores[1].bichinho, 'gato');
  assert.equal(x.recebidas[1].length, 0);
});

test('comecar: só o anfitrião e só com o convidado pronto', () => {
  const x = sim();
  x.envia(0, CRIAR);
  x.envia(0, { t: 'comecar' }); // sem convidado
  assert.equal(x.state.estado, 'espera');
  x.envia(1, ENTRAR);
  x.envia(0, { t: 'comecar' }); // convidado não pronto
  assert.equal(x.state.estado, 'espera');
  x.envia(1, { t: 'pronto' });
  x.limpa();
  x.envia(1, { t: 'comecar' }); // convidado tentando
  assert.equal(x.ultima(1).codigo, 'mensagem-invalida');
  assert.equal(x.state.estado, 'espera');
  x.envia(0, { t: 'comecar' });
  assert.equal(x.state.estado, 'contagem');
  assert.equal(x.state.semente, 12345);
});

test('semente aleatória é uint32', () => {
  const x = salaPronta();
  const r = tratar(x.state, 0, j({ t: 'comecar' }), x.now, {});
  const { semente } = r.send.find((e) => e.msg.t === 'contagem').msg;
  assert.ok(Number.isInteger(semente) && semente >= 0 && semente <= 0xffffffff);
});

test('revanche: precisa dos dois, zera a corda e os n, e sorteia nova semente', () => {
  const x = jogando();
  for (let n = 0; n < 5; n++) x.envia(0, { t: 'acertei', n });
  assert.equal(x.state.estado, 'fim');
  x.semente = 777;
  x.limpa();
  x.envia(0, { t: 'revanche' });
  assert.deepEqual(x.recebidas[1], [{ t: 'revanche', lado: 0 }]);
  assert.equal(x.state.estado, 'fim');
  x.envia(0, { t: 'revanche' }); // repetido não conta duas vezes
  assert.equal(x.state.estado, 'fim');
  x.envia(1, { t: 'revanche' });
  assert.equal(x.state.estado, 'contagem');
  assert.deepEqual(x.ultima(0), { t: 'contagem', semente: 777, segundos: 3 });
  assert.deepEqual(x.ultima(1), { t: 'contagem', semente: 777, segundos: 3 });
  assert.equal(x.state.corda, 0);
  assert.deepEqual(x.state.acertos, [0, 0]);
  x.now += 3000;
  x.envia(0, { t: 'acertei', n: 0 }); // n volta a valer desde 0
  assert.equal(x.state.corda, -1);
  assert.deepEqual(x.ultima(1), { t: 'corda', valor: -1, lado: 0, acertos: [1, 0] });
});

test('revanche fora do fim é ignorada', () => {
  const x = jogando();
  x.limpa();
  x.envia(0, { t: 'revanche' });
  assert.equal(x.recebidas[1].length, 0);
  assert.equal(x.state.estado, 'jogando');
});

test('convidado sai na espera: vaga liberada, anfitrião recebe sala e saiu', () => {
  const x = salaPronta();
  x.limpa();
  x.sai(1);
  assert.deepEqual(x.tipos(0), ['sala', 'saiu']);
  assert.deepEqual(x.recebidas[0][0].jogadores, [{ bichinho: 'urso', pronto: true }, null]);
  assert.deepEqual(x.ultima(0), { t: 'saiu', lado: 1 });
  assert.equal(x.state.estado, 'espera');
  assert.equal(podeEntrar(x.state), null);
  // outro convidado pode entrar
  x.envia(1, { ...ENTRAR, bichinho: 'sapo' });
  assert.equal(x.state.jogadores[1].bichinho, 'sapo');
  assert.equal(x.state.jogadores[1].pronto, false);
});

test('convidado que ainda não entrou e sai: nada acontece', () => {
  const x = sim();
  x.envia(0, CRIAR);
  x.limpa();
  x.sai(1);
  assert.equal(x.recebidas[0].length, 0);
});

test('alguém sai no meio da partida: o outro recebe saiu e fim saiu', () => {
  for (const [quem, outro] of [[1, 0], [0, 1]]) {
    const x = jogando();
    x.envia(0, { t: 'acertei', n: 0 });
    x.limpa();
    x.sai(quem);
    assert.deepEqual(x.recebidas[outro], [
      { t: 'saiu', lado: quem },
      { t: 'fim', vencedor: null, motivo: 'saiu' },
    ]);
  }
});

test('saída durante a contagem também é fim saiu', () => {
  const x = salaPronta();
  x.envia(0, { t: 'comecar' });
  x.limpa();
  x.sai(1, 500);
  assert.deepEqual(x.recebidas[0].map((m) => m.t), ['saiu', 'fim']);
});

test('convidado sai no meio: a sala fecha e o anfitrião é desconectado', () => {
  const x = jogando();
  x.limpa();
  x.sai(1);
  assert.deepEqual(x.recebidas[0].map((m) => m.t), ['saiu', 'fim']);
  assert.equal(x.state, null);
  assert.deepEqual(x.fechados, [0]);
  assert.equal(podeEntrar(x.state), 'sala-inexistente');
});

test('convidado sai depois do fim: só saiu', () => {
  const x = jogando();
  for (let n = 0; n < 5; n++) x.envia(0, { t: 'acertei', n });
  x.limpa();
  x.sai(1);
  assert.deepEqual(x.recebidas[0], [{ t: 'saiu', lado: 1 }]);
});

test('anfitrião sai: a sala fecha, o convidado recebe saiu e é fechado', () => {
  const x = salaPronta();
  x.limpa();
  x.sai(0);
  assert.deepEqual(x.recebidas[1], [{ t: 'saiu', lado: 0 }]);
  assert.deepEqual(x.fechados, [1]);
  assert.equal(x.state, null);
  assert.equal(podeEntrar(x.state), 'sala-inexistente');
  // um PIN livre pode ser reaproveitado
  x.envia(0, CRIAR);
  assert.equal(x.state.estado, 'espera');
});

test('anfitrião sai sem convidado: sala fecha sem mensagens', () => {
  const x = sim();
  x.envia(0, CRIAR);
  x.limpa();
  x.sai(0);
  assert.equal(x.state, null);
  assert.equal(x.recebidas[1].length, 0);
});

test('entrar repetido de quem já está na sala é ignorado', () => {
  const x = salaPronta();
  x.limpa();
  x.envia(1, ENTRAR);
  assert.equal(x.recebidas[1].length, 0);
  assert.deepEqual(x.fechados, []);
  assert.equal(x.state.jogadores[1].pronto, true);
});

test('as funções não alteram o estado recebido', () => {
  const x = salaPronta();
  const antes = structuredClone(x.state);
  tratar(x.state, 0, j({ t: 'comecar' }), x.now);
  sair(x.state, 1, x.now);
  alarme(x.state, x.now + OCIOSA_MS);
  assert.deepEqual(x.state, antes);
});

test('origem permitida', () => {
  const ok = [
    'https://duelo-de-contas.pages.dev',
    'https://abc123.duelo-de-contas.pages.dev',
    'https://minha-branch.duelo-de-contas.pages.dev',
    'http://localhost:8000',
    'http://127.0.0.1:8787',
  ];
  const ruim = [
    undefined, null, '', 'null',
    'http://duelo-de-contas.pages.dev',
    'https://duelo-de-contas.pages.dev.evil.com',
    'https://evilduelo-de-contas.pages.dev',
    'https://evil.com',
    'https://x.pages.dev',
    'http://localhost',
    'http://localhost:8000/',
    'http://localhost.evil.com:80',
    'https://localhost:8000',
    'http://127.0.0.1',
    'https://.duelo-de-contas.pages.dev',
  ];
  for (const o of ok) assert.equal(origemPermitida(o), true, o);
  for (const o of ruim) assert.equal(origemPermitida(o), false, String(o));
});

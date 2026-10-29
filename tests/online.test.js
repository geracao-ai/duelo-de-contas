import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/rng.js';
import { Game } from '../js/game.js';
import {
  SERVIDOR_PADRAO, servidorDaUrl, wsUrl, pinDaUrl, conviteUrl, conviteTexto, erroTexto, conectar, PING_MS, SEM_PONG_MS, salaValida, codigoDeSaida,
} from '../js/online.js';
import { matchProps, finishProps, salaCriadaProps, salaErroProps } from '../js/analytics.js';
import { emptyStats, recordMatch } from '../js/stats.js';

// ---------- semente ----------

test('createRng: mesma semente, mesma sequência, valores em [0, 1)', () => {
  const a = createRng(123456);
  const b = createRng(123456);
  const seq = Array.from({ length: 50 }, () => a());
  assert.deepEqual(seq, Array.from({ length: 50 }, () => b()));
  assert.ok(seq.every((v) => v >= 0 && v < 1));
  assert.notDeepEqual(seq.slice(0, 5), Array.from({ length: 5 }, createRng(123457)));
});

/** Jogo como o online o monta; `log` guarda as contas (e opções) do lado 0, na ordem em que nascem. */
function onlineGame(seed, choices, log) {
  return new Game({
    ops: ['add', 'sub', 'mul', 'div'], difficulty: choices ? 'facil' : 'medio', countdown: 0,
    choices, remoteRope: true, rng: createRng(seed),
    onEvent: (type, p) => {
      if (type === 'problem' && p.side === 0) log.push(p.problem.text);
    },
  });
}

function answerRight(game) {
  const { problem, choices } = game.players[0];
  if (choices) return game.choose(0, problem.answer);
  String(problem.answer).split('').forEach((d) => game.typeDigit(0, d));
  return game.submit(0);
}

function answerWrong(game) {
  const { problem, choices } = game.players[0];
  if (choices) return game.choose(0, choices.find((c) => c !== problem.answer && !game.players[0].eliminated.includes(c)));
  String(problem.answer + 1).split('').forEach((d) => game.typeDigit(0, d));
  return game.submit(0);
}

for (const choices of [true, false]) {
  test(`mesma semente: mesmas 30 contas${choices ? ' e opções' : ''}, com erros e ritmos diferentes`, () => {
    const logA = [];
    const logB = [];
    const a = onlineGame(987654321, choices, logA);
    const b = onlineGame(987654321, choices, logB);
    const opcoesA = [];
    const opcoesB = [];
    for (let i = 0; i < 30; i++) {
      opcoesA.push(a.players[0].choices);
      opcoesB.push(b.players[0].choices);
      a.tick(0.1);
      b.tick(7);
      if (i % 4 === 1) answerWrong(b); // um erro antes de acertar não consome o gerador
      answerRight(a);
      answerRight(b);
    }
    assert.equal(logA.length, 31); // 30 contas respondidas + a próxima
    assert.deepEqual(logA, logB);
    assert.deepEqual(opcoesA, opcoesB);
  });
}

test('mesma semente: quem revela a resposta (2 erros) continua recebendo a mesma sequência', () => {
  const logA = [];
  const logB = [];
  const a = onlineGame(2024, false, logA);
  const b = onlineGame(2024, false, logB);
  for (let i = 0; i < 12; i++) {
    if (i % 3 === 0) {
      answerWrong(a);
      answerWrong(a);
      a.tick(5); // a resposta aparece e vem a conta seguinte
    } else {
      answerRight(a);
    }
    answerRight(b);
  }
  assert.deepEqual(logA.slice(0, 12), logB.slice(0, 12));
});

// ---------- Game online ----------

test('remoteRope: acerto conta e avança, mas não move a corda nem decide o vencedor', () => {
  const events = [];
  const game = new Game({
    ops: ['add'], difficulty: 'facil', countdown: 0, remoteRope: true, onEvent: (t, p) => events.push([t, p]),
  });
  for (let i = 0; i < game.ropeMax + 2; i++) {
    const before = game.players[0].problem;
    String(before.answer).split('').forEach((d) => game.typeDigit(0, d));
    assert.equal(game.submit(0), 'correct');
    assert.notEqual(game.players[0].problem, before);
  }
  assert.equal(game.rope, 0);
  assert.equal(game.state, 'playing');
  assert.equal(game.winner, null);
  assert.equal(game.players[0].correct, game.ropeMax + 2);
  assert.equal(events.filter(([t]) => t === 'correct').length, game.ropeMax + 2);
  assert.ok(!events.some(([t]) => t === 'win'));
});

test('setRope limita ao máximo; finish decide o vencedor (ou ninguém) uma única vez', () => {
  const events = [];
  const onEvent = (t, p) => events.push([t, p]);
  const game = new Game({
    ops: ['add'], difficulty: 'facil', countdown: 0, remoteRope: true, onEvent,
  });
  assert.equal(game.setRope(-3), -3);
  assert.equal(game.setRope(99), game.ropeMax);
  game.finish(1);
  assert.equal(game.state, 'over');
  assert.equal(game.winner, 1);
  game.finish(0);
  assert.equal(game.winner, 1);
  assert.deepEqual(events.filter(([t]) => t === 'win'), [['win', { side: 1 }]]);

  const sem = new Game({
    ops: ['add'], difficulty: 'facil', countdown: 0, remoteRope: true, onEvent,
  });
  sem.finish(null);
  assert.equal(sem.winner, null);
  assert.ok(events.some(([t]) => t === 'end'));
  assert.equal(sem.typeDigit(0, 1), false);
});

test('sem remoteRope o jogo local segue igual (corda e vitória locais)', () => {
  const game = new Game({ ops: ['add'], difficulty: 'facil', countdown: 0 });
  for (let i = 0; i < game.ropeMax; i++) {
    String(game.players[1].problem.answer).split('').forEach((d) => game.typeDigit(1, d));
    game.submit(1);
  }
  assert.equal(game.winner, 1);
  assert.equal(game.rope, game.ropeMax);
});

// ---------- endereços ----------

test('servidor: padrão e ?servidor=, convertido para ws(s)', () => {
  assert.equal(servidorDaUrl('', 'localhost'), SERVIDOR_PADRAO);
  assert.equal(servidorDaUrl('?servidor=lixo', 'localhost'), SERVIDOR_PADRAO);
  assert.equal(servidorDaUrl('?servidor=http://localhost:8787/', 'localhost'), 'http://localhost:8787');
  assert.equal(servidorDaUrl('?servidor=http://localhost:8787', '127.0.0.1'), 'http://localhost:8787');
  // em produção, um link não troca o servidor
  assert.equal(servidorDaUrl('?servidor=https://evil.example', 'duelo-de-contas.pages.dev'), SERVIDOR_PADRAO);
  assert.equal(servidorDaUrl('?servidor=https://evil.example'), SERVIDOR_PADRAO);
  // no site publicado a sala vai pelo próprio endereço (Pages Function /sala), não por *.workers.dev
  assert.equal(
    servidorDaUrl('', 'duelo-de-contas.pages.dev', 'https://duelo-de-contas.pages.dev'),
    'https://duelo-de-contas.pages.dev/sala',
  );
  assert.equal(
    wsUrl(servidorDaUrl('', 'duelo-de-contas.pages.dev', 'https://duelo-de-contas.pages.dev')),
    'wss://duelo-de-contas.pages.dev/sala/ws?criar=1',
  );
  // ?servidor= continua sem efeito em produção, mesmo com a origem
  assert.equal(
    servidorDaUrl('?servidor=https://evil.example', 'duelo-de-contas.pages.dev', 'https://duelo-de-contas.pages.dev'),
    'https://duelo-de-contas.pages.dev/sala',
  );
  assert.equal(wsUrl('https://x.workers.dev'), 'wss://x.workers.dev/ws?criar=1');
  assert.equal(wsUrl('http://localhost:8787', { pin: '482913' }), 'ws://localhost:8787/ws?pin=482913');
});

test('pin na URL e link de convite usam a origem atual', () => {
  assert.equal(pinDaUrl('?pin=482913'), '482913');
  assert.equal(pinDaUrl('?pin=48291'), null);
  assert.equal(pinDaUrl('?pin=abcdef'), null);
  assert.equal(pinDaUrl(''), null);
  assert.equal(conviteUrl('https://duelo-de-contas.pages.dev/?servidor=x#a', '482913'), 'https://duelo-de-contas.pages.dev/?pin=482913');
  assert.equal(conviteUrl('http://localhost:8000/index.html', '111111'), 'http://localhost:8000/index.html?pin=111111');
  assert.equal(conviteTexto('482913'), 'Vem me desafiar no Duelo de Contas! PIN 482913');
});

test('textos de erro para crianças', () => {
  assert.equal(erroTexto('sala-inexistente'), 'Não achamos essa sala. Confere o número com seu amigo?');
  assert.equal(erroTexto('sala-cheia'), 'Essa sala já está cheia!');
  assert.equal(erroTexto('versao'), 'Atualize a página para jogar junto');
  assert.equal(erroTexto('conexao'), 'Não deu para conectar. Confira a internet e tente de novo.');
  assert.equal(erroTexto('saiu'), 'Seu amigo saiu da sala.');
  assert.equal(erroTexto('ociosa'), 'A sala fechou porque ficou parada muito tempo.');
  assert.equal(erroTexto('qualquer-coisa'), erroTexto('conexao'));
});

test('salaValida recusa nível, operação ou bichinho desconhecidos', () => {
  const ok = { voce: 1, nivel: 'medio', ops: ['add', 'div'], jogadores: [{ bichinho: 'urso' }, null] };
  assert.equal(salaValida(ok), true);
  assert.equal(salaValida({ ...ok, nivel: 'impossivel' }), false);
  assert.equal(salaValida({ ...ok, ops: [] }), false);
  assert.equal(salaValida({ ...ok, ops: ['pow'] }), false);
  assert.equal(salaValida({ ...ok, jogadores: [{ bichinho: 'dragao' }, null] }), false);
  assert.equal(salaValida({ ...ok, voce: 2 }), false);
  assert.equal(salaValida(null), false);
});

// ---------- conexão com soquete falso ----------

class FakeSocket {
  static ultimo = null;

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.enviadas = [];
    FakeSocket.ultimo = this;
  }

  send(texto) { this.enviadas.push(JSON.parse(texto)); }

  close() { this.readyState = 3; }

  abrir() { this.readyState = 1; this.onopen(); }

  receber(obj) { this.onmessage({ data: typeof obj === 'string' ? obj : JSON.stringify(obj) }); }

  cair() { this.readyState = 3; this.onclose(); }
}

function fakeRelogio() {
  const r = {
    fn: null, ms: null, limpo: false,
  };
  r.set = (fn, ms) => { r.fn = fn; r.ms = ms; return 7; };
  r.clear = (id) => { if (id === 7) r.limpo = true; };
  return r;
}

function abrir(agora = () => 0) {
  const relogio = fakeRelogio();
  const eventos = [];
  const con = conectar({
    url: 'ws://x/ws?criar=1',
    inicial: { t: 'criar', campos: { v: 1, ops: ['add'], nivel: 'facil', bichinho: 'urso' } },
    WebSocketCtor: FakeSocket,
    onMensagem: (m) => eventos.push(['msg', m]),
    onFalha: () => eventos.push(['falha']),
    onFechou: () => eventos.push(['fechou']),
    setIntervalFn: relogio.set,
    clearIntervalFn: relogio.clear,
    agora,
  });
  return {
    con, relogio, eventos, socket: FakeSocket.ultimo,
  };
}

test('ao abrir envia a 1ª mensagem em JSON e agenda o ping de 20 s', () => {
  const { con, relogio, socket } = abrir();
  assert.equal(socket.url, 'ws://x/ws?criar=1');
  assert.equal(con.enviar('acertei', { n: 0 }), false); // ainda conectando
  socket.abrir();
  assert.deepEqual(socket.enviadas[0], {
    t: 'criar', v: 1, ops: ['add'], nivel: 'facil', bichinho: 'urso',
  });
  assert.equal(relogio.ms, PING_MS);
  relogio.fn();
  assert.deepEqual(socket.enviadas[1], { t: 'ping' });
  assert.equal(con.enviar('acertei', { n: 3 }), true);
  assert.deepEqual(socket.enviadas[2], { t: 'acertei', n: 3 });
});

test('sem nenhuma resposta do servidor por 45 s a conexão é dada como caída', () => {
  let t = 0;
  const { socket, relogio, eventos } = abrir(() => t);
  socket.abrir();
  t = 40000;
  relogio.fn();
  socket.receber({ t: 'pong' });
  t = 40000 + SEM_PONG_MS;
  relogio.fn();
  assert.deepEqual(eventos.filter((e) => e[0] !== 'msg'), []);
  t += 1;
  relogio.fn();
  assert.deepEqual(eventos.at(-1), ['fechou']);
  assert.equal(socket.readyState, 3);
});

test('mensagens JSON válidas chegam ao callback; lixo é ignorado', () => {
  const { socket, eventos } = abrir();
  socket.abrir();
  socket.receber({ t: 'sala', pin: '123456' });
  socket.receber('isso não é json');
  socket.receber('[1,2]');
  socket.receber({ semT: true });
  assert.deepEqual(eventos, [['msg', { t: 'sala', pin: '123456' }]]);
});

test('falha antes de conectar vira onFalha (uma vez); cair depois vira onFechou', () => {
  const a = abrir();
  a.socket.cair();
  a.socket.cair();
  assert.deepEqual(a.eventos, [['falha']]);
  const b = abrir();
  b.socket.abrir();
  b.socket.cair();
  assert.deepEqual(b.eventos, [['fechou']]);
  assert.equal(b.relogio.limpo, true);
  assert.equal(b.con.aberta(), false);
});

test('fechar() fecha o soquete, para o ping e não dispara callbacks', () => {
  const {
    con, relogio, socket, eventos,
  } = abrir();
  socket.abrir();
  assert.equal(con.aberta(), true);
  con.fechar();
  socket.onclose();
  assert.equal(socket.readyState, 3);
  assert.equal(relogio.limpo, true);
  assert.deepEqual(eventos, []);
  assert.equal(con.enviar('ping'), false);
});

test('construtor que lança vira onFalha', async () => {
  const eventos = [];
  conectar({
    url: 'x',
    WebSocketCtor: class { constructor() { throw new Error('bloqueado'); } },
    onFalha: () => eventos.push('falha'),
  });
  await Promise.resolve();
  assert.deepEqual(eventos, ['falha']);
});

// ---------- estatísticas e analytics ----------

test('partida online conta em "partidas jogadas" sem mexer nas vitórias contra o computador', () => {
  const st = emptyStats();
  recordMatch(st, { mode: 'online', humanWon: true });
  assert.equal(st.matches, 1);
  assert.equal(st.winsVsCpu, 0);
  assert.equal(st.lossesVsCpu, 0);
});

test('analytics online: modo, resultado e eventos de sala', () => {
  const s = { difficulty: 'medio', ops: ['add', 'div'], p1: 'gato' };
  const base = matchProps(s, 'online', 'keypad', 'gato');
  assert.equal(base.modo, 'online');
  assert.equal(matchProps(s, true, 'keypad', 'gato').modo, 'cpu');
  assert.equal(matchProps(s, false, 'keypad', 'gato').modo, '2p');
  const humano = {
    correct: 3, wrong: 1, times: [2, 4], byOp: {},
  };
  assert.equal(finishProps(base, [humano], { winner: 0, seconds: 20 }).resultado, 'vitoria');
  assert.equal(finishProps(base, [humano], { winner: 1, seconds: 20 }).resultado, 'derrota');
  assert.equal(finishProps(base, [humano], { winner: null, seconds: 20 }).resultado, 'amigo_saiu');
  const criada = salaCriadaProps(s);
  assert.equal(criada.nivel, 'medio');
  assert.equal(criada.op_divisao, true);
  assert.ok(!('modo' in criada));
  assert.deepEqual(salaErroProps('sala-cheia'), { codigo: 'sala-cheia' });
  assert.deepEqual(salaErroProps('conexao', { fechamento: 1006, conectou: false }), { codigo: 'conexao', fechamento: 1006, conectou: false });
  assert.deepEqual(salaErroProps('conexao', { fechamento: null }), { codigo: 'conexao' });
});

test('amigo que foi dormir: saiu com motivo dormir mostra o texto certo', () => {
  assert.equal(codigoDeSaida({ t: 'saiu', lado: 1, motivo: 'dormir' }), 'dormiu');
  assert.equal(erroTexto('dormiu'), 'Seu amigo foi dormir.');
  assert.equal(codigoDeSaida({ t: 'saiu', lado: 1 }), 'saiu');
  assert.equal(codigoDeSaida({ t: 'saiu', lado: 1, motivo: 'x' }), 'saiu');
  assert.equal(codigoDeSaida(undefined), 'saiu');
});

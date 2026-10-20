// Regras da sala do duelo online. Módulo PURO (sem APIs da Cloudflare): recebe o estado atual
// e uma mensagem de um lado (0 = anfitrião, 1 = convidado) e devolve o novo estado e o que enviar.
// Resultado: { state, send: [{ to: 0 | 1 | 'todos', msg }], close: [0 | 1] }.
// O estado é um objeto simples (JSON), por isso cabe em serializeAttachment.

export const VERSAO = 1;
export const ROPE_MAX = 5;
export const CONTAGEM_MS = 3000;
export const OCIOSA_MS = 30 * 60 * 1000;
export const MAX_BYTES = 1024;
export const OPS = ['add', 'sub', 'mul', 'div'];
export const NIVEIS = ['facil', 'medio', 'dificil'];
export const BICHINHOS = ['urso', 'coelho', 'gato', 'panda', 'raposa', 'sapo'];

const vazio = (state) => ({ state, send: [], close: [] });
const erro = (state, lado, codigo, fechar = false) => ({
  state,
  send: [{ to: lado, msg: { t: 'erro', codigo } }],
  close: fechar ? [lado] : [],
});

export function sorteiaSemente() {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

// Mensagem `sala` personalizada (o campo `voce` muda de lado para lado).
export function msgSala(s, voce) {
  return {
    t: 'sala',
    pin: s.pin,
    voce,
    ops: s.ops,
    nivel: s.nivel,
    jogadores: s.jogadores.map((j) => (j ? { bichinho: j.bichinho, pronto: j.pronto } : null)),
    estado: s.estado,
  };
}

const enviarSala = (s) => [
  { to: 0, msg: msgSala(s, 0) },
  { to: 1, msg: msgSala(s, 1) },
];

// Passa de `contagem` para `jogando` quando o horário chegou. Não envia nada.
export function avancar(s, agora) {
  if (s && s.estado === 'contagem' && agora >= s.jogandoEm) s.estado = 'jogando';
  return s;
}

function zeraPartida(s) {
  s.corda = 0;
  s.acertos = [0, 0];
  s.ultimoN = [-1, -1];
  s.revanche = [false, false];
}

function iniciaContagem(s, agora, semente) {
  zeraPartida(s);
  s.estado = 'contagem';
  s.semente = semente;
  s.jogandoEm = agora + CONTAGEM_MS;
  return [...enviarSala(s), { to: 'todos', msg: { t: 'contagem', semente, segundos: CONTAGEM_MS / 1000 } }];
}

const opsValidas = (ops) =>
  Array.isArray(ops) && ops.length > 0 && ops.every((o) => OPS.includes(o)) && new Set(ops).size === ops.length;

// Dá para um convidado entrar agora? Devolve null (pode) ou o código do erro.
export function podeEntrar(state) {
  if (!state) return 'sala-inexistente';
  if (state.jogadores[1] || state.estado !== 'espera') return 'sala-cheia';
  return null;
}

// Próximo horário em que o alarme precisa acordar a sala (ms), ou null.
export function proximoAlarme(s) {
  if (!s) return null;
  if (s.estado === 'contagem') return s.jogandoEm;
  return s.atividade + OCIOSA_MS;
}

// Alarme do Durable Object: vira `jogando` e encerra salas paradas. Não envia nada.
export function alarme(state, agora) {
  if (!state) return { state: null, send: [], close: [0, 1] };
  const s = structuredClone(state);
  avancar(s, agora);
  if (agora >= s.atividade + OCIOSA_MS) {
    return { state: null, send: [{ to: 'todos', msg: { t: 'erro', codigo: 'ociosa' } }], close: [0, 1] };
  }
  return vazio(s);
}

// Alguém saiu (fechou ou caiu).
export function sair(state, lado, agora) {
  if (!state) return vazio(null);
  const s = structuredClone(state);
  avancar(s, agora);
  const outro = 1 - lado;
  const noMeio = s.estado === 'contagem' || s.estado === 'jogando';
  if (lado === 0) {
    // Anfitrião saiu: a sala fecha.
    const send = [];
    if (s.jogadores[1]) {
      send.push({ to: 1, msg: { t: 'saiu', lado: 0 } });
      if (noMeio) send.push({ to: 1, msg: { t: 'fim', vencedor: null, motivo: 'saiu' } });
    }
    return { state: null, send, close: [1] };
  }
  if (!s.jogadores[1]) return vazio(s); // convidado que nem tinha entrado
  const send = [];
  if (s.estado === 'espera') {
    s.jogadores[1] = null;
    send.push({ to: outro, msg: msgSala(s, 0) }, { to: outro, msg: { t: 'saiu', lado: 1 } });
    return { state: s, send, close: [] };
  }
  // Depois que a partida começou, a sala fecha: o anfitrião já está no resultado
  // e um convidado que voltasse pelo link ficaria esperando para sempre.
  send.push({ to: outro, msg: { t: 'saiu', lado: 1 } });
  if (noMeio) send.push({ to: outro, msg: { t: 'fim', vencedor: null, motivo: 'saiu' } });
  return { state: null, send, close: [0] };
}

// Trata uma mensagem recebida (texto cru). `agora` em ms (injetável para testes).
// opcoes: { pin, semente: () => uint32 }
export function tratar(state, lado, texto, agora, opcoes = {}) {
  const semente = opcoes.semente ?? sorteiaSemente;
  if (typeof texto !== 'string' || new TextEncoder().encode(texto).length > MAX_BYTES) {
    return erro(state, lado, 'mensagem-invalida');
  }
  let m;
  try {
    m = JSON.parse(texto);
  } catch {
    return erro(state, lado, 'mensagem-invalida');
  }
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') {
    return erro(state, lado, 'mensagem-invalida');
  }
  if (m.t === 'ping') return { state, send: [{ to: lado, msg: { t: 'pong' } }], close: [] };

  const s = state ? structuredClone(state) : null;
  if (s) avancar(s, agora);

  // Sala ainda não criada: só `criar` do anfitrião vale.
  if (!s) {
    if (lado !== 0 || m.t !== 'criar') return erro(null, lado, 'mensagem-invalida');
    if (m.v !== VERSAO) return erro(null, lado, 'versao', true);
    if (!opsValidas(m.ops) || !NIVEIS.includes(m.nivel) || !BICHINHOS.includes(m.bichinho)) {
      return erro(null, lado, 'mensagem-invalida');
    }
    const nova = {
      pin: opcoes.pin ?? '',
      ops: m.ops,
      nivel: m.nivel,
      estado: 'espera',
      jogadores: [{ bichinho: m.bichinho, pronto: true }, null],
      corda: 0,
      acertos: [0, 0],
      ultimoN: [-1, -1],
      revanche: [false, false],
      semente: 0,
      jogandoEm: 0,
      atividade: agora,
    };
    return { state: nova, send: [{ to: 0, msg: msgSala(nova, 0) }], close: [] };
  }

  s.atividade = agora;
  const me = s.jogadores[lado];
  const conv = s.jogadores[1];

  switch (m.t) {
    case 'criar':
      return erro(s, lado, 'mensagem-invalida');

    case 'entrar': {
      if (lado !== 1) return erro(s, lado, 'mensagem-invalida');
      if (m.v !== VERSAO) return erro(s, lado, 'versao', true);
      if (!BICHINHOS.includes(m.bichinho)) return erro(s, lado, 'mensagem-invalida');
      if (lado === 1 && conv) return vazio(s); // `entrar` repetido de quem já está na sala
      if (s.estado !== 'espera') return erro(s, lado, 'sala-cheia', true);
      if (m.bichinho === s.jogadores[0].bichinho) return erro(s, lado, 'bichinho-igual');
      s.jogadores[1] = { bichinho: m.bichinho, pronto: false };
      return { state: s, send: enviarSala(s), close: [] };
    }

    case 'bichinho': {
      if (lado !== 1 || !conv) return erro(s, lado, 'mensagem-invalida');
      if (!BICHINHOS.includes(m.bichinho)) return erro(s, lado, 'mensagem-invalida');
      if (s.estado !== 'espera') return vazio(s);
      if (m.bichinho === s.jogadores[0].bichinho) return erro(s, lado, 'bichinho-igual');
      conv.bichinho = m.bichinho;
      return { state: s, send: enviarSala(s), close: [] };
    }

    case 'pronto':
      if (lado !== 1 || !conv) return erro(s, lado, 'mensagem-invalida');
      if (s.estado !== 'espera' || conv.pronto) return vazio(s);
      conv.pronto = true;
      return { state: s, send: enviarSala(s), close: [] };

    case 'comecar':
      if (lado !== 0) return erro(s, lado, 'mensagem-invalida');
      if (s.estado !== 'espera' || !conv || !conv.pronto) return vazio(s);
      return { state: s, send: iniciaContagem(s, agora, semente()), close: [] };

    case 'acertei': {
      if (!me) return erro(s, lado, 'mensagem-invalida');
      if (!Number.isInteger(m.n) || m.n < 0) return erro(s, lado, 'mensagem-invalida');
      if (s.estado !== 'jogando' || m.n <= s.ultimoN[lado]) return vazio(s);
      s.ultimoN[lado] = m.n;
      s.acertos[lado] += 1;
      s.corda += lado === 0 ? -1 : 1;
      const send = [{ to: 'todos', msg: { t: 'corda', valor: s.corda, lado, acertos: [...s.acertos] } }];
      if (Math.abs(s.corda) >= ROPE_MAX) {
        s.estado = 'fim';
        s.revanche = [false, false];
        send.push({ to: 'todos', msg: { t: 'fim', vencedor: lado, motivo: 'corda' } });
      }
      return { state: s, send, close: [] };
    }

    case 'errei':
      if (!me) return erro(s, lado, 'mensagem-invalida');
      if (!Number.isInteger(m.n) || m.n < 0) return erro(s, lado, 'mensagem-invalida');
      if (s.estado !== 'jogando') return vazio(s);
      return { state: s, send: [{ to: 1 - lado, msg: { t: 'errou', lado } }], close: [] };

    case 'oculos':
      if (!me || typeof m.on !== 'boolean') return erro(s, lado, 'mensagem-invalida');
      if (!conv) return vazio(s);
      return { state: s, send: [{ to: 1 - lado, msg: { t: 'oculos', lado, on: m.on } }], close: [] };

    case 'revanche': {
      if (!me) return erro(s, lado, 'mensagem-invalida');
      if (s.estado !== 'fim' || !conv || s.revanche[lado]) return vazio(s);
      s.revanche[lado] = true;
      const send = [{ to: 1 - lado, msg: { t: 'revanche', lado } }];
      if (s.revanche[0] && s.revanche[1]) send.push(...iniciaContagem(s, agora, semente()));
      return { state: s, send, close: [] };
    }

    default:
      return erro(s, lado, 'mensagem-invalida');
  }
}

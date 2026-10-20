// Camada de conexão do duelo online (WebSocket). Sem DOM: o construtor do WebSocket
// é injetável, então os testes usam um soquete falso. Protocolo: ver a issue #18.

import { OPERATIONS, DIFFICULTIES } from './problems.js';
import { ANIMAL_IDS } from './characters.js';

export const SERVIDOR_PADRAO = 'https://duelo-de-contas.danieldopulo.workers.dev';
export const PROTOCOLO_VERSAO = 1;
export const PING_MS = 20000;
export const SEM_PONG_MS = 45000; // sem resposta do servidor por esse tempo: a conexão caiu
export const PIN_TAMANHO = 6;

/** Textos para crianças, por código de erro (os do servidor mais `conexao` e `saiu`). */
export const ERRO_TEXTOS = {
  'sala-inexistente': 'Não achamos essa sala. Confere o número com seu amigo?',
  'sala-cheia': 'Essa sala já está cheia!',
  versao: 'Atualize a página para jogar junto',
  conexao: 'Não deu para conectar. Confira a internet e tente de novo.',
  saiu: 'Seu amigo saiu da sala.',
  dormiu: 'Seu amigo foi dormir.',
  'bichinho-igual': 'Esse bichinho já foi escolhido pelo seu amigo. Escolha outro!',
  'mensagem-invalida': 'Algo deu errado. Vamos tentar de novo.',
  ociosa: 'A sala fechou porque ficou parada muito tempo.',
};

export const erroTexto = (codigo) => ERRO_TEXTOS[codigo] ?? ERRO_TEXTOS.conexao;

/**
 * Servidor a usar: o padrão, ou `?servidor=http://localhost:8787` — só quando a própria página
 * está em localhost (testes). Em produção um link não pode mandar a criança para outro servidor.
 */
export function servidorDaUrl(search = '', hostname = '') {
  if (!/^(localhost|127\.0\.0\.1)$/.test(hostname)) return SERVIDOR_PADRAO;
  const valor = new URLSearchParams(search).get('servidor');
  return valor && /^https?:\/\/[^\s/]+/.test(valor) ? valor.replace(/\/+$/, '') : SERVIDOR_PADRAO;
}

/** Confere a mensagem `sala` antes de montar a partida (nível, operações e bichinhos conhecidos). */
export function salaValida(sala) {
  if (!sala || ![0, 1].includes(sala.voce) || !DIFFICULTIES.includes(sala.nivel)) return false;
  if (!Array.isArray(sala.ops) || !sala.ops.length || !sala.ops.every((op) => OPERATIONS.includes(op))) return false;
  if (!Array.isArray(sala.jogadores) || sala.jogadores.length !== 2) return false;
  return sala.jogadores.every((j) => j === null || ANIMAL_IDS.includes(j?.bichinho));
}

/** Código do texto para quando o amigo sai: `dormiu` se o `saiu` veio com `motivo: 'dormir'`. */
export const codigoDeSaida = (msg) => (msg?.motivo === 'dormir' ? 'dormiu' : 'saiu');

/** Converte a base http(s) em ws(s) e monta `/ws?criar=1` ou `/ws?pin=NNNNNN`. */
export function wsUrl(base, { pin = null } = {}) {
  const ws = base.replace(/^http/i, 'ws').replace(/\/+$/, '');
  return pin ? `${ws}/ws?pin=${encodeURIComponent(pin)}` : `${ws}/ws?criar=1`;
}

/** PIN válido (6 dígitos) em `?pin=482913`, ou null. */
export function pinDaUrl(search = '') {
  const valor = new URLSearchParams(search).get('pin');
  return valor && /^\d{6}$/.test(valor) ? valor : null;
}

/** Link de convite para a sala, a partir do endereço da página (sem outros parâmetros). */
export function conviteUrl(paginaUrl, pin) {
  const url = new URL(paginaUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('pin', pin);
  return url.toString();
}

/** Texto do compartilhamento nativo. */
export const conviteTexto = (pin) => `Vem me desafiar no Duelo de Contas! PIN ${pin}`;

/**
 * Abre a conexão. `inicial` ({ t, campos }) é a 1ª mensagem (criar/entrar), enviada ao conectar.
 * Callbacks: onMensagem(msg), onFalha() (não conseguiu conectar), onFechou() (caiu depois de conectar).
 * Fechar pelo `fechar()` não dispara callback nenhum.
 * @returns {{ enviar: (t: string, campos?: object) => boolean, fechar: () => void, aberta: () => boolean }}
 */
export function conectar({
  url, inicial = null, WebSocketCtor = globalThis.WebSocket,
  onMensagem = () => {}, onFalha = () => {}, onFechou = () => {},
  setIntervalFn = globalThis.setInterval, clearIntervalFn = globalThis.clearInterval, agora = Date.now,
}) {
  let encerrado = false; // fechado por nós ou já avisado
  let conectou = false;
  let relogio = null;
  let socket = null;
  let ultimaMensagem = 0; // qualquer mensagem (inclusive `pong`) prova que a conexão está viva

  const parar = () => {
    if (relogio !== null) clearIntervalFn(relogio);
    relogio = null;
  };
  const enviar = (t, campos = {}) => {
    if (!socket || socket.readyState !== 1) return false;
    try {
      socket.send(JSON.stringify({ t, ...campos }));
      return true;
    } catch {
      return false;
    }
  };
  const terminou = () => {
    parar();
    if (encerrado) return;
    encerrado = true;
    (conectou ? onFechou : onFalha)();
  };

  try {
    socket = new WebSocketCtor(url);
  } catch {
    encerrado = true;
    queueMicrotask(onFalha);
    return { enviar: () => false, fechar: () => {}, aberta: () => false };
  }
  socket.onopen = () => {
    conectou = true;
    ultimaMensagem = agora();
    if (inicial) enviar(inicial.t, inicial.campos);
    relogio = setIntervalFn(() => {
      // Conexão "meio aberta" (troca de Wi-Fi para 4G, por exemplo): o navegador não avisa sozinho.
      if (agora() - ultimaMensagem > SEM_PONG_MS) {
        try { socket.close(); } catch { /* já fechado */ }
        terminou();
        return;
      }
      enviar('ping');
    }, PING_MS);
  };
  socket.onmessage = (evento) => {
    ultimaMensagem = agora();
    let msg;
    try {
      msg = JSON.parse(evento.data);
    } catch {
      return;
    }
    if (msg && typeof msg === 'object' && typeof msg.t === 'string') onMensagem(msg);
  };
  socket.onerror = () => {}; // o onclose vem logo depois
  socket.onclose = terminou;

  return {
    enviar,
    aberta: () => !encerrado && socket.readyState === 1,
    fechar() {
      encerrado = true;
      parar();
      try {
        socket.close();
      } catch {
        // já fechado
      }
    },
  };
}

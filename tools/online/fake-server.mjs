// Servidor falso do duelo online, só para testar a interface sem o Worker de verdade.
// Implementa o mínimo do protocolo (criar/entrar/pronto/comecar/contagem/acertei/corda/fim/revanche)
// com um WebSocket escrito à mão (node:http + crypto), sem dependências.
//
//   node tools/online/fake-server.mjs [porta]     (padrão 8787)
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const ROPE_MAX = 5;
const ANIMAIS = ['urso', 'coelho', 'gato', 'panda', 'raposa', 'sapo'];

// ---------- WebSocket mínimo ----------
function frame(text) {
  const data = Buffer.from(text);
  const n = data.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : Buffer.from([0x81, 126, n >> 8, n & 255]);
  return Buffer.concat([head, data]);
}

function decode(buffer) { // devolve { mensagens, resto, fechar }
  const mensagens = [];
  let fechar = false;
  let i = 0;
  while (buffer.length - i >= 2) {
    const op = buffer[i] & 15;
    let len = buffer[i + 1] & 127;
    let at = i + 2;
    if (len === 126) { len = buffer.readUInt16BE(at); at += 2; }
    const mask = buffer.subarray(at, at + 4);
    at += 4;
    if (buffer.length < at + len) break;
    const payload = Buffer.from(buffer.subarray(at, at + len)).map((b, k) => b ^ mask[k % 4]);
    i = at + len;
    if (op === 8) fechar = true;
    else if (op === 1) mensagens.push(payload.toString());
  }
  return { mensagens, resto: buffer.subarray(i), fechar };
}

// ---------- salas ----------
const salas = new Map();
const enviar = (c, obj) => { if (!c.socket.destroyed) c.socket.write(frame(JSON.stringify(obj))); };

function estadoSala(sala, voce) {
  return {
    t: 'sala', pin: sala.pin, voce, ops: sala.ops, nivel: sala.nivel, estado: sala.estado,
    jogadores: sala.jogadores.map((j) => (j ? { bichinho: j.bichinho, pronto: j.pronto } : null)),
  };
}
function difundirSala(sala) {
  sala.jogadores.forEach((j, lado) => { if (j) enviar(j.cliente, estadoSala(sala, lado)); });
}
function difundir(sala, obj) {
  sala.jogadores.forEach((j) => { if (j) enviar(j.cliente, obj); });
}

function iniciarContagem(sala) {
  sala.estado = 'contagem';
  sala.corda = 0;
  sala.acertos = [0, 0];
  sala.ultimo = [-1, -1];
  sala.pedidos = [false, false];
  sala.jogadores[1].pronto = true;
  difundirSala(sala);
  difundir(sala, { t: 'contagem', semente: Math.floor(Math.random() * 2 ** 32), segundos: 3 });
  setTimeout(() => { if (sala.estado === 'contagem') sala.estado = 'jogando'; }, 3000);
}

function tratar(cliente, msg) {
  const { sala } = cliente;
  if (msg.t === 'ping') return enviar(cliente, { t: 'pong' });
  if (!sala) {
    if (msg.v !== 1) { enviar(cliente, { t: 'erro', codigo: 'versao' }); return cliente.socket.end(); }
    if (msg.t === 'criar') {
      let pin;
      do { pin = String(100000 + Math.floor(Math.random() * 900000)); } while (salas.has(pin));
      const nova = {
        pin, ops: msg.ops, nivel: msg.nivel, estado: 'espera', corda: 0, acertos: [0, 0], ultimo: [-1, -1],
        pedidos: [false, false], jogadores: [{ cliente, bichinho: msg.bichinho, pronto: true }, null],
      };
      salas.set(pin, nova);
      cliente.sala = nova;
      cliente.lado = 0;
      return difundirSala(nova);
    }
    if (msg.t === 'entrar') {
      const alvo = salas.get(cliente.pin);
      if (!alvo) { enviar(cliente, { t: 'erro', codigo: 'sala-inexistente' }); return setTimeout(() => cliente.socket.end(), 100); }
      if (alvo.jogadores[1]) { enviar(cliente, { t: 'erro', codigo: 'sala-cheia' }); return setTimeout(() => cliente.socket.end(), 100); }
      if (alvo.jogadores[0].bichinho === msg.bichinho) return enviar(cliente, { t: 'erro', codigo: 'bichinho-igual' });
      alvo.jogadores[1] = { cliente, bichinho: msg.bichinho, pronto: false };
      cliente.sala = alvo;
      cliente.lado = 1;
      return difundirSala(alvo);
    }
    return enviar(cliente, { t: 'erro', codigo: 'mensagem-invalida' });
  }
  const lado = cliente.lado;
  const eu = sala.jogadores[lado];
  const handlers = {
    bichinho() {
      if (lado !== 1 || sala.estado !== 'espera') return;
      if (!ANIMAIS.includes(msg.bichinho) || sala.jogadores[0].bichinho === msg.bichinho) return enviar(cliente, { t: 'erro', codigo: 'bichinho-igual' });
      eu.bichinho = msg.bichinho;
      difundirSala(sala);
    },
    pronto() { if (lado === 1 && sala.estado === 'espera') { eu.pronto = true; difundirSala(sala); } },
    comecar() { if (lado === 0 && sala.estado === 'espera' && sala.jogadores[1]?.pronto) iniciarContagem(sala); },
    acertei() {
      if (sala.estado !== 'jogando' || !(msg.n > sala.ultimo[lado])) return;
      sala.ultimo[lado] = msg.n;
      sala.acertos[lado] += 1;
      sala.corda = Math.max(-ROPE_MAX, Math.min(ROPE_MAX, sala.corda + (lado === 0 ? -1 : 1)));
      difundir(sala, { t: 'corda', valor: sala.corda, lado, acertos: sala.acertos });
      if (Math.abs(sala.corda) >= ROPE_MAX) {
        sala.estado = 'fim';
        difundir(sala, { t: 'fim', vencedor: lado, motivo: 'corda' });
      }
    },
    errei() { sala.jogadores[1 - lado] && enviar(sala.jogadores[1 - lado].cliente, { t: 'errou', lado }); },
    oculos() { sala.jogadores[1 - lado] && enviar(sala.jogadores[1 - lado].cliente, { t: 'oculos', lado, on: Boolean(msg.on) }); },
    revanche() {
      if (sala.estado !== 'fim') return;
      sala.pedidos[lado] = true;
      difundir(sala, { t: 'revanche', lado });
      if (sala.pedidos[0] && sala.pedidos[1]) iniciarContagem(sala);
    },
  };
  if (handlers[msg.t]) handlers[msg.t]();
  else enviar(cliente, { t: 'erro', codigo: 'mensagem-invalida' });
}

function sair(cliente) {
  const { sala, lado } = cliente;
  if (!sala) return;
  cliente.sala = null;
  const outro = sala.jogadores[1 - lado];
  if (lado === 0) { // anfitrião: a sala fecha
    salas.delete(sala.pin);
    if (outro) {
      if (sala.estado === 'contagem' || sala.estado === 'jogando') enviar(outro.cliente, { t: 'fim', vencedor: null, motivo: 'saiu' });
      enviar(outro.cliente, { t: 'saiu', lado: 0 });
      outro.cliente.sala = null;
      outro.cliente.socket.end();
    }
    return;
  }
  sala.jogadores[1] = null;
  if (sala.estado === 'espera') difundirSala(sala);
  else if (sala.estado !== 'fim') enviar(outro.cliente, { t: 'fim', vencedor: null, motivo: 'saiu' });
  sala.estado = sala.estado === 'fim' ? 'fim' : 'espera';
  enviar(outro.cliente, { t: 'saiu', lado: 1 });
}

const servidor = createServer((req, res) => {
  res.writeHead(req.url === '/saude' ? 200 : 404, { 'Access-Control-Allow-Origin': '*' });
  res.end('ok');
});
servidor.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://x');
  const chave = req.headers['sec-websocket-key'];
  const aceite = createHash('sha1').update(`${chave}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${aceite}\r\n\r\n`);
  const cliente = { socket, pin: url.searchParams.get('pin'), sala: null, lado: 0 };
  let resto = Buffer.alloc(0);
  socket.on('data', (dado) => {
    const r = decode(Buffer.concat([resto, dado]));
    resto = r.resto;
    for (const texto of r.mensagens) {
      let msg;
      try { msg = JSON.parse(texto); } catch { enviar(cliente, { t: 'erro', codigo: 'mensagem-invalida' }); continue; }
      tratar(cliente, msg);
    }
    if (r.fechar) socket.end();
  });
  socket.on('close', () => sair(cliente));
  socket.on('error', () => socket.destroy());
});

const porta = Number(process.argv[2] ?? 8787);
servidor.listen(porta, () => console.log(`servidor falso em http://localhost:${porta}`));

// Worker do duelo online: roteia /ws para o Durable Object `Sala` (um por PIN).
// Nada é gravado em disco: o estado da sala vive na memória e nos anexos dos WebSockets.
import { origemPermitida } from './origem.js';
import { tratar, sair, alarme, podeEntrar, proximoAlarme, OCIOSA_MS } from './regras.js';

const PIN_RE = /^[1-9]\d{5}$/;
const MAX_TENTATIVAS = 8;

function sorteiaPin() {
  return String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/saude') {
      return new Response('ok', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    if (url.pathname !== '/ws') return new Response('Não encontrado', { status: 404 });

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Use WebSocket', { status: 426 });
    }
    if (!origemPermitida(request.headers.get('Origin'))) {
      return new Response('Origem não permitida', { status: 403 });
    }

    // Repassa o handshake ao Durable Object do PIN, dizendo o papel por cabeçalho interno.
    const encaminha = (pin, modo) => {
      const cabecalhos = new Headers(request.headers);
      cabecalhos.set('x-modo', modo);
      cabecalhos.set('x-pin', pin);
      const sala = env.SALAS.get(env.SALAS.idFromName(pin));
      return sala.fetch(new Request(request, { headers: cabecalhos }));
    };

    if (url.searchParams.get('criar') === '1') {
      for (let i = 0; i < MAX_TENTATIVAS; i++) {
        const resp = await encaminha(sorteiaPin(), 'criar');
        if (resp.status !== 409) return resp;
      }
      return new Response('Sem salas livres agora', { status: 503 });
    }

    const pin = url.searchParams.get('pin');
    if (pin && PIN_RE.test(pin)) return encaminha(pin, 'entrar');
    return new Response('PIN inválido', { status: 400 });
  },
};

export class Sala {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.state = null;
    this.alarmeEm = null; // só em memória: evita regravar o alarme a cada mensagem
    // Ao acordar da hibernação, reconstrói a sala a partir dos anexos dos sockets.
    for (const ws of this.ctx.getWebSockets()) {
      const anexo = ws.deserializeAttachment();
      if (anexo?.sala) {
        this.state = anexo.sala;
        break;
      }
    }
    // ping/pong sem acordar o objeto
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  abertos(tag) {
    return this.ctx.getWebSockets(tag).filter((w) => w.readyState === 1);
  }

  ladoDe(ws) {
    const tags = this.ctx.getTags(ws);
    if (tags.includes('lado0')) return 0;
    if (tags.includes('lado1')) return 1;
    return null;
  }

  async fetch(request) {
    const modo = request.headers.get('x-modo');
    const pin = request.headers.get('x-pin');
    const [cliente, servidor] = Object.values(new WebSocketPair());

    if (modo === 'criar') {
      if (this.state !== null || this.abertos('lado0').length > 0) {
        return new Response('Ocupada', { status: 409 });
      }
      this.ctx.acceptWebSocket(servidor, ['lado0']);
      servidor.serializeAttachment({ pin, sala: null });
      // Anfitrião que nunca manda `criar` também é encerrado depois de 30 min.
      this.alarmeEm = Date.now() + OCIOSA_MS;
      await this.ctx.storage.setAlarm(this.alarmeEm);
      return new Response(null, { status: 101, webSocket: cliente });
    }

    // Entrar: o erro vai como mensagem no socket (e não como handshake falho).
    let codigo = podeEntrar(this.state);
    if (!codigo && this.abertos('lado1').length > 0) codigo = 'sala-cheia';
    if (codigo) {
      // Socket comum (sem hibernação): manda o erro e fecha logo em seguida.
      servidor.accept();
      servidor.send(JSON.stringify({ t: 'erro', codigo }));
      setTimeout(() => {
        try { servidor.close(1000, codigo); } catch { /* já fechado */ }
      }, 100);
    } else {
      this.ctx.acceptWebSocket(servidor, ['lado1']);
      servidor.serializeAttachment({ pin, sala: this.state });
    }
    return new Response(null, { status: 101, webSocket: cliente });
  }

  // Aplica o resultado das regras: guarda o estado, envia, fecha e reprograma o alarme.
  async aplicar(r, pin) {
    this.state = r.state;
    const sockets = [...this.abertos('lado0'), ...this.abertos('lado1')];
    for (const w of sockets) w.serializeAttachment({ pin, sala: this.state });
    for (const { to, msg } of r.send) {
      const texto = JSON.stringify(msg);
      const alvos = to === 'todos' ? sockets : this.abertos(`lado${to}`);
      for (const w of alvos) {
        try { w.send(texto); } catch { /* socket já caiu */ }
      }
    }
    for (const l of r.close) {
      for (const w of this.abertos(`lado${l}`)) {
        try { w.close(1000, 'fim'); } catch { /* já fechado */ }
      }
    }
    // Só regrava o alarme quando precisa acordar antes do que já está marcado.
    const prox = proximoAlarme(this.state);
    const agora = Date.now();
    if (prox !== null && (this.alarmeEm === null || this.alarmeEm <= agora || prox < this.alarmeEm)) {
      this.alarmeEm = prox;
      await this.ctx.storage.setAlarm(prox);
    }
  }

  async webSocketMessage(ws, mensagem) {
    const lado = this.ladoDe(ws);
    if (lado === null) return;
    const pin = ws.deserializeAttachment()?.pin ?? '';
    const texto = typeof mensagem === 'string' ? mensagem : null;
    await this.aplicar(tratar(this.state, lado, texto, Date.now(), { pin }), pin);
  }

  async webSocketClose(ws) {
    await this.saiu(ws);
  }

  async webSocketError(ws) {
    await this.saiu(ws);
  }

  async saiu(ws) {
    const lado = this.ladoDe(ws);
    if (lado === null) return;
    try { ws.close(1000, 'saiu'); } catch { /* já fechado */ }
    if (this.state === null) return;
    const pin = ws.deserializeAttachment()?.pin ?? '';
    const r = sair(this.state, lado, Date.now());
    r.send = r.send.filter((e) => e.to !== lado); // quem saiu não recebe mais nada
    await this.aplicar(r, pin);
  }

  async alarm() {
    this.alarmeEm = null;
    await this.aplicar(alarme(this.state, Date.now()), this.state?.pin ?? '');
  }
}

// Teste de ponta a ponta do duelo online contra um Worker local.
//
// Como rodar (Node 22+):
//   1. cd worker && npm ci && npx wrangler dev --port 8787
//   2. em outro terminal, na raiz: node tools/online/smoke.mjs [http://localhost:8787]
//
// Cria uma sala, entra com outro cliente, joga até a vitória e testa PIN errado, sala cheia,
// Origin proibido e revanche. Sai com código 1 se algo falhar.
import assert from 'node:assert/strict';

const BASE = process.argv[2] || 'http://localhost:8787';
const WS = BASE.replace(/^http/, 'ws');
const ORIGEM = 'http://localhost:8000';

// O WebSocket global do Node (undici) aceita `headers` no 2º argumento.
function conecta(caminho, origem = ORIGEM) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}${caminho}`, { headers: origem ? { Origin: origem } : {} });
    const c = { ws, fila: [], esperas: [], fechou: false };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      const i = c.esperas.findIndex((w) => w.filtro(m));
      if (i >= 0) c.esperas.splice(i, 1)[0].ok(m);
      else c.fila.push(m);
    };
    ws.onclose = () => { c.fechou = true; };
    ws.onopen = () => resolve(c);
    ws.onerror = () => reject(new Error(`falha ao conectar em ${caminho}`));
  });
}

function espera(c, t, ms = 4000) {
  const filtro = (m) => m.t === t;
  const i = c.fila.findIndex(filtro);
  if (i >= 0) return Promise.resolve(c.fila.splice(i, 1)[0]);
  return new Promise((ok, falha) => {
    const w = { filtro, ok };
    c.esperas.push(w);
    setTimeout(() => {
      c.esperas = c.esperas.filter((x) => x !== w);
      falha(new Error(`timeout esperando "${t}"`));
    }, ms);
  });
}

const envia = (c, m) => c.ws.send(JSON.stringify(m));
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
const passo = (nome) => console.log(`ok  ${++ok}. ${nome}`);

// 0. saúde
const saude = await fetch(`${BASE}/saude`);
assert.equal(await saude.text(), 'ok');
passo('/saude responde ok');

// 1. cria a sala
const lia = await conecta('/ws?criar=1');
envia(lia, { t: 'criar', v: 1, ops: ['add', 'sub'], nivel: 'facil', bichinho: 'urso' });
const salaLia = await espera(lia, 'sala');
assert.match(salaLia.pin, /^[1-9]\d{5}$/);
assert.equal(salaLia.voce, 0);
assert.equal(salaLia.estado, 'espera');
assert.equal(salaLia.jogadores[1], null);
passo(`sala criada, PIN ${salaLia.pin}`);

// 2. o convidado entra
const theo = await conecta(`/ws?pin=${salaLia.pin}`);
envia(theo, { t: 'entrar', v: 1, bichinho: 'urso' });
assert.equal((await espera(theo, 'erro')).codigo, 'bichinho-igual');
passo('bichinho igual ao do anfitrião é recusado');
envia(theo, { t: 'entrar', v: 1, bichinho: 'gato' });
const salaTheo = await espera(theo, 'sala');
assert.equal(salaTheo.voce, 1);
assert.deepEqual(salaTheo.ops, ['add', 'sub']);
assert.equal((await espera(lia, 'sala')).jogadores[1].bichinho, 'gato');
envia(theo, { t: 'pronto' });
assert.equal((await espera(lia, 'sala')).jogadores[1].pronto, true);
passo('convidado entrou e está pronto');

// 3. sala cheia e PIN inexistente
const intruso = await conecta(`/ws?pin=${salaLia.pin}`);
assert.equal((await espera(intruso, 'erro')).codigo, 'sala-cheia');
await dorme(400);
assert.ok(intruso.fechou, 'sala cheia fecha o socket');
passo('terceiro jogador recebe sala-cheia');

const fantasma = await conecta('/ws?pin=999999');
assert.equal((await espera(fantasma, 'erro')).codigo, 'sala-inexistente');
await dorme(400);
assert.ok(fantasma.fechou);
passo('PIN inexistente recebe sala-inexistente');

// 4. começa; contagem de 3 s
envia(lia, { t: 'comecar' });
const [cLia, cTheo] = await Promise.all([espera(lia, 'contagem'), espera(theo, 'contagem')]);
assert.equal(cLia.semente, cTheo.semente);
assert.equal(cLia.segundos, 3);
assert.ok(Number.isInteger(cLia.semente) && cLia.semente >= 0 && cLia.semente <= 0xffffffff);
passo(`contagem com semente ${cLia.semente}`);

// acerto durante a contagem não conta
envia(lia, { t: 'acertei', n: 0 });
await dorme(3300);
assert.equal(lia.fila.filter((m) => m.t === 'corda').length, 0);
passo('acerto na contagem é ignorado');

// 5. joga até a vitória do convidado
envia(lia, { t: 'acertei', n: 0 });
assert.deepEqual(await espera(theo, 'corda'), { t: 'corda', valor: -1, lado: 0, acertos: [1, 0] });
envia(lia, { t: 'acertei', n: 0 }); // repetido: ignorado
envia(theo, { t: 'errei', n: 0 });
assert.deepEqual(await espera(lia, 'errou'), { t: 'errou', lado: 1 });
envia(theo, { t: 'oculos', on: true });
assert.deepEqual(await espera(lia, 'oculos'), { t: 'oculos', lado: 1, on: true });
for (let n = 0; n < 6; n++) envia(theo, { t: 'acertei', n });
const fimTheo = await espera(theo, 'fim');
const fimLia = await espera(lia, 'fim');
assert.deepEqual(fimTheo, { t: 'fim', vencedor: 1, motivo: 'corda' });
assert.deepEqual(fimLia, fimTheo);
assert.equal(lia.fila.filter((m) => m.t === 'corda' && m.valor === 5).length, 1);
passo('partida jogada até a corda: fim, vencedor 1');

// 6. revanche
envia(lia, { t: 'revanche' });
assert.deepEqual(await espera(theo, 'revanche'), { t: 'revanche', lado: 0 });
envia(theo, { t: 'revanche' });
const novaC = await espera(lia, 'contagem');
await espera(theo, 'contagem');
assert.equal(novaC.segundos, 3);
passo('revanche inicia nova contagem');

// 7. ping
envia(lia, { t: 'ping' });
assert.deepEqual(await espera(lia, 'pong'), { t: 'pong' });
passo('ping/pong');

// 8. saída no meio da partida
theo.ws.close();
assert.deepEqual(await espera(lia, 'saiu'), { t: 'saiu', lado: 1 });
assert.deepEqual(await espera(lia, 'fim'), { t: 'fim', vencedor: null, motivo: 'saiu' });
passo('saída no meio: saiu + fim saiu');
lia.ws.close();

// 9. Origin proibido, sem Upgrade, PIN inválido
for (const origem of ['https://evil.example', null]) {
  await assert.rejects(conecta('/ws?criar=1', origem));
}
passo('Origin proibido ou ausente é recusado');
const semUpgrade = await fetch(`${BASE}/ws?criar=1`, { headers: { Origin: ORIGEM } });
assert.equal(semUpgrade.status, 426);
passo('sem Upgrade: 426');
await assert.rejects(conecta('/ws?pin=abc'));
passo('PIN mal formado: handshake recusado');

// 10. anfitrião sai: convidado é avisado
const a = await conecta('/ws?criar=1');
envia(a, { t: 'criar', v: 1, ops: ['mul'], nivel: 'medio', bichinho: 'panda' });
const pin2 = (await espera(a, 'sala')).pin;
const b = await conecta(`/ws?pin=${pin2}`);
envia(b, { t: 'entrar', v: 1, bichinho: 'sapo' });
await espera(b, 'sala');
a.ws.close();
assert.deepEqual(await espera(b, 'saiu'), { t: 'saiu', lado: 0 });
await dorme(400);
assert.ok(b.fechou);
passo('anfitrião sai: convidado recebe saiu e é desconectado');

// 11. versão diferente
const v = await conecta('/ws?criar=1');
envia(v, { t: 'criar', v: 2, ops: ['add'], nivel: 'facil', bichinho: 'gato' });
assert.equal((await espera(v, 'erro')).codigo, 'versao');
passo('versão diferente: erro versao');

console.log(`\nTudo certo (${ok} verificações).`);
process.exit(0);

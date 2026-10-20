// Partida online completa com dois navegadores (Playwright) contra um servidor (falso ou o Worker).
//   python3 -m http.server 8000 &   node tools/online/fake-server.mjs 8787 &
//   node tools/online/e2e.mjs [facil|medio] [larg x alt] [pasta-de-prints] [servidor]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const [nivel = 'facil', tamanho = '844x390', pasta = 'shots-online', servidor = 'http://localhost:8787'] = process.argv.slice(2);
const [W, H] = tamanho.split('x').map(Number);
const site = process.env.SITE ?? 'http://localhost:8000/';
mkdirSync(pasta, { recursive: true });
const tag = `${nivel}-${W}x${H}`;

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const erros = [];
async function novaPagina(nome) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') erros.push(`${nome}: ${m.text()}`); });
  page.on('pageerror', (e) => erros.push(`${nome}: ${e.message}`));
  return page;
}
const host = await novaPagina('anfitrião');
const guest = await novaPagina('convidado');
const shot = (page, nome) => page.screenshot({ path: `${pasta}/${tag}-${nome}.png` });
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

await host.goto(`${site}?servidor=${servidor}`);
await host.click('[data-action="online"]');
await shot(host, '1-menu-online');
await host.click('[data-action="online-create"]');
await host.click(`#opt-diff [data-value="${nivel}"]`);
await host.click('.char-card[data-slot="p1"][data-animal="urso"]');
await host.click('#btn-setup-start');
await host.waitForFunction(() => /\d/.test(document.querySelector('#lobby-pin').getAttribute('aria-label')));
await shot(host, '2-sala-vazia');
const pin = (await host.getAttribute('#lobby-pin', 'aria-label')).replace(/\D/g, '');
console.log('PIN', pin);

await guest.goto(`${site}?servidor=${servidor}&pin=${pin}`);
await shot(guest, '3-entrar-pin');
await guest.click('#btn-join-go');
await guest.waitForSelector('#join-room-stage:not([hidden])');
await guest.click('#cards-guest .char-card[data-animal="gato"]');
await shot(guest, '4-convidado-escolhe');
await guest.click('#btn-ready');
await host.waitForFunction(() => !document.querySelector('#btn-lobby-start').disabled);
await pausa(300);
await shot(host, '5-sala-com-amigo');
await shot(guest, '6-convidado-esperando');
await host.click('#btn-lobby-start');

async function resposta(page) {
  await page.waitForFunction(() => document.querySelector('.panel[data-side="0"] .problem-text')?.textContent);
  const texto = await page.textContent('.panel[data-side="0"] .problem-text');
  return Math.round(Function(`return (${texto.replace('×', '*').replace('÷', '/').replace('−', '-')})`)());
}
async function responder(page, valor) {
  if (nivel === 'facil') {
    await page.click(`.panel[data-side="0"] .choice:text-is("${valor}")`);
  } else {
    for (const d of String(valor)) await page.click(`.panel[data-side="0"] .key[data-key="${d}"]`);
    await page.click('.panel[data-side="0"] .key[data-key="ok"]');
  }
}
async function jogar(page, opcoes) {
  try {
    await jogarRodadas(page, opcoes);
  } catch (erro) {
    if (!(await page.isVisible('#screen-result'))) throw erro; // a partida acabou no meio de um toque
  }
}
async function jogarRodadas(page, { atraso, erraPrimeira }) {
  await page.waitForFunction(() => document.querySelector('#screen-match:not([hidden]) .keypad:not(.is-disabled), #screen-match:not([hidden]) .choices:not(.is-disabled)'), null, { timeout: 15000 });
  let primeira = erraPrimeira;
  for (let i = 0; i < 40; i++) {
    if (await page.isVisible('#screen-result')) return;
    const valor = await resposta(page);
    if (primeira) {
      primeira = false;
      if (nivel === 'facil') await page.click(`.panel[data-side="0"] .choice:not(:text-is("${valor}")):not(.is-out)`);
      else await responder(page, valor + 1);
    }
    await pausa(atraso);
    if (await page.isVisible('#screen-result')) return;
    const antes = await page.textContent('.panel[data-side="0"] .problem-text');
    await responder(page, valor);
    await page.waitForFunction(
      (antes) => document.querySelector('.panel[data-side="0"] .problem-text')?.textContent !== antes
        || document.querySelector('#screen-result:not([hidden])'),
      antes,
      { timeout: 3000 },
    ).catch(() => {});
  }
}
await pausa(1500);
await shot(host, '7-contagem');
await host.waitForSelector('#screen-match .keypad:not(.is-disabled), #screen-match .choices:not(.is-disabled)', { timeout: 10000 });
// óculos do convidado para o anfitrião ver
await guest.click('.panel[data-side="0"] .glasses-btn');
await Promise.all([
  jogar(host, { atraso: 450, erraPrimeira: false }),
  jogar(guest, { atraso: 1300, erraPrimeira: true }).catch(() => {}),
  (async () => { await pausa(3500); await shot(host, '8-partida-anfitriao'); await shot(guest, '9-partida-convidado'); })(),
]);
await host.waitForSelector('#screen-result:not([hidden])', { timeout: 20000 });
await guest.waitForSelector('#screen-result:not([hidden])', { timeout: 20000 });
await pausa(800);
await shot(host, '10-resultado-vitoria');
await shot(guest, '11-resultado-derrota');
await host.click('#btn-again');
await guest.waitForFunction(() => document.querySelector('#result-note').textContent.includes('quer revanche'));
await shot(guest, '12-resultado-revanche-pedida');
await guest.click('#btn-again');
await host.waitForSelector('#screen-match:not([hidden])');
console.log('revanche começou');
await pausa(600);
await shot(host, '13-revanche-contagem');
await host.click('#btn-quit');
await host.click('#dialog-buttons .btn-red');
await guest.waitForSelector('#screen-result:not([hidden])', { timeout: 10000 }).catch(() => {});
await pausa(500);
await shot(guest, '14-amigo-saiu');
console.log('textos finais:', await guest.textContent('#result-title'));
console.log('erros de console:', erros.length ? erros : 'nenhum');
await browser.close();

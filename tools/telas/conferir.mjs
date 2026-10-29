// Confere as telas com prints: menu, Ajuda, aviso de girar e partidas (computador e 2 jogadores) nos tamanhos
// de sempre e no iPhone, com a câmera e a barra de início simuladas (safe areas). Falha se um botão,
// conta ou resposta ficar fora da área visível, se o texto vazar de um botão ou se a tela rolar.
//
// Uso:  python3 -m http.server 8000   (em outro terminal)
//       node tools/telas/conferir.mjs [pasta-dos-prints] [site]
// Ex.:  node tools/telas/conferir.mjs shots http://localhost:8000
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pasta = process.argv[2] || 'shots';
const site = (process.argv[3] || 'http://localhost:8000').replace(/\/+$/, '');
mkdirSync(pasta, { recursive: true });

function playwright() {
  for (const base of [raiz + '/', '/opt/node22/lib/node_modules/']) {
    try { return createRequire(base)('playwright'); } catch { /* tenta o próximo */ }
  }
  throw new Error('Playwright não encontrado (npm i -g playwright).');
}
const { chromium } = playwright();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// iPhone 15: câmera (Dynamic Island) na lateral quando deitado, no alto quando em pé
const IPHONE_DEITADO = { left: 59, right: 59, top: 0, bottom: 21 };
const IPHONE_EM_PE = { left: 0, right: 0, top: 59, bottom: 34 };
const TAMANHOS = [
  ['844x390', 844, 390, null],
  ['390x844', 390, 844, null],
  ['1280x720', 1280, 720, null],
  ['iphone-deitado', 852, 393, IPHONE_DEITADO],
  ['iphone-deitado-safari', 852, 330, IPHONE_DEITADO], // com a barra de endereço
  ['iphone-em-pe', 393, 852, IPHONE_EM_PE],
];

const browser = await chromium.launch();
const problemas = [];

async function abrir(largura, altura, recortes) {
  const ctx = await browser.newContext({
    viewport: { width: largura, height: altura }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problemas.push(`erro na página: ${e.message}`));
  if (recortes) await (await ctx.newCDPSession(page)).send('Emulation.setSafeAreaInsetsOverride', { insets: recortes });
  await page.goto(`${site}/index.html`);
  await sleep(400);
  return page;
}

async function conferir(page, nome, recortes) {
  const ruins = await page.evaluate((ins) => {
    const W = innerWidth;
    const H = innerHeight;
    const { left = 0, right = 0, top = 0, bottom = 0 } = ins || {};
    const lista = [];
    const alvos = [
      '#screen-match button', '#screen-match .display', '#screen-menu button', '#rotate-hint button', '#btn-mute',
      '#btn-help', '#screen-online button', '#screen-help button', '#screen-help-topic button', '#help-canvas',
    ].join(', ');
    for (const el of document.querySelectorAll(alvos)) {
      const r = el.getBoundingClientRect();
      if (!r.width || el.closest('[hidden]') || getComputedStyle(el).visibility === 'hidden') continue;
      const nomeEl = el.id || el.className || el.textContent.trim();
      if (r.left < left - 0.5 || r.right > W - right + 0.5 || r.top < top - 0.5 || r.bottom > H - bottom + 0.5) {
        lista.push(`fora da área visível: ${nomeEl} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
      }
      if (el.matches('button') && el.scrollWidth > el.clientWidth + 1) lista.push(`texto vaza do botão: ${el.textContent.trim()}`);
    }
    for (const tela of document.querySelectorAll('.screen:not([hidden])')) {
      if (tela.scrollHeight > tela.clientHeight + 1 || tela.scrollWidth > tela.clientWidth + 1) lista.push(`a tela rola: ${tela.id}`);
    }
    return lista;
  }, recortes);
  await page.screenshot({ path: path.join(pasta, `${nome}.png`) });
  console.log(`${ruins.length ? '✗' : '✓'} ${nome}${ruins.length ? `\n    ${ruins.join('\n    ')}` : ''}`);
  problemas.push(...ruins.map((r) => `${nome}: ${r}`));
}

async function partida(largura, altura, recortes, modo) {
  const page = await abrir(largura, altura, recortes);
  await page.click(`[data-action="${modo}"]`);
  await sleep(300);
  return page;
}

for (const [nome, largura, altura, recortes] of TAMANHOS) {
  const emPe = altura > largura;
  let page = await abrir(largura, altura, recortes);
  await conferir(page, `${nome}-menu`, recortes);
  await page.click('#btn-help');
  await sleep(200);
  await conferir(page, `${nome}-ajuda`, recortes);
  for (const tema of ['amigo', 'iphone', 'android']) {
    await page.click(`#help-list [data-tema="${tema}"]`);
    await sleep(400); // a fonte de mão carrega e a ilustração é desenhada
    await conferir(page, `${nome}-ajuda-${tema}`, recortes);
    await page.click('#btn-help-topic-back');
  }
  await page.click('[data-action="help-back"]');
  await page.click('[data-action="online"]');
  await sleep(200);
  await conferir(page, `${nome}-desafiar`, recortes);
  await page.context().close();

  for (const [modo, rotulo] of [['play-cpu', 'computador'], ['play-2p', '2p']]) {
    page = await partida(largura, altura, recortes, modo);
    if (emPe && modo === 'play-cpu') await conferir(page, `${nome}-aviso-girar`, recortes);
    if (emPe) await page.click('#btn-rotate-ok');
    await page.click('#btn-setup-start');
    await sleep(4500); // contagem regressiva
    await conferir(page, `${nome}-partida-${rotulo}`, recortes);
    await page.context().close();
  }
}

// aviso de girar nas larguras de celular em pé mais comuns
for (const [largura, altura] of [[320, 568], [360, 780], [430, 932]]) {
  const page = await partida(largura, altura, null, 'play-cpu');
  await conferir(page, `aviso-girar-${largura}x${altura}`, null);
  await page.context().close();
}

await browser.close();
console.log(problemas.length ? `\n${problemas.length} problema(s). Prints em ${pasta}/` : `\nTudo certo. Prints em ${pasta}/`);
process.exit(problemas.length ? 1 : 0);

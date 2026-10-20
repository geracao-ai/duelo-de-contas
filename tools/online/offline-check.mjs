// Confere que os modos offline continuam funcionando (sem erros no console).
//   python3 -m http.server 8000 &   node tools/online/offline-check.mjs
import { createRequire } from 'node:module';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const site = process.env.SITE ?? 'http://localhost:8000/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const erros = [];
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(e.message));
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const valorDe = async (lado) => {
  const t = await page.textContent(`.panel[data-side="${lado}"] .problem-text`);
  return Math.round(Function(`return (${t.replace('×', '*').replace('÷', '/').replace('−', '-')})`)());
};

await page.goto(site);
// contra o computador (Fácil): acerta 2 vezes
await page.click('[data-action="play-cpu"]');
await page.click('#opt-diff [data-value="facil"]');
await page.click('#btn-setup-start');
await page.waitForSelector('#screen-match .choices:not(.is-disabled)', { timeout: 8000 });
for (let i = 0; i < 2; i++) {
  const v = await valorDe(0);
  await page.click(`.panel[data-side="0"] .choice:text-is("${v}")`);
  await pausa(300);
}
console.log('cpu: acertos', await page.textContent('.panel[data-side="0"] .panel-score'));
console.log('pausa visível:', await page.isVisible('#btn-pause'));
await page.click('#btn-quit');
await page.click('#dialog-buttons .btn-red');
// 2 jogadores aqui (Médio): o lado esquerdo acerta
await page.click('[data-action="play-2p"]');
await page.click('#opt-diff [data-value="medio"]');
await page.click('#btn-setup-start');
await page.waitForSelector('#screen-match .keypad:not(.is-disabled)', { timeout: 8000 });
for (let i = 0; i < 5; i++) {
  const v = await valorDe(0);
  await page.keyboard.type(String(v));
  await page.keyboard.press('Enter');
  await pausa(200);
}
await page.waitForSelector('#screen-result:not([hidden])', { timeout: 8000 });
console.log('2p:', await page.textContent('#result-title'));
console.log('botão:', await page.textContent('#btn-again'));
console.log('erros de console:', erros.length ? erros : 'nenhum');
await browser.close();

// Gera os ícones a partir de tools/icone/icone.html: assets/apple-touch-icon.png (180×180, iPhone)
// e assets/icone-192.png / assets/icone-512.png (manifest.webmanifest, Android).
// Uso: python3 -m http.server 8000  (na raiz)  e  node tools/icone/render-icone.mjs [url-base]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:8000';
const ICONES = [[180, 'assets/apple-touch-icon.png'], [192, 'assets/icone-192.png'], [512, 'assets/icone-512.png']];
const browser = await chromium.launch();
for (const [tamanho, arquivo] of ICONES) {
  const page = await browser.newPage({ viewport: { width: tamanho, height: tamanho } });
  await page.goto(`${base}/tools/icone/icone.html?tamanho=${tamanho}`);
  await page.waitForSelector('body[data-ready="1"]');
  await page.screenshot({ path: arquivo });
  await page.close();
  console.log(`${arquivo} gerado`);
}
await browser.close();

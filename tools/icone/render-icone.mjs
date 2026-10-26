// Gera assets/apple-touch-icon.png (180×180) a partir de tools/icone/icone.html.
// Uso: python3 -m http.server 8000  (na raiz)  e  node tools/icone/render-icone.mjs [url-base]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:8000';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 180, height: 180 } });
await page.goto(`${base}/tools/icone/icone.html`);
await page.waitForSelector('body[data-ready="1"]');
await page.screenshot({ path: 'assets/apple-touch-icon.png' });
await browser.close();
console.log('assets/apple-touch-icon.png gerado');

// Gera assets/og-image.png (1200×630) a partir de tools/og/og.html.
// Uso: python3 -m http.server 8000  (na raiz)  e  node tools/og/render-og.mjs [url-base]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:8000';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`${base}/tools/og/og.html`);
await page.waitForSelector('body[data-ready="1"]');
await page.screenshot({ path: 'assets/og-image.png' });
await browser.close();
console.log('assets/og-image.png gerado');

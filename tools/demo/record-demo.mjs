// Grava assets/demo.mp4 (e a prévia assets/demo.gif) a partir de tools/demo/director.html.
//
// Uso (na raiz do repositório, com ffmpeg e Playwright instalados):
//   python3 -m http.server 8000
//   node tools/demo/record-demo.mjs [url-base]
//
// Os quadros vêm do screencast do Chromium (DevTools Protocol), com o tempo real
// de cada quadro, e o ffmpeg monta o vídeo a 30 fps.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8000';
const SITE = 'geracao-ai.github.io/duelo-de-contas';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${BASE}/tools/demo/director.html`);
await page.waitForSelector('body[data-ready="1"]');
const game = page.frameLocator('#game');
await game.locator('#screen-menu').waitFor();
await page.evaluate(() => window.director.intro());
await sleep(300);

// ---------- gravação ----------
const frames = [];
const cdp = await page.context().newCDPSession(page);
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  frames.push({ data: Buffer.from(data, 'base64'), t: metadata.timestamp });
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1280, maxHeight: 720 });

const director = (step, ...args) => page.evaluate(([s, a]) => window.director[s](...a), [step, args]);

/** Toca num elemento do jogo mostrando o círculo do dedo. */
async function tap(locator) {
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await director('tap', x, y);
  await page.mouse.click(x, y);
}

function solve(text) {
  const [a, op, b] = text.trim().split(' ');
  const [x, y] = [Number(a), Number(b)];
  return { '+': x + y, '−': x - y, '×': x * y, '÷': x / y }[op];
}

async function answer(side, value) {
  const panel = game.locator(`.panel[data-side="${side}"]`);
  const options = await panel.locator('.choice').allTextContents();
  if (options.length) {
    // Fácil: toca na opção; para errar de propósito, escolhe qualquer outra.
    const right = options.findIndex((o) => Number(o) === value);
    const index = right >= 0 ? right : options.findIndex((o) => Number(o) !== value - 1);
    await tap(panel.locator('.choice').nth(index));
    return;
  }
  for (const digit of String(value)) {
    await tap(panel.locator(`.key[data-key="${digit}"]`));
    await sleep(140);
  }
  await tap(panel.locator('.key[data-key="ok"]'));
}

await sleep(250);
await director('wake');
await director('zoomOut');
await director('rotate');
await director('zoomIn');
await sleep(250);
const icon = await page.evaluate(() => window.director.iconCenter());
await director('tap', icon.x, icon.y);
await sleep(150);
await director('openGame');
await sleep(500);

// Menu → configuração
await tap(game.locator('[data-action="play-cpu"]'));
await sleep(700);
await tap(game.locator('#opt-ops .chip[data-value="mul"]'));
await sleep(350);
await tap(game.locator('#cards-p1 .char-card[data-animal="panda"]'));
await sleep(500);
await tap(game.locator('[data-action="start"]'));

// Partida: espera a contagem, erra uma vez (para mostrar o "Tente de novo!") e vence.
const problem = game.locator('.panel[data-side="0"] .problem-text');
await game.locator('.panel[data-side="0"] :is(.key, .choice):not([disabled])').first().waitFor();
await sleep(500);
let wrongShown = false;
for (let i = 0; i < 30; i++) {
  if (!(await game.locator('#screen-match').isVisible())) break;
  if (await game.locator('.panel[data-side="0"] :is(.key[data-key="ok"], .choice:not(.is-out))[disabled]').count()) {
    await sleep(150);
    continue;
  }
  const value = solve(await problem.textContent());
  try {
    if (i === 1 && !wrongShown) {
      wrongShown = true;
      await answer(0, value + 1);
      await sleep(700);
      continue;
    }
    await answer(0, value);
  } catch {
    break; // a partida acabou no meio da resposta
  }
  await sleep(300);
}
await game.locator('#screen-result').waitFor();
await sleep(2200);

await director('closeGame');
await director('type', SITE, 65);
await sleep(1300);

await cdp.send('Page.stopScreencast');
await browser.close();
if (errors.length) console.warn('Erros na página:', errors);

// ---------- montagem ----------
const dir = mkdtempSync(join(tmpdir(), 'demo-'));
let list = '';
frames.forEach((f, i) => {
  const name = join(dir, `f${String(i).padStart(5, '0')}.jpg`);
  writeFileSync(name, f.data);
  const next = frames[i + 1]?.t ?? f.t + 1 / 30;
  list += `file '${name}'\nduration ${(next - f.t).toFixed(4)}\n`;
});
list += `file '${join(dir, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'\n`;
writeFileSync(join(dir, 'list.txt'), list);

const duration = frames.at(-1).t - frames[0].t;
console.log(`${frames.length} quadros, ${duration.toFixed(1)} s`);

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'),
  '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22',
  '-movflags', '+faststart', 'assets/demo.mp4',
]);
// Prévia leve para o README (o GitHub não toca MP4 do repositório dentro do README).
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', 'assets/demo.mp4',
  '-vf', 'fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
  'assets/demo.gif',
]);
rmSync(dir, { recursive: true, force: true });
console.log('assets/demo.mp4 e assets/demo.gif gerados');

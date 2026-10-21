// Grava um GIF (e um MP4) de divulgação de uma funcionalidade, a partir de um roteiro.
//
//   node tools/gif/gravar.mjs <roteiro> [--saida gifs] [--formato 1200x675|1080x1080|1280x800] [--estilo palco|claude]
//
// O roteiro fica em tools/gif/roteiros/<roteiro>.mjs (veja criar-sala.mjs e a skill /gif-divulgacao).
// O script sobe sozinho um servidor estático (python3 -m http.server) e, se o roteiro for
// online, o servidor falso do duelo (tools/online/fake-server.mjs), ambos em portas livres.
// Os quadros vêm do screencast do Chromium (DevTools Protocol) com o tempo real de cada um;
// o ffmpeg monta o MP4 e o GIF (12–15 fps, paleta otimizada, até ~3 MB).
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MAX_GIF = 3 * 1024 * 1024;
const PAUSA_FINAL = 1; // segundos parados no último quadro antes de repetir

// ---------- argumentos ----------
const args = process.argv.slice(2);
const opcao = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`);
  if (i < 0) return padrao;
  const [, valor] = args.splice(i, 2);
  return valor;
};
const saida = resolve(opcao('saida', 'gifs'));
const estilo = opcao('estilo', 'palco'); // 'palco' (colorido, celulares, título) ou 'claude' (janela escura com seta)
if (!['palco', 'claude'].includes(estilo)) { console.error('--estilo deve ser palco ou claude'); process.exit(1); }
const formato = opcao('formato', estilo === 'claude' ? '1280x800' : '1200x675');
const nome = args[0];
if (!nome || !/^\d+x\d+$/.test(formato)) {
  console.error('Uso: node tools/gif/gravar.mjs <roteiro> [--saida pasta] [--formato 1200x675|1080x1080]');
  process.exit(1);
}
const [W, H] = formato.split('x').map(Number);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function playwright() {
  for (const base of [raiz + '/', '/opt/node22/lib/node_modules/']) {
    try { return createRequire(base)('playwright'); } catch { /* tenta o próximo */ }
  }
  throw new Error('Playwright não encontrado (npm i -g playwright).');
}
const { chromium } = playwright();

function portaLivre() {
  return new Promise((ok, falha) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
    s.on('error', falha);
  });
}
async function esperarPorta(url) {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(url)).status < 500) return; } catch { /* ainda subindo */ }
    await sleep(100);
  }
  throw new Error(`Servidor não respondeu: ${url}`);
}

const roteiro = await import(pathToFileURL(join(raiz, 'tools/gif/roteiros', `${nome}.mjs`)));
const nFrames = estilo === 'claude' ? 1 : roteiro.frames === 2 ? 2 : 1;

// ---------- servidores ----------
const filhos = [];
const subir = (cmd, argv) => {
  const p = spawn(cmd, argv, { cwd: raiz, stdio: 'ignore' });
  filhos.push(p);
  return p;
};
const parar = () => filhos.forEach((p) => p.kill());
process.on('exit', parar);

const portaSite = await portaLivre();
subir('python3', ['-m', 'http.server', String(portaSite), '--bind', '127.0.0.1']);
let servidor = null;
if (roteiro.online) {
  const portaJogo = await portaLivre();
  subir('node', ['tools/online/fake-server.mjs', String(portaJogo)]);
  servidor = `http://localhost:${portaJogo}`;
  await esperarPorta(servidor);
}
const site = `http://127.0.0.1:${portaSite}`;
await esperarPorta(`${site}/index.html`);

// ---------- página ----------
const consulta = new URLSearchParams({ formato, frames: String(nFrames) });
const pagina = estilo === 'claude' ? 'janela.html' : 'palco.html';
if (roteiro.orientacao) consulta.set('orientacao', roteiro.orientacao);
if (servidor) consulta.set('servidor', servidor);
if (roteiro.tela) consulta.set('tela', roteiro.tela);
if (roteiro.rotulos) consulta.set('rotulos', roteiro.rotulos.join(','));
if (roteiro.params) consulta.set('q', new URLSearchParams(roteiro.params).toString());
consulta.set('titulo', roteiro.titulo ?? '');
if (roteiro.subtitulo) consulta.set('sub', roteiro.subtitulo);

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const erros = [];
function vigiar(p, quem) {
  p.on('console', (m) => { if (m.type() === 'error') erros.push(`${quem} console: ${m.text()}`); });
  p.on('pageerror', (e) => erros.push(`${quem} página: ${e.message}`));
  p.on('requestfailed', (r) => erros.push(`${quem} rede: ${r.url()} ${r.failure()?.errorText}`));
  p.on('response', (r) => { if (r.status() >= 400) erros.push(`${quem} HTTP ${r.status()}: ${r.url()}`); });
}
vigiar(page, 'palco');

await page.goto(`${site}/tools/gif/${pagina}?${consulta}`);
await page.waitForSelector('body[data-pronto="1"]');
const frames = Array.from({ length: nFrames }, (_, i) => page.frameLocator(`iframe[title="Jogo ${i + 1}"]`));
await frames[0].locator('#screen-menu:not([hidden])').waitFor();
await sleep(500);

// ---------- gravação ----------
const quadros = [];
const cdp = await page.context().newCDPSession(page);
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  quadros.push({ data: Buffer.from(data, 'base64'), t: metadata.timestamp });
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
await sleep(700); // um respiro no começo, com o menu parado

const api = {
  page,
  frames,
  servidor,
  site,
  /** Abre uma página escondida (fora da gravação), p.ex. o amigo entrando na sala. Mesmo servidor falso. */
  async paginaOculta(query = {}) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
    const p = await ctx.newPage();
    vigiar(p, 'oculta');
    const params = new URLSearchParams(query);
    if (servidor) params.set('servidor', servidor);
    await p.goto(`${site}/index.html?${params}`);
    return p;
  },
  esperar: sleep,
  legenda: (texto) => page.evaluate((t) => window.palco.legenda(t), texto),
  titulo: (texto, sub) => page.evaluate(([t, s]) => window.palco.titulo(t, s), [texto, sub]),
  abrir: (i, query) => page.evaluate(([a, b]) => window.palco.abrir(a, b), [i, query]),
  /** Mostra o círculo do dedo no centro do elemento e toca nele. */
  async tocar(i, locator) {
    await locator.waitFor({ state: 'visible', timeout: 10000 });
    const r = await locator.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    if (estilo === 'claude') {
      await page.evaluate(([a, x, y]) => window.palco.mover(a, x, y), [i, r.x, r.y]); // a seta desliza até o alvo
      await page.evaluate(() => window.palco.toque());
      await sleep(90);
    } else {
      await page.evaluate(([a, x, y]) => window.palco.toque(a, x, y), [i, r.x, r.y]);
      await sleep(110);
    }
    await locator.click({ timeout: 10000 });
  },
};

await roteiro.passos(api);
await sleep(300);
await cdp.send('Page.stopScreencast');
await browser.close();
parar();

if (erros.length) {
  console.error('Erros na página:\n  ' + erros.join('\n  '));
  process.exit(1);
}

// ---------- montagem ----------
mkdirSync(saida, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'gif-'));
let lista = '';
quadros.forEach((q, i) => {
  const arq = join(tmp, `f${String(i).padStart(5, '0')}.jpg`);
  writeFileSync(arq, q.data);
  const dur = i + 1 < quadros.length ? quadros[i + 1].t - q.t : PAUSA_FINAL;
  lista += `file '${arq}'\nduration ${dur.toFixed(4)}\n`;
});
lista += `file '${join(tmp, `f${String(quadros.length - 1).padStart(5, '0')}.jpg`)}'\n`;
writeFileSync(join(tmp, 'lista.txt'), lista);
const duracao = quadros.at(-1).t - quadros[0].t + PAUSA_FINAL;
console.log(`${quadros.length} quadros, ${duracao.toFixed(1)} s`);

const mp4 = join(saida, `${nome}.mp4`);
const gif = join(saida, `${nome}.gif`);
const ff = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a]);

ff('-f', 'concat', '-safe', '0', '-i', join(tmp, 'lista.txt'),
  '-vf', 'fps=30,scale=ceil(iw/2)*2:ceil(ih/2)*2:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
  '-movflags', '+faststart', mp4);

// GIF: tenta fps e largura decrescentes até caber em ~3 MB.
const largura0 = W === H ? 640 : 800;
const tentativas = [[15, largura0], [12, largura0], [12, Math.round(largura0 * 0.85)], [10, Math.round(largura0 * 0.75)], [10, Math.round(largura0 * 0.65)]];
let escolhida = null;
for (const [fps, largura] of tentativas) {
  const filtro = `fps=${fps},scale=${largura}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
  ff('-i', mp4, '-vf', filtro, '-loop', '0', gif);
  const tam = statSync(gif).size;
  escolhida = { fps, largura, tam };
  console.log(`GIF ${fps} fps, ${largura}px: ${(tam / 1024 / 1024).toFixed(2)} MB`);
  if (tam <= MAX_GIF) break;
}
rmSync(tmp, { recursive: true, force: true });
if (escolhida.tam > MAX_GIF) console.warn('Aviso: o GIF passou de 3 MB mesmo no menor tamanho; encurte o roteiro.');
const mb = (f) => (statSync(f).size / 1024 / 1024).toFixed(2);
console.log(`${gif} (${mb(gif)} MB) e ${mp4} (${mb(mp4)} MB) gerados — ${duracao.toFixed(1)} s, ${escolhida.fps} fps, ${escolhida.largura}px`);

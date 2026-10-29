// Ilustrações anotadas da Ajuda, desenhadas em canvas: fundo branco, traço tremido e notas curtas
// em vermelho (passos), laranja (caminho) e azul (observações), com setas tracejadas (issue #32).
// Coordenadas num quadro virtual (1000x520 deitado, 520x1000 em pé), escalado para caber no canvas.
import { drawCharacter } from './characters.js';

const INK = '#2b1f3a';
const RED = '#d62839';
const ORANGE = '#ef6c1a';
const BLUE = '#1a5fd0';
const MAO = '"Patrick Hand", "Comic Sans MS", cursive';

// ruído determinístico para o traço tremido
let semente = 7;
const rnd = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647 - 0.5; };

function linha(ctx, pts, { cor = INK, larg = 2.2, tracejado = null, tremor = 1.2 } = {}) {
  ctx.save();
  ctx.strokeStyle = cor; ctx.lineWidth = larg; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (tracejado) ctx.setLineDash(tracejado);
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    if (i === 0) { ctx.moveTo(x + rnd() * tremor, y + rnd() * tremor); return; }
    const [px, py] = pts[i - 1];
    const n = Math.max(2, Math.round(Math.hypot(x - px, y - py) / 18));
    for (let k = 1; k <= n; k++) ctx.lineTo(px + (x - px) * k / n + rnd() * tremor, py + (y - py) * k / n + rnd() * tremor);
  });
  ctx.stroke();
  ctx.restore();
}

function curva(ctx, a, c, b, opts) { // quadrática amostrada
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push([(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]]);
  }
  linha(ctx, pts, opts);
  return pts;
}

function seta(ctx, de, para, cor, curvatura = 0.25) {
  const mx = (de[0] + para[0]) / 2 - (para[1] - de[1]) * curvatura;
  const my = (de[1] + para[1]) / 2 + (para[0] - de[0]) * curvatura;
  const pts = curva(ctx, de, [mx, my], para, { cor, larg: 2, tracejado: [6, 6] });
  const [ax, ay] = pts[pts.length - 3];
  const ang = Math.atan2(para[1] - ay, para[0] - ax);
  linha(ctx, [[para[0] - 12 * Math.cos(ang - 0.5), para[1] - 12 * Math.sin(ang - 0.5)], para, [para[0] - 12 * Math.cos(ang + 0.5), para[1] - 12 * Math.sin(ang + 0.5)]], { cor, larg: 2.2 });
}

function texto(ctx, linhas, x, y, cor, tam = 22, alinhar = 'center') {
  ctx.save();
  ctx.fillStyle = cor; ctx.font = `${tam}px ${MAO}`; ctx.textAlign = alinhar; ctx.textBaseline = 'middle';
  [].concat(linhas).forEach((l, i) => ctx.fillText(l, x, y + i * tam * 1.05));
  ctx.restore();
}

function retangulo(ctx, x, y, w, h, r, opts = {}) {
  const pts = [];
  const canto = (cx, cy, a0) => { for (let i = 0; i <= 4; i++) { const a = a0 + (i / 4) * Math.PI / 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  canto(x + w - r, y + r, -Math.PI / 2); canto(x + w - r, y + h - r, 0); canto(x + r, y + h - r, Math.PI / 2); canto(x + r, y + r, Math.PI);
  pts.push(pts[0]);
  if (opts.fundo) { ctx.save(); ctx.fillStyle = opts.fundo; ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.fill(); ctx.restore(); }
  linha(ctx, pts, opts);
}

/** Celular desenhado; devolve a área da tela para posicionar o conteúdo. */
function celular(ctx, x, y, w, h) {
  retangulo(ctx, x, y, w, h, 16, { larg: 2.6, fundo: '#ffffff' });
  linha(ctx, [[x + w / 2 - 14, y + 10], [x + w / 2 + 14, y + 10]], { larg: 4 });
  return { x: x + 8, y: y + 20, w: w - 16, h: h - 30 };
}

function botao(ctx, x, y, w, h, rotulo, cor, destaque = false) {
  retangulo(ctx, x, y, w, h, 8, { larg: 2, fundo: cor });
  ctx.save(); ctx.fillStyle = cor === '#ffffff' || cor === '#ffc83d' ? INK : '#fff';
  ctx.font = `bold ${Math.round(h * 0.42)}px "Trebuchet MS", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(rotulo, x + w / 2, y + h / 2 + 1); ctx.restore();
  if (destaque) retangulo(ctx, x - 6, y - 6, w + 12, h + 12, 12, { cor: RED, larg: 2.4 });
}

function pin(ctx, x, y, digitos, tam = 20) {
  digitos.split('').forEach((d, i) => {
    retangulo(ctx, x + i * (tam + 4), y, tam, tam * 1.3, 4, { larg: 1.8, fundo: '#fff' });
    texto(ctx, d, x + i * (tam + 4) + tam / 2, y + tam * 0.66, INK, tam * 1.05);
  });
}

function bichinho(ctx, id, x, y, s, { facing = 1, aponta = null, estado = 'idle' } = {}) {
  drawCharacter(ctx, id, x, y, s, { facing, state: estado, t: 0.3, rope: aponta ? { x: aponta[0], y: aponta[1] } : null });
}

// ---------- cenas ----------

/** Jogar com um amigo: a corda do jogo leva o PIN de um celular para o outro. */
function cenaAmigo(ctx, W, H, emPe) {
  const L = emPe
    ? { A: [70, 120, 160, 270], B: [290, 560, 160, 270], raposa: [302, 330, -1], sapo: [245, 765, 1], s: 26 }
    : { A: [150, 120, 170, 290], B: [680, 120, 170, 290], raposa: [110, 330, 1], sapo: [890, 330, -1], s: 30 };
  const A = celular(ctx, ...L.A);
  botao(ctx, A.x + 8, A.y + 40, A.w - 16, 34, 'Criar sala', '#148040', true);
  texto(ctx, 'seu PIN:', A.x + A.w / 2, A.y + 96, INK, 18);
  pin(ctx, A.x + 4, A.y + 110, '482913', emPe ? 17 : 18);
  botao(ctx, A.x + 14, A.y + 166, A.w - 28, 24, 'Enviar convite', '#1a5fd0');
  botao(ctx, A.x + 8, A.y + 200, A.w - 16, 30, 'Começar!', '#148040');
  const B = celular(ctx, ...L.B);
  botao(ctx, B.x + 8, B.y + 40, B.w - 16, 34, 'Entrar com PIN', '#1a5fd0', true);
  pin(ctx, B.x + 4, B.y + 100, '482913', emPe ? 17 : 18);
  botao(ctx, B.x + 8, B.y + 200, B.w - 16, 30, 'Estou pronto!', '#148040');
  const pinA = [A.x + A.w + 4, A.y + 122];
  const pinB = [B.x - 4, B.y + 112];

  if (!emPe) {
    texto(ctx, 'celular da Lia', A.x + A.w / 2, 436, BLUE, 22);
    texto(ctx, 'celular do Theo', B.x + B.w / 2, 436, RED, 22);
    curva(ctx, pinA, [500, 330], pinB, { cor: ORANGE, larg: 4, tremor: 0.6 });
    retangulo(ctx, 448, 262, 104, 36, 8, { cor: ORANGE, larg: 2, fundo: '#fff3e6' });
    texto(ctx, '482913', 500, 281, INK, 24);
    texto(ctx, 'passe o PIN para o amigo', 500, 350, ORANGE, 26);
    texto(ctx, '(falando ou pelo convite)', 500, 378, BLUE, 20);
    texto(ctx, ['1. toque em', 'Criar sala'], A.x + A.w / 2, 52, RED, 24);
    seta(ctx, [A.x + A.w / 2, 82], [A.x + A.w / 2, A.y + 32], RED, 0.05);
    texto(ctx, ['2. aparece', 'o PIN'], 400, 170, RED, 24);
    seta(ctx, [400, 200], [pinA[0] + 4, pinA[1] - 10], RED, 0.2);
    texto(ctx, ['3. o amigo toca em', 'Entrar com PIN'], B.x + B.w / 2, 52, RED, 24);
    seta(ctx, [B.x + B.w / 2, 82], [B.x + B.w / 2, B.y + 32], RED, -0.05);
    texto(ctx, ['4. e digita o PIN', 'que recebeu'], 600, 170, RED, 24);
    seta(ctx, [600, 200], [pinB[0] - 4, pinB[1] - 10], RED, -0.2);
    texto(ctx, '5. cada um escolhe um bichinho e a Lia toca em Começar!', 560, 480, BLUE, 22);
    seta(ctx, [330, 472], [A.x + A.w - 20, A.y + 236], BLUE, -0.2);
  } else {
    texto(ctx, 'celular da Lia', A.x + A.w / 2, 412, BLUE, 21);
    texto(ctx, 'celular do Theo', B.x + B.w / 2, 852, RED, 21);
    // a corda desce pela esquerda, longe da nota 3
    curva(ctx, [A.x + A.w / 2 + 30, 428], [230, 560], [B.x + B.w / 2 - 30, B.y - 14], { cor: ORANGE, larg: 4, tremor: 0.6 });
    retangulo(ctx, 190, 462, 104, 36, 8, { cor: ORANGE, larg: 2, fundo: '#fff3e6' });
    texto(ctx, '482913', 242, 481, INK, 24);
    texto(ctx, ['passe o PIN', 'para o amigo'], 90, 530, ORANGE, 26);
    texto(ctx, '(falando ou pelo convite)', 120, 590, BLUE, 19);
    texto(ctx, ['1. toque em', 'Criar sala'], A.x + A.w / 2, 52, RED, 24);
    seta(ctx, [A.x + A.w / 2, 82], [A.x + A.w / 2, A.y + 32], RED, 0.05);
    texto(ctx, ['2. aparece', 'o PIN'], 400, 150, RED, 24);
    seta(ctx, [380, 180], [A.x + A.w - 8, A.y + 104], RED, 0.2);
    texto(ctx, ['3. o amigo toca em', 'Entrar com PIN'], 380, 512, RED, 24);
    seta(ctx, [400, 540], [B.x + B.w / 2 + 30, B.y + 32], RED, -0.1);
    texto(ctx, ['4. digita o PIN', 'que recebeu'], 110, 690, RED, 24);
    seta(ctx, [190, 680], [B.x - 4, B.y + 112], RED, -0.2);
    texto(ctx, ['5. cada um escolhe um bichinho', 'e a Lia toca em Começar!'], 260, 920, BLUE, 22);
  }
  bichinho(ctx, 'raposa', L.raposa[0], L.raposa[1], L.s, { facing: L.raposa[2], aponta: emPe ? [A.x + A.w + 4, A.y + 128] : [A.x - 6, A.y + 126] });
  bichinho(ctx, 'sapo', L.sapo[0], L.sapo[1], L.s, { facing: L.sapo[2], aponta: emPe ? [B.x - 6, B.y + 120] : [B.x + B.w + 6, B.y + 116] });
}

/** Salvar no celular: três telinhas ligadas pela corda laranja. */
function cenaSalvar(ctx, W, H, emPe, sistema) {
  const ios = sistema === 'ios';
  const passos = ios
    ? [
      { nota: ['1. toque em', 'Compartilhar'], sub: ['(ou em ••• e depois', 'Compartilhar)'] },
      { nota: ['2. toque em', 'Adicionar à', 'Tela de Início'] },
      { nota: ['3. toque em', 'Adicionar'] },
    ]
    : [
      { nota: ['1. toque nos', 'três pontinhos ⋮'] },
      { nota: ['2. toque em', 'Instalar e', 'criar atalho'] },
      { nota: ['3. toque em', 'Instalar'] },
    ];
  const largura = emPe ? 150 : 160;
  const altura = emPe ? 240 : 270;
  const pos = emPe
    ? [[60, 40], [310, 350], [60, 660]]
    : [[110, 60], [420, 60], [730, 60]];
  const telas = pos.map(([x, y]) => ({ ...celular(ctx, x, y, largura, altura), X: x, Y: y }));
  const alvos = [];

  // tela 1: barra do navegador
  const t1 = telas[0];
  botao(ctx, t1.x + 8, t1.y + 50, t1.w - 16, 30, 'Duelo de Contas', '#1a5fd0');
  if (ios) {
    retangulo(ctx, t1.x, t1.y + t1.h - 34, t1.w, 34, 6, { larg: 1.6, fundo: '#eef0f5' });
    texto(ctx, '‹', t1.x + 20, t1.y + t1.h - 17, INK, 26);
    retangulo(ctx, t1.x + t1.w / 2 - 14, t1.y + t1.h - 30, 28, 26, 5, { larg: 1.8, fundo: '#fff' });
    texto(ctx, '↑', t1.x + t1.w / 2, t1.y + t1.h - 17, INK, 24);
    texto(ctx, '•••', t1.x + t1.w - 22, t1.y + t1.h - 17, INK, 22);
    retangulo(ctx, t1.x + t1.w / 2 - 22, t1.y + t1.h - 38, 44, 40, 10, { cor: RED, larg: 2.4 });
    alvos.push([t1.x + t1.w / 2, t1.y + t1.h - 40]);
  } else {
    retangulo(ctx, t1.x, t1.y, t1.w, 30, 6, { larg: 1.6, fundo: '#eef0f5' });
    texto(ctx, 'duelo-de-contas…', t1.x + 8, t1.y + 15, INK, 15, 'left');
    texto(ctx, '⋮', t1.x + t1.w - 16, t1.y + 15, INK, 26);
    retangulo(ctx, t1.x + t1.w - 30, t1.y - 2, 28, 34, 8, { cor: RED, larg: 2.4 });
    alvos.push([t1.x + t1.w - 16, t1.y - 4]);
  }

  // tela 2: menu com a opção
  const t2 = telas[1];
  const itens = ios ? ['Copiar', 'Favoritos', 'Adicionar à Tela de Início'] : ['Nova guia', 'Histórico', 'Downloads', 'Instalar e criar atalho'];
  const y0 = ios ? t2.y + t2.h - itens.length * 34 - 4 : t2.y + 6;
  itens.forEach((it, i) => {
    const y = y0 + i * 34;
    const chave = /Adicionar à|Instalar e/.test(it);
    retangulo(ctx, t2.x + 2, y, t2.w - 4, 30, 6, { larg: 1.4, fundo: chave ? '#ffe3ea' : '#f4f4f8' });
    texto(ctx, it, t2.x + 10, y + 15, INK, it.length > 20 ? 14 : 17, 'left');
  });
  const iAlvo = itens.findIndex((it) => /Adicionar à|Instalar e/.test(it));
  retangulo(ctx, t2.x - 4, y0 + iAlvo * 34 - 4, t2.w + 8, 38, 10, { cor: RED, larg: 2.4 });
  // em pé a nota 2 fica à esquerda: a seta chega pela borda esquerda, sem cruzar o celular
  alvos.push([emPe ? t2.x - 4 : t2.x + t2.w + 4, y0 + iAlvo * 34 + 14]);

  // tela 3: confirmar e o ícone pronto
  const t3 = telas[2];
  retangulo(ctx, t3.x + t3.w / 2 - 24, t3.y + 40, 48, 48, 12, { larg: 2, fundo: '#4aa8ff' });
  bichinho(ctx, 'urso', t3.x + t3.w / 2, t3.y + 84, 12);
  texto(ctx, 'Duelo de Contas', t3.x + t3.w / 2, t3.y + 106, INK, 18);
  if (ios) {
    texto(ctx, '☑ Abrir como App Web', t3.x + t3.w / 2, t3.y + 136, BLUE, 15);
    retangulo(ctx, t3.x, t3.y - 2, t3.w, 30, 6, { larg: 1.6, fundo: '#eef0f5' });
    texto(ctx, 'Cancelar', t3.x + 8, t3.y + 13, INK, 15, 'left');
    texto(ctx, 'Adicionar', t3.x + t3.w - 8, t3.y + 13, BLUE, 17, 'right');
    retangulo(ctx, t3.x + t3.w - 76, t3.y - 4, 74, 34, 8, { cor: RED, larg: 2.4 });
    alvos.push([t3.x + t3.w - 40, t3.y - 6]);
  } else {
    botao(ctx, t3.x + 10, t3.y + 140, t3.w - 20, 30, 'Cancelar', '#ffffff');
    botao(ctx, t3.x + 10, t3.y + 180, t3.w - 20, 32, 'Instalar', '#148040');
    retangulo(ctx, t3.x + 4, t3.y + 174, t3.w - 8, 44, 10, { cor: RED, larg: 2.4 });
    alvos.push([t3.x + t3.w + 2, t3.y + 196]);
  }

  // corda laranja ligando as telas
  for (let i = 0; i < 2; i++) {
    const a = pos[i]; const b = pos[i + 1];
    if (emPe) curva(ctx, [a[0] + largura / 2, a[1] + altura + 8], [a[0] + largura / 2, b[1] - 10], [b[0] + largura / 2 + (b[0] > a[0] ? -40 : 40), b[1] - 10], { cor: ORANGE, larg: 4, tremor: 0.6 });
    else curva(ctx, [a[0] + largura + 8, a[1] + altura / 2], [(a[0] + largura + b[0]) / 2, a[1] + altura / 2 + 60], [b[0] - 8, b[1] + altura / 2], { cor: ORANGE, larg: 4, tremor: 0.6 });
  }

  // anotações
  passos.forEach((p, i) => {
    const [x, y] = pos[i];
    let nx; let ny;
    if (emPe) { nx = i === 1 ? 140 : 395; ny = y + 70; } else { nx = x + largura / 2; ny = y + altura + 44; }
    if (!emPe && ios && i === 2) { nx = 950; ny = 34; } // "Adicionar" fica no alto: nota ao lado, sem cruzar a tela
    texto(ctx, p.nota, nx, ny, RED, emPe ? 23 : 24);
    if (p.sub) texto(ctx, p.sub, nx, ny + p.nota.length * 25 + 2, BLUE, 18);
    const de = emPe ? [nx + (alvos[i][0] < nx ? -70 : 70), ny - 22] : (ny < 60 ? [nx - 62, ny + 10] : [nx, ny - 16]);
    seta(ctx, de, alvos[i], RED, emPe ? (alvos[i][0] < nx ? 0.25 : -0.25) : (alvos[i][0] > nx + 30 ? 0.45 : 0.15));
  });

  // a Raposinha comemora no fim
  const fx = emPe ? 430 : 950; const fy = emPe ? 975 : 300;
  bichinho(ctx, 'raposa', fx, fy, emPe ? 24 : 28, { facing: -1, estado: 'cheer' });
  texto(ctx, ['pronto! o jogo', 'vira um app'], emPe ? 290 : 950, emPe ? 940 : 340, ORANGE, 24);
}

/** Desenha o tema (`amigo`, `iphone` ou `android`) no tamanho atual do canvas. Pode ser chamada de novo ao girar a tela. */
export async function desenharAjuda(canvas, tema) {
  try {
    await document.fonts?.load(`24px ${MAO}`);
  } catch {
    // sem a fonte, as notas saem na letra de reserva
  }
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = globalThis.devicePixelRatio || 1;
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  const ctx = canvas.getContext('2d');
  const emPe = r.height > r.width;
  const [VW, VH] = emPe ? [520, 1000] : [1000, 520];
  const esc = Math.min(r.width / VW, r.height / VH);
  ctx.setTransform(dpr * esc, 0, 0, dpr * esc, dpr * (r.width - VW * esc) / 2, dpr * (r.height - VH * esc) / 2);
  semente = 7; // o mesmo traço toda vez
  if (tema === 'amigo') cenaAmigo(ctx, VW, VH, emPe);
  else cenaSalvar(ctx, VW, VH, emPe, tema === 'iphone' ? 'ios' : 'android');
}

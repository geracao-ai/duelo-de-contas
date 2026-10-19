// Óculos: a conta desenhada em blocos numa lousinha.
// Parte pura (buildHelpModel, layoutHelp) é testável; drawHelpBoard só desenha.
//
// Unidades do layout: 1 = lado de um bloco. O desenho escala tudo para caber na lousa.

export const TENS_ABOVE = 20; // números maiores que isso usam barras de 10 (material dourado)

const GROUP = 5; // espaço extra a cada 5 blocos, para contar mais fácil
const GROUP_GAP = 0.45;
const BAR_GAP = 0.35;
const PART_GAP = 2.2;
const LABEL_H = 1.5;
const BOX_PAD = 0.35;
const BOX_GAP = 0.6;
const BOXES_PER_ROW = 6;

export const HELP_COLORS = {
  a: '#ffe066', // giz amarelo
  b: '#8fd3ff', // giz azul
  label: '#ffffff',
};

// ---------- modelo ----------

/** Peças de um número: barras de 10 e cubinhos (ou só cubinhos, se pequeno). */
function pieces(value, color, tens) {
  const out = [];
  const bars = tens ? Math.floor(value / 10) : 0;
  for (let i = 0; i < bars; i++) out.push({ kind: 'ten', color, crossed: 0 });
  for (let i = 0; i < value - bars * 10; i++) out.push({ kind: 'unit', color, crossed: 0 });
  return out;
}

/** Risca `count` blocos a partir do fim (cubinhos primeiro, depois células das barras). */
function crossFromEnd(list, count) {
  let left = count;
  for (let i = list.length - 1; i >= 0 && left > 0; i--) {
    const size = list[i].kind === 'ten' ? 10 : 1;
    const take = Math.min(size, left);
    list[i].crossed = take;
    left -= take;
  }
  return list;
}

/**
 * Descreve como desenhar a conta.
 * add/sub: `parts` com peças; mul: grade `rows`×`cols`; div: `boxes` caixas com `perBox` blocos.
 */
export function buildHelpModel(problem, difficulty) {
  const { op, a, b, answer } = problem;
  const showNumbers = difficulty !== 'dificil';
  if (op === 'add') {
    const tens = Math.max(a, b, answer) > TENS_ABOVE;
    return {
      op, showNumbers, tens,
      parts: [
        { label: String(a), pieces: pieces(a, 'a', tens) },
        { label: String(b), pieces: pieces(b, 'b', tens) },
      ],
    };
  }
  if (op === 'sub') {
    const tens = a > TENS_ABOVE;
    return {
      op, showNumbers, tens,
      parts: [{ label: `${a} − ${b}`, pieces: crossFromEnd(pieces(a, 'a', tens), b) }],
    };
  }
  if (op === 'mul') return { op, showNumbers, rows: a, cols: b };
  return { op, showNumbers, total: a, boxes: b, perBox: answer };
}

// ---------- layout ----------

const groupOffset = (i) => i + Math.floor(i / GROUP) * GROUP_GAP;
const groupSpan = (n) => (n <= 0 ? 0 : groupOffset(n - 1) + 1);

/** Posiciona as peças de uma parte. Devolve itens relativos a (0, 0) e o tamanho. */
function layoutPart(part, tens, rowLength) {
  const items = [];
  const bars = part.pieces.filter((p) => p.kind === 'ten');
  const units = part.pieces.filter((p) => p.kind === 'unit');
  if (tens) {
    // barras em pé (uma peça de 10) e cubinhos em colunas de 5 ao lado, alinhados pela base
    bars.forEach((bar, i) => {
      const x = i * (1 + BAR_GAP);
      items.push({ type: 'bar', x, y: 0, w: 1, h: 10, color: bar.color });
      for (let c = 0; c < 10; c++) {
        // as células riscadas são as de cima (fim da barra)
        items.push({ type: 'cell', x, y: 9 - c, color: bar.color, crossed: c >= 10 - bar.crossed, inBar: true });
      }
    });
    const x0 = bars.length * (1 + BAR_GAP) + (bars.length ? 0.3 : 0);
    units.forEach((unit, i) => {
      const col = Math.floor(i / GROUP);
      items.push({ type: 'cell', x: x0 + col * 1.1, y: 9 - (i % GROUP), color: unit.color, crossed: unit.crossed > 0 });
    });
    const cols = Math.ceil(units.length / GROUP);
    const width = Math.max(1, x0 + (cols ? cols * 1.1 - 0.1 : -BAR_GAP));
    return { items, width, height: 10 };
  }
  // cubinhos em fileiras de 10 (5 + 5) ou de 5, se a lousa for estreita
  units.forEach((unit, i) => {
    items.push({
      type: 'cell', x: groupOffset(i % rowLength), y: Math.floor(i / rowLength) * 1.2, color: unit.color, crossed: unit.crossed > 0,
    });
  });
  const rows = Math.max(1, Math.ceil(units.length / rowLength));
  return { items, width: groupSpan(Math.min(Math.max(units.length, 1), rowLength)), height: rows * 1.2 - 0.2 };
}

function shift(items, dx, dy) {
  return items.map((it) => ({ ...it, x: it.x + dx, y: it.y + dy }));
}

function layoutParts(model, { rowLength = 10 }) {
  const parts = model.parts.map((p) => layoutPart(p, model.tens, rowLength));
  const height = Math.max(...parts.map((p) => p.height));
  const items = [];
  let x = 0;
  parts.forEach((part, i) => {
    if (i > 0) {
      items.push({ type: 'text', x: x + PART_GAP / 2, y: height / 2, text: '+', color: HELP_COLORS.label, size: 1.4 });
      x += PART_GAP;
    }
    const dy = height - part.height; // alinha pela base
    items.push(...shift(part.items, x, dy));
    if (model.showNumbers) {
      items.push({ type: 'text', x: x + part.width / 2, y: height + LABEL_H * 0.65, text: model.parts[i].label, color: HELP_COLORS.label, size: 0.95 });
    }
    x += part.width;
  });
  return { items, width: x, height: height + (model.showNumbers ? LABEL_H : 0) };
}

function layoutGrid(model) {
  const { rows, cols, showNumbers } = model;
  const left = showNumbers ? 1.6 : 0;
  const top = showNumbers ? LABEL_H : 0;
  const items = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      items.push({ type: 'cell', x: left + groupOffset(c), y: top + groupOffset(r), color: r % 2 ? HELP_COLORS.b : HELP_COLORS.a, crossed: false });
    }
  }
  if (showNumbers) {
    items.push({ type: 'text', x: left / 2 - 0.1, y: top + groupSpan(rows) / 2, text: String(rows), color: HELP_COLORS.label, size: 0.95 });
    items.push({ type: 'text', x: left + groupSpan(cols) / 2, y: LABEL_H * 0.45, text: String(cols), color: HELP_COLORS.label, size: 0.95 });
  }
  return { items, width: left + groupSpan(cols), height: top + groupSpan(rows) };
}

function layoutBoxes(model, { boxesPerRow = BOXES_PER_ROW }) {
  const { boxes, perBox, total, showNumbers } = model;
  const inCols = Math.min(perBox, GROUP);
  const inRows = Math.ceil(perBox / GROUP);
  const boxW = inCols * 1.1 - 0.1 + BOX_PAD * 2;
  const boxH = inRows * 1.1 - 0.1 + BOX_PAD * 2;
  const perRow = Math.min(boxes, boxesPerRow);
  const top = showNumbers ? LABEL_H : 0;
  const items = [];
  for (let k = 0; k < boxes; k++) {
    const bx = (k % perRow) * (boxW + BOX_GAP);
    const by = top + Math.floor(k / perRow) * (boxH + BOX_GAP);
    items.push({ type: 'box', x: bx, y: by, w: boxW, h: boxH });
    for (let i = 0; i < perBox; i++) {
      items.push({
        type: 'cell', x: bx + BOX_PAD + (i % GROUP) * 1.1, y: by + BOX_PAD + Math.floor(i / GROUP) * 1.1,
        color: k % 2 ? HELP_COLORS.b : HELP_COLORS.a, crossed: false,
      });
    }
  }
  const width = perRow * (boxW + BOX_GAP) - BOX_GAP;
  const boxRows = Math.ceil(boxes / perRow);
  if (showNumbers) {
    items.push({ type: 'text', x: width / 2, y: LABEL_H * 0.45, text: `${total} em ${boxes} caixas`, color: HELP_COLORS.label, size: 0.9 });
  }
  return { items, width, height: top + boxRows * (boxH + BOX_GAP) - BOX_GAP };
}

/**
 * Itens a desenhar (células, barras, caixas e textos) e o tamanho total, em unidades de bloco.
 * `options`: rowLength (cubinhos por fileira) e boxesPerRow (caixas por linha).
 */
export function layoutHelp(model, options = {}) {
  if (model.op === 'mul') return layoutGrid(model);
  if (model.op === 'div') return layoutBoxes(model, options);
  return layoutParts(model, options);
}

const MAX_CELL = 26; // px: contas pequenas não ficam gigantes
const MARGIN = 10;

const cellScale = (layout, width, height) => Math.min(
  MAX_CELL, (width - MARGIN * 2) / layout.width, (height - MARGIN * 2) / layout.height,
);

/** Escolhe o arranjo em que os blocos ficam maiores numa lousa de width × height px. */
export function fitLayout(model, width, height) {
  const candidates = model.op === 'div'
    ? [6, 4, 3, 2].map((boxesPerRow) => layoutHelp(model, { boxesPerRow }))
    : [10, 5].map((rowLength) => layoutHelp(model, { rowLength }));
  // em caso de empate, fica o primeiro (o arranjo padrão)
  return candidates.reduce((best, c) => (cellScale(c, width, height) > cellScale(best, width, height) + 0.01 ? c : best));
}

// ---------- desenho ----------

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Desenha o conteúdo da lousa (o fundo verde e a moldura ficam no CSS). */
export function drawHelpBoard(ctx, width, height, layout) {
  ctx.clearRect(0, 0, width, height);
  const scale = cellScale(layout, width, height);
  const ox = (width - layout.width * scale) / 2;
  const oy = (height - layout.height * scale) / 2;
  const pad = Math.max(1, scale * 0.08);

  for (const it of layout.items) {
    if (it.type !== 'box') continue;
    rounded(ctx, ox + it.x * scale, oy + it.y * scale, it.w * scale, it.h * scale, scale * 0.35);
    ctx.lineWidth = Math.max(1.5, scale * 0.1);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.setLineDash([scale * 0.3, scale * 0.2]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // barras de 10: uma peça inteira com as divisões marcadas
  for (const it of layout.items) {
    if (it.type !== 'bar') continue;
    const x = ox + it.x * scale + pad;
    const y = oy + it.y * scale + pad;
    const w = it.w * scale - pad * 2;
    const h = it.h * scale - pad * 2;
    rounded(ctx, x, y, w, h, w * 0.22);
    ctx.fillStyle = HELP_COLORS[it.color] ?? it.color;
    ctx.fill();
    ctx.lineWidth = Math.max(1, scale * 0.07);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.stroke();
    ctx.beginPath();
    for (let k = 1; k < it.h; k++) {
      ctx.moveTo(x + w * 0.12, oy + (it.y + k) * scale);
      ctx.lineTo(x + w * 0.88, oy + (it.y + k) * scale);
    }
    ctx.lineWidth = Math.max(1, scale * 0.05);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.stroke();
  }

  for (const it of layout.items) {
    if (it.type !== 'cell') continue;
    if (it.inBar && !it.crossed) continue; // já desenhada pela barra
    if (it.inBar) {
      // célula riscada dentro da barra: apaga com a cor da lousa antes do X
      ctx.fillStyle = 'rgba(47, 107, 71, 0.7)';
      ctx.fillRect(ox + it.x * scale + pad, oy + it.y * scale, scale - pad * 2, scale);
    }
    const x = ox + it.x * scale + pad;
    const y = oy + it.y * scale + pad;
    const s = scale - pad * 2;
    if (!it.inBar) {
      ctx.globalAlpha = it.crossed ? 0.35 : 1;
      rounded(ctx, x, y, s, s, s * 0.22);
      ctx.fillStyle = HELP_COLORS[it.color] ?? it.color;
      ctx.fill();
      ctx.lineWidth = Math.max(1, scale * 0.06);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (it.crossed) {
      ctx.beginPath();
      ctx.moveTo(x + s * 0.15, y + s * 0.15);
      ctx.lineTo(x + s * 0.85, y + s * 0.85);
      ctx.moveTo(x + s * 0.85, y + s * 0.15);
      ctx.lineTo(x + s * 0.15, y + s * 0.85);
      ctx.lineWidth = Math.max(1.5, scale * 0.12);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
  }

  for (const it of layout.items) {
    if (it.type !== 'text') continue;
    const size = Math.max(11, Math.min(22, it.size * scale));
    ctx.font = `900 ${size}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = it.color;
    ctx.fillText(it.text, ox + it.x * scale, oy + it.y * scale);
  }
}

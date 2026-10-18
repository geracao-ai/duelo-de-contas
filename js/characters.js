// Seis bichinhos desenhados só com formas de canvas.
// Sistema de coordenadas local: origem nos pés, +x em direção à corda, y para cima é negativo.
// Tudo é medido em múltiplos de `s` (tamanho do personagem); a altura total é ~3,1 s.

const OUTLINE = '#3b2a20';
const BLUSH = 'rgba(255, 105, 135, 0.55)';

export const ANIMALS = [
  { id: 'urso', name: 'Ursinho', body: '#b07a45', belly: '#f2d6a8', limb: '#9a6636', ear: 'round', earInner: '#f2d6a8', nose: '#3b2314' },
  { id: 'coelho', name: 'Coelhinha', body: '#f4eef0', belly: '#ffffff', limb: '#eae0e4', ear: 'long', earInner: '#ffb3c6', nose: '#ff7aa2' },
  { id: 'gato', name: 'Gatinho', body: '#f0a04b', belly: '#fff0d6', limb: '#e08f3a', ear: 'point', earInner: '#ffb3c6', nose: '#ff7aa2' },
  { id: 'panda', name: 'Pandinha', body: '#ffffff', belly: '#ffffff', limb: '#2b2b33', ear: 'round', earInner: '#2b2b33', earOuter: '#2b2b33', nose: '#2b2b33' },
  { id: 'raposa', name: 'Raposinha', body: '#ee7b30', belly: '#fff3e0', limb: '#d9661c', ear: 'point', earInner: '#3b2a20', nose: '#2b2b33' },
  { id: 'sapo', name: 'Sapinho', body: '#6cc24a', belly: '#d9f5a8', limb: '#58ad38', ear: 'none', earInner: '#6cc24a', nose: '#2f6a1c' },
];

export const ANIMAL_IDS = ANIMALS.map((a) => a.id);

export function getAnimal(id) {
  return ANIMALS.find((a) => a.id === id) ?? ANIMALS[0];
}

// ---------- helpers de desenho ----------

function ellipse(ctx, x, y, rx, ry, fill, lw = 0, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(rx, 0.001), Math.max(ry, 0.001), rot, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = OUTLINE; ctx.stroke(); }
}

function polygon(ctx, points, fill, lw = 0) {
  ctx.beginPath();
  points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  ctx.lineJoin = 'round';
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = OUTLINE; ctx.stroke(); }
}

function line(ctx, x1, y1, x2, y2, width, color = OUTLINE) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.stroke();
}

function rotatePoint(x, y, angle) {
  return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
}

// ---------- poses ----------

/** Calcula os parâmetros do corpo para cada estado. */
function computePose(state, t, stateT) {
  const bob = Math.sin(t * 3);
  switch (state) {
    case 'pull':
      return { lean: -0.32 + Math.sin(t * 14) * 0.03, lift: 0, sit: 0, eyes: 'determined', mouth: 'effort', arms: 'rope', tilt: 0 };
    case 'cheer':
      return { lean: 0, lift: Math.abs(Math.sin(t * 6)) * 0.32, sit: 0, eyes: 'happy', mouth: 'grin', arms: 'up', tilt: Math.sin(t * 6) * 0.06 };
    case 'fall': {
      const k = Math.min(stateT / 0.6, 1);
      return { lean: Math.sin(k * Math.PI) * 0.7, lift: Math.sin(k * Math.PI) * 0.25, sit: k, eyes: 'sad', mouth: 'sad', arms: 'down', tilt: 0 };
    }
    case 'sad':
      return { lean: 0.04, lift: 0, sit: 1, eyes: 'sad', mouth: 'sad', arms: 'down', tilt: Math.sin(t * 2) * 0.03 };
    default:
      return { lean: 0, lift: bob * 0.03, sit: 0, eyes: 'open', mouth: 'smile', arms: 'rope', tilt: bob * 0.02 };
  }
}

// ---------- partes do corpo ----------

function drawTail(ctx, a, s, pose) {
  const sitShift = pose.sit * 0.2 * s;
  if (a.id === 'raposa') {
    ctx.save();
    ctx.translate(-0.75 * s, -0.5 * s + sitShift);
    ctx.rotate(-0.9 + Math.sin(performance.now() / 400) * 0.08);
    ellipse(ctx, 0, -0.45 * s, 0.34 * s, 0.75 * s, a.body, 0.06 * s);
    ellipse(ctx, 0, -1.0 * s, 0.26 * s, 0.3 * s, '#ffffff', 0.05 * s);
    ctx.restore();
  } else if (a.id === 'gato') {
    ctx.beginPath();
    ctx.moveTo(-0.55 * s, -0.4 * s + sitShift);
    ctx.bezierCurveTo(-1.3 * s, -0.4 * s, -1.2 * s, -1.4 * s, -0.8 * s, -1.5 * s);
    ctx.lineWidth = 0.3 * s;
    ctx.lineCap = 'round';
    ctx.strokeStyle = a.body;
    ctx.stroke();
  } else if (a.id === 'coelho' || a.id === 'urso' || a.id === 'panda') {
    ellipse(ctx, -0.68 * s, -0.5 * s + sitShift, 0.2 * s, 0.2 * s, a.id === 'urso' ? a.body : '#ffffff', 0.05 * s);
  }
}

function drawLegs(ctx, a, s, pose) {
  const legColor = a.limb;
  if (pose.sit > 0.5) {
    ellipse(ctx, 0.55 * s, -0.17 * s, 0.4 * s, 0.2 * s, legColor, 0.05 * s, -0.1);
    ellipse(ctx, 0.15 * s, -0.12 * s, 0.4 * s, 0.2 * s, legColor, 0.05 * s, 0.05);
    return;
  }
  ellipse(ctx, 0.32 * s, -0.16 * s, 0.34 * s, 0.17 * s, legColor, 0.05 * s);
  ellipse(ctx, -0.3 * s, -0.16 * s, 0.34 * s, 0.17 * s, legColor, 0.05 * s);
}

function drawBody(ctx, a, s, pose) {
  const dy = pose.sit * 0.12 * s;
  ellipse(ctx, 0, -0.78 * s + dy, 0.72 * s, 0.78 * s - dy * 0.4, a.body, 0.06 * s);
  ellipse(ctx, 0.07 * s, -0.7 * s + dy, 0.46 * s, 0.5 * s, a.belly, 0);
  if (a.id === 'gato') {
    for (const k of [-1, 0, 1]) line(ctx, -0.72 * s, (-0.95 + k * 0.22) * s, -0.5 * s, (-0.95 + k * 0.22) * s, 0.06 * s, '#c97a24');
  }
  if (a.id === 'sapo') {
    ellipse(ctx, -0.35 * s, -1.05 * s, 0.1 * s, 0.08 * s, '#4f9e33');
    ellipse(ctx, -0.5 * s, -0.7 * s, 0.08 * s, 0.07 * s, '#4f9e33');
  }
}

function drawEarsBehind(ctx, a, s) {
  const y = -2.72 * s;
  for (const side of [-1, 1]) {
    if (a.ear === 'round') {
      ellipse(ctx, side * 0.72 * s, y, 0.36 * s, 0.36 * s, a.earOuter ?? a.body, 0.06 * s);
      if (!a.earOuter) ellipse(ctx, side * 0.72 * s, y + 0.03 * s, 0.2 * s, 0.2 * s, a.earInner);
    } else if (a.ear === 'long') {
      ctx.save();
      ctx.translate(side * 0.4 * s, -3.0 * s);
      ctx.rotate(side * 0.16);
      ellipse(ctx, 0, -0.55 * s, 0.24 * s, 0.82 * s, a.body, 0.06 * s);
      ellipse(ctx, 0, -0.5 * s, 0.12 * s, 0.6 * s, a.earInner);
      ctx.restore();
    } else if (a.ear === 'point') {
      polygon(ctx, [[side * 0.2 * s, -2.7 * s], [side * 0.92 * s, -2.55 * s], [side * 0.78 * s, -3.5 * s]], a.id === 'raposa' ? a.body : a.body, 0.06 * s);
      polygon(ctx, [[side * 0.4 * s, -2.78 * s], [side * 0.8 * s, -2.7 * s], [side * 0.74 * s, -3.2 * s]], a.earInner);
    }
  }
}

function drawFrogBumps(ctx, a, s) {
  for (const side of [-1, 1]) ellipse(ctx, side * 0.58 * s, -2.78 * s, 0.4 * s, 0.4 * s, a.body, 0.06 * s);
}

function drawHead(ctx, a, s) {
  if (a.id === 'sapo') {
    ellipse(ctx, 0, -1.9 * s, 1.12 * s, 0.86 * s, a.body, 0.06 * s);
    ellipse(ctx, 0, -1.55 * s, 0.8 * s, 0.4 * s, a.belly);
  } else {
    ellipse(ctx, 0, -1.95 * s, 1.0 * s, 0.93 * s, a.body, 0.06 * s);
  }
  if (a.id === 'raposa') {
    ellipse(ctx, -0.5 * s, -1.65 * s, 0.52 * s, 0.34 * s, '#ffffff', 0, 0.25);
    ellipse(ctx, 0.5 * s, -1.65 * s, 0.52 * s, 0.34 * s, '#ffffff', 0, -0.25);
  } else if (a.id === 'urso') {
    ellipse(ctx, 0, -1.68 * s, 0.4 * s, 0.3 * s, a.belly, 0.04 * s);
  } else if (a.id === 'gato') {
    for (const k of [-1, 0, 1]) line(ctx, k * 0.2 * s, -2.85 * s, k * 0.2 * s, -2.62 * s, 0.06 * s, '#c97a24');
  } else if (a.id === 'panda') {
    for (const side of [-1, 1]) ellipse(ctx, side * 0.42 * s, -2.0 * s, 0.3 * s, 0.38 * s, '#2b2b33', 0, side * 0.45);
  }
}

function drawEyes(ctx, a, s, pose, t) {
  const frog = a.id === 'sapo';
  const eyeY = frog ? -2.8 * s : -2.0 * s;
  const eyeX = frog ? 0.58 * s : 0.42 * s;
  const radius = (frog ? 0.27 : 0.3) * s;
  const blinking = (t + a.id.length) % 4.2 < 0.13;
  for (const side of [-1, 1]) {
    const ex = side * eyeX;
    if (pose.eyes === 'happy') {
      ctx.beginPath();
      ctx.arc(ex, eyeY + 0.08 * s, radius * 0.75, 1.12 * Math.PI, 1.88 * Math.PI);
      ctx.lineWidth = 0.1 * s;
      ctx.lineCap = 'round';
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    } else if (blinking) {
      line(ctx, ex - radius * 0.7, eyeY, ex + radius * 0.7, eyeY, 0.09 * s);
    } else {
      ellipse(ctx, ex, eyeY, radius, radius * 1.08, '#ffffff', 0.045 * s);
      ellipse(ctx, ex + 0.06 * s, eyeY + 0.03 * s, radius * 0.62, radius * 0.66, '#2b2230');
      ellipse(ctx, ex + 0.1 * s, eyeY - 0.06 * s, radius * 0.24, radius * 0.24, '#ffffff');
      ellipse(ctx, ex + 0.01 * s, eyeY + 0.09 * s, radius * 0.11, radius * 0.11, '#ffffff');
    }
    if (pose.eyes === 'determined') {
      line(ctx, ex - side * radius * 1.1, eyeY - radius * 1.35, ex + side * radius * 0.9, eyeY - radius * 0.95, 0.09 * s);
    } else if (pose.eyes === 'sad') {
      line(ctx, ex - side * radius * 0.9, eyeY - radius * 1.1, ex + side * radius * 1.1, eyeY - radius * 1.5, 0.08 * s);
    }
  }
  if (pose.eyes === 'sad') {
    ellipse(ctx, eyeX + 0.1 * s, eyeY + radius * 1.5, 0.07 * s, 0.12 * s, '#6ec6ff', 0.02 * s);
  }
}

function drawBlush(ctx, a, s) {
  const y = a.id === 'sapo' ? -1.78 * s : -1.66 * s;
  const x = a.id === 'sapo' ? 0.78 * s : 0.66 * s;
  for (const side of [-1, 1]) ellipse(ctx, side * x, y, 0.2 * s, 0.12 * s, BLUSH);
}

function drawNose(ctx, a, s) {
  if (a.id === 'urso') {
    ellipse(ctx, 0, -1.8 * s, 0.14 * s, 0.1 * s, a.nose);
  } else if (a.id === 'coelho' || a.id === 'gato') {
    polygon(ctx, [[-0.1 * s, -1.82 * s], [0.1 * s, -1.82 * s], [0, -1.7 * s]], a.nose, 0.02 * s);
  } else if (a.id === 'panda' || a.id === 'raposa') {
    ellipse(ctx, 0, -1.78 * s, 0.13 * s, 0.09 * s, a.nose);
  } else if (a.id === 'sapo') {
    ellipse(ctx, -0.12 * s, -2.05 * s, 0.04 * s, 0.03 * s, a.nose);
    ellipse(ctx, 0.12 * s, -2.05 * s, 0.04 * s, 0.03 * s, a.nose);
  }
  if (a.id === 'gato') {
    for (const side of [-1, 1]) {
      line(ctx, side * 0.5 * s, -1.72 * s, side * 1.15 * s, -1.8 * s, 0.03 * s);
      line(ctx, side * 0.5 * s, -1.62 * s, side * 1.15 * s, -1.6 * s, 0.03 * s);
    }
  }
}

function drawMouth(ctx, a, s, pose) {
  const my = a.id === 'sapo' ? -1.62 * s : -1.58 * s;
  const lw = 0.07 * s;
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = lw;
  switch (pose.mouth) {
    case 'grin':
      ctx.beginPath();
      ctx.arc(0, my - 0.1 * s, 0.3 * s, 0, Math.PI);
      ctx.closePath();
      ctx.fillStyle = '#7a1f2f';
      ctx.fill();
      ctx.stroke();
      ellipse(ctx, 0, my + 0.14 * s, 0.14 * s, 0.07 * s, '#ff7a93');
      break;
    case 'effort':
      ellipse(ctx, 0, my + 0.02 * s, 0.22 * s, 0.14 * s, '#7a1f2f', 0.05 * s);
      line(ctx, -0.12 * s, my - 0.04 * s, 0.12 * s, my - 0.04 * s, 0.05 * s, '#ffffff');
      break;
    case 'sad':
      ctx.beginPath();
      ctx.arc(0, my + 0.28 * s, 0.2 * s, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
      break;
    default:
      if (a.id === 'sapo') {
        ctx.beginPath();
        ctx.arc(0, my - 0.28 * s, 0.5 * s, 0.18 * Math.PI, 0.82 * Math.PI);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(-0.1 * s, my - 0.04 * s, 0.1 * s, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.arc(0.1 * s, my - 0.04 * s, 0.1 * s, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.stroke();
      }
  }
  if (a.id === 'coelho' && pose.mouth !== 'sad' && pose.mouth !== 'grin') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-0.09 * s, my + 0.04 * s, 0.18 * s, 0.17 * s);
    ctx.lineWidth = 0.03 * s;
    ctx.strokeRect(-0.09 * s, my + 0.04 * s, 0.18 * s, 0.17 * s);
  }
}

function drawArm(ctx, a, s, from, to) {
  const color = a.limb;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.lineWidth = 0.38 * s;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.lineWidth = 0.3 * s;
  ctx.strokeStyle = color;
  ctx.stroke();
  ellipse(ctx, to[0], to[1], 0.19 * s, 0.19 * s, color, 0.05 * s);
}

function armTargets(pose, s, t, rope) {
  switch (pose.arms) {
    case 'up': {
      const wave = Math.sin(t * 8) * 0.12 * s;
      return [[0.7 * s, -3.15 * s + wave], [-0.75 * s, -3.1 * s - wave]];
    }
    case 'down':
      return [[0.6 * s, -0.35 * s], [-0.5 * s, -0.4 * s]];
    default:
      return [[rope.x, rope.y - 0.05 * s], [rope.x, rope.y + 0.1 * s]];
  }
}

// ---------- API pública ----------

/**
 * Desenha um personagem.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} animalId
 * @param {number} x posição dos pés (mundo)
 * @param {number} y posição dos pés (mundo)
 * @param {number} s tamanho (px) — a altura total é ~3,1 * s
 * @param {{ facing?: 1|-1, state?: string, t?: number, stateT?: number, rope?: {x:number,y:number} }} opts
 *   `rope` é o ponto da corda em coordenadas do mundo, usado pelos braços.
 */
export function drawCharacter(ctx, animalId, x, y, s, opts = {}) {
  const { facing = 1, state = 'idle', t = 0, stateT = 0, rope = null } = opts;
  const a = getAnimal(animalId);
  const pose = computePose(state, t, stateT);
  const ropeLocal = rope
    ? { x: (rope.x - x) * facing, y: rope.y - y + pose.lift * s }
    : { x: 1.0 * s, y: -1.0 * s };

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  ctx.translate(0, -pose.lift * s);

  // sombra no chão
  ctx.save();
  ctx.translate(0, pose.lift * s);
  ellipse(ctx, 0, 0.02 * s, 0.95 * s, 0.17 * s, 'rgba(0, 60, 20, 0.22)');
  ctx.restore();

  const shoulders = [rotatePoint(0.38 * s, -1.2 * s, pose.lean), rotatePoint(0.05 * s, -1.28 * s, pose.lean)];
  const hands = armTargets(pose, s, t, ropeLocal);

  // corpo inteiro inclina a partir dos pés
  ctx.save();
  ctx.rotate(pose.lean + pose.tilt);
  drawTail(ctx, a, s, pose);
  drawLegs(ctx, a, s, pose);
  drawBody(ctx, a, s, pose);
  if (a.id === 'sapo') drawFrogBumps(ctx, a, s);
  else drawEarsBehind(ctx, a, s);
  ctx.restore();

  // braço de trás, cabeça, braço da frente
  drawArm(ctx, a, s, shoulders[1], hands[1]);
  ctx.save();
  ctx.rotate(pose.lean + pose.tilt);
  drawHead(ctx, a, s);
  drawBlush(ctx, a, s);
  drawEyes(ctx, a, s, pose, t);
  drawNose(ctx, a, s);
  drawMouth(ctx, a, s, pose);
  ctx.restore();
  drawArm(ctx, a, s, shoulders[0], hands[0]);

  ctx.restore();
}

// Desenho do cenário, da corda, dos personagens e das partículas no canvas.
// Tudo é desenhado em pixels CSS; o contexto já vem escalado por devicePixelRatio.

import { drawCharacter } from './characters.js';

const OUTLINE_DARK = '#3b2a20';
const PULL_DURATION = 0.7;
const ROPE_ANIM = 0.55;
const CONFETTI_COLORS = ['#ff4d6d', '#ffb703', '#2ec4b6', '#4361ee', '#9b5de5', '#80ed99'];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Mistura duas cores '#rrggbb' (k = 0 dá `a`, k = 1 dá `b`). */
function mix(a, b, k) {
  const channel = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const rgb = [0, 1, 2].map((i) => Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * k));
  return `rgb(${rgb.join(',')})`;
}

// Estrelas fixas (x e y em frações do céu), sempre as mesmas para não "pularem" a cada quadro.
const STARS = Array.from({ length: 44 }, (_, i) => ({
  x: (Math.sin(i * 12.9898) * 43758.5453) % 1 * 0.5 + 0.5,
  y: (Math.sin(i * 78.233 + 1) * 24634.6345) % 1 * 0.5 + 0.5,
  r: 0.8 + ((i * 7) % 5) * 0.45,
  phase: i * 1.7,
}));
const easeInOutCubic = (k) => (k < 0.5 ? 4 * k * k * k : 1 - ((-2 * k + 2) ** 3) / 2);

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reducedMotion = reducedMotion;
    this.width = 0;
    this.height = 0;
    this.time = 0;
    this.scene = { x: 0, y: 0, w: 0, h: 0 };
    this.ropeFrom = 0;
    this.ropeTo = 0;
    this.ropeT = 1;
    this.pull = [0, 0];
    this.overTime = 0;
    this.goTimer = 0;
    this.lastState = null;
    this.particles = [];
    this.confettiTimer = 0;
    this.noite = 0; // 0 = dia, 1 = noite (o que está desenhado agora)
    this.noiteAlvo = 0; // para onde a noite vai (definido pelo jogo a cada quadro)
    this.clouds = [
      { x: 0.12, y: 0.12, scale: 1, speed: 0.006 },
      { x: 0.45, y: 0.22, scale: 0.7, speed: 0.004 },
      { x: 0.78, y: 0.1, scale: 1.2, speed: 0.008 },
      { x: 0.95, y: 0.3, scale: 0.8, speed: 0.005 },
    ];
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.sky = null;
  }

  /** Área onde o cenário principal (personagens e corda) deve caber. */
  setSceneRect(rect) {
    this.scene = rect;
  }

  /** Dispara uma animação pontual de um lado: 'pull', 'glassesOn' ou 'glassesOff'. */
  trigger(side, type) {
    if (type === 'pull') {
      this.pull[side] = PULL_DURATION;
      if (!this.reducedMotion) this.burstStars(side);
    } else if (type === 'glassesOn' || type === 'glassesOff') {
      if (!this.reducedMotion) this.burstAtHead(side, type === 'glassesOn');
    }
  }

  /** Brilhos (ao pôr os óculos) ou fumacinha (ao tirar) em volta da cabeça. */
  burstAtHead(side, sparkle) {
    const geo = this.lastGeometry;
    if (!geo) return;
    const x = side === 0 ? geo.leftX : geo.rightX;
    const y = geo.groundY - 2.0 * geo.s;
    for (let i = 0; i < (sparkle ? 12 : 8); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = sparkle ? 50 + Math.random() * 90 : 20 + Math.random() * 40;
      this.addParticle({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (sparkle ? 30 : 10),
        rot: 0, vr: 0, size: sparkle ? 4 + Math.random() * 4 : 7 + Math.random() * 6,
        color: sparkle ? '#fff3a0' : 'rgba(255, 255, 255, 0.8)', life: sparkle ? 0.7 : 0.55,
        shape: sparkle ? 'star' : 'circle', gravity: sparkle ? 80 : -20,
      });
    }
  }

  // ---------- partículas ----------

  addParticle(p) {
    if (this.particles.length < 400) this.particles.push(p);
  }

  burstStars(side) {
    const geo = this.lastGeometry;
    if (!geo) return;
    const x = geo.ribbonX;
    const y = geo.ropeY;
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 120;
      this.addParticle({
        x, y, vx: Math.cos(angle) * speed + (side === 0 ? -40 : 40), vy: Math.sin(angle) * speed - 60,
        rot: 0, vr: 0, size: 5 + Math.random() * 5, color: '#ffd23f', life: 0.8, shape: 'star', gravity: 260,
      });
    }
  }

  spawnConfetti(count) {
    for (let i = 0; i < count; i++) {
      this.addParticle({
        x: this.scene.x + Math.random() * this.scene.w,
        y: -10,
        vx: (Math.random() - 0.5) * 80,
        vy: 60 + Math.random() * 120,
        rot: Math.random() * 6,
        vr: this.reducedMotion ? 0 : (Math.random() - 0.5) * 10,
        size: 6 + Math.random() * 6,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        life: 6,
        shape: 'rect',
        gravity: this.reducedMotion ? 10 : 40,
      });
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0 && p.y < this.height + 20);
  }

  drawParticles() {
    const { ctx } = this;
    for (const p of this.particles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = p.color;
      if (p.shape === 'star') {
        this.starPath(p.size);
        ctx.fill();
      } else if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
  }

  starPath(r) {
    const { ctx } = this;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
  }

  // ---------- cenário ----------

  drawBackground(horizon, dt) {
    const { ctx, width, height, noite } = this;
    if (!this.sky || this.skyHorizon !== horizon || this.skyNight !== noite) {
      const g = ctx.createLinearGradient(0, 0, 0, horizon);
      g.addColorStop(0, mix('#4aa8ff', '#0b1640', noite));
      g.addColorStop(1, mix('#bfe9ff', '#2d3f84', noite));
      this.sky = g;
      this.skyHorizon = horizon;
      this.skyNight = noite;
    }
    ctx.fillStyle = this.sky;
    ctx.fillRect(0, 0, width, horizon + 2);
    if (noite > 0) this.drawStars(horizon, noite);
    const sunRadius = clamp(height * 0.07, 24, 60);
    if (noite < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - noite;
      this.drawSun(width * 0.88, height * 0.16, sunRadius);
      ctx.restore();
    }
    if (noite > 0) {
      ctx.save();
      ctx.globalAlpha = noite;
      this.drawMoon(width * 0.88, height * 0.16, sunRadius);
      ctx.restore();
    }
    this.drawClouds(horizon, dt);
    this.drawHills(horizon);
    this.drawGrass(horizon);
  }

  drawStars(horizon, noite) {
    const { ctx, width } = this;
    ctx.fillStyle = '#fffbe0';
    for (const star of STARS) {
      const twinkle = this.reducedMotion ? 1 : 0.7 + 0.3 * Math.sin(this.time * 2 + star.phase);
      ctx.globalAlpha = noite * twinkle;
      ctx.beginPath();
      ctx.arc(star.x * width, star.y * horizon * 0.85, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Lua crescente: um disco claro com um pedaço "mordido" na cor do céu. */
  drawMoon(x, y, r) {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    // a "mordida": o quadrado menos um círculo (regra par-ímpar), para o céu aparecer por trás
    ctx.beginPath();
    ctx.rect(x - r * 2, y - r * 2, r * 4, r * 4);
    ctx.arc(x + r * 0.5, y - r * 0.18, r * 0.88, 0, Math.PI * 2);
    ctx.fillStyle = '#fff4c2';
    ctx.fill('evenodd');
    ctx.restore();
  }

  drawSun(x, y, r) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    if (!this.reducedMotion) ctx.rotate(this.time * 0.1);
    ctx.fillStyle = 'rgba(255, 225, 90, 0.55)';
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.fillRect(-r * 0.12, -r * 1.7, r * 0.24, r * 0.6);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffb703';
    ctx.stroke();
  }

  drawClouds(horizon, dt) {
    const { ctx, width } = this;
    for (const c of this.clouds) {
      if (!this.reducedMotion) c.x = (c.x + c.speed * dt) % 1.2;
      const x = (c.x - 0.1) * width;
      const y = c.y * horizon;
      const u = clamp(horizon * 0.06, 14, 40) * c.scale;
      ctx.fillStyle = `rgba(${Math.round(255 - 95 * this.noite)}, ${Math.round(255 - 80 * this.noite)}, ${Math.round(255 - 40 * this.noite)}, ${0.95 - 0.4 * this.noite})`;
      ctx.beginPath();
      ctx.arc(x, y, u, 0, Math.PI * 2);
      ctx.arc(x + u * 1.1, y - u * 0.5, u * 1.2, 0, Math.PI * 2);
      ctx.arc(x + u * 2.3, y, u * 0.95, 0, Math.PI * 2);
      ctx.rect(x, y, u * 2.3, u * 0.95);
      ctx.fill();
    }
  }

  drawHills(horizon) {
    const { ctx, width } = this;
    const h = clamp(horizon * 0.2, 20, 120);
    ctx.fillStyle = mix('#7ed56f', '#2c6b46', this.noite);
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.bezierCurveTo(width * 0.15, horizon - h * 1.4, width * 0.35, horizon - h * 0.2, width * 0.5, horizon - h * 0.8);
    ctx.bezierCurveTo(width * 0.7, horizon - h * 1.5, width * 0.85, horizon - h * 0.3, width, horizon - h * 0.9);
    ctx.lineTo(width, horizon + 4);
    ctx.lineTo(0, horizon + 4);
    ctx.fill();
  }

  drawGrass(horizon) {
    const { ctx, width, height } = this;
    const g = ctx.createLinearGradient(0, horizon, 0, height);
    g.addColorStop(0, mix('#5cbf4a', '#21593a', this.noite));
    g.addColorStop(1, mix('#3f9b3a', '#173f2a', this.noite));
    ctx.fillStyle = g;
    ctx.fillRect(0, horizon, width, height - horizon);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    const stripe = 70;
    for (let x = -stripe; x < width + stripe; x += stripe * 2) {
      ctx.beginPath();
      ctx.moveTo(x + stripe * 0.3, horizon);
      ctx.lineTo(x + stripe * 1.3, horizon);
      ctx.lineTo(x + stripe * 1.9 - 10, height);
      ctx.lineTo(x - 10, height);
      ctx.fill();
    }
  }

  // ---------- geometria da partida ----------

  computeGeometry(view) {
    const R = this.scene;
    const s = clamp(Math.min(R.h * 0.17, R.w * 0.07), 14, 68);
    const groundY = R.y + R.h * 0.8;
    const cx = R.x + R.w / 2;
    const reach = 1.05 * s;
    const ropeHalf = reach + Math.max(1.4 * s, R.w * 0.09);
    const shiftMax = Math.max(0.6 * s, R.w / 2 - ropeHalf - 2.4 * s);
    const ropeValue = this.ropeShown(view.rope);
    const ribbonX = cx + (ropeValue / view.ropeMax) * shiftMax;
    return {
      s, groundY, cx, reach, ropeHalf, shiftMax, ribbonX,
      ropeY: groundY - 0.95 * s,
      leftX: ribbonX - ropeHalf,
      rightX: ribbonX + ropeHalf,
    };
  }

  ropeShown(target) {
    if (target !== this.ropeTo) {
      this.ropeFrom = this.ropeShownValue ?? this.ropeTo;
      this.ropeTo = target;
      this.ropeT = 0;
    }
    const k = this.ropeT >= 1 ? 1 : easeInOutCubic(this.ropeT);
    this.ropeShownValue = this.ropeFrom + (this.ropeTo - this.ropeFrom) * k;
    return this.ropeShownValue;
  }

  // ---------- partida ----------

  drawField(geo, view) {
    const { ctx } = this;
    const { s, groundY, cx, shiftMax } = geo;
    // marcas de cada passo no chão
    for (let i = -view.ropeMax; i <= view.ropeMax; i++) {
      const x = cx + (i / view.ropeMax) * shiftMax;
      ctx.beginPath();
      ctx.arc(x, groundY + 0.55 * s, Math.max(2, s * 0.07), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill();
    }
    // linha central tracejada
    ctx.save();
    ctx.setLineDash([s * 0.2, s * 0.14]);
    ctx.lineWidth = Math.max(3, s * 0.1);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(cx, groundY - 3.2 * s);
    ctx.lineTo(cx, groundY + 0.8 * s);
    ctx.stroke();
    ctx.restore();
    // marcadores laterais (vitória)
    this.drawGoal(cx - shiftMax, groundY, s, view.players[0].color, 1);
    this.drawGoal(cx + shiftMax, groundY, s, view.players[1].color, -1);
  }

  drawGoal(x, groundY, s, color, dir) {
    const { ctx } = this;
    const top = groundY - 3.0 * s;
    ctx.lineWidth = Math.max(3, s * 0.1);
    ctx.strokeStyle = '#fffaf0';
    ctx.beginPath();
    ctx.moveTo(x, groundY + 0.5 * s);
    ctx.lineTo(x, top);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.strokeStyle = OUTLINE_DARK;
    ctx.lineWidth = Math.max(2, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + dir * s * 1.0, top + s * 0.28);
    ctx.lineTo(x, top + s * 0.56);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  drawRope(geo, view) {
    const { ctx } = this;
    const { s, ropeY, leftX, rightX, reach, ribbonX } = geo;
    const tension = clamp(Math.max(this.pull[0], this.pull[1]) / PULL_DURATION, 0, 1);
    const sag = s * (0.34 - 0.28 * tension);
    const x0 = leftX + reach - 0.25 * s;
    const x1 = rightX - reach + 0.25 * s;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(x0, ropeY);
      ctx.quadraticCurveTo((x0 + x1) / 2, ropeY + sag * 2, x1, ropeY);
    };
    ctx.lineCap = 'round';
    path();
    ctx.lineWidth = Math.max(5, s * 0.24);
    ctx.strokeStyle = '#6b4423';
    ctx.stroke();
    path();
    ctx.lineWidth = Math.max(3, s * 0.17);
    ctx.strokeStyle = '#c9985a';
    ctx.stroke();
    path();
    ctx.setLineDash([s * 0.1, s * 0.22]);
    ctx.lineWidth = Math.max(3, s * 0.17);
    ctx.strokeStyle = '#8a5a2b';
    ctx.stroke();
    ctx.setLineDash([]);
    this.drawRibbon(ribbonX, ropeY + sag, s, view);
  }

  drawRibbon(x, y, s, view) {
    const { ctx } = this;
    const sway = this.reducedMotion ? 0 : Math.sin(this.time * 3) * 0.08;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway);
    ctx.fillStyle = '#e63946';
    ctx.strokeStyle = OUTLINE_DARK;
    ctx.lineWidth = Math.max(2, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, 0);
    ctx.lineTo(s * 0.2, 0);
    ctx.lineTo(s * 0.2, s * 0.95);
    ctx.lineTo(0, s * 0.72);
    ctx.lineTo(-s * 0.2, s * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, s * 0.02, s * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  poseFor(side, view) {
    if (view.state === 'over') {
      if (view.winner === side) return 'cheer';
      return this.overTime < 0.6 ? 'fall' : 'sad';
    }
    return this.pull[side] > 0 ? 'pull' : 'idle';
  }

  drawMatchCharacters(geo, view) {
    const { s, groundY, ropeY, leftX, rightX, reach } = geo;
    const ends = [leftX + reach, rightX - reach];
    const xs = [leftX, rightX];
    for (let side = 0; side < 2; side++) {
      const facing = side === 0 ? 1 : -1;
      const state = this.poseFor(side, view);
      drawCharacter(this.ctx, view.players[side].animal, xs[side], groundY, s, {
        facing, state, t: this.time + side * 0.7, stateT: this.overTime,
        rope: { x: ends[side], y: ropeY }, glasses: Boolean(view.players[side].glasses),
      });
      this.drawNameTag(xs[side], groundY + Math.max(0.55 * s, 16), s, view.players[side]);
    }
    if (view.thinking[1] && view.state === 'playing') {
      this.drawThinkingBubble(rightX, groundY - 3.5 * s, s);
    }
  }

  drawNameTag(x, y, s, player) {
    const { ctx } = this;
    const size = clamp(s * 0.42, 12, 22);
    ctx.font = `800 ${size}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
    const text = this.scene.w < 460 ? player.name : `${player.tag} · ${player.name}`;
    const w = ctx.measureText(text).width + size * 1.2;
    const h = size * 1.6;
    ctx.fillStyle = player.color;
    roundedRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }

  drawThinkingBubble(x, y, s) {
    const { ctx } = this;
    const w = s * 1.7;
    const h = s * 0.95;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = OUTLINE_DARK;
    ctx.lineWidth = Math.max(2, s * 0.05);
    roundedRect(ctx, x - w / 2, y - h, w, h, h / 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - s * 0.15, y + s * 0.18, s * 0.12, 0, Math.PI * 2);
    ctx.arc(x - s * 0.3, y + s * 0.4, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3b2a20';
    for (let i = 0; i < 3; i++) {
      const bounce = this.reducedMotion ? 0 : Math.sin(this.time * 6 - i * 0.8) * s * 0.08;
      ctx.beginPath();
      ctx.arc(x + (i - 1) * s * 0.4, y - h / 2 + bounce, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBigText(text, x, y, size, color) {
    const { ctx } = this;
    const pulse = this.reducedMotion ? 1 : 1 + 0.08 * Math.sin(this.time * 10);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    ctx.font = `900 ${size}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = size * 0.14;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = OUTLINE_DARK;
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  drawMatch(view) {
    const geo = this.computeGeometry(view);
    this.lastGeometry = geo;
    this.drawField(geo, view);
    this.drawRope(geo, view);
    this.drawMatchCharacters(geo, view);
    const R = this.scene;
    const bigSize = clamp(R.h * 0.3, 40, 150);
    if (view.state === 'countdown') {
      this.drawBigText(String(Math.max(1, Math.ceil(view.countdown))), geo.cx, R.y + R.h * 0.3, bigSize, '#ffd23f');
    } else if (this.goTimer > 0) {
      this.drawBigText('JÁ!', geo.cx, R.y + R.h * 0.3, bigSize, '#7CFC00');
    }
  }

  // ---------- resultado e menu ----------

  drawResult(view) {
    const R = this.scene;
    const s = clamp(Math.min(R.h * 0.2, R.w * 0.11), 18, 90);
    const groundY = R.y + R.h * 0.78;
    const winX = R.x + R.w * 0.3;
    const loseX = R.x + R.w * 0.72;
    const winner = view.winner;
    if (winner === null) { // ninguém venceu (online: o amigo saiu): os dois ficam parados
      [[winX, 0, 1], [loseX, 1, -1]].forEach(([x, side, facing]) => {
        drawCharacter(this.ctx, view.players[side].animal, x, groundY, s, {
          facing, state: 'idle', t: this.time + side * 0.7, glasses: Boolean(view.players[side].glasses),
        });
        this.drawNameTag(x, groundY + 0.9 * s, s, view.players[side]);
      });
      return;
    }
    const loser = 1 - winner;
    drawCharacter(this.ctx, view.players[winner].animal, winX, groundY, s * 1.15, {
      facing: 1, state: 'cheer', t: this.time, glasses: Boolean(view.players[winner].glasses),
    });
    drawCharacter(this.ctx, view.players[loser].animal, loseX, groundY, s, {
      facing: -1, state: this.overTime < 0.6 ? 'fall' : 'sad', t: this.time, stateT: this.overTime,
      glasses: Boolean(view.players[loser].glasses),
    });
    this.drawNameTag(winX, groundY + 0.9 * s, s, view.players[winner]);
    this.drawNameTag(loseX, groundY + 0.9 * s, s, view.players[loser]);
  }

  drawMenu(view) {
    const R = this.scene;
    const s = clamp(Math.min(R.h * 0.13, R.w * 0.08), 18, 70);
    const groundY = R.y + R.h * 0.93;
    const [a, b] = view.menuAnimals;
    drawCharacter(this.ctx, a, R.x + R.w * 0.13, groundY, s, { facing: 1, state: 'idle', t: this.time });
    drawCharacter(this.ctx, b, R.x + R.w * 0.87, groundY, s, { facing: -1, state: 'idle', t: this.time + 1.3 });
  }

  // ---------- hora de dormir ----------

  /** "Z z z" subindo devagar da cabeça de quem dorme (parados, com "reduzir movimento"). */
  drawZzz(x, y, s, facing, seed) {
    const { ctx } = this;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const p = this.reducedMotion ? 0.22 + i * 0.3 : ((this.time / 3.4 + i / 3 + seed) % 1);
      const size = s * (0.34 + 0.4 * p);
      const px = x + facing * (p * 0.9 * s + (this.reducedMotion ? 0 : Math.sin(this.time * 1.3 + i + seed * 5) * 0.08 * s));
      const py = y - p * 2.3 * s;
      ctx.globalAlpha = this.reducedMotion ? 0.95 : Math.min(1, Math.sin(p * Math.PI) * 1.6);
      ctx.font = `900 ${size}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
      ctx.lineWidth = size * 0.18;
      ctx.strokeStyle = '#1b2a5c';
      ctx.strokeText('Z', px, py);
      ctx.fillStyle = '#eef2ff';
      ctx.fillText('Z', px, py);
    }
    ctx.restore();
  }

  /**
   * Tela de dormir: os dois bichinhos deitados, um de cada lado do cartão (celular deitado e computador)
   * ou embaixo dele (celular em pé). `view.card` é o retângulo do cartão na tela.
   */
  drawSleep(view) {
    const { width: W, height: H, time } = this;
    const card = view.card ?? { left: W * 0.3, right: W * 0.7, top: H * 0.2, bottom: H * 0.6 };
    const wide = W / H > 1.1;
    const spots = [];
    if (wide) {
      const side = Math.max(60, Math.min(card.left, W - card.right));
      const s = clamp(Math.min(side / 3.3, H * 0.17), 12, 70);
      spots.push({ cx: card.left / 2, s }, { cx: (card.right + W) / 2, s });
      spots.forEach((spot) => { spot.groundY = H * 0.8; });
    } else {
      const free = Math.max(80, H - card.bottom);
      const s = clamp(Math.min(W / 6.8, free * 0.2), 12, 60);
      spots.push({ cx: W * 0.26, s }, { cx: W * 0.74, s });
      spots.forEach((spot) => { spot.groundY = card.bottom + free * 0.66; });
    }
    spots.forEach((spot, side) => {
      const facing = side === 0 ? 1 : -1;
      const { s, groundY } = spot;
      const feetX = spot.cx - facing * 1.4 * s;
      drawCharacter(this.ctx, view.players[side].animal, feetX, groundY, s, {
        facing, state: 'sleep', t: time + side * 1.3,
      });
      this.drawZzz(feetX + facing * 1.9 * s, groundY - 1.6 * s, s, facing, side * 0.37);
    });
  }

  // ---------- quadro ----------

  /**
   * @param {object} view estado visível: mode ('menu'|'plain'|'match'|'result'|'sleep'), rope, ropeMax,
   *   players[{animal,name,tag,color}], thinking[], state, countdown, winner, menuAnimals
   */
  draw(view, dt) {
    this.time += dt;
    this.ropeT = Math.min(1, this.ropeT + dt / (this.reducedMotion ? 0.12 : ROPE_ANIM));
    this.pull[0] = Math.max(0, this.pull[0] - dt);
    this.pull[1] = Math.max(0, this.pull[1] - dt);
    this.goTimer = Math.max(0, this.goTimer - dt);
    if (view.state === 'playing' && this.lastState === 'countdown') this.goTimer = 0.9;
    this.lastState = view.state;
    const over = view.state === 'over' || view.mode === 'result';
    this.overTime = over ? this.overTime + dt : 0;

    // Noite: o jogo manda para onde ela vai; aqui o céu escurece suavemente (de uma vez com "reduzir movimento").
    const alvo = view.mode === 'sleep' ? 1 : this.noiteAlvo;
    if (view.mode === 'sleep') this.noite = 1;
    else if (this.reducedMotion) this.noite = alvo > 0 ? 1 : 0;
    else if (Math.abs(alvo - this.noite) < 0.002) this.noite = alvo;
    else this.noite += (alvo - this.noite) * Math.min(1, dt * 4);

    const horizon = view.mode === 'match' || view.mode === 'result'
      ? this.scene.y + this.scene.h * 0.6
      : this.height * 0.72;
    this.drawBackground(horizon, dt);

    if (view.mode === 'match') this.drawMatch(view);
    else if (view.mode === 'result') this.drawResult(view);
    else if (view.mode === 'menu') this.drawMenu(view);
    else if (view.mode === 'sleep') this.drawSleep(view);

    if (view.mode === 'result' && this.overTime > 0.2) this.maybeConfetti(dt);
    this.updateParticles(dt);
    this.drawParticles();
  }

  maybeConfetti(dt) {
    this.confettiTimer -= dt;
    if (this.confettiTimer > 0) return;
    this.confettiTimer = this.reducedMotion ? 0.8 : 0.06;
    this.spawnConfetti(this.reducedMotion ? 2 : 3);
  }

  /** Reinicia animações ao começar uma nova cena. */
  resetScene(rope = 0) {
    this.ropeFrom = rope;
    this.ropeTo = rope;
    this.ropeT = 1;
    this.ropeShownValue = rope;
    this.pull = [0, 0];
    this.overTime = 0;
    this.goTimer = 0;
    this.lastState = null;
    this.particles = [];
  }
}

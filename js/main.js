// Ponto de entrada: fluxo de telas (menu, configuração, partida, resultado, estatísticas).

import { ANIMALS, ANIMAL_IDS, getAnimal, drawCharacter } from './characters.js';
import { Game, averageTime } from './game.js';
import { CpuPlayer } from './ai.js';
import { Renderer } from './render.js';
import { createKeypad } from './keypad.js';
import { createChoices } from './choices.js';
import { buildHelpModel, fitLayout, drawHelpBoard } from './visual-help.js';
import * as audio from './audio.js';
import * as stats from './stats.js';
import {
  initAnalytics, track, matchProps, finishProps, abandonProps, OP_EVENT_NAMES,
} from './analytics.js';
import {
  OPERATIONS, DIFFICULTIES, OP_SYMBOLS, OP_NAMES, spokenProblem,
} from './problems.js';

const COLORS = ['#1a5fd0', '#d62839'];
const RESULT_DELAY = 1.9; // segundos de comemoração antes da tela de resultado
const MESSAGE_MS = 1500;
const GOOD_MESSAGES = ['Muito bem!', 'Isso aí!', 'Acertou!', 'Mandou bem!', 'Uhuul!'];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const app = {
  screen: 'menu',
  settings: stats.loadSettings(ANIMAL_IDS, DIFFICULTIES),
  stats: stats.loadStats(),
  match: null,
  paused: false,
  dialog: null,
  menuAnimals: ['urso', 'coelho'],
  rotateDismissed: false,
  liveFlip: false,
};

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const renderer = new Renderer($('#stage'), { reducedMotion: reducedMotionQuery.matches });
reducedMotionQuery.addEventListener?.('change', () => {
  renderer.reducedMotion = reducedMotionQuery.matches;
});

// ---------- utilidades ----------

function announce(text) {
  app.liveFlip = !app.liveFlip;
  $('#live').textContent = text + (app.liveFlip ? '​' : '');
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const formatSeconds = (value) => (value > 0 ? `${value.toFixed(1).replace('.', ',')} s` : '—');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const randomItem = (list) => list[Math.floor(Math.random() * list.length)];
const isCpuMode = () => app.settings.mode === 'cpu';

// ---------- telas ----------

function showScreen(name) {
  app.screen = name;
  for (const section of $$('.screen')) section.hidden = section.id !== `screen-${name}`;
  $('#btn-mute').hidden = name === 'match';
  if (name === 'menu') {
    const [a, b] = [...ANIMAL_IDS].sort(() => Math.random() - 0.5);
    app.menuAnimals = [a, b];
  }
  if (name === 'setup') renderSetup();
  if (name === 'stats') renderStats();
  renderer.resetScene(0);
  updateRotateHint();
  layout();
}

function updateRotateHint() {
  const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 800;
  const relevant = app.screen === 'match' || app.screen === 'setup';
  $('#rotate-hint').hidden = !(portrait && relevant && !app.rotateDismissed);
  // Na partida o aviso some sozinho para não cobrir o jogo.
  clearTimeout(updateRotateHint.timer);
  if (app.screen === 'match' && !$('#rotate-hint').hidden) {
    updateRotateHint.timer = setTimeout(() => { app.rotateDismissed = true; updateRotateHint(); }, 5000);
  }
}

function matchSideLayout() {
  return window.innerHeight < 520 && window.innerWidth > window.innerHeight;
}

/** Calcula a região livre para o cenário (fora dos painéis e menus DOM). */
function computeSceneRect() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (app.screen === 'match') {
    const hud = $('.hud').getBoundingClientRect();
    const panels = $$('.panel').map((p) => p.getBoundingClientRect());
    if (panels.length < 2) return { x: 0, y: 0, w: W, h: H };
    if (matchSideLayout()) {
      const x = panels[0].right;
      return { x, y: hud.bottom, w: Math.max(120, panels[1].left - x), h: H - hud.bottom };
    }
    const top = Math.min(...panels.map((r) => r.top));
    return { x: 0, y: hud.bottom, w: W, h: Math.max(100, top - hud.bottom) };
  }
  if (app.screen === 'result') {
    const card = $('.result-card').getBoundingClientRect();
    if (W / H > 1.1) return { x: 0, y: 0, w: Math.max(160, card.left), h: H };
    return { x: 0, y: 0, w: W, h: Math.max(120, card.top) };
  }
  return { x: 0, y: 0, w: W, h: H };
}

function layout() {
  $('#screen-match').classList.toggle('side', matchSideLayout());
  renderer.setSceneRect(computeSceneRect());
}

// ---------- diálogos ----------

function showDialog({ title, text, buttons }) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const box = $('#dialog-buttons');
    box.replaceChildren();
    setText($('#dialog-title'), title);
    setText($('#dialog-text'), text);
    const close = (value) => {
      $('#dialog').hidden = true;
      app.dialog = null;
      previousFocus?.focus?.();
      resolve(value);
    };
    buttons.forEach((b) => {
      const button = make('button', `btn ${b.className}`, b.label);
      button.type = 'button';
      button.setAttribute('aria-label', b.label);
      button.addEventListener('click', () => close(b.value));
      box.appendChild(button);
    });
    app.dialog = { cancel: () => close(buttons[0].value) };
    $('#dialog').hidden = false;
    box.firstElementChild.focus();
  });
}

async function openPauseMenu({ title, text, resumeLabel, quitLabel }) {
  if (app.screen !== 'match' || app.paused) return;
  app.paused = true;
  const choice = await showDialog({
    title,
    text,
    buttons: [
      { label: resumeLabel, value: 'resume', className: 'btn-green' },
      { label: quitLabel, value: 'quit', className: 'btn-red' },
    ],
  });
  app.paused = false;
  if (choice === 'quit') {
    trackAbandon();
    app.match = null;
    showScreen('menu');
  }
}

const pauseGame = () => openPauseMenu({
  title: 'Jogo pausado', text: 'O jogo está esperando por você.', resumeLabel: 'Continuar', quitLabel: 'Sair',
});
const quitGame = () => openPauseMenu({
  title: 'Sair da partida?', text: 'Você vai perder o progresso desta partida.', resumeLabel: 'Continuar jogando', quitLabel: 'Sim, sair',
});

// ---------- configuração ----------

function normalizeSettings() {
  const s = app.settings;
  if (s.p1 === s.p2) s.p2 = ANIMAL_IDS.find((id) => id !== s.p1);
}

function persistSettings() {
  normalizeSettings();
  stats.saveSettings(app.settings);
}

function buildCards() {
  for (const slot of ['p1', 'p2']) {
    const grid = $(`#cards-${slot}`);
    for (const animal of ANIMALS) {
      const card = make('button', 'char-card');
      card.type = 'button';
      card.dataset.animal = animal.id;
      card.dataset.slot = slot;
      card.append(make('canvas'), make('span', '', animal.name));
      grid.appendChild(card);
    }
  }
}

function drawCardThumb(card, selected) {
  const canvas = $('canvas', card);
  const size = 88;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const facing = card.dataset.slot === 'p1' ? 1 : -1;
  drawCharacter(ctx, card.dataset.animal, size / 2, size - 6, 24, {
    facing, state: selected ? 'cheer' : 'idle', t: 0,
  });
}

function renderCards() {
  const s = app.settings;
  const twoPlayers = s.mode === '2p';
  for (const card of $$('.char-card')) {
    const slot = card.dataset.slot;
    const id = card.dataset.animal;
    const selected = s[slot] === id;
    const other = slot === 'p1' ? s.p2 : s.p1;
    const blocked = twoPlayers && !selected && other === id;
    const name = getAnimal(id).name;
    const owner = slot === 'p1' ? 'Jogador 1' : 'Jogador 2';
    card.setAttribute('aria-pressed', String(selected));
    card.setAttribute('aria-disabled', String(blocked));
    card.setAttribute('aria-label', blocked ? `${name}, já escolhido pelo outro jogador` : `${name}, ${owner}`);
    drawCardThumb(card, selected);
  }
}

const usesChoices = (difficulty) => difficulty === 'facil';

const DIFF_HINTS = {
  facil: 'Fácil: toque na resposta certa entre 4 opções.',
  medio: 'Médio: digite a resposta no teclado.',
  dificil: 'Difícil: digite a resposta no teclado, com números maiores.',
};

function renderSetup() {
  const s = app.settings;
  setText($('#diff-hint'), DIFF_HINTS[s.difficulty]);
  $$('#opt-mode .chip').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === s.mode)));
  $$('#opt-diff .chip').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === s.difficulty)));
  $$('#opt-ops .chip').forEach((b) => b.setAttribute('aria-pressed', String(s.ops.includes(b.dataset.value))));
  $('#field-p2').hidden = isCpuMode();
  $('#cpu-hint').hidden = !isCpuMode();
  setText($('#lbl-p1'), isCpuMode() ? 'Escolha o seu bichinho' : 'Jogador 1: escolha seu bichinho');
  renderCards();
}

function flashOpsHint() {
  const small = $('#lbl-ops small');
  setText(small, '(precisa de pelo menos uma!)');
  announce('Deixe pelo menos uma operação marcada.');
  clearTimeout(flashOpsHint.timer);
  flashOpsHint.timer = setTimeout(() => setText(small, '(escolha uma ou mais)'), 1800);
}

function onSetupClick(event) {
  const s = app.settings;
  const chip = event.target.closest('.chip');
  const card = event.target.closest('.char-card');
  if (chip) {
    const group = chip.parentElement.id;
    const { value } = chip.dataset;
    if (group === 'opt-mode') s.mode = value;
    else if (group === 'opt-diff') s.difficulty = value;
    else if (group === 'opt-ops') {
      if (s.ops.includes(value)) {
        if (s.ops.length === 1) { flashOpsHint(); return; }
        s.ops = s.ops.filter((o) => o !== value);
      } else {
        s.ops = OPERATIONS.filter((o) => o === value || s.ops.includes(o));
      }
    }
  } else if (card) {
    if (card.getAttribute('aria-disabled') === 'true') {
      announce('Esse bichinho já foi escolhido pelo outro jogador.');
      return;
    }
    s[card.dataset.slot] = card.dataset.animal;
    announce(`${getAnimal(card.dataset.animal).name} escolhido.`);
  } else {
    return;
  }
  persistSettings();
  renderSetup();
}

// ---------- partida ----------

/** `input`: 'keypad' (digitar), 'choices' (4 opções) ou null (computador). */
function buildPanel(side, info, input) {
  const human = input !== null;
  const root = make('div', `panel${human ? '' : ' is-cpu'}`);
  root.dataset.side = String(side);
  root.style.setProperty('--accent', info.color);
  const head = make('div', 'panel-head');
  const name = make('span', 'panel-name');
  name.append(make('span', '', info.tag), make('span', 'panel-animal', ` · ${info.name}`));
  const score = make('span', 'panel-score', 'Acertos: 0');
  const glassesButton = human ? makeGlassesButton(side, info.tag) : null;
  head.append(...[name, glassesButton, score].filter(Boolean));
  const display = make('div', 'display');
  const problem = make('span', 'problem-text');
  const equals = make('span', '', '=');
  const answer = make('span', `answer-box${human ? '' : ' is-cpu'}`);
  display.append(problem, equals, answer);
  const msg = make('div', 'msg');
  root.append(head, display, msg);
  const panel = {
    side, root, problem, answer, msg, score, msgUntil: 0, keypad: null, choices: null, note: null,
    glassesButton, board: null, boardKey: null,
  };
  if (human) {
    panel.board = make('canvas', 'help-board');
    panel.board.hidden = true;
    panel.board.setAttribute('aria-hidden', 'true');
    root.appendChild(panel.board);
  }
  if (input === 'choices') {
    panel.choices = createChoices({
      playerLabel: info.tag,
      onChoose: (index) => perform(side, 'choose', index),
    });
    root.appendChild(panel.choices.element);
  } else if (input === 'keypad') {
    panel.keypad = createKeypad({
      playerLabel: info.tag,
      onDigit: (d) => perform(side, 'digit', d),
      onErase: () => perform(side, 'erase'),
      onSubmit: () => perform(side, 'submit'),
    });
    root.appendChild(panel.keypad.element);
  } else {
    panel.note = make('div', 'cpu-note', '');
    root.appendChild(panel.note);
  }
  return panel;
}

const GLASSES_ICON = '<svg viewBox="0 0 48 20" aria-hidden="true" focusable="false">'
  + '<circle cx="12" cy="11" r="8" fill="rgba(190,230,255,.5)" stroke="currentColor" stroke-width="3"/>'
  + '<circle cx="36" cy="11" r="8" fill="rgba(190,230,255,.5)" stroke="currentColor" stroke-width="3"/>'
  + '<path d="M20 9 Q24 5 28 9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';

function makeGlassesButton(side, tag) {
  const button = make('button', 'glasses-btn');
  button.type = 'button';
  button.innerHTML = `${GLASSES_ICON}<span>Óculos</span>`;
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', `Óculos: mostrar a conta em blocos, ${tag}`);
  // pointerdown: os dois jogadores podem tocar ao mesmo tempo (como nos teclados).
  button.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    perform(side, 'glasses');
  });
  button.addEventListener('click', (event) => {
    if (event.detail === 0) perform(side, 'glasses');
  });
  return button;
}

/** Desenha a lousinha do jogador quando a conta (ou o tamanho) muda. */
function updateBoard(panel, player) {
  const show = Boolean(player.glasses && player.problem);
  panel.board.hidden = !show;
  if (!show) return;
  const { board } = panel;
  const w = board.clientWidth;
  const h = board.clientHeight;
  const key = `${player.problem.text}|${w}x${h}`;
  if (key === panel.boardKey || !w || !h) return;
  panel.boardKey = key;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  board.width = Math.round(w * dpr);
  board.height = Math.round(h * dpr);
  const ctx = board.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawHelpBoard(ctx, w, h, fitLayout(buildHelpModel(player.problem, app.settings.difficulty), w, h));
  board.classList.remove('pop');
  void board.offsetWidth; // reinicia a animação de entrada
  board.classList.add('pop');
}

function playerInfo(cpuMode, p1, p2) {
  return [
    { animal: p1, name: getAnimal(p1).name, tag: cpuMode ? 'Você' : 'Jogador 1', color: COLORS[0] },
    { animal: p2, name: getAnimal(p2).name, tag: cpuMode ? 'Computador' : 'Jogador 2', color: COLORS[1] },
  ];
}

function startMatch() {
  const s = app.settings;
  const cpuMode = isCpuMode();
  const p2 = cpuMode ? randomItem(ANIMAL_IDS.filter((id) => id !== s.p1)) : s.p2;
  const info = playerInfo(cpuMode, s.p1, p2);
  const choices = usesChoices(s.difficulty);
  const game = new Game({
    ops: s.ops, difficulty: s.difficulty, choices, onEvent: handleGameEvent,
  });
  const cpu = cpuMode ? new CpuPlayer(s.difficulty) : null;
  const input = choices ? 'choices' : 'keypad';
  const panels = [buildPanel(0, info[0], input), buildPanel(1, info[1], cpuMode ? null : input)];
  $('#panels').replaceChildren(...panels.map((p) => p.root));
  app.match = {
    game, cpu, info, panels, cpuMode, choices, resultTimer: null, recorded: false,
    startedAt: performance.now(), glassesCount: 0, reported: false,
    eventProps: matchProps(s, cpuMode, input, s.p1),
  };
  track('partida_iniciada', app.match.eventProps);
  app.paused = false;
  showScreen('match');
  announce(`Partida começando. ${info[0].tag} contra ${info[1].tag}.`);
}

// ---------- estatísticas anônimas ----------

const humanPlayers = (m) => (m.cpuMode ? [m.game.players[0]] : m.game.players);
const elapsedSeconds = (m) => (performance.now() - m.startedAt) / 1000;

/** Partida interrompida (Sair ou fechar a página) antes de terminar. */
function trackAbandon(beacon = false) {
  const m = app.match;
  if (!m || m.reported || m.game.state === 'over') return;
  m.reported = true;
  track('partida_abandonada', abandonProps(m.eventProps, humanPlayers(m), elapsedSeconds(m)), { beacon });
}

function trackFinish(winner) {
  const m = app.match;
  m.reported = true;
  track('partida_terminada', finishProps(m.eventProps, humanPlayers(m), {
    winner, seconds: elapsedSeconds(m), glassesActivations: m.glassesCount,
  }));
}

function whoName(side) {
  return app.match.info[side].tag;
}

function setMessage(side, text, kind) {
  const panel = app.match.panels[side];
  setText(panel.msg, text);
  panel.msg.className = `msg ${kind}`;
  panel.msgUntil = performance.now() + MESSAGE_MS;
}

function humanSides() {
  return app.match.cpuMode ? [0] : [0, 1];
}

function handleGameEvent(type, payload) {
  const m = app.match;
  if (!m) return;
  const handlers = {
    start: () => announce('Valendo! Resolva as contas!'),
    problem: () => onProblem(payload),
    correct: () => onCorrect(payload),
    wrong: () => onWrong(payload),
    reveal: () => onReveal(payload),
    win: () => onWin(payload),
    glasses: () => onGlasses(payload),
  };
  handlers[type]?.();
}

function onProblem({ side, problem }) {
  // Só anuncia a conta no modo contra o computador (em 2 jogadores seria confuso).
  if (side === 0 && app.match.cpuMode) announce(`Conta: ${spokenProblem(problem)}`);
}

function recordHumanAnswer(side, payload, correct) {
  if (!humanSides().includes(side)) return;
  stats.recordAnswer(app.stats, {
    op: payload.problem.op, correct, seconds: payload.seconds, streak: payload.streak, glasses: payload.glasses,
  });
  stats.saveStats(app.stats);
}

function onCorrect(payload) {
  const { side } = payload;
  audio.playSfx('correct');
  audio.playSfx('pull');
  renderer.trigger(side, 'pull');
  setMessage(side, randomItem(GOOD_MESSAGES), 'good');
  announce(`${whoName(side)} acertou!`);
  recordHumanAnswer(side, payload, true);
}

function onWrong(payload) {
  const { side } = payload;
  audio.playSfx('wrong');
  const panel = app.match.panels[side];
  panel.root.classList.remove('shake');
  void panel.root.offsetWidth; // reinicia a animação
  panel.root.classList.add('shake');
  setMessage(side, 'Tente de novo!', 'bad');
  announce(`${whoName(side)} errou. Tente de novo!`);
  recordHumanAnswer(side, payload, false);
}

function onGlasses({ side, on }) {
  const m = app.match;
  if (on) {
    m.glassesCount += 1;
    const op = m.game.players[side].problem?.op;
    track('oculos_ligados', { nivel: app.settings.difficulty, op: OP_EVENT_NAMES[op] });
  }
  const panel = m.panels[side];
  panel.glassesButton?.setAttribute('aria-pressed', String(on));
  panel.boardKey = null;
  audio.playSfx(on ? 'glassesOn' : 'glassesOff');
  renderer.trigger(side, on ? 'glassesOn' : 'glassesOff');
  announce(on ? `${whoName(side)} pôs os óculos. A conta aparece em blocos.` : `${whoName(side)} tirou os óculos.`);
}

function onReveal({ side, answer }) {
  setMessage(side, `A resposta era ${answer}`, 'bad');
  announce(`A resposta era ${answer}.`);
}

function onWin({ side }) {
  const m = app.match;
  audio.playSfx('win');
  m.resultTimer = RESULT_DELAY;
  announce(`${whoName(side)} venceu a partida!`);
  stats.recordMatch(app.stats, { mode: app.settings.mode, humanWon: side === 0 });
  stats.saveStats(app.stats);
  trackFinish(side);
}

function perform(side, type, digit) {
  const m = app.match;
  if (!m || app.screen !== 'match' || app.paused) return;
  if (m.cpuMode && side === 1) return;
  const { game } = m;
  if (type === 'glasses') {
    if (game.state !== 'over') game.toggleGlasses(side);
  } else if (type === 'choose') {
    const value = game.players[side].choices?.[digit];
    if (value !== undefined) game.choose(side, value);
  } else if (type === 'digit') {
    if (game.typeDigit(side, digit)) audio.playSfx('click');
  } else if (type === 'erase') {
    game.erase(side);
  } else if (type === 'submit') {
    game.submit(side);
  }
}

function updatePanels(now) {
  const m = app.match;
  const { game } = m;
  for (const panel of m.panels) {
    const player = game.players[panel.side];
    const reveal = player.reveal;
    setText(panel.problem, player.problem ? player.problem.text : '');
    const typed = reveal ? String(reveal.answer) : player.input;
    let shown = typed;
    if (!typed) shown = panel.note && m.cpu?.thinking ? '…' : '?';
    setText(panel.answer, shown);
    panel.answer.classList.toggle('is-reveal', Boolean(reveal));
    setText(panel.score, `Acertos: ${player.correct}`);
    panel.keypad?.setEnabled(game.canInput(panel.side));
    panel.choices?.update(player.choices, player.eliminated, game.canInput(panel.side));
    if (panel.board) updateBoard(panel, player);
    if (panel.note) setText(panel.note, cpuNote(m.cpu));
    if (panel.msgUntil && now > panel.msgUntil) {
      panel.msgUntil = 0;
      setText(panel.msg, '');
    }
  }
}

function cpuNote(cpu) {
  if (cpu.phase === 'thinking') return 'Pensando…';
  if (cpu.phase === 'typing' || cpu.phase === 'confirming') return 'Digitando…';
  return 'Preparando…';
}

// ---------- resultado ----------

function showResult() {
  const m = app.match;
  const { game, info } = m;
  const winner = game.winner;
  const title = m.cpuMode
    ? (winner === 0 ? 'Você venceu! Parabéns!' : 'O computador venceu desta vez!')
    : `${info[winner].tag} venceu! Parabéns!`;
  setText($('#result-title'), title);
  const rows = game.players.map((player, side) => {
    const tr = make('tr', winner === side ? 'is-winner' : '');
    const label = make('td');
    const dot = make('span', 'tag');
    dot.style.background = info[side].color;
    label.append(dot, document.createTextNode(`${info[side].tag} · ${info[side].name}`));
    tr.append(
      label,
      make('td', '', String(player.correct)),
      make('td', '', String(player.wrong)),
      make('td', '', formatSeconds(averageTime(player))),
    );
    return tr;
  });
  $('#result-rows').replaceChildren(...rows);
  showScreen('result');
  announce(title);
  $('#screen-result [data-action="again"]').focus();
}

// ---------- estatísticas ----------

function renderStats() {
  const st = app.stats;
  const tile = (value, label) => {
    const node = make('div', 'tile');
    node.append(make('b', '', value), make('span', '', label));
    return node;
  };
  $('#stats-tiles').replaceChildren(
    tile(String(st.matches), 'Partidas jogadas'),
    tile(String(st.winsVsCpu), 'Vitórias contra o computador'),
    tile(String(st.bestStreak), 'Melhor sequência de acertos'),
    tile(formatSeconds(stats.averageTime(st)), 'Tempo médio de resposta'),
    tile(String(st.glasses.correct + st.glasses.wrong), 'Respostas de óculos'),
  );
  const rows = OPERATIONS.map((op) => {
    const { correct, wrong } = st.byOp[op];
    const percent = stats.accuracyPercent(correct, wrong);
    const row = make('div', 'op-row');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', `${OP_NAMES[op]}: ${plural(correct, 'acerto', 'acertos')}, ${plural(wrong, 'erro', 'erros')}, ${percent} por cento`);
    const bar = make('div', 'bar');
    bar.setAttribute('aria-hidden', 'true');
    const fill = make('i');
    fill.style.width = `${percent}%`;
    bar.appendChild(fill);
    const info = make('div', 'op-info', `${OP_NAMES[op]}: ${plural(correct, 'acerto', 'acertos')} · ${plural(wrong, 'erro', 'erros')} · ${percent}%`);
    info.setAttribute('aria-hidden', 'true');
    row.append(make('div', 'op-sym', OP_SYMBOLS[op]), bar, info);
    return row;
  });
  $('#stats-ops').replaceChildren(...rows);
}

async function resetStats() {
  const choice = await showDialog({
    title: 'Zerar estatísticas?',
    text: 'Isso apaga todos os seus acertos, erros e vitórias. Não dá para desfazer.',
    buttons: [
      { label: 'Cancelar', value: 'cancel', className: 'btn-gray' },
      { label: 'Sim, zerar', value: 'reset', className: 'btn-red' },
    ],
  });
  if (choice !== 'reset') return;
  app.stats = stats.resetStats();
  track('estatisticas_zeradas');
  renderStats();
  announce('Estatísticas zeradas.');
}

// ---------- som ----------

function renderMute() {
  const muted = audio.isMuted();
  for (const button of [$('#btn-mute'), $('#btn-mute-hud')]) {
    button.setAttribute('aria-pressed', String(muted));
    button.setAttribute('aria-label', muted ? 'Ligar o som' : 'Desligar o som');
    button.textContent = muted ? 'Mudo' : 'Som';
  }
}

// ---------- teclado físico ----------

/**
 * 1 jogador: linha de números/Backspace/Enter (e também o teclado numérico) controlam o jogador.
 * 2 jogadores: linha de números/Backspace/Enter = esquerda; teclado numérico
 * (Numpad0-9, NumpadEnter, NumpadDecimal para apagar) = direita.
 * Múltipla escolha (Fácil): as teclas 1-4 escolhem a opção, com a mesma divisão de lados.
 */
function keyToAction(event, twoPlayers, choices) {
  const { code } = event;
  if (choices) {
    const match = /^(Digit|Numpad)([1-4])$/.exec(code);
    if (!match) return null;
    const side = match[1] === 'Numpad' && twoPlayers ? 1 : 0;
    return { side, type: 'choose', digit: Number(match[2]) - 1 };
  }
  if (code.startsWith('Numpad')) {
    const side = twoPlayers ? 1 : 0;
    if (/^Numpad\d$/.test(code)) return { side, type: 'digit', digit: code.slice(6) };
    if (code === 'NumpadEnter') return { side, type: 'submit' };
    if (code === 'NumpadDecimal') return { side, type: 'erase' };
    return null;
  }
  if (/^Digit\d$/.test(code)) return { side: 0, type: 'digit', digit: code.slice(5) };
  if (code === 'Backspace') return { side: 0, type: 'erase' };
  if (code === 'Enter') return { side: 0, type: 'submit' };
  return null;
}

function onKeyDown(event) {
  audio.unlockAudio();
  if (app.dialog) {
    if (event.key === 'Escape') app.dialog.cancel();
    return;
  }
  if (app.screen !== 'match' || !app.match || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    pauseGame();
    return;
  }
  const action = keyToAction(event, !app.match.cpuMode, app.match.choices);
  if (!action) return;
  event.preventDefault();
  if (!event.repeat || action.type === 'erase') perform(action.side, action.type, action.digit);
}

// ---------- laço principal ----------

const withGlasses = (m) => m.info.map((p, i) => ({ ...p, glasses: m.game.players[i].glasses }));

function buildView() {
  const m = app.match;
  if (app.screen === 'match' && m) {
    const { game } = m;
    return {
      mode: 'match',
      rope: game.rope,
      ropeMax: game.ropeMax,
      players: withGlasses(m),
      thinking: [false, Boolean(m.cpu?.thinking)],
      state: game.state,
      countdown: game.countdownLeft,
      winner: game.winner,
    };
  }
  if (app.screen === 'result' && m) {
    return { mode: 'result', players: withGlasses(m), winner: m.game.winner, state: 'over' };
  }
  if (app.screen === 'menu') return { mode: 'menu', menuAnimals: app.menuAnimals, state: 'idle' };
  return { mode: 'plain', state: 'idle' };
}

function stepMatch(dt, now) {
  const m = app.match;
  if (!m || app.screen !== 'match' || app.paused) return;
  m.game.tick(dt);
  m.cpu?.update(dt, m.game);
  updatePanels(now);
  if (m.resultTimer !== null) {
    m.resultTimer -= dt;
    if (m.resultTimer <= 0) {
      m.resultTimer = null;
      showResult();
    }
  }
}

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  stepMatch(dt, now);
  renderer.draw(buildView(), dt);
  requestAnimationFrame(frame);
}

// ---------- inicialização ----------

function onAction(action) {
  const handlers = {
    'play-cpu': () => { app.settings.mode = 'cpu'; persistSettings(); showScreen('setup'); },
    'play-2p': () => { app.settings.mode = '2p'; persistSettings(); showScreen('setup'); },
    stats: () => showScreen('stats'),
    menu: () => { app.match = null; showScreen('menu'); },
    start: startMatch,
    again: () => {
      track('revanche', { modo: app.settings.mode, nivel: app.settings.difficulty });
      startMatch();
    },
    'reset-stats': resetStats,
  };
  handlers[action]?.();
}

function init() {
  buildCards();
  normalizeSettings();
  document.addEventListener('click', (event) => {
    audio.unlockAudio();
    if (event.target.closest('.btn, .chip, .char-card')) audio.playSfx('click');
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) onAction(actionButton.dataset.action);
  });
  document.addEventListener('pointerdown', () => audio.unlockAudio());
  $('#screen-setup').addEventListener('click', onSetupClick);
  $('#btn-pause').addEventListener('click', pauseGame);
  $('#btn-quit').addEventListener('click', quitGame);
  $('#btn-rotate-ok').addEventListener('click', () => { app.rotateDismissed = true; updateRotateHint(); });
  for (const id of ['#btn-mute', '#btn-mute-hud']) {
    $(id).addEventListener('click', () => { audio.toggleMuted(); renderMute(); });
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('pagehide', () => trackAbandon(true));
  window.addEventListener('resize', () => { renderer.resize(); updateRotateHint(); layout(); });
  window.addEventListener('orientationchange', () => { renderer.resize(); updateRotateHint(); layout(); });
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(layout);
    observer.observe($('#panels'));
    observer.observe($('.result-card'));
    observer.observe($('.hud'));
  }
  renderMute();
  initAnalytics();
  showScreen('menu');
  requestAnimationFrame((t) => { lastFrame = t; frame(t); });
}

init();

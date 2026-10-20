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
  salaCriadaProps, salaErroProps,
} from './analytics.js';
import { createRng } from './rng.js';
import {
  conectar, wsUrl, servidorDaUrl, salaValida, pinDaUrl, conviteUrl, conviteTexto, erroTexto,
  PROTOCOLO_VERSAO, PIN_TAMANHO,
} from './online.js';
import {
  OPERATIONS, DIFFICULTIES, DIFFICULTY_LABELS, OP_SYMBOLS, OP_NAMES, spokenProblem,
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
  setupOnline: false, // a tela de configuração está no modo "criar sala"
  online: null, // sala online em andamento (ver "duelo online")
  joinPin: '', // dígitos do PIN na tela "Entrar com PIN"
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
  if (name === 'lobby') renderLobby();
  if (name === 'join') renderJoin();
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
    if (panels.length === 0) return { x: 0, y: 0, w: W, h: H };
    if (panels.length === 1) { // online: só o painel de "você"
      if (matchSideLayout()) {
        return { x: panels[0].right, y: hud.bottom, w: Math.max(120, W - panels[0].right), h: H - hud.bottom };
      }
      return { x: 0, y: hud.bottom, w: W, h: Math.max(100, panels[0].top - hud.bottom) };
    }
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

const pauseGame = () => {
  if (app.match?.remote) return quitOnline(); // não existe pausa online
  return openPauseMenu({
    title: 'Jogo pausado', text: 'O jogo está esperando por você.', resumeLabel: 'Continuar', quitLabel: 'Sair',
  });
};
const quitGame = () => {
  if (app.match?.remote) return quitOnline();
  return openPauseMenu({
    title: 'Sair da partida?', text: 'Você vai perder o progresso desta partida.', resumeLabel: 'Continuar jogando', quitLabel: 'Sim, sair',
  });
};

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
  for (const slot of ['p1', 'p2', 'guest']) {
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
  const facing = card.dataset.slot === 'p2' ? -1 : 1;
  drawCharacter(ctx, card.dataset.animal, size / 2, size - 6, 24, {
    facing, state: selected ? 'cheer' : 'idle', t: 0,
  });
}

function renderCards() {
  const s = app.settings;
  const twoPlayers = s.mode === '2p' && !app.setupOnline;
  for (const card of $$('#screen-setup .char-card')) {
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
  const online = app.setupOnline;
  $('#field-mode').hidden = online;
  $('#field-p2').hidden = online || isCpuMode();
  $('#cpu-hint').hidden = online || !isCpuMode();
  setText($('#setup-title'), online ? 'Criar sala' : 'Prepare o duelo');
  setText($('#lbl-p1'), online || isCpuMode() ? 'Escolha o seu bichinho' : 'Jogador 1: escolha seu bichinho');
  const start = $('#btn-setup-start');
  start.dataset.action = online ? 'online-create-go' : 'start';
  setText(start, online ? 'Criar sala' : 'Começar!');
  start.setAttribute('aria-label', online ? 'Criar a sala' : 'Começar a partida');
  const back = $('#btn-setup-back');
  back.dataset.action = online ? 'online' : 'menu';
  back.setAttribute('aria-label', online ? 'Voltar' : 'Voltar ao menu');
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
  drawHelpBoard(ctx, w, h, fitLayout(buildHelpModel(player.problem, app.match.game.difficulty), w, h));
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
  prepareMatchScreen(false);
  showScreen('match');
  announce(`Partida começando. ${info[0].tag} contra ${info[1].tag}.`);
}

/** Ajusta a tela da partida para o modo online (sem pausa, só o painel de "você") ou o normal. */
function prepareMatchScreen(remote) {
  $('#screen-match').classList.toggle('online', remote);
  $('#btn-pause').hidden = remote;
  $$('.friend-tag').forEach((node) => node.remove());
}

// ---------- estatísticas anônimas ----------

const humanPlayers = (m) => (m.cpuMode || m.remote ? [m.game.players[0]] : m.game.players);
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
  return app.match.cpuMode || app.match.remote ? [0] : [0, 1];
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
    end: () => onEnd(),
  };
  handlers[type]?.();
}

function onProblem({ side, problem }) {
  // Só anuncia a conta no modo contra o computador (em 2 jogadores seria confuso).
  if (app.match.remote && side === 0) app.match.problemIndex += 1;
  if (side === 0 && (app.match.cpuMode || app.match.remote)) announce(`Conta: ${spokenProblem(problem)}`);
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
  if (app.match.remote) sendOnline('acertei', { n: app.match.problemIndex });
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
  if (app.match.remote) sendOnline('errei', { n: app.match.problemIndex });
}

function onGlasses({ side, on }) {
  const m = app.match;
  if (on) {
    m.glassesCount += 1;
    const op = m.game.players[side].problem?.op;
    track('oculos_ligados', { nivel: m.game.difficulty, op: OP_EVENT_NAMES[op] });
  }
  const panel = m.panels[side];
  panel.glassesButton?.setAttribute('aria-pressed', String(on));
  panel.boardKey = null;
  audio.playSfx(on ? 'glassesOn' : 'glassesOff');
  renderer.trigger(side, on ? 'glassesOn' : 'glassesOff');
  announce(on ? `${whoName(side)} pôs os óculos. A conta aparece em blocos.` : `${whoName(side)} tirou os óculos.`);
  if (m.remote) sendOnline('oculos', { on });
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
  stats.recordMatch(app.stats, { mode: m.remote ? 'online' : app.settings.mode, humanWon: side === 0 });
  stats.saveStats(app.stats);
  trackFinish(side);
}

/** Partida encerrada sem vencedor (online: o amigo saiu). */
function onEnd() {
  const m = app.match;
  m.resultTimer = 0.5;
  trackFinish(null);
}

function perform(side, type, digit) {
  const m = app.match;
  if (!m || app.screen !== 'match' || app.paused) return;
  if ((m.cpuMode || m.remote) && side === 1) return;
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
    if (panel.friend) { updateFriendTag(panel, game, now); continue; }
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
  let title;
  if (m.remote) {
    if (winner === null) title = erroTexto('saiu');
    else title = winner === 0 ? 'Você venceu! Parabéns!' : 'Seu amigo venceu desta vez!';
  } else if (m.cpuMode) {
    title = winner === 0 ? 'Você venceu! Parabéns!' : 'O computador venceu desta vez!';
  } else {
    title = `${info[winner].tag} venceu! Parabéns!`;
  }
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
  renderResultButtons();
  announce(title);
  ($('#btn-again').hidden ? $('#screen-result [data-action="menu"]') : $('#btn-again')).focus();
}

/** Botão "Jogar de novo" (ou "Revanche", online) e o aviso sobre o amigo. */
function renderResultButtons() {
  const m = app.match;
  const again = $('#btn-again');
  const note = $('#result-note');
  if (!m?.remote) {
    again.hidden = false;
    again.disabled = false;
    again.dataset.action = 'again';
    setText(again, 'Jogar de novo');
    again.setAttribute('aria-label', 'Jogar de novo');
    note.hidden = true;
    return;
  }
  const o = app.online;
  const gone = !o || o.friendLeft || !o.conn?.aberta();
  again.dataset.action = 'online-rematch';
  setText(again, 'Revanche');
  again.setAttribute('aria-label', 'Pedir revanche ao seu amigo');
  again.hidden = gone;
  again.disabled = Boolean(o?.wantRematch);
  let text = '';
  if (gone) text = erroTexto('saiu');
  else if (o.wantRematch) text = 'Esperando seu amigo…';
  else if (o.friendWantsRematch) text = 'Seu amigo quer revanche!';
  note.hidden = text === '';
  if (note.textContent !== text) {
    setText(note, text);
    if (text) announce(text);
  }
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
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (app.screen === 'join') { onJoinKey(event); return; }
  if (app.screen !== 'match' || !app.match) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    pauseGame();
    return;
  }
  const action = keyToAction(event, !app.match.cpuMode && !app.match.remote, app.match.choices);
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
  if (app.screen === 'lobby') drawLobby(now / 1000);
  renderer.draw(buildView(), dt);
  requestAnimationFrame(frame);
}

// ---------- duelo online ----------
// Lado local: "você" é sempre o lado 0 (esquerda, azul) nos dois aparelhos. O servidor numera
// os lados pelo papel na sala (0 = anfitrião, 1 = convidado), então o convidado inverte a corda.

const serverBase = () => servidorDaUrl(globalThis.location?.search ?? '', globalThis.location?.hostname ?? '');

function sendOnline(type, fields) {
  app.online?.conn?.enviar(type, fields);
}

/** Fecha a conexão (sem avisar callbacks) e esquece a sala. */
function leaveOnline() {
  const o = app.online;
  app.online = null;
  o?.conn?.fechar();
}

function openRoomConnection(role, { pin = null, inicial }) {
  leaveOnline();
  const o = {
    role, pin, voce: null, sala: null, conn: null, myAnimal: app.settings.p1, ready: false,
    friendLeft: false, wantRematch: false, friendWantsRematch: false,
  };
  app.online = o;
  const current = () => app.online === o;
  o.conn = conectar({
    url: wsUrl(serverBase(), { pin }),
    inicial: { t: inicial.t, campos: { v: PROTOCOLO_VERSAO, ...inicial.campos } },
    onMensagem: (msg) => { if (current()) onServerMessage(msg); },
    onFalha: () => { if (current()) onConnectionLost(); },
    onFechou: () => { if (current()) onConnectionLost(); },
  });
  return o;
}

function createRoom() {
  const s = app.settings;
  openRoomConnection('host', {
    inicial: { t: 'criar', campos: { ops: s.ops, nivel: s.difficulty, bichinho: s.p1 } },
  });
  showScreen('lobby');
}

function joinRoom() {
  if (app.joinPin.length !== PIN_TAMANHO || app.online) return;
  openRoomConnection('guest', {
    pin: app.joinPin,
    inicial: { t: 'entrar', campos: { bichinho: app.settings.p1 } },
  });
  renderJoin();
}

/** Mostra o erro com o diálogo de sempre e volta ao menu online. */
async function showOnlineError(codigo, { report = true } = {}) {
  if (report) track('sala_erro', salaErroProps(codigo));
  if (app.match && !app.match.reported && app.match.game.state !== 'over') trackAbandon();
  leaveOnline();
  app.dialog?.cancel();
  app.match = null;
  showScreen('online');
  announce(erroTexto(codigo));
  await showDialog({
    title: 'Ops!',
    text: erroTexto(codigo),
    buttons: [{ label: 'Entendi', value: 'ok', className: 'btn-blue' }],
  });
}

function onConnectionLost() {
  const o = app.online;
  if (o?.friendLeft) { // a sala fechou porque o amigo saiu: sem alarde
    if (app.screen === 'result') renderResultButtons();
    return;
  }
  showOnlineError('conexao');
}

function onServerMessage(msg) {
  const handlers = {
    sala: onSala,
    contagem: startOnlineMatch,
    corda: onRope,
    errou: onFriendWrong,
    oculos: onFriendGlasses,
    fim: onServerFinish,
    revanche: onFriendRematch,
    saiu: onFriendLeft,
    erro: onServerError,
  };
  handlers[msg.t]?.(msg);
}

const otherAnimal = (...taken) => ANIMAL_IDS.find((id) => !taken.includes(id));

function chooseGuestAnimal(id) {
  const o = app.online;
  o.myAnimal = id;
  app.settings.p1 = id;
  persistSettings();
  sendOnline('bichinho', { bichinho: id });
}

function onSala(msg) {
  const o = app.online;
  if (!salaValida(msg)) {
    showOnlineError('mensagem-invalida');
    return;
  }
  const first = !o.sala;
  const before = o.sala;
  o.sala = msg;
  o.voce = msg.voce;
  o.pin = msg.pin ?? o.pin;
  if (first) {
    if (o.role === 'host') track('sala_criada', salaCriadaProps(app.settings));
    else track('sala_entrou', { nivel: msg.nivel });
  }
  if (o.role === 'host') {
    if (app.screen !== 'lobby') return;
    if (msg.jogadores[1] && !before?.jogadores?.[1]) {
      audio.playSfx('join');
      announce('Seu amigo entrou na sala!');
    }
    renderLobby();
    return;
  }
  if (app.screen !== 'join') return;
  const host = msg.jogadores[0];
  if (first && host && o.myAnimal === host.bichinho) chooseGuestAnimal(otherAnimal(host.bichinho));
  renderJoin();
  if (first) announce('Você entrou na sala! Escolha seu bichinho e toque em Estou pronto.');
}

function onServerError(msg) {
  const o = app.online;
  if (msg.codigo === 'bichinho-igual' && o) {
    const taken = o.sala?.jogadores?.[0]?.bichinho ?? o.myAnimal;
    const next = otherAnimal(taken, o.myAnimal);
    if (o.sala) {
      chooseGuestAnimal(next);
      renderJoin();
    } else { // o servidor recusou o "entrar": tenta de novo com outro bichinho
      o.myAnimal = next;
      o.conn.enviar('entrar', { v: PROTOCOLO_VERSAO, bichinho: next });
    }
    announce(erroTexto('bichinho-igual'));
    return;
  }
  showOnlineError(msg.codigo);
}

// ----- sala de espera (anfitrião) -----

function fillPin(box, digits, placeholder = '') {
  while (box.children.length < PIN_TAMANHO) box.appendChild(make('span', 'pin-digit'));
  [...box.children].forEach((node, i) => {
    setText(node, digits[i] ?? placeholder);
    node.classList.toggle('is-empty', !digits[i]);
    node.classList.toggle('is-next', !placeholder && i === digits.length);
  });
}

function renderLobby() {
  const o = app.online;
  const sala = o?.sala;
  const pin = sala?.pin ?? '';
  const box = $('#lobby-pin');
  fillPin(box, pin, '•');
  box.setAttribute('aria-label', pin ? `PIN da sala: ${pin.split('').join(' ')}` : 'Criando a sala');
  const host = sala?.jogadores?.[0];
  const friend = sala?.jogadores?.[1];
  setText($('#slot-host-name'), host ? getAnimal(host.bichinho).name : '');
  setText($('#slot-guest-name'), friend
    ? `${getAnimal(friend.bichinho).name}${friend.pronto ? ' · pronto!' : ''}`
    : 'Esperando seu amigo…');
  $('#slot-guest').classList.toggle('is-here', Boolean(friend));
  $('#btn-invite').disabled = !pin;
  $('#btn-lobby-start').disabled = !(friend?.pronto && sala.estado === 'espera');
  if (friend && !friend.pronto) $('#lobby-title').dataset.hint = 'friend-choosing';
}

function fitCanvas(canvas, size) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (canvas.width !== size * dpr) {
    canvas.width = size * dpr;
    canvas.height = size * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  return ctx;
}

function drawLobby(seconds) {
  const sala = app.online?.sala;
  const size = 132;
  const host = sala?.jogadores?.[0];
  const friend = sala?.jogadores?.[1];
  let ctx = fitCanvas($('canvas', $('#slot-host')), size);
  if (host) drawCharacter(ctx, host.bichinho, size / 2, size - 8, 36, { facing: 1, state: 'idle', t: seconds });
  ctx = fitCanvas($('canvas', $('#slot-guest')), size);
  if (friend) {
    drawCharacter(ctx, friend.bichinho, size / 2, size - 8, 36, {
      facing: -1, state: friend.pronto ? 'cheer' : 'idle', t: seconds + 0.7,
    });
  } else {
    ctx.font = '900 96px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#2b1f3a';
    ctx.fillStyle = '#ffd23f';
    const bob = Math.sin(seconds * 3) * 4;
    ctx.strokeText('?', size / 2, size / 2 + bob);
    ctx.fillText('?', size / 2, size / 2 + bob);
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = make('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

async function inviteFriend() {
  const pin = app.online?.sala?.pin;
  if (!pin) return;
  const url = conviteUrl(globalThis.location.href, pin);
  const note = $('#invite-note');
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Duelo de Contas', text: conviteTexto(pin), url });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return; // a criança fechou a folha de compartilhar
    }
  }
  const copied = await copyText(url);
  setText(note, copied ? 'Link copiado!' : `Passe o PIN ${pin.split('').join(' ')} para o seu amigo.`);
  announce(note.textContent);
}

// ----- entrar com PIN (convidado) -----

function initJoinKeypad() {
  const pad = createKeypad({
    playerLabel: 'PIN',
    onDigit: (d) => typePin(d),
    onErase: () => erasePin(),
    onSubmit: joinRoom,
  });
  $('#join-keypad-slot').appendChild(pad.element);
  app.joinKeypad = pad;
}

function typePin(digit) {
  if (app.online || app.joinPin.length >= PIN_TAMANHO) return;
  app.joinPin += digit;
  audio.playSfx('click');
  renderJoin();
}

function erasePin() {
  if (app.online || app.joinPin === '') return;
  app.joinPin = app.joinPin.slice(0, -1);
  renderJoin();
}

function onJoinKey(event) {
  const o = app.online;
  if (o?.sala) return;
  if (/^\d$/.test(event.key)) {
    event.preventDefault();
    typePin(event.key);
  } else if (event.key === 'Backspace') {
    event.preventDefault();
    erasePin();
  } else if (event.key === 'Enter' && !event.target.closest?.('button')) {
    event.preventDefault();
    joinRoom();
  }
}

const opsText = (ops) => OPERATIONS.filter((op) => ops.includes(op)).map((op) => OP_SYMBOLS[op]).join(' ');

function renderJoin() {
  const o = app.online;
  const sala = o?.sala;
  $('#join-pin-stage').hidden = Boolean(sala);
  $('#join-room-stage').hidden = !sala;
  const status = $('#join-status');
  status.hidden = !(o && !sala);
  setText(status, 'Entrando na sala…');
  if (!sala) {
    fillPin($('#join-pin'), app.joinPin);
    $('#join-pin').setAttribute('aria-label', app.joinPin
      ? `PIN digitado: ${app.joinPin.split('').join(' ')}` : 'Nenhum número digitado');
    $('#btn-join-go').disabled = app.joinPin.length !== PIN_TAMANHO || Boolean(o);
    app.joinKeypad?.setEnabled(!o);
    return;
  }
  setText($('#join-room-info'),
    `Sala do seu amigo · Operações: ${opsText(sala.ops)} · ${DIFFICULTY_LABELS[sala.nivel]}`);
  const hostAnimal = sala.jogadores[0]?.bichinho;
  for (const card of $$('#cards-guest .char-card')) {
    const id = card.dataset.animal;
    const selected = o.myAnimal === id;
    const blocked = id === hostAnimal || (o.ready && !selected);
    const name = getAnimal(id).name;
    card.setAttribute('aria-pressed', String(selected));
    card.setAttribute('aria-disabled', String(blocked));
    card.setAttribute('aria-label', id === hostAnimal ? `${name}, já escolhido pelo seu amigo` : name);
    drawCardThumb(card, selected);
  }
  $('#join-wait').hidden = !o.ready;
  $('#btn-ready').hidden = o.ready;
}

function onGuestCardClick(event) {
  const card = event.target.closest('.char-card');
  const o = app.online;
  if (!card || !o?.sala || o.ready) return;
  if (card.getAttribute('aria-disabled') === 'true') {
    announce('Esse bichinho já foi escolhido pelo seu amigo.');
    return;
  }
  chooseGuestAnimal(card.dataset.animal);
  announce(`${getAnimal(card.dataset.animal).name} escolhido.`);
  renderJoin();
}

function readyToPlay() {
  const o = app.online;
  if (!o?.sala || o.ready) return;
  o.ready = true;
  sendOnline('pronto');
  renderJoin();
  announce('Esperando seu amigo começar…');
}

/** Link de convite (?pin=482913): abre direto em "Entrar com PIN" com os dígitos preenchidos. */
function openFromInviteLink() {
  const pin = pinDaUrl(globalThis.location.search);
  if (!pin) return;
  app.joinPin = pin;
  showScreen('join');
  try {
    const url = new URL(globalThis.location.href);
    url.searchParams.delete('pin');
    globalThis.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {
    // sem history: o PIN fica na barra de endereço, sem problema
  }
  $('#btn-join-go').focus();
}

// ----- partida online -----

function buildFriendTag(info) {
  const root = make('div', 'friend-tag');
  root.style.setProperty('--accent', info.color);
  const name = make('b', 'friend-name', info.tag);
  name.append(make('span', 'friend-animal', ` · ${info.name}`));
  const score = make('span', 'friend-score', 'Acertos: 0');
  const status = make('span', 'friend-status', 'preparando…');
  root.append(name, score, status);
  return {
    side: 1, friend: true, root, score, status, msgUntil: 0,
  };
}

function flashFriend(text, kind) {
  const panel = app.match.panels[1];
  setText(panel.status, text);
  panel.status.className = `friend-status ${kind}`;
  panel.msgUntil = performance.now() + MESSAGE_MS;
}

function updateFriendTag(panel, game, now) {
  setText(panel.score, `Acertos: ${game.players[1].correct}`);
  if (panel.msgUntil && now > panel.msgUntil) panel.msgUntil = 0;
  if (panel.msgUntil) return;
  const idle = { playing: 'pensando…', countdown: 'preparando…' }[game.state] ?? '';
  setText(panel.status, idle);
  panel.status.className = 'friend-status';
}

function startOnlineMatch(msg) {
  const o = app.online;
  const sala = o?.sala;
  if (!sala || !sala.jogadores[0] || !sala.jogadores[1]) return;
  if (app.screen === 'match' && app.match && app.match.game.state !== 'over') return;
  app.dialog?.cancel();
  const mine = sala.jogadores[o.voce];
  const theirs = sala.jogadores[1 - o.voce];
  const choices = usesChoices(sala.nivel);
  const input = choices ? 'choices' : 'keypad';
  const info = [
    { animal: mine.bichinho, name: getAnimal(mine.bichinho).name, tag: 'Você', color: COLORS[0] },
    { animal: theirs.bichinho, name: getAnimal(theirs.bichinho).name, tag: 'Seu amigo', color: COLORS[1] },
  ];
  const game = new Game({
    ops: sala.ops,
    difficulty: sala.nivel,
    choices,
    remoteRope: true,
    rng: createRng(msg.semente), // só o jogador local consome o gerador: as contas saem iguais nos dois aparelhos
    countdown: msg.segundos ?? 3,
    onEvent: handleGameEvent,
  });
  prepareMatchScreen(true);
  const panels = [buildPanel(0, info[0], input), buildFriendTag(info[1])];
  $('#panels').replaceChildren(panels[0].root);
  $('#screen-match').appendChild(panels[1].root);
  o.wantRematch = false;
  o.friendWantsRematch = false;
  app.match = {
    game, cpu: null, info, panels, cpuMode: false, remote: true, choices, resultTimer: null, recorded: false,
    startedAt: performance.now(), glassesCount: 0, reported: false, problemIndex: -1,
    eventProps: matchProps({ difficulty: sala.nivel, ops: sala.ops }, 'online', input, mine.bichinho),
  };
  track('partida_iniciada', app.match.eventProps);
  app.paused = false;
  showScreen('match');
  announce('Partida começando. Você contra seu amigo.');
}

function onRope(msg) {
  const m = app.match;
  const o = app.online;
  if (!m?.remote || m.game.state === 'over') return;
  m.game.setRope(o.voce === 0 ? msg.valor : -msg.valor);
  if (Array.isArray(msg.acertos)) m.game.players[1].correct = msg.acertos[1 - o.voce] ?? 0;
  if (msg.lado !== o.voce) { // acerto do amigo (o meu já animou na hora)
    audio.playSfx('pull');
    renderer.trigger(1, 'pull');
    flashFriend('Acertou!', 'good');
    announce('Seu amigo acertou!');
  }
}

function onFriendWrong(msg) {
  const m = app.match;
  if (!m?.remote || msg.lado === app.online.voce) return;
  m.game.players[1].wrong += 1;
  flashFriend('Errou!', 'bad');
}

function onFriendGlasses(msg) {
  const m = app.match;
  if (!m?.remote || msg.lado === app.online.voce) return;
  m.game.players[1].glasses = Boolean(msg.on);
  audio.playSfx(msg.on ? 'glassesOn' : 'glassesOff');
  renderer.trigger(1, msg.on ? 'glassesOn' : 'glassesOff');
  announce(msg.on ? 'Seu amigo pôs os óculos.' : 'Seu amigo tirou os óculos.');
}

function onServerFinish(msg) {
  const m = app.match;
  const o = app.online;
  if (!m?.remote) return;
  app.dialog?.cancel();
  if (msg.motivo === 'saiu') o.friendLeft = true;
  const winner = msg.vencedor === null || msg.vencedor === undefined ? null : (msg.vencedor === o.voce ? 0 : 1);
  m.game.finish(winner);
}

function onFriendRematch(msg) {
  const o = app.online;
  if (msg.lado === o.voce) return;
  o.friendWantsRematch = true;
  if (app.screen === 'result') renderResultButtons();
}

function onFriendLeft() {
  const o = app.online;
  if (app.screen === 'lobby') { // o convidado saiu; a sala continua aberta
    announce(erroTexto('saiu'));
    renderLobby();
  } else if (app.screen === 'join') { // o anfitrião saiu: a sala fechou
    showOnlineError('saiu', { report: false });
  } else if (app.screen === 'match' && app.match?.remote) {
    o.friendLeft = true;
    app.dialog?.cancel();
    app.match.game.finish(null);
  } else if (app.screen === 'result') {
    o.friendLeft = true;
    renderResultButtons();
  }
}

function requestRematch() {
  const o = app.online;
  if (!o || o.wantRematch || o.friendLeft) return;
  o.wantRematch = true;
  sendOnline('revanche');
  track('revanche', { modo: 'online', nivel: o.sala?.nivel });
  renderResultButtons();
}

/** "Sair" na partida online: pede confirmação e fecha a conexão (não existe pausa). */
async function quitOnline() {
  const m = app.match;
  if (!m?.remote || app.screen !== 'match' || m.game.state === 'over' || app.dialog) return;
  const choice = await showDialog({
    title: 'Sair da partida?',
    text: 'Seu amigo vai ficar sem adversário.',
    buttons: [
      { label: 'Continuar jogando', value: 'resume', className: 'btn-green' },
      { label: 'Sim, sair', value: 'quit', className: 'btn-red' },
    ],
  });
  if (choice !== 'quit' || app.match !== m || app.screen !== 'match' || m.game.state === 'over') return;
  trackAbandon();
  leaveOnline();
  app.match = null;
  showScreen('menu');
}

// ---------- inicialização ----------

function onAction(action) {
  const handlers = {
    'play-cpu': () => { app.setupOnline = false; app.settings.mode = 'cpu'; persistSettings(); showScreen('setup'); },
    'play-2p': () => { app.setupOnline = false; app.settings.mode = '2p'; persistSettings(); showScreen('setup'); },
    stats: () => showScreen('stats'),
    menu: () => { leaveOnline(); app.setupOnline = false; app.match = null; showScreen('menu'); },
    online: () => { leaveOnline(); app.setupOnline = false; app.match = null; showScreen('online'); },
    'online-create': () => { leaveOnline(); app.setupOnline = true; showScreen('setup'); },
    'online-create-go': createRoom,
    'online-join': () => { leaveOnline(); app.joinPin = ''; showScreen('join'); },
    'online-join-go': joinRoom,
    'online-ready': readyToPlay,
    'online-start': () => sendOnline('comecar'),
    'online-invite': inviteFriend,
    'online-leave': () => { leaveOnline(); showScreen('online'); },
    'online-rematch': requestRematch,
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
  $('#cards-guest').addEventListener('click', onGuestCardClick);
  initJoinKeypad();
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
  openFromInviteLink();
  requestAnimationFrame((t) => { lastFrame = t; frame(t); });
}

init();

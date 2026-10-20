// Estatísticas anônimas de uso (PostHog) — ver .github/posthog.mcp.md e termos.html.
// Nada aqui identifica pessoas: sem identify, sem cookies, sem texto livre nas propriedades.
// Se o PostHog não carregar (bloqueador, rede), o jogo funciona exatamente igual.

import { getStorage, safeGet, safeSet } from './stats.js';

export const OPTOUT_KEY = 'duelo-de-contas:analytics-optout:v1';
export const VISITS_KEY = 'duelo-de-contas:visitas:v1';
const POSTHOG_TOKEN = 'phc_qFezYEtjW2X7Xbc34GHFf34NWEDpVojsQzRCJ2RRY4Qd';
const SCRIPT_URL = '/e/static/array.js';

/** Nomes fixos das operações nos eventos. */
export const OP_EVENT_NAMES = {
  add: 'soma', sub: 'subtracao', mul: 'multiplicacao', div: 'divisao',
};

const POSTHOG_CONFIG = {
  api_host: '/e',
  ui_host: 'https://us.posthog.com',
  persistence: 'memory',
  person_profiles: 'identified_only',
  autocapture: false,
  capture_pageview: true,
  capture_pageleave: true,
  disable_session_recording: true,
  disable_surveys: true,
  enable_heatmaps: false,
  capture_dead_clicks: false,
};

// Métodos que a fila temporária aceita enquanto o array.js ainda não chegou.
const STUB_METHODS = [
  'capture', 'register', 'register_once', 'unregister', 'reset', 'opt_out_capturing',
  'opt_in_capturing', 'startSessionRecording', 'stopSessionRecording', 'on', 'onFeatureFlags',
  'isFeatureEnabled', 'getFeatureFlag',
];

let active = false;

// ---------- opt-out ----------

export function isOptedOut(storage = getStorage()) {
  return safeGet(OPTOUT_KEY, storage) === '1';
}

export function setOptOut(value, storage = getStorage()) {
  safeSet(OPTOUT_KEY, value ? '1' : '0', storage);
}

// ---------- decisões puras ----------

/** Só envia dados em http(s) fora do localhost (ou com ?analytics=1), sem opt-out nem GPC. */
export function shouldEnable({
  protocol = '', hostname = '', search = '', optedOut = false, gpc = false,
}) {
  if (optedOut || gpc) return false;
  if (protocol !== 'http:' && protocol !== 'https:') return false;
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  return !local || new URLSearchParams(search).get('analytics') === '1';
}

const pad = (n) => String(n).padStart(2, '0');

/** Datas locais ('YYYY-MM-DD' e 'YYYY-MM'); guardamos só isso, nunca um identificador. */
export function dayKeys(now = new Date()) {
  const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  return { day: `${month}-${pad(now.getDate())}`, month };
}

/** Decide quais eventos de visita enviar e qual registro guardar. */
export function visitEvents(record, now = new Date()) {
  const { day, month } = dayKeys(now);
  const known = Boolean(record) && typeof record === 'object' && record.first === true;
  const events = [];
  if (!known) events.push('primeira_visita');
  if (!known || record.day !== day) events.push('visita_dia');
  if (!known || record.month !== month) events.push('visita_mes');
  return { events, record: { first: true, day, month } };
}

function loadVisitRecord(storage) {
  try {
    return JSON.parse(safeGet(VISITS_KEY, storage));
  } catch {
    return null;
  }
}

// ---------- propriedades dos eventos (só números, booleanos e valores fixos) ----------

const round1 = (value) => Math.round(value * 10) / 10;

export function matchProps(settings, cpuMode, input, animal) {
  const props = {
    modo: cpuMode ? 'cpu' : '2p',
    nivel: settings.difficulty,
    entrada: input === 'choices' ? 'opcoes' : 'teclado',
  };
  for (const [op, name] of Object.entries(OP_EVENT_NAMES)) {
    props[`op_${name}`] = settings.ops.includes(op);
  }
  props.bichinho = animal;
  return props;
}

/** Soma acertos e erros dos jogadores humanos, no total e por operação. */
function tally(players) {
  const total = { acertos: 0, erros: 0 };
  const times = [];
  for (const name of Object.values(OP_EVENT_NAMES)) {
    total[`acertos_${name}`] = 0;
    total[`erros_${name}`] = 0;
  }
  for (const player of players) {
    total.acertos += player.correct;
    total.erros += player.wrong;
    times.push(...player.times);
    for (const [op, name] of Object.entries(OP_EVENT_NAMES)) {
      total[`acertos_${name}`] += player.byOp[op]?.correct ?? 0;
      total[`erros_${name}`] += player.byOp[op]?.wrong ?? 0;
    }
  }
  const mean = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  return { total, mean };
}

/** Propriedades de `partida_abandonada`. `humans`: jogadores humanos da partida. */
export function abandonProps(base, humans, seconds) {
  const { total } = tally(humans);
  return {
    ...base, duracao_s: Math.round(seconds), acertos: total.acertos, erros: total.erros,
  };
}

/**
 * Propriedades de `partida_terminada`. `humans`: jogadores humanos (1 contra o
 * computador, 2 em 2 jogadores). `winner`: lado vencedor (0 ou 1).
 */
export function finishProps(base, humans, { winner, seconds, glassesActivations = 0 }) {
  const { total, mean } = tally(humans);
  let resultado;
  if (base.modo === 'cpu') resultado = winner === 0 ? 'vitoria' : 'derrota';
  else resultado = winner === 0 ? 'vencedor_j1' : 'vencedor_j2';
  return {
    ...base,
    resultado,
    duracao_s: Math.round(seconds),
    ...total,
    tempo_medio_s: round1(mean),
    usou_oculos: glassesActivations > 0,
    ativacoes_oculos: glassesActivations,
  };
}

// ---------- PostHog ----------

/** Fila temporária no estilo do snippet oficial: o array.js reaproveita o que for enfileirado. */
function installStub(win) {
  if (win.posthog) return;
  const stub = [];
  stub.__SV = 1;
  stub._i = [];
  stub.init = (token, config, name) => { stub._i.push([token, config, name]); };
  for (const method of STUB_METHODS) {
    stub[method] = (...args) => { stub.push([method, ...args]); };
  }
  win.posthog = stub;
}

function loadScript(doc) {
  const script = doc.createElement('script');
  script.async = true;
  script.src = SCRIPT_URL;
  doc.head.appendChild(script);
}

function sendVisits() {
  const storage = getStorage();
  const { events, record } = visitEvents(loadVisitRecord(storage));
  events.forEach((event) => track(event));
  safeSet(VISITS_KEY, JSON.stringify(record), storage);
}

export function initAnalytics() {
  try {
    const loc = globalThis.location;
    if (!loc || active) return;
    const enabled = shouldEnable({
      protocol: loc.protocol,
      hostname: loc.hostname,
      search: loc.search,
      optedOut: isOptedOut(),
      gpc: globalThis.navigator?.globalPrivacyControl === true,
    });
    if (!enabled) return;
    installStub(globalThis);
    globalThis.posthog.init(POSTHOG_TOKEN, { ...POSTHOG_CONFIG });
    loadScript(globalThis.document);
    active = true;
    sendVisits();
  } catch {
    active = false; // estatísticas nunca podem atrapalhar o jogo
  }
}

/** Envia um evento anônimo. `beacon: true` serve para a hora de fechar a página. */
export function track(event, props = {}, { beacon = false } = {}) {
  if (!active) return;
  try {
    const options = beacon ? { transport: 'sendBeacon' } : undefined;
    globalThis.posthog?.capture(event, props, options);
  } catch {
    // ignorado: o jogo segue normalmente
  }
}

export const isActive = () => active;

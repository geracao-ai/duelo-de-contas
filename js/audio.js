// Sons sintetizados com WebAudio (sem arquivos). O AudioContext só nasce
// depois de um gesto do usuário (política de autoplay dos navegadores).

import { safeGet, safeSet } from './stats.js';

const MUTE_KEY = 'duelo-de-contas:muted:v1';
const MUSIC_VOLUME = 0.05;
const SFX_VOLUME = 0.22;
const BPM = 126;
const EIGHTH = 60 / BPM / 2;
const LOOKAHEAD = 0.35;

let ctx = null;
let sfxGain = null;
let musicGain = null;
let muted = safeGet(MUTE_KEY) === '1';
let musicTimer = null;
let nextNoteTime = 0;
let step = 0;

const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

// Melodia alegre em Dó maior: 4 compassos de 8 colcheias (null = pausa).
const MELODY = [
  72, 76, 79, 76, 72, 76, 79, 84,
  77, 81, 84, 81, 77, 81, 79, 77,
  79, 83, 86, 83, 79, 83, 74, 79,
  76, 72, 76, 79, 72, null, 72, null,
];
const BASS = [48, 53, 55, 48]; // uma fundamental por compasso

function createContext() {
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) return null;
  const context = new Ctor();
  sfxGain = context.createGain();
  sfxGain.gain.value = muted ? 0 : SFX_VOLUME;
  sfxGain.connect(context.destination);
  musicGain = context.createGain();
  musicGain.gain.value = muted ? 0 : MUSIC_VOLUME;
  musicGain.connect(context.destination);
  return context;
}

/** Chame dentro de um gesto do usuário (clique, toque, tecla). */
export function unlockAudio() {
  try {
    if (!ctx) ctx = createContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    startMusic();
  } catch {
    ctx = null;
  }
}

function tone(freq, start, duration, { type = 'sine', gain = 0.8, slideTo = null, out = sfxGain } = {}) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(env);
  env.connect(out);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

const SFX = {
  correct(t) {
    [72, 76, 79, 84].forEach((m, i) => tone(midiToHz(m), t + i * 0.07, 0.16, { type: 'triangle' }));
  },
  wrong(t) {
    tone(midiToHz(60), t, 0.18, { type: 'triangle', gain: 0.6 });
    tone(midiToHz(55), t + 0.15, 0.28, { type: 'triangle', gain: 0.6 });
  },
  pull(t) {
    tone(180, t, 0.28, { type: 'sawtooth', gain: 0.25, slideTo: 340 });
    tone(120, t + 0.05, 0.22, { type: 'square', gain: 0.12, slideTo: 90 });
  },
  win(t) {
    [72, 76, 79, 84, 79, 84, 88].forEach((m, i) => {
      tone(midiToHz(m), t + i * 0.13, i === 6 ? 0.7 : 0.2, { type: 'triangle' });
    });
  },
  click(t) {
    tone(880, t, 0.07, { type: 'square', gain: 0.25 });
  },
};

/** Toca um efeito: 'correct' | 'wrong' | 'pull' | 'win' | 'click'. */
export function playSfx(name) {
  if (!ctx || muted || !SFX[name]) return;
  try {
    SFX[name](ctx.currentTime + 0.01);
  } catch {
    // sem áudio, sem problema
  }
}

function scheduleMusic() {
  if (!ctx) return;
  // Se o timer atrasou (aba em segundo plano), pula as notas perdidas em vez de tocar tudo de uma vez.
  if (nextNoteTime < ctx.currentTime) nextNoteTime = ctx.currentTime + 0.05;
  while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
    const note = MELODY[step % MELODY.length];
    if (muted) {
      // mudo: só avança o compasso, sem criar osciladores
    } else if (note !== null) {
      tone(midiToHz(note), nextNoteTime, EIGHTH * 0.9, { type: 'triangle', gain: 0.55, out: musicGain });
    }
    if (!muted && step % 4 === 0) {
      const root = BASS[Math.floor(step / 8) % BASS.length];
      const pitch = step % 8 === 0 ? root : root + 7;
      tone(midiToHz(pitch), nextNoteTime, EIGHTH * 3.4, { type: 'sine', gain: 0.7, out: musicGain });
    }
    nextNoteTime += EIGHTH;
    step += 1;
  }
}

export function startMusic() {
  if (!ctx || musicTimer) return;
  nextNoteTime = ctx.currentTime + 0.1;
  musicTimer = setInterval(scheduleMusic, 100);
  scheduleMusic();
}

export function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = Boolean(value);
  safeSet(MUTE_KEY, muted ? '1' : '0');
  if (sfxGain) sfxGain.gain.value = muted ? 0 : SFX_VOLUME;
  if (musicGain) musicGain.gain.value = muted ? 0 : MUSIC_VOLUME;
}

export function toggleMuted() {
  setMuted(!muted);
  return muted;
}

// Economiza bateria: suspende o áudio quando a aba fica escondida.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });
}

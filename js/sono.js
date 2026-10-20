// Hora de dormir: o jogo anoitece aos 10 minutos de uso e os bichinhos dormem aos 15.
// Módulo PURO (sem DOM): o relógio e o armazenamento são injetáveis, então os testes controlam o tempo.
// Só conta o tempo com o jogo visível; o que fica guardado no aparelho é { ativoMs, ultimoUso, dormiuEm }.

import { getStorage, safeGet, safeSet } from './stats.js';

export const SONO_KEY = 'duelo-de-contas:sono:v1';

const MIN = 60 * 1000;

export const LIMITES_NORMAIS = {
  noiteMs: 10 * MIN, // anoitece
  dormirMs: 15 * MIN, // os bichinhos vão dormir
  sonoMs: 60 * MIN, // duração do sono
  pausaMs: 60 * MIN, // sem jogar por esse tempo: o contador volta a zero
  rampaMs: 20 * 1000, // o céu escurece aos poucos nesse tempo
  passoMaxMs: 5000, // maior intervalo entre dois `tick` que ainda conta como tempo de jogo
};

/** Tempos de teste (`?sono=rapido`): anoitece em 10 s, dorme aos 15 s e acorda 30 s depois. */
export const LIMITES_RAPIDOS = {
  ...LIMITES_NORMAIS, noiteMs: 10 * 1000, dormirMs: 15 * 1000, sonoMs: 30 * 1000, pausaMs: 30 * 1000, rampaMs: 2000,
};

/** `?sono=rapido` só vale em localhost: em produção um link não pode mudar o tempo de tela. */
export function limitesDaUrl(search = '', hostname = '') {
  if (!/^(localhost|127\.0\.0\.1)$/.test(hostname)) return LIMITES_NORMAIS;
  return new URLSearchParams(search).get('sono') === 'rapido' ? LIMITES_RAPIDOS : LIMITES_NORMAIS;
}

const numero = (v) => (Number.isFinite(v) && v >= 0 ? v : null);

function carregar(storage) {
  try {
    const raw = JSON.parse(safeGet(SONO_KEY, storage));
    if (raw && typeof raw === 'object') {
      return { ativoMs: numero(raw.ativoMs) ?? 0, ultimoUso: numero(raw.ultimoUso), dormiuEm: numero(raw.dormiuEm) };
    }
  } catch {
    // guardado estragado: começa do zero
  }
  return { ativoMs: 0, ultimoUso: null, dormiuEm: null };
}

const maiorOuNulo = (a, b) => (a === null ? b : b === null ? a : Math.max(a, b));
const SINCRONIA_MS = 500; // de quanto em quanto tempo `fase()` relê o que outra aba guardou

/**
 * Estados: `dia` e `noite` (pelo tempo jogado); `dormindo` a partir dos 15 min. A hora do sono (`dormiuEm`)
 * só começa quando a tela de dormir aparece de fato (`deitar()`): até lá a fase já é `dormindo`, o que
 * impede novas partidas, mas a partida em andamento pode terminar e a hora de acordar conta a partir daí.
 * Várias abas: o que está guardado é lido de novo a cada `tick` e MESCLADO (maiores valores), nunca apenas
 * sobrescrito, para uma aba velha não desfazer o sono de outra.
 * @param {{ agora?: () => number, storage?: Storage|null, limites?: typeof LIMITES_NORMAIS }} opcoes
 */
export function criarSono({ agora = Date.now, storage = getStorage(), limites = LIMITES_NORMAIS } = {}) {
  const L = limites;
  const estado = carregar(storage); // sempre também na memória: se o storage falhar, o jogo segue contando
  let ultimoTick = null;
  let visivelAntes = false;
  let ultimaSincronia = -Infinity;

  const salvar = () => safeSet(SONO_KEY, JSON.stringify(estado), storage);

  /** Junta o que outra aba guardou com o que esta aba sabe. */
  function sincronizar() {
    ultimaSincronia = agora();
    const outro = carregar(storage);
    estado.ativoMs = Math.max(estado.ativoMs, outro.ativoMs);
    estado.ultimoUso = maiorOuNulo(estado.ultimoUso, outro.ultimoUso);
    estado.dormiuEm = maiorOuNulo(estado.dormiuEm, outro.dormiuEm);
  }

  const zerar = () => {
    estado.ativoMs = 0;
    estado.ultimoUso = null;
    estado.dormiuEm = null;
    salvar();
  };

  /** Acorda quem dormiu por 1 h e zera quem ficou 1 h sem jogar. Devolve true se zerou. */
  function atualizar(t) {
    if (estado.dormiuEm !== null) {
      if (estado.dormiuEm > t) { // relógio voltou: não dorme mais que 1 h
        estado.dormiuEm = t;
        salvar(); // senão a mesclagem traria de volta o valor do futuro
      }
      if (t - estado.dormiuEm >= L.sonoMs) { zerar(); return true; }
    } else if (estado.ultimoUso !== null && t - estado.ultimoUso >= L.pausaMs) {
      zerar();
      return true;
    }
    return false;
  }

  /** Relê o guardado (no máximo a cada 500 ms, ou sempre com `forcar`) e atualiza. */
  function refrescar(forcar = false) {
    const t = agora();
    if (forcar || t - ultimaSincronia >= SINCRONIA_MS) sincronizar();
    return atualizar(t);
  }

  const pendente = () => estado.dormiuEm === null && estado.ativoMs >= L.dormirMs;

  const fase = () => {
    refrescar();
    if (estado.dormiuEm !== null || pendente()) return 'dormindo';
    return estado.ativoMs >= L.noiteMs ? 'noite' : 'dia';
  };

  refrescar(true);

  return {
    limites: L,

    /**
     * Chame de tempos em tempos (e quando a visibilidade mudar) dizendo se o jogo está visível agora.
     * O intervalo desde a chamada anterior conta se o jogo estava visível naquela chamada.
     */
    tick(visivel) {
      const t = agora();
      const zerou = refrescar(true);
      const passo = ultimoTick === null ? 0 : Math.max(0, t - ultimoTick);
      const contar = visivelAntes && estado.dormiuEm === null && !pendente() && !zerou;
      ultimoTick = t;
      visivelAntes = Boolean(visivel);
      if (!visivel) return;
      if (estado.dormiuEm === null) {
        if (contar) estado.ativoMs = Math.min(L.dormirMs, estado.ativoMs + Math.min(passo, L.passoMaxMs));
        estado.ultimoUso = t;
      }
      salvar();
    },

    /** Relê o que outra aba guardou (use no evento `storage`). */
    sincronizar() {
      refrescar(true);
    },

    /** 'dia', 'noite' ou 'dormindo' (a partir dos 15 min, mesmo antes de a tela de dormir aparecer). */
    fase,

    /** Os bichinhos foram deitar: a hora do sono começa agora (chame quando a tela de dormir aparecer). */
    deitar() {
      refrescar(true);
      if (pendente()) {
        estado.dormiuEm = agora();
        salvar();
      }
    },

    /** A tela de dormir já apareceu (a hora do sono está correndo)? */
    deitou() {
      fase();
      return estado.dormiuEm !== null;
    },

    /** 0 de dia, sobe até 1 durante `rampaMs` depois dos 10 minutos, 1 de noite e dormindo. */
    nivelNoite() {
      if (fase() === 'dormindo') return 1;
      return Math.min(1, Math.max(0, (estado.ativoMs - L.noiteMs) / L.rampaMs));
    },

    /** Quanto falta para acordar, em ms (0 se não está dormindo; antes de deitar, a hora inteira). */
    msParaAcordar() {
      if (fase() !== 'dormindo') return 0;
      if (estado.dormiuEm === null) return L.sonoMs;
      return Math.max(0, L.sonoMs - (agora() - estado.dormiuEm));
    },

    /** Tempo de jogo acumulado (ms). */
    ativoMs() {
      fase();
      return estado.ativoMs;
    },
  };
}

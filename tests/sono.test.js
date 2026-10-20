import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  criarSono, limitesDaUrl, LIMITES_NORMAIS, LIMITES_RAPIDOS, SONO_KEY,
} from '../js/sono.js';

const MIN = 60 * 1000;
const HORA = 60 * MIN;

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

/** Relógio falso + sono. `joga(ms, visivel)` avança o tempo em passos de 1 s chamando `tick`. */
function mundo(storage = fakeStorage(), limites = LIMITES_NORMAIS, inicio = 1_000_000) {
  const w = { t: inicio, storage };
  w.novo = () => criarSono({ agora: () => w.t, storage: w.storage, limites });
  w.sono = w.novo();
  w.joga = (ms, visivel = true, sono = w.sono) => {
    sono.tick(visivel);
    for (let gasto = 0; gasto < ms; gasto += 1000) {
      w.t += Math.min(1000, ms - gasto);
      sono.tick(visivel);
    }
  };
  return w;
}

test('começa de dia, sem tempo contado', () => {
  const w = mundo();
  assert.equal(w.sono.fase(), 'dia');
  assert.equal(w.sono.nivelNoite(), 0);
  assert.equal(w.sono.msParaAcordar(), 0);
  assert.equal(w.sono.ativoMs(), 0);
});

test('fases nos limites: dia < 10 min, noite de 10 a 15, dormindo a partir de 15', () => {
  const w = mundo();
  w.joga(10 * MIN - 1000);
  assert.equal(w.sono.fase(), 'dia');
  w.joga(1000);
  assert.equal(w.sono.fase(), 'noite');
  w.joga(5 * MIN - 1000);
  assert.equal(w.sono.fase(), 'noite');
  w.joga(1000);
  assert.equal(w.sono.fase(), 'dormindo');
  assert.equal(w.sono.nivelNoite(), 1);
});

test('aba escondida não conta', () => {
  const w = mundo();
  w.joga(5 * MIN);
  w.joga(20 * MIN, false);
  assert.equal(w.sono.ativoMs(), 5 * MIN);
  w.joga(2 * MIN);
  assert.equal(w.sono.ativoMs(), 7 * MIN);
  assert.equal(w.sono.fase(), 'dia');
});

test('aparelho suspenso sem aviso: um intervalo enorme entre dois ticks conta no máximo o passo máximo', () => {
  const w = mundo();
  w.sono.tick(true);
  w.t += 1000;
  w.sono.tick(true);
  w.t += 30 * MIN;
  w.sono.tick(true);
  assert.equal(w.sono.ativoMs(), 1000 + LIMITES_NORMAIS.passoMaxMs);
});

test('recarregar a página mantém o tempo (nova instância, mesmo storage)', () => {
  const w = mundo();
  w.joga(11 * MIN);
  assert.equal(w.sono.fase(), 'noite');
  w.t += 3000; // a página recarrega
  const depois = w.novo();
  assert.equal(depois.fase(), 'noite');
  assert.equal(depois.ativoMs(), 11 * MIN);
  w.joga(4 * MIN, true, depois);
  assert.equal(depois.fase(), 'dormindo');
});

test('1 h sem jogar zera o contador (também antes dos 15 min)', () => {
  const w = mundo();
  w.joga(12 * MIN);
  assert.equal(w.sono.fase(), 'noite');
  w.t += HORA - 1000;
  assert.equal(w.sono.fase(), 'noite'); // ainda não passou 1 h
  w.t += 1000;
  assert.equal(w.sono.fase(), 'dia');
  assert.equal(w.sono.ativoMs(), 0);
  assert.equal(w.novo().fase(), 'dia'); // e o zero ficou guardado
});

test('voltar à aba depois de 1 h escondida também zera', () => {
  const w = mundo();
  w.joga(9 * MIN);
  w.joga(HORA + MIN, false);
  w.joga(2 * MIN);
  assert.equal(w.sono.ativoMs(), 2 * MIN);
  assert.equal(w.sono.fase(), 'dia');
});

test('a fase dormindo dura 1 h e depois volta o dia com o tempo zerado', () => {
  const w = mundo();
  w.joga(15 * MIN);
  w.sono.deitar();
  assert.equal(w.sono.fase(), 'dormindo');
  assert.equal(w.sono.msParaAcordar(), HORA);
  w.t += 30 * MIN;
  assert.equal(w.sono.msParaAcordar(), 30 * MIN);
  w.t += 30 * MIN - 1000;
  assert.equal(w.sono.fase(), 'dormindo');
  assert.equal(w.sono.msParaAcordar(), 1000);
  w.t += 1000;
  assert.equal(w.sono.fase(), 'dia');
  assert.equal(w.sono.ativoMs(), 0);
  assert.equal(w.sono.nivelNoite(), 0);
  assert.equal(w.sono.msParaAcordar(), 0);
});

test('durante o sono, jogar (visível) não prolonga o sono nem soma tempo', () => {
  const w = mundo();
  w.joga(15 * MIN);
  w.sono.deitar();
  w.joga(30 * MIN);
  assert.equal(w.sono.fase(), 'dormindo');
  assert.equal(w.sono.msParaAcordar(), 30 * MIN);
});

test('recarregar durante o sono continua dormindo e depois acorda', () => {
  const w = mundo();
  w.joga(15 * MIN);
  w.sono.deitar();
  w.t += 10 * MIN;
  const depois = w.novo();
  assert.equal(depois.fase(), 'dormindo');
  assert.equal(depois.msParaAcordar(), 50 * MIN);
  w.t += 50 * MIN;
  assert.equal(w.novo().fase(), 'dia');
});

test('depois de acordar, o tempo conta de novo do zero', () => {
  const w = mundo();
  w.joga(15 * MIN);
  w.t += HORA;
  w.joga(5 * MIN);
  assert.equal(w.sono.fase(), 'dia');
  assert.equal(w.sono.ativoMs(), 5 * MIN);
});

test('nivelNoite: 0 até os 10 min, sobe em 20 s e fica em 1', () => {
  const w = mundo();
  w.joga(10 * MIN);
  assert.equal(w.sono.nivelNoite(), 0);
  w.joga(5000);
  assert.ok(Math.abs(w.sono.nivelNoite() - 0.25) < 1e-9);
  w.joga(5000);
  assert.ok(Math.abs(w.sono.nivelNoite() - 0.5) < 1e-9);
  w.joga(10000);
  assert.equal(w.sono.nivelNoite(), 1);
  w.joga(2 * MIN);
  assert.equal(w.sono.nivelNoite(), 1);
});

test('storage que falha: conta só na memória e não quebra', () => {
  const quebrado = {
    getItem() { throw new Error('bloqueado'); },
    setItem() { throw new Error('cheio'); },
    removeItem() { throw new Error('bloqueado'); },
  };
  const w = mundo(quebrado);
  w.joga(10 * MIN);
  assert.equal(w.sono.fase(), 'noite');
  w.joga(5 * MIN);
  assert.equal(w.sono.fase(), 'dormindo');
  assert.equal(mundo(null).sono.fase(), 'dia'); // sem localStorage nenhum
});

test('guardado estragado ou inventado é ignorado', () => {
  for (const lixo of ['{', 'null', '"x"', '{"ativoMs":-5,"ultimoUso":"a","dormiuEm":null}']) {
    const storage = fakeStorage();
    storage.setItem(SONO_KEY, lixo);
    const w = mundo(storage);
    assert.equal(w.sono.fase(), 'dia', lixo);
    assert.equal(w.sono.ativoMs(), 0, lixo);
  }
});

test('o que fica guardado é só { ativoMs, ultimoUso, dormiuEm }', () => {
  const w = mundo();
  w.joga(3 * MIN);
  assert.deepEqual(Object.keys(JSON.parse(w.storage.getItem(SONO_KEY))), ['ativoMs', 'ultimoUso', 'dormiuEm']);
});

test('relógio que volta no tempo não dá mais de 1 h de sono', () => {
  const w = mundo();
  w.joga(15 * MIN);
  w.sono.deitar();
  const guardado = JSON.parse(w.storage.getItem(SONO_KEY));
  w.t = guardado.dormiuEm - 5 * HORA;
  assert.ok(w.sono.msParaAcordar() <= HORA);
});

test('?sono=rapido só vale em localhost', () => {
  assert.equal(limitesDaUrl('?sono=rapido', 'localhost'), LIMITES_RAPIDOS);
  assert.equal(limitesDaUrl('?sono=rapido', '127.0.0.1'), LIMITES_RAPIDOS);
  assert.equal(limitesDaUrl('?sono=rapido', 'duelo-de-contas.pages.dev'), LIMITES_NORMAIS);
  assert.equal(limitesDaUrl('', 'localhost'), LIMITES_NORMAIS);
  assert.equal(limitesDaUrl('?sono=outro', 'localhost'), LIMITES_NORMAIS);
  assert.equal(LIMITES_RAPIDOS.noiteMs, 10_000);
  assert.equal(LIMITES_RAPIDOS.dormirMs, 15_000);
  assert.equal(LIMITES_RAPIDOS.sonoMs, 30_000);
});

test('modo rápido: 10 s, 15 s e 30 s', () => {
  const w = mundo(fakeStorage(), LIMITES_RAPIDOS);
  w.joga(10_000);
  assert.equal(w.sono.fase(), 'noite');
  w.joga(5000);
  assert.equal(w.sono.fase(), 'dormindo');
  w.t += 30_000;
  assert.equal(w.sono.fase(), 'dia');
});

test('aos 15 min a fase já é dormindo, mas a hora do sono só corre depois de deitar()', () => {
  const w = mundo();
  w.joga(15 * MIN);
  assert.equal(w.sono.fase(), 'dormindo');
  assert.equal(w.sono.deitou(), false);
  assert.equal(w.sono.msParaAcordar(), HORA);
  w.joga(10 * MIN); // uma partida pausada ou longa: o sono não corre nem acorda sozinho
  assert.equal(w.sono.fase(), 'dormindo');
  assert.equal(w.sono.msParaAcordar(), HORA);
  w.sono.deitar();
  assert.equal(w.sono.deitou(), true);
  w.t += 20 * MIN;
  assert.equal(w.sono.msParaAcordar(), 40 * MIN);
  w.t += 40 * MIN;
  assert.equal(w.sono.fase(), 'dia');
});

test('duas abas: a aba velha, escondida, não desfaz o sono da outra', () => {
  const w = mundo();
  const abaB = w.novo(); // aberta e parada, com o estado de antes
  w.joga(15 * MIN);
  w.sono.deitar();
  w.t += 2000;
  abaB.tick(true); // B volta a aparecer
  assert.equal(abaB.fase(), 'dormindo');
  assert.equal(abaB.deitou(), true);
  assert.equal(w.novo().fase(), 'dormindo'); // e o que B guardou não apagou o sono
  assert.equal(JSON.parse(w.storage.getItem(SONO_KEY)).dormiuEm !== null, true);
});

test('duas abas: B escondida por mais de 1 h não zera o sono de A que ainda corre', () => {
  const w = mundo();
  const abaB = w.novo();
  w.t += 50 * MIN; // B fica quieta
  const a = w.novo();
  w.joga(15 * MIN, true, a);
  a.deitar();
  w.t += 20 * MIN; // B está há mais de 1 h sem ticks; A dormiu há 20 min
  abaB.tick(true);
  assert.equal(abaB.fase(), 'dormindo');
  assert.ok(abaB.msParaAcordar() > 0 && abaB.msParaAcordar() <= 40 * MIN);
  assert.equal(a.fase(), 'dormindo');
});

test('duas abas: o uso recente de uma não conta como pausa de 1 h na outra', () => {
  const w = mundo();
  const abaB = w.novo();
  const a = w.novo();
  w.joga(5 * MIN, true, a);
  w.t += 30 * MIN;
  w.joga(5 * MIN, true, a); // A joga de novo; B nunca viu nada disso
  w.t += 40 * MIN; // já se passou mais de 1 h desde o estado que B conhece, mas não desde o último uso de A
  abaB.tick(true);
  assert.ok(abaB.ativoMs() >= 10 * MIN);
});

test('sincronizar() pega na hora o sono que outra aba começou (evento storage)', () => {
  const w = mundo();
  const abaB = w.novo();
  w.joga(15 * MIN);
  w.sono.deitar();
  abaB.sincronizar();
  assert.equal(abaB.fase(), 'dormindo');
  assert.equal(abaB.deitou(), true);
});

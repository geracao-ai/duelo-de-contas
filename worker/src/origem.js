// Lista de Origins aceitos pelo Worker (função pura, testável em Node).
const PRODUCAO = 'https://duelo-de-contas.pages.dev';
const PREVIA = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.duelo-de-contas\.pages\.dev$/;
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}$/;

export function origemPermitida(origem) {
  if (typeof origem !== 'string' || !origem) return false;
  return origem === PRODUCAO || PREVIA.test(origem) || LOCAL.test(origem);
}

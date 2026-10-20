// Calcula o endereço novo (Cloudflare Pages) a partir do endereço antigo (GitHub Pages).
// Ex.: /duelo-de-contas/?pin=123 -> https://duelo-de-contas.pages.dev/?pin=123
export const DESTINO = 'https://duelo-de-contas.pages.dev';
const PREFIXO = '/duelo-de-contas';

export function newUrl({ pathname = '/', search = '', hash = '' } = {}) {
  let caminho = pathname;
  if (caminho === PREFIXO || caminho.startsWith(`${PREFIXO}/`)) {
    caminho = caminho.slice(PREFIXO.length);
  }
  if (!caminho.startsWith('/')) caminho = `/${caminho}`;
  return `${DESTINO}${caminho}${search}${hash}`;
}

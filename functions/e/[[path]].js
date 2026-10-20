// Cloudflare Pages Function: encaminha /e/* para o PostHog (EUA).
// Assim o navegador fala só com o nosso domínio e bloqueadores de anúncio não atrapalham.
const HOST_API = 'https://us.i.posthog.com';
const HOST_ESTATICOS = 'https://us-assets.i.posthog.com';

export async function onRequest({ request }) {
  // Usa o caminho original (e não params.path) para preservar a barra final: /e/i/v0/e/ -> /i/v0/e/
  const caminho = new URL(request.url).pathname.replace(/^\/e\//, '');
  const destino = caminho.startsWith('static/') ? HOST_ESTATICOS : HOST_API;
  const url = new URL(`${destino}/${caminho}`);
  url.search = new URL(request.url).search; // mantém a query string

  const cabecalhos = new Headers(request.headers);
  cabecalhos.delete('cookie'); // nunca repassa cookies do visitante
  cabecalhos.delete('host'); // o fetch usa o host do destino
  // Sem isto o PostHog veria o IP da Cloudflare e a região sairia errada.
  // O projeto descarta o IP depois de calcular país/estado.
  const ipVisitante = request.headers.get('cf-connecting-ip');
  if (ipVisitante) cabecalhos.set('x-forwarded-for', ipVisitante);

  const temCorpo = request.method !== 'GET' && request.method !== 'HEAD';
  return fetch(new Request(url, {
    method: request.method,
    headers: cabecalhos,
    body: temCorpo ? request.body : undefined,
    duplex: 'half',
    redirect: 'manual',
  }));
}

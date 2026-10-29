// Cloudflare Pages Function: o duelo online pelo mesmo endereço do site (/sala/ws, /sala/saude).
// Repassa ao Worker `duelo-de-contas` pelo service binding SALA, sem passar por *.workers.dev
// (que algumas redes e filtros bloqueiam): se o site abre, a sala também abre. Ver issue #27.
export async function onRequest({ request, env }) {
  if (!env.SALA) return new Response('Servidor do duelo indisponível', { status: 503 });
  const url = new URL(request.url);
  const caminho = url.pathname.replace(/^\/sala(?=\/|$)/, '') || '/';
  // O host não importa para o service binding; caminho, query e cabeçalhos (Upgrade, Origin) seguem iguais.
  return env.SALA.fetch(new Request(`https://duelo-de-contas.worker${caminho}${url.search}`, request));
}

# Cloudflare — configuração (via MCP)

> Este arquivo **não contém segredos**. Não há tokens da Cloudflare no repositório nem nos
> segredos do GitHub: a publicação é feita pela **integração Git da própria Cloudflare**.

## Visão geral

| Item | Valor |
| --- | --- |
| Site (produção) | https://duelo-de-contas.pages.dev |
| Worker | https://duelo-de-contas.danieldopulo.workers.dev |
| Prévias do Worker | `*-duelo-de-contas.danieldopulo.workers.dev` |
| Repositório ligado | `geracao-ai/duelo-de-contas` |
| Branch de produção | `main` |
| Segredos no GitHub | nenhum |

Papel de cada projeto:

- **Pages `duelo-de-contas`**: hospeda o jogo e a Pages Function `/e/*`, que repassa as
  estatísticas para o PostHog (ver [`posthog.mcp.md`](posthog.mcp.md)).
- **Worker `duelo-de-contas`**: reservado para o **duelo online com PIN** (Durable Object).
  Até lá, não deve publicar nada a cada merge (ver "Pendências").

## Configuração esperada

### Pages (`Workers & Pages → duelo-de-contas (Pages) → Settings → Builds`)

| Campo | Valor |
| --- | --- |
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` (raiz) |
| Preview deployments | ligadas (cada PR ganha um link) |

O `npm run build` (`scripts/build.mjs`) copia só os arquivos públicos (`index.html`,
`termos.html`, `css/`, `js/`, `assets/`) para `dist/`. A pasta `functions/` na raiz é publicada
automaticamente pelo Pages: `functions/e/[[path]].js` repassa `/e/*` para o PostHog EUA
(`/e/static/*` → `us-assets.i.posthog.com`, o resto → `us.i.posthog.com`), sem cookies e
encaminhando o IP do visitante (`CF-Connecting-IP` → `X-Forwarded-For`) só para o PostHog
calcular país/estado antes de descartá-lo.

### GitHub Pages (endereço antigo)

`geracao-ai.github.io/duelo-de-contas` publica só a pasta `redirect/` (workflow `pages.yml`),
que leva para `duelo-de-contas.pages.dev` mantendo o caminho e a query (ex.: `?pin=`).

### Worker (`Workers & Pages → duelo-de-contas (Worker) → Settings → Builds`)

| Campo | Valor |
| --- | --- |
| Build command | (vazio por enquanto) |
| Deploy command | `npx wrangler deploy` |
| Preview command | `npx wrangler preview` |
| Root directory | `worker` (quando o código do PIN existir) |
| Enable Preview builds | ligado |
| Protect with Cloudflare Access | desligado |

O `name` no arquivo de configuração do Wrangler (`worker/wrangler.jsonc`) precisa ser
**exatamente** `duelo-de-contas`, igual ao nome no painel, senão o build falha.

## Estado verificado pelo MCP (2026-10-20)

Conector usado: **Cloudflare Developer Platform** (Workers Bindings).

| Verificação | Resultado |
| --- | --- |
| `workers_list` | 1 Worker: `duelo-de-contas` (criado em 2026-10-20) |
| `workers_get_worker_code duelo-de-contas` | código provisório da Cloudflare (`Hello world`), porque o primeiro build falhou (o repositório ainda não tinha a configuração) |
| Projeto Pages `duelo-de-contas` | **não verificável por este conector** (ele não tem ferramentas de Pages) |
| Acesso HTTP aos dois endereços | não testado a partir do ambiente do agente (rede bloqueada para `*.pages.dev` e `*.workers.dev`) |

Confirmado pelo painel (captura de tela do dono da conta, 2026-10-20):

- **Pages `duelo-de-contas`** (`duelo-de-contas.pages.dev`) publicou o último commit da `main`
  ("Óculos: ajuda visual com a conta em blocos numa lousinha (#8)") **sem erro**.
- **Worker `duelo-de-contas`**: "Latest build failed", esperado enquanto não existir o código do PIN.

Como o repositório ainda não tinha `npm run build`, o Pages provavelmente está publicando a
**raiz do repositório** (build command vazio). Ao introduzir o build com saída em `dist`, o
painel precisa ser ajustado na mesma hora (ver "Pendências").

Limitações do conector atual:

- Lista e lê Workers, KV, D1, R2 e Hyperdrive; **não publica** Workers nem lê/edita projetos do Pages.
- Está marcado como **descontinuado**; o substituto é o servidor MCP da API da Cloudflare
  (`https://mcp.cloudflare.com/mcp`), que cobre a API inteira, inclusive Pages.

## Como verificar de novo pelo MCP

1. Listar Workers: `workers_list`.
2. Ver o código publicado do Worker: `workers_get_worker_code` com `scriptName: "duelo-de-contas"`.
3. Pages (só com o MCP novo da API da Cloudflare): listar projetos do Pages da conta e conferir
   `production_branch = main`, `build_config.build_command = "npm run build"` e
   `build_config.destination_dir = "dist"`.

## Pendências

- [ ] **Dois projetos ligados ao mesmo repositório**: hoje o Pages *e* o Worker tentam publicar a
      cada merge na `main`. Até o código do PIN existir, pausar os builds do Worker
      (`Settings → Builds → Branch control`, desligar os builds automáticos) **ou** definir o
      *Root directory* como `worker`.
- [ ] **No painel do Pages** (*Settings → Builds*): `Build command: npm run build` e
      `Build output directory: dist`. O `npm run build` já existe no código; sem esse ajuste, a
      raiz inteira do repositório (incluindo `tests/` e `tools/`) continua publicada e a função
      `/e/` pode não ser publicada.
- [ ] Quando o PIN for implementado: Durable Object no Worker e permissão de acesso do jogo
      (`duelo-de-contas.pages.dev`) ao Worker.

# Cloudflare — configuração (via MCP)

> Este arquivo **não contém segredos**. Não há tokens da Cloudflare no repositório nem nos
> segredos do GitHub: a publicação é feita pela **integração Git da própria Cloudflare**.

## Requisitos

| Item | Valor |
| --- | --- |
| Conector MCP | **Cloudflare API**, URL `https://mcp.cloudflare.com/mcp` (repositório [`cloudflare/mcp`](https://github.com/cloudflare/mcp)) |
| Login | OAuth com a conta da Cloudflare (sem token de API guardado) |
| Ferramentas | `search` (acha o endpoint na especificação da API), `execute` (chama a API), `docs`, `whoami` |

Não use o conector antigo "Cloudflare Developer Platform" (Workers Bindings): ele está
descontinuado e não lê nem altera builds, logs ou o Pages.

## Visão geral

| Item | Valor |
| --- | --- |
| Site (produção) | https://duelo-de-contas.pages.dev |
| Worker | https://duelo-de-contas.danieldopulo.workers.dev |
| Repositório ligado | `geracao-ai/duelo-de-contas` |
| Branch de produção | `main` |
| Segredos no GitHub | nenhum |

Papel de cada projeto:

- **Pages `duelo-de-contas`**: hospeda o jogo e a Pages Function `/e/*`, que repassa as
  estatísticas para o PostHog (ver [`posthog.mcp.md`](posthog.mcp.md)).
- **Worker `duelo-de-contas`**: o **duelo online com PIN** (Durable Object `Sala`), código em
  `worker/` (ver "Worker" abaixo).

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
| Branch de produção | `main` |
| Root directory | `worker` |
| Build command | (vazio; as dependências de `worker/package-lock.json` são instaladas sozinhas) |
| Deploy command | `npx wrangler deploy` |
| Previews (prévias por branch) | **desligadas**: não há check do Worker nos PRs; o Worker só é publicado no merge na `main` |
| Protect with Cloudflare Access | desligado |

O `name` em `worker/wrangler.jsonc` precisa ser **exatamente** `duelo-de-contas`, igual ao nome no
painel, senão o build falha. Com o *Root directory* `worker`, o Pages (raiz do repositório) e o
Worker deixam de competir pelos mesmos arquivos.

Código:

- `worker/src/index.js`: Worker (`fetch`) e Durable Object `Sala` (um por PIN, **WebSocket
  Hibernation**, binding `SALAS`, migração `new_sqlite_classes` exigida pelo plano grátis).
- `worker/src/regras.js`: máquina de estados da sala, pura (testada em `tests/sala.test.js`).
- `worker/src/origem.js`: lista de `Origin` aceitos (pura, testada).

**Como o jogo chega à sala (desde a issue #27):** o navegador conecta em
`wss://duelo-de-contas.pages.dev/sala/ws?…`, no **mesmo endereço do site**. A Pages Function
`functions/sala/[[path]].js` repassa ao Worker pelo **service binding `SALA`** (Pages → *Settings →
Bindings*, configurado pela API em produção e em prévia, apontando para o Worker `duelo-de-contas`,
ambiente `production`). Assim redes e filtros que bloqueiam `*.workers.dev` não impedem o duelo.
O endereço `workers.dev` continua no ar (testes locais e `tools/online/smoke.mjs`).

**Logs (Workers Logs):** ligados em `worker/wrangler.jsonc` (`observability.enabled`) e pela API
com `redact_query_string: true` (o PIN não aparece no log). Cada recusa registra
`{ recusa, status, origem, upgrade, caminho }`. Consultar pelo MCP:
`POST /accounts/{account_id}/workers/observability/telemetry/query`.

Endpoints do Worker (`https://duelo-de-contas.danieldopulo.workers.dev`, ou `/sala/…` no site):

| Rota | O que faz |
| --- | --- |
| `GET /saude` | responde `ok` (texto) |
| `GET /ws?criar=1` | WebSocket; sorteia um PIN livre (6 dígitos, não começa com 0; até 8 tentativas, depois 503) |
| `GET /ws?pin=482913` | WebSocket; entra na sala (erros `sala-inexistente`/`sala-cheia` chegam como mensagem e a conexão fecha) |

`/ws` exige `Upgrade: websocket` (senão 426) e `Origin` de `https://duelo-de-contas.pages.dev`,
`https://*.duelo-de-contas.pages.dev`, `http://localhost:<porta>` ou `http://127.0.0.1:<porta>`
(senão 403). O protocolo está descrito na issue #18.

Privacidade: **nada é gravado**. O estado da sala fica na memória do Durable Object e numa cópia
nos anexos dos sockets (`serializeAttachment`); não usamos `ctx.storage` (só `setAlarm`). Passam
pelo servidor apenas bichinho, operações, nível, acertos e o PIN; não há nomes, chat, cookies nem
IPs guardados. Quando a sala fecha (ou fica 30 min parada), tudo desaparece.

Limites do plano grátis: Durable Objects só com SQLite; 100 mil requisições/dia no Worker (cada
mensagem de WebSocket conta 1/20 de requisição para o Durable Object); sem armazenamento usado.
Mensagens acima de 1 KB são recusadas.

Riscos aceitos (por enquanto):

- O `Origin` só barra navegadores: um script pode testar PINs ou gastar a cota diária. Se isso
  acontecer, criar uma regra de *Rate limiting* na Cloudflare para `/ws` (não exige código).
- **Prévias do Worker** estão desligadas. O *Previews Base* já está alinhado (Root directory `worker`,
  Build command vazio, `npx wrangler preview`). Se forem religadas, falta só o bloco `"previews": {}`
  no `worker/wrangler.jsonc` (exigido pelo `wrangler preview`).

Testes: `npm test` (regras e Origin) e, com `cd worker && npm ci && npx wrangler dev`, o teste de
ponta a ponta `node tools/online/smoke.mjs`.

## Estado verificado pelo MCP (2026-10-20)

Conector usado: **Cloudflare API** (`https://mcp.cloudflare.com/mcp`, login OAuth, sem token
guardado), ferramentas `search` e `execute`. Ele substitui o antigo "Cloudflare Developer Platform"
(Workers Bindings), que não lia builds nem o Pages.

| Verificação | Resultado |
| --- | --- |
| Pages `duelo-de-contas` | `production_branch: main`, `build_command: npm run build`, `destination_dir: dist` ✅ |
| Worker `duelo-de-contas` (build) | produção na `main`, Root directory `worker`, deploy `npx wrangler deploy`, previews desligadas ✅ |
| Primeiro deploy do Worker | build `a6f8a6b4` (código do PR #19): `env.SALAS (Sala)` publicado em `https://duelo-de-contas.danieldopulo.workers.dev` ✅ |
| Acesso HTTP aos dois endereços | não testado do ambiente do agente (rede bloqueada para `*.pages.dev` e `*.workers.dev`) |

O que estava errado antes (corrigido pela API):

- O Worker tinha **Previews** ligadas com `npx wrangler preview` na raiz do repositório. Cada PR
  disparava esse build, que falhava pedindo um bloco `previews` no `wrangler.jsonc` (o check
  vermelho "Workers Builds" nos PRs #13 a #19).
- A produção usava a raiz (`/`) e `npm run build`, em vez de `worker`.

## Como verificar de novo pelo MCP

Com o conector **Cloudflare API**:

1. Configuração de build do Worker: `GET /accounts/{account_id}/builds/workers/{script_tag}`
   (o `script_tag` vem de `GET /accounts/{account_id}/workers/services/duelo-de-contas`).
2. Último build e log: `GET .../builds/workers/{script_tag}/builds` e
   `GET .../builds/builds/{build_uuid}/logs`.
3. Pages: `GET /accounts/{account_id}/pages/projects/duelo-de-contas` e conferir
   `production_branch`, `build_config.build_command` e `build_config.destination_dir`.

## Pendências

- [x] **Dois projetos ligados ao mesmo repositório**: resolvido definindo o *Root directory* do
      Worker como `worker` (o Pages continua na raiz).
- [x] **Pages**: `Build command: npm run build` e `Build output directory: dist` (conferido pela API).
- [x] Durable Object no Worker e permissão de acesso do jogo (`duelo-de-contas.pages.dev`) ao
      Worker (lista de `Origin` em `worker/src/origem.js`).
- [x] Worker: *Root directory* `worker` e comandos da tabela acima (ajustados pela API).
- [x] Duelo online testado em dois aparelhos reais depois do merge (2026-10-20): funcionou.

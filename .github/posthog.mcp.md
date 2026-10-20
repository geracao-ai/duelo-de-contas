# PostHog — configuração (via MCP)

> Este arquivo **não contém segredos**. A chave `phc_…` abaixo é a *project token* pública: ela
> só permite **enviar** eventos e vai no próprio código do site, por desenho do PostHog.
> Nenhuma Personal API Key é necessária: tudo que não é o SDK é feito pelo conector MCP.

## Projeto

| Item | Valor |
| --- | --- |
| Projeto | `Default project` (id `674056`) |
| Região | EUA |
| App | https://us.posthog.com/project/674056 |
| Ingestão (direta) | `https://us.i.posthog.com` |
| Ingestão pelo jogo | `/e/` no próprio site (Pages Function, ver [`cloudflare.mcp.md`](cloudflare.mcp.md)) |
| Project token (pública) | `phc_qFezYEtjW2X7Xbc34GHFf34NWEDpVojsQzRCJ2RRY4Qd` |

## Princípio: modo anônimo para crianças

Medimos **o jogo, não a criança**:

- sem perfis de pessoa, sem `identify`, sem nome/e-mail;
- **nada guardado no aparelho** pelo PostHog (`persistence: 'memory'`);
- **IP descartado** no servidor — a região (país e estado) é calculada antes do descarte;
- sem gravação de sessão, mapa de calor, logs do console ou captura automática de cliques;
- botão **"Não enviar estatísticas"** na página de termos (opt-out por aparelho).

A contagem de aparelhos é feita **sem identificador**: o jogo guarda só a data da última visita
no `localStorage` e envia `visita_dia` (1ª abertura do dia), `visita_mes` e `primeira_visita`.

## 1. Configuração do projeto (aplicar pelo MCP)

Estado lido em 2026-10-20 (`call project-get {}`), **antes** de aplicar:

| Configuração | Atual | Alvo |
| --- | --- | --- |
| `anonymize_ips` | `false` | **`true`** |
| `autocapture_opt_out` | `false` | **`true`** |
| `heatmaps_opt_in` | `true` | **`false`** |
| `capture_console_log_opt_in` | `true` | **`false`** |
| `capture_performance_opt_in` | `true` | **`false`** |
| `capture_dead_clicks` | `false` | `false` |
| `session_recording_opt_in` | `false` | `false` |
| `surveys_opt_in` | `null` | **`false`** |
| `autocapture_web_vitals_opt_in` | `true` | `true` (métricas de desempenho, sem dados pessoais) |
| `timezone` | `UTC` | **`America/Sao_Paulo`** |

Comando (ferramenta `project-settings-update`, semântica PATCH — só muda o que for enviado):

```text
call project-settings-update {
  "id": 674056,
  "anonymize_ips": true,
  "autocapture_opt_out": true,
  "heatmaps_opt_in": false,
  "capture_console_log_opt_in": false,
  "capture_performance_opt_in": false,
  "capture_dead_clicks": false,
  "session_recording_opt_in": false,
  "surveys_opt_in": false,
  "timezone": "America/Sao_Paulo",
  "product_description": "Duelo de Contas: jogo web de cabo de guerra matemático para crianças de 6 a 10 anos. Eventos anônimos, sem identificação de pessoas."
}
```

Depois, conferir com `call project-get {}`.

### Transformação "Remover cidade (privacidade)"

A GeoIP do PostHog também grava cidade, CEP e coordenadas. Prometemos só **país e estado**,
então uma transformação (modelo `template-filter-properties`, ordem 2, depois da GeoIP) apaga o
resto antes de o evento ser gravado:

```text
call cdp-functions-create {
  "type": "transformation",
  "template_id": "template-filter-properties",
  "name": "Remover cidade (privacidade)",
  "enabled": true,
  "execution_order": 2,
  "inputs": { "propertiesToFilter": { "value": "$geoip_city_name, $geoip_postal_code, $geoip_latitude, $geoip_longitude, $geoip_accuracy_radius, $geoip_time_zone, $set.<os mesmos>, $set_once.$initial_<os mesmos>" } }
}
```

Criada em 2026-10-20 (id `01a1575a-491f-0000-300c-c2585bc58a7d`). Os poucos eventos de teste
recebidos antes disso ainda têm a cidade.

## 2. Configuração do SDK no jogo

```js
posthog.init('phc_qFezYEtjW2X7Xbc34GHFf34NWEDpVojsQzRCJ2RRY4Qd', {
  api_host: '/e',                   // passa pela Pages Function (escapa de bloqueadores)
  ui_host: 'https://us.posthog.com',
  persistence: 'memory',            // nada de cookies ou localStorage do PostHog
  person_profiles: 'identified_only', // nunca chamamos identify → nenhum perfil é criado
  autocapture: false,
  capture_pageview: true,
  capture_pageleave: true,
  disable_session_recording: true,
  disable_surveys: true,
  enable_heatmaps: false,
  capture_dead_clicks: false,
});
```

Se o aparelho tiver escolhido **"Não enviar estatísticas"**, o PostHog nem é carregado.

## 3. Eventos

| Evento | Quando | Propriedades |
| --- | --- | --- |
| `$pageview` / `$pageleave` | abrir/sair de uma página | automáticas (aparelho, sistema, navegador, página, país/estado) |
| `primeira_visita` | 1ª abertura neste aparelho | — |
| `visita_dia` | 1ª abertura do dia neste aparelho | — |
| `visita_mes` | 1ª abertura do mês neste aparelho | — |
| `partida_iniciada` | toque em "Começar" (online: início da contagem) | `modo` (`cpu`/`2p`/`online`), `nivel`, `entrada` (`opcoes`/`teclado`), `op_soma`, `op_subtracao`, `op_multiplicacao`, `op_divisao`, `bichinho` |
| `partida_terminada` | fim da partida | as de cima + `resultado` (`vitoria`/`derrota`/`vencedor_j1`/`vencedor_j2`; online: `vitoria`/`derrota`/`amigo_saiu`), `duracao_s`, `acertos`, `erros`, `acertos_<op>`, `erros_<op>`, `tempo_medio_s`, `usou_oculos`, `ativacoes_oculos`, `noite` (`true` se o céu já tinha escurecido, a partir dos 10 min de jogo) |
| `partida_abandonada` | "Sair" ou fechar a aba no meio | as de `partida_iniciada` + `duracao_s`, `acertos`, `erros` |
| `oculos_ligados` | botão Óculos ligado | `nivel`, `op` (da conta atual) |
| `revanche` | "Jogar de novo" (online: "Revanche") | `modo`, `nivel` |
| `sala_criada` | o anfitrião recebe o PIN | `nivel`, `entrada`, `op_soma`, `op_subtracao`, `op_multiplicacao`, `op_divisao`, `bichinho` (nunca o PIN) |
| `sala_entrou` | o convidado entra na sala | `nivel` |
| `sala_erro` | erro ao criar/entrar/jogar online | `codigo` (`sala-inexistente`, `sala-cheia`, `versao`, `mensagem-invalida`, `conexao`) |
| `anoiteceu` | o jogo chega aos 10 min de uso e o céu escurece (uma vez por dia de jogo) | — |
| `hora_de_dormir` | a tela "Os bichinhos foram dormir" aparece (aos 15 min, depois de a partida acabar) | — |
| `estatisticas_zeradas` | botão zerar | — |

Nenhuma propriedade contém texto livre ou dado da criança.

O tempo de uso que alimenta `anoiteceu` e `hora_de_dormir` fica só no `localStorage` do aparelho
(`duelo-de-contas:sono:v1`) e não é enviado: os dois eventos não têm propriedades além das automáticas.

## 4. Painel "Duelo de Contas"

Criado em 2026-10-20 pelo MCP (`dashboard-create`, `insight-create`, `dashboard-update`, `annotation-create`):
[painel 2234747](https://us.posthog.com/project/674056/dashboard/2234747). Todos os gráficos são
`TrendsQuery` salvos (nenhum SQL), com os últimos 30 dias por padrão e contagem de eventos
(nunca usuários únicos: não existem pessoas). Fuso do projeto: America/Sao_Paulo.

Aparelhos = contagem de `visita_dia`. Região = só `$geoip_country_name` e `$geoip_subdivision_1_name`.

| Seção | Gráfico | Definição |
| --- | --- | --- |
| Texto (topo) | Aviso de dados anônimos | cartão de texto: sem pessoa, sem IP, região = país e estado |
| Números | Aparelhos hoje | `visita_dia` desde o início do dia (número) |
| Números | Aparelhos no mês | `visita_mes` desde o início do mês (número) |
| Números | Partidas nos últimos 30 dias | `partida_iniciada`, comparado ao período anterior |
| Números | Partidas por dia | `partida_iniciada` por dia (linha) |
| Partidas | Partidas por modo e nível | `partida_iniciada` por dia, quebrado por `modo` e `nivel` (barras) |
| Partidas | Bichinhos escolhidos | `partida_iniciada` por `bichinho` (pizza) |
| Partidas | Partidas por operação | `partida_iniciada` com `op_*` = true, uma série por operação |
| Partidas | Tempo de jogo | média e soma de `duracao_s` de `partida_terminada` por dia (dois eixos) |
| Partidas | Abandono de partidas | fórmula `partida_abandonada` ÷ `partida_iniciada` por dia |
| Partidas | Vitória contra o computador por nível | fórmula vitórias ÷ partidas com `modo = cpu`, por `nivel` |
| Partidas | Revanche | fórmula `revanche` ÷ `partida_terminada` por dia |
| Aprendizado | Operações mais erradas | 8 somas (`erros_<op>`, `acertos_<op>`) e 4 fórmulas `erros ÷ (acertos + erros)` |
| Aprendizado | Óculos × acerto | somas de `acertos`/`erros` com `usou_oculos` true e false; fórmulas de taxa de acerto |
| Aprendizado | Óculos ligados por dia | `oculos_ligados` por dia |
| Aprendizado | Partidas com óculos | fórmula `partida_terminada` com `usou_oculos` ÷ todas |
| Duelo online | Partidas online por dia | `partida_iniciada` com `modo = online` |
| Duelo online | Salas criadas e entradas | `sala_criada` e `sala_entrou` por dia |
| Duelo online | Erros de sala por código | `sala_erro` por `codigo` |
| Duelo online | Resultado das partidas online | `partida_terminada` com `modo = online` por `resultado` |
| Hora de dormir | Anoiteceu e hora de dormir | `anoiteceu` e `hora_de_dormir` por dia |
| Hora de dormir | Partidas terminadas de noite | `partida_terminada` por dia, quebrado por `noite` |
| Aparelhos e região | Aparelhos por dia | `visita_dia` por dia |
| Aparelhos e região | Aparelhos por mês | `visita_mes` por mês (6 meses) |
| Aparelhos e região | Aparelhos novos por semana | `primeira_visita` por semana (90 dias) |
| Aparelhos e região | Região (país e estado) | `visita_dia` por `$geoip_country_name` e `$geoip_subdivision_1_name` (tabela) |
| Aparelhos e região | Tipo de aparelho e sistema | `visita_dia` por `$device_type` e `$os` (tabela) |
| Aparelhos e região | Navegadores | `visita_dia` por `$browser` (pizza) |
| Aparelhos e região | Páginas mais vistas | `$pageview` por `$pathname` |

Anotação no painel (id 504790): **2026-10-19, "4 opções no Fácil"**, para comparar antes/depois.

Diferenças em relação ao plano original:

- **Abandono** virou razão `partida_abandonada` ÷ `partida_iniciada` (Trends), não funil: um funil
  conta pessoas/aparelhos únicos, o que não faz sentido aqui.
- **Operações mais erradas** é um único valor agregado por operação (sem quebra por nível).
- **Região** e **aparelhos/páginas** usam `visita_dia` (um por aparelho/dia) em vez de `$pageview`,
  para não inflar a contagem; só "Páginas mais vistas" usa `$pageview`. Em vez do Web analytics
  pronto, são três gráficos Trends (tipo+sistema, navegador, página).
- **Sem dados ainda** (evento ou propriedade nunca recebidos em 2026-10-20): `hora_de_dormir`
  (série vazia no gráfico "Anoiteceu e hora de dormir") e `sala_erro` com `codigo` ("Erros de sala
  por código" sem dados). Os gráficos foram criados com os nomes documentados e começam a
  preencher quando o jogo enviar os eventos. `estatisticas_zeradas` não tem gráfico.
- "Óculos × acerto" mostra 0 para "Com óculos" enquanto não houver partida terminada com óculos.

## Status

- [x] Configuração do projeto (seção 1) — **aplicada em 2026-10-20** pelo MCP e conferida com `project-get`.
- [x] SDK e eventos no jogo (seções 2 e 3) — `js/analytics.js` e `js/main.js`; termos e opt-out em `termos.html`.
      Em `localhost` nada é enviado, a não ser com `?analytics=1`; o sinal Global Privacy Control também desliga o envio.
- [x] Primeiros eventos conferidos em 2026-10-20 (região = país/estado, sem `$ip`).
- [x] Transformação que remove a cidade — **ativa** desde 2026-10-20.
- [x] Painel (seção 4) — **criado em 2026-10-20**: [painel 2234747](https://us.posthog.com/project/674056/dashboard/2234747), 28 gráficos Trends + 1 cartão de texto + anotação; todos rodam sem erro (`dashboard-insights-run`). Pendentes de dados: `hora_de_dormir`, `sala_erro`/`codigo`.

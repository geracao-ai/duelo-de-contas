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
| `partida_terminada` | fim da partida | as de cima + `resultado` (`vitoria`/`derrota`/`vencedor_j1`/`vencedor_j2`; online: `vitoria`/`derrota`/`amigo_saiu`), `duracao_s`, `acertos`, `erros`, `acertos_<op>`, `erros_<op>`, `tempo_medio_s`, `usou_oculos`, `ativacoes_oculos` |
| `partida_abandonada` | "Sair" ou fechar a aba no meio | as de `partida_iniciada` + `duracao_s`, `acertos`, `erros` |
| `oculos_ligados` | botão Óculos ligado | `nivel`, `op` (da conta atual) |
| `revanche` | "Jogar de novo" (online: "Revanche") | `modo`, `nivel` |
| `sala_criada` | o anfitrião recebe o PIN | `nivel`, `entrada`, `op_soma`, `op_subtracao`, `op_multiplicacao`, `op_divisao`, `bichinho` (nunca o PIN) |
| `sala_entrou` | o convidado entra na sala | `nivel` |
| `sala_erro` | erro ao criar/entrar/jogar online | `codigo` (`sala-inexistente`, `sala-cheia`, `versao`, `mensagem-invalida`, `conexao`) |
| `estatisticas_zeradas` | botão zerar | — |

Nenhuma propriedade contém texto livre ou dado da criança.

## 4. Painel "Duelo de Contas"

Criado pelo MCP (`dashboard-create` + insights), na ordem:

| Gráfico | Tipo | Definição |
| --- | --- | --- |
| Aparelhos por dia | Trends | contagem de `visita_dia` por dia |
| Aparelhos por mês / novos | Trends | `visita_mes` por mês; `primeira_visita` por semana |
| Região | Trends (tabela) | `$pageview` por `$geoip_country_name` e `$geoip_subdivision_1_name` |
| Partidas por dia, modo e nível | Trends | `partida_iniciada` por dia, quebrado por `modo` e `nivel` |
| Partidas por operação | Trends | `partida_iniciada` com `op_*` = true, uma série por operação |
| Operações mais erradas | Trends (fórmula) | soma de `erros_<op>` ÷ (`acertos_<op>` + `erros_<op>`), por `nivel` |
| Tempo de jogo | Trends | soma e média de `duracao_s` de `partida_terminada` por dia |
| Abandono | Funil | `partida_iniciada` → `partida_terminada` |
| Óculos | Trends | `oculos_ligados` por dia; % de partidas com `usou_oculos` |
| Óculos × acerto | Trends (fórmula) | acerto médio com e sem `usou_oculos` |
| Vitória contra o computador por nível | Trends (fórmula) | `resultado = vitoria` ÷ partidas `modo = cpu`, por `nivel` |
| Revanche | Trends | `revanche` ÷ `partida_terminada` |
| Bichinhos | Trends (pizza) | `partida_iniciada` por `bichinho` |
| Aparelhos e páginas | Web analytics | `$device_type`, `$os`, `$browser`, `$pathname` |

Anotação no painel: data de lançamento das 4 opções no Fácil (2026-10-19), para comparar antes/depois.

## Status

- [x] Configuração do projeto (seção 1) — **aplicada em 2026-10-20** pelo MCP e conferida com `project-get`.
- [x] SDK e eventos no jogo (seções 2 e 3) — `js/analytics.js` e `js/main.js`; termos e opt-out em `termos.html`.
      Em `localhost` nada é enviado, a não ser com `?analytics=1`; o sinal Global Privacy Control também desliga o envio.
- [x] Primeiros eventos conferidos em 2026-10-20 (região = país/estado, sem `$ip`).
- [x] Transformação que remove a cidade — **ativa** desde 2026-10-20.
- [ ] Painel (seção 4).

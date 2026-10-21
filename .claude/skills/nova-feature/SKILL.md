---
name: nova-feature
description: Fluxo completo para criar ou mudar uma funcionalidade do Duelo de Contas — conversa, esboço das telas, issue com história e esboços, implementação, conferência com o esboço, PR com prints, revisão, merge e publicação conferida. Use sempre que o pedido for uma funcionalidade nova ou uma mudança visível no jogo.
---

# Nova funcionalidade no Duelo de Contas

Siga as etapas na ordem. Cada uma termina com algo que o dono do projeto pode ver: uma mensagem, um esboço, um issue, um PR.
As regras gerais (público infantil, acessibilidade, sem segredos, privacidade, git) estão no `CLAUDE.md` e valem em todas as etapas.

**Modelos por etapa** (quando houver agentes): esboço e implementação → modelo rápido (Sonnet), em paralelo quando as partes forem independentes; revisão → modelo mais forte (Opus), só leitura. O agente principal coordena, junta, testa e conversa.

## 1. Conversar e entender

- Entenda o pedido; pergunte só o que mudar o resultado. Sugira melhorias quando fizer sentido.
- Se for grande ou tiver várias saídas, mostre as opções com **uma recomendação**.

## 2. Esboço das telas

Antes de escrever código do jogo, gere **esboços** de cada tela nova ou alterada.

- Um agente monta um HTML simples (caixas, textos reais, cores da paleta de `css/style.css`) ou uma cópia do jogo com a mudança simulada, e tira prints com Playwright nos três tamanhos: **844x390**, **390x844** e **1280x720**.
- O esboço precisa deixar claro: **onde** fica cada elemento, **tamanho** aproximado, **cor**, **texto exato** e o que acontece ao tocar.
- Mostre os esboços ao dono do projeto (no chat) e ajuste até aprovar.

## 3. Implicações e decisões

- Liste o que precisa ser decidido (regras, casos de borda, online × offline, privacidade, acessibilidade, estatísticas), cada item com uma recomendação.
- Espere as respostas. Não implemente decisões que ainda estão em aberto.

## 4. Issue no GitHub

Use o modelo `.github/ISSUE_TEMPLATE/funcionalidade.md`:

- **História** com personagens (ex.: Lia, 8 anos, e Theo, 7) contando o uso passo a passo.
- **Decisões** (tabela), **Telas**, **Implementação** (arquivos e módulos), **Critérios de aceite** (checklist).
- **Esboços aprovados** publicados na branch `telas` e colados no issue:
  ```sh
  tools/telas/publicar.sh issue-<N>/esboco esbocos/*.png   # imprime o Markdown das imagens
  ```
  Edite o issue depois de criado para incluir as imagens (o número `<N>` só existe depois de criar).

## 5. Implementar

- Branch de trabalho; nunca direto na `main`.
- Código seguindo o estilo do projeto; lógica nova em **módulo puro** testável (sem DOM, relógio e armazenamento injetáveis).
- **Testes** `node:test` em `tests/`, incluindo casos de borda das decisões.
- Funcionalidade com tempo (contagem, espera) → **modo rápido de teste** que só funciona em `localhost`.
- Mudou o servidor (`worker/`) → testes das regras em `tests/sala.test.js` e o teste de ponta a ponta com `wrangler dev`.
- Mudou o que é coletado → `js/analytics.js`, `.github/posthog.mcp.md` e `termos.html`.

## 6. Testar e conferir com o esboço

- `npm test` e `npm run build` limpos; se mexeu no servidor, `tools/online/smoke.mjs` e `tools/online/e2e.mjs` contra `wrangler dev`.
- **Prints** com Playwright das mesmas telas e nos mesmos três tamanhos do esboço. Sem erros no console. Confira também que os modos que já existiam não mudaram.
- **Compare print × esboço**, tela por tela: posição dos elementos, tamanhos, cores, textos, o que cabe sem rolagem. Diferença sem motivo → corrija. Diferença com motivo → anote para o PR.

## 7. Pull request

Use o modelo `.github/pull_request_template.md` e inclua `Closes #<N>`:

- **O que muda**, **Testes** e **Limitações conhecidas**.
- **Telas — esboço × implementado**: publique os prints e monte uma tabela lado a lado com os esboços do issue.
  ```sh
  tools/telas/publicar.sh pr-<N>/prints shots/*.png
  ```
- **Diferenças do esboço**: cada uma com o motivo.

## 8. Revisão

Um agente revisor (só leitura, sem comentar no GitHub) procura **bugs com cenário concreto**, em ordem de gravidade, e confere:

- o código contra as decisões e os critérios de aceite do issue;
- os **prints contra os esboços** (posição, cor, texto, tamanhos, o que cabe em cada tamanho);
- regressões nos modos que já existiam, acessibilidade e privacidade.

Corrija o que for grave ou médio e o que for pequeno e barato; teste de novo (etapa 6) e atualize os prints do PR se a tela mudou. O que ficar para depois vai para **Limitações conhecidas**.

## 9. Merge e publicação

- Com os checks do GitHub verdes, merge **squash** com a mensagem `<título> (#<PR>)`.
- O site (Pages) publica sozinho a partir da `main`.

### Conferir a infra (Cloudflare) — sempre que mudar `worker/`, `functions/`, o build ou rotas

Pelo conector **Cloudflare API** (ver `.github/cloudflare.mcp.md`, seção "Como verificar de novo pelo MCP"):

- Último build do Worker da `main`: `build_outcome: success` e o log com `Deployed duelo-de-contas`.
- Último deploy do Pages da `main`: `latest_stage.status: success`.
- Mudou configuração (comandos, pastas, rotas, bindings) → atualize `.github/cloudflare.mcp.md`.
- Falhou → leia o log do build pela API antes de mexer em qualquer coisa.

### Conferir as estatísticas (PostHog) — sempre que criar, mudar ou remover eventos ou propriedades

Pelo conector **PostHog** (ver `.github/posthog.mcp.md`):

- Antes do merge: a tabela de eventos (seção 3) e `termos.html` refletem o que é enviado.
- Depois do merge, com o site no ar: o evento novo aparece em `read-data-schema` com as propriedades esperadas, **sem dado pessoal** (sem nome, sem IP, região só país e estado).
- Painel "Duelo de Contas": crie ou ajuste o gráfico do evento novo e registre a mudança na seção 4.
- Nunca mude configurações do projeto ou transformações do PostHog sem combinar antes.

## 10. Entregar

- Atualize a documentação que mudou (`README.md`, `.github/*.mcp.md`).
- Mande ao dono do projeto: o link do PR, os prints principais e um **roteiro para testar em aparelhos reais** (o que fazer, o que deve acontecer).
- Se a funcionalidade for destaque, gere, se quiser, um GIF de divulgação com `/gif-divulgacao` para acompanhar o anúncio.

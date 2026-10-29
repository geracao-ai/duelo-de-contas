# Duelo de Contas

Cabo de guerra da matemática para crianças de **6 a 10 anos**. Site: https://duelo-de-contas.pages.dev

- **Jogo:** HTML + canvas + ES modules, sem framework e sem dependências em tempo de execução (`index.html`, `js/`, `css/`, `assets/`).
- **Servidor do duelo online:** Cloudflare Worker + Durable Object em `worker/` (sala por PIN, WebSocket com hibernação).
- **Estatísticas:** PostHog anônimo, enviado pela Pages Function `functions/e/[[path]].js`.
- **Infra e configuração:** [`.github/cloudflare.mcp.md`](.github/cloudflare.mcp.md) e [`.github/posthog.mcp.md`](.github/posthog.mcp.md).

## Comandos

| O quê | Comando |
| --- | --- |
| Testes (jogo, servidor, analytics) | `npm test` |
| Build do site (`dist/`) | `npm run build` |
| Jogo local | `python3 -m http.server 8000` → http://localhost:8000 |
| Servidor local | `cd worker && npm ci && npx wrangler dev --port 8787`, jogo com `?servidor=http://localhost:8787` |
| Teste do servidor | `node tools/online/smoke.mjs http://localhost:8787` |
| Partida online com 2 navegadores | `node tools/online/e2e.mjs facil 844x390 shots-online http://localhost:8787` |
| Hora de dormir acelerada (só localhost) | `?sono=rapido` |
| Conferir as telas (tamanhos + iPhone com câmera), com prints | `node tools/telas/conferir.mjs shots` (jogo local na porta 8000) |
| Publicar esboços/prints no GitHub | `tools/telas/publicar.sh <pasta> <imagens>` |
| GIF de divulgação de uma funcionalidade | `node tools/gif/gravar.mjs <roteiro>` (skill `/gif-divulgacao`) |

## Regras que valem sempre

- **Público infantil:** textos em português do Brasil, curtos e carinhosos; sem nomes digitados, sem chat.
- **Acessibilidade:** alvos de toque ≥ 48px, leitor de tela (`aria-*`, região `#live`), "reduzir movimento" respeitado, contraste AA.
- **Telas:** tem que caber, sem rolagem, em **844x390** (celular deitado), **390x844** (em pé) e **1280x720**, e nada pode ficar embaixo da câmera ou da barra de início do iPhone (use `var(--sa-l/r/t/b)` do `css/style.css`).
- **Sem segredos:** nada de token no repositório nem nos segredos do GitHub. Só chaves públicas (`phc_…`). A infra é mexida pelos conectores MCP (Cloudflare API `https://mcp.cloudflare.com/mcp` e PostHog), com login OAuth.
- **Privacidade:** medimos o jogo, não a criança. Sem `identify`, sem perfis; região só país e estado. Mudou o que é coletado → atualizar `termos.html` e `.github/posthog.mcp.md`.
- **Git:** trabalhar em branch e PR; nunca commit direto na `main`, nunca force push. Merge squash com os checks verdes.
- **Estilo:** siga o código ao redor (comentários e nomes em português, funções pequenas, módulos puros testáveis em `node:test`).

## Fluxo de uma funcionalidade nova

Toda funcionalidade segue o fluxo da skill **`/nova-feature`** ([`.claude/skills/nova-feature/SKILL.md`](.claude/skills/nova-feature/SKILL.md)):
conversa → esboço → issue com história e esboços → implementação → conferência com o esboço → PR com prints → revisão → merge → publicação conferida.
Modelos: [`.github/ISSUE_TEMPLATE/funcionalidade.md`](.github/ISSUE_TEMPLATE/funcionalidade.md) e [`.github/pull_request_template.md`](.github/pull_request_template.md).

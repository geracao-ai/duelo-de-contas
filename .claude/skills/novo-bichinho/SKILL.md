---
name: novo-bichinho
description: Acrescentar um bichinho novo ao Duelo de Contas, ou trocar um bichinho pouco usado por outro, no mesmo estilo dos atuais (desenhado só com formas de canvas). Use quando o pedido for criar, mudar o visual ou remover um personagem.
---

# Novo bichinho (ou troca de bichinho)

Segue o fluxo da skill **`/nova-feature`** (esboço → aprovação → issue → implementação → PR → revisão → merge). Esta skill traz só o que é específico de personagem.

## 1. Entender o pedido

- **Acrescentar** (vira o 7º, 8º…) ou **trocar** um existente? Para trocar, veja no painel do PostHog o gráfico **"Bichinhos escolhidos"** qual é o menos usado.
- Peça uma **referência** (foto ou desenho) e combine: nome no diminutivo (Ursinho, Coelhinha…), cor principal e 2 ou 3 traços que fazem reconhecer o bicho (ex.: capivara = cabeça comprida, focinho largo, orelhinhas pequenas).
- **O estilo não muda**: formas de canvas, contorno `#3b2a20`, bochechas rosadas, olhos grandes com brilho, corpo fofinho (~3,1 `s` de altura). Ilustração em imagem (aquarela, pelinho) não entra: pesa no celular, não anima as poses e some nos tamanhos pequenos do jogo.

## 2. Esboço (numa cópia, sem mexer no repositório)

Desenhe o bichinho numa cópia do site e tire prints:

1. **Folha de poses** (`poses.html` importando `js/characters.js`): parado (`idle`), puxando (`pull`), comemorando (`cheer`), triste (`sad`), dormindo e de óculos, com 2 bichinhos atuais ao lado para comparar o estilo.
2. **Tela "Prepare o duelo"** nos três tamanhos (844x390, 390x844, 1280x720), rolada até os cartões.
3. **Uma partida** com o bichinho puxando a corda.
4. **Os outros bichinhos idênticos**: compare, pixel a pixel, os atuais em todas as poses, com e sem óculos, renderizados com o `characters.js` do repositório e com o da cópia. A diferença máxima tem que ser 0. Congele o relógio, porque o rabo da raposa anima com `performance.now()`.

Mostre ao dono do projeto, liste o que você mesmo mudaria e ajuste até aprovar. No esboço da capivarinha, por exemplo, o focinho escuro e grande parecia máscara e a cabeça quadrada demais lembrava um urso. Cada ajuste vira um esboço novo (v2, v3…).

## 3. Onde mexer

| Arquivo | O quê |
| --- | --- |
| `js/characters.js` | Entrada em `ANIMALS` (`id`, `name`, `body`, `belly`, `limb`, `ear`, `earInner`, `nose` e campos novos se precisar). Partes específicas em ramos do desenho (`drawHead`, `drawEarsBehind`, `drawNose`, `drawMouth`, `drawTail`…). Olhos fora do padrão → `eye: { x, y, r }` (os óculos acompanham). Confira as poses `drawSleeping` e `drawGlasses`. |
| `worker/src/regras.js` | Lista `BICHINHOS`: o servidor recusa bichinho desconhecido no duelo online. |
| `css/style.css` | Grade dos cartões: `.cards` e `#cards-guest` (a escolha do convidado no online tem `repeat(6, …)` no celular deitado). Com 7 ou mais: 7 colunas no celular deitado e 3 colunas no celular em pé. |
| `tests/` | `sala.test.js` (servidor aceita o novo id), testes de configuração salva. |
| `README.md` | Lista de bichinhos, se houver. |

O resto já lê a lista sozinho: cartões da escolha, sorteio do computador, validação do online no navegador (`salaValida`), estatísticas locais e a propriedade `bichinho` do PostHog.

## 4. Trocar ou remover um bichinho

- **Configuração salva no aparelho:** `stats.loadSettings` ignora um id que não existe mais e volta para o padrão (Ursinho). Mesmo assim, teste com um `localStorage` que tenha o bichinho removido.
- **Duelo online:** publique o servidor e o site juntos. Quem estiver com o jogo antigo aberto vê "Atualize a página" se o amigo escolher o bichinho novo.
- **PostHog:** o gráfico "Bichinhos escolhidos" mistura o histórico do antigo com o novo. Anote a data da troca no painel (anotação) e na seção 4 do `.github/posthog.mcp.md`.

## 5. Testar e entregar

Siga as etapas 6 a 10 da `/nova-feature`. No PR, a tabela esboço × implementado deve mostrar a folha de poses, a tela de escolha nos três tamanhos e uma partida. Se o bichinho for novidade boa para divulgar, gere um GIF com a skill `/gif-divulgacao`.

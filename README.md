# Duelo de Contas

Cabo de guerra da matemática para crianças de 6 a 10 anos. Resolva as contas mais rápido que o adversário para puxar a corda até a marca da vitória!

Feito só com HTML, Canvas e JavaScript puro (módulos ES), sem empacotador, sem dependências, sem imagens e sem fontes externas: os bichinhos são desenhados no canvas e os sons são sintetizados com WebAudio. Toda a interface é em português do Brasil.

**▶ Jogue agora: https://duelo-de-contas.pages.dev/**

[![Demonstração do Duelo de Contas: o celular liga, vira para paisagem, abre o jogo e a Pandinha vence o Sapinho](assets/demo.gif)](https://duelo-de-contas.pages.dev/assets/demo.mp4)

<sub>Clique na animação para ver o [vídeo em MP4](https://duelo-de-contas.pages.dev/assets/demo.mp4) com qualidade total.</sub>

## Como jogar

1. No menu, escolha **Contra o computador**, **2 jogadores aqui** (no mesmo aparelho) ou **Desafiar um amigo** (online, veja [Duelo online](#duelo-online)).
2. Na configuração, escolha as operações (`+ − × ÷`, pelo menos uma), a dificuldade (Fácil, Médio ou Difícil) e o seu bichinho (Ursinho, Coelhinha, Gatinho, Pandinha, Raposinha ou Sapinho). No modo 2 jogadores os bichinhos precisam ser diferentes; no modo contra o computador, ele sorteia um bichinho diferente do seu.
3. Na partida, resolva a conta que aparece no seu lado. No **Fácil**, toque na resposta certa entre **4 opções**; no **Médio** e no **Difícil**, digite a resposta no teclado da tela e aperte **OK**.
   - **Acertou:** a corda anda um passo na sua direção.
   - **Errou:** nada se perde. Você tem outra chance com a mesma conta (no Fácil, a opção errada fica apagada); no segundo erro a resposta aparece por instantes e vem uma conta nova.
   - **Óculos 👓:** o botão **Óculos** (no seu painel, entre o nome e os acertos) faz o bichinho pôr óculos e mostra a conta desenhada em blocos numa lousinha acima do card: soma em dois grupos, subtração com os blocos tirados riscados, multiplicação em grade e divisão em caixinhas. Números grandes viram barras de 10 e cubinhos (material dourado). No Fácil e no Médio aparecem os números embaixo dos grupos. Cada jogador liga o seu; começa desligado.
4. Vence quem puxar a fita vermelha até a bandeira do seu lado (5 passos a partir do centro).
5. **Pausa** (ou a tecla `Esc`) interrompe o jogo; **Sair** volta ao menu.

No fim, a tela de resultado mostra acertos, erros e tempo médio de cada jogador. A tela **Estatísticas** guarda, neste navegador, partidas jogadas, vitórias contra o computador, acertos e erros por operação, tempo médio de resposta, a melhor sequência de acertos e quantas respostas foram dadas de óculos (há um botão para zerar).

### Teclado físico

| Modo | Esquerda / jogador | Direita |
| --- | --- | --- |
| Contra o computador | Fileira de números `0-9`, `Backspace` (apagar), `Enter` (OK). O teclado numérico também funciona. | (computador) |
| 2 jogadores | Fileira de números `0-9`, `Backspace` (apagar), `Enter` (OK) | Teclado numérico: `Numpad0-9`, `NumpadDecimal` (apagar), `NumpadEnter` (OK) |

No **Fácil** (4 opções), as teclas `1` a `4` escolhem a opção, na mesma ordem da tela; no modo 2 jogadores, a fileira de números vale para a esquerda e o teclado numérico para a direita.

No modo 2 jogadores o teclado físico é opcional: cada lado também tem seu teclado na tela, que funciona por toque ou mouse. Em celulares, o jogo funciona melhor com o aparelho deitado.

### Dificuldade

| | Soma / subtração | Multiplicação | Divisão |
| --- | --- | --- | --- |
| Fácil | operandos até 10 | tabuadas do 2 ao 5 | divisores até 5, quociente até 5 |
| Médio | operandos até 20 | tabuadas até 10 | divisores até 10, quociente até 10 |
| Difícil | até 100 (a soma não passa de 100) | até 12 × 12 | divisores até 12, quociente até 12 |

A subtração nunca dá resultado negativo, a divisão é sempre exata e a mesma conta nunca se repete em seguida. O computador demora de 5 a 8 s (Fácil), 3,5 a 6 s (Médio) ou 2,2 a 4 s (Difícil) para responder, com 70%, 82% e 92% de acerto.

## Duelo online

**Desafiar um amigo** leva duas pessoas, cada uma no seu aparelho, ao mesmo cabo de guerra:

1. Quem cria a sala toca em **Criar sala**, escolhe operações, nível e bichinho, e recebe um **PIN de 6 números** (e o botão **Enviar convite**, que compartilha o link `?pin=482913` ou o copia).
2. O amigo abre o link (o PIN já vem preenchido) ou toca em **Entrar com PIN**, escolhe um bichinho diferente do primeiro e toca em **Estou pronto!**.
3. Quem criou toca em **Começar!**. Os dois recebem **as mesmas contas, na mesma ordem** (cada aparelho gera as contas com uma semente enviada pelo servidor, `js/rng.js`), e cada um vê só o próprio teclado. O servidor é quem move a corda e declara o vencedor. Não há pausa online. No fim, **Revanche** recomeça na mesma sala.

O servidor é um Worker da Cloudflare (pasta `worker/`); o protocolo WebSocket está descrito na issue #18. O endereço padrão fica em `js/online.js` e pode ser trocado com `?servidor=http://localhost:8787` na URL do jogo. Para testar sem o Worker há um servidor falso e um teste com dois navegadores:

```sh
python3 -m http.server 8000 &
node tools/online/fake-server.mjs 8787 &
node tools/online/e2e.mjs facil 844x390   # precisa do Playwright; salva prints em ./shots-online
```

## Rodar localmente

Como o código usa módulos ES, é preciso servir os arquivos por HTTP (abrir o `index.html` direto do disco não funciona):

```sh
python3 -m http.server
# abra http://localhost:8000
```

## Testes

Precisa do Node.js 18 ou mais novo (nenhuma dependência para instalar):

```sh
npm test
```

Isso executa `node --test tests/*.test.js`. As versões recentes do Node (22+) não aceitam apenas o nome da pasta (`node --test tests/`), por isso o script usa o padrão de arquivos.

## Estrutura

```
index.html          telas (menu, configuração, partida, resultado, estatísticas) e diálogos
termos.html         privacidade e termos, com o botão "Não enviar estatísticas"
css/style.css       visual, botões grandes e layouts responsivos
js/online.js        conexão WebSocket do duelo online (sem DOM, testada)
js/rng.js           gerador com semente: mesmas contas nos dois aparelhos
js/main.js          inicialização, fluxo de telas, teclado físico e laço principal
js/problems.js      gerador de contas e conferência de respostas (puro, testado)
js/game.js          estado da partida: corda, pontuação, tentativas e vitória
js/ai.js            oponente controlado pelo computador
js/render.js        cenário, corda, animações e partículas no canvas
js/characters.js    os 6 bichinhos desenhados com formas do canvas
js/audio.js         efeitos e melodia sintetizados com WebAudio, botão de mudo
js/stats.js         estatísticas e preferências no localStorage
js/sono.js          hora de dormir: tempo de jogo, fases dia/noite/dormindo (puro, testado)
js/analytics.js     estatísticas anônimas (PostHog), contagem de visitas e opt-out
js/keypad.js        teclado numérico na tela
js/choices.js       as 4 opções de resposta do nível Fácil
js/visual-help.js   óculos: a conta desenhada em blocos na lousinha (modelo puro e desenho)
tests/              testes com node:test
scripts/build.mjs   gera a pasta dist/ publicada no Cloudflare Pages
functions/e/        Pages Function: proxy /e/* para o PostHog
redirect/           página que leva o endereço antigo (GitHub Pages) ao novo
assets/             vídeo de demonstração, prévia animada e imagem de compartilhamento
tools/              scripts que geram o vídeo (tools/demo), a imagem (tools/og) e testam o duelo online (tools/online)
.github/workflows/  CI (testes e build) e redirecionamento no GitHub Pages
```

## Hora de dormir

Para limitar o tempo de tela de um jeito lúdico, o jogo **anoitece aos 10 minutos de uso** (céu azul-escuro com estrelas, lua no lugar do sol) e **os bichinhos vão dormir aos 15**. Uma partida em andamento termina normalmente; depois do resultado aparece a tela "Os bichinhos foram dormir", com os bichinhos deitados e o tempo que falta para acordarem. Só o botão **Som** e o link **Privacidade e termos** continuam disponíveis. Depois de 1 hora o jogo volta de dia, com o tempo zerado (1 hora sem jogar também zera o contador).

- Só conta o tempo com o jogo visível na tela (Page Visibility); recarregar a página não zera.
- O tempo fica guardado só no aparelho (`localStorage`, chave `duelo-de-contas:sono:v1`), nunca é enviado, e vale por aparelho (não há contas).
- No duelo online o jogador sai da sala depois da partida com `{ "t": "tchau", "motivo": "dormir" }` e o amigo vê "Seu amigo foi dormir.".
- Para testar sem esperar: `http://localhost:8000/?sono=rapido` (só em `localhost`) anoitece em 10 s, dorme aos 15 s e acorda 30 s depois.

## Privacidade e estatísticas

Para melhorar o jogo, o site envia estatísticas **anônimas** de uso ao PostHog (por um proxy no próprio domínio): modo, nível, operações, acertos e erros, duração, uso dos óculos e bichinho escolhido, mais aparelho, navegador e região aproximada. Não há cadastro, cookies de rastreamento, perfis, gravação de tela nem IP armazenado, e nenhuma propriedade contém texto livre. As estatísticas da tela "Estatísticas" ficam só no aparelho.

Quem não quiser enviar nada usa o botão **"Não enviar estatísticas"** em [`termos.html`](termos.html) (a escolha fica no aparelho); o sinal Global Privacy Control também é respeitado. Em `localhost` nada é enviado, a não ser com `?analytics=1` na URL. Detalhes de configuração e a lista de eventos: [`.github/posthog.mcp.md`](.github/posthog.mcp.md).

## Publicação

O site fica no Cloudflare Pages (https://duelo-de-contas.pages.dev) com a integração de repositório: a cada push o Cloudflare roda `npm run build` e publica a pasta `dist/` (gerada por `scripts/build.mjs`, só com `index.html`, `termos.html`, `css/`, `js/` e `assets/`). Em *Settings → Builds* use Build command `npm run build` e output `dist`.

A pasta `functions/e` vira uma Pages Function que faz proxy de `/e/*` para o PostHog (EUA), mantendo as estatísticas no nosso domínio.

O GitHub Pages só redireciona: o workflow `.github/workflows/pages.yml` roda os testes e publica apenas a pasta `redirect/`, que leva o endereço antigo (`geracao-ai.github.io/duelo-de-contas`) ao novo. O workflow `ci.yml` roda `npm test` e `npm run build` em pull requests e em branches que não são a `main`.

## Vídeo e imagem de compartilhamento

- `assets/demo.mp4` / `assets/demo.gif`: vídeo de demonstração (~27 s) e a prévia animada usada acima. Gerados por `tools/demo/record-demo.mjs`, que grava `tools/demo/director.html` (um celular desenhado em HTML com o jogo de verdade rodando dentro).
- `assets/og-image.png`: miniatura 1200×630 que aparece ao compartilhar o link (WhatsApp, Telegram, redes sociais), referenciada pelas meta tags Open Graph do `index.html`. Gerada por `tools/og/render-og.mjs` a partir de `tools/og/og.html`, usando o mesmo desenho do jogo.

Para regenerar (precisa de Playwright e ffmpeg):

```bash
python3 -m http.server 8000 &
node tools/og/render-og.mjs
node tools/demo/record-demo.mjs
```

## Acessibilidade

Botões com `aria-label`, região `aria-live` que anuncia a conta e os resultados, alvos de toque de pelo menos 56 px e respeito a `prefers-reduced-motion` (sem tremores, com menos confete e sem animações decorativas).

## Licença

MIT, veja [LICENSE](LICENSE).

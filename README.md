# Duelo de Contas

Cabo de guerra da matemática para crianças de 6 a 10 anos. Resolva as contas mais rápido que o adversário para puxar a corda até a marca da vitória!

Feito só com HTML, Canvas e JavaScript puro (módulos ES), sem build, sem dependências, sem imagens e sem fontes externas: os bichinhos são desenhados no canvas e os sons são sintetizados com WebAudio. Toda a interface é em português do Brasil.

**▶ Jogue agora: https://geracao-ai.github.io/duelo-de-contas/**

[![Demonstração do Duelo de Contas: o celular liga, vira para paisagem, abre o jogo e a Pandinha vence o Sapinho](assets/demo.gif)](https://geracao-ai.github.io/duelo-de-contas/assets/demo.mp4)

<sub>Clique na animação para ver o [vídeo em MP4](https://geracao-ai.github.io/duelo-de-contas/assets/demo.mp4) com qualidade total.</sub>

## Como jogar

1. No menu, escolha **Contra o computador** ou **2 jogadores**.
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
css/style.css       visual, botões grandes e layouts responsivos
js/main.js          inicialização, fluxo de telas, teclado físico e laço principal
js/problems.js      gerador de contas e conferência de respostas (puro, testado)
js/game.js          estado da partida: corda, pontuação, tentativas e vitória
js/ai.js            oponente controlado pelo computador
js/render.js        cenário, corda, animações e partículas no canvas
js/characters.js    os 6 bichinhos desenhados com formas do canvas
js/audio.js         efeitos e melodia sintetizados com WebAudio, botão de mudo
js/stats.js         estatísticas e preferências no localStorage
js/keypad.js        teclado numérico na tela
js/choices.js       as 4 opções de resposta do nível Fácil
js/visual-help.js   óculos: a conta desenhada em blocos na lousinha (modelo puro e desenho)
tests/              testes com node:test
assets/             vídeo de demonstração, prévia animada e imagem de compartilhamento
tools/              scripts que geram o vídeo (tools/demo) e a imagem (tools/og)
.github/workflows/  publicação no GitHub Pages
```

## Publicação

O workflow `.github/workflows/pages.yml` roda os testes e publica a raiz do repositório no GitHub Pages a cada push na branch `main`. Ative em *Settings → Pages → Source: GitHub Actions*.

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

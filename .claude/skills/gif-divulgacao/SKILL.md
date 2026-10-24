---
name: gif-divulgacao
description: Gera GIFs curtos (6 a 12 s) de divulgação de uma funcionalidade do Duelo de Contas — o jogo dentro de um celular, num fundo colorido, com título em português e toques visíveis — para acompanhar o anúncio da novidade. Use só para funcionalidades de destaque, quando for anunciar algo a pais e crianças.
---

# GIF de divulgação

Um GIF curto mostra a novidade funcionando, no estilo dos GIFs de lançamento: o jogo dentro de um celular (ou dois, lado a lado), fundo suave com as cores do jogo, título grande, círculos nos toques e repetição sem fim.

## Quando usar

- **Só para funcionalidades de destaque** (ex.: duelo online com PIN, modo novo, bichinho novo). Correção, ajuste visual pequeno ou mudança interna **não** ganha GIF.
- Depois do merge e da publicação conferida, ou no PR, para o dono do projeto aprovar o roteiro antes de anunciar.

## Dois estilos

| Estilo | Como é | Quando usar |
| --- | --- | --- |
| `palco` (padrão) | Colorido, 1 ou 2 celulares, **título e subtítulo** no topo, círculos de toque. Página `tools/gif/palco.html`. | Divulgação para crianças e pais, redes sociais, funcionalidades de dois aparelhos (duelo online). |
| `claude` | Mínimo e escuro: o jogo numa janela de desktop (bolinhas de macOS), **sem título**, com uma seta de mouse que desliza até cada alvo e dá um pulso no clique. Página `tools/gif/janela.html`, 1280x800 (ou `--formato 1200x675`). | Anúncio sóbrio, estilo GIF de lançamento de produto; o texto vai na mensagem, não no GIF. Um só jogo visível: um segundo jogador pode entrar numa página escondida (`api.paginaOculta({ pin })`). |

```bash
node tools/gif/gravar.mjs criar-sala                                  # palco
node tools/gif/gravar.mjs criar-sala-claude --estilo claude           # janela escura com seta
```

O roteiro de cada estilo é um arquivo próprio (`criar-sala.mjs` e `criar-sala-claude.mjs`); no estilo `claude` só vale `frames = 1` e título, rótulos e legendas são ignorados.

## Como funciona

- `tools/gif/palco.html`: o palco (fundo, título, 1 ou 2 celulares com o jogo em `<iframe>`, círculo de toque, legenda).
- `tools/gif/gravar.mjs <roteiro> [--saida pasta] [--formato 1200x675|1080x1080|1280x800] [--estilo palco|claude]`: sobe o servidor estático e, se o roteiro for `online`, o servidor falso (`tools/online/fake-server.mjs`) em portas livres, grava o screencast do Chromium e monta MP4 + GIF com o ffmpeg. **Falha se aparecer qualquer erro no console.**
- `tools/gif/roteiros/<nome>.mjs`: o roteiro. Exemplo completo: `criar-sala.mjs` (dois celulares, duelo online).

Precisa de `ffmpeg` e Playwright (o mesmo de `tools/online/e2e.mjs`).

## Escrevendo um roteiro

Modelo (copie para `tools/gif/roteiros/<nome>.mjs`):

```js
export const titulo = 'Título curto e simpático';      // até ~30 letras
export const subtitulo = 'Uma frase que explica';       // opcional
export const frames = 1;                                // 1 ou 2 celulares
export const online = false;                            // true: sobe o servidor falso e passa ?servidor=
export const rotulos = [];                              // ex.: ['Lia', 'Theo'] sob os celulares (opcional)
export const orientacao = 'deitado';                    // ou 'em-pe' (opcional)
export const params = {};                               // query extra do jogo, ex.: { sono: 'rapido' }

export async function passos({ frames: [tela], tocar, esperar, legenda }) {
  await tocar(0, tela.locator('[data-action="play-cpu"]')); // mostra o círculo e toca
  await esperar(400);
  await legenda('Fácil: toque na resposta');                // opcional; legenda('') esconde
}
```

`api` do `passos`: `frames[i]` (Playwright `frameLocator` de cada celular), `tocar(i, locator)`, `esperar(ms)`, `legenda(texto)`, `titulo(texto, sub)`, `abrir(i, 'pin=123456')` (recarrega o jogo do celular `i` com outra query), `paginaOculta(query)` (abre outra página do jogo, fora da gravação, no mesmo servidor falso; ex.: o amigo entrando com `{ pin }`), `page`, `servidor`.

Regras do roteiro:

- **6 a 12 s no total** (o `criar-sala` tem ~12 s). Pule o que é lento com esperas curtas (150–400 ms); mostre só o que a novidade faz.
- Texto em português do Brasil, curto e carinhoso. Nada de nomes digitados: rótulos como "Lia" e "Theo" são só da divulgação.
- Prefira `[data-action=…]`, `#ids` e `.char-card[data-animal=…]` como seletores (ver `tools/online/e2e.mjs`). No menu use `#screen-menu [data-action="online"]` (há outro "Voltar" com o mesmo `data-action`).
- Dois celulares: `online = true`, e o PIN lido do `aria-label` de `#lobby-pin` (veja `criar-sala.mjs`).
- A contagem "3, 2, 1, JÁ!" é desenhada no canvas: espere por tempo (~3,5 s depois do toque em Começar!).
- O celular tem 844x390 por padrão. `export const tela = '780x360'` deixa as letras um pouco maiores, mas telas menores que o padrão podem cortar o jogo: confira os quadros.

## Rodando

```bash
node tools/gif/gravar.mjs criar-sala                 # gifs/criar-sala.gif e .mp4 (1200x675)
node tools/gif/gravar.mjs criar-sala --formato 1080x1080
```

Olhe o resultado: extraia quadros (`ffmpeg -ss 7 -i gifs/x.gif -frames:v 1 q.png`) e confira que nada está cortado, o texto é legível a 800 px e os toques aparecem. `gifs/` está no `.gitignore`: **não faça commit** dos GIFs.

## Tamanho e fps

- GIF de **12 a 15 fps**, largura **800** (1200x675) ou **640** (1080x1080), paleta com `stats_mode=diff` e dither `bayer`. Meta: **até 3 MB**. Se passar, o `gravar.mjs` reduz fps e largura sozinho e conta no log; se mesmo assim passar, encurte o roteiro.
- O GIF repete para sempre e segura o último quadro por ~1 s antes de recomeçar.
- O MP4 (qualidade total) é gerado junto; use-o quando o canal aceitar vídeo.

## Onde publicar

Na branch `telas` (a `main` não recebe binários):

```bash
tools/telas/publicar.sh divulgacao/2026-10-21-criar-sala gifs/criar-sala.gif gifs/criar-sala.mp4
```

O script imprime o Markdown (imagem do GIF e link do MP4). Cole o GIF na mensagem e ponha o link do MP4 para quem quiser ver em qualidade total.

## Texto de anúncio (2 a 3 linhas)

Modelo, para crianças e pais:

```
Novidade no Duelo de Contas! 🐻🐱
Agora dá para desafiar um amigo em outro celular: é só criar a sala e passar o PIN. Cada um joga no seu aparelho, com as mesmas contas.
Jogue grátis em https://duelo-de-contas.pages.dev
```

Tom: carinhoso, sem jargão, uma ideia só, sem prometer o que o jogo não faz. Lembre: não coletamos dados da criança (ver `termos.html`).

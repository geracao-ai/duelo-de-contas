#!/usr/bin/env bash
# Publica imagens (esboços e prints) na branch `telas` e imprime o Markdown para colar no issue ou no PR.
# A `main` não recebe PNGs: as imagens ficam só na branch `telas`, em docs/telas/<pasta>/.
#
# Uso:   tools/telas/publicar.sh <pasta> <imagem>...
# Ex.:   tools/telas/publicar.sh issue-20/esboco esbocos/*.png
#        tools/telas/publicar.sh pr-22/prints shots/*.png
# Mensagem do commit: variável MENSAGEM (padrão "Telas: <pasta>").
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Uso: $0 <pasta> <imagem>..." >&2
  exit 1
fi
pasta=$1
shift
for f in "$@"; do [ -f "$f" ] || { echo "Arquivo não encontrado: $f" >&2; exit 1; }; done

raiz=$(git rev-parse --show-toplevel)
url_repo=$(git -C "$raiz" remote get-url origin | sed -E 's#^git@github.com:#https://github.com/#; s#\.git$##; s#^https://[^/]*@#https://#')
case "$url_repo" in
  https://github.com/*) ;;
  *) url_repo="https://github.com/geracao-ai/duelo-de-contas" ;; # remoto fora do GitHub (proxy): usa o endereço público
esac

tmp=$(mktemp -d)
limpar() { git -C "$raiz" worktree remove --force "$tmp" >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap limpar EXIT

if git -C "$raiz" fetch -q origin telas 2>/dev/null; then
  git -C "$raiz" worktree add -q --detach "$tmp" FETCH_HEAD
else
  # Primeira vez: branch órfã, sem o código do jogo.
  git -C "$raiz" worktree add -q --detach "$tmp"
  git -C "$tmp" checkout -q --orphan telas-nova
  git -C "$tmp" rm -rqf .
  git -C "$tmp" clean -fdxq
  cat > "$tmp/README.md" <<'EOF'
# Telas do Duelo de Contas

Branch só de imagens: esboços (antes de implementar) e prints (depois) usados nos issues e PRs.
Publicadas com `tools/telas/publicar.sh` (na `main`). Não faça merge desta branch.
EOF
fi

mkdir -p "$tmp/docs/telas/$pasta"
cp "$@" "$tmp/docs/telas/$pasta/"
git -C "$tmp" add -A
if git -C "$tmp" diff --cached --quiet; then
  echo "Nada novo para publicar." >&2
else
  git -C "$tmp" commit -q -m "${MENSAGEM:-Telas: $pasta}"
fi
git -C "$tmp" push -q origin HEAD:telas
sha=$(git -C "$tmp" rev-parse HEAD)

# Markdown pronto para colar: links fixos pelo commit (não mudam se a pasta for atualizada depois).
for f in "$@"; do
  nome=$(basename "$f")
  echo "![${nome%.*}](${url_repo}/blob/${sha}/docs/telas/${pasta}/${nome}?raw=true)"
done

// Gera a pasta dist/ que o Cloudflare Pages publica (npm run build).
// Sem dependências: só copia os arquivos do jogo, nada de testes ou ferramentas.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ARQUIVOS = ['index.html', 'termos.html']; // termos.html é opcional
const PASTAS = ['css', 'js', 'assets'];
// Arquivos que precisam ficar na raiz do site (o iPhone procura /apple-touch-icon.png sozinho).
const NA_RAIZ = { 'assets/apple-touch-icon.png': 'apple-touch-icon.png' };

// Recria a pasta de saída e copia o que o site precisa. Devolve a pasta usada.
export function build(saida = join(RAIZ, 'dist'), raiz = RAIZ) {
  rmSync(saida, { recursive: true, force: true });
  mkdirSync(saida, { recursive: true });
  for (const arquivo of ARQUIVOS) {
    if (existsSync(join(raiz, arquivo))) cpSync(join(raiz, arquivo), join(saida, arquivo));
  }
  for (const pasta of PASTAS) {
    cpSync(join(raiz, pasta), join(saida, pasta), { recursive: true });
  }
  for (const [origem, destino] of Object.entries(NA_RAIZ)) {
    if (existsSync(join(raiz, origem))) cpSync(join(raiz, origem), join(saida, destino));
  }
  return saida;
}

// Só executa quando chamado direto (node scripts/build.mjs), não ao importar nos testes.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`dist pronto em ${build()}`);
}

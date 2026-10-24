// GIF no estilo "claude" (janela escura, seta de mouse, sem título): criar uma sala e o amigo entrar.
// O amigo entra numa página escondida (fora da gravação) contra o mesmo servidor falso.
//   node tools/gif/gravar.mjs criar-sala-claude --estilo claude
export const titulo = ''; // este estilo não mostra título; o texto vai na mensagem do anúncio
export const frames = 1;
export const online = true;

export async function passos({ frames: [jogo], tocar, esperar, paginaOculta }) {
  // ----- cria a sala -----
  await tocar(0, jogo.locator('#screen-menu [data-action="online"]'));
  await esperar(150);
  await tocar(0, jogo.locator('[data-action="online-create"]'));
  await esperar(150);
  await tocar(0, jogo.locator('#opt-ops .chip[data-value="mul"]'));
  await tocar(0, jogo.locator('.char-card[data-slot="p1"][data-animal="urso"]'));
  await tocar(0, jogo.locator('#btn-setup-start'));
  await jogo.locator('#lobby-pin[aria-label*="PIN da sala"]').waitFor();
  const pin = (await jogo.locator('#lobby-pin').getAttribute('aria-label')).replace(/\D/g, '');
  await esperar(1000); // sala com o PIN e "Esperando seu amigo…"

  // ----- o amigo entra (página escondida) -----
  const amigo = await paginaOculta({ pin });
  await amigo.click('#btn-join-go');
  await amigo.waitForSelector('#join-room-stage:not([hidden])');
  await amigo.click('#cards-guest .char-card[data-animal="gato"]');
  await amigo.click('#btn-ready');

  // ----- o bichinho do amigo aparece e o "Começar!" acende -----
  await jogo.locator('#btn-lobby-start:not([disabled])').waitFor();
  await esperar(500);
  await tocar(0, jogo.locator('#btn-lobby-start'));

  // ----- contagem 3-2-1 até logo depois do "JÁ!" -----
  await esperar(3500);
}

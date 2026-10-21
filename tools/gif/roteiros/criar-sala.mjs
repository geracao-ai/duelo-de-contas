// GIF: desafiar um amigo com PIN (criar sala, entrar com o PIN, pronto, começar, contagem).
//   node tools/gif/gravar.mjs criar-sala
export const titulo = 'Desafie um amigo com PIN';
export const subtitulo = 'Cada um no seu celular, com as mesmas contas';
export const frames = 2; // 1 ou 2 aparelhos
export const online = true; // sobe o servidor falso e passa ?servidor= para o jogo
export const rotulos = ['Lia', 'Theo']; // etiquetas sob os aparelhos (opcional)
export const tela = '844x390'; // opcional: tamanho do celular; menor = letras maiores, mas confira se nada corta
export const params = {}; // query extra do jogo (ex.: { sono: 'rapido' })

export async function passos({ frames: [lia, theo], tocar, esperar, legenda }) {
  // ----- Lia cria a sala -----
  await tocar(0, lia.locator('#screen-menu [data-action="online"]'));
  await esperar(150);
  await tocar(0, lia.locator('[data-action="online-create"]'));
  await esperar(150);
  await tocar(0, lia.locator('#opt-ops .chip[data-value="mul"]'));
  await tocar(0, lia.locator('#opt-diff [data-value="facil"]'));
  await tocar(0, lia.locator('.char-card[data-slot="p1"][data-animal="urso"]'));
  await tocar(0, lia.locator('#btn-setup-start'));
  await lia.locator('#lobby-pin[aria-label*="PIN da sala"]').waitFor();
  await esperar(500);
  const pin = (await lia.locator('#lobby-pin').getAttribute('aria-label')).replace(/\D/g, '');

  // ----- Theo entra digitando o PIN -----
  await tocar(1, theo.locator('#screen-menu [data-action="online"]'));
  await esperar(150);
  await tocar(1, theo.locator('[data-action="online-join"]'));
  await esperar(150);
  for (const digito of pin) {
    await tocar(1, theo.locator(`#join-keypad-slot .key[data-key="${digito}"]`));
      }
  await tocar(1, theo.locator('#btn-join-go'));
  await theo.locator('#join-room-stage:not([hidden])').waitFor();
  await tocar(1, theo.locator('#cards-guest .char-card[data-animal="gato"]'));
  await tocar(1, theo.locator('#btn-ready'));

  // ----- o bichinho do amigo aparece e o "Começar!" acende -----
  await lia.locator('#btn-lobby-start:not([disabled])').waitFor();
  await esperar(900);
  await tocar(0, lia.locator('#btn-lobby-start'));

  // ----- contagem 3-2-1 nos dois aparelhos; segue até logo depois do "JÁ!" -----
  await esperar(3500);
}

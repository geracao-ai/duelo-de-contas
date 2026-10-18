// Teclado numérico na tela. Cada instância pertence a um jogador.

const LAYOUT = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'erase', '0', 'ok'];

function makeButton(key, label, playerLabel) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'key';
  button.dataset.key = key;
  if (key === 'erase') {
    button.classList.add('key-erase');
    button.textContent = 'Apagar';
    button.setAttribute('aria-label', `Apagar, ${playerLabel}`);
  } else if (key === 'ok') {
    button.classList.add('key-ok');
    button.textContent = 'OK';
    button.setAttribute('aria-label', `Confirmar resposta, ${playerLabel}`);
  } else {
    button.textContent = label;
    button.setAttribute('aria-label', `${label}, ${playerLabel}`);
  }
  return button;
}

/**
 * Cria o teclado.
 * @param {{ playerLabel: string, onDigit: (d: string) => void, onErase: () => void, onSubmit: () => void }} options
 * @returns {{ element: HTMLElement, setEnabled: (on: boolean) => void }}
 */
export function createKeypad({ playerLabel, onDigit, onErase, onSubmit }) {
  const element = document.createElement('div');
  element.className = 'keypad';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', `Teclado numérico, ${playerLabel}`);

  for (const key of LAYOUT) {
    element.appendChild(makeButton(key, key, playerLabel));
  }

  const press = (event) => {
    const button = event.target.closest('button.key');
    if (!button || button.disabled) return;
    const { key } = button.dataset;
    if (key === 'erase') onErase();
    else if (key === 'ok') onSubmit();
    else onDigit(key);
  };

  // pointerdown responde na hora e aceita toques simultâneos dos dois jogadores
  // (o navegador costuma descartar o click quando há dois dedos na tela).
  element.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    press(event);
  });
  // click só para ativação por teclado/leitor de tela (detail === 0).
  element.addEventListener('click', (event) => {
    if (event.detail === 0) press(event);
  });

  return {
    element,
    setEnabled(on) {
      element.classList.toggle('is-disabled', !on);
      element.querySelectorAll('button').forEach((b) => { b.disabled = !on; });
    },
  };
}

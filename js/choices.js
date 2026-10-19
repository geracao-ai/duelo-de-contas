// Quatro botões grandes com respostas prontas (nível Fácil). Cada instância pertence a um jogador.

import { CHOICE_COUNT } from './problems.js';

/**
 * Cria o painel de opções.
 * @param {{ playerLabel: string, onChoose: (index: number) => void }} options
 * @returns {{ element: HTMLElement, update: (values: number[]|null, eliminated: number[], enabled: boolean) => void }}
 */
export function createChoices({ playerLabel, onChoose }) {
  const element = document.createElement('div');
  element.className = 'choices';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', `Opções de resposta, ${playerLabel}`);

  const buttons = [];
  for (let i = 0; i < CHOICE_COUNT; i++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice';
    button.dataset.index = String(i);
    buttons.push(button);
    element.appendChild(button);
  }

  const press = (event) => {
    const button = event.target.closest('button.choice');
    if (!button || button.disabled) return;
    onChoose(Number(button.dataset.index));
  };

  // pointerdown aceita toques simultâneos dos dois jogadores (como no teclado numérico).
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
    update(values, eliminated, enabled) {
      buttons.forEach((button, i) => {
        const value = values?.[i];
        const text = value === undefined ? '' : String(value);
        if (button.textContent !== text) button.textContent = text;
        const out = eliminated.includes(value);
        button.classList.toggle('is-out', out);
        button.disabled = !enabled || out || value === undefined;
        button.setAttribute('aria-label', `Resposta ${text}, ${playerLabel}`);
      });
      element.classList.toggle('is-disabled', !enabled);
    },
  };
}

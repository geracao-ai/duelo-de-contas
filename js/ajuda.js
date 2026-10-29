// Ajuda: temas, ordem dos botões e passos em texto (lidos pelo leitor de tela). Sem DOM.
// As ilustrações ficam em js/ajuda-desenho.js. Ver a issue #32.

/** Temas da Ajuda, na ordem padrão. `titulo` aparece no botão e no alto da tela do tema. */
export const TEMAS = [
  { id: 'amigo', titulo: 'Jogar com um amigo', cor: 'btn-purple' },
  { id: 'iphone', titulo: 'Salvar no iPhone', cor: 'btn-blue' },
  { id: 'android', titulo: 'Salvar no Android', cor: 'btn-green' },
];

export const TITULO_DO_TEMA = {
  amigo: 'Jogar com um amigo',
  iphone: 'Salvar no iPhone (Safari)',
  android: 'Salvar no Android (Chrome)',
};

/** Passos de cada tema, iguais às notas da ilustração. */
export const PASSOS = {
  amigo: [
    'Um de vocês toca em Criar sala.',
    'Aparece um PIN de 6 números.',
    'Passe o PIN para o amigo: falando ou pelo botão Enviar convite.',
    'O amigo toca em Entrar com PIN e digita o número que recebeu.',
    'Cada um escolhe um bichinho, e quem criou a sala toca em Começar!',
  ],
  iphone: [
    'No Safari, toque em Compartilhar (o quadrado com a seta para cima). Se não aparecer, toque em ••• e depois em Compartilhar.',
    'Toque em Adicionar à Tela de Início.',
    'Toque em Adicionar, no canto de cima.',
    'Pronto! O jogo fica na tela de início, como um app.',
  ],
  android: [
    'No Chrome, toque nos três pontinhos, no canto de cima.',
    'Toque em Adicionar à tela inicial ou em Instalar app.',
    'Toque em Instalar.',
    'Pronto! O jogo fica na tela inicial, como um app.',
  ],
};

export const ORIGENS = ['menu', 'desafiar'];

/** 'ios', 'android' ou null, pelo user agent (só para escolher o botão em destaque; nada é guardado). */
export function sistemaDoAparelho(userAgent = '', { toques = 0 } = {}) {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  if (/macintosh/i.test(userAgent) && toques > 1) return 'ios'; // iPad se apresenta como Mac
  return null;
}

/** Temas na ordem dos botões: o do aparelho detectado vem logo depois de "amigo", em destaque. */
export function temasDaAjuda(sistema = null) {
  const doAparelho = sistema === 'ios' ? 'iphone' : sistema === 'android' ? 'android' : null;
  const lista = TEMAS.map((t) => ({ ...t, destaque: t.id === doAparelho }));
  if (doAparelho === 'android') {
    const [amigo, iphone, android] = lista;
    return [amigo, android, iphone];
  }
  return lista;
}

export const temaValido = (tema) => TEMAS.some((t) => t.id === tema);

/** Propriedades do evento `ajuda_aberta` (valores fixos; nada pessoal). */
export function ajudaProps(tema, origem) {
  return {
    tema: temaValido(tema) ? tema : 'amigo',
    origem: ORIGENS.includes(origem) ? origem : 'menu',
  };
}

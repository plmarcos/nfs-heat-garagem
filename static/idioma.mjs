// Idioma da interface: catálogo de textos, escolha na primeira abertura e
// formatação de número por local.
//
// **Onde a escolha é guardada, e por quê.** Em `localStorage`, não no
// `config.json` do servidor. O `config.json` é preferência *do servidor* (onde
// está o acervo) e o navegador não escreve nele sem uma rota POST — e o servidor
// hoje é só GET. Abrir POST para guardar um par de letras traria CSRF e guarda de
// origem para resolver um problema que o cliente resolve sozinho. O preço é que a
// janela de desktop e o navegador têm armazenamentos separados e cada um pergunta
// uma vez; é o comportamento certo, já que são dois clientes.
//
// Todo acesso vem embrulhado em try/catch: em janela privada, com dado de site
// bloqueado ou durante a captura de miniatura, o acessor **lança** em vez de
// devolver vazio, e uma preferência não pode derrubar o app.

const CHAVE = 'nfsg.idioma.v1';
const PADRAO = 'pt';

export const IDIOMAS = [
  { cod: 'pt', nome: 'Português', local: 'pt-BR' },
  { cod: 'en', nome: 'English', local: 'en-US' },
];

// O catálogo. Valor de texto simples é string; valor que depende de número ou de
// argumento é função, porque plural e concordância não se resolvem com
// substituição de marcador: em português "1 opção"/"2 opções" muda a palavra, e
// tentar montar isso com `${n} opç${n>1?'ões':'ão'}` espalha gramática pelo
// código de tela.
const TEXTOS = {};

let _idioma = null;

function valido(cod) {
  return IDIOMAS.some((i) => i.cod === cod) ? cod : null;
}

/** O que está guardado, ou null se o usuário ainda não escolheu. */
export function idiomaSalvo() {
  try {
    return valido(localStorage.getItem(CHAVE));
  } catch {
    return null;   // armazenamento bloqueado: trata como "ainda não escolheu"
  }
}

export function idioma() {
  return _idioma || idiomaSalvo() || PADRAO;
}

export function local() {
  return (IDIOMAS.find((i) => i.cod === idioma()) || IDIOMAS[0]).local;
}

/** Define o idioma, grava, ajusta o `lang` do documento e repinta o DOM. */
export function definirIdioma(cod, { gravar = true } = {}) {
  _idioma = valido(cod) || PADRAO;
  if (gravar) {
    try { localStorage.setItem(CHAVE, _idioma); } catch { /* segue sem lembrar */ }
  }
  // O `lang` não é decoração: leitor de tela escolhe a voz por ele, e o
  // navegador usa para hifenização e para as aspas tipográficas.
  document.documentElement.lang = local();
  aplicarNoDom();
  return _idioma;
}

/**
 * Texto por chave. Chave sem tradução devolve a própria chave e avisa no
 * console -- some na tela como texto estranho, que é visível, em vez de virar
 * `undefined` ou string vazia, que passa despercebido.
 */
export function t(chave, ...args) {
  const entrada = TEXTOS[chave];
  if (!entrada) {
    console.warn('[i18n] sem texto para a chave "%s"', chave);
    return chave;
  }
  const valor = entrada[idioma()] ?? entrada[PADRAO];
  return typeof valor === 'function' ? valor(...args) : valor;
}

/** A chave existe no catálogo? Usado pelos testes de completude. */
export function temTexto(chave) {
  return Object.prototype.hasOwnProperty.call(TEXTOS, chave);
}

export function chaves() {
  return Object.keys(TEXTOS);
}

export function registrar(novos) {
  Object.assign(TEXTOS, novos);
}

// ------------------------------------------------------------- números ----

// Número por local. Sem isto a ficha sairia com `1.495 kg` e `8.000 rpm` para
// quem escolheu inglês -- que um leitor de inglês lê como 1,495 e 8,0, ou seja,
// a massa do carro erra por um fator de mil. Separador é parte da tradução.
export function num(valor, casas = 0) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return new Intl.NumberFormat(local(), {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(valor);
}

// ----------------------------------------------------------------- DOM ----

// `data-i18n="chave"` troca o texto; `data-i18n-attr="attr:chave"` troca um
// atributo (placeholder, aria-label, title), separando vários por vírgula.
export function aplicarNoDom(raiz = document) {
  for (const el of raiz.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  // `data-i18n-html` para o texto que carrega marcacao -- negrito, <code>. Sem
  // isto a conversao achata a frase: foi o que aconteceu com o aviso de pausa,
  // que perdeu os negritos e as duas referencias a arquivo. O `innerHTML` aqui
  // e' seguro porque a fonte e' o catalogo estatico do proprio app, nunca dado
  // de fora -- e o catalogo marca essas chaves com o sufixo `Html`.
  for (const el of raiz.querySelectorAll('[data-i18n-html]')) {
    el.innerHTML = t(el.dataset.i18nHtml);
  }
  for (const el of raiz.querySelectorAll('[data-i18n-attr]')) {
    for (const par of el.dataset.i18nAttr.split(',')) {
      const [attr, chave] = par.split(':').map((s) => s.trim());
      if (attr && chave) el.setAttribute(attr, t(chave));
    }
  }
  const titulo = document.querySelector('title[data-i18n-titulo]');
  if (titulo) document.title = t(titulo.dataset.i18nTitulo);
}

// ------------------------------------------------------------- escolha ----

/**
 * Primeira abertura: pergunta o idioma e só resolve quando o usuário escolhe.
 * Se já houver escolha guardada, aplica e resolve na hora, sem mostrar nada.
 *
 * A pergunta vem antes de carregar o acervo de propósito: as mensagens de
 * progresso da própria carga ("lendo o acervo") já saem no idioma escolhido, em
 * vez de piscarem em português e trocarem no meio.
 */
export function escolherIdiomaSePreciso() {
  const salvo = idiomaSalvo();
  if (salvo) { definirIdioma(salvo, { gravar: false }); return Promise.resolve(salvo); }

  const el = document.getElementById('escolha-idioma');
  if (!el) { definirIdioma(PADRAO, { gravar: false }); return Promise.resolve(PADRAO); }

  return new Promise((resolver) => {
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('visivel'));
    const botoes = [...el.querySelectorAll('[data-idioma]')];
    botoes[0]?.focus();

    const escolher = (cod) => {
      el.classList.remove('visivel');
      document.removeEventListener('keydown', aoTeclar, true);
      setTimeout(() => { el.hidden = true; }, 240);
      resolver(definirIdioma(cod));
    };

    const aoTeclar = (e) => {
      // Sem `Escape` aqui: não existe "cancelar" -- a interface precisa de um
      // idioma para desenhar. As setas andam entre as opções, como em menu.
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const i = botoes.indexOf(document.activeElement);
        const passo = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
        botoes[(Math.max(0, i) + passo + botoes.length) % botoes.length]?.focus();
      }
    };

    document.addEventListener('keydown', aoTeclar, true);
    for (const b of botoes) {
      b.addEventListener('click', () => escolher(b.dataset.idioma), { once: true });
    }
  });
}

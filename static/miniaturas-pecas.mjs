// Miniaturas das pecas do carrossel.
//
// **Um** renderer offscreen compartilhado para as 13.834 pecas do acervo. Um
// por cartao estouraria o limite de contexto WebGL do navegador em poucos
// segundos de rolagem. IntersectionObserver so' enfileira o que esta' na tela,
// e a fila roda em serie com pausa entre itens, para o carro continuar girando
// a 60 fps enquanto as miniaturas aparecem.

import * as THREE from 'three';
import { buscar, geometrias } from './nfsg.mjs';

const LARGURA = 320;
const ALTURA = 196;
const PAUSA_MS = 24;
const TETO_CACHE = 180;

// Angulo por slot: um escapamento fotografado de frente nao diz nada.
const ANGULOS = {
  bumperr: [-.2, .35, -1], taillights: [-.2, .35, -1], diffuser: [-.3, .5, -1],
  spoiler: [-.7, .45, -1], boot: [-.4, .55, -1], exhausts: [-.6, .4, -1],
  bumperchassisr: [-.3, .4, -1], canardsr: [-.4, .4, -1],
  skirts: [-1, .25, .12], fenderfl: [-1, .3, .35], fendersr: [-1, .3, -.35],
  doorl: [-1, .2, 0], mirrorl: [-1, .35, .3], mirrorbasel: [-1, .35, .3],
  hood: [-.45, .9, .55], roof: [-.4, 1, 0],
  wheelfl: [-1, .12, .08], wheelrl: [-1, .12, .08],
};
const PADRAO = [.75, .42, .82];

let renderer = null;
let cena = null;
let camera = null;
let luzes = null;

// Espera o navegador ter folga antes do proximo item. Com pausa fixa a fila
// andava em cima do quadro do carro e o medidor caia para ~19 fps enquanto
// enchia o carrossel; em tempo ocioso o carro continua em 60.
function _ocioso() {
  return new Promise((r) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => r(), { timeout: 400 });
    } else {
      setTimeout(r, PAUSA_MS);
    }
  });
}

function iniciar() {
  if (renderer) return;
  const tela = document.createElement('canvas');
  tela.width = LARGURA;
  tela.height = ALTURA;
  renderer = new THREE.WebGLRenderer({
    canvas: tela, antialias: true, alpha: true, preserveDrawingBuffer: true,
  });
  renderer.setSize(LARGURA, ALTURA, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  cena = new THREE.Scene();
  // Fundo de estudio. Sem ele, uma peca de chassi preta sobre cartao preto e'
  // um retangulo vazio -- foi exatamente o que apareceu no primeiro teste.
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#26333d');
  g.addColorStop(.62, '#161f26');
  g.addColorStop(1, '#0a1014');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const fundo = new THREE.CanvasTexture(c);
  fundo.colorSpace = THREE.SRGBColorSpace;
  cena.background = fundo;

  camera = new THREE.PerspectiveCamera(32, LARGURA / ALTURA, .01, 60);

  luzes = new THREE.Group();
  luzes.add(new THREE.HemisphereLight(0xcfe4ef, 0x1a222a, 2.0));
  const chave = new THREE.DirectionalLight(0xffffff, 3.4);
  chave.position.set(2.2, 3.0, 2.8);
  luzes.add(chave);
  const preenche = new THREE.DirectionalLight(0xdce7f0, 1.3);
  preenche.position.set(-2.6, 1.0, 1.8);
  luzes.add(preenche);
  // Uma pitada de ciano por tras, so' para descolar a peca do fundo escuro do
  // cartao. Mais que isso e todas as pecas viram azuis e param de se distinguir.
  const contra = new THREE.DirectionalLight(0x00e5ff, .9);
  contra.position.set(-1.6, 1.6, -2.6);
  luzes.add(contra);
  cena.add(luzes);
}

// Neutraliza a pintura: comparar silhueta e' o ponto da miniatura, e duas
// pecas em cores diferentes ficam impossiveis de comparar.
function materialNeutro(papel) {
  // Tons levantados de proposito: o papel importa (pintura clara, plastico
  // escuro, cromo espelhado), mas nada pode ficar tao escuro que suma no fundo.
  const cores = {
    pintura: 0x9aa2aa, acabamento: 0x4a4f56, vidro: 0x5a656e,
    lente: 0xccd6dc, lampada: 0xe8eef2, cromo: 0xc9ced4,
    aro: 0xa8acb2, pneu: 0x2a2b2e, grade: 0x3a3f44,
    plastico: 0x3f444a, chassi: 0x4c525a, metal: 0x8b9199,
  };
  const m = new THREE.MeshStandardMaterial({
    color: cores[papel] ?? 0x5c646c,
    roughness: papel === 'cromo' || papel === 'aro' ? .18 : .55,
    metalness: papel === 'cromo' || papel === 'aro' ? 1 : .15,
  });
  return m;
}

export class MiniaturasPecas {
  constructor() {
    this.cache = new Map();          // chave -> dataURL
    this.fila = [];
    this.rodando = false;
    this.observador = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) {
          this.observador.unobserve(e.target);
          this._enfileirar(e.target);
        }
      }
    }, { rootMargin: '60px' });
  }

  // `cartao` precisa de dataset.chave e dataset.url; sem url (ORIGINAL) sai.
  observar(cartao) {
    const chave = cartao.dataset.chave;
    if (!chave || !cartao.dataset.url) return;
    const pronta = this.cache.get(chave);
    if (pronta) return this._pintar(cartao, pronta);
    this.observador.observe(cartao);
  }

  _enfileirar(cartao) {
    this.fila.push(cartao);
    if (!this.rodando) this._bombear();
  }

  async _bombear() {
    this.rodando = true;
    while (this.fila.length) {
      const cartao = this.fila.shift();
      if (!cartao.isConnected) continue;
      const chave = cartao.dataset.chave;
      if (this.cache.has(chave)) {
        this._pintar(cartao, this.cache.get(chave));
        continue;
      }
      try {
        const url = await this._render(cartao.dataset.url, cartao.dataset.slot);
        this._guardar(chave, url);
        this._pintar(cartao, url);
      } catch (e) {
        if (e.name !== 'AbortError') cartao.classList.add('sem-miniatura');
      }
      cartao.classList.remove('carregando');
      await _ocioso();
    }
    this.rodando = false;
  }

  _guardar(chave, url) {
    this.cache.set(chave, url);
    while (this.cache.size > TETO_CACHE) {
      this.cache.delete(this.cache.keys().next().value);
    }
  }

  _pintar(cartao, url) {
    const arte = cartao.querySelector('.arte');
    if (!arte) return;
    arte.style.backgroundImage = `url(${url})`;
    arte.style.backgroundSize = 'cover';
    arte.style.backgroundPosition = 'center';
    cartao.classList.remove('carregando');
  }

  async _render(url, slot) {
    iniciar();
    const pacote = await buscar(url);
    const grupo = new THREE.Group();
    const materiais = [];

    const specs = pacote.cabecalho.materiais || {};
    for (const { geometria, grupos } of geometrias(THREE, pacote)) {
      const mats = grupos.map((g) => {
        const m = materialNeutro(specs[g.material]?.papel || 'generico');
        materiais.push(m);
        return m;
      });
      grupo.add(new THREE.Mesh(geometria, mats));
    }

    cena.add(grupo);
    try {
      const caixa = new THREE.Box3().setFromObject(grupo);
      const centro = caixa.getCenter(new THREE.Vector3());
      const tam = caixa.getSize(new THREE.Vector3());
      const raio = Math.max(tam.length() / 2, .02);
      const dir = new THREE.Vector3(...(ANGULOS[slot] || PADRAO)).normalize();
      // 0,88 aperta o enquadramento: a peca tem que encher o cartao, senao 58
      // miniaturas viram 58 manchinhas iguais.
      const dist = raio / Math.sin((camera.fov * Math.PI / 180) / 2) * .88;
      camera.position.copy(centro).addScaledVector(dir, dist);
      camera.lookAt(centro);
      camera.updateProjectionMatrix();
      renderer.render(cena, camera);
      return renderer.domElement.toDataURL('image/webp', .82);
    } finally {
      cena.remove(grupo);
      grupo.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      materiais.forEach((m) => m.dispose());
    }
  }

  limpar() {
    this.fila.length = 0;
    this.observador.disconnect();
    this.observador = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) {
          this.observador.unobserve(e.target);
          this._enfileirar(e.target);
        }
      }
    }, { rootMargin: '60px' });
  }
}

// Orquestra a garagem: cena, HUD, trilha de categorias e carrossel de pecas.

import * as THREE from 'three';
import { OrbitControls } from './three/OrbitControls.js';
import { RoomEnvironment } from './three/RoomEnvironment.js';
import { criarGaragem } from './garagem-heat.mjs';
import { MontadorVeiculo } from './montagem.mjs';
import { icone } from './icones.mjs';
import { ACABAMENTOS, CORES, aplicarPintura } from './pintura.mjs';
import { MiniaturasPecas } from './miniaturas-pecas.mjs';
import { carimbarVersao } from './nfsg.mjs';
import { desenharCurva, desenharFicha, desenharMecanica } from './barras-ficha.mjs';
import { IDIOMAS, aplicarNoDom, definirIdioma, escolherIdiomaSePreciso,
         idioma, num, t, temTexto } from './idioma.mjs';
import './textos.mjs';

const miniaturas = new MiniaturasPecas();

const $ = (id) => document.getElementById(id);

const estado = {
  acervo: null,
  carro: null,
  ficha: null,
  categoria: null,
  slot: null,
  trisBase: 0,
  pintura: { cor: '#12294d', acabamento: 'metalico' },
};

// ------------------------------------------------------------------ cena --

const tela = $('palco');
const renderer = new THREE.WebGLRenderer({ canvas: tela, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// A sala e' estatica: redesenhar o mapa de sombra 2048 a cada quadro e' o
// desperdicio mais caro que existe aqui. So' atualiza quando algo muda.
renderer.shadowMap.autoUpdate = false;

const cena = new THREE.Scene();
cena.background = new THREE.Color(0x06090c);
cena.fog = new THREE.Fog(0x06090c, 16, 46);

const camera = new THREE.PerspectiveCamera(42, 1, .1, 120);
camera.position.set(4.6, 1.75, 5.4);

const controles = new OrbitControls(camera, tela);
controles.enableDamping = true;
controles.dampingFactor = .07;
controles.minDistance = 2.4;
controles.maxDistance = 13;
controles.minPolarAngle = .18;
controles.maxPolarAngle = 1.52;   // nunca por baixo do piso
controles.target.set(0, .75, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
cena.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;

const sala = criarGaragem(cena, renderer);
const montador = new MontadorVeiculo(cena, renderer, camera);

// O HUD cobre quatro bordas da tela, entao o centro do canvas **nao** e' o
// centro da area util: centrar o carro no canvas o deixa metade escondido atras
// do carrossel. Estas medidas vem dos mesmos tokens do CSS.
function recortes() {
  const s = getComputedStyle(document.documentElement);
  const px = (n) => parseFloat(s.getPropertyValue(n)) || 0;
  return {
    topo: px('--topo'), esquerda: px('--trilha'),
    direita: px('--inspetor'), baixo: px('--carrossel') + px('--rodape'),
  };
}

// Area onde o carro realmente aparece.
function palco() {
  const r = recortes();
  return {
    largura: Math.max(240, innerWidth - r.esquerda - r.direita),
    altura: Math.max(200, innerHeight - r.topo - r.baixo),
    dx: (r.esquerda - r.direita) / 2,   // deslocamento do centro util
    dy: (r.topo - r.baixo) / 2,
  };
}

function redimensionar() {
  const l = innerWidth, a = innerHeight;
  renderer.setSize(l, a, false);
  camera.aspect = l / a;

  // Desloca o ponto principal da projecao em vez de mexer no alvo da orbita:
  // assim o carro fica centrado no palco e girar continua em torno dele.
  const p = palco();
  camera.setViewOffset(l, a, -p.dx, -p.dy, l, a);
  camera.updateProjectionMatrix();
  invalidar();
}
addEventListener('resize', redimensionar);

let precisaSombra = true;
function invalidar() { precisaSombra = true; }

// ------------------------------------------------------------- medidor ----

const quadros = [];
let ultimo = performance.now();
let giroOcioso = 0;

function laco(agora) {
  requestAnimationFrame(laco);
  const dt = Math.min((agora - ultimo) / 1000, .1);
  ultimo = agora;

  quadros.push(dt);
  if (quadros.length > 90) quadros.shift();

  sala.atualizar(dt);

  // Prato giratorio depois de 6 s parado, como vitrine. Gira a posicao e deixa
  // o OrbitControls reorientar: chamar lookAt aqui brigaria com ele.
  giroOcioso += dt;
  if (giroOcioso > 6 && !document.hidden && !animacao) {
    const raio = Math.hypot(camera.position.x - controles.target.x,
                            camera.position.z - controles.target.z);
    const ang = Math.atan2(camera.position.z - controles.target.z,
                           camera.position.x - controles.target.x) + dt * .05;
    camera.position.x = controles.target.x + Math.cos(ang) * raio;
    camera.position.z = controles.target.z + Math.sin(ang) * raio;
  }

  controles.update();

  if (precisaSombra) {
    renderer.shadowMap.needsUpdate = true;
    precisaSombra = false;
  }
  renderer.render(cena, camera);
}

controles.addEventListener('start', () => { giroOcioso = 0; });
setInterval(() => {
  if (!quadros.length) return;
  const media = quadros.reduce((a, b) => a + b, 0) / quadros.length;
  $('chip-fps').textContent = String(Math.round(1 / media));
}, 700);

// --------------------------------------------------------------- aviso ----

let temporizadorAviso = 0;
// Guarda contra a volta de um defeito que passou despercebido por semanas: material
// sem `envMap` proprio tem o `envMapIntensity` dele trocado por 1.0 pelo renderer
// (ver o comentario do construtor em materiais.mjs). Nao da' erro, nao da' aviso --
// a cena so' fica errada, e o numero escrito no codigo vira ficcao. Se algum dia
// alguem soltar o vinculo, isto aparece no console em vez de virar cacada de bug.
function conferirAmbienteDosMateriais() {
  if (!cena.environment) return;
  const orfaos = [];
  montador.raiz.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (m && m.isMeshStandardMaterial && !m.envMap) orfaos.push(m.name || '?');
    }
  });
  if (orfaos.length) {
    console.warn('[garagem] %d material(is) sem envMap proprio: o envMapIntensity deles ' +
      'sera ignorado pelo renderer. Exemplos: %s', orfaos.length, orfaos.slice(0, 5).join(', '));
  }
}

// Alternador PT/EN do rodape. Redesenha a interface inteira na hora: as partes
// estaticas saem do `data-i18n` e as dinamicas (trilha, carrossel, ficha) sao
// remontadas, porque ja' foram escritas no DOM no idioma anterior.
function montarAlternadorIdioma(aoTrocar) {
  const caixa = $('alternar-idioma');
  if (!caixa) return;
  caixa.textContent = '';
  for (const lang of IDIOMAS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = lang.cod.toUpperCase();
    b.dataset.idioma = lang.cod;
    b.lang = lang.local;
    b.title = lang.nome;
    b.setAttribute('aria-pressed', String(lang.cod === idioma()));
    b.addEventListener('click', () => {
      if (lang.cod === idioma()) return;
      definirIdioma(lang.cod);
      for (const outro of caixa.querySelectorAll('button')) {
        outro.setAttribute('aria-pressed', String(outro.dataset.idioma === idioma()));
      }
      aoTrocar();
    });
    caixa.appendChild(b);
  }
}

// Tela de quem ainda nao tem os arquivos. Monta os botoes a partir dos links
// que o servidor manda (`config.py`), e nao mostra botao para link vazio.
function mostrarSemAcervo(links) {
  const tela = $('sem-acervo');
  const caixa = $('links-acervo');
  if (!tela || !caixa) return;
  caixa.textContent = '';

  // Na janela de desktop existe seletor de pasta nativo; no navegador nao ha'
  // como abri-lo, entao ali o botao nao aparece e sobra a linha de comando.
  if (new URLSearchParams(location.search).get('janela') === '1') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'botao';
    b.textContent = t('semAcervo.escolher');
    b.addEventListener('click', () => {
      b.disabled = true;
      b.textContent = t('semAcervo.escolhendo');
      // A janela observa a propria URL; nao ha' ponte JS nem rota de escrita.
      location.href = '/escolher-pasta';
    });
    caixa.appendChild(b);
  }

  for (const [chave, url] of [['ferramentas', links.ferramentas], ['proprio', links.proprio]]) {
    if (!url) continue;
    const a = document.createElement('a');
    a.className = 'botao secundario';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = t(`semAcervo.${chave}`);
    caixa.appendChild(a);
  }

  // O lancador da janela devolve  quando a pasta escolhida nao serve.
  // Sem isso a tela recarrega igual e parece que o botao nao fez nada.
  const erro = new URLSearchParams(location.search).get('erro');
  const chaveErro = { pasta: 'semAcervo.erroPasta', servidor: 'semAcervo.erroServidor' }[erro];
  const antigo = tela.querySelector('.erro');
  if (antigo) antigo.remove();
  if (chaveErro) {
    const p = document.createElement('p');
    p.className = 'erro';
    p.innerHTML = t(chaveErro);
    caixa.insertAdjacentElement('afterend', p);
  }

  aplicarNoDom(tela);
  tela.hidden = false;
  const ab = $('abertura');
  if (ab) ab.remove();
  document.title = t('app.titulo');
}

// Aviso de estado do projeto, a cada abertura. Nao e' dica de primeiro uso nem
// "tour": e' o recado de que o trabalho esta' parado e de que qualquer um pode
// mexer. Por isso aparece **sempre**, sem "nao mostrar de novo" -- quem abre o
// app pela primeira vez daqui a um ano precisa da mesma informacao que quem
// abriu ontem. E por isso sai facil: botao, Esc, ou clique no fundo.
function mostrarAvisoPausado() {
  const el = $('pausado');
  if (!el) return;
  const focoAnterior = document.activeElement;
  const botao = $('btn-pausado');

  el.hidden = false;
  el.setAttribute('aria-hidden', 'false');
  // Um quadro entre sair do `display:none` e ganhar a classe, senao o navegador
  // resolve os dois no mesmo estilo calculado e a transicao nao dispara.
  requestAnimationFrame(() => el.classList.add('visivel'));
  botao?.focus();

  const fechar = () => {
    el.classList.remove('visivel');
    el.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', aoTeclar, true);
    setTimeout(() => { el.hidden = true; }, 240);
    if (focoAnterior && typeof focoAnterior.focus === 'function') focoAnterior.focus();
  };

  const aoTeclar = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); fechar(); return; }
    // Enquanto o aviso esta' aberto ele e' modal: o Tab nao pode vazar para o HUD
    // atras, senao o foco some numa tela que o usuario nem esta' vendo.
    if (e.key === 'Tab') { e.preventDefault(); botao?.focus(); }
  };

  document.addEventListener('keydown', aoTeclar, true);
  botao?.addEventListener('click', fechar, { once: true });
  el.addEventListener('click', (e) => { if (e.target === el) fechar(); });
}

function avisar(texto, ms = 3200) {
  const el = $('aviso');
  el.textContent = texto;
  el.classList.add('visivel');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => el.classList.remove('visivel'), ms);
}

// -------------------------------------------------------------- camera ----

function enquadrar({ imediato = false } = {}) {
  const caixa = montador.caixa();
  if (!caixa) return;
  const centro = caixa.getCenter(new THREE.Vector3());
  const tam = caixa.getSize(new THREE.Vector3());

  // Enquadra pela diagonal horizontal e pela altura ao mesmo tempo, senao um
  // carro comprido e baixo (que e' quase todo o acervo) sai cortado nas pontas.
  // A conta usa o tamanho do **palco**, nao o da tela: o HUD come 88 px a'
  // esquerda, 320 a' direita e 210 embaixo.
  // A altura visivel a uma distancia d ocupa `innerHeight` pixels; o palco tem
  // so' `p.altura`. Daí a regra de tres em cada eixo.
  const p = palco();
  const k = 2 * Math.tan((camera.fov * Math.PI / 180) / 2);
  const porAltura = (tam.y * innerHeight) / (k * p.altura);
  const porLargura = (Math.hypot(tam.x, tam.z) * innerHeight) / (k * p.largura);
  let dist = Math.max(porAltura, porLargura) * 1.28;

  controles.target.set(centro.x, centro.y * .95, centro.z);
  const dir = new THREE.Vector3(.72, .30, .62).normalize();

  // Numa janela estreita o palco fica pequeno e a conta pede uma distancia que
  // poe a camera do lado de fora da parede -- e ai' nao se ve' nada. Aqui a
  // distancia e' cortada no ponto em que o raio encostaria na sala; se o carro
  // nao couber, abre o campo de visao em vez de atravessar o muro.
  const lim = sala.limites;
  for (const [eixo, faixa] of [['x', lim.x], ['y', lim.y], ['z', lim.z]]) {
    const d = dir[eixo];
    if (Math.abs(d) < 1e-4) continue;
    const borda = d > 0 ? faixa[1] : faixa[0];
    dist = Math.min(dist, (borda - controles.target[eixo]) / d);
  }
  dist = Math.max(dist, 2.6);

  const precisa = Math.max(porAltura, porLargura) * 1.28;
  const fov = precisa > dist
    ? Math.min(78, camera.fov * (precisa / dist))
    : 42;
  if (Math.abs(fov - camera.fov) > .5) camera.fov = fov;

  const alvo = controles.target.clone().add(dir.multiplyScalar(dist));
  alvo.y = Math.max(alvo.y, .8);

  controles.maxDistance = Math.max(13, dist * 1.8);
  redimensionar();
  if (imediato) camera.position.copy(alvo);
  else animarCamera(alvo);
  giroOcioso = 0;
  controles.update();
  invalidar();
}

let animacao = null;
function animarCamera(destino, ms = 520) {
  const origem = camera.position.clone();
  const inicio = performance.now();
  if (animacao) cancelAnimationFrame(animacao);
  const passo = () => {
    const t = Math.min((performance.now() - inicio) / ms, 1);
    const e = t * t * (3 - 2 * t);
    camera.position.lerpVectors(origem, destino, e);
    if (t < 1) animacao = requestAnimationFrame(passo);
    else animacao = null;
  };
  passo();
}

// ---------------------------------------------------------------- HUD -----

function atualizarChips() {
  const tris = montador.triangulos();
  $('chip-tris').textContent = num(tris);
  const total = (estado.ficha?.categorias || [])
    .reduce((n, c) => n + c.slots.length, 0);
  $('chip-pecas').textContent = `${montador.pecasTrocadas()}/${total}`;
  atualizarFicha();
}

function medidasDoCarro() {
  const caixa = montador.caixa();
  return {
    larguraMm: caixa ? Math.round((caixa.max.x - caixa.min.x) * 1000) : 0,
    comprimentoMm: caixa ? Math.round((caixa.max.z - caixa.min.z) * 1000) : 0,
    alturaMm: caixa ? Math.round((caixa.max.y - caixa.min.y) * 1000) : 0,
    triangulos: montador.triangulos(),
  };
}

function atualizarFicha() {
  // A Mecanica e a curva vem junto: quando o idioma troca, nao basta redesenhar
  // as barras -- o painel ao lado ficaria na lingua anterior, com separador de
  // milhar do idioma anterior, que foi o defeito que apareceu no teste.
  const f = estado.ficha?.ficha || null;
  desenharMecanica($('mecanica'), f);
  desenharCurva($('curva'), f);
  desenharFicha($('ficha'), {
    ficha: estado.ficha?.ficha || null,
    faixas: estado.acervo?.ficha?.faixas || null,
    geometria: medidasDoCarro(),
    base: estado.medidasBase,
  });
}

function atualizarRodas() {
  const m = montador.medidasRodas;
  const el = $('detalhe-rodas');
  if (!m) {
    el.innerHTML = `<p class="indisponivel">${t('rodas.indisponivel')}</p>`;
    return;
  }
  const mm = (v) => `${num(Math.round(v * 1000))} ${t('unidade.mm')}`;
  el.innerHTML = `
    <div class="linha-dado"><span>${t('rodas.diamFrente')}</span><b>${mm(m.diamFrente)}</b></div>
    <div class="linha-dado"><span>${t('rodas.diamTras')}</span><b>${mm(m.diamTras)}</b></div>
    <div class="linha-dado"><span>${t('rodas.largFrente')}</span><b>${mm(m.largFrente)}</b></div>
    <div class="linha-dado"><span>${t('rodas.largTras')}</span><b>${mm(m.largTras)}</b></div>
    <div class="linha-dado"><span>${t('rodas.meiaBitola')}</span><b>${mm(m.meiaBitolaF)}</b></div>
    <div class="linha-dado"><span>${t('rodas.entreEixos')}</span><b>${mm(m.zFrente - m.zTras)}</b></div>
    <p class="procedencia">${t('rodas.nota')}</p>`;
}

// ------------------------------------------------------- trilha e carros --

// A pintura nao tem malha propria, entao o servidor nao a lista; ela entra
// aqui, na frente, porque e' a primeira coisa que qualquer um mexe.
const CAT_PINTURA = { id: 'pintura', slots: [], sintetica: true };

// O servidor manda `id` e `rotulo`; o rotulo dele e' so' reserva. Traduzir pela
// chave mantem o Python neutro de idioma -- e uma categoria nova sem traducao
// aparece com o nome do servidor em vez de sumir da trilha.
function rotuloCategoria(cat) {
  return temTexto(`categoria.${cat.id}`) ? t(`categoria.${cat.id}`) : (cat.rotulo || cat.id);
}

function categorias() {
  return [CAT_PINTURA, ...(estado.ficha?.categorias || [])];
}

function montarTrilha() {
  const trilha = $('trilha');
  trilha.innerHTML = '';
  const cats = categorias();
  for (const cat of cats) {
    const n = cat.slots.reduce((s, x) => s + x.variantes.length, 0);
    const b = document.createElement('button');
    b.className = 'aba';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', 'false');
    b.dataset.categoria = cat.id;
    b.innerHTML = `${icone(cat.id)}<span class="nome">${rotuloCategoria(cat)}</span>`
                + (n ? `<span class="contagem">${n}</span>` : '');
    b.addEventListener('click', () => escolherCategoria(cat.id));
    trilha.appendChild(b);
  }
  if (cats.length) escolherCategoria(cats[0].id);
}

function marcarAbasAlteradas() {
  for (const b of $('trilha').querySelectorAll('.aba')) {
    const cat = categorias().find((c) => c.id === b.dataset.categoria);
    const mudou = cat?.slots.some((s) => {
      const padrao = s.tipo === 'adicionar' ? 'nenhuma' : 'original';
      return (montador.escolhas.get(s.slot) || padrao) !== padrao;
    });
    b.classList.toggle('alterada', !!mudou);
  }
}

function escolherCategoria(id) {
  estado.categoria = id;
  for (const b of $('trilha').querySelectorAll('.aba')) {
    b.setAttribute('aria-selected', String(b.dataset.categoria === id));
  }
  const cat = categorias().find((c) => c.id === id);
  $('titulo-carrossel').textContent = cat ? rotuloCategoria(cat) : t('carrossel.titulo');
  estado.slot = cat?.slots[0]?.slot || null;
  montarCarrossel(cat);
}

function montarCarrossel(cat) {
  const trilho = $('trilho');
  trilho.innerHTML = '';
  if (cat?.id === 'pintura') return montarPintura(trilho);
  if (!cat || !cat.slots.length) {
    $('contador-carrossel').textContent = t('carrossel.semOpcao');
    return;
  }

  // Varios slots numa categoria (Corpo tem 4): mostra todos em sequencia, com
  // o nome do slot no cartao, em vez de esconder opcao atras de um submenu.
  let total = 0;
  for (const s of cat.slots) {
    const atual = montador.escolhas.get(s.slot);
    const padrao = s.tipo === 'adicionar' ? 'nenhuma' : 'original';

    trilho.appendChild(cartao({
      slot: s.slot,
      escolha: padrao,
      titulo: t(s.tipo === 'adicionar' ? 'carrossel.nenhuma' : 'carrossel.original'),
      codigo: s.slot,
      chave: padrao === 'nenhuma' ? 'nenhuma' : 'original',
      selecionado: atual === padrao,
    }));
    total++;

    for (const v of s.variantes) {
      trilho.appendChild(cartao({
        slot: s.slot,
        escolha: v.peca,
        titulo: rotuloVariante(v, s.slot),
        codigo: t('carrossel.tri', num(v.triangulos)),
        selecionado: atual === v.peca,
        url: `/api/carro/${estado.carro}/peca/${s.slot}/${v.peca}.bin`,
      }));
      total++;
    }
  }
  $('contador-carrossel').textContent = t('carrossel.opcoes', total);
  for (const c of trilho.querySelectorAll('.cartao')) miniaturas.observar(c);
  const sel = trilho.querySelector('[aria-pressed="true"]');
  if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function montarPintura(trilho) {
  $('contador-carrossel').textContent =
    t('pintura.contador', CORES.length, ACABAMENTOS.length);

  const grade = document.createElement('div');
  grade.className = 'paleta';
  for (const cor of CORES) {
    const b = document.createElement('button');
    b.className = 'amostra';
    b.style.setProperty('--cor', cor);
    b.title = cor;
    b.setAttribute('aria-pressed', String(cor === estado.pintura.cor));
    b.addEventListener('click', () => {
      estado.pintura.cor = cor;
      pintar();
      montarCarrossel(CAT_PINTURA);
    });
    grade.appendChild(b);
  }

  const livre = document.createElement('label');
  livre.className = 'amostra livre';
  livre.innerHTML = `<input type="color" value="${estado.pintura.cor}" aria-label="${t('pintura.corLivre')}">`;
  livre.querySelector('input').addEventListener('input', (ev) => {
    estado.pintura.cor = ev.target.value;
    pintar();
  });
  grade.appendChild(livre);

  const caixaPaleta = document.createElement('div');
  caixaPaleta.className = 'bloco-pintura';
  caixaPaleta.innerHTML = `<span class="rotulo-bloco">${t('pintura.cor')}</span>`;
  caixaPaleta.appendChild(grade);
  trilho.appendChild(caixaPaleta);

  for (const a of ACABAMENTOS) {
    const b = document.createElement('button');
    b.className = 'cartao acabamento';
    b.setAttribute('aria-pressed', String(a.id === estado.pintura.acabamento));
    b.innerHTML = `<div class="arte amostra-acabamento" data-acab="${a.id}"
        style="--cor:${estado.pintura.cor}"></div>
      <div class="faixa"><span class="titulo">${t(`acabamento.${a.id}`)}</span>
      <span class="codigo">${t('pintura.acabamento').toLowerCase()}</span></div>`;
    b.addEventListener('click', () => {
      estado.pintura.acabamento = a.id;
      pintar();
      montarCarrossel(CAT_PINTURA);
    });
    trilho.appendChild(b);
  }
}

function pintar() {
  aplicarPintura(montador.fabrica.materiaisDe('pintura'), estado.pintura);
  invalidar();
  const el = $('detalhe-peca');
  const a = ACABAMENTOS.find((x) => x.id === estado.pintura.acabamento);
  el.innerHTML = `
    <div class="linha-dado"><span>${t('pintura.cor')}</span><b>${estado.pintura.cor.toUpperCase()}</b></div>
    <div class="linha-dado"><span>${t('pintura.acabamento')}</span><b>${t(`acabamento.${a.id}`)}</b></div>
    <p class="indisponivel">${t('pintura.nota')}</p>`;
}

function rotuloVariante(v, slot) {
  let nome = v.peca.startsWith(slot + '_') ? v.peca.slice(slot.length + 1) : v.peca;
  return nome.replace(/_/g, ' ').toUpperCase();
}

function cartao({ slot, escolha, titulo, codigo, chave, selecionado, url }) {
  const b = document.createElement('button');
  b.className = 'cartao' + (chave ? ' original' : ' carregando');
  b.setAttribute('role', 'option');
  b.setAttribute('aria-pressed', String(!!selecionado));
  b.dataset.slot = slot;
  b.dataset.escolha = escolha;
  if (url) {
    b.dataset.url = url;
    b.dataset.chave = `${estado.carro}|${slot}|${escolha}`;
  }
  b.innerHTML = `<div class="arte">${chave ? icone(chave) : ''}</div>
    <div class="faixa"><span class="titulo">${titulo}</span>
    <span class="codigo">${codigo}</span></div>`;
  b.addEventListener('click', () => aplicar(slot, escolha, b));
  return b;
}

async function aplicar(slot, escolha, botao) {
  const trilho = $('trilho');
  for (const c of trilho.querySelectorAll('.cartao')) {
    if (c.dataset.slot === slot) c.setAttribute('aria-pressed', 'false');
  }
  botao.setAttribute('aria-pressed', 'true');
  estado.slot = slot;
  $('estado').textContent = t('estado.aplicando');

  try {
    await montador.escolher(slot, escolha, {
      aoErro: (e) => avisar(t('erro.peca', e.message)),
    });
    // A peca nova traz materiais proprios; sem repintar ela entra cinza.
    aplicarPintura(montador.fabrica.materiaisDe('pintura'), estado.pintura);
    atualizarChips();
    marcarAbasAlteradas();
    detalharPeca(slot, escolha);
    invalidar();
    $('estado').textContent = t('estado.pronto');
  } catch (e) {
    avisar(t('erro.falhou', e.message));
    $('estado').textContent = t('estado.falhou');
  }
}

function detalharPeca(slot, escolha) {
  const el = $('detalhe-peca');
  if (escolha === 'original' || escolha === 'nenhuma') {
    el.innerHTML = `<div class="linha-dado"><span>${t('peca.slot')}</span><b>${slot}</b></div>
      <div class="linha-dado"><span>${t('peca.estado')}</span><b>${
        t(escolha === 'nenhuma' ? 'peca.semPeca' : 'peca.deFabrica')}</b></div>`;
    return;
  }
  let v = null;
  for (const c of estado.ficha.categorias) {
    const s = c.slots.find((x) => x.slot === slot);
    if (s) { v = s.variantes.find((x) => x.peca === escolha); if (v) break; }
  }
  const de = estado.ficha.pecasDe;
  el.innerHTML = `
    <div class="linha-dado"><span>${t('peca.slot')}</span><b>${slot}</b></div>
    <div class="linha-dado"><span>${t('peca.variante')}</span><b>${v?.variante || '—'}</b></div>
    <div class="linha-dado"><span>${t('peca.triangulos')}</span><b>${num(v?.triangulos || 0)}</b></div>
    <div class="linha-dado"><span>${t('peca.arquivo')}</span><b>${escolha}.obj</b></div>
    ${de ? `<p class="indisponivel">${t('peca.pecasDe', de)}</p>` : ''}`;
}

// -------------------------------------------------------------- seletor ---

function montarSeletor() {
  const lista = $('lista-carros');
  const filtro = ($('busca').value || '').trim().toLowerCase();
  lista.innerHTML = '';
  for (const c of estado.acervo.carros) {
    const alvo = `${c.rotulo} ${c.marca} ${c.ano} ${c.id}`.toLowerCase();
    if (filtro && !alvo.includes(filtro)) continue;
    const b = document.createElement('button');
    b.className = 'item-carro';
    if (c.id === estado.carro) b.setAttribute('aria-current', 'true');
    b.innerHTML = `<span class="nome">${c.rotulo}</span>
      <span class="meta">${t('seletor.meta', c.ano || '—', num(c.pecas), num(c.triangulos))}</span>`;
    b.addEventListener('click', () => { fecharSeletor(); abrirCarro(c.id); });
    lista.appendChild(b);
  }
  if (!lista.children.length) {
    lista.innerHTML = `<p class="indisponivel">${t('seletor.nada')}</p>`;
  }
}

function abrirSeletor() {
  $('seletor').classList.add('aberto');
  $('seletor').setAttribute('aria-hidden', 'false');
  montarSeletor();
  $('busca').focus();
}

function fecharSeletor() {
  $('seletor').classList.remove('aberto');
  $('seletor').setAttribute('aria-hidden', 'true');
}

// --------------------------------------------------------------- carga ----

async function abrirCarro(id, aoProgredir = () => {}) {
  $('estado').textContent = t('estado.carregando');
  $('nome-carro').textContent = '…';
  try {
    aoProgredir(t('etapa.ficha'));
    const resp = await fetch(`/api/carro/${id}`);
    if (!resp.ok) throw new Error(`/api/carro/${id} respondeu ${resp.status}`);
    const ficha = await resp.json();
    estado.carro = id;
    estado.ficha = ficha;
    $('nome-carro').textContent = ficha.rotulo;

    const r = await montador.carregar(id, ficha, (m) => {
      $('estado').textContent = m;
      aoProgredir(m);
    });
    if (!r) return;

    aoProgredir(t('etapa.hud'));
    estado.medidasBase = medidasDoCarro();
    estado.trisBase = estado.medidasBase.triangulos;
    miniaturas.limpar();
    pintar();
    montarTrilha();
    atualizarChips();
    atualizarRodas();
    enquadrar({ imediato: true });
    invalidar();
    $('estado').textContent = t('estado.pronto');

    if (r.descartes?.length) {
      avisar(t('aviso.gruposSoltos', r.descartes.length), 4200);
    }
    conferirAmbienteDosMateriais();
  } catch (e) {
    console.error(e);
    // Trocar de carro cancela a carga anterior de proposito; isso nao e' falha
    // e nao merece torrada -- ainda mais porque o texto do DOMException vem do
    // navegador, sempre em ingles, colado numa frase traduzida.
    if (e.name === 'AbortError') return;
    avisar(t('erro.abrirVeiculo', e.message), 6000);
    $('estado').textContent = t('estado.falhou');
  }
}

// ------------------------------------------------------------- teclado ----

addEventListener('keydown', (ev) => {
  if (ev.target.tagName === 'INPUT') {
    if (ev.key === 'Escape') { fecharSeletor(); ev.target.blur(); }
    return;
  }
  const abas = [...$('trilha').querySelectorAll('.aba')];
  const i = abas.findIndex((b) => b.getAttribute('aria-selected') === 'true');
  if (ev.key === 'ArrowDown' && abas.length) {
    escolherCategoria(abas[(i + 1) % abas.length].dataset.categoria);
    ev.preventDefault();
  } else if (ev.key === 'ArrowUp' && abas.length) {
    escolherCategoria(abas[(i - 1 + abas.length) % abas.length].dataset.categoria);
    ev.preventDefault();
  } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
    const cartoes = [...$('trilho').querySelectorAll('.cartao')];
    const j = cartoes.findIndex((c) => c.getAttribute('aria-pressed') === 'true');
    const alvo = cartoes[Math.max(0, Math.min(cartoes.length - 1,
      j + (ev.key === 'ArrowRight' ? 1 : -1)))];
    if (alvo) { alvo.click(); alvo.scrollIntoView({ block: 'nearest', inline: 'center' }); }
    ev.preventDefault();
  } else if (ev.key.toLowerCase() === 'r') {
    enquadrar();
  } else if (ev.key === 'Escape') {
    fecharSeletor();
  }
});

$('btn-trocar').addEventListener('click', abrirSeletor);
$('btn-fechar-seletor').addEventListener('click', fecharSeletor);
$('busca').addEventListener('input', montarSeletor);

// -------------------------------------------------------------- inicio ----

// Mensagem de carregamento com etapa e relogio. A versao anterior so' dizia
// "168 veiculos" e, se algo travasse depois disso, a janela ficava congelada
// sem dizer nada -- foi exatamente o que aconteceu na janela de desktop.
const t0Carga = performance.now();
let etapaAtual = 'iniciando';

function etapa(texto) {
  etapaAtual = texto;
  const seg = ((performance.now() - t0Carga) / 1000).toFixed(1);
  const el = $('mensagem-abertura');
  if (el) el.textContent = t('abertura.etapa', texto, seg);
  // Tambem no titulo da janela: numa janela de desktop esse e' o unico canal
  // de diagnostico que da' para ler de fora, sem devtools.
  document.title = t('abertura.tituloEtapa', texto);
}

function falhaNaAbertura(erro) {
  document.title = t('abertura.tituloErro', etapaAtual);
  const el = $('mensagem-abertura');
  if (el) {
    el.classList.add('erro');
    el.textContent = t('abertura.parou', etapaAtual, erro && erro.message ? erro.message : erro);
  }
  console.error('[garagem]', etapaAtual, erro);
}

addEventListener('error', (ev) => falhaNaAbertura(ev.error || ev.message));
addEventListener('unhandledrejection', (ev) => falhaNaAbertura(ev.reason));

// Se o WebGL cair (driver, suspensao, contexto perdido), a tela fica preta sem
// explicacao. Melhor dizer o que houve.
tela.addEventListener('webglcontextlost', (ev) => {
  ev.preventDefault();
  avisar(t('erro.contexto3d'), 12000);
});

async function iniciar() {
  redimensionar();
  requestAnimationFrame(laco);

  // Antes de qualquer carga: sem idioma definido, ate' a mensagem de progresso
  // sairia na lingua errada e trocaria no meio. Na segunda abertura em diante
  // isto resolve na hora, sem mostrar nada.
  await escolherIdiomaSePreciso();
  aplicarNoDom();

  // Vigia: se passar de 25 s sem terminar, conta em que etapa ficou preso em
  // vez de deixar a janela pendurada.
  const vigia = setTimeout(() => {
    if (!$('abertura')) return;
    const el = $('mensagem-abertura');
    if (el) {
      el.classList.add('erro');
      el.textContent = t('abertura.travou', etapaAtual);
    }
  }, 25000);

  try {
    etapa(t('etapa.verificando3d'));
    const gl = renderer.getContext();
    if (!gl) throw new Error(t('erro.semWebGL'));
    // Se o WebView cair para software (SwiftShader), a cena com sombra 2048 e
    // ambiente PMREM leva minutos por quadro e a janela parece travada. Melhor
    // descobrir aqui e baixar a qualidade do que deixar o usuario esperando.
    const infoGpu = gl.getExtension('WEBGL_debug_renderer_info');
    const nomeGpu = infoGpu ? String(gl.getParameter(infoGpu.UNMASKED_RENDERER_WEBGL)) : '';
    estado.gpu = nomeGpu;
    if (/swiftshader|software|llvmpipe|basic render/i.test(nomeGpu)) {
      estado.semGpu = true;
      renderer.shadowMap.enabled = false;
      renderer.setPixelRatio(1);
      sala.luzes.traverse((o) => { if (o.isLight) o.castShadow = false; });
      etapa(t('etapa.semGpu'));
    }

    etapa(t('etapa.lendoAcervo'));
    const r = await fetch('/api/acervo');
    if (!r.ok) throw new Error(`/api/acervo respondeu ${r.status}`);
    estado.acervo = await r.json();
    carimbarVersao(estado.acervo.versao);

    // Quem baixou so' o programa cai aqui. Nao e' erro: e' o estado normal de
    // quem ainda nao extraiu os arquivos da propria copia do jogo.
    if (estado.acervo.semAcervo) {
      clearTimeout(vigia);
      mostrarSemAcervo(estado.acervo.links || {});
      return;
    }

    etapa(t('etapa.abrindoPrimeiro', num(estado.acervo.carros.length)));
    const primeiro = estado.acervo.carros.find((c) => c.id === 'car_bmw_m3e46_2003')
      || estado.acervo.carros[0];
    await abrirCarro(primeiro.id, etapa);

    clearTimeout(vigia);
    document.title = t('app.titulo');
    if (estado.semGpu) {
      avisar(t('aviso.semGpu'), 9000);
    }
    // Trocar de idioma repinta tudo: o que e' estatico sai do `data-i18n`, e o
    // que foi escrito no DOM em tempo de execucao precisa ser remontado, senao
    // a trilha e o carrossel ficam na lingua antiga.
    montarAlternadorIdioma(() => {
      montarTrilha();
      if (estado.categoria) escolherCategoria(estado.categoria);
      atualizarChips();
      atualizarFicha();
      atualizarRodas();
      montarSeletor();
    });

    $('hud').classList.remove('oculto');
    $('abertura').classList.add('saindo');
    setTimeout(() => { const a = $('abertura'); if (a) a.remove(); }, 450);
  } catch (e) {
    clearTimeout(vigia);
    falhaNaAbertura(e);
  } finally {
    // No `finally`, nao no caminho feliz: o aviso e' sobre o **projeto**, nao
    // sobre o carro. Quem abre com o acervo no lugar errado ve' a tela de falha
    // -- e e' justamente quem mais precisa saber que o trabalho esta' pausado e
    // que pode mexer no codigo para consertar.
    mostrarAvisoPausado();
  }
}

// Alca de diagnostico: o painel de Diagnostico e os testes de tela usam isto.
window.garagem = { THREE, cena, camera, controles, renderer, montador, sala, estado, enquadrar, invalidar };

iniciar();

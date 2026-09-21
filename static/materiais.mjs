// Materiais do carro. O servidor ja' resolveu papel e mapas; aqui so' vira
// MeshPhysicalMaterial, com cache por (papel, nome) para que a carroceria e uma
// peca de modificacao dividam a mesma instancia de cromado.

import * as THREE from 'three';

const PAPEL_SOMBRA = new Set([
  'pintura', 'acabamento', 'chassi', 'motor', 'plastico', 'metal',
  'cromo', 'grade', 'aro', 'pneu', 'freio', 'pinca', 'emblema', 'emblema_roda',
]);

// Só estes papéis ganham `MeshPhysicalMaterial`: verniz, iridescência e brilho
// custam caro no shader. Usar Physical em tudo gerava ~20 variantes pesadas
// compiladas de uma vez na primeira renderização — o suficiente para pendurar
// uma janela WebView2 sem aceleração de vídeo por minutos.
const PAPEL_FISICO = new Set(['pintura', 'vidro', 'lente', 'cromo', 'espelho']);

export class CacheTexturas {
  constructor() {
    this.itens = new Map();
    this.carregador = new THREE.TextureLoader();
  }

  obter(url, { cor = false } = {}) {
    const chave = `${url}|${cor}`;
    let t = this.itens.get(chave);
    if (!t) {
      t = this.carregador.load(url);
      t.colorSpace = cor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      t.flipY = true;
      this.itens.set(chave, t);
    }
    return t;
  }

  descartar() {
    for (const t of this.itens.values()) t.dispose();
    this.itens.clear();
  }
}

export class FabricaMateriais {
  // `cena` entra para o material poder receber o **próprio** `envMap`. Não é
  // firula: o Three r166 faz, a cada quadro, dentro do `WebGLRenderer`:
  //
  //     if ( material.isMeshStandardMaterial && material.envMap === null
  //          && scene.environment !== null ) {
  //         m_uniforms.envMapIntensity.value = scene.environmentIntensity;
  //     }
  //
  // Ou seja: material sem `envMap` próprio tem o `envMapIntensity` dele
  // **substituído por 1.0** (o padrão de `scene.environmentIntensity`) a cada
  // quadro. Medido aqui: zerar o `envMapIntensity` do aro não mudava um único
  // byte do quadro, enquanto `cena.environment = null` derrubava o brilho de
  // 131 para 8 — 97% do aro vinha do ambiente, numa intensidade que este
  // arquivo nunca escolheu. `MeshPhysicalMaterial` também é
  // `isMeshStandardMaterial`, então os cinco valores deste arquivo — vidro 1.6,
  // pintura 1.4, cromo 1.8, aro 0.6, pneu 0.12 — eram todos letra morta. Dar o
  // `envMap` ao material faz a condição falhar e devolve o controle para cá.
  constructor(texturas, cena = null) {
    this.texturas = texturas;
    this.cena = cena;
    this.itens = new Map();
    this.porPapel = new Map();
  }

  // Se o ambiente da cena for trocado depois (outra sala, outro PMREM), os
  // materiais já criados precisam acompanhar -- senão voltam a cair na regra
  // acima, e de novo sem ninguém perceber.
  sincronizarAmbiente() {
    const amb = this.cena?.environment || null;
    for (const m of this.itens.values()) {
      if (m.envMap !== amb) { m.envMap = amb; m.needsUpdate = true; }
    }
  }

  // `spec` e' o registro que o servidor manda em `materiais{}`.
  obter(nome, spec) {
    let m = this.itens.get(nome);
    if (m) return m;

    const papel = spec?.papel || 'generico';
    const mapas = spec?.mapas || {};

    const Classe = PAPEL_FISICO.has(papel)
      ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    m = new Classe({
      color: new THREE.Color(spec?.cor || '#26282b'),
      roughness: spec?.rugosidade ?? 0.55,
      metalness: spec?.metal ?? 0,
      side: THREE.FrontSide,
    });
    m.name = nome;
    m.userData.papel = papel;
    m.userData.fisico = Classe === THREE.MeshPhysicalMaterial;
    // Tem que ser aqui, antes dos ajustes por papel: sem `envMap` próprio, todo
    // `envMapIntensity` escrito abaixo é descartado pelo renderer (ver o
    // comentário do construtor).
    if (this.cena?.environment) m.envMap = this.cena.environment;

    if (spec?.transparente) {
      m.transparent = true;
      m.opacity = spec.opacidade ?? 0.5;
      m.depthWrite = false;
    }
    if (papel === 'vidro') {
      // Vidro do Heat: escuro e muito liso. Sem transmissao fisica, que custa
      // caro e nao acrescenta nada com o interior modelado.
      m.roughness = 0.04;
      m.clearcoat = 1;
      m.clearcoatRoughness = 0.03;
      m.envMapIntensity = 1.6;
    }
    if (papel === 'pintura') {
      m.clearcoat = 1;
      m.clearcoatRoughness = 0.05;
      m.envMapIntensity = 1.4;
    }
    if (papel === 'cromo' || papel === 'espelho') m.envMapIntensity = 1.8;
    if (papel === 'aro' || papel === 'emblema_roda') {
      // Medido no render: com metal 1 e aspereza 0,25 o aro batia 168 de brilho
      // contra 29 do pneu, e a roda lia como um disco branco de longe. O aro
      // ocupa 78% do raio, entao ele manda na leitura. Aluminio usinado --
      // menos espelho, mais material -- resolve sem mexer na geometria.
      // A receita do acervo (`corrigir_materiais_rodas.py`) e' Pr 0,25 / Pm 1,0,
      // calibrada para o Blender. Aqui, com o ambiente PMREM da sala, isso vira
      // espelho. So' o ambiente e' contido; a cor e o metal ficam como no acervo.
      m.envMapIntensity = 0.6;
      m.roughness = Math.max(m.roughness, 0.38);
    }
    if (papel === 'pneu') {
      // A sala e' bem iluminada (quatro softboxes e uma direcional), entao um
      // albedo de 0,1 ja' le' como cinza medio: medido, o pneu saía com brilho
      // 66 contra 71-104 do aro -- praticamente a mesma coisa, e a roda virava
      // um disco claro. Borracha de verdade e' bem mais escura que isso.
      m.color.set('#0c0c0e');
      m.roughness = 0.95;
      // 0,12 era o valor antigo, escolhido quando o `envMapIntensity` ainda era
      // descartado pelo renderer e portanto nunca chegou a renderizar. Agora que
      // chega, 0,12 apaga o pneu: medido, brilho médio 4,2 com p95 em 16 -- um
      // buraco preto sem banda nem parede. Varrendo 0,08 a 1,0, o que dá
      // borracha com desenho legível e ainda bem mais escura que o aro é ~0,85:
      // brilho 21 e contraste 12, contra 100 do aro. Por medida, não por gosto.
      m.envMapIntensity = 0.85;
    }
    if (spec?.emissivo) {
      m.emissive = new THREE.Color(spec.emissivo);
      m.emissiveIntensity = 0.55;
    }

    if (mapas.mapa) {
      m.map = this.texturas.obter(mapas.mapa, { cor: true });
      m.color.set('#ffffff');
    }
    if (mapas.normal) {
      m.normalMap = this.texturas.obter(mapas.normal);
      // O relevo do pneu e' o desenho da banda e da parede: vale mais forte,
      // senao a borracha continua uma superficie lisa sem leitura.
      const f = papel === 'pneu' ? 0.9 : 0.8;
      m.normalScale = new THREE.Vector2(f, f);
      if (papel === 'pneu') {
        m.normalMap.wrapS = m.normalMap.wrapT = THREE.RepeatWrapping;
      }
    }
    // A mascara `_m` do acervo empacota metal/suavidade/oclusao, e o Three le'
    // `roughnessMap` no canal **verde** -- que aqui e' suavidade, o inverso do
    // que ele espera. Usar assim deixa liso o que devia ser aspero. Enquanto o
    // significado dos canais nao estiver medido, fica de fora: melhor sem mapa
    // do que com o mapa errado.
    if (mapas.emissivo) {
      m.emissiveMap = this.texturas.obter(mapas.emissivo, { cor: true });
      m.emissive = new THREE.Color('#ffffff');
      m.emissiveIntensity = 0.9;
    }

    this.itens.set(nome, m);
    if (!this.porPapel.has(papel)) this.porPapel.set(papel, []);
    this.porPapel.get(papel).push(m);
    return m;
  }

  materiaisDe(papel) { return this.porPapel.get(papel) || []; }

  lancaSombra(papel) { return PAPEL_SOMBRA.has(papel); }

  descartar() {
    for (const m of this.itens.values()) m.dispose();
    this.itens.clear();
    this.porPapel.clear();
  }
}

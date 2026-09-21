// Pintura procedural.
//
// O Heat **nao tem textura de lataria**: a pintura e' cor mais acabamento,
// composta em tempo de execucao. Conferido no acervo -- nao existe um unico
// arquivo `*carpaint*` ou `*_paint*` em nenhuma pasta `textures/`. Entao aqui
// nao ha o que carregar: e' tudo parametro de material.

import * as THREE from 'three';

export const ACABAMENTOS = [
  { id: 'brilhante',
    metal: .05, rugosidade: .22, verniz: 1.0, vernizRug: .04, irid: 0, brilho: 0 },
  { id: 'metalico',
    metal: .72, rugosidade: .30, verniz: 1.0, vernizRug: .08, irid: 0, brilho: 0, flake: .06 },
  { id: 'perolizado',
    metal: .35, rugosidade: .26, verniz: 1.0, vernizRug: .06, irid: .55, iridIOR: 1.24,
    iridFaixa: [110, 230], flake: .04 },
  { id: 'fosco',
    metal: .10, rugosidade: .72, verniz: .15, vernizRug: .60, irid: 0, brilho: .25 },
  { id: 'fosco-metalico',
    metal: .70, rugosidade: .58, verniz: .20, vernizRug: .55, irid: 0, brilho: 0, flake: .05 },
  { id: 'cromado',
    metal: 1.0, rugosidade: .05, verniz: 0, vernizRug: 0, irid: 0, brilho: 0 },
  { id: 'cor-shift',
    metal: .55, rugosidade: .24, verniz: 1.0, vernizRug: .05, irid: .95, iridIOR: 1.34,
    iridFaixa: [180, 520], flake: .05 },
];

// Paleta de partida. Cores de rua, do tipo que o jogo oferece -- nao um
// arco-iris de seletor de cor, que deixa qualquer garagem com cara de editor.
export const CORES = [
  '#151a1f', '#f2f4f7', '#8d949c', '#7c1420', '#c02032', '#e2622a',
  '#f0a81c', '#1d3f78', '#12294d', '#0d6e7a', '#1c7a3e', '#4a2a7a',
  '#b0175f', '#2d2216', '#5d6b2f', '#b9a06a',
];

let mapaFlake = null;

// Flake metalico: normais aleatorias tendendo ao +Z, repetidas bem pequenas.
// E' o que da' o cintilar do metalico sem textura de arquivo.
function flake() {
  if (mapaFlake) return mapaFlake;
  const n = 256;
  const dados = new Uint8Array(n * n * 4);
  let semente = 1337;
  const rnd = () => { semente = (semente * 1664525 + 1013904223) >>> 0; return semente / 4294967296; };
  for (let i = 0; i < n * n; i++) {
    const x = (rnd() - .5) * .55;
    const y = (rnd() - .5) * .55;
    const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
    dados[i * 4] = (x * .5 + .5) * 255;
    dados[i * 4 + 1] = (y * .5 + .5) * 255;
    dados[i * 4 + 2] = z * 255;
    dados[i * 4 + 3] = 255;
  }
  mapaFlake = new THREE.DataTexture(dados, n, n, THREE.RGBAFormat);
  mapaFlake.wrapS = mapaFlake.wrapT = THREE.RepeatWrapping;
  mapaFlake.repeat.set(60, 60);
  mapaFlake.needsUpdate = true;
  return mapaFlake;
}

export function acabamento(id) {
  return ACABAMENTOS.find((a) => a.id === id) || ACABAMENTOS[0];
}

export function aplicarPintura(materiais, { cor, acabamento: idAcab }) {
  const a = acabamento(idAcab);
  for (const m of materiais) {
    if (m.userData.papel !== 'pintura') continue;
    m.color.set(cor);
    m.metalness = a.metal;
    m.roughness = a.rugosidade;
    // Verniz, iridescencia e brilho so' existem em MeshPhysicalMaterial; tentar
    // escreve-los num Standard cria propriedades mortas que nunca renderizam.
    if (m.userData.fisico) {
      m.clearcoat = a.verniz;
      m.clearcoatRoughness = a.vernizRug;
      m.iridescence = a.irid;
      if (a.irid) {
        m.iridescenceIOR = a.iridIOR;
        m.iridescenceThicknessRange = a.iridFaixa;
      }
      m.sheen = a.brilho || 0;
      if (a.brilho) m.sheenColor = new THREE.Color(cor);
    }
    m.envMapIntensity = a.id === 'fosco' ? .6 : 1.5;

    if (a.flake) {
      m.normalMap = flake();
      m.normalScale = new THREE.Vector2(a.flake, a.flake);
    } else {
      m.normalMap = null;
    }
    // A lataria do Heat nao tem mapa de cor; se algum material de pintura
    // trouxe um por engano, ele apagaria a cor escolhida.
    m.map = null;
    m.needsUpdate = true;
  }
}

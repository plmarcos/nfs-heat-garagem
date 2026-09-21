// Montagem das quatro rodas.
//
// **Aqui o app diverge do `montar_rodas.py` do acervo, de propósito.**
//
// Aquele script escala o aro pelo mesmo fator do pneu, supondo que todo aro foi
// modelado na mesma referência que a malha de pneu compartilhada. Medindo os 166
// carros, não foi: o raio nativo do aro vai de 0,18 a 0,50 m. No Polestar 1 o aro
// nativo (0,3163) é do tamanho do pneu inteiro (0,3165), e a roda sai como um
// disco liso sem pneu; no reboque o aro monta a 0,87 m num pneu de 0,55 e
// simplesmente atravessa a borracha.
//
// O que se sabe de verdade, e que vale para qualquer carro: **o aro assenta no
// talão do pneu**. Então o aro é escalado para que o raio externo dele caia no
// raio interno do pneu já escalado, com 2% de lábio. Medido nos 166 carros, o
// pneu aparente sai de −317..131 mm (2 carros quebrados) para 65..126 mm, nenhum
// fora da faixa — e o M3, que já estava certo, vai de 72 para 75 mm.
//
// Duas coisas continuam vindo do script de referência, porque são dado medido e
// não suposição: o raio e a largura-alvo do `_rodas_eixos.csv`, e o fato de
// `meia_bitola` já ser o X do centro da roda.
//
// **A roda direita não precisa de inversão de índice.** Havia aqui um
// `inverterFaces` para compensar o determinante negativo da escala espelhada em
// X. O Three já faz isso sozinho: `WebGLRenderer` linha 29233,
// `const frontFaceCW = ( object.isMesh && object.matrixWorld.determinant() < 0 )`,
// que entra em `setMaterial` e troca o lado. Invertendo o índice **também**, a
// correção era aplicada duas vezes e as duas rodas da direita renderizavam pelo
// avesso -- mostrando a casca interna do aro e do pneu. Medido com câmeras
// espelhadas nos dois lados: a diferença de silhueta entre a roda esquerda e a
// direita caiu de **16,2% para 0,1%** ao tirar a inversão, e a de brilho de
// 16,4 para 1,2.

import * as THREE from 'three';
import { geometrias } from './nfsg.mjs';

// Lábio do aro para além do talão: sem isso o aro encosta exato na borracha e
// aparece z-fighting na junção.
const LABIO = 1.02;

function medidasNativas(geometria) {
  const p = geometria.getAttribute('position').array;
  let rmax = 0, rmin = Infinity, minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const r = Math.hypot(p[i + 1], p[i + 2]);   // eixo de giro em X
    if (r > rmax) rmax = r;
    if (r < rmin) rmin = r;
    if (p[i] < minX) minX = p[i];
    if (p[i] > maxX) maxX = p[i];
  }
  return {
    raio: rmax || 1,
    raioMin: Number.isFinite(rmin) ? rmin : 0,
    largura: (maxX - minX) || 1,
  };
}

function malha(geometria, materiais) {
  const m = new THREE.Mesh(geometria, materiais);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function montarRodas({ pacoteRoda, pacotePneu, colocacoes, fabrica }) {
  const grupo = new THREE.Group();
  grupo.name = 'rodas';
  if (!colocacoes?.disponivel || !pacoteRoda) return { grupo, medidas: null };

  const aros = geometrias(THREE, pacoteRoda);
  const pneus = pacotePneu ? geometrias(THREE, pacotePneu) : [];
  const specs = pacoteRoda.cabecalho.materiais || {};
  const specsPneu = pacotePneu ? (pacotePneu.cabecalho.materiais || {}) : {};

  const eixoDoObjeto = pacoteRoda.cabecalho.eixoDoObjeto || {};
  const porEixo = {
    f: aros.find((a) => a.nome === eixoDoObjeto.f) || aros[0],
    t: aros.find((a) => a.nome === eixoDoObjeto.t) || aros[aros.length - 1] || aros[0],
  };

  const pneuGeo = pneus[0]?.geometria || null;
  const nativoPneu = pneuGeo ? medidasNativas(pneuGeo) : null;

  const montados = [];

  for (const c of colocacoes.colocacoes) {
    const aro = porEixo[c.eixo];
    if (!aro) continue;
    const nativoAro = medidasNativas(aro.geometria);
    const direita = c.lado > 0;

    const nucleo = new THREE.Group();
    nucleo.name = `roda_${c.eixo}_${direita ? 'd' : 'e'}`;
    nucleo.position.set(c.posicao[0], c.posicao[1], c.posicao[2]);
    grupo.add(nucleo);

    // -- pneu: escala tirada dele mesmo, para bater o diâmetro do jogo -------
    let taloMontado = null;
    if (pneuGeo && nativoPneu) {
      const sRad = c.raio / nativoPneu.raio;
      const sWid = c.largura / nativoPneu.largura;
      taloMontado = nativoPneu.raioMin * sRad;

      const gp = new THREE.Group();
      gp.scale.set(direita ? -sWid : sWid, sRad, sRad);
      const mats = pneus[0].grupos.map(
        (g) => fabrica.obter(g.material, specsPneu[g.material]));
      gp.add(malha(pneuGeo, mats));
      nucleo.add(gp);
    }

    // -- aro: assenta no talão; sem pneu (moto), usa o diâmetro da roda ------
    const sAro = taloMontado
      ? (taloMontado * LABIO) / nativoAro.raio
      : c.raio / nativoAro.raio;

    const ga = new THREE.Group();
    // Raio pelo talão, **largura pelo pneu**. Escalar a largura junto com o raio
    // parecia mais limpo (objeto rígido) mas alargou o aro em 23% e jogou a roda
    // para fora do para-lama: a largura tem que caber no pneu, não no raio.
    const sLarg = pneuGeo && nativoPneu
      ? c.largura / nativoPneu.largura
      : sAro;
    ga.scale.set(direita ? -sLarg : sLarg, sAro, sAro);
    const matsAro = aro.grupos.map((g) => fabrica.obter(g.material, specs[g.material]));
    ga.add(malha(aro.geometria, matsAro));
    nucleo.add(ga);

    montados.push(nucleo);
  }

  return { grupo, medidas: colocacoes.medidas, montados };
}

// As colocações vêm do servidor como medidas; a conta é curta e fica aqui para
// o front poder recalcular quando o usuário trocar o composto do pneu.
export function calcularColocacoes(rodas) {
  if (!rodas?.disponivel) return null;
  const m = rodas.medidas;
  const lados = rodas.eixoUnico ? [0] : [-1, 1];
  const saida = [];
  for (const eixo of ['f', 't']) {
    const raio = (eixo === 'f' ? m.diamFrente : m.diamTras) / 2;
    const largura = eixo === 'f' ? m.largFrente : m.largTras;
    const meia = eixo === 'f' ? m.meiaBitolaF : m.meiaBitolaT;
    const z = eixo === 'f' ? m.zFrente : m.zTras;
    for (const lado of lados) {
      saida.push({
        lado, eixo, raio, largura,
        // meia bitola JÁ É o X do centro -- não descontar largura de pneu
        posicao: [rodas.eixoUnico ? 0 : lado * Math.max(0.15, meia), raio, z],
      });
    }
  }
  return { ...rodas, colocacoes: saida };
}

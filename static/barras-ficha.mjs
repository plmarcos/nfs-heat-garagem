// As barras da ficha técnica.
//
// Os números vêm do EBX de ajuste do próprio jogo (`_ficha_tecnica.csv`), não de
// estimativa: massa, curva de torque, giro, câmbio e diferencial. Onde o jogo não
// traz o dado, a linha **diz que não traz** em vez de inventar.
//
// A barra é normalizada contra o mínimo e o máximo do acervo inteiro. Sem isso
// ela seria só um retângulo: 250 cv precisa parecer pouco ao lado dos 811 do
// Regera para o desenho informar alguma coisa.

import { num, t, temTexto } from './idioma.mjs';

// Numero no local escolhido. Era fixo em `pt-BR`, o que em ingles faria
// `1.495 kg` ser lido como 1,495 -- a massa do carro errada por um fator de mil.
const NBR = (v, casas = 0) => num(Number(v), casas);

function fracao(valor, faixa, { invertido = false } = {}) {
  if (!faixa || valor == null) return 0;
  const [lo, hi] = faixa;
  if (hi <= lo) return 1;
  const f = Math.min(1, Math.max(0, (valor - lo) / (hi - lo)));
  return invertido ? 1 - f : f;
}

function barra({ titulo, valor, unidade = '', detalhe = '', frac = 0,
                 delta = null, geometria = false }) {
  const cls = geometria ? 'barra geometria' : 'barra';
  const d = (delta == null || delta === 0) ? ''
    : `<span class="delta ${delta > 0 ? 'sobe' : 'desce'}">${delta > 0 ? '+' : '−'}${NBR(Math.abs(delta))}</span>`;
  return `<div class="${cls}">
    <div class="cabeca">
      <span class="titulo">${titulo}</span>
      <span class="valor">${valor}${unidade ? `<span class="unidade">${unidade}</span>` : ''}${d}</span>
    </div>
    <div class="calha"><div class="preenchimento" style="width:${Math.round(frac * 100)}%"></div></div>
    ${detalhe ? `<div class="detalhe">${detalhe}</div>` : ''}
  </div>`;
}

function linha(titulo, valor) {
  return `<div class="linha-dado"><span>${titulo}</span><b>${valor}</b></div>`;
}

const rotuloTracao = (v) => (v ? t(`tracao.${v}`) : v);

export function desenharFicha(el, { ficha, faixas, geometria, base }) {
  const partes = [];

  if (ficha && ficha.potenciaCv) {
    const pesoPotencia = ficha.massaKg
      ? ficha.potenciaCv / (ficha.massaKg / 1000) : null;

    partes.push(barra({
      titulo: t('ficha.potencia'),
      valor: NBR(ficha.potenciaCv), unidade: t('unidade.cv'),
      detalhe: ficha.rpmPotencia ? t('ficha.aRpm', NBR(ficha.rpmPotencia)) : '',
      frac: fracao(ficha.potenciaCv, faixas?.potenciaCv),
    }));
    partes.push(barra({
      titulo: t('ficha.torque'),
      valor: NBR(ficha.torqueNm), unidade: t('unidade.nm'),
      detalhe: ficha.rpmTorque ? t('ficha.aRpm', NBR(ficha.rpmTorque)) : '',
      frac: fracao(ficha.torqueNm, faixas?.torqueNm),
    }));
    if (ficha.massaKg) {
      partes.push(barra({
        titulo: t('ficha.massa'),
        valor: NBR(ficha.massaKg), unidade: t('unidade.kg'),
        // Leve é bom, então a barra cheia é o carro mais leve do acervo.
        detalhe: pesoPotencia ? t('ficha.porTonelada', NBR(pesoPotencia)) : '',
        frac: fracao(ficha.massaKg, faixas?.massaKg, { invertido: true }),
      }));
    }
    if (ficha.redline) {
      partes.push(barra({
        titulo: t('ficha.giro'),
        valor: NBR(ficha.redline), unidade: t('unidade.rpm'),
        detalhe: ficha.rpmMax && ficha.rpmMax !== ficha.redline
          ? t('ficha.corteEm', NBR(ficha.rpmMax)) : '',
        frac: fracao(ficha.redline, faixas?.redline),
      }));
    }
  } else {
    partes.push(`<p class="indisponivel">${t('ficha.semAjuste')}</p>`);
  }

  // Sempre visível: muda conforme as peças escolhidas.
  const larg = geometria?.larguraMm ?? 0;
  const comp = geometria?.comprimentoMm ?? 0;
  const tris = geometria?.triangulos ?? 0;
  partes.push(barra({
    titulo: t('ficha.largura'), valor: NBR(larg), unidade: t('unidade.mm'), geometria: true,
    frac: Math.min(larg / 2400, 1),
    delta: base?.larguraMm ? larg - base.larguraMm : null,
  }));
  partes.push(barra({
    titulo: t('ficha.comprimento'), valor: NBR(comp), unidade: t('unidade.mm'), geometria: true,
    frac: Math.min(comp / 6200, 1),
    delta: base?.comprimentoMm ? comp - base.comprimentoMm : null,
  }));
  partes.push(barra({
    titulo: t('ficha.triangulos'), valor: NBR(tris), geometria: true,
    frac: Math.min(tris / 260000, 1),
    delta: base?.triangulos ? tris - base.triangulos : null,
  }));

  el.innerHTML = partes.join('');
}

export function desenharMecanica(el, ficha) {
  if (!ficha) {
    el.innerHTML = `<p class="indisponivel">${t('mecanica.semFicha')}</p>`;
    return;
  }
  const itens = [];
  if (ficha.tracao) itens.push(linha(t('mecanica.tracao'), rotuloTracao(ficha.tracao)));
  if (ficha.marchas) itens.push(linha(t('mecanica.marchas'), `${ficha.marchas}`));
  if (ficha.relacaoFinal) itens.push(linha(t('mecanica.relacaoFinal'), NBR(ficha.relacaoFinal, 2)));
  if (ficha.entreEixosM) itens.push(linha(t('mecanica.entreEixos'),
    `${NBR(ficha.entreEixosM * 1000)} ${t('unidade.mm')}`));
  if (ficha.bitolaFM) itens.push(linha(t('mecanica.bitolaF'),
    `${NBR(ficha.bitolaFM * 1000)} ${t('unidade.mm')}`));
  if (ficha.bitolaTM) itens.push(linha(t('mecanica.bitolaT'),
    `${NBR(ficha.bitolaTM * 1000)} ${t('unidade.mm')}`));
  if (ficha.marchaLenta) itens.push(linha(t('mecanica.marchaLenta'),
    `${NBR(ficha.marchaLenta)} ${t('unidade.rpm')}`));

  // Procedência: de qual pasta de ajuste o número veio, e por qual regra. Vale
  // mais que esconder — é o que deixa conferir em vez de acreditar.
  if (ficha.origem) {
    const como = ficha.como && ficha.como !== 'exata'
      ? (temTexto(`como.${ficha.como}`) ? t(`como.${ficha.como}`) : ficha.como) : '';
    itens.push(`<p class="procedencia">${
      t('mecanica.dadosDe', `<code>${ficha.origem}</code>`, como)}</p>`);
  }
  el.innerHTML = itens.join('') || `<p class="indisponivel">${t('mecanica.semDados')}</p>`;
}

// Curva de torque em SVG, desenhada do dado real. Dá contexto ao pico: um motor
// que sobe cedo e cai desenha diferente de um que só entrega no fim.
export function desenharCurva(el, ficha) {
  const pts = ficha?.curva || [];
  if (pts.length < 3) { el.innerHTML = ''; return; }

  const rpms = pts.map((p) => p[0]);
  const tqs = pts.map((p) => p[1]);
  const rpmMin = Math.min(...rpms), rpmMax = Math.max(...rpms);
  const tqMax = Math.max(...tqs);
  const L = 288, A = 86, mb = 16;

  const x = (r) => ((r - rpmMin) / Math.max(1, rpmMax - rpmMin)) * L;
  const y = (t) => (A - mb) - (t / (tqMax || 1)) * (A - mb - 6);

  const caminho = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ');
  const area = `${caminho} L${L} ${A - mb} L0 ${A - mb} Z`;
  const pico = pts.reduce((a, b) => (b[1] > a[1] ? b : a), pts[0]);

  el.innerHTML = `
    <svg viewBox="0 0 ${L} ${A}" class="curva" role="img"
         aria-label="${t('ficha.curvaRotulo', NBR(rpmMin), NBR(rpmMax), NBR(pico[1]))}">
      <defs>
        <linearGradient id="grad-curva" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--ciano)" stop-opacity=".30"/>
          <stop offset="1" stop-color="var(--ciano)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <line x1="0" y1="${A - mb}" x2="${L}" y2="${A - mb}" stroke="var(--linha)" stroke-width="1"/>
      <path d="${area}" fill="url(#grad-curva)"/>
      <path d="${caminho}" fill="none" stroke="var(--ciano)" stroke-width="1.6"
            stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(pico[0]).toFixed(1)}" cy="${y(pico[1]).toFixed(1)}" r="2.6"
              fill="var(--magenta)"/>
      <text x="0" y="${A - 4}" class="eixo">${NBR(rpmMin)}</text>
      <text x="${L}" y="${A - 4}" class="eixo" text-anchor="end">${NBR(rpmMax)} ${t('unidade.rpm')}</text>
    </svg>`;
}

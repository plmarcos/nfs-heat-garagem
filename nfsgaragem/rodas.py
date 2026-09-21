"""Colocacao das quatro rodas, replicando o `montar_rodas.py` do acervo.

Duas coisas que e' facil errar e que tem teste de regressao:

1. **Uma escala so', tirada do pneu, aplicada no aro tambem.** O `_wheel.obj` do
   Heat e' so' o aro (raio nativo ~0,247 m) e o pneu e' malha compartilhada (raio
   interno ~0,239 m); os dois foram desenhados para casar em escala nativa.
   Escalar o aro pelo diametro do pneu infla a roda em ~33%.

2. **`meia_bitola` do `_rodas_eixos.csv` JA' E' o X do centro da roda.** Nao
   subtrair largura de pneu.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass
class EspecRoda:
    """Uma linha do `_rodas_eixos.csv`, em metros."""

    z_frente: float
    z_tras: float
    meia_bitola_f: float
    meia_bitola_t: float
    diam_frente: float
    diam_tras: float
    larg_frente: float
    larg_tras: float
    confianca: str = "ok"


@dataclass
class Colocacao:
    lado: int                  # -1 esquerda, +1 direita
    eixo: str                  # "f" ou "t"
    escala: list[float]        # x (com sinal), y, z
    posicao: list[float]
    inverter_faces: bool
    raio: float
    largura: float


def medidas_nativas(pos: np.ndarray) -> tuple[float, float]:
    """(raio, largura) de uma malha de roda. O eixo de giro e' X, entao o raio
    e' medido no plano YZ."""
    if pos.size == 0:
        return 1.0, 1.0
    raio = float(np.hypot(pos[:, 1], pos[:, 2]).max())
    largura = float(pos[:, 0].max() - pos[:, 0].min())
    return (raio or 1.0), (largura or 1.0)


def raio_interno(pos: np.ndarray) -> float:
    """Menor raio da malha -- no pneu, o talao onde o aro assenta."""
    if pos.size == 0:
        return 0.0
    return float(np.hypot(pos[:, 1], pos[:, 2]).min())


def colocacoes(spec: EspecRoda,
               raio_pneu_nativo: float,
               larg_pneu_nativa: float,
               *,
               eixo_unico: bool = False) -> list[Colocacao]:
    """As quatro (ou duas, em moto) colocacoes de roda."""
    saida: list[Colocacao] = []
    lados = (0,) if eixo_unico else (-1, 1)
    for eixo in ("f", "t"):
        raio = (spec.diam_frente if eixo == "f" else spec.diam_tras) / 2.0
        largura = spec.larg_frente if eixo == "f" else spec.larg_tras
        meia = spec.meia_bitola_f if eixo == "f" else spec.meia_bitola_t
        z = spec.z_frente if eixo == "f" else spec.z_tras
        s_rad = raio / raio_pneu_nativo
        s_wid = largura / larg_pneu_nativa
        for lado in lados:
            xc = 0.0 if eixo_unico else lado * max(0.15, meia)
            direita = lado > 0
            saida.append(Colocacao(
                lado=lado,
                eixo=eixo,
                escala=[-s_wid if direita else s_wid, s_rad, s_rad],
                posicao=[xc, raio, z],
                inverter_faces=direita,
                raio=raio,
                largura=largura,
            ))
    return saida


# Lábio do aro para além do talão do pneu: sem folga aparece z-fighting na junção.
LABIO_DO_ARO = 1.02


def escala_do_aro(raio_aro_nativo: float,
                  raio_interno_pneu_montado: float | None,
                  raio_alvo: float) -> float:
    """Fator de escala do aro, para ele assentar no talão do pneu.

    **Diverge do `montar_rodas.py` de propósito.** Aquele script escala o aro
    pelo mesmo fator do pneu, supondo que todo aro foi modelado na mesma
    referência da malha de pneu compartilhada. Medindo os 166 carros, o raio
    nativo do aro vai de 0,18 a 0,50 m: no Polestar 1 o aro nativo (0,3163) é do
    tamanho do pneu inteiro (0,3165) e a roda sai como um disco liso, e no
    reboque o aro monta a 0,87 m num pneu de 0,55 e atravessa a borracha.

    O que vale para qualquer carro é que **o aro assenta no talão**. Com esta
    regra o pneu aparente sai de −317..131 mm (2 carros quebrados) para
    65..126 mm, nenhum fora da faixa, e o M3 -- que já estava certo -- vai de
    72 para 75 mm.

    Sem pneu (motos, cujo `_wheel.obj` já é a roda inteira), cai para o
    diâmetro da roda.
    """
    if not raio_aro_nativo:
        return 1.0
    if raio_interno_pneu_montado:
        return (raio_interno_pneu_montado * LABIO_DO_ARO) / raio_aro_nativo
    return raio_alvo / raio_aro_nativo


def objeto_do_eixo(nomes: list[str], eixo: str) -> str | None:
    """No `_wheel.obj` o aro dianteiro se chama `wheelf*` e o traseiro `wheelr*`.

    Cuidado: 'r' aqui e' de *rear*, em ingles, enquanto o nosso eixo traseiro e'
    't'. Trocar os dois poe o aro largo na frente.
    """
    marca = "wheelf" if eixo == "f" else "wheelr"
    for n in nomes:
        if n.lower().startswith(marca):
            return n
    return nomes[0] if nomes else None

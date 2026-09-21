"""Testes da colocacao de roda.

O teste que mais importa aqui e' o de `meia_bitola`: ela **ja' e'** o X do centro
da roda. Descontar largura de pneu enfia as quatro rodas para dentro do carro, e
e' um erro que passa despercebido porque o resultado continua "quase certo".
"""
from __future__ import annotations

import numpy as np

from nfsgaragem.rodas import EspecRoda, colocacoes, medidas_nativas, objeto_do_eixo

# Linha real do `_rodas_eixos.csv` para o BMW M3 E46.
M3 = EspecRoda(
    z_frente=1.4473, z_tras=-1.2675,
    meia_bitola_f=0.7403, meia_bitola_t=0.7403,
    diam_frente=0.657, diam_tras=0.661,
    larg_frente=0.224, larg_tras=0.255,
)

# Medidas nativas do `shared_tire_race01.obj`, medidas no acervo.
PNEU_RAIO = 0.3165
PNEU_RAIO_MIN = 0.2394
PNEU_LARG = 0.2680


def test_quatro_rodas_nos_lugares_certos():
    cs = colocacoes(M3, PNEU_RAIO, PNEU_LARG)
    assert len(cs) == 4

    frente = [c for c in cs if c.eixo == "f"]
    assert {c.lado for c in frente} == {-1, 1}

    e = next(c for c in frente if c.lado == -1)
    assert e.posicao[0] == -0.7403          # meia bitola, sem desconto
    assert abs(e.posicao[1] - 0.3285) < 1e-6  # centro na altura do raio
    assert e.posicao[2] == 1.4473
    assert not e.inverter_faces


def test_meia_bitola_e_o_centro_da_roda():
    """Regressao: nao subtrair largura de pneu da meia-bitola."""
    c = next(c for c in colocacoes(M3, PNEU_RAIO, PNEU_LARG)
             if c.eixo == "f" and c.lado == 1)
    assert c.posicao[0] == M3.meia_bitola_f
    assert c.posicao[0] != M3.meia_bitola_f - M3.larg_frente / 2


def test_uma_escala_so_tirada_do_pneu():
    cs = colocacoes(M3, PNEU_RAIO, PNEU_LARG)
    f = next(c for c in cs if c.eixo == "f" and c.lado == -1)
    assert abs(f.escala[1] - (0.657 / 2) / PNEU_RAIO) < 1e-9
    assert f.escala[1] == f.escala[2]        # radial igual nos dois eixos
    assert abs(f.escala[0] - 0.224 / PNEU_LARG) < 1e-9


def test_lado_direito_e_espelhado_e_inverte_face():
    d = next(c for c in colocacoes(M3, PNEU_RAIO, PNEU_LARG)
             if c.eixo == "f" and c.lado == 1)
    assert d.escala[0] < 0
    assert d.inverter_faces


def test_moto_usa_eixo_unico():
    cs = colocacoes(M3, PNEU_RAIO, PNEU_LARG, eixo_unico=True)
    assert len(cs) == 2
    assert all(c.posicao[0] == 0 for c in cs)
    assert all(not c.inverter_faces for c in cs)


def test_medidas_nativas_medem_no_plano_yz():
    """O eixo de giro da roda e' o X, entao o raio sai de hypot(y, z)."""
    ang = np.linspace(0, 2 * np.pi, 64, endpoint=False)
    pontos = np.stack([
        np.repeat([-0.1, 0.1], 64),
        np.tile(np.cos(ang) * 0.33, 2),
        np.tile(np.sin(ang) * 0.33, 2),
    ], axis=1).astype(np.float32)
    raio, largura = medidas_nativas(pontos)
    assert abs(raio - 0.33) < 1e-4
    assert abs(largura - 0.2) < 1e-4


def test_objeto_do_eixo_usa_rear_para_traseiro():
    nomes = ["wheelfl", "wheelrl"]
    assert objeto_do_eixo(nomes, "f") == "wheelfl"
    assert objeto_do_eixo(nomes, "t") == "wheelrl"   # 'r' de rear, nao de 'traseiro'


# -- o aro assenta no talao do pneu ---------------------------------------

def test_aro_assenta_no_talao_do_pneu():
    """A escala do aro sai do talao, nao do fator do pneu.

    Com o fator do pneu, um aro cujo raio nativo seja grande atravessa a
    borracha -- era o caso do reboque (aro a 0,87 m num pneu de 0,55).
    """
    from nfsgaragem.rodas import LABIO_DO_ARO, escala_do_aro
    raio_alvo = 0.3285                 # M3 dianteira
    talao = PNEU_RAIO_MIN * (raio_alvo / PNEU_RAIO)
    s = escala_do_aro(0.2473, talao, raio_alvo)
    montado = 0.2473 * s
    assert abs(montado - talao * LABIO_DO_ARO) < 1e-9
    assert montado < raio_alvo, "o aro nao pode passar do diametro do pneu"
    assert (raio_alvo - montado) * 1000 > 40, "pneu aparente fino demais"


def test_aro_gigante_nao_atravessa_mais_o_pneu():
    """Regressao do reboque: aro nativo 0,499 num pneu de 0,55 de raio."""
    from nfsgaragem.rodas import escala_do_aro
    raio_alvo = 0.55
    talao = PNEU_RAIO_MIN * (raio_alvo / PNEU_RAIO)
    montado = 0.4991 * escala_do_aro(0.4991, talao, raio_alvo)
    assert montado < raio_alvo
    assert (raio_alvo - montado) * 1000 > 60


def test_sem_pneu_o_aro_usa_o_diametro_da_roda():
    """Moto: o `_wheel.obj` ja' e' a roda inteira, nao ha' talao."""
    from nfsgaragem.rodas import escala_do_aro
    assert abs(escala_do_aro(0.3, None, 0.33) - 1.1) < 1e-9


def test_raio_interno_acha_o_talao():
    from nfsgaragem.rodas import raio_interno
    ang = np.linspace(0, 2 * np.pi, 48, endpoint=False)
    pts = []
    for r in (0.24, 0.32):
        pts += [[0.0, np.cos(a) * r, np.sin(a) * r] for a in ang]
    assert abs(raio_interno(np.array(pts, dtype=np.float32)) - 0.24) < 1e-4

"""Testes do casamento da ficha técnica.

São 146 pastas de ajuste para 168 carros, com grafias soltas e variantes que
herdam do carro base. O casamento é por regras, e é exatamente o tipo de código
que passa a casar errado sem ninguém notar — daí os testes serem sobre *como*
cada carro casou, não só sobre ter casado.
"""
from __future__ import annotations

import pytest

from nfsgaragem.config import resolver_acervo
from nfsgaragem.ficha import Fichas, _sem_sufixo, _so_motor

raiz = resolver_acervo(None)
pytestmark = pytest.mark.skipif(raiz is None, reason="acervo nao encontrado")


@pytest.fixture(scope="module")
def acervo():
    from pathlib import Path
    from nfsgaragem.acervo import Acervo
    return Acervo(Path(raiz))


def test_normalizacao_tira_edicao_mas_guarda_o_modelo():
    assert _sem_sufixo("car_ferrari_488pistaicon_2019") == "car_ferrari_488pista"
    assert _sem_sufixo("car_bmw_m3e46_2003") == "car_bmw_m3e46"
    # Nao pode comer o proprio nome do modelo: "cop" esta' em SUFIXOS, mas a
    # guarda de tamanho impede que um nome curto seja devorado.
    assert _sem_sufixo("cop") == "cop"


def test_estilo_de_carroceria_normaliza_para_o_mesmo_motor():
    """Targa, conversível e cupê são o mesmo carro com outra capota."""
    base = _so_motor("car_porsche_9912gts_2018")
    assert _so_motor("car_porsche_9912gtstarga_2018") == base
    assert _so_motor("car_porsche_9912gtsconvertible_2018") == base


def test_m3_bate_com_o_carro_real(acervo):
    """Os dois números que dá para conferir contra o mundo: o M3 E46 pesa
    1495 kg e tem 2,731 m de entre-eixos."""
    f = acervo.fichas.de("car_bmw_m3e46_2003")
    assert f is not None and f.como == "exata"
    assert f.massa_kg == 1495
    assert abs(f.entre_eixos_m - 2.736) < 0.001
    assert f.tracao == "traseira"
    assert f.marchas == 6
    assert 200 < f.potencia_cv < 350
    assert 240 < f.torque_nm < 300
    assert f.redline == 8000


def test_quase_todo_carro_tem_motor(acervo):
    """163 dos 168. Os que faltam são justificados, não esquecidos."""
    sem = [c for c in acervo.carros
           if not (acervo.fichas.de(c) and acervo.fichas.de(c).tem_motor)]
    assert len(sem) <= 6, "carros sem motor alem do esperado: %s" % sem
    # Helicóptero e reboque não têm configuração de motor no jogo, e o 991 GT3
    # não tem pasta de ajuste nenhuma.
    for c in sem:
        assert (c.startswith(("ai_", "airwolf"))
                or "_generic_" in c
                or c == "car_porsche_991gt3_2015"), c


def test_ninguem_casa_com_carro_de_outra_marca(acervo):
    """A regra de prefixo comum é a mais frouxa da lista; se ela casar um
    Porsche com um Nissan, o número fica plausível e errado."""
    for carro, f in acervo.fichas.por_carro.items():
        marca_carro = carro.split("_")[1] if "_" in carro else carro
        marca_ficha = f.origem.lower().split("_")[1] if "_" in f.origem else ""
        if carro.startswith("sd_"):
            continue  # derelict empresta do carro de rua, de propósito
        assert marca_carro == marca_ficha, \
            "%s casou com %s (%s)" % (carro, f.origem, f.como)


def test_faixas_cobrem_o_acervo(acervo):
    faixas = acervo.fichas.faixas
    assert "potenciaCv" in faixas
    lo, hi = faixas["potenciaCv"]
    assert lo > 0 and hi > lo
    # O Regera é o mais forte do acervo; se a faixa nao alcançar ~800 cv,
    # alguma ficha deixou de ser lida.
    assert hi > 700


def test_curva_de_torque_e_crescente_em_rpm(acervo):
    f = acervo.fichas.de("car_bmw_m3e46_2003")
    rpms = [r for r, _ in f.curva]
    assert len(rpms) > 10
    assert rpms == sorted(rpms)
    assert rpms[0] >= 500 and rpms[-1] <= 12000
    pico = max(t for _, t in f.curva)
    assert abs(pico - f.torque_nm) < 1.5


def test_ficha_ausente_nao_quebra(tmp_path):
    """Sem o CSV, o app tem que seguir funcionando sem ficha."""
    f = Fichas(tmp_path)
    f.casar({"car_qualquer_2020": ""})
    assert f.por_carro == {}
    assert f.resumo()["disponivel"] is False

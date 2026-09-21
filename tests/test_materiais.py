"""Testes do mapeamento de material.

A regra e' **sensivel a maiuscula de proposito**: em minuscula,
`M_CarPaint_Trim_CarbonA_Max` contem "rim" e viraria aro. Esse foi o bug que
pintou de cromado o acabamento em carbono de 159 carros na ferramenta anterior.
"""
from __future__ import annotations

import pytest

from nfsgaragem.materiais import BASE, papel


@pytest.mark.parametrize("material, esperado", [
    # A armadilha do "trim"
    ("M_CarPaint_Trim_CarbonA_Max", "acabamento"),
    ("M_Carpaint_Trim_PlasticSmoothBlack_Max", "acabamento"),
    # As duas grafias de carpaint que o jogo usa
    ("M_CarPaint_Max", "pintura"),
    ("M_Carpaint_Max", "pintura"),
    ("M_CarpaintNormal_Max", "pintura"),
    # Roda
    ("M_Tire_Max", "pneu"),
    ("M_Rim_Main_Max", "aro"),
    ("M_RimBadge_Max", "emblema_roda"),
    ("M_Caliper_Max", "pinca"),
    ("M_Brake_Max", "freio"),
    # Vidro e luz
    ("M_Glass_WindowFront_Max", "vidro"),
    ("M_GlassOpaque_Mirror_Max", "espelho"),
    ("M_LightGlass_Red_Max", "lente"),
    ("M_LGlass_InnerClear_Max", "lente"),
    ("M_LightBucket_Max", "refletor"),
    ("M_Light_Max", "lampada"),
    ("M_ExtraLights_Max", "lampada"),
    ("M_SpoilerGlass_Max", "lente"),
    # Metal, com as duas grafias de aluminio que existem no acervo
    ("M_Opaque_ChromeSmooth_Max", "cromo"),
    ("M_Opaque_AluminumDarkRough_Max", "metal"),
    ("M_Opaque_AluminiumSmooth_Max", "metal"),
    ("M_Opaque_NickelRough_Max", "metal"),
    ("M_Opaque_GoldSmooth_Max", "metal"),
    # Acabamento e plastico
    ("M_Opaque_AnoRed_Max", "acabamento"),
    ("M_Opaque_PaintSatinBlack_Max", "acabamento"),
    ("M_Generics_Spoilers_Max", "acabamento"),
    ("M_Opaque_PaintSolidBlack_Max", "plastico"),
    ("M_Opaque_PlasticRoughBlack_Max", "plastico"),
    ("M_Detail_SetB_Max", "plastico"),
    # Motos, que tem vocabulario proprio
    ("M_BikePaint_Primary_Max", "pintura"),
    ("M_BikeRimF_Main_SetA_Max", "aro"),
    ("M_BikeGlass_Clear_Max", "vidro"),
    ("M_BikeSeat_SetA_Max", "interior"),
    ("M_BikeChain_Max", "metal"),
    # Resto
    ("M_Chassis_Max", "chassi"),
    ("M_Engine_Max", "motor"),
    ("M_Interior_Max", "interior"),
    ("M_Badge_Max", "emblema"),
    ("M_GrilleA_Max", "grade"),
    ("M_LicensePlate_Max", "placa"),
    ("blinn1", "generico"),
])
def test_papel(material, esperado):
    assert papel(material) == esperado


def test_todo_papel_tem_base_fisica():
    """Se um papel novo entrar na regra sem entrar na tabela BASE, o material
    sai cinza sem ninguem perceber."""
    from nfsgaragem.materiais import REGRAS
    for _, nome in REGRAS:
        assert nome in BASE, "papel %r sem base fisica" % nome

"""Testes do conversor de OBJ, com arquivos sinteticos -- nao precisa do acervo."""
from __future__ import annotations

import numpy as np
import pytest

from nfsgaragem import obj

# Cubo unitario, enrolamento para fora, com UV. Serve para checar normal.
CUBO = """# teste
o cubo
usemtl M_Teste_Max
v -1 -1 -1
v  1 -1 -1
v  1  1 -1
v -1  1 -1
v -1 -1  1
v  1 -1  1
v  1  1  1
v -1  1  1
vt 0 0
vt 1 0
vt 1 1
vt 0 1
vt 0 0
vt 1 0
vt 1 1
vt 0 1
f 1/1 3/3 2/2
f 1/1 4/4 3/3
f 5/1 6/2 7/3
f 5/1 7/3 8/4
f 1/1 2/2 6/2
f 1/1 6/2 5/1
f 2/2 3/3 7/3
f 2/2 7/3 6/2
f 3/3 4/4 8/4
f 3/3 8/4 7/3
f 4/4 1/1 5/1
f 4/4 5/1 8/4
"""


def escrever(tmp_path, nome, texto, crlf=False):
    p = tmp_path / nome
    dados = texto.replace("\n", "\r\n") if crlf else texto
    p.write_bytes(dados.encode("utf-8"))
    return p


def test_cubo_normais_apontam_para_fora(tmp_path):
    m = obj.converter(escrever(tmp_path, "cubo.obj", CUBO))
    assert len(m.objetos) == 1
    o = m.objetos[0]
    assert o.vertices == 8
    assert o.triangulos == 12
    # Toda normal de vertice de um cubo aponta na diagonal, para fora: o produto
    # com a posicao tem que ser positivo em todos os oito cantos.
    assert np.einsum("ij,ij->i", o.nrm, o.pos).min() > 0
    assert np.allclose(np.linalg.norm(o.nrm, axis=1), 1.0, atol=1e-5)


def test_crlf_nao_quebra(tmp_path):
    a = obj.converter(escrever(tmp_path, "lf.obj", CUBO))
    b = obj.converter(escrever(tmp_path, "crlf.obj", CUBO, crlf=True))
    assert a.objetos[0].vertices == b.objetos[0].vertices
    assert np.array_equal(a.objetos[0].pos, b.objetos[0].pos)


def test_vertice_orfao_e_compactado(tmp_path):
    texto = CUBO + "v 99 99 99\nvt 0 0\n"
    m = obj.converter(escrever(tmp_path, "orfao.obj", texto))
    # O vertice solto nao e' referenciado por face nenhuma e tem que sumir.
    assert m.objetos[0].vertices == 8
    assert float(np.abs(m.objetos[0].pos).max()) == 1.0


def test_grupo_distante_e_descartado(tmp_path):
    texto = CUBO + """usemtl M_Longe_Max
v 199 0 0
v 200 0 0
v 200 1 0
vt 0 0
vt 1 0
vt 1 1
f 9/9 10/10 11/11
"""
    m = obj.converter(escrever(tmp_path, "longe.obj", texto))
    assert len(m.descartes) == 1
    assert m.descartes[0].material == "M_Longe_Max"
    assert m.descartes[0].distancia_m > 100
    assert m.objetos[0].triangulos == 12


def test_limite_acompanha_o_tamanho_da_peca(tmp_path):
    """Um reboque de 24 m tem placa legitima a 6 m do centro.

    Com limite fixo de 5 m essa placa era jogada fora -- foi o que a varredura
    do acervo mostrou no `car_generic_containertrailer_2017`.
    """
    corpo = ["o reboque", "usemtl M_Corpo_Max"]
    for i, z in enumerate((-12, 12)):
        corpo += ["v -1 0 %d" % z, "v 1 0 %d" % z, "v 1 2 %d" % z]
    corpo += ["vt 0 0"] * 6
    corpo += ["f 1/1 2/2 3/3", "f 4/4 5/5 6/6"]
    corpo += ["usemtl M_LicensePlate_Max",
              "v -0.2 0.5 -11.8", "v 0.2 0.5 -11.8", "v 0.2 0.9 -11.8",
              "vt 0 0", "vt 0 0", "vt 0 0", "f 7/7 8/8 9/9"]
    m = obj.converter(escrever(tmp_path, "reboque.obj", "\n".join(corpo) + "\n"))
    assert m.descartes == []


def test_face_com_quatro_vertices_da_erro_claro(tmp_path):
    texto = "o q\nusemtl M\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\n" \
            "vt 0 0\nvt 0 0\nvt 0 0\nvt 0 0\nf 1/1 2/2 3/3 4/4\n"
    with pytest.raises(obj.ErroObj) as e:
        obj.converter(escrever(tmp_path, "quad.obj", texto))
    assert "triangulo" in str(e.value)


def test_enrolamento_invertido_so_mexe_em_casca_fechada(tmp_path):
    invertido = CUBO.replace("f 1/1 3/3 2/2", "f 1/1 2/2 3/3")
    linhas = [l for l in invertido.splitlines() if not l.startswith("f ")]
    faces = [l for l in CUBO.splitlines() if l.startswith("f ")]
    # inverte todas as faces
    viradas = []
    for f in faces:
        a, b, c = f[2:].split()
        viradas.append("f %s %s %s" % (a, c, b))
    texto = "\n".join(linhas + viradas) + "\n"

    m = obj.converter(escrever(tmp_path, "avesso.obj", texto),
                      checar_enrolamento=True)
    assert m.invertidos == ["cubo"]
    o = m.objetos[0]
    assert np.einsum("ij,ij->i", o.nrm, o.pos).min() > 0

    # Superficie aberta: volume assinado nao quer dizer nada, nao pode mexer.
    aberta = "o aba\nusemtl M\nv 0 0 0\nv 1 0 0\nv 1 1 0\n" \
             "vt 0 0\nvt 0 0\nvt 0 0\nf 1/1 2/2 3/3\n"
    m2 = obj.converter(escrever(tmp_path, "aberta.obj", aberta),
                       checar_enrolamento=True)
    assert m2.invertidos == []

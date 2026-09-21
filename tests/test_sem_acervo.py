"""O app sem acervo: a situacao de quem clonou o repositorio e ainda nao
extraiu os arquivos do proprio jogo.

Ficam **fora** do `test_servidor.py` de proposito: la' existe um
`pytestmark = skipif(raiz is None)` no modulo, e ele pularia justamente estes --
na unica maquina onde eles importam, que e' a que nao tem acervo nenhum.
"""
from __future__ import annotations

import http.client
import json
import threading

import pytest

from nfsgaragem.servidor import App, criar_servidor


@pytest.fixture(scope="module")
def servidor_sem_acervo():
    app = App(None)
    s = criar_servidor(app, "127.0.0.1", 0)
    t = threading.Thread(target=s.serve_forever, daemon=True)
    t.start()
    yield s.server_address[1]
    s.shutdown()
    s.server_close()


def pedir(porta, caminho, host="127.0.0.1"):
    c = http.client.HTTPConnection("127.0.0.1", porta, timeout=20)
    c.request("GET", caminho, headers={"Host": host})
    r = c.getresponse()
    corpo = r.read()
    c.close()
    return r.status, corpo


def test_sem_acervo_a_pagina_ainda_sobe(servidor_sem_acervo):
    """Sem arquivos o app tem que abrir e explicar, nao recusar a subir."""
    status, corpo = pedir(servidor_sem_acervo, "/")
    assert status == 200
    assert b"sem-acervo" in corpo


def test_sem_acervo_o_front_descobre_e_recebe_os_links(servidor_sem_acervo):
    status, corpo = pedir(servidor_sem_acervo, "/api/acervo")
    assert status == 200
    dados = json.loads(corpo)
    assert dados["semAcervo"] is True
    # O front monta os botoes a partir daqui; sem a chave ele nao mostra nada.
    assert "ferramentas" in dados["links"]


def test_sem_acervo_o_resto_da_api_responde_503(servidor_sem_acervo):
    """503 e nao 404: o recurso existe, o que falta e' a pasta de arquivos."""
    for rota in ("/api/carro/car_bmw_m3e46_2003",
                 "/api/carro/car_bmw_m3e46_2003/corpo.bin",
                 "/api/diagnostico"):
        status, corpo = pedir(servidor_sem_acervo, rota)
        assert status == 503, rota
        assert b"sem acervo" in corpo


def test_sem_acervo_a_guarda_de_host_continua_valendo(servidor_sem_acervo):
    status, _ = pedir(servidor_sem_acervo, "/api/acervo", host="evil.test")
    assert status == 403

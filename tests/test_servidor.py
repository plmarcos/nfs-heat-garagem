"""Testes do servidor: a parte de seguranca, que e' a que nao pode falhar."""
from __future__ import annotations

import http.client
import json
import threading

import pytest

from nfsgaragem.config import resolver_acervo
from nfsgaragem.servidor import App, criar_servidor

raiz = resolver_acervo(None)
pytestmark = pytest.mark.skipif(raiz is None, reason="acervo nao encontrado")


@pytest.fixture(scope="module")
def servidor():
    app = App(raiz)
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


def test_host_precisa_ser_loopback(servidor):
    """Sem isso, qualquer site aberto no navegador fala com este processo."""
    status, corpo = pedir(servidor, "/api/acervo", host="evil.test")
    assert status == 403
    assert b"loopback" in corpo


def test_acervo_responde(servidor):
    status, corpo = pedir(servidor, "/api/acervo")
    assert status == 200
    assert len(json.loads(corpo)["carros"]) == 168


@pytest.mark.parametrize("caminho", [
    "/api/textura/carro/car_bmw_m3e46_2003/..%2f..%2f..%2fWindows%2fwin.ini",
    "/api/textura/carro/..%2f..%2f_ferramentas/Export.cs",
    "/static/../garagem.py",
    "/api/carro/..%2f..%2fetc/corpo.bin",
])
def test_nao_sai_da_raiz(servidor, caminho):
    status, corpo = pedir(servidor, caminho)
    assert status in (400, 403, 404)
    assert b"[project]" not in corpo
    assert b"HeatTool" not in corpo


def test_carro_desconhecido_da_404_sem_traceback(servidor):
    status, corpo = pedir(servidor, "/api/carro/nao_existe")
    assert status == 404
    assert b"Traceback" not in corpo
    assert json.loads(corpo)["erro"]


def test_peca_fora_do_catalogo_e_recusada(servidor):
    """O nome so' passa se estiver no catalogo em memoria."""
    status, _ = pedir(
        servidor, "/api/carro/car_bmw_m3e46_2003/peca/hood/inventada.bin")
    assert status == 404


def test_corpo_vem_em_nfsg(servidor):
    status, corpo = pedir(servidor, "/api/carro/car_bmw_m3e46_2003/corpo.bin")
    assert status == 200
    assert corpo[:4] == b"NFSG"
    assert len(corpo) > 1_000_000


def test_cada_composto_de_pneu_tem_payload_e_etag_proprios(servidor):
    """Regressao cara: o ETag de `/api/pneu/` nao incluia o composto.

    A chave do cache em disco incluia, o ETag nao. Com
    `Cache-Control: max-age=3600` o navegador servia por uma hora, **sem
    perguntar**, o payload de outro composto -- e o pneu chegava sem textura.
    """
    etags, corpos = {}, {}
    for composto in ("race01", "drift01", "offroad01"):
        c = http.client.HTTPConnection("127.0.0.1", servidor, timeout=30)
        c.request("GET", "/api/pneu/%s.bin" % composto, headers={"Host": "127.0.0.1"})
        r = c.getresponse()
        corpos[composto] = r.read()
        etags[composto] = r.getheader("ETag")
        assert r.getheader("Cache-Control") == "no-cache",             "payload binario nao pode ter max-age: o navegador para de revalidar"
        c.close()
    assert len(set(etags.values())) == 3, "compostos diferentes com o mesmo ETag: %s" % etags
    assert len(set(corpos.values())) == 3, "compostos diferentes com o mesmo payload"


def test_pneu_traz_textura_do_acervo_compartilhado(servidor):
    """O pneu e' malha compartilhada: a textura dele nao esta' na pasta do carro."""
    status, corpo = pedir(servidor, "/api/pneu/race01.bin")
    assert status == 200
    tam = int.from_bytes(corpo[8:12], "little")
    cab = json.loads(corpo[16:16 + tam].decode("utf-8"))
    tire = cab["materiais"]["M_Tire_Max"]
    assert tire["papel"] == "pneu"
    assert "normal" in tire["mapas"], "pneu sem mapa de relevo: renderiza liso e some"
    assert "/api/textura/roda/" in tire["mapas"]["normal"]
    assert cab.get("composto") == "race01"


def test_etag_bate_com_a_chave_do_cache(servidor):
    """Se o ETag e a chave do cache forem montados em lugares diferentes, eles
    divergem -- foi o que aconteceu. A funcao tem que ser uma so'."""
    from nfsgaragem.servidor import App
    from nfsgaragem.acervo import Acervo
    ac = Acervo(raiz)
    esperado = App.chave_de(ac.caminho_pneu("race01"), "pneu", composto="race01")
    c = http.client.HTTPConnection("127.0.0.1", servidor, timeout=30)
    c.request("GET", "/api/pneu/race01.bin", headers={"Host": "127.0.0.1"})
    r = c.getresponse()
    r.read()
    assert r.getheader("ETag") == '"%s"' % esperado
    c.close()

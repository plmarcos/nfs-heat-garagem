"""Servidor local do app.

Seguranca, copiada do visualizador do MC3 e inegociavel:
- o cabecalho Host precisa ser loopback, senao 403 (anti-DNS-rebinding: sem isso
  um site qualquer aberto no navegador consegue falar com este processo);
- cada segmento de caminho e' validado por expressao **e** conferido contra o
  catalogo em memoria antes de tocar o disco;
- o caminho final e' resolvido e afirmado dentro da raiz do acervo;
- nenhum traceback vai para a resposta.
"""
from __future__ import annotations

import json
import mimetypes
import posixpath
import re
import time
import traceback
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import numpy as np

from . import materiais as mats
from . import obj as objmod
from . import rodas as rodasmod
from .acervo import Acervo
from .cache import CacheDisco, CacheMemoria, chave
from .config import LINKS_DOS_ARQUIVOS, pasta_dados
from .malha import VERSAO_CONVERSOR, empacotar
from .texturas import preparar as preparar_textura

RAIZ_ESTATICA = Path(__file__).resolve().parent.parent / "static"
SEGMENTO = re.compile(r"^[A-Za-z0-9_.\-]+$")
HOSTS = {"127.0.0.1", "localhost", "::1", "[::1]"}


class App:
    """Estado compartilhado entre as requisicoes."""

    def __init__(self, raiz_acervo: Path | None) -> None:
        # `None` e' um estado valido: quem baixou so' o programa ainda nao tem os
        # arquivos, e o certo e' abrir uma tela explicando em vez de recusar a
        # subir. O roteador barra tudo que depende do acervo com 503.
        self.acervo = Acervo(raiz_acervo) if raiz_acervo is not None else None
        self.mem_corpos = CacheMemoria(256)
        self.mem_pecas = CacheMemoria(192)
        self.disco = CacheDisco(pasta_dados() / "cache")
        self.disco.varrer()
        self.tempos: list[dict] = []
        self.faltas_textura: dict[str, int] = {}
        self.descartes: list[dict] = []

    # -- conversao --------------------------------------------------------
    def _materiais_payload(self, carro: str, nomes: list[str],
                           *, slot: str | None = None,
                           variante: str | None = None,
                           composto: str | None = None) -> dict:
        mtl_corpo = mats.ler_mtl(str(self.acervo.raiz / carro / (carro + ".mtl")))
        indice = mats.indice_texturas(
            str(self.acervo.pasta_texturas(carro)), carro + "_")
        saida: dict[str, dict] = {}
        for nome in nomes:
            papel = mats.papel(nome)
            achados, origem = mats.mapas_do_material(
                nome, mtl_corpo, indice, slot=slot, variante=variante)
            if origem == "ausente" and papel in {"lampada", "lente", "interior", "motor"}:
                self.faltas_textura[nome] = self.faltas_textura.get(nome, 0) + 1
            base = dict(mats.BASE.get(papel, mats.BASE["generico"]))
            base["papel"] = papel
            base["origem"] = origem
            base["mapas"] = {
                tipo: "/api/textura/carro/%s/%s?tipo=%s" % (carro, arq, tipo)
                for tipo, arq in achados.items()
            }
            # O pneu e' malha compartilhada: as texturas dele estao em
            # `_texturas_rodas/tires`, nao na pasta do carro.
            if papel == "pneu" and composto:
                do_pneu = mats.mapas_do_pneu(
                    str(self.acervo.raiz / "_texturas_rodas" / "tires"), composto)
                if do_pneu:
                    base["mapas"] = {
                        tipo: "/api/textura/roda/%s?tipo=%s" % (arq, tipo)
                        for tipo, arq in do_pneu.items()
                    }
                    base["origem"] = "pneu compartilhado"

            saida[nome] = base
        return saida

    @staticmethod
    def chave_de(caminho: Path, tipo: str, slot: str = "", variante: str = "",
                 composto: str = "") -> str:
        """A chave do cache **e** o ETag: uma funcao so'.

        Estavam em lugares diferentes e divergiram: o ETag de `/api/pneu/` nao
        incluia o composto, entao o navegador servia do proprio cache um payload
        antigo, sem as texturas do pneu, e o material chegava sem mapa nenhum.
        """
        return chave(caminho, tipo, slot, variante, composto)

    def _converter(self, caminho: Path, *, carro: str, tipo: str,
                   slot: str | None = None, variante: str | None = None,
                   extra: dict | None = None, composto: str | None = None) -> bytes:
        mem = self.mem_corpos if tipo in {"corpo", "roda", "pneu"} else self.mem_pecas
        k = self.chave_de(caminho, tipo, slot or "", variante or "", composto or "")
        achado = mem.get(k)
        if achado is not None:
            return achado
        achado = self.disco.get(k)
        if achado is not None:
            mem.put(k, achado)
            return achado

        t0 = time.perf_counter()
        malha = objmod.converter(caminho)
        dados = empacotar(
            malha, carro=carro, tipo=tipo,
            materiais=self._materiais_payload(
                carro, malha.materiais, slot=slot, variante=variante,
                composto=composto),
            extra=extra)
        ms = (time.perf_counter() - t0) * 1000
        self.tempos.append({"arquivo": caminho.name, "tipo": tipo,
                            "ms": round(ms, 1), "mb": round(len(dados) / 1024 ** 2, 2)})
        del self.tempos[:-200]
        for d in malha.descartes:
            self.descartes.append({"arquivo": caminho.name, "objeto": d.objeto,
                                   "material": d.material, "distancia_m": d.distancia_m})
        mem.put(k, dados)
        self.disco.put(k, dados)
        return dados

    def corpo(self, carro: str) -> bytes:
        return self._converter(self.acervo.caminho_corpo(carro),
                               carro=carro, tipo="corpo")

    def peca(self, carro: str, slot: str, peca: str) -> bytes | None:
        caminho = self.acervo.caminho_peca(carro, slot, peca)
        if caminho is None or not caminho.is_file():
            return None
        variante = peca.rsplit("_", 1)[-1] if "_" in peca else None
        return self._converter(caminho, carro=carro, tipo="peca",
                               slot=slot, variante=variante)

    def peca_fabrica(self, carro: str, slot: str) -> bytes | None:
        caminho = self.acervo.caminho_peca_fabrica(carro, slot)
        if not caminho.is_file():
            return None
        return self._converter(caminho, carro=carro, tipo="peca", slot=slot)

    def roda(self, carro: str) -> bytes | None:
        caminho = self.acervo.caminho_roda(carro)
        if not caminho.is_file():
            return None
        malha_roda = objmod.converter(caminho)
        nomes = [o.nome for o in malha_roda.objetos]
        extra = {
            "eixoDoObjeto": {
                "f": rodasmod.objeto_do_eixo(nomes, "f"),
                "t": rodasmod.objeto_do_eixo(nomes, "t"),
            },
            "nativo": {},
        }
        for o in malha_roda.objetos:
            raio, largura = rodasmod.medidas_nativas(o.pos)
            extra["nativo"][o.nome] = {"raio": raio, "largura": largura}
        return self._converter(caminho, carro=carro, tipo="roda", extra=extra)

    def pneu(self, composto: str) -> bytes | None:
        caminho = self.acervo.caminho_pneu(composto)
        if not caminho.is_file():
            return None
        malha_pneu = objmod.converter(caminho)
        raio, largura = rodasmod.medidas_nativas(
            np.concatenate([o.pos for o in malha_pneu.objetos])
            if malha_pneu.objetos else np.zeros((0, 3), dtype=np.float32))
        return self._converter(caminho, carro="_pneu", tipo="pneu",
                               composto=composto,
                               extra={"nativo": {"raio": raio, "largura": largura},
                                      "composto": composto})

    def colocacoes(self, carro: str) -> dict:
        spec = self.acervo.espec_roda(carro)
        if spec is None:
            return {"disponivel": False, "motivo": "sem linha em _rodas_eixos.csv"}
        if not self.acervo.caminho_roda(carro).is_file():
            # Os dois helicopteros tem linha na tabela mas nao tem malha de roda.
            return {"disponivel": False, "motivo": "este veiculo nao tem malha de roda"}
        c = self.acervo.carros[carro]
        return {
            "disponivel": True,
            "eixoUnico": c.familia == "moto",
            "confianca": spec.confianca,
            "medidas": {
                "zFrente": spec.z_frente, "zTras": spec.z_tras,
                "meiaBitolaF": spec.meia_bitola_f, "meiaBitolaT": spec.meia_bitola_t,
                "diamFrente": spec.diam_frente, "diamTras": spec.diam_tras,
                "largFrente": spec.larg_frente, "largTras": spec.larg_tras,
            },
        }


def build_handler(app: App):
    class Handler(SimpleHTTPRequestHandler):
        server_version = "NFSHeatGaragem"
        protocol_version = "HTTP/1.1"

        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(RAIZ_ESTATICA), **kw)

        # -- utilidades ---------------------------------------------------
        def log_message(self, fmt, *args):  # silencia o log por requisicao
            pass

        def _host_local(self) -> bool:
            host = (self.headers.get("Host") or "").split(":")[0].strip().lower()
            return host in HOSTS or host == ""

        def _enviar(self, corpo: bytes, tipo: str, *, cache: str = "no-store",
                    etag: str | None = None) -> None:
            self.send_response(200)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(corpo)))
            self.send_header("Cache-Control", cache)
            self.send_header("X-Content-Type-Options", "nosniff")
            if etag:
                self.send_header("ETag", '"%s"' % etag)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(corpo)

        def _json(self, dados, *, cache: str = "no-store") -> None:
            self._enviar(json.dumps(dados, ensure_ascii=False).encode("utf-8"),
                         "application/json; charset=utf-8", cache=cache)

        def _erro(self, codigo: int, mensagem: str) -> None:
            corpo = json.dumps({"erro": mensagem}, ensure_ascii=False).encode("utf-8")
            self.send_response(codigo)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(corpo)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(corpo)

        def _bin(self, dados: bytes | None, etag: str) -> None:
            if dados is None:
                return self._erro(404, "nao encontrado")
            if self.headers.get("If-None-Match") == '"%s"' % etag:
                self.send_response(304)
                self.send_header("ETag", '"%s"' % etag)
                self.end_headers()
                return
            # `no-cache` **nao** e' "nao guarde": e' "guarde, mas pergunte antes de
            # usar". Com `max-age=3600` o navegador servia a copia velha por uma
            # hora sem falar com o servidor, e mudanca de material nao aparecia.
            # Em loopback a revalidacao custa nada e o 304 evita o download.
            self._enviar(dados, "application/octet-stream",
                         cache="no-cache", etag=etag)

        def _arquivo_seguro(self, base: Path, nome: str) -> Path | None:
            """So' devolve caminho que resolve para dentro de `base`."""
            if not SEGMENTO.match(nome):
                return None
            alvo = (base / nome).resolve()
            try:
                alvo.relative_to(base.resolve())
            except ValueError:
                return None
            return alvo if alvo.is_file() else None

        def _png(self, caminho: Path | None) -> None:
            if caminho is None:
                return self._erro(404, "textura nao encontrada")
            tipo = (getattr(self, "_consulta", {}) or {}).get("tipo", [""])[0]
            try:
                dados = preparar_textura(caminho, como_normal=(tipo == "normal"))
            except OSError:
                return self._erro(404, "textura ilegivel")
            self._enviar(dados, "image/png", cache="no-cache")

        # -- roteamento ---------------------------------------------------
        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            if not self._host_local():
                return self._erro(403, "somente loopback")
            try:
                partes_url = urlparse(self.path)
                self._consulta = parse_qs(partes_url.query)
                self._rotear(unquote(partes_url.path))
            except BrokenPipeError:
                pass
            except Exception:
                traceback.print_exc()
                try:
                    self._erro(500, "falha interna; veja o console")
                except Exception:
                    pass

        def _rotear(self, caminho: str) -> None:
            ac = app.acervo
            partes = [p for p in posixpath.normpath(caminho).split("/") if p and p != "."]

            # `escolher-pasta` nao e' uma rota de verdade: e' o sinal que o botao
            # da tela de boas-vindas deixa na URL para o lancador da janela ver.
            # Servir a mesma pagina evita que um 404 pisque na tela entre o
            # clique e o dialogo de pasta abrir.
            if not partes or partes in (["index.html"], ["escolher-pasta"]):
                return self._servir_estatico("index.html")

            if partes[0] == "static":
                return self._servir_estatico("/".join(partes[1:]))

            if partes[0] != "api":
                return self._erro(404, "rota desconhecida")

            # /api/acervo -- unica rota que responde sem acervo, porque e' ela
            # que conta ao front que nao ha' acervo e para onde mandar a pessoa.
            if partes[1:] == ["acervo"]:
                if ac is None:
                    return self._json({"semAcervo": True,
                                       "links": LINKS_DOS_ARQUIVOS,
                                       "versao": VERSAO_CONVERSOR})
                return self._json({**ac.resumo(), "links": LINKS_DOS_ARQUIVOS})

            if ac is None:
                return self._erro(503, "sem acervo: escolha a pasta dos arquivos")

            # /api/diagnostico
            if partes[1:] == ["diagnostico"]:
                return self._json({
                    "acervo": str(ac.raiz),
                    "carros": len(ac.carros),
                    "memoriaCorpos": app.mem_corpos.estado(),
                    "memoriaPecas": app.mem_pecas.estado(),
                    "tempos": app.tempos[-40:],
                    "descartes": app.descartes[-40:],
                    "faltasTextura": app.faltas_textura,
                })

            # /api/pneu/<composto>.bin
            if len(partes) == 3 and partes[1] == "pneu" and partes[2].endswith(".bin"):
                composto = partes[2][:-4]
                if composto not in ac.pneus:
                    return self._erro(404, "composto desconhecido")
                p = ac.caminho_pneu(composto)
                return self._bin(app.pneu(composto),
                                 App.chave_de(p, "pneu", composto=composto))

            # /api/textura/carro/<carro>/<arquivo>
            if len(partes) == 5 and partes[1] == "textura" and partes[2] == "carro":
                carro = partes[3]
                if not ac.existe(carro):
                    return self._erro(404, "carro desconhecido")
                return self._png(self._arquivo_seguro(ac.pasta_texturas(carro), partes[4]))

            # /api/textura/roda/<arquivo>
            if len(partes) == 4 and partes[1] == "textura" and partes[2] == "roda":
                base = ac.raiz / "_texturas_rodas" / "wheels"
                achado = self._arquivo_seguro(base, partes[3])
                if achado is None:
                    achado = self._arquivo_seguro(
                        ac.raiz / "_texturas_rodas" / "tires", partes[3])
                return self._png(achado)

            # /api/carro/...
            if partes[1] == "carro" and len(partes) >= 3:
                carro = partes[2]
                if not ac.existe(carro):
                    return self._erro(404, "carro desconhecido")

                if len(partes) == 3:
                    ficha = ac.ficha_carro(carro)
                    ficha["rodas"] = app.colocacoes(carro)
                    return self._json(ficha)

                if partes[3] == "corpo.bin":
                    return self._bin(app.corpo(carro),
                                     App.chave_de(ac.caminho_corpo(carro), "corpo"))

                if partes[3] == "roda.bin":
                    return self._bin(app.roda(carro),
                                     App.chave_de(ac.caminho_roda(carro), "roda"))

                # /api/carro/<id>/fabrica/<slot>.bin
                if len(partes) == 5 and partes[3] == "fabrica" and partes[4].endswith(".bin"):
                    slot = partes[4][:-4]
                    if not SEGMENTO.match(slot):
                        return self._erro(400, "slot invalido")
                    return self._bin(
                        app.peca_fabrica(carro, slot),
                        App.chave_de(ac.caminho_peca_fabrica(carro, slot), "peca", slot))

                # /api/carro/<id>/peca/<slot>/<peca>.bin
                if len(partes) == 6 and partes[3] == "peca" and partes[5].endswith(".bin"):
                    slot, peca = partes[4], partes[5][:-4]
                    if not (SEGMENTO.match(slot) and SEGMENTO.match(peca)):
                        return self._erro(400, "nome invalido")
                    alvo = ac.caminho_peca(carro, slot, peca)
                    if alvo is None:
                        return self._erro(404, "peca fora do catalogo")
                    variante = peca.rsplit("_", 1)[-1] if "_" in peca else ""
                    return self._bin(app.peca(carro, slot, peca),
                                     App.chave_de(alvo, "peca", slot, variante))

            return self._erro(404, "rota desconhecida")

        def _servir_estatico(self, relativo: str) -> None:
            alvo = (RAIZ_ESTATICA / relativo).resolve()
            try:
                alvo.relative_to(RAIZ_ESTATICA.resolve())
            except ValueError:
                return self._erro(403, "fora da pasta estatica")
            if not alvo.is_file():
                return self._erro(404, "arquivo nao encontrado")
            tipo, _ = mimetypes.guess_type(alvo.name)
            if alvo.suffix in {".mjs", ".js"}:
                tipo = "text/javascript; charset=utf-8"
            elif alvo.suffix == ".css":
                tipo = "text/css; charset=utf-8"
            elif alvo.suffix == ".html":
                tipo = "text/html; charset=utf-8"
            cache = "no-cache" if alvo.suffix in {".mjs", ".js", ".css", ".html"} \
                else "private, max-age=3600"
            self._enviar(alvo.read_bytes(), tipo or "application/octet-stream", cache=cache)

    return Handler


def criar_servidor(app: App, host: str = "127.0.0.1", porta: int = 8770):
    return ThreadingHTTPServer((host, porta), build_handler(app))

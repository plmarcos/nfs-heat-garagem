"""Onde fica o acervo e o que o app lembra entre uma sessao e outra.

A raiz do acervo e' configuracao, nunca constante: os scripts que geraram esses
arquivos trazem caminho da maquina do autor embutido, e este app nao repete isso.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

PADRAO_ACERVO = Path("F:/CarsNfSHeat")

# Onde a pessoa consegue os arquivos. O programa **nao** traz modelo nem textura
# do jogo: esse material e' da Electronic Arts e so' pode sair da copia legitima
# de quem usa. Por isso o link padrao aponta para as **ferramentas de extracao**,
# que rodam sobre a copia do proprio usuario, e nao para um download de asset.
#
# `proprio` fica vazio de proposito: o botao so' aparece quando tem endereco.
# Quem preencher assume a decisao e o risco de onde aquele link leva -- publicar
# asset extraido do jogo e' decisao de quem publica, nao deste programa.
LINKS_DOS_ARQUIVOS = {
    "ferramentas": "https://github.com/plmarcos/nfs-heat-car-tools",
    "proprio": "",
}


def pasta_dados() -> Path:
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    return Path(base) / "NFSHeatGaragem"


def caminho_config() -> Path:
    return pasta_dados() / "config.json"


def ler_config() -> dict:
    try:
        return json.loads(caminho_config().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def gravar_config(dados: dict) -> None:
    try:
        pasta_dados().mkdir(parents=True, exist_ok=True)
        caminho_config().write_text(
            json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")
    except OSError:
        pass  # preferencia nao e' dado critico; perder uma nao justifica travar


def e_acervo(caminho: Path) -> bool:
    """Reconhece a pasta pelo indice, que e' o arquivo que so' ela tem."""
    return (caminho / "_indice.csv").is_file()


def resolver_acervo(explicito: str | None = None) -> Path | None:
    """--acervo, depois NFSHEAT_ACERVO, depois o config, depois o padrao."""
    candidatos = []
    if explicito:
        candidatos.append(Path(explicito))
    do_ambiente = os.environ.get("NFSHEAT_ACERVO")
    if do_ambiente:
        candidatos.append(Path(do_ambiente))
    salvo = ler_config().get("acervo")
    if salvo:
        candidatos.append(Path(salvo))
    candidatos.append(PADRAO_ACERVO)
    for c in candidatos:
        if e_acervo(c):
            return c
    return None

"""Formato de fio NFSG1: cabecalho JSON mais um bloco binario.

JSON puro de numero custaria ~20 MB de texto e um parse para o mesmo carro que
cabe em 2,9 MB de buffer; glTF exigiria um serializador e o GLTFLoader por uma
interoperabilidade que aqui nao vale nada, ja' que nada mais consome estes
arquivos.

    0  : b"NFSG"
    4  : uint32 versao
    8  : uint32 bytes do cabecalho
    12 : uint32 reservado (mantem o bloco binario alinhado em 16)
    16 : cabecalho JSON UTF-8, preenchido ate' multiplo de 4
    .. : buffers, cada um alinhado em 4
"""
from __future__ import annotations

import json
import struct
from typing import Any

import numpy as np

MAGICO = b"NFSG"
VERSAO = 1

# Entra na chave do cache em disco: mudar o conversor invalida tudo sozinho,
# sem ninguem precisar lembrar de limpar pasta.
VERSAO_CONVERSOR = "6"


class _Blocos:
    def __init__(self) -> None:
        self.partes: list[bytes] = []
        self.total = 0

    def add(self, arranjo: np.ndarray) -> dict[str, Any]:
        dados = np.ascontiguousarray(arranjo).tobytes()
        sobra = (-self.total) % 4
        if sobra:
            self.partes.append(b"\0" * sobra)
            self.total += sobra
        registro = {
            "off": self.total,
            "len": len(dados),
            "tipo": "f32" if arranjo.dtype == np.float32 else "u32",
            "comp": int(arranjo.shape[1]) if arranjo.ndim > 1 else 1,
        }
        self.partes.append(dados)
        self.total += len(dados)
        return registro

    def bytes(self) -> bytes:
        return b"".join(self.partes)


def empacotar(malha,
              *,
              carro: str,
              tipo: str,
              materiais: dict[str, Any] | None = None,
              extra: dict[str, Any] | None = None) -> bytes:
    """Serializa uma `obj.Malha` em NFSG1."""
    blocos = _Blocos()
    objetos = []
    for obj in malha.objetos:
        objetos.append({
            "nome": obj.nome,
            "vertices": obj.vertices,
            "triangulos": obj.triangulos,
            "pos": blocos.add(obj.pos),
            "nrm": blocos.add(obj.nrm),
            "uv": blocos.add(obj.uv),
            "idx": blocos.add(obj.idx),
            "grupos": [{"material": g.material, "inicio": g.inicio,
                        "contagem": g.contagem} for g in obj.grupos],
            "limites": obj.limites(),
        })

    cabecalho: dict[str, Any] = {
        "formato": "NFSG1",
        "carro": carro,
        "tipo": tipo,
        "unidades": "metros",
        "eixo": "Y-up, +Z frente",
        "limites": malha.limites(),
        "objetos": objetos,
        "materiais": materiais or {},
        "descartes": [{"objeto": d.objeto, "material": d.material,
                       "motivo": d.motivo, "distancia_m": d.distancia_m}
                      for d in malha.descartes],
    }
    if extra:
        cabecalho.update(extra)

    texto = json.dumps(cabecalho, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    texto += b" " * ((-len(texto)) % 4)
    return b"".join([
        MAGICO,
        struct.pack("<III", VERSAO, len(texto), 0),
        texto,
        blocos.bytes(),
    ])


def ler_cabecalho(dados: bytes) -> dict[str, Any]:
    """Le so' o cabecalho -- util em teste e no diagnostico."""
    if dados[:4] != MAGICO:
        raise ValueError("nao e' um arquivo NFSG1")
    versao, tamanho, _ = struct.unpack_from("<III", dados, 4)
    if versao != VERSAO:
        raise ValueError("versao NFSG %d desconhecida" % versao)
    return json.loads(dados[16:16 + tamanho].decode("utf-8"))

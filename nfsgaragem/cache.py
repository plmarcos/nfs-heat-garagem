"""Cache de payload em memoria e em disco.

A chave inclui `mtime_ns` e o tamanho do arquivo de origem, mais a versao do
conversor: reextrair um OBJ ou mexer no `obj.py` invalida sozinho, sem ninguem
precisar lembrar de apagar pasta.
"""
from __future__ import annotations

import hashlib
import os
import threading
from collections import OrderedDict
from pathlib import Path

from .malha import VERSAO_CONVERSOR


def chave(caminho: Path, *sufixos: str) -> str:
    try:
        st = caminho.stat()
        assinatura = "%s|%d|%d|%s|%s" % (
            caminho.as_posix(), st.st_mtime_ns, st.st_size,
            VERSAO_CONVERSOR, "|".join(sufixos))
    except OSError:
        assinatura = "%s|ausente|%s" % (caminho.as_posix(), VERSAO_CONVERSOR)
    return hashlib.sha1(assinatura.encode("utf-8")).hexdigest()


class CacheMemoria:
    """LRU medido em bytes, nao em numero de entradas: um corpo de 2,9 MB e uma
    peca de 140 KB nao podem valer o mesmo no orcamento."""

    def __init__(self, teto_mb: int) -> None:
        self.teto = teto_mb * 1024 * 1024
        self.total = 0
        self._itens: OrderedDict[str, bytes] = OrderedDict()
        self._lock = threading.Lock()
        self.acertos = 0
        self.faltas = 0

    def get(self, k: str) -> bytes | None:
        with self._lock:
            dados = self._itens.get(k)
            if dados is None:
                self.faltas += 1
                return None
            self._itens.move_to_end(k)
            self.acertos += 1
            return dados

    def put(self, k: str, dados: bytes) -> None:
        with self._lock:
            if k in self._itens:
                self.total -= len(self._itens.pop(k))
            self._itens[k] = dados
            self.total += len(dados)
            while self.total > self.teto and len(self._itens) > 1:
                _, velho = self._itens.popitem(last=False)
                self.total -= len(velho)

    def estado(self) -> dict:
        return {"itens": len(self._itens), "mb": round(self.total / 1024 ** 2, 1),
                "acertos": self.acertos, "faltas": self.faltas}


class CacheDisco:
    def __init__(self, pasta: Path, teto_gb: float = 2.0) -> None:
        self.pasta = Path(pasta)
        self.teto = int(teto_gb * 1024 ** 3)
        try:
            self.pasta.mkdir(parents=True, exist_ok=True)
        except OSError:
            self.pasta = None  # type: ignore[assignment]

    def _arquivo(self, k: str) -> Path:
        return self.pasta / (k + ".nfsg")

    def get(self, k: str) -> bytes | None:
        if self.pasta is None:
            return None
        p = self._arquivo(k)
        try:
            dados = p.read_bytes()
        except OSError:
            return None
        try:
            os.utime(p, None)  # marca o uso, para o LRU do arranque
        except OSError:
            pass
        return dados

    def put(self, k: str, dados: bytes) -> None:
        if self.pasta is None:
            return
        tmp = self._arquivo(k).with_suffix(".parcial")
        try:
            tmp.write_bytes(dados)
            tmp.replace(self._arquivo(k))
        except OSError:
            try:
                tmp.unlink()
            except OSError:
                pass

    def varrer(self) -> int:
        """Apaga o mais antigo ate' caber no teto. Devolve os bytes liberados."""
        if self.pasta is None:
            return 0
        try:
            itens = [(p.stat().st_mtime, p.stat().st_size, p)
                     for p in self.pasta.glob("*.nfsg")]
        except OSError:
            return 0
        total = sum(s for _, s, _ in itens)
        liberado = 0
        for _, tamanho, p in sorted(itens):
            if total <= self.teto:
                break
            try:
                p.unlink()
                total -= tamanho
                liberado += tamanho
            except OSError:
                pass
        return liberado

    def limpar(self) -> int:
        if self.pasta is None:
            return 0
        liberado = 0
        for p in self.pasta.glob("*.nfsg"):
            try:
                liberado += p.stat().st_size
                p.unlink()
            except OSError:
                pass
        return liberado

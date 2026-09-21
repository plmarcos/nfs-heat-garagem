"""A ficha tecnica de cada veiculo, lida do `_ficha_tecnica.csv`.

O CSV sai do `ferramentas/extrair_ficha.ps1`, que le o EBX de ajuste do proprio
jogo. Conferido no M3 E46: massa 1495 kg e entre-eixos 2,736 m batem com o carro
real, entao o numero e' do jogo, nao estimativa.

**As pastas de ajuste nao usam os mesmos nomes das pastas de modelo.** Sao 146
fichas para 168 carros, com grafias soltas (`car_nissan_180sx_typex_1996` contra
`car_nissan_180sxtypex_1996`) e variantes que herdam a ficha do carro base. Em
vez de uma tabela escrita a mao, o casamento e' por regras, em ordem, e cada
carro guarda **como** casou -- assim da' para auditar em vez de confiar.
"""
from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from pathlib import Path

# Sufixos de marketing que a pasta de ajuste costuma nao ter.
SUFIXOS = (
    "icon", "deluxeedition", "deluxe", "premiumedition", "premium",
    "ultimateedition", "nfsedition", "cinematic", "redbulledition",
    "heroicon", "cop", "player", "derelict", "nfsu", "nfsmw", "nfsp",
)

# Estilos de carroceria: o targa e o conversivel sao **o mesmo carro** com outra
# capota, e no jogo usam o mesmo motor. Nao entram em SUFIXOS porque para o
# casamento principal eles sao carros distintos, com massa propria.
ESTILOS = ("targa", "convertible", "cabriolet", "roadster", "spyder", "spider", "coupe")

_RE_ANO = re.compile(r"_(19|20)\d{2}$")

# Dois nomes que nenhuma regra geral casa sem arriscar casar errado. Conferidos
# a mao, um a um, contra a lista de fichas Porsche.
ALIASES = {
    # A pasta de modelo escreve "9912gtrs" (991.2 GT3 RS); a de ajuste escreve
    # "991gt3rs". Nao ha' outro GT3 RS no acervo, entao e' este mesmo.
    "car_porsche_9912gtrs_2018": "car_porsche_991gt3rs_2018",
}


@dataclass
class Ficha:
    carro: str
    origem: str = ""             # de qual pasta de ajuste veio
    como: str = ""               # a regra que casou
    massa_kg: float | None = None
    entre_eixos_m: float | None = None
    bitola_f_m: float | None = None
    bitola_t_m: float | None = None
    potencia_cv: float | None = None
    rpm_potencia: int | None = None
    torque_nm: float | None = None
    rpm_torque: int | None = None
    redline: int | None = None
    rpm_max: int | None = None
    marcha_lenta: int | None = None
    marchas: int | None = None
    relacao_final: float | None = None
    tracao: str = ""
    curva: list[tuple[int, float]] = field(default_factory=list)

    @property
    def tem_motor(self) -> bool:
        return self.potencia_cv is not None and self.potencia_cv > 0

    def json(self) -> dict:
        return {
            "origem": self.origem, "como": self.como,
            "massaKg": self.massa_kg, "entreEixosM": self.entre_eixos_m,
            "bitolaFM": self.bitola_f_m, "bitolaTM": self.bitola_t_m,
            "potenciaCv": self.potencia_cv, "rpmPotencia": self.rpm_potencia,
            "torqueNm": self.torque_nm, "rpmTorque": self.rpm_torque,
            "redline": self.redline, "rpmMax": self.rpm_max,
            "marchaLenta": self.marcha_lenta, "marchas": self.marchas,
            "relacaoFinal": self.relacao_final, "tracao": self.tracao,
            "curva": self.curva,
        }


def _num(txt: str | None) -> float | None:
    if not txt:
        return None
    try:
        return float(str(txt).replace(",", "."))
    except ValueError:
        return None


def _inteiro(txt: str | None) -> int | None:
    v = _num(txt)
    return int(v) if v is not None else None


def _sem_underscore(nome: str) -> str:
    return nome.replace("_", "")


def _sem_ano(nome: str) -> str:
    return _RE_ANO.sub("", nome)


def _sem_sufixo(nome: str) -> str:
    base = _sem_ano(nome)
    mudou = True
    while mudou:
        mudou = False
        for s in sorted(SUFIXOS, key=len, reverse=True):
            if base.endswith(s) and len(base) > len(s) + 6:
                base = base[: -len(s)].rstrip("_")
                mudou = True
    return base


def _so_motor(nome: str) -> str:
    """Forma normalizada para achar quem empresta o motor: sem ano, sem sufixo
    de edicao e **sem estilo de carroceria**."""
    base = _sem_sufixo(nome)
    mudou = True
    while mudou:
        mudou = False
        for e in sorted(ESTILOS, key=len, reverse=True):
            if base.endswith(e) and len(base) > len(e) + 6:
                base = base[: -len(e)].rstrip("_")
                mudou = True
    return _sem_underscore(base)


def _prefixo_comum(a: str, b: str) -> int:
    n = min(len(a), len(b))
    i = 0
    while i < n and a[i] == b[i]:
        i += 1
    return i


class Fichas:
    def __init__(self, raiz: Path) -> None:
        self.raiz = Path(raiz)
        self.brutas: dict[str, dict] = {}
        self.por_carro: dict[str, Ficha] = {}
        self.faixas: dict[str, tuple[float, float]] = {}
        self._carregar()

    def _carregar(self) -> None:
        caminho = self.raiz / "_ficha_tecnica.csv"
        try:
            with caminho.open(encoding="utf-8-sig", newline="") as fh:
                for l in csv.DictReader(fh):
                    self.brutas[l["carro"].lower()] = l
        except OSError:
            self.brutas = {}

    def _montar(self, chave: str, carro: str, como: str) -> Ficha:
        l = self.brutas[chave]
        curva: list[tuple[int, float]] = []
        for par in (l.get("curva_torque") or "").split("|"):
            if ":" not in par:
                continue
            rpm, tq = par.split(":", 1)
            v = _num(tq)
            if v is not None and rpm.strip().isdigit():
                curva.append((int(rpm), round(v, 1)))
        return Ficha(
            carro=carro, origem=l["carro"], como=como,
            massa_kg=_num(l.get("massa_kg")),
            entre_eixos_m=_num(l.get("entre_eixos_m")),
            bitola_f_m=_num(l.get("bitola_f_m")),
            bitola_t_m=_num(l.get("bitola_t_m")),
            potencia_cv=_num(l.get("potencia_cv")),
            rpm_potencia=_inteiro(l.get("rpm_potencia")),
            torque_nm=_num(l.get("torque_nm")),
            rpm_torque=_inteiro(l.get("rpm_torque")),
            redline=_inteiro(l.get("redline")),
            rpm_max=_inteiro(l.get("rpm_max")),
            marcha_lenta=_inteiro(l.get("marcha_lenta")),
            marchas=_inteiro(l.get("marchas")),
            relacao_final=_num(l.get("relacao_final")),
            tracao=(l.get("tracao") or "").strip(),
            curva=curva,
        )

    def casar(self, carros: dict[str, str]) -> None:
        """`carros` e' {id do carro: id do doador de pecas ou ''}."""
        if not self.brutas:
            return

        # Indices auxiliares, montados uma vez.
        sem_us = {_sem_underscore(k): k for k in self.brutas}
        sem_ano = {_sem_ano(k): k for k in self.brutas}
        sem_sufixo = {_sem_sufixo(k): k for k in self.brutas}
        sem_us_ano = {_sem_underscore(_sem_ano(k)): k for k in self.brutas}

        for carro, doador in carros.items():
            c = carro.lower()
            regras = (
                ("alias conferido a mao", ALIASES.get(c)),
                ("exata", self.brutas.get(c) and c),
                ("sem underscore", sem_us.get(_sem_underscore(c))),
                ("sem ano", sem_ano.get(_sem_ano(c))),
                ("sem underscore nem ano", sem_us_ano.get(_sem_underscore(_sem_ano(c)))),
                ("sem sufixo de edicao", sem_sufixo.get(_sem_sufixo(c))),
                ("ficha do doador de pecas", doador.lower() if doador else None),
            )
            achou = None
            como = ""
            for nome, chave in regras:
                if chave and chave in self.brutas:
                    achou, como = chave, nome
                    break

            if achou is None:
                # Ultimo recurso: prefixo comum longo, a mesma regra que a
                # extracao de pecas usa para emprestar de carro irmao.
                melhor, tamanho = None, 0
                for k in self.brutas:
                    n = _prefixo_comum(c, k)
                    if n > tamanho:
                        melhor, tamanho = k, n
                if melhor and tamanho >= 20:
                    achou, como = melhor, "prefixo comum (%d)" % tamanho

            if achou:
                self.por_carro[carro] = self._montar(achou, carro, como)

        self._herdar_motor(carros)
        self._calcular_faixas()

    def _herdar_motor(self, carros: dict[str, str]) -> None:
        """Conversível e targa trazem massa própria mas **nenhum motor**.

        No jogo eles usam o motor do carro base: o `Car_Porsche_9912GTSTarga_2018`
        tem 1585 kg e curva de torque vazia, enquanto o `..._9912GTS_2018` tem os
        284 cv. Aqui a chassi continua sendo a dele; só o motor é emprestado.
        """
        doadores = {
            k: f for k, f in self.por_carro.items() if f.tem_motor
        }
        if not doadores:
            return
        for carro, f in self.por_carro.items():
            if f.tem_motor:
                continue
            base = _so_motor(carro.lower())
            candidato = None
            # primeiro o doador de peças, que é a relação que o jogo já declara
            doador = (carros.get(carro) or "").lower()
            if doador and doador in doadores:
                candidato = doadores[doador]
            if candidato is None:
                # Igualdade do nome normalizado vem antes do prefixo: o targa e o
                # cupe' normalizam para a **mesma** string de 17 caracteres, e um
                # limiar de prefixo de 18 rejeitava justamente o caso perfeito.
                for k, d in doadores.items():
                    if _so_motor(k) == base:
                        candidato = d
                        break
            if candidato is None:
                melhor, tamanho = None, 0
                for k, d in doadores.items():
                    n = _prefixo_comum(base, _so_motor(k))
                    if n > tamanho:
                        melhor, tamanho = d, n
                if melhor and tamanho >= 18:
                    candidato = melhor
            if candidato is None:
                continue
            f.potencia_cv = candidato.potencia_cv
            f.rpm_potencia = candidato.rpm_potencia
            f.torque_nm = candidato.torque_nm
            f.rpm_torque = candidato.rpm_torque
            f.redline = f.redline or candidato.redline
            f.rpm_max = f.rpm_max or candidato.rpm_max
            f.marchas = f.marchas or candidato.marchas
            f.relacao_final = f.relacao_final or candidato.relacao_final
            f.tracao = f.tracao or candidato.tracao
            f.curva = candidato.curva
            f.como += " · motor de %s" % candidato.origem

    def _calcular_faixas(self) -> None:
        """Minimo e maximo do acervo, para a barra significar alguma coisa.

        Sem isso, uma barra de potencia e' so' um retangulo: 250 cv precisa ser
        "pouco" perto dos 1500 do Regera para o desenho informar algo.
        """
        campos = {
            "potenciaCv": [], "torqueNm": [], "massaKg": [],
            "redline": [], "entreEixosM": [],
        }
        for f in self.por_carro.values():
            j = f.json()
            for k in campos:
                v = j.get(k)
                if isinstance(v, (int, float)) and v > 0:
                    campos[k].append(float(v))
        for k, vs in campos.items():
            if vs:
                self.faixas[k] = (min(vs), max(vs))

    def de(self, carro: str) -> Ficha | None:
        return self.por_carro.get(carro)

    def resumo(self) -> dict:
        return {
            "disponivel": bool(self.por_carro),
            "comFicha": len(self.por_carro),
            "comMotor": sum(1 for f in self.por_carro.values() if f.tem_motor),
            "faixas": {k: list(v) for k, v in self.faixas.items()},
        }

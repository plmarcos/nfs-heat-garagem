"""O catalogo, lido dos CSVs que o acervo ja' tem.

Nada aqui abre um OBJ de 7 MB para descobrir o que existe: os slots de fabrica
saem de `ls parts/*.obj` e as variantes de `_mods_indice.csv`. Ler o corpo so'
para montar um menu custaria 0,2 s por carro sem precisar.
"""
from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from pathlib import Path

from .malha import VERSAO_CONVERSOR

# Slots crus do jogo -> categoria da interface. 65 slots viram 21 categorias,
# porque no jogo "para-lamas" e' uma escolha, nao duas.
CATEGORIAS: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("corpo",      "Corpo",        ("bumperf", "bumperr", "bumperchassisf", "bumperchassisr")),
    ("capo",       "Capo",         ("hood",)),
    ("teto",       "Teto",         ("roof",)),
    ("paralamas",  "Para-lamas",   ("fenderfl", "fenderfr", "fendersr",
                                    "fenderschassisf", "fenderschassisr")),
    ("saias",      "Saias",        ("skirts",)),
    ("splitter",   "Splitter",     ("splitter", "spliter")),
    ("difusor",    "Difusor",      ("diffuser",)),
    ("canards",    "Canards",      ("canardsf", "canardsr")),
    ("asa",        "Asa",          ("spoiler", "chassisspoiler", "bumperspoiler",
                                    "spoilerpartb", "spoilerpartc")),
    ("escape",     "Escape",       ("exhausts", "exhaustl")),
    ("grade",      "Grade",        ("grille",)),
    ("farois",     "Farois",       ("headlights", "animatedheadlightl", "animatedheadlightr",
                                    "animatedheadlights", "spotlight",
                                    "searchlightl", "searchlightr")),
    ("lanternas",  "Lanternas",    ("taillights", "bootlights")),
    ("portamalas", "Porta-malas",  ("boot",)),
    ("retrovisor", "Retrovisor",   ("mirrorl", "mirrorr", "mirrorbasel", "mirrorbaser",
                                    "fendermirrorl", "fendermirrorr",
                                    "fendermirrorbasel", "fendermirrorbaser")),
    ("portas",     "Portas",       ("doorl", "doorr", "doorrl", "doorrr")),
    ("rodas",      "Rodas",        ("wheelfl", "wheelrl", "tirefl")),
    ("interior",   "Interior",     ("interior", "engine", "glass")),
    ("ventilacao", "Ventilacao",   ("ventfl", "ventfr", "ventrl", "ventrr")),
    ("especiais",  "Especiais",    ("chopshop", "derelictparts", "vfx",
                                    "chassis", "chassis_body", "suspension")),
)

# Slots que no jogo sao uma escolha unica aplicada aos dois lados.
ESPELHADOS: tuple[tuple[str, str], ...] = (
    ("fenderfl", "fenderfr"),
    ("mirrorl", "mirrorr"),
    ("mirrorbasel", "mirrorbaser"),
    ("fendermirrorl", "fendermirrorr"),
    ("fendermirrorbasel", "fendermirrorbaser"),
    ("doorl", "doorr"),
    ("doorrl", "doorrr"),
)

MARCAS = {
    "alfaromeo": "Alfa Romeo", "astonmartin": "Aston Martin", "bmw": "BMW",
    "mercedesbenz": "Mercedes-Benz", "landrover": "Land Rover",
    "rangerover": "Land Rover Range Rover", "volkswagen": "Volkswagen",
    "srt": "SRT", "mclaren": "McLaren", "koenigsegg": "Koenigsegg",
    "chevrolet": "Chevrolet", "ford": "Ford", "nissan": "Nissan",
    "mitsubishi": "Mitsubishi", "subaru": "Subaru", "mazda": "Mazda",
    "honda": "Honda", "acura": "Acura", "toyota": "Toyota", "lexus": "Lexus",
    "porsche": "Porsche", "ferrari": "Ferrari", "lamborghini": "Lamborghini",
    "pagani": "Pagani", "bugatti": "Bugatti", "lotus": "Lotus",
    "jaguar": "Jaguar", "mini": "MINI", "volvo": "Volvo", "polestar": "Polestar",
    "infiniti": "Infiniti", "buick": "Buick", "pontiac": "Pontiac",
    "plymouth": "Plymouth", "dodge": "Dodge", "mercury": "Mercury",
    "generic": "Generico", "triumph": "Triumph",
}

# Os nomes de modelo vem grudados (`skylinegtrvspecr34`, `9912gts`). Este
# vocabulario e' so' para cortar a palavra nos lugares certos; o que nao estiver
# aqui sai em Title Case, que continua legivel.
PALAVRAS = (
    "skyline", "fairlady", "silvia", "impreza", "lancer", "evolution", "civic",
    "vspec", "roadster", "victoria",
    "crown", "interceptor", "razer", "gallardo", "typer", "typex", "specr",
    "ztune", "grandsport", "superveloce", "convertible", "cabriolet", "shooting", "brake", "wagon", "sedan",
    "integra", "accord", "supra", "corolla", "celica", "mustang", "camaro",
    "corvette", "challenger", "charger", "barracuda", "firebird", "transam",
    "grandnational", "belair", "pickup", "stepside", "explorer",
    "raptor", "focus", "escort", "hotrod", "cougar", "amazon", "beetle", "golf",
    "countryman", "defender", "rangerover", "panamera", "cayman", "boxster",
    "carrera", "turbo", "targa", "convertible", "roadster", "spyder", "spider",
    "coupe", "volante", "aventador", "huracan", "murcielago", "diablo",
    "countach", "gallardo", "performante", "testarossa", "laferrari", "pista",
    "italia", "regera", "huayra", "vulcan", "exige", "elise", "giulia",
    "quadrifoglio", "polestar", "hero", "nismo", "premium", "deluxe", "edition",
    "special", "icon", "police", "interceptor", "armoured", "truck", "trailer",
    "semitruck", "container", "speedshape", "helicopter", "bonneville",
    "derelict", "cop", "player", "cinematic", "redbull", "razer", "eddie",
    "rachel", "ana", "riviera", "faith", "mercer", "lucas", "danny", "shaw",
)

# Sigla que fica em caixa alta inteira.
SIGLAS = {
    "gt", "gts", "gtr", "gt3", "gt4", "gt2", "rs", "rsr", "sti", "wrx", "amg",
    "svj", "sv", "svr", "lp", "nsx", "rsx", "brz", "mx", "rx", "sx", "z", "zr",
    "zr1", "z06", "z28", "srt", "srt8", "db", "db5", "db11", "f1", "fxx", "p1",
    "s2000", "m2", "m3", "m4", "m5", "x6m", "i8", "r8", "s5", "q60s", "c10",
    "f150", "tr", "typer", "vspec", "evo", "mr", "gtb", "gtc", "xu", "nfs",
    "nfsu", "nfsmw", "nfsp", "kpgc10", "e30", "e46", "e92", "r32", "r34",
    "bc", "ktr", "jcw", "ftype", "zg", "gtr", "cbr", "cb", "s1000rr", "t120",
}

_RE_RUNS = re.compile(r"\d+|[a-z]+")
_RE_VARIANTE = re.compile(r"_((?:alt|set)[a-z0-9]+)$")


def _quebrar(token: str) -> list[str]:
    """Corta um token grudado (`skylinegtrvspecr34`) nas palavras conhecidas.

    Casa da esquerda para a direita, sempre a palavra mais longa. Quando nada
    casa na posicao atual, anda um caractere e tenta de novo, juntando o que foi
    pulado num pedaco so' -- assim um modelo fora do vocabulario ainda sai
    inteiro, em vez de virar letra solta.
    """
    vocab = sorted(set(PALAVRAS) | SIGLAS, key=len, reverse=True)
    saida: list[str] = []
    pendente = ""
    i = 0
    while i < len(token):
        if token[i].isdigit():
            j = i
            while j < len(token) and token[j].isdigit():
                j += 1
            if pendente:
                saida.append(pendente)
                pendente = ""
            saida.append(token[i:j])
            i = j
            continue
        for p in vocab:
            if token.startswith(p, i):
                if pendente:
                    saida.append(pendente)
                    pendente = ""
                saida.append(p)
                i += len(p)
                break
        else:
            pendente += token[i]
            i += 1
    if pendente:
        saida.append(pendente)
    return saida


def _bonito(token: str) -> str:
    partes = _quebrar(token)
    saida: list[str] = []
    for p in partes:
        if p.isdigit():
            saida.append(p)
        elif p in SIGLAS or len(p) <= 3:
            saida.append(p.upper())
        else:
            saida.append(p.capitalize())
    # Junta digito com sigla curta sem espaco: "240" + "ZG" -> "240ZG".
    texto = saida[0] if saida else ""
    for anterior, atual in zip(saida, saida[1:]):
        cola = (anterior.isdigit() and len(atual) <= 2) or \
               (atual.isdigit() and len(anterior) <= 2)
        texto += ("" if cola else " ") + atual
    return texto


@dataclass
class Variante:
    peca: str
    variante: str
    triangulos: int
    bytes: int


@dataclass
class Slot:
    nome: str
    tipo: str                      # "substituir" (existe em parts/) ou "adicionar"
    variantes: list[Variante] = field(default_factory=list)
    espelho: str | None = None     # o par, quando e' um slot espelhado


@dataclass
class Carro:
    id: str
    rotulo: str
    marca: str
    ano: str
    familia: str                   # "carro" | "moto" | "outro"
    triangulos: int
    pasta_pecas: str | None
    slots: dict[str, Slot] = field(default_factory=dict)


def _ler_csv(caminho: Path) -> list[dict]:
    try:
        with caminho.open(encoding="utf-8-sig", newline="") as fh:
            return list(csv.DictReader(fh))
    except OSError:
        return []


def _rotular(ident: str) -> tuple[str, str, str, str]:
    """(rotulo, marca, ano, familia) a partir de `car_<marca>_<modelo>_<ano>`."""
    familia = "carro"
    resto = ident
    for prefixo, fam in (("bike_", "moto"), ("sd_", "carro"), ("ai_", "outro")):
        if ident.startswith(prefixo):
            familia = fam
            resto = ident[len(prefixo):]
            break
    else:
        if ident.startswith("car_"):
            resto = ident[4:]
        else:
            familia = "outro"

    partes = resto.split("_")
    # O ano nem sempre e' o ultimo pedaco: `beetle_1963_derelict` tem sufixo.
    anos = [p for p in partes if p.isdigit() and len(p) == 4]
    ano = anos[-1] if anos else ""
    partes = [p for p in partes if p != ano and p != "derelict"]
    marca_bruta = partes[0] if partes else resto
    marca = MARCAS.get(marca_bruta, marca_bruta.title())
    modelo = " ".join(_bonito(p) for p in partes[1:])
    rotulo = " ".join(x for x in (marca, modelo) if x) or ident
    if ident.startswith("sd_"):
        rotulo += " (derelict)"
    return rotulo, marca, ano, familia


def categoria_do_slot(slot: str) -> str:
    for chave, _, slots in CATEGORIAS:
        if slot in slots:
            return chave
    return "especiais"


class Acervo:
    def __init__(self, raiz: Path) -> None:
        self.raiz = Path(raiz)
        self.carros: dict[str, Carro] = {}
        self.pneus: list[str] = []
        self._carregar()

    # -- carga ------------------------------------------------------------
    def _carregar(self) -> None:
        indice = _ler_csv(self.raiz / "_indice.csv")
        mapa = {l["carro"]: l for l in _ler_csv(self.raiz / "_mods_mapa.csv")}

        mods: dict[tuple[str, str], list[Variante]] = {}
        for l in _ler_csv(self.raiz / "_mods_indice.csv"):
            m = _RE_VARIANTE.search(l["peca"])
            mods.setdefault((l["pasta"], l["slot"]), []).append(Variante(
                peca=l["peca"],
                variante=m.group(1) if m else "",
                triangulos=int(l["triangulos"] or 0),
                bytes=int(l["bytes"] or 0),
            ))

        self.eixos = {l["carro"]: l for l in _ler_csv(self.raiz / "_rodas_eixos.csv")}

        for linha in indice:
            ident = linha["carro"]
            if not (self.raiz / ident / (ident + ".obj")).is_file():
                continue
            rotulo, marca, ano, familia = _rotular(ident)
            doador = (mapa.get(ident) or {}).get("pasta_de_pecas") or None
            carro = Carro(
                id=ident, rotulo=rotulo, marca=marca, ano=ano, familia=familia,
                triangulos=int(linha.get("triangulos") or 0),
                pasta_pecas=doador,
            )
            self._montar_slots(carro, mods)
            self.carros[ident] = carro

        self.pneus = sorted(
            p.stem.replace("shared_tire_", "")
            for p in (self.raiz / "_pneu").glob("shared_tire_*.obj"))

        from .ficha import Fichas
        self.fichas = Fichas(self.raiz)
        self.fichas.casar({c.id: (c.pasta_pecas or "") for c in self.carros.values()})

    def _montar_slots(self, carro: Carro,
                      mods: dict[tuple[str, str], list[Variante]]) -> None:
        de_fabrica = {p.stem for p in (self.raiz / carro.id / "parts").glob("*.obj")}
        nomes = set(de_fabrica)
        if carro.pasta_pecas:
            nomes |= {slot for (pasta, slot) in mods if pasta == carro.pasta_pecas}

        espelho_de: dict[str, str] = {}
        for a, b in ESPELHADOS:
            espelho_de[a] = b
            espelho_de[b] = a

        for nome in sorted(nomes):
            variantes = sorted(
                mods.get((carro.pasta_pecas, nome), []),
                key=lambda v: (v.variante != "seta", v.peca))
            carro.slots[nome] = Slot(
                nome=nome,
                tipo="substituir" if nome in de_fabrica else "adicionar",
                variantes=variantes,
                espelho=espelho_de.get(nome) if espelho_de.get(nome) in nomes else None,
            )

    # -- consultas --------------------------------------------------------
    def existe(self, carro: str) -> bool:
        return carro in self.carros

    def caminho_corpo(self, carro: str) -> Path:
        return self.raiz / carro / (carro + ".obj")

    def caminho_roda(self, carro: str) -> Path:
        return self.raiz / carro / (carro + "_wheel.obj")

    def caminho_pneu(self, composto: str) -> Path:
        return self.raiz / "_pneu" / ("shared_tire_%s.obj" % composto)

    def caminho_peca(self, carro: str, slot: str, peca: str) -> Path | None:
        c = self.carros.get(carro)
        if not c or not c.pasta_pecas:
            return None
        s = c.slots.get(slot)
        if not s or not any(v.peca == peca for v in s.variantes):
            return None
        return self.raiz / c.pasta_pecas / "mods" / slot / (peca + ".obj")

    def caminho_peca_fabrica(self, carro: str, slot: str) -> Path:
        return self.raiz / carro / "parts" / (slot + ".obj")

    def pasta_texturas(self, carro: str) -> Path:
        return self.raiz / carro / "textures"

    def espec_roda(self, carro: str):
        from .rodas import EspecRoda
        l = self.eixos.get(carro)
        if not l:
            return None
        def f(k: str, padrao: float = 0.0) -> float:
            try:
                return float((l.get(k) or "").replace(",", "."))
            except ValueError:
                return padrao
        return EspecRoda(
            z_frente=f("z_frente"), z_tras=f("z_tras"),
            meia_bitola_f=f("meia_bitola_f"), meia_bitola_t=f("meia_bitola_t"),
            diam_frente=f("diam_frente", 0.66), diam_tras=f("diam_tras", 0.66),
            larg_frente=f("larg_frente", 0.235), larg_tras=f("larg_tras", 0.235),
            confianca=l.get("confianca") or "ok",
        )

    def resumo(self) -> dict:
        marcas = sorted({c.marca for c in self.carros.values()})
        return {
            "raiz": str(self.raiz),
            "carros": [
                {"id": c.id, "rotulo": c.rotulo, "marca": c.marca, "ano": c.ano,
                 "familia": c.familia, "triangulos": c.triangulos,
                 "slots": len(c.slots),
                 "pecas": sum(len(s.variantes) for s in c.slots.values()),
                 "cv": (self.fichas.de(c.id).potencia_cv if self.fichas.de(c.id) else None)}
                for c in sorted(self.carros.values(), key=lambda c: c.rotulo)
            ],
            "marcas": marcas,
            "pneus": self.pneus,
            "categorias": [{"id": k, "rotulo": r} for k, r, _ in CATEGORIAS],
            "ficha": self.fichas.resumo(),
            "versao": VERSAO_CONVERSOR,
        }

    def ficha_carro(self, carro: str) -> dict:
        c = self.carros[carro]
        cats: dict[str, list[dict]] = {}
        for slot in c.slots.values():
            # De um par espelhado so' o lado esquerdo aparece na interface.
            if slot.espelho and slot.nome > slot.espelho:
                continue
            cats.setdefault(categoria_do_slot(slot.nome), []).append({
                "slot": slot.nome,
                "tipo": slot.tipo,
                "espelho": slot.espelho,
                "variantes": [
                    {"peca": v.peca, "variante": v.variante,
                     "triangulos": v.triangulos, "bytes": v.bytes}
                    for v in slot.variantes
                ],
            })
        return {
            "carro": c.id, "rotulo": c.rotulo, "marca": c.marca, "ano": c.ano,
            "familia": c.familia, "triangulos": c.triangulos,
            "pecasDe": c.pasta_pecas if c.pasta_pecas != c.id else None,
            "categorias": [
                {"id": k, "rotulo": r, "slots": cats.get(k, [])}
                for k, r, _ in CATEGORIAS if cats.get(k)
            ],
            "pneus": self.pneus,
            "temRoda": self.caminho_roda(c.id).is_file(),
            "ficha": (self.fichas.de(c.id).json() if self.fichas.de(c.id) else None),
        }

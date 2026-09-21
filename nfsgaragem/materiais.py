"""Nome de material do jogo -> papel de renderizacao, e onde estao as texturas.

A lista de regras e' **ordenada e sensivel a maiuscula**, de proposito. Em
minuscula, `M_CarPaint_Trim_CarbonA_Max` contem "rim" e viraria aro -- e' a mesma
armadilha que pintou de cromado o acabamento em carbono de 159 carros quando o
`corrigir_materiais_rodas.py` usava comparacao sem caixa. Por isso `Trim` e'
testado antes de `Rim`.
"""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

# (trecho, papel) -- a primeira regra que casar vence.
REGRAS: tuple[tuple[str, str], ...] = (
    # Motos tem um vocabulario proprio, com prefixo Bike. Sem estas regras as 4
    # motos do acervo saem inteiras no material generico.
    ("BikePaint", "pintura"),
    ("BikeRim", "aro"),
    ("BikeGlass", "vidro"),
    ("BikeSeat", "interior"),
    ("BikeGauges", "interior"),
    ("BikeChain", "metal"),
    ("BikeSuspension", "metal"),
    ("BikeHandlebars", "metal"),
    ("BikeFootControls", "metal"),
    ("BikeExhaust", "metal"),
    ("BikeCommonDetails", "plastico"),
    ("Bike", "plastico"),
    ("CopLights", "lente"),
    ("CopProps", "plastico"),
    ("_Tire", "pneu"),
    ("RimBadge", "emblema_roda"),
    ("_Rim", "aro"),
    ("Caliper", "pinca"),
    ("Brake", "freio"),
    ("CarPaint_Trim", "acabamento"),
    ("Carpaint_Trim", "acabamento"),
    ("CarPaint", "pintura"),
    ("Carpaint", "pintura"),
    ("Glass_Window", "vidro"),
    ("GlassOpaque", "espelho"),
    ("LightGlass", "lente"),
    ("LGlass", "lente"),
    ("LightBucket", "refletor"),
    ("LBucket", "refletor"),
    ("_Light", "lampada"),
    ("SpoilerGlass", "lente"),
    ("ExtraLights", "lampada"),
    # O jogo escreve "Aluminium" (britanico) em alguns materiais e "Aluminum"
    # (americano) em outros. Faltando uma das grafias, 10 materiais caiam no
    # generico -- e nao da' para notar isso lendo so' um carro.
    ("Aluminium", "metal"),
    ("Aluminum", "metal"),
    ("Ano", "acabamento"),       # anodizado: azul, vermelho, laranja, amarelo
    ("Gold", "metal"),
    ("PaintSatin", "acabamento"),
    ("PaintMetalic", "acabamento"),
    ("PaintSolid", "plastico"),
    ("Generics_", "acabamento"),  # asas genericas do catalogo, em fibra
    ("Chrome", "cromo"),
    ("Nickel", "metal"),
    ("Plastic", "plastico"),
    ("Rubber", "plastico"),
    ("Chassis", "chassi"),
    ("Engine", "motor"),
    ("Interior", "interior"),
    ("Fabric", "interior"),
    ("Badge", "emblema"),
    ("Grille", "grade"),
    ("LicensePlate", "placa"),
    # `M_Detail_*` aparece 73 vezes no acervo e e' sempre detalhe plastico
    # escuro -- painel, moldura, encaixe. Sem regra, ficava no generico.
    ("Detail", "plastico"),
    ("Decal", "emblema"),
    ("Cloth", "interior"),
    ("Leather", "interior"),
    ("Carbon", "acabamento"),
    ("Wood", "interior"),
    ("Crate", "plastico"),
)

# Base fisica por papel: cor, rugosidade, metalicidade, e se e' transparente.
# Os numeros de roda vem da receita calibrada do `corrigir_materiais_rodas.py`.
BASE: dict[str, dict] = {
    "pintura":      {"cor": "#9aa3ad", "rugosidade": 0.28, "metal": 0.30},
    "acabamento":   {"cor": "#2a2c30", "rugosidade": 0.42, "metal": 0.25},
    "pneu":         {"cor": "#0d0d0e", "rugosidade": 0.85, "metal": 0.00},
    # A receita do acervo e' Kd .620 .630 .660 (#9EA1A8), calibrada para o
    # Blender. Aqui, com quatro softboxes e ambiente PMREM, um metal liso nesse
    # tom satura e a roda vira um disco branco de longe. O aro do Heat nao tem
    # mapa de cor -- so' de relevo -- entao nao ha' textura para quebrar o tom;
    # escurecer a base e' o que faz os raios aparecerem por sombra.
    "aro":          {"cor": "#6e727a", "rugosidade": 0.38, "metal": 0.95},
    "emblema_roda": {"cor": "#b3b3b8", "rugosidade": 0.35, "metal": 0.80},
    "freio":        {"cor": "#2e2e30", "rugosidade": 0.45, "metal": 0.60},
    "pinca":        {"cor": "#59100f", "rugosidade": 0.35, "metal": 0.20},
    "vidro":        {"cor": "#11161a", "rugosidade": 0.05, "metal": 0.00,
                     "opacidade": 0.28, "transparente": True},
    "espelho":      {"cor": "#c8ccd2", "rugosidade": 0.08, "metal": 1.00},
    "lente":        {"cor": "#cfd6dc", "rugosidade": 0.12, "metal": 0.00,
                     "opacidade": 0.55, "transparente": True},
    "refletor":     {"cor": "#d7dade", "rugosidade": 0.18, "metal": 0.90},
    "lampada":      {"cor": "#f2f4f6", "rugosidade": 0.30, "metal": 0.00,
                     "emissivo": "#8a9099"},
    "cromo":        {"cor": "#d3d7dc", "rugosidade": 0.06, "metal": 1.00},
    "metal":        {"cor": "#8d9299", "rugosidade": 0.34, "metal": 0.90},
    "plastico":     {"cor": "#0a0a0b", "rugosidade": 0.70, "metal": 0.00},
    "chassi":       {"cor": "#16181a", "rugosidade": 0.62, "metal": 0.35},
    "motor":        {"cor": "#3a3d41", "rugosidade": 0.55, "metal": 0.55},
    "interior":     {"cor": "#1b1d20", "rugosidade": 0.72, "metal": 0.05},
    "emblema":      {"cor": "#b9bcc2", "rugosidade": 0.30, "metal": 0.75},
    "grade":        {"cor": "#0e0f11", "rugosidade": 0.58, "metal": 0.40},
    "placa":        {"cor": "#dcdcd6", "rugosidade": 0.50, "metal": 0.00},
    "generico":     {"cor": "#26282b", "rugosidade": 0.55, "metal": 0.00},
}

_SUFIXO_MAPA = {
    "d": "mapa", "n": "normal", "no": "normal", "nd": "normal", "na": "normal",
    "m": "mascara", "e": "emissivo", "ea": "emissivo",
}


def papel(material: str) -> str:
    for trecho, nome in REGRAS:
        if trecho in material:
            return nome
    return "generico"


_RE_MTL_MAPA = re.compile(r"^\s*(map_Kd|map_Bump|map_Ke)\s+(.+?)\s*$")
_RE_MTL_NOVO = re.compile(r"^\s*newmtl\s+(.+?)\s*$")


@lru_cache(maxsize=256)
def ler_mtl(caminho: str) -> dict[str, dict[str, str]]:
    """{material: {map_Kd: arquivo, ...}} -- so' o nome do arquivo, sem pasta."""
    saida: dict[str, dict[str, str]] = {}
    atual: dict[str, str] | None = None
    try:
        texto = Path(caminho).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return saida
    for linha in texto.splitlines():
        m = _RE_MTL_NOVO.match(linha)
        if m:
            atual = saida.setdefault(m.group(1), {})
            continue
        if atual is None:
            continue
        m = _RE_MTL_MAPA.match(linha)
        if m:
            atual[m.group(1)] = Path(m.group(2).replace("\\", "/")).name


    return saida


@lru_cache(maxsize=256)
def indice_texturas(pasta: str, prefixo: str) -> dict[str, str]:
    """{radical sem o prefixo do carro e sem .png: arquivo}."""
    saida: dict[str, str] = {}
    try:
        itens = list(Path(pasta).iterdir())
    except OSError:
        return saida
    for p in itens:
        if p.suffix.lower() != ".png":
            continue
        radical = p.stem
        if prefixo and radical.startswith(prefixo):
            radical = radical[len(prefixo):]
        saida[radical] = p.name
    return saida


@lru_cache(maxsize=8)
def _indice_pneus(pasta: str) -> frozenset:
    try:
        return frozenset(p.name for p in Path(pasta).glob("*.png"))
    except OSError:
        return frozenset()


def mapas_do_pneu(pasta_tires: str, composto: str) -> dict[str, str]:
    """Textura do pneu, que **nao** mora na pasta do carro.

    O pneu e' malha compartilhada e as texturas dele ficam em
    `_texturas_rodas/tires/`, com o padrao `shared_tire_<composto>_<nivel>_n.png`.
    Sem isso o pneu renderiza preto liso e some dentro do arco -- foi o que fez
    a roda parecer um disco branco flutuando.
    """
    nomes = _indice_pneus(pasta_tires)
    if not nomes:
        return {}
    achados: dict[str, str] = {}
    for sufixo, tipo in (("_n", "normal"), ("_m", "mascara")):
        for base in ("shared_tire_%s_med" % composto,
                     "shared_tire_%s" % composto,
                     "shared_tire_%s_low" % composto,
                     "shared_tire_%s_high" % composto,
                     "shared_%s" % composto,
                     "shared_%sa" % composto,
                     "shared_tire_01"):
            arquivo = base + sufixo + ".png"
            if arquivo in nomes:
                achados[tipo] = arquivo
                break
    return achados


def _classificar(nome_arquivo: str) -> str | None:
    radical = Path(nome_arquivo).stem
    sufixo = radical.rsplit("_", 1)[-1].lower()
    return _SUFIXO_MAPA.get(sufixo)


def mapas_do_material(material: str,
                      mtl: dict[str, dict[str, str]],
                      indice: dict[str, str],
                      *,
                      slot: str | None = None,
                      variante: str | None = None) -> tuple[dict[str, str], str]:
    """Devolve ({tipo: arquivo}, origem) com origem em mtl|convencao|ausente.

    O MTL das pecas de modificacao e' um stub sem nenhum `map_*` -- 0 de 316 no
    M3 tem mapa. Para elas a unica saida e' procurar por convencao no indice de
    texturas do carro, que segue `<token>_<variante>_<sufixo>.png`.
    """
    do_mtl = mtl.get(material) or {}
    achados: dict[str, str] = {}
    for chave, arquivo in do_mtl.items():
        tipo = {"map_Kd": "mapa", "map_Bump": "normal", "map_Ke": "emissivo"}.get(chave)
        if tipo:
            achados[tipo] = arquivo
    if achados:
        return achados, "mtl"

    # Convencao. O token vem do papel, que e' o que o nome de arquivo usa.
    tokens = {
        "lampada": "light", "lente": "lightglass", "refletor": "lightbucket",
        "interior": "interior", "motor": "engine", "emblema": "badge",
        "grade": "grillea", "aro": "rim", "emblema_roda": "rimbadge",
        "placa": "licenseplate",
    }
    token = tokens.get(papel(material))
    if not token:
        return {}, "ausente"

    tentativas = []
    if slot and variante:
        tentativas.append("%s_%s_%s" % (token, slot, variante))
    if variante:
        tentativas.append("%s_%s" % (token, variante))
    tentativas += ["%s_seta" % token, token]

    for base in tentativas:
        for sufixo, tipo in (("_d", "mapa"), ("_n", "normal"), ("_no", "normal"),
                             ("_m", "mascara"), ("_e", "emissivo")):
            arquivo = indice.get(base + sufixo)
            if arquivo and tipo not in achados:
                achados[tipo] = arquivo
        if achados:
            return achados, "convencao"
    return {}, "ausente"

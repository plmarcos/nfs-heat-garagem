"""Converte o OBJ do acervo do NFS Heat em arrays numpy prontos para a GPU.

Tres decisoes que valem explicacao, porque nao sao obvias:

1. **Normal e' calculada aqui.** Nenhum OBJ do acervo traz `vn` -- o Heat guarda
   a normal comprimida em TangentSpace e a extracao nunca desempacotou. Sem isso
   o carro sai preto.

2. **A suavizacao e' por objeto, depois da compactacao.** Assim a quina entre o
   capo e a carroceria continua dura, que e' o certo num carro; suavizar o
   arquivo inteiro arredondaria toda aresta de painel.

3. **O grupo solto e' descartado por geometria, nunca por nome.** Uma peca do
   acervo (`car_nissan_fairlady240zg_1971/mods/fenderfr/fenderfr_setf.obj`) traz
   um grupo a 77 m do paralama. O material dele e' legitimo em outro lugar, entao
   filtrar por nome estragaria peca boa.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

# Um grupo cujo centroide fique alem disto da massa principal da peca e' lixo.
# 5 m e' folgado: o carro mais longo do acervo tem 5,7 m, e o defeito conhecido
# esta' a 77 m.
LIMITE_GRUPO_DISTANTE = 5.0


@dataclass
class Grupo:
    """Uma corrida de faces com o mesmo `usemtl`, em indices."""

    material: str
    inicio: int
    contagem: int


@dataclass
class Descarte:
    objeto: str
    material: str
    motivo: str
    distancia_m: float


@dataclass
class ObjetoMalha:
    nome: str
    pos: np.ndarray            # (n, 3) float32
    nrm: np.ndarray            # (n, 3) float32
    uv: np.ndarray             # (n, 2) float32
    idx: np.ndarray            # (m, 3) uint32
    grupos: list[Grupo] = field(default_factory=list)

    @property
    def vertices(self) -> int:
        return int(self.pos.shape[0])

    @property
    def triangulos(self) -> int:
        return int(self.idx.shape[0])

    def limites(self) -> dict[str, list[float]]:
        if self.pos.size == 0:
            return {"min": [0.0, 0.0, 0.0], "max": [0.0, 0.0, 0.0]}
        return {"min": self.pos.min(axis=0).tolist(),
                "max": self.pos.max(axis=0).tolist()}


@dataclass
class Malha:
    objetos: list[ObjetoMalha] = field(default_factory=list)
    descartes: list[Descarte] = field(default_factory=list)
    materiais: list[str] = field(default_factory=list)
    invertidos: list[str] = field(default_factory=list)

    def limites(self) -> dict[str, list[float]]:
        caixas = [o.pos for o in self.objetos if o.pos.size]
        if not caixas:
            return {"min": [0.0, 0.0, 0.0], "max": [0.0, 0.0, 0.0]}
        todos = np.concatenate(caixas, axis=0)
        return {"min": todos.min(axis=0).tolist(),
                "max": todos.max(axis=0).tolist()}


class ErroObj(ValueError):
    """OBJ fora do formato que o acervo usa."""


def _floats(linhas: list[bytes], componentes: int) -> np.ndarray:
    if not linhas:
        return np.zeros((0, componentes), dtype=np.float32)
    bruto = np.fromstring(b" ".join(linhas), sep=" ", dtype=np.float32)
    if bruto.size % componentes:
        raise ErroObj("linha de vertice com numero de campos inesperado")
    return bruto.reshape(-1, componentes)


def _indices_de_faces(faces: list[bytes]) -> np.ndarray:
    """Le as faces de um objeto e devolve (m, 3) de indices de vertice, base 0.

    O numero de componentes (`v`, `v/vt`, `v/vt/vn`) vem da primeira face: o
    acervo e' consistente dentro de um arquivo, e adivinhar linha a linha seria
    lento sem ganho.
    """
    if not faces:
        return np.zeros((0, 3), dtype=np.int64)
    primeira = faces[0].split()
    if len(primeira) != 3:
        raise ErroObj(
            "face com %d vertices; o conversor so' aceita triangulo" % len(primeira))
    comp = primeira[0].count(b"/") + 1
    bruto = np.fromstring(b" ".join(faces).replace(b"/", b" "), sep=" ", dtype=np.int64)
    largura = 3 * comp
    if bruto.size % largura:
        raise ErroObj("bloco de faces com numero de campos inesperado")
    return bruto.reshape(-1, largura)[:, 0::comp] - 1


def _malha_fechada(idx: np.ndarray) -> bool:
    """Toda aresta aparece exatamente duas vezes? Se sim, e' casca fechada."""
    if idx.size == 0:
        return False
    arestas = np.concatenate([idx[:, [0, 1]], idx[:, [1, 2]], idx[:, [2, 0]]], axis=0)
    arestas = np.sort(arestas, axis=1)
    _, contagem = np.unique(arestas, axis=0, return_counts=True)
    return bool((contagem == 2).all())


def _volume_assinado(pos: np.ndarray, idx: np.ndarray) -> float:
    """Volume pelo teorema da divergencia. Negativo = enrolamento invertido."""
    tri = pos[idx]
    return float(np.einsum(
        "ij,ij->i", tri[:, 0],
        np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])).sum() / 6.0)


def corrigir_enrolamento(pos: np.ndarray, idx: np.ndarray) -> tuple[np.ndarray, bool]:
    """Inverte o indice quando a casca esta' fechada e virada pelo avesso.

    O `shared_tire_*.obj` do acervo vem com o enrolamento contrario ao das
    carrocerias: sem isso o pneu some, porque toda face aponta para dentro e o
    descarte de face traseira come a malha inteira. So' mexe em casca fechada --
    num para-lama, que e' superficie aberta, o volume assinado nao quer dizer
    nada e inverter estragaria peca boa.
    """
    if idx.shape[0] < 4 or not _malha_fechada(idx):
        return idx, False
    if _volume_assinado(pos, idx) >= 0:
        return idx, False
    return np.ascontiguousarray(idx[:, ::-1]), True


def _normais(pos: np.ndarray, idx: np.ndarray) -> np.ndarray:
    """Normal por vertice, ponderada por area (o produto vetorial nao normalizado
    ja' tem modulo proporcional a' area, entao basta nao normalizar antes)."""
    nrm = np.zeros_like(pos)
    if idx.size == 0:
        nrm[:, 1] = 1.0
        return nrm
    tri = pos[idx]
    face = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    n = pos.shape[0]
    for canto in range(3):
        alvo = idx[:, canto]
        for eixo in range(3):
            nrm[:, eixo] += np.bincount(alvo, weights=face[:, eixo], minlength=n)
    comp = np.linalg.norm(nrm, axis=1)
    comp[comp == 0] = 1.0
    return (nrm / comp[:, None]).astype(np.float32)


def converter(caminho: str | Path,
              *,
              limite_grupo_distante: float = LIMITE_GRUPO_DISTANTE,
              checar_enrolamento: bool = False) -> Malha:
    """Le um OBJ do acervo e devolve os objetos ja' compactados e com normal.

    `checar_enrolamento` custa ~60 ms numa carroceria (um `np.unique` sobre 188
    mil arestas) e, na varredura do acervo inteiro, nao achou **nenhum** objeto
    virado pelo avesso. Fica desligado no caminho do servidor e ligado na
    ferramenta de verificacao, que e' onde a auditoria importa.
    """
    caminho = Path(caminho)
    bruto = caminho.read_bytes().replace(b"\r\n", b"\n")

    vs: list[bytes] = []
    vts: list[bytes] = []
    # nome do objeto -> (faces, [(material, contagem_de_faces)])
    objetos: list[tuple[str, list[bytes], list[list]]] = []
    atual: tuple[str, list[bytes], list[list]] | None = None

    def abrir(nome: str) -> None:
        nonlocal atual
        atual = (nome, [], [])
        objetos.append(atual)

    for linha in bruto.split(b"\n"):
        cabeca = linha[:2]
        if cabeca == b"v ":
            vs.append(linha[2:])
        elif cabeca == b"f ":
            if atual is None:
                abrir("objeto")
            atual[1].append(linha[2:])
            if atual[2]:
                atual[2][-1][1] += 1
        elif linha[:3] == b"vt ":
            vts.append(linha[3:])
        elif cabeca == b"o ":
            abrir(linha[2:].strip().decode("utf-8", "replace"))
        elif linha[:7] == b"usemtl ":
            if atual is None:
                abrir("objeto")
            atual[2].append([linha[7:].strip().decode("utf-8", "replace"), 0])

    pontos = _floats(vs, 3)
    uvs = _floats(vts, 2) if vts else None

    malha = Malha()
    vistos: set[str] = set()

    for nome, faces, grupos_brutos in objetos:
        if not faces:
            continue
        indices = _indices_de_faces(faces)
        grupos = [(m, c) for m, c in grupos_brutos if c > 0]
        if not grupos:
            grupos = [("generico", indices.shape[0])]

        # Centroide por grupo, para achar o que esta' solto no espaco.
        centroides = []
        inicio = 0
        for material, contagem in grupos:
            trecho = indices[inicio:inicio + contagem]
            centroides.append(pontos[np.unique(trecho)].mean(axis=0)
                              if trecho.size else np.zeros(3, dtype=np.float32))
            inicio += contagem

        principal = int(np.argmax([c for _, c in grupos]))
        ancora = centroides[principal]

        # O limite tem que acompanhar o tamanho da peca. Com 5 m fixo, a placa do
        # `car_generic_containertrailer_2017` -- que fica a 5,1 m do centro de um
        # reboque de 12 m -- era descartada como lixo. Aqui o corte e' o maior
        # entre 5 m e uma vez e meia a diagonal do grupo principal.
        inicio_p = sum(c for _, c in grupos[:principal])
        pontos_p = pontos[np.unique(indices[inicio_p:inicio_p + grupos[principal][1]])]
        diagonal = (float(np.linalg.norm(pontos_p.max(axis=0) - pontos_p.min(axis=0)))
                    if pontos_p.size else 0.0)
        limite = max(limite_grupo_distante, diagonal * 1.5)

        manter: list[tuple[str, np.ndarray]] = []
        inicio = 0
        for (material, contagem), centro in zip(grupos, centroides):
            trecho = indices[inicio:inicio + contagem]
            inicio += contagem
            distancia = float(np.abs(centro - ancora).max())
            if distancia > limite:
                malha.descartes.append(
                    Descarte(nome, material, "grupo_distante", round(distancia, 2)))
                continue
            manter.append((material, trecho))

        if not manter:
            continue

        juntos = np.concatenate([t for _, t in manter], axis=0)
        unicos, inverso = np.unique(juntos, return_inverse=True)
        idx = inverso.reshape(-1, 3).astype(np.uint32)
        pos = np.ascontiguousarray(pontos[unicos], dtype=np.float32)
        if checar_enrolamento:
            idx, invertido = corrigir_enrolamento(pos, idx)
            if invertido:
                malha.invertidos.append(nome)
        uv = (np.ascontiguousarray(uvs[unicos], dtype=np.float32)
              if uvs is not None and uvs.shape[0] >= pontos.shape[0]
              else np.zeros((pos.shape[0], 2), dtype=np.float32))

        lista: list[Grupo] = []
        cursor = 0
        for material, trecho in manter:
            qtd = int(trecho.shape[0]) * 3
            lista.append(Grupo(material, cursor, qtd))
            cursor += qtd
            if material not in vistos:
                vistos.add(material)
                malha.materiais.append(material)

        malha.objetos.append(
            ObjetoMalha(nome, pos, _normais(pos, idx), uv, idx, lista))

    return malha

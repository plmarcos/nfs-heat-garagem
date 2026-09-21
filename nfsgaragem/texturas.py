"""Serve as texturas do acervo, reconstruindo o Z dos mapas de normal.

**O problema que isto resolve.** Boa parte dos `_n`/`_no`/`_nd` do Heat sao
normais de **dois canais**: o X e o Y estao em R e G, e o **B e' zero em todo
pixel** -- o Z e' reconstruido em tempo de execucao pelo shader do jogo. Medido
no acervo: 30 de 40 `_n` amostrados, 11 de 40 `_nd`, 5 de 40 `_no`. E' por
arquivo, nao por sufixo, entao nao da' para decidir pelo nome.

Entregue assim ao Three.js, `normalMap` le' `xyz * 2 - 1` e obtem `(x, y, -1)`:
a normal aponta **para dentro** da superficie. A iluminacao inteira inverte. Na
pratica o pneu preto renderizava cinza-claro e o aro metalico pegava reflexo do
ambiente em direcoes erradas, com franja ciano e magenta nas bordas.

A reconstrucao e' a padrao: `z = sqrt(1 - x^2 - y^2)`, com o vetor normalizado
antes para o caso de |xy| passar de 1 por arredondamento do PNG.
"""
from __future__ import annotations

import io
from pathlib import Path

import numpy as np

try:
    from PIL import Image
except ImportError:  # pragma: no cover - Pillow e' dependencia declarada
    Image = None

# Abaixo disto o canal azul e' considerado vazio. Nao uso == 0 porque alguns
# arquivos trazem ruido de compressao de um ou dois niveis.
LIMITE_B_VAZIO = 8


def normal_de_dois_canais(dados: bytes) -> bool:
    """O B esta' vazio? Entao o Z precisa ser reconstruido."""
    if Image is None:
        return False
    try:
        with Image.open(io.BytesIO(dados)) as im:
            a = np.asarray(im.convert("RGB"), dtype=np.uint8)
    except Exception:
        return False
    return bool(a[..., 2].max() < LIMITE_B_VAZIO)


def reconstruir_z(dados: bytes) -> bytes:
    """Devolve o PNG com o canal azul preenchido por `sqrt(1 - x^2 - y^2)`."""
    if Image is None:
        return dados
    try:
        with Image.open(io.BytesIO(dados)) as im:
            rgba = im.convert("RGBA")
            a = np.asarray(rgba, dtype=np.float32)
    except Exception:
        return dados

    x = a[..., 0] / 127.5 - 1.0
    y = a[..., 1] / 127.5 - 1.0
    # Normaliza o par XY quando estoura o circulo unitario, senao o sqrt abaixo
    # vira NaN numa faixa de pixels e o mapa sai com buracos pretos.
    comp = np.sqrt(x * x + y * y)
    excesso = comp > 1.0
    if excesso.any():
        x = np.where(excesso, x / comp, x)
        y = np.where(excesso, y / comp, y)
    z = np.sqrt(np.clip(1.0 - x * x - y * y, 0.0, 1.0))

    saida = a.copy()
    saida[..., 0] = (x * 0.5 + 0.5) * 255.0
    saida[..., 1] = (y * 0.5 + 0.5) * 255.0
    saida[..., 2] = (z * 0.5 + 0.5) * 255.0

    buf = io.BytesIO()
    Image.fromarray(saida.clip(0, 255).astype(np.uint8), "RGBA").save(
        buf, format="PNG", compress_level=1)
    return buf.getvalue()


def preparar(caminho: Path, *, como_normal: bool) -> bytes:
    """Le a textura do disco e corrige o que precisa ser corrigido."""
    dados = caminho.read_bytes()
    if como_normal and normal_de_dois_canais(dados):
        return reconstruir_z(dados)
    return dados

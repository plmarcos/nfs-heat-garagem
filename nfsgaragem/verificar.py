"""Varre o acervo inteiro pelo conversor e grava o que achou.

E' a checagem de maior valor do projeto: converte as 168 carrocerias e as 13.834
pecas de modificacao e prova que o leitor sobrevive aos arquivos de verdade, em
vez de aos tres que eu testei a mao. O relatorio tambem e' a lista de defeitos
do acervo -- grupo solto, material desconhecido, textura que nao resolveu.

    python -m nfsgaragem.verificar --acervo F:\\CarsNfSHeat --tudo
"""
from __future__ import annotations

import argparse
import csv
import sys
import time
from collections import Counter
from pathlib import Path

from . import materiais as mats
from . import obj as objmod
from .acervo import Acervo
from .config import resolver_acervo


def _arquivos(acervo: Acervo, tudo: bool, limite: int) -> list[tuple[str, str, Path]]:
    alvos: list[tuple[str, str, Path]] = []
    for carro in sorted(acervo.carros):
        alvos.append((carro, "corpo", acervo.caminho_corpo(carro)))
        roda = acervo.caminho_roda(carro)
        if roda.is_file():
            alvos.append((carro, "roda", roda))
    for composto in acervo.pneus:
        alvos.append(("_pneu", "pneu", acervo.caminho_pneu(composto)))

    if tudo:
        vistos: set[Path] = set()
        for carro in sorted(acervo.carros):
            c = acervo.carros[carro]
            if not c.pasta_pecas:
                continue
            base = acervo.raiz / c.pasta_pecas / "mods"
            if base in vistos:
                continue
            vistos.add(base)
            for p in sorted(base.rglob("*.obj")):
                alvos.append((c.pasta_pecas, "peca", p))

    return alvos[:limite] if limite else alvos


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Varredura do acervo")
    ap.add_argument("--acervo")
    ap.add_argument("--tudo", action="store_true",
                    help="inclui as 13.834 pecas de modificacao (~5 min)")
    ap.add_argument("--limite", type=int, default=0)
    ap.add_argument("--saida", default="verificacao.csv")
    ap.add_argument("--rodas", action="store_true",
                    help="audita a montagem da roda em cada carro")
    ap.add_argument("--enrolamento", action="store_true",
                    help="tambem audita casca fechada virada pelo avesso (mais lento)")
    args = ap.parse_args(argv)

    raiz = resolver_acervo(args.acervo)
    if raiz is None:
        print("acervo nao encontrado", file=sys.stderr)
        return 2

    acervo = Acervo(Path(raiz))
    alvos = _arquivos(acervo, args.tudo, args.limite)
    print("arquivos a converter: %d" % len(alvos), flush=True)

    linhas: list[dict] = []
    materiais = Counter()
    papeis = Counter()
    descartes: list[dict] = []
    invertidos: list[dict] = []
    falhas: list[dict] = []
    comecou = time.perf_counter()

    for n, (carro, tipo, caminho) in enumerate(alvos, start=1):
        t0 = time.perf_counter()
        try:
            malha = objmod.converter(caminho, checar_enrolamento=args.enrolamento)
        except Exception as e:  # noqa: BLE001 - queremos a lista completa, nao o primeiro
            falhas.append({"arquivo": str(caminho), "erro": "%s: %s" % (type(e).__name__, e)})
            continue
        ms = (time.perf_counter() - t0) * 1000

        for m in malha.materiais:
            materiais[m] += 1
            papeis[mats.papel(m)] += 1
        for d in malha.descartes:
            descartes.append({"arquivo": str(caminho), "objeto": d.objeto,
                              "material": d.material, "distancia_m": d.distancia_m})
        for o in malha.invertidos:
            invertidos.append({"arquivo": str(caminho), "objeto": o})

        linhas.append({
            "carro": carro, "tipo": tipo, "arquivo": caminho.name,
            "objetos": len(malha.objetos),
            "vertices": sum(o.vertices for o in malha.objetos),
            "triangulos": sum(o.triangulos for o in malha.objetos),
            "materiais": len(malha.materiais),
            "descartados": len(malha.descartes),
            "ms": round(ms, 1),
        })

        if n % 500 == 0 or n == len(alvos):
            print("  %5d/%d  (%.0f s)" % (n, len(alvos), time.perf_counter() - comecou),
                  flush=True)

    saida = Path(args.saida)
    with saida.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(linhas[0].keys()))
        w.writeheader()
        w.writerows(linhas)

    total = time.perf_counter() - comecou
    tris = sum(l["triangulos"] for l in linhas)
    print("\n=== RESUMO ===")
    print("convertidos: %d   falhas: %d" % (len(linhas), len(falhas)))
    print("triangulos:  %s" % format(tris, ",").replace(",", "."))
    print("tempo:       %.1f s  (media %.1f ms por arquivo)"
          % (total, 1000 * total / max(1, len(linhas))))
    print("materiais distintos: %d" % len(materiais))
    print("papeis: %s" % dict(papeis.most_common()))

    desconhecidos = [m for m in materiais if mats.papel(m) == "generico"]
    if desconhecidos:
        print("\nmateriais sem papel definido (%d):" % len(desconhecidos))
        for m in sorted(desconhecidos)[:25]:
            print("   %-46s %d" % (m, materiais[m]))

    print("\ngrupos soltos descartados: %d" % len(descartes))
    for d in descartes[:10]:
        print("   %-58s %s a %.1f m" % (Path(d["arquivo"]).name, d["material"], d["distancia_m"]))

    if args.enrolamento:
        print("\ncascas fechadas viradas pelo avesso: %d" % len(invertidos))
        for i in invertidos[:10]:
            print("   %s / %s" % (Path(i["arquivo"]).name, i["objeto"]))

    if falhas:
        print("\nFALHAS (%d):" % len(falhas))
        for f in falhas[:20]:
            print("   %s\n      %s" % (f["arquivo"], f["erro"]))

    if args.rodas:
        r = _auditar_rodas(acervo)
        print("\n=== RODAS ===")
        print("carros auditados: %d" % r["auditados"])
        print("pneu aparente (mm): min %.0f  mediana %.0f  max %.0f"
              % (r["min"], r["mediana"], r["max"]))
        if r["fora"]:
            print("fora da faixa 30..140 mm: %d" % len(r["fora"]))
            for c, mm in r["fora"][:15]:
                print("   %-46s %6.0f mm" % (c, mm))
        else:
            print("nenhum carro fora da faixa")

    print("\nrelatorio: %s" % saida.resolve())
    return 1 if falhas else 0


def _auditar_rodas(acervo: Acervo) -> dict:
    """Mede o pneu aparente de cada carro, com a mesma regra que o app usa.

    Negativo quer dizer que o aro atravessa a borracha; perto de zero, que a
    roda vira um disco liso sem pneu. Foi assim que a garagem saiu no comeco --
    o `montar_rodas.py` escala o aro pelo fator do pneu, e o raio nativo do aro
    varia de 0,18 a 0,50 m entre os carros.
    """
    import numpy as np

    from . import rodas as R

    pneu = objmod.converter(acervo.caminho_pneu("race01"))
    pp = np.concatenate([o.pos for o in pneu.objetos])
    p_rmax, _ = R.medidas_nativas(pp)
    p_rmin = R.raio_interno(pp)

    medidas: list[float] = []
    fora: list[tuple[str, float]] = []
    for nome in sorted(acervo.carros):
        caminho = acervo.caminho_roda(nome)
        spec = acervo.espec_roda(nome)
        if not caminho.is_file() or spec is None:
            continue
        objs = {o.nome: o for o in objmod.converter(caminho).objetos}
        alvo = R.objeto_do_eixo(list(objs), "f")
        if not alvo:
            continue
        raio_aro, _ = R.medidas_nativas(objs[alvo].pos)
        r = spec.diam_frente / 2
        talao = p_rmin * (r / p_rmax)
        montado = raio_aro * R.escala_do_aro(raio_aro, talao, r)
        mm = (r - montado) * 1000
        medidas.append(mm)
        if mm < 30 or mm > 140:
            fora.append((nome, mm))

    v = np.array(medidas) if medidas else np.zeros(1)
    return {"auditados": len(medidas), "min": float(v.min()),
            "mediana": float(np.median(v)), "max": float(v.max()), "fora": fora}


if __name__ == "__main__":
    raise SystemExit(main())

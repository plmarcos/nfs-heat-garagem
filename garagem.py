"""Sobe a garagem no navegador. Use `garagem_desktop.py` para a janela propria.

    python garagem.py --acervo "F:\\CarsNfSHeat"
"""
from __future__ import annotations

import argparse
import sys
import threading
import webbrowser
from pathlib import Path

from nfsgaragem.config import gravar_config, ler_config, resolver_acervo
from nfsgaragem.servidor import App, criar_servidor


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Garagem 3D NFS Heat")
    ap.add_argument("--acervo", help="pasta do acervo (a que tem _indice.csv)")
    ap.add_argument("--porta", type=int, default=8770)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--sem-navegador", action="store_true")
    args = ap.parse_args(argv)

    # Sem acervo o programa **sobe assim mesmo**, com a tela de boas-vindas. Quem
    # baixou so' o codigo precisa de uma explicacao e de um caminho, nao de um
    # erro no console de um terminal que provavelmente nem esta' aberto.
    raiz = resolver_acervo(args.acervo)
    app = App(Path(raiz) if raiz else None)
    if raiz:
        print("acervo: %s  (%d carros)" % (raiz, len(app.acervo.carros)))
    else:
        print("sem acervo: abrindo a tela de boas-vindas", file=sys.stderr)

    servidor = criar_servidor(app, args.host, args.porta)
    porta = servidor.server_address[1]
    url = "http://127.0.0.1:%d/" % porta
    print("garagem em", url)

    if raiz:
        cfg = ler_config()
        cfg["acervo"] = str(raiz)
        gravar_config(cfg)

    if not args.sem_navegador:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nencerrando")
    finally:
        servidor.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

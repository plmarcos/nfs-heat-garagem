"""Abre a garagem numa janela propria, sem barra de navegador.

**O servidor roda num processo separado, nao numa thread.** Tentei primeiro o
caminho obvio -- `threading.Thread(target=servidor.serve_forever)` antes de
`webview.start()` -- e neste pywebview no Windows a porta fica em escuta, o TCP
ate' aceita conexao, mas o laco de accept nunca roda e a janela abre em branco.
Passar a subida como `func` do proprio `webview.start()` deu no mesmo. Processo
separado resolve de vez, e ainda deixa o servidor sobreviver a um tropeco da
interface (e vice-versa).
"""
from __future__ import annotations

import argparse
import socket
import subprocess
import sys
import time
from pathlib import Path

try:
    import webview
except ImportError:  # pragma: no cover - so' acontece sem a dependencia
    print("Falta o pywebview. Instale com:\n"
          "    py -3.11 -m pip install -r requirements.txt", file=sys.stderr)
    raise SystemExit(2)

from nfsgaragem.config import e_acervo, gravar_config, ler_config, resolver_acervo

AQUI = Path(__file__).resolve().parent


class Ponte:
    """O pouco que a pagina precisa pedir ao sistema."""

    def __init__(self) -> None:
        self.janela = None

    def escolher_acervo(self) -> dict:
        pastas = self.janela.create_file_dialog(webview.FOLDER_DIALOG)
        if not pastas:
            return {"ok": False, "motivo": "cancelado"}
        caminho = Path(pastas[0])
        if not e_acervo(caminho):
            return {"ok": False,
                    "motivo": "essa pasta nao tem _indice.csv; nao e' o acervo"}
        cfg = ler_config()
        cfg["acervo"] = str(caminho)
        gravar_config(cfg)
        return {"ok": True, "acervo": str(caminho),
                "aviso": "feche e abra a garagem para trocar de acervo"}

    def salvar_imagem(self, dados_url: str) -> dict:
        import base64
        cabeca, _, corpo = dados_url.partition(",")
        if "base64" not in cabeca:
            return {"ok": False, "motivo": "formato inesperado"}
        destino = self.janela.create_file_dialog(
            webview.SAVE_DIALOG,
            directory=str(Path.home() / "Pictures"),
            save_filename="garagem.png")
        if not destino:
            return {"ok": False, "motivo": "cancelado"}
        caminho = Path(destino if isinstance(destino, str) else destino[0])
        caminho.write_bytes(base64.b64decode(corpo))
        return {"ok": True, "caminho": str(caminho)}


def _porta_livre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _esperar(porta: int, segundos: float = 25.0) -> bool:
    """Espera o servidor **responder**, nao so' aceitar conexao."""
    limite = time.time() + segundos
    while time.time() < limite:
        try:
            with socket.create_connection(("127.0.0.1", porta), timeout=.4) as s:
                s.sendall(b"GET /api/acervo HTTP/1.1\r\nHost: 127.0.0.1\r\n"
                          b"Connection: close\r\n\r\n")
                s.settimeout(1.5)
                if s.recv(16).startswith(b"HTTP/"):
                    return True
        except OSError:
            pass
        time.sleep(.15)
    return False


def _url(porta: int) -> str:
    """`janela=1` diz a pagina que existe seletor de pasta nativo aqui.

    No navegador comum nao existe -- a pagina nao tem como abrir um dialogo de
    pasta -- e mostrar um botao que nao faz nada e' pior que nao mostrar.
    """
    return "http://127.0.0.1:%d/?janela=1" % porta


def _subir_servidor(raiz: Path | None, porta: int, depurar: bool) -> subprocess.Popen:
    cmd = [sys.executable, "-W", "ignore", str(AQUI / "garagem.py"),
           "--porta", str(porta), "--sem-navegador"]
    if raiz:
        cmd += ["--acervo", str(raiz)]
    return subprocess.Popen(
        cmd, cwd=str(AQUI),
        stdout=subprocess.DEVNULL if not depurar else None,
        stderr=None,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Garagem 3D NFS Heat (janela)")
    ap.add_argument("--acervo", help="pasta do acervo (a que tem _indice.csv)")
    ap.add_argument("--depurar", action="store_true", help="abre as ferramentas de dev")
    args = ap.parse_args(argv)

    # Sem acervo a janela abre do mesmo jeito, na tela de boas-vindas. Quem
    # baixou so' o programa precisa de explicacao e de um caminho -- nao de um
    # dialogo de pasta que aparece do nada, antes de qualquer texto.
    raiz = resolver_acervo(args.acervo)
    cfg = ler_config()
    if raiz:
        cfg["acervo"] = str(raiz)
        gravar_config(cfg)

    porta = _porta_livre()
    # Um dicionario porque o vigia troca o servidor de lugar quando o usuario
    # escolhe outra pasta, e o `finally` precisa encerrar o processo **atual**,
    # nao o primeiro.
    estado = {"filho": _subir_servidor(raiz, porta, args.depurar),
              "porta": porta, "raiz": raiz}

    try:
        if not _esperar(porta):
            estado["filho"].terminate()
            print("O servidor da garagem nao subiu a tempo.", file=sys.stderr)
            return 3

        ponte = Ponte()
        # `js_api` fica fora por enquanto: a pagina nao chama `window.pywebview`
        # e a ponte injeta um handshake que, nesta maquina, deixava a janela
        # pendurada (cinza, "nao está respondendo") com o WebView2 renderizando
        # normalmente por tras. Volta quando houver uso real (salvar imagem).
        janela = webview.create_window(
            "Garagem NFS Heat",
            url=_url(porta),
            width=int(cfg.get("janela", {}).get("largura", 1600)),
            height=int(cfg.get("janela", {}).get("altura", 940)),
            min_size=(1180, 720),
            background_color="#06090C",
        )
        ponte.janela = janela

        # O botao "Escolher pasta" da tela de boas-vindas navega para
        # `/escolher-pasta`. Nao ha' ponte JS (ela pendurou esta janela uma vez)
        # nem rota de escrita no servidor: o vigia abaixo so' **le'** a URL da
        # janela e reage. `webview.start(func=...)` e' o lugar documentado para
        # isso, e diferente de um laco de accept de socket ele funciona aqui.
        def url_atual() -> str | None:
            try:
                return janela.get_current_url() or ""
            except Exception:
                return None                     # janela fechada

        def voltar(erro: str = "") -> None:
            """Sai de `/escolher-pasta` e **espera a URL trocar de verdade**.

            Sem essa espera o laco le' a URL velha no ciclo seguinte e abre o
            dialogo de novo, sem parar -- a navegacao nao e' instantanea.
            """
            destino = _url(estado["porta"]) + ("&erro=" + erro if erro else "")
            try:
                janela.load_url(destino)
            except Exception:
                return
            for _ in range(40):                 # ate' 10 s
                time.sleep(.25)
                u = url_atual()
                if u is None or "/escolher-pasta" not in u:
                    return

        def vigiar() -> None:
            while True:
                time.sleep(.25)
                url = url_atual()
                if url is None:
                    return
                if "/escolher-pasta" not in url:
                    continue

                try:
                    escolhida = janela.create_file_dialog(webview.FOLDER_DIALOG)
                except Exception:
                    escolhida = None

                if not escolhida:               # cancelou
                    voltar()
                    continue

                nova = Path(escolhida[0])
                if not e_acervo(nova):
                    # Dizer **por que** nao serviu. Recarregar calado deixa a
                    # pessoa achando que o botao nao funciona.
                    voltar("pasta")
                    continue

                c = ler_config()
                c["acervo"] = str(nova)
                gravar_config(c)
                estado["filho"].terminate()
                estado["porta"] = _porta_livre()
                estado["filho"] = _subir_servidor(nova, estado["porta"], args.depurar)
                estado["raiz"] = nova
                if not _esperar(estado["porta"]):
                    voltar("servidor")
                    continue
                voltar()

        webview.start(vigiar, debug=args.depurar)
    finally:
        alvo = estado["filho"]
        alvo.terminate()
        try:
            alvo.wait(timeout=5)
        except subprocess.TimeoutExpired:
            alvo.kill()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

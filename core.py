"""
Helpers compartilhados entre app.py e os blueprints (ex: ia_routes.py).
Fica num módulo separado para evitar import circular com app.py
(que roda como __main__ no Square Cloud).
"""
import os
import secrets
import sqlite3
import threading
import time
from collections import deque
from functools import wraps
from pathlib import Path

from flask import g, jsonify, redirect, request, session, url_for

BASE_DIR = Path(__file__).resolve().parent
# DB_PATH pode ser sobrescrito por variável de ambiente (útil em testes)
DB_PATH = Path(os.environ.get("DB_PATH") or BASE_DIR / "blog.db")

# Pasta de estado local (fora do git): chave secreta gerada automaticamente.
INSTANCE_DIR = BASE_DIR / "instance"
SECRET_KEY_FILE = INSTANCE_DIR / "secret_key"

# Valores de exemplo que NUNCA devem valer como chave (são públicos no repositório).
_SECRET_KEYS_PUBLICAS = {
    "dev-secret-key-troque-em-producao",
    "troque-por-uma-string-longa-e-aleatoria",
}


# ---------------------------------------------------------------------------
# SECRET_KEY
# ---------------------------------------------------------------------------

def _ler_chave_arquivo():
    try:
        chave = SECRET_KEY_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return chave if len(chave) >= 32 else None


def carregar_secret_key() -> tuple[str, str]:
    """Devolve (chave, origem). Origem: 'env' | 'arquivo' | 'arquivo-novo' |
    'memoria' | 'env-invalida'.

    Prioridade: variável SECRET_KEY; senão instance/secret_key (gerada com
    secrets.token_hex(32) e salva com permissão 0600, para as sessões
    sobreviverem a reinícios); se nem isso for possível (disco somente
    leitura), uma chave só em memória.
    """
    env = os.environ.get("SECRET_KEY", "").strip()
    invalida = False
    if env and env not in _SECRET_KEYS_PUBLICAS:
        return env, "env"
    if env:
        invalida = True  # alguém copiou o valor de exemplo — ignora

    try:
        INSTANCE_DIR.mkdir(mode=0o700, exist_ok=True)
        chave = _ler_chave_arquivo()
        if chave:
            try:
                os.chmod(SECRET_KEY_FILE, 0o600)
            except OSError:
                pass
            return chave, "env-invalida" if invalida else "arquivo"

        chave = secrets.token_hex(32)
        try:  # cria já com 0600 (sem janela em que o arquivo fica legível)
            fd = os.open(SECRET_KEY_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:  # existe, mas vazio/curto/corrompido: sobrescreve
            fd = os.open(SECRET_KEY_FILE, os.O_WRONLY | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(chave)
        os.chmod(SECRET_KEY_FILE, 0o600)
        return chave, "env-invalida" if invalida else "arquivo-novo"
    except OSError:
        return secrets.token_hex(32), "env-invalida" if invalida else "memoria"


# ---------------------------------------------------------------------------
# Limitador de tentativas (janela deslizante, em memória, por processo)
# ---------------------------------------------------------------------------

class LimitadorTentativas:
    """No máximo `maximo` eventos por chave dentro de `janela` segundos.

    Uso: `restante(chave)` > 0 => bloqueado (segundos até liberar);
    `registrar(chave)` conta um evento; `limpar(chave)` zera a chave.
    Entradas velhas são descartadas a cada ~60 s e há um teto de chaves
    (`max_chaves`) para um atacante não encher a memória variando o email.
    """

    def __init__(self, maximo: int, janela: float, max_chaves: int = 20000):
        self.maximo = maximo
        self.janela = janela
        self.max_chaves = max_chaves
        self._dados: dict[str, deque] = {}
        self._lock = threading.Lock()
        self._ultima_limpeza = 0.0

    def _podar(self, agora: float):  # chamar com o lock
        if agora - self._ultima_limpeza < 60 and len(self._dados) <= self.max_chaves:
            return
        self._ultima_limpeza = agora
        corte = agora - self.janela
        for k in [k for k, d in self._dados.items() if not d or d[-1] <= corte]:
            del self._dados[k]
        excesso = len(self._dados) - self.max_chaves
        if excesso > 0:  # ainda cheio: descarta as chaves mais antigas
            for k in sorted(self._dados, key=lambda k: self._dados[k][-1])[:excesso]:
                del self._dados[k]

    def _eventos(self, chave: str, agora: float):  # chamar com o lock
        d = self._dados.get(chave)
        if d is None:
            return None
        corte = agora - self.janela
        while d and d[0] <= corte:
            d.popleft()
        if not d:
            del self._dados[chave]
            return None
        return d

    def restante(self, chave: str) -> int:
        """Segundos até a chave ser liberada; 0 = pode tentar."""
        with self._lock:
            agora = time.monotonic()
            self._podar(agora)
            d = self._eventos(chave, agora)
            if d is not None and len(d) >= self.maximo:
                libera_em = d[len(d) - self.maximo] + self.janela
                return max(1, int(libera_em - agora) + 1)
            return 0

    def registrar(self, chave: str):
        with self._lock:
            agora = time.monotonic()
            self._podar(agora)
            d = self._eventos(chave, agora)
            if d is None:
                d = self._dados[chave] = deque()
            d.append(agora)

    def limpar(self, chave: str):
        with self._lock:
            self._dados.pop(chave, None)


# ---------------------------------------------------------------------------
# Banco
# ---------------------------------------------------------------------------

def get_db():
    if "db" not in g:
        # timeout=10: espera até 10 s por um lock em vez de falhar na hora
        # ("database is locked") quando outra requisição está gravando.
        g.db = sqlite3.connect(DB_PATH, timeout=10)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def login_requerido(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("uid"):
            return redirect(url_for("login", proximo=request.path))
        return view(*args, **kwargs)
    return wrapped


def login_requerido_api(view):
    """Igual ao login_requerido, mas responde 401 em JSON (para fetch)."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("uid"):
            return jsonify({"ok": False, "erro": "Sua sessão expirou. Entre novamente.",
                            "codigo": "nao_autenticado",
                            "login": url_for("login")}), 401
        return view(*args, **kwargs)
    return wrapped

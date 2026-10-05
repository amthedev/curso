"""
Helpers compartilhados entre app.py e os blueprints (ex: ia_routes.py).
Fica num módulo separado para evitar import circular com app.py
(que roda como __main__ no Square Cloud).
"""
import os
import sqlite3
from functools import wraps
from pathlib import Path

from flask import g, redirect, request, session, url_for

BASE_DIR = Path(__file__).resolve().parent
# DB_PATH pode ser sobrescrito por variável de ambiente (útil em testes)
DB_PATH = Path(os.environ.get("DB_PATH") or BASE_DIR / "blog.db")


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
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

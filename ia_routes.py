"""
Atividades geradas na hora com IA (OpenRouter).
Blueprint "ia" montado em /atividades/ia.
"""
import sqlite3

from flask import Blueprint, render_template

from core import login_requerido

bp = Blueprint("ia", __name__, url_prefix="/atividades/ia")


def init_ia_db(db: sqlite3.Connection):
    """Cria as tabelas usadas pelas atividades com IA (chamado no init_db)."""


@bp.route("/")
@login_requerido
def index():
    return render_template("ia/index.html")

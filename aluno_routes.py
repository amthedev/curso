"""
Área do aluno: painel (XP, streak, conquistas, heatmap) e ranking.
Blueprint "aluno" — registrado em app.py.

    /eu                      painel do aluno           (aluno.painel)
    /eu/ranking-publico      POST: aparecer no ranking (aluno.ranking_publico)
    /ranking                 ranking semana/mês/geral  (aluno.ranking)
    /api/eu/stats            JSON para chips no header (aluno.api_stats)
"""
from urllib.parse import urlparse

from flask import (Blueprint, abort, flash, jsonify, redirect, render_template,
                   request, session, url_for)

import gamificacao as gami
from core import get_db, login_requerido

bp = Blueprint("aluno", __name__)

PERIODOS = [
    ("semana", "Semana"),
    ("mes", "Mês"),
    ("geral", "Geral"),
]
TOP = 50


@bp.app_template_filter("milhar")
def milhar(valor) -> str:
    """1250 -> '1.250' (padrão pt-BR)."""
    try:
        return f"{int(valor):,}".replace(",", ".")
    except (TypeError, ValueError):
        return str(valor)


def _usuario(db):
    row = db.execute(
        "SELECT id, nome, ranking_publico FROM usuarios WHERE id = ?", (session["uid"],)
    ).fetchone()
    return row


@bp.route("/eu")
@login_requerido
def painel():
    db = get_db()
    usuario = _usuario(db)
    if usuario is None:  # sessão de um usuário que não existe mais
        session.clear()
        return redirect(url_for("login"))
    uid = usuario["id"]

    st = gami.stats(db, uid)
    novas = gami.avaliar_conquistas(db, uid, st)  # pega conquistas atrasadas (ex: pós-backfill)
    conquistas = gami.conquistas_status(db, uid, st, {c["codigo"] for c in novas})
    publico = bool(usuario["ranking_publico"])

    return render_template(
        "aluno/painel.html",
        nome=usuario["nome"],
        nome_ranking=gami.nome_publico(usuario["nome"]),
        inicial=(usuario["nome"] or "?").strip()[:1].upper() or "?",
        st=st,
        nivel=st["nivel"],
        conquistas=conquistas,
        n_desbloqueadas=sum(1 for c in conquistas if c["desbloqueada"]),
        novas=novas[:4],
        pos_geral=gami.posicao_usuario(db, uid, "geral"),
        pos_semana=gami.posicao_usuario(db, uid, "semana"),
        ranking_publico=publico,
        fontes=gami.FONTES,
        niveis=gami.NIVEIS,
    )


def _mesma_origem() -> bool:
    """Defesa extra contra POST cross-site (o site não usa token CSRF)."""
    origem = request.headers.get("Origin")
    return origem is None or urlparse(origem).netloc == request.host


@bp.route("/eu/ranking-publico", methods=["POST"])
@login_requerido
def ranking_publico():
    if not _mesma_origem():
        abort(403)
    db = get_db()
    publico = request.form.get("publico") == "1"
    gami.definir_ranking_publico(db, session["uid"], publico)
    flash(
        "Você agora aparece no ranking." if publico else "Você saiu do ranking público.",
        "sucesso",
    )
    return redirect(url_for("aluno.painel") + "#privacidade")


@bp.route("/ranking")
@login_requerido
def ranking():
    db = get_db()
    uid = session["uid"]
    periodo = request.args.get("periodo", "semana")
    if periodo not in gami.RANKING_PERIODOS:
        periodo = "semana"

    lista = gami.ranking(db, periodo, TOP)
    eu_pos = gami.posicao_usuario(db, uid, periodo)
    usuario = _usuario(db)

    return render_template(
        "aluno/ranking.html",
        periodo=periodo,
        periodos=PERIODOS,
        periodo_rotulo=gami.periodo_rotulo(periodo),
        podio=lista[:3],
        resto=lista[3:],
        eu_id=uid,
        eu_pos=eu_pos,
        eu_publico=bool(usuario["ranking_publico"]) if usuario else False,
        top=TOP,
        total=len(lista),
    )


@bp.route("/api/eu/stats")
def api_stats():
    uid = session.get("uid")
    if not uid:
        return jsonify({"erro": "não autenticado"}), 401
    st = gami.stats(get_db(), uid)
    resp = jsonify({
        "xp_total": st["xp_total"],
        "xp_hoje": st["xp_hoje"],
        "nivel": {
            "nome": st["nivel"]["nome"],
            "numero": st["nivel"]["numero"],
            "pct": st["nivel"]["pct"],
            "proximo": st["nivel"]["proximo"],
            "xp_faltam": st["nivel"]["xp_faltam"],
        },
        "streak": st["streak_atual"],
        "streak_recorde": st["streak_recorde"],
    })
    resp.headers["Cache-Control"] = "no-store"
    return resp

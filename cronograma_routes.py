"""
Cronograma adaptativo — blueprint "cronograma" montado em /cronograma.

    GET  /cronograma/          cronograma.index         onboarding (sem perfil ou ?editar=1) ou o plano de hoje
    POST /cronograma/perfil    cronograma.salvar_perfil form: nivel, objetivo, minutos -> redirect para o index
    POST /cronograma/hoje      cronograma.gerar_hoje    JSON -> gera as 3 missões do dia (lazy, idempotente)
    POST /cronograma/bau       cronograma.abrir_bau     JSON -> abre o baú do dia (uma única vez)

A lógica fica em cronograma.py; aqui só HTTP. As rotas JSON seguem o padrão do ia_routes
(sessão expirada -> 401 JSON, exige Content-Type JSON e mesma origem). Para o aluno o plano
é "o seu plano personalizado": nenhuma mensagem fala em IA.
"""
from __future__ import annotations

import logging

from flask import (Blueprint, flash, jsonify, make_response, redirect, render_template, request,
                   session, url_for)

import cronograma as cr
import ia_routes
from core import get_db, login_requerido, login_requerido_api

log = logging.getLogger("allandev.cronograma")

bp = Blueprint("cronograma", __name__, url_prefix="/cronograma")


def _erro(msg: str, status: int = 400, codigo: str = "erro"):
    return jsonify({"ok": False, "erro": msg, "codigo": codigo}), status


@bp.route("/")
@login_requerido
def index():
    db = get_db()
    uid = session["uid"]
    perfil = cr.obter_perfil(db, uid)
    if perfil is None or request.args.get("editar") == "1":
        return render_template("cronograma/onboarding.html", **cr.contexto_onboarding(perfil))

    resp = make_response(render_template("cronograma/index.html", **cr.contexto_index(db, uid)))
    # O estado muda a cada resposta do aluno: o "voltar" do navegador não pode mostrar um plano velho.
    resp.headers["Cache-Control"] = "no-store"
    return resp


@bp.route("/perfil", methods=["POST"])
@login_requerido
def salvar_perfil():
    db = get_db()
    try:
        cr.salvar_perfil(db, session["uid"], request.form.get("nivel"), request.form.get("objetivo"),
                         request.form.get("minutos"))
    except ValueError as e:
        flash(str(e), "erro")
        return redirect(url_for("cronograma.index", editar=1))
    flash("Plano salvo! Seu treino de hoje já está esperando.", "sucesso")
    return redirect(url_for("cronograma.index"))


@bp.route("/hoje", methods=["POST"])
@login_requerido_api
def gerar_hoje():
    falha = ia_routes.checar_requisicao_json()
    if falha:
        return falha
    db = get_db()
    try:
        r = cr.gerar_dia(db, session["uid"])
    except cr.CronogramaErro as e:
        return _erro(e.mensagem, e.status, e.codigo)
    except Exception:  # nunca vaza stack/segredo para o navegador
        log.exception("Erro inesperado montando o plano do dia")
        try:
            db.rollback()
        except Exception:
            pass
        return _erro("Não consegui montar o seu treino agora. Tente de novo em instantes.", 500, "interno")
    return jsonify({"ok": True, "status": "pronto", "dia_status": r["status"], "criado": r["criado"],
                    "url": url_for("cronograma.index")})


@bp.route("/bau", methods=["POST"])
@login_requerido_api
def abrir_bau():
    falha = ia_routes.checar_requisicao_json()
    if falha:
        return falha
    db = get_db()
    try:
        r = cr.abrir_bau(db, session["uid"])
    except cr.CronogramaErro as e:
        return _erro(e.mensagem, e.status, e.codigo)
    except Exception:
        log.exception("Erro inesperado abrindo o baú")
        try:
            db.rollback()
        except Exception:
            pass
        return _erro("Não consegui abrir o baú agora. Tente de novo em instantes.", 500, "interno")
    return jsonify({"ok": True, **r})

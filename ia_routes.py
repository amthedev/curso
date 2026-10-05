"""
Atividades geradas na hora com IA (OpenRouter).
Blueprint "ia" montado em /atividades/ia.

Rotas
    GET  /atividades/ia/                     ia.index     formulário + histórico (?tema= | ?post=<slug>)
    POST /atividades/ia/gerar                ia.gerar     JSON → gera e salva (com `post`: atividade baseada
                                                          num post do blog, com cache por post/nível/versão)
    GET  /atividades/ia/<id>                 ia.ver       resolver a atividade
    POST /atividades/ia/<id>/responder       ia.responder JSON → corrige 1 questão
    POST /atividades/ia/<id>/dica            ia.dica      JSON → revela dica (-50% XP)
    POST /atividades/ia/<id>/refazer         ia.refazer   JSON → zera respostas
    POST /atividades/ia/<id>/excluir         ia.excluir   JSON → apaga
    GET  /painel-allan-dev/ia                admin_ia     (registrada via registrar_admin)

O gabarito nunca vai para o HTML/JS antes da resposta: o navegador só recebe
`ia_service.publica(q)`; a explicação/resposta certa volta no JSON da correção.

Origem das atividades (`ia_atividades.origem`): 'livre' (gerador), 'post' ("praticar este post")
e 'cronograma' (plano diário do aluno — fica fora do histórico e do limite diário do gerador;
`responder` avisa o módulo `cronograma` por ganchos opcionais, ver `_gancho_cronograma`).

API pública para outros módulos: inserir_atividade, checar_requisicao_json, registrar_uso,
erro_json, HOJE_SQL, geracoes_hoje.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from flask import Blueprint, abort, current_app, jsonify, render_template, request, session, url_for
from markupsafe import Markup, escape

import ia_service as ia
from core import get_db, login_requerido, login_requerido_api

log = logging.getLogger("allandev.ia")

bp = Blueprint("ia", __name__, url_prefix="/atividades/ia")

SUGESTOES_TEMA = [
    "Nmap e varredura de portas", "SQL Injection", "XSS", "Linux permissões",
    "Redes TCP/IP", "Burp Suite", "Active Directory", "Criptografia", "Forense",
    "OSINT", "Python para hacking", "CTF Web", "Privilege Escalation Linux", "Wireshark",
]

# Dia "local" do Brasil (UTC-3, sem horário de verão desde 2019)
_HOJE_SQL = "date(criado_em, '-3 hours') = date('now', '-3 hours')"

# Uma geração por usuário por vez (cada chamada custa créditos)
_gerando: set[int] = set()
_gerando_lock = threading.Lock()

# "Praticar este post": formato fixo (para o cache valer para todo mundo) e travas
# por (post, nível, versão do texto) — se 30 alunos pedem juntos, só o 1º chama a IA.
POST_QUANTIDADE = 8
POST_CORPO_MIN = 120          # posts menores que isso não rendem uma atividade
POST_CACHE_DIARIO = 30        # atividades "de graça" (cache) por usuário por dia
_trava_pratica: dict[tuple, threading.Lock] = {}


# ---------------------------------------------------------------------------
# Banco
# ---------------------------------------------------------------------------

def init_ia_db(db: sqlite3.Connection):
    """Cria as tabelas usadas pelas atividades com IA (chamado no init_db)."""
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS ia_atividades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            tema TEXT NOT NULL,
            nivel TEXT NOT NULL,
            foco TEXT NOT NULL DEFAULT 'misto',
            tipos TEXT NOT NULL DEFAULT '[]',
            quantidade INTEGER NOT NULL DEFAULT 0,
            titulo TEXT NOT NULL DEFAULT '',
            json TEXT NOT NULL,
            modelo TEXT NOT NULL DEFAULT '',
            xp_total INTEGER NOT NULL DEFAULT 0,
            concluida INTEGER NOT NULL DEFAULT 0,
            nota INTEGER,
            xp_ganho INTEGER NOT NULL DEFAULT 0,
            dicas_usadas TEXT NOT NULL DEFAULT '[]',
            tentativas INTEGER NOT NULL DEFAULT 1,
            criado_em TEXT NOT NULL DEFAULT (datetime('now')),
            concluida_em TEXT,
            origem TEXT NOT NULL DEFAULT 'livre',
            plano_dia TEXT,
            topicos TEXT NOT NULL DEFAULT '[]'
        );
        CREATE INDEX IF NOT EXISTS idx_ia_atividades_usuario
            ON ia_atividades (usuario_id, id DESC);

        CREATE TABLE IF NOT EXISTS ia_respostas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            atividade_id INTEGER NOT NULL REFERENCES ia_atividades(id) ON DELETE CASCADE,
            questao_id TEXT NOT NULL,
            resposta TEXT NOT NULL DEFAULT '',
            correta INTEGER NOT NULL DEFAULT 0,
            pontuacao INTEGER NOT NULL DEFAULT 0,
            xp INTEGER NOT NULL DEFAULT 0,
            feedback TEXT NOT NULL DEFAULT '',
            criado_em TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (atividade_id, questao_id)
        );
        CREATE INDEX IF NOT EXISTS idx_ia_respostas_atividade
            ON ia_respostas (atividade_id);

        -- Log de uso (sobrevive à exclusão das atividades): limite diário + painel
        CREATE TABLE IF NOT EXISTS ia_uso (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            tipo TEXT NOT NULL,
            tema TEXT NOT NULL DEFAULT '',
            modelo TEXT NOT NULL DEFAULT '',
            tokens INTEGER NOT NULL DEFAULT 0,
            ok INTEGER NOT NULL DEFAULT 1,
            erro TEXT NOT NULL DEFAULT '',
            duracao_ms INTEGER NOT NULL DEFAULT 0,
            criado_em TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_ia_uso_usuario
            ON ia_uso (usuario_id, tipo, criado_em);
        CREATE INDEX IF NOT EXISTS idx_ia_uso_tipo
            ON ia_uso (tipo, criado_em);

        -- "Praticar este post": atividade pronta por (post, nível, versão do texto).
        -- corpo_hash = sha1(corpo)[:12]: editar o post muda o hash e gera de novo.
        CREATE TABLE IF NOT EXISTS post_pratica_cache (
            post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
            nivel TEXT NOT NULL,
            corpo_hash TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            criado_em TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (post_id, nivel, corpo_hash)
        );
        """
    )
    # Bancos antigos: colunas do cronograma (origem/plano_dia/topicos). Seguro para rodar sempre
    # (e em vários workers ao mesmo tempo: "duplicate column" é ignorado).
    existentes = {r[1] for r in db.execute("PRAGMA table_info(ia_atividades)")}
    for coluna, ddl in (("origem", "TEXT NOT NULL DEFAULT 'livre'"),
                        ("plano_dia", "TEXT"),
                        ("topicos", "TEXT NOT NULL DEFAULT '[]'")):
        if coluna not in existentes:
            try:
                db.execute(f"ALTER TABLE ia_atividades ADD COLUMN {coluna} {ddl}")
            except sqlite3.OperationalError as e:
                if "duplicate column" not in str(e).lower():
                    raise
    db.execute("CREATE INDEX IF NOT EXISTS idx_ia_atividades_origem "
               "ON ia_atividades (usuario_id, origem, plano_dia)")
    db.commit()


def registrar_uso(db, uid, tipo, *, tema="", modelo="", tokens=0, ok=True, erro="", duracao_ms=0):
    """Loga uma chamada de IA em ia_uso (não faz commit)."""
    db.execute(
        "INSERT INTO ia_uso (usuario_id, tipo, tema, modelo, tokens, ok, erro, duracao_ms) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, tipo, tema[:120], (modelo or "")[:100], int(tokens or 0), 1 if ok else 0,
         (erro or "")[:60], int(duracao_ms or 0)),
    )


def geracoes_hoje(db, uid) -> int:
    return db.execute(
        f"SELECT COUNT(*) c FROM ia_uso WHERE usuario_id = ? AND tipo = 'geracao' AND ok = 1 AND {_HOJE_SQL}",
        (uid,),
    ).fetchone()["c"]


def _correcoes_hoje(db, uid) -> int:
    return db.execute(
        f"SELECT COUNT(*) c FROM ia_uso WHERE usuario_id = ? AND tipo IN ('correcao','dica') AND {_HOJE_SQL}",
        (uid,),
    ).fetchone()["c"]


def _uso_info(db, uid) -> dict:
    limite = ia.limite_diario()
    usadas = geracoes_hoje(db, uid)
    return {
        "hoje": usadas,
        "limite": limite,
        "ilimitado": limite <= 0,
        "restantes": max(0, limite - usadas) if limite > 0 else None,
        "pct": min(100, round(usadas / limite * 100)) if limite > 0 else 0,
    }


def resumo_ia_usuario(db, uid) -> tuple[dict, list[dict]]:
    """(ia_stats, ia_recentes) para a página /atividades (o plano do cronograma fica de fora)."""
    r = db.execute(
        "SELECT COUNT(*) total, COALESCE(SUM(xp_ganho), 0) xp, "
        "COALESCE(SUM(concluida), 0) concluidas, AVG(CASE WHEN concluida = 1 THEN nota END) media "
        "FROM ia_atividades WHERE usuario_id = ? AND origem != 'cronograma'",
        (uid,),
    ).fetchone()
    stats = {
        "total": r["total"],
        "xp": r["xp"],
        "concluidas": r["concluidas"],
        "media": round(r["media"]) if r["media"] is not None else None,
    }
    recentes = [
        {
            "id": a["id"], "titulo": a["titulo"], "tema": a["tema"], "nivel": a["nivel"],
            "concluida": bool(a["concluida"]), "nota": a["nota"], "xp_ganho": a["xp_ganho"],
            "xp_total": a["xp_total"], "criado_em": a["criado_em"],
            "url": url_for("ia.ver", atividade_id=a["id"]),
        }
        for a in db.execute(
            "SELECT id, titulo, tema, nivel, concluida, nota, xp_ganho, xp_total, criado_em "
            "FROM ia_atividades WHERE usuario_id = ? AND origem != 'cronograma' ORDER BY id DESC LIMIT 3",
            (uid,),
        ).fetchall()
    ]
    return stats, recentes


def ia_configurada() -> bool:
    return ia.ia_configurada()


# ---------------------------------------------------------------------------
# Template helpers
# ---------------------------------------------------------------------------

def url_cronograma() -> str:
    """URL do cronograma (o blueprint pode ainda não existir): usa o endpoint se estiver registrado."""
    try:
        if "cronograma.index" in current_app.view_functions:
            return url_for("cronograma.index")
    except Exception:  # fora de contexto/rota inexistente
        pass
    return "/cronograma/"


@bp.app_context_processor
def _ctx_ia():
    return {"ia_disponivel": ia.ia_configurada(), "cronograma_url": url_cronograma}


@bp.app_template_filter("ia_data")
def ia_data(criado_em) -> str:
    """'2026-10-05 17:30:00' (UTC) → 'hoje, 14:30' / 'ontem, 09:10' / '3 out, 14:30' (Brasília)."""
    try:
        d = datetime.strptime(str(criado_em)[:19], "%Y-%m-%d %H:%M:%S") - timedelta(hours=3)
    except ValueError:
        return str(criado_em or "")
    hoje = (datetime.now(timezone.utc) - timedelta(hours=3)).date()
    hora = d.strftime("%H:%M")
    if d.date() == hoje:
        return f"hoje, {hora}"
    if d.date() == hoje - timedelta(days=1):
        return f"ontem, {hora}"
    meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
    ano = f" {d.year}" if d.year != hoje.year else ""
    return f"{d.day} {meses[d.month - 1]}{ano}, {hora}"


@bp.app_template_filter("ia_inline")
def ia_inline(texto) -> Markup:
    """Escapa TUDO e só depois aplica `código` e **negrito** (seguro p/ saída de IA)."""
    s = str(escape(texto or ""))
    s = re.sub(r"`([^`\n]{1,200})`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*\n]{1,200})\*\*", r"<strong>\1</strong>", s)
    return Markup(s)


# ---------------------------------------------------------------------------
# Guardas das rotas JSON
# ---------------------------------------------------------------------------

def _erro(msg: str, status: int = 400, codigo: str = "erro"):
    return jsonify({"ok": False, "erro": msg, "codigo": codigo}), status


def checar_requisicao_json():
    """Público. CSRF sem token: exige JSON (não dá para forjar via <form>) e mesma origem."""
    if not request.is_json:
        return _erro("Envie a requisição como JSON.", 415, "content_type")
    origem = request.headers.get("Origin") or request.headers.get("Referer")
    if origem:
        host = urlparse(origem).netloc.lower()
        permitidos = {request.host.lower()}
        fwd = request.headers.get("X-Forwarded-Host")
        if fwd:
            permitidos.add(fwd.split(",")[0].strip().lower())
        if host not in permitidos:
            return _erro("Origem não permitida.", 403, "origem")
    if request.get_json(silent=True) is None:
        return _erro("JSON inválido.", 400, "json")
    return None


# API interna para outros blueprints de IA (ex.: tutor_routes.py) reaproveitarem
# a mesma checagem de origem/Content-Type, o log de uso e o "dia" do limite.
erro_json = _erro
_checar_requisicao_json = checar_requisicao_json   # nomes antigos (compatibilidade)
_registrar_uso = registrar_uso
HOJE_SQL = _HOJE_SQL


def _post_por_slug(db, slug):
    """Post pelo slug (ou None). Aceita qualquer valor: só strings plausíveis consultam."""
    if not isinstance(slug, str) or not slug.strip() or len(slug) > 200:
        return None
    return db.execute("SELECT id, slug, titulo, corpo, nivel FROM posts WHERE slug = ?",
                      (slug.strip(),)).fetchone()


def _hash_corpo(corpo: str) -> str:
    return hashlib.sha1((corpo or "").encode("utf-8")).hexdigest()[:12]


def _cache_pratica(db, post_id: int, nivel: str, corpo_hash: str):
    """Atividade pronta (dict) do cache de "praticar post", ou None se não há/está inválida."""
    r = db.execute(
        "SELECT payload_json FROM post_pratica_cache WHERE post_id = ? AND nivel = ? AND corpo_hash = ?",
        (post_id, nivel, corpo_hash),
    ).fetchone()
    if r is None:
        return None
    try:
        payload = json.loads(r["payload_json"])
        atividade = payload["atividade"]
        if isinstance(atividade, dict) and atividade.get("questoes"):
            return payload
    except (TypeError, ValueError, KeyError):
        pass
    return None


def _gravar_cache_pratica(db, post_id: int, nivel: str, corpo_hash: str, atividade: dict, modelo: str):
    payload = json.dumps({"atividade": atividade, "modelo": modelo}, ensure_ascii=False)
    # Mantém o primeiro (várias requisições simultâneas) e descarta versões velhas do texto
    db.execute(
        "INSERT OR IGNORE INTO post_pratica_cache (post_id, nivel, corpo_hash, payload_json) "
        "VALUES (?, ?, ?, ?)", (post_id, nivel, corpo_hash, payload))
    db.execute("DELETE FROM post_pratica_cache WHERE post_id = ? AND corpo_hash != ?",
               (post_id, corpo_hash))


def _pratica_cache_hoje(db, uid) -> int:
    return db.execute(
        f"SELECT COUNT(*) c FROM ia_uso WHERE usuario_id = ? AND tipo = 'pratica_cache' AND {_HOJE_SQL}",
        (uid,),
    ).fetchone()["c"]


def _trava_para(chave: tuple) -> threading.Lock:
    with _gerando_lock:
        return _trava_pratica.setdefault(chave, threading.Lock())


def _atividade_do_usuario(atividade_id: int):
    row = get_db().execute(
        "SELECT * FROM ia_atividades WHERE id = ? AND usuario_id = ?",
        (atividade_id, session["uid"]),
    ).fetchone()
    return row


def _carregar(row) -> dict:
    try:
        dados = json.loads(row["json"])
        if isinstance(dados, dict) and isinstance(dados.get("questoes"), list):
            return dados
    except (TypeError, ValueError):
        pass
    abort(500)


def _respostas(db, atividade_id) -> dict[str, sqlite3.Row]:
    return {
        r["questao_id"]: r
        for r in db.execute("SELECT * FROM ia_respostas WHERE atividade_id = ?", (atividade_id,))
    }


def _resultado_questao(q: dict, r: sqlite3.Row) -> dict:
    try:
        resposta = json.loads(r["resposta"])
    except (TypeError, ValueError):
        resposta = r["resposta"]
    pont = r["pontuacao"]
    return {
        "questao_id": q["id"],
        "correta": bool(r["correta"]),
        "status": "certa" if r["correta"] else ("parcial" if pont >= 40 else "errada"),
        "pontuacao": pont,
        "xp": r["xp"],
        "xp_max": q["xp"],
        "feedback": r["feedback"],
        "resposta": resposta,
        "revelar": ia.revelar(q, resposta),
    }


def _progresso(row, atividade, respostas) -> dict:
    questoes = atividade["questoes"]
    return {
        "respondidas": len(respostas),
        "total": len(questoes),
        "acertos": sum(1 for r in respostas.values() if r["correta"]),
        "xp": sum(r["xp"] for r in respostas.values()),
        "xp_total": sum(q["xp"] for q in questoes),
        "concluida": len(respostas) >= len(questoes),
    }


def _nota(atividade, respostas) -> int:
    peso = sum(q["xp"] for q in atividade["questoes"]) or 1
    soma = sum(q["xp"] * respostas[q["id"]]["pontuacao"] for q in atividade["questoes"] if q["id"] in respostas)
    return round(soma / peso)


def _resultado_final(row, atividade, respostas) -> dict:
    erradas = []
    for q in atividade["questoes"]:
        r = respostas.get(q["id"])
        if r is None or r["correta"]:
            continue
        try:
            resp = json.loads(r["resposta"])
        except (TypeError, ValueError):
            resp = r["resposta"]
        erradas.append({
            "id": q["id"],
            "tipo": q["tipo"],
            "enunciado": q["enunciado"],
            "sua_resposta": ia.resposta_legivel(q, resp),
            "gabarito": ia.gabarito_legivel(q),
            "explicacao": q.get("explicacao", ""),
            "feedback": r["feedback"],
            "pontuacao": r["pontuacao"],
        })
    prog = _progresso(row, atividade, respostas)
    nivel = row["nivel"]
    return {
        "nota": _nota(atividade, respostas),
        "xp_ganho": prog["xp"],
        "xp_total": prog["xp_total"],
        "acertos": prog["acertos"],
        "total": prog["total"],
        "erradas": erradas,
        "proximo_nivel": ia.proximo_nivel(nivel),
        "ja_no_maximo": nivel == ia.NIVEIS[-1],
    }


def _tipos_validos(valor) -> list[str]:
    if not isinstance(valor, list):
        return []
    vistos = []
    for t in valor:
        if isinstance(t, str) and t in ia.TIPOS and t not in vistos:
            vistos.append(t)
    return vistos


# ---------------------------------------------------------------------------
# Páginas
# ---------------------------------------------------------------------------

@bp.route("/")
@login_requerido
def index():
    db = get_db()
    uid = session["uid"]
    atividades = db.execute(
        """
        SELECT a.id, a.titulo, a.tema, a.nivel, a.foco, a.tipos, a.quantidade, a.concluida,
               a.nota, a.xp_ganho, a.xp_total, a.criado_em, a.tentativas,
               (SELECT COUNT(*) FROM ia_respostas r WHERE r.atividade_id = a.id) AS respondidas
        FROM ia_atividades a
        WHERE a.usuario_id = ? AND a.origem != 'cronograma'
        ORDER BY a.id DESC
        LIMIT 60
        """,
        (uid,),
    ).fetchall()
    stats, _ = resumo_ia_usuario(db, uid)

    # "Praticar este post": ?post=<slug> (post inexistente é ignorado → formulário normal)
    post_ctx = None
    slug_post = (request.args.get("post") or "").strip()[:200]
    if slug_post:
        p = _post_por_slug(db, slug_post)
        if p is not None:
            post_ctx = {"slug": p["slug"], "titulo": p["titulo"], "nivel": p["nivel"]}

    if post_ctx:
        tema_inicial = ia.limpar_tema(post_ctx["titulo"])
    else:
        tema_inicial = ia.limpar_tema(request.args.get("tema", ""))
    nivel_inicial = (ia.normalizar_nivel(request.args.get("nivel", ""))
                     or (ia.normalizar_nivel(post_ctx["nivel"]) if post_ctx else None)
                     or "Intermediário")

    return render_template(
        "ia/index.html",
        atividades=atividades,
        stats=stats,
        uso=_uso_info(db, uid),
        status=ia.status_publico(),
        sugestoes=SUGESTOES_TEMA,
        niveis=ia.NIVEIS,
        quantidades=ia.QUANTIDADES,
        tipos=ia.TIPOS,
        tema_inicial=tema_inicial,
        nivel_inicial=nivel_inicial,
        tema_max=ia.TEMA_MAX,
        post_ctx=post_ctx,
    )


@bp.route("/<int:atividade_id>")
@login_requerido
def ver(atividade_id):
    row = _atividade_do_usuario(atividade_id)
    if row is None:
        abort(404)
    db = get_db()
    atividade = _carregar(row)
    respostas = _respostas(db, atividade_id)
    dicas = set(json.loads(row["dicas_usadas"] or "[]"))

    origem = row["origem"]
    do_plano = origem == "cronograma"

    # Atividade criada a partir de um post ("Praticar este post"): link de volta ao post
    post_info = None
    info = atividade.get("post")
    if not do_plano and isinstance(info, dict) and isinstance(info.get("slug"), str):
        existente = db.execute("SELECT slug, titulo FROM posts WHERE slug = ?", (info["slug"],)).fetchone()
        if existente is not None:
            post_info = {"slug": existente["slug"], "titulo": existente["titulo"]}

    questoes_cliente = []
    for q in atividade["questoes"]:
        pq = ia.publica(q)
        pq["dica_usada"] = q["id"] in dicas
        if q["id"] in dicas and q.get("dica"):
            pq["dica"] = q["dica"]
        if q["id"] in respostas:
            pq["resultado"] = _resultado_questao(q, respostas[q["id"]])
        questoes_cliente.append(pq)

    prog = _progresso(row, atividade, respostas)
    payload = {
        "id": row["id"],
        "urls": {
            "responder": url_for("ia.responder", atividade_id=row["id"]),
            "dica": url_for("ia.dica", atividade_id=row["id"]),
            "refazer": url_for("ia.refazer", atividade_id=row["id"]),
            "gerar": url_for("ia.gerar"),
            "index": url_cronograma() if do_plano else url_for("ia.index"),
            "cronograma": url_cronograma() if do_plano else None,
        },
        "origem": origem,
        "questoes": questoes_cliente,
        "progresso": prog,
        "final": _resultado_final(row, atividade, respostas) if prog["concluida"] else None,
        "config": {
            "tema": row["tema"],
            "nivel": row["nivel"],
            "foco": row["foco"],
            "quantidade": atividade.get("quantidade_pedida") or row["quantidade"],
            "tipos": json.loads(row["tipos"] or "[]"),
            "base_id": row["id"],
            "post": post_info["slug"] if post_info else None,
        },
        "ia_disponivel": ia.ia_configurada() and not do_plano,
    }
    return render_template(
        "ia/ver.html",
        row=row,
        origem=origem,
        do_plano=do_plano,
        cron_url=url_cronograma() if do_plano else None,
        atividade=atividade,
        payload=payload,
        progresso=prog,
        tipos=ia.TIPOS,
        proximo_nivel=ia.proximo_nivel(row["nivel"]),
        post_info=post_info,
    )


# ---------------------------------------------------------------------------
# API JSON
# ---------------------------------------------------------------------------

ORIGENS = ("livre", "post", "cronograma")


def inserir_atividade(db, uid, *, tema, nivel, foco, tipos, quantidade, atividade, modelo,
                      origem="livre", plano_dia=None, topicos=None) -> int:
    """Grava uma atividade já normalizada (`ia_service.normalizar_atividade`) e devolve o id.

    Não faz commit (o chamador decide). `origem`: 'livre' | 'post' | 'cronograma'; `plano_dia`:
    'YYYY-MM-DD' (dia de Brasília) do plano; `topicos`: lista de slugs — se omitida, vem dos
    `topico` das questões."""
    if origem not in ORIGENS:
        origem = "livre"
    if topicos is None:
        topicos = [q.get("topico") for q in atividade.get("questoes", [])]
    slugs = []
    for t in topicos or []:
        t = ia._topico_valido(t)
        if t and t not in slugs:
            slugs.append(t)
    atividade["quantidade_pedida"] = quantidade
    cur = db.execute(
        "INSERT INTO ia_atividades (usuario_id, tema, nivel, foco, tipos, quantidade, titulo, json, "
        "modelo, xp_total, origem, plano_dia, topicos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, tema, nivel, foco, json.dumps(list(tipos)), len(atividade["questoes"]), atividade["titulo"],
         json.dumps(atividade, ensure_ascii=False), modelo, atividade["xp_total"], origem,
         (str(plano_dia)[:10] if plano_dia else None), json.dumps(slugs[:20])),
    )
    return cur.lastrowid


def _inserir_atividade(db, uid, tema, nivel, foco, tipos, quantidade, atividade, modelo,
                       origem="livre") -> int:
    return inserir_atividade(db, uid, tema=tema, nivel=nivel, foco=foco, tipos=tipos,
                             quantidade=quantidade, atividade=atividade, modelo=modelo, origem=origem)


def _resposta_gerada(db, uid, atividade_id, atividade, **extra):
    return jsonify({
        "ok": True,
        "id": atividade_id,
        "url": url_for("ia.ver", atividade_id=atividade_id),
        "questoes": len(atividade["questoes"]),
        "uso": _uso_info(db, uid),
        **extra,
    })


def _atividade_do_cache(db, uid, post, nivel, tipos, payload):
    """Cria a atividade do usuário a partir do cache — sem IA e SEM consumir a cota de gerações
    (fica registrada como `pratica_cache`, que o limite diário não conta)."""
    atividade = payload["atividade"]
    for q in atividade["questoes"]:  # cada aluno vê alternativas/passos em outra ordem
        ia.embaralhar_questao(q)
    modelo = "cache:" + str(payload.get("modelo") or "ia")[:90]
    novo_id = _inserir_atividade(db, uid, atividade.get("tema") or ia.limpar_tema(post["titulo"]),
                                 nivel, "misto", tipos, POST_QUANTIDADE, atividade, modelo, "post")
    registrar_uso(db, uid, "pratica_cache", tema=post["titulo"], modelo=modelo)
    db.commit()
    return _resposta_gerada(db, uid, novo_id, atividade, cache=True)


@bp.route("/gerar", methods=["POST"])
@login_requerido_api
def gerar():
    falha = checar_requisicao_json()
    if falha:
        return falha
    if not ia.ia_configurada():
        return _erro("A geração com IA ainda não foi configurada pelo administrador.", 503, "nao_configurada")

    dados = request.get_json(silent=True)
    if not isinstance(dados, dict):
        return _erro("JSON inválido.", 400, "json")
    db = get_db()
    uid = session["uid"]

    nivel = ia.normalizar_nivel(dados.get("nivel"))
    if not nivel:
        return _erro("Escolha um nível válido.", 400, "nivel")

    # "Praticar este post": o servidor carrega o post e fixa o formato (tema, 8 questões, todos os
    # tipos) — assim a atividade em cache é a mesma para todos e nada do cliente a influencia.
    post = None
    if dados.get("post") not in (None, ""):
        post = _post_por_slug(db, dados.get("post"))
        if post is None:
            return _erro("Esse post não foi encontrado.", 404, "post")
        if len((post["corpo"] or "").strip()) < POST_CORPO_MIN:
            return _erro("Este post é curto demais para virar uma atividade.", 422, "post_curto")
        tema = ia.limpar_tema(post["titulo"])
        quantidade, tipos, foco = POST_QUANTIDADE, list(ia.TIPOS), "misto"
    else:
        tema = ia.limpar_tema(dados.get("tema"))
        if len(tema) < 3:
            return _erro("Descreva o tema com pelo menos 3 caracteres.", 400, "tema")
        try:
            quantidade = int(dados.get("quantidade"))
        except (TypeError, ValueError):
            quantidade = 0
        if quantidade not in ia.QUANTIDADES:
            return _erro("Escolha a quantidade de questões (5, 8, 10 ou 15).", 400, "quantidade")
        tipos = _tipos_validos(dados.get("tipos"))
        if not tipos:
            return _erro("Marque pelo menos um tipo de questão.", 400, "tipos")
        foco = dados.get("foco") if dados.get("foco") in ia.FOCOS else "misto"

    # "Gerar outra / mais difícil": evita repetir as questões da atividade base
    evitar = []
    base = None
    base_id = dados.get("base_id")
    if isinstance(base_id, int) and not isinstance(base_id, bool):
        base = _atividade_do_usuario(base_id)
        if base is not None:
            try:
                evitar = [q["enunciado"] for q in json.loads(base["json"])["questoes"]]
            except (TypeError, ValueError, KeyError):
                evitar = []

    corpo_hash = chave_cache = contexto = None
    quer_outra = False
    if post is not None:
        corpo_hash = _hash_corpo(post["corpo"])
        chave_cache = (post["id"], nivel, corpo_hash)
        contexto = post["corpo"][:6000]
        # "Outra" no MESMO nível precisa de questões novas → ignora o cache
        quer_outra = base is not None and base["nivel"] == nivel
        if not quer_outra:
            cache = _cache_pratica(db, *chave_cache)
            if cache:
                if _pratica_cache_hoje(db, uid) >= POST_CACHE_DIARIO:
                    return _erro("Você já abriu muitas atividades de posts hoje. Resolva as que já tem "
                                 "e volte amanhã!", 429, "limite_cache")
                return _atividade_do_cache(db, uid, post, nivel, tipos, cache)

    limite = ia.limite_diario()
    if limite > 0 and geracoes_hoje(db, uid) >= limite:
        return _erro(
            f"Você atingiu o limite de {limite} atividades com IA por hoje. "
            "O contador zera à meia-noite — até lá, revise as que já gerou!",
            429, "limite_diario",
        )

    with _gerando_lock:
        if uid in _gerando:
            return _erro("Já existe uma atividade sendo gerada para você. Aguarde ela terminar.",
                         409, "em_andamento")
        _gerando.add(uid)
    try:
        # Quem chega junto no mesmo post/nível espera o primeiro gerar e aproveita o cache.
        trava = _trava_para(chave_cache) if chave_cache else None
        if trava:
            trava.acquire()
        try:
            if trava and not quer_outra:
                cache = _cache_pratica(db, *chave_cache)
                if cache:
                    return _atividade_do_cache(db, uid, post, nivel, tipos, cache)
            try:
                resultado = ia.gerar_atividade(tema, nivel, quantidade, tipos, foco, evitar, contexto)
            except ia.IAErro as e:
                registrar_uso(db, uid, "geracao", tema=tema, ok=False, erro=e.codigo)
                db.commit()
                return _erro(e.mensagem, e.status, e.codigo)
            except Exception:  # nunca deixa vazar stack/segredo para o cliente
                log.exception("Erro inesperado gerando atividade com IA")
                registrar_uso(db, uid, "geracao", tema=tema, ok=False, erro="interno")
                db.commit()
                return _erro("Erro inesperado ao gerar a atividade. Tente novamente.", 500, "interno")

            atividade = resultado["atividade"]
            atividade["quantidade_pedida"] = quantidade
            if post is not None:
                atividade["post"] = {"slug": post["slug"], "titulo": post["titulo"]}
                _gravar_cache_pratica(db, post["id"], nivel, corpo_hash, atividade, resultado["modelo"])
            novo_id = _inserir_atividade(db, uid, tema, nivel, foco, tipos, quantidade, atividade,
                                         resultado["modelo"], "post" if post is not None else "livre")
            registrar_uso(db, uid, "geracao", tema=tema, modelo=resultado["modelo"],
                           tokens=resultado["tokens"], duracao_ms=resultado["duracao_ms"])
            db.commit()
        finally:
            if trava:
                trava.release()
    finally:
        with _gerando_lock:
            _gerando.discard(uid)

    return _resposta_gerada(db, uid, novo_id, atividade)


@bp.route("/<int:atividade_id>/responder", methods=["POST"])
@login_requerido_api
def responder(atividade_id):
    falha = checar_requisicao_json()
    if falha:
        return falha
    row = _atividade_do_usuario(atividade_id)
    if row is None:
        return _erro("Atividade não encontrada.", 404, "nao_encontrada")
    db = get_db()
    atividade = _carregar(row)
    dados = request.get_json(silent=True) or {}
    qid = str(dados.get("questao_id", ""))[:20]
    q = next((x for x in atividade["questoes"] if x["id"] == qid), None)
    if q is None:
        return _erro("Questão inválida.", 404, "questao")

    respostas = _respostas(db, atividade_id)
    if qid in respostas:
        return jsonify({"ok": False, "codigo": "ja_respondida", "erro": "Você já respondeu esta questão.",
                        "resultado": _resultado_questao(q, respostas[qid])}), 409

    resposta = dados.get("resposta")
    feedback = ""
    uid = session["uid"]
    try:
        if q["tipo"] == "aberta":
            if not isinstance(resposta, str) or len(resposta.strip()) < 2:
                raise ValueError("Escreva sua resposta antes de enviar.")
            texto = ia._txt(resposta, ia.RESPOSTA_ABERTA_MAX, multilinha=True)
            pontuacao, feedback = _corrigir_aberta(db, uid, q, texto, neutro=row["origem"] == "cronograma")
            resultado = {"correta": pontuacao >= 70, "pontuacao": pontuacao, "resposta": texto}
        else:
            resultado = ia.corrigir_objetiva(q, resposta)
            if q["tipo"] == "ordenar" and not resultado["correta"]:
                feedback = (f"{resultado['posicoes_certas']} de {len(q['passos'])} passos estavam "
                            "na posição certa.")
            elif q["tipo"] == "comando" and not resultado["correta"]:
                feedback = "Esse comando não corresponde ao que foi pedido."
            elif q["tipo"] in ("associar", "lacuna", "linha"):
                feedback = resultado.get("feedback", "")
    except ValueError as e:
        return _erro(str(e), 400, "resposta_invalida")

    dicas = set(json.loads(row["dicas_usadas"] or "[]"))
    fator = 0.5 if qid in dicas else 1.0
    xp = round(q["xp"] * resultado["pontuacao"] / 100 * fator)

    try:
        db.execute(
            "INSERT INTO ia_respostas (atividade_id, questao_id, resposta, correta, pontuacao, xp, feedback) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (atividade_id, qid, json.dumps(resultado["resposta"], ensure_ascii=False),
             1 if resultado["correta"] else 0, resultado["pontuacao"], xp, feedback),
        )
    except sqlite3.IntegrityError:
        db.rollback()
        respostas = _respostas(db, atividade_id)
        return jsonify({"ok": False, "codigo": "ja_respondida", "erro": "Você já respondeu esta questão.",
                        "resultado": _resultado_questao(q, respostas[qid])}), 409

    respostas = _respostas(db, atividade_id)
    prog = _progresso(row, atividade, respostas)
    final = None
    if prog["concluida"]:
        final = _resultado_final(row, atividade, respostas)
        db.execute(
            "UPDATE ia_atividades SET concluida = 1, nota = ?, xp_ganho = ?, concluida_em = datetime('now') "
            "WHERE id = ?",
            (final["nota"], final["xp_ganho"], atividade_id),
        )
    else:
        db.execute("UPDATE ia_atividades SET xp_ganho = ? WHERE id = ?", (prog["xp"], atividade_id))
    db.commit()

    # Ganchos do cronograma (módulo opcional): aprendem com cada resposta e avisam a conclusão.
    atual = _atividade_do_usuario(atividade_id) or row
    gancho_cronograma("on_resposta", db, uid, atual, q, bool(resultado["correta"]), int(resultado["pontuacao"]))
    gamificacao = _recompensar(db, uid, atividade_id, final) if final else None
    extra = gancho_cronograma("on_conclusao", db, uid, atual) if final else None

    return jsonify({
        "ok": True,
        "resultado": _resultado_questao(q, respostas[qid]),
        "progresso": prog,
        "final": final,
        "gamificacao": gamificacao,
        "cronograma": extra if isinstance(extra, dict) else None,
    })


def gancho_cronograma(nome, db, uid, atividade_row, *args):
    """Chama `cronograma.on_resposta(db, uid, row, questao, correta, pontuacao)` ou
    `cronograma.on_conclusao(db, uid, row)` se o módulo existir. Nunca derruba a resposta do aluno:
    qualquer falha vira log e o retorno é None."""
    try:
        import cronograma
    except ModuleNotFoundError as e:
        if e.name != "cronograma":
            log.exception("Falha ao importar o módulo cronograma")
        return None
    except Exception:
        log.exception("Falha ao importar o módulo cronograma")
        return None
    fn = getattr(cronograma, nome, None)
    if not callable(fn):
        return None
    try:
        retorno = fn(db, uid, atividade_row, *args)
        db.commit()
        return retorno
    except Exception:
        log.exception("Gancho cronograma.%s falhou (atividade %s)", nome, atividade_row["id"])
        try:
            db.rollback()
        except Exception:
            pass
        return None


def _recompensar(db, uid, atividade_id, final):
    """Integração opcional com gamificacao.py (XP unificado/conquistas). Idempotente
    por (usuário, fonte, ref): refazer a atividade não credita o XP duas vezes."""
    try:
        import gamificacao
    except ImportError:
        return None
    eventos = [("ia_atividade", atividade_id, final["xp_ganho"])]
    if final["nota"] >= 100:
        eventos.append(("ia_perfeita", atividade_id, 0))
    try:
        return gamificacao.recompensar(db, uid, eventos)
    except Exception:  # tabelas ainda não criadas, versão diferente etc.
        db.rollback()
        log.debug("gamificação indisponível", exc_info=True)
        return None


def _corrigir_aberta(db, uid, q, texto, neutro=False) -> tuple[int, str]:
    """Correção por IA; sem IA (ou com erro) dá crédito parcial e mostra o gabarito."""
    teto = max(60, ia.limite_diario() * 8) if ia.limite_diario() > 0 else 400
    if ia.ia_configurada() and _correcoes_hoje(db, uid) < teto:
        try:
            r = ia.corrigir_aberta_ia(q, texto)
            registrar_uso(db, uid, "correcao", modelo=r["modelo"], tokens=r["tokens"])
            return r["nota"], r["feedback"]
        except ia.IAErro as e:
            registrar_uso(db, uid, "correcao", ok=False, erro=e.codigo)
        except Exception:
            log.exception("Erro inesperado corrigindo resposta aberta")
    nota = ia.nota_heuristica(texto, q["gabarito"], q.get("criterios", []))
    if neutro:  # plano do cronograma: sem falar em IA
        return nota, ("Sua resposta foi comparada com o gabarito e recebeu crédito parcial. "
                      "Confira a resposta de referência abaixo.")
    return nota, ("A correção automática por IA não está disponível agora, então você recebeu "
                  "crédito parcial. Compare sua resposta com o gabarito abaixo.")


@bp.route("/<int:atividade_id>/dica", methods=["POST"])
@login_requerido_api
def dica(atividade_id):
    falha = checar_requisicao_json()
    if falha:
        return falha
    row = _atividade_do_usuario(atividade_id)
    if row is None:
        return _erro("Atividade não encontrada.", 404, "nao_encontrada")
    db = get_db()
    atividade = _carregar(row)
    qid = str((request.get_json(silent=True) or {}).get("questao_id", ""))[:20]
    q = next((x for x in atividade["questoes"] if x["id"] == qid), None)
    if q is None:
        return _erro("Questão inválida.", 404, "questao")
    if qid in _respostas(db, atividade_id):
        return _erro("Essa questão já foi respondida.", 409, "ja_respondida")

    texto = q.get("dica") or ""
    if not texto:
        uid = session["uid"]
        if ia.ia_configurada() and _correcoes_hoje(db, uid) < 400:
            try:
                r = ia.gerar_dica_ia(q)
                texto = r["dica"]
                registrar_uso(db, uid, "dica", modelo=r["modelo"], tokens=r["tokens"])
            except ia.IAErro as e:
                registrar_uso(db, uid, "dica", ok=False, erro=e.codigo)
        if not texto:
            texto = "Releia o resumo teórico no topo da página — os conceitos necessários estão lá."
        q["dica"] = texto  # guarda para não gastar outra chamada

    dicas = json.loads(row["dicas_usadas"] or "[]")
    if qid not in dicas:
        dicas.append(qid)
    db.execute(
        "UPDATE ia_atividades SET dicas_usadas = ?, json = ? WHERE id = ?",
        (json.dumps(dicas), json.dumps(atividade, ensure_ascii=False), atividade_id),
    )
    db.commit()
    return jsonify({"ok": True, "dica": texto, "penalidade": 50})


@bp.route("/<int:atividade_id>/refazer", methods=["POST"])
@login_requerido_api
def refazer(atividade_id):
    falha = checar_requisicao_json()
    if falha:
        return falha
    row = _atividade_do_usuario(atividade_id)
    if row is None:
        return _erro("Atividade não encontrada.", 404, "nao_encontrada")
    if row["origem"] == "cronograma":
        return _erro("Esta missão faz parte do seu plano — ela não pode ser refeita.", 409, "plano")
    db = get_db()
    atividade = _carregar(row)
    for q in atividade["questoes"]:  # nova ordem de alternativas/passos
        ia.embaralhar_questao(q)
    db.execute("DELETE FROM ia_respostas WHERE atividade_id = ?", (atividade_id,))
    db.execute(
        "UPDATE ia_atividades SET concluida = 0, nota = NULL, xp_ganho = 0, concluida_em = NULL, "
        "dicas_usadas = '[]', tentativas = tentativas + 1, json = ? WHERE id = ?",
        (json.dumps(atividade, ensure_ascii=False), atividade_id),
    )
    db.commit()
    return jsonify({"ok": True, "url": url_for("ia.ver", atividade_id=atividade_id)})


@bp.route("/<int:atividade_id>/excluir", methods=["POST"])
@login_requerido_api
def excluir(atividade_id):
    falha = checar_requisicao_json()
    if falha:
        return falha
    row = _atividade_do_usuario(atividade_id)
    if row is None:
        return _erro("Atividade não encontrada.", 404, "nao_encontrada")
    if row["origem"] == "cronograma":
        return _erro("Esta missão faz parte do seu plano — ela não pode ser apagada.", 409, "plano")
    db = get_db()
    db.execute("DELETE FROM ia_respostas WHERE atividade_id = ?", (atividade_id,))
    db.execute("DELETE FROM ia_atividades WHERE id = ?", (atividade_id,))
    db.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Painel admin (/painel-allan-dev/ia) — registrado no app como endpoint "admin_ia"
# ---------------------------------------------------------------------------

def admin_ia_view():
    db = get_db()

    def um(sql, params=()):
        return db.execute(sql, params).fetchone()[0]

    numeros = {
        "geracoes_total": um("SELECT COUNT(*) FROM ia_uso WHERE tipo = 'geracao' AND ok = 1"),
        "geracoes_hoje": um(f"SELECT COUNT(*) FROM ia_uso WHERE tipo = 'geracao' AND ok = 1 AND {_HOJE_SQL}"),
        "falhas_hoje": um(f"SELECT COUNT(*) FROM ia_uso WHERE ok = 0 AND {_HOJE_SQL}"),
        "correcoes_total": um("SELECT COUNT(*) FROM ia_uso WHERE tipo = 'correcao' AND ok = 1"),
        "tokens_total": um("SELECT COALESCE(SUM(tokens), 0) FROM ia_uso"),
        "usuarios_ativos": um("SELECT COUNT(DISTINCT usuario_id) FROM ia_uso WHERE tipo = 'geracao' AND ok = 1"),
        "atividades": um("SELECT COUNT(*) FROM ia_atividades"),
        "concluidas": um("SELECT COUNT(*) FROM ia_atividades WHERE concluida = 1"),
        "media_nota": um("SELECT ROUND(AVG(nota)) FROM ia_atividades WHERE concluida = 1"),
        "tempo_medio": um("SELECT ROUND(AVG(duracao_ms) / 1000.0, 1) FROM ia_uso "
                          "WHERE tipo = 'geracao' AND ok = 1 AND duracao_ms > 0"),
    }
    top_temas = db.execute(
        "SELECT MIN(tema) tema, COUNT(*) total FROM ia_uso WHERE tipo = 'geracao' AND ok = 1 AND tema != '' "
        "GROUP BY lower(tema) ORDER BY total DESC, tema LIMIT 10"
    ).fetchall()
    ultimas = db.execute(
        "SELECT a.id, a.tema, a.titulo, a.nivel, a.nota, a.concluida, a.xp_ganho, a.xp_total, "
        "a.modelo, a.criado_em, u.nome, u.email "
        "FROM ia_atividades a JOIN usuarios u ON u.id = a.usuario_id ORDER BY a.id DESC LIMIT 20"
    ).fetchall()
    erros = db.execute(
        "SELECT tipo, erro, COUNT(*) total, MAX(criado_em) ultimo FROM ia_uso WHERE ok = 0 "
        "GROUP BY tipo, erro ORDER BY ultimo DESC LIMIT 8"
    ).fetchall()
    perfil = db.execute("SELECT * FROM perfil WHERE id = 1").fetchone()
    return render_template(
        "admin/ia.html",
        status=ia.status_publico(),
        numeros=numeros,
        top_temas=top_temas,
        ultimas=ultimas,
        erros=erros,
        perfil=perfil,
    )


def registrar_admin(app):
    app.add_url_rule("/painel-allan-dev/ia", endpoint="admin_ia", view_func=admin_ia_view)

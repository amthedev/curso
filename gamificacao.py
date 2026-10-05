"""
Gamificação do curso: XP unificado, níveis, streak, conquistas e ranking.

Tudo vive em `xp_eventos` (um evento por ganho de XP, idempotente por
(usuario, fonte, ref)). O resto é derivado dessa tabela:

  * nível           -> soma de XP
  * streak          -> dias consecutivos (horário de Brasília) com XP > 0
  * conquistas      -> regras sobre as estatísticas; gravadas em `conquistas_usuario`
  * ranking         -> soma de XP por período, só usuários com ranking_publico = 1

As funções aceitam tanto `sqlite3.Row` quanto tuplas (o `init_db` do app usa
uma conexão sem row_factory), por isso todo acesso a colunas é posicional.

Fontes de XP:
  missao           ref "{slug_da_licao}:{id_da_missao}"
  licao_concluida  ref "{slug_da_licao}"            (bônus de +BONUS_LICAO)
  ia_questao       ref "{id_atividade}:{n_questao}"  (use OU ia_atividade, não os dois)
  ia_atividade     ref "{id_atividade}"              (XP final da atividade com IA)
  ia_perfeita      ref "{id_atividade}"  xp=0        (marcador opcional de 100% de acerto,
                                                       alimenta a conquista "perfeccionista")

Cronograma adaptativo (cronograma.py):
  cronograma_dia       ref "YYYY-MM-DD" (dia do plano)   XP por completar as 3 missões do dia
  cronograma_bau       ref "YYYY-MM-DD"                  XP do baú do dia
  cronograma_boss      ref "YYYY-MM-DD"  xp=0            (marcador: boss da semana vencido,
                                                         alimenta "Boss derrotado")
  cronograma_dominado  ref "{slug_do_topico}"  xp=0      (marcador: tópico que chegou a domínio >= 4,
                                                         alimenta "Mente afiada")
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from datetime import date, datetime, timedelta, timezone

BONUS_LICAO = 50
RANKING_CACHE_TTL = 60  # segundos
RANKING_PERIODOS = ("semana", "mes", "geral")

# Nome legível + ícone de cada fonte (o ícone é o id usado em aluno.css/painel).
FONTES = {
    "missao": "Missão",
    "licao_concluida": "Trilha concluída",
    "ia_questao": "Questão com IA",
    "ia_atividade": "Atividade com IA",
    "cronograma_missao": "Missão do plano",
    "cronograma_dia": "Dia do plano",
    "cronograma_bau": "Baú do dia",
}
# eventos de xp=0 que só servem de marcador (alimentam conquistas)
_FONTES_META = {"ia_perfeita", "cronograma_boss", "cronograma_dominado"}
_FONTES_VALIDAS = set(FONTES) | _FONTES_META

# (nome, xp mínimo)
NIVEIS = [
    ("Script Kiddie", 0),
    ("Recruta", 100),
    ("Operador", 300),
    ("Pentester", 700),
    ("Red Teamer", 1500),
    ("Elite", 3000),
]

# Fuso: SQLite grava datetime('now') em UTC; Brasília = UTC-3 (sem horário de verão).
_DIA_BR = "date(criado_em, '-3 hours')"
_MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


# ---------------------------------------------------------------------------
# Datas
# ---------------------------------------------------------------------------

def hoje_br() -> date:
    return (datetime.now(timezone.utc) - timedelta(hours=3)).date()


def _fmt_dia(d: date) -> str:
    return f"{d.day} {_MESES[d.month - 1]}"


# ---------------------------------------------------------------------------
# Schema, registro de XP e backfill
# ---------------------------------------------------------------------------

def _tabela_existe(db, nome: str) -> bool:
    return db.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (nome,)
    ).fetchone() is not None


def _colunas(db, tabela: str) -> set[str]:
    return {r[1] for r in db.execute(f"PRAGMA table_info({tabela})")}


def init_gamificacao_db(db) -> None:
    """Cria tabelas/índices e a coluna usuarios.ranking_publico (idempotente)."""
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS xp_eventos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            fonte TEXT NOT NULL,
            ref TEXT NOT NULL,
            xp INTEGER NOT NULL DEFAULT 0,
            criado_em TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (usuario_id, fonte, ref)
        );
        CREATE INDEX IF NOT EXISTS idx_xp_eventos_usuario_data
            ON xp_eventos (usuario_id, criado_em);

        CREATE TABLE IF NOT EXISTS conquistas_usuario (
            usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            codigo TEXT NOT NULL,
            criado_em TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (usuario_id, codigo)
        );
        """
    )
    if _tabela_existe(db, "usuarios") and "ranking_publico" not in _colunas(db, "usuarios"):
        db.execute("ALTER TABLE usuarios ADD COLUMN ranking_publico INTEGER NOT NULL DEFAULT 1")
    db.commit()


def registrar_xp(db, uid: int, fonte: str, ref, xp: int, commit: bool = True) -> bool:
    """Registra XP uma única vez por (uid, fonte, ref). True se foi um evento novo."""
    if fonte not in _FONTES_VALIDAS:
        raise ValueError(f"fonte de XP desconhecida: {fonte!r}")
    xp = int(xp)
    if xp < 0:
        raise ValueError("xp não pode ser negativo")
    cur = db.execute(
        "INSERT OR IGNORE INTO xp_eventos (usuario_id, fonte, ref, xp) VALUES (?, ?, ?, ?)",
        (uid, fonte, str(ref), xp),
    )
    novo = cur.rowcount == 1
    if commit:
        db.commit()
    return novo


def backfill(db) -> None:
    """
    Popula xp_eventos a partir do que já existia (licao_progresso e ia_atividades).
    Idempotente: pode (e deve) rodar em todo boot.
    """
    if _tabela_existe(db, "licao_progresso") and _tabela_existe(db, "licoes"):
        linhas = db.execute(
            "SELECT p.usuario_id, p.missoes_feitas, p.concluida, p.atualizado_em, "
            "       l.slug, l.missoes "
            "FROM licao_progresso p JOIN licoes l ON l.id = p.licao_id"
        ).fetchall()
        lote = []
        for uid, feitas_raw, concluida, quando, slug, missoes_raw in linhas:
            try:
                xp_por_missao = {m["id"]: int(m.get("xp", 0)) for m in json.loads(missoes_raw or "[]")}
                feitas = json.loads(feitas_raw or "[]")
            except (ValueError, TypeError, KeyError, AttributeError):
                continue
            quando = quando or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            for mid in feitas:
                if mid in xp_por_missao:
                    lote.append((uid, "missao", f"{slug}:{mid}", xp_por_missao[mid], quando))
            if concluida:
                lote.append((uid, "licao_concluida", slug, BONUS_LICAO, quando))
        if lote:
            db.executemany(
                "INSERT OR IGNORE INTO xp_eventos (usuario_id, fonte, ref, xp, criado_em) "
                "VALUES (?, ?, ?, ?, ?)",
                lote,
            )

    _backfill_ia(db)
    db.commit()


def _backfill_ia(db) -> None:
    """Atividades com IA já concluídas (tabela do outro módulo; tolera colunas diferentes)."""
    try:
        if not _tabela_existe(db, "ia_atividades"):
            return
        cols = _colunas(db, "ia_atividades")
        if not {"id", "usuario_id", "xp_ganho"} <= cols:
            return
        quando = "a.criado_em" if "criado_em" in cols else "datetime('now')"
        filtros = ["a.xp_ganho > 0"]
        # Missões do cronograma recebem XP como "cronograma_missao", não como IA.
        if "origem" in cols:
            filtros.append("COALESCE(a.origem, 'livre') != 'cronograma'")
        # Só atividades finalizadas: XP parcial não pode virar evento (ficaria travado).
        if "concluida" in cols:
            filtros.append("a.concluida = 1")
        elif "finalizada" in cols:
            filtros.append("a.finalizada = 1")
        elif "concluida_em" in cols:
            filtros.append("a.concluida_em IS NOT NULL")
        elif "finalizada_em" in cols:
            filtros.append("a.finalizada_em IS NOT NULL")
        elif "status" in cols:
            filtros.append("a.status IN ('concluida', 'finalizada', 'completa', 'done')")
        # Se o XP já foi creditado por questão, não duplica como atividade.
        filtros.append(
            "NOT EXISTS (SELECT 1 FROM xp_eventos q WHERE q.fonte = 'ia_questao' "
            "AND q.usuario_id = a.usuario_id AND q.ref LIKE a.id || ':%')"
        )
        db.execute(
            "INSERT OR IGNORE INTO xp_eventos (usuario_id, fonte, ref, xp, criado_em) "
            f"SELECT a.usuario_id, 'ia_atividade', CAST(a.id AS TEXT), a.xp_ganho, {quando} "
            f"FROM ia_atividades a WHERE {' AND '.join(filtros)}"
        )
    except sqlite3.Error:
        pass


# ---------------------------------------------------------------------------
# Níveis
# ---------------------------------------------------------------------------

def nivel_info(xp: int) -> dict:
    xp = max(0, int(xp or 0))
    idx = max(i for i, (_, minimo) in enumerate(NIVEIS) if xp >= minimo)
    nome, xp_min = NIVEIS[idx]
    prox = NIVEIS[idx + 1] if idx + 1 < len(NIVEIS) else None
    if prox:
        pct = round((xp - xp_min) / (prox[1] - xp_min) * 100, 1)
        faltam = prox[1] - xp
    else:
        pct, faltam = 100.0, 0
    return {
        "indice": idx,
        "numero": idx + 1,
        "total_niveis": len(NIVEIS),
        "nome": nome,
        "xp_min": xp_min,
        "proximo": prox[0] if prox else None,
        "proximo_xp": prox[1] if prox else None,
        "pct": pct,
        "xp_no_nivel": xp - xp_min,
        "xp_faltam": faltam,
        "maximo": prox is None,
    }


# ---------------------------------------------------------------------------
# Estatísticas
# ---------------------------------------------------------------------------

def xp_total(db, uid: int) -> int:
    return db.execute(
        "SELECT COALESCE(SUM(xp), 0) FROM xp_eventos WHERE usuario_id = ?", (uid,)
    ).fetchone()[0]


def calcular_streaks(dias, hoje: date) -> tuple[int, int]:
    """(streak_atual, recorde) a partir de um conjunto de `date` com XP.

    O streak atual continua vivo se o aluno ainda não pontuou hoje mas pontuou ontem.
    """
    dias = set(dias)
    if not dias:
        return 0, 0
    recorde = corrente = 0
    anterior = None
    for d in sorted(dias):
        corrente = corrente + 1 if anterior and d - anterior == timedelta(days=1) else 1
        recorde = max(recorde, corrente)
        anterior = d
    cursor = hoje if hoje in dias else hoje - timedelta(days=1)
    atual = 0
    while cursor in dias:
        atual += 1
        cursor -= timedelta(days=1)
    return atual, max(recorde, atual)


def _nivel_calor(xp: int) -> int:
    if xp <= 0:
        return 0
    if xp < 20:
        return 1
    if xp < 50:
        return 2
    if xp < 100:
        return 3
    return 4


def _heatmap(xp_por_dia: dict, hoje: date, semanas: int = 12) -> dict:
    """Grade semanas x 7 (segunda a domingo), última coluna = semana atual."""
    inicio = hoje - timedelta(days=hoje.weekday()) - timedelta(weeks=semanas - 1)
    colunas, meses, total, ativos = [], [], 0, 0
    mes_anterior = None
    for s in range(semanas):
        col = []
        for i in range(7):
            d = inicio + timedelta(days=s * 7 + i)
            futuro = d > hoje
            xp = 0 if futuro else xp_por_dia.get(d, 0)
            total += xp
            ativos += 1 if xp > 0 else 0
            if futuro:
                titulo = ""
            elif xp:
                titulo = f"{_fmt_dia(d)}: {xp} XP"
            else:
                titulo = f"{_fmt_dia(d)}: sem atividade"
            col.append({
                "data": d.isoformat(),
                "xp": xp,
                "nivel": _nivel_calor(xp),
                "futuro": futuro,
                "hoje": d == hoje,
                "titulo": titulo,
            })
        colunas.append(col)
        primeiro = inicio + timedelta(days=s * 7)
        mes = primeiro.month
        meses.append(_MESES[mes - 1] if mes != mes_anterior else "")
        mes_anterior = mes
    return {"semanas": colunas, "meses": meses, "xp_total": total, "dias_ativos": ativos}


def _titulos_ia(db, ids: list[str]) -> dict:
    """Melhor esforço: título/tema da atividade IA, se a tabela do outro módulo tiver."""
    try:
        if not ids or not _tabela_existe(db, "ia_atividades"):
            return {}
        cols = _colunas(db, "ia_atividades")
        col = next((c for c in ("titulo", "tema", "topico", "assunto") if c in cols), None)
        if not col:
            return {}
        marcas = ",".join("?" * len(ids))
        linhas = db.execute(
            f"SELECT CAST(id AS TEXT), {col} FROM ia_atividades WHERE CAST(id AS TEXT) IN ({marcas})",
            ids,
        ).fetchall()
        return {r[0]: r[1] for r in linhas if r[1]}
    except sqlite3.Error:
        return {}


def _titulos_licoes(db) -> tuple[dict, dict]:
    """({slug: titulo da lição}, {(slug, id_missao): titulo da missão})."""
    licoes, missoes = {}, {}
    try:
        for slug, titulo, missoes_raw in db.execute("SELECT slug, titulo, missoes FROM licoes"):
            licoes[slug] = titulo
            try:
                for m in json.loads(missoes_raw or "[]"):
                    missoes[(slug, m["id"])] = m.get("titulo") or m["id"]
            except (ValueError, TypeError, KeyError):
                pass
    except sqlite3.Error:
        pass
    return licoes, missoes


def _quando_br(criado_em: str, hoje: date) -> dict:
    try:
        dt = datetime.strptime(criado_em, "%Y-%m-%d %H:%M:%S") - timedelta(hours=3)
    except (ValueError, TypeError):
        return {"dia": "", "hora": "", "rel": ""}
    dif = (hoje - dt.date()).days
    if dif <= 0:
        rel = "Hoje"
    elif dif == 1:
        rel = "Ontem"
    elif dif < 7:
        rel = f"{dif} dias atrás"
    else:
        rel = _fmt_dia(dt.date())
    return {"dia": _fmt_dia(dt.date()), "hora": dt.strftime("%H:%M"), "rel": rel}


def _eventos_recentes(db, uid: int, hoje: date, limite: int = 10) -> list[dict]:
    linhas = db.execute(
        "SELECT fonte, ref, xp, criado_em FROM xp_eventos "
        "WHERE usuario_id = ? AND xp > 0 ORDER BY criado_em DESC, id DESC LIMIT ?",
        (uid, limite),
    ).fetchall()
    licoes, missoes = _titulos_licoes(db) if any(r[0] in ("missao", "licao_concluida") for r in linhas) else ({}, {})
    ia_titulos = _titulos_ia(db, [r[1].split(":")[0] for r in linhas
                                  if r[0] in ("ia_atividade", "ia_questao", "cronograma_missao")])

    eventos = []
    for fonte, ref, xp, criado_em in linhas:
        if fonte == "missao":
            slug, _, mid = ref.partition(":")
            titulo = missoes.get((slug, mid)) or f"Missão {mid}"
            detalhe = licoes.get(slug, "")
        elif fonte == "licao_concluida":
            titulo = "Trilha concluída"
            detalhe = licoes.get(ref, ref)
        elif fonte == "ia_atividade":
            titulo = "Atividade com IA concluída"
            detalhe = ia_titulos.get(ref, f"Atividade #{ref}")
        elif fonte == "cronograma_missao":
            titulo = "Missão do plano concluída"
            detalhe = ia_titulos.get(ref, "Cronograma")
        elif fonte == "ia_questao":
            ativ = ref.split(":")[0]
            titulo = "Questão com IA acertada"
            detalhe = ia_titulos.get(ativ, f"Atividade #{ativ}")
        elif fonte in ("cronograma_dia", "cronograma_bau"):
            titulo = "Plano do dia concluído" if fonte == "cronograma_dia" else "Baú do dia aberto"
            try:
                detalhe = f"Cronograma de {_fmt_dia(date.fromisoformat(ref))}"
            except ValueError:
                detalhe = "Cronograma"
        else:
            titulo, detalhe = FONTES.get(fonte, fonte), ""
        eventos.append({
            "fonte": fonte,
            "fonte_nome": FONTES.get(fonte, fonte),
            "xp": xp,
            "titulo": titulo,
            "detalhe": detalhe,
            "criado_em": criado_em,
            **{f"quando_{k}": v for k, v in _quando_br(criado_em, hoje).items()},
        })
    return eventos


def stats(db, uid: int, hoje: date | None = None) -> dict:
    """Tudo que o painel e as conquistas precisam saber sobre um aluno."""
    hoje = hoje or hoje_br()

    por_fonte, contagem = {}, {}
    for fonte, soma, qtd in db.execute(
        "SELECT fonte, COALESCE(SUM(xp), 0), COUNT(*) FROM xp_eventos "
        "WHERE usuario_id = ? GROUP BY fonte",
        (uid,),
    ):
        por_fonte[fonte] = soma
        contagem[fonte] = qtd
    total = sum(por_fonte.values())

    xp_por_dia = {}
    for dia, soma in db.execute(
        f"SELECT {_DIA_BR}, SUM(xp) FROM xp_eventos WHERE usuario_id = ? AND xp > 0 GROUP BY 1",
        (uid,),
    ):
        xp_por_dia[date.fromisoformat(dia)] = soma
    atual, recorde = calcular_streaks(xp_por_dia.keys(), hoje)

    missao_ids = [
        r[0].partition(":")[2]
        for r in db.execute(
            "SELECT ref FROM xp_eventos WHERE usuario_id = ? AND fonte = 'missao'", (uid,)
        )
    ]

    # Cronograma: dias do plano concluídos (ref = "YYYY-MM-DD") -> maior sequência seguida.
    dias_plano = set()
    for (ref,) in db.execute(
        "SELECT ref FROM xp_eventos WHERE usuario_id = ? AND fonte = 'cronograma_dia'", (uid,)
    ):
        try:
            dias_plano.add(date.fromisoformat(ref))
        except ValueError:
            pass
    plano_atual, plano_recorde = calcular_streaks(dias_plano, hoje)

    return {
        "xp_total": total,
        "nivel": nivel_info(total),
        "streak_atual": atual,
        "streak_recorde": recorde,
        "streak_ativo_hoje": hoje in xp_por_dia,
        "xp_hoje": xp_por_dia.get(hoje, 0),
        "xp_por_fonte": {f: por_fonte.get(f, 0) for f in FONTES},
        "n_missoes": contagem.get("missao", 0),
        "n_trilhas": contagem.get("licao_concluida", 0),
        "n_ia": contagem.get("ia_atividade", 0),
        "n_ia_questoes": contagem.get("ia_questao", 0),
        "n_ia_perfeitas": contagem.get("ia_perfeita", 0),
        "n_plano_dias": contagem.get("cronograma_dia", 0),
        "plano_streak_atual": plano_atual,
        "plano_streak_recorde": plano_recorde,
        "n_plano_boss": contagem.get("cronograma_boss", 0),
        "n_plano_dominados": contagem.get("cronograma_dominado", 0),
        "missao_ids": missao_ids,
        "heatmap": _heatmap(xp_por_dia, hoje),
        "eventos_recentes": _eventos_recentes(db, uid, hoje),
    }


# ---------------------------------------------------------------------------
# Conquistas
# ---------------------------------------------------------------------------

def _svg(corpo: str) -> str:
    return (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
        f"{corpo}</svg>"
    )


_ICO_GOTA = _svg('<path d="M12 3c3.6 4.3 6 7.2 6 10.4A6 6 0 0 1 6 13.4C6 10.2 8.4 7.3 12 3z"/>'
                 '<path d="M9.5 14.5a2.8 2.8 0 0 0 2.5 1.8"/>')
_ICO_BANDEIRA = _svg('<path d="M5 21V4"/><path d="M5 4.5h12l-2.5 4 2.5 4H5"/>')
_ICO_TRILHA = _svg('<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/>'
                   '<path d="M8.2 18H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.8"/>')
_ICO_CHAMA = _svg('<path d="M12 2.5c.8 3.2 4.5 4.8 4.5 9.2a4.5 4.5 0 0 1-9 0c0-1.8.9-3 2-4.1'
                  '.2 1.3.9 2 1.7 2.2C10.6 8.8 10.4 5.5 12 2.5z"/>')
_ICO_RAIO = _svg('<path d="M13 2 4.5 13.5H11L10 22l9-12h-6.5L13 2z"/>')
_ICO_GEMA = _svg('<path d="M6.5 3h11l4 5.5L12 21 2.5 8.5l4-5.5z"/><path d="M2.5 8.5h19M9 3l3 5.5L15 3M12 8.5V21"/>')
_ICO_CHIP = _svg('<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M10 10.5h4v3h-4z"/>'
                 '<path d="M9.5 2.5v4M14.5 2.5v4M9.5 17.5v4M14.5 17.5v4M2.5 9.5h4M2.5 14.5h4M17.5 9.5h4M17.5 14.5h4"/>')
_ICO_BRILHO = _svg('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/>'
                   '<path d="M19 16v4M17 18h4M5 17v3M3.5 18.5h3"/>')
_ICO_ALVO = _svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>')
_ICO_CALENDARIO = _svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'
                       '<path d="m9 15 2.2 2.2L15.5 13"/>')
_ICO_ESTRELA = _svg('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/>')
_ICO_COROA = _svg('<path d="M3.5 19h17"/><path d="M4.5 8l4.2 4L12 5.5 15.3 12l4.2-4L18 17.5H6L4.5 8z"/>')
_ICO_LAMPADA = _svg('<path d="M9 18h6M10 21h4"/>'
                    '<path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2v.1h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>')


def _prog(chave: str, meta: int):
    return lambda s: (min(s[chave], meta), meta)


CONQUISTAS = [
    {
        "codigo": "primeiro_sangue", "nome": "Primeiro sangue", "icone": _ICO_GOTA, "tier": "bronze",
        "desc": "Complete sua primeira missão no terminal.",
        "check": lambda s: s["n_missoes"] >= 1, "progresso": _prog("n_missoes", 1),
    },
    {
        "codigo": "cacador_de_flags", "nome": "Caçador de flags", "icone": _ICO_BANDEIRA, "tier": "prata",
        "desc": "Capture uma flag escondida no laboratório.",
        "check": lambda s: "flag" in s["missao_ids"], "progresso": None,
    },
    {
        "codigo": "trilha_completa", "nome": "Trilha completa", "icone": _ICO_TRILHA, "tier": "prata",
        "desc": "Conclua todas as missões de uma trilha.",
        "check": lambda s: s["n_trilhas"] >= 1, "progresso": _prog("n_trilhas", 1),
    },
    {
        "codigo": "streak_3", "nome": "Aquecendo", "icone": _ICO_CHAMA, "tier": "bronze",
        "desc": "Pontue 3 dias seguidos.",
        "check": lambda s: s["streak_recorde"] >= 3, "progresso": _prog("streak_recorde", 3),
    },
    {
        "codigo": "streak_7", "nome": "Em chamas", "icone": _ICO_CHAMA, "tier": "prata",
        "desc": "Pontue 7 dias seguidos.",
        "check": lambda s: s["streak_recorde"] >= 7, "progresso": _prog("streak_recorde", 7),
    },
    {
        "codigo": "streak_30", "nome": "Imparável", "icone": _ICO_CHAMA, "tier": "ouro",
        "desc": "Pontue 30 dias seguidos.",
        "check": lambda s: s["streak_recorde"] >= 30, "progresso": _prog("streak_recorde", 30),
    },
    {
        "codigo": "xp_500", "nome": "500 XP", "icone": _ICO_RAIO, "tier": "prata",
        "desc": "Acumule 500 XP.",
        "check": lambda s: s["xp_total"] >= 500, "progresso": _prog("xp_total", 500),
    },
    {
        "codigo": "xp_2000", "nome": "2.000 XP", "icone": _ICO_GEMA, "tier": "ouro",
        "desc": "Acumule 2.000 XP.",
        "check": lambda s: s["xp_total"] >= 2000, "progresso": _prog("xp_total", 2000),
    },
    {
        "codigo": "ia_1", "nome": "Treino com IA", "icone": _ICO_CHIP, "tier": "bronze",
        "desc": "Conclua uma atividade gerada por IA.",
        "check": lambda s: s["n_ia"] >= 1, "progresso": _prog("n_ia", 1),
    },
    {
        "codigo": "ia_5", "nome": "Veterano da IA", "icone": _ICO_BRILHO, "tier": "ouro",
        "desc": "Conclua 5 atividades geradas por IA.",
        "check": lambda s: s["n_ia"] >= 5, "progresso": _prog("n_ia", 5),
    },
    {
        "codigo": "perfeccionista", "nome": "Perfeccionista", "icone": _ICO_ALVO, "tier": "ouro",
        "desc": "Acerte 100% de uma atividade com IA.",
        "check": lambda s: s["n_ia_perfeitas"] >= 1, "progresso": _prog("n_ia_perfeitas", 1),
    },
    # --- Cronograma adaptativo (plano diário) ---
    {
        "codigo": "primeiro_treino", "nome": "Primeiro treino", "icone": _ICO_CALENDARIO, "tier": "bronze",
        "desc": "Complete as 3 missões do seu plano do dia pela primeira vez.",
        "check": lambda s: s["n_plano_dias"] >= 1, "progresso": _prog("n_plano_dias", 1),
    },
    {
        "codigo": "semana_perfeita", "nome": "Semana perfeita", "icone": _ICO_ESTRELA, "tier": "ouro",
        "desc": "Complete o plano do dia 7 dias seguidos.",
        "check": lambda s: s["plano_streak_recorde"] >= 7, "progresso": _prog("plano_streak_recorde", 7),
    },
    {
        "codigo": "boss_derrotado", "nome": "Boss derrotado", "icone": _ICO_COROA, "tier": "prata",
        "desc": "Derrote o boss da semana (domingo) com 60% de acerto ou mais.",
        "check": lambda s: s["n_plano_boss"] >= 1, "progresso": _prog("n_plano_boss", 1),
    },
    {
        "codigo": "mente_afiada", "nome": "Mente afiada", "icone": _ICO_LAMPADA, "tier": "ouro",
        "desc": "Domine 10 tópicos da ementa no seu plano.",
        "check": lambda s: s["n_plano_dominados"] >= 10, "progresso": _prog("n_plano_dominados", 10),
    },
]
_CONQUISTAS_POR_CODIGO = {c["codigo"]: c for c in CONQUISTAS}


def _conquista_publica(c: dict) -> dict:
    """Versão serializável (sem lambdas) para JSON/toasts."""
    return {"codigo": c["codigo"], "nome": c["nome"], "icone": c["icone"],
            "desc": c["desc"], "tier": c["tier"]}


def avaliar_conquistas(db, uid: int, st: dict | None = None) -> list[dict]:
    """Grava as conquistas recém-atingidas e devolve só as novas."""
    st = st or stats(db, uid)
    ja = {r[0] for r in db.execute(
        "SELECT codigo FROM conquistas_usuario WHERE usuario_id = ?", (uid,))}
    novas = []
    for c in CONQUISTAS:
        if c["codigo"] in ja:
            continue
        try:
            ok = bool(c["check"](st))
        except (KeyError, TypeError):
            ok = False
        if ok:
            cur = db.execute(
                "INSERT OR IGNORE INTO conquistas_usuario (usuario_id, codigo) VALUES (?, ?)",
                (uid, c["codigo"]),
            )
            if cur.rowcount == 1:
                novas.append(_conquista_publica(c))
    if novas:
        db.commit()
    return novas


def conquistas_status(db, uid: int, st: dict, novas_codigos=()) -> list[dict]:
    """Todas as conquistas com estado de desbloqueio (para o painel)."""
    ganhas = {r[0]: r[1] for r in db.execute(
        "SELECT codigo, criado_em FROM conquistas_usuario WHERE usuario_id = ?", (uid,))}
    hoje = hoje_br()
    saida = []
    for c in CONQUISTAS:
        item = _conquista_publica(c)
        item["desbloqueada"] = c["codigo"] in ganhas
        item["nova"] = c["codigo"] in novas_codigos
        item["quando"] = _quando_br(ganhas[c["codigo"]], hoje)["dia"] if item["desbloqueada"] else ""
        atual, meta = (c["progresso"](st) if c["progresso"] else (0, 0))
        item["progresso"] = atual
        item["meta"] = meta
        item["pct"] = round(atual / meta * 100) if meta else 0
        saida.append(item)
    return saida


# ---------------------------------------------------------------------------
# Recompensa (ponto único de integração)
# ---------------------------------------------------------------------------

def recompensar(db, uid: int, eventos) -> dict:
    """
    Registra uma lista de (fonte, ref, xp), avalia conquistas e devolve um dict
    pronto para mesclar no JSON de resposta da rota.

        recompensar(db, uid, [("missao", "slug:whoami", 10), ("licao_concluida", "slug", 50)])
    """
    antes = xp_total(db, uid)
    ganho = 0
    for fonte, ref, xp in eventos:
        if registrar_xp(db, uid, fonte, ref, xp, commit=False):
            ganho += int(xp)
    db.commit()

    st = stats(db, uid)
    novas = avaliar_conquistas(db, uid, st)
    nivel_antes = nivel_info(antes)
    return {
        "xp_ganho_agora": ganho,
        "xp_total_usuario": st["xp_total"],
        "nivel": st["nivel"]["nome"],
        "nivel_pct": st["nivel"]["pct"],
        "subiu_nivel": st["nivel"]["indice"] > nivel_antes["indice"],
        "streak": st["streak_atual"],
        "novas_conquistas": novas,
    }


# ---------------------------------------------------------------------------
# Ranking
# ---------------------------------------------------------------------------

_cache: dict[str, tuple[float, list]] = {}
_cache_lock = threading.Lock()


def limpar_cache() -> None:
    with _cache_lock:
        _cache.clear()


def nome_publico(nome: str) -> str:
    """'Allan Dev Junior' -> 'Allan J.'; 'Maria' -> 'Maria'. Nunca expõe o email."""
    partes = (nome or "").split()
    if not partes:
        return "Aluno"
    primeiro = partes[0][:1].upper() + partes[0][1:]
    if len(partes) == 1:
        return primeiro
    return f"{primeiro} {partes[-1][0].upper()}."


def periodo_inicio(periodo: str, hoje: date | None = None) -> date | None:
    """Primeiro dia (Brasília) do período. Semana começa na segunda."""
    hoje = hoje or hoje_br()
    if periodo == "semana":
        return hoje - timedelta(days=hoje.weekday())
    if periodo == "mes":
        return hoje.replace(day=1)
    return None


def periodo_rotulo(periodo: str, hoje: date | None = None) -> str:
    hoje = hoje or hoje_br()
    ini = periodo_inicio(periodo, hoje)
    if periodo == "semana":
        return f"{_fmt_dia(ini)} a {_fmt_dia(ini + timedelta(days=6))}"
    if periodo == "mes":
        return f"{_MESES[hoje.month - 1]} de {hoje.year}"
    return "Desde o início"


def _ranking_completo(db, periodo: str) -> list[dict]:
    if periodo not in RANKING_PERIODOS:
        periodo = "geral"
    agora = time.monotonic()
    with _cache_lock:
        item = _cache.get(periodo)
        if item and agora - item[0] < RANKING_CACHE_TTL:
            return item[1]

    ini = periodo_inicio(periodo)
    filtro, params = "", []
    if ini:
        filtro = f"AND {_DIA_BR.replace('criado_em', 'e.criado_em')} >= ?"
        params.append(ini.isoformat())
    # Empate: quem chegou primeiro ao total (último XP mais antigo) fica na frente.
    linhas = db.execute(
        f"""
        SELECT u.id, u.nome, SUM(e.xp) AS xp,
               (SELECT COALESCE(SUM(t.xp), 0) FROM xp_eventos t WHERE t.usuario_id = u.id) AS xp_total
        FROM xp_eventos e
        JOIN usuarios u ON u.id = e.usuario_id
        WHERE u.ranking_publico = 1 AND e.xp > 0 {filtro}
        GROUP BY u.id
        HAVING SUM(e.xp) > 0
        ORDER BY xp DESC, MAX(e.criado_em) ASC, u.id ASC
        """,
        params,
    ).fetchall()

    lista = []
    for pos, (uid, nome, xp, xp_tot) in enumerate(linhas, start=1):
        nv = nivel_info(xp_tot)
        lista.append({
            "posicao": pos,
            "usuario_id": uid,  # só para destacar "você" no servidor; não serializar
            "nome": nome_publico(nome),
            "inicial": (nome or "?").strip()[:1].upper() or "?",
            "xp": xp,
            "xp_total": xp_tot,
            "nivel": nv["nome"],
            "nivel_indice": nv["indice"],
        })
    with _cache_lock:
        _cache[periodo] = (agora, lista)
    return lista


def ranking(db, periodo: str = "geral", limite: int = 50) -> list[dict]:
    return _ranking_completo(db, periodo)[:limite]


def posicao_usuario(db, uid: int, periodo: str = "geral") -> dict | None:
    """Posição do aluno ou None (oculto do ranking ou sem XP no período)."""
    lista = _ranking_completo(db, periodo)
    for i, item in enumerate(lista):
        if item["usuario_id"] == uid:
            anterior = lista[i - 1] if i > 0 else None
            return {
                "posicao": item["posicao"],
                "xp": item["xp"],
                "xp_total": item["xp_total"],
                "nome": item["nome"],
                "inicial": item["inicial"],
                "nivel": item["nivel"],
                "nivel_indice": item["nivel_indice"],
                "participantes": len(lista),
                "faltam_para_subir": (anterior["xp"] - item["xp"] + 1) if anterior else 0,
            }
    return None


def ranking_publico(db, uid: int) -> bool:
    row = db.execute("SELECT ranking_publico FROM usuarios WHERE id = ?", (uid,)).fetchone()
    return bool(row[0]) if row else False


def definir_ranking_publico(db, uid: int, publico: bool) -> None:
    db.execute("UPDATE usuarios SET ranking_publico = ? WHERE id = ?", (1 if publico else 0, uid))
    db.commit()
    limpar_cache()

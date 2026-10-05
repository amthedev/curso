"""
Blog de cyber segurança ofensiva — Allan Dev
Flask + SQLite. Acesso ao conteúdo exige cadastro/login.
Admin fica em rota separada, não listada na navegação — sem senha por padrão;
só exige login se ADMIN_EMAILS estiver definida (ver .env.example).

Executar:
    python3 app.py
Sobe em 0.0.0.0:80 por padrão (ou na porta que a plataforma definir
via variável de ambiente PORT — ex: Square Cloud).
"""
import json
import os
import re
import sqlite3
import unicodedata
from datetime import datetime, timedelta
from urllib.parse import urlparse

from flask import (Flask, Response, abort, flash, jsonify, make_response, redirect,
                   render_template, request, session, url_for)
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import generate_password_hash, check_password_hash

from core import (DB_PATH, LimitadorTentativas, SECRET_KEY_FILE, carregar_secret_key,
                  close_db, get_db, login_requerido)
from ia_routes import bp as ia_bp, init_ia_db, registrar_admin as registrar_admin_ia, resumo_ia_usuario
import gamificacao as gami
from aluno_routes import bp as aluno_bp
from tutor_routes import bp as tutor_bp, init_tutor_db
from cronograma import init_cronograma_db
from cronograma_routes import bp as cronograma_bp

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Configuração de segurança (variáveis de ambiente documentadas em .env.example)
# ---------------------------------------------------------------------------

def _env_ligada(nome: str) -> bool:
    return os.environ.get(nome, "").strip().lower() in {"1", "true", "yes", "on", "sim"}


# SECRET_KEY: env > instance/secret_key (gerada e persistida) > memória.
# Nunca existe um valor padrão fixo no código (permitiria forjar cookies de sessão).
app.secret_key, _secret_origem = carregar_secret_key()
if _secret_origem == "arquivo-novo":
    app.logger.warning(
        "SECRET_KEY não definida: gerei uma chave aleatória e salvei em %s (0600). "
        "Defina SECRET_KEY no ambiente para controlá-la.", SECRET_KEY_FILE)
elif _secret_origem == "arquivo":
    app.logger.warning(
        "SECRET_KEY não definida: usando a chave persistida em %s. "
        "Defina SECRET_KEY no ambiente para controlá-la.", SECRET_KEY_FILE)
elif _secret_origem == "memoria":
    app.logger.warning(
        "SECRET_KEY não definida e não consegui gravar %s: chave só em memória — "
        "as sessões caem a cada reinício. Defina SECRET_KEY no ambiente.", SECRET_KEY_FILE)
elif _secret_origem == "env-invalida":
    app.logger.warning(
        "SECRET_KEY está com o valor de exemplo (público) e foi IGNORADA. "
        "Defina uma chave aleatória própria.")

app.permanent_session_lifetime = timedelta(days=30)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    # Secure só com HTTPS=1: em http:// o navegador não devolveria o cookie.
    SESSION_COOKIE_SECURE=_env_ligada("HTTPS"),
)

# Atrás do proxy da plataforma: TRUST_PROXY=1 (nº de proxies confiáveis) faz o app
# enxergar IP/host/esquema reais via X-Forwarded-*. Só ligue se houver mesmo um proxy
# na frente — senão qualquer cliente forja o IP e burla o limite de tentativas.
_trust_proxy = os.environ.get("TRUST_PROXY", "").strip().lower()
_proxy_hops = int(_trust_proxy) if _trust_proxy.isdigit() else (1 if _env_ligada("TRUST_PROXY") else 0)
if _proxy_hops > 0:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=_proxy_hops, x_proto=_proxy_hops,
                            x_host=_proxy_hops)

# Painel admin: aberto por padrão (decisão do dono). Com ADMIN_EMAILS definida
# (emails separados por vírgula), só usuários logados nessa lista entram.
ADMIN_PREFIXO = "/painel-allan-dev"
ADMIN_EMAILS = frozenset(
    e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()
)
ADMIN_PROTEGIDO = bool(ADMIN_EMAILS)
if ADMIN_PROTEGIDO:
    app.logger.info("Admin protegido: %d email(s) em ADMIN_EMAILS.", len(ADMIN_EMAILS))
else:
    app.logger.warning(
        "ADMIN_EMAILS não definida: %s está ABERTO, sem senha. Defina ADMIN_EMAILS "
        "(emails separados por vírgula) para exigir login de admin.", ADMIN_PREFIXO)

# Limites de tentativas (em memória, por processo).
LOGIN_MAX_FALHAS = 5          # falhas por (IP, email) ...
LOGIN_JANELA = 15 * 60        # ... a cada 15 minutos
_cad_env = os.environ.get("CADASTRO_MAX_POR_HORA", "").strip()
CADASTRO_MAX = int(_cad_env) if _cad_env.isdigit() and int(_cad_env) > 0 else 10
CADASTRO_JANELA = 60 * 60
_limite_login = LimitadorTentativas(LOGIN_MAX_FALHAS, LOGIN_JANELA)
_limite_cadastro = LimitadorTentativas(CADASTRO_MAX, CADASTRO_JANELA)
MSG_MUITAS_TENTATIVAS = "Muitas tentativas. Tente de novo em alguns minutos."

app.teardown_appcontext(close_db)
app.register_blueprint(ia_bp)
registrar_admin_ia(app)  # /painel-allan-dev/ia  (endpoint "admin_ia")
app.register_blueprint(aluno_bp)  # /eu, /ranking, /api/eu/stats
app.register_blueprint(tutor_bp)  # /tutor/perguntar, /tutor/historico ("Travei?" do laboratório)
app.register_blueprint(cronograma_bp)  # /cronograma/ (plano diário adaptativo)


# ---------------------------------------------------------------------------
# Hooks globais de segurança
# ---------------------------------------------------------------------------

def _sem_porta_padrao(host: str) -> str:
    host = (host or "").strip().lower()
    for sufixo in (":80", ":443"):
        if host.endswith(sufixo):
            return host[: -len(sufixo)]
    return host


def _hosts_permitidos() -> set[str]:
    """Hosts que contam como 'mesma origem' (atrás de proxy o Host pode variar)."""
    hosts = {request.host}
    hosts.add(request.environ.get("HTTP_HOST", ""))
    hosts.add(request.environ.get("werkzeug.proxy_fix.orig", {}).get("HTTP_HOST", ""))
    fwd = request.headers.get("X-Forwarded-Host", "")
    if fwd:
        hosts.add(fwd.split(",")[0])
    site = os.environ.get("SITE_URL", "").strip()
    if site:
        hosts.add(urlparse(site if "//" in site else "//" + site).netloc)
    return {_sem_porta_padrao(h) for h in hosts if h}


@app.before_request
def _csrf_mesma_origem():
    """CSRF leve, sem token: POST/PUT/PATCH/DELETE com Origin (ou Referer) de
    outro host são recusados. Sem nenhum dos dois, passa (clientes não-navegador)."""
    if request.method not in ("POST", "PUT", "PATCH", "DELETE"):
        return None
    origem = request.headers.get("Origin") or request.headers.get("Referer")
    if not origem:
        return None
    if _sem_porta_padrao(urlparse(origem).netloc) in _hosts_permitidos():
        return None
    app.logger.warning("CSRF: %s %s bloqueado (origem=%r)", request.method, request.path, origem[:200])
    if request.is_json or request.accept_mimetypes.best == "application/json":
        return jsonify({"ok": False, "erro": "Origem não permitida.", "codigo": "origem"}), 403
    return Response("403 — Requisição bloqueada: origem não permitida.", 403,
                    mimetype="text/plain")


@app.before_request
def _proteger_admin():
    """Opt-in: com ADMIN_EMAILS definida, /painel-allan-dev* só para admins (senão 404)."""
    if not ADMIN_PROTEGIDO:
        return None
    if not (request.path.startswith(ADMIN_PREFIXO)
            or (request.endpoint or "").startswith("admin_")):
        return None
    usuario = get_usuario_atual()
    if usuario is None or usuario["email"].strip().lower() not in ADMIN_EMAILS:
        abort(404)
    return None


@app.after_request
def _headers_seguranca(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    # TODO (futuro): Content-Security-Policy. Hoje NÃO há CSP porque o site usa
    # <script>/<style> inline e Google Fonts (fonts.googleapis.com / fonts.gstatic.com);
    # uma CSP restritiva agora quebraria as páginas. Caminho sugerido: mover os scripts
    # inline para static/js, usar nonce nos que restarem e então aplicar algo como
    #   default-src 'self'; style-src 'self' https://fonts.googleapis.com;
    #   font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'
    # (começando em modo Content-Security-Policy-Report-Only).
    return resp


# ---------------------------------------------------------------------------
# Banco de dados
# ---------------------------------------------------------------------------

def init_db():
    fresh = not DB_PATH.exists()
    db = sqlite3.connect(DB_PATH, timeout=10)
    try:
        # WAL: leitores não bloqueiam o escritor (e vice-versa). Persiste no arquivo
        # do banco, então basta ativar aqui. Chamadas de IA são lentas — sem WAL
        # uma gravação longa travaria o site inteiro.
        db.execute("PRAGMA journal_mode=WAL")
    except sqlite3.DatabaseError as exc:  # ex.: sistema de arquivos sem suporte a WAL
        app.logger.warning("Não foi possível ativar o modo WAL no SQLite: %s", exc)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS perfil (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            nome TEXT NOT NULL,
            titulo TEXT NOT NULL DEFAULT '',
            bio TEXT NOT NULL DEFAULT '',
            email TEXT NOT NULL DEFAULT '',
            local TEXT NOT NULL DEFAULT '',
            avatar TEXT NOT NULL DEFAULT 'AD'
        );

        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            categoria TEXT NOT NULL DEFAULT 'Geral',
            tags TEXT NOT NULL DEFAULT '',
            resumo TEXT NOT NULL DEFAULT '',
            corpo TEXT NOT NULL DEFAULT '',
            nivel TEXT NOT NULL DEFAULT 'Intermediário',
            autor TEXT NOT NULL DEFAULT 'Allan Dev',
            data_publicacao TEXT NOT NULL,
            criado_em TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS atividades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            descricao TEXT NOT NULL,
            criado_em TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            senha_hash TEXT NOT NULL,
            criado_em TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS licoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            descricao TEXT NOT NULL DEFAULT '',
            nivel TEXT NOT NULL DEFAULT 'Iniciante',
            conteudo TEXT NOT NULL DEFAULT '',
            missoes TEXT NOT NULL DEFAULT '[]',
            ordem INTEGER NOT NULL DEFAULT 0,
            criado_em TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS licao_progresso (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
            licao_id INTEGER NOT NULL REFERENCES licoes(id),
            leitura_ok INTEGER NOT NULL DEFAULT 0,
            missoes_feitas TEXT NOT NULL DEFAULT '[]',
            concluida INTEGER NOT NULL DEFAULT 0,
            atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (usuario_id, licao_id)
        );
        """
    )
    db.commit()

    if fresh:
        _seed(db)
    _seed_licoes(db)
    init_ia_db(db)
    init_cronograma_db(db)  # cronograma adaptativo (usa usuarios e ia_atividades)
    init_tutor_db(db)  # chat do tutor "Travei?" (usa ia_uso, criada acima)
    gami.init_gamificacao_db(db)  # depois de usuarios/licoes/ia_*
    gami.backfill(db)             # idempotente: converte progresso antigo em xp_eventos
    db.close()


def slugify(titulo: str) -> str:
    txt = unicodedata.normalize("NFKD", titulo).encode("ascii", "ignore").decode()
    txt = re.sub(r"[^a-zA-Z0-9]+", "-", txt).strip("-").lower()
    return txt


def _seed(db: sqlite3.Connection):
    from seed_data import SEED_PERFIL, SEED_POSTS

    db.execute(
        "INSERT INTO perfil (id, nome, titulo, bio, email, local, avatar) "
        "VALUES (1, ?, ?, ?, ?, ?, ?)",
        (
            SEED_PERFIL["nome"],
            SEED_PERFIL["titulo"],
            SEED_PERFIL["bio"],
            SEED_PERFIL["email"],
            SEED_PERFIL["local"],
            SEED_PERFIL["avatar"],
        ),
    )

    usados = set()
    for post in SEED_POSTS:
        base = slugify(post["titulo"])
        slug = base
        i = 2
        while slug in usados:
            slug = f"{base}-{i}"
            i += 1
        usados.add(slug)

        db.execute(
            "INSERT INTO posts (titulo, slug, categoria, tags, resumo, corpo, nivel, autor, data_publicacao) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, 'Allan Dev', ?)",
            (
                post["titulo"],
                slug,
                post["categoria"],
                ",".join(post["tags"]),
                post["resumo"],
                post["corpo"],
                post.get("nivel", "Intermediário"),
                post["data"],
            ),
        )
    db.commit()


def _seed_licoes(db: sqlite3.Connection):
    """Garante que as licoes padrao existam (roda sempre, sem duplicar)."""
    from licoes_data import SEED_LICOES

    for licao in SEED_LICOES:
        db.execute(
            """
            INSERT INTO licoes (titulo, slug, descricao, nivel, conteudo, missoes, ordem)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(slug) DO UPDATE SET
                titulo = excluded.titulo,
                descricao = excluded.descricao,
                nivel = excluded.nivel,
                conteudo = excluded.conteudo,
                missoes = excluded.missoes,
                ordem = excluded.ordem
            """,
            (
                licao["titulo"],
                licao["slug"],
                licao["descricao"],
                licao["nivel"],
                licao["conteudo"],
                json.dumps(licao["missoes"], ensure_ascii=False),
                licao.get("ordem", 0),
            ),
        )
    db.commit()


# ---------------------------------------------------------------------------
# Helpers de template
# ---------------------------------------------------------------------------

@app.template_filter("data_br")
def data_br(iso: str) -> str:
    try:
        d = datetime.strptime(iso, "%Y-%m-%d")
        meses = ["jan", "fev", "mar", "abr", "mai", "jun",
                 "jul", "ago", "set", "out", "nov", "dez"]
        return f"{d.day} {meses[d.month - 1]} {d.year}"
    except ValueError:
        return iso


@app.template_filter("tempo_leitura")
def tempo_leitura(corpo: str) -> int:
    palavras = len(corpo.split())
    return max(1, round(palavras / 200))


def get_perfil():
    db = get_db()
    row = db.execute("SELECT * FROM perfil WHERE id = 1").fetchone()
    return row


def get_usuario_atual():
    uid = session.get("uid")
    if not uid:
        return None
    db = get_db()
    return db.execute("SELECT * FROM usuarios WHERE id = ?", (uid,)).fetchone()


@app.context_processor
def inject_globals():
    # admin_protegido: True quando ADMIN_EMAILS está definida (o template do admin
    # pode mostrar o status: protegido por login vs. aberto).
    return {"usuario_atual": get_usuario_atual(), "admin_protegido": ADMIN_PROTEGIDO}


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def registrar_atividade(db, descricao: str):
    db.execute("INSERT INTO atividades (descricao) VALUES (?)", (descricao,))


# ---------------------------------------------------------------------------
# Autenticação de usuários
# ---------------------------------------------------------------------------

@app.route("/cadastro", methods=["GET", "POST"])
def cadastro():
    if session.get("uid"):
        return redirect(url_for("index"))

    if request.method == "POST":
        nome = request.form.get("nome", "").strip()
        email = request.form.get("email", "").strip().lower()
        senha = request.form.get("senha", "")
        confirmar = request.form.get("confirmar", "")

        # Limite leve por IP (anti-spam de contas / enumeração de emails).
        ip = request.remote_addr or "desconhecido"
        espera = _limite_cadastro.restante(ip)
        if espera:
            flash(MSG_MUITAS_TENTATIVAS, "erro")
            resp = make_response(render_template("auth/cadastro.html", nome=nome, email=email), 429)
            resp.headers["Retry-After"] = str(espera)
            return resp
        _limite_cadastro.registrar(ip)

        erro = None
        if not nome or len(nome) < 2:
            erro = "Informe seu nome."
        elif not EMAIL_RE.match(email):
            erro = "Email inválido."
        elif len(senha) < 8:
            erro = "A senha precisa ter no mínimo 8 caracteres."
        elif senha != confirmar:
            erro = "As senhas não conferem."

        db = get_db()
        if not erro and db.execute("SELECT 1 FROM usuarios WHERE email = ?", (email,)).fetchone():
            erro = "Já existe uma conta com esse email."

        if erro:
            flash(erro, "erro")
            return render_template("auth/cadastro.html", nome=nome, email=email)

        senha_hash = generate_password_hash(senha)
        cur = db.execute(
            "INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)",
            (nome, email, senha_hash),
        )
        db.commit()

        session.permanent = True
        session["uid"] = cur.lastrowid
        return redirect(url_for("index"))

    return render_template("auth/cadastro.html", nome="", email="")


def _destino_seguro(valor) -> str:
    """Só aceita caminhos locais: começa com '/', mas não com '//' nem '/\\'
    (que o navegador trata como URL de outro site). Qualquer outra coisa vira '/'."""
    if (isinstance(valor, str)
            and valor.startswith("/")
            and not valor.startswith(("//", "/\\"))
            and "\\" not in valor
            and not any(ord(c) < 32 or ord(c) == 127 for c in valor)  # \t, \n... o navegador os remove
            and not urlparse(valor).netloc):
        return valor
    return url_for("index")


@app.route("/login", methods=["GET", "POST"])
def login():
    if session.get("uid"):
        return redirect(url_for("index"))

    # Já sanitizado: o valor também volta para o template (campo hidden).
    proximo = _destino_seguro(request.args.get("proximo") or request.form.get("proximo"))

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        senha = request.form.get("senha", "")

        # Força bruta: no máx. LOGIN_MAX_FALHAS falhas por (IP, email) em 15 min.
        # Checa ANTES de validar a senha, então bloqueado nem com a senha certa entra.
        chave = f"{request.remote_addr or 'desconhecido'}|{email[:254]}"
        espera = _limite_login.restante(chave)
        if espera:
            flash(MSG_MUITAS_TENTATIVAS, "erro")
            resp = make_response(render_template("auth/login.html", email=email, proximo=proximo), 429)
            resp.headers["Retry-After"] = str(espera)
            return resp

        db = get_db()
        usuario = db.execute("SELECT * FROM usuarios WHERE email = ?", (email,)).fetchone()

        if usuario and check_password_hash(usuario["senha_hash"], senha):
            _limite_login.limpar(chave)
            session.permanent = True
            session["uid"] = usuario["id"]
            return redirect(proximo)

        _limite_login.registrar(chave)
        flash("Email ou senha inválidos.", "erro")
        return render_template("auth/login.html", email=email, proximo=proximo)

    return render_template("auth/login.html", email="", proximo=proximo)


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("login"))


# ---------------------------------------------------------------------------
# Rotas públicas (protegidas por login) — blog
# ---------------------------------------------------------------------------

@app.route("/")
@login_requerido
def index():
    db = get_db()
    categoria = request.args.get("categoria", "").strip()
    busca = request.args.get("q", "").strip()

    query = "SELECT * FROM posts"
    conds = []
    params = []

    if categoria:
        conds.append("categoria = ?")
        params.append(categoria)
    if busca:
        conds.append("(titulo LIKE ? OR resumo LIKE ? OR corpo LIKE ? OR tags LIKE ?)")
        like = f"%{busca}%"
        params.extend([like, like, like, like])

    if conds:
        query += " WHERE " + " AND ".join(conds)
    query += " ORDER BY data_publicacao DESC, id DESC"

    posts = db.execute(query, params).fetchall()
    categorias = db.execute(
        "SELECT categoria, COUNT(*) as total FROM posts GROUP BY categoria ORDER BY categoria"
    ).fetchall()
    destaque = posts[0] if posts and not categoria and not busca else None
    lista = posts[1:] if destaque else posts

    return render_template(
        "index.html",
        posts=lista,
        destaque=destaque,
        categorias=categorias,
        categoria_ativa=categoria,
        busca=busca,
        perfil=get_perfil(),
        total_posts=len(posts),
    )


@app.route("/post/<slug>")
@login_requerido
def post_detalhe(slug):
    db = get_db()
    post = db.execute("SELECT * FROM posts WHERE slug = ?", (slug,)).fetchone()
    if post is None:
        abort(404)

    relacionados = db.execute(
        "SELECT * FROM posts WHERE categoria = ? AND id != ? ORDER BY data_publicacao DESC LIMIT 3",
        (post["categoria"], post["id"]),
    ).fetchall()

    return render_template("post.html", post=post, relacionados=relacionados, perfil=get_perfil())


@app.route("/perfil")
@login_requerido
def perfil_publico():
    db = get_db()
    total_posts = db.execute("SELECT COUNT(*) c FROM posts").fetchone()["c"]
    ultimos = db.execute(
        "SELECT * FROM posts ORDER BY data_publicacao DESC LIMIT 5"
    ).fetchall()
    return render_template(
        "perfil.html", perfil=get_perfil(), total_posts=total_posts, ultimos=ultimos
    )


# ---------------------------------------------------------------------------
# Atividades — trilhas de estudo com laboratório prático
# ---------------------------------------------------------------------------

def get_progresso(usuario_id: int, licao_id: int):
    db = get_db()
    row = db.execute(
        "SELECT * FROM licao_progresso WHERE usuario_id = ? AND licao_id = ?",
        (usuario_id, licao_id),
    ).fetchone()
    if row:
        return row
    db.execute(
        "INSERT INTO licao_progresso (usuario_id, licao_id) VALUES (?, ?)",
        (usuario_id, licao_id),
    )
    db.commit()
    return db.execute(
        "SELECT * FROM licao_progresso WHERE usuario_id = ? AND licao_id = ?",
        (usuario_id, licao_id),
    ).fetchone()


@app.route("/atividades")
@login_requerido
def atividades_index():
    db = get_db()
    uid = session["uid"]
    licoes = db.execute("SELECT * FROM licoes ORDER BY ordem, id").fetchall()

    cards = []
    for l in licoes:
        missoes = json.loads(l["missoes"])
        prog = get_progresso(uid, l["id"])
        feitas = json.loads(prog["missoes_feitas"])
        xp_total = sum(m.get("xp", 0) for m in missoes)
        xp_ganho = sum(m.get("xp", 0) for m in missoes if m["id"] in feitas)
        cards.append({
            "licao": l,
            "total_missoes": len(missoes),
            "missoes_feitas": len(feitas),
            "xp_total": xp_total,
            "xp_ganho": xp_ganho,
            "concluida": bool(prog["concluida"]),
            "em_andamento": bool(prog["leitura_ok"] or feitas) and not prog["concluida"],
        })

    # XP das trilhas. O template de atividades soma `ia_stats.xp` por conta própria
    # (xp_geral = xp_usuario + ia_stats.xp), então NÃO somamos aqui para não duplicar.
    xp_usuario = sum(c["xp_ganho"] for c in cards)
    ia_stats, ia_recentes = resumo_ia_usuario(db, uid)
    return render_template(
        "atividades/index.html",
        cards=cards,
        xp_usuario=xp_usuario,
        xp_total_geral=gami.xp_total(db, uid),  # XP unificado (inclui bônus de trilha e IA)
        ia_stats=ia_stats,
        ia_recentes=ia_recentes,
        perfil=get_perfil(),
    )


@app.route("/atividades/<slug>")
@login_requerido
def licao_detalhe(slug):
    db = get_db()
    licao = db.execute("SELECT * FROM licoes WHERE slug = ?", (slug,)).fetchone()
    if licao is None:
        abort(404)

    missoes = json.loads(licao["missoes"])
    prog = get_progresso(session["uid"], licao["id"])
    feitas = json.loads(prog["missoes_feitas"])
    xp_total = sum(m.get("xp", 0) for m in missoes)

    return render_template(
        "atividades/licao.html",
        licao=licao,
        missoes=missoes,
        leitura_ok=bool(prog["leitura_ok"]),
        missoes_feitas=feitas,
        xp_total=xp_total,
        concluida=bool(prog["concluida"]),
        perfil=get_perfil(),
    )


@app.route("/atividades/<slug>/leitura", methods=["POST"])
@login_requerido
def licao_leitura(slug):
    db = get_db()
    licao = db.execute("SELECT * FROM licoes WHERE slug = ?", (slug,)).fetchone()
    if licao is None:
        abort(404)

    get_progresso(session["uid"], licao["id"])
    db.execute(
        "UPDATE licao_progresso SET leitura_ok = 1, atualizado_em = datetime('now') "
        "WHERE usuario_id = ? AND licao_id = ?",
        (session["uid"], licao["id"]),
    )
    db.commit()
    return redirect(url_for("licao_detalhe", slug=slug) + "#lab")


@app.route("/atividades/<slug>/progresso", methods=["POST"])
@login_requerido
def licao_progresso(slug):
    db = get_db()
    licao = db.execute("SELECT * FROM licoes WHERE slug = ?", (slug,)).fetchone()
    if licao is None:
        abort(404)

    dados = request.get_json(silent=True) or {}
    missao_id = str(dados.get("missao", ""))

    missoes = json.loads(licao["missoes"])
    validas = {m["id"]: m for m in missoes}
    if missao_id not in validas:
        return {"ok": False, "erro": "missão inválida"}, 400

    prog = get_progresso(session["uid"], licao["id"])
    feitas = json.loads(prog["missoes_feitas"])
    if missao_id not in feitas:
        feitas.append(missao_id)

    concluida = len(feitas) == len(missoes)
    db.execute(
        "UPDATE licao_progresso SET missoes_feitas = ?, concluida = ?, "
        "atualizado_em = datetime('now') WHERE usuario_id = ? AND licao_id = ?",
        (json.dumps(feitas), 1 if concluida else 0, session["uid"], licao["id"]),
    )
    db.commit()

    # Gamificação: XP idempotente por (usuário, missão); +bônus ao concluir a trilha.
    eventos = [("missao", f"{slug}:{missao_id}", validas[missao_id].get("xp", 0))]
    if concluida:
        eventos.append(("licao_concluida", slug, gami.BONUS_LICAO))
    recompensa = gami.recompensar(db, session["uid"], eventos)

    xp_ganho = sum(m.get("xp", 0) for m in missoes if m["id"] in feitas)
    xp_total = sum(m.get("xp", 0) for m in missoes)
    return {
        "ok": True,
        "missoes_feitas": feitas,
        "xp_ganho": xp_ganho,
        "xp_total": xp_total,
        "concluida": concluida,
        **recompensa,  # xp_ganho_agora, xp_total_usuario, nivel, subiu_nivel, streak, novas_conquistas
    }


# ---------------------------------------------------------------------------
# Admin — sem senha, rota não listada na navegação pública
# ---------------------------------------------------------------------------

@app.route("/painel-allan-dev")
def admin_dashboard():
    db = get_db()
    total_posts = db.execute("SELECT COUNT(*) c FROM posts").fetchone()["c"]
    total_categorias = db.execute("SELECT COUNT(DISTINCT categoria) c FROM posts").fetchone()["c"]
    total_usuarios = db.execute("SELECT COUNT(*) c FROM usuarios").fetchone()["c"]
    recentes = db.execute(
        "SELECT * FROM posts ORDER BY criado_em DESC, id DESC LIMIT 6"
    ).fetchall()
    atividades = db.execute(
        "SELECT * FROM atividades ORDER BY criado_em DESC LIMIT 10"
    ).fetchall()
    return render_template(
        "admin/dashboard.html",
        perfil=get_perfil(),
        total_posts=total_posts,
        total_categorias=total_categorias,
        total_usuarios=total_usuarios,
        recentes=recentes,
        atividades=atividades,
    )


@app.route("/painel-allan-dev/posts")
def admin_posts():
    db = get_db()
    posts = db.execute("SELECT * FROM posts ORDER BY data_publicacao DESC, id DESC").fetchall()
    return render_template("admin/posts.html", posts=posts, perfil=get_perfil())


@app.route("/painel-allan-dev/posts/novo", methods=["GET", "POST"])
def admin_post_novo():
    if request.method == "POST":
        db = get_db()
        titulo = request.form["titulo"].strip()
        categoria = request.form.get("categoria", "Geral").strip() or "Geral"
        nivel = request.form.get("nivel", "Intermediário").strip() or "Intermediário"
        tags = request.form.get("tags", "").strip()
        resumo = request.form.get("resumo", "").strip()
        corpo = request.form.get("corpo", "").strip()
        data_publicacao = request.form.get("data_publicacao") or datetime.now().strftime("%Y-%m-%d")

        if not titulo or not corpo:
            flash("Título e conteúdo são obrigatórios.", "erro")
            return render_template("admin/post_form.html", post=request.form, perfil=get_perfil(), modo="novo")

        base = slugify(titulo)
        slug = base
        i = 2
        while db.execute("SELECT 1 FROM posts WHERE slug = ?", (slug,)).fetchone():
            slug = f"{base}-{i}"
            i += 1

        db.execute(
            "INSERT INTO posts (titulo, slug, categoria, tags, resumo, corpo, nivel, autor, data_publicacao) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, 'Allan Dev', ?)",
            (titulo, slug, categoria, tags, resumo, corpo, nivel, data_publicacao),
        )
        registrar_atividade(db, f"Publicou o post “{titulo}”")
        db.commit()
        flash("Post publicado com sucesso.", "sucesso")
        return redirect(url_for("admin_posts"))

    return render_template("admin/post_form.html", post=None, perfil=get_perfil(), modo="novo")


@app.route("/painel-allan-dev/posts/<int:post_id>/editar", methods=["GET", "POST"])
def admin_post_editar(post_id):
    db = get_db()
    post = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if post is None:
        abort(404)

    if request.method == "POST":
        titulo = request.form["titulo"].strip()
        categoria = request.form.get("categoria", "Geral").strip() or "Geral"
        nivel = request.form.get("nivel", "Intermediário").strip() or "Intermediário"
        tags = request.form.get("tags", "").strip()
        resumo = request.form.get("resumo", "").strip()
        corpo = request.form.get("corpo", "").strip()
        data_publicacao = request.form.get("data_publicacao") or post["data_publicacao"]

        if not titulo or not corpo:
            flash("Título e conteúdo são obrigatórios.", "erro")
            return render_template("admin/post_form.html", post=request.form, perfil=get_perfil(), modo="editar", post_id=post_id)

        db.execute(
            "UPDATE posts SET titulo=?, categoria=?, tags=?, resumo=?, corpo=?, nivel=?, data_publicacao=? WHERE id=?",
            (titulo, categoria, tags, resumo, corpo, nivel, data_publicacao, post_id),
        )
        registrar_atividade(db, f"Editou o post “{titulo}”")
        db.commit()
        flash("Post atualizado.", "sucesso")
        return redirect(url_for("admin_posts"))

    return render_template("admin/post_form.html", post=post, perfil=get_perfil(), modo="editar", post_id=post_id)


@app.route("/painel-allan-dev/posts/<int:post_id>/excluir", methods=["POST"])
def admin_post_excluir(post_id):
    db = get_db()
    post = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if post is None:
        abort(404)
    db.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    registrar_atividade(db, f"Excluiu o post “{post['titulo']}”")
    db.commit()
    flash("Post excluído.", "sucesso")
    return redirect(url_for("admin_posts"))


@app.route("/painel-allan-dev/perfil", methods=["GET", "POST"])
def admin_perfil():
    db = get_db()
    if request.method == "POST":
        db.execute(
            "UPDATE perfil SET nome=?, titulo=?, bio=?, email=?, local=?, avatar=? WHERE id=1",
            (
                request.form.get("nome", "").strip(),
                request.form.get("titulo", "").strip(),
                request.form.get("bio", "").strip(),
                request.form.get("email", "").strip(),
                request.form.get("local", "").strip(),
                request.form.get("avatar", "AD").strip() or "AD",
            ),
        )
        registrar_atividade(db, "Atualizou as informações do perfil")
        db.commit()
        flash("Perfil atualizado.", "sucesso")
        return redirect(url_for("admin_perfil"))

    return render_template("admin/perfil.html", perfil=get_perfil())


@app.route("/painel-allan-dev/atividades")
def admin_atividades():
    db = get_db()
    atividades = db.execute("SELECT * FROM atividades ORDER BY criado_em DESC").fetchall()
    return render_template("admin/atividades.html", atividades=atividades, perfil=get_perfil())


@app.route("/painel-allan-dev/usuarios")
def admin_usuarios():
    db = get_db()
    usuarios = db.execute("SELECT id, nome, email, criado_em FROM usuarios ORDER BY criado_em DESC").fetchall()
    return render_template("admin/usuarios.html", usuarios=usuarios, perfil=get_perfil())


# ---------------------------------------------------------------------------
# Erros
# ---------------------------------------------------------------------------

@app.errorhandler(404)
def nao_encontrado(e):
    return render_template("404.html", perfil=get_perfil()), 404


# ---------------------------------------------------------------------------
# Entradas
# ---------------------------------------------------------------------------

with app.app_context():
    init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 80))
    host = os.environ.get("HOST", "0.0.0.0")
    debug = os.environ.get("DEBUG", "0") == "1"
    app.run(host=host, port=port, debug=debug)

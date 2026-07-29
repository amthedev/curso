"""
Blog pessoal — Allan Dev
Flask + SQLite. Admin sem senha (acesso direto por /admin).

Executar:
    python3 app.py
Sobe em 0.0.0.0:80 (precisa de sudo/root na maioria dos sistemas Unix
para abrir porta < 1024). Se preferir sem sudo, defina a variável PORT.
"""
import os
import sqlite3
from datetime import datetime
from pathlib import Path

from flask import Flask, g, render_template, request, redirect, url_for, flash, abort

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "blog.db"

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-key-troque-em-producao")


# ---------------------------------------------------------------------------
# Banco de dados
# ---------------------------------------------------------------------------

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    fresh = not DB_PATH.exists()
    db = sqlite3.connect(DB_PATH)
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
            autor TEXT NOT NULL DEFAULT 'Allan Dev',
            data_publicacao TEXT NOT NULL,
            criado_em TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS atividades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            descricao TEXT NOT NULL,
            criado_em TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """
    )
    db.commit()

    if fresh:
        _seed(db)
    db.close()


def slugify(titulo: str) -> str:
    import re
    import unicodedata

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
            "INSERT INTO posts (titulo, slug, categoria, tags, resumo, corpo, autor, data_publicacao) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                post["titulo"],
                slug,
                post["categoria"],
                ",".join(post["tags"]),
                post["resumo"],
                post["corpo"],
                "Allan Dev",
                post["data"],
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


# ---------------------------------------------------------------------------
# Rotas públicas — blog
# ---------------------------------------------------------------------------

@app.route("/")
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
# Admin — sem senha, acesso direto
# ---------------------------------------------------------------------------

@app.route("/admin")
def admin_dashboard():
    db = get_db()
    total_posts = db.execute("SELECT COUNT(*) c FROM posts").fetchone()["c"]
    total_categorias = db.execute("SELECT COUNT(DISTINCT categoria) c FROM posts").fetchone()["c"]
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
        recentes=recentes,
        atividades=atividades,
    )


@app.route("/admin/posts")
def admin_posts():
    db = get_db()
    posts = db.execute("SELECT * FROM posts ORDER BY data_publicacao DESC, id DESC").fetchall()
    return render_template("admin/posts.html", posts=posts, perfil=get_perfil())


@app.route("/admin/posts/novo", methods=["GET", "POST"])
def admin_post_novo():
    if request.method == "POST":
        db = get_db()
        titulo = request.form["titulo"].strip()
        categoria = request.form.get("categoria", "Geral").strip() or "Geral"
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
            "INSERT INTO posts (titulo, slug, categoria, tags, resumo, corpo, autor, data_publicacao) "
            "VALUES (?, ?, ?, ?, ?, ?, 'Allan Dev', ?)",
            (titulo, slug, categoria, tags, resumo, corpo, data_publicacao),
        )
        registrar_atividade(db, f"Publicou o post “{titulo}”")
        db.commit()
        flash("Post publicado com sucesso.", "sucesso")
        return redirect(url_for("admin_posts"))

    return render_template("admin/post_form.html", post=None, perfil=get_perfil(), modo="novo")


@app.route("/admin/posts/<int:post_id>/editar", methods=["GET", "POST"])
def admin_post_editar(post_id):
    db = get_db()
    post = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if post is None:
        abort(404)

    if request.method == "POST":
        titulo = request.form["titulo"].strip()
        categoria = request.form.get("categoria", "Geral").strip() or "Geral"
        tags = request.form.get("tags", "").strip()
        resumo = request.form.get("resumo", "").strip()
        corpo = request.form.get("corpo", "").strip()
        data_publicacao = request.form.get("data_publicacao") or post["data_publicacao"]

        if not titulo or not corpo:
            flash("Título e conteúdo são obrigatórios.", "erro")
            return render_template("admin/post_form.html", post=request.form, perfil=get_perfil(), modo="editar", post_id=post_id)

        db.execute(
            "UPDATE posts SET titulo=?, categoria=?, tags=?, resumo=?, corpo=?, data_publicacao=? WHERE id=?",
            (titulo, categoria, tags, resumo, corpo, data_publicacao, post_id),
        )
        registrar_atividade(db, f"Editou o post “{titulo}”")
        db.commit()
        flash("Post atualizado.", "sucesso")
        return redirect(url_for("admin_posts"))

    return render_template("admin/post_form.html", post=post, perfil=get_perfil(), modo="editar", post_id=post_id)


@app.route("/admin/posts/<int:post_id>/excluir", methods=["POST"])
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


@app.route("/admin/perfil", methods=["GET", "POST"])
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


@app.route("/admin/atividades")
def admin_atividades():
    db = get_db()
    atividades = db.execute("SELECT * FROM atividades ORDER BY criado_em DESC").fetchall()
    return render_template("admin/atividades.html", atividades=atividades, perfil=get_perfil())


def registrar_atividade(db, descricao: str):
    db.execute("INSERT INTO atividades (descricao) VALUES (?)", (descricao,))


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

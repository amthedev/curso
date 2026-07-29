# Blog — Allan Dev

Blog pessoal sobre cyber segurança, Linux, redes e Python. Feito em Flask + SQLite, com painel de administração **sem senha** (acesso direto).

## Rodando localmente

```bash
pip install -r requirements.txt
python3 app.py
```

Por padrão sobe em `0.0.0.0:80` (precisa de privilégio de root/administrador para abrir porta abaixo de 1024):

```bash
sudo python3 app.py
```

Para rodar numa porta sem privilégio, defina a variável `PORT`:

```bash
PORT=8000 python3 app.py
```

Acesse:

- Blog público: `http://localhost/`
- Painel admin (sem login): `http://localhost/admin`

## Estrutura

```
app.py            # aplicação Flask e rotas
seed_data.py       # conteúdo inicial (perfil + 21 posts) carregado só na primeira execução
templates/          # HTML (Jinja2)
static/css          # estilos do blog e do admin
static/js           # menu mobile, markdown simples, confirmação de exclusão
blog.db             # banco SQLite (criado automaticamente, não versionado)
```

## Painel admin

Acessível diretamente em `/admin`, sem tela de login — pensado para uso pessoal.

- **Postagens** — criar, editar e excluir posts (Markdown simples: `## título`, `**negrito**`, listas, blocos ` ``` `)
- **Perfil** — editar nome, cargo, bio, avatar, email e localização exibidos no blog
- **Atividades** — histórico das ações feitas no painel (publicação/edição/exclusão de posts, atualização de perfil)

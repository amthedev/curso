# Blog — Allan Dev

Blog pessoal sobre cyber segurança, Linux, redes e Python. Feito em Flask + SQLite, com painel de administração **sem senha** (acesso direto) e seção de **Atividades** — trilhas de estudo com laboratório prático em terminal Linux simulado.

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
- Atividades (após login): `http://localhost/atividades`
- Painel admin (sem login): `http://localhost/painel-allan-dev`

## Estrutura

```
app.py              # aplicação Flask e rotas
seed_data.py        # conteúdo inicial (perfil + 21 posts) carregado só na primeira execução
licoes_data.py      # lições da seção Atividades (textos + missões) — semeado a cada boot, sem duplicar
templates/          # HTML (Jinja2)
templates/atividades  # páginas da seção Atividades (índice + lição com laboratório)
static/css          # estilos do blog, admin e atividades
static/js           # menu mobile, markdown simples, terminal.js (lab interativo)
blog.db             # banco SQLite (criado automaticamente, não versionado)
```

## Atividades (laboratório prático)

Seção `/atividades` com trilhas de aprendizado no formato **leitura → prática**:

1. **Texto antes** — cada atividade começa com material de estudo completo
   (a primeira cobre redes, IPs, portas, modelo OSI, TCP/UDP, HTTP/HTTPS, DNS e Linux)
2. **Portão de leitura** — o laboratório só é liberado depois que o aluno confirma a leitura
3. **Terminal Linux simulado** — roda 100% no navegador (JS puro), com filesystem
   falso, histórico, TAB completion e comandos reais: `ls`, `cd`, `cat`, `grep`,
   `ping`, `nslookup`, `curl`, `nmap`, `man`, `sudo` (com easter eggs)
4. **Missões com XP** — 11 missões validadas automaticamente pelo que o aluno digita
   (ex: `cat notas.txt`, `nmap lab.local`, achar a flag em arquivo oculto)
5. **Progresso salvo por usuário** — tabelas `licoes` e `licao_progresso` no SQLite;
   XP total aparece no índice de atividades

Para criar novas atividades, basta adicionar uma entrada em `SEED_LICOES` no
arquivo `licoes_data.py` — o app sincroniza no próximo boot (`ON CONFLICT DO UPDATE`).

## Painel admin

Acessível diretamente em `/painel-allan-dev`, sem tela de login — pensado para uso pessoal (rota não listada na navegação pública).

- **Postagens** — criar, editar e excluir posts (Markdown simples: `## título`, `**negrito**`, listas, blocos ` ``` `)
- **Perfil** — editar nome, cargo, bio, avatar, email e localização exibidos no blog
- **Atividades** — histórico das ações feitas no painel (publicação/edição/exclusão de posts, atualização de perfil)

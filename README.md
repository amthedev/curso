# Allan Dev — Blog + Atividades com IA

Blog pessoal sobre cyber segurança, Linux, redes e Python em Flask + SQLite. Inclui:
- **Blog** com painel admin sem senha
- **Atividades** — trilhas de estudo com laboratório prático em terminal Linux simulado
- **Atividades com IA** — questões geradas sob demanda (múltipla escolha, V/F, discursiva, comando, ordenar)
- **Gamificação** — XP unificado, níveis, streak, conquistas e ranking

## Rodando localmente

```bash
pip install -r requirements.txt
PORT=8000 python3 app.py
```

Por padrão sobe em `0.0.0.0:80` (requer root). Use `PORT=8000` para uma porta sem privilégio.

Acesse:
- Blog: `http://localhost:8000/`
- Atividades: `http://localhost:8000/atividades`
- Painel admin: `http://localhost:8000/painel-allan-dev`

Para testar sem chave OpenRouter:
```bash
IA_MOCK=1 PORT=8000 python3 app.py
```

Nota: Local, não ative `HTTPS=1` — o navegador não devolveria o cookie de sessão em http://

## Deploy no Square Cloud

Faça um push na branch configurada para disparar deploy automático. Configure as variáveis no painel da aplicação (Configurações → Variáveis de ambiente):

| Variável | Obrigatória? | Padrão | O que faz |
|----------|--------------|--------|----------|
| `OPENROUTER_API_KEY` | Sim (se usar IA) | — | Chave da API OpenRouter para gerar atividades com IA |
| `OPENROUTER_MODEL` | Não | `anthropic/claude-haiku-4.5` | Modelo que gera as atividades |
| `OPENROUTER_MODEL_RAPIDO` | Não | `openai/gpt-4o-mini` | Modelo rápido para corrigir respostas abertas e gerar dicas |
| `OPENROUTER_FALLBACK_MODELS` | Não | — | Fallbacks separados por vírgula (ex: `google/gemini-2.5-flash,openai/gpt-4o-mini`) |
| `IA_LIMITE_DIARIO` | Não | `20` | Gerações por aluno por dia (0 = sem limite) |
| `IA_LIMITE_TUTOR_DIARIO` | Não | `40` | Perguntas ao tutor por aluno por dia |
| `IA_MOCK` | Não | `0` | `1` para modo demonstração (respostas fake, sem custo) |
| `SECRET_KEY` | Não | (gerada) | Chave que assina cookies de sessão. Gere com: `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `HTTPS` | Não | `0` | `1` se servido por HTTPS (marca cookie como Secure) |
| `TRUST_PROXY` | Não | `0` | `1` se há proxy reverso na frente (Square Cloud: `1`) |
| `ADMIN_EMAILS` | Não | (vazio) | Emails para restringir acesso ao painel (separados por vírgula). Vazio = painel aberto |
| `SITE_URL` | Não | — | URL pública do site, enviada como Referer para OpenRouter (ex: `https://allandev-blog.squareweb.app`) |
| `CADASTRO_MAX_POR_HORA` | Não | `10` | Máximo de cadastros por IP por hora |
| `PORT` | Não | `80` | Porta (Square Cloud define automaticamente) |
| `DB_PATH` | Não | `./blog.db` | Caminho do banco SQLite |

**Recomendação para produção:**
- Defina `OPENROUTER_API_KEY` com uma chave válida
- Defina `SECRET_KEY` com um valor aleatório (não use o padrão)
- Ative `HTTPS=1` e `TRUST_PROXY=1`
- Defina `ADMIN_EMAILS` com seu(s) email(is) para proteger o painel
- Configure um limite de crédito na própria chave OpenRouter (no painel da API)

## Funcionalidades

### Atividades (trilhas com laboratório)

Seção `/atividades` com trilhas de aprendizado no formato **leitura → prática**:

1. **Texto antes** — material de estudo completo antes do laboratório
2. **Portão de leitura** — o aluno confirma que leu antes de acessar o lab
3. **Terminal Linux simulado** — roda 100% no navegador (JS puro), com filesystem falso, histórico, TAB completion e comandos: `ls`, `cd`, `cat`, `grep`, `ping`, `nslookup`, `curl`, `nmap`, `man`, `sudo`
4. **Missões com XP** — validadas automaticamente pelo que o aluno digita
5. **Progresso salvo** — por usuário no banco

### Atividades com IA

Geradas sob demanda em `/atividades/ia`. Tipos de questão:
- Múltipla escolha
- Verdadeiro/Falso
- Discursiva (corrigida por IA)
- Comando Linux (verificada por regex)
- Ordenação de passos

Recursos:
- **Dica com -50% XP** — revela a dica antes da resposta, reduzindo a recompensa
- **Limite diário** — (padrão 20 por aluno; 0 = sem limite)
- **Gabarito seguro** — nunca enviado ao navegador antes da resposta; só volta na correção
- **"Praticar este post"** — gera 8 questões baseadas num post do blog (com cache por post/nível, não gasta cota)
- **Tutor "Travei?"** — 3 níveis de dica dentro do laboratório (sem custo extra nas gerações)

### Painel do Aluno

Acessível em `/eu`:
- **XP** — total unificado (trilhas + atividades com IA)
- **Heatmap** — últimas 12 semanas de atividade (verde = dias com XP)
- **Streak** — dias consecutivos e recorde
- **Conquistas** — desbloqueáveis por XP, streak, atividades concluídas
- **Ranking** — `/ranking` com período (semana, mês, geral); só usuários com `ranking_publico = 1` aparecem

### Gamificação

**Níveis** (baseados em XP total):
- Script Kiddie (0 XP)
- Recruita (100 XP)
- Operador (300 XP)
- Pentester (700 XP)
- Red Teamer (1500 XP)
- Elite (3000 XP)

**Conquistas**:
- **Primeiro sangue** — complete a primeira missão
- **Caçador de flags** — encontre uma flag escondida
- **Trilha completa** — conclua todas as missões de uma trilha
- **Aquecendo** — 3 dias consecutivos com XP
- **Em chamas** — 7 dias consecutivos com XP
- **Imparável** — 30 dias consecutivos com XP
- **500 XP** — acumule 500 XP
- **2.000 XP** — acumule 2.000 XP
- **Treino com IA** — complete uma atividade gerada por IA
- **Veterano da IA** — complete 5 atividades geradas por IA
- **Perfeccionista** — acerte 100% de uma atividade com IA

### Painel Admin

Acessível em `/painel-allan-dev`. Por padrão aberto, sem senha (se `ADMIN_EMAILS` estiver vazia); caso contrário, requer login.

- **Dashboard** — últimos posts, total de usuários, histórico de ações
- **Posts** — criar, editar, excluir (Markdown simples: `## título`, `**negrito**`, listas, ` ``` `)
- **Perfil** — editar nome, cargo, bio, avatar, email, localização
- **Usuários** — listar usuários registrados
- **Atividades com IA** (`/painel-allan-dev/ia`) — visualizar/debugar atividades geradas, uso de IA por aluno

## Segurança

- **Sessões persistidas** — cookie de sessão assinado com `SECRET_KEY` (gerada ou fornecida); `SESSION_COOKIE_HTTPONLY=True`, `SESSION_COOKIE_SAMESITE=Lax`
- **CSRF leve** — POST/PUT/PATCH/DELETE com Origin/Referer de outro host recebem 403
- **Limite de tentativas de login** — 5 falhas por (IP, email) a cada 15 min
- **Limite de cadastro** — 10 por IP por hora
- **Headers de segurança** — X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- **Saída de IA escapada** — toda resposta da IA passa por `escape()` antes de ir para o HTML

## Estrutura de arquivos

```
app.py                          # aplicação Flask principal + rotas blog/admin/atividades
core.py                         # helpers (SECRET_KEY, limitadores, decoradores de auth)
gamificacao.py                  # XP, níveis, streak, conquistas, ranking
ia_routes.py                    # blueprint /atividades/ia (gerar, responder, dica)
ia_service.py                   # integração OpenRouter, cache, mock
tutor_routes.py                 # blueprint /tutor (Travei? dentro do lab)
aluno_routes.py                 # blueprint /eu, /ranking, /api/eu/stats

seed_data.py                    # perfil e 21 posts iniciais
licoes_data.py                  # lições (trilhas) e missões do laboratório

templates/
  base.html                     # layout base (navbar, footer)
  index.html                    # blog (lista de posts)
  post.html                     # post detalhado
  perfil.html                   # perfil público
  auth/
    login.html
    cadastro.html
  atividades/
    index.html                  # índice de trilhas + stats de IA
    licao.html                  # lição + terminal interativo
  ia/
    index.html                  # lista de atividades + formulário de geração
    ver.html                    # resolver atividade com IA
  aluno/
    painel.html                 # /eu (XP, heatmap, streak, conquistas)
    ranking.html                # /ranking
  admin/
    base_admin.html
    dashboard.html
    posts.html, post_form.html
    perfil.html
    usuarios.html
    atividades.html
    ia.html                     # /painel-allan-dev/ia

static/
  css/
    style.css                   # estilos do blog
    atividades.css              # terminal e trilhas
    ia.css                      # atividades com IA
    aluno.css                   # painel, ranking, gamificação
    admin.css
    auth.css
    tutor.css
  js/
    main.js                     # menu mobile, utilidades
    terminal.js                 # terminal Linux simulado (100% JS)
    ia.js                       # front-end das atividades com IA
    tutor.js                    # modal "Travei?" do lab
    gamificacao.js              # animações de conquistas, toasts
    admin.js

blog.db                         # banco SQLite (criado automaticamente)
requirements.txt                # dependências
```

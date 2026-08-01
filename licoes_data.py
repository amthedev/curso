# -*- coding: utf-8 -*-
"""
Lições da seção Atividades (Aprenda).
Cada lição tem: textos de estudo (markdown) + missões práticas no terminal simulado.
"""

SEED_LICOES = [
    {
        "titulo": "Fundamentos: Redes, Protocolos e Linux",
        "slug": "fundamentos-redes-protocolos-linux",
        "descricao": "Sua primeira missão. Aprenda como a internet funciona de verdade — IPs, portas, TCP, UDP, HTTP, HTTPS e DNS — e domine os primeiros comandos de um terminal Linux em um laboratório interativo.",
        "nivel": "Iniciante",
        "ordem": 1,
        "conteudo": r"""
## Bem-vindo à sua primeira missão

Antes de invadir qualquer sistema, você precisa entender **como ele se comunica**. Todo pentest, todo exploit e todo CTF começa no mesmo lugar: **redes**. E a ferramenta de trabalho de quem mexe com segurança é o **Linux**.

Nesta lição você vai:

1. Entender como computadores conversam entre si (IPs, portas e pacotes)
2. Conhecer os protocolos que seguram a internet de pé (TCP, UDP, HTTP, HTTPS, DNS e amigos)
3. Aprender o básico do Linux e do terminal
4. **Praticar tudo isso num terminal Linux de verdade** (simulado aqui mesmo no navegador)

Leia com calma. No final, o laboratório prático é liberado — e é lá que a diversão começa.

---

## 1. Como a internet funciona (de verdade)

Quando você digita `google.com` no navegador, uma sequência absurda de coisas acontece em milissegundos:

1. Seu computador pergunta a um servidor **DNS** qual é o endereço IP do Google
2. Ele abre uma conexão **TCP** com aquele IP (o famoso *three-way handshake*)
3. Se for HTTPS, rola uma negociação de criptografia **TLS**
4. Só então ele envia o pedido **HTTP** (`GET /`) e recebe a página de volta

Tudo na internet é troca de **pacotes**: pequenos envelopes de dados com remetente, destinatário e conteúdo. O trabalho dos protocolos é definir *o formato* desses envelopes e *as regras da conversa*.

> **Analogia:** pense numa carta. O endereço IP é o endereço da casa, a porta é o cômodo da pessoa certa, o envelope é o pacote, e o protocolo é o idioma em que a carta foi escrita.

---

## 2. Endereços IP e portas

### Endereço IP

Todo dispositivo numa rede tem um **endereço IP** — é o "CPF" dele na rede.

- **IPv4**: 4 números de 0 a 255, ex: `192.168.1.10` (está acabando no mundo)
- **IPv6**: formato gigante, ex: `2001:db8::1` (feito para nunca acabar)

IPs que você vai ver o tempo todo:

| IP | Significado |
|---|---|
| `127.0.0.1` | **localhost** — sua própria máquina falando com ela mesma |
| `192.168.x.x` | Rede local (sua casa, seu roteador) |
| `10.x.x.x` | Rede interna de empresas/VPNs |
| `0.0.0.0` | "Todas as interfaces" — quando um servidor escuta em tudo |

### Portas

Um único servidor roda vários serviços ao mesmo tempo. As **portas** separam quem é quem. São **65.535 portas** por IP, e algumas são famosas demais:

| Porta | Protocolo | Pra que serve |
|---|---|---|
| 21 | FTP | Transferência de arquivos (sem criptografia!) |
| 22 | SSH | Terminal remoto criptografado |
| 23 | Telnet | Terminal remoto em texto puro (inseguro, legado) |
| 25 | SMTP | Envio de e-mail |
| 53 | DNS | Tradução de nomes para IPs |
| 80 | HTTP | Sites **sem** criptografia |
| 443 | HTTPS | Sites **com** criptografia |
| 3306 | MySQL | Banco de dados |
| 3389 | RDP | Área de trabalho remota do Windows |

> **Pra gravar:** `IP = prédio`, `porta = apartamento`. Quando você escaneia um alvo com o `nmap`, está basicamente tocando a campainha de todos os apartamentos para ver quem responde.

---

## 3. Os modelos de camadas

Para organizar a bagunça, redes são divididas em **camadas**. Cada camada resolve um problema e "conversa" só com a camada de cima e a de baixo.

### Modelo OSI (7 camadas)

| # | Camada | O que faz | Exemplo |
|---|---|---|---|
| 7 | Aplicação | O que o programa pede | HTTP, DNS, SSH |
| 6 | Apresentação | Formato e criptografia | TLS, codificação |
| 5 | Sessão | Abre/fecha conversas | Sessões de conexão |
| 4 | Transporte | Entrega confiável ou rápida | **TCP, UDP** |
| 3 | Rede | Roteamento entre redes | **IP** |
| 2 | Enlace | Comunicação dentro da rede local | MAC, ARP, switch |
| 1 | Física | Cabos, sinais, Wi-Fi | Fibra, rádio |

Na prática do dia a dia usamos o modelo **TCP/IP**, que compacta isso em 4 camadas: **Aplicação → Transporte → Internet → Acesso à rede**.

> **Dica de prova/entrevista:** quando alguém diz "é um problema de camada 8", está dizendo que o problema é **o usuário**. 😄

---

## 4. TCP e UDP: os dois irmãos do transporte

### TCP — o certinho

O **TCP** garante que tudo chegue, na ordem certa, sem sumir nada. Antes de trocar dados, ele faz o **three-way handshake**:

```bash
Cliente → SYN      → Servidor   # "oi, posso falar com você?"
Cliente ← SYN-ACK  ← Servidor   # "pode sim, e você me ouve?"
Cliente → ACK      → Servidor   # "ouço! vamos começar."
```

Depois disso, cada pacote é numerado e confirmado. Perdeu um? Ele reenvia. É por isso que sites, e-mails e SSH usam TCP.

### UDP — o apressado

O **UDP** simplesmente joga os pacotes e torce. Sem handshake, sem confirmação, sem reenvio. Parece ruim? É **perfeito** quando velocidade importa mais que perfeição:

- Jogos online (melhor perder 1 frame do que travar esperando)
- Streaming e chamadas de voz
- DNS (perguntas curtas e rápidas)

> **Resumo:** TCP = carta registrada com aviso de recebimento. UDP = panfleto jogado do carro.

---

## 5. HTTP e HTTPS

### HTTP — a língua da web

O **HTTP** é o protocolo das páginas web. É baseado em **requisição e resposta**:

```bash
# O cliente pede:
GET /index.html HTTP/1.1
Host: exemplo.com

# O servidor responde:
HTTP/1.1 200 OK
Content-Type: text/html

<html>...conteúdo da página...</html>
```

**Métodos** principais:

| Método | O que faz |
|---|---|
| `GET` | Pede um recurso (abrir página, buscar dados) |
| `POST` | Envia dados (login, formulários) |
| `PUT` / `PATCH` | Atualiza algo |
| `DELETE` | Apaga algo |
| `HEAD` | Só os cabeçalhos, sem corpo |

**Códigos de status** que você precisa conhecer:

| Código | Significado |
|---|---|
| `200` | OK — deu certo |
| `301/302` | Redirecionamento |
| `403` | Proibido — você não tem permissão |
| `404` | Não encontrado |
| `500` | Erro interno do servidor (interessante pra quem ataca...) |

### HTTPS — HTTP com cadeado

HTTP puro viaja **em texto aberto**: qualquer um na mesma rede Wi-Fi consegue ler o tráfego (é assim que funcionam ataques de *sniffing* e *man-in-the-middle*).

O **HTTPS** é o mesmo HTTP, mas dentro de um túnel criptografado **TLS**. Na prática:

- O servidor prova quem é com um **certificado digital**
- Cliente e servidor combinam chaves de criptografia
- Tudo que trafega depois disso é ilegível para bisbilhoteiros

> **Regra de ouro:** nunca digite senha em site sem cadeado. E se você for dono do site, HTTPS não é opcional.

---

## 6. DNS: a agenda telefônica da internet

Humanos decoram nomes, máquinas usam números. O **DNS** (Domain Name System) traduz `exemplo.com` → `93.184.216.34`.

A resolução acontece em etapas:

1. Seu PC olha o **cache local** ("já sei esse de cor?")
2. Pergunta ao servidor DNS configurado (geralmente do provedor ou `8.8.8.8` do Google)
3. Esse servidor pergunta aos servidores raiz → `.com` → servidor do domínio
4. A resposta volta e fica em cache por um tempo (o **TTL**)

Registros DNS importantes:

| Tipo | Guarda |
|---|---|
| `A` | Nome → IPv4 |
| `AAAA` | Nome → IPv6 |
| `CNAME` | Apelido para outro nome |
| `MX` | Servidor de e-mail do domínio |
| `TXT` | Textos diversos (verificações, SPF) |

No laboratório você vai usar `nslookup` para fazer uma consulta DNS na mão.

---

## 7. Outros protocolos que você vai cruzar por aí

- **ICMP** — protocolo de diagnóstico. É ele que o `ping` usa ("está vivo?")
- **DHCP** — entrega IP automático quando você conecta no Wi-Fi
- **ARP** — descobre qual endereço MAC (placa de rede) tem determinado IP na rede local
- **SSH** (porta 22) — terminal remoto criptografado; o padrão para administrar servidores Linux
- **FTP** (porta 21) — transfere arquivos **sem criptografia**; ainda aparece em CTFs e servidores antigos
- **SMTP** (porta 25) — envio de e-mails entre servidores

---

## 8. Linux: o sistema de quem mexe com segurança

### Por que Linux?

Praticamente **toda ferramenta de segurança** nasce no Linux: nmap, Wireshark, Metasploit, Burp... Além disso, a maioria dos **servidores da internet roda Linux** — então é nele que você vai pousar depois de um exploit.

Distribuições famosas: **Kali** (pentest), **Ubuntu** (uso geral), **Debian** (servidores), **Arch** (corajosos).

### Tudo é um arquivo

A filosofia do Linux: **tudo é um arquivo** — discos, processos, dispositivos, configurações. E tudo começa na raiz `/`:

```bash
/           # raiz de tudo
├── home/   # pastas pessoais dos usuários (sua "Área de Trabalho" mora aqui)
├── etc/    # arquivos de configuração do sistema
├── var/    # logs e dados variáveis (var/log é ouro numa investigação)
├── usr/    # programas instalados
├── tmp/    # arquivos temporários (limpa a cada reboot)
└── root/   # casa do usuário root (o todo-poderoso)
```

### O terminal e o shell

O **terminal** é a janela; o **shell** (geralmente `bash`) é quem interpreta seus comandos. Um comando tem sempre o formato:

```bash
comando -opcoes argumentos
ls -la /home
```

Dicas de sobrevivência: **TAB** completa nomes, **seta pra cima** repete comandos, `Ctrl+C` cancela qualquer coisa travada.

### Comandos essenciais

| Comando | Faz o quê |
|---|---|
| `pwd` | Mostra em que pasta você está |
| `ls` / `ls -la` | Lista arquivos (`-l` detalhes, `-a` mostra ocultos) |
| `cd pasta` | Entra numa pasta (`cd ..` volta, `cd ~` vai pra home) |
| `cat arquivo` | Lê o conteúdo de um arquivo |
| `echo texto` | Imprime texto |
| `man comando` | Manual de qualquer comando |
| `grep texto arquivo` | Procura texto dentro de arquivo |
| `ping host` | Testa se um host responde (ICMP) |
| `nslookup dominio` | Consulta DNS |
| `curl url` | Faz requisição HTTP na mão |
| `nmap alvo` | Escaneia portas de um alvo |
| `history` | Histórico de comandos digitados |
| `clear` | Limpa a tela |
| `sudo comando` | Executa como root (com grandes poderes...) |

### Permissões: rwx

Todo arquivo tem permissões para **dono**, **grupo** e **outros**:

```bash
-rwxr-xr--  1 aluno alunos  notas.txt
 │└┬┘└┬┘└┬┘
 │ │  │  └─ outros: r (só leitura)
 │ │  └──── grupo: r-x (ler e executar)
 │ └─────── dono: rwx (ler, escrever, executar)
 └───────── tipo: - arquivo, d diretório
```

- **r** (read=4), **w** (write=2), **x** (execute=1)
- `chmod 755 arquivo` → dono tudo (7), resto lê e executa (5)
- Arquivos que começam com `.` (ponto) são **ocultos** — e é onde costumam morar segredos em CTFs 👀

---

## 9. Hora da prática

Chega de teoria. Abaixo está um **terminal Linux simulado** com uma máquina de verdade (mentira, mas finja que é) esperando seus comandos.

Você vai receber **missões** — cada uma vale XP. Complete todas para ganhar a flag da lição e provar que entendeu o conteúdo.

> **Lembrou de tudo?** Então clique no botão abaixo para liberar o laboratório. Boa sorte, recruta. 🐧
""",
        "missoes": [
            {
                "id": "whoami",
                "titulo": "Quem é você?",
                "descricao": "Todo bom operador sabe com qual usuário está logado. Descubra o seu.",
                "dica": "O comando que responde 'quem sou eu?' em inglês: whoami",
                "xp": 10,
            },
            {
                "id": "pwd",
                "titulo": "Onde estou?",
                "descricao": "Oriente-se: descubra em qual diretório você está agora.",
                "dica": "pwd = print working directory",
                "xp": 10,
            },
            {
                "id": "ls",
                "titulo": "Olhe ao redor",
                "descricao": "Liste os arquivos do diretório atual.",
                "dica": "ls é o 'dir' do Linux.",
                "xp": 10,
            },
            {
                "id": "ls-a",
                "titulo": "Caçador de arquivos ocultos",
                "descricao": "Arquivos que começam com ponto ficam escondidos. Liste TODOS os arquivos, inclusive os ocultos.",
                "dica": "Use ls com a opção -a (all).",
                "xp": 15,
            },
            {
                "id": "cat-notas",
                "titulo": "Leitura obrigatória",
                "descricao": "Alguém deixou um arquivo notas.txt na sua home. Leia o conteúdo dele.",
                "dica": "cat notas.txt",
                "xp": 15,
            },
            {
                "id": "cat-relatorio",
                "titulo": "Explorador de pastas",
                "descricao": "Existe um relatório dentro da pasta documentos. Entre nela e leia o arquivo.",
                "dica": "cd documentos e depois cat no arquivo que estiver lá (use ls para ver o nome).",
                "xp": 15,
            },
            {
                "id": "ping",
                "titulo": "Sinal de vida",
                "descricao": "Teste a conectividade com o servidor do laboratório: envie um ping para lab.local.",
                "dica": "ping lab.local — o ping usa o protocolo ICMP, lembra?",
                "xp": 15,
            },
            {
                "id": "nslookup",
                "titulo": "Detetive de DNS",
                "descricao": "Descubra qual IP está por trás do domínio lab.local.",
                "dica": "nslookup lab.local — DNS traduz nomes em IPs.",
                "xp": 20,
            },
            {
                "id": "curl",
                "titulo": "Sua primeira requisição HTTP",
                "descricao": "Faça uma requisição HTTP para http://lab.local usando o curl.",
                "dica": "curl http://lab.local — repare nos cabeçalhos e no status da resposta.",
                "xp": 20,
            },
            {
                "id": "nmap",
                "titulo": "Varredura de portas",
                "descricao": "Escaneie as portas do alvo lab.local para descobrir quais serviços estão rodando.",
                "dica": "nmap lab.local — a ferramenta favorita de todo pentester.",
                "xp": 20,
            },
            {
                "id": "flag",
                "titulo": "Capture a flag 🚩",
                "descricao": "Você viu um arquivo oculto suspeito na sua home. Leia ele e capture a flag.",
                "dica": "Arquivos ocultos começam com ponto. Você já sabe como listá-los e como lê-los...",
                "xp": 25,
            },
        ],
    },
]

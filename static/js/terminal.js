/* ===================================================================
   Laboratório — Terminal Linux simulado
   Filesystem falso + comandos + missões com XP
   =================================================================== */
(function () {
  "use strict";

  var cfg = window.LAB_CONFIG;
  if (!cfg) return;

  var termEl   = document.getElementById("terminal");
  var outEl    = document.getElementById("terminalOut");
  var inputEl  = document.getElementById("terminalInput");
  var promptEl = document.getElementById("promptLabel");
  if (!termEl || !outEl || !inputEl) return;

  var USER = "aluno";
  var HOST = "lab-linux";
  var HOME = ["home", "aluno"];

  /* ── Filesystem ── */
  var FS = {
    home: {
      aluno: {
        "notas.txt": [
          "=== NOTAS DE ESTUDO ===",
          "",
          "Portas que eu preciso decorar:",
          "  22  -> SSH (terminal remoto seguro)",
          "  80  -> HTTP (site sem cadeado)",
          "  443 -> HTTPS (site com cadeado)",
          "  53  -> DNS (traduz nomes em IPs)",
          "",
          "Handshake TCP: SYN -> SYN-ACK -> ACK",
          "UDP nao tem handshake: rapido, mas sem garantia.",
          "",
          "PS: ouvi dizer que o admin esconde algo em",
          "arquivos que comecam com ponto... use ls -a ;)",
        ].join("\n"),
        "documentos": {
          "relatorio.txt": [
            "RELATORIO DE RECON - lab.local",
            "-------------------------------",
            "Alvo responde a ping (ICMP ok).",
            "DNS resolve lab.local para 10.0.0.5.",
            "Proximos passos:",
            "  1. curl http://lab.local (ver o servidor web)",
            "  2. nmap lab.local (mapear portas abertas)",
            "",
            "Lembrete: em seguranca, reconhecimento vem",
            "SEMPRE antes da acao. Entenda o alvo primeiro.",
          ].join("\n"),
        },
        "downloads": {},
        ".secreto": [
          "PARABENS, OPERADOR! Voce encontrou o arquivo oculto.",
          "",
          "  FLAG{pr1m31r0_c0nt4t0}",
          "",
          "Guardar segredos em arquivos que comecam com ponto",
          "so os esconde de quem nao sabe usar ls -a.",
          "Em CTFs (e em servidores reais), SEMPRE procure",
          "por arquivos ocultos. Voce esta pensando certo.",
        ].join("\n"),
      },
    },
    etc: {
      "os-release": 'NAME="Lab Linux"\nVERSION="1.0 (educacional)"\nID=lablinux',
      "hosts": "127.0.0.1\tlocalhost\n10.0.0.5\tlab.local",
      "resolv.conf": "nameserver 8.8.8.8",
    },
    var: {
      log: {
        "auth.log": [
          "Aug  1 09:12:01 lab-linux sshd[701]: Accepted password for aluno from 192.168.1.20 port 51122 ssh2",
          "Aug  1 09:12:05 lab-linux sudo: aluno : user NOT in sudoers ; TTY=pts/0 ; PWD=/home/aluno",
        ].join("\n"),
      },
    },
    usr: { bin: {}, share: {} },
    tmp: {},
  };

  var DNS = {
    "lab.local": "10.0.0.5",
    "exemplo.com": "93.184.216.34",
    "google.com": "142.250.79.46",
    "localhost": "127.0.0.1",
  };

  var cwd = HOME.slice();
  var history = [];
  var histIdx = -1;
  var running = false;

  var feitas = {};
  (cfg.feitas || []).forEach(function (id) { feitas[id] = true; });
  var totalMissoes = cfg.missoes.length;

  /* ── helpers de FS ── */
  function normParts(path) {
    if (!path) return cwd.slice();
    var parts = path.startsWith("/") ? [] : cwd.slice();
    if (path.startsWith("~")) {
      parts = HOME.slice();
      path = path.slice(1);
      if (path.startsWith("/")) path = path.slice(1);
    }
    path.split("/").forEach(function (seg) {
      if (!seg || seg === ".") return;
      if (seg === "..") { if (parts.length) parts.pop(); }
      else parts.push(seg);
    });
    return parts;
  }

  function getNode(parts) {
    var node = FS;
    for (var i = 0; i < parts.length; i++) {
      if (node === null || typeof node !== "object") return null;
      node = node[parts[i]];
      if (node === undefined) return null;
    }
    return node;
  }

  function isDir(node) { return node !== null && typeof node === "object"; }

  function displayPath() {
    if (cwd.length >= HOME.length && cwd.slice(0, HOME.length).join("/") === HOME.join("/")) {
      var rest = cwd.slice(HOME.length);
      return "~" + (rest.length ? "/" + rest.join("/") : "");
    }
    return "/" + cwd.join("/");
  }

  function updatePrompt() {
    promptEl.textContent = USER + "@" + HOST + ":" + displayPath() + "$";
  }

  /* ── saída ── */
  function print(text, cls) {
    var div = document.createElement("div");
    div.className = "t-line" + (cls ? " " + cls : "");
    div.textContent = text;
    outEl.appendChild(div);
    termEl.scrollTop = termEl.scrollHeight;
  }

  function printLines(text, cls) {
    String(text).split("\n").forEach(function (l) { print(l, cls); });
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ── comandos ── */
  var MAN = {
    ls: "ls [-a] [-l] [pasta] — lista arquivos. -a mostra ocultos, -l mostra detalhes.",
    cd: "cd <pasta> — muda de diretorio. cd .. volta um nivel, cd ~ vai para a home.",
    pwd: "pwd — mostra o diretorio atual (print working directory).",
    cat: "cat <arquivo> — mostra o conteudo de um arquivo.",
    echo: "echo <texto> — imprime texto. echo oi > arquivo.txt grava em arquivo.",
    grep: "grep <texto> <arquivo> — procura linhas que contem o texto.",
    ping: "ping <host> — testa conectividade usando o protocolo ICMP.",
    nslookup: "nslookup <dominio> — consulta DNS: traduz nome em endereco IP.",
    curl: "curl <url> — faz uma requisicao HTTP e mostra a resposta.",
    nmap: "nmap <alvo> — escaneia portas TCP do alvo e mostra servicos abertos.",
    man: "man <comando> — abre o manual de um comando.",
    whoami: "whoami — mostra com qual usuario voce esta logado.",
    history: "history — lista os comandos que voce ja digitou.",
    clear: "clear — limpa a tela do terminal.",
    sudo: "sudo <comando> — executa como root. Use com sabedoria.",
    touch: "touch <arquivo> — cria um arquivo vazio.",
    mkdir: "mkdir <pasta> — cria um diretorio.",
  };

  var commands = {
    help: function () {
      print("Comandos disponíveis:", "t-accent");
      Object.keys(commands).sort().forEach(function (c) { print("  " + c); });
      print("Dica: man <comando> explica cada um. TAB completa, ↑ repete.", "t-dim");
    },
    whoami: function () { print(USER); },
    hostname: function () { print(HOST); },
    pwd: function () { print("/" + cwd.join("/")); },
    date: function () { print(new Date().toString()); },
    uname: function (args) {
      if (args.indexOf("-a") >= 0) print("Linux lab-linux 6.8.0-lab #1 SMP x86_64 GNU/Linux");
      else print("Linux");
    },
    clear: function () { outEl.innerHTML = ""; },
    history: function () {
      history.forEach(function (h, i) { print("  " + (i + 1) + "  " + h); });
    },
    echo: function (args, raw) {
      var m = raw.match(/^echo\s+(.*?)\s*>\s*(\S+)\s*$/);
      if (m) {
        var texto = m[1].replace(/^["']|["']$/g, "");
        var parts = normParts(m[2]);
        var dir = getNode(parts.slice(0, -1));
        if (!isDir(dir)) { print("bash: " + m[2] + ": Arquivo ou diretório inexistente", "t-err"); return; }
        dir[parts[parts.length - 1]] = texto;
        return;
      }
      print(raw.replace(/^echo\s?/, "").replace(/^["']|["']$/g, ""));
    },
    ls: function (args) {
      var showAll = false, longFmt = false, alvo = null;
      args.forEach(function (a) {
        if (a.startsWith("-")) {
          if (a.indexOf("a") >= 0) showAll = true;
          if (a.indexOf("l") >= 0) longFmt = true;
        } else alvo = a;
      });
      var parts = normParts(alvo);
      var node = getNode(parts);
      if (node === null) { print("ls: não é possível acessar '" + alvo + "': Arquivo ou diretório inexistente", "t-err"); return; }
      if (!isDir(node)) { print(parts[parts.length - 1]); return; }
      var nomes = Object.keys(node).sort();
      if (showAll) nomes = [".", ".."].concat(nomes);
      else nomes = nomes.filter(function (n) { return !n.startsWith("."); });
      if (longFmt) {
        print("total " + nomes.length);
        nomes.forEach(function (n) {
          if (n === "." || n === "..") { print("drwxr-xr-x  aluno alunos  " + n); return; }
          var filho = node[n];
          print((isDir(filho) ? "drwxr-xr-x" : "-rw-r--r--") + "  aluno alunos  " + n + (isDir(filho) ? "/" : ""));
        });
      } else {
        if (nomes.length) print(nomes.map(function (n) {
          return isDir(node[n]) ? n + "/" : n;
        }).join("  "));
      }
    },
    cd: function (args) {
      var alvo = args[0] || "~";
      var parts = normParts(alvo);
      var node = getNode(parts);
      if (node === null) { print("bash: cd: " + alvo + ": Arquivo ou diretório inexistente", "t-err"); return; }
      if (!isDir(node)) { print("bash: cd: " + alvo + ": Não é um diretório", "t-err"); return; }
      cwd = parts;
      updatePrompt();
    },
    cat: function (args) {
      if (!args.length) { print("cat: falta o arquivo. Uso: cat <arquivo>", "t-err"); return; }
      args.forEach(function (a) {
        var parts = normParts(a);
        var node = getNode(parts);
        if (node === null) { print("cat: " + a + ": Arquivo ou diretório inexistente", "t-err"); return; }
        if (isDir(node)) { print("cat: " + a + ": É um diretório", "t-err"); return; }
        printLines(node);
      });
    },
    grep: function (args) {
      if (args.length < 2) { print("Uso: grep <texto> <arquivo>", "t-err"); return; }
      var padrao = args[0].replace(/^["']|["']$/g, "");
      var node = getNode(normParts(args[1]));
      if (node === null || isDir(node)) { print("grep: " + args[1] + ": Arquivo ou diretório inexistente", "t-err"); return; }
      var achou = false;
      node.split("\n").forEach(function (l) {
        if (l.indexOf(padrao) >= 0) { print(l, "t-accent"); achou = true; }
      });
      if (!achou) print("(nenhuma linha encontrada)", "t-dim");
    },
    touch: function (args) {
      if (!args.length) { print("touch: falta o nome do arquivo", "t-err"); return; }
      var parts = normParts(args[0]);
      var dir = getNode(parts.slice(0, -1));
      if (!isDir(dir)) { print("touch: não é possível criar '" + args[0] + "'", "t-err"); return; }
      var nome = parts[parts.length - 1];
      if (dir[nome] === undefined) dir[nome] = "";
    },
    mkdir: function (args) {
      if (!args.length) { print("mkdir: falta o nome da pasta", "t-err"); return; }
      var parts = normParts(args[0]);
      var dir = getNode(parts.slice(0, -1));
      if (!isDir(dir)) { print("mkdir: não é possível criar '" + args[0] + "'", "t-err"); return; }
      dir[parts[parts.length - 1]] = {};
    },
    man: function (args) {
      if (!args.length) { print("Qual manual você quer? Ex: man nmap", "t-dim"); return; }
      var texto = MAN[args[0]];
      if (texto) { print(args[0].toUpperCase() + "(1) — manual do laboratório", "t-accent"); print(texto); }
      else print("Sem entrada de manual para " + args[0], "t-dim");
    },
    sudo: function (args, raw) {
      if (raw.match(/rm\s+-rf?\s+\/(\s|$)/)) {
        print("😅 Boa tentativa. Esse terminal é imortal (e o aprendizado também).", "t-warn");
        return;
      }
      print("[sudo] senha para " + USER + ": ********");
      print(USER + " não está no arquivo sudoers. Este incidente será reportado. 🚨", "t-err");
    },
    rm: function () {
      print("rm: operação bloqueada neste laboratório — aqui a gente constrói conhecimento, não destrói 😉", "t-warn");
    },
    exit: function () {
      print("Não há como sair do aprendizado... mas você pode fechar a aba 😄", "t-warn");
    },
    hack: function () {
      print("Iniciando hackeamento da NASA...", "t-accent");
      print("brincadeira 😄 hacker de verdade começa pelo básico: ping, nslookup, curl, nmap.", "t-dim");
    },
    ping: async function (args) {
      var alvo = args[0];
      if (!alvo) { print("ping: falta o host. Uso: ping <host>", "t-err"); return; }
      var ip = DNS[alvo] || (/^\d+\.\d+\.\d+\.\d+$/.test(alvo) ? alvo : null);
      if (!ip) { print("ping: " + alvo + ": Nome ou serviço desconhecido", "t-err"); return; }
      print("PING " + alvo + " (" + ip + ") 56(84) bytes of data.");
      for (var i = 1; i <= 4; i++) {
        await sleep(450);
        print("64 bytes from " + ip + ": icmp_seq=" + i + " ttl=64 time=" + (Math.random() * 8 + 1).toFixed(1) + " ms", "t-ok");
      }
      print("--- " + alvo + " estatísticas ---");
      print("4 pacotes transmitidos, 4 recebidos, 0% perda", "t-dim");
    },
    nslookup: async function (args) {
      var alvo = args[0];
      if (!alvo) { print("nslookup: falta o domínio. Uso: nslookup <dominio>", "t-err"); return; }
      await sleep(300);
      print("Servidor:\t8.8.8.8");
      print("Address:\t8.8.8.8#53");
      print("");
      var ip = DNS[alvo];
      if (ip) {
        print("Resposta não-autoritativa:");
        print("Nome:\t" + alvo, "t-ok");
        print("Address: " + ip, "t-ok");
      } else {
        print("** servidor não conseguiu encontrar " + alvo + ": NXDOMAIN", "t-err");
      }
    },
    dig: function (args) { return commands.nslookup(args); },
    curl: async function (args) {
      var url = null, showHead = false;
      args.forEach(function (a) {
        if (a === "-I" || a === "-i") showHead = true;
        else if (!a.startsWith("-")) url = a;
      });
      if (!url) { print("curl: falta a URL. Tente: curl http://lab.local", "t-err"); return; }
      if (!/^https?:\/\//.test(url)) url = "http://" + url;
      var https = url.startsWith("https://");
      var host = url.replace(/^https?:\/\//, "").split("/")[0];
      await sleep(400);
      if (showHead || !DNS[host]) {
        print("HTTP/1.1 " + (DNS[host] ? "200 OK" : "404 Not Found"), "t-accent");
        print("Server: nginx/1.24.0");
        print("Content-Type: text/html; charset=UTF-8");
        print("Date: " + new Date().toUTCString());
        if (https) print("Strict-Transport-Security: max-age=31536000");
        if (!DNS[host]) return;
        print("");
      }
      printLines([
        "<!DOCTYPE html>",
        "<html>",
        "<head><title>lab.local — servidor de treino</title></head>",
        "<body>",
        "  <h1>Servidor web do laboratório</h1>",
        "  <p>Se você está lendo isso, sua requisição HTTP funcionou.</p>",
        "  <!-- proximo passo: nmap " + host + " -->",
        "</body>",
        "</html>",
      ]);
      if (https) print("🔒 Esta resposta viajou criptografada via TLS.", "t-ok");
      else print("⚠️  HTTP puro: tudo acima trafegou em texto claro. Por isso existe HTTPS.", "t-warn");
    },
    nmap: async function (args) {
      var alvo = args.filter(function (a) { return !a.startsWith("-"); })[0];
      if (!alvo) { print("nmap: falta o alvo. Uso: nmap <alvo>", "t-err"); return; }
      var ip = DNS[alvo] || (/^\d+\.\d+\.\d+\.\d+$/.test(alvo) ? alvo : null);
      print("Starting Nmap 7.94 ( https://nmap.org )", "t-accent");
      await sleep(600);
      if (!ip) { print("Failed to resolve \"" + alvo + "\".", "t-err"); return; }
      print("Nmap scan report for " + alvo + " (" + ip + ")");
      await sleep(500);
      print("Host is up (0.0031s latency).");
      print("");
      print("PORT     STATE  SERVICE");
      var portas = [["22/tcp", "ssh"], ["53/tcp", "domain"], ["80/tcp", "http"], ["443/tcp", "https"]];
      for (var i = 0; i < portas.length; i++) {
        await sleep(320);
        print(portas[i][0].padEnd(9) + "open   " + portas[i][1], "t-ok");
      }
      print("");
      print("Nmap done: 1 IP address (1 host up) scanned", "t-dim");
    },
  };
  commands["nslookup"] = commands.nslookup;

  /* ── validadores de missão ── */
  function baseName(p) { return p.replace(/\/+$/, "").split("/").pop(); }

  var VALIDATORS = {
    "whoami": function (cmd) { return cmd === "whoami"; },
    "pwd": function (cmd) { return cmd === "pwd"; },
    "ls": function (cmd) { return cmd === "ls"; },
    "ls-a": function (cmd, args) {
      return cmd === "ls" && args.some(function (a) { return a.startsWith("-") && a.indexOf("a") >= 0; });
    },
    "cat-notas": function (cmd, args) {
      return cmd === "cat" && args.some(function (a) { return baseName(a) === "notas.txt"; });
    },
    "cat-relatorio": function (cmd, args) {
      return cmd === "cat" && args.some(function (a) { return baseName(a) === "relatorio.txt"; });
    },
    "ping": function (cmd) { return cmd === "ping"; },
    "nslookup": function (cmd) { return cmd === "nslookup" || cmd === "dig"; },
    "curl": function (cmd) { return cmd === "curl"; },
    "nmap": function (cmd) { return cmd === "nmap"; },
    "flag": function (cmd, args) {
      return cmd === "cat" && args.some(function (a) { return baseName(a) === ".secreto"; });
    },
  };

  /* ── progresso ── */
  function atualizarBarra() {
    var feitasCount = Object.keys(feitas).length;
    var el = document.getElementById("xpAtual");
    var fill = document.getElementById("xpFill");
    if (el) el.textContent = feitasCount;
    if (fill) fill.style.width = (feitasCount / totalMissoes * 100) + "%";
  }

  function confete(ancora) {
    var emojis = ["🎉", "⚡", "🚩", "🐧", "💚"];
    for (var i = 0; i < 14; i++) {
      var s = document.createElement("span");
      s.className = "confete";
      s.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      s.style.left = (Math.random() * 100) + "%";
      s.style.animationDelay = (Math.random() * 0.4) + "s";
      (ancora || document.body).appendChild(s);
      setTimeout(function (el) { el.remove(); }, 2200, s);
    }
  }

  function marcarMissao(id) {
    var card = document.getElementById("missao-" + id);
    if (card) {
      card.classList.add("missao-feita");
      var check = card.querySelector(".missao-check");
      if (check) check.textContent = "✓";
      confete(card);
    }
    var tocItem = document.getElementById("toc-missao-" + id);
    if (tocItem) tocItem.classList.add("feita");
  }

  function salvarMissao(id) {
    fetch(cfg.progressoUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ missao: id }),
    }).then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.concluida) {
          var box = document.getElementById("labConcluido");
          if (box) {
            box.style.display = "";
            confete(box);
            setTimeout(function () { box.scrollIntoView({ behavior: "smooth", block: "center" }); }, 600);
          }
        }
      }).catch(function () { /* offline: progresso fica só na tela */ });
  }

  function checarMissoes(raw) {
    var trimmed = raw.trim();
    if (!trimmed) return;
    var partsRaw = trimmed.split(/\s+/);
    var cmd = partsRaw[0];
    var args = partsRaw.slice(1);
    cfg.missoes.forEach(function (m) {
      if (feitas[m.id]) return;
      var valida = VALIDATORS[m.id];
      if (valida && valida(cmd, args, trimmed)) {
        feitas[m.id] = true;
        print("");
        print("✅ MISSÃO CUMPRIDA: " + m.titulo + " (+" + m.xp + " XP)", "t-missao");
        marcarMissao(m.id);
        salvarMissao(m.id);
        atualizarBarra();
      }
    });
  }

  /* ── execução ── */
  async function executar(raw) {
    var trimmed = raw.trim();
    print(USER + "@" + HOST + ":" + displayPath() + "$ " + trimmed, "t-cmdline");
    if (!trimmed) return;

    var parts = trimmed.split(/\s+/);
    var cmd = parts[0];
    var args = parts.slice(1);

    var fn = commands[cmd];
    if (!fn) {
      print("bash: " + cmd + ": comando não encontrado (tente 'help')", "t-err");
    } else {
      await fn(args, trimmed);
    }
    checarMissoes(trimmed);
  }

  /* ── TAB completion ── */
  function completar() {
    var val = inputEl.value;
    var tokens = val.split(/\s+/);
    var ultimo = tokens[tokens.length - 1];

    var candidatos;
    if (tokens.length === 1) {
      candidatos = Object.keys(commands);
    } else {
      var dirPart = ultimo.includes("/") ? ultimo.slice(0, ultimo.lastIndexOf("/") + 1) : "";
      var base = ultimo.slice(dirPart.length);
      var dir = getNode(normParts(dirPart || "."));
      if (!isDir(dir)) return;
      candidatos = Object.keys(dir).filter(function (n) { return n.startsWith(base); })
        .map(function (n) { return dirPart + n + (isDir(dir[n]) ? "/" : ""); });
      ultimo = ultimo;
      if (candidatos.length === 1) {
        tokens[tokens.length - 1] = candidatos[0];
        inputEl.value = tokens.join(" ");
        return;
      }
      if (candidatos.length > 1) print(candidatos.join("  "), "t-dim");
      return;
    }

    var hits = candidatos.filter(function (c) { return c.startsWith(ultimo); });
    if (hits.length === 1) {
      tokens[tokens.length - 1] = hits[0];
      inputEl.value = tokens.join(" ") + " ";
    } else if (hits.length > 1) {
      print(hits.join("  "), "t-dim");
    }
  }

  /* ── eventos ── */
  termEl.addEventListener("click", function () { inputEl.focus(); });

  inputEl.addEventListener("keydown", async function (e) {
    if (running) { e.preventDefault(); return; }
    if (e.key === "Enter") {
      var val = inputEl.value;
      inputEl.value = "";
      if (val.trim()) { history.push(val); histIdx = history.length; }
      running = true;
      try { await executar(val); } finally { running = false; }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (histIdx > 0) { histIdx--; inputEl.value = history[histIdx] || ""; }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx < history.length - 1) { histIdx++; inputEl.value = history[histIdx] || ""; }
      else { histIdx = history.length; inputEl.value = ""; }
    } else if (e.key === "Tab") {
      e.preventDefault();
      completar();
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      outEl.innerHTML = "";
    }
  });

  /* ── sidebar de missões ── */
  (function sidebarMissoes() {
    var ul = document.getElementById("tocMissoes");
    if (!ul) return;
    cfg.missoes.forEach(function (m, i) {
      var li = document.createElement("li");
      li.id = "toc-missao-" + m.id;
      if (feitas[m.id]) li.classList.add("feita");
      li.textContent = (feitas[m.id] ? "✓ " : (i + 1) + ". ") + m.titulo;
      ul.appendChild(li);
    });
  })();

  /* ── boot ── */
  print("Lab Linux 1.0 — terminal de treinamento", "t-accent");
  print("Bem-vindo(a), " + USER + ". Digite 'help' para ver os comandos.", "t-dim");
  print("Suas missões estão logo acima. Boa caçada! 🐧", "t-dim");
  print("");
  updatePrompt();
  atualizarBarra();
  setTimeout(function () { inputEl.focus(); }, 400);
})();

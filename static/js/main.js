/* ===================================================================
   Allan Dev — JS global (sem dependências)
   · Interface: header, drawer, dropdowns, busca ("/"), voltar ao topo,
     revelar ao rolar, terminal "digitando", contadores, formulários
   · Artigos: render de markdown (#postBody[data-raw]), TOC + scrollspy,
     barra de progresso de leitura
   Funções globais mantidas (usadas também por lições e páginas de IA):
   escapeHtml, inlineMarkdown, linkSeguro, highlightCode, tabelaHtml,
   markdownParaHtml, renderPostBody, copyCode.
   =================================================================== */

var REDUCE_MOTION = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

function $(id) { return document.getElementById(id); }
function toArray(list) { return Array.prototype.slice.call(list || []); }

document.addEventListener("DOMContentLoaded", function () {
  renderPostBody();            /* primeiro: lições/TOCs dependem do HTML renderizado */
  initHeader();
  initNav();
  initDropdowns();
  initSearch();
  initToc();
  initReadingBar();
  initCopyLink();
  initReveal();
  initTyping();
  initCounters();
  initPasswordToggle();
  initPasswordStrength();
  initFlash();
  initLoadingForms();
  initYear();
});

/* ── Header (sombra ao rolar) + botão "voltar ao topo" ── */
function initHeader() {
  var header = $("siteHeader");
  var toTop  = $("toTop");
  var ticking = false;

  function update() {
    ticking = false;
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (header) header.classList.toggle("is-scrolled", y > 8);
    if (toTop)  toTop.classList.toggle("show", y > 700);
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
  }, { passive: true });
  update();

  if (toTop) {
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: REDUCE_MOTION ? "auto" : "smooth" });
    });
  }
}

/* ── Menu mobile (drawer) ── */
function initNav() {
  var toggle   = $("navToggle");
  var nav      = $("siteNav");
  var backdrop = $("drawerBackdrop");
  if (!toggle || !nav) return;

  function setOpen(open) {
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    document.documentElement.classList.toggle("nav-open", open);
    if (backdrop) backdrop.classList.toggle("show", open);
  }

  toggle.addEventListener("click", function () { setOpen(!nav.classList.contains("open")); });
  if (backdrop) backdrop.addEventListener("click", function () { setOpen(false); });
  nav.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a") : null;
    if (a) setOpen(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && nav.classList.contains("open")) { setOpen(false); toggle.focus(); }
  });
  if (window.matchMedia) {
    var mq = window.matchMedia("(min-width: 960px)");
    var onChange = function (ev) { if (ev.matches) setOpen(false); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
}

/* ── Dropdowns ([data-dd] com [data-dd-btn]) ── */
function initDropdowns() {
  var dds = toArray(document.querySelectorAll("[data-dd]"));
  if (!dds.length) return;

  function close(dd) {
    dd.classList.remove("open");
    var b = dd.querySelector("[data-dd-btn]");
    if (b) b.setAttribute("aria-expanded", "false");
  }

  dds.forEach(function (dd) {
    var btn = dd.querySelector("[data-dd-btn]");
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var abrir = !dd.classList.contains("open");
      dds.forEach(function (o) { if (o !== dd) close(o); });
      dd.classList.toggle("open", abrir);
      btn.setAttribute("aria-expanded", abrir ? "true" : "false");
      if (abrir && e.detail === 0) {            /* aberto pelo teclado → foca o primeiro item */
        var first = dd.querySelector("a, .pop-item");
        if (first) first.focus();
      }
    });
    dd.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && dd.classList.contains("open")) { close(dd); btn.focus(); }
    });
  });
  document.addEventListener("click", function (e) {
    dds.forEach(function (dd) { if (!dd.contains(e.target)) close(dd); });
  });
}

/* ── Busca: atalho "/" e overlay ── */
function visibleSearchInput() {
  var inputs = document.querySelectorAll("input[data-search]");
  for (var i = 0; i < inputs.length; i++) {
    var el = inputs[i];
    if (el.closest && el.closest("#searchOverlay")) continue;
    if (el.offsetParent === null) continue;
    var r = el.getBoundingClientRect();
    if (r.width > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth) return el;
  }
  return null;
}

function initSearch() {
  var overlay = $("searchOverlay");
  var input   = $("searchOverlayInput");
  var last    = null;

  function open() {
    if (!overlay || !overlay.hidden) return;
    last = document.activeElement;
    overlay.hidden = false;
    document.documentElement.classList.add("nav-open");
    window.requestAnimationFrame(function () {
      overlay.classList.add("is-open");
      if (input) { input.focus(); input.select(); }
    });
  }
  function close() {
    if (!overlay || overlay.hidden) return;
    overlay.classList.remove("is-open");
    document.documentElement.classList.remove("nav-open");
    setTimeout(function () { overlay.hidden = true; }, REDUCE_MOTION ? 0 : 200);
    if (last && last.focus) last.focus();
  }

  toArray(document.querySelectorAll("[data-search-open]")).forEach(function (b) { b.addEventListener("click", open); });
  toArray(document.querySelectorAll("[data-search-close]")).forEach(function (b) { b.addEventListener("click", close); });
  if (overlay) overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) close(); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay && !overlay.hidden) { close(); return; }
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    var tag = t && t.tagName ? t.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || tag === "select" || (t && t.isContentEditable)) return;
    e.preventDefault();
    var el = visibleSearchInput();
    if (el) { el.focus(); if (el.select) el.select(); }
    else open();
  });
}

/* ── Revelar ao rolar ── */
function initReveal() {
  var els = toArray(document.querySelectorAll(".reveal"));
  if (!els.length) return;
  if (REDUCE_MOTION || !("IntersectionObserver" in window)) {
    els.forEach(function (el) { el.classList.remove("reveal"); });
    return;
  }
  function show(el) {
    el.classList.add("in");
    var delay = 700 + (parseInt(el.style.getPropertyValue("--i"), 10) || 0) * 70;
    setTimeout(function () { el.classList.remove("reveal", "in"); }, delay);   /* devolve o controle do hover ao CSS do componente */
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { show(en.target); io.unobserve(en.target); }
    });
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.04 });
  els.forEach(function (el) { io.observe(el); });
}

/* ── Terminal decorativo "digitando" ([data-typing]) ── */
function initTyping() {
  var boxes = toArray(document.querySelectorAll("[data-typing]"));
  if (!boxes.length || REDUCE_MOTION) return;

  boxes.forEach(function (box) {
    var lines = toArray(box.querySelectorAll(".tx-line"));
    if (!lines.length) return;
    box.classList.add("is-typing");

    var caret = document.createElement("span");
    caret.className = "tx-caret";
    var items = lines.map(function (el) {
      var cmd = el.hasAttribute("data-cmd") ? el.querySelector(".tx-cmd") : null;
      var txt = cmd ? cmd.textContent : "";
      if (cmd) cmd.textContent = "";
      return { el: el, cmd: cmd, txt: txt };
    });

    var i = 0;
    function typeCmd(it, done) {
      var n = 0;
      (function tick() {
        n++;
        it.cmd.textContent = it.txt.slice(0, n);
        it.cmd.appendChild(caret);
        if (n < it.txt.length) setTimeout(tick, 24 + Math.random() * 40);
        else setTimeout(done, 420);
      })();
    }
    function next() {
      if (i >= items.length) return;
      var it = items[i++];
      it.el.classList.add("is-on");
      if (it.cmd && it.txt) typeCmd(it, next);
      else if (it.cmd) it.cmd.appendChild(caret);          /* último prompt: só o cursor piscando */
      else setTimeout(next, 120);
    }

    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { io.disconnect(); setTimeout(next, 450); }
      }, { threshold: 0.25 });
      io.observe(box);
    } else {
      setTimeout(next, 450);
    }
  });
}

/* ── Contadores animados ([data-count]) ── */
function initCounters() {
  var els = toArray(document.querySelectorAll("[data-count]"));
  if (!els.length) return;

  function run(el) {
    var target = parseInt(el.getAttribute("data-count"), 10);
    if (isNaN(target) || target <= 0) return;
    var start = null, dur = 1100;
    el.textContent = "0";
    window.requestAnimationFrame(function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) window.requestAnimationFrame(step);
    });
  }

  if (!("IntersectionObserver" in window) || REDUCE_MOTION) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { run(en.target); io.unobserve(en.target); } });
  }, { threshold: 0.6 });
  els.forEach(function (el) { io.observe(el); });
}

/* ── Rodapé: ano atual ── */
function initYear() {
  toArray(document.querySelectorAll("[data-year]")).forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
}

/* ── Mensagens flash: botão de fechar + auto-dispensa de sucesso ── */
function initFlash() {
  function dispensar(f) {
    f.classList.add("is-leaving");
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 320);
  }
  toArray(document.querySelectorAll(".flash-wrap .flash, .auth-card .flash")).forEach(function (f) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "flash-close";
    b.setAttribute("aria-label", "Fechar mensagem");
    b.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#u-x"/></svg>';
    b.addEventListener("click", function () { dispensar(f); });
    f.appendChild(b);
    if (f.classList.contains("flash-sucesso")) setTimeout(function () { dispensar(f); }, 7000);
  });
}

/* ── Formulários: estado de carregamento ao enviar ── */
function initLoadingForms() {
  var forms = toArray(document.querySelectorAll("form[data-loading-form]"));
  forms.forEach(function (form) {
    form.addEventListener("submit", function () {
      var btn = form.querySelector('button[type="submit"]');
      if (!btn) return;
      btn.classList.add("is-loading");
      btn.setAttribute("aria-busy", "true");
      setTimeout(function () { btn.disabled = true; }, 0);   /* depois do envio, evita clique duplo */
    });
  });
  window.addEventListener("pageshow", function (ev) {        /* voltou pelo histórico (bfcache) */
    if (!ev.persisted) return;
    forms.forEach(function (form) {
      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = false; btn.classList.remove("is-loading"); btn.removeAttribute("aria-busy"); }
    });
  });
}

/* ── Mostrar/ocultar senha ([data-toggle-pw="idDoInput"]) ── */
function initPasswordToggle() {
  toArray(document.querySelectorAll("[data-toggle-pw]")).forEach(function (btn) {
    var input = $(btn.getAttribute("data-toggle-pw"));
    if (!input) return;
    btn.addEventListener("click", function () {
      var mostrar = input.type === "password";
      input.type = mostrar ? "text" : "password";
      btn.setAttribute("aria-pressed", mostrar ? "true" : "false");
      btn.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
      input.focus();
    });
  });
}

/* ── Medidor de força da senha + confirmação ── */
var SENHAS_FRACAS = ["12345678", "123456789", "1234567890", "password", "password1", "senha123", "senha1234", "qwertyui", "qwerty123", "abc12345", "11111111", "00000000", "iloveyou", "admin123"];

function avaliarSenha(v) {
  var regras = {
    len:  v.length >= 8,
    "case": /[a-z]/.test(v) && /[A-Z]/.test(v),
    num:  /\d/.test(v),
    sym:  /[^A-Za-z0-9]/.test(v)
  };
  var ok = 0;
  Object.keys(regras).forEach(function (k) { if (regras[k]) ok++; });
  var nivel = 0;
  if (v.length) {
    nivel = Math.max(1, ok);
    if (!regras.len) nivel = 1;
    else if (ok === 4 && v.length < 10) nivel = 3;
    if (SENHAS_FRACAS.indexOf(v.toLowerCase()) !== -1) nivel = 1;
  }
  return { regras: regras, nivel: nivel };
}

function initPasswordStrength() {
  var input = document.querySelector("[data-strength-input]");
  var meter = document.querySelector("[data-strength]");
  var labels = ["—", "Fraca", "Razoável", "Boa", "Forte"];

  if (input && meter) {
    var lab = meter.querySelector("[data-strength-label]");
    var atualizar = function () {
      var r = avaliarSenha(input.value);
      meter.setAttribute("data-level", String(r.nivel));
      if (lab) lab.textContent = labels[r.nivel];
      toArray(meter.querySelectorAll("[data-rule]")).forEach(function (li) {
        li.classList.toggle("ok", !!r.regras[li.getAttribute("data-rule")]);
      });
    };
    input.addEventListener("input", atualizar);
    atualizar();
  }

  toArray(document.querySelectorAll("[data-match-for]")).forEach(function (hint) {
    var a = $(hint.getAttribute("data-match-for"));
    var b = $(hint.getAttribute("data-match-with"));
    if (!a || !b) return;
    var atualizar = function () {
      if (!a.value) { hint.textContent = ""; hint.className = "field-hint"; return; }
      var igual = a.value === b.value;
      hint.textContent = igual ? "As senhas coincidem." : "As senhas ainda não coincidem.";
      hint.className = "field-hint " + (igual ? "ok" : "bad");
    };
    a.addEventListener("input", atualizar);
    b.addEventListener("input", atualizar);
  });
}

/* ── Copiar texto / link do artigo ([data-copy-link]) ── */
function copiarTexto(texto) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto);
  return new Promise(function (resolve, reject) {
    var ta = document.createElement("textarea");
    ta.value = texto;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (ok) resolve(); else reject(new Error("copy failed"));
  });
}

function initCopyLink() {
  toArray(document.querySelectorAll("[data-copy-link]")).forEach(function (btn) {
    btn.addEventListener("click", function () {
      copiarTexto(location.href.split("#")[0]).then(function () {
        var s = btn.querySelector("span");
        var antigo = s ? s.textContent : "";
        btn.classList.add("copied");
        if (s) s.textContent = "Link copiado!";
        setTimeout(function () { btn.classList.remove("copied"); if (s) s.textContent = antigo; }, 2000);
      }, function () {});
    });
  });
}

/* ── TOC do artigo (só quando #tocList tem [data-toc-auto]) + scrollspy ──
   A página de lição monta o próprio TOC; sem o atributo, nada aqui roda. */
function headerHeight() {
  var v = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-h"), 10);
  return isNaN(v) ? 64 : v;
}

function initToc() {
  var body = $("postBody");
  var list = $("tocList");
  if (!body || !list || !list.hasAttribute("data-toc-auto")) return;

  var heads  = toArray(body.querySelectorAll("h2, h3"));
  var mobile = $("tocListMobile");
  var box    = list.closest ? list.closest(".toc-box") : null;
  var mobBox = document.querySelector("[data-toc-mobile]");

  if (!heads.length) {
    list.hidden = true;
    if (box) { var h5 = box.querySelector("h5"); if (h5) h5.hidden = true; }
    if (mobBox) mobBox.hidden = true;
    return;
  }

  heads.forEach(function (h, i) {
    if (!h.id) h.id = "sec-" + i;
    [list, mobile].forEach(function (ul) {
      if (!ul) return;
      var li = document.createElement("li");
      if (h.tagName === "H3") li.className = "toc-h3";
      var a = document.createElement("a");
      a.href = "#" + h.id;
      a.textContent = h.textContent;
      li.appendChild(a);
      ul.appendChild(li);
    });
  });

  /* âncora "#" ao lado do título (depois de montar o TOC, para não entrar no texto dele) */
  heads.forEach(function (h) {
    var a = document.createElement("a");
    a.className = "h-anchor";
    a.href = "#" + h.id;
    a.setAttribute("aria-label", "Link direto para esta seção");
    a.textContent = "#";
    h.appendChild(a);
  });

  var links  = toArray(list.querySelectorAll("a"));
  var linksM = mobile ? toArray(mobile.querySelectorAll("a")) : [];
  var scroller = list.closest ? list.closest(".toc-sidebar") : null;
  var ticking = false;
  var atual = -2;

  function spy() {
    ticking = false;
    var limite = headerHeight() + 48;
    var idx = -1;
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].getBoundingClientRect().top - limite <= 0) idx = i; else break;
    }
    var doc = document.documentElement;
    if (window.innerHeight + window.pageYOffset >= doc.scrollHeight - 4) idx = heads.length - 1;
    if (idx === atual) return;
    atual = idx;
    links.forEach(function (l, i) { l.classList.toggle("toc-active", i === idx); });
    linksM.forEach(function (l, i) { l.classList.toggle("toc-active", i === idx); });
    if (scroller && idx >= 0 && links[idx]) {            /* mantém o item ativo visível no TOC rolável */
      var top = links[idx].offsetTop, bot = top + links[idx].offsetHeight;
      if (top < scroller.scrollTop) scroller.scrollTop = Math.max(0, top - 60);
      else if (bot > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = bot - scroller.clientHeight + 60;
    }
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(spy); }
  }, { passive: true });
  window.addEventListener("resize", spy);
  spy();
}

/* ── Barra de progresso de leitura (e % lido no TOC) ── */
function initReadingBar() {
  var bar   = $("readingBar");
  var body  = $("postBody");
  var fill  = document.querySelector("[data-read-fill]");
  var pctEl = document.querySelector("[data-read-pct]");
  var left  = document.querySelector("[data-read-left]");
  var box   = document.querySelector(".toc-progress");
  if (!bar && !fill) return;
  var minTotal = box ? (parseInt(box.getAttribute("data-min"), 10) || 1) : 1;
  var ticking = false;

  function progresso() {
    var doc = document.documentElement;
    var vh  = window.innerHeight;
    var p;
    if (body && body.offsetHeight > 0) {
      var r = body.getBoundingClientRect();
      p = (vh * 0.9 - r.top) / r.height;
    } else {
      var h = doc.scrollHeight - doc.clientHeight;
      p = h > 0 ? (doc.scrollTop || document.body.scrollTop) / h : 0;
    }
    if (window.pageYOffset + vh >= doc.scrollHeight - 4) p = 1;
    return Math.min(1, Math.max(0, p));
  }
  function update() {
    ticking = false;
    var p = progresso();
    var pct = Math.round(p * 100);
    if (bar)   bar.style.width = (p * 100) + "%";
    if (fill)  fill.style.width = (p * 100) + "%";
    if (pctEl) pctEl.textContent = pct + "%";
    if (left)  left.textContent = pct >= 98 ? "concluído" : Math.max(1, Math.ceil(minTotal * (1 - p))) + " min restantes";
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener("resize", update);
  update();
}

/* ===================================================================
   Markdown → HTML
   =================================================================== */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(text) {
  var out = escapeHtml(text);
  var codigos = [];
  /* protege `código` para que ** e * dentro dele não virem negrito/itálico */
  out = out.replace(/`([^`]+)`/g, function (_m, c) {
    codigos.push(c);
    return "\u0000" + (codigos.length - 1) + "\u0000";
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_m, label, url) {
    return linkSeguro(label, url);
  });
  out = out.replace(/\u0000(\d+)\u0000/g, function (_m, i) {
    return "<code>" + codigos[parseInt(i, 10)] + "</code>";
  });
  return out;
}

/* Link markdown seguro: só http(s)://, caminho absoluto "/" ou âncora "#".
   Qualquer outro esquema (javascript:, data:, vbscript:...) vira só o texto.
   O href já vem escapado por escapeHtml (aspas viram &quot;) — aqui ainda
   barramos qualquer marcação/espaço/aspas para não dar pra quebrar o atributo. */
function linkSeguro(label, url) {
  var href = String(url).trim();
  var permitido = /^(https?:\/\/|\/|#)/i.test(href);
  if (!permitido || /[<>"'`\s\x00-\x1f]/.test(href)) return label;
  var externo = /^https?:\/\//i.test(href);
  return '<a href="' + href + '"' + (externo ? ' target="_blank"' : "") +
    ' rel="noopener noreferrer">' + label + "</a>";
}

/* ── Realce de sintaxe ──
   Passada única: uma regex com uma alternativa por tipo de token, aplicada ao
   código CRU (o escape só acontece depois, token a token). Antes eram vários
   .replace() em cadeia e o seguinte reprocessava o HTML já inserido (aparecia
   `"tok-flag">` no meio do código). */
var LANG_ALIAS = {
  py: "python", python3: "python",
  sh: "bash", shell: "bash", zsh: "bash", console: "bash", terminal: "bash", "shell-session": "bash", powershell: "bash", ps1: "bash",
  js: "javascript", node: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  yml: "yaml", "c++": "cpp", cc: "cpp", h: "c", rb: "ruby", golang: "go", rs: "rust",
  request: "http", response: "http", mysql: "sql", sqlite: "sql", psql: "sql", patch: "diff"
};
var LANG_LABEL = {
  python: "Python", bash: "Bash", javascript: "JavaScript", typescript: "TypeScript", json: "JSON",
  http: "HTTP", sql: "SQL", c: "C", cpp: "C++", java: "Java", go: "Go", rust: "Rust", php: "PHP",
  ruby: "Ruby", html: "HTML", xml: "XML", yaml: "YAML", diff: "Diff"
};

var CMDS_BASH = "sudo|apt|apt-get|apt-cache|dpkg|yum|dnf|pacman|snap|pip|pip3|python|python3|nmap|ncat|nc|netcat|socat|curl|wget|ssh|scp|sftp|ftp|telnet|chmod|chown|chgrp|ls|cd|pwd|cat|less|more|head|tail|grep|egrep|awk|sed|cut|tr|sort|uniq|wc|tee|xargs|find|locate|echo|printf|export|source|alias|unset|env|mkdir|rmdir|rm|cp|mv|touch|ln|tar|gzip|gunzip|zip|unzip|dd|df|du|mount|umount|ps|top|htop|kill|killall|nohup|systemctl|service|journalctl|crontab|useradd|usermod|userdel|passwd|su|id|whoami|who|last|uname|hostname|ip|ifconfig|route|ping|traceroute|tracepath|dig|nslookup|host|whois|netstat|ss|lsof|tcpdump|tshark|wireshark|iptables|nft|ufw|openssl|base64|xxd|hexdump|strings|file|objdump|readelf|ldd|strace|ltrace|gdb|gcc|make|git|docker|kubectl|helm|sqlmap|hydra|john|hashcat|gobuster|ffuf|nikto|wfuzz|msfconsole|msfvenom|searchsploit|exit|man|history|date|sleep|read|eval|exec|time|jq|proxychains|aircrack-ng|airodump-ng|airmon-ng|aireplay-ng|enum4linux|smbclient|dirb|theHarvester|dmesg|lsmod|modprobe|setcap|getcap|chroot|unshare|nsenter|capsh";

var KW_GENERIC = "if|else|elif|for|while|do|switch|case|default|break|continue|return|goto|struct|union|enum|typedef|static|const|extern|sizeof|volatile|register|inline|class|public|private|protected|new|delete|this|try|catch|except|finally|throw|throws|import|export|from|function|def|async|await|var|let|package|func|defer|go|chan|map|range|interface|impl|fn|pub|mut|use|mod|match|trait|namespace|using|template|typename|include|define|null|nullptr|true|false|NULL|undefined|yield|extends|implements|final|abstract|override|void|int|char|long|short|unsigned|signed|float|double|bool|boolean|byte|string|size_t|uint8_t|uint16_t|uint32_t|uint64_t|in|of|is|not|and|or|typeof|instanceof|echo|require|lambda";

var SYNTAX = {
  python: {
    flags: "gm",
    rules: [
      ["comment", /#[^\n]*/],
      ["string",  /[rRbBfFuU]{0,2}(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/],
      ["meta",    /@[A-Za-z_][\w.]*/],
      ["keyword", /\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b/],
      ["var",     /\b(?:True|False|None|self|cls)\b/],
      ["func",    /\b[A-Za-z_]\w*(?=\()/],
      ["number",  /\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/]
    ]
  },
  bash: {
    flags: "gm",
    rules: [
      ["comment", /(?:^|[ \t])#[^\n]*/],
      ["prompt",  /^\$ /],
      ["string",  /"(?:\\[\s\S]|[^"\\])*"|'[^'\n]*'/],
      ["var",     /\$\{[^}\n]*\}|\$[A-Za-z_]\w*|\$[0-9?#@!*$]/],
      ["flag",    /(?:^|[ \t(])--?[A-Za-z][\w-]*/],
      ["bash",    new RegExp("\\b(?:" + CMDS_BASH + ")\\b")],
      ["number",  /\b\d+(?:\.\d+)*\b/],
      ["op",      /\|\|?|&&|;|>>?|<<?|&>/]
    ]
  },
  sql: {
    flags: "gmi",
    rules: [
      ["comment", /--[^\n]*|\/\*[\s\S]*?\*\//],
      ["string",  /'(?:''|[^'])*'|"[^"\n]*"/],
      ["var",     /`[^`\n]*`/],
      ["keyword", /\b(?:SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TABLE|DATABASE|INTO|VALUES|AND|OR|NOT|UNION|ALL|NULL|JOIN|LEFT|RIGHT|INNER|OUTER|ON|SET|LIMIT|OFFSET|ORDER|GROUP|BY|HAVING|AS|IN|LIKE|IS|DISTINCT|EXISTS|CASE|WHEN|THEN|ELSE|END|SLEEP|BENCHMARK|XOR|ASC|DESC|INFORMATION_SCHEMA)\b/],
      ["func",    /\b[A-Za-z_]\w*(?=\()/],
      ["number",  /\b\d+(?:\.\d+)?\b/]
    ]
  },
  http: {
    flags: "gm",
    rules: [
      ["keyword", /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\b/],
      ["meta",    /\bHTTP\/\d(?:\.\d)?\b/],
      ["prop",    /^[A-Za-z][A-Za-z0-9-]*(?=:)/],
      ["string",  /"(?:\\.|[^"\\\n])*"/],
      ["keyword", /\b(?:true|false|null)\b/],
      ["number",  /\b\d+(?:\.\d+)?\b/]
    ]
  },
  json: {
    flags: "gm",
    rules: [
      ["prop",    /"(?:\\.|[^"\\\n])*"(?=\s*:)/],
      ["string",  /"(?:\\.|[^"\\\n])*"/],
      ["keyword", /\b(?:true|false|null)\b/],
      ["number",  /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/]
    ]
  },
  html: {
    flags: "gm",
    rules: [
      ["comment", /<!--[\s\S]*?-->/],
      ["string",  /"[^"\n]*"|'[^'\n]*'/],
      ["keyword", /<\/?[A-Za-z][\w:-]*|\/?>/],
      ["var",     /\b[\w:-]+(?==)/]
    ]
  },
  yaml: {
    flags: "gmi",
    rules: [
      ["comment", /#[^\n]*/],
      ["prop",    /^[ \t-]*[\w."'-]+(?=:(?:\s|$))/],
      ["string",  /"(?:\\.|[^"\\\n])*"|'[^'\n]*'/],
      ["keyword", /\b(?:true|false|null|yes|no)\b/],
      ["number",  /\b\d+(?:\.\d+)?\b/]
    ]
  },
  diff: {
    flags: "gm",
    rules: [
      ["comment", /^(?:\+\+\+|---|diff |index )[^\n]*/],
      ["meta",    /^@@[^\n]*/],
      ["add",     /^\+[^\n]*/],
      ["del",     /^-[^\n]*/]
    ]
  },
  generic: {
    flags: "gm",
    rules: [
      ["comment", /\/\/[^\n]*|\/\*[\s\S]*?\*\//],
      ["string",  /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\[\s\S]|[^`\\])*`/],
      ["meta",    /^[ \t]*#\s*(?:include|define|ifdef|ifndef|endif|pragma|if|else)\b[^\n]*/],
      ["keyword", new RegExp("\\b(?:" + KW_GENERIC + ")\\b")],
      ["func",    /\b[A-Za-z_]\w*(?=\()/],
      ["number",  /\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?\b/]
    ]
  }
};
["javascript", "typescript", "c", "cpp", "java", "go", "rust", "php", "ruby"].forEach(function (l) { SYNTAX[l] = SYNTAX.generic; });
SYNTAX.xml = SYNTAX.html;

function canonicalLang(lang) {
  var l = String(lang || "").toLowerCase().trim();
  return LANG_ALIAS[l] || l;
}

function compilarSintaxe(def) {
  if (def._re === undefined) {
    try {
      def._re = new RegExp(def.rules.map(function (r) { return "(" + r[1].source + ")"; }).join("|"), def.flags);
    } catch (e) { def._re = null; }
  }
  return def._re;
}

function tokenizar(code, def) {
  var re = compilarSintaxe(def);
  if (!re) return escapeHtml(code);
  re.lastIndex = 0;
  var out = "", last = 0, m;
  while ((m = re.exec(code)) !== null) {
    if (m[0] === "") { re.lastIndex++; continue; }
    var g = 1;
    while (g < m.length && m[g] === undefined) g++;
    out += escapeHtml(code.slice(last, m.index)) +
      '<span class="tok-' + def.rules[g - 1][0] + '">' + escapeHtml(m[0]) + "</span>";
    last = re.lastIndex;
  }
  return out + escapeHtml(code.slice(last));
}

function highlightCode(code, lang) {
  var def = SYNTAX[canonicalLang(lang)];
  if (!def) return escapeHtml(code);
  return tokenizar(code, def);
}

/* ── Tabelas markdown ──
   Bloco de linhas "| a | b |" com ou sem separador |---|---|.
   Sem separador, vira só corpo (sem cabeçalho). */
function dividirLinhaTabela(linha) {
  var s = linha.trim();
  if (s.charAt(0) === "|") s = s.slice(1);
  if (s.charAt(s.length - 1) === "|" && s.charAt(s.length - 2) !== "\\") s = s.slice(0, -1);
  var cels = [], atual = "";
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (c === "\\" && s.charAt(i + 1) === "|") { atual += "|"; i++; }
    else if (c === "|") { cels.push(atual.trim()); atual = ""; }
    else atual += c;
  }
  cels.push(atual.trim());
  return cels;
}

function ehSeparadorTabela(linha) {
  var t = String(linha).trim();
  return t.indexOf("|") !== -1 && t.indexOf("-") !== -1 &&
    /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(t);
}

function tabelaHtml(linhas) {
  var rows   = linhas.map(dividirLinhaTabela);
  var temSep = linhas.length > 1 && ehSeparadorTabela(linhas[1]);
  var alinhar = temSep ? rows[1].map(function (c) {
    var e = c.charAt(0) === ":", d = c.charAt(c.length - 1) === ":";
    return e && d ? "center" : (d ? "right" : "");
  }) : [];
  var cab   = temSep ? rows[0] : null;
  var corpo = temSep ? rows.slice(2) : rows;
  var ncols = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);

  function cel(tag, c, i) {
    var cls = alinhar[i] ? ' class="ta-' + alinhar[i] + '"' : "";
    return "<" + tag + cls + ">" + inlineMarkdown(c || "") + "</" + tag + ">";
  }
  function linha(r, tag) {
    var h = "<tr>";
    for (var i = 0; i < ncols; i++) h += cel(tag, r[i], i);
    return h + "</tr>";
  }
  var html = '<div class="table-wrap"><table>';
  if (cab) html += "<thead>" + linha(cab, "th") + "</thead>";
  html += "<tbody>" + corpo.map(function (r) { return linha(r, "td"); }).join("") + "</tbody></table></div>";
  return html;
}

/* ── Blockquote → callout (Nota / Dica / Aviso / Perigo) ou citação ── */
var CALLOUTS = {
  nota: "info", "observação": "info", observacao: "info", info: "info", note: "info",
  dica: "tip", tip: "tip", truque: "tip",
  aviso: "warn", "atenção": "warn", atencao: "warn", cuidado: "warn", importante: "warn", warning: "warn", alerta: "warn",
  perigo: "danger", danger: "danger"
};

function renderBlockquote(linhas) {
  var primeira = linhas[0] || "";
  var tipo = "quote", titulo = "";
  var m = primeira.match(/^(?:\*\*)?\s*(Nota|Observação|Observacao|Info|Note|Dica|Tip|Truque|Aviso|Atenção|Atencao|Cuidado|Importante|Warning|Alerta|Perigo|Danger)\s*(?:\*\*\s*:?|:\s*(?:\*\*)?)\s*/i);
  if (m) {
    tipo = CALLOUTS[m[1].toLowerCase()] || "info";
    titulo = m[1];
    linhas = linhas.slice();
    linhas[0] = primeira.slice(m[0].length);
  }
  var paragrafos = [], atual = [];
  linhas.forEach(function (l) {
    if (l.trim() === "") { if (atual.length) { paragrafos.push(atual); atual = []; } }
    else atual.push(l);
  });
  if (atual.length) paragrafos.push(atual);
  var corpo = paragrafos.map(function (p) {
    return "<p>" + p.map(inlineMarkdown).join("<br>") + "</p>";
  }).join("");
  return '<blockquote class="callout callout-' + tipo + '">' +
    (titulo ? '<strong class="callout-title">' + escapeHtml(titulo) + "</strong>" : "") + corpo + "</blockquote>";
}

function slugify(txt) {
  var s = String(txt).replace(/[`*_~]/g, "");
  if (s.normalize) s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function markdownParaHtml(md) {
  var linhas       = md.replace(/\r\n/g, "\n").split("\n");
  var html         = "";
  var dentroLista  = null;
  var dentroCodigo = false;
  var bufferCodigo = [];
  var langAtual    = "";
  var usados       = {};

  function fecharLista() {
    if (dentroLista) {
      html += "</" + dentroLista + ">";
      dentroLista = null;
    }
  }
  function idTitulo(texto, i) {
    var base = "sec-" + (slugify(texto) || i), id = base, n = 2;
    while (usados[id]) id = base + "-" + (n++);
    usados[id] = true;
    return id;
  }
  function blocoCodigo(codigo, lang) {
    var canon = canonicalLang(lang);
    var label = LANG_LABEL[canon] || (lang ? lang : "Código");
    return '<pre' + (canon === "bash" ? ' data-shell="1"' : "") + '>' +
      '<div class="code-header">' +
        '<span class="code-lang" data-lang="' + escapeHtml(canon || "text") + '">' + escapeHtml(label) + '</span>' +
        '<button type="button" class="code-copy" onclick="copyCode(this)" aria-label="Copiar código"><span>Copiar</span></button>' +
      '</div>' +
      '<code>' + highlightCode(codigo, canon) + '</code>' +
    '</pre>';
  }

  for (var i = 0; i < linhas.length; i++) {
    var linha   = linhas[i];
    var trimmed = linha.trim();

    /* code fence */
    if (trimmed.startsWith("```")) {
      if (!dentroCodigo) {
        dentroCodigo = true;
        bufferCodigo = [];
        langAtual    = trimmed.slice(3).toLowerCase().trim() || "";
      } else {
        dentroCodigo = false;
        html += blocoCodigo(bufferCodigo.join("\n"), langAtual);
        langAtual = "";
      }
      continue;
    }
    if (dentroCodigo) {
      bufferCodigo.push(linha);
      continue;
    }

    if (trimmed === "") {
      fecharLista();
      continue;
    }

    /* tabela: "| a | b |" (com ou sem separador) ou "a | b" seguido de separador */
    var iniciaPipe = trimmed.charAt(0) === "|" && trimmed.indexOf("|", 1) !== -1;
    var comSep     = trimmed.indexOf("|") !== -1 && i + 1 < linhas.length && ehSeparadorTabela(linhas[i + 1]);
    if (iniciaPipe || comSep) {
      fecharLista();
      var bloco = [trimmed], j = i + 1;
      if (j < linhas.length && ehSeparadorTabela(linhas[j])) { bloco.push(linhas[j].trim()); j++; }
      while (j < linhas.length) {
        var t = linhas[j].trim();
        if (t === "") break;
        if (comSep ? t.indexOf("|") === -1 : t.charAt(0) !== "|") break;
        bloco.push(t);
        j++;
      }
      html += tabelaHtml(bloco);
      i = j - 1;
      continue;
    }

    /* headings */
    if (trimmed.startsWith("#### ")) {
      fecharLista();
      html += '<h4 id="' + idTitulo(trimmed.slice(5), i) + '">' + inlineMarkdown(trimmed.slice(5)) + "</h4>";
    } else if (trimmed.startsWith("### ")) {
      fecharLista();
      html += '<h3 id="' + idTitulo(trimmed.slice(4), i) + '">' + inlineMarkdown(trimmed.slice(4)) + "</h3>";
    } else if (trimmed.startsWith("## ")) {
      fecharLista();
      html += '<h2 id="' + idTitulo(trimmed.slice(3), i) + '">' + inlineMarkdown(trimmed.slice(3)) + "</h2>";
    } else if (trimmed.startsWith("# ")) {
      fecharLista();
      html += '<h2 id="' + idTitulo(trimmed.slice(2), i) + '">' + inlineMarkdown(trimmed.slice(2)) + "</h2>";

    /* ordered list */
    } else if (/^(\d+)\.\s/.test(trimmed)) {
      var match = trimmed.match(/^(\d+)\.\s+(.*)/);
      if (dentroLista !== "ol") { fecharLista(); html += "<ol>"; dentroLista = "ol"; }
      html += "<li>" + inlineMarkdown(match[2]) + "</li>";

    /* unordered list */
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (dentroLista !== "ul") { fecharLista(); html += "<ul>"; dentroLista = "ul"; }
      html += "<li>" + inlineMarkdown(trimmed.slice(2)) + "</li>";

    /* blockquote (agrupa linhas consecutivas) */
    } else if (trimmed.charAt(0) === ">") {
      fecharLista();
      var citacao = [];
      var k = i;
      while (k < linhas.length && linhas[k].trim().charAt(0) === ">") {
        citacao.push(linhas[k].trim().replace(/^>\s?/, ""));
        k++;
      }
      html += renderBlockquote(citacao);
      i = k - 1;

    /* horizontal rule */
    } else if (/^---+$/.test(trimmed)) {
      fecharLista();
      html += "<hr>";

    /* paragraph */
    } else {
      fecharLista();
      html += "<p>" + inlineMarkdown(trimmed) + "</p>";
    }
  }

  fecharLista();
  if (dentroCodigo && bufferCodigo.length) {
    html += blocoCodigo(bufferCodigo.join("\n"), langAtual);
  }

  return html;
}

function renderPostBody() {
  var el = document.getElementById("postBody");
  if (!el) return;
  el.innerHTML = markdownParaHtml(el.dataset.raw || "");
}

/* Copy code button */
function copyCode(btn) {
  var pre  = btn.closest("pre");
  var code = pre ? pre.querySelector("code") : null;
  if (!code) return;
  var text = code.innerText || code.textContent;
  if (pre.hasAttribute("data-shell")) text = text.replace(/^\$ /gm, "");   /* não copia o "$ " do prompt */
  var label = btn.querySelector("span") || btn;
  copiarTexto(text).then(function () {
    label.textContent = "Copiado!";
    btn.classList.add("copied");
    setTimeout(function () {
      label.textContent = "Copiar";
      btn.classList.remove("copied");
    }, 2000);
  }, function () {
    label.textContent = "Erro";
    setTimeout(function () { label.textContent = "Copiar"; }, 2000);
  });
}

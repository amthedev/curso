/* ===================================================================
   Cronograma — interações do treino diário e do onboarding.
   JS puro, sem dependências. Cada bloco só liga se o seu markup existir:
     [data-cr-saudacao]   saudação por horário
     [data-count]         contagem animada dos números
     [data-cr-gerar]      "montando seu treino de hoje" (POST gerar_hoje)
     #crBau               baú do dia (POST abrir_bau + confete)
     [data-cr-arvore]     filtro e dicas da árvore de habilidades
     [data-hm-info]       detalhe de dia no calendário
     #crOnb / #crWiz      wizard de 3 passos do onboarding
   =================================================================== */
(function () {
  "use strict";
  if (window.__crLoaded) return;
  window.__crLoaded = true;

  var REDUCE = false;
  try { REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* segue sem */ }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function svgUse(id, cls) {
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg");
    s.setAttribute("class", "ico " + (cls || ""));
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("focusable", "false");
    var u = document.createElementNS(ns, "use");
    u.setAttribute("href", "#" + id);
    s.appendChild(u);
    return s;
  }
  function esperar(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
  function pt(n, casas) { return Number(n).toFixed(casas == null ? 1 : casas).replace(".", ","); }
  function guardar(chave, valor) {
    try { if (valor == null) sessionStorage.removeItem(chave); else sessionStorage.setItem(chave, valor); } catch (e) { /* ignore */ }
  }
  function ler(chave) { try { return sessionStorage.getItem(chave); } catch (e) { return null; } }

  /* POST JSON (mesma origem). Devolve {status, dados}; rejeita só em falha de rede. */
  function postJSON(url, corpo, ms) {
    var ctl = ("AbortController" in window) ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms || 120000) : null;
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(corpo || {}),
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      if (timer) clearTimeout(timer);
      return r.json().catch(function () { return null; }).then(function (dados) {
        if (r.status === 401 && dados && dados.login) {
          window.location.href = dados.login + "?proximo=" + encodeURIComponent(window.location.pathname);
        }
        return { status: r.status, ok: r.ok && dados && dados.ok !== false, dados: dados };
      });
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  /* Mensagem de erro amigável: nunca expõe termos técnicos do backend. */
  function mensagemAmigavel(dados, padrao) {
    var m = dados && typeof dados.erro === "string" ? dados.erro.trim() : "";
    if (m && m.length <= 140 && !/\b(IA|OpenRouter|modelo|API|token|chave|stack|traceback)\b/i.test(m)) return m;
    return padrao;
  }

  /* ── saudação por horário ─────────────────────────────────────── */
  function initSaudacao() {
    var alvo = $("[data-cr-saudacao]");
    if (!alvo) return;
    var h = new Date().getHours();
    alvo.textContent = h >= 5 && h < 12 ? "Bom dia" : (h >= 12 && h < 18 ? "Boa tarde" : "Boa noite");
  }

  /* ── contagem animada ─────────────────────────────────────────── */
  function contar(no, ate, dur) {
    var t0 = null;
    function passo(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      no.textContent = String(Math.round(ate * e));
      if (p < 1) requestAnimationFrame(passo);
    }
    requestAnimationFrame(passo);
  }
  function initContagem() {
    var nos = $$("[data-count]");
    if (!nos.length || REDUCE || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (itens) {
      itens.forEach(function (it) {
        if (!it.isIntersecting) return;
        io.unobserve(it.target);
        var alvo = parseInt(it.target.getAttribute("data-count"), 10) || 0;
        if (alvo > 0) contar(it.target, alvo, 900);
      });
    }, { threshold: 0.4 });
    nos.forEach(function (n) {
      var alvo = parseInt(n.getAttribute("data-count"), 10) || 0;
      if (alvo > 0) { n.textContent = "0"; io.observe(n); }
    });
  }

  /* ── "montando seu treino de hoje" ────────────────────────────── */
  function initScan() {
    var box = $("[data-cr-gerar]");
    if (!box) { guardar("cr_reloads", null); return; }

    var url = box.getAttribute("data-url");
    var term = $("[data-cr-term]", box);
    var linhas = $$(".cr-tl", term);
    var barra = $(".cr-scan-bar", box);
    var enche = barra && barra.firstElementChild;
    var status = $("[data-cr-status]", box);
    var erroBox = $("[data-cr-erro]", box);
    var erroMsg = $("[data-cr-erro-msg]", box);
    var retry = $("[data-cr-retry]", box);
    var ultima = $("[data-cr-final]", box);
    var padraoErro = "Não deu para montar seu treino agora. Tente de novo em instantes.";

    var pct = 8, timers = [], vivo = false, t0 = 0, falasLongas = [];

    function setPct(v) {
      pct = Math.max(pct, Math.min(100, v));
      if (enche) enche.style.setProperty("--w", pct + "%");
      if (barra) barra.setAttribute("aria-valuenow", String(Math.round(pct)));
    }
    function fala(txt) { if (status) status.textContent = txt; }
    function limpar() { timers.forEach(clearTimeout); timers = []; }

    function revelar(i) { if (linhas[i]) linhas[i].classList.add("is-on"); }

    function animar() {
      term.classList.add("is-ready");
      linhas.forEach(function (l) { l.classList.remove("is-on"); });
      var passos = [
        [0, "Começando…", 10], [1, "Lendo seu histórico de estudos…", 22], [2, "Mapeando o que pede reforço…", 38],
        [3, "Escolhendo o próximo tópico…", 54], [4, "Calibrando a dificuldade…", 68], [5, "Preparando as missões do dia…", 82]
      ];
      passos.forEach(function (p, i) {
        timers.push(setTimeout(function () {
          if (!vivo) return;
          revelar(p[0]); fala(p[1]); setPct(p[2]);
        }, REDUCE ? 0 : i * 850));
      });
      // depois dos passos, avança devagar até ~92% enquanto a resposta não chega
      timers.push(setTimeout(function creep() {
        if (!vivo) return;
        if (pct < 92) setPct(pct + 1);
        var s = (Date.now() - t0) / 1000;
        if (s > 40) fala("Está demorando mais que o normal. Fica por aqui, já já termina…");
        else if (s > 14) fala("Quase lá. Acertando os últimos detalhes…");
        timers.push(setTimeout(creep, 700));
      }, passos.length * 850 + 400));
    }

    function falhou(msg) {
      vivo = false; limpar();
      box.classList.add("is-erro");
      if (erroMsg) erroMsg.textContent = msg || padraoErro;
      if (erroBox) erroBox.hidden = false;
      fala("Não foi possível montar o treino.");
      if (retry) { retry.disabled = false; retry.classList.remove("is-loading"); try { retry.focus({ preventScroll: true }); } catch (e) { /* ok */ } }
    }

    function pronto() {
      var gasto = Date.now() - t0;
      var minimo = REDUCE ? 400 : 3200; // dá tempo de ver a animação mesmo se a resposta for instantânea
      return esperar(Math.max(0, minimo - gasto)).then(function () {
        limpar();
        linhas.forEach(function (l, i) { if (l !== ultima) revelar(i); });
        if (ultima) ultima.classList.add("is-on");
        box.classList.add("is-ok");
        setPct(100);
        fala("Treino pronto! Abrindo…");
        return esperar(REDUCE ? 200 : 900);
      }).then(function () {
        var n = parseInt(ler("cr_reloads") || "0", 10) || 0;
        if (n >= 2) { // a página voltou "pendente" mesmo após gerar: não recarrega em loop
          guardar("cr_reloads", null);
          falhou("O treino foi criado, mas a página não atualizou. Recarregue para ver as missões.");
          return;
        }
        guardar("cr_reloads", String(n + 1));
        window.location.reload();
      });
    }

    function iniciar() {
      if (vivo) return;
      vivo = true; t0 = Date.now(); pct = 8;
      box.classList.remove("is-erro", "is-ok");
      if (erroBox) erroBox.hidden = true;
      setPct(8); fala("Começando…");
      animar();
      postJSON(url, {}, 120000).then(function (r) {
        if (!vivo) return;
        if (r.ok) { pronto(); return; }
        var cod = r.dados && r.dados.codigo;
        var msg = mensagemAmigavel(r.dados, r.status >= 500 || !r.dados ? "O servidor encontrou um problema ao montar o treino. Tente de novo." : padraoErro);
        if (r.status === 429 || cod === "limite") msg = mensagemAmigavel(r.dados, "Muitas tentativas seguidas. Espere um instante e tente de novo.");
        falhou(msg);
      }, function (err) {
        if (!vivo) return;
        falhou(err && err.name === "AbortError" ? "Está demorando demais. Tente de novo em instantes." : "Sem conexão com o servidor. Confira a internet e tente de novo.");
      });
    }

    if (retry) retry.addEventListener("click", function () {
      retry.disabled = true; retry.classList.add("is-loading");
      iniciar();
    });
    iniciar();
  }

  /* ── confete (canvas) ─────────────────────────────────────────── */
  function confete(cx, cy) {
    if (REDUCE) return;
    var cv = document.createElement("canvas");
    cv.className = "cr-confete";
    cv.setAttribute("aria-hidden", "true");
    document.body.appendChild(cv);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = window.innerWidth, H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    var ctx = cv.getContext("2d");
    if (!ctx) { cv.remove(); return; }
    ctx.scale(dpr, dpr);

    var cores = ["#f5c542", "#ffe08a", "#39d98a", "#58a6ff", "#bc8cff", "#ff9d3d", "#ff6b63", "#ffffff"];
    var ps = [];
    function nova(o) {
      o.rot = Math.random() * 6.28; o.vr = (Math.random() - 0.5) * 0.36;
      o.c = cores[(Math.random() * cores.length) | 0];
      o.forma = Math.random() < 0.22 ? "c" : (Math.random() < 0.18 ? "s" : "r");
      o.w = 6 + Math.random() * 7; o.h = 3 + Math.random() * 5;
      o.t = 0; o.sway = Math.random() * 6.28;
      ps.push(o);
    }
    var i, ang, v;
    for (i = 0; i < 120; i++) { // explosão saindo do baú
      ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
      v = 6 + Math.random() * 11;
      nova({ x: cx, y: cy, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, g: 0.3, drag: 0.985, delay: 0, max: 150 + Math.random() * 60 });
    }
    var chuva = W < 600 ? 60 : 110;
    for (i = 0; i < chuva; i++) { // chuva vinda do topo
      nova({ x: Math.random() * W, y: -20 - Math.random() * 120, vx: (Math.random() - 0.5) * 1.6, vy: 2 + Math.random() * 3, g: 0.05, drag: 0.995, delay: 20 + ((Math.random() * 70) | 0), max: 170 + Math.random() * 70 });
    }

    function estrela(x, y, r) {
      ctx.beginPath();
      for (var k = 0; k < 8; k++) {
        var rr = k % 2 ? r * 0.4 : r, a = k * Math.PI / 4;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
    }

    var vivos = ps.length;
    function quadro() {
      ctx.clearRect(0, 0, W, H);
      vivos = 0;
      for (var k = 0; k < ps.length; k++) {
        var p = ps[k];
        if (p.t >= p.max) continue;
        if (p.delay > 0) { p.delay--; vivos++; continue; }
        p.t++; vivos++;
        p.vx *= p.drag; p.vy = p.vy * p.drag + p.g;
        p.sway += 0.08;
        p.x += p.vx + Math.sin(p.sway) * 0.4; p.y += p.vy; p.rot += p.vr;
        var vida = p.max - p.t;
        ctx.globalAlpha = vida < 35 ? Math.max(0, vida / 35) : 1;
        ctx.fillStyle = p.c;
        if (p.forma === "c") { ctx.beginPath(); ctx.arc(p.x, p.y, p.w * 0.38, 0, 6.28); ctx.fill(); }
        else if (p.forma === "s") { estrela(p.x, p.y, p.w * 0.8); }
        else {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.scale(1, Math.abs(Math.cos(p.sway)) * 0.7 + 0.3); // "gira" no ar
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
      if (vivos > 0) requestAnimationFrame(quadro); else cv.remove();
    }
    requestAnimationFrame(quadro);
  }

  /* ── baú do dia ───────────────────────────────────────────────── */
  function initBau() {
    var bau = $("#crBau");
    if (!bau) return;
    var url = bau.getAttribute("data-url");
    var btn = $("[data-cr-bau-abrir]", bau);
    var palco = $("[data-cr-bau-chest]", bau);
    var titulo = $("[data-cr-bau-titulo]", bau);
    var texto = $("[data-cr-bau-txt]", bau);
    var premio = $("[data-cr-premio]", bau);
    var erro = $("[data-cr-bau-erro]", bau);
    var sr = $("[data-cr-bau-sr]", bau);
    var ocupado = false;

    function mostrarErro(msg) {
      if (!erro) return;
      erro.textContent = msg;
      erro.hidden = false;
    }

    function atualizarPagina() {
      var seg = $(".cr-seg-bau");
      if (seg) { seg.classList.remove("is-now"); seg.classList.add("is-done"); }
      var li = bau.closest("li");
      if (li) {
        li.classList.remove("is-pronto"); li.classList.add("is-aberto");
        var badge = $(".cr-q-badge", li);
        if (badge) { badge.textContent = ""; badge.appendChild(svgUse("u-check")); }
      }
      var lead = $(".cr-hero-lead");
      if (lead) lead.textContent = "Treino de hoje concluído. Baú aberto, volte amanhã para um treino novo.";
    }

    function revelar(resp) {
      var xp = parseInt(resp.xp, 10) || 0;
      var mult = Number(resp.multiplicador) || 1;
      var item = resp.item || null;

      bau.classList.remove("is-opening");
      bau.setAttribute("data-estado", "aberto");
      if (titulo) titulo.textContent = "Baú aberto!";
      if (texto) texto.textContent = "Recompensa guardada no seu perfil. Amanhã tem outro treino e outro baú.";
      var acao = $(".cr-bau-acao", bau);
      if (acao) acao.textContent = "";
      atualizarPagina();

      // prêmio
      premio.textContent = "";
      var linha = el("div", "cr-premio-xp");
      linha.setAttribute("aria-hidden", "true");
      var num = el("b", null, "+0");
      linha.appendChild(num);
      linha.appendChild(el("span", null, "XP"));
      if (mult > 1) linha.appendChild(el("span", "cr-premio-mult", "×" + pt(mult) + " sequência"));
      premio.appendChild(linha);
      premio.hidden = false;
      if (REDUCE) num.textContent = "+" + xp;
      else {
        var t0 = null;
        (function passo(t) {
          if (t0 === null) t0 = t;
          var p = Math.min(1, (t - t0) / 1100);
          num.textContent = "+" + Math.round(xp * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(passo);
        })(performance.now());
      }

      if (item && item.nome) {
        var cartao = el("div", "cr-item");
        var ic = el("span", "cr-item-ico"); ic.appendChild(svgUse("cr-i-gem"));
        var corpo = el("div");
        corpo.appendChild(el("small", null, "Item encontrado"));
        corpo.appendChild(el("b", null, String(item.nome)));
        if (item.desc) corpo.appendChild(el("span", null, String(item.desc)));
        cartao.appendChild(ic); cartao.appendChild(corpo);
        setTimeout(function () { premio.appendChild(cartao); }, REDUCE ? 0 : 700);
      }

      if (sr) {
        sr.textContent = "Baú aberto! Você ganhou " + xp + " XP" + (mult > 1 ? ", com bônus de sequência ×" + pt(mult) : "") +
          (item && item.nome ? ". Item: " + item.nome + "." : ".");
      }

      // confete a partir do centro do baú
      var r = palco ? palco.getBoundingClientRect() : null;
      var cx = r ? r.left + r.width / 2 : window.innerWidth / 2;
      var cy = r ? r.top + r.height * 0.4 : window.innerHeight / 2;
      setTimeout(function () { confete(cx, cy); }, REDUCE ? 0 : 280);

      // XP flutuante, subida de nível e conquistas (gamificacao.js)
      setTimeout(function () {
        if (typeof window.gamificacaoProcessar === "function") {
          try { window.gamificacaoProcessar(resp); } catch (e) { /* o baú já abriu */ }
        }
      }, REDUCE ? 0 : 900);
    }

    function abrir() {
      if (ocupado || bau.getAttribute("data-estado") !== "pronto") return;
      ocupado = true;
      if (erro) erro.hidden = true;
      if (btn) { btn.classList.add("is-loading"); btn.disabled = true; }
      bau.classList.add("is-opening");
      var t0 = Date.now();
      postJSON(url, {}, 30000).then(function (r) {
        var resta = Math.max(0, (REDUCE ? 0 : 1000) - (Date.now() - t0)); // deixa o baú "sacudir" um pouco
        return esperar(resta).then(function () { return r; });
      }).then(function (r) {
        if (r.ok) { revelar(r.dados); return; }
        throw { resposta: r };
      }).catch(function (e) {
        ocupado = false;
        bau.classList.remove("is-opening");
        if (btn) { btn.classList.remove("is-loading"); btn.disabled = false; }
        var dados = e && e.resposta ? e.resposta.dados : null;
        mostrarErro(mensagemAmigavel(dados, e && e.resposta ? "Não foi possível abrir o baú agora. Tente de novo." : "Sem conexão com o servidor. Confira a internet e tente de novo."));
      });
    }

    if (btn) btn.addEventListener("click", abrir);
    if (palco) palco.addEventListener("click", abrir);
  }

  /* ── árvore de habilidades ────────────────────────────────────── */
  function initArvore() {
    var arv = $("[data-cr-arvore]");
    if (!arv) return;
    var botoes = $$(".cr-fil", arv);
    var mods = $$("[data-mod]", arv);
    var vazio = $("[data-cr-fil-vazio]", arv);
    mods.forEach(function (m) { m.setAttribute("data-aberto-inicial", m.open ? "1" : "0"); });

    function aplicar(f) {
      var total = 0;
      mods.forEach(function (m) {
        var visiveis = 0;
        $$(".cr-node", m).forEach(function (n) {
          var ok = f === "todos" || n.getAttribute("data-status") === f;
          n.hidden = !ok;
          if (ok) visiveis++;
        });
        total += visiveis;
        m.hidden = visiveis === 0;
        if (f === "todos") m.open = m.getAttribute("data-aberto-inicial") === "1";
        else if (visiveis > 0) m.open = true;
      });
      if (vazio) vazio.hidden = total > 0;
    }
    botoes.forEach(function (b) {
      b.addEventListener("click", function () {
        botoes.forEach(function (x) { x.classList.toggle("is-on", x === b); x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        aplicar(b.getAttribute("data-fil"));
      });
    });

    /* dicas dos nós: o atributo title vira uma dica própria (com foco e toque) */
    var dica = null, atual = null;
    function criar() {
      if (dica) return dica;
      dica = el("div", "cr-tip");
      dica.setAttribute("role", "tooltip");
      document.body.appendChild(dica);
      return dica;
    }
    function mostrar(no) {
      var txt = no.getAttribute("data-tip");
      if (!txt) return;
      var d = criar();
      var partes = txt.split(" — ");
      d.textContent = "";
      d.appendChild(el("b", null, partes[0]));
      if (partes[1]) d.appendChild(el("span", null, partes.slice(1).join(" — ")));
      d.classList.remove("is-on");
      d.style.left = "0px"; d.style.top = "0px";
      var r = no.getBoundingClientRect(), w = d.offsetWidth, h = d.offsetHeight;
      var x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
      var y = r.top - h - 8;
      if (y < 8) y = r.bottom + 8;
      d.style.left = x + "px"; d.style.top = y + "px";
      requestAnimationFrame(function () { d.classList.add("is-on"); });
      atual = no;
    }
    function esconder() { if (dica) dica.classList.remove("is-on"); atual = null; }

    $$(".cr-node", arv).forEach(function (n) {
      var t = n.getAttribute("title");
      if (t) { n.setAttribute("data-tip", t); n.removeAttribute("title"); }
      n.addEventListener("mouseenter", function () { mostrar(n); });
      n.addEventListener("mouseleave", esconder);
      n.addEventListener("focus", function () { mostrar(n); });
      n.addEventListener("blur", esconder);
    });
    window.addEventListener("scroll", function () { if (atual) esconder(); }, { passive: true });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") esconder(); });
  }

  /* ── detalhe de um dia no calendário ──────────────────────────── */
  function initCalendario() {
    $$("[data-hm-info]").forEach(function (wrap) {
      var saida = document.getElementById(wrap.getAttribute("data-hm-info"));
      if (!saida) return;
      wrap.addEventListener("click", function (e) {
        var c = e.target.closest && e.target.closest(".cr-hm-cell[data-info]");
        if (c) saida.textContent = c.getAttribute("data-info");
      });
    });
  }

  /* ── onboarding: wizard de 3 passos ───────────────────────────── */
  function initOnboarding() {
    var raiz = $("#crOnb");
    var form = $("#crWiz");
    if (!raiz || !form) return;

    var passos = $$(".cr-step", form);              // 1..3 fieldsets + 4 final
    var pontos = $$("[data-step-dot]", form);
    var prog = $("#crProg > i", form);
    var anuncio = $("#crPassoAnuncio", form);
    var ficha = $("#crSheet");
    var editando = form.getAttribute("data-edit") === "1";
    var totalTop = parseInt(form.getAttribute("data-topicos"), 10) || 0;
    var totalMod = parseInt(form.getAttribute("data-modulos"), 10) || 0;
    var NOMES = ["nivel", "objetivo", "minutos"];
    var LARGURA = [8, 36, 64, 100];
    var atual = 1, ocupado = false;

    raiz.classList.add("cr-wiz-on");

    function escolha(nome) { return form.querySelector('input[name="' + nome + '"]:checked'); }
    function valido(n) { return n >= 4 || !!escolha(NOMES[n - 1]); }
    function passo(n) { return passos[n - 1]; }

    function atualizarFicha() {
      if (!ficha) return;
      var o = escolha("objetivo"), n = escolha("nivel"), m = escolha("minutos");
      var set = { nivel: n, objetivo: o, minutos: m };
      NOMES.forEach(function (k) {
        var li = $('[data-sheet="' + k + '"]', ficha);
        if (!li) return;
        var b = $("b", li);
        b.textContent = set[k] ? set[k].getAttribute("data-label") : "—";
        li.classList.toggle("is-set", !!set[k]);
      });
      ficha.setAttribute("data-obj", o ? o.value : "");
      var tit = $("[data-sheet-title]", ficha);
      if (tit) tit.textContent = (n && o && m) ? "Plano pronto para montar" : (o ? o.getAttribute("data-label") : "Em construção…");
      var av = $("[data-sheet-ico]", ficha);
      var ic = o && o.getAttribute("data-ic");
      if (av && ic) {
        var use = $("use", av);
        var novo = "#cr-i-" + ic;
        if (use && use.getAttribute("href") !== novo) {
          use.setAttribute("href", novo);
          av.classList.remove("is-pop"); void av.offsetWidth; av.classList.add("is-pop");
        }
      }
    }

    function atualizarResumo() {
      var n = escolha("nivel"), o = escolha("objetivo"), m = escolha("minutos");
      $$("[data-sum]", form).forEach(function (b) {
        var k = b.getAttribute("data-sum");
        var r = k === "nivel" ? n : (k === "objetivo" ? o : m);
        b.textContent = r ? r.getAttribute("data-label") : "—";
      });
      var est = $("[data-sum-est]", form);
      if (!est) return;
      est.textContent = "";
      var porMes = m ? parseInt(m.getAttribute("data-est"), 10) || 0 : 0;
      if (!porMes) return;
      est.appendChild(document.createTextNode("Ritmo estimado: ≈ "));
      est.appendChild(el("b", null, String(porMes)));
      est.appendChild(document.createTextNode(" tópicos por mês."));
      if (totalTop > 0) {
        var meses = Math.max(1, Math.ceil(totalTop / porMes));
        est.appendChild(document.createTextNode(" Os " + totalTop + " tópicos" + (totalMod ? " de " + totalMod + " módulos" : "") + " cabem em ≈ "));
        est.appendChild(el("b", null, meses + (meses === 1 ? " mês" : " meses")));
        est.appendChild(document.createTextNode(" nesse ritmo. O plano se adapta ao que você acerta e erra."));
      }
    }

    function atualizar() {
      // botões "Continuar" só liberam com uma escolha feita
      for (var i = 1; i <= 3; i++) {
        var prox = $("[data-next]", passo(i));
        if (prox) {
          var estava = prox.disabled;
          prox.disabled = !valido(i);
          if (estava && !prox.disabled && !REDUCE) { prox.classList.remove("cr-ping"); void prox.offsetWidth; prox.classList.add("cr-ping"); }
        }
      }
      pontos.forEach(function (p, i) {
        var n = i + 1;
        p.classList.toggle("is-on", n === atual);
        p.classList.toggle("is-done", n < atual && valido(n));
        p.style.cursor = podeIr(n) ? "pointer" : "default";
      });
      if (prog) prog.style.setProperty("--w", LARGURA[atual - 1] + "%");
      atualizarFicha();
      if (atual === 4) atualizarResumo();
    }

    function podeIr(n) { for (var i = 1; i < n; i++) if (!valido(i)) return false; return true; }

    function titulo(n) {
      var t = $(".cr-step-title", passo(n));
      return t;
    }

    function ir(n, instante) {
      if (ocupado || n === atual || n < 1 || n > 4 || !podeIr(n)) return;
      var dir = n > atual ? "fwd" : "back";
      var de = passo(atual), para = passo(n);
      atual = n;
      ocupado = true;
      function terminar() {
        ocupado = false;
        var t = titulo(n);
        if (t) { t.setAttribute("tabindex", "-1"); try { t.focus({ preventScroll: true }); } catch (e) { /* ok */ } }
        if (anuncio) anuncio.textContent = n === 4 ? "Resumo do seu plano" : ("Passo " + n + " de 3: " + (t ? t.textContent : ""));
        var topo = form.getBoundingClientRect().top;
        if (topo < 0 || topo > window.innerHeight * 0.5) form.scrollIntoView({ behavior: REDUCE ? "auto" : "smooth", block: "start" });
      }
      atualizar();
      if (REDUCE || instante) {
        de.classList.remove("is-on"); para.classList.add("is-on"); terminar();
        return;
      }
      de.classList.add("is-out-" + dir);
      setTimeout(function () {
        de.classList.remove("is-on", "is-out-fwd", "is-out-back");
        para.classList.add("is-on", "is-in-" + dir);
        setTimeout(function () { para.classList.remove("is-in-fwd", "is-in-back"); }, 520);
        terminar();
      }, 250);
    }

    // eventos
    $$("input[type=radio]", form).forEach(function (r) { r.addEventListener("change", atualizar); });
    $$("[data-next]", form).forEach(function (b) { b.addEventListener("click", function () { ir(atual + 1); }); });
    $$("[data-prev]", form).forEach(function (b) { b.addEventListener("click", function () { ir(atual - 1); }); });
    $$("[data-goto]", form).forEach(function (b) { b.addEventListener("click", function () { ir(parseInt(b.getAttribute("data-goto"), 10)); }); });
    pontos.forEach(function (p, i) { p.addEventListener("click", function () { ir(i + 1); }); });

    // Enter nos passos 1–3 avança (não envia o formulário por engano)
    form.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || atual > 3) return;
      var alvo = e.target;
      if (alvo && alvo.tagName === "BUTTON") return;
      e.preventDefault();
      if (valido(atual)) ir(atual + 1);
    });

    form.addEventListener("submit", function (e) {
      for (var i = 1; i <= 3; i++) {
        if (!valido(i)) { e.preventDefault(); ir(i); return; }
      }
      var env = $("#crEnviar", form);
      if (env) { env.classList.add("is-loading"); setTimeout(function () { env.disabled = true; }, 0); }
    });

    // estado inicial (modo edição já vem preenchido)
    passos.forEach(function (p, i) { p.classList.toggle("is-on", i === 0); });
    atualizar();
  }

  /* ── init ─────────────────────────────────────────────────────── */
  function init() {
    var blocos = [initSaudacao, initContagem, initScan, initBau, initArvore, initCalendario, initOnboarding];
    blocos.forEach(function (fn) {
      try { fn(); } catch (e) { if (window.console) console.error("[cronograma] " + fn.name + ":", e); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

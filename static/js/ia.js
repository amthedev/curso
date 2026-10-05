/* ==========================================================================
   Atividades com IA — formulário de geração, overlay de loading e resolução.
   JS puro, sem build. Todo texto vindo da IA entra no DOM escapado
   (textContent ou esc()) — nunca innerHTML cru.
   ========================================================================== */
(function () {
  "use strict";

  var reduzMovimento = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── utilitários ─────────────────────────────────────────────────────── */
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  /* escapa e depois aplica `código` e **negrito** */
  function fmt(s) {
    return esc(s)
      .replace(/`([^`\n]{1,200})`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]{1,200})\*\*/g, "<strong>$1</strong>");
  }
  function icone(nome) {
    return '<svg class="ia-ico" aria-hidden="true"><use href="#ia-i-' + nome + '"/></svg>';
  }
  function lerStorage(chave) { try { return window.localStorage.getItem(chave); } catch (e) { return null; } }
  function gravarStorage(chave, v) { try { window.localStorage.setItem(chave, v); } catch (e) { /* sem storage */ } }

  function postJSON(url, corpo) {
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(corpo || {})
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (dados) {
        if (r.status === 401 && dados && dados.login) {
          window.location.href = dados.login + "?proximo=" + encodeURIComponent(window.location.pathname);
        }
        if (!r.ok || !dados || dados.ok === false) {
          var msg = (dados && dados.erro) ||
            (r.status >= 500 ? "O servidor encontrou um problema. Tente novamente." : "Algo deu errado (" + r.status + ").");
          var err = new Error(msg);
          err.status = r.status;
          err.dados = dados;
          throw err;
        }
        return dados;
      });
    }, function () {
      throw new Error("Sem conexão com o servidor. Verifique sua internet e tente de novo.");
    });
  }

  /* ── Overlay de geração ──────────────────────────────────────────────── */
  var Loading = (function () {
    var el, log, msg, bar, seg, timers = [], inicio = 0, focoAnterior = null;
    var mensagens = [
      "Consultando a IA…",
      "Lendo o tema e definindo os objetivos…",
      "Escrevendo o resumo teórico…",
      "Montando questões…",
      "Criando desafios de comando…",
      "Validando o gabarito…",
      "Embaralhando alternativas…",
      "Quase lá — conferindo tudo…"
    ];

    function linha(texto, classe) {
      var p = document.createElement("p");
      if (classe) p.className = classe;
      log.appendChild(p);
      while (log.children.length > 7) log.removeChild(log.firstChild);
      if (reduzMovimento) { p.textContent = texto; return; }
      var i = 0;
      var t = setInterval(function () {
        i += 2;
        p.textContent = texto.slice(0, i);
        if (i >= texto.length) clearInterval(t);
      }, 18);
      timers.push(t);
    }

    function abrir(params) {
      el = $("#iaLoading");
      if (!el) return;
      log = $("#iaTermLog"); msg = $("#iaLoadingMsg"); bar = $("#iaLoadingBar"); seg = $("#iaLoadingSeg");
      log.textContent = "";
      bar.style.width = "3%";
      seg.textContent = "0";
      focoAnterior = document.activeElement;
      el.hidden = false;
      document.body.classList.add("ia-travado");
      requestAnimationFrame(function () { el.classList.add("is-on"); $(".ia-loading-box", el).focus(); });

      inicio = Date.now();
      var cmd = '$ ia gerar --tema "' + (params.tema || "").slice(0, 60) + '" --nivel ' +
        (params.nivel || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") +
        " --questoes " + params.quantidade;
      linha(cmd, "cmd");
      var k = 0;
      msg.textContent = mensagens[0];
      timers.push(setTimeout(function () { linha("› " + mensagens[0]); }, 700));
      timers.push(setInterval(function () {
        k = Math.min(k + 1, mensagens.length - 1);
        msg.textContent = mensagens[k];
        linha("› " + mensagens[k]);
      }, 4200));
      timers.push(setInterval(function () {
        var s = (Date.now() - inicio) / 1000;
        seg.textContent = String(Math.floor(s));
        bar.style.width = (3 + 92 * (1 - Math.exp(-s / 16))).toFixed(1) + "%";
      }, 250));
    }

    function parar() {
      timers.forEach(function (t) { clearInterval(t); clearTimeout(t); });
      timers = [];
    }

    function sucesso() {
      parar();
      if (!el) return;
      bar.style.width = "100%";
      msg.textContent = "Atividade pronta! Abrindo…";
      linha("✔ atividade pronta — redirecionando", "ok");
    }

    function fechar() {
      parar();
      if (!el) return;
      el.classList.remove("is-on");
      el.hidden = true;
      document.body.classList.remove("ia-travado");
      if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
    }

    return { abrir: abrir, sucesso: sucesso, fechar: fechar };
  })();

  function gerarAtividade(url, params, aoErro) {
    Loading.abrir(params);
    return postJSON(url, params).then(function (d) {
      Loading.sucesso();
      setTimeout(function () { window.location.href = d.url; }, 450);
    }).catch(function (e) {
      Loading.fechar();
      aoErro(e.message);
    });
  }

  /* ======================================================================
     PÁGINA: formulário + histórico
     ====================================================================== */
  function initIndex() {
    var form = $("#iaForm");
    if (!form) return;
    var tema = $("#iaTema"), cont = $("#iaTemaCount"), erro = $("#iaErro"), btn = $("#iaGerar");
    var max = parseInt(tema.getAttribute("maxlength"), 10) || 120;

    function contar() {
      cont.textContent = tema.value.length + "/" + max;
      $$(".ia-chip", form).forEach(function (c) {
        c.classList.toggle("is-on", c.getAttribute("data-tema") === tema.value.trim());
        c.setAttribute("aria-pressed", c.classList.contains("is-on") ? "true" : "false");
      });
    }
    function mostrarErro(m) {
      erro.innerHTML = icone("alert") + "<span>" + esc(m) + "</span>";
      erro.hidden = false;
      erro.scrollIntoView({ block: "nearest", behavior: reduzMovimento ? "auto" : "smooth" });
    }

    tema.addEventListener("input", function () { erro.hidden = true; contar(); });
    contar();

    /* Veio de "Praticar este post": leva o aluno direto ao banner + nível + botão */
    if (form.getAttribute("data-post") && !window.location.hash) {
      requestAnimationFrame(function () { form.scrollIntoView({ block: "start", behavior: "instant" }); });
    }

    $$(".ia-chip", form).forEach(function (c) {
      c.addEventListener("click", function () {
        tema.value = c.getAttribute("data-tema");
        erro.hidden = true;
        contar();
        tema.focus();
      });
    });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (btn.disabled) return;
      erro.hidden = true;
      var params = {
        tema: tema.value.trim(),
        nivel: (form.querySelector('input[name="nivel"]:checked') || {}).value,
        quantidade: parseInt((form.querySelector('input[name="quantidade"]:checked') || {}).value, 10),
        foco: (form.querySelector('input[name="foco"]:checked') || {}).value || "misto",
        tipos: $$('input[name="tipos"]:checked', form).map(function (i) { return i.value; })
      };
      /* "Praticar este post": o servidor carrega o post (e fixa o formato) pelo slug */
      var postSlug = form.getAttribute("data-post");
      if (postSlug) params.post = postSlug;
      if (params.tema.length < 3) { mostrarErro("Descreva o tema com pelo menos 3 caracteres."); tema.focus(); return; }
      if (!params.tipos.length) { mostrarErro("Marque pelo menos um tipo de questão."); return; }

      btn.disabled = true;
      btn.classList.add("is-loading");
      gerarAtividade(form.getAttribute("data-url"), params, function (m) {
        btn.disabled = false;
        btn.classList.remove("is-loading");
        mostrarErro(m);
      });
    });

    /* histórico: refazer / excluir */
    var lista = $("#iaHistList");
    if (lista) {
      lista.addEventListener("click", function (ev) {
        var b = ev.target.closest("[data-acao]");
        if (!b || b.disabled) return;
        var item = b.closest(".ia-hist-item");
        var acao = b.getAttribute("data-acao");
        if (acao === "excluir" && !window.confirm("Excluir esta atividade? O XP dela sai do seu total.")) return;
        if (acao === "refazer" && item.classList.contains("is-ok") &&
            !window.confirm("Refazer zera suas respostas e a nota desta atividade. Continuar?")) return;
        b.disabled = true;
        postJSON(b.getAttribute("data-url"), {}).then(function (d) {
          if (acao === "refazer") { window.location.href = d.url; return; }
          item.classList.add("is-saindo");
          setTimeout(function () {
            item.remove();
            var restantes = $$(".ia-hist-item", lista).length;
            $("#iaHistCount").textContent = String(restantes);
            if (!restantes) { $("#iaHistVazio").hidden = false; lista.remove(); }
          }, reduzMovimento ? 0 : 260);
        }).catch(function (e) {
          b.disabled = false;
          window.alert(e.message);
        });
      });
    }
  }

  /* ======================================================================
     PÁGINA: resolver atividade
     ====================================================================== */
  function initVer() {
    var dataEl = $("#iaData");
    if (!dataEl) return;
    var D;
    try { D = JSON.parse(dataEl.textContent); } catch (e) { return; }

    var porId = {};
    D.questoes.forEach(function (q, i) { q.idx = i; porId[q.id] = q; });
    var artigos = $$(".ia-q");
    var modo = lerStorage("ia-modo") === "todas" ? "todas" : "uma";
    var atual = 0;

    /* resumo: fallback se o main.js não renderizou o markdown */
    var corpo = $("#postBody");
    if (corpo && !corpo.innerHTML.trim() && corpo.getAttribute("data-raw")) {
      if (typeof window.markdownParaHtml === "function") {
        corpo.innerHTML = window.markdownParaHtml(corpo.getAttribute("data-raw"));
      } else {
        corpo.innerHTML = corpo.getAttribute("data-raw").split(/\n{2,}/).map(function (p) {
          return "<p>" + fmt(p) + "</p>";
        }).join("");
      }
    }

    /* ── modo de exibição / navegação ── */
    function aplicarModo() {
      $("#iaVer").classList.toggle("is-todas", modo === "todas");
      $$(".ia-modo-btn").forEach(function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-modo") === modo ? "true" : "false");
      });
      artigos.forEach(function (a, i) { a.hidden = modo === "uma" && i !== atual; });
      atualizarNav();
    }

    function irPara(i, focar) {
      atual = Math.max(0, Math.min(artigos.length - 1, i));
      aplicarModo();
      var a = artigos[atual];
      if (modo === "todas" || focar) {
        a.scrollIntoView({ block: "start", behavior: reduzMovimento ? "auto" : "smooth" });
      }
      if (focar) a.focus({ preventScroll: true });
    }

    function atualizarNav() {
      $$(".ia-qnav-btn").forEach(function (b, i) {
        var q = D.questoes[i];
        b.className = "ia-qnav-btn" + (q.resultado ? " is-" + q.resultado.status : "") + (i === atual && modo === "uma" ? " is-atual" : "");
        if (i === atual && modo === "uma") b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
        b.setAttribute("aria-label", "Questão " + (i + 1) + (q.resultado ? " — " + rotuloStatus(q.resultado.status) : ""));
      });
    }

    $$(".ia-modo-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        modo = b.getAttribute("data-modo");
        gravarStorage("ia-modo", modo);
        aplicarModo();
      });
    });
    $$(".ia-qnav-btn").forEach(function (b, i) {
      b.addEventListener("click", function () { irPara(i, true); });
    });

    artigos.forEach(function (art, i) {
      $$(".ia-q-nav [data-passo]", art).forEach(function (b) {
        b.addEventListener("click", function () {
          var passo = parseInt(b.getAttribute("data-passo"), 10);
          if (passo > 0 && i === artigos.length - 1) {
            if (D.final) mostrarFinal(false);
            else {
              var pend = D.questoes.filter(function (q) { return !q.resultado; })[0];
              if (pend) irPara(pend.idx, true);
            }
            return;
          }
          irPara(i + passo, true);
        });
      });
    });

    /* ── progresso ── */
    function atualizarProgresso(p) {
      if (!p) return;
      D.progresso = p;
      $("#iaRespondidas").textContent = p.respondidas;
      $("#iaXp").textContent = p.xp;
      var pct = p.total ? Math.round(p.respondidas / p.total * 100) : 0;
      $("#iaProgBar").style.width = pct + "%";
      $("#iaProg").setAttribute("aria-valuenow", p.respondidas);
    }

    function rotuloStatus(s) {
      return s === "certa" ? "Correta" : (s === "parcial" ? "Parcialmente correta" : "Incorreta");
    }

    /* ── renderização do resultado de uma questão ── */
    function aplicarResultado(q, res, animar) {
      q.resultado = res;
      var art = $("#q-" + q.id);
      var form = $(".ia-q-form", art);
      art.classList.remove("is-certa", "is-errada", "is-parcial");
      art.classList.add("is-respondida", "is-" + res.status);
      $$("input, textarea, button", form).forEach(function (el) { el.disabled = true; });
      $(".ia-q-acoes", form).hidden = true;
      var rev = res.revelar || {};

      if (q.tipo === "multipla" || q.tipo === "vf") {
        $$(".ia-opt", form).forEach(function (op) {
          var v = op.getAttribute("data-valor");
          var valorCerto = q.tipo === "vf" ? String(rev.correta) : String(rev.correta);
          var valorAluno = String(res.resposta);
          op.classList.toggle("is-certa", v === valorCerto);
          op.classList.toggle("is-errada", v === valorAluno && v !== valorCerto);
          op.classList.toggle("is-escolhida", v === valorAluno);
          var inp = $("input", op);
          if (inp) inp.checked = v === valorAluno;
        });
      } else if (q.tipo === "aberta") {
        var ta = $("textarea", form);
        if (ta && !ta.value) ta.value = res.resposta || "";
      } else if (q.tipo === "comando") {
        var inp = $("input", form);
        if (inp && !inp.value) inp.value = res.resposta || "";
      } else if (q.tipo === "ordenar") {
        var ol = $(".ia-ordem", form);
        var certa = rev.ordem_correta || [];
        (res.resposta || []).forEach(function (pid) {
          var li = $('[data-pid="' + pid + '"]', ol);
          if (li) ol.appendChild(li);
        });
        $$(".ia-passo", ol).forEach(function (li, i) {
          li.draggable = false;
          li.classList.toggle("is-certa", certa[i] === li.getAttribute("data-pid"));
          li.classList.toggle("is-errada", certa[i] !== li.getAttribute("data-pid"));
          $(".ia-passo-n", li).textContent = String(i + 1);
        });
      }

      var xpEl = $(".ia-q-xp", art);
      xpEl.textContent = (res.xp > 0 ? "+" : "") + res.xp + " / " + res.xp_max + " XP";
      xpEl.classList.add("is-final");

      $(".ia-fb-wrap", art).innerHTML = htmlFeedback(q, res);
      var fb = $(".ia-fb", art);
      if (animar && fb && !reduzMovimento) fb.classList.add("is-anim");
      atualizarNav();
    }

    function htmlFeedback(q, res) {
      var rev = res.revelar || {};
      var titulo = res.status === "certa" ? "Correto!" : (res.status === "parcial" ? "Parcialmente correto" : "Não foi dessa vez");
      var ico = res.status === "certa" ? "check" : (res.status === "parcial" ? "half" : "x");
      var h = '<div class="ia-fb ia-fb-' + res.status + '">' +
        '<div class="ia-fb-head"><span class="ia-fb-ico">' + icone(ico) + "</span>" +
        "<strong>" + titulo + "</strong>" +
        '<span class="ia-fb-xp">' + icone("bolt") + "+" + res.xp + " XP</span></div>";

      if (q.tipo === "aberta") {
        h += '<div class="ia-fb-nota"><span>Nota da correção</span><b>' + res.pontuacao + '/100</b>' +
          '<i class="ia-fb-nota-bar"><i style="width:' + res.pontuacao + '%"></i></i></div>';
      }
      if (res.feedback) h += '<p class="ia-fb-msg">' + fmt(res.feedback) + "</p>";

      if (res.status !== "certa" || q.tipo === "aberta" || q.tipo === "comando") {
        var gab = "";
        if (q.tipo === "multipla") gab = fmt(q.alternativas[rev.correta]);
        else if (q.tipo === "vf") gab = rev.correta ? "Verdadeiro" : "Falso";
        else if (q.tipo === "aberta") {
          gab = fmt(rev.gabarito);
          if (rev.criterios && rev.criterios.length) {
            gab += '<ul class="ia-fb-crit">' + rev.criterios.map(function (c) { return "<li>" + fmt(c) + "</li>"; }).join("") + "</ul>";
          }
        } else if (q.tipo === "comando") {
          gab = '<span class="ia-fb-cmds">' + (rev.respostas_aceitas || []).map(function (c) {
            return "<code>" + esc(c) + "</code>";
          }).join("") + "</span>";
        } else if (q.tipo === "ordenar") {
          var textos = {};
          q.passos.forEach(function (p) { textos[p.id] = p.texto; });
          gab = '<ol class="ia-fb-ordem">' + (rev.ordem_correta || []).map(function (id) {
            return "<li>" + fmt(textos[id]) + "</li>";
          }).join("") + "</ol>";
        }
        var rotulo = q.tipo === "aberta" ? "Resposta de referência" :
          (q.tipo === "comando" ? (res.status === "certa" ? "Também valem" : "Comandos aceitos") : "Resposta correta");
        if (gab) h += '<div class="ia-fb-gab"><span>' + rotulo + "</span><div>" + gab + "</div></div>";
      }
      if (rev.explicacao) h += '<p class="ia-fb-exp"><b>Por quê?</b> ' + fmt(rev.explicacao) + "</p>";
      return h + "</div>";
    }

    /* ── envio de resposta ── */
    function lerResposta(q, form) {
      if (q.tipo === "multipla") {
        var m = form.querySelector('input[type="radio"]:checked');
        if (!m) throw new Error("Escolha uma alternativa.");
        return parseInt(m.value, 10);
      }
      if (q.tipo === "vf") {
        var v = form.querySelector('input[type="radio"]:checked');
        if (!v) throw new Error("Escolha verdadeiro ou falso.");
        return v.value === "true";
      }
      if (q.tipo === "aberta") {
        var t = $("textarea", form).value.trim();
        if (t.length < 2) throw new Error("Escreva sua resposta antes de enviar.");
        return t;
      }
      if (q.tipo === "comando") {
        var c = $("input", form).value.trim();
        if (!c) throw new Error("Digite um comando.");
        return c;
      }
      return $$(".ia-passo", form).map(function (li) { return li.getAttribute("data-pid"); });
    }

    function enviar(q, art) {
      var form = $(".ia-q-form", art), erro = $(".ia-q-erro", art), btn = $(".ia-q-enviar", art);
      var resposta;
      erro.hidden = true;
      try { resposta = lerResposta(q, form); } catch (e) {
        erro.textContent = e.message; erro.hidden = false; return;
      }
      btn.disabled = true;
      btn.classList.add("is-loading");
      $("span", btn).textContent = q.tipo === "aberta" ? "Corrigindo com IA…" : "Corrigindo…";

      postJSON(D.urls.responder, { questao_id: q.id, resposta: resposta }).then(function (d) {
        aplicarResultado(q, d.resultado, true);
        atualizarProgresso(d.progresso);
        if (d.final) {
          D.final = d.final;
          setTimeout(function () { mostrarFinal(true); }, reduzMovimento ? 0 : 900);
        } else {
          var prox = $(".ia-q-prox", art);
          if (prox && modo === "uma") prox.focus({ preventScroll: true });
        }
        if (d.gamificacao) toastGamificacao(d.gamificacao);
      }).catch(function (e) {
        if (e.status === 409 && e.dados && e.dados.resultado) {
          aplicarResultado(q, e.dados.resultado, false);
          return;
        }
        btn.disabled = false;
        btn.classList.remove("is-loading");
        $("span", btn).textContent = "Confirmar resposta";
        erro.textContent = e.message;
        erro.hidden = false;
      });
    }

    /* ── dica ── */
    function mostrarDica(art, texto) {
      var box = $(".ia-dica-box", art);
      $("p", box).textContent = texto;
      box.hidden = false;
      var b = $(".ia-q-dica", art);
      b.disabled = true;
      $("span", b).innerHTML = "Dica usada <small>(−50% XP)</small>";
      var xpEl = $(".ia-q-xp", art);
      if (!xpEl.classList.contains("is-final")) {
        var xp = parseInt(xpEl.getAttribute("data-xp"), 10);
        xpEl.innerHTML = "<s>+" + xp + "</s> +" + Math.round(xp / 2) + " XP";
      }
    }

    /* ── ordenar: setas + arrastar ── */
    function renumerar(ol) {
      $$(".ia-passo", ol).forEach(function (li, i) { $(".ia-passo-n", li).textContent = String(i + 1); });
    }
    function initOrdenar(art) {
      var ol = $(".ia-ordem", art);
      if (!ol) return;
      var status = $("[data-ordem-status]", art);
      ol.addEventListener("click", function (ev) {
        var b = ev.target.closest("[data-mover]");
        if (!b || b.disabled) return;
        var li = b.closest(".ia-passo");
        var dir = parseInt(b.getAttribute("data-mover"), 10);
        if (dir < 0 && li.previousElementSibling) ol.insertBefore(li, li.previousElementSibling);
        else if (dir > 0 && li.nextElementSibling) ol.insertBefore(li.nextElementSibling, li);
        else return;
        renumerar(ol);
        b.focus();
        var pos = $$(".ia-passo", ol).indexOf(li) + 1;
        if (status) status.textContent = "Movido para a posição " + pos + ".";
        li.classList.remove("is-movido"); void li.offsetWidth; li.classList.add("is-movido");
      });

      var arrastando = null;
      ol.addEventListener("dragstart", function (ev) {
        arrastando = ev.target.closest(".ia-passo");
        if (!arrastando || !arrastando.draggable) { arrastando = null; return; }
        arrastando.classList.add("is-arrastando");
        ev.dataTransfer.effectAllowed = "move";
        try { ev.dataTransfer.setData("text/plain", arrastando.getAttribute("data-pid")); } catch (e) { /* IE */ }
      });
      ol.addEventListener("dragover", function (ev) {
        if (!arrastando) return;
        ev.preventDefault();
        var alvo = ev.target.closest(".ia-passo");
        if (!alvo || alvo === arrastando) return;
        var r = alvo.getBoundingClientRect();
        var depois = ev.clientY > r.top + r.height / 2;
        ol.insertBefore(arrastando, depois ? alvo.nextElementSibling : alvo);
        renumerar(ol);
      });
      ol.addEventListener("dragend", function () {
        if (arrastando) arrastando.classList.remove("is-arrastando");
        arrastando = null;
      });
    }

    /* ── liga cada questão ── */
    artigos.forEach(function (art) {
      var q = porId[art.getAttribute("data-qid")];
      var form = $(".ia-q-form", art);
      form.addEventListener("submit", function (ev) { ev.preventDefault(); if (!q.resultado) enviar(q, art); });
      form.addEventListener("change", function () { $(".ia-q-erro", art).hidden = true; });

      var ta = $("textarea", form);
      if (ta) {
        var n = $(".ia-count .n", form);
        ta.addEventListener("input", function () { n.textContent = ta.value.length; });
        ta.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); form.requestSubmit ? form.requestSubmit() : enviar(q, art); }
        });
      }
      initOrdenar(art);

      $(".ia-q-dica", art).addEventListener("click", function () {
        var b = this;
        if (b.disabled) return;
        if (!window.confirm("Usar a dica reduz o XP desta questão pela metade. Ver a dica?")) return;
        b.disabled = true;
        postJSON(D.urls.dica, { questao_id: q.id }).then(function (d) {
          q.dica_usada = true;
          mostrarDica(art, d.dica);
        }).catch(function (e) {
          b.disabled = false;
          var erro = $(".ia-q-erro", art);
          erro.textContent = e.message; erro.hidden = false;
        });
      });

      if (q.dica_usada) mostrarDica(art, q.dica || "Dica já utilizada nesta questão.");
      if (q.resultado) aplicarResultado(q, q.resultado, false);
    });

    /* ── resultado final ── */
    function mensagemNota(n) {
      if (n >= 90) return ["Mandou muito bem!", "Domínio total do tema. Que tal subir o nível?"];
      if (n >= 70) return ["Bom trabalho!", "Base sólida — revise os pontos abaixo para fechar as lacunas."];
      if (n >= 50) return ["Quase lá!", "Releia o resumo e as explicações das questões que escaparam."];
      return ["Bora revisar?", "Errar faz parte. Veja a revisão abaixo e gere outra atividade sobre o tema."];
    }

    function mostrarFinal(comemorar) {
      var f = D.final, sec = $("#iaFinal");
      if (!f || !sec) return;
      var m = mensagemNota(f.nota);
      var circ = 2 * Math.PI * 52;
      var classe = f.nota >= 70 ? "alta" : (f.nota >= 40 ? "media" : "baixa");
      var labelMais = f.ja_no_maximo ? "Outra no nível Avançado" : "Gerar mais difícil (" + f.proximo_nivel + ")";

      var h = '<div class="ia-final-top">' +
        '<div class="ia-score is-' + classe + '" role="img" aria-label="Nota ' + f.nota + ' por cento">' +
          '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="trk" cx="60" cy="60" r="52"/>' +
          '<circle class="val" cx="60" cy="60" r="52" style="stroke-dasharray:' + circ.toFixed(2) +
          ";stroke-dashoffset:" + (comemorar ? circ : circ * (1 - f.nota / 100)).toFixed(2) + '"/></svg>' +
          '<span class="ia-score-txt"><strong>' + f.nota + "<small>%</small></strong><span>nota</span></span>" +
        "</div>" +
        '<div class="ia-final-txt">' +
          '<span class="ia-final-kicker">' + icone("trophy") + " Atividade concluída</span>" +
          '<h2 id="iaFinalTitulo">' + esc(m[0]) + "</h2>" +
          "<p>" + esc(m[1]) + "</p>" +
          '<ul class="ia-final-stats" role="list">' +
            "<li><b>" + f.acertos + "/" + f.total + "</b><span>acertos</span></li>" +
            '<li class="xp"><b>+' + f.xp_ganho + "</b><span>XP ganho de " + f.xp_total + "</span></li>" +
            "<li><b>" + f.erradas.length + "</b><span>para revisar</span></li>" +
          "</ul>" +
        "</div></div>" +
        '<div class="ia-final-acoes">' +
          '<button type="button" class="btn btn-primary" data-final="mesmo">' + icone("sparkles") + " Gerar outra sobre o mesmo tema</button>" +
          '<button type="button" class="btn btn-outline" data-final="dificil">' + icone("flame") + " " + esc(labelMais) + "</button>" +
          '<button type="button" class="btn btn-ghost" data-final="refazer">' + icone("refresh") + " Refazer esta</button>" +
        "</div>" +
        '<p class="ia-final-erro" role="alert" hidden></p>';

      if (f.erradas.length) {
        h += '<div class="ia-revisao"><h3>' + icone("history") + " Revisão do que escapou</h3><ol role=\"list\">";
        f.erradas.forEach(function (e) {
          var q = porId[e.id];
          h += '<li class="ia-rev-item"><button type="button" class="ia-rev-ir" data-ir="' + esc(e.id) + '">Questão ' + (q ? q.idx + 1 : "") + "</button>" +
            '<p class="ia-rev-enun">' + fmt(e.enunciado) + "</p>" +
            '<div class="ia-rev-linhas">' +
              '<p class="ia-rev-sua"><span>Sua resposta</span>' + (e.sua_resposta ? (e.tipo === "comando" ? "<code>" + esc(e.sua_resposta) + "</code>" : fmt(e.sua_resposta)) : "<em>—</em>") +
                (e.pontuacao ? " <small>(" + e.pontuacao + "/100)</small>" : "") + "</p>" +
              '<p class="ia-rev-certa"><span>Resposta certa</span>' + (e.tipo === "comando" ? "<code>" + esc(e.gabarito) + "</code>" : fmt(e.gabarito)) + "</p>" +
            "</div>" +
            (e.explicacao ? '<p class="ia-rev-exp">' + fmt(e.explicacao) + "</p>" : "") +
            "</li>";
        });
        h += "</ol></div>";
      } else {
        h += '<div class="ia-gabaritou">' + icone("trophy") + "<p><strong>Gabaritou!</strong> Nenhuma questão para revisar.</p></div>";
      }

      sec.innerHTML = h;
      sec.hidden = false;
      if (!D.ia_disponivel) {
        $$('[data-final="mesmo"], [data-final="dificil"]', sec).forEach(function (b) {
          b.disabled = true; b.title = "A IA não está configurada no servidor";
        });
      }

      $$("[data-final]", sec).forEach(function (b) {
        b.addEventListener("click", function () { acaoFinal(b.getAttribute("data-final"), b); });
      });
      $$(".ia-rev-ir", sec).forEach(function (b) {
        b.addEventListener("click", function () {
          var q = porId[b.getAttribute("data-ir")];
          if (q) irPara(q.idx, true);
        });
      });

      if (comemorar) {
        sec.scrollIntoView({ block: "start", behavior: reduzMovimento ? "auto" : "smooth" });
        sec.focus({ preventScroll: true });
        var val = $(".ia-score .val", sec);
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { val.style.strokeDashoffset = (circ * (1 - f.nota / 100)).toFixed(2); });
        });
        if (f.nota >= 70) confete();
      }
    }

    function acaoFinal(acao, botao) {
      var erro = $(".ia-final-erro");
      erro.hidden = true;
      if (acao === "refazer") {
        if (!window.confirm("Refazer zera suas respostas e a nota desta atividade. Continuar?")) return;
        botao.disabled = true;
        postJSON(D.urls.refazer, {}).then(function (d) { window.location.href = d.url; })
          .catch(function (e) { botao.disabled = false; erro.textContent = e.message; erro.hidden = false; });
        return;
      }
      var c = D.config;
      var params = {
        tema: c.tema,
        nivel: acao === "dificil" ? D.final.proximo_nivel : c.nivel,
        quantidade: c.quantidade >= 15 ? 15 : (c.quantidade >= 10 ? 10 : (c.quantidade >= 8 ? 8 : 5)),
        tipos: c.tipos && c.tipos.length ? c.tipos : ["multipla", "vf", "aberta", "comando", "ordenar"],
        foco: c.foco || "misto",
        base_id: c.base_id
      };
      if (c.post) params.post = c.post;  /* atividade de post: gera/abre do mesmo post */
      $$("[data-final]").forEach(function (b) { b.disabled = true; });
      gerarAtividade(D.urls.gerar, params, function (m) {
        $$("[data-final]").forEach(function (b) { b.disabled = false; });
        erro.textContent = m;
        erro.hidden = false;
      });
    }

    function confete() {
      if (reduzMovimento) return;
      var box = document.createElement("div");
      box.className = "ia-confete";
      box.setAttribute("aria-hidden", "true");
      var cores = ["var(--accent)", "var(--info)", "var(--purple)", "var(--warn)", "var(--accent-2)"];
      for (var i = 0; i < 90; i++) {
        var p = document.createElement("i");
        p.style.left = (Math.random() * 100).toFixed(2) + "%";
        p.style.background = cores[i % cores.length];
        p.style.animationDelay = (Math.random() * 0.6).toFixed(2) + "s";
        p.style.animationDuration = (2.2 + Math.random() * 1.8).toFixed(2) + "s";
        p.style.setProperty("--dx", ((Math.random() - 0.5) * 220).toFixed(0) + "px");
        p.style.setProperty("--rot", (360 + Math.random() * 720).toFixed(0) + "deg");
        if (i % 3 === 0) p.style.borderRadius = "50%";
        box.appendChild(p);
      }
      document.body.appendChild(box);
      setTimeout(function () { box.remove(); }, 4600);
    }

    function toastGamificacao(g) {
      var itens = [];
      if (g.subiu_nivel && g.nivel) itens.push({ ico: "trophy", txt: "Você subiu para " + g.nivel + "!" });
      (g.novas_conquistas || []).forEach(function (c) { itens.push({ ico: "sparkles", txt: "Conquista: " + c.nome }); });
      itens.forEach(function (it, i) {
        setTimeout(function () {
          var t = document.createElement("div");
          t.className = "ia-toast";
          t.setAttribute("role", "status");
          t.innerHTML = icone(it.ico) + "<span>" + esc(it.txt) + "</span>";
          document.body.appendChild(t);
          requestAnimationFrame(function () { t.classList.add("is-on"); });
          setTimeout(function () { t.classList.remove("is-on"); setTimeout(function () { t.remove(); }, 400); }, 4200);
        }, 1200 + i * 900);
      });
    }

    /* ── estado inicial ── */
    var primeiraPendente = D.questoes.filter(function (q) { return !q.resultado; })[0];
    atual = primeiraPendente ? primeiraPendente.idx : 0;
    aplicarModo();
    atualizarProgresso(D.progresso);
    if (D.final) mostrarFinal(false);
  }

  /* Carregado no fim do <body>, depois do main.js: o listener do main.js
     (que renderiza o markdown do #postBody) roda antes deste. */
  var iniciado = false;
  function boot() {
    if (iniciado) return;
    iniciado = true;
    initIndex();
    initVer();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

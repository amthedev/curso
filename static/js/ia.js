/* ==========================================================================
   Atividades com IA — formulário de geração, overlay de loading e resolução.
   JS puro, sem build. Todo texto vindo da IA entra no DOM escapado
   (textContent ou esc()) — nunca innerHTML cru.

   Tipos de questão: multipla, vf, aberta, comando, ordenar e os interativos
   associar (ligar pares), lacuna (completar o texto) e linha (caça ao erro).
   Cada tipo interativo é um "widget" (q.w) com ler() -> resposta e
   aplicar(resultado, animar) -> pinta o gabarito.
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
  var TIPOS_INTERATIVOS = { associar: 1, lacuna: 1, linha: 1 };
  var TODOS_OS_TIPOS = ["multipla", "vf", "aberta", "comando", "ordenar", "associar", "lacuna", "linha"];
  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  }
  /* só aceita caminho relativo do próprio site (vem do servidor, mas não custa validar) */
  function urlLocal(u, padrao) {
    return (typeof u === "string" && /^\/(?![\/\\])[^\s]*$/.test(u)) ? u : padrao;
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
    var plano = D.origem === "cronograma";   /* missão do plano diário: nada de "IA" na tela */
    if (plano) {
      var navIa = $(".nav-ia");
      if (navIa) { navIa.classList.remove("active"); navIa.removeAttribute("aria-current"); }
    }

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
      } else if (q.w) {
        q.w.aplicar(res, animar);
      }

      var xpEl = $(".ia-q-xp", art);
      xpEl.textContent = (res.xp > 0 ? "+" : "") + res.xp + " / " + res.xp_max + " XP";
      xpEl.classList.add("is-final");

      $(".ia-fb-wrap", art).innerHTML = htmlFeedback(q, res);
      var fb = $(".ia-fb", art);
      if (animar && fb && !reduzMovimento) fb.classList.add("is-anim");
      if (animar) efeitoResposta(art, res);
      atualizarNav();
    }

    /* microinteração: brilho no acerto, tremida no erro, "+XP" subindo do feedback */
    function efeitoResposta(art, res) {
      if (!reduzMovimento) {
        var cls = "ia-fx-" + res.status;
        art.classList.remove("ia-fx-certa", "ia-fx-errada", "ia-fx-parcial");
        void art.offsetWidth;
        art.classList.add(cls);
        setTimeout(function () { art.classList.remove(cls); }, 1100);
      }
      if (res.xp > 0 && typeof window.mostrarXP === "function") {
        setTimeout(function () { window.mostrarXP(res.xp, $(".ia-fb-xp", art)); }, reduzMovimento ? 0 : 250);
      }
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

      if (TIPOS_INTERATIVOS[q.tipo]) h += detalheInterativo(q, res);

      if (!TIPOS_INTERATIVOS[q.tipo] && (res.status !== "certa" || q.tipo === "aberta" || q.tipo === "comando")) {
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

    /* detalhe por parte (pares / lacunas / linhas) no cartão de feedback */
    function detalheInterativo(q, res) {
      var rev = res.revelar || {}, resp = res.resposta || [], itens = [], titulo = "";
      if (q.tipo === "associar") {
        titulo = "Seus pares";
        (q.termos || []).forEach(function (t, i) {
          var ok = !!(rev.acertos && rev.acertos[i]);
          var certa = q.definicoes[(rev.pares_corretos || [])[i]], sua = q.definicoes[resp[i]];
          itens.push([ok ? "ok" : "no", "<strong>" + fmt(t) + "</strong> → " + (ok ? fmt(certa)
            : "<s>" + fmt(sua) + "</s><em>Certo: " + fmt(certa) + "</em>")]);
        });
      } else if (q.tipo === "lacuna") {
        titulo = "Lacunas";
        (rev.aceitas || []).forEach(function (aceitas, i) {
          var ok = !!(rev.acertos && rev.acertos[i]);
          var dig = resp[i] ? "<code>" + esc(resp[i]) + "</code>" : "<em>em branco</em>";
          var lista = aceitas.map(function (a) { return "<code>" + esc(a) + "</code>"; }).join(" ");
          itens.push([ok ? "ok" : "no", "<strong>Lacuna " + (i + 1) + ":</strong> " + (ok ? dig
            : "<s>" + dig + "</s><em>Aceito: " + lista + "</em>")]);
        });
      } else if (q.tipo === "linha") {
        titulo = "Linhas suspeitas";
        var escolhidas = {};
        resp.forEach(function (x) { escolhidas[x] = true; });
        (rev.corretas || []).forEach(function (nn) {
          var ok = !!escolhidas[nn];
          itens.push([ok ? "ok" : "warn", "<strong>Linha " + nn + "</strong> <code>" + esc(String((q.trecho || [])[nn - 1] || "").trim()) + "</code>" +
            (ok ? "" : '<em class="w">Você não marcou essa</em>')]);
        });
        (rev.falsos || []).forEach(function (nn) {
          itens.push(["no", "<strong>Linha " + nn + "</strong> <code>" + esc(String((q.trecho || [])[nn - 1] || "").trim()) + "</code>" +
            '<em class="d">Essa era normal</em>']);
        });
      }
      if (!itens.length) return "";
      return '<div class="ia-fb-gab"><span>' + titulo + '</span><ul class="ia-fb-itens">' + itens.map(function (it) {
        return '<li class="' + it[0] + '"><span class="ia-fb-ic">' + icone(it[0] === "ok" ? "check" : (it[0] === "warn" ? "alert" : "x")) +
          "</span><div>" + it[1] + "</div></li>";
      }).join("") + "</ul></div>";
    }

    /* ── envio de resposta ── */
    function lerResposta(q, form) {
      if (q.w) return q.w.ler();
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
      var rotuloBtn = $("span", btn).textContent;
      btn.disabled = true;
      btn.classList.add("is-loading");
      $("span", btn).textContent = (q.tipo === "aberta" && !plano) ? "Corrigindo com IA…" : "Corrigindo…";

      postJSON(D.urls.responder, { questao_id: q.id, resposta: resposta }).then(function (d) {
        aplicarResultado(q, d.resultado, true);
        atualizarProgresso(d.progresso);
        if (d.final) {
          D.final = d.final;
          D.extra = d.cronograma || null;
          setTimeout(function () { mostrarFinal(true); }, reduzMovimento ? 0 : 900);
        } else {
          var prox = $(".ia-q-prox", art);
          if (prox && modo === "uma") prox.focus({ preventScroll: true });
        }
        if (d.gamificacao) gamificar(d.gamificacao, d.cronograma);
      }).catch(function (e) {
        if (e.status === 409 && e.dados && e.dados.resultado) {
          aplicarResultado(q, e.dados.resultado, false);
          return;
        }
        btn.disabled = false;
        btn.classList.remove("is-loading");
        $("span", btn).textContent = rotuloBtn;
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

    /* ══ TIPOS INTERATIVOS ═════════════════════════════════════════════════ */

    /* ── associar: termo → definição, uma cor por par, linha ligando os dois ── */
    function initAssociar(q, art) {
      var raiz = $("[data-assoc]", art);
      if (!raiz) return null;
      var board = $(".ia-assoc-board", raiz), svg = $(".ia-assoc-lines", raiz);
      var termos = $$(".ia-assoc-t", raiz), defs = $$(".ia-assoc-d", raiz);
      var n = termos.length;
      var contador = $("[data-assoc-n]", raiz), limpar = $("[data-assoc-limpar]", raiz);
      var aviso = $("[data-assoc-status]", raiz);
      var NS = "http://www.w3.org/2000/svg";
      var st = { par: [], slot: [], pend: null, travado: false, res: null };
      var linhas = {};
      for (var k = 0; k < n; k++) { st.par.push(-1); st.slot.push(-1); }

      function txt(lado, i) { return $(".ia-assoc-txt", (lado === "t" ? termos : defs)[i]).textContent; }
      function falar(m) { aviso.textContent = m; }
      function termoDaDef(j) { return st.par.indexOf(j); }
      function formados() { return st.par.filter(function (j) { return j >= 0; }).length; }
      function slotLivre() {
        var usados = {};
        st.slot.forEach(function (x) { if (x >= 0) usados[x] = true; });
        for (var c = 0; c < 5; c++) if (!usados[c]) return c;
        return 0;
      }

      function estado(b, lado, i) {
        var t = lado === "t" ? i : termoDaDef(i);          /* índice do termo do par (ou -1) */
        var par = t >= 0 && st.par[t] >= 0;
        var sel = !!st.pend && st.pend.lado === lado && st.pend.i === i;
        b.classList.toggle("is-par", par);
        b.classList.toggle("is-sel", sel);
        b.setAttribute("aria-pressed", sel ? "true" : "false");
        if (par) b.style.setProperty("--pc", "var(--ia-pc" + st.slot[t] + ")"); else b.style.removeProperty("--pc");
        if (!st.res) $(".ia-assoc-pin", b).textContent = par ? String(st.slot[t] + 1) : "";
        var rotulo = (lado === "t" ? "Termo: " : "Definição: ") + txt(lado, i);
        if (par && !st.res) rotulo += ". Ligado a: " + (lado === "t" ? txt("d", st.par[t]) : txt("t", t)) + ". Ative para desfazer.";
        b.setAttribute("aria-label", rotulo);
      }

      function pintar() {
        raiz.setAttribute("data-pend", st.pend ? st.pend.lado : "");
        termos.forEach(function (b, i) { estado(b, "t", i); });
        defs.forEach(function (b, j) { estado(b, "d", j); });
        var f = formados();
        contador.textContent = String(f);
        raiz.classList.toggle("is-completo", f === n);
        limpar.hidden = st.travado || f === 0;
        desenhar();
      }

      /* linhas (só no layout em duas colunas) */
      function visivel() { return board.offsetWidth > 0 && window.getComputedStyle(svg).display !== "none"; }
      function ponto(elem, borda) {
        var rb = board.getBoundingClientRect(), r = elem.getBoundingClientRect();
        return { x: (borda === "d" ? r.right : r.left) - rb.left, y: r.top - rb.top + r.height / 2 };
      }
      function curva(a, b) {
        var dx = Math.max(20, (b.x - a.x) * 0.5);
        return "M" + a.x.toFixed(1) + " " + a.y.toFixed(1) +
          " C" + (a.x + dx).toFixed(1) + " " + a.y.toFixed(1) + " " + (b.x - dx).toFixed(1) + " " + b.y.toFixed(1) +
          " " + b.x.toFixed(1) + " " + b.y.toFixed(1);
      }
      function criarLinha(id) {
        var g = document.createElementNS(NS, "g");
        var path = document.createElementNS(NS, "path");
        var c1 = document.createElementNS(NS, "circle"), c2 = document.createElementNS(NS, "circle");
        c1.setAttribute("r", "4"); c2.setAttribute("r", "4");
        g.appendChild(path); g.appendChild(c1); g.appendChild(c2);
        svg.appendChild(g);
        return { g: g, path: path, c1: c1, c2: c2, novo: true };
      }
      function desenhar() {
        if (!visivel()) return;
        svg.setAttribute("viewBox", "0 0 " + board.offsetWidth + " " + board.offsetHeight);
        var alvo = {};
        st.par.forEach(function (j, i) {
          if (j < 0) return;
          var ok = st.res ? st.res.acertos[i] : null;
          alvo["p" + i] = { a: ponto(termos[i], "d"), b: ponto(defs[j], "e"), cls: st.res ? (ok ? "ok" : "no") : "par", slot: st.slot[i] };
          if (st.res && !ok && typeof st.res.corretos[i] === "number") {
            alvo["c" + i] = { a: ponto(termos[i], "d"), b: ponto(defs[st.res.corretos[i]], "e"), cls: "gab", slot: st.slot[i] };
          }
        });
        Object.keys(linhas).forEach(function (id) {
          if (!alvo[id]) { svg.removeChild(linhas[id].g); delete linhas[id]; }
        });
        Object.keys(alvo).forEach(function (id) {
          var t = alvo[id], L = linhas[id];
          if (!L) L = linhas[id] = criarLinha(id);
          L.g.setAttribute("class", "ia-line is-" + t.cls);
          L.g.style.setProperty("--pc", "var(--ia-pc" + t.slot + ")");
          L.path.setAttribute("d", curva(t.a, t.b));
          L.c1.setAttribute("cx", t.a.x.toFixed(1)); L.c1.setAttribute("cy", t.a.y.toFixed(1));
          L.c2.setAttribute("cx", t.b.x.toFixed(1)); L.c2.setAttribute("cy", t.b.y.toFixed(1));
          if (L.novo) {
            L.novo = false;
            if (!reduzMovimento && t.cls !== "no" && t.cls !== "gab" && L.path.getTotalLength) {
              var len = L.path.getTotalLength();
              L.path.style.strokeDasharray = len;
              L.path.style.strokeDashoffset = len;
              L.path.getBoundingClientRect();
              L.path.style.transition = "stroke-dashoffset .4s cubic-bezier(.2,.8,.2,1)";
              L.path.style.strokeDashoffset = "0";
              setTimeout(function (p) {
                return function () { p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; p.style.transition = ""; };
              }(L.path), 460);
            }
          }
        });
      }

      function pop(elem) {
        if (reduzMovimento) return;
        elem.classList.remove("ia-pop"); void elem.offsetWidth; elem.classList.add("ia-pop");
      }

      function clique(lado, i, teclado) {
        if (st.travado) return;
        var t = lado === "t" ? i : termoDaDef(i);
        if (t >= 0 && st.par[t] >= 0) {                         /* já está num par: desfaz */
          var j = st.par[t];
          st.par[t] = -1; st.slot[t] = -1;
          pintar();
          falar("Par desfeito: " + txt("t", t) + " e " + txt("d", j) + ".");
          return;
        }
        if (!st.pend || st.pend.lado === lado) {              /* escolhe (ou troca/cancela) o item pendente */
          var mesmo = st.pend && st.pend.i === i;
          st.pend = mesmo ? null : { lado: lado, i: i };
          pintar();
          falar(st.pend ? (lado === "t" ? "Termo escolhido: " : "Definição escolhida: ") + txt(lado, i) +
            ". Agora escolha " + (lado === "t" ? "a definição." : "o termo.") : "Seleção cancelada.");
          return;
        }
        var ti = lado === "t" ? i : st.pend.i, di = lado === "d" ? i : st.pend.i;
        st.par[ti] = di; st.slot[ti] = slotLivre(); st.pend = null;
        pintar();
        pop(termos[ti]); pop(defs[di]);
        var f = formados();
        falar("Par formado: " + txt("t", ti) + " com " + txt("d", di) + ". " +
          (f === n ? "Todos os pares formados. Use o botão Conferir." : f + " de " + n + "."));
        if (teclado && f < n) {
          var prox = termos.filter(function (_, x) { return st.par[x] < 0; })[0];
          if (prox) prox.focus({ preventScroll: true });
        }
      }

      raiz.addEventListener("click", function (ev) {
        var b = ev.target.closest(".ia-assoc-item");
        if (!b || b.disabled || !raiz.contains(b)) return;
        clique(b.getAttribute("data-lado"), parseInt(b.getAttribute("data-i"), 10), ev.detail === 0);
      });
      raiz.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape" && st.pend) { st.pend = null; pintar(); falar("Seleção cancelada."); }
      });
      limpar.addEventListener("click", function () {
        for (var x = 0; x < n; x++) { st.par[x] = -1; st.slot[x] = -1; }
        st.pend = null;
        pintar();
        falar("Todos os pares foram desfeitos.");
      });

      if (typeof ResizeObserver !== "undefined") new ResizeObserver(function () { desenhar(); }).observe(board);
      else window.addEventListener("resize", desenhar);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { desenhar(); });
      pintar();

      return {
        ler: function () {
          var falta = n - formados();
          if (falta > 0) {
            throw new Error(falta === n ? "Ligue cada termo à sua definição antes de conferir."
              : "Faltam " + falta + (falta === 1 ? " par" : " pares") + " — ligue todos os termos antes de conferir.");
          }
          return st.par.slice();
        },
        aplicar: function (res) {
          var rev = res.revelar || {}, resp = res.resposta || [];
          var corretos = rev.pares_corretos || [];
          st.travado = true; st.pend = null; st.res = null;
          for (var x = 0; x < n; x++) { st.par[x] = typeof resp[x] === "number" ? resp[x] : -1; st.slot[x] = x % 5; }
          var acertos = rev.acertos || termos.map(function (_, x) { return corretos[x] === st.par[x]; });
          st.res = { acertos: acertos, corretos: corretos };
          raiz.classList.add("is-resp");
          pintar();
          termos.forEach(function (b, x) {
            var ok = !!acertos[x];
            [b, defs[st.par[x]]].forEach(function (alvo) {
              if (!alvo) return;
              alvo.classList.add(ok ? "is-certa" : "is-errada");
              $(".ia-assoc-pin", alvo).textContent = ok ? "✓" : "✕";
            });
          });
          desenhar();
        }
      };
    }

    /* ── lacuna: campos dentro do texto; Enter passa para a próxima e confere no fim ── */
    function initLacuna(q, art) {
      var raiz = $("[data-lacuna]", art);
      if (!raiz) return null;
      var campos = $$(".ia-gap", raiz);
      var form = $(".ia-q-form", art);
      function ajustar(inp) { inp.style.width = Math.max(8, Math.min(inp.value.length + 3, 34)) + "ch"; }
      function tremer(inp) {
        if (reduzMovimento) return;
        inp.classList.remove("ia-shake"); void inp.offsetWidth; inp.classList.add("ia-shake");
      }
      campos.forEach(function (inp) {
        ajustar(inp);
        inp.addEventListener("input", function () { ajustar(inp); inp.classList.remove("is-vazio"); });
        inp.addEventListener("keydown", function (ev) {
          if (ev.key !== "Enter" || ev.isComposing) return;
          ev.preventDefault();
          var i = campos.indexOf(inp);
          var prox = campos.slice(i + 1).concat(campos.slice(0, i)).filter(function (c) { return !c.value.trim(); })[0];
          if (prox) { prox.focus(); return; }
          if (form.requestSubmit) form.requestSubmit();
          else form.dispatchEvent(new Event("submit", { cancelable: true }));
        });
      });
      return {
        ler: function () {
          var valores = campos.map(function (c) { return c.value.trim(); });
          if (!valores.some(Boolean)) {
            campos.forEach(tremer);
            campos[0].focus();
            throw new Error("Preencha as lacunas antes de conferir.");
          }
          return valores;
        },
        aplicar: function (res) {
          var rev = res.revelar || {}, resp = res.resposta || [], aceitas = rev.aceitas || [], ac = rev.acertos || [];
          campos.forEach(function (inp, i) {
            inp.value = resp[i] || "";
            if (!inp.value) inp.placeholder = "—";
            ajustar(inp);
            inp.disabled = true;
            var ok = !!ac[i];
            inp.classList.add(ok ? "is-certa" : "is-errada");
            if (!ok && aceitas[i] && aceitas[i].length) {
              var fix = el("span", "ia-gap-fix");
              fix.appendChild(el("i", "", "→"));
              fix.appendChild(document.createTextNode(aceitas[i][0]));
              inp.parentNode.appendChild(fix);
            }
          });
        }
      };
    }

    /* ── linha (caça ao erro): clicar alterna a marcação da linha ── */
    function initLinha(q, art) {
      var raiz = $("[data-linha]", art);
      if (!raiz) return null;
      var linhas = $$(".ia-code-line", raiz);
      var cont = $("[data-linha-count]", raiz), aviso = $("[data-linha-status]", art);
      var marc = {};
      function total() { return Object.keys(marc).length; }
      function rotulo() {
        var t = total();
        return t ? t + (t === 1 ? " linha marcada" : " linhas marcadas") : "nenhuma linha marcada";
      }
      raiz.addEventListener("click", function (ev) {
        var b = ev.target.closest(".ia-code-line");
        if (!b || b.disabled) return;
        var nn = parseInt(b.getAttribute("data-n"), 10);
        if (marc[nn]) delete marc[nn]; else marc[nn] = true;
        var on = !!marc[nn];
        b.classList.toggle("is-sel", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
        cont.textContent = rotulo();
        aviso.textContent = "Linha " + nn + (on ? " marcada. " : " desmarcada. ") + rotulo() + ".";
        if (on && !reduzMovimento) { b.classList.remove("ia-pop"); void b.offsetWidth; b.classList.add("ia-pop"); }
      });
      raiz.addEventListener("keydown", function (ev) {
        if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
        var i = linhas.indexOf(document.activeElement);
        if (i < 0) return;
        ev.preventDefault();
        var alvo = linhas[Math.max(0, Math.min(linhas.length - 1, i + (ev.key === "ArrowDown" ? 1 : -1)))];
        if (alvo) alvo.focus();
      });
      return {
        ler: function () {
          var lista = Object.keys(marc).map(Number).sort(function (a, b) { return a - b; });
          if (!lista.length) throw new Error("Clique em pelo menos uma linha suspeita.");
          return lista;
        },
        aplicar: function (res) {
          var rev = res.revelar || {}, escolhidas = {};
          (res.resposta || []).forEach(function (x) { escolhidas[x] = true; });
          var acertos = rev.acertos || [], falsos = rev.falsos || [], esq = rev.esquecidas || [];
          raiz.classList.add("is-resp");
          linhas.forEach(function (b) {
            var nn = parseInt(b.getAttribute("data-n"), 10);
            var info = null;
            if (acertos.indexOf(nn) >= 0) info = ["is-certa", "✓", "suspeita"];
            else if (falsos.indexOf(nn) >= 0) info = ["is-errada", "✕", "era normal"];
            else if (esq.indexOf(nn) >= 0) info = ["is-esquecida", "!", "faltou"];
            b.classList.toggle("is-sel", !!escolhidas[nn]);
            b.setAttribute("aria-pressed", escolhidas[nn] ? "true" : "false");
            if (!info) return;
            b.classList.add(info[0]);
            var lm = $(".ia-lm", b);
            lm.textContent = "";
            lm.appendChild(el("b", "", info[1]));
            lm.appendChild(el("span", "ia-lm-t", info[2]));
            b.appendChild(el("span", "ia-sr", " — " + info[2]));
          });
          var certas = acertos.length + esq.length;
          cont.textContent = acertos.length + " de " + certas + (certas === 1 ? " suspeita achada" : " suspeitas achadas");
          var leg = el("div", "ia-code-legenda");
          [["is-certa", "Acertou", acertos.length], ["is-errada", "Marcou sem precisar", falsos.length],
           ["is-esquecida", "Esqueceu", esq.length]].forEach(function (it) {
            var li = el("span", "ia-leg " + it[0]);
            li.appendChild(el("i", ""));
            li.appendChild(document.createTextNode(it[1] + " (" + it[2] + ")"));
            leg.appendChild(li);
          });
          raiz.appendChild(leg);
        }
      };
    }

    /* ── liga cada questão ── */
    artigos.forEach(function (art) {
      var q = porId[art.getAttribute("data-qid")];
      var form = $(".ia-q-form", art);
      if (q.tipo === "associar") q.w = initAssociar(q, art);
      else if (q.tipo === "lacuna") q.w = initLacuna(q, art);
      else if (q.tipo === "linha") q.w = initLinha(q, art);
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
      if (plano) {
        if (n >= 90) return ["Mandou muito bem!", "Esse assunto está dominado — o plano vai te trazer desafios maiores."];
        if (n >= 70) return ["Bom trabalho!", "O que escapou volta como revisão nos próximos dias, na dose certa."];
        if (n >= 50) return ["Quase lá!", "Releia as explicações abaixo — o plano vai reforçar esses pontos."];
        return ["Bora revisar?", "Errar faz parte: o plano se adapta e traz esses pontos de volta para fixar."];
      }
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
      var extra = plano ? (D.extra || {}) : null;
      var urlPlano = urlLocal(extra && extra.url, urlLocal(D.urls.cronograma, "/cronograma/"));

      var h = '<div class="ia-final-top">' +
        '<div class="ia-score is-' + classe + '" role="img" aria-label="Nota ' + f.nota + ' por cento">' +
          '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="trk" cx="60" cy="60" r="52"/>' +
          '<circle class="val" cx="60" cy="60" r="52" style="stroke-dasharray:' + circ.toFixed(2) +
          ";stroke-dashoffset:" + (comemorar ? circ : circ * (1 - f.nota / 100)).toFixed(2) + '"/></svg>' +
          '<span class="ia-score-txt"><strong>' + f.nota + "<small>%</small></strong><span>nota</span></span>" +
        "</div>" +
        '<div class="ia-final-txt">' +
          '<span class="ia-final-kicker">' + icone("trophy") + (plano ? " Missão concluída" : " Atividade concluída") + "</span>" +
          '<h2 id="iaFinalTitulo">' + esc(m[0]) + "</h2>" +
          "<p>" + esc(m[1]) + "</p>" +
          '<ul class="ia-final-stats" role="list">' +
            "<li><b>" + f.acertos + "/" + f.total + "</b><span>acertos</span></li>" +
            '<li class="xp"><b>+' + f.xp_ganho + "</b><span>XP ganho de " + f.xp_total + "</span></li>" +
            "<li><b>" + f.erradas.length + "</b><span>para revisar</span></li>" +
          "</ul>" +
        "</div></div>" +
        (plano ? blocoPlano(extra, urlPlano) :
        '<div class="ia-final-acoes">' +
          '<button type="button" class="btn btn-primary" data-final="mesmo">' + icone("sparkles") + " Gerar outra sobre o mesmo tema</button>" +
          '<button type="button" class="btn btn-outline" data-final="dificil">' + icone("flame") + " " + esc(labelMais) + "</button>" +
          '<button type="button" class="btn btn-ghost" data-final="refazer">' + icone("refresh") + " Refazer esta</button>" +
        "</div>") +
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
      if (!plano && !D.ia_disponivel) {
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
        if (f.nota >= 70 || (extra && extra.dia_completo)) confete();
      }
    }

    /* fim da missão do plano: volta ao cronograma (e ao baú, se o dia fechou) */
    function blocoPlano(extra, url) {
      var h = "";
      if (extra && extra.dia_completo) {
        h += '<div class="ia-dia-completo" role="status">' + icone("trophy") +
          "<p><strong>Plano de hoje completo!</strong> " +
          (extra.bau_disponivel ? "Seu baú do dia está esperando por você." : "Volte amanhã para a próxima rodada.") + "</p></div>";
      }
      h += '<div class="ia-final-acoes">';
      if (extra && extra.bau_disponivel) {
        h += '<a class="btn btn-primary ia-btn-bau" href="' + esc(url) + '#bau">' + icone("gift") + " Abrir o baú do dia</a>" +
          '<a class="btn btn-outline" href="' + esc(url) + '">' + icone("calendar") + " Voltar ao cronograma</a>";
      } else {
        h += '<a class="btn btn-primary" href="' + esc(url) + '">' + icone("calendar") + " Voltar ao cronograma</a>";
      }
      return h + "</div>";
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
        tipos: c.tipos && c.tipos.length ? c.tipos : TODOS_OS_TIPOS,
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

    /* XP/nível/conquistas: usa o painel global (gamificacao.js) quando existe */
    function gamificar(g, extra) {
      var dados = g || {};
      if (plano) {
        /* conquistas "de IA" não fazem sentido no plano: não anuncia (continuam no painel) */
        dados = {
          xp_ganho_agora: g.xp_ganho_agora, xp_total_usuario: g.xp_total_usuario, nivel: g.nivel,
          subiu_nivel: g.subiu_nivel,
          novas_conquistas: (g.novas_conquistas || []).filter(function (c) { return !/^ia_/.test(c.codigo || ""); })
        };
      }
      mostrarGami(dados, 1300);
      /* bônus do dia / conquistas do plano vindos do cronograma */
      if (extra && (extra.xp_dia > 0 || (extra.novas_conquistas && extra.novas_conquistas.length))) {
        mostrarGami({ xp_ganho_agora: extra.xp_dia || 0, novas_conquistas: extra.novas_conquistas || [] }, 2800);
      }
    }
    function mostrarGami(dados, atraso) {
      setTimeout(function () {
        if (typeof window.gamificacaoProcessar === "function") window.gamificacaoProcessar(dados);
        else toastGamificacao(dados);
      }, reduzMovimento ? 0 : atraso);
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

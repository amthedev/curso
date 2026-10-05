/* ==========================================================================
   Tutor "Travei?" — gaveta de chat do laboratório das lições.
   JS puro, sem build. REGRA DE OURO: nenhum texto vindo da IA (ou do aluno)
   entra no DOM como HTML. Tudo passa por textContent / createTextNode; a única
   formatação permitida é `código` inline, criado como nós <code> pelo renderTexto().
   ========================================================================== */
(function () {
  "use strict";

  var raiz = document.getElementById("tutor");
  if (!raiz) return;

  var painel = raiz.querySelector(".tutor-painel");
  var msgs = document.getElementById("tutorMsgs");
  var sel = document.getElementById("tutorCtx");
  var form = document.getElementById("tutorForm");
  var input = document.getElementById("tutorInput");
  var enviar = document.getElementById("tutorEnviar");
  var rodape = document.getElementById("tutorRodape");
  var fab = document.getElementById("tutorFab");
  var chips = Array.prototype.slice.call(raiz.querySelectorAll(".tutor-chip"));
  if (!painel || !msgs || !sel || !form || !input) return;

  var LICAO = raiz.getAttribute("data-licao");
  var URL_PERGUNTAR = raiz.getAttribute("data-url-perguntar");
  var URL_HISTORICO = raiz.getAttribute("data-url-historico");

  var reduzMovimento = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var telaPequena = window.matchMedia ? window.matchMedia("(max-width: 760px)") : { matches: false };

  var ROTULOS = { 1: "pista", 2: "conceito", 3: "comando" };
  var PADRAO = {
    1: "Me dá uma pista, sem entregar a resposta.",
    2: "Pode ser mais direto? Qual é o conceito e qual comando devo usar?",
    3: "Mostra o comando exato e explica cada parte."
  };
  var BOAS_VINDAS = "Oi! Eu sou o Tutor. Travou em alguma missão? Escolha uma ajuda rápida ou descreva " +
    "sua dúvida: eu começo com pistas e só mostro o comando exato se você pedir.";

  var estado = {
    aberto: false,
    ocupado: false,       // aguardando resposta da IA
    carregando: false,    // buscando o histórico do chat
    esgotado: false,      // limite diário atingido
    nivel: 1,
    ctx: "",              // id da missão ("" = laboratório em geral)
    gatilho: null,        // elemento que abriu a gaveta (devolve o foco ao fechar)
    carga: 0              // descarta respostas de históricos antigos ao trocar de missão
  };

  /* ── utilitários ───────────────────────────────────────────────────── */
  function el(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto != null) n.textContent = texto;
    return n;
  }

  /* Texto → nós DOM. Só `código` vira <code>; todo o resto é nó de texto. */
  function renderTexto(alvo, texto) {
    alvo.textContent = "";
    var s = String(texto == null ? "" : texto);
    var re = /`([^`\n]{1,200})`/g, ultimo = 0, m;
    while ((m = re.exec(s)) !== null) {
      if (m.index > ultimo) alvo.appendChild(document.createTextNode(s.slice(ultimo, m.index)));
      alvo.appendChild(el("code", "", m[1]));
      ultimo = re.lastIndex;
    }
    if (ultimo < s.length) alvo.appendChild(document.createTextNode(s.slice(ultimo)));
  }

  function req(url, opcoes) {
    opcoes = opcoes || {};
    opcoes.credentials = "same-origin";
    opcoes.headers = Object.assign({ "Accept": "application/json" }, opcoes.headers || {});
    return fetch(url, opcoes).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (dados) {
        if (r.status === 401 && dados && dados.login) {
          window.location.href = dados.login + "?proximo=" + encodeURIComponent(window.location.pathname);
        }
        if (!r.ok || !dados || dados.ok === false) {
          var erro = new Error((dados && dados.erro) ||
            (r.status >= 500 ? "O tutor teve um problema. Tente de novo em instantes."
                             : "Algo deu errado (" + r.status + ")."));
          erro.status = r.status;
          erro.codigo = dados && dados.codigo;
          throw erro;
        }
        return dados;
      });
    }, function () {
      throw new Error("Sem conexão com o servidor. Verifique sua internet e tente de novo.");
    });
  }

  function rolarAoFim() {
    var topo = msgs.scrollHeight;
    if (!reduzMovimento && msgs.scrollTo) msgs.scrollTo({ top: topo, behavior: "smooth" });
    else msgs.scrollTop = topo;
  }

  /* ── mensagens ─────────────────────────────────────────────────────── */
  function addMsg(papel, conteudo, opcoes) {
    opcoes = opcoes || {};
    var ia = papel === "assistant";
    var msg = el("div", "tutor-msg " + (ia ? "tutor-msg-ia" : "tutor-msg-eu") +
      (opcoes.classe ? " " + opcoes.classe : ""));
    var quem = el("div", "tutor-quem");
    quem.appendChild(el("span", "", ia ? "Tutor" : "Você"));
    if (ia && opcoes.nivel && ROTULOS[opcoes.nivel]) quem.appendChild(el("span", "tutor-tag", ROTULOS[opcoes.nivel]));
    var bolha = el("div", "tutor-bolha");
    renderTexto(bolha, conteudo);
    msg.appendChild(quem);
    msg.appendChild(bolha);
    msgs.appendChild(msg);
    if (!opcoes.semRolar) rolarAoFim();
    return msg;
  }

  function addAviso(texto, classe) {
    var msg = el("div", "tutor-msg tutor-msg-ia " + classe);
    var bolha = el("div", "tutor-bolha");
    renderTexto(bolha, texto);
    msg.appendChild(bolha);
    msgs.appendChild(msg);
    rolarAoFim();
    return msg;
  }

  function mostrarDigitando() {
    var msg = el("div", "tutor-msg tutor-msg-ia tutor-digitando");
    var bolha = el("div", "tutor-bolha");
    var pontos = el("span", "tutor-pontos");
    pontos.setAttribute("aria-hidden", "true");
    pontos.appendChild(el("i"));
    pontos.appendChild(el("i"));
    pontos.appendChild(el("i"));
    bolha.appendChild(pontos);
    bolha.appendChild(el("span", "sr-only", "O tutor está digitando…"));
    msg.appendChild(bolha);
    msgs.appendChild(msg);
    rolarAoFim();
    return msg;
  }

  /* ── estado da interface ───────────────────────────────────────────── */
  function atualizarControles() {
    var travado = estado.ocupado || estado.carregando || estado.esgotado;
    chips.forEach(function (c) {
      c.disabled = travado;
      c.setAttribute("aria-pressed", String(parseInt(c.getAttribute("data-nivel"), 10) === estado.nivel));
    });
    enviar.disabled = travado;
    input.disabled = estado.esgotado;
    sel.disabled = estado.ocupado;
    input.placeholder = estado.esgotado
      ? "Limite de perguntas de hoje atingido"
      : "Descreva onde você travou… (ajuda: " + ROTULOS[estado.nivel] + ")";
  }

  function atualizarUso(uso) {
    var aviso = "A IA pode errar: confirme no terminal.";
    if (uso && !uso.ilimitado && typeof uso.restantes === "number") {
      rodape.textContent = "Restam " + uso.restantes + " de " + uso.limite + " perguntas hoje · " + aviso;
      if (uso.restantes <= 0) {
        estado.esgotado = true;
        atualizarControles();
        if (!msgs.querySelector(".tutor-msg-aviso")) {
          addAviso("Você usou as " + uso.limite + " perguntas de hoje. O contador zera à meia-noite; " +
            "até lá, use as dicas das missões e o comando `man` no terminal.", "tutor-msg-aviso");
        }
      }
    } else if (uso) {
      rodape.textContent = uso.hoje + " perguntas hoje · " + aviso;
    } else {
      rodape.textContent = aviso;
    }
  }

  function setOcupado(v) {
    estado.ocupado = v;
    atualizarControles();
  }

  /* ── histórico do chat da missão ───────────────────────────────────── */
  function carregarHistorico() {
    var token = ++estado.carga;
    msgs.textContent = "";
    addMsg("assistant", BOAS_VINDAS, { semRolar: true });
    estado.carregando = true;
    atualizarControles();
    var url = URL_HISTORICO + "?licao=" + encodeURIComponent(LICAO) +
      "&missao_id=" + encodeURIComponent(estado.ctx);
    return req(url).then(function (d) {
      if (token !== estado.carga) return;
      (d.mensagens || []).forEach(function (m) {
        addMsg(m.papel === "assistant" ? "assistant" : "user", m.conteudo, { semRolar: true });
      });
      atualizarUso(d.uso);
    }).catch(function () { /* sem histórico: o chat começa vazio */ })
      .then(function () {
        if (token !== estado.carga) return;
        estado.carregando = false;
        atualizarControles();
        msgs.scrollTop = msgs.scrollHeight;
      });
  }

  /* ── envio ─────────────────────────────────────────────────────────── */
  function perguntar(texto, nivel) {
    if (estado.ocupado || estado.carregando || estado.esgotado) return;
    texto = String(texto || "").trim();
    if (texto.length < 2) { input.focus(); return; }
    estado.nivel = nivel;
    addMsg("user", texto);
    input.value = "";
    autoAjustar();
    setOcupado(true);
    var digitando = mostrarDigitando();
    var ctx = estado.ctx;

    req(URL_PERGUNTAR, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        licao: LICAO,
        missao_id: ctx || null,
        nivel_dica: nivel,
        pergunta: texto.slice(0, 500),
        historico: (Array.isArray(window.labHistorico) ? window.labHistorico : []).slice(-15)
      })
    }).then(function (d) {
      digitando.remove();
      addMsg("assistant", d.resposta, { nivel: d.nivel_dica });
      atualizarUso(d.uso);
    }).catch(function (e) {
      digitando.remove();
      if (e.codigo === "limite_diario") {
        estado.esgotado = true;
        addAviso(e.message, "tutor-msg-aviso");
      } else {
        addAviso(e.message, "tutor-msg-erro");
      }
    }).then(function () {
      setOcupado(false);
      if (!estado.esgotado && estado.aberto && !telaPequena.matches) input.focus({ preventScroll: true });
    });
  }

  function autoAjustar() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight + 2, 120) + "px";
  }

  /* ── abrir / fechar ────────────────────────────────────────────────── */
  function missaoAtual() {
    var m = document.querySelector(".missao.missao-atual");
    return m ? (m.getAttribute("data-missao") || "") : "";
  }

  function definirContexto(id) {
    var existe = Array.prototype.some.call(sel.options, function (o) { return o.value === id; });
    sel.value = existe ? id : "";
    estado.ctx = sel.value;
  }

  /* Em tela larga a gaveta empurra a página (CSS: body.tutor-open { padding-right }). O texto da
     lição reflui e a página poderia "fugir" do laboratório: mede a posição do #lab antes e depois
     da mudança e compensa a rolagem, para o aluno continuar vendo o mesmo trecho. */
  function preservandoPosicao(mudanca) {
    var ancora = document.getElementById("lab");
    var antes = ancora ? ancora.getBoundingClientRect().top : 0;
    mudanca();
    if (!ancora) return;
    var delta = ancora.getBoundingClientRect().top - antes;
    if (Math.abs(delta) > 1) window.scrollBy({ top: delta, left: 0, behavior: "instant" });
  }

  function marcarGatilho(gatilho, aberto) {
    if (gatilho && gatilho.setAttribute) gatilho.setAttribute("aria-expanded", aberto ? "true" : "false");
  }

  function abrir(gatilho, missaoId) {
    var trocou = !estado.aberto || estado.ctx !== (missaoId || "");
    estado.gatilho = gatilho || estado.gatilho;
    definirContexto(missaoId || "");
    marcarGatilho(estado.gatilho, true);
    painel.setAttribute("aria-modal", telaPequena.matches ? "true" : "false");

    if (!estado.aberto) {
      estado.aberto = true;
      raiz.hidden = false;
      void raiz.offsetWidth; /* reflow: garante a transição de entrada */
      raiz.classList.add("is-on");
      preservandoPosicao(function () { document.body.classList.add("tutor-open"); });
      atualizarFab();
    }
    if (trocou) carregarHistorico();

    window.setTimeout(function () {
      if (telaPequena.matches) painel.focus({ preventScroll: true });
      else if (!input.disabled) input.focus({ preventScroll: true });
    }, reduzMovimento ? 0 : 120);
  }

  function fechar() {
    if (!estado.aberto) return;
    estado.aberto = false;
    raiz.classList.remove("is-on");
    preservandoPosicao(function () { document.body.classList.remove("tutor-open"); });
    marcarGatilho(estado.gatilho, false);
    marcarGatilho(fab, false);
    var terminar = function () { if (!estado.aberto) raiz.hidden = true; };
    if (reduzMovimento) terminar(); else window.setTimeout(terminar, 360);
    atualizarFab();
    var volta = estado.gatilho && document.body.contains(estado.gatilho) && !estado.gatilho.hidden
      ? estado.gatilho : null;
    if (volta) volta.focus({ preventScroll: true });
  }

  /* botão flutuante: só enquanto o laboratório está na tela */
  var labVisivel = true;
  function atualizarFab() {
    if (fab) fab.hidden = estado.aberto || !labVisivel;
  }
  var lab = document.getElementById("lab");
  if (fab && lab && "IntersectionObserver" in window) {
    labVisivel = false;
    new IntersectionObserver(function (entradas) {
      labVisivel = entradas[0].isIntersecting;
      atualizarFab();
    }, { threshold: 0.04 }).observe(lab);
  }
  atualizarFab();

  /* ── eventos ───────────────────────────────────────────────────────── */
  document.addEventListener("click", function (ev) {
    var alvo = ev.target.closest ? ev.target.closest("[data-tutor-missao], [data-tutor-abrir], [data-tutor-fechar]") : null;
    if (!alvo) return;
    if (alvo.hasAttribute("data-tutor-fechar")) { fechar(); return; }
    if (alvo.hasAttribute("data-tutor-missao")) abrir(alvo, alvo.getAttribute("data-tutor-missao"));
    else abrir(alvo, missaoAtual());
  });

  sel.addEventListener("change", function () {
    estado.ctx = sel.value;
    carregarHistorico();
  });

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var nivel = parseInt(chip.getAttribute("data-nivel"), 10);
      var digitado = input.value.trim();
      perguntar(digitado.length >= 2 ? digitado : PADRAO[nivel], nivel);
    });
  });

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    perguntar(input.value, estado.nivel);
  });

  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
      ev.preventDefault();
      perguntar(input.value, estado.nivel);
    }
  });
  input.addEventListener("input", autoAjustar);

  document.addEventListener("keydown", function (ev) {
    if (!estado.aberto) return;
    if (ev.key === "Escape") { ev.preventDefault(); fechar(); return; }
    if (ev.key !== "Tab" || !telaPequena.matches) return;
    /* bottom-sheet é modal: o foco circula dentro dele */
    var focaveis = Array.prototype.filter.call(
      painel.querySelectorAll("button, select, textarea, [tabindex]:not([tabindex='-1'])"),
      function (n) { return !n.disabled && n.offsetParent !== null; });
    if (!focaveis.length) return;
    var primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
    if (ev.shiftKey && (document.activeElement === primeiro || document.activeElement === painel)) {
      ev.preventDefault(); ultimo.focus();
    } else if (!ev.shiftKey && document.activeElement === ultimo) {
      ev.preventDefault(); primeiro.focus();
    }
  });

  atualizarControles();
  atualizarUso(null);
})();

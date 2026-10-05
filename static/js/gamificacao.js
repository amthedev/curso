/* ===================================================================
   Gamificação — toasts de conquista, "+N XP" flutuante e helpers.
   Sem dependências. Seguro de carregar mais de uma vez.

   API global:
     mostrarConquista({ nome, icone, desc, tier, rotulo })
     mostrarXP(qtd [, elementoAncora])
     gamificacaoProcessar(resposta)   // resposta de POST .../progresso
   =================================================================== */
(function () {
  "use strict";
  if (window.__gamiLoaded) return;
  window.__gamiLoaded = true;

  var DURACAO = 5000;   // ms que o toast fica na tela
  var MAX_TOASTS = 4;   // empilhados ao mesmo tempo

  /* ── estilos (injetados: o script funciona em qualquer página) ── */
  var CSS = [
    ".gami-toasts{position:fixed;right:20px;bottom:20px;z-index:9999;display:flex;flex-direction:column-reverse;gap:10px;width:min(360px,calc(100vw - 32px));pointer-events:none}",
    ".gami-toast{--t:#d08a5a;--t-rgb:208,138,90;position:relative;overflow:hidden;pointer-events:auto;display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 12px 14px 12px;border-radius:14px;color:var(--text,#e6edf3);font-family:var(--font,system-ui,sans-serif);background:linear-gradient(140deg,rgba(var(--t-rgb),.2),rgba(13,17,23,.96) 55%),var(--bg-1,#0d1117);border:1px solid rgba(var(--t-rgb),.55);box-shadow:0 14px 40px -10px rgba(0,0,0,.7),0 0 28px -6px rgba(var(--t-rgb),.55);opacity:0;transform:translateX(28px) scale(.97);transition:opacity .28s ease,transform .32s cubic-bezier(.2,.9,.3,1.2)}",
    ".gami-toast.tier-prata{--t:#c3cfdc;--t-rgb:195,207,220}",
    ".gami-toast.tier-ouro{--t:#f5c542;--t-rgb:245,197,66}",
    ".gami-toast.tier-nivel{--t:#39d98a;--t-rgb:57,217,138}",
    ".gami-toast.is-in{opacity:1;transform:none}",
    ".gami-toast.is-out{opacity:0;transform:translateX(28px) scale(.97);transition-duration:.22s}",
    ".gami-toast-icone{width:48px;height:48px;border-radius:13px;display:grid;place-items:center;font-size:1.5rem;color:#0b0f14;background:linear-gradient(145deg,var(--t),rgba(var(--t-rgb),.6));box-shadow:inset 0 2px 5px rgba(255,255,255,.3),0 6px 18px -6px rgba(var(--t-rgb),.8)}",
    ".gami-toast-icone svg{width:26px;height:26px}",
    ".gami-toast-corpo{min-width:0;display:flex;flex-direction:column;gap:1px}",
    ".gami-toast-rotulo{font-family:var(--mono,ui-monospace,monospace);font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--t)}",
    ".gami-toast-nome{font-size:.98rem;font-weight:700;line-height:1.25}",
    ".gami-toast-desc{font-size:.78rem;color:var(--text-2,#8b98a5);line-height:1.35}",
    ".gami-toast-fechar{align-self:start;width:26px;height:26px;border:0;border-radius:8px;background:transparent;color:var(--text-2,#8b98a5);font-size:1.2rem;line-height:1;cursor:pointer}",
    ".gami-toast-fechar:hover{background:rgba(255,255,255,.08);color:var(--text,#e6edf3)}",
    ".gami-toast-fechar:focus-visible{outline:2px solid var(--t);outline-offset:1px}",
    ".gami-toast-barra{position:absolute;left:0;bottom:0;height:3px;width:100%;background:var(--t);transform-origin:left;animation:gami-barra " + DURACAO + "ms linear forwards;box-shadow:0 0 10px var(--t)}",
    ".gami-toast:hover .gami-toast-barra,.gami-toast:focus-within .gami-toast-barra{animation-play-state:paused}",
    "@keyframes gami-barra{to{transform:scaleX(0)}}",
    ".gami-xp{position:fixed;z-index:9998;pointer-events:none;font-family:var(--mono,ui-monospace,monospace);font-weight:800;font-size:1.5rem;letter-spacing:.02em;color:var(--accent,#39d98a);text-shadow:0 0 18px rgba(57,217,138,.8),0 2px 0 rgba(0,0,0,.5);opacity:0;transform:translate(-50%,0) scale(.7);animation:gami-xp 1.7s cubic-bezier(.2,.8,.3,1) forwards}",
    "@keyframes gami-xp{0%{opacity:0;transform:translate(-50%,10px) scale(.6)}18%{opacity:1;transform:translate(-50%,-6px) scale(1.18)}35%{transform:translate(-50%,-16px) scale(1)}100%{opacity:0;transform:translate(-50%,-84px) scale(1)}}",
    "@media (max-width:520px){.gami-toasts{right:12px;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));width:auto}}",
    "@media (prefers-reduced-motion:reduce){.gami-toast,.gami-toast.is-out{transition:opacity .15s linear;transform:none}.gami-toast-barra{animation:none;transform:none}.gami-xp{animation:gami-xp-rm 1.6s linear forwards}@keyframes gami-xp-rm{0%{opacity:0}10%,80%{opacity:1}100%{opacity:0}}}"
  ].join("\n");

  function injetarEstilos() {
    if (document.getElementById("gami-estilos")) return;
    var st = document.createElement("style");
    st.id = "gami-estilos";
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ── ícone: SVG do servidor (sanitizado) ou emoji/texto ── */
  var TAGS_OK = { svg: 1, g: 1, path: 1, circle: 1, rect: 1, line: 1, polyline: 1, polygon: 1, ellipse: 1 };
  var ATTRS_OK = {
    viewbox: 1, fill: 1, stroke: 1, "stroke-width": 1, "stroke-linecap": 1, "stroke-linejoin": 1,
    d: 1, cx: 1, cy: 1, r: 1, rx: 1, ry: 1, x: 1, y: 1, width: 1, height: 1, points: 1,
    x1: 1, y1: 1, x2: 1, y2: 1, transform: 1, "aria-hidden": 1, focusable: 1, xmlns: 1
  };

  function limparSvg(el) {
    var filhos = Array.prototype.slice.call(el.children);
    filhos.forEach(function (f) {
      if (!TAGS_OK[f.nodeName.toLowerCase()]) { f.remove(); } else { limparSvg(f); }
    });
    Array.prototype.slice.call(el.attributes).forEach(function (a) {
      if (!ATTRS_OK[a.name.toLowerCase()]) el.removeAttribute(a.name);
    });
  }

  function montarIcone(alvo, icone) {
    icone = String(icone == null ? "" : icone).trim();
    if (/^<svg[\s>]/i.test(icone)) {
      try {
        // parser HTML: dispensa xmlns e já coloca o <svg> no namespace certo
        var doc = new DOMParser().parseFromString(icone, "text/html");
        var svg = doc.body && doc.body.firstElementChild;
        if (svg && svg.nodeName.toLowerCase() === "svg") {
          limparSvg(svg);
          alvo.appendChild(document.importNode(svg, true));
          return;
        }
      } catch (e) { /* cai no texto abaixo */ }
      alvo.textContent = "★";
      return;
    }
    alvo.textContent = icone || "★"; // emoji ou texto curto
  }

  /* ── toasts ── */
  var pilha = null;

  function obterPilha() {
    injetarEstilos();
    if (pilha && document.body.contains(pilha)) return pilha;
    pilha = document.createElement("div");
    pilha.className = "gami-toasts";
    pilha.setAttribute("role", "status");
    pilha.setAttribute("aria-live", "polite");
    pilha.setAttribute("aria-relevant", "additions");
    document.body.appendChild(pilha);
    return pilha;
  }

  function mostrarConquista(c) {
    c = c || {};
    var host = obterPilha();
    // limita a pilha: remove o mais antigo
    while (host.children.length >= MAX_TOASTS) host.removeChild(host.lastElementChild);

    var el = document.createElement("div");
    el.className = "gami-toast tier-" + (/^(bronze|prata|ouro|nivel)$/.test(c.tier) ? c.tier : "bronze");

    var ic = document.createElement("span");
    ic.className = "gami-toast-icone";
    ic.setAttribute("aria-hidden", "true");
    montarIcone(ic, c.icone);

    var corpo = document.createElement("div");
    corpo.className = "gami-toast-corpo";
    var rotulo = document.createElement("span");
    rotulo.className = "gami-toast-rotulo";
    rotulo.textContent = c.rotulo || "Conquista desbloqueada";
    var nome = document.createElement("strong");
    nome.className = "gami-toast-nome";
    nome.textContent = c.nome || "";
    corpo.appendChild(rotulo);
    corpo.appendChild(nome);
    if (c.desc) {
      var desc = document.createElement("span");
      desc.className = "gami-toast-desc";
      desc.textContent = c.desc;
      corpo.appendChild(desc);
    }

    var fechar = document.createElement("button");
    fechar.type = "button";
    fechar.className = "gami-toast-fechar";
    fechar.setAttribute("aria-label", "Fechar notificação");
    fechar.textContent = "×";

    var barra = document.createElement("i");
    barra.className = "gami-toast-barra";
    barra.setAttribute("aria-hidden", "true");

    el.appendChild(ic); el.appendChild(corpo); el.appendChild(fechar); el.appendChild(barra);
    host.insertBefore(el, host.firstChild); // column-reverse: o mais novo fica embaixo, os antigos sobem

    var restante = DURACAO, inicio = Date.now(), timer = null, fechado = false;
    function sair() {
      if (fechado) return;
      fechado = true;
      clearTimeout(timer);
      el.classList.remove("is-in");
      el.classList.add("is-out");
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }
    function armar() { inicio = Date.now(); timer = setTimeout(sair, restante); }
    function pausar() { clearTimeout(timer); restante -= Date.now() - inicio; }
    el.addEventListener("mouseenter", pausar);
    el.addEventListener("mouseleave", armar);
    el.addEventListener("focusin", pausar);
    el.addEventListener("focusout", armar);
    fechar.addEventListener("click", sair);

    // dois frames para a transição de entrada pegar
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add("is-in"); }); });
    armar();
    return el;
  }

  /* ── "+N XP" flutuante ── */
  function mostrarXP(qtd, ancora) {
    qtd = parseInt(qtd, 10);
    if (!qtd || qtd < 0) return null;
    injetarEstilos();
    var el = document.createElement("div");
    el.className = "gami-xp";
    el.setAttribute("aria-hidden", "true"); // o terminal/painel já anunciam o ganho
    el.textContent = "+" + qtd + " XP";

    var x, y;
    var r = ancora && ancora.getBoundingClientRect ? ancora.getBoundingClientRect() : null;
    if (r && (r.width || r.height)) {
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    } else {
      x = window.innerWidth / 2;
      y = window.innerHeight - 150;
    }
    x += (Math.random() - 0.5) * 36; // vários seguidos não se sobrepõem
    el.style.left = Math.max(60, Math.min(window.innerWidth - 60, x)) + "px";
    el.style.top = Math.max(40, y) + "px";
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1800);
    return el;
  }

  /* ── ponto único: processa a resposta do servidor ── */
  var ICONE_NIVEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';

  function processar(data) {
    if (!data || typeof data !== "object") return;
    var atraso = 0;
    if (data.xp_ganho_agora > 0) mostrarXP(data.xp_ganho_agora);
    if (data.subiu_nivel && data.nivel) {
      setTimeout(function () {
        mostrarConquista({ rotulo: "Novo nível", nome: data.nivel, desc: "Você subiu de nível. Continue assim!", icone: ICONE_NIVEL, tier: "nivel" });
      }, atraso += 700);
    }
    (data.novas_conquistas || []).slice(0, MAX_TOASTS).forEach(function (c) {
      setTimeout(function () { mostrarConquista(c); }, atraso += 700);
    });
  }

  /* ── auto-init: conquistas novas embutidas na página + toque no heatmap ── */
  function init() {
    obterPilha(); // cria a região aria-live antes do primeiro anúncio
    var blocos = document.querySelectorAll('script[type="application/json"][data-gami-conquistas]');
    Array.prototype.forEach.call(blocos, function (bloco) {
      var lista = [];
      try { lista = JSON.parse(bloco.textContent) || []; } catch (e) { lista = []; }
      lista.slice(0, MAX_TOASTS).forEach(function (c, i) {
        setTimeout(function () { mostrarConquista(c); }, 900 + i * 700);
      });
    });
  }

  document.addEventListener("click", function (ev) {
    var cel = ev.target.closest && ev.target.closest(".al-hm-cell[title]");
    if (!cel) return;
    var wrap = cel.closest("[data-hm-info]");
    var saida = wrap && document.getElementById(wrap.getAttribute("data-hm-info"));
    if (saida) saida.textContent = cel.getAttribute("title");
  });

  window.mostrarConquista = mostrarConquista;
  window.mostrarXP = mostrarXP;
  window.gamificacaoProcessar = processar;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

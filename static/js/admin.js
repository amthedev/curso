/* ===================================================================
   Painel admin — comportamento
   confirmações · drawer mobile · avisos · filtros de tabela/lista ·
   editor de post (contadores, atalhos markdown, prévia ao vivo) ·
   prévia do perfil
   =================================================================== */
(function () {
  "use strict";

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function store(key, val) {
    try {
      if (val === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, val);
    } catch (e) { /* armazenamento indisponível: segue sem lembrar */ }
    return null;
  }

  /* ── Confirmação de ações destrutivas ── */
  function initConfirm() {
    $$("form[data-confirm]").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        var msg = form.getAttribute("data-confirm");
        if (msg && !window.confirm(msg)) e.preventDefault();
      });
    });
  }

  /* ── Drawer (sidebar no mobile) ── */
  function initDrawer() {
    var burger = $("#adminBurger");
    var sidebar = $("#adminSidebar");
    if (!burger || !sidebar) return;
    var body = document.body;

    function setOpen(open) {
      body.classList.toggle("admin-nav-open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        var first = $(".admin-nav a", sidebar);
        if (first) setTimeout(function () { first.focus(); }, 60);
      }
    }

    burger.addEventListener("click", function () { setOpen(!body.classList.contains("admin-nav-open")); });
    $$("[data-nav-close]").forEach(function (el) {
      el.addEventListener("click", function () { setOpen(false); burger.focus(); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && body.classList.contains("admin-nav-open")) { setOpen(false); burger.focus(); }
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 960 && body.classList.contains("admin-nav-open")) setOpen(false);
    });
  }

  /* ── Avisos (flash) ── */
  function initFlash() {
    $$(".admin-flash-wrap .flash").forEach(function (box) {
      var close = function () {
        box.style.transition = "opacity .25s, transform .25s";
        box.style.opacity = "0";
        box.style.transform = "translateY(-4px)";
        setTimeout(function () { box.remove(); }, 260);
      };
      var x = $(".flash-x", box);
      if (x) x.addEventListener("click", close);
      if (box.classList.contains("flash-sucesso")) setTimeout(close, 6000);
    });
  }

  /* ── Data de hoje no dashboard ── */
  function initHoje() {
    var el = $("[data-hoje]");
    if (!el) return;
    try {
      el.textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    } catch (e) { /* ignora */ }
  }

  /* ── Filtros de tabela / timeline ── */
  function norm(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  function initFilter() {
    var rows = $$("[data-row]");
    if (!rows.length) return;
    var input = $("[data-filter-input]");
    var chips = $$("[data-filter-chip]");
    var countEl = $("[data-count]");
    var empty = $("[data-empty]");
    var scope = $(".admin-table-wrap") || $(".timeline");
    var cat = "";

    function apply() {
      var q = input ? norm(input.value.trim()) : "";
      var shown = 0;
      rows.forEach(function (r) {
        var okCat = !cat || r.getAttribute("data-cat") === cat;
        var okQ = !q || norm(r.getAttribute("data-q")).indexOf(q) !== -1;
        var ok = okCat && okQ;
        r.hidden = !ok;
        if (ok) shown++;
      });
      $$("[data-dia]").forEach(function (h) {
        var el = h.nextElementSibling, any = false;
        while (el && !el.hasAttribute("data-dia")) {
          if (el.hasAttribute("data-row") && !el.hidden) { any = true; break; }
          el = el.nextElementSibling;
        }
        h.hidden = !any;
      });
      if (countEl) countEl.textContent = shown;
      if (empty) empty.hidden = shown !== 0;
      if (scope) scope.hidden = shown === 0;
    }

    if (input) input.addEventListener("input", apply);
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        cat = chip.getAttribute("data-filter-chip") || "";
        chips.forEach(function (c) { c.classList.toggle("is-on", c === chip); });
        apply();
      });
    });
    $$("[data-filter-reset]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        cat = "";
        if (input) input.value = "";
        chips.forEach(function (c, i) { c.classList.toggle("is-on", i === 0); });
        apply();
        if (input) input.focus();
      });
    });
  }

  /* ── Contadores de caracteres ([data-for="id"] [data-max="n"]) ── */
  function initCounters() {
    $$(".pf-count[data-for]").forEach(function (out) {
      var field = document.getElementById(out.getAttribute("data-for"));
      if (!field) return;
      var max = parseInt(out.getAttribute("data-max"), 10) || 0;
      var update = function () {
        var n = field.value.length;
        out.textContent = n + (max ? " / " + max : "") + " caracteres";
        out.classList.toggle("over", !!max && n > max);
      };
      field.addEventListener("input", update);
      update();
    });
  }

  /* ── Markdown → HTML (usa o render de main.js; fallback mínimo) ── */
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function mdFallback(md) {
    var out = [], code = false, buf = [];
    String(md).replace(/\r\n/g, "\n").split("\n").forEach(function (line) {
      if (line.trim().indexOf("```") === 0) {
        if (code) { out.push("<pre><code>" + esc(buf.join("\n")) + "</code></pre>"); buf = []; }
        code = !code;
        return;
      }
      if (code) { buf.push(line); return; }
      var t = line.trim();
      if (!t) return;
      var h = t.match(/^(#{1,4})\s+(.*)/);
      if (h) { var n = Math.max(2, h[1].length); out.push("<h" + n + ">" + esc(h[2]) + "</h" + n + ">"); return; }
      if (/^[-*]\s+/.test(t)) { out.push("<ul><li>" + esc(t.replace(/^[-*]\s+/, "")) + "</li></ul>"); return; }
      out.push("<p>" + esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>") + "</p>");
    });
    return out.join("");
  }

  function renderMd(md) {
    if (typeof window.markdownParaHtml === "function") {
      try { return window.markdownParaHtml(md); } catch (e) { /* cai no fallback */ }
    }
    return mdFallback(md);
  }

  /* ── Editor de postagem ── */
  function initPostForm() {
    var form = $("#postForm");
    if (!form) return;
    var corpo = $("#corpo");
    var preview = $("#preview");
    var split = $("#pfSplit");
    var tags = $("#tags");
    var tagsOut = $("#tagsPreview");
    var dirty = $("#pfDirty");

    /* estatísticas + prévia */
    var timer = null;
    function stats() {
      var txt = corpo.value;
      var words = (txt.trim().match(/\S+/g) || []).length;
      var w = $("#stWords"), c = $("#stChars"), m = $("#stMin");
      if (w) w.textContent = words;
      if (c) c.textContent = txt.length;
      if (m) m.textContent = Math.max(1, Math.round(words / 200));
    }
    function paint() {
      stats();
      if (!preview) return;
      var txt = corpo.value;
      preview.innerHTML = txt.trim()
        ? renderMd(txt)
        : '<p class="pf-preview-empty">A prévia aparece aqui enquanto você escreve.</p>';
    }
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(paint, 120);
    }
    corpo.addEventListener("input", schedule);
    paint();

    /* sincroniza a rolagem no modo dividido */
    var pane = $(".pf-preview");
    corpo.addEventListener("scroll", function () {
      if (!pane || split.getAttribute("data-mode") !== "split") return;
      var max = corpo.scrollHeight - corpo.clientHeight;
      if (max > 0) pane.scrollTop = (corpo.scrollTop / max) * (pane.scrollHeight - pane.clientHeight);
    }, { passive: true });

    /* modo: escrever / dividido / prévia */
    var segBtns = $$(".pf-seg button");
    function setMode(mode, persist) {
      if (mode === "split" && window.innerWidth <= 960) mode = "write";
      split.setAttribute("data-mode", mode);
      segBtns.forEach(function (b) {
        var on = b.getAttribute("data-mode") === mode;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      if (persist) store("admin-editor-mode", mode);
      if (mode !== "write") paint();
    }
    segBtns.forEach(function (b) {
      b.addEventListener("click", function () { setMode(b.getAttribute("data-mode"), true); });
    });
    var saved = store("admin-editor-mode");
    setMode(saved === "write" || saved === "preview" || saved === "split" ? saved : (window.innerWidth > 960 ? "split" : "write"), false);
    window.addEventListener("resize", function () {
      if (window.innerWidth <= 960 && split.getAttribute("data-mode") === "split") setMode("write", false);
    });

    /* barra de formatação */
    function insert(text, from, to) {
      corpo.focus();
      corpo.setSelectionRange(from, to);
      var ok = false;
      try { ok = document.execCommand("insertText", false, text); } catch (e) { ok = false; }
      if (!ok) { corpo.setRangeText(text, from, to, "end"); corpo.dispatchEvent(new Event("input", { bubbles: true })); }
    }

    function wrapSel(a, b, placeholder) {
      var s = corpo.selectionStart, e = corpo.selectionEnd;
      var sel = corpo.value.slice(s, e) || placeholder;
      insert(a + sel + b, s, e);
      corpo.setSelectionRange(s + a.length, s + a.length + sel.length);
    }

    function prefixLines(prefix, placeholder) {
      var v = corpo.value, s = corpo.selectionStart, e = corpo.selectionEnd;
      var ls = v.lastIndexOf("\n", s - 1) + 1;
      var le = v.indexOf("\n", e);
      if (le === -1) le = v.length;
      var block = v.slice(ls, le) || placeholder;
      var out = block.split("\n").map(function (l) { return prefix + l; }).join("\n");
      insert(out, ls, le);
      corpo.setSelectionRange(ls, ls + out.length);
    }

    function codeBlock() {
      var v = corpo.value, s = corpo.selectionStart, e = corpo.selectionEnd;
      var sel = v.slice(s, e) || "comando";
      var lead = s > 0 && v.charAt(s - 1) !== "\n" ? "\n" : "";
      var txt = lead + "```bash\n" + sel + "\n```\n";
      insert(txt, s, e);
      var from = s + lead.length + 8;
      corpo.setSelectionRange(from, from + sel.length);
    }

    var actions = {
      bold: function () { wrapSel("**", "**", "texto em negrito"); },
      italic: function () { wrapSel("*", "*", "texto em itálico"); },
      code: function () { wrapSel("`", "`", "código"); },
      link: function () { wrapSel("[", "](https://)", "texto do link"); },
      h2: function () { prefixLines("## ", "Título da seção"); },
      ul: function () { prefixLines("- ", "item da lista"); },
      quote: function () { prefixLines("> ", "citação"); },
      block: codeBlock
    };
    $$(".pf-toolbar [data-md]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var fn = actions[btn.getAttribute("data-md")];
        if (fn) fn();
      });
    });
    corpo.addEventListener("keydown", function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") { e.preventDefault(); actions.bold(); }
      else if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "i") { e.preventDefault(); actions.italic(); }
      else if (mod && e.key === "Enter") { e.preventDefault(); if (form.requestSubmit) form.requestSubmit(); else form.submit(); }
    });

    /* tags como chips */
    function paintTags() {
      if (!tags || !tagsOut) return;
      tagsOut.innerHTML = "";
      tags.value.split(",").map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 12).forEach(function (t) {
        var s = document.createElement("span");
        s.textContent = t;
        tagsOut.appendChild(s);
      });
    }
    if (tags) { tags.addEventListener("input", paintTags); paintTags(); }

    /* botão "Hoje" */
    var hoje = $("#btnHoje"), data = $("#data_publicacao");
    if (hoje && data) {
      hoje.addEventListener("click", function () {
        var d = new Date();
        var p = function (n) { return String(n).padStart(2, "0"); };
        data.value = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
        data.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }

    /* indicador de alterações não salvas */
    function snapshot() {
      return $$("input, select, textarea", form).map(function (el) { return el.name + "=" + el.value; }).join("&");
    }
    var inicial = snapshot();
    var enviando = false;
    function checkDirty() {
      if (dirty) dirty.hidden = enviando || snapshot() === inicial;
    }
    form.addEventListener("input", checkDirty);
    form.addEventListener("change", checkDirty);
    form.addEventListener("submit", function () { enviando = true; checkDirty(); });
  }

  /* ── Prévia ao vivo do perfil ── */
  function initPerfil() {
    var form = $("#perfilForm");
    if (!form) return;
    var map = [
      ["nome", "pvNome", "", false],
      ["avatar", "pvAvatar", "AD", true],
      ["titulo", "pvTitulo", "", false],
      ["bio", "pvBio", "", false],
      ["email", "pvEmail", "—", false],
      ["local", "pvLocal", "—", false]
    ];
    map.forEach(function (m) {
      var input = document.getElementById(m[0]);
      var out = document.getElementById(m[1]);
      if (!input || !out) return;
      var update = function () {
        var v = input.value.trim();
        out.textContent = (v || m[2]);
        if (m[3]) out.textContent = (v || m[2]).toUpperCase();
      };
      input.addEventListener("input", update);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initConfirm();
    initDrawer();
    initFlash();
    initHoje();
    initFilter();
    initCounters();
    initPostForm();
    initPerfil();
  });
})();

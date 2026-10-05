document.addEventListener("DOMContentLoaded", function () {
  initNav();
  initReadingBar();
  renderPostBody();
});

/* ── Mobile nav ── */
function initNav() {
  var toggle = document.getElementById("navToggle");
  var nav    = document.getElementById("siteNav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", function () {
    nav.classList.toggle("open");
  });
  document.addEventListener("click", function (e) {
    if (!toggle.contains(e.target) && !nav.contains(e.target)) {
      nav.classList.remove("open");
    }
  });
}

/* ── Reading progress bar ── */
function initReadingBar() {
  var bar = document.getElementById("readingBar");
  if (!bar) return;
  window.addEventListener("scroll", function () {
    var doc    = document.documentElement;
    var scroll = doc.scrollTop || document.body.scrollTop;
    var height = doc.scrollHeight - doc.clientHeight;
    bar.style.width = (height > 0 ? (scroll / height) * 100 : 0) + "%";
  }, { passive: true });
}

/* ── Markdown → HTML ── */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(text) {
  var out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_m, label, url) {
    return linkSeguro(label, url);
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

/* Syntax highlight for code blocks */
function highlightCode(code, lang) {
  var escaped = escapeHtml(code);

  /* Python */
  if (lang === "python" || lang === "py") {
    escaped = escaped
      .replace(/(#[^\n]*)/g, '<span class="tok-comment">$1</span>')
      .replace(/\b(def|class|import|from|return|if|elif|else|for|while|in|not|and|or|with|as|pass|raise|try|except|finally|yield|lambda|True|False|None|self|print)\b/g, '<span class="tok-keyword">$1</span>')
      .replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"]*"|'[^']*')/g, '<span class="tok-string">$1</span>')
      .replace(/\b(\d+)\b/g, '<span class="tok-number">$1</span>');
  }
  /* Bash / Shell */
  else if (lang === "bash" || lang === "sh" || lang === "shell" || lang === "zsh") {
    escaped = escaped
      .replace(/(#[^\n]*)/g, '<span class="tok-comment">$1</span>')
      .replace(/\b(sudo|apt|apt-get|pip|pip3|python|python3|nmap|curl|wget|ssh|nc|netcat|chmod|chown|ls|cd|cat|grep|awk|sed|find|echo|export|source)\b/g, '<span class="tok-bash">$1</span>')
      .replace(/(--?[a-zA-Z][\w-]*)/g, '<span class="tok-flag">$1</span>')
      .replace(/("([^"]*)")/g, '<span class="tok-string">$1</span>');
  }
  /* SQL */
  else if (lang === "sql") {
    escaped = escaped
      .replace(/(--.*)$/gm, '<span class="tok-comment">$1</span>')
      .replace(/\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|DROP|CREATE|TABLE|INTO|VALUES|AND|OR|UNION|ALL|NULL|JOIN|ON|SET|LIMIT|ORDER BY|GROUP BY)\b/gi, '<span class="tok-keyword">$1</span>')
      .replace(/('[^']*')/g, '<span class="tok-string">$1</span>');
  }
  /* Generic / C / other — no highlight to avoid regex conflicts */

  return escaped;
}

function markdownParaHtml(md) {
  var linhas      = md.replace(/\r\n/g, "\n").split("\n");
  var html        = "";
  var dentroLista = null;
  var dentroCodigo = false;
  var bufferCodigo = [];
  var langAtual    = "";

  function fecharLista() {
    if (dentroLista) {
      html += "</" + dentroLista + ">";
      dentroLista = null;
    }
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
        var highlighted = highlightCode(bufferCodigo.join("\n"), langAtual);
        var langLabel   = langAtual || "code";
        html += '<pre>' +
          '<div class="code-header">' +
            '<span class="code-lang">' + escapeHtml(langLabel) + '</span>' +
            '<button class="code-copy" onclick="copyCode(this)">Copiar</button>' +
          '</div>' +
          '<code>' + highlighted + '</code>' +
        '</pre>';
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

    /* headings */
    if (trimmed.startsWith("#### ")) {
      fecharLista();
      html += '<h4 id="sec-' + i + '">' + inlineMarkdown(trimmed.slice(5)) + "</h4>";
    } else if (trimmed.startsWith("### ")) {
      fecharLista();
      html += '<h3 id="sec-' + i + '">' + inlineMarkdown(trimmed.slice(4)) + "</h3>";
    } else if (trimmed.startsWith("## ")) {
      fecharLista();
      html += '<h2 id="sec-' + i + '">' + inlineMarkdown(trimmed.slice(3)) + "</h2>";
    } else if (trimmed.startsWith("# ")) {
      fecharLista();
      html += "<h2>" + inlineMarkdown(trimmed.slice(2)) + "</h2>";

    /* ordered list */
    } else if (/^(\d+)\.\s/.test(trimmed)) {
      var match = trimmed.match(/^(\d+)\.\s+(.*)/);
      if (dentroLista !== "ol") { fecharLista(); html += "<ol>"; dentroLista = "ol"; }
      html += "<li>" + inlineMarkdown(match[2]) + "</li>";

    /* unordered list */
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (dentroLista !== "ul") { fecharLista(); html += "<ul>"; dentroLista = "ul"; }
      html += "<li>" + inlineMarkdown(trimmed.slice(2)) + "</li>";

    /* blockquote */
    } else if (trimmed.startsWith("> ")) {
      fecharLista();
      html += "<blockquote>" + inlineMarkdown(trimmed.slice(2)) + "</blockquote>";

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
    html += "<pre><code>" + escapeHtml(bufferCodigo.join("\n")) + "</code></pre>";
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
  navigator.clipboard.writeText(text).then(function () {
    btn.textContent = "Copiado!";
    btn.classList.add("copied");
    setTimeout(function () {
      btn.textContent = "Copiar";
      btn.classList.remove("copied");
    }, 2000);
  });
}

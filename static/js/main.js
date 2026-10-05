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

/* Syntax highlight for code blocks.
   Passada única: uma regex com uma alternativa por tipo de token. Antes eram
   vários .replace() em cadeia e o seguinte reprocessava o HTML já inserido
   (ex: aparecia  "tok-flag">  no meio do código). O texto chega já escapado,
   então aspas duplas aparecem como &quot;. */
var HL_REGRAS = {
  python: [
    ["tok-string", '&quot;&quot;&quot;[\\s\\S]*?&quot;&quot;&quot;|\'\'\'[\\s\\S]*?\'\'\'|&quot;(?:(?!&quot;)[^\\n])*&quot;|\'[^\'\\n]*\''],
    ["tok-comment", "#[^\\n]*"],
    ["tok-keyword", "\\b(?:def|class|import|from|return|if|elif|else|for|while|in|not|and|or|with|as|pass|raise|try|except|finally|yield|lambda|True|False|None|self|print)\\b"],
    ["tok-number", "\\b\\d+(?:\\.\\d+)?\\b"]
  ],
  bash: [
    ["tok-string", '&quot;(?:(?!&quot;)[^\\n])*&quot;|\'[^\'\\n]*\''],
    ["tok-comment", "(?:^|[ \\t])#[^\\n]*"],
    ["tok-bash", "\\b(?:apt-get|sudo|apt|pip3|pip|python3|python|nmap|curl|wget|ssh|netcat|nc|chmod|chown|ls|cd|cat|grep|awk|sed|find|echo|export|source)\\b"],
    ["tok-flag", "(?:^|[ \\t])--?[a-zA-Z][\\w-]*"]
  ],
  sql: [
    ["tok-comment", "--[^\\n]*"],
    ["tok-string", "'[^'\\n]*'"],
    ["tok-keyword", "\\b(?:SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|DROP|CREATE|TABLE|INTO|VALUES|AND|OR|UNION|ALL|NULL|JOIN|ON|SET|LIMIT|ORDER BY|GROUP BY)\\b"]
  ]
};
HL_REGRAS.py = HL_REGRAS.python;
HL_REGRAS.sh = HL_REGRAS.shell = HL_REGRAS.zsh = HL_REGRAS.bash;

function highlightCode(code, lang) {
  var escaped = escapeHtml(code);
  var regras = HL_REGRAS[lang];
  /* Generic / C / other — sem realce para evitar conflitos */
  if (!regras) return escaped;

  var re = new RegExp(regras.map(function (r) { return "(" + r[1] + ")"; }).join("|"), lang === "sql" ? "gim" : "gm");
  return escaped.replace(re, function (m) {
    for (var i = 0; i < regras.length; i++) {
      if (arguments[i + 1] === undefined) continue;
      /* regras que consomem o espaço anterior: devolve-o fora do <span> */
      var lead = regras[i][1].indexOf("(?:^|[ \\t])") === 0 ? m.match(/^[ \t]*/)[0] : "";
      return lead + '<span class="' + regras[i][0] + '">' + m.slice(lead.length) + "</span>";
    }
    return m;
  });
}

/* Tabela markdown (| a | b |  +  |---|---|). Sem linha separadora, vira só corpo. */
function tabelaHtml(linhas) {
  function celulas(l) {
    return l.replace(/^\|/, "").replace(/\|$/, "").replace(/\\\|/g, "\u0001").split("|")
      .map(function (c) { return c.replace(/\u0001/g, "|").trim(); });
  }
  var rows = linhas.map(celulas);
  var temSep = rows.length > 1 && rows[1].every(function (c) { return /^:?-+:?$/.test(c); });
  var alinhar = temSep ? rows[1].map(function (c) {
    return /^:-+:$/.test(c) ? "center" : (/-:$/.test(c) ? "right" : "");
  }) : [];
  function cel(tag, c, i) {
    var st = alinhar[i] ? ' style="text-align:' + alinhar[i] + '"' : "";
    return "<" + tag + st + ">" + inlineMarkdown(c) + "</" + tag + ">";
  }
  var corpo = temSep ? rows.slice(2) : rows;
  var html = '<div class="table-wrap"><table>';
  if (temSep) html += "<thead><tr>" + rows[0].map(function (c, i) { return cel("th", c, i); }).join("") + "</tr></thead>";
  html += "<tbody>" + corpo.map(function (r) {
    return "<tr>" + r.map(function (c, i) { return cel("td", c, i); }).join("") + "</tr>";
  }).join("") + "</tbody></table></div>";
  return html;
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

    /* tabela */
    if (trimmed.charAt(0) === "|" && trimmed.indexOf("|", 1) !== -1) {
      fecharLista();
      var bloco = [], j = i;
      while (j < linhas.length && linhas[j].trim().charAt(0) === "|") { bloco.push(linhas[j].trim()); j++; }
      html += tabelaHtml(bloco);
      i = j - 1;
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

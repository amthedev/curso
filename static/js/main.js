// Menu mobile
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("navToggle");
  const nav = document.querySelector(".site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => nav.classList.toggle("open"));
  }

  renderPostBody();
});

// Renderizador de markdown simples: ## títulos, **negrito**, listas, blocos ```
function renderPostBody() {
  const el = document.getElementById("postBody");
  if (!el) return;

  const raw = el.dataset.raw || "";
  el.innerHTML = markdownParaHtml(raw);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMarkdown(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
}

function markdownParaHtml(md) {
  const linhas = md.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let dentroLista = null; // 'ul' | 'ol'
  let dentroCodigo = false;
  let bufferCodigo = [];

  const fecharLista = () => {
    if (dentroLista) {
      html += `</${dentroLista}>`;
      dentroLista = null;
    }
  };

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];

    if (linha.trim().startsWith("```")) {
      if (!dentroCodigo) {
        dentroCodigo = true;
        bufferCodigo = [];
      } else {
        dentroCodigo = false;
        html += `<pre><code>${escapeHtml(bufferCodigo.join("\n"))}</code></pre>`;
      }
      continue;
    }

    if (dentroCodigo) {
      bufferCodigo.push(linha);
      continue;
    }

    const trimmed = linha.trim();

    if (trimmed === "") {
      fecharLista();
      continue;
    }

    if (trimmed.startsWith("## ")) {
      fecharLista();
      html += `<h2>${inlineMarkdown(trimmed.slice(3))}</h2>`;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      fecharLista();
      html += `<h3>${inlineMarkdown(trimmed.slice(4))}</h3>`;
      continue;
    }

    const itemNumerado = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (itemNumerado) {
      if (dentroLista !== "ol") { fecharLista(); html += "<ol>"; dentroLista = "ol"; }
      html += `<li>${inlineMarkdown(itemNumerado[2])}</li>`;
      continue;
    }

    if (trimmed.startsWith("- ")) {
      if (dentroLista !== "ul") { fecharLista(); html += "<ul>"; dentroLista = "ul"; }
      html += `<li>${inlineMarkdown(trimmed.slice(2))}</li>`;
      continue;
    }

    fecharLista();
    html += `<p>${inlineMarkdown(trimmed)}</p>`;
  }

  fecharLista();
  if (dentroCodigo && bufferCodigo.length) {
    html += `<pre><code>${escapeHtml(bufferCodigo.join("\n"))}</code></pre>`;
  }

  return html;
}

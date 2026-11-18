/* ==========================================================
   Corretora — fichas de imóveis
   Guarda os imóveis no IndexedDB do próprio navegador.
   A imagem fica em base64 e vai no link, então o cliente
   consegue baixar a foto sem precisar de servidor.
   ========================================================== */

const DB_NOME = "corretora-db";
const DB_VERSAO = 1;
const STORE = "imoveis";
const STORE_META = "meta";

let db = null;
let imoveis = [];
let editandoId = null;
let imagemAtual = "";      // base64 da imagem carregada no formulário
let filtro = "";

/* ---------------- IndexedDB ---------------- */
function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" });
      if (!d.objectStoreNames.contains(STORE_META)) d.createObjectStore(STORE_META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(store, modo) {
  return db.transaction(store, modo).objectStore(store);
}

function dbTodos() {
  return new Promise((resolve, reject) => {
    const req = tx(STORE, "readonly").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function dbSalvar(imovel) {
  return new Promise((resolve, reject) => {
    const req = tx(STORE, "readwrite").put(imovel);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function dbApagar(id) {
  return new Promise((resolve, reject) => {
    const req = tx(STORE, "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ---------------- Utilidades ---------------- */
const $ = (sel) => document.querySelector(sel);

function aviso(el, texto, erro = false) {
  el.textContent = texto;
  el.hidden = !texto;
  el.classList.toggle("erro", !!erro);
  if (texto) {
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, 4000);
  }
}

function novoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fmtPreco(valor) {
  const t = String(valor || "").trim();
  if (!t) return "";
  const num = Number(t.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  if (!isFinite(num) || num <= 0) return t;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/* Reduz a imagem para no máximo 1400px e JPEG, para o link não ficar gigante */
function comprimirImagem(file, maxLado = 1400, qualidade = 0.82) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error("Não consegui ler o arquivo."));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Arquivo não é uma imagem válida."));
      img.onload = () => {
        let { width: w, height: h } = img;
        const escala = Math.min(1, maxLado / Math.max(w, h));
        w = Math.round(w * escala);
        h = Math.round(h * escala);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", qualidade));
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(file);
  });
}

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}

function dataUrlParaBlob(dataUrl) {
  const [cab, dados] = dataUrl.split(",");
  const mime = (cab.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
  const bin = atob(dados);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function nomeArquivo(imovel) {
  const base = (imovel.titulo || "imovel")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return (base || "imovel") + ".jpg";
}

/* Texto que vai para a área de transferência */
function textoDoImovel(im) {
  const partes = [];
  partes.push(im.titulo);
  const linha2 = [im.tipo, im.finalidade].filter(Boolean).join(" • ");
  if (linha2) partes.push(linha2);
  if (im.local) partes.push(im.local);
  if (im.preco) partes.push(fmtPreco(im.preco));
  partes.push("");
  partes.push(im.descricao || "");
  return partes.join("\n").trim();
}

/* ---------------- Link compartilhável ---------------- */
function codificar(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodificar(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function linkDaFicha(im) {
  const dados = codificar({
    t: im.titulo, ti: im.tipo, f: im.finalidade, p: im.preco,
    l: im.local, d: im.descricao, i: im.imagem
  });
  const base = location.href.split("#")[0].split("?")[0];
  return base + "#imovel=" + dados;
}

/* ---------------- Formulário ---------------- */
function limparForm() {
  editandoId = null;
  imagemAtual = "";
  $("#form").reset();
  $("#btnSalvar").textContent = "Salvar imóvel";
  $("#f-imagem").value = "";
  aviso($("#avisoForm"), "");
}

function preencherForm(im) {
  editandoId = im.id;
  imagemAtual = im.imagem || "";
  $("#f-titulo").value = im.titulo || "";
  $("#f-tipo").value = im.tipo || "Casa";
  $("#f-finalidade").value = im.finalidade || "Venda";
  $("#f-preco").value = im.preco || "";
  $("#f-local").value = im.local || "";
  $("#f-descricao").value = im.descricao || "";
  $("#f-imagem").value = "";
  $("#btnSalvar").textContent = "Atualizar imóvel";
  window.scrollTo({ top: 0, behavior: "smooth" });
  $("#f-titulo").focus();
}

async function salvarForm(ev) {
  ev.preventDefault();
  const titulo = $("#f-titulo").value.trim();
  if (!titulo) {
    aviso($("#avisoForm"), "Informe o título do anúncio.", true);
    return;
  }
  if (!imagemAtual && !editandoId) {
    aviso($("#avisoForm"), "Selecione a imagem da casa.", true);
    return;
  }
  if (!$("#f-descricao").value.trim()) {
    aviso($("#avisoForm"), "Escreva a descrição do imóvel.", true);
    return;
  }

  const im = {
    id: editandoId || novoId(),
    titulo,
    tipo: $("#f-tipo").value,
    finalidade: $("#f-finalidade").value,
    preco: $("#f-preco").value.trim(),
    local: $("#f-local").value.trim(),
    descricao: $("#f-descricao").value.trim(),
    imagem: imagemAtual,
    criadoEm: editandoId ? (imoveis.find((x) => x.id === editandoId)?.criadoEm || Date.now()) : Date.now()
  };

  try {
    await dbSalvar(im);
  } catch (e) {
    aviso($("#avisoForm"), "Não consegui salvar: " + e.message, true);
    return;
  }
  await carregarLista();
  limparForm();
  aviso($("#avisoForm"), "Imóvel salvo. Abra a ficha para enviar ao cliente.");
}

/* ---------------- Lista ---------------- */
function itemHTML(im) {
  const info = [im.tipo, im.local].filter(Boolean).join(" • ");
  return `
    <li class="item" data-id="${im.id}">
      <img src="${im.imagem || ""}" alt="" />
      <div class="item-info">
        <strong>${escapar(im.titulo)}</strong>
        <small>${escapar(info)}${im.preco ? " — " + escapar(fmtPreco(im.preco)) : ""}</small>
      </div>
      <div class="item-acoes">
        <button class="btn btn-primario btn-mini" data-acao="abrir">Abrir ficha</button>
        <button class="btn btn-neutro btn-mini" data-acao="editar">Editar</button>
        <button class="btn btn-perigo btn-mini" data-acao="apagar">Excluir</button>
      </div>
    </li>`;
}

function escapar(t) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderLista() {
  const q = filtro.toLowerCase();
  const visiveis = imoveis
    .filter((im) => !q || (im.titulo + " " + im.local + " " + im.tipo).toLowerCase().includes(q))
    .sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));

  $("#lista").innerHTML = visiveis.map(itemHTML).join("");
  $("#listaVazia").hidden = visiveis.length > 0;
  if (!visiveis.length && imoveis.length) {
    $("#listaVazia").textContent = "Nenhum imóvel encontrado para essa busca.";
  } else if (!visiveis.length) {
    $("#listaVazia").textContent = "Nenhum imóvel cadastrado ainda.";
  }
}

async function carregarLista() {
  imoveis = await dbTodos();
  renderLista();
}

async function acaoLista(ev) {
  const btn = ev.target.closest("button[data-acao]");
  if (!btn) return;
  const id = btn.closest(".item").dataset.id;
  const im = imoveis.find((x) => x.id === id);
  if (!im) return;

  if (btn.dataset.acao === "abrir") {
    location.hash = "#ficha/" + id;
  } else if (btn.dataset.acao === "editar") {
    preencherForm(im);
  } else if (btn.dataset.acao === "apagar") {
    if (confirm(`Excluir "${im.titulo}"?`)) {
      await dbApagar(id);
      await carregarLista();
      if (location.hash.includes(id)) location.hash = "";
    }
  }
}

/* ---------------- Ficha ---------------- */
function abrirFicha(im, somenteLeitura) {
  $("#painel").hidden = true;
  $("#ficha").hidden = false;

  const img = $("#fichaImagem");
  if (im.imagem) { img.src = im.imagem; img.style.display = ""; }
  else { img.removeAttribute("src"); img.style.display = "none"; }

  $("#fichaEtiqueta").textContent = [im.tipo, im.finalidade].filter(Boolean).join(" • ");
  $("#fichaTitulo").textContent = im.titulo || "Imóvel";
  $("#fichaLocal").textContent = im.local || "";
  $("#fichaPreco").textContent = im.preco ? fmtPreco(im.preco) : "";
  $("#fichaDescricao").textContent = im.descricao || "";
  $("#fichaDescricao").style.display = im.descricao ? "" : "none";
  document.querySelector(".rotulo-desc").style.display = im.descricao ? "" : "none";

  const linkInput = $("#linkFicha");
  linkInput.value = linkDaFicha(im);
  linkInput.readOnly = true;
  linkInput.select();

  // Download da imagem
  const a = $("#btnBaixarImagem");
  if (im.imagem) {
    a.href = im.imagem;
    a.download = nomeArquivo(im);
    a.style.display = "";
  } else {
    a.removeAttribute("href");
    a.style.display = "none";
  }

  // Guarda a ficha aberta para os botões de copiar
  $("#ficha")._imovel = im;
  $("#ficha")._somenteLeitura = !!somenteLeitura;
  $("#btnVoltar").style.display = somenteLeitura ? "none" : "";
  aviso($("#avisoFicha"), "");
  window.scrollTo({ top: 0 });
}

function voltarPainel() {
  if (location.hash.startsWith("#ficha/") || location.hash.startsWith("#imovel=")) {
    location.hash = "";
  } else {
    $("#ficha").hidden = true;
    $("#painel").hidden = false;
  }
}

/* ---------------- Copiar descrição (e imagem) ---------------- */
async function copiarDescricao() {
  const im = $("#ficha")._imovel;
  if (!im) return;
  const ok = await copiarTexto(im.descricao || "");
  aviso($("#avisoFicha"), ok ? "Descrição copiada! Agora é só colar." : "Não consegui copiar. Selecione o texto e use Ctrl+C.", !ok);
}

async function copiarTudo() {
  const im = $("#ficha")._imovel;
  if (!im) return;

  // 1) imagem na área de transferência, quando o navegador permite
  let imagemOk = false;
  if (im.imagem && navigator.clipboard && window.ClipboardItem) {
    try {
      const blob = dataUrlParaBlob(im.imagem);
      const png = await blobParaPng(blob);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      imagemOk = true;
    } catch (_) { imagemOk = false; }
  }

  // 2) descrição como texto
  const textoOk = await copiarTexto(textoDoImovel(im));

  if (imagemOk && textoOk) {
    aviso($("#avisoFicha"), "Imagem e descrição copiadas! Cole no WhatsApp ou e-mail.");
  } else if (textoOk) {
    aviso($("#avisoFicha"), "Descrição copiada. A imagem não pôde ir para a área de transferência — use \"Baixar imagem\".");
  } else {
    aviso($("#avisoFicha"), "Use os botões \"Baixar imagem\" e \"Copiar descrição\".", true);
  }
}

function blobParaPng(blob) {
  return new Promise((resolve) => {
    if (blob.type === "image/png") return resolve(blob);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      c.toBlob((b) => resolve(b || blob), "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
    img.src = url;
  });
}

/* ---------------- Roteamento ---------------- */
async function rotear() {
  const h = location.hash || "";

  if (h.startsWith("#imovel=")) {
    // ficha aberta pelo cliente, com os dados dentro do próprio link
    try {
      const d = decodificar(h.slice(8));
      abrirFicha({
        titulo: d.t, tipo: d.ti, finalidade: d.f, preco: d.p,
        local: d.l, descricao: d.d, imagem: d.i
      }, true);
      return;
    } catch (e) {
      alert("Este link está incompleto ou corrompido.");
      location.hash = "";
    }
  }

  if (h.startsWith("#ficha/")) {
    const id = h.slice(7);
    const im = imoveis.find((x) => x.id === id);
    if (im) { abrirFicha(im, false); return; }
    location.hash = "";
  }

  $("#ficha").hidden = true;
  $("#painel").hidden = false;
}

/* ---------------- Início ---------------- */
async function iniciar() {
  try {
    db = await abrirDB();
  } catch (e) {
    alert("Este navegador não permitiu o armazenamento local: " + e.message);
    return;
  }
  await carregarLista();

  $("#form").addEventListener("submit", salvarForm);
  $("#btnLimpar").addEventListener("click", limparForm);
  $("#btnNovo").addEventListener("click", () => {
    limparForm();
    if (location.hash) location.hash = "";
    $("#f-titulo").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  $("#f-imagem").addEventListener("change", async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    aviso($("#avisoForm"), "Preparando a imagem...");
    try {
      imagemAtual = await comprimirImagem(file);
      aviso($("#avisoForm"), "Imagem pronta.");
    } catch (e) {
      imagemAtual = "";
      aviso($("#avisoForm"), e.message, true);
    }
  });

  $("#lista").addEventListener("click", acaoLista);
  $("#busca").addEventListener("input", (ev) => { filtro = ev.target.value; renderLista(); });

  $("#btnVoltar").addEventListener("click", voltarPainel);
  $("#btnCopiarDescricao").addEventListener("click", copiarDescricao);
  $("#btnCopiarTudo").addEventListener("click", copiarTudo);
  $("#btnCopiarLink").addEventListener("click", async () => {
    const link = $("#linkFicha").value;
    const ok = await copiarTexto(link);
    if (ok) aviso($("#avisoFicha"), "Link copiado! Envie para o cliente abrir no celular.");
    else { $("#linkFicha").select(); aviso($("#avisoFicha"), "Selecione o link e use Ctrl+C.", true); }
  });

  // No celular, compartilhar direto também ajuda
  if (navigator.share) {
    const b = document.createElement("button");
    b.className = "btn btn-neutro";
    b.textContent = "↗ Compartilhar";
    b.addEventListener("click", () => {
      const im = $("#ficha")._imovel;
      navigator.share({ title: im.titulo, text: textoDoImovel(im), url: linkDaFicha(im) }).catch(() => {});
    });
    $(".ficha-acoes").appendChild(b);
  }

  // rodapé discreto com a marca na ficha do cliente
  if (!document.getElementById("rodapeMarca")) {
    const rod = document.createElement("footer");
    rod.id = "rodapeMarca";
    rod.className = "rodape-marca";
    rod.innerHTML = '<img src="logo-publio.png" alt="" /><span>Públio Imóveis — mais que imóveis, realizamos histórias</span>';
    $("#ficha").appendChild(rod);
  }

  window.addEventListener("hashchange", rotear);
  await rotear();
}

iniciar();

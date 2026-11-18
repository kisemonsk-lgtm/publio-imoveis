/* ==========================================================
   Públio Imóveis — fichas de imóveis
   Os imóveis ficam salvos numa nuvem compartilhada (Firebase Firestore),
   então TODOS os dispositivos veem a mesma lista.
   Se a nuvem não estiver configurada, cai para o armazenamento
   local do navegador (IndexedDB), sem quebrar nada.
   ========================================================== */

const DB_NOME = "corretora-db";
const DB_VERSAO = 1;
const STORE = "imoveis";
const STORE_META = "meta";

/* ---- Configuração da nuvem (Firebase) ----
   Preencha o bloco "firebase" abaixo com os dados do SEU projeto.
   O passo a passo está em COMO-ATIVAR-A-NUVEM.md.                        */
const NUVEM = {
  firebase: {
    apiKey: "AIzaSyCnOr5JEkRhZmqaov_uVib2GbJzfp7U-gk",
    authDomain: "publio-imoveis-v1.firebaseapp.com",
    projectId: "publio-imoveis-v1",
    storageBucket: "publio-imoveis-v1.firebasestorage.app",
    messagingSenderId: "917200805284",
    appId: "1:917200805284:web:4f947250da877bb8f8f531"
  },
  colecao: "publio",
  get ativa() { return !!(this.firebase && this.firebase.projectId && this.firebase.apiKey); }
};
const FS_URL = "https://firestore.googleapis.com/v1/projects/";

let db = null;
let imoveis = [];
let editandoId = null;
let imagemAtual = [];      // fotos (base64) carregadas no formulário
let filtro = "";
let nuvemOk = null;
let ultimoErroNuvem = "";        // null = ainda não testada, true/false = resultado
let sincronizando = false;

/* ---------------- IndexedDB (cópia local) ---------------- */
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

function dbSubstituirTudo(lista) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const s = t.objectStore(STORE);
    s.clear();
    (lista || []).forEach((im) => s.put(im));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/* ---------------- Nuvem compartilhada (Firestore via REST) ---------------- */
function docParaImovel(id, campos) {
  const v = (nome, padrao = "") => (campos && campos[nome] ? (campos[nome].stringValue ?? padrao) : padrao);
  const n = (nome) => (campos && campos[nome] ? Number(campos[nome].integerValue ?? campos[nome].doubleValue ?? 0) : 0);
  const lista = (campos && campos.imagens && campos.imagens.arrayValue && campos.imagens.arrayValue.values)
    ? campos.imagens.arrayValue.values.map((x) => x.stringValue || "").filter(Boolean)
    : [];
  const unica = v("imagem");
  const imagens = lista.length ? lista : (unica ? [unica] : []);
  return {
    id,
    titulo: v("titulo"),
    tipo: v("tipo"),
    finalidade: v("finalidade"),
    preco: v("preco"),
    local: v("local"),
    descricao: v("descricao"),
    imagem: imagens[0] || "",
    imagens,
    criadoEm: n("criadoEm"),
    atualizadoEm: n("atualizadoEm")
  };
}

function imovelParaDoc(im) {
  const s = (x) => ({ stringValue: String(x == null ? "" : x) });
  const fotos = imagensDe(im);
  return {
    fields: {
      titulo: s(im.titulo),
      tipo: s(im.tipo),
      finalidade: s(im.finalidade),
      preco: s(im.preco),
      local: s(im.local),
      descricao: s(im.descricao),
      imagem: s(fotos[0] || ""),
      imagens: { arrayValue: { values: fotos.map((f) => ({ stringValue: f })) } },
      criadoEm: { integerValue: String(im.criadoEm || Date.now()) },
      atualizadoEm: { integerValue: String(im.atualizadoEm || Date.now()) }
    }
  };
}

/* Lista de fotos de um imóvel, aceitando os registros antigos (só 1 imagem) */
function imagensDe(im) {
  if (!im) return [];
  if (Array.isArray(im.imagens) && im.imagens.length) return im.imagens.filter(Boolean);
  return im.imagem ? [im.imagem] : [];
}

function baseFS() {
  return `${FS_URL}${NUVEM.firebase.projectId}/databases/(default)/documents/${NUVEM.colecao}`;
}

async function nuvemLer() {
  if (!NUVEM.ativa) return null;
  const r = await nuvemFetch(`${baseFS()}?pageSize=300&key=${encodeURIComponent(NUVEM.firebase.apiKey)}`, { cache: "no-store" });
  const dados = await r.json();
  const docs = dados.documents || [];
  return docs.map((d) => docParaImovel(d.name.split("/").pop(), d.fields));
}

async function nuvemFetch(url, opcoes = {}, tentativas = 3) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, opcoes);
      if (r.ok) return r;
      ultimo = new Error("servidor respondeu " + r.status);
      // 4xx: não adianta repetir
      if (r.status >= 400 && r.status < 500) break;
    } catch (e) {
      ultimo = new Error("falha de rede (" + (e.message || "conexão recusada") + ")");
    }
    await new Promise((ok) => setTimeout(ok, 400 * (i + 1)));
  }
  throw ultimo || new Error("falha desconhecida");
}

async function nuvemSalvarUm(im) {
  if (!NUVEM.ativa) return false;
  const params = new URLSearchParams();
  if (NUVEM.firebase.apiKey) params.set("key", NUVEM.firebase.apiKey);
  const url = `${baseFS()}/${encodeURIComponent(im.id)}${params.toString() ? "?" + params.toString() : ""}`;
  await nuvemFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(imovelParaDoc(im))
  });
  return true;
}

async function nuvemApagarUm(id) {
  if (!NUVEM.ativa) return false;
  try {
    await nuvemFetch(`${baseFS()}/${encodeURIComponent(id)}?key=${encodeURIComponent(NUVEM.firebase.apiKey)}`, { method: "DELETE" });
  } catch (_) { /* já não existia */ }
  return true;
}

/* Envia vários imóveis de uma vez */
async function nuvemEnviarLista(lista) {
  let ok = true;
  for (const im of lista || []) {
    try { await nuvemSalvarUm(im); } catch (_) { ok = false; }
  }
  return ok;
}

/* Junta duas listas pelo id, ficando com a versão mais recente de cada imóvel */
function mesclar(a, b) {
  const mapa = new Map();
  [...(a || []), ...(b || [])].forEach((im) => {
    if (!im || !im.id) return;
    const atual = mapa.get(im.id);
    const t = im.atualizadoEm || im.criadoEm || 0;
    const tAtual = atual ? (atual.atualizadoEm || atual.criadoEm || 0) : -1;
    if (!atual || t >= tAtual) mapa.set(im.id, im);
  });
  return [...mapa.values()];
}

/* Lê a nuvem (se ativa) e atualiza a lista na tela */
async function sincronizar({ mostrarAviso = false } = {}) {
  if (sincronizando) return;
  if (!NUVEM.ativa) { nuvemOk = false; atualizarStatusNuvem(); return; }
  sincronizando = true;
  try {
    const daNuvem = await nuvemLer();
    const locais = await dbTodos();
    const juntos = mesclar(daNuvem || [], locais);
    // se aqui existe algo que ainda não subiu, envia para a nuvem
    const idsNuvem = new Set((daNuvem || []).map((x) => x.id));
    const faltando = locais.filter((x) => !idsNuvem.has(x.id));
    if (faltando.length) await nuvemEnviarLista(faltando);
    await dbSubstituirTudo(juntos);
    imoveis = juntos;
    nuvemOk = true;
    renderLista();
    if (mostrarAviso) aviso($("#avisoForm"), "Lista atualizada com os outros dispositivos.");
  } catch (e) {
    nuvemOk = false;
    if (mostrarAviso) aviso($("#avisoForm"), "Não consegui falar com a nuvem: " + e.message, true);
  } finally {
    sincronizando = false;
    atualizarStatusNuvem();
  }
}

/* Salva na nuvem o estado atual e mantém a cópia local */
async function publicar(listaParaEnviar) {
  await dbSubstituirTudo(imoveis);
  if (!NUVEM.ativa) return { nuvem: false };
  try {
    // envia o que mudou e confere se gravou de verdade
    const lista = listaParaEnviar || imoveis;
    await nuvemEnviarLista(lista);
    const confirmados = await nuvemLer();
    const idsConfirmados = new Set((confirmados || []).map((x) => x.id));
    const naoSalvou = (lista || []).filter((x) => !idsConfirmados.has(x.id));
    if (naoSalvou.length) throw new Error("o Firestore não confirmou o envio");
    // traz o que existir na nuvem e ainda não está aqui
    const remoto = await nuvemLer().catch(() => []);
    const juntos = mesclar(remoto || [], imoveis);
    imoveis = juntos;
    await dbSubstituirTudo(juntos);
    nuvemOk = true;
    atualizarStatusNuvem();
    return { nuvem: true };
  } catch (e) {
    nuvemOk = false;
    atualizarStatusNuvem();
    return { nuvem: false, erro: e.message };
  }
}

function atualizarStatusNuvem() {
  const el = document.getElementById("statusNuvem");
  if (!el) return;
  if (!NUVEM.ativa) {
    el.textContent = "Modo local — só neste aparelho";
    el.className = "status-nuvem local";
    el.title = "Para todos os dispositivos verem os mesmos imóveis, ative a nuvem (veja COMO-ATIVAR-A-NUVEM.md).";
    return;
  }
  if (nuvemOk === true) {
    el.textContent = "Sincronizado — todos os dispositivos";
    el.className = "status-nuvem ok";
    el.title = "Os imóveis são compartilhados entre todos os aparelhos.";
  } else if (nuvemOk === false) {
    el.textContent = "Sem conexão com a nuvem";
    el.className = "status-nuvem erro";
    el.title = ultimoErroNuvem ? ("Erro: " + ultimoErroNuvem) : "Confira sua internet ou a configuração da nuvem.";
    if (ultimoErroNuvem) el.textContent = "Sem conexão com a nuvem: " + ultimoErroNuvem.slice(0, 40);
  } else {
    el.textContent = "Conectando...";
    el.className = "status-nuvem";
  }
}

/* ---------------- Utilidades ---------------- */
const $ = (sel) => document.querySelector(sel);

function aviso(el, texto, erro = false) {
  el.textContent = texto;
  el.hidden = !texto;
  el.classList.toggle("erro", !!erro);
  if (texto) {
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, 4500);
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

/* Reduz a foto e guarda em JPEG pequeno, para caber no limite de 1 MB por imóvel do Firestore */
function comprimirImagem(file, maxLado = 1200, qualidade = 0.78, alvoBytes = 100000) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error("Não consegui ler o arquivo."));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Arquivo não é uma imagem válida."));
      img.onload = () => {
        let lado = maxLado;
        let q = qualidade;
        let dataUrl = "";
        let tentativas = 0;

        const desenhar = () => {
          const escala = Math.min(1, lado / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * escala));
          const h = Math.max(1, Math.round(img.height * escala));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          dataUrl = canvas.toDataURL("image/jpeg", q);
        };

        const bytes = () => Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);

        desenhar();
        // reduz até caber no tamanho alvo (mantendo boa qualidade)
        while (bytes() > alvoBytes && tentativas < 7) {
          tentativas++;
          if (q > 0.55) q -= 0.1;
          else lado = Math.round(lado * 0.82);
          desenhar();
        }
        resolve(dataUrl);
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(file);
  });
}

/* Tamanho aproximado de um imóvel em bytes, como vai para o Firestore */
function tamanhoImovel(im) {
  const fotos = imagensDe(im);
  const bytesFotos = fotos.reduce((t, d) => t + Math.round((String(d).length - String(d).indexOf(",") - 1) * 0.75), 0);
  const texto = (im.titulo || "").length + (im.descricao || "").length + (im.local || "").length + 200;
  return bytesFotos + texto;
}
const LIMITE_IMOVEL = 1048000;   // margem de segurança sobre o limite de 1 MB do Firestore
const MAX_FOTOS = 10;            // fotos por imóvel (cabe no limite de 1 MB)

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

/* Link curto: aponta para o imóvel na lista compartilhada (precisa da nuvem).
   Sem nuvem, o link carrega tudo dentro dele, como antes. */
function linkDaFicha(im) {
  const base = location.href.split("#")[0].split("?")[0];
  if (NUVEM.ativa) return base + "#ver/" + im.id;
  const dados = codificar({
    t: im.titulo, ti: im.tipo, f: im.finalidade, p: im.preco,
    l: im.local, d: im.descricao, i: imagensDe(im)
  });
  return base + "#imovel=" + dados;
}

/* ---------------- Formulário ---------------- */
function limparForm() {
  editandoId = null;
  imagemAtual = [];
  $("#form").reset();
  $("#btnSalvar").textContent = "Salvar imóvel";
  $("#f-imagem").value = "";
  renderMiniaturas();
  aviso($("#avisoForm"), "");
}

function preencherForm(im) {
  editandoId = im.id;
  imagemAtual = imagensDe(im).slice();
  $("#f-titulo").value = im.titulo || "";
  $("#f-tipo").value = im.tipo || "Casa";
  $("#f-finalidade").value = im.finalidade || "Venda";
  $("#f-preco").value = im.preco || "";
  $("#f-local").value = im.local || "";
  $("#f-descricao").value = im.descricao || "";
  $("#f-imagem").value = "";
  renderMiniaturas();
  $("#btnSalvar").textContent = "Atualizar imóvel";
  window.scrollTo({ top: 0, behavior: "smooth" });
  $("#f-titulo").focus();
}

/* Minuaturas das fotos no formulário */
function renderMiniaturas() {
  const box = document.getElementById("miniaturas");
  if (!box) return;
  box.innerHTML = imagemAtual.map((src, i) => `
    <div class="mini" data-i="${i}">
      <img src="${src}" alt="Foto ${i + 1}" />
      ${i === 0 ? '<span class="mini-capa">Capa</span>' : ''}
      <button type="button" class="mini-x" data-acao="remover" title="Remover foto">×</button>
      ${i > 0 ? '<button type="button" class="mini-btn" data-acao="capa" title="Usar como capa">Capa</button>' : ''}
    </div>`).join("");
  const cont = document.getElementById("fotosInfo");
  if (cont) {
    const bytes = imagemAtual.reduce((t, d) => t + Math.round((String(d).length - String(d).indexOf(",") - 1) * 0.75), 0);
    const mb = (bytes / 1048576).toFixed(2).replace(".", ",");
    cont.textContent = imagemAtual.length
      ? `${imagemAtual.length} foto${imagemAtual.length > 1 ? "s" : ""} (${mb} MB) — a primeira é a capa`
      : "Nenhuma foto escolhida";
  }
}

function acoesMiniaturas(ev) {
  const btn = ev.target.closest("button[data-acao]");
  if (!btn) return;
  ev.preventDefault();
  const i = Number(btn.closest(".mini").dataset.i);
  if (btn.dataset.acao === "remover") {
    imagemAtual.splice(i, 1);
  } else if (btn.dataset.acao === "capa") {
    const [foto] = imagemAtual.splice(i, 1);
    imagemAtual.unshift(foto);
  }
  renderMiniaturas();
}

async function salvarForm(ev) {
  ev.preventDefault();
  const titulo = $("#f-titulo").value.trim();
  if (!titulo) {
    aviso($("#avisoForm"), "Informe o título do anúncio.", true);
    return;
  }
  if (!imagemAtual.length && !editandoId) {
    aviso($("#avisoForm"), "Escolha pelo menos uma foto da casa.", true);
    return;
  }
  if (!$("#f-descricao").value.trim()) {
    aviso($("#avisoForm"), "Escreva a descrição do imóvel.", true);
    return;
  }

  const anterior = editandoId ? imoveis.find((x) => x.id === editandoId) : null;
  const im = {
    id: editandoId || novoId(),
    titulo,
    tipo: $("#f-tipo").value,
    finalidade: $("#f-finalidade").value,
    preco: $("#f-preco").value.trim(),
    local: $("#f-local").value.trim(),
    descricao: $("#f-descricao").value.trim(),
    imagem: imagemAtual[0] || "",
    imagens: imagemAtual.slice(),
    criadoEm: anterior ? (anterior.criadoEm || Date.now()) : Date.now(),
    atualizadoEm: Date.now()
  };

  // atualiza a lista em memória
  const idx = imoveis.findIndex((x) => x.id === im.id);
  if (idx >= 0) imoveis[idx] = im; else imoveis.push(im);

  if (tamanhoImovel(im) > LIMITE_IMOVEL) {
    const mb = (tamanhoImovel(im) / 1048576).toFixed(2).replace(".", ",");
    aviso($("#avisoForm"), `Fotos demais para um imóvel (${mb} MB). Remova algumas fotos e tente de novo.`, true);
    return;
  }

  const r = await publicar([im]);
  renderLista();
  limparForm();
  if (r.nuvem) {
    aviso($("#avisoForm"), "Imóvel salvo e enviado para todos os dispositivos.");
  } else if (r.erro) {
    aviso($("#avisoForm"), "Salvo neste aparelho, mas a nuvem falhou: " + r.erro, true);
  } else {
    aviso($("#avisoForm"), "Imóvel salvo neste aparelho. Ative a nuvem para os outros verem.");
  }
}

/* ---------------- Lista ---------------- */
function itemHTML(im) {
  const info = [im.tipo, im.local].filter(Boolean).join(" • ");
  const fotos = imagensDe(im);
  return `
    <li class="item" data-id="${im.id}">
      <div class="item-foto">
        <img src="${escapar(fotos[0] || "")}" alt="" />
        ${fotos.length > 1 ? `<span class="foto-badge">${fotos.length}</span>` : ""}
      </div>
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
    if (confirm(`Excluir "${im.titulo}"? A exclusão vale para todos os dispositivos.`)) {
      imoveis = imoveis.filter((x) => x.id !== id);
      await dbApagar(id);
      if (NUVEM.ativa) { try { await nuvemApagarUm(id); } catch (_) {} }
      const r = await publicar();
      renderLista();
      if (location.hash.includes(id)) location.hash = "";
      if (r.erro) aviso($("#avisoForm"), "Excluído aqui, mas a nuvem falhou: " + r.erro, true);
    }
  }
}

/* ---------------- Ficha ---------------- */
/* Duas camadas de imagem: a nova entra por cima com fade + leve deslize */
function pintarFoto(src, direcao) {
  const alvo = document.getElementById("fichaImagem");
  if (!alvo) return;

  const aplicar = () => {
    alvo.classList.remove("troca-esq", "troca-dir");
    void alvo.offsetWidth;
    if (direcao === "esq") alvo.classList.add("troca-esq");
    if (direcao === "dir") alvo.classList.add("troca-dir");
    alvo.classList.add("visivel");
  };

  if (alvo.getAttribute("src") === src) {
    aplicar();
    return;
  }
  // pré-carrega: a troca só acontece quando a foto já está pronta (sem piscar)
  const pre = new Image();
  pre.onload = () => {
    alvo.src = src;
    if (alvo.decode) alvo.decode().then(aplicar).catch(aplicar); else aplicar();
  };
  pre.onerror = () => {
    alvo.src = src;
    aplicar();
  };
  pre.src = src;
}

function mostrarFotoFicha(indice, forcar) {
  const box = $("#ficha");
  const fotos = box._fotos || [];
  if (!fotos.length) return;
  const total = fotos.length;
  let i = Number(indice) || 0;
  i = total > 1 ? ((i % total) + total) % total : 0;
  if (!forcar && i === box._fotoAtiva && box._pintou) return;
  const anterior = box._fotoAtiva || 0;
  box._fotoAtiva = i;
  box._pintou = true;
  const direcao = i > anterior ? "dir" : (i < anterior ? "esq" : "");
  pintarFoto(fotos[i], direcao);
  const cont = $("#contadorFotos");
  if (cont) {
    cont.textContent = total > 1 ? (i + 1) + " / " + total : "";
    cont.hidden = total <= 1;
  }
  document.querySelectorAll("#miniaturasFicha .thumb").forEach((el, k) => {
    const ativa = k === i;
    el.classList.toggle("ativa", ativa);
    if (ativa && el.scrollIntoView) {
      try { el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); } catch (_) {}
    }
  });
  const a = $("#btnBaixarImagem");
  if (a) {
    const suf = total > 1 ? "-" + (i + 1) : "";
    a.href = fotos[i];
    a.download = nomeArquivo(box._imovel || {}).replace(/\.jpg$/, "") + suf + ".jpg";
    a.style.display = "";
    a.textContent = total > 1 ? "⬇ Baixar esta foto (" + (i + 1) + "/" + total + ")" : "⬇ Baixar imagem";
  }
  const btnTodas = document.getElementById("btnBaixarTodas");
  if (btnTodas) {
    btnTodas.style.display = total > 1 ? "" : "none";
    btnTodas.textContent = "⬇ Baixar todas (" + total + ") .zip";
  }
}

function montarGaleria(im) {
  const fotos = imagensDe(im);
  const box = $("#ficha");
  box._fotos = fotos;
  box._fotoAtiva = 0;
  box._pintou = false;
  const alvoImg = document.getElementById("fichaImagem");
  if (alvoImg) {
    alvoImg.classList.remove("visivel", "troca-esq", "troca-dir");
    alvoImg.removeAttribute("src");
    alvoImg.style.display = "";
  }
  const mini = $("#miniaturasFicha");
  if (mini) {
    mini.innerHTML = fotos.length > 1
      ? fotos.map((src, i) => "<button type=\"button\" class=\"thumb" + (i === 0 ? " ativa" : "") + "\" data-foto=\"" + i + "\"><img src=\"" + src + "\" alt=\"Foto " + (i + 1) + "\" /></button>").join("")
      : "";
    mini.hidden = fotos.length <= 1;
  }
  const setaEsq = $("#setaEsq"), setaDir = $("#setaDir");
  if (setaEsq && setaDir) {
    setaEsq.hidden = fotos.length <= 1;
    setaDir.hidden = fotos.length <= 1;
  }
  if (fotos.length) {
    mostrarFotoFicha(0, true);
  } else {
    if (alvoImg) alvoImg.style.display = "none";
    const a = $("#btnBaixarImagem");
    if (a) a.style.display = "none";
    const btnTodasVazio = document.getElementById("btnBaixarTodas");
    if (btnTodasVazio) btnTodasVazio.style.display = "none";
    if (mini) mini.hidden = true;
    if (setaEsq) setaEsq.hidden = true;
    if (setaDir) setaDir.hidden = true;
    const cont = $("#contadorFotos");
    if (cont) cont.hidden = true;
  }
}
function abrirFicha(im, somenteLeitura) {
  $("#painel").hidden = true;
  $("#ficha").hidden = false;

  $("#ficha")._imovel = im;
  $("#ficha")._somenteLeitura = !!somenteLeitura;
  montarGaleria(im);

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

  $("#btnVoltar").style.display = somenteLeitura ? "none" : "";
  aviso($("#avisoFicha"), "");
  window.scrollTo({ top: 0 });
}

function voltarPainel() {
  if (location.hash) {
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

  const foto = (($("#ficha")._fotos || [])[($("#ficha")._fotoAtiva || 0)]) || "";

  let imagemOk = false;
  if (foto && navigator.clipboard && window.ClipboardItem) {
    try {
      const blob = dataUrlParaBlob(foto);
      const png = await blobParaPng(blob);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      imagemOk = true;
    } catch (_) { imagemOk = false; }
  }

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

/* Baixa todas as fotos do imóvel em um único arquivo ZIP (abre no WinRAR, 7-Zip, celular) */
async function baixarTodasFotos() {
  const im = $("#ficha")._imovel;
  const fotos = $("#ficha")._fotos || [];
  if (!im || !fotos.length) return;

  const btn = document.getElementById("btnBaixarTodas");
  const textoOriginal = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Preparando..."; }

  try {
    if (typeof fflate === "undefined") throw new Error("compactador não carregou");

    const base = (im.titulo || "imovel")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "imovel";

    const arquivos = {};
    fotos.forEach((dataUrl, i) => {
      const partes = String(dataUrl).split(",");
      const bin = atob(partes[1] || "");
      const bytes = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
      const nome = `${base}-${String(i + 1).padStart(2, "0")}.jpg`;
      arquivos[nome] = [bytes, { level: 0 }];   // JPEG já é comprimido
    });

    // ficha.txt com a descrição junto das fotos
    const fichaTxt = textoDoImovel(im) + "\n\nPúblio Imóveis — mais que imóveis, realizamos histórias\n";
    arquivos["ficha-do-imovel.txt"] = [fflate.strToU8(fichaTxt), { level: 6 }];

    const zip = fflate.zipSync(arquivos, { level: 0 });
    const blob = new Blob([zip], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}-fotos.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);

    aviso($("#avisoFicha"), `${fotos.length} foto(s) baixadas em ${base}-fotos.zip (abra com o WinRAR ou 7-Zip).`);
  } catch (e) {
    aviso($("#avisoFicha"), "Não consegui gerar o arquivo: " + e.message, true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = textoOriginal || "⬇ Baixar todas (.zip)"; }
  }
}

/* ---------------- Roteamento ---------------- */
async function rotear() {
  const h = location.hash || "";

  // link curto: imóvel na lista compartilhada
  if (h.startsWith("#ver/")) {
    const id = h.slice(5);
    let im = imoveis.find((x) => x.id === id);
    if (!im) {
      await sincronizar();
      im = imoveis.find((x) => x.id === id);
    }
    if (im) { abrirFicha(im, true); return; }
    alert("Imóvel não encontrado. O link pode ter sido removido.");
    location.hash = "";
    return;
  }

  // link antigo, com os dados dentro dele
  if (h.startsWith("#imovel=")) {
    try {
      const d = decodificar(h.slice(8));
      abrirFicha({
        titulo: d.t, tipo: d.ti, finalidade: d.f, preco: d.p,
        local: d.l, descricao: d.d,
        imagem: Array.isArray(d.i) ? (d.i[0] || "") : (d.i || ""),
        imagens: Array.isArray(d.i) ? d.i.filter(Boolean) : (d.i ? [d.i] : [])
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
    const arquivos = Array.from(ev.target.files || []).filter((f) => f.type.startsWith("image/"));
    if (!arquivos.length) return;
    aviso($("#avisoForm"), `Preparando ${arquivos.length} foto(s)...`);
    const novas = [];
    for (const file of arquivos) {
      try {
        novas.push(await comprimirImagem(file));
      } catch (e) {
        aviso($("#avisoForm"), e.message, true);
      }
    }
    imagemAtual = imagemAtual.concat(novas).slice(0, MAX_FOTOS);
    ev.target.value = "";
    renderMiniaturas();
    if (!novas.length) {
      aviso($("#avisoForm"), "Não consegui adicionar as fotos.", true);
    } else if (imagemAtual.length >= MAX_FOTOS) {
      aviso($("#avisoForm"), `Limite de ${MAX_FOTOS} fotos por imóvel atingido.`);
    } else {
      const totalBytes = imagemAtual.reduce((t, d) => t + Math.round((String(d).length - String(d).indexOf(",") - 1) * 0.75), 0);
      if (totalBytes > LIMITE_IMOVEL) {
        aviso($("#avisoForm"), `${novas.length} foto(s) adicionada(s), mas o total passou do limite do banco. Remova alguma foto.`, true);
      } else {
        aviso($("#avisoForm"), `${novas.length} foto(s) adicionada(s). Total: ${imagemAtual.length}.`);
      }
    }
  });

  const mini = document.getElementById("miniaturas");
  if (mini) mini.addEventListener("click", acoesMiniaturas);

  // galeria da ficha: setas, miniaturas e arrastar no celular
  const passo = (d) => mostrarFotoFicha(($("#ficha")._fotoAtiva || 0) + d);
  const bEsq = document.getElementById("setaEsq");
  const bDir = document.getElementById("setaDir");
  if (bEsq) bEsq.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); passo(-1); });
  if (bDir) bDir.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); passo(1); });
  const btnBaixarTodas = document.getElementById("btnBaixarTodas");
  if (btnBaixarTodas) btnBaixarTodas.addEventListener("click", baixarTodasFotos);
  const miniFicha = document.getElementById("miniaturasFicha");
  if (miniFicha) miniFicha.addEventListener("click", (ev) => {
    const t = ev.target.closest(".thumb");
    if (t) mostrarFotoFicha(Number(t.dataset.foto));
  });
  let toqueX = null, toqueY = null;
  const palcoEl = document.getElementById("galeria");
  if (palcoEl) {
    palcoEl.addEventListener("touchstart", (ev) => { toqueX = ev.touches[0].clientX; toqueY = ev.touches[0].clientY; }, { passive: true });
    palcoEl.addEventListener("touchend", (ev) => {
      if (toqueX === null) return;
      const dx = ev.changedTouches[0].clientX - toqueX;
      const dy = ev.changedTouches[0].clientY - (toqueY || 0);
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) passo(dx < 0 ? 1 : -1);
      toqueX = null; toqueY = null;
    }, { passive: true });
  }
  document.addEventListener("keydown", (ev) => {
    if ($("#ficha").hidden) return;
    if (ev.key === "ArrowLeft") mostrarFotoFicha(($("#ficha")._fotoAtiva || 0) - 1);
    if (ev.key === "ArrowRight") mostrarFotoFicha(($("#ficha")._fotoAtiva || 0) + 1);
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

  const btnAtualizar = document.getElementById("btnAtualizar");
  if (btnAtualizar) {
    btnAtualizar.addEventListener("click", () => sincronizar({ mostrarAviso: true }));
  }

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

  window.addEventListener("hashchange", () => { try { rotear(); } catch (e) { console.error(e); } });

  // primeira carga: mostra o painel imediatamente e busca a lista em seguida
  mostrarTela("painel");
  renderLista();
  try { await rotear(); } catch (e) { console.error(e); mostrarTela("painel"); }
  try { await sincronizar(); } catch (e) { console.error(e); }
  try { await rotear(); } catch (e) { console.error(e); }

  // mantém a lista atualizada entre os aparelhos
  if (NUVEM.ativa) {
    setInterval(() => {
      if (document.hidden) return;
      if (location.hash.startsWith("#ficha/") || location.hash.startsWith("#ver/")) return;
      sincronizar();
    }, 30000);

    // ao voltar para a aba, busca novidades na hora
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !location.hash) sincronizar();
    });
  }
}

/* A tela nunca fica em branco: se algo demorar, mostra o que já existe no aparelho */
function mostrarTela(destino) {
  const painel = document.getElementById("painel");
  const ficha = document.getElementById("ficha");
  if (!painel || !ficha) return;
  if (destino === "ficha") { painel.hidden = true; ficha.hidden = false; }
  else { ficha.hidden = true; painel.hidden = false; }
}

iniciar().catch((e) => {
  console.error("Falha ao iniciar:", e);
  mostrarTela("painel");
  const s = document.getElementById("statusNuvem");
  if (s) { s.textContent = "Não consegui carregar — recarregue a página"; s.className = "status-nuvem erro"; }
  if (typeof renderLista === "function") { try { renderLista(); } catch (_) {} }
});

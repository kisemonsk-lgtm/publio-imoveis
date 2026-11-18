/* ==========================================================
   Públio Imóveis — fichas de imóveis
   Os imóveis ficam salvos numa nuvem compartilhada (Supabase: banco + fotos),
   então TODOS os dispositivos veem a mesma lista.
   Se a nuvem não estiver configurada, cai para o armazenamento
   local do navegador (IndexedDB), sem quebrar nada.
   ========================================================== */

const DB_NOME = "corretora-db";
const DB_VERSAO = 1;
const STORE = "imoveis";
const STORE_META = "meta";

/* ---- Configuração da nuvem ----
   SUPABASE: preencha "url" e "chave" (Project URL e anon/publishable key).
   Enquanto estiverem vazios, o app funciona só neste aparelho (modo local).   */
const SUPABASE = {
  url: "https://mefhqkjrszvrjztqdlqe.supabase.co",   // Project URL do projeto publio-imoveis
  chave: "sb_publishable_Y_WmSLQXSke0v2O9P8swgw_9uS5tt_P",   // publishable key (pode ficar no site)
  tabela: "imoveis",
  bucket: "fotos",               // bucket público das fotos
  get ativa() { return !!(this.url && this.chave); }
};

const NUVEM = {
  get ativa() { return SUPABASE.ativa; },
  fotosFora: true   // fotos no Storage do Supabase; o banco guarda só os endereços
};

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

/* Lista de fotos de um imóvel, aceitando os registros antigos (só 1 imagem) */
function imagensDe(im) {
  if (!im) return [];
  if (Array.isArray(im.imagens) && im.imagens.length) return im.imagens.filter(Boolean);
  return im.imagem ? [im.imagem] : [];
}

/* ---------------- Supabase (REST) ---------------- */
function sbHeaders(extra = {}) {
  return Object.assign({
    "apikey": SUPABASE.chave,
    "Authorization": "Bearer " + SUPABASE.chave,
    "Content-Type": "application/json"
  }, extra);
}
function sbUrl(caminho) {
  return SUPABASE.url.replace(/\/$/, "") + "/rest/v1/" + caminho;
}
const CAMPOS_IMOVEL = "id,titulo,tipo,finalidade,preco,local,descricao,imagem,imagens,videos,criadoEm,atualizadoEm";

async function nuvemFetch(url, opcoes = {}, tentativas = 3) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, opcoes);
      if (r.ok) return r;
      ultimo = new Error("servidor respondeu " + r.status);
      if (r.status >= 400 && r.status < 500) break;
    } catch (e) {
      ultimo = new Error("falha de rede (" + (e.message || "conexão recusada") + ")");
    }
    await new Promise((ok) => setTimeout(ok, 400 * (i + 1)));
  }
  throw ultimo || new Error("falha desconhecida");
}

/* Lê todos os imóveis da nuvem */
async function nuvemLer() {
  if (!NUVEM.ativa) return null;
  const r = await nuvemFetch(sbUrl(`${SUPABASE.tabela}?select=${CAMPOS_IMOVEL}&limit=500`), { headers: sbHeaders(), cache: "no-store" });
  const linhas = await r.json();
  return (linhas || []).map((l) => ({
    id: String(l.id),
    titulo: l.titulo || "",
    tipo: l.tipo || "",
    finalidade: l.finalidade || "",
    preco: l.preco || "",
    local: l.local || "",
    descricao: l.descricao || "",
    imagem: l.imagem || "",
    imagens: Array.isArray(l.imagens) ? l.imagens : (l.imagem ? [l.imagem] : []),
    videos: Array.isArray(l.videos) ? l.videos.filter(Boolean) : [],
    criadoEm: Number(l.criadoEm) || Date.now(),
    atualizadoEm: Number(l.atualizadoEm) || Date.now()
  }));
}

/* Lê um imóvel só pelo id (para o cliente que abre a ficha sem ter a lista) */
async function nuvemLerUm(id) {
  if (!NUVEM.ativa) return null;
  const r = await nuvemFetch(
    sbUrl(`${SUPABASE.tabela}?select=${CAMPOS_IMOVEL}&id=eq.${encodeURIComponent(id)}&limit=1`),
    { headers: sbHeaders(), cache: "no-store" }
  );
  const linhas = await r.json();
  const l = (linhas || [])[0];
  if (!l) return null;
  return {
    id: String(l.id),
    titulo: l.titulo || "",
    tipo: l.tipo || "",
    finalidade: l.finalidade || "",
    preco: l.preco || "",
    local: l.local || "",
    descricao: l.descricao || "",
    imagem: l.imagem || "",
    imagens: Array.isArray(l.imagens) ? l.imagens : (l.imagem ? [l.imagem] : []),
    criadoEm: Number(l.criadoEm) || Date.now(),
    atualizadoEm: Number(l.atualizadoEm) || Date.now()
  };
}

/* Grava um imóvel (cria ou atualiza) */
async function nuvemSalvarUm(im) {
  if (!NUVEM.ativa) return false;
  const linha = {
    id: im.id,
    titulo: im.titulo || "",
    tipo: im.tipo || "",
    finalidade: im.finalidade || "",
    preco: im.preco || "",
    local: im.local || "",
    descricao: im.descricao || "",
    imagem: im.imagem || "",
    imagens: imagensDe(im),
    videos: Array.isArray(im.videos) ? im.videos.filter(Boolean) : [],
    criadoEm: im.criadoEm || Date.now(),
    atualizadoEm: im.atualizadoEm || Date.now()
  };
  await nuvemFetch(sbUrl(`${SUPABASE.tabela}?on_conflict=id`), {
    method: "POST",
    headers: sbHeaders({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(linha)
  });
  return true;
}

/* Apaga um imóvel */
async function nuvemApagarUm(id) {
  if (!NUVEM.ativa) return false;
  try {
    await nuvemFetch(sbUrl(`${SUPABASE.tabela}?id=eq.${encodeURIComponent(id)}`), { method: "DELETE", headers: sbHeaders({ "Prefer": "return=minimal" }) });
  } catch (_) { /* já não existia */ }
  return true;
}

/* Envia vários imóveis de uma vez */
async function nuvemEnviarLista(lista) {
  const falhas = [];
  for (const im of lista || []) {
    try { await nuvemSalvarUm(im); } catch (e) { falhas.push((im.titulo || im.id) + ": " + e.message); }
  }
  if (falhas.length) throw new Error(falhas[0]);
  return true;
}

/* ---------- Fotos no Storage do Supabase (bucket público "fotos") ----------
   As fotos vão para o bucket do próprio projeto e o banco guarda só o endereço
   público delas. Assim não há limite de 1 MB por imóvel e as fotos são do dono. */
function sbStorageUrl(caminho) {
  return SUPABASE.url.replace(/\/$/, "") + "/storage/v1/object/public/" + SUPABASE.bucket + "/" + caminho;
}

function dataUrlParaBlob(dataUrl) {
  const [cabeca, b64] = String(dataUrl).split(",");
  const tipo = (cabeca.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}

/* Envia a foto para o bucket e devolve o endereço público dela */
async function enviarFotoParaServidor(dataUrl) {
  const blob = dataUrlParaBlob(dataUrl);
  const nome = novoId() + ".jpg";
  const caminho = "imoveis/" + nome;
  const r = await fetch(SUPABASE.url.replace(/\/$/, "") + "/storage/v1/object/" + SUPABASE.bucket + "/" + caminho, {
    method: "POST",
    headers: {
      "apikey": SUPABASE.chave,
      "Authorization": "Bearer " + SUPABASE.chave,
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
      "cache-control": "public, max-age=31536000"
    },
    body: blob
  });
  if (!r.ok) {
    let detalhe = "";
    try { detalhe = (await r.json()).message || ""; } catch (_) { detalhe = ""; }
    throw new Error("o envio da foto falhou (" + r.status + (detalhe ? ": " + detalhe : "") + ")");
  }
  return sbStorageUrl(caminho);
}

/* Envia um vídeo (ou qualquer arquivo) para o Storage do Supabase */
async function enviarArquivoParaServidor(arquivo, pasta, extensao) {
  const caminho = pasta + "/" + novoId() + "." + extensao;
  const r = await fetch(SUPABASE.url.replace(/\/$/, "") + "/storage/v1/object/" + SUPABASE.bucket + "/" + caminho, {
    method: "POST",
    headers: {
      "apikey": SUPABASE.chave,
      "Authorization": "Bearer " + SUPABASE.chave,
      "Content-Type": arquivo.type || "application/octet-stream",
      "x-upsert": "true",
      "cache-control": "public, max-age=31536000"
    },
    body: arquivo
  });
  if (!r.ok) {
    let detalhe = "";
    try { detalhe = (await r.json()).message || ""; } catch (_) { detalhe = ""; }
    throw new Error("o envio falhou (" + r.status + (detalhe ? ": " + detalhe : "") + ")");
  }
  return sbStorageUrl(caminho);
}

/* Troca as fotos guardadas no aparelho por endereços na internet */
async function enviarFotosParaServidor(im) {
  if (!NUVEM.fotosFora) return im;
  const fotos = imagensDe(im);
  const novas = [];
  for (const foto of fotos) {
    if (/^https?:/.test(foto)) { novas.push(foto); continue; }
    novas.push(await enviarFotoParaServidor(foto));
  }
  return Object.assign({}, im, { imagem: novas[0] || "", imagens: novas });
}

/* Envia vários imóveis de uma vez */
async function nuvemEnviarLista(lista) {
  const falhas = [];
  for (const im of lista || []) {
    try { await nuvemSalvarUm(im); } catch (e) { falhas.push((im.titulo || im.id) + ": " + e.message); }
  }
  if (falhas.length) throw new Error(falhas[0]);
  return true;
}

/* ---------- Lixeira da nuvem ----------
   Quando alguém apaga um imóvel, o id dele fica registrado em
   imoveis_apagados. Assim a exclusão chega a TODOS os aparelhos,
   inclusive os que estavam desligados ou com a cópia local antiga. */
async function nuvemLerApagados() {
  if (!NUVEM.ativa) return [];
  try {
    const r = await nuvemFetch(sbUrl("imoveis_apagados?select=id&limit=1000"), { headers: sbHeaders(), cache: "no-store" });
    const linhas = await r.json();
    return (linhas || []).map((l) => String(l.id));
  } catch (e) {
    console.warn("Não consegui ler a lixeira:", e.message);
    return [];
  }
}

async function nuvemMarcarApagado(id) {
  if (!NUVEM.ativa) return false;
  try {
    await nuvemFetch(sbUrl("imoveis_apagados?on_conflict=id"), {
      method: "POST",
      headers: sbHeaders({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ id: String(id), apagadoEm: Date.now() })
    });
    return true;
  } catch (e) {
    console.warn("Não consegui registrar a exclusão:", e.message);
    return false;
  }
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
    const apagados = await nuvemLerApagados();
    const apagadosSet = new Set(apagados);
    // o que foi apagado na nuvem sai daqui também (vale para todos os aparelhos)
    const limparApagados = (lista) => (lista || []).filter((x) => !apagadosSet.has(x.id));
    const daNuvemViva = limparApagados(daNuvem);
    const locaisVivos = limparApagados(locais);
    const juntos = mesclar(daNuvemViva, locaisVivos);
    // se aqui existe algo que ainda não subiu, envia para a nuvem
    const idsNuvem = new Set(daNuvemViva.map((x) => x.id));
    const faltando = locaisVivos.filter((x) => !idsNuvem.has(x.id));
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

  const lista = listaParaEnviar || imoveis;
  let listaFinal = [];
  let erroEnvio = "";

  // 1) manda as fotos para o Storage do Supabase e grava o imóvel no banco
  try {
    for (const im of lista) listaFinal.push(await enviarFotosParaServidor(im));
    await nuvemEnviarLista(listaFinal);
  } catch (e) {
    erroEnvio = e.message;
    if (!listaFinal.length) listaFinal = lista;
  }

  // 2) confirma no banco, dando tempo para ele mostrar o que acabou de receber
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    try {
      const confirmados = (await nuvemLer()) || [];
      const ids = new Set(confirmados.map((x) => x.id));
      const faltando = listaFinal.filter((x) => !ids.has(x.id));
      if (!faltando.length) {
        // a cópia local passa a guardar os endereços das fotos (bem mais leve)
        for (const im of listaFinal) {
          const igual = imoveis.find((x) => x.id === im.id);
          if (igual) { igual.imagens = im.imagens.slice(); igual.imagem = im.imagem; }
        }
        await dbSubstituirTudo(imoveis);
        nuvemOk = true;
        ultimoErroNuvem = "";
        atualizarStatusNuvem();
        renderLista();
        return { nuvem: true };
      }
      erroEnvio = erroEnvio || "o banco ainda não confirmou o envio";
    } catch (e) {
      erroEnvio = e.message;
    }
    await new Promise((ok) => setTimeout(ok, 900 * (tentativa + 1)));
  }

  nuvemOk = false;
  ultimoErroNuvem = erroEnvio || "o banco não confirmou o envio";
  atualizarStatusNuvem();
  return { nuvem: false, erro: lastErroLegivel(ultimoErroNuvem) };
}

/* Traduz o erro para algo que a pessoa entenda e possa resolver */
function lastErroLegivel(msg) {
  const t = String(msg || "");
  if (/respondeu 400/.test(t)) return "as fotos ficaram grandes demais. Remova uma foto e salve de novo.";
  if (/respondeu 401/.test(t)) return "a chave do Supabase está errada. Confira \"url\" e \"chave\" no app.js.";
  if (/respondeu 403/.test(t) || /row-level security|RLS/i.test(t)) return "o Supabase está bloqueando este navegador. Rode o SUPABASE.sql de novo no SQL Editor.";
  if (/respondeu 404/.test(t)) return "o projeto ou a tabela do Supabase não foi encontrado. Confira \"url\" no app.js e se o SUPABASE.sql foi rodado.";
  if (/respondeu 5\d\d/.test(t)) return "o servidor do Supabase está instável. Tente de novo em alguns segundos.";
  if (/Bucket not found/i.test(t)) return "o bucket \"fotos\" não existe. Rode o SUPABASE.sql de novo no SQL Editor.";
  if (/rede|Failed to fetch|conexão/i.test(t)) return "sem conexão com a internet ou o acesso ao Supabase está bloqueado neste navegador.";
  return t || "não confirmou o envio";
}

function atualizarStatusNuvem() {
  const el = document.getElementById("statusNuvem");
  if (!el) return;
  if (!NUVEM.ativa) {
    el.textContent = "Modo local — só neste aparelho";
    el.className = "status-nuvem local";
    el.title = "Para todos os dispositivos verem os mesmos imóveis, ative a nuvem (veja MIGRAR-PARA-SUPABASE.md).";
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

/* Reduz a foto para um JPEG de boa qualidade (as fotos não ficam mais no banco) */
function comprimirImagem(file, maxLado = 1600, qualidade = 0.85, alvoBytes = 700000) {
  if (!NUVEM.fotosFora) { maxLado = 1200; qualidade = 0.78; alvoBytes = 100000; }
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

/* Tamanho aproximado de um imóvel em bytes (as fotos ficam no Storage) */
function tamanhoImovel(im) {
  const fotos = imagensDe(im);
  const bytesFotos = fotos.reduce((t, d) => t + Math.round((String(d).length - String(d).indexOf(",") - 1) * 0.75), 0);
  const texto = (im.titulo || "").length + (im.descricao || "").length + (im.local || "").length + 200;
  return bytesFotos + texto;
}
const LIMITE_IMOVEL = 1048000;   // texto do imóvel no banco (as fotos ficam no Storage)
const MAX_FOTOS = 300;           // fotos por imóvel (as fotos ficam no Storage)
const LIMITE_FOTO = 5000000;     // 5 MB por foto (limite do bucket)
const MAX_VIDEOS = 5;            // vídeos por imóvel
const LIMITE_VIDEO = 50 * 1024 * 1024;   // 50 MB por vídeo

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
  videosAtual = [];
  $("#form").reset();
  $("#btnSalvar").textContent = "Salvar imóvel";
  $("#f-imagem").value = "";
  renderMiniaturas();
  renderVideos();
  aviso($("#avisoForm"), "");
}

function preencherForm(im) {
  editandoId = im.id;
  imagemAtual = imagensDe(im).slice();
  videosAtual = (Array.isArray(im.videos) ? im.videos : []).map((u, i) => ({ arquivo: null, url: u, nome: "vídeo " + (i + 1), tipo: "" }));
  $("#f-titulo").value = im.titulo || "";
  $("#f-tipo").value = im.tipo || "Casa";
  $("#f-finalidade").value = im.finalidade || "Venda";
  $("#f-preco").value = im.preco || "";
  $("#f-local").value = im.local || "";
  $("#f-descricao").value = im.descricao || "";
  $("#f-imagem").value = "";
  renderMiniaturas();
  renderVideos();
  $("#btnSalvar").textContent = "Atualizar imóvel";
  window.scrollTo({ top: 0, behavior: "smooth" });
  $("#f-titulo").focus();
}

/* ---------------- Vídeos do imóvel ---------------- */
let videosAtual = [];      // [{ arquivo, url, nome, tipo }]

function renderVideos() {
  const box = document.getElementById("videosMiniaturas");
  if (box) {
    box.innerHTML = videosAtual.map((v, i) => `
      <div class="video-mini">
        <span class="video-icone">▶</span>
        <span class="video-nome">${escapar(v.nome || "vídeo")}</span>
        <button type="button" class="mini-x" data-video="${i}" title="Remover vídeo">×</button>
      </div>`).join("");
  }
  const cont = document.getElementById("videosInfo");
  if (cont) {
    cont.textContent = videosAtual.length
      ? `${videosAtual.length} de ${MAX_VIDEOS} vídeos`
      : "Nenhum vídeo escolhido";
  }
}

/* ---------------- Ler a descrição e tirar dali os dados do anúncio ----------------
   O corretor cola a descrição pronta (do jeito que ele já escreve no WhatsApp)
   e o sistema tira sozinho: preço, cidade/bairro, tipo, finalidade e um título. */
function numeroBR(t) {
  const limpo = String(t).replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return isFinite(n) ? n : 0;
}

function lerDescricao(texto) {
  const t = String(texto || "").replace(/\r/g, "");
  const linhas = t.split("\n").map((l) => l.trim()).filter(Boolean);
  const res = { preco: "", local: "", tipo: "", finalidade: "", titulo: "" };

  /* ---- preço ---- */
  const mPreco = t.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i);
  if (mPreco) {
    const n = numeroBR(mPreco[1]);
    if (n > 0) res.preco = n.toFixed(2).replace(".", ",");
  } else {
    const mNum = t.match(/(?:^|\s)(\d{1,3}(?:\.\d{3})+(?:,\d{2})?)(?:\s|$)/);
    if (mNum) {
      const n = numeroBR(mNum[1]);
      if (n >= 1000) res.preco = n.toFixed(2).replace(".", ",");
    }
  }

  /* ---- finalidade ---- */
  if (/para\s+(aluguel|alugar|locar|loca[çc][ãa]o)|\baluga-se\b|\balugo\b|\bloca[çc][ãa]o\b|\bmensalidade\b/i.test(t)) res.finalidade = "Aluguel";
  else if (/para\s+venda|\bvende-se\b|\ba venda\b|\bcomprar\b|\bvendo\b/i.test(t)) res.finalidade = "Venda";
  else if (/\baluguel\b|\baluga\b|\blocado\b/i.test(t)) res.finalidade = "Aluguel";
  else if (/\bvenda\b|\bvender\b/i.test(t)) res.finalidade = "Venda";

  /* ---- tipo ---- */
  const tipos = [
    [/\bapartamento\b|\bapto\b|\bflat\b|\bkitnet\b|\bstudio\b/i, "Apartamento"],
    [/\bs[íi]tio\b|\bch[áa]cara\b|\bfazenda\b|\brural\b/i, "Sítio / Chácara"],
    [/\bgalp[ãa]o\b|\barmaz[ée]m\b|\bbarrac[ãa]o\b/i, "Galpão / Armazém"],
    [/\bsala comercial\b|\bloja\b|\bponto comercial\b|\bescrit[óo]rio\b/i, "Sala comercial"],
    [/\bterreno\b|\blote\b|\b[áa]rea\b|\bch[áa]cara de terreno\b/i, "Terreno"],
    [/\bcasa\b|\bsobrado\b|\bch[áa]let\b/i, "Casa"]
  ];
  for (const [re, nome] of tipos) { if (re.test(t)) { res.tipo = nome; break; } }

  /* ---- cidade / bairro ----
     1) linha de endereço: "Rua X, Bairro — Cidade/UF", "Bairro, Cidade"
     2) senão, o lugar citado logo depois de "no/na/em/do/da" numa linha curta
     3) senão, a primeira linha de endereço que aparecer no meio do texto */
  const PISTAS = /\b(rua|avenida|av\.|bairro|centro|jardim|jardins|vila|parque|pra[çc]a|alameda|travessa|rodovia|estrada|km|zona)\b/i;
  const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO";
  const uf = new RegExp("\\b(" + UFS.split(" ").join("|") + ")\\b");

  function limpaLocal(l) {
    return l
      .replace(/^(localiza[çc][ãa]o|local|cidade|endere[çc]o|bairro)\s*[:\-–]\s*/i, "")
      .replace(/\s*[.,;]+$/, "")
      .trim();
  }

  /* sinais de que a linha NÃO é endereço: quartos, metros, valores, itens da casa */
  const NAO_ENDERECO = /\b\d+\s*(quartos?|su[íi]tes?|vagas?|banheiros?|m2|m²|metros?|hectares?|carros?)\b|\b\d+\s*x\s*\d+\b|\b(piscina|quintal|garagem|mobiliado|mobiliada|documenta[çc][ãa]o|aceita|financiamento|fgts|entrada|parcel)/i;

  function ehLinhaDeEndereco(l) {
    if (/R\$/i.test(l) || l.length > 110) return false;
    if (NAO_ENDERECO.test(l)) return false;
    return /[—–]|\s-\s|\/|,/.test(l);
  }

  /* Pontua cada pedaço de uma linha de endereço e escolhe os que são lugar */
  function pedacosDeLugar(l, manterRua) {
    const partes = l.split(/[—–]|\s-\s|\/|,/).map((x) => x.trim()).filter(Boolean);
    const lugares = [];
    for (const p of partes) {
      if (p.length < 3 || /^\d+$/.test(p)) continue;
      if (NAO_ENDERECO.test(p)) continue;
      if (!manterRua && /\b(rua|avenida|av\.|travessa|alameda|rodovia|estrada)\b/i.test(p) && /\d/.test(p)) continue; // rua com número: é endereço, não cidade
      lugares.push(p);
    }
    return lugares;
  }

  let local = "";
  // 1) a linha mais "de endereço": tem separador e cidade/bairro depois dele
  let melhor = 0;
  for (const l of linhas) {
    if (!ehLinhaDeEndereco(l)) continue;
    const lugares = pedacosDeLugar(l);
    if (!lugares.length) continue;
    let nota = 0;
    if (uf.test(l)) nota += 5;
    if (PISTAS.test(l)) nota += 3;
    if (lugares.length >= 2) nota += 2;
    // com UF na linha, o nome da rua é bem-vindo (é a localização completa)
    const finais = uf.test(l) ? pedacosDeLugar(l, true) : lugares;
    if (nota > melhor) { melhor = nota; local = finais.join(", "); }
  }
  // 2a) "no bairro X" / "bairro X" solto no texto
  if (!local) {
    const mBairro = t.match(/\bbairro\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'’ ]{2,40})/);
    if (mBairro) local = mBairro[1].replace(/\s+(com|de|do|da|que|e)\s.*$/i, "").trim();
  }
  // 2b) lugar depois de "no/na/em/do/da" numa linha curta (o título costuma ser assim)
  if (!local) {
    const lugares = "centro|jardim|jardins|vila|parque|bairro|praia|pra[çc]a|alameda|zona rural|renascen[çc]a|calhau|olho d.água|cohatrac|turu|ara[çc]agi|forquilha|f[ée] em deus|cidade oper[áa]ria|s[ãa]o lu[íi]s|imperatriz|ros[áa]rio|pa[çc]o do lumiar|rap[óo]sa";
    const re = new RegExp("\\b(?:no|na|em|do|da|nos|nas)\\s+(?:bairro\\s+(?:de\\s+|do\\s+|da\\s+)?)?((?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\\wÀ-ÿ'’]*|" + lugares + ")(?:\\s+(?:de|do|da|dos|das)?\\s*(?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\\wÀ-ÿ'’]*|" + lugares + ")){0,3})", "i");
    for (const l of linhas) {
      if (/R\$/i.test(l) || l.length > 110) continue;
      if (NAO_ENDERECO.test(l)) continue;
      const m = l.match(re);
      if (m) { local = m[1].trim(); break; }
    }
  }
  // 3) qualquer linha que fale de endereço
  if (!local) {
    for (const l of linhas) {
      if (!PISTAS.test(l) || l.length > 110 || /R\$/i.test(l) || NAO_ENDERECO.test(l)) continue;
      const lugares = pedacosDeLugar(l);
      local = lugares.length ? lugares.join(", ") : l;
      break;
    }
  }
  res.local = limpaLocal(local);

  /* ---- título ---- */
  const TITULO_OK = (l) => l.length >= 8 && l.length <= 90 && !/R\$\s*\d/i.test(l) &&
    !/^[-–•*]/.test(l) && !/[—–]/.test(l) &&
    !/\b(Rua|Avenida|Av\.|Travessa|Alameda|Rodovia|Estrada)\b/i.test(l) &&
    !/\/\s*[A-Z]{2}\s*$/.test(l) &&
    !/^\d+\s*x\s*\d+/i.test(l) &&
    !/\b(\d+\s*(quartos?|su[íi]tes?|vagas?|banheiros?|m2|m²|metros?|hectares?)\s*(,|e\s+\d|$))/i.test(l) &&
    !/^(documenta[çc][ãa]o|aceita|financia|obs|aten[çc][ãa]o)/i.test(l);
  const primeira = linhas.find(TITULO_OK);
  // se a primeira linha "de anúncio" for só um item (ex.: "Quintal e garagem"), prefere a
  // primeira linha que fale de imóvel (casa, apartamento, terreno...) e caiba no título
  const falaDeImovel = /\b(casa|casas|apartamento|apto|sobrado|terreno|lote|s[íi]tio|ch[áa]cara|galp[ãa]o|sala|loja|kitnet|flat|studio|im[óo]vel|ch[áa]let|edif[íi]cio)\b/i;
  const comImovel = linhas.find((l) => TITULO_OK(l) && falaDeImovel.test(l));
  const escolhida = comImovel || primeira;
  if (escolhida) {
    res.titulo = escolhida.replace(/[.!]+$/, "").trim();
  } else {
    const partes = [res.tipo, res.finalidade ? "para " + res.finalidade.toLowerCase() : ""].filter(Boolean);
    res.titulo = partes.length ? partes.join(" ") : "Imóvel";
  }
  if (res.titulo.length > 80) res.titulo = res.titulo.slice(0, 80).replace(/\s+\S*$/, "") + "…";

  return res;
}

/* Preenche os campos escondidos a partir da descrição */
function aplicarDescricao() {
  const texto = $("#f-descricao").value;
  const d = lerDescricao(texto);
  const info = document.getElementById("dadosLidos");
  if (!d.preco && !d.local && !d.tipo) {
    if (info) info.textContent = "Ainda não achei preço nem cidade na descrição.";
    return d;
  }
  const pedacos = [];
  if (d.preco) pedacos.push("preço " + fmtPreco(d.preco));
  if (d.local) pedacos.push("local " + d.local);
  if (d.tipo) pedacos.push(d.tipo);
  if (d.finalidade) pedacos.push(d.finalidade);
  if (info) info.textContent = "Li da descrição: " + pedacos.join(" • ");
  return d;
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
    cont.textContent = imagemAtual.length
      ? `${imagemAtual.length} de ${MAX_FOTOS} fotos — a primeira é a capa`
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
  const perms = await minhasPermissoes();
  if (!perms.publicar) {
    aviso($("#avisoForm"), "Este aparelho não tem permissão para publicar imóveis. Peça ao corretor para liberar em Área do corretor.", true);
    return;
  }
  const descricao = $("#f-descricao").value.trim();
  if (!descricao) {
    aviso($("#avisoForm"), "Cole a descrição do imóvel — o resto o sistema tira dali.", true);
    return;
  }
  if (!imagemAtual.length && !editandoId) {
    aviso($("#avisoForm"), "Escolha pelo menos uma foto da casa.", true);
    return;
  }

  // preço, cidade/bairro, tipo, finalidade e título saem da descrição
  const lido = lerDescricao(descricao);
  const escolhido = (id) => {
    const el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  };
  const titulo = escolhido("f-titulo") || lido.titulo || "Imóvel";
  const tipo = escolhido("f-tipo") || lido.tipo || "Casa";
  const finalidade = escolhido("f-finalidade") || lido.finalidade || "Venda";
  const preco = escolhido("f-preco") || lido.preco || "";
  const local = escolhido("f-local") || lido.local || "";

  const anterior = editandoId ? imoveis.find((x) => x.id === editandoId) : null;

  // vídeos escolhidos vão para o Storage (os que já têm endereço ficam como estão)
  const videosUrls = [];
  for (let i = 0; i < videosAtual.length; i++) {
    const v = videosAtual[i];
    if (v.url) { videosUrls.push(v.url); continue; }
    if (!v.arquivo) continue;
    aviso($("#avisoForm"), `Enviando vídeo ${i + 1} de ${videosAtual.length}...`);
    try {
      const ext = (v.nome.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
      videosUrls.push(await enviarArquivoParaServidor(v.arquivo, "videos", ext));
      v.url = videosUrls[videosUrls.length - 1];
    } catch (e) {
      aviso($("#avisoForm"), "O vídeo não subiu: " + e.message, true);
    }
  }

  const im = {
    id: editandoId || novoId(),
    titulo,
    tipo,
    finalidade,
    preco,
    local,
    descricao,
    imagem: imagemAtual[0] || "",
    imagens: imagemAtual.slice(),
    videos: videosUrls,
    criadoEm: anterior ? (anterior.criadoEm || Date.now()) : Date.now(),
    atualizadoEm: Date.now()
  };

  // atualiza a lista em memória
  const idx = imoveis.findIndex((x) => x.id === im.id);
  if (idx >= 0) imoveis[idx] = im; else imoveis.push(im);

  if (imagemAtual.length > MAX_FOTOS) {
    aviso($("#avisoForm"), `Máximo de ${MAX_FOTOS} fotos por imóvel.`, true);
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
    // no modo ADM a exclusão vale para todos os aparelhos (sempre liberada)
    const perms = ehAdmin() ? { apagar: true } : await minhasPermissoes();
    if (!perms.apagar) {
      aviso($("#avisoForm"), "Este aparelho não tem permissão para apagar imóveis. Peça ao corretor para liberar em Área do corretor.", true);
      return;
    }
    const msg = ehAdmin()
      ? `Excluir "${im.titulo}"?\n\nModo ADM: o imóvel será apagado de TODOS os aparelhos.`
      : `Excluir "${im.titulo}"? A exclusão vale para todos os dispositivos.`;
    if (confirm(msg)) {
      imoveis = imoveis.filter((x) => x.id !== id);
      await dbApagar(id);
      if (NUVEM.ativa) {
        await nuvemMarcarApagado(id);          // avisa todos os aparelhos
        try { await nuvemApagarUm(id); } catch (_) {}
      }
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
    // foto com problema: pula para a próxima que abrir (evita ficha em branco)
    const box = $("#ficha");
    const total = (box._fotos || []).length;
    const atual = box._fotoAtiva || 0;
    if (total > 1) {
      for (let passo = 1; passo < total; passo++) {
        const prox = (atual + passo) % total;
        const teste = new Image();
        teste.onload = () => { box._fotoAtiva = prox; pintarFoto((box._fotos || [])[prox], direcao); };
        teste.src = (box._fotos || [])[prox];
      }
    }
    alvo.alt = "Foto não carregou";
    alvo.classList.add("visivel");
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
    if (fotos.length > 1) {
      mini.innerHTML = fotos.map((src, i) =>
        "<button type=\"button\" class=\"thumb" + (i === 0 ? " ativa" : "") + "\" data-foto=\"" + i + "\">" +
        "<img src=\"" + src + "\" alt=\"Foto " + (i + 1) + "\" loading=\"lazy\" " +
        "onerror=\"this.style.opacity=0.25;this.parentNode.title='Foto não carregou'\" /></button>").join("");
      mini.hidden = false;
    } else {
      mini.innerHTML = "";
      mini.hidden = true;
    }
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
      // cliente que abriu o link direto: busca só este imóvel no Supabase
      try { im = await nuvemLerUm(id); } catch (_) { im = null; }
    }
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

/* O botão da Área do desenvolvedor precisa funcionar mesmo que o início ainda esteja carregando */
function ligarBotaoDesenvolvedor() {
  const b = document.getElementById("btnDesenvolvedor");
  if (!b || b._ligado) return;
  b._ligado = true;
  b.addEventListener("click", () => {
    try { abrirAdmin("desenvolvedor"); }
    catch (e) { alert("Não consegui abrir a Área do desenvolvedor: " + e.message); }
  });
}

/* ---------------- Início ---------------- */
async function iniciar() {
  ligarBotaoDesenvolvedor();

  try {
    db = await abrirDB();
  } catch (e) {
    alert("Este navegador não permitiu o armazenamento local: " + e.message);
    return;
  }

  // Limpeza única: apaga o acervo antigo (Firebase/Catbox) guardado neste aparelho.
  if (localStorage.getItem("limpeza-acervo-antigo") !== "1") {
    try {
      await dbSubstituirTudo([]);
      imoveis = [];
      localStorage.setItem("limpeza-acervo-antigo", "1");
    } catch (_) { /* se falhar, tenta na próxima abertura */ }
  }
  await carregarLista();

  try { await iniciarAcesso(); } catch (e) { console.warn("Acesso:", e.message); }
  try { await aplicarModoCliente(); } catch (e) { console.warn("Modo cliente:", e.message); }
  ligarAdmin();
  try { await mostrarPedidoSePreciso(); } catch (e) { console.warn("Pedido:", e.message); }

  $("#form").addEventListener("submit", salvarForm);
  $("#btnLimpar").addEventListener("click", limparForm);

  // enquanto digita/cola a descrição, mostra o que já foi lido dela
  const campoDesc = $("#f-descricao");
  if (campoDesc) {
    let t = null;
    const aoDigitar = () => {
      clearTimeout(t);
      t = setTimeout(aplicarDescricao, 400);
    };
    campoDesc.addEventListener("input", aoDigitar);
    campoDesc.addEventListener("paste", () => setTimeout(aplicarDescricao, 60));
  }
  $("#btnNovo").addEventListener("click", () => {
    limparForm();
    if (location.hash) location.hash = "";
    $("#f-titulo").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  $("#f-imagem").addEventListener("change", async (ev) => {
    const todos = Array.from(ev.target.files || []);
    const arquivos = todos.filter((f) => f.type.startsWith("image/"));
    const videos = todos.filter((f) => f.type.startsWith("video/"));
    ev.target.value = "";
    if (!arquivos.length && !videos.length) return;

    if (arquivos.length) {
      aviso($("#avisoForm"), `Preparando ${arquivos.length} foto(s)... pode levar um pouco com muitas fotos.`);
      const novas = [];
      let feitas = 0;
      for (const file of arquivos) {
        try {
          novas.push(await comprimirImagem(file));
        } catch (e) {
          aviso($("#avisoForm"), e.message, true);
        }
        feitas++;
        if (arquivos.length > 20 && feitas % 5 === 0) {
          aviso($("#avisoForm"), `Preparando fotos... ${feitas} de ${arquivos.length}`);
          await new Promise((ok) => setTimeout(ok, 0));   // deixa a tela respirar
        }
      }
      imagemAtual = imagemAtual.concat(novas).slice(0, MAX_FOTOS);
      renderMiniaturas();
    }

    if (videos.length) {
      for (const v of videos) {
        if (videosAtual.length >= MAX_VIDEOS) {
          aviso($("#avisoForm"), `Máximo de ${MAX_VIDEOS} vídeos por imóvel.`, true);
          break;
        }
        if (v.size > LIMITE_VIDEO) {
          aviso($("#avisoForm"), `O vídeo "${v.name}" passa de 50 MB. Grave um mais curto ou reduza a qualidade.`, true);
          continue;
        }
        videosAtual.push({ arquivo: v, url: "", nome: v.name, tipo: v.type });
      }
      renderVideos();
    }

    if (arquivos.length && imagemAtual.length >= MAX_FOTOS) {
      aviso($("#avisoForm"), `Limite de ${MAX_FOTOS} fotos por imóvel atingido.`);
    } else if (arquivos.length) {
      aviso($("#avisoForm"), `${arquivos.length} foto(s) pronta(s). Total: ${imagemAtual.length} de ${MAX_FOTOS}.`);
    }
  });

  const boxVideos = document.getElementById("videosMiniaturas");
  if (boxVideos) boxVideos.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-video]");
    if (!b) return;
    ev.preventDefault();
    videosAtual.splice(Number(b.dataset.video), 1);
    renderVideos();
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
  try { await aplicarModoCliente(); } catch (e) { console.warn("Modo cliente:", e.message); }
  try { await rotear(); } catch (e) { console.error(e); }

  // mantém a lista atualizada entre os aparelhos
  if (NUVEM.ativa) {
    setInterval(() => {
      if (document.hidden) return;
      if (location.hash.startsWith("#ficha/") || location.hash.startsWith("#ver/")) return;
      sincronizar().then(() => aplicarModoCliente()).catch(() => {});
    }, 30000);

    // ao voltar para a aba, busca novidades na hora
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !location.hash) sincronizar();
    });
  }
}

/* ==========================================================
   MODO CLIENTE — aparelho que não é Funcionário nem ADM
   ----------------------------------------------------------
   Todo aparelho novo entra assim: vê as casas e mais nada.
   Não aparece cadastro, excluir, Área do corretor nem
   Área do desenvolvedor. Só o dono, no Modo Desenvolvedor,
   muda a função do aparelho para Funcionário ou ADM.
   ========================================================== */
let modoCliente = null;    // null = ainda não sei; true = cliente; false = funcionário/ADM

async function aplicarModoCliente() {
  const perms = await minhasPermissoes();
  const cliente = !sessao && !perms.publicar && !perms.apagar;
  if (modoCliente === cliente) return cliente;
  modoCliente = cliente;
  document.body.classList.toggle("modo-cliente", cliente);
  document.body.classList.toggle("modo-equipe", !cliente);

  // botões que só a equipe vê
  const soEquipe = ["btnNovo", "btnAdmin", "btnDesenvolvedor", "btnAtualizar"];
  for (const id of soEquipe) {
    const b = document.getElementById(id);
    if (b) b.hidden = cliente;
  }
  // na área do cliente o link vira o "voltar" para o site das casas
  const bCliente = document.getElementById("btnAreaCliente");
  if (bCliente) {
    bCliente.textContent = cliente ? "← Voltar ao site" : "👁️ Públio Cliente";
    bCliente.href = cliente ? "publio-cliente.html" : "publio-cliente.html";
  }
  return cliente;
}

/* A tela nunca fica em branco: se algo demorar, mostra o que já existe no aparelho */
function mostrarTela(destino) {
  const painel = document.getElementById("painel");
  const ficha = document.getElementById("ficha");
  const admin = document.getElementById("admin");
  if (!painel || !ficha) return;
  if (modoCliente && destino === "admin") destino = "painel";
  if (admin) admin.hidden = destino !== "admin";
  const pedido = document.getElementById("caixaPedido");
  if (pedido && destino !== "painel") pedido.hidden = true;
  if (destino === "ficha") { painel.hidden = true; ficha.hidden = false; }
  else if (destino === "admin") { painel.hidden = true; ficha.hidden = true; }
  else { ficha.hidden = true; painel.hidden = false; }
}

/* ==========================================================
   ÁREA DO CORRETOR — login e permissões por aparelho
   ----------------------------------------------------------
   Quem entra com usuário e senha pode marcar, aparelho por
   aparelho, o que pode ser feito: ver, publicar (cadastrar e
   enviar imóvel) e apagar imóveis de todos os dispositivos.
   O bloqueio vale no próprio aparelho (é um site sem servidor).
   ========================================================== */
const CHAVE_ACESSO = "publio-acesso-v1";      // usuário, senha (hash) e sessão
const CHAVE_DISPOSITIVOS = "publio-dispositivos-v1";
const CHAVE_PEDIDOS = "publio-pedidos-acesso-v1";
const ACESSO_PADRAO = { usuario: "admin", senhaHash: "", desde: 0 };
const SENHA_PADRAO = "publio2026";

// Credencial do dono — entra sempre como Desenvolvedor, em qualquer aparelho
const DONO_USUARIO = "Pablo";
const DONO_SENHA = "7733";
/* Todo aparelho novo entra como CLIENTE: só vê as casas, sem liberar nada.
   Para virar Funcionário ou ADM, o dono precisa mudar no Modo Desenvolvedor. */
const PERMISSOES_PADRAO = { ver: true, publicar: false, apagar: false };
const CARGOS = {
  adm:       { nome: "ADM",        desc: "manda em tudo",                  ver: true, publicar: true, apagar: true },
  funcionario: { nome: "Funcionário", desc: "só cadastra, não apaga",        ver: true, publicar: true, apagar: false },
  leitor:    { nome: "Cliente",    desc: "só vê as casas, não mexe em nada", ver: true, publicar: false, apagar: false }
};
const CODIGO_VALIDADE = 15 * 60 * 1000;   // o código do aparelho novo vale 15 min

let usuarios = [];              // [{ usuario, senhaHash, cargo, desde }]
let acesso = null;              // quem está logado agora
let sessao = false;             // entrou nesta sessão do navegador?
let aparelhoId = "";
let aparelhoNome = "";
let tentativasLogin = 0;
let bloqueadoAte = 0;
let dispositivosCache = [];

function lerJSON(chave, padrao) {
  try { const t = localStorage.getItem(chave); return t ? JSON.parse(t) : padrao; }
  catch (_) { return padrao; }
}
function gravarJSON(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); return true; }
  catch (_) { return false; }
}

async function sha256(texto) {
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // reserva: navegador antigo sem crypto.subtle (não é criptografia forte)
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = (h1 ^ c) * 16777619 >>> 0;
    h2 = (h2 + c * (i + 7)) >>> 0;
  }
  return "fb" + h1.toString(16) + h2.toString(16);
}

/* Cria os usuários na primeira vez, migra o formato antigo (1 usuário) e recupera o aparelho */
async function iniciarAcesso() {
  const salvo = lerJSON(CHAVE_ACESSO, null);
  if (Array.isArray(salvo) && salvo.length) {
    usuarios = salvo;
  } else if (salvo && salvo.usuario) {
    // formato antigo: um único usuário -> vira o primeiro ADM da lista
    usuarios = [{
      usuario: salvo.usuario,
      senhaHash: salvo.senhaHash,
      cargo: "adm",
      desde: salvo.desde || Date.now()
    }];
    gravarJSON(CHAVE_ACESSO, usuarios);
  } else {
    usuarios = [{
      usuario: ACESSO_PADRAO.usuario,
      senhaHash: await sha256(SENHA_PADRAO),
      cargo: "adm",
      desde: Date.now()
    }];
    gravarJSON(CHAVE_ACESSO, usuarios);
  }
  // o dono existe sempre, como Desenvolvedor, em qualquer aparelho
  const hashDono = await sha256(DONO_SENHA);
  const dono = usuarios.find((x) => String(x.usuario).toLowerCase() === DONO_USUARIO.toLowerCase());
  if (!dono) {
    usuarios.unshift({ usuario: DONO_USUARIO, senhaHash: hashDono, cargo: "desenvolvedor", desde: Date.now() });
    gravarJSON(CHAVE_ACESSO, usuarios);
  } else if (dono.cargo !== "desenvolvedor" || dono.senhaHash !== hashDono) {
    dono.cargo = "desenvolvedor";
    dono.senhaHash = hashDono;
    gravarJSON(CHAVE_ACESSO, usuarios);
  }

  sessao = lerJSON(CHAVE_ACESSO + "-sessao", false) === true;

  const disp = lerJSON(CHAVE_DISPOSITIVOS, null);
  aparelhoId = (disp && disp.aparelhoId) || novoId();
  aparelhoNome = (disp && disp.aparelhoNome) || detectarNomeAparelho();
  gravarJSON(CHAVE_DISPOSITIVOS, { aparelhoId, aparelhoNome });
  await registrarAparelho();
}

function detectarNomeAparelho() {
  const ua = navigator.userAgent || "";
  let tipo = "Computador";
  if (/iPad|Tablet/i.test(ua)) tipo = "Tablet";
  else if (/Mobi|Android|iPhone/i.test(ua)) tipo = "Celular";
  let sis = "";
  if (/Windows/i.test(ua)) sis = "Windows";
  else if (/Android/i.test(ua)) sis = "Android";
  else if (/iPhone|iPad|iOS/i.test(ua)) sis = "iPhone/iPad";
  else if (/Mac OS X/i.test(ua)) sis = "Mac";
  else if (/Linux/i.test(ua)) sis = "Linux";
  return sis ? `${tipo} ${sis}` : tipo;
}

/* Lê a lista de aparelhos da nuvem (tabela config_dispositivos) */
async function lerDispositivos() {
  if (!NUVEM.ativa) return [];
  try {
    const r = await nuvemFetch(
      sbUrl("config_dispositivos?select=id,nome,liberado,ver,publicar,apagar,vistoEm&order=vistoEm.desc&limit=200"),
      { headers: sbHeaders(), cache: "no-store" }
    );
    const linhas = await r.json();
    return (linhas || []).map((l) => ({
      id: String(l.id),
      nome: l.nome || "Aparelho",
      liberado: l.liberado === true,
      ver: l.ver !== false,
      publicar: l.publicar !== false,
      apagar: l.apagar === true,
      vistoEm: Number(l.vistoEm) || 0
    }));
  } catch (e) {
    console.warn("Não consegui ler os aparelhos:", e.message);
    return null;
  }
}

async function gravarDispositivo(d) {
  if (!NUVEM.ativa) return false;
  const linha = { id: d.id, nome: d.nome, liberado: !!d.liberado, ver: !!d.ver, publicar: !!d.publicar, apagar: !!d.apagar, vistoEm: d.vistoEm || Date.now() };
  await nuvemFetch(sbUrl("config_dispositivos?on_conflict=id"), {
    method: "POST",
    headers: sbHeaders({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(linha)
  });
  return true;
}

/* Registra este aparelho na nuvem (cria na primeira vez, atualiza a data depois) */
async function registrarAparelho() {
  if (!NUVEM.ativa) return;
  const lista = await lerDispositivos();
  if (!lista) return;
  const meu = lista.find((d) => d.id === aparelhoId);
  try {
    if (meu) {
      meu.vistoEm = Date.now();
      // aparelho que estava "aguardando liberação" vira cliente: entra sem pedir permissão
      if (!meu.liberado) { meu.liberado = true; meu.publicar = false; meu.apagar = false; }
      await gravarDispositivo(meu);
    } else {
      // já entra liberado, como cliente (só vê) — não precisa de aprovação de ninguém
      await gravarDispositivo(Object.assign({ id: aparelhoId, nome: aparelhoNome, vistoEm: Date.now(), liberado: true }, PERMISSOES_PADRAO));
    }
  } catch (e) {
    console.warn("Não consegui registrar o aparelho:", e.message);
  }
}

/* Permissões do aparelho atual (quando a nuvem não responde, usa o padrão) */
async function minhasPermissoes() {
  if (sessao) return { ver: true, publicar: true, apagar: true };   // o dono logado manda
  const lista = await lerDispositivos();
  const meu = (lista || dispositivosCache || []).find((d) => d.id === aparelhoId);
  if (!meu) return Object.assign({}, PERMISSOES_PADRAO);
  if (!meu.liberado) {
    // nunca mais fica travado: sem liberação o aparelho é cliente (só vê)
    return { ver: true, publicar: false, apagar: false, cliente: true };
  }
  return { ver: meu.ver, publicar: meu.publicar, apagar: meu.apagar };
}

/* Diz qual é o cargo do aparelho, para mostrar na tela */
function cargoDe(d) {
  if (d.apagar && d.publicar) return { nome: "ADM", classe: "adm" };
  if (d.publicar) return { nome: "Funcionário", classe: "func" };
  return { nome: "Cliente", classe: "cliente" };   // padrão de todo aparelho novo: só vê
}

function ehAdmin() { return sessao === true; }

async function abrirAdmin(modo) {
  mostrarTela("admin");
  const login = document.getElementById("adminLogin");
  const painel = document.getElementById("adminPainel");
  if (!login || !painel) return;
  login.hidden = sessao;
  painel.hidden = !sessao;
  if (!sessao) {
    const u = document.getElementById("loginUsuario");
    if (u) {
      u.value = modo === "desenvolvedor" ? DONO_USUARIO : (usuarios.length === 1 ? usuarios[0].usuario : "");
      setTimeout(() => document.getElementById("loginSenha").focus(), 60);
    }
    const t = document.getElementById("loginTitulo");
    if (t) t.textContent = modo === "desenvolvedor" ? "Área do desenvolvedor" : "Área do corretor";
    const sub = document.getElementById("loginSub");
    if (sub) sub.textContent = modo === "desenvolvedor"
      ? "Entre com o usuário e a senha do dono."
      : "Entre com seu usuário e senha.";
    aviso(document.getElementById("loginAviso"), "");
  } else {
    aplicarTelaPorCargo();
    await carregarPainelAdmin();
  }
}

/* Cada cargo vê uma Área do corretor diferente */
function aplicarTelaPorCargo() {
  const cargo = (acesso && acesso.cargo) || "adm";
  const ehAdm = cargo === "adm" || cargo === "desenvolvedor";   // dev manda em tudo igual ao ADM
  const podeUsuarios = podeGerenciarUsuarios();

  const quem = document.getElementById("quemEntrou");
  if (quem) quem.textContent = acesso ? acesso.usuario : "—";
  const selo = document.getElementById("seloMeuCargo");
  if (selo) {
    selo.textContent = nomeDoCargoUsuario(cargo);
    selo.className = "selo-cargo " + (ehAdm ? "adm" : cargo === "desenvolvedor" ? "dev" : "func");
  }

  // cartões que só o ADM vê
  const cartoesAdm = document.getElementById("cartoesAdm");
  if (cartoesAdm) cartoesAdm.hidden = !ehAdm;

  // títulos mudam conforme o cargo
  const tAp = document.querySelector("#adminPainel .cartao .cartao-cabecalho h2");
  const rotulo = cargo === "desenvolvedor" ? "modo Desenvolvedor" : "modo ADM";
  if (tAp) tAp.textContent = ehAdm ? `Aparelhos autorizados (${rotulo})` : "Aparelhos autorizados";
  const tituloCartaoAdm = document.getElementById("tituloCartaoAdm");
  if (tituloCartaoAdm) tituloCartaoAdm.textContent = cargo === "desenvolvedor" ? "Modo Desenvolvedor" : "Modo ADM";
  const textoCartaoAdm = document.getElementById("textoCartaoAdm");
  if (textoCartaoAdm && cargo === "desenvolvedor") {
    textoCartaoAdm.innerHTML = "Você tem acesso total: pode apagar imóveis de <b>todos os aparelhos</b>, criar usuários " +
      "e <b>mudar a função de qualquer aparelho</b> — Cliente, Funcionário ou ADM. Use com cuidado: a exclusão não volta.";
  }
  const cartaoUsuarios = document.getElementById("cartaoUsuarios");
  if (cartaoUsuarios) cartaoUsuarios.hidden = !podeUsuarios;

  const bNovo = document.getElementById("btnNovoUsuario");
  if (bNovo) bNovo.hidden = !podeUsuarios;

  atualizarResumoAdm();
}

function atualizarResumoAdm() {
  const r1 = document.getElementById("resumoImoveis");
  if (r1) r1.textContent = String(imoveis.length);
  const r2 = document.getElementById("resumoAparelhos");
  if (r2) r2.textContent = String((dispositivosCache || []).length);
  const r3 = document.getElementById("resumoPendentes");
  if (r3) r3.textContent = String((dispositivosCache || []).filter((d) => !d.liberado).length);
  const r4 = document.getElementById("resumoUsuarios");
  if (r4) r4.textContent = String(usuarios.length);
}

async function tentarEntrar() {
  const avisoEl = document.getElementById("loginAviso");
  const agora = Date.now();
  if (agora < bloqueadoAte) {
    aviso(avisoEl, `Muitas tentativas. Tente de novo em ${Math.ceil((bloqueadoAte - agora) / 1000)}s.`, true);
    return;
  }
  const usuario = (document.getElementById("loginUsuario").value || "").trim();
  const senha = document.getElementById("loginSenha").value || "";
  if (!usuario || !senha) { aviso(avisoEl, "Preencha usuário e senha.", true); return; }
  const hash = await sha256(senha);
  const achou = usuarios.find((x) => String(x.usuario).toLowerCase() === usuario.toLowerCase() && x.senhaHash === hash);
  if (achou) {
    acesso = achou;
    sessao = true;
    tentativasLogin = 0;
    gravarJSON(CHAVE_ACESSO + "-sessao", true);
    document.getElementById("loginSenha").value = "";
    aviso(avisoEl, "");
    await abrirAdmin();
    await sincronizar();
    await aplicarModoCliente();
    renderLista();
  } else {
    tentativasLogin++;
    if (tentativasLogin >= 5) { bloqueadoAte = Date.now() + 60000; tentativasLogin = 0; }
    aviso(avisoEl, "Usuário ou senha incorretos.", true);
  }
}

function sairAdmin() {
  sessao = false;
  acesso = null;
  gravarJSON(CHAVE_ACESSO + "-sessao", false);
  mostrarTela("painel");
  aplicarModoCliente();
  renderLista();
}

async function carregarPainelAdmin() {
  const avisoEl = document.getElementById("dispAviso");
  const corpo = document.getElementById("listaDispositivos");
  if (!corpo) return;
  const lista = await lerDispositivos();
  if (lista === null) {
    aviso(avisoEl, "Não consegui falar com a nuvem. Confira a internet e a configuração do Supabase.", true);
    return;
  }
  dispositivosCache = lista;
  aviso(avisoEl, "");
  corpo.innerHTML = lista.map((d) => {
    const cargo = cargoDe(d);
    const opcoes = Object.keys(CARGOS).map((k) =>
      `<option value="${k}" ${cargo.classe === (k === "funcionario" ? "func" : k === "leitor" ? "cliente" : "adm") ? "selected" : ""}>${CARGOS[k].nome}</option>`
    ).join("");
    const podeCargo = podeMudarCargo();
    const aprovacao = "";   // todo aparelho já entra como cliente: não existe mais aprovar
    return `
    <tr data-id="${d.id}" class="${d.id === aparelhoId ? "eu" : ""} ${d.liberado ? "" : "pendente"}">
      <td><span class="disp-nome">${escapar(d.nome)}</span>${d.id === aparelhoId ? '<span class="sel-eu">este aparelho</span>' : ''}<span class="disp-id">${d.id.slice(0, 8)}</span></td>
      <td class="disp-data">${d.vistoEm ? quandoFoi(d.vistoEm) : "—"}</td>
      <td>
        ${podeCargo
          ? `<select class="sel-cargo" data-acao="cargo">${opcoes}</select>`
          : `<span class="selo-cargo ${cargo.classe}">${cargo.nome}</span>`}
      </td>
      <td class="acoes-aparelho">
        ${aprovacao}
        <button type="button" class="btn btn-perigo btn-mini" data-acao="remover-aparelho">Remover</button>
      </td>
    </tr>`;
  }).join("");
  document.getElementById("dispVazio").hidden = lista.length > 0;
  renderUsuarios();
  const bNovo = document.getElementById("btnNovoUsuario");
  if (bNovo) bNovo.hidden = !podeGerenciarUsuarios();
  const boxAdd = document.getElementById("boxAdicionarAparelho");
  if (boxAdd) boxAdd.hidden = !podeMudarCargo();
  atualizarResumoAdm();
}

function escapar(t) {
  return String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function quandoFoi(ts) {
  const dif = Date.now() - ts;
  if (dif < 60000) return "agora";
  if (dif < 3600000) return Math.round(dif / 60000) + " min atrás";
  if (dif < 86400000) return Math.round(dif / 3600000) + " h atrás";
  return new Date(ts).toLocaleDateString("pt-BR");
}

/* Muda o cargo do aparelho: ADM, Funcionário ou Só ver */
/* Só o Desenvolvedor muda a função de um aparelho */
function podeMudarCargo() {
  return !!(acesso && acesso.cargo === "desenvolvedor");
}

async function aplicarCargo(id, cargo) {
  if (!podeMudarCargo()) {
    aviso(document.getElementById("dispAviso"), "Só o Desenvolvedor pode mudar a função dos aparelhos.", true);
    await carregarPainelAdmin();
    return;
  }
  const lista = dispositivosCache || [];
  const d = lista.find((x) => x.id === id);
  const def = CARGOS[cargo];
  if (!d || !def) return;
  d.liberado = true;
  d.ver = def.ver;
  d.publicar = def.publicar;
  d.apagar = def.apagar;
  try {
    await gravarDispositivo(d);
    aviso(document.getElementById("dispAviso"), `Aparelho "${d.nome}" agora é ${def.nome}.`);
    await carregarPainelAdmin();
  } catch (e) {
    aviso(document.getElementById("dispAviso"), "Não consegui salvar: " + e.message, true);
    await carregarPainelAdmin();
  }
}

/* Aprova um aparelho que pediu acesso */
async function aprovarAparelho(id, cargo = "funcionario") {
  if (!podeMudarCargo()) {
    aviso(document.getElementById("dispAviso"), "Só o Desenvolvedor pode aprovar aparelhos.", true);
    return;
  }
  await aplicarCargo(id, cargo);
}

/* O corretor digita o código que aparece no outro aparelho e libera na hora */
async function adicionarAparelhoPorCodigo() {
  if (!podeMudarCargo()) {
    aviso(document.getElementById("dispAviso"), "Só o Desenvolvedor pode liberar aparelhos.", true);
    return;
  }
  const campo = document.getElementById("codigoAparelho");
  const sel = document.getElementById("cargoNovo");
  const avisoEl = document.getElementById("dispAviso");
  const codigo = (campo ? campo.value : "").trim().toUpperCase();
  if (!codigo) { aviso(avisoEl, "Digite o código que aparece no outro aparelho.", true); return; }
  let pedido = null;
  try { pedido = await nuvemLerPedido(codigo); } catch (_) {}
  if (!pedido) {
    const locais = lerJSON(CHAVE_PEDIDOS, {});
    pedido = locais[codigo] || null;
  }
  if (!pedido) { aviso(avisoEl, "Código não encontrado. Confira se o outro aparelho abriu o site e mostrou o código.", true); return; }
  if (Date.now() - (pedido.criadoEm || 0) > CODIGO_VALIDADE) {
    aviso(avisoEl, "Esse código já venceu (vale 15 minutos). Peça para o outro aparelho gerar outro.", true);
    return;
  }
  const lista = dispositivosCache || [];
  const jaExiste = lista.find((x) => x.id === pedido.id);
  const cargo = (sel && sel.value) || "funcionario";
  const def = CARGOS[cargo];
  const d = jaExiste || { id: pedido.id, nome: pedido.nome, vistoEm: pedido.criadoEm };
  d.liberado = true; d.ver = def.ver; d.publicar = def.publicar; d.apagar = def.apagar;
  try {
    await gravarDispositivo(d);
    try { await nuvemApagarPedido(codigo); } catch (_) {}
    const locais = lerJSON(CHAVE_PEDIDOS, {});
    delete locais[codigo];
    gravarJSON(CHAVE_PEDIDOS, locais);
    if (campo) campo.value = "";
    aviso(avisoEl, `Aparelho "${d.nome}" liberado como ${def.nome}.`);
    await carregarPainelAdmin();
  } catch (e) {
    aviso(avisoEl, "Não consegui salvar: " + e.message, true);
  }
}

/* ---------- Pedido de acesso (aparelho que ainda não foi liberado) ---------- */
function gerarCodigoPedido() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 6; i++) c += letras[Math.floor(Math.random() * letras.length)];
  return c;
}

async function garantirPedido() {
  let codigo = "";
  try { codigo = localStorage.getItem(CHAVE_PEDIDOS + "-meu") || ""; } catch (_) {}

  // já tenho um código válido na nuvem? reaproveita
  if (codigo) {
    try {
      const meu = await nuvemLerPedido(codigo);
      if (meu && meu.id === aparelhoId && Date.now() - (meu.criadoEm || 0) < CODIGO_VALIDADE) return codigo;
    } catch (_) {}
  }

  // cria um novo e grava na nuvem (é isso que faz o outro aparelho achar)
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    codigo = gerarCodigoPedido();
    try {
      await nuvemGravarPedido(codigo, { id: aparelhoId, nome: aparelhoNome, criadoEm: Date.now() });
      try { localStorage.setItem(CHAVE_PEDIDOS + "-meu", codigo); } catch (_) {}
      return codigo;
    } catch (e) {
      if (!/duplicate|23505|conflit/i.test(e.message)) throw e;
    }
  }
  return codigo;
}

/* ---- pedidos de acesso na nuvem ---- */
async function nuvemGravarPedido(codigo, dados) {
  if (!NUVEM.ativa) return false;
  const corpo = JSON.stringify({ codigo, aparelhoId: dados.id, nome: dados.nome, criadoEm: dados.criadoEm });
  try {
    await nuvemFetch(sbUrl("pedidos_acesso"), {
      method: "POST",
      headers: sbHeaders({ "Prefer": "return=minimal" }),
      body: corpo
    });
  } catch (e) {
    // se o código já existir (repetido), apaga o antigo e grava de novo
    if (/duplicate|23505|conflit/i.test(e.message)) {
      await nuvemApagarPedido(codigo);
      await nuvemFetch(sbUrl("pedidos_acesso"), {
        method: "POST",
        headers: sbHeaders({ "Prefer": "return=minimal" }),
        body: corpo
      });
      return true;
    }
    throw e;
  }
  return true;
}

async function nuvemLerPedido(codigo) {
  if (!NUVEM.ativa) return null;
  const r = await nuvemFetch(sbUrl("pedidos_acesso?select=codigo,aparelhoId,nome,criadoEm&codigo=eq." + encodeURIComponent(codigo)));
  const linha = (r && r[0]) || null;
  return linha ? { codigo: linha.codigo, id: linha.aparelhoId, nome: linha.nome, criadoEm: Number(linha.criadoEm) || 0 } : null;
}

async function nuvemApagarPedido(codigo) {
  if (!NUVEM.ativa) return false;
  await nuvemFetch(sbUrl("pedidos_acesso?codigo=eq." + encodeURIComponent(codigo)), {
    method: "DELETE", headers: sbHeaders({ "Prefer": "return=minimal" })
  });
  return true;
}

/* Todo aparelho novo já entra como cliente (só vê as casas).
   Então não existe mais "pedido de acesso": a caixa de código nunca aparece. */
async function mostrarPedidoSePreciso() {
  const caixa = document.getElementById("caixaPedido");
  if (caixa) caixa.hidden = true;
}

async function removerAparelho(id) {
  const d = (dispositivosCache || []).find((x) => x.id === id);
  if (!d) return;
  if (!confirm(`Remover o aparelho "${d.nome}"? Se ele abrir o site de novo, volta como Cliente (só vê as casas).`)) return;
  try {
    await nuvemFetch(sbUrl(`config_dispositivos?id=eq.${encodeURIComponent(id)}`), {
      method: "DELETE", headers: sbHeaders({ "Prefer": "return=minimal" })
    });
    aviso(document.getElementById("dispAviso"), "Aparelho removido.");
  } catch (e) {
    aviso(document.getElementById("dispAviso"), "Não consegui remover: " + e.message, true);
  }
  await carregarPainelAdmin();
}

/* Salva a lista de usuários neste aparelho */
function gravarUsuarios() {
  gravarJSON(CHAVE_ACESSO, usuarios);
}

const CARGOS_USUARIO = {
  adm:          { nome: "ADM",           criaUsuarios: false, tudo: true },
  desenvolvedor: { nome: "Desenvolvedor", criaUsuarios: true,  tudo: true },
  funcionario:  { nome: "Funcionário",   criaUsuarios: false, tudo: false }
};

function nomeDoCargoUsuario(c) {
  return (CARGOS_USUARIO[c] || CARGOS_USUARIO.funcionario).nome;
}

/* Quem está logado pode criar/remover usuários? (ADM e Desenvolvedor) */
function podeGerenciarUsuarios() {
  const c = acesso && acesso.cargo ? acesso.cargo : "adm";
  return !!(CARGOS_USUARIO[c] && CARGOS_USUARIO[c].criaUsuarios);
}

/* Quem está logado é ADM de verdade (manda em tudo)? */
function ehAdminDeVerdade() {
  const c = acesso && acesso.cargo ? acesso.cargo : "adm";
  return !!(CARGOS_USUARIO[c] && CARGOS_USUARIO[c].tudo);
}

/* Adiciona um usuário novo (ou troca a senha de um que já existe) */
async function salvarCredenciais() {
  const avisoEl = document.getElementById("senhaAviso");
  if (!podeGerenciarUsuarios()) {
    aviso(avisoEl, "Só o Desenvolvedor pode criar e alterar usuários.", true);
    return;
  }
  const u = (document.getElementById("novoUsuario").value || "").trim();
  const s1 = document.getElementById("novaSenha").value || "";
  const s2 = document.getElementById("novaSenha2").value || "";
  const cargo = (document.getElementById("cargoNovoUsuario") || {}).value || "adm";
  if (!u) { aviso(avisoEl, "Informe o usuário.", true); return; }
  if (!/^[a-zA-Z0-9._-]{3,}$/.test(u)) { aviso(avisoEl, "Usuário: mínimo 3 letras, sem espaços (pode usar . _ -).", true); return; }
  if (s1.length < 6) { aviso(avisoEl, "A senha precisa ter pelo menos 6 caracteres.", true); return; }
  if (s1 !== s2) { aviso(avisoEl, "As duas senhas não são iguais.", true); return; }

  if (u.toLowerCase() === DONO_USUARIO.toLowerCase()) {
    aviso(avisoEl, "Esse nome é do dono. Escolha outro nome de usuário.", true);
    return;
  }
  const hash = await sha256(s1);
  const existente = usuarios.find((x) => String(x.usuario).toLowerCase() === u.toLowerCase());
  if (existente) {
    existente.senhaHash = hash;
    existente.cargo = cargo;
    existente.desde = Date.now();
    aviso(avisoEl, `Senha de "${existente.usuario}" atualizada.`);
  } else {
    usuarios.push({ usuario: u, senhaHash: hash, cargo, desde: Date.now() });
    aviso(avisoEl, `Usuário "${u}" criado como ${nomeDoCargoUsuario(cargo)}.`);
  }
  gravarUsuarios();
  const msg = avisoEl && avisoEl.textContent ? avisoEl.textContent : "";
  document.getElementById("novoUsuario").value = "";
  document.getElementById("novaSenha").value = "";
  document.getElementById("novaSenha2").value = "";
  renderUsuarios();
  fecharFormUsuario();
  aviso(avisoEl, msg);
}

/* Abre o formulário de usuário (novo ou troca de senha) */
function abrirFormUsuario(nome) {
  if (!podeGerenciarUsuarios()) {
    aviso(document.getElementById("senhaAviso"), "Só o Desenvolvedor pode criar e alterar usuários.", true);
    return;
  }
  const box = document.getElementById("formUsuario");
  const titulo = document.getElementById("formUsuarioTitulo");
  if (!box) return;
  box.hidden = false;
  const alvo = nome ? usuarios.find((x) => x.usuario === nome) : null;
  document.getElementById("novoUsuario").value = alvo ? alvo.usuario : "";
  document.getElementById("novoUsuario").readOnly = !!alvo;
  document.getElementById("novaSenha").value = "";
  document.getElementById("novaSenha2").value = "";
  const sel = document.getElementById("cargoNovoUsuario");
  if (sel) sel.value = alvo ? (alvo.cargo || "adm") : "adm";
  if (titulo) titulo.textContent = alvo ? `Nova senha de "${alvo.usuario}"` : "Novo usuário";
  aviso(document.getElementById("senhaAviso"), "");
  (alvo ? document.getElementById("novaSenha") : document.getElementById("novoUsuario")).focus();
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function fecharFormUsuario() {
  const box = document.getElementById("formUsuario");
  if (box) box.hidden = true;
  const campo = document.getElementById("novoUsuario");
  if (campo) campo.readOnly = false;
  aviso(document.getElementById("senhaAviso"), "");
}

/* Mostra a lista de usuários na tela */
function renderUsuarios() {
  const corpo = document.getElementById("listaUsuarios");
  if (!corpo) return;
  corpo.innerHTML = usuarios.map((u) => `
    <tr data-usuario="${escapar(u.usuario)}">
      <td><span class="disp-nome">${escapar(u.usuario)}</span>${acesso && acesso.usuario === u.usuario ? '<span class="sel-eu">logado agora</span>' : ''}</td>
      <td><span class="selo-cargo ${u.cargo === "adm" ? "adm" : u.cargo === "desenvolvedor" ? "dev" : "func"}">${nomeDoCargoUsuario(u.cargo)}</span></td>
      <td class="disp-data">${u.desde ? quandoFoi(u.desde) : "—"}</td>
      <td class="acoes-aparelho">
        ${podeGerenciarUsuarios() ? `
          <button type="button" class="btn btn-neutro btn-mini" data-acao="trocar-senha">Trocar senha</button>
          <button type="button" class="btn btn-perigo btn-mini" data-acao="remover-usuario">Remover</button>` : ""}
      </td>
    </tr>`).join("");
  const vazio = document.getElementById("usuariosVazio");
  if (vazio) vazio.hidden = usuarios.length > 0;
}

async function removerUsuario(nome) {
  if (String(nome).toLowerCase() === DONO_USUARIO.toLowerCase()) {
    aviso(document.getElementById("senhaAviso"), "O usuário do dono não pode ser removido.", true);
    return;
  }
  if (!podeGerenciarUsuarios()) {
    aviso(document.getElementById("senhaAviso"), "Só o Desenvolvedor pode remover usuários.", true);
    return;
  }
  const alvo = usuarios.find((x) => x.usuario === nome);
  if (!alvo) return;
  if (alvo.cargo === "desenvolvedor") {
    aviso(document.getElementById("senhaAviso"), "Só outro Desenvolvedor pode remover um Desenvolvedor.", true);
    return;
  }
  if (usuarios.length === 1) { aviso(document.getElementById("senhaAviso"), "Não dá para remover o último usuário.", true); return; }
  if (!confirm(`Remover o usuário "${nome}"? Ele não vai mais conseguir entrar na Área do corretor.`)) return;
  usuarios = usuarios.filter((x) => x.usuario !== nome);
  gravarUsuarios();
  if (acesso && acesso.usuario === nome) sairAdmin();
  aviso(document.getElementById("senhaAviso"), `Usuário "${nome}" removido.`);
  renderUsuarios();
}

function trocarSenhaDe(nome) {
  if (String(nome).toLowerCase() === DONO_USUARIO.toLowerCase()) {
    aviso(document.getElementById("senhaAviso"), "A senha do dono é fixa e não muda por aqui.", true);
    return;
  }
  const alvo = usuarios.find((x) => x.usuario === nome);
  if (alvo && alvo.cargo === "desenvolvedor" && (!acesso || acesso.cargo !== "desenvolvedor")) {
    aviso(document.getElementById("senhaAviso"), "Só um Desenvolvedor pode trocar a senha de outro Desenvolvedor.", true);
    return;
  }
  abrirFormUsuario(nome);
}

/* Liga os botões da área do corretor */
function ligarAdmin() {
  const btnAdmin = document.getElementById("btnAdmin");
  if (btnAdmin) btnAdmin.addEventListener("click", () => abrirAdmin());
  const bEntrar = document.getElementById("btnEntrar");
  if (bEntrar) bEntrar.addEventListener("click", tentarEntrar);
  const bVoltar = document.getElementById("btnSairAdmin");
  if (bVoltar) bVoltar.addEventListener("click", () => mostrarTela("painel"));
  const bSair = document.getElementById("btnSair");
  if (bSair) bSair.addEventListener("click", sairAdmin);
  const bIr = document.getElementById("btnIrPainel");
  if (bIr) bIr.addEventListener("click", () => mostrarTela("painel"));
  ligarBotaoDesenvolvedor();
  const bSenha = document.getElementById("btnSalvarSenha");
  if (bSenha) bSenha.addEventListener("click", salvarCredenciais);
  const bNovoU = document.getElementById("btnNovoUsuario");
  if (bNovoU) bNovoU.addEventListener("click", () => abrirFormUsuario());
  const bCancU = document.getElementById("btnCancelarUsuario");
  if (bCancU) bCancU.addEventListener("click", () => fecharFormUsuario());
  const corpoU = document.getElementById("listaUsuarios");
  if (corpoU) {
    corpoU.addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-acao]");
      if (!b) return;
      const nome = b.closest("tr").dataset.usuario;
      if (b.dataset.acao === "remover-usuario") removerUsuario(nome);
      else if (b.dataset.acao === "trocar-senha") trocarSenhaDe(nome);
    });
  }
  const senha = document.getElementById("loginSenha");
  if (senha) senha.addEventListener("keydown", (ev) => { if (ev.key === "Enter") tentarEntrar(); });

  const corpo = document.getElementById("listaDispositivos");
  if (corpo) {
    corpo.addEventListener("change", (ev) => {
      const sel = ev.target.closest("select[data-acao='cargo']");
      if (!sel) return;
      aplicarCargo(sel.closest("tr").dataset.id, sel.value);
    });
    corpo.addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-acao]");
      if (!b) return;
      const id = b.closest("tr").dataset.id;
      if (b.dataset.acao === "remover-aparelho") removerAparelho(id);
      else if (b.dataset.acao === "aprovar") aprovarAparelho(id, "funcionario");
    });
  }

  const bAdd = document.getElementById("btnAdicionarAparelho");
  if (bAdd) bAdd.addEventListener("click", adicionarAparelhoPorCodigo);
  const bPedir = document.getElementById("btnPedirAcesso");
  if (bPedir) bPedir.addEventListener("click", async () => {
    await sincronizar();
    await registrarAparelho();
    const codigo = garantirPedido();
    document.getElementById("codigoMeuAparelho").textContent = codigo;
    aviso(document.getElementById("avisoPedido"), "Pedido enviado. Aguarde o corretor liberar este aparelho.");
  });
  const bAtualizarPedido = document.getElementById("btnAtualizarPedido");
  if (bAtualizarPedido) bAtualizarPedido.addEventListener("click", async () => {
    await sincronizar();
    await mostrarPedidoSePreciso();
    const perms = await minhasPermissoes();
    if (perms.publicar || perms.apagar) aviso(document.getElementById("avisoPedido"), "Liberado! Já pode usar o site.");
    else aviso(document.getElementById("avisoPedido"), "Ainda aguardando liberação do corretor.");
  });
}


iniciar().catch((e) => {
  console.error("Falha ao iniciar:", e);
  mostrarTela("painel");
  const s = document.getElementById("statusNuvem");
  if (s) { s.textContent = "Não consegui carregar — recarregue a página"; s.className = "status-nuvem erro"; }
  if (typeof renderLista === "function") { try { renderLista(); } catch (_) {} }
});

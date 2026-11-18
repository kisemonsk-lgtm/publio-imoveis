/* Sobe a pasta corretora/ para o GitHub usando a API (sem git instalado).
   Cria os blobs, a árvore e o commit, e atualiza a branch main. */
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.GH_TOKEN;
const OWNER = process.env.REPO_OWNER;
const REPO = process.env.REPO_NAME;
const DIR = process.env.DIR;
const MENSAGEM = process.env.MENSAGEM || "Atualiza arquivos";
const API = "https://api.github.com";

const TIPOS = {
  ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".jpg": "image/jpeg", ".md": "text/markdown"
};

async function api(caminho, opcoes = {}) {
  const r = await fetch(API + caminho, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "publio-imoveis-deploy",
      "Content-Type": "application/json",
      ...(opcoes.headers || {})
    }
  });
  const texto = await r.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch (_) { dados = texto; }
  if (!r.ok) {
    throw new Error(`${opcoes.method || "GET"} ${caminho} -> ${r.status}: ${texto.slice(0, 400)}`);
  }
  return dados;
}

function listarArquivos(dir) {
  const saida = [];
  for (const nome of fs.readdirSync(dir)) {
    if (nome === ".git" || nome === "node_modules") continue;
    const full = path.join(dir, nome);
    const st = fs.statSync(full);
    if (st.isDirectory()) saida.push(...listarArquivos(full));
    else saida.push(full);
  }
  return saida;
}

(async () => {
  const repo = `/repos/${OWNER}/${REPO}`;

  // branch principal existente?
  let branchRef = null;
  try {
    branchRef = await api(`${repo}/git/ref/heads/main`);
  } catch (_) {
    try { branchRef = await api(`${repo}/git/ref/heads/master`); } catch (_) { branchRef = null; }
  }

  const baseCommitSha = branchRef ? branchRef.object.sha : null;
  const baseCommit = baseCommitSha ? await api(`${repo}/git/commits/${baseCommitSha}`) : null;
  const baseTree = baseCommit ? baseCommit.tree.sha : null;

  const arquivos = listarArquivos(DIR);
  const entradas = [];
  for (const arq of arquivos) {
    const rel = path.relative(DIR, arq).split(path.sep).join("/");
    const conteudo = fs.readFileSync(arq);
    const blob = await api(`${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: conteudo.toString("base64"), encoding: "base64" })
    });
    entradas.push({
      path: rel,
      mode: "100644",
      type: "blob",
      sha: blob.sha
    });
    console.log("blob", rel, blob.sha.slice(0, 8));
  }

  const tree = await api(`${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify(baseTree ? { base_tree: baseTree, tree: entradas } : { tree: entradas })
  });

  const commit = await api(`${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: MENSAGEM,
      tree: tree.sha,
      parents: baseCommitSha ? [baseCommitSha] : []
    })
  });
  console.log("commit", commit.sha);

  if (branchRef) {
    await api(`${repo}/git/refs/${branchRef.ref.replace("refs/", "")}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: true })
    });
    console.log("branch atualizada:", branchRef.ref);
  } else {
    const ref = await api(`${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: "refs/heads/main", sha: commit.sha })
    });
    console.log("branch criada:", ref.ref);
    // torna main a branch padrão
    await api(repo, { method: "PATCH", body: JSON.stringify({ default_branch: "main" }) });
  }

  console.log("OK", `https://github.com/${OWNER}/${REPO}`);
})().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});

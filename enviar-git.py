import json, base64, os, sys, urllib.request, urllib.error

TOKEN = os.environ["GH_TOKEN"]
REPO = "kisemonsk-lgtm/publio-imoveis"
BASE = "https://api.github.com/repos/" + REPO
PASTA = os.path.dirname(os.path.abspath(__file__))


def api(metodo, url, corpo=None):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(url, data=dados, method=metodo, headers={
        "Authorization": "Bearer " + TOKEN,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "publio-deploy",
    })
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        print("ERRO", e.code, e.read().decode()[:400])
        raise


# 1) estado atual da branch
ref = api("GET", BASE + "/git/ref/heads/main")
head = ref["object"]["sha"]
commit_atual = api("GET", BASE + "/git/commits/" + head)
base_tree = commit_atual["tree"]["sha"]
arvore_atual = api("GET", BASE + "/git/trees/" + base_tree + "?recursive=1")
remotos = {t["path"]: t["sha"] for t in arvore_atual["tree"] if t["type"] == "blob"}

# 2) arquivos locais que entram no commit (pasta inteira, arquivos ocultos inclusive)
arquivos = sorted(
    f for f in os.listdir(PASTA)
    if os.path.isfile(os.path.join(PASTA, f)) and not f.startswith(".")
)
novos, iguais = [], []
for nome in arquivos:
    with open(os.path.join(PASTA, nome), "rb") as fh:
        bruto = fh.read()
    dados = base64.b64encode(bruto).decode()
    caminho = nome
    # compara com o que já está no GitHub para não recriar blob igual
    if remotos.get(caminho):
        atual = api("GET", BASE + "/git/blobs/" + remotos[caminho])
        if atual.get("encoding") == "base64" and atual.get("content", "").replace("\n", "") == dados:
            iguais.append(nome)
            continue
    blob = api("POST", BASE + "/git/blobs", {"content": dados, "encoding": "base64"})
    novos.append({"path": caminho, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    print("  blob novo:", nome, len(bruto), "bytes")

print("iguais (sem mudança):", ", ".join(iguais) or "nenhum")
print("novos/alterados:", len(novos))

# 3) árvore nova = árvore atual + o que mudou
arvore = api("POST", BASE + "/git/trees", {"base_tree": base_tree, "tree": novos})
commit = api("POST", BASE + "/git/commits", {
    "message": "Tela inicial animada com botão Entrar + area do cliente (somente consulta)",
    "tree": arvore["sha"],
    "parents": [head],
})
api("PATCH", BASE + "/git/refs/heads/main", {"sha": commit["sha"], "force": False})
print("COMMIT", commit["sha"])
print("URL", commit["html_url"])

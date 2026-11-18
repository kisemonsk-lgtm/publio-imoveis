import json, os, urllib.request, urllib.error

TOKEN = os.environ["GH_TOKEN"]
REPO = "kisemonsk-lgtm/publio-imoveis"
BASE = "https://api.github.com/repos/" + REPO


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


ref = api("GET", BASE + "/git/ref/heads/main")
head = ref["object"]["sha"]
commit_atual = api("GET", BASE + "/git/commits/" + head)
base_tree = commit_atual["tree"]["sha"]

# árvore nova SEM os arquivos que não fazem parte do site
arvore = api("POST", BASE + "/git/trees", {"base_tree": base_tree, "tree": [
    {"path": "arvore.json", "mode": "100644", "type": "blob", "sha": None},
    {"path": "enviar-git.py", "mode": "100644", "type": "blob", "sha": None},
    {"path": "publio.tar.gz", "mode": "100644", "type": "blob", "sha": None},
]})
commit = api("POST", BASE + "/git/commits", {
    "message": "Limpeza: remove arquivos auxiliares que nao fazem parte do site",
    "tree": arvore["sha"],
    "parents": [head],
})
api("PATCH", BASE + "/git/refs/heads/main", {"sha": commit["sha"], "force": False})
print("COMMIT", commit["sha"])
print("URL", commit["html_url"])

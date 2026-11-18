# Como aumentar o limite de fotos (de 1 MB para praticamente ilimitado)

O limite de **1 MB por imóvel** não é do site: é do **Firestore**, o banco de dados do Firebase.
Ele não tem como ser aumentado. O caminho certo é guardar as **fotos em outro lugar**
(o **Firebase Storage**, feito para arquivos) e deixar no banco apenas os endereços das fotos.
Com isso o limite deixa de existir na prática: cada foto pode ter até **5 MB** (padrão do Storage)
e o imóvel pode ter **dezenas de fotos**.

O código do site **já está pronto** para isso. Falta apenas criar o Storage no seu projeto
(uma vez só, leva 2 minutos).

---

## Passo 1 — Criar o Storage no Firebase

1. Abra **https://console.firebase.google.com/project/publio-imoveis-v1/storage**
2. Clique em **Começar / Get started**.
3. Escolha **Modo de produção** (Production mode) e confirme a região sugerida.
4. O bucket criado vai aparecer no topo da página, com um nome parecido com:
   `publio-imoveis-v1.firebasestorage.app` ou `publio-imoveis-v1.appspot.com`
   → **copie esse nome**.

## Passo 2 — Liberar o acesso às fotos

Na aba **Regras (Rules)** do Storage, cole isto e clique em **Publicar**:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

(É o mesmo tipo de liberação que já está no Firestore. Se depois quiser proteger com login,
trocamos por regras com usuário.)

## Passo 3 — Avisar o site

Abra o arquivo `app.js` e procure estas duas linhas (perto do começo):

```js
  storageBucket: "publio-imoveis-v1.firebasestorage.app",
  storageLigado: false,
```

Mude para `true`:

```js
  storageLigado: true,
```

Se o nome do bucket que apareceu no Passo 1 for diferente (ex.: `publio-imoveis-v1.appspot.com`),
troque também o `storageBucket`.

## Passo 4 — Publicar no GitHub

Me avise aqui no chat que eu envio a alteração para o site publicado.

---

## O que muda depois de ativado

| | Antes (só Firestore) | Depois (com Storage) |
|---|---|---|
| Limite do imóvel | 1 MB (≈ 5 fotos) | praticamente nenhum |
| Fotos por imóvel | até 10, comprimidas | até 40, em alta qualidade |
| Qualidade da foto | 1200 px, ~100 KB | 1600 px, até ~700 KB |
| Fotos no aparelho | guardadas dentro do registro | guardadas só os endereços (site mais leve) |

---

## Alternativa: Plano Blaze (pago) do Firebase

O Storage no **plano gratuito Spark** já é suficiente para um catálogo de imóveis
(5 GB de armazenamento e 1 GB de download por dia). Só é preciso o **Blaze** se o movimento
do site crescer muito. Não é necessário agora.

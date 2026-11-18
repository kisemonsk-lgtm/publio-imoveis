# Migrar do Firebase para o Supabase (grátis, sem cartão)

O site **já está pronto** para o Supabase. O Firebase foi removido do código.
Falta só você criar o projeto e colar 3 dados no `app.js`. Leva uns 10 minutos.

## O que você ganha

| | Firebase (antes) | Supabase (agora) |
|---|---|---|
| Limite por imóvel | 1 MB (≈ 5 fotos) | **nenhum** |
| Banco de dados | 1 GB | 500 MB (milhares de imóveis) |
| Fotos | servidor externo | **1 GB dentro do Supabase** |
| Cartão de crédito | não | **não** |
| Custo | zero | zero |

---

## Passo 1 — Criar a conta e o projeto

1. Abra **https://supabase.com** e clique em **Start your project** (pode entrar com o Google).
2. Clique em **New project**.
   - **Name:** `publio-imoveis`
   - **Database Password:** crie uma senha e **guarde** (não vamos usar no site, mas o Supabase exige).
   - **Region:** `South America (São Paulo)` — mais rápido no Brasil.
3. Espere ~2 minutos até o projeto ficar pronto.

## Passo 2 — Criar a tabela e as permissões

1. No menu da esquerda, abra **SQL Editor**.
2. Abra o arquivo **SUPABASE.sql** (está nesta pasta), copie tudo e cole lá.
3. Clique em **Run**. Deve aparecer "Success. No rows returned" e depois a contagem da tabela.

## Passo 3 — Pegar os dois dados do site

1. No menu, abra **Project Settings** (engrenagem) → **API**.
2. Copie:
   - **Project URL** → algo como `https://abcdefghijkl.supabase.co`
   - **anon public** (ou **publishable key**) → a chave comprida que começa com `eyJ...` ou `sb_publishable_...`

> Use a chave **anon/publishable**, nunca a **service_role** (essa é secreta).

## Passo 4 — Colar no site

Abra o arquivo `app.js` e procure, no começo:

```js
const SUPABASE = {
  url: "",                       // ex.: https://abcdefgh.supabase.co
  chave: "",                     // ex.: sb_publishable_... (ou a anon key)
  tabela: "imoveis",
  bucket: "fotos",               // bucket público das fotos
```

Preencha `url` e `chave` com o que você copiou. Salve.

## Passo 5 — Publicar

Me avise aqui no chat. Eu envio o `app.js` atualizado para o GitHub e o site
passa a usar o Supabase na hora.

---

## Passar os imóveis que já existem

O que está no Firebase não vem automaticamente. Duas opções:

1. **Recadastrar** no site (recomendado se forem poucos e de teste).
2. **Importar**: me avise que eu leio o Firebase e gero um arquivo `.csv` para você
   importar em **Table Editor → imoveis → Import data**.

## Depois de migrar

- O site continua funcionando igual: cadastrar, editar, excluir, ficha, ZIP das fotos.
- As fotos passam a ser guardadas no próprio Supabase (bucket `fotos`).
- **Atenção:** projeto gratuito do Supabase é **pausado após 7 dias sem uso**.
  Se o site ficar parado muito tempo, abra o painel do Supabase e clique em **Restore**.
  Usando o site toda semana, isso não acontece.

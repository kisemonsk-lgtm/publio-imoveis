# Como ativar a nuvem (todos os dispositivos veem os mesmos imóveis)

O sistema funciona de dois jeitos:

| Modo | O que acontece |
| --- | --- |
| **Local** (padrão) | Cada aparelho guarda os próprios imóveis. O link de cada ficha leva a foto e a descrição dentro dele, então o cliente sempre vê. |
| **Nuvem** | Você lança no computador e o celular, o tablet e o site publicado mostram a mesma lista, automaticamente. O link da ficha fica curto. |

Para ativar o modo nuvem você precisa de um "cofre" na internet onde a lista fica guardada.
O mais simples e gratuito é o **JSONBin.io** (não pede cartão). São 5 minutos, uma vez só.

## Passo a passo

1. **Crie a conta**: acesse https://jsonbin.io e clique em *Sign Up* (pode entrar com Google).
2. **Crie o cofre**: no painel, clique em **Create Bin**. Apague o conteúdo de exemplo e cole:

   ```json
   { "imoveis": [] }
   ```

   Clique em **Create**. Vai abrir uma tela com o **Bin ID** — algo como
   `65f1a2b3c4d5e6f7a8b9c0d1`. Copie esse código.
3. **Copie a sua chave**: no menu do seu perfil, vá em **API Keys** e copie a
   **X-Master-Key** (um texto longo começando com `$2b$` ou `$2a$`).
4. **Preencha no sistema**: abra o arquivo `app.js` e procure o bloco no começo:

   ```js
   const NUVEM = {
     binId: "",
     chave: "",
     ...
   };
   ```

   Deixe assim (com os seus dados entre as aspas):

   ```js
   const NUVEM = {
     binId: "65f1a2b3c4d5e6f7a8b9c0d1",
     chave: "$2b$10$abcdefghijklmnopqrstuv...",
     ...
   };
   ```

5. **Publique**: suba o arquivo atualizado no GitHub (o site é atualizado sozinho em
   cerca de 1 minuto). Pronto — todos os aparelhos que abrirem o site verão a mesma lista.

## Como saber se está funcionando

No topo do sistema aparece um selo:

- **Sincronizado — todos os dispositivos** (verde): está tudo certo.
- **Sem conexão com a nuvem** (vermelho): confira a internet ou se o Bin ID e a chave
  estão corretos.
- **Modo local** (dourado): a nuvem ainda não foi configurada.

O botão **↻ Atualizar** no topo busca na hora o que foi lançado em outro aparelho.
Com a nuvem ativa, o sistema também se atualiza sozinho a cada 30 segundos.

## Segurança

A chave fica dentro do `app.js`, que é público no GitHub Pages. Ela dá acesso apenas a
esse cofre de imóveis — não use a mesma chave para outras coisas. Se quiser mais
segurança, crie um cofre novo e uma chave nova quando precisar trocar.

## Quer um sistema com login?

Este é um sistema simples, sem senha: quem abrir o endereço consegue cadastrar.
Se você precisar de **login por corretor**, cada um com seu acesso, e da lista
protegida, aí o caminho é um backend de verdade (por exemplo Supabase, com login e
banco de dados). Me diga que eu monto essa versão.

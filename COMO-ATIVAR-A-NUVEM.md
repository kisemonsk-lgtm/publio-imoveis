# Sincronizar em todos os dispositivos (Firebase — grátis)

Com o **Firebase Firestore** os imóveis ficam num banco na nuvem: você lança no
computador e aparece no celular, no tablet e no site publicado, automaticamente.

Leva uns 10 minutos, uma vez só, e é de graça para esse volume de uso.

## 1. Criar o projeto

1. Acesse https://console.firebase.google.com e entre com a conta Google.
2. Clique em **Adicionar projeto**, dê o nome `publio-imoveis` e conclua
   (pode desligar o Google Analytics).

## 2. Criar o banco de dados

1. No menu da esquerda, clique em **Criação → Firestore Database**.
2. Clique em **Criar banco de dados**.
3. Escolha a localização (ex.: `southamerica-east1` — São Paulo).
4. Escolha **Iniciar no modo de produção** e clique em **Criar**.

## 3. Liberar a leitura e a escrita

1. Na aba **Regras** do Firestore, apague o que está lá e cole:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /publio/{documento} {
         allow read, write: if true;
       }
     }
   }
   ```

2. Clique em **Publicar**.

> Isso deixa a lista aberta a quem tiver o endereço do banco. É simples e serve para
> começar. Se quiser senha depois, dá para colocar login — é só pedir.

## 4. Registrar o site

1. Na página inicial do projeto, clique no ícone **`</>`** (Web).
2. Apelido: `publio`. **Não** marque "Firebase Hosting".
3. Clique em **Registrar app**. Vai aparecer um bloco `firebaseConfig` assim:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "publio-imoveis.firebaseapp.com",
     projectId: "publio-imoveis",
     storageBucket: "publio-imoveis.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```

   Copie esses valores.

## 5. Colar no sistema

Abra o arquivo `app.js` e procure o bloco no começo:

```js
const NUVEM = {
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },
  ...
};
```

Preencha com os valores que você copiou, salve e envie o arquivo para o GitHub.
Em cerca de 1 minuto o site atualiza e o selo no topo fica
**Sincronizado — todos os dispositivos** (verde).

## Como saber se está funcionando

- **Verde**: tudo certo, a lista é a mesma em todos os aparelhos.
- **Vermelho**: confira se a `apiKey` e o `projectId` estão certos e se as regras
  foram publicadas.
- **Dourado (modo local)**: ainda não configurado.

O botão **↻ Atualizar** no topo busca na hora o que foi lançado em outro aparelho.
Com a nuvem ativa, o sistema também se atualiza sozinho a cada 30 segundos e quando
você volta para a aba.

## Observação sobre a segurança

Sem login, quem souber o endereço do banco consegue ler a lista. Os imóveis não são
dados sensíveis (são anúncios), mas se você quiser cada corretor com seu login,
é só pedir que eu ativo o Firebase Authentication.

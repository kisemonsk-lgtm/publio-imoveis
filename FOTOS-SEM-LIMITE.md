# Fotos do imóvel: agora sem o limite de 1 MB

## O que mudou

O **Firebase Storage** exige o plano pago (Blaze, com cartão), então **não usamos ele**.
As fotos agora vão para um **servidor de fotos gratuito** (Catbox) e o banco do Firebase
guarda apenas o **endereço** de cada foto.

| | Antes | Agora |
|---|---|---|
| Fotos por imóvel | 5 (comprimidas) | **até 30** |
| Qualidade | 1200 px, ~100 KB | **1600 px, até ~700 KB** |
| Custo | — | **zero, sem cartão e sem conta** |
| Onde ficam as fotos | dentro do banco (1 MB) | em `files.catbox.moe` |

## Como funciona

1. Você escolhe as fotos no cadastro.
2. Cada foto é reduzida para um JPEG de boa qualidade (1600 px).
3. Ao salvar, o site **envia cada foto** para o servidor de fotos e recebe um endereço.
4. No banco do Firebase fica só o endereço — por isso o limite de 1 MB deixa de importar.
5. Ao **excluir** um imóvel, o registro sai do banco. As fotos continuam no servidor de
   fotos (não é possível apagar por lá sem conta), mas deixam de aparecer no site.

## Limites do servidor gratuito

- **200 MB por arquivo** (usamos no máximo ~700 KB por foto).
- **Sem conta e sem prazo de validade** — os endereços são permanentes.
- Se algum dia o serviço sair do ar, basta trocar a linha `const FOTOS_URL` em `app.js`
  por outro serviço parecido. As fotos já enviadas continuam funcionando pelos endereços.

## Como desligar (voltar ao modo antigo)

Em `app.js`, procure:

```js
  fotosFora: true
```

Troque para `false`. Aí as fotos voltam a ser guardadas dentro do banco (10 por imóvel).

## Para reverter fotos antigas

Os imóveis já cadastrados continuam como estão (fotos dentro do banco). Ao abrir e salvar
um deles de novo, as fotos são enviadas para o servidor automaticamente.

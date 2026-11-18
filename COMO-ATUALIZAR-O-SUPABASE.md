# Atualizar o Supabase (uma vez) — vídeos e todo aparelho como Cliente

O site já está pronto, mas o banco precisa de duas mudanças que só podem ser feitas por
dentro do Supabase (a chave do site não tem permissão para criar coluna nem bucket).

## Passo a passo (2 minutos)

1. Abra **https://supabase.com/dashboard** e entre no projeto `mefhqkjrszvrjztqdlqe`.
2. No menu da esquerda, clique em **SQL Editor** → **New query**.
3. Abra o arquivo `SUPABASE.sql` deste repositório, copie **todo o conteúdo** e cole ali.
4. Clique em **RUN** (ou Ctrl+Enter).

O script inteiro pode rodar de novo sem problema: ele usa `if not exists` e `drop policy if
exists` antes de criar cada coisa.

## O que ele resolve

| Item | Antes | Depois |
|---|---|---|
| Coluna `videos` | não existe — o vídeo não salva | criada, aceita até 5 vídeos por imóvel |
| Bucket `fotos` | não existia / limitado a 5 MB | criado, público, 50 MB por arquivo |
| Aparelhos | `liberado = false`, "aguardando liberação" | todos entram como **Cliente** (só veem as casas) |
| Pedidos de acesso | aparelho travado até o corretor liberar | não é mais necessário |

## Depois de rodar

- Abra o site no aparelho, recarregue com **Ctrl+Shift+R**.
- Ele já entra como **Cliente**: só as casas na tela.
- Para virar Funcionário ou ADM: **⚙️ Área do desenvolvedor** (usuário `Pablo`) →
  cartão *Modo Desenvolvedor* → tabela de aparelhos → troque o cargo na coluna da função.

## Conferir se funcionou

No SQL Editor, rode:

```sql
select column_name from information_schema.columns
 where table_name = 'imoveis' and column_name = 'videos';   -- deve retornar 1 linha

select count(*) from config_dispositivos where liberado;     -- todos os aparelhos
```

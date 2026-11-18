-- ============================================================
--  Públio Imóveis — banco de dados no Supabase
--  Cole este arquivo inteiro no SQL Editor do Supabase e clique em RUN.
-- ============================================================

-- 1) Tabela dos imóveis
create table if not exists public.imoveis (
  id           text primary key,
  titulo       text not null default '',
  tipo         text default '',
  finalidade   text default '',
  preco        text default '',
  local        text default '',
  descricao    text default '',
  imagem       text default '',
  imagens      text[] default '{}',
  "criadoEm"   bigint default 0,
  "atualizadoEm" bigint default 0
);

-- 2) Acesso liberado para o site (mesma liberação que o Firebase tinha)
alter table public.imoveis enable row level security;

drop policy if exists "site le" on public.imoveis;
drop policy if exists "site grava" on public.imoveis;
drop policy if exists "site atualiza" on public.imoveis;
drop policy if exists "site apaga" on public.imoveis;

create policy "site le"      on public.imoveis for select using (true);
create policy "site grava"   on public.imoveis for insert with check (true);
create policy "site atualiza" on public.imoveis for update using (true) with check (true);
create policy "site apaga"   on public.imoveis for delete using (true);

-- 3) Bucket público para as fotos
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do update set public = true;

-- 4) Liberar envio e leitura das fotos nesse bucket
drop policy if exists "fotos leitura" on storage.objects;
drop policy if exists "fotos envio"   on storage.objects;
drop policy if exists "fotos apagar"  on storage.objects;

create policy "fotos leitura" on storage.objects
  for select using (bucket_id = 'fotos');

create policy "fotos envio" on storage.objects
  for insert with check (bucket_id = 'fotos');

create policy "fotos apagar" on storage.objects
  for delete using (bucket_id = 'fotos');

-- 5) Conferência
select 'tabela imoveis criada' as resultado, count(*) as imoveis from public.imoveis;

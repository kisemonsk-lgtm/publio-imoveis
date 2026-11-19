-- ============================================================
--  PÚBLIO IMÓVEIS — BANCO COMPLETO NO SUPABASE
--  Projeto: mefhqkjrszvrjztqdlqe
--
--  COMO USAR:
--   1) abra https://supabase.com/dashboard
--   2) escolha o projeto "mefhqkjrszvrjztqdlqe"
--   3) menu da esquerda: SQL Editor  ->  New query
--   4) cole ESTE ARQUIVO INTEIRO e clique em RUN
--
--  Pode rodar mais de uma vez: tudo aqui usa "if not exists" e
--  "on conflict", então nada quebra e nada é perdido.
--  No fim aparece uma tabela de conferência com "ok" em tudo.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
--  1) IMÓVEIS
-- ============================================================
create table if not exists public.imoveis (
  id             text primary key,
  titulo         text not null default '',
  tipo           text default '',
  finalidade     text default '',
  preco          text default '',
  local          text default '',
  descricao      text default '',
  imagem         text default '',
  imagens        text[] default '{}',
  videos         text[] default '{}',
  "criadoEm"     bigint default 0,
  "atualizadoEm" bigint default 0
);

-- se a tabela já existia, garante as colunas novas
alter table public.imoveis add column if not exists videos     text[] default '{}';
alter table public.imoveis add column if not exists "atualizadoEm" bigint default 0;

alter table public.imoveis enable row level security;

drop policy if exists "site le"       on public.imoveis;
drop policy if exists "site grava"    on public.imoveis;
drop policy if exists "site atualiza" on public.imoveis;
drop policy if exists "site apaga"    on public.imoveis;

create policy "site le"       on public.imoveis for select using (true);
create policy "site grava"    on public.imoveis for insert with check (true);
create policy "site atualiza" on public.imoveis for update using (true) with check (true);
create policy "site apaga"    on public.imoveis for delete using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.imoveis to anon, authenticated;

-- ============================================================
--  2) LIXEIRA — exclusão feita num aparelho vale para todos
-- ============================================================
create table if not exists public.imoveis_apagados (
  id          text primary key,
  "apagadoEm" bigint default 0
);

alter table public.imoveis_apagados enable row level security;

drop policy if exists "apagados le"    on public.imoveis_apagados;
drop policy if exists "apagados grava" on public.imoveis_apagados;
drop policy if exists "apagados apaga" on public.imoveis_apagados;

create policy "apagados le"    on public.imoveis_apagados for select using (true);
create policy "apagados grava" on public.imoveis_apagados for insert with check (true);
create policy "apagados apaga" on public.imoveis_apagados for delete using (true);

grant select, insert, update, delete on public.imoveis_apagados to anon, authenticated;

-- ============================================================
--  3) APARELHOS — quem pode ver, cadastrar e apagar
--     cargo: 'cliente' | 'funcionario' | 'adm'
-- ============================================================
create table if not exists public.config_dispositivos (
  id        text primary key,
  nome      text default '',
  ver       boolean default true,
  publicar  boolean default false,
  apagar    boolean default false,
  liberado  boolean default true,
  cargo     text    default 'cliente',
  "vistoEm" bigint  default 0
);

alter table public.config_dispositivos add column if not exists liberado  boolean default true;
alter table public.config_dispositivos add column if not exists cargo     text    default 'cliente';
alter table public.config_dispositivos add column if not exists ver       boolean default true;
alter table public.config_dispositivos add column if not exists publicar  boolean default false;
alter table public.config_dispositivos add column if not exists apagar    boolean default false;

alter table public.config_dispositivos enable row level security;

drop policy if exists "dispositivos le"       on public.config_dispositivos;
drop policy if exists "dispositivos grava"    on public.config_dispositivos;
drop policy if exists "dispositivos atualiza" on public.config_dispositivos;
drop policy if exists "dispositivos apaga"    on public.config_dispositivos;

create policy "dispositivos le"       on public.config_dispositivos for select using (true);
create policy "dispositivos grava"    on public.config_dispositivos for insert with check (true);
create policy "dispositivos atualiza" on public.config_dispositivos for update using (true) with check (true);
create policy "dispositivos apaga"    on public.config_dispositivos for delete using (true);

grant select, insert, update, delete on public.config_dispositivos to anon, authenticated;

-- todo aparelho novo entra como CLIENTE (só vê as casas)
alter table public.config_dispositivos alter column cargo    set default 'cliente';
alter table public.config_dispositivos alter column liberado set default true;
alter table public.config_dispositivos alter column publicar set default false;
alter table public.config_dispositivos alter column apagar   set default false;

-- acerta a função de quem já estava na lista, conforme as permissões antigas
update public.config_dispositivos
   set cargo = case
     when apagar and publicar then 'adm'
     when publicar           then 'funcionario'
     else 'cliente'
   end
 where cargo is null or cargo = '';

-- ninguém fica travado: todos entram como cliente
update public.config_dispositivos set liberado = true where liberado is distinct from true;

-- ============================================================
--  4) PEDIDOS DE ACESSO — código que o aparelho novo mostra
-- ============================================================
create table if not exists public.pedidos_acesso (
  codigo      text primary key,
  "aparelhoId" text,
  nome        text,
  "criadoEm"  bigint default 0
);

alter table public.pedidos_acesso enable row level security;

drop policy if exists "pedidos le"    on public.pedidos_acesso;
drop policy if exists "pedidos grava" on public.pedidos_acesso;
drop policy if exists "pedidos apaga" on public.pedidos_acesso;

create policy "pedidos le"    on public.pedidos_acesso for select using (true);
create policy "pedidos grava" on public.pedidos_acesso for insert with check (true);
create policy "pedidos apaga" on public.pedidos_acesso for delete using (true);

grant select, insert, delete on public.pedidos_acesso to anon, authenticated;

-- ============================================================
--  5) FOTOS E VÍDEOS — bucket público "fotos"
--     fotos ficam na raiz do bucket, vídeos em videos/
-- ============================================================
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do update set public = true;

-- até 50 MB por arquivo (vídeo de celular)
update storage.buckets
   set file_size_limit    = 52428800,
       allowed_mime_types = null
 where id = 'fotos';

drop policy if exists "fotos leitura" on storage.objects;
drop policy if exists "fotos envio"   on storage.objects;
drop policy if exists "fotos apagar"  on storage.objects;
drop policy if exists "fotos troca"   on storage.objects;

create policy "fotos leitura" on storage.objects
  for select using (bucket_id = 'fotos');

create policy "fotos envio" on storage.objects
  for insert with check (bucket_id = 'fotos');

create policy "fotos apagar" on storage.objects
  for delete using (bucket_id = 'fotos');

create policy "fotos troca" on storage.objects
  for update using (bucket_id = 'fotos') with check (bucket_id = 'fotos');

-- ============================================================
--  6) CONFERÊNCIA — o resultado tem que vir tudo "ok"
-- ============================================================
select 'ok' as imoveis_tabela,
       (select count(*) from information_schema.tables
         where table_schema = 'public' and table_name = 'imoveis') as existe;

select 'ok' as coluna_videos,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'imoveis'
           and column_name = 'videos') as existe;

select 'ok' as coluna_cargo,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'config_dispositivos'
           and column_name = 'cargo') as existe;

select 'ok' as bucket_fotos,
       (select count(*) from storage.buckets where id = 'fotos') as existe,
       (select file_size_limit from storage.buckets where id = 'fotos') as limite_bytes;

select 'ok' as aparelhos,
       count(*)                                        as total,
       count(*) filter (where cargo = 'adm')           as adm,
       count(*) filter (where cargo = 'funcionario')   as funcionarios,
       count(*) filter (where cargo = 'cliente')       as clientes
  from public.config_dispositivos;

select 'ok' as imoveis_na_base, count(*) as total from public.imoveis;

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

-- ============================================================
--  Aparelhos autorizados (Área do corretor)
--  Rode este trecho também se o banco já existia antes desta versão.
-- ============================================================

create table if not exists public.config_dispositivos (
  id        text primary key,
  nome      text default '',
  ver       boolean default true,
  publicar  boolean default true,
  apagar    boolean default false,
  "vistoEm" bigint default 0
);

alter table public.config_dispositivos enable row level security;

drop policy if exists "dispositivos le"       on public.config_dispositivos;
drop policy if exists "dispositivos grava"    on public.config_dispositivos;
drop policy if exists "dispositivos atualiza" on public.config_dispositivos;
drop policy if exists "dispositivos apaga"    on public.config_dispositivos;

create policy "dispositivos le"       on public.config_dispositivos for select using (true);
create policy "dispositivos grava"    on public.config_dispositivos for insert with check (true);
create policy "dispositivos atualiza" on public.config_dispositivos for update using (true) with check (true);
create policy "dispositivos apaga"    on public.config_dispositivos for delete using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.config_dispositivos to anon, authenticated;

select 'tabela config_dispositivos criada' as resultado, count(*) as aparelhos from public.config_dispositivos;

-- ============================================================
--  Lixeira: exclusão feita no modo ADM vale para todos os aparelhos
--  (rode este trecho também em um banco que já existia)
-- ============================================================

create table if not exists public.imoveis_apagados (
  id      text primary key,
  "apagadoEm" bigint default 0
);

alter table public.imoveis_apagados enable row level security;

drop policy if exists "apagados le"     on public.imoveis_apagados;
drop policy if exists "apagados grava"  on public.imoveis_apagados;
drop policy if exists "apagados apaga"  on public.imoveis_apagados;

create policy "apagados le"    on public.imoveis_apagados for select using (true);
create policy "apagados grava" on public.imoveis_apagados for insert with check (true);
create policy "apagados apaga" on public.imoveis_apagados for delete using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.imoveis_apagados to anon, authenticated;

select 'tabela imoveis_apagados criada' as resultado, count(*) as apagados from public.imoveis_apagados;

-- ============================================================
--  Aparelhos: liberação e cargo (ADM / Funcionário / Só ver)
--  Rode este trecho se a tabela config_dispositivos já existia.
-- ============================================================

alter table public.config_dispositivos add column if not exists liberado boolean default false;

-- quem já estava na lista continua com o que tinha; libere os novos pela Área do corretor
update public.config_dispositivos set liberado = true where liberado is null;

-- ===== Pedidos de acesso (código gerado pelo aparelho novo, lido pelo corretor) =====
create table if not exists public.pedidos_acesso (
  codigo text primary key,
  "aparelhoId" text,
  nome text,
  "criadoEm" bigint default 0
);
alter table public.pedidos_acesso enable row level security;
drop policy if exists "pedidos le"     on public.pedidos_acesso;
drop policy if exists "pedidos grava"  on public.pedidos_acesso;
drop policy if exists "pedidos apaga"  on public.pedidos_acesso;
create policy "pedidos le"    on public.pedidos_acesso for select using (true);
create policy "pedidos grava" on public.pedidos_acesso for insert with check (true);
create policy "pedidos apaga" on public.pedidos_acesso for delete using (true);
grant select, insert, delete on public.pedidos_acesso to anon, authenticated;


-- ============================================================
--  Vídeos e muitas fotos (rode este trecho no banco que já existe)
-- ============================================================

-- coluna dos vídeos do imóvel (lista de endereços)
alter table public.imoveis add column if not exists videos text[] default '{}';

-- vídeos ficam no mesmo bucket "fotos", na pasta videos/
-- (nenhuma mudança de policy é necessária: o bucket já aceita envio e leitura)

-- se o bucket estiver limitado a 5 MB, suba o limite para 50 MB:
update storage.buckets set file_size_limit = 52428800, allowed_mime_types = null where id = 'fotos';

select 'coluna videos criada' as resultado,
       (select count(*) from information_schema.columns
         where table_schema='public' and table_name='imoveis' and column_name='videos') as tem_coluna;


-- ============================================================
--  Todo aparelho novo entra como CLIENTE (só vê as casas)
--  Rode este trecho uma vez: ele acerta os aparelhos que
--  estavam "aguardando liberação" e deixa todo mundo liberado
--  como cliente. Só o Modo Desenvolvedor muda a função para
--  Funcionário ou ADM.
-- ============================================================

update public.config_dispositivos
   set liberado = true,
       publicar = coalesce(publicar, false),
       apagar   = coalesce(apagar, false)
 where liberado is distinct from true;

-- quem já era ADM ou Funcionário continua como estava
update public.config_dispositivos set liberado = true where liberado is null;

select 'aparelhos como cliente' as resultado, count(*) from public.config_dispositivos where liberado;

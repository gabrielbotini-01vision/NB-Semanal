-- =============================================================================
-- Comentários do New Business Cockpit · schema + RLS + realtime (Supabase / Postgres)
-- Cole isto no Supabase → SQL Editor → Run. Roda uma vez.
-- Segurança: só e-mails @hotmart.com autenticados (magic link) leem/escrevem.
-- A anon key do Supabase é PÚBLICA por design — o controle real é este RLS aqui.
-- =============================================================================

create table if not exists public.comentarios (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid,                       -- raiz da thread (preenchido pelo trigger p/ comentário raiz)
  parent_id   uuid references public.comentarios(id) on delete cascade,  -- resposta responde a quem
  semana      text,                       -- semana que estava no filtro (ex.: '2026-W30')
  aba         text,                       -- contexto (ex.: 'warea/sdr', 'wsales', 'mensal')
  ancora      text,                       -- onde no HTML o pin está (ex.: 'sdr.estoque')
  autor_email text not null,
  autor_nome  text,
  texto       text not null check (char_length(texto) between 1 and 4000),
  resolvido   boolean not null default false,
  criado_em   timestamptz not null default now()
);

create index if not exists comentarios_ctx_idx    on public.comentarios (semana, aba);
create index if not exists comentarios_thread_idx on public.comentarios (thread_id, criado_em);

-- comentário raiz: thread_id = seu próprio id (respostas já mandam o thread_id da raiz)
create or replace function public.set_thread_id() returns trigger
language plpgsql as $$
begin
  if new.thread_id is null then new.thread_id := new.id; end if;
  return new;
end $$;

drop trigger if exists comentarios_set_thread on public.comentarios;
create trigger comentarios_set_thread before insert on public.comentarios
  for each row execute function public.set_thread_id();

-- e-mail logado é @hotmart.com? (claim do JWT do Supabase Auth)
create or replace function public.is_hotmart() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() ->> 'email') like '%@hotmart.com', false);
$$;

alter table public.comentarios enable row level security;

-- LER: qualquer usuário @hotmart.com autenticado
drop policy if exists "hotmart le" on public.comentarios;
create policy "hotmart le" on public.comentarios
  for select using (public.is_hotmart());

-- INSERIR: @hotmart.com e autor_email = próprio e-mail (impede se passar por outro)
drop policy if exists "hotmart comenta" on public.comentarios;
create policy "hotmart comenta" on public.comentarios
  for insert with check (
    public.is_hotmart() and autor_email = (auth.jwt() ->> 'email')
  );

-- EDITAR (resolver/editar): só o autor
drop policy if exists "autor edita" on public.comentarios;
create policy "autor edita" on public.comentarios
  for update using (autor_email = (auth.jwt() ->> 'email'))
  with check (autor_email = (auth.jwt() ->> 'email'));

-- APAGAR: só o autor
drop policy if exists "autor apaga" on public.comentarios;
create policy "autor apaga" on public.comentarios
  for delete using (autor_email = (auth.jwt() ->> 'email'));

-- Realtime (comentário aparece ao vivo pra todos na reunião)
alter publication supabase_realtime add table public.comentarios;

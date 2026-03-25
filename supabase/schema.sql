create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'user');
create type public.modo_operacao as enum ('agressivo', 'conservador');
create type public.direcao_operacao as enum ('compra', 'venda');
create type public.status_operacao as enum ('aberta', 'fechada', 'cancelada');
create type public.status_licenca as enum ('ativa', 'expirada', 'bloqueada', 'cancelada', 'pendente');

create table if not exists public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text,
  email text unique,
  telegram_id text,
  role public.user_role not null default 'user',
  acesso_ativo boolean not null default true,
  ativo_padrao text not null default 'XAUUSD',
  timeframe_padrao text not null default 'M5',
  criado_em timestamptz not null default timezone('utc', now()),
  atualizado_em timestamptz not null default timezone('utc', now())
);

create table if not exists public.contas_trading (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios (id) on delete cascade,
  nome_cliente text not null,
  numero_conta text not null,
  corretora text,
  servidor text,
  moeda_codigo text not null default 'USD',
  moeda_simbolo text not null default '$',
  saldo_atual numeric(14, 2) not null default 0,
  equity numeric(14, 2) not null default 0,
  margem numeric(14, 2) not null default 0,
  margem_livre numeric(14, 2) not null default 0,
  nivel_margem numeric(10, 2) not null default 0,
  alavancagem integer,
  ativo boolean not null default false,
  atualizado_em timestamptz not null default timezone('utc', now()),
  criado_em timestamptz not null default timezone('utc', now()),
  mt5_server text,
  mt5_password text,
  server_time timestamptz,
  mercado_snapshot jsonb,
  insight_atual text,
  ultima_sincronizacao timestamptz,
  unique (user_id, numero_conta)
);

create table if not exists public.licencas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios (id) on delete cascade,
  conta_trading_id uuid not null references public.contas_trading (id) on delete cascade,
  nome_plano text not null default 'Licenca Padrao',
  status public.status_licenca not null default 'pendente',
  valor numeric(12, 2) not null default 0,
  data_inicio date not null default current_date,
  data_expiracao date not null,
  bloqueio_automatico boolean not null default true,
  observacoes text,
  criado_em timestamptz not null default timezone('utc', now()),
  atualizado_em timestamptz not null default timezone('utc', now()),
  unique (conta_trading_id)
);

create table if not exists public.ativos_config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios (id) on delete cascade,
  conta_trading_id uuid not null references public.contas_trading (id) on delete cascade,
  ativo text not null,
  timeframe text not null default 'M5',
  risco_por_operacao numeric(8, 4) not null default 0.01,
  ativo_principal boolean not null default false,
  criado_em timestamptz not null default timezone('utc', now()),
  atualizado_em timestamptz not null default timezone('utc', now())
);

create table if not exists public.configuracoes_sessao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios (id) on delete cascade,
  conta_trading_id uuid not null references public.contas_trading (id) on delete cascade,
  ativo text not null,
  sistema_ligado boolean not null default false,
  modo public.modo_operacao not null default 'conservador',
  breakeven_ativo boolean not null default true,
  trailing_stop_ativo boolean not null default true,
  horario_inicio time not null,
  horario_fim time not null,
  meta_lucro_diaria numeric(12, 2) not null default 0,
  perda_maxima_diaria numeric(12, 2) not null default 0,
  limite_operacoes_ativo boolean not null default false,
  limite_operacoes_diaria integer,
  observacoes text,
  atualizado_em timestamptz not null default timezone('utc', now()),
  timeframe text not null default 'M5'
);

create table if not exists public.operacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios (id) on delete cascade,
  conta_trading_id uuid not null references public.contas_trading (id) on delete cascade,
  ativo_config_id uuid references public.ativos_config (id) on delete set null,
  ativo text not null,
  timeframe text not null,
  direcao public.direcao_operacao not null,
  status public.status_operacao not null default 'aberta',
  lote numeric(10, 2) not null,
  preco_entrada numeric(12, 5) not null,
  preco_saida numeric(12, 5),
  stop_loss numeric(12, 5),
  take_profit numeric(12, 5),
  lucro_prejuizo numeric(12, 2) not null default 0,
  spread numeric(10, 3),
  volume numeric(14, 2),
  volatilidade numeric(14, 4),
  be_ativo boolean not null default false,
  ts_ativo boolean not null default false,
  validacao_ia jsonb,
  motivo_fechamento text,
  aberta_em timestamptz not null default timezone('utc', now()),
  fechada_em timestamptz
);

create table if not exists public.estatisticas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios (id) on delete cascade,
  conta_trading_id uuid not null references public.contas_trading (id) on delete cascade,
  ativo text not null,
  periodo date not null,
  operacoes_total integer not null default 0,
  vitorias integer not null default 0,
  derrotas integer not null default 0,
  win_rate numeric(6, 2) not null default 0,
  lucro_total numeric(12, 2) not null default 0,
  prejuizo_total numeric(12, 2) not null default 0,
  drawdown numeric(10, 2) not null default 0,
  melhor_operacao numeric(12, 2) not null default 0,
  pior_operacao numeric(12, 2) not null default 0,
  criado_em timestamptz not null default timezone('utc', now()),
  unique (user_id, conta_trading_id, ativo, periodo)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.is_admin(user_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios
    where id = user_uuid
      and role = 'admin'
      and acesso_ativo = true
  );
$$;

create or replace function public.licenca_ativa(user_uuid uuid, trading_account_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.licencas l
    join public.usuarios u on u.id = l.user_id
    where l.user_id = user_uuid
      and l.conta_trading_id = trading_account_uuid
      and u.acesso_ativo = true
      and l.status = 'ativa'
      and l.data_inicio <= current_date
      and l.data_expiracao >= current_date
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, nome, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update
  set
    nome = excluded.nome,
    email = excluded.email,
    atualizado_em = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists trg_usuarios_updated_at on public.usuarios;
create trigger trg_usuarios_updated_at
before update on public.usuarios
for each row
execute function public.set_updated_at();

drop trigger if exists trg_contas_trading_updated_at on public.contas_trading;
create trigger trg_contas_trading_updated_at
before update on public.contas_trading
for each row
execute function public.set_updated_at();

drop trigger if exists trg_licencas_updated_at on public.licencas;
create trigger trg_licencas_updated_at
before update on public.licencas
for each row
execute function public.set_updated_at();

drop trigger if exists trg_ativos_config_updated_at on public.ativos_config;
create trigger trg_ativos_config_updated_at
before update on public.ativos_config
for each row
execute function public.set_updated_at();

drop trigger if exists trg_configuracoes_sessao_updated_at on public.configuracoes_sessao;
create trigger trg_configuracoes_sessao_updated_at
before update on public.configuracoes_sessao
for each row
execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.usuarios enable row level security;
alter table public.contas_trading enable row level security;
alter table public.licencas enable row level security;
alter table public.ativos_config enable row level security;
alter table public.configuracoes_sessao enable row level security;
alter table public.operacoes enable row level security;
alter table public.estatisticas enable row level security;

drop policy if exists "usuarios_select_policy" on public.usuarios;
create policy "usuarios_select_policy"
on public.usuarios
for select
using (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists "usuarios_update_policy" on public.usuarios;
create policy "usuarios_update_policy"
on public.usuarios
for update
using (auth.uid() = id or public.is_admin(auth.uid()))
with check (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists "contas_trading_select_policy" on public.contas_trading;
create policy "contas_trading_select_policy"
on public.contas_trading
for select
using (
  public.is_admin(auth.uid())
  or (
    auth.uid() = user_id
    and public.licenca_ativa(auth.uid(), id)
  )
);

drop policy if exists "contas_trading_admin_write_policy" on public.contas_trading;
create policy "contas_trading_admin_write_policy"
on public.contas_trading
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "licencas_select_policy" on public.licencas;
create policy "licencas_select_policy"
on public.licencas
for select
using (public.is_admin(auth.uid()) or auth.uid() = user_id);

drop policy if exists "licencas_admin_write_policy" on public.licencas;
create policy "licencas_admin_write_policy"
on public.licencas
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "ativos_config_select_policy" on public.ativos_config;
create policy "ativos_config_select_policy"
on public.ativos_config
for select
using (
  public.is_admin(auth.uid())
  or (
    auth.uid() = user_id
    and public.licenca_ativa(auth.uid(), conta_trading_id)
  )
);

drop policy if exists "ativos_config_write_policy" on public.ativos_config;
create policy "ativos_config_write_policy"
on public.ativos_config
for all
using (
  public.is_admin(auth.uid())
  or (
    auth.uid() = user_id
    and public.licenca_ativa(auth.uid(), conta_trading_id)
  )
)
with check (
  public.is_admin(auth.uid())
  or (
    auth.uid() = user_id
    and public.licenca_ativa(auth.uid(), conta_trading_id)
  )
);

drop policy if exists "configuracoes_sessao_select_policy" on public.configuracoes_sessao;
create policy "configuracoes_sessao_select_policy"
on public.configuracoes_sessao
for select
using (
  public.is_admin(auth.uid())
  or (
    auth.uid() = user_id
    and public.licenca_ativa(auth.uid(), conta_trading_id)
  )
);

drop policy if exists "configuracoes_sessao_write_policy" on public.configuracoes_sessao;
create policy "configuracoes_sessao_write_policy"
on public.configuracoes_sessao
for all
using (
  public.is_admin(auth.uid())
  or (
    auth.uid() = user_id
    and public.licenca_ativa(auth.uid(), conta_trading_id)
  )
)
with check (
  public.is_admin(auth.uid())
  or (
    auth.uid() = user_id
    and public.licenca_ativa(auth.uid(), conta_trading_id)
  )
);

drop policy if exists "operacoes_select_policy" on public.operacoes;
create policy "operacoes_select_policy"
on public.operacoes
for select
using (
  public.is_admin(auth.uid())
  or (
    auth.uid() = user_id
    and public.licenca_ativa(auth.uid(), conta_trading_id)
  )
);

drop policy if exists "operacoes_admin_write_policy" on public.operacoes;
create policy "operacoes_admin_write_policy"
on public.operacoes
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "estatisticas_select_policy" on public.estatisticas;
create policy "estatisticas_select_policy"
on public.estatisticas
for select
using (
  public.is_admin(auth.uid())
  or (
    auth.uid() = user_id
    and public.licenca_ativa(auth.uid(), conta_trading_id)
  )
);

drop policy if exists "estatisticas_admin_write_policy" on public.estatisticas;
create policy "estatisticas_admin_write_policy"
on public.estatisticas
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contas_trading'
  ) then
    alter publication supabase_realtime add table public.contas_trading;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'licencas'
  ) then
    alter publication supabase_realtime add table public.licencas;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'configuracoes_sessao'
  ) then
    alter publication supabase_realtime add table public.configuracoes_sessao;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'operacoes'
  ) then
    alter publication supabase_realtime add table public.operacoes;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'estatisticas'
  ) then
    alter publication supabase_realtime add table public.estatisticas;
  end if;
end
$$;

create index if not exists idx_contas_trading_numero_conta on public.contas_trading (numero_conta);
create index if not exists idx_licencas_conta_status_expiracao on public.licencas (conta_trading_id, status, data_expiracao);
create index if not exists idx_configuracoes_sessao_conta_ligado on public.configuracoes_sessao (conta_trading_id, sistema_ligado, atualizado_em desc);
create index if not exists idx_operacoes_conta_aberta_em on public.operacoes (conta_trading_id, aberta_em desc);
create index if not exists idx_operacoes_conta_status on public.operacoes (conta_trading_id, status);

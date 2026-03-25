create type public.tipo_comando_trading as enum ('open_buy', 'open_sell', 'close_position');
create type public.status_comando_trading as enum ('pending', 'processing', 'executed', 'failed', 'cancelled');

create table if not exists public.comandos_trading (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios (id) on delete cascade,
  conta_trading_id uuid not null references public.contas_trading (id) on delete cascade,
  ativo text not null,
  timeframe text not null default 'M5',
  tipo public.tipo_comando_trading not null,
  status public.status_comando_trading not null default 'pending',
  lote numeric(10, 2),
  stop_loss numeric(12, 5),
  take_profit numeric(12, 5),
  ticket_referencia text,
  payload jsonb,
  resultado jsonb,
  erro text,
  solicitado_em timestamptz not null default timezone('utc', now()),
  processado_em timestamptz
);

alter table public.comandos_trading enable row level security;

drop policy if exists "comandos_trading_select_policy" on public.comandos_trading;
create policy "comandos_trading_select_policy"
on public.comandos_trading
for select
using (
  public.is_admin(auth.uid())
  or (
    auth.uid() = user_id
    and public.licenca_ativa(auth.uid(), conta_trading_id)
  )
);

drop policy if exists "comandos_trading_write_policy" on public.comandos_trading;
create policy "comandos_trading_write_policy"
on public.comandos_trading
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

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comandos_trading'
  ) then
    alter publication supabase_realtime add table public.comandos_trading;
  end if;
end
$$;

create index if not exists idx_comandos_trading_conta_status_solicitado on public.comandos_trading (conta_trading_id, status, solicitado_em asc);

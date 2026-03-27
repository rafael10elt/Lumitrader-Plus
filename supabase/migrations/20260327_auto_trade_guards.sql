do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.tipo_comando_trading'::regtype
      and enumlabel = 'partial_close_position'
  ) then
    alter type public.tipo_comando_trading add value 'partial_close_position';
  end if;
end
$$;

with ranked_open_commands as (
  select
    id,
    row_number() over (
      partition by conta_trading_id
      order by solicitado_em desc, id desc
    ) as row_number
  from public.comandos_trading
  where tipo in ('open_buy', 'open_sell')
    and status in ('pending', 'processing')
)
update public.comandos_trading command_row
set
  status = 'cancelled',
  erro = coalesce(command_row.erro, 'Cancelado por migracao de trava unica para abertura automatica.'),
  processado_em = coalesce(command_row.processado_em, timezone('utc', now()))
from ranked_open_commands ranked
where command_row.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists idx_comandos_trading_unique_open_active
on public.comandos_trading (conta_trading_id)
where tipo in ('open_buy', 'open_sell')
  and status in ('pending', 'processing');

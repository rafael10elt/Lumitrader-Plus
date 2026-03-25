update public.contas_trading
set servidor = coalesce(nullif(mt5_server, ''), servidor)
where coalesce(nullif(mt5_server, ''), '') <> '';

alter table public.contas_trading
  drop column if exists mt5_server;

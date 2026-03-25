alter table public.contas_trading
  add column if not exists mt5_login text,
  add column if not exists mt5_server text,
  add column if not exists mt5_password text;

alter table public.configuracoes_sessao
  add column if not exists timeframe text not null default 'M5';

update public.contas_trading
set mt5_login = coalesce(mt5_login, numero_conta)
where mt5_login is null;

update public.configuracoes_sessao
set timeframe = 'M5'
where timeframe is null;

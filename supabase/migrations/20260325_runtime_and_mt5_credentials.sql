alter table public.contas_trading
  drop column if exists mt5_login,
  add column if not exists mt5_server text,
  add column if not exists mt5_password text,
  add column if not exists server_time timestamptz,
  add column if not exists mercado_snapshot jsonb,
  add column if not exists insight_atual text,
  add column if not exists ultima_sincronizacao timestamptz;

alter table public.configuracoes_sessao
  add column if not exists timeframe text not null default 'M5';

update public.configuracoes_sessao
set timeframe = 'M5'
where timeframe is null;

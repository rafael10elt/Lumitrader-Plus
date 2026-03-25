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


create index if not exists idx_contas_trading_numero_conta on public.contas_trading (numero_conta);
create index if not exists idx_licencas_conta_status_expiracao on public.licencas (conta_trading_id, status, data_expiracao);
create index if not exists idx_configuracoes_sessao_conta_ligado on public.configuracoes_sessao (conta_trading_id, sistema_ligado, atualizado_em desc);
create index if not exists idx_operacoes_conta_aberta_em on public.operacoes (conta_trading_id, aberta_em desc);
create index if not exists idx_operacoes_conta_status on public.operacoes (conta_trading_id, status);

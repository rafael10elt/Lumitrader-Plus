# Lumitrader Backend Reporting

Fluxo implementado:

1. MT5/Python envia evento para `POST /api/backend/trading/events`.
2. O backend valida o token de ingestao.
3. Carrega usuario, conta MT5, licenca e configuracoes da conta no Supabase.
4. Atualiza snapshot da conta e registra abertura ou fechamento da operacao.
5. Recalcula estatisticas do dia para a conta.
6. Calcula risco e chama a OpenAI diretamente no backend.
7. Monta relatorio em JSON, CSV e HTML.
8. Envia o relatorio para o webhook do n8n.
9. O n8n fica responsavel apenas por distribuir no Telegram.

Contrato principal do endpoint:

- Header: `Authorization: Bearer LUMITRADER_INGEST_TOKEN`
- URL local: `http://localhost:3000/api/backend/trading/events`
- Eventos suportados: `operation_opened`, `operation_closed`

Campos importantes do payload:

- `account.number`
- `account.currency_code`
- `account.currency_symbol`
- `account.balance`
- `account.equity`
- `operation.symbol`
- `operation.side`
- `operation.lot`
- `operation.entry_price`
- `operation.profit_loss`
- `operation.opened_at`
- `operation.closed_at`

Observacao: a atualizacao de fechamento parte da regra operacional de apenas uma operacao aberta por conta ao mesmo tempo.

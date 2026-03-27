# Lumitrader

Plataforma de trading algorítmico com bridge MT5, dashboard operacional em tempo real, autenticação Supabase e automação assistida por IA.

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase
- Bridge Python para MT5

## Rodando localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Variáveis de ambiente

Configure as variáveis do app web e backend conforme o ambiente:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
LUMITRADER_INGEST_TOKEN=
NEXT_PUBLIC_SITE_URL=
```

## Arquivos principais

- `src/app/dashboard/page.tsx`: composição do dashboard operacional
- `src/components/dashboard/dashboard-realtime-fixed.tsx`: painel em tempo real usado em produção
- `src/lib/backend/reporting.ts`: orquestração de eventos operacionais
- `src/lib/backend/auto-trader.ts`: motor matemático e travas operacionais
- `src/lib/backend/openai.ts`: validação por IA e resumo operacional
- `src/lib/backend/supabase.ts`: persistência operacional e reconciliação
- `LumitraderBridge/mt5_reporter.py`: bridge MT5 principal para VPS

## Estado atual do produto

- autenticação e sessão protegida com Supabase
- dashboard operacional com polling de segurança e realtime por Supabase
- comandos manuais e automáticos via fila `comandos_trading`
- bridge MT5 com sincronização de conta, posições e fechamentos
- trava de posição única por conta
- sizing dinâmico por risco
- validação curta por IA apenas após aprovação matemática

## Observação operacional

Para VPS Windows multi-instância, use uma pasta `LumitraderBridge-X` por conta, com `ACCOUNT_NUMBER` e `MT5_TERMINAL_PATH` específicos para cada terminal MT5.

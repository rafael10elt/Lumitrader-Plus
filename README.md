# Lumitrader

Plataforma de trading algorítmico inteligente com foco inicial em XAUUSD e arquitetura preparada para múltiplos ativos.

## Stack inicial

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase JS
- Base PWA

## Rodando localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Variáveis de ambiente

Use o arquivo [`.env.example`](C:\Lumitechia\Lumitrader-Plus\.env.example) como referência.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Arquivos principais

- [`src/app/page.tsx`](C:\Lumitechia\Lumitrader-Plus\src\app\page.tsx): dashboard inicial do Lumitrader
- [`src/lib/supabase/client.ts`](C:\Lumitechia\Lumitrader-Plus\src\lib\supabase\client.ts): cliente base do Supabase
- [`supabase/schema.sql`](C:\Lumitechia\Lumitrader-Plus\supabase\schema.sql): SQL inicial para o Supabase

## Próximas etapas

1. Executar o SQL no Supabase.
2. Ligar autenticação com Supabase Auth.
3. Integrar o fluxo MT5 -> Python -> n8n -> Supabase.
4. Trocar os dados mockados do dashboard por dados reais.
5. Publicar no Netlify com as mesmas variáveis de ambiente.

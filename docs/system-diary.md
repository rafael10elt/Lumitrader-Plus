# Diario do Sistema Lumitrader

## O que e o projeto
O Lumitrader e uma plataforma SaaS de trading conectada ao MT5, com dashboard web em Next.js, sincronizacao operacional via bridge Python e automacao de entradas/saidas baseada em regras e validacoes de IA.

A proposta ideal do projeto e:
- receber dados reais do MT5 em tempo quase real
- respeitar como regra maxima os inputs do usuario (ativo, timeframe, modo, horario, meta, perda, limite de operacoes, breakeven, trailing, risco por operacao)
- fazer primeiro a validacao matematica da oportunidade
- usar IA somente quando houver oportunidade coerente e contexto para decidir melhor
- operar com seguranca: uma posicao por vez, ticket correto, reconciliacao entre MT5 e banco, painel fiel ao estado real

## Arquitetura resumida
- `LumitraderBridge/mt5_reporter.py`: bridge MT5, leitura de conta/posicoes e execucao de comandos
- `src/app/api/backend/bridge/accounts/route.ts`: entrega as contas/configuracoes consumidas pela bridge
- `src/app/api/backend/trading/events`: recebe eventos do bridge
- `src/lib/backend/reporting.ts`: orquestra sincronizacao, automacao, IA e relatorios
- `src/lib/backend/supabase.ts`: contexto, persistencia, reconciliacao, enfileiramento e estatisticas
- `src/lib/backend/auto-trader.ts`: motor matematico de oportunidade e sizing
- `src/lib/backend/openai.ts`: resumos de operacao e validacao IA de oportunidade
- `src/app/dashboard/page.tsx`: resolve os dados do dashboard no servidor
- `src/components/dashboard/dashboard-realtime-fixed.tsx`: painel operacional em tempo real

## Regras de ouro atuais
- apenas 1 posicao aberta por conta
- comandos de abertura nao devem passar se houver posicao aberta ou comando pendente
- parcial/fechamento exigem ticket valido para evitar atingir a operacao errada
- painel deve refletir estado real automaticamente, sem depender de F5

## Implementacoes concluidas
### Sincronizacao e operacao
- reconciliacao de operacoes abertas com tickets reais do MT5
- bloqueio contra abertura multipla no backend e na bridge
- parcial/fechamento protegidos por ticket de referencia
- sincronizacao mais frequente do bridge
- dashboard com polling de seguranca, foco/visibility refresh e fallback por tickets abertos no snapshot

### Dashboard
- troca de conta corrigida
- operacao atual e botoes de manejo habilitados automaticamente quando houver posicao detectada
- timeline ajustada para exibir cerca de 10 registros com rolagem
- reorganizacao do layout para reduzir espacos vazios
- melhorias de responsividade para mobile, especialmente nos containers e no grafico

### Risco e sizing
- risco por operacao passou a ser parametro persistido em `ativos_config`
- dashboard resolve e exibe `risco_por_operacao`
- bridge recebe `risco_por_operacao`
- auto trader deixou de usar lote fixo e passou a calcular lote dinamicamente por saldo, perda diaria restante e distancia do stop

### IA
- IA continua gerando resumo pos-operacao
- validacao IA leve foi adicionada ao fluxo de `account_sync`, sendo chamada apenas quando a matematica ja encontrou uma oportunidade valida
- cache curto em memoria evita chamar a IA repetidamente para o mesmo cenario

## Pendencias principais para chegar perto do ideal
- evoluir de validacao IA para decisao IA mais contextual, sem abandonar o gate matematico
- enriquecer o modelo de risco por ativo/simbolo (o fator atual ainda e simplificado)
- melhorar a memoria operacional do sistema para cooldowns e contexto persistente entre sinais
- ampliar a observabilidade do motivo de cada entrada recusada ou aprovada no painel/admin
- continuar limpando estados legados e casos extremos de reconciliacao

## Convencoes uteis
- `risco_por_operacao` e salvo em decimal no banco (`0.01 = 1%`)
- no dashboard o usuario ve e edita isso em percentual
- `account_sync` deve ser rapido; IA so entra quando existe oportunidade matematica
- o painel deve priorizar dados reais do MT5 quando houver discrepancia entre banco e sincronizacao recente

## Atualizacao mais recente
- lote automatico dinamico por risco implementado
- validacao IA para oportunidades automaticas implementada com cache curto
- diario tecnico criado para servir como memoria do projeto
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
- `src/lib/backend/auto-trader.ts`: motor matematico de gates duros, planos de risco e candidatos de entrada
- `src/lib/backend/openai.ts`: decisao IA de oportunidade e resumos de operacao
- `src/app/dashboard/page.tsx`: resolve os dados do dashboard no servidor
- `src/components/dashboard/dashboard-realtime-fixed.tsx`: painel operacional em tempo real

## Regras de ouro atuais
- apenas 1 posicao aberta por conta
- comandos de abertura nao devem passar se houver posicao aberta ou comando pendente
- parcial/fechamento exigem ticket valido para evitar atingir a operacao errada
- painel deve refletir estado real automaticamente, sem depender de F5
- a IA so pode decidir quando a conta estiver em PLAY, dentro da janela operacional e sem violar limites diarios

## Implementacoes concluidas
### Sincronizacao e operacao
- reconciliacao de operacoes abertas com tickets reais do MT5
- bloqueio contra abertura multipla no backend e na bridge
- parcial/fechamento protegidos por ticket de referencia
- sincronizacao mais frequente do bridge
- dashboard com polling de seguranca, foco/visibility refresh e fallback por tickets abertos no snapshot
- a bridge continua sincronizando mesmo com a automacao pausada; `PLAY/PAUSE` agora controla a IA, nao a telemetria

### Dashboard
- troca de conta corrigida
- operacao atual e botoes de manejo habilitados automaticamente quando houver posicao detectada
- timeline ajustada para exibir cerca de 10 registros com rolagem
- reorganizacao do layout para reduzir espacos vazios
- melhorias de responsividade para mobile, especialmente nos containers e no grafico
- status da IA trader reflete `Pronta`, `Bloqueada` ou `Aguardando` via `automation_status`

### Risco e sizing
- risco por operacao passou a ser parametro persistido em `ativos_config`
- dashboard resolve e exibe `risco_por_operacao`
- bridge recebe `risco_por_operacao`
- auto trader deixou de usar lote fixo e passou a calcular lote dinamicamente por saldo, perda diaria restante e distancia do stop
- candidatos de compra e venda agora sao montados matematicamente com RR minimo antes de chegar na IA

### IA
- IA continua gerando resumo pos-operacao
- a IA agora e o decisor central da oportunidade: depois dos gates duros e da validacao matematica, ela escolhe `open_buy`, `open_sell` ou `wait`
- cache curto em memoria evita chamar a IA repetidamente para o mesmo cenario
- se a OpenAI estiver indisponivel, a automacao automatica fica bloqueada em vez de operar sem IA

### Integridade do backend
- comandos de abertura ganharam trava unica por conta no banco para impedir dupla fila sob concorrencia
- fechamento parcial agora atualiza estatisticas diarias
- reconciliacao ficou menos agressiva com operacoes sem ticket para evitar fechar linha valida por engano

## Pendencias principais para chegar perto do ideal
- enriquecer ainda mais o contexto enviado para a IA com memoria operacional persistente entre sinais
- refinar o modelo de risco por simbolo/ativo (o fator atual ainda e simplificado)
- ampliar a observabilidade administrativa dos motivos de bloqueio/aprovacao e historico de decisoes IA
- continuar limpando estados legados e casos extremos de reconciliacao antiga
- homologar a migration da trava unica em todos os ambientes Supabase

## Convencoes uteis
- `risco_por_operacao` e salvo em decimal no banco (`0.01 = 1%`)
- no dashboard o usuario ve e edita isso em percentual
- `account_sync` deve ser rapido; IA so entra quando gates duros e estrutura matematica aprovam o cenario
- o painel deve priorizar dados reais do MT5 quando houver discrepancia entre banco e sincronizacao recente

## Atualizacao mais recente
- sincronizacao da bridge desacoplada de `sistema_ligado`
- trava unica no banco para comandos de abertura ativos
- enum de comandos preparada para `partial_close_position`
- fechamento parcial passou a recalcular estatisticas
- IA promovida a decisor central entre `buy`, `sell` e `wait` apos gates duros e planos matematicos

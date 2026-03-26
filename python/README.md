# Lumitrader Python Layer

Arquivos:

- `mt5_reporter.py`: bridge multi-conta para VPS Windows com MT5 aberto.
- `send_test_event.py`: dispara um evento de teste manual no backend.
- `.env.example`: variaveis do bridge.
- `requirements.txt`: dependencias Python.

Uso rapido:

```bash
pip install -r requirements.txt
copy .env.example .env
python send_test_event.py
python mt5_reporter.py
```

O `mt5_reporter.py` nao depende mais de login, servidor e senha no `.env`.
Esses dados passam a vir do banco, por conta/licenca, sempre que a conta estiver em `Play`.

A `.env` da pasta `python` agora precisa ter apenas:

```txt
LUMITRADER_BACKEND_URL
LUMITRADER_INGEST_TOKEN
POLL_INTERVAL_SECONDS
```

Fluxo do bridge:

1. Busca no backend quais contas estao ativas e em `Play`.
2. Faz login sequencial nelas no MT5 da VPS.
3. Envia `account_sync` com saldo, equity, corretora, horario do servidor e candles.
4. Envia `operation_opened` e `operation_closed` quando detectar ordens.

## Rodar 24/7 no Windows (Hyonix)

Caminho recomendado: Agendador de Tarefas do Windows.

1. Confirme que o MT5 esta instalado, aberto e logado na VPS.
2. Na pasta `python`, instale as dependencias com `python -m pip install -r requirements.txt`.
3. Confirme que `python/.env` tem `LUMITRADER_BACKEND_URL`, `LUMITRADER_INGEST_TOKEN` e `POLL_INTERVAL_SECONDS`.
4. Se quiser testar manualmente, rode `powershell -ExecutionPolicy Bypass -File .\run_mt5_reporter.ps1`.
5. Para instalar a execucao automatica ao ligar a VPS, rode `powershell -ExecutionPolicy Bypass -File .\install_mt5_reporter_task.ps1`.
6. Logs ficam em `python\logs\mt5_reporter.out.log` e `python\logs\mt5_reporter.err.log`.

Comandos uteis:

```powershell
Get-ScheduledTask -TaskName "Lumitrader MT5 Reporter"
Start-ScheduledTask -TaskName "Lumitrader MT5 Reporter"
Stop-ScheduledTask -TaskName "Lumitrader MT5 Reporter"
Get-Content .\logs\mt5_reporter.out.log -Tail 50
Get-Content .\logs\mt5_reporter.err.log -Tail 50
```

Observacoes:

- O bridge depende do terminal MT5 estar aberto na sessao do Windows.
- Se a Hyonix reiniciar a maquina, a tarefa sobe novamente no boot.
- Se preferir rodar somente apos logon do usuario em vez de startup, o script de instalacao pode ser ajustado.
## Opcao sem PowerShell

Se a Hyonix bloquear PowerShell, use os arquivos abaixo pela interface normal do Windows ou pelo `cmd`:

- `run_mt5_reporter.bat`: roda o bridge e grava logs em `python\logs`.
- `start_mt5_reporter_hidden.vbs`: inicia o `.bat` sem abrir janela.
- `install_mt5_reporter_startup.bat`: copia o `.vbs` para a pasta Startup do usuario.

Fluxo recomendado:

1. Teste manual: clique duas vezes em `run_mt5_reporter.bat` ou rode `cmd /c run_mt5_reporter.bat`.
2. Se estiver tudo certo, instale o auto start: clique duas vezes em `install_mt5_reporter_startup.bat`.
3. Depois faca logoff/logon ou reinicie a VPS.
4. Confira os logs em `python\logs\mt5_reporter.out.log` e `python\logs\mt5_reporter.err.log`.

Observacao:

- Essa opcao inicia depois que o usuario entra na sessao do Windows. Como o MT5 precisa estar aberto na sessao grafica, isso costuma funcionar melhor do que startup de sistema em VPS Windows.
- Se voce realmente quiser um `.exe`, o caminho mais direto e empacotar esse launcher com PyInstaller em uma maquina onde possamos instalar a dependencia.
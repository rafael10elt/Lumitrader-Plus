# LumitraderBridge

Pacote standalone para rodar o bridge MT5 em VPS Windows.

## Modelo operacional correto

- uma pasta `LumitraderBridge-X` por conta MT5
- um `terminal64.exe` por instância
- um `.env` por bridge
- um `ACCOUNT_NUMBER` por bridge

## Arquivos

- `mt5_reporter.py`: bridge principal
- `requirements.txt`: dependências Python
- `run_mt5_reporter.bat`: execução com logs
- `start_mt5_reporter_hidden.vbs`: inicialização oculta
- `install_startup.bat`: auto start após login do Windows
- `logs/`: saída operacional

## Instalação

1. Instale Python.
2. Copie a pasta para a VPS.
3. Instale dependências:

```bat
python -m pip install -r requirements.txt
```

4. Crie `.env` com este formato:

```env
LUMITRADER_BACKEND_URL=https://lumitrader.lumitechia.com.br/api/backend/trading/events
LUMITRADER_INGEST_TOKEN=seu_token
ACCOUNT_NUMBER=1512917276
MT5_TERMINAL_PATH=C:\Users\Administrator\Desktop\MT5 Conta 1\EC Markets MT5 Terminal\terminal64.exe
POLL_INTERVAL_SECONDS=2
```

## Uso

```bat
run_mt5_reporter.bat
```

## Regras importantes

- a bridge só deve operar a conta definida em `ACCOUNT_NUMBER`
- o terminal deve corresponder ao mesmo login configurado para essa conta
- o backend pode bloquear automação, mas a sincronização do estado da conta deve continuar funcional

## Logs

- `logs\mt5_reporter.out.log`
- `logs\mt5_reporter.err.log`

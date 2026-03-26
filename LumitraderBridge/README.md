# LumitraderBridge

Pacote standalone para rodar o bridge MT5 em uma VPS Windows sem depender de PowerShell.

## Arquivos

- `mt5_reporter.py`: bridge principal.
- `requirements.txt`: dependencias Python.
- `.env.example`: modelo de configuracao.
- `run_mt5_reporter.bat`: executa o bridge e grava logs.
- `start_mt5_reporter_hidden.vbs`: inicia o bridge sem abrir janela.
- `install_startup.bat`: instala o autostart na pasta Startup do Windows.
- `logs/`: pasta para os arquivos de log.

## Instalacao

1. Instale o Python para Windows e marque `Add Python to PATH`.
2. Copie esta pasta inteira para a VPS.
3. No `cmd`, entre na pasta e rode:

```bat
python -m pip install -r requirements.txt
```

4. Copie `.env.example` para `.env` e preencha:

```env
LUMITRADER_BACKEND_URL=https://lumitrader.lumitechia.com.br/api/backend/trading/events
LUMITRADER_INGEST_TOKEN=seu_token
POLL_INTERVAL_SECONDS=3
```

## Uso

Teste manual:

```bat
run_mt5_reporter.bat
```

Auto start apos login do Windows:

```bat
install_startup.bat
```

## Logs

- `logs\mt5_reporter.out.log`
- `logs\mt5_reporter.err.log`

## Observacoes

- O MT5 precisa estar aberto e logado na sessao grafica do Windows.
- A opcao Startup inicia melhor nesse tipo de VPS do que um servico puro de sistema.

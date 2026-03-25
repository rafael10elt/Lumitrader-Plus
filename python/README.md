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

# Lumitrader Python Layer

Arquivos:

- `mt5_reporter.py`: monitora aberturas e fechamentos no MT5 e envia eventos para o backend.
- `send_test_event.py`: dispara um evento de teste sem depender de uma operacao real.
- `.env.example`: variaveis para os scripts.
- `requirements.txt`: dependencias Python.

Uso rapido:

```bash
pip install -r requirements.txt
copy .env.example .env
python send_test_event.py
python mt5_reporter.py
```

O `send_test_event.py` ajuda a validar o fluxo inteiro: backend, Supabase, OpenAI e n8n.

O `mt5_reporter.py` faz polling das posicoes abertas e do historico do dia no MT5.
Quando detecta uma abertura, envia `operation_opened`.
Quando detecta um fechamento, envia `operation_closed`.

Header usado no backend:

```txt
Authorization: Bearer LUMITRADER_INGEST_TOKEN
```

URL esperada:

```txt
https://lumitrader.lumitechia.com.br/api/backend/trading/events
```

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from dotenv import dotenv_values

ENV_PATH = Path(__file__).with_name(".env")


def load_env_file() -> None:
    values = dotenv_values(ENV_PATH, encoding="utf-8-sig")
    for key, value in values.items():
        if key and value is not None:
            os.environ[key] = value


load_env_file()

BACKEND_URL = os.getenv("LUMITRADER_BACKEND_URL", "http://localhost:3000/api/backend/trading/events")
INGEST_TOKEN = os.getenv("LUMITRADER_INGEST_TOKEN", "")
ACCOUNT_NUMBER = os.getenv("TEST_ACCOUNT_NUMBER", "1512756960")


def safe_print(value: str) -> None:
    encoding = sys.stdout.encoding or "utf-8"
    print(value.encode(encoding, errors="replace").decode(encoding, errors="replace"))


def build_payload(event: str) -> dict:
    now = datetime.now(timezone.utc)
    opened_at = (now - timedelta(minutes=12)).isoformat().replace("+00:00", "Z")
    closed_at = now.isoformat().replace("+00:00", "Z")

    operation = {
        "ticket": "demo-ticket-001",
        "symbol": "XAUUSD",
        "timeframe": "M5",
        "side": "sell",
        "lot": 0.5,
        "entry_price": 3035.40,
        "stop_loss": 3041.20,
        "take_profit": 3028.10,
        "profit_loss": 137.50 if event == "operation_closed" else 0,
        "opened_at": opened_at,
    }

    if event == "operation_closed":
        operation["exit_price"] = 3032.65
        operation["closed_at"] = closed_at
        operation["close_reason"] = "tp"

    return {
        "event": event,
        "account": {
            "number": str(ACCOUNT_NUMBER),
            "broker": "FTMO",
            "server": "FTMO-Demo",
            "server_time": closed_at,
            "name": "Conta de teste",
            "currency_code": "USD",
            "currency_symbol": "$",
            "balance": 10000,
            "equity": 10137.5,
            "margin": 500,
            "free_margin": 9637.5,
            "margin_level": 2027.5,
            "leverage": 100,
        },
        "operation": operation,
        "session": {
            "mode": "agressivo",
            "breakeven_enabled": True,
            "trailing_stop_enabled": True,
            "profit_target": 1000,
            "daily_loss_limit": 500,
            "operation_limit_enabled": True,
            "operation_limit": 4,
        },
        "market": {
            "trend": "bearish",
            "rsi": 62,
            "moving_average_20": 3038.10,
            "support": 3029.30,
            "resistance": 3042.50,
            "notes": ["Teste manual do fluxo backend + Supabase + OpenAI + n8n"],
            "candles": [
                {"time": opened_at, "open": 3036.1, "high": 3037.2, "low": 3034.8, "close": 3035.4},
                {"time": closed_at, "open": 3035.4, "high": 3036.0, "low": 3032.4, "close": 3032.65}
            ]
        },
    }


def main() -> None:
    if not INGEST_TOKEN:
        raise RuntimeError("Missing LUMITRADER_INGEST_TOKEN")

    event = os.getenv("LUMITRADER_TEST_EVENT", "operation_closed")
    payload = build_payload(event)

    response = requests.post(
        BACKEND_URL,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {INGEST_TOKEN}",
        },
        json=payload,
        timeout=30,
    )
    print(response.status_code)
    safe_print(response.text)
    response.raise_for_status()


if __name__ == "__main__":
    main()

import os
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv

load_dotenv()

BACKEND_URL = os.getenv("LUMITRADER_BACKEND_URL", "http://localhost:3000/api/backend/trading/events")
INGEST_TOKEN = os.getenv("LUMITRADER_INGEST_TOKEN", "")
ACCOUNT_NUMBER = os.getenv("MT5_LOGIN", "12345678")


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
            "notes": [
                "Teste manual do fluxo backend + Supabase + OpenAI + n8n"
            ],
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
        timeout=20,
    )
    print(response.status_code)
    print(response.text)
    response.raise_for_status()


if __name__ == "__main__":
    main()

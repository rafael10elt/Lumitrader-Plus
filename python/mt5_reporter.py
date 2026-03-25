import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict

import MetaTrader5 as mt5
import requests
from dotenv import load_dotenv

load_dotenv()

BACKEND_URL = os.getenv("LUMITRADER_BACKEND_URL", "http://localhost:3000/api/backend/trading/events")
INGEST_TOKEN = os.getenv("LUMITRADER_INGEST_TOKEN", "")
MT5_LOGIN = int(os.getenv("MT5_LOGIN", "0"))
MT5_PASSWORD = os.getenv("MT5_PASSWORD", "")
MT5_SERVER = os.getenv("MT5_SERVER", "")
POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "3"))
STATE_PATH = Path(__file__).with_name("state.json")


@dataclass
class PositionSnapshot:
    ticket: int
    symbol: str
    side: str
    lot: float
    entry_price: float
    stop_loss: float
    take_profit: float
    profit_loss: float
    opened_at: str


def utc_iso(timestamp: int) -> str:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def load_state() -> Dict[str, Dict]:
    if not STATE_PATH.exists():
        return {"open_positions": {}, "recent_history_ids": []}
    return json.loads(STATE_PATH.read_text(encoding="utf-8"))


def save_state(state: Dict[str, Dict]) -> None:
    STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


def initialize_mt5() -> None:
    if not mt5.initialize(login=MT5_LOGIN, password=MT5_PASSWORD, server=MT5_SERVER):
        raise RuntimeError(f"MT5 initialize failed: {mt5.last_error()}")


def account_payload() -> Dict:
    account = mt5.account_info()
    if account is None:
        raise RuntimeError("MT5 account_info returned None")

    currency_code = account.currency or "USD"
    currency_symbol = "$" if currency_code == "USD" else "R$" if currency_code == "BRL" else currency_code
    return {
        "number": str(account.login),
        "broker": getattr(account, "company", None),
        "server": account.server,
        "name": account.name,
        "currency_code": currency_code,
        "currency_symbol": currency_symbol,
        "balance": float(account.balance),
        "equity": float(account.equity),
        "margin": float(account.margin),
        "free_margin": float(account.margin_free),
        "margin_level": float(account.margin_level),
        "leverage": int(account.leverage),
    }


def build_position_snapshot(position) -> PositionSnapshot:
    return PositionSnapshot(
        ticket=int(position.ticket),
        symbol=position.symbol,
        side="buy" if position.type == mt5.POSITION_TYPE_BUY else "sell",
        lot=float(position.volume),
        entry_price=float(position.price_open),
        stop_loss=float(position.sl or 0),
        take_profit=float(position.tp or 0),
        profit_loss=float(position.profit),
        opened_at=utc_iso(position.time),
    )


def send_event(payload: Dict) -> None:
    response = requests.post(
        BACKEND_URL,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {INGEST_TOKEN}",
        },
        json=payload,
        timeout=20,
    )
    response.raise_for_status()
    print(f"Event sent: {payload['event']} -> {payload['operation']['symbol']} -> {response.status_code}")


def handle_open_positions(state: Dict) -> None:
    current_positions = mt5.positions_get() or []
    current_map = {str(position.ticket): build_position_snapshot(position) for position in current_positions}
    account = account_payload()

    for ticket, snapshot in current_map.items():
        if ticket not in state["open_positions"]:
            payload = {
                "event": "operation_opened",
                "account": account,
                "operation": {
                    "ticket": ticket,
                    "symbol": snapshot.symbol,
                    "timeframe": "M5",
                    "side": snapshot.side,
                    "lot": snapshot.lot,
                    "entry_price": snapshot.entry_price,
                    "stop_loss": snapshot.stop_loss,
                    "take_profit": snapshot.take_profit,
                    "profit_loss": snapshot.profit_loss,
                    "opened_at": snapshot.opened_at,
                },
            }
            send_event(payload)

    state["open_positions"] = {ticket: snapshot.__dict__ for ticket, snapshot in current_map.items()}


def handle_closed_positions(state: Dict) -> None:
    start_of_day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    history = mt5.history_deals_get(start_of_day, datetime.now(timezone.utc)) or []
    account = account_payload()
    recent_history_ids = set(state.get("recent_history_ids", []))
    open_positions = state.get("open_positions", {})

    for deal in history:
        if deal.entry != mt5.DEAL_ENTRY_OUT:
            continue
        history_id = str(deal.ticket)
        if history_id in recent_history_ids:
            continue
        position_id = str(deal.position_id)
        cached_position = open_positions.get(position_id)
        payload = {
            "event": "operation_closed",
            "account": account,
            "operation": {
                "ticket": position_id,
                "symbol": deal.symbol,
                "timeframe": "M5",
                "side": cached_position["side"] if cached_position else "buy",
                "lot": float(deal.volume),
                "entry_price": float(cached_position["entry_price"]) if cached_position else float(deal.price),
                "exit_price": float(deal.price),
                "stop_loss": float(cached_position["stop_loss"]) if cached_position else 0,
                "take_profit": float(cached_position["take_profit"]) if cached_position else 0,
                "profit_loss": float(deal.profit),
                "opened_at": cached_position["opened_at"] if cached_position else utc_iso(deal.time),
                "closed_at": utc_iso(deal.time),
                "close_reason": str(getattr(deal, "reason", "mt5_close")),
            },
        }
        send_event(payload)
        recent_history_ids.add(history_id)
        if position_id in open_positions:
            del open_positions[position_id]

    state["open_positions"] = open_positions
    state["recent_history_ids"] = list(recent_history_ids)[-200:]


def main() -> None:
    if not INGEST_TOKEN:
        raise RuntimeError("Missing LUMITRADER_INGEST_TOKEN")
    initialize_mt5()
    state = load_state()
    state.setdefault("open_positions", {})
    state.setdefault("recent_history_ids", [])

    print("Lumitrader MT5 reporter started")
    while True:
        try:
            handle_open_positions(state)
            handle_closed_positions(state)
            save_state(state)
        except Exception as exc:
            print(f"Loop error: {exc}")
        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()

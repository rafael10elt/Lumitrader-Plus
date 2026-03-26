import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import MetaTrader5 as mt5
import requests
from dotenv import dotenv_values

ENV_PATH = Path(__file__).with_name(".env")


def load_env_file() -> None:
    values = dotenv_values(ENV_PATH, encoding="utf-8-sig")
    for key, value in values.items():
        if key and value is not None:
            os.environ[key] = value


load_env_file()

EVENTS_URL = os.getenv("LUMITRADER_BACKEND_URL", "http://localhost:3000/api/backend/trading/events")
BRIDGE_ACCOUNTS_URL = EVENTS_URL.replace("/trading/events", "/bridge/accounts")
BRIDGE_COMMANDS_URL = EVENTS_URL.replace("/trading/events", "/bridge/commands")
INGEST_TOKEN = os.getenv("LUMITRADER_INGEST_TOKEN", "")
POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "3"))
STATE_PATH = Path(__file__).with_name("state.json")

TIMEFRAME_MAP = {
    "M1": mt5.TIMEFRAME_M1,
    "M5": mt5.TIMEFRAME_M5,
    "M15": mt5.TIMEFRAME_M15,
    "M30": mt5.TIMEFRAME_M30,
    "H1": mt5.TIMEFRAME_H1,
}


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


def ensure_symbol(symbol: str) -> None:
    if not mt5.symbol_select(symbol, True):
        raise RuntimeError(f"Nao foi possivel selecionar o simbolo {symbol}: {mt5.last_error()}")


def resolve_filling_mode(symbol: str) -> int:
    info = mt5.symbol_info(symbol)
    if info is None:
        return mt5.ORDER_FILLING_IOC

    filling_mode = getattr(info, "filling_mode", None)
    allowed = {
        mt5.ORDER_FILLING_FOK,
        mt5.ORDER_FILLING_IOC,
        getattr(mt5, "ORDER_FILLING_RETURN", mt5.ORDER_FILLING_IOC),
    }
    if filling_mode in allowed:
        return filling_mode
    return mt5.ORDER_FILLING_IOC


def utc_iso(timestamp: int) -> str:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def load_state() -> Dict[str, Dict[str, Any]]:
    if not STATE_PATH.exists():
        return {"accounts": {}}
    return json.loads(STATE_PATH.read_text(encoding="utf-8"))


def save_state(state: Dict[str, Dict[str, Any]]) -> None:
    STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


def fetch_active_accounts() -> List[Dict[str, Any]]:
    response = requests.get(
        BRIDGE_ACCOUNTS_URL,
        headers={"Authorization": f"Bearer {INGEST_TOKEN}"},
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    return data.get("accounts", [])


def fetch_pending_commands(account_number: str) -> List[Dict[str, Any]]:
    response = requests.get(
        BRIDGE_COMMANDS_URL,
        headers={"Authorization": f"Bearer {INGEST_TOKEN}"},
        params={"account": account_number},
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    return data.get("commands", [])


def acknowledge_command(command_id: str, status: str, result: Dict[str, Any] | None = None, error: str | None = None) -> None:
    response = requests.post(
        BRIDGE_COMMANDS_URL,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {INGEST_TOKEN}",
        },
        json={
            "commandId": command_id,
            "status": status,
            "result": result or {},
            "error": error,
        },
        timeout=30,
    )
    response.raise_for_status()


def execute_command(command: Dict[str, Any]) -> None:
    symbol = command["symbol"]
    command_type = command["type"]
    ensure_symbol(symbol)
    filling_mode = resolve_filling_mode(symbol)

    if command_type in {"open_buy", "open_sell"}:
        tick = mt5.symbol_info_tick(symbol)
        if not tick:
            raise RuntimeError(f"Tick indisponivel para {symbol}")

        order_type = mt5.ORDER_TYPE_BUY if command_type == "open_buy" else mt5.ORDER_TYPE_SELL
        price = tick.ask if command_type == "open_buy" else tick.bid
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": float(command.get("lot") or 0),
            "type": order_type,
            "price": price,
            "sl": float(command.get("stopLoss") or 0),
            "tp": float(command.get("takeProfit") or 0),
            "deviation": 20,
            "comment": "Lumitrader command",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": filling_mode,
        }
        result = mt5.order_send(request)
        if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
            raise RuntimeError(f"order_send falhou: {getattr(result, 'retcode', mt5.last_error())}")

        acknowledge_command(command["id"], "executed", {"retcode": result.retcode, "order": result.order, "deal": result.deal})
        return

    if command_type == "close_position":
        positions = mt5.positions_get(symbol=symbol) or []
        reference_ticket = str(command.get("referenceTicket") or "").strip()
        if reference_ticket:
            positions = [position for position in positions if str(position.ticket) == reference_ticket]
        if not positions:
            acknowledge_command(command["id"], "executed", {"message": "Nenhuma posicao aberta para fechar."})
            return

        position = positions[0]
        tick = mt5.symbol_info_tick(symbol)
        if not tick:
            raise RuntimeError(f"Tick indisponivel para {symbol}")

        close_type = mt5.ORDER_TYPE_SELL if position.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
        price = tick.bid if position.type == mt5.POSITION_TYPE_BUY else tick.ask
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": float(position.volume),
            "type": close_type,
            "position": position.ticket,
            "price": price,
            "deviation": 20,
            "comment": "Lumitrader close",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": filling_mode,
        }
        result = mt5.order_send(request)
        if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
            raise RuntimeError(f"close order_send falhou: {getattr(result, 'retcode', mt5.last_error())}")

        acknowledge_command(command["id"], "executed", {"retcode": result.retcode, "order": result.order, "deal": result.deal, "closed_position": position.ticket})
        return

    raise RuntimeError(f"Tipo de comando nao suportado: {command_type}")


def process_commands(account_number: str) -> None:
    commands = fetch_pending_commands(account_number)
    for command in commands:
        try:
            execute_command(command)
        except Exception as exc:
            acknowledge_command(command["id"], "failed", error=str(exc))


def ensure_terminal() -> None:
    if not mt5.initialize():
        raise RuntimeError(f"MT5 initialize failed: {mt5.last_error()}")


def login_account(account: Dict[str, Any]) -> None:
    ensure_terminal()
    login = int(account["number"])
    password = account["password"]
    server = account["server"]
    if not mt5.login(login=login, password=password, server=server):
        raise RuntimeError(f"MT5 login failed for {login}: {mt5.last_error()}")


def account_payload(symbol: str | None = None) -> Dict[str, Any]:
    account = mt5.account_info()
    if account is None:
        raise RuntimeError("MT5 account_info returned None")

    currency_code = account.currency or "USD"
    currency_symbol = "$" if currency_code == "USD" else "R$" if currency_code == "BRL" else currency_code
    server_time = None
    if symbol:
        tick = mt5.symbol_info_tick(symbol)
        if tick:
            server_time = utc_iso(tick.time)

    return {
        "number": str(account.login),
        "broker": getattr(account, "company", None),
        "server": account.server,
        "server_time": server_time,
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


def build_market_payload(symbol: str, timeframe_name: str) -> Dict[str, Any]:
    timeframe = TIMEFRAME_MAP.get(timeframe_name, mt5.TIMEFRAME_M5)
    rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, 40) or []
    candles = [
        {
            "time": utc_iso(int(rate["time"])),
            "open": float(rate["open"]),
            "high": float(rate["high"]),
            "low": float(rate["low"]),
            "close": float(rate["close"]),
        }
        for rate in rates
    ]

    tick = mt5.symbol_info_tick(symbol)
    symbol_info = mt5.symbol_info(symbol)
    notes = [f"Sync do mercado para {symbol} em {timeframe_name}."]

    return {
        "trend": None,
        "rsi": None,
        "moving_average_20": None,
        "support": None,
        "resistance": None,
        "notes": notes,
        "candles": candles,
        "spread": float(symbol_info.spread) if symbol_info else None,
        "last_bid": float(tick.bid) if tick else None,
        "last_ask": float(tick.ask) if tick else None,
    }


def send_event(payload: Dict[str, Any]) -> None:
    response = requests.post(
        EVENTS_URL,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {INGEST_TOKEN}",
        },
        json=payload,
        timeout=30,
    )
    response.raise_for_status()
    operation = payload.get("operation") or {}
    symbol = operation.get("symbol", "sync")
    print(f"Event sent: {payload['event']} -> {symbol} -> {response.status_code}")


def sync_account(account_config: Dict[str, Any]) -> Dict[str, Any]:
    config = account_config.get("config") or {}
    symbol = config.get("ativo") or "XAUUSD"
    timeframe = config.get("timeframe") or "M5"
    market = build_market_payload(symbol, timeframe)
    payload = {
        "event": "account_sync",
        "account": account_payload(symbol),
        "session": {
            "mode": config.get("modo"),
            "breakeven_enabled": config.get("breakeven_ativo"),
            "trailing_stop_enabled": config.get("trailing_stop_ativo"),
            "profit_target": config.get("meta_lucro_diaria"),
            "daily_loss_limit": config.get("perda_maxima_diaria"),
            "operation_limit_enabled": config.get("limite_operacoes_ativo"),
            "operation_limit": config.get("limite_operacoes_diaria"),
        },
        "market": market,
    }
    send_event(payload)
    return payload


def handle_open_positions(account_config: Dict[str, Any], account_state: Dict[str, Any]) -> None:
    config = account_config.get("config") or {}
    symbol_filter = config.get("ativo")
    current_positions = mt5.positions_get(symbol=symbol_filter) if symbol_filter else mt5.positions_get()
    current_positions = current_positions or []
    current_map = {str(position.ticket): build_position_snapshot(position) for position in current_positions}
    account = account_payload(symbol_filter)
    timeframe = config.get("timeframe") or "M5"
    market = build_market_payload(symbol_filter or current_positions[0].symbol if current_positions else "XAUUSD", timeframe)

    for ticket, snapshot in current_map.items():
        if ticket not in account_state["open_positions"]:
            payload = {
                "event": "operation_opened",
                "account": account,
                "session": {
                    "mode": config.get("modo"),
                    "breakeven_enabled": config.get("breakeven_ativo"),
                    "trailing_stop_enabled": config.get("trailing_stop_ativo"),
                    "profit_target": config.get("meta_lucro_diaria"),
                    "daily_loss_limit": config.get("perda_maxima_diaria"),
                    "operation_limit_enabled": config.get("limite_operacoes_ativo"),
                    "operation_limit": config.get("limite_operacoes_diaria"),
                },
                "market": market,
                "operation": {
                    "ticket": ticket,
                    "symbol": snapshot.symbol,
                    "timeframe": timeframe,
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

    account_state["open_positions"] = {ticket: snapshot.__dict__ for ticket, snapshot in current_map.items()}


def handle_closed_positions(account_config: Dict[str, Any], account_state: Dict[str, Any]) -> None:
    config = account_config.get("config") or {}
    symbol = config.get("ativo") or "XAUUSD"
    timeframe = config.get("timeframe") or "M5"
    start_of_day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    history = mt5.history_deals_get(start_of_day, datetime.now(timezone.utc)) or []
    account = account_payload(symbol)
    market = build_market_payload(symbol, timeframe)
    recent_history_ids = set(account_state.get("recent_history_ids", []))
    open_positions = account_state.get("open_positions", {})

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
            "session": {
                "mode": config.get("modo"),
                "breakeven_enabled": config.get("breakeven_ativo"),
                "trailing_stop_enabled": config.get("trailing_stop_ativo"),
                "profit_target": config.get("meta_lucro_diaria"),
                "daily_loss_limit": config.get("perda_maxima_diaria"),
                "operation_limit_enabled": config.get("limite_operacoes_ativo"),
                "operation_limit": config.get("limite_operacoes_diaria"),
            },
            "market": market,
            "operation": {
                "ticket": position_id,
                "symbol": deal.symbol,
                "timeframe": timeframe,
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

    account_state["open_positions"] = open_positions
    account_state["recent_history_ids"] = list(recent_history_ids)[-200:]


def main() -> None:
    if not INGEST_TOKEN:
        raise RuntimeError("Missing LUMITRADER_INGEST_TOKEN")

    state = load_state()
    state.setdefault("accounts", {})
    print("Lumitrader MT5 reporter started")

    while True:
        try:
            accounts = fetch_active_accounts()
            active_numbers = set()
            for account in accounts:
                number = str(account["number"])
                active_numbers.add(number)
                state["accounts"].setdefault(number, {"open_positions": {}, "recent_history_ids": []})
                account_state = state["accounts"][number]

                try:
                    login_account(account)
                    process_commands(number)
                    sync_account(account)
                    handle_open_positions(account, account_state)
                    handle_closed_positions(account, account_state)
                except Exception as account_exc:
                    print(f"Account {number} error: {account_exc}")

            stale = [number for number in state["accounts"].keys() if number not in active_numbers]
            for number in stale:
                del state["accounts"][number]

            save_state(state)
        except Exception as exc:
            print(f"Loop error: {exc}")

        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()

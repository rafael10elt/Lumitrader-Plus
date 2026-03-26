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
TERMINAL_PATH = os.getenv("MT5_TERMINAL_PATH") or os.getenv("TERMINAL_PATH", "")
POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "2"))
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


def normalize_volume(symbol: str, requested_volume: float, max_volume: float) -> float:
    info = mt5.symbol_info(symbol)
    if info is None:
        return round(min(requested_volume, max_volume), 2)

    volume_min = float(getattr(info, "volume_min", 0.01) or 0.01)
    volume_step = float(getattr(info, "volume_step", volume_min) or volume_min)
    volume_max = float(getattr(info, "volume_max", max_volume) or max_volume)

    bounded = min(max(requested_volume, volume_min), min(max_volume, volume_max))
    steps = round((bounded - volume_min) / volume_step) if volume_step > 0 else 0
    normalized = volume_min + (steps * volume_step)
    normalized = min(max(normalized, volume_min), min(max_volume, volume_max))
    return round(normalized, 2)


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
        existing_positions = mt5.positions_get() or []
        if existing_positions:
            acknowledge_command(command["id"], "failed", error="Regra de ouro: ja existe posicao aberta nesta conta.")
            return

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

    if command_type in {"close_position", "partial_close_position"}:
        positions = mt5.positions_get(symbol=symbol) or []
        reference_ticket = str(command.get("referenceTicket") or "").strip()
        if reference_ticket:
            positions = [position for position in positions if str(position.ticket) == reference_ticket]
            if not positions:
                acknowledge_command(command["id"], "failed", error="Ticket de referencia nao encontrado entre as posicoes abertas.")
                return
        elif len(positions) != 1:
            acknowledge_command(command["id"], "failed", error="Fechamento manual exige ticket explicito quando ha multiplas posicoes ou nenhuma posicao aberta.")
            return

        if not positions:
            acknowledge_command(command["id"], "failed", error="Nenhuma posicao aberta para fechar.")
            return

        position = positions[0]
        tick = mt5.symbol_info_tick(symbol)
        if not tick:
            raise RuntimeError(f"Tick indisponivel para {symbol}")

        payload = command.get("payload") or {}
        close_fraction = payload.get("closeFraction")
        requested_volume = float(position.volume)
        is_partial_close = command_type == "partial_close_position" or (isinstance(close_fraction, (int, float)) and 0 < float(close_fraction) < 1)
        if is_partial_close:
            requested_volume = normalize_volume(symbol, float(position.volume) * float(close_fraction), float(position.volume))

        close_type = mt5.ORDER_TYPE_SELL if position.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
        price = tick.bid if position.type == mt5.POSITION_TYPE_BUY else tick.ask
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": requested_volume,
            "type": close_type,
            "position": position.ticket,
            "price": price,
            "deviation": 20,
            "comment": "Lumitrader partial close" if is_partial_close else "Lumitrader close",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": filling_mode,
        }
        result = mt5.order_send(request)
        if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
            raise RuntimeError(f"close order_send falhou: {getattr(result, 'retcode', mt5.last_error())}")

        acknowledge_command(command["id"], "executed", {
            "retcode": result.retcode,
            "order": result.order,
            "deal": result.deal,
            "closed_position": position.ticket,
            "partial": is_partial_close,
            "requested_volume": requested_volume,
        })
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
    initialized = mt5.initialize(path=TERMINAL_PATH) if TERMINAL_PATH else mt5.initialize()
    if not initialized:
        suffix = f" (path={TERMINAL_PATH})" if TERMINAL_PATH else ""
        raise RuntimeError(f"MT5 initialize failed{suffix}: {mt5.last_error()}")

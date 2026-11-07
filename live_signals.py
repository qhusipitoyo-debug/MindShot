#!/usr/bin/env python3
"""
Live signal JSON emitter for the local dashboard.

Uses the exact same market feed and indicator code as the engine, reads the
last CLOSED 4h bar, and prints one JSON document to stdout:
per-asset strategy status (indicator vs trigger, ADX gate) plus a paper
trade-ticket (entry / SL / TP / sizing) whenever a bar actually triggered.

No orders are ever placed — decision-support output only.
Run:  python3 live_signals.py
"""
from __future__ import annotations

import json
import math
import sys
import time
from datetime import datetime, timezone

from mind_shot import config, market
from mind_shot.models import C
from mind_shot.strategies import STRATEGIES, compute_series


def _paper_ticket(strat, series, last: int, side: str) -> dict | None:
    """Mirror the engine's open_trade() levels off the last closed bar."""
    atr = series["atr"][last]
    if atr is None:
        return None
    entry = series["closes"][last]  # the readout price; live engine fills next-bar open
    if side == "LONG":
        sl = entry - strat.sl_atr * atr
        tp = entry + strat.tp_atr * atr if strat.tp_atr else None
    else:
        sl = entry + strat.sl_atr * atr
        tp = entry - strat.tp_atr * atr if strat.tp_atr else None
    margin = config.ACCOUNT_USD * config.ALLOC_PCT / 100.0
    notional = margin * config.LEVERAGE
    risk_usd = notional * abs(entry - sl) / entry
    return {
        "side": side,
        "entry": round(entry, 4),
        "sl": round(sl, 4),
        "tp": round(tp, 4) if tp else None,
        "exit_style": strat.exit_style.value if hasattr(strat.exit_style, "value") else str(strat.exit_style),
        "atr": round(atr, 4),
        "backtest_win_rate": strat.backtest_win_rate,
        "margin_usd": round(margin, 2),
        "notional_usd": round(notional, 2),
        "risk_usd": round(risk_usd, 2),
        "account_usd": config.ACCOUNT_USD,
        "leverage": config.LEVERAGE,
        "note": "paper ticket — engine would fill at the NEXT bar's open",
    }


def _scan_asset(asset: str) -> dict:
    candles = market.fetch_klines(asset, "4h", limit=720)
    series = compute_series(candles)
    last = len(candles) - 2          # most recently CLOSED bar
    close = candles[last][C]
    out = {
        "asset": asset,
        "last_close": round(close, 4),
        "bar_closed_at": candles[last][0],
        "strategies": [],
    }
    for strat in STRATEGIES:
        if strat.asset != asset:
            continue
        v = series[strat.source][last]
        adx = series["adx"][last]
        adx_ok = adx is not None and adx < strat.adx_max
        long_ok = v is not None and v < strat.long_below
        short_ok = v is not None and v > strat.short_above

        if not adx_ok:
            status, ticket = "trending", None          # ADX gate closed
        elif long_ok or short_ok:
            status = "triggered-long" if long_ok else "triggered-short"
            lv = _levels(strat, series, last)
            ticket = _paper_ticket(strat, series, last, "LONG" if long_ok else "SHORT")
        else:
            status = "waiting"
            ticket = None

        out["strategies"].append({
            "id": strat.id,
            "name": strat.name,
            "source": strat.source,
            "value": round(v, 4) if v is not None else None,
            "long_at": strat.long_below,
            "short_at": strat.short_above,
            "adx": round(adx, 1) if adx is not None else None,
            "adx_ok": adx_ok,
            "long_ok": long_ok,
            "short_ok": short_ok,
            "status": status,
            "distance": {} if v is None else {
                "to_long": round(abs(v - strat.long_below), 2) if not long_ok else 0,
                "to_short": round(abs(strat.short_above - v), 2) if not short_ok else 0,
            },
            "levels": _levels(strat, series, last),
            "ticket": ticket,
        })
    return out


def _levels(strat, series, last: int):
    """Prospective BUY/SELL levels computed off the current reference price.

    PREVIEW ONLY: the engine always fills at the NEXT bar's open after a real
    trigger, and lock-in happens only with a valid signal (indicator in zone
    AND ADX < 25). Revert strategies exit at their mean anchor, not a fixed TP.
    """
    atr = series["atr"][last]
    if not atr:
        return None
    ref = series["closes"][last]
    anchor = series[strat.mean_price_key][last] if strat.mean_price_key else None
    margin = config.ACCOUNT_USD * config.ALLOC_PCT / 100.0
    notional = margin * config.LEVERAGE

    def leg(side: str) -> dict:
        sgn = 1 if side == "buy" else -1
        if strat.tp_atr:  # bracket: fixed TP always on the profit side
            tp = ref + sgn * strat.tp_atr * atr
            valid = True
        else:              # revert: TP = mean anchor — only valid if it is on the profit side
            tp = anchor
            valid = tp is not None and ((tp > ref) if side == "buy" else (tp < ref))
        risk = notional * strat.sl_atr * atr / ref
        reward = (notional * strat.tp_atr * atr / ref) if strat.tp_atr else (
            (notional * abs(tp - ref) / ref) if (tp and valid) else None)
        return {
            "entry_ref": round(ref, 4),
            "sl": round(ref - sgn * strat.sl_atr * atr, 4),
            "sl_atr": strat.sl_atr,
            "tp": round(tp, 4) if tp else None,
            "valid": valid,
            "risk_usd": round(risk, 2),
            "reward_usd": round(reward, 2) if reward else None,
            "anchor": round(anchor, 4) if anchor else None,
        }

    return {"atr": round(atr, 4), "buy": leg("buy"), "sell": leg("sell")}


def main() -> None:
    doc = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "assets": [_scan_asset(a) for a in ("ETH", "BTC")],
    }
    json.dump(doc, sys.stdout)


if __name__ == "__main__":
    main()

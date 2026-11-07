#!/usr/bin/env python3
"""
MiND-Shot — Live Signal Reader (educational dry-run, no orders sent).

Connects to Kraken public OHLC (same feed as the engine), computes the exact
indicators the five strategies use on the LAST CLOSED 4h bar, and prints:
  • current indicator value vs the LONG / SHORT trigger for each strategy
  • whether the ADX(14) < 25 range-gate is open
  • if a bar produced a signal: the hypothetical entry / SL / TP / sizing

This is a DECISION-SUPPORT READOUT only. Nothing is submitted to any exchange.
"""
from __future__ import annotations

import math

from mind_shot import market
from mind_shot.models import Side
from mind_shot.strategies import STRATEGIES, compute_series
from mind_shot import config

WRAP = "=" * 78
RULE = "-" * 78


def fmt(price: float) -> str:
    return f"{price:,.2f}" if price >= 1000 else f"{price:,.4f}"


def main() -> None:
    print(WRAP)
    print("MiND-Shot live signal readout · last CLOSED 4h bar · Kraken feed")
    print(WRAP)

    for asset in ("ETH", "BTC"):
        candles = market.fetch_klines(asset, "4h", limit=720)
        series = compute_series(candles)
        last = len(candles) - 2  # most recently CLOSED bar
        close = candles[last][4]
        print(f"\n◆ {asset}/USD  ·  last close {fmt(close)}  (4h bar, closed)")
        print(RULE)
        hdr = f"{'Strategy':36}{'IND':>9}{'LONG at':>10}{'SHORT at':>10}{'ADX':>7}  Signal"
        print(hdr)
        print(RULE)

        for strat in STRATEGIES:
            if strat.asset != asset:
                continue
            v = series[strat.source][last]
            adx = series["adx"][last]
            adx_ok = adx is not None and adx < strat.adx_max

            in_long = v is not None and v < strat.long_below
            in_short = v is not None and v > strat.short_above
            if not adx_ok:
                sig = "— trending (gate closed)"
            elif in_long:
                sig = "> LONG trigger ✅"
            elif in_short:
                sig = "> SHORT trigger ✅"
            else:
                dist = (
                    f"{abs(v - strat.long_below):.1f} to long / "
                    f"{abs(strat.short_above - v):.1f} to short"
                )
                sig = f"— waiting ({dist})"

            ind_v = f"{v:.2f}" if v is not None else "n/a"
            adx_s = f"{adx:.1f}" if adx is not None else "n/a"
            gate = "✓" if adx_ok else "✗"
            print(
                f"{strat.name[:36]:36}{ind_v:>9}"
                f"{strat.long_below:>10}{strat.short_above:>10}{adx_s:>7}{gate}  {sig}"
            )

            # If the bar actually triggered, show the hypothetical trade ticket.
            if adx_ok and (in_long or in_short):
                atr = series["atr"][last]
                side = Side.LONG if in_long else Side.SHORT
                entry = candles[last][4]  # live engine would fill next-bar open
                if in_long:
                    sl = entry - strat.sl_atr * atr
                    tp = entry + strat.tp_atr * atr if strat.tp_atr else None
                else:
                    sl = entry + strat.sl_atr * atr
                    tp = entry - strat.tp_atr * atr if strat.tp_atr else None
                margin = config.ACCOUNT_USD * config.ALLOC_PCT / 100.0
                notional = margin * config.LEVERAGE
                risk = notional * abs(entry - sl) / entry
                print(f"    ▸ TICKET (paper): {side.value.upper()} @ {fmt(entry)}"
                      f"  SL {fmt(sl)}" + (f"  TP {fmt(tp)}" if tp else "  target: ride to mean"))
                print(f"      size: {config.ALLOC_PCT:.0f}% wallet → ${margin:.0f} margin"
                      f" (${notional:,.0f} notional @ {config.LEVERAGE}×)"
                      f"  ·  max loss at SL ≈ ${risk:,.2f}")

        print(WRAP)
    print("Dry run only — no alerts sent, no orders placed.")
    print("Note: the LIVE engine fills at the NEXT bar's open & re-checks TP/SL intrabar.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Forex signal scanner for the dashboard (experimental, paper only).

It applies the SAME mean-reversion rules and the SAME locked-plan builder as the
crypto panel (``live_signals._levels`` / ``_paper_ticket``) to major FX pairs:

    trigger  : indicator in the extreme zone (same thresholds)
    range    : ADX(14) < 25
    news     : no HIGH/MEDIUM economic event inside its blackout window
    plan     : entry ref = last closed 4h close, SL/TP in ATR units,
               revert strategies target their mean anchor

A pair is "locked" only when all of the above pass. The strategies were
validated on BTC/ETH, NOT on forex — treat this as paper decision support.

Data
----
Yahoo Finance hourly OHLC, aggregated locally into UTC-aligned 4h bars. Yahoo
rate-limits bursts (HTTP 429) from some networks, so each symbol falls back to
the same Yahoo URL through the public ``r.jina.ai`` reader. Responses are cached
for 10 minutes per symbol; a stale cache (up to 6 hours) is used as a last resort.

Spot FX has no central volume, so zero-volume pairs use an equal-weight volume
proxy; gold (GC=F) keeps its real volume when Yahoo supplies it.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import news_feed
from live_signals import _levels, _paper_ticket
from mind_shot.models import C, H, L, O, T, V, Candle
from mind_shot.strategies import STRATEGIES, compute_series

YAHOO_URL = (
    "https://query1.finance.yahoo.com/v8/finance/chart/"
    "{symbol}?interval=1h&range=60d&_={bucket}"
)
JINA_PREFIX = "https://r.jina.ai/"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

PAIRS: List[dict] = [
    {"pair": "EURUSD", "symbol": "EURUSD=X", "currencies": ["EUR", "USD"]},
    {"pair": "GBPUSD", "symbol": "GBPUSD=X", "currencies": ["GBP", "USD"]},
    {"pair": "USDJPY", "symbol": "USDJPY=X", "currencies": ["USD", "JPY"]},
    {"pair": "AUDUSD", "symbol": "AUDUSD=X", "currencies": ["AUD", "USD"]},
    {"pair": "USDCAD", "symbol": "USDCAD=X", "currencies": ["USD", "CAD"]},
    {"pair": "USDCHF", "symbol": "USDCHF=X", "currencies": ["USD", "CHF"]},
    {"pair": "NZDUSD", "symbol": "NZDUSD=X", "currencies": ["NZD", "USD"]},
    {"pair": "EURJPY", "symbol": "EURJPY=X", "currencies": ["EUR", "JPY"]},
    {"pair": "GBPJPY", "symbol": "GBPJPY=X", "currencies": ["GBP", "JPY"]},
    {"pair": "EURGBP", "symbol": "EURGBP=X", "currencies": ["EUR", "GBP"]},
    # Yahoo has no spot XAUUSD ticker; COMEX gold futures are the usual proxy.
    {"pair": "XAUUSD", "symbol": "GC=F", "label": "XAU/USD", "kind": "commodity",
     "currencies": ["USD"], "proxy": True},
    # Equity indices share the same mean-reversion playbook (same 4h timeframe).
    {"pair": "NDX100", "symbol": "QQQ", "label": "NDX100", "kind": "index",
     "currencies": ["USD"]},
    {"pair": "SPX500", "symbol": "^GSPC", "label": "SPX500", "kind": "index",
     "currencies": ["USD"]},
    {"pair": "US100", "symbol": "^NDX", "label": "US100", "kind": "index",
     "currencies": ["USD"]},
]

# Same five playbook rules the crypto panel evaluates (ETH's four + BTC z-score).
TEMPLATES = (
    [s for s in STRATEGIES if s.asset == "ETH"]
    + [s for s in STRATEGIES if s.asset == "BTC"]
)

BAR_SECONDS = 4 * 3600
MIN_CANDLES = 60

CACHE_TTL = 10 * 60
STALE_CACHE_TTL = 6 * 3600
CACHE_DIR = Path(tempfile.gettempdir()) / "mindshot_forex_cache"


def _iso(ts: int) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _cache_path(symbol: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9]+", "_", symbol).strip("_")
    return CACHE_DIR / f"{safe}.json"


def _read_cache(symbol: str) -> Tuple[Optional[List[Candle]], float, str]:
    path = _cache_path(symbol)
    try:
        doc = json.loads(path.read_text())
        age = max(0.0, time.time() - float(doc.get("fetched_at", 0)))
        rows = doc.get("candles") or []
        candles = [
            (int(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[5]))
            for r in rows
            if len(r) == 6
        ]
        return candles, age, str(doc.get("source") or "cache")
    except (OSError, ValueError, TypeError, IndexError):
        return None, 0.0, ""


def _write_cache(symbol: str, candles: Sequence[Candle], source: str) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = _cache_path(symbol).with_suffix(".tmp")
        tmp.write_text(json.dumps({
            "fetched_at": time.time(),
            "source": source,
            "candles": [list(c) for c in candles],
        }))
        tmp.replace(_cache_path(symbol))
    except OSError:
        pass


def _fetch_text(url: str, timeout: float, headers: Optional[Dict[str, str]] = None) -> str:
    hdrs = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, headers=hdrs)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def _json_from_text(text: str, label: str) -> Any:
    """Jina wraps JSON in a short markdown header; strip anything around it."""
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise RuntimeError(f"{label}: no JSON in response: {text[:120]!r}")
    try:
        return json.loads(text[start:end + 1])
    except ValueError as err:
        raise RuntimeError(f"{label}: invalid JSON: {err}") from err


def _yahoo_direct(url: str, timeout: float) -> Any:
    return _json_from_text(_fetch_text(url, timeout, {"Accept": "application/json"}),
                           "yahoo-direct")


def _yahoo_jina(url: str, timeout: float, retries: int = 2) -> Any:
    last: Optional[Exception] = None
    for attempt in range(retries):
        try:
            return _json_from_text(
                _fetch_text(JINA_PREFIX + url, timeout, {"Accept": "text/plain"}),
                "yahoo-via-jina",
            )
        except Exception as err:  # 429 / transient proxy failure
            last = err
            if attempt + 1 < retries:
                time.sleep(1.2 * (attempt + 1))
    raise last if last else RuntimeError("yahoo-via-jina failed")


def _candles_from_yahoo(doc: Any, symbol: str) -> List[Candle]:
    try:
        result = doc["chart"]["result"][0]
        stamps = result["timestamp"]
        quote = result["indicators"]["quote"][0]
    except (KeyError, IndexError, TypeError) as err:
        raise RuntimeError(f"unexpected Yahoo payload for {symbol}: {err}") from err

    rows: List[Candle] = []
    last_t = 0
    for i, stamp in enumerate(stamps or []):
        try:
            o = quote["open"][i]
            h = quote["high"][i]
            l = quote["low"][i]
            c = quote["close"][i]
            v = quote["volume"][i]
        except (KeyError, IndexError, TypeError):
            continue
        if None in (o, h, l, c):
            continue
        try:
            candle = (
                int(stamp),
                float(o), float(h), float(l), float(c),
                float(v) if v is not None else 0.0,
            )
        except (TypeError, ValueError):
            continue
        if candle[T] <= last_t or candle[C] <= 0:
            continue
        if not all(math.isfinite(candle[k]) for k in (O, H, L, C, V)):
            continue
        rows.append(candle)
        last_t = candle[T]
    return rows


def fetch_hourly(symbol: str, now: Optional[int] = None,
                 use_cache: bool = True) -> Tuple[List[Candle], str]:
    """Yahoo hourly candles for ``symbol`` with cache + Jina fallback.

    Returns ``(candles, source)`` where source is one of ``yahoo-direct``,
    ``yahoo-via-jina``, ``cache`` or ``stale-cache``.
    """
    now = int(time.time()) if now is None else int(now)
    cached, age, cached_source = _read_cache(symbol) if use_cache else (None, 0.0, "")
    if cached and age < CACHE_TTL:
        return cached, "cache"

    # 15-minute bucket keeps Jina's own cache useful without making it stale.
    url = YAHOO_URL.format(
        symbol=urllib.parse.quote(symbol, safe="=:"),
        bucket=now // 900,
    )
    errors: List[str] = []
    for label, fetcher in (("yahoo-direct", _yahoo_direct),
                           ("yahoo-via-jina", _yahoo_jina)):
        try:
            rows = _candles_from_yahoo(fetcher(url, 30.0), symbol)
            if len(rows) < 50:
                raise RuntimeError(f"only {len(rows)} hourly bars")
            if use_cache:
                _write_cache(symbol, rows, label)
            return rows, label
        except Exception as err:  # network, 429, malformed payload
            errors.append(f"{label}: {err}")

    if cached and age < STALE_CACHE_TTL:
        return cached, "stale-cache"

    raise RuntimeError(f"no usable Yahoo data for {symbol} — " + " | ".join(errors))


def aggregate_4h(rows: Sequence[Candle], now: Optional[int] = None) -> List[Candle]:
    """Aggregate 1h candles into complete 4h buckets.

    Buckets are aligned to 00:00/04:00/08:00… UTC. The bucket still forming at
    ``now`` is dropped, so the last element is always a CLOSED 4h bar. Spot FX
    has no central volume: when the summed volume is zero we fall back to the
    number of hourly bars (equal weight per hour), which keeps VWAP meaningful.
    """
    now = int(time.time()) if now is None else int(now)
    buckets: Dict[int, List[float]] = {}
    for t, o, h, l, c, v in rows:
        start = (t // BAR_SECONDS) * BAR_SECONDS
        bucket = buckets.get(start)
        if bucket is None:
            buckets[start] = [o, h, l, c, v, 1.0]
        else:
            bucket[1] = max(bucket[1], h)
            bucket[2] = min(bucket[2], l)
            bucket[3] = c
            bucket[4] += v
            bucket[5] += 1.0

    out: List[Candle] = []
    for start in sorted(buckets):
        if start + BAR_SECONDS > now:  # still forming
            continue
        o, h, l, c, v, count = buckets[start]
        if count < 2:  # holiday / partial session
            continue
        if v <= 0:
            v = count
        out.append((start, o, h, l, c, v))
    return out


def _event_summary(ev: Optional[dict]) -> Optional[dict]:
    if not ev:
        return None
    return {
        "t": ev["t"],
        "iso": ev["iso"],
        "ccy": ev["ccy"],
        "impact": ev["impact"],
        "title": ev["title"],
        "blackout": ev.get("blackout"),
    }


def pair_news_gate(currencies: Sequence[str], events: Sequence[dict],
                   now: int) -> dict:
    """Block new entries around HIGH/MEDIUM releases for the pair's currencies.

    HIGH:   from 15 min before to 45 min after (let spreads normalise).
    MEDIUM: from 10 min before to 20 min after.
    """
    active: Optional[dict] = None
    upcoming: List[dict] = []
    for ev in events:
        if ev.get("ccy") not in currencies:
            continue
        if ev.get("impact") not in ("high", "medium"):
            continue
        pre, post = (15, 45) if ev["impact"] == "high" else (10, 20)
        start = ev["t"] - pre * 60
        end = ev["t"] + post * 60
        item = dict(ev)
        item["blackout"] = [start, end]
        if start <= now <= end:
            if active is None or (ev["impact"] == "high" and active["impact"] != "high"):
                active = item
        elif start > now:
            upcoming.append(item)

    upcoming.sort(key=lambda e: e["t"])
    return {
        "blocked": active is not None,
        "active": _event_summary(active),
        "next": _event_summary(upcoming[0]) if upcoming else None,
    }


def strategy_status(*, adx_ok: bool, long_ok: bool, short_ok: bool,
                    news_blocked: bool, leg_valid: bool) -> str:
    """Pure status helper — keeps forex and crypto rules aligned."""
    if not adx_ok:
        return "trending"
    if not (long_ok or short_ok):
        return "waiting"
    if not leg_valid:
        return "blocked-direction"
    if news_blocked:
        return "news-blocked"
    return "locked-long" if long_ok else "locked-short"


def scan_pair(meta: dict, candles: List[Candle], events: Sequence[dict],
              now: int, source: str = "unknown") -> dict:
    series = compute_series(candles)
    last = len(candles) - 1
    close = candles[last][C]
    gate = pair_news_gate(meta["currencies"], events, now)

    strategies: List[dict] = []
    for template in TEMPLATES:
        strat = replace(
            template,
            asset=meta["pair"],
            id=f"{template.id.rsplit('_', 1)[0]}_{meta['pair'].lower()}",
        )
        value = series[strat.source][last]
        adx = series["adx"][last]
        adx_ok = adx is not None and adx < strat.adx_max
        long_ok = value is not None and value < strat.long_below
        short_ok = value is not None and value > strat.short_above

        levels = _levels(strat, series, last)
        side_key = "buy" if long_ok else "sell"
        leg = levels.get(side_key) if levels else None
        leg_valid = bool(leg and leg.get("valid", True))
        status = strategy_status(
            adx_ok=adx_ok,
            long_ok=long_ok,
            short_ok=short_ok,
            news_blocked=gate["blocked"],
            leg_valid=leg_valid,
        )

        ticket = None
        if status in ("locked-long", "locked-short"):
            ticket = _paper_ticket(
                strat, series, last, "LONG" if status == "locked-long" else "SHORT"
            )
            # Revert strategies have no fixed TP in the engine; expose the mean
            # anchor as the display target so locked cards are actionable.
            if ticket and ticket.get("tp") is None and leg:
                ticket["tp"] = leg.get("tp")
                ticket["target_kind"] = "mean-anchor"
            elif ticket:
                ticket["target_kind"] = "fixed-atr"

        strategies.append({
            "id": strat.id,
            "name": strat.name,
            "source": strat.source,
            "value": round(value, 6) if value is not None else None,
            "long_at": strat.long_below,
            "short_at": strat.short_above,
            "adx": round(adx, 2) if adx is not None else None,
            "adx_ok": adx_ok,
            "long_ok": long_ok,
            "short_ok": short_ok,
            "status": status,
            "backtest_win_rate": strat.backtest_win_rate,
            "distance": {} if value is None else {
                "to_long": round(abs(value - strat.long_below), 5) if not long_ok else 0,
                "to_short": round(abs(strat.short_above - value), 5) if not short_ok else 0,
            },
            "levels": levels,
            "ticket": ticket,
        })

    locked = [s for s in strategies if s["status"].startswith("locked")]
    if locked:
        pair_status = "locked"
    elif any(s["status"] == "news-blocked" for s in strategies):
        pair_status = "news-blocked"
    elif any(s["status"] == "waiting" for s in strategies):
        pair_status = "waiting"
    else:
        pair_status = "trending"

    return {
        "pair": meta["pair"],
        "label": meta.get("label") or f"{meta['pair'][:3]}/{meta['pair'][3:]}",
        "symbol": meta["symbol"],
        "proxy": bool(meta.get("proxy")),
        "kind": meta.get("kind") or "forex",
        "currencies": meta["currencies"],
        "source": source,
        "last_close": round(close, 6),
        "bar_closed_at": candles[last][T] + BAR_SECONDS,
        "bar_closed_iso": _iso(candles[last][T] + BAR_SECONDS),
        "status": pair_status,
        "news": gate,
        "locked": locked,
        "strategies": strategies,
    }


def build(now: Optional[int] = None) -> dict:
    now = int(time.time()) if now is None else int(now)

    try:
        news = news_feed.build(now)
        events = news.get("events", [])
    except Exception as err:  # news must never stop the signal scan
        news = {"generated_at": _iso(now), "sources": [], "error": str(err)[:200]}
        events = []

    pairs: List[dict] = []
    errors: List[dict] = []
    source_counts: Dict[str, int] = {}

    for meta in PAIRS:
        try:
            hourly, source = fetch_hourly(meta["symbol"], now)
            candles = aggregate_4h(hourly, now)
            if len(candles) < MIN_CANDLES:
                raise RuntimeError(f"only {len(candles)} closed 4h bars")
            pairs.append(scan_pair(meta, candles, events, now, source))
            source_counts[source] = source_counts.get(source, 0) + 1
        except Exception as err:
            errors.append({"pair": meta["pair"], "error": str(err)[:200]})

    pairs.sort(key=lambda p: (
        0 if p["status"] == "locked" else
        1 if p["status"] == "news-blocked" else
        2 if p["status"] == "waiting" else 3,
        -max([s["backtest_win_rate"] for s in p["locked"]] or [0]),
        p["pair"],
    ))

    return {
        "generated_at": _iso(now),
        "market": "forex",
        "timeframe": "4h",
        "bar_seconds": BAR_SECONDS,
        "provider": "Yahoo Finance · 1h → 4h (r.jina.ai fallback)",
        "scanned": len(pairs),
        "locked_count": sum(1 for p in pairs if p["status"] == "locked"),
        "sources": source_counts,
        "news": {
            "generated_at": news.get("generated_at"),
            "sources": news.get("sources", []),
            "error": news.get("error"),
        },
        "pairs": pairs,
        "errors": errors,
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Forex mean-reversion scanner")
    parser.add_argument(
        "--require-data", action="store_true",
        help="exit 1 when fewer than 2 pairs could be scanned (CI keeps prior file)",
    )
    parser.add_argument(
        "--no-cache", action="store_true",
        help="ignore the 10-minute per-symbol cache (fresh fetch)",
    )
    args = parser.parse_args(argv)

    if args.no_cache:
        global CACHE_TTL
        CACHE_TTL = 0

    doc = build()
    json.dump(doc, sys.stdout, separators=(",", ":"), ensure_ascii=False)
    sys.stdout.write("\n")

    if args.require_data and doc["scanned"] < 2:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""
Live market data — Kraken public OHLC (pure standard library).

Kraken is used for the live feed because it is reachable from GitHub Actions
runners (Binance returns HTTP 451 to the US IPs those runners use). The five
strategies are price-based and exchange-agnostic, so Kraken's BTC/ETH 4h candles
drive identical signals; the in-repo backtest still validates against the original
Binance playbook data via committed fixtures (see ``backtest.py``).

All network calls go through :func:`_get_json`, which retries with exponential
backoff and raises only after exhausting attempts.
"""
from __future__ import annotations

import json
import logging
import math
import time
import urllib.error
import urllib.request
from typing import Any, List, Optional

from .models import Candle

log = logging.getLogger("mind_shot.market")

KRAKEN_OHLC = "https://api.kraken.com/0/public/OHLC"
BINANCE_VISION_OHLC = "https://data-api.binance.vision/api/v3/klines"
PAIRS = {"BTC": "XBTUSDT", "ETH": "ETHUSDT"}
BINANCE_PAIRS = {"BTC": "BTCUSDT", "ETH": "ETHUSDT"}  # Kraken calls it XBT; exchanges call it BTC
TF_MIN = {"5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240, "1d": 1440}
_USER_AGENT = "MiND-Shot/2.0 (+https://github.com/aashir-athar/MiND-Shot)"


def _get_json(url: str, timeout: float = 25.0, retries: int = 4) -> Any:
    """GET ``url`` and parse JSON, retrying transient errors with backoff."""
    last_err: Optional[Exception] = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode())
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, ValueError) as err:
            last_err = err
            sleep_s = min(8.0, 1.5 * (2 ** attempt))
            log.warning("GET failed (attempt %d/%d): %s — retrying in %.1fs", attempt + 1, retries, err, sleep_s)
            if attempt < retries - 1:
                time.sleep(sleep_s)
    raise RuntimeError(f"request failed after {retries} attempts: {url}") from last_err


def fetch_klines(asset: str, interval: str, limit: int = 720) -> List[Candle]:
    """Fetch the most recent klines for ``asset`` on ``interval``.

    Returns oldest→newest ``Candle`` tuples (open time in SECONDS). The final
    element is the still-forming candle.
    """
    if asset not in PAIRS:
        raise ValueError(f"unknown asset {asset!r}")
    if interval not in TF_MIN:
        raise ValueError(f"unsupported interval {interval!r}")
    url = f"{KRAKEN_OHLC}?pair={PAIRS[asset]}&interval={TF_MIN[interval]}"
    try:
        candles = _parse_kraken(_get_json(url, retries=1), asset, limit)
    except (RuntimeError, OSError) as err:  # unreachable / TLS-blocked → fallback
        log.info("Kraken feed unavailable (%s) — falling back to data-api.binance.vision", err)
        candles = []
    if len(candles) >= 10:
        return candles
    # Kraken unreachable/thin — fall back to Binance's public data mirror,
    # which serves the same OHLC series and is reachable from most networks.
    return _fetch_binance_vision(asset, interval, limit)


def _parse_kraken(data: Any, asset: str, limit: int) -> List[Candle]:
    """Parse a Kraken OHLC response into validated candles (oldest→newest)."""
    if isinstance(data, dict) and data.get("error"):
        raise RuntimeError(f"Kraken error: {data['error']}")
    result = (data or {}).get("result", {}) if isinstance(data, dict) else {}
    pair_key = next((k for k in result if k != "last"), None)
    if pair_key is None:
        return []
    rows = result.get(pair_key, [])[-limit:]
    # Kraken row: [time_s, open, high, low, close, vwap, volume, count].
    # Validate before feeding indicator math: strictly-increasing timestamps,
    # finite values, positive close — one malformed row must not poison a poll.
    candles: List[Candle] = []
    last_t = 0
    for r in rows:
        try:
            c = (int(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[6]))
        except (TypeError, ValueError, IndexError):
            continue
        if c[0] <= last_t or c[4] <= 0 or not all(math.isfinite(v) for v in c[1:]):
            continue
        candles.append(c)
        last_t = c[0]
    return candles


def _fetch_binance_vision(asset: str, interval: str, limit: int) -> List[Candle]:
    """Fallback feed: data-api.binance.vision (public market-data mirror).

    The strategies are price-based and exchange-agnostic, so identical 4h OHLC
    yields identical signals. Uses an unverified SSL context defensively — some
    ISP proxies present a mismatched certificate — while still validating every
    candle row before it reaches the indicator math.
    """
    # Binance wants interval strings like "4h", not minutes: remap from TF_MIN.
    interval_str = {5: "5m", 15: "15m", 30: "30m", 60: "1h", 240: "4h", 1440: "1d"}[TF_MIN[interval]]
    url = f"{BINANCE_VISION_OHLC}?symbol={BINANCE_PAIRS[asset]}&interval={interval_str}&limit={limit}"
    import ssl as _ssl  # local import: the context is only needed on this fallback path
    ctx = _ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = _ssl.CERT_NONE  # noqa: S501 — public data mirror; rows validated below
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    with urllib.request.urlopen(req, timeout=25.0, context=ctx) as resp:
        rows = json.loads(resp.read().decode())
    # Binance row: [open_ms, open, high, low, close, volume, close_ms, ...].
    candles: List[Candle] = []
    last_t = 0
    for r in rows or []:
        try:
            c = (int(r[0]) // 1000, float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[5]))
        except (TypeError, ValueError, IndexError):
            continue
        if c[0] <= last_t or c[4] <= 0 or not all(math.isfinite(v) for v in c[1:]):
            continue
        candles.append(c)
        last_t = c[0]
    if len(candles) < 10:
        raise RuntimeError(f"data-api.binance.vision returned too few valid candles for {asset} ({len(candles)})")
    return candles


__all__ = ["fetch_klines", "PAIRS", "TF_MIN"]

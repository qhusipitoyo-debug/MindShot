#!/usr/bin/env python3
"""Economic-calendar news aggregator for the MiND-Shot dashboard.

Sources
-------
1. TradingView public economic calendar (importance, forecast/previous) — gives
   the next ~7 days of events for the majors.
2. Brainstrom1974/news-calendar-feed on GitHub — a pipe-delimited HIGH-impact
   feed generated from ForexFactory/MQL5 (daily, UTC).

Output is a single JSON document on stdout with normalized events, impact
levels, blackout windows and per-source freshness. It is decision support only:
no orders, no financial advice.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

TV_URL = (
    "https://economic-calendar.tradingview.com/events"
    "?from={start}&to={end}"
    "&countries=US,EU,GB,JP,AU,CA,CH,NZ,CN,DE,FR,IT,ES"
)
PIPE_URL = (
    "https://raw.githubusercontent.com/Brainstrom1974/"
    "news-calendar-feed/main/news_events.txt"
)
USER_AGENT = "MiND-Shot/2.0 (+https://github.com/qhusipitoyo-debug/MindShot)"

COUNTRY_CCY = {
    "US": "USD", "EU": "EUR", "GB": "GBP", "JP": "JPY",
    "AU": "AUD", "CA": "CAD", "CH": "CHF", "NZ": "NZD",
    "CN": "CNY", "DE": "EUR", "FR": "EUR", "IT": "EUR", "ES": "EUR",
}
IMPACT_RANK = {"high": 3, "medium": 2, "low": 1, "holiday": 0}
BLACKOUT_MIN = {"high": 30, "medium": 15, "low": 0, "holiday": 0}

WINDOW_DAYS = 10
KEEP_PAST_HOURS = 2


def _iso(ts: int) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _iso_query(ts: int) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _get(url: str, timeout: float = 25.0, retries: int = 3,
         headers: Optional[Dict[str, str]] = None) -> str:
    hdrs = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    if headers:
        hdrs.update(headers)
    last: Optional[Exception] = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=hdrs)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8", "replace")
        except Exception as err:  # network / TLS / HTTP / JSON handled by caller
            last = err
            if attempt + 1 < retries:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"fetch failed: {url}: {last}")


def _iso_to_epoch(value: Any) -> Optional[int]:
    if not value:
        return None
    text = str(value).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def _norm_title(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def _blackout(ts: int, impact: str) -> Optional[List[int]]:
    minutes = BLACKOUT_MIN.get(impact, 0)
    if not minutes:
        return None
    return [ts - minutes * 60, ts + minutes * 60]


def _make_event(*, ts: Optional[int], ccy: str, impact: str, title: str,
                source: str, forecast: Any = None, previous: Any = None,
                actual: Any = None, event_id: Optional[str] = None) -> Optional[dict]:
    if ts is None or not ccy or not title:
        return None
    ccy = ccy.strip().upper()
    if not re.fullmatch(r"[A-Z]{3}", ccy):
        return None
    impact = (impact or "low").strip().lower()
    if impact not in IMPACT_RANK:
        impact = "low"
    return {
        "id": event_id or f"{source}:{ccy}:{ts}:{_norm_title(title)}",
        "t": ts,
        "iso": _iso(ts),
        "ccy": ccy,
        "impact": impact,
        "title": title.strip(),
        "forecast": forecast,
        "previous": previous,
        "actual": actual,
        "source": source,
        "blackout": _blackout(ts, impact),
    }


def parse_tradingview(doc: Any) -> List[dict]:
    rows = (doc or {}).get("result", []) if isinstance(doc, dict) else []
    out: List[dict] = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        if row.get("kind") not in (None, "economic", "holiday"):
            continue
        kind = row.get("kind")
        raw_imp = row.get("importance")
        if kind == "holiday":
            impact = "holiday"
        elif isinstance(raw_imp, str):
            impact = raw_imp.strip().lower()
            impact = {"med": "medium", "moderate": "medium"}.get(impact, impact)
        else:
            impact = {1: "high", 0: "medium", -1: "low"}.get(raw_imp, "low")
        ccy = (row.get("currency")
               or COUNTRY_CCY.get(str(row.get("country", "")).upper(), "")).upper()
        ev = _make_event(
            ts=_iso_to_epoch(row.get("date")),
            ccy=ccy,
            impact=impact,
            title=str(row.get("title") or row.get("indicator") or ""),
            source="tradingview",
            forecast=row.get("forecast"),
            previous=row.get("previous"),
            actual=row.get("actual"),
            event_id=f"tv:{row.get('id')}" if row.get("id") else None,
        )
        if ev:
            out.append(ev)
    return out


def parse_pipe(text: str) -> Tuple[List[dict], Optional[int]]:
    """Parse ``YYYY-MM-DD HH:MM|CCY|IMPACT|Title`` lines (UTC)."""
    events: List[dict] = []
    generated: Optional[int] = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#"):
            m = re.search(
                r"Generiert:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*UTC", line
            )
            if m:
                try:
                    dt = datetime.strptime(m.group(1), "%Y-%m-%d %H:%M")
                    generated = int(dt.replace(tzinfo=timezone.utc).timestamp())
                except ValueError:
                    pass
            continue
        parts = [p.strip() for p in line.split("|", 3)]
        if len(parts) != 4:
            continue
        try:
            dt = datetime.strptime(parts[0], "%Y-%m-%d %H:%M")
        except ValueError:
            continue
        ev = _make_event(
            ts=int(dt.replace(tzinfo=timezone.utc).timestamp()),
            ccy=parts[1],
            impact=parts[2],
            title=parts[3],
            source="news-calendar-feed",
        )
        if ev:
            events.append(ev)
    return events, generated


def in_window(ts: int, now: int,
              days: int = WINDOW_DAYS, past_hours: int = KEEP_PAST_HOURS) -> bool:
    return now - past_hours * 3600 <= ts <= now + days * 86400


def dedupe(events: List[dict]) -> List[dict]:
    seen = set()
    out: List[dict] = []
    for ev in events:
        key = (ev["ccy"], ev["t"], _norm_title(ev["title"]))
        if key in seen:
            continue
        seen.add(key)
        out.append(ev)
    return out


def merge_events(primary: List[dict], secondary: List[dict]) -> List[dict]:
    """Keep ``primary`` (TradingView) and only add genuinely new secondary rows.

    The GitHub feed mirrors major ForexFactory releases. If it lands within
    ±10 minutes of a TradingView event for the same currency, it is a duplicate
    and skipped (the exact minute often differs between scrapers).
    """
    out = list(primary)
    for ev in secondary:
        duplicate = any(
            p["ccy"] == ev["ccy"] and abs(p["t"] - ev["t"]) <= 600
            for p in primary
        )
        if not duplicate:
            out.append(ev)
    out.sort(key=lambda e: (e["t"], -IMPACT_RANK.get(e["impact"], 0)))
    return out


def build(now: Optional[int] = None) -> dict:
    now = int(time.time()) if now is None else int(now)
    start = now - KEEP_PAST_HOURS * 3600
    end = now + WINDOW_DAYS * 86400
    sources: List[dict] = []

    # 1) TradingView: richest and most current.
    tv_events: List[dict] = []
    try:
        raw = _get(
            TV_URL.format(start=_iso_query(start), end=_iso_query(end)),
            headers={
                "Origin": "https://www.tradingview.com",
                "Referer": "https://www.tradingview.com/",
            },
        )
        doc = json.loads(raw)
        tv_events = [e for e in parse_tradingview(doc) if in_window(e["t"], now)]
        sources.append({
            "id": "tradingview",
            "name": "TradingView economic calendar",
            "url": "https://www.tradingview.com/economic-calendar/",
            "ok": True,
            "count": len(tv_events),
            "error": None,
            "feed_generated_at": None,
            "age_hours": None,
            "stale": False,
        })
    except Exception as err:
        sources.append({
            "id": "tradingview",
            "name": "TradingView economic calendar",
            "url": "https://www.tradingview.com/economic-calendar/",
            "ok": False,
            "count": 0,
            "error": str(err)[:240],
            "feed_generated_at": None,
            "age_hours": None,
            "stale": True,
        })

    # 2) The GitHub feed requested by the user.
    pipe_events: List[dict] = []
    pipe_generated: Optional[int] = None
    try:
        text = _get(PIPE_URL)
        parsed, pipe_generated = parse_pipe(text)
        pipe_events = [e for e in parsed if in_window(e["t"], now)]
        age_hours = round((now - pipe_generated) / 3600, 1) if pipe_generated else None
        sources.append({
            "id": "news-calendar-feed",
            "name": "Brainstrom1974/news-calendar-feed",
            "url": "https://github.com/Brainstrom1974/news-calendar-feed",
            "ok": True,
            "count": len(pipe_events),
            "error": None,
            "feed_generated_at": _iso(pipe_generated) if pipe_generated else None,
            "age_hours": age_hours,
            "stale": bool(age_hours is not None and age_hours > 36),
        })
    except Exception as err:
        sources.append({
            "id": "news-calendar-feed",
            "name": "Brainstrom1974/news-calendar-feed",
            "url": "https://github.com/Brainstrom1974/news-calendar-feed",
            "ok": False,
            "count": 0,
            "error": str(err)[:240],
            "feed_generated_at": None,
            "age_hours": None,
            "stale": True,
        })

    events = dedupe(merge_events(tv_events, pipe_events))
    counts = {k: 0 for k in IMPACT_RANK}
    for ev in events:
        counts[ev["impact"]] += 1

    return {
        "generated_at": _iso(now),
        "window": {"from": _iso(start), "to": _iso(end), "days": WINDOW_DAYS},
        "counts": counts,
        "sources": sources,
        "events": events,
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Economic news feed aggregator")
    parser.add_argument(
        "--require-events", action="store_true",
        help="exit 1 when no upcoming high/medium event exists (CI keeps prior file)",
    )
    args = parser.parse_args(argv)

    now = int(time.time())
    doc = build(now)
    json.dump(doc, sys.stdout, separators=(",", ":"), ensure_ascii=False)
    sys.stdout.write("\n")

    if args.require_events:
        upcoming = [
            e for e in doc["events"]
            if e["t"] >= now and e["impact"] in ("high", "medium")
        ]
        if not upcoming:
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

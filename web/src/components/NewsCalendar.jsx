import { useCallback, useEffect, useMemo, useState } from "react";

const IMPACT = {
  high: { label: "HIGH", cls: "imp-high" },
  medium: { label: "MED", cls: "imp-med" },
  low: { label: "LOW", cls: "imp-low" },
  holiday: { label: "HOL", cls: "imp-hol" },
};

const PAIRS = [
  { id: "EURUSD", ccy: ["EUR", "USD"] },
  { id: "GBPUSD", ccy: ["GBP", "USD"] },
  { id: "USDJPY", ccy: ["USD", "JPY"] },
  { id: "AUDUSD", ccy: ["AUD", "USD"] },
  { id: "USDCAD", ccy: ["USD", "CAD"] },
  { id: "USDCHF", ccy: ["USD", "CHF"] },
  { id: "NZDUSD", ccy: ["NZD", "USD"] },
  { id: "EURJPY", ccy: ["EUR", "JPY"] },
  { id: "XAUUSD", ccy: ["USD"] },
  { id: "BTCUSD", ccy: ["USD"] },
];

const fmtVal = (v) => (v == null || v === "" ? "—" : String(v));

function fmtTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function countdown(ts, now) {
  const mins = Math.round((ts * 1000 - now) / 60000);
  if (mins <= -60) return `${Math.round(-mins / 60)}j lalu`;
  if (mins < 0) return `${-mins} mnt lalu`;
  if (mins < 60) return `dalam ${mins} mnt`;
  if (mins < 1440) return `dalam ${Math.round(mins / 60)}j`;
  return `dalam ${Math.round(mins / 1440)}h`;
}

function EventRow({ e, now }) {
  const imp = IMPACT[e.impact] || IMPACT.low;
  return (
    <tr>
      <td className="news-time">
        {fmtTime(e.iso)}
        <span>{countdown(e.t, now)}</span>
      </td>
      <td className="num"><span className="ccy">{e.ccy}</span></td>
      <td><span className={"badge " + imp.cls}>{imp.label}</span></td>
      <td className="news-title">
        {e.title}
        {(e.forecast != null || e.previous != null) && (
          <span className="news-vals">
            forecast {fmtVal(e.forecast)} · prev {fmtVal(e.previous)}
          </span>
        )}
      </td>
    </tr>
  );
}

export function NewsCalendar() {
  const [state, setState] = useState({ status: "loading" });
  const [pair, setPair] = useState("EURUSD");
  const [showMedium, setShowMedium] = useState(true);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async (force = false) => {
    // 1) Local backend (node server.js) — regenerates the feed.
    try {
      const res = await fetch("/api/news" + (force ? "?force=1" : ""), {
        cache: "no-cache",
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data?.events) {
          setState({ status: "ok", data: json.data, source: "live" });
          setNow(Date.now());
          return;
        }
      }
    } catch (e) {
      // Pages returns index.html here → json() throws; use the static snapshot.
    }

    // 2) Static snapshot refreshed by the scheduled GitHub Actions workflow.
    try {
      const url = `${import.meta.env.BASE_URL}news.json` + (force ? `?t=${Date.now()}` : "");
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json?.events) throw new Error("snapshot has no events");
      setState({ status: "ok", data: json, source: "snapshot" });
      setNow(Date.now());
    } catch (e) {
      setState({ status: "error", err: String(e) });
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(() => load(), 5 * 60_000);
    return () => clearInterval(iv);
  }, [load]);

  const pairCcy = useMemo(
    () => PAIRS.find((p) => p.id === pair)?.ccy ?? [],
    [pair]
  );
  const allEvents = state.data?.events ?? [];
  const relevant = useMemo(() => {
    const since = now / 1000 - 3600; // keep one hour of context
    return allEvents
      .filter((e) => pairCcy.includes(e.ccy) && e.t >= since)
      .filter((e) => e.impact === "high" || (showMedium && e.impact === "medium"))
      .sort((a, b) => a.t - b.t);
  }, [allEvents, pairCcy, showMedium, now]);

  const nextHigh = useMemo(
    () => allEvents
      .filter((e) => pairCcy.includes(e.ccy) && e.impact === "high" && e.t * 1000 >= now)
      .sort((a, b) => a.t - b.t)[0],
    [allEvents, pairCcy, now]
  );
  const activeBlackout = useMemo(
    () => allEvents.find(
      (e) => pairCcy.includes(e.ccy) && e.blackout &&
        now / 1000 >= e.blackout[0] && now / 1000 <= e.blackout[1]
    ),
    [allEvents, pairCcy, now]
  );

  const sources = state.data?.sources ?? [];
  const staleSource = sources.find((s) => s.stale);
  const generatedAge = state.data?.generated_at
    ? Math.max(0, Math.round((now - new Date(state.data.generated_at).getTime()) / 60000))
    : null;

  const soon = nextHigh && nextHigh.t * 1000 - now <= 60 * 60_000;

  return (
    <>
      <div className="sec-h">
        <h2>News &amp; impact · forex</h2>
        <span className="meta">
          {state.status === "ok"
            ? `${relevant.length} event · ${pair} · ${state.source === "live" ? "live lokal" : "snapshot GitHub Actions"}`
            : state.status === "error" ? "feed tidak tersedia" : "membaca kalender"}
          {state.status !== "error" && (
            <button className="toggle" style={{ marginLeft: 10 }} onClick={() => load(true)} aria-label="Refresh news">↻ now</button>
          )}
        </span>
        <div className="rule" />
      </div>

      {state.status === "loading" && <div className="insight">🗓️ Membaca kalender ekonomi…</div>}
      {state.status === "error" && (
        <div className="insight">
          ⚠️ Kalender berita tidak tersedia ({state.err}). Strategi sinyal tetap berjalan;
          panel ini hanya informasi risiko.
        </div>
      )}

      {state.status === "ok" && (
        <>
          <div className="news-pairs">
            {PAIRS.map((p) => (
              <button
                key={p.id}
                className={"chip pair" + (pair === p.id ? " active" : "")}
                onClick={() => setPair(p.id)}
              >
                {p.id}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <button
              className={"chip mini " + (!showMedium ? "ok" : "")}
              onClick={() => setShowMedium(false)}
            >
              HIGH only
            </button>
            <button
              className={"chip mini " + (showMedium ? "ok" : "")}
              onClick={() => setShowMedium(true)}
            >
              HIGH + MED
            </button>
          </div>

          {activeBlackout ? (
            <div className="news-status is-block">
              <b>⛔ BLACKOUT</b> — {activeBlackout.ccy} {activeBlackout.title} ·
              sampai {new Date(activeBlackout.blackout[1] * 1000).toLocaleTimeString()}
            </div>
          ) : soon ? (
            <div className="news-status is-soon">
              <b>⚠ HIGH IMPACT</b> — {nextHigh.ccy} {nextHigh.title} {countdown(nextHigh.t, now)}
            </div>
          ) : (
            <div className="news-status is-clear">
              <b>✓ Tidak ada high-impact dekat</b> — {pair} aman untuk saat ini
            </div>
          )}

          {relevant.length === 0 ? (
            <div className="news-empty">
              Tidak ada event {showMedium ? "high/medium" : "high"} untuk {pair} dalam{" "}
              {state.data?.window?.days ?? 10} hari ke depan.
            </div>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Waktu (lokal)</th>
                    <th className="num">CCY</th>
                    <th>Impact</th>
                    <th>Event</th>
                  </tr>
                </thead>
                <tbody>
                  {relevant.slice(0, 12).map((e) => (
                    <EventRow key={e.id} e={e} now={now} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="news-src">
            <span>Sumber:</span>
            {sources.map((s) => (
              <a
                key={s.id}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className={"chip mini " + (s.ok && !s.stale ? "ok" : "no")}
                title={s.error || ""}
              >
                {s.ok ? (s.stale ? "⚠" : "✓") : "✗"} {s.name}
                {s.feed_generated_at && s.age_hours != null
                  ? ` · ${Math.round(s.age_hours)}j lalu`
                  : ""}
              </a>
            ))}
            <span className="news-note">
              {state.data?.generated_at
                ? `diperbarui ${generatedAge ?? "?"} mnt lalu · `
                : ""}
              snapshot tiap ~15 mnt · jam lokal Anda · bukan nasihat keuangan
            </span>
          </div>
          {staleSource && (
            <div className="news-note" style={{ marginTop: 6 }}>
              ⚠ {staleSource.name} terakhir dibuat{" "}
              {staleSource.age_hours != null ? `${Math.round(staleSource.age_hours)} jam lalu` : "tidak diketahui"} —
              event dari sumber itu mungkin sudah lewat.
            </div>
          )}
        </>
      )}
    </>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";

const IS_LOCAL =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

const PAIR_STATUS = {
  locked: { label: "LOCKED", cls: "badge-ok" },
  "news-blocked": { label: "NEWS BLOCK", cls: "badge-bad" },
  waiting: { label: "WAITING", cls: "badge-idle" },
  trending: { label: "TRENDING", cls: "badge-idle" },
};

const STRAT_STATUS = {
  "locked-long": { label: "BUY LOCKED", cls: "badge-ok" },
  "locked-short": { label: "SELL LOCKED", cls: "badge-ok" },
  "news-blocked": { label: "NEWS", cls: "badge-bad" },
  "blocked-direction": { label: "ARAH ✗", cls: "badge-bad" },
  waiting: { label: "WAITING", cls: "badge-idle" },
  trending: { label: "TRENDING", cls: "badge-idle" },
};

function fmtPrice(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  if (Math.abs(n) >= 1000) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (Math.abs(n) >= 100) return n.toFixed(3);
  if (Math.abs(n) >= 10) return n.toFixed(4);
  return n.toFixed(5);
}

function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function countdown(ts, now) {
  if (!ts) return "";
  const mins = Math.round((ts * 1000 - now) / 60000);
  if (mins <= -60) return `${Math.round(-mins / 60)}j lalu`;
  if (mins < 0) return `${-mins} mnt lalu`;
  if (mins < 60) return `dalam ${mins} mnt`;
  if (mins < 1440) return `dalam ${Math.round(mins / 60)}j`;
  return `dalam ${Math.round(mins / 1440)}h`;
}

function Badge({ map, value }) {
  const s = map[value] || map.waiting || { label: value, cls: "badge-idle" };
  return <span className={"badge " + s.cls}>{s.label}</span>;
}

function LegMini({ side, lv }) {
  if (!lv) return null;
  const isBuy = side === "buy";
  const invalid = lv.valid === false;
  const target = lv.tp != null
    ? fmtPrice(lv.tp)
    : lv.anchor != null
      ? `mean ${fmtPrice(lv.anchor)}`
      : "—";
  return (
    <div className={"fx-leg" + (invalid ? " invalid" : "")}>
      <div className="fx-leg-hd">
        <b>{isBuy ? "BUY" : "SELL"}</b>
        {invalid && <span className="badge badge-bad">tidak berlaku</span>}
      </div>
      <div className="fx-leg-grid">
        <span><i>Entry</i><b>{fmtPrice(lv.entry_ref)}</b></span>
        <span><i>SL</i><b>{fmtPrice(lv.sl)}</b></span>
        <span><i>Target</i><b>{invalid ? "—" : target}</b></span>
        <span><i>Risk</i><b>${lv.risk_usd ?? "—"}</b></span>
      </div>
    </div>
  );
}

function LockedCard({ p, s, now }) {
  const t = s.ticket;
  if (!t) return null;
  const isBuy = t.side === "LONG";
  const lv = s.levels ? s.levels[isBuy ? "buy" : "sell"] : null;
  const target = t.tp != null
    ? fmtPrice(t.tp)
    : lv?.anchor != null
      ? `mean ${fmtPrice(lv.anchor)}`
      : "—";
  const notionalRisk = t.risk_usd != null ? `$${t.risk_usd}` : "—";
  return (
    <div className={"fx-lock " + (isBuy ? "fx-long" : "fx-short")}>
      <div className="fx-lock-hd">
        <div>
          <span className="fx-pair">{p.label}</span>
          <span className={"badge " + (isBuy ? "badge-ok" : "badge-bad")}>
            {isBuy ? "BUY LOCKED" : "SELL LOCKED"}
          </span>
        </div>
        <span className="fx-lock-wr">WR {t.backtest_win_rate}%</span>
      </div>
      <div className="fx-lock-name">{s.name}</div>
      <div className="fx-lock-grid">
        <span><i>Entry (ref)</i><b>{fmtPrice(t.entry)}</b></span>
        <span><i>Stop · {lv?.sl_atr != null ? `${lv.sl_atr}×ATR` : "ATR"}</i><b>{fmtPrice(t.sl)}</b></span>
        <span>
          <i>Target {t.target_kind === "mean-anchor" ? "· mean" : ""}</i>
          <b>{target}</b>
        </span>
        <span><i>Risk</i><b>{notionalRisk}</b></span>
      </div>
      <div className="fx-checks">
        <span className="chip mini ok">✓ ADX {s.adx} &lt; 25</span>
        <span className="chip mini ok">✓ {s.source} {s.value}</span>
        <span className="chip mini ok">✓ news clear</span>
        <span className="chip mini ok">✓ arah target valid</span>
      </div>
      <div className="fx-lock-foot">
        Last close <b>{fmtPrice(p.last_close)}</b> · bar closed {fmtTime(p.bar_closed_at)} ·{" "}
        {p.news.next
          ? `news berikut ${p.news.next.ccy} ${countdown(p.news.next.t, now)}`
          : "tidak ada high/medium dekat"}
      </div>
    </div>
  );
}

function StrategyTable({ p }) {
  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Strategy</th>
            <th className="num">IND</th>
            <th className="num">BUY at</th>
            <th className="num">SELL at</th>
            <th className="num">ADX</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {p.strategies.map((s) => (
            <tr key={s.id}>
              <td className="st-name">{s.name}</td>
              <td className="num mono">{s.value ?? "n/a"}</td>
              <td className="num">{s.long_at}</td>
              <td className="num">{s.short_at}</td>
              <td className="num">{s.adx}{s.adx_ok ? " ✓" : " ✗"}</td>
              <td><Badge map={STRAT_STATUS} value={s.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PairDetail({ p }) {
  const preview = p.strategies.filter((s) => !s.status.startsWith("locked"));
  return (
    <details className="fx-detail">
      <summary>
        <span className="fx-pair">{p.label}</span>
        <span className="meta">{fmtPrice(p.last_close)}</span>
        <Badge map={PAIR_STATUS} value={p.status} />
        <span className="meta">
          {p.locked.length ? `${p.locked.length} plan terkunci` : "belum ada plan terkunci"}
        </span>
      </summary>
      <StrategyTable p={p} />
      {preview.length > 0 && (
        <div className="fx-preview-grid">
          {preview.map((s) => (
            <div className="fx-preview" key={s.id}>
              <div className="fx-preview-hd">
                <b>{s.name}</b>
                <Badge map={STRAT_STATUS} value={s.status} />
              </div>
              <div className="fx-preview-body">
                <LegMini side="buy" lv={s.levels?.buy} />
                <LegMini side="sell" lv={s.levels?.sell} />
              </div>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

export function ForexSignals() {
  const [state, setState] = useState({ status: "loading" });
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async (force = false) => {
    try {
      const res = await fetch("/api/forex" + (force ? "?force=1" : ""), {
        cache: "no-cache",
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data?.pairs) {
          setState({ status: "ok", data: json.data, cached: json.cached, source: "live" });
          setNow(Date.now());
          return;
        }
      }
    } catch (e) {
      // Pages serves index.html for /api/forex → json() throws; use snapshot.
    }

    try {
      const url = `${import.meta.env.BASE_URL}forex.json` + (force ? `?t=${Date.now()}` : "");
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json?.pairs) throw new Error("snapshot has no pairs");
      setState({ status: "ok", data: json, cached: true, source: "snapshot" });
      setNow(Date.now());
    } catch (e) {
      setState({ status: "error", err: String(e) });
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(() => load(), IS_LOCAL ? 60_000 : 5 * 60_000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const data = state.data;
  const pairs = data?.pairs ?? [];
  const lockedPairs = useMemo(() => pairs.filter((p) => p.locked.length > 0), [pairs]);
  const activeNews = useMemo(
    () => pairs.map((p) => p.news?.active).find(Boolean),
    [pairs]
  );
  const nextNews = useMemo(() => {
    const rows = pairs.map((p) => p.news?.next).filter(Boolean);
    rows.sort((a, b) => a.t - b.t);
    return rows[0];
  }, [pairs]);
  const snapshotAgeMin =
    state.source === "snapshot" && data?.generated_at
      ? Math.max(0, Math.round((now - new Date(data.generated_at).getTime()) / 60000))
      : null;
  const stale = snapshotAgeMin != null && snapshotAgeMin > 75;
  const blockedCount = pairs.filter((p) => p.status === "news-blocked").length;

  return (
    <>
      <div className="sec-h">
        <h2>Forex scanner · lolos &amp; terkunci</h2>
        <span className="meta">
          {state.status === "ok"
            ? `${data.scanned} pair dipindai · ${data.locked_count} pair terkunci · ${
                state.source === "snapshot" ? "snapshot GitHub Actions" : "live lokal"
              }`
            : state.status === "error" ? "scanner tidak tersedia" : "memindai 4h + news"}
          {state.status === "ok" && (
            <button className="toggle" style={{ marginLeft: 10 }} onClick={() => load(true)} aria-label="Refresh forex">
              ↻ now
            </button>
          )}
        </span>
        <div className="rule" />
      </div>

      {state.status === "loading" && (
        <div className="insight">🌐 Memindai forex 4h, ADX, level plan, dan kalender berita…</div>
      )}
      {state.status === "error" && (
        <div className="insight">
          ⚠️ Forex scanner tidak tersedia ({state.err}). Panel crypto &amp; berita tetap berjalan.
        </div>
      )}

      {state.status === "ok" && (
        <>
          <div className="insight">
            <b>Hanya pair yang lolos semua gate yang masuk daftar LOCKED.</b> Gate-nya sama
            dengan panel sinyal crypto: indikator di zona ekstrem (VWAP-z / RSI-2 / stochastic /
            z-score) <b>+ ADX(14) &lt; 25</b>, ditambah <b>tidak ada news HIGH/MEDIUM</b> di
            jendela blackout pair tersebut. Plan memakai Entry/SL/TP ATR yang sama; strategi
            revert memakai <b>mean anchor</b> sebagai target.
            <div className="src">
              {state.source === "snapshot"
                ? `snapshot GitHub Actions · diperbarui ${snapshotAgeMin ?? "?"} menit lalu ·`
                : `live lokal · ${state.cached ? "cached" : "fresh"} ·`}{" "}
              {data.provider} · {new Date(now).toLocaleTimeString()}
            </div>
            <div className="src">
              ⚠️ Eksperimental/paper: aturan ini divalidasi di BTC/ETH, belum di forex.
              Gunakan sebagai screening, bukan nasihat keuangan.
            </div>
          </div>

          {stale && (
            <div className="insight">
              ⚠️ Snapshot forex lebih dari 75 menit. Workflow terjadwal mungkin tertunda;
              gunakan tombol <b>↻ now</b> atau jalankan backend lokal untuk data baru.
            </div>
          )}

          <div className={"news-status " + (activeNews ? "is-block" : nextNews && nextNews.t * 1000 - now < 60 * 60_000 ? "is-soon" : "is-clear")}>
            {activeNews ? (
              <>
                <b>⛔ NEWS BLACKOUT</b>{" — "}{activeNews.ccy} {activeNews.title} · sampai{" "}
                {new Date(activeNews.blackout[1] * 1000).toLocaleTimeString()} ·{" "}
                {blockedCount} pair tertahan
              </>
            ) : nextNews ? (
              <>
                <b>✓ Tidak ada blackout aktif</b>{" — "}event berikut {nextNews.ccy} {nextNews.title}{" "}
                {countdown(nextNews.t, now)} ({fmtTime(nextNews.t)})
              </>
            ) : (
              <>
                <b>✓ Tidak ada event HIGH/MEDIUM dekat</b>{" — "}semua pair bebas news gate
              </>
            )}
          </div>

          <div className="sec-h" style={{ marginTop: 22 }}>
            <h2>Plan terkunci siap order</h2>
            <span className="meta">BUY/SELL · paper ticket · arah target sudah divalidasi</span>
            <div className="rule" />
          </div>

          {lockedPairs.length === 0 ? (
            <div className="news-empty">
              Belum ada pair yang lolos semua gate saat ini. Pair yang sedang trending atau
              menunggu trigger tetap bisa dilihat di tabel bawah; plan akan terkunci otomatis
              saat bar 4h berikutnya memenuhi checklist.
            </div>
          ) : (
            <div className="fx-grid">
              {lockedPairs.flatMap((p) =>
                p.locked.map((s) => <LockedCard key={p.pair + s.id} p={p} s={s} now={now} />)
              )}
            </div>
          )}

          <div className="sec-h" style={{ marginTop: 26 }}>
            <h2>Semua pair yang dipindai</h2>
            <span className="meta">status gate · news berikut · jumlah plan terkunci</span>
            <div className="rule" />
          </div>

          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pair</th>
                  <th className="num">Last close</th>
                  <th>Status</th>
                  <th>News</th>
                  <th className="num">Locked</th>
                  <th>Plan</th>
                  <th>Sumber</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((p) => (
                  <tr key={p.pair}>
                    <td className="st-name">
                      {p.label} {p.proxy && <span className="chip mini">proxy</span>}
                    </td>
                    <td className="num mono">{fmtPrice(p.last_close)}</td>
                    <td><Badge map={PAIR_STATUS} value={p.status} /></td>
                    <td className="fx-news-cell">
                      {p.news?.blocked && p.news.active ? (
                        <>⛔ {p.news.active.ccy} {p.news.active.title}</>
                      ) : p.news?.next ? (
                        <>★ {p.news.next.ccy} {p.news.next.title} · {countdown(p.news.next.t, now)}</>
                      ) : (
                        "clear"
                      )}
                    </td>
                    <td className="num">{p.locked.length}</td>
                    <td>
                      {p.locked.length
                        ? p.locked.map((s) => `${s.ticket?.side ?? "?"} ${s.name}`).join(" · ")
                        : "—"}
                    </td>
                    <td className="mono fx-src">{p.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sec-h" style={{ marginTop: 26 }}>
            <h2>Detail per pair</h2>
            <span className="meta">checklist strategi + preview BUY/SELL</span>
            <div className="rule" />
          </div>
          <div className="fx-details">
            {pairs.map((p) => <PairDetail key={p.pair} p={p} />)}
          </div>

          {data.errors?.length > 0 && (
            <div className="news-note" style={{ marginTop: 12 }}>
              ⚠ Pair gagal dipindai: {data.errors.map((e) => `${e.pair} (${e.error})`).join(" · ")}
            </div>
          )}

          <div className="news-src">
            <span>Sumber data:</span>
            <span className="chip mini ok">✓ {data.provider}</span>
            {(data.news?.sources ?? []).map((s) => (
              <span
                key={s.id}
                className={"chip mini " + (s.ok && !s.stale ? "ok" : "no")}
                title={s.error || ""}
              >
                {s.ok ? (s.stale ? "⚠" : "✓") : "✗"} {s.name}
                {s.age_hours != null ? ` · ${Math.round(s.age_hours)}j lalu` : ""}
              </span>
            ))}
            <span className="news-note">
              {Object.entries(data.sources ?? {})
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}{" "}
              · snapshot tiap ~15 mnt · bukan nasihat keuangan
            </span>
          </div>
        </>
      )}
    </>
  );
}

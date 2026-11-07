import { useCallback, useEffect, useState } from "react";
import { money0 } from "../format.js";

const fmt = (p) =>
  p == null ? "—"
  : Math.abs(p) >= 1000 ? p.toLocaleString(undefined, { maximumFractionDigits: 0 })
  : p.toFixed(2);

function Leg({ side, lv, locked }) {
  const isBuy = side === "buy";
  if (!lv) return null;
  const invalid = lv.valid === false;
  const sideLabel = isBuy ? "BUY" : "SELL";
  const wrongSide =
    lv.anchor != null && lv.entry_ref != null
      ? (isBuy ? "di BAWAH" : "di ATAS")
      : null;

  return (
    <div className={"sig-leg" + (locked ? " sig-locked" : "") + (invalid ? " invalid" : "")}>
      <div className="sig-leg-hd">
        <span>{isBuy ? "🟢 BUY plan" : "🔴 SELL plan"}</span>
        {locked && <span className="badge badge-ok">LOCKED ✅</span>}
        {invalid && <span className="badge badge-idle">tidak berlaku</span>}
      </div>
      <div className="sig-ticket-grid">
        <div><i>Entry (ref)</i><b>{fmt(lv.entry_ref)}</b></div>
        <div><i>Stop · {lv.sl_atr}×ATR</i><b>{fmt(lv.sl)}</b></div>
        <div>
          <i>Target</i>
          <b>{invalid ? "—" : lv.tp ? fmt(lv.tp) : lv.anchor ? `mean ${fmt(lv.anchor)}` : "—"}</b>
        </div>
        <div>
          <i>Risk / Reward</i>
          <b>{invalid ? "—" : `−${money0(lv.risk_usd)} / ${lv.reward_usd ? "+" + money0(lv.reward_usd) : "dynamic"}`}</b>
        </div>
      </div>
      {invalid && (
        <div className="sig-leg-note">
          Plan {sideLabel} ini tidak berlaku: rerata (mean) {fmt(lv.anchor)} berada {wrongSide} harga{" "}
          {fmt(lv.entry_ref)} — untuk {sideLabel}, target harus {isBuy ? "di ATAS" : "di BAWAH"} entry.
        </div>
      )}
    </div>
  );
}

function PlanPanel({ s }) {
  const lv = s.levels;
  const lockedLong = s.status === "triggered-long";
  const lockedShort = s.status === "triggered-short";
  const locked = lockedLong || lockedShort;

  // Checklist validasi sinyal — bukti kenapa terkunci (atau belum lolos)
  const checks = [];
  if (s.adx != null) {
    checks.push({
      ok: s.adx_ok,
      txt: `ADX(14) ${s.adx} ${s.adx_ok ? "<" : "≥"} 25 ${s.adx_ok ? "✓ ranging" : "✗ trending"}`,
    });
  }
  if (s.value != null) {
    if (s.value < s.long_at) {
      checks.push({ ok: true, txt: `${s.source} ${s.value} < ${s.long_at} ✓ zona BUY` });
    } else if (s.value > s.short_at) {
      checks.push({ ok: true, txt: `${s.source} ${s.value} > ${s.short_at} ✓ zona SELL` });
    } else {
      const d = s.distance || {};
      checks.push({
        ok: false,
        txt: `${s.source} ${s.value} belum di zona ekstrem (jarak: long ${d.to_long ?? "—"} · short ${d.to_short ?? "—"})`,
      });
    }
  }

  return (
    <div className={"sig-plan " + (locked ? (lockedLong ? "sig-long" : "sig-short") : "sig-preview")}>
      <div className="sig-plan-hd">
        <span className="st-name">{s.name}</span>
        {locked
          ? <span className="badge badge-ok">{lockedLong ? "BUY terkunci ✅" : "SELL terkunci ✅"}</span>
          : <span className="badge badge-idle">PREVIEW — belum sinyal</span>}
      </div>
      <div className="sig-checklist">
        {checks.map((c, i) => (
          <span key={i} className={"chip mini " + (c.ok ? "ok" : "no")}>{c.ok ? "✓" : "✗"} {c.txt}</span>
        ))}
      </div>
      {locked ? (
        <Leg side={lockedLong ? "buy" : "sell"} lv={lv ? lv[lockedLong ? "buy" : "sell"] : null} locked />
      ) : (
        <div className="sig-two">
          <Leg side="buy" lv={lv?.buy} />
          <Leg side="sell" lv={lv?.sell} />
        </div>
      )}
      <div className="sig-ticket-note">
        {locked
          ? "🔒 Terkunci: entry di OPEN bar berikutnya (jangan nge-chase di tengah bar) · SL/TP mengikuti leg ini"
          : "PREVIEW adalah bukan order — level inilah yang akan terkunci bila bar nanti lolos checklist. Set alert di exchange pada trigger."}
      </div>
    </div>
  );
}

function AssetCard({ a }) {
  return (
    <div className="card">
      <h3>{a.asset}/USD · 4h</h3>
      <div className="ch-sub">last close {fmt(a.last_close)} · bar closed {new Date(a.bar_closed_at * 1000).toLocaleString()}</div>
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
            {a.strategies.map((s) => {
              const meter = s.status === "triggered-long" ? "BUY ✅"
                : s.status === "triggered-short" ? "SELL ✅"
                : s.status === "waiting" ? "waiting"
                : "trending ✗";
              const cls = s.status === "triggered-long" || s.status === "triggered-short" ? "badge-ok"
                : s.status === "waiting" ? "badge-idle" : "badge-bad";
              return (
                <tr key={s.id}>
                  <td className="st-name">{s.name}</td>
                  <td className="num mono">{s.value ?? "n/a"}</td>
                  <td className="num">{s.long_at}</td>
                  <td className="num">{s.short_at}</td>
                  <td className="num">{s.adx}{s.adx_ok ? " ✓" : " ✗"}</td>
                  <td><span className={"badge " + cls}>{meter}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {a.strategies.map((s) => <PlanPanel key={s.id} s={s} />)}
    </div>
  );
}

export function LiveSignals() {
  const [state, setState] = useState({ status: "loading" });
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async (force = false) => {
    try {
      const res = await fetch("/api/signals" + (force ? "?force=1" : ""));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json?.data?.assets) throw new Error("bad payload");
      setState({ status: "ok", data: json.data, cached: json.cached });
      setNow(Date.now());
    } catch (e) {
      // GitHub Pages is static: there is no Python backend to read the market.
      const local = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
      setState(local ? { status: "error", err: String(e) } : { status: "offline" });
    }
  }, []);

  useEffect(() => {
    load();
    // Poll only when a local backend can actually answer.
    const local = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    if (!local) return;
    const iv = setInterval(() => load(), 60_000);
    return () => clearInterval(iv);
  }, [load]);

  const lockedCount =
    state.data?.assets.flatMap((a) => a.strategies.filter((s) => s.status.startsWith("triggered"))).length ?? 0;
  const anyGateOpen = state.data?.assets.some((a) => a.strategies.some((s) => s.adx_ok));

  return (
    <>
      <div className="sec-h">
        <h2>Live signals</h2>
        <span className="meta">
          {state.status === "ok"
            ? (lockedCount ? `${lockedCount} signal terkunci 🔒` :
               (anyGateOpen ? "gate terbuka · menunggu trigger · preview levels aktif" : "trending · gate tertutup · preview levels aktif")) + " · auto 60s"
            : state.status === "offline" ? "mode statis · backend lokal tidak tersedia"
            : "membaca pasar"}
          {state.status !== "offline" && (
            <button className="toggle" style={{ marginLeft: 10 }} onClick={() => load(true)} aria-label="Refresh">↻ now</button>
          )}
        </span>
        <div className="rule" />
      </div>

      {state.status === "loading" && <div className="insight">📡 Membaca live market…</div>}
      {state.status === "error" && (
        <div className="insight">⚠️ Live feed unavailable ({state.err}) — laporan backtest di bawah tetap valid.</div>
      )}
      {state.status === "offline" && (
        <div className="insight">
          <b>Live signals hanya berjalan di komputer Anda.</b> GitHub Pages menyajikan file statis,
          jadi tidak ada backend Python untuk membaca pasar. Jalankan{" "}
          <code>cd ~/Downloads/MiND-Shot &amp;&amp; ./start.sh</code> lalu buka{" "}
          <b>http://localhost:5173/</b> untuk sinyal live + plan BUY/SELL yang terkunci.
          <div className="src">Laporan backtest di bawah tetap valid — berasal dari snapshot build terakhir.</div>
        </div>
      )}

      {state.status === "ok" && (
        <>
          <div className="insight">
            <b>Setiap strategi punya Plan BUY &amp; SELL LIVE.</b> Bila bar 4h close lolos checklist
            (indikator masuk zona ekstrem <b>+ ADX(14) &lt; 25</b>), plan berubah jadi
            <b> LOCKED ✅</b> dengan Entry/Stop/Target/Size final — entry di open bar berikutnya.
            <div className="src">
              {state.cached ? "cached ·" : "fresh ·"} {new Date(now).toLocaleTimeString()}
              {state.data.assets.map((a) => ` · ${a.asset} ${fmt(a.last_close)}`).join("")}
            </div>
          </div>
          <div className="bento">
            {state.data.assets.map((a) => <AssetCard key={a.asset} a={a} />)}
          </div>
        </>
      )}
    </>
  );
}

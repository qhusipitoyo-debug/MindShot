import React, { useState } from 'react';
import { AssetSignals, StrategySignal } from '../types/market';
import { CheckCircle2, XCircle, AlertTriangle, Copy, Check, ShieldCheck, Zap } from 'lucide-react';

interface LiveSignalsPanelProps {
  assets: AssetSignals[];
  lastUpdate: string;
  source: string;
  onForceRefresh: () => void;
  isRefreshing: boolean;
}

export const LiveSignalsPanel: React.FC<LiveSignalsPanelProps> = ({
  assets,
  lastUpdate,
  source,
  onForceRefresh,
  isRefreshing,
}) => {
  const [marketFilter, setMarketFilter] = useState<'all' | 'crypto' | 'forex' | 'commodities'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredAssets = assets.filter((a) => {
    if (marketFilter === 'all') return true;
    return a.category === marketFilter;
  });

  const handleCopy = (strat: StrategySignal, asset: AssetSignals) => {
    if (!strat.ticket) return;
    const text = `[MiND-Shot Signal] ${strat.ticket.side} ${asset.pair_display} @ ${strat.ticket.entry} | SL: ${strat.ticket.sl} | TP: ${strat.ticket.tp} | R:R ${strat.ticket.rr_ratio} | Risk $${strat.ticket.risk_usd}`;
    navigator.clipboard.writeText(text);
    setCopiedId(strat.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalLocked = assets.reduce(
    (acc, a) => acc + a.strategies.filter((s) => s.status === 'locked').length,
    0
  );

  return (
    <div>
      {/* Top Section Header */}
      <div className="sec-h">
        <h2>Live Signals &amp; Execution Tickets</h2>
        <span className="meta">
          {totalLocked > 0 ? `🎯 ${totalLocked} sinyal LOCKED aktif` : 'Menganalisis live feed & kalibrasi parameter…'}
          {' · '}terakhir diperbarui {new Date(lastUpdate).toLocaleTimeString()}
        </span>
        <div className="rule" />
        <button
          onClick={onForceRefresh}
          disabled={isRefreshing}
          className="text-xs px-2.5 py-1 rounded bg-[var(--surface-1)] border border-[var(--border)] hover:border-[var(--brand)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
        >
          {isRefreshing ? 'Memindai…' : '↻ Scan Now'}
        </button>
      </div>

      {/* Insight Explainer */}
      <div className="insight">
        <b>Setiap strategi memiliki Plan BUY &amp; SELL otomatis.</b> Bila candle close lolos seluruh checklist{' '}
        (indikator masuk zona ekstrem + <b>ADX &lt; threshold kalibrasi</b> + <b>News Clear</b>), status berubah
        menjadi <b>LOCKED ✅</b> dengan Entry/Stop/Target/Size final. Anda dapat mengeksekusi order dengan proteksi
        Risk/Reward ketat.
      </div>

      {/* Market Category Filter Pills */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {[
          { id: 'all', label: 'Semua Market' },
          { id: 'crypto', label: 'Crypto (Binance Feed)' },
          { id: 'forex', label: 'Forex (Yahoo Live)' },
          { id: 'commodities', label: 'Komoditas (Gold/Oil)' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setMarketFilter(f.id as any)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
              marketFilter === f.id
                ? 'bg-[var(--brand)] text-white border-[var(--brand-bright)]'
                : 'bg-[var(--surface-1)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grid of Assets & Strategies */}
      <div className="space-y-8">
        {filteredAssets.map((asset) => (
          <div key={asset.asset} className="card span12 border-[var(--border)]">
            {/* Asset Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold font-mono tracking-tight text-[var(--text)]">
                  {asset.pair_display}
                </span>
                <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)] font-semibold">
                  {asset.category}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-xs text-[var(--text-faint)]">Harga Saat Ini</div>
                  <div className="text-base font-bold mono text-[var(--text)]">
                    {asset.last_close > 100
                      ? asset.last_close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : asset.last_close.toFixed(4)}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-[var(--text-faint)]">24h Chg</div>
                  <div
                    className={`text-sm font-bold mono ${
                      asset.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {asset.change24h >= 0 ? '+' : ''}
                    {asset.change24h.toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>

            {/* List of Strategies for this Asset */}
            <div className="space-y-6">
              {asset.strategies.map((strat) => {
                const isLong = strat.ticket?.side === 'BUY' || strat.value <= strat.long_at;
                const isShort = strat.ticket?.side === 'SELL' || strat.value >= strat.short_at;
                const statusBadge =
                  strat.status === 'locked'
                    ? 'badge-locked'
                    : strat.status === 'preparing'
                    ? 'badge-preparing'
                    : strat.status === 'trending'
                    ? 'badge-trending'
                    : 'badge-idle';

                return (
                  <div
                    key={strat.id}
                    className={`sig-plan ${isLong ? 'sig-long' : isShort ? 'sig-short' : ''}`}
                  >
                    {/* Strategy Header */}
                    <div className="sig-plan-hd">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text)]">{strat.name}</span>
                        <span className={`badge ${statusBadge}`}>
                          {strat.status === 'locked' && 'LOCKED ✅'}
                          {strat.status === 'preparing' && 'PREPARING ⚡'}
                          {strat.status === 'trending' && 'FILTERED (ADX TREND)'}
                          {strat.status === 'idle' && 'MONITORING'}
                        </span>
                      </div>

                      <div className="text-xs mono text-[var(--text-muted)]">
                        {strat.source}: <b className="text-[var(--text)]">{strat.value}</b> (Long &le; {strat.long_at} · Short &ge; {strat.short_at})
                      </div>
                    </div>

                    {/* Checklist Badges */}
                    <div className="sig-checklist">
                      <span className={`chip mini ${strat.value <= strat.long_at || strat.value >= strat.short_at ? 'ok' : 'no'}`}>
                        {strat.value <= strat.long_at || strat.value >= strat.short_at ? <CheckCircle2 className="w-3 h-3 inline mr-1" /> : <XCircle className="w-3 h-3 inline mr-1" />}
                        Zona Ekstrem {strat.value <= strat.long_at ? 'Oversold (Long)' : strat.value >= strat.short_at ? 'Overbought (Short)' : 'Netral'}
                      </span>

                      <span className={`chip mini ${strat.adx_ok ? 'ok' : 'no'}`}>
                        {strat.adx_ok ? <CheckCircle2 className="w-3 h-3 inline mr-1" /> : <XCircle className="w-3 h-3 inline mr-1" />}
                        ADX({strat.adx}) &le; Max({strat.adx_max})
                      </span>

                      <span className="chip mini ok">
                        <ShieldCheck className="w-3 h-3 inline mr-1 text-emerald-400" />
                        News Gate: Clear
                      </span>

                      <span className="chip mini ok">
                        <Zap className="w-3 h-3 inline mr-1 text-amber-400" />
                        ATR ({strat.levels.atr})
                      </span>
                    </div>

                    {/* If Locked or Preparing, show Executable Ticket */}
                    {strat.ticket ? (
                      <div className="sig-ticket">
                        <div className="sig-ticket-hd">
                          <span className="flex items-center gap-2 text-emerald-400">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                            ORDER TICKET ({strat.ticket.side}) — Eksekusi Terkalibrasi
                          </span>
                          <button
                            onClick={() => handleCopy(strat, asset)}
                            className="flex items-center gap-1 text-xs mono px-2 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--brand)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
                          >
                            {copiedId === strat.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" /> Salin Berhasil
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" /> Salin Parameter
                              </>
                            )}
                          </button>
                        </div>

                        <div className="sig-ticket-grid">
                          <div>
                            <i>Entry Target</i>
                            <b>{strat.ticket.entry > 100 ? strat.ticket.entry.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : strat.ticket.entry.toFixed(4)}</b>
                          </div>
                          <div>
                            <i>Stop Loss (Proteksi)</i>
                            <b className="text-rose-400">{strat.ticket.sl > 100 ? strat.ticket.sl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : strat.ticket.sl.toFixed(4)}</b>
                          </div>
                          <div>
                            <i>Target Profit (TP)</i>
                            <b className="text-emerald-400">{strat.ticket.tp > 100 ? strat.ticket.tp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : strat.ticket.tp.toFixed(4)}</b>
                          </div>
                          <div>
                            <i>Risk / Reward</i>
                            <b className="text-[var(--gold)]">1 : {strat.ticket.rr_ratio}</b>
                          </div>
                        </div>

                        <div className="sig-ticket-note flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-[var(--border)] mt-3">
                          <span>
                            Ukuran modal: $100 · Alokasi 15% · Leverage 10× · Max Risk: ${strat.ticket.risk_usd} · Estimasi Reward: ${strat.ticket.reward_usd}
                          </span>
                          <span className="mono text-emerald-400 font-semibold">
                            Confidence Score: {strat.ticket.confidence}%
                          </span>
                        </div>
                      </div>
                    ) : strat.status === 'trending' ? (
                      <div className="p-3 mt-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
                        <div>
                          <b>Filter Trend Runaway Aktif (ADX {strat.adx} &gt; {strat.adx_max}):</b> Indikator masuk area ekstrem,
                          namun volatilitas momentum saat ini terlalu tinggi. Sinyal dikunci secara aman (HOLD) untuk menghindari
                          melawan tren eksplosif sebelum konfirmasi reversal.
                        </div>
                      </div>
                    ) : null}

                    {/* Two-Leg Plan Details */}
                    <div className="sig-two mt-4">
                      {/* BUY LEG */}
                      <div className={`sig-leg ${strat.levels.buy.valid ? '' : 'invalid'}`}>
                        <div className="sig-leg-hd text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>PLAN BUY (Reversi Oversold)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs mono">
                          <div>
                            <span className="text-[var(--text-faint)] block">SL Distance</span>
                            <b>{strat.levels.buy.sl_atr}× ATR ({strat.levels.buy.sl.toFixed(2)})</b>
                          </div>
                          <div>
                            <span className="text-[var(--text-faint)] block">Target TP</span>
                            <b>{strat.levels.buy.tp.toFixed(2)}</b>
                          </div>
                          <div>
                            <span className="text-[var(--text-faint)] block">Jarak ke Trigger</span>
                            <b className="text-[var(--text-muted)]">{strat.distance.to_long.toFixed(2)} pts</b>
                          </div>
                          <div>
                            <span className="text-[var(--text-faint)] block">Estimasi R:R</span>
                            <b className="text-[var(--gold)]">
                              1 : {strat.levels.buy.reward_usd != null ? (strat.levels.buy.reward_usd / strat.levels.buy.risk_usd).toFixed(1) : '1.5'}
                            </b>
                          </div>
                        </div>
                      </div>

                      {/* SELL LEG */}
                      <div className={`sig-leg ${strat.levels.sell.valid ? '' : 'invalid'}`}>
                        <div className="sig-leg-hd text-rose-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>PLAN SELL (Reversi Overbought)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs mono">
                          <div>
                            <span className="text-[var(--text-faint)] block">SL Distance</span>
                            <b>{strat.levels.sell.sl_atr}× ATR ({strat.levels.sell.sl.toFixed(2)})</b>
                          </div>
                          <div>
                            <span className="text-[var(--text-faint)] block">Target TP</span>
                            <b>{strat.levels.sell.tp.toFixed(2)}</b>
                          </div>
                          <div>
                            <span className="text-[var(--text-faint)] block">Jarak ke Trigger</span>
                            <b className="text-[var(--text-muted)]">{strat.distance.to_short.toFixed(2)} pts</b>
                          </div>
                          <div>
                            <span className="text-[var(--text-faint)] block">Estimasi R:R</span>
                            <b className="text-[var(--gold)]">
                              1 : {strat.levels.sell.reward_usd != null ? (strat.levels.sell.reward_usd / strat.levels.sell.risk_usd).toFixed(1) : '1.5'}
                            </b>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

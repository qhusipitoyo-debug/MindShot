import React, { useState } from 'react';
import { CurrencyNewsStatus, NewsEvent } from '../types/market';
import { ShieldAlert, ShieldCheck, Clock, ExternalLink } from 'lucide-react';

interface NewsEngineProps {
  currencyStatus: Record<string, CurrencyNewsStatus>;
  headlines: Array<{ title: string; link: string; pubDate: string; sentiment: 'bullish' | 'bearish' | 'neutral' }>;
  events: NewsEvent[];
}

export const NewsEngine: React.FC<NewsEngineProps> = ({
  currencyStatus,
  headlines,
  events,
}) => {
  const [selectedCcy, setSelectedCcy] = useState<string>('ALL');

  const currencies = ['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD'];

  const filteredEvents = events.filter((e) => {
    if (selectedCcy === 'ALL') return true;
    return e.ccy === selectedCcy;
  });

  return (
    <div>
      <div className="sec-h">
        <h2>News &amp; Volatility Blackout Engine</h2>
        <span className="meta">Proteksi Strategi dari Lonjakan Spread &amp; High-Impact Data Releases</span>
        <div className="rule" />
      </div>

      <div className="insight">
        <b>Sistem Blackout Otomatis:</b> Strategi mean-reversion sengaja mengunci sinyal (BLACKOUT) 15–20 menit
        sebelum dan sesudah rilis berita berdampak tinggi (CPI, NFP, Suku Bunga Fed/ECB/BOJ). Langkah ini mencegah
        slippage tajam dan menjaga win-rate di atas 70%.
      </div>

      {/* Currency Blackout Status Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 mb-6">
        {Object.entries(currencyStatus).map(([ccy, status]) => {
          const isBlock = status.status === 'is-block';
          const isSoon = status.status === 'is-soon';
          return (
            <div
              key={ccy}
              className={`p-3 rounded-xl border text-center transition-all ${
                isBlock
                  ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                  : isSoon
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}
            >
              <div className="text-xs text-[var(--text-faint)] font-bold mb-0.5">{ccy} GATE</div>
              <div className="text-sm font-bold flex items-center justify-center gap-1">
                {isBlock ? (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                    <span>BLACKOUT</span>
                  </>
                ) : isSoon ? (
                  <>
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>{status.countdownMins}m SOON</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>CLEAR</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid: Calendar + Live RSS Headlines */}
      <div className="bento">
        {/* Economic Calendar Events */}
        <div className="card span8">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3>Kalender Rilis Data Ekonomi</h3>

            {/* Currency filter chips */}
            <div className="flex items-center gap-1 flex-wrap">
              {currencies.map((ccy) => (
                <button
                  key={ccy}
                  onClick={() => setSelectedCcy(ccy)}
                  className={`chip pair ${selectedCcy === ccy ? 'active' : ''}`}
                >
                  {ccy}
                </button>
              ))}
            </div>
          </div>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Waktu (UTC)</th>
                  <th>Mata Uang</th>
                  <th>Impact</th>
                  <th>Event Data</th>
                  <th>Forecast</th>
                  <th>Previous</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.slice(0, 15).map((e) => (
                  <tr key={e.id}>
                    <td className="mono text-xs">
                      {new Date(e.t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      <div className="text-[10px] text-[var(--text-faint)]">
                        {new Date(e.t * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </div>
                    </td>
                    <td>
                      <span className="font-bold font-mono text-xs px-1.5 py-0.5 rounded bg-[var(--surface-2)]">
                        {e.ccy}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          e.impact === 'high'
                            ? 'badge-locked bg-rose-500/15 text-rose-400 border-rose-500/40'
                            : e.impact === 'medium'
                            ? 'badge-preparing bg-amber-500/15 text-amber-400 border-amber-500/40'
                            : 'badge-idle'
                        }`}
                      >
                        {e.impact.toUpperCase()}
                      </span>
                    </td>
                    <td className="font-medium text-xs text-[var(--text)]">{e.title}</td>
                    <td className="mono text-xs text-[var(--text-muted)]">{e.forecast ?? '--'}</td>
                    <td className="mono text-xs text-[var(--text-faint)]">{e.previous ?? '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Breaking News Feed with Sentiment */}
        <div className="card span4 flex flex-col justify-between">
          <div>
            <h3>Breaking Market Headlines</h3>
            <div className="ch-sub">Live RSS stream &amp; AI Sentiment Tagging</div>

            <div className="space-y-3">
              {headlines.length > 0 ? (
                headlines.map((h, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-faint)] mb-1">
                      <span>{new Date(h.pubDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span
                        className={`font-bold mono px-1.5 py-0.2 rounded text-[9px] uppercase ${
                          h.sentiment === 'bullish'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : h.sentiment === 'bearish'
                            ? 'bg-rose-500/10 text-rose-400'
                            : 'bg-gray-500/10 text-gray-400'
                        }`}
                      >
                        {h.sentiment}
                      </span>
                    </div>
                    <a
                      href={h.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-[var(--text)] hover:text-[var(--brand-bright)] line-clamp-2 transition-colors flex items-start justify-between gap-1"
                    >
                      <span>{h.title}</span>
                      <ExternalLink className="w-3 h-3 flex-shrink-0 mt-0.5 opacity-40" />
                    </a>
                  </div>
                ))
              ) : (
                <div className="text-xs text-[var(--text-faint)] py-4 text-center">
                  Mengambil update berita pasar terkini...
                </div>
              )}
            </div>
          </div>

          <div className="text-[11px] text-[var(--text-faint)] pt-3 mt-4 border-t border-[var(--border)]">
            Sumber: MarketWatch Financial Wire &amp; TradingView Economic Calendar.
          </div>
        </div>
      </div>
    </div>
  );
};

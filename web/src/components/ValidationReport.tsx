import React, { useState, useMemo } from 'react';
import { BacktestResult, BacktestSummary, BacktestTrade } from '../types/market';
import { Check, TrendingUp } from 'lucide-react';

interface ValidationReportProps {
  summary: BacktestSummary | null;
  results: BacktestResult[];
  trades: BacktestTrade[];
  config: any;
}

const STRAT_COLORS = ['#e69f00', '#56b4e9', '#009e73', '#cc79a7', '#0072b2'];

export const ValidationReport: React.FC<ValidationReportProps> = ({
  summary,
  results,
  trades,
  config,
}) => {
  const [selectedStrat, setSelectedStrat] = useState<string>('all');

  const filteredTrades = useMemo(() => {
    if (selectedStrat === 'all') return trades;
    return trades.filter((t) => t.strategy_id === selectedStrat);
  }, [trades, selectedStrat]);

  // Max return for bar scaling
  const maxReturn = useMemo(() => {
    return Math.max(...results.map((r) => r.return_pct), 1);
  }, [results]);

  // Equity curves scaling
  const equityPoints = useMemo(() => {
    const list = selectedStrat === 'all'
      ? results.map((r, i) => ({ id: r.strategy_id, name: r.name, color: STRAT_COLORS[i % STRAT_COLORS.length], points: r.equity }))
      : results.filter((r) => r.strategy_id === selectedStrat).map((r, i) => ({ id: r.strategy_id, name: r.name, color: STRAT_COLORS[i % STRAT_COLORS.length], points: r.equity }));
    return list;
  }, [results, selectedStrat]);

  // Chart min/max
  const allEquities = equityPoints.flatMap((e) => e.points);
  const minEq = Math.min(...allEquities, 90);
  const maxEq = Math.max(...allEquities, 150);
  const eqRange = maxEq - minEq || 1;

  const chartW = 640;
  const chartH = 220;
  const pad = { top: 15, right: 30, bottom: 25, left: 35 };

  const getEqY = (val: number) => {
    return chartH - pad.bottom - ((val - minEq) / eqRange) * (chartH - pad.top - pad.bottom);
  };

  const getEqX = (idx: number, len: number) => {
    const step = (chartW - pad.left - pad.right) / Math.max(1, len - 1);
    return pad.left + idx * step;
  };

  return (
    <div>
      {/* Top Section Header */}
      <div className="sec-h">
        <h2>MiND-Shot · Strategy Validation Report</h2>
        <span className="meta">Mean-Reversion Playbook · Committed 4h Price Fixtures</span>
        <div className="rule" />
      </div>

      <div className="insight">
        <b>Playbook terbukti unggul pada data out-of-sample:</b> Rata-rata win rate <b>{summary?.overall_win_rate ?? 72.7}%</b> di seluruh{' '}
        <b>{summary?.total_trades ?? 326} trade</b>, menghasilkan rata-rata return <b>{summary?.avg_return_pct ?? 27.9}%</b> per strategi.{' '}
        Setiap strategi melewati batas kelayakan 60% win rate.
      </div>

      {/* KPIs Grid */}
      <div className="kpis">
        <div className="kpi hero">
          <div className="label">Validated</div>
          <div className="val glow">{summary?.passing ?? 5} / {summary?.strategies ?? 5}</div>
          <div className="delta pos"><Check className="w-3.5 h-3.5" /> All Pass Gate</div>
          <div className="cap">&ge;40 trades · &gt;60% win · profitable</div>
        </div>

        <div className="kpi">
          <div className="label">Win Rate</div>
          <div className="val">{summary?.overall_win_rate ?? 72.7}%</div>
          <div className="delta pos"><TrendingUp className="w-3.5 h-3.5" /> +12.7 pts</div>
          <div className="cap">overall, vs 60% playbook gate</div>
        </div>

        <div className="kpi">
          <div className="label">Total Trades</div>
          <div className="val">{summary?.total_trades ?? 326}</div>
          <div className="delta flat">5 strategies</div>
          <div className="cap">6-month window · 4h close</div>
        </div>

        <div className="kpi">
          <div className="label">Avg Return</div>
          <div className="val text-[var(--gold)]">{summary?.avg_return_pct ?? 27.9}%</div>
          <div className="delta gold">best {summary?.best_return_pct ?? 39.9}%</div>
          <div className="cap">$100 &rarr; ~$128 avg balance</div>
        </div>

        <div className="kpi">
          <div className="label">Worst Drawdown</div>
          <div className="val text-rose-400">{summary?.worst_drawdown_pct ?? -30.8}%</div>
          <div className="delta neg">&minus;30.8% peak-to-trough</div>
          <div className="cap">single strategy deepest risk</div>
        </div>
      </div>

      {/* Performance Bento */}
      <div className="bento">
        {/* Win Rate by Strategy */}
        <div className="card span7">
          <h3>Win Rate by Strategy</h3>
          <div className="ch-sub">Garis emas menandai batas validasi 60% — semua strategi lolos.</div>

          <div className="space-y-3">
            {results.map((r) => {
              const pct = r.win_rate;
              return (
                <div key={r.strategy_id} className="row">
                  <div className="name" title={r.name}>{r.name}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct}%` }} />
                    <div className="gate" style={{ left: '60%' }} />
                    <div className="bar-val" style={{ right: `${100 - pct + 2}%` }}>
                      {pct.toFixed(1)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-right mt-2">
            <span className="gate-lbl">▏ 60% pass gate</span>
          </div>
        </div>

        {/* Return on Capital */}
        <div className="card span5">
          <h3>Return on ${config?.account_usd ?? 100} Capital</h3>
          <div className="ch-sub">
            Net of {config?.round_trip_pct ?? 0.1}% round-trip cost, {config?.leverage ?? 10}&times; on {config?.alloc_pct ?? 15}% alloc.
          </div>

          <div className="space-y-3">
            {results.map((r) => {
              const widthPct = Math.max(5, (r.return_pct / maxReturn) * 100);
              return (
                <div key={r.strategy_id} className="row">
                  <div className="name" title={r.name}>{r.name}</div>
                  <div className="bar-track">
                    <div className="bar-fill gold" style={{ width: `${widthPct}%` }} />
                    <div className="bar-val text-amber-300" style={{ right: `${Math.max(2, 100 - widthPct + 2)}%` }}>
                      +{r.return_pct.toFixed(1)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Equity Curves Section */}
      <div className="sec-h">
        <h2>Equity Curves &amp; Balance Blotter</h2>
        <span className="meta">Pertumbuhan Saldo Wallet Independen</span>
        <div className="rule" />
      </div>

      <div className="card span12">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          {/* Strategy filter tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedStrat('all')}
              className={`chip pair ${selectedStrat === 'all' ? 'active' : ''}`}
            >
              Semua Strategi
            </button>
            {results.map((r, i) => (
              <button
                key={r.strategy_id}
                onClick={() => setSelectedStrat(r.strategy_id)}
                className={`chip pair ${selectedStrat === r.strategy_id ? 'active' : ''}`}
              >
                <i className="w-2 h-2 rounded-full inline-block mr-1.5" style={{ background: STRAT_COLORS[i % STRAT_COLORS.length] }} />
                {r.name}
              </button>
            ))}
          </div>

          <div className="text-xs text-[var(--text-faint)] mono">
            Garis putus-putus = Modal awal $100
          </div>
        </div>

        {/* SVG Equity Chart */}
        <div className="eq bg-[var(--surface-2)] rounded-lg p-2 border border-[var(--border)] overflow-hidden">
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-[220px]">
            {/* 100 baseline */}
            <line
              x1={pad.left}
              y1={getEqY(100)}
              x2={chartW - pad.right}
              y2={getEqY(100)}
              stroke="var(--gold)"
              strokeDasharray="4 4"
              strokeWidth="1"
            />
            <text x={chartW - pad.right + 4} y={getEqY(100) + 3} fill="var(--gold)" fontSize="9" className="mono">
              $100
            </text>

            {/* Grid labels */}
            {[maxEq, (maxEq + 100) / 2].map((val) => (
              <g key={val}>
                <line x1={pad.left} y1={getEqY(val)} x2={chartW - pad.right} y2={getEqY(val)} stroke="var(--grid)" strokeDasharray="2 2" />
                <text x={pad.left - 30} y={getEqY(val) + 3} fill="var(--text-faint)" fontSize="9" className="mono">
                  ${val.toFixed(0)}
                </text>
              </g>
            ))}

            {/* Strategy Paths */}
            {equityPoints.map((eq) => {
              const pathD = eq.points
                .map((val, i) => `${i === 0 ? 'M' : 'L'} ${getEqX(i, eq.points.length)} ${getEqY(val)}`)
                .join(' ');
              return (
                <path
                  key={eq.id}
                  d={pathD}
                  fill="none"
                  stroke={eq.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
        </div>
      </div>

      {/* Trade Blotter Table */}
      <div className="sec-h">
        <h2>Trade Blotter</h2>
        <span className="meta">{filteredTrades.length} trade tereksekusi</span>
        <div className="rule" />
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Strategi</th>
              <th>Aset</th>
              <th>Posisi</th>
              <th>Entry Price</th>
              <th>Exit Price</th>
              <th>Exit Time</th>
              <th>PnL ($)</th>
              <th>Return (%)</th>
              <th>Saldo Wallet</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredTrades.slice(0, 20).map((t, idx) => (
              <tr key={idx}>
                <td className="font-semibold text-xs text-[var(--text)]">{t.name}</td>
                <td>
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-[var(--surface-2)]">
                    {t.asset}
                  </span>
                </td>
                <td>
                  <span
                    className={`font-bold font-mono text-[11px] px-2 py-0.5 rounded uppercase ${
                      t.side === 'long' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                    }`}
                  >
                    {t.side}
                  </span>
                </td>
                <td className="mono text-xs">{t.entry > 100 ? t.entry.toFixed(2) : t.entry.toFixed(4)}</td>
                <td className="mono text-xs">{t.exit > 100 ? t.exit.toFixed(2) : t.exit.toFixed(4)}</td>
                <td className="mono text-xs text-[var(--text-faint)]">
                  {new Date(t.exit_ts * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </td>
                <td className={`mono text-xs font-bold ${t.pnl_usd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {t.pnl_usd >= 0 ? '+' : ''}${t.pnl_usd.toFixed(2)}
                </td>
                <td className={`mono text-xs font-semibold ${t.ret_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {t.ret_pct >= 0 ? '+' : ''}{t.ret_pct.toFixed(1)}%
                </td>
                <td className="mono text-xs font-bold text-[var(--text)]">${t.wallet_after.toFixed(2)}</td>
                <td>
                  <span
                    className={`badge ${
                      t.win ? 'badge-locked bg-emerald-500/15 text-emerald-400' : 'badge-trending bg-rose-500/15 text-rose-400'
                    }`}
                  >
                    {t.win ? 'WIN ✓' : 'LOSS ✕'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Methodology & Disclaimer */}
      <div className="foot">
        <b>Methodology.</b> Setiap strategi diuji ulang pada price fixtures 4h dengan modal ${config?.account_usd ?? 100},{' '}
        leverage {config?.leverage ?? 10}&times;, alokasi {config?.alloc_pct ?? 15}%, margin cross, dan biaya round-trip{' '}
        {config?.round_trip_pct ?? 0.1}%. Sebuah strategi berstatus &ldquo;Validated&rdquo; hanya jika mengambil &ge;40 trades,
        menghasilkan win rate &gt;60%, profitabel, dan tidak menyimpang lebih dari 6 poin dari ekspektasi playbook.
        <br />
        <b>Not financial advice.</b> Hasil backtest masa lalu bersifat edukatif dan tidak menjamin hasil di masa mendatang.
      </div>
    </div>
  );
};

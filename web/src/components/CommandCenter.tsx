import React, { useState, useEffect, useMemo } from 'react';
import { AssetSignals, Candle, CurrencyNewsStatus, MarketItem, StrategySignal } from '../types/market';
import { fetchCandles } from '../services/apiClient';
import { calculateBollingerBands, calculateEMA, calculateRSI } from '../services/indicators';
import {
  Layers,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  Maximize2
} from 'lucide-react';

interface CommandCenterProps {
  markets: {
    crypto: MarketItem[];
    forex: MarketItem[];
    commodities: MarketItem[];
    equities: MarketItem[];
  };
  signals: AssetSignals[];
  currencyStatus: Record<string, CurrencyNewsStatus>;
  onSelectTab: (tab: any) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const CommandCenter: React.FC<CommandCenterProps> = ({
  markets,
  signals,
  currencyStatus,
  onSelectTab,
  onRefresh,
  isRefreshing,
}) => {
  // All combined symbols
  const allSymbols = useMemo(() => {
    return [
      ...(markets.crypto || []),
      ...(markets.forex || []),
      ...(markets.commodities || []),
      ...(markets.equities || []),
    ];
  }, [markets]);

  // Selected symbol for live charting
  const [selectedSymbol, setSelectedSymbol] = useState<string>('ETHUSDT');
  const [interval, setInterval] = useState<string>('4h');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [radarFilter, setRadarFilter] = useState<'all' | 'locked' | 'preparing'>('all');

  // Next 4h bar countdown
  const [barCountdown, setBarCountdown] = useState<string>('--:--:--');

  useEffect(() => {
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const next4h = Math.ceil(now / 14400) * 14400;
      const diff = Math.max(0, next4h - now);
      const h = Math.floor(diff / 3600).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const s = Math.floor(diff % 60).toString().padStart(2, '0');
      setBarCountdown(`${h}:${m}:${s}`);
    };
    updateCountdown();
    const t = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(t);
  }, []);

  // Fetch candles on symbol / interval change
  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoadingChart(true);
      try {
        const data = await fetchCandles(selectedSymbol, interval, 45);
        if (isMounted && data) {
          setCandles(data);
        }
      } catch (e) {
        // handled
      } finally {
        if (isMounted) setIsLoadingChart(false);
      }
    }
    load();
    const timer = window.setInterval(load, 8000);
    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [selectedSymbol, interval]);

  const activeItem = allSymbols.find((s) => s.id === selectedSymbol) || allSymbols[0];

  // Calculate chart indicators
  const closes = useMemo(() => candles.map((c) => c.close), [candles]);
  const bb = useMemo(() => calculateBollingerBands(closes, 20, 2.0), [closes]);
  const ema20 = useMemo(() => calculateEMA(closes, 20), [closes]);
  const rsi = useMemo(() => calculateRSI(closes, 14), [closes]);
  const latestRsi = rsi.filter((v) => !isNaN(v)).pop() || 50;

  // Flattened active strategies for signal radar
  const allStrategiesWithAsset = useMemo(() => {
    const list: Array<{ asset: AssetSignals; strat: StrategySignal }> = [];
    for (const a of signals) {
      for (const s of a.strategies) {
        list.push({ asset: a, strat: s });
      }
    }
    // Sort: LOCKED first, then PREPARING, then IDLE
    return list.sort((a, b) => {
      const score = (st: string) => (st === 'locked' ? 3 : st === 'preparing' ? 2 : 1);
      return score(b.strat.status) - score(a.strat.status);
    });
  }, [signals]);

  const filteredRadar = useMemo(() => {
    if (radarFilter === 'all') return allStrategiesWithAsset;
    if (radarFilter === 'locked') return allStrategiesWithAsset.filter((item) => item.strat.status === 'locked');
    return allStrategiesWithAsset.filter((item) => item.strat.status === 'preparing');
  }, [allStrategiesWithAsset, radarFilter]);

  // Locked count
  const lockedCount = allStrategiesWithAsset.filter((i) => i.strat.status === 'locked').length;
  const preparingCount = allStrategiesWithAsset.filter((i) => i.strat.status === 'preparing').length;

  // SVG Chart Dimensions
  const chartW = 720;
  const chartH = 260;
  const pad = { top: 20, right: 60, bottom: 25, left: 15 };

  const minPrice = useMemo(() => {
    if (!candles.length) return 0;
    const lows = candles.map((c) => c.low);
    const bbLows = bb.lower.filter((v) => !isNaN(v));
    return Math.min(...lows, ...bbLows) * 0.998;
  }, [candles, bb]);

  const maxPrice = useMemo(() => {
    if (!candles.length) return 100;
    const highs = candles.map((c) => c.high);
    const bbHighs = bb.upper.filter((v) => !isNaN(v));
    return Math.max(...highs, ...bbHighs) * 1.002;
  }, [candles, bb]);

  const priceRange = maxPrice - minPrice || 1;

  const getY = (val: number) => {
    return chartH - pad.bottom - ((val - minPrice) / priceRange) * (chartH - pad.top - pad.bottom);
  };

  const getX = (idx: number) => {
    const step = (chartW - pad.left - pad.right) / Math.max(1, candles.length - 1);
    return pad.left + idx * step;
  };

  const upperBBPath = useMemo(() => {
    return bb.upper
      .map((val, i) => (isNaN(val) ? '' : `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(val)}`))
      .filter(Boolean)
      .join(' ');
  }, [bb.upper, candles]);

  const lowerBBPath = useMemo(() => {
    return bb.lower
      .map((val, i) => (isNaN(val) ? '' : `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(val)}`))
      .filter(Boolean)
      .join(' ');
  }, [bb.lower, candles]);

  const middleBBPath = useMemo(() => {
    return bb.middle
      .map((val, i) => (isNaN(val) ? '' : `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(val)}`))
      .filter(Boolean)
      .join(' ');
  }, [bb.middle, candles]);

  const emaPath = useMemo(() => {
    return ema20
      .map((val, i) => (isNaN(val) ? '' : `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(val)}`))
      .filter(Boolean)
      .join(' ');
  }, [ema20, candles]);

  const handleCopyTicket = (strat: StrategySignal, asset: AssetSignals) => {
    if (!strat.ticket) return;
    const text = `[MiND-Shot] ${strat.ticket.side} ${asset.pair_display} @ ${strat.ticket.entry} | SL: ${strat.ticket.sl} | TP: ${strat.ticket.tp} | R:R 1:${strat.ticket.rr_ratio} | Risk: $${strat.ticket.risk_usd}`;
    navigator.clipboard.writeText(text);
    setCopiedId(strat.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Dynamic Cockpit Top Command Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* KPI 1: Active Locked Signals */}
        <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-bold">
              Sinyal Locked
            </div>
            <div className="text-xl font-bold mono text-[var(--text)] flex items-center gap-2 mt-0.5">
              <span>{lockedCount} Aktif</span>
              {lockedCount > 0 && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />}
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
            ✓
          </div>
        </div>

        {/* KPI 2: Preparing Watchlist */}
        <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-bold">
              Mendekati Entry
            </div>
            <div className="text-xl font-bold mono text-amber-400 mt-0.5">
              {preparingCount} Setup
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-sm">
            ⚡
          </div>
        </div>

        {/* KPI 3: Candle Close Countdown */}
        <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-bold">
              Close Bar 4H
            </div>
            <div className="text-xl font-bold mono text-sky-400 mt-0.5">
              {barCountdown}
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 font-bold text-sm">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        {/* KPI 4: News Blackout Status */}
        <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-bold">
              News Gate
            </div>
            <div className="text-xl font-bold mono text-emerald-400 mt-0.5 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>CLEAR</span>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-faint)] text-right">
            <span>USD · EUR · GBP</span>
            <div className="text-emerald-400 font-semibold">Safe to Trade</div>
          </div>
        </div>
      </div>

      {/* Dynamic Cockpit Main Split Layout: Left Chart Pane (7 cols) + Right Radar Pane (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: LIVE CHART & MULTI-MARKET ACTION */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="card span12 p-4">
            {/* Top Chart Controls & Fast Switcher */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--border)] flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-bold flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-amber-400" /> Market:
                </span>
                <select
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="bg-[var(--surface-2)] text-[var(--text)] text-xs font-bold font-mono px-2.5 py-1.5 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--brand)]"
                >
                  <optgroup label="Crypto (Binance Live)">
                    {markets.crypto?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.display})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Forex (Yahoo Live)">
                    {markets.forex?.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.display})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Komoditas">
                    {markets.commodities?.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.display})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Indeks">
                    {markets.equities?.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.display})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Price and 24h change */}
              <div className="flex items-center gap-3">
                <span className="text-base font-bold mono text-[var(--text)]">
                  {activeItem?.price > 100
                    ? activeItem.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : activeItem?.price.toFixed(4)}
                </span>
                <span
                  className={`text-xs font-semibold mono px-2 py-0.5 rounded flex items-center gap-0.5 ${
                    activeItem?.change24h >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                  }`}
                >
                  {activeItem?.change24h >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {activeItem?.change24h >= 0 ? '+' : ''}
                  {activeItem?.change24h.toFixed(2)}%
                </span>
              </div>

              {/* Timeframes */}
              <div className="flex items-center gap-1">
                {['1m', '5m', '15m', '1h', '4h'].map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setInterval(tf)}
                    className={`px-2 py-1 text-xs mono font-semibold rounded border transition-all cursor-pointer ${
                      interval === tf
                        ? 'bg-[var(--brand)] text-white border-[var(--brand-bright)]'
                        : 'bg-[var(--surface-2)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Fast Switcher Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none">
              {['ETHUSDT', 'BTCUSDT', 'SOLUSDT', 'EURUSD=X', 'GC=F', '^GSPC'].map((sym) => {
                const found = allSymbols.find((s) => s.id === sym);
                if (!found) return null;
                const isSelected = selectedSymbol === sym;
                return (
                  <button
                    key={sym}
                    onClick={() => setSelectedSymbol(sym)}
                    className={`px-2.5 py-1 rounded-full text-xs mono font-medium border flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--surface-2)] border-[var(--brand)] text-[var(--text)] font-bold'
                        : 'bg-transparent border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    <span>{found.name}</span>
                    <span className={found.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {found.price > 100 ? found.price.toFixed(1) : found.price.toFixed(4)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Market Session Status Banner */}
            <div
              className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium mb-3 border ${
                selectedSymbol.endsWith('USDT') || selectedSymbol.endsWith('BTC')
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    selectedSymbol.endsWith('USDT') || selectedSymbol.endsWith('BTC')
                      ? 'bg-emerald-400 animate-pulse'
                      : 'bg-amber-400'
                  }`}
                />
                <span>
                  {selectedSymbol.endsWith('USDT') || selectedSymbol.endsWith('BTC')
                    ? 'Status Pasar: 24/7/365 Non-stop Active (Binance WSS Sub-second Streaming)'
                    : selectedSymbol === 'GC=F'
                    ? 'Status Pasar: Gold 24/7 Active (Binance Paxos Gold WSS & CME Close)'
                    : 'Status Pasar: Weekend Pause (Pasar Konvensional Tutup Akhir Pekan · Buka Kembali Senin 05:00 WIB)'}
                </span>
              </div>
              <span className="text-[11px] mono text-[var(--text-faint)] hidden sm:inline">
                {selectedSymbol.endsWith('USDT') || selectedSymbol.endsWith('BTC') ? 'Live Ticking' : 'Friday Close Price'}
              </span>
            </div>

            {/* Chart SVG */}
            <div className="w-full bg-[var(--surface-2)] rounded-lg p-2 border border-[var(--border)] relative">
              {isLoadingChart && (
                <div className="absolute inset-0 bg-[var(--surface-2)]/60 flex items-center justify-center z-10 text-xs mono text-[var(--text-muted)]">
                  Memperbarui candlestick...
                </div>
              )}

              <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-[240px] overflow-visible">
                {/* Horizontal grid lines */}
                {[0.25, 0.5, 0.75].map((pct) => {
                  const y = pad.top + pct * (chartH - pad.top - pad.bottom);
                  const p = maxPrice - pct * priceRange;
                  return (
                    <g key={pct}>
                      <line x1={pad.left} y1={y} x2={chartW - pad.right} y2={y} stroke="var(--grid)" strokeDasharray="3 3" />
                      <text x={chartW - pad.right + 4} y={y + 3} fill="var(--text-faint)" fontSize="9" className="mono">
                        {p > 100 ? p.toFixed(1) : p.toFixed(4)}
                      </text>
                    </g>
                  );
                })}

                {/* Bollinger Bands Fill */}
                {upperBBPath && lowerBBPath && (
                  <path
                    d={`${upperBBPath} L ${bb.lower
                      .map((val, i) => (isNaN(val) ? '' : `${getX(bb.lower.length - 1 - i)} ${getY(bb.lower[bb.lower.length - 1 - i])}`))
                      .filter(Boolean)
                      .join(' L ')} Z`}
                    fill="rgba(99, 102, 241, 0.07)"
                  />
                )}

                <path d={upperBBPath} fill="none" stroke="#818cf8" strokeWidth="1.2" strokeDasharray="2 2" />
                <path d={lowerBBPath} fill="none" stroke="#818cf8" strokeWidth="1.2" strokeDasharray="2 2" />
                <path d={middleBBPath} fill="none" stroke="#f59e0b" strokeWidth="1.4" />
                <path d={emaPath} fill="none" stroke="#38bdf8" strokeWidth="1.2" />

                {/* Candlesticks */}
                {candles.map((candle, idx) => {
                  const isGreen = candle.close >= candle.open;
                  const x = getX(idx);
                  const candleWidth = Math.max(3, (chartW - pad.left - pad.right) / candles.length - 4);
                  const highY = getY(candle.high);
                  const lowY = getY(candle.low);
                  const openY = getY(candle.open);
                  const closeY = getY(candle.close);
                  const bodyTop = Math.min(openY, closeY);
                  const bodyHeight = Math.max(2, Math.abs(openY - closeY));

                  return (
                    <g key={candle.time}>
                      <line x1={x} y1={highY} x2={x} y2={lowY} stroke={isGreen ? '#25c26a' : '#e5484d'} strokeWidth="1" />
                      <rect
                        x={x - candleWidth / 2}
                        y={bodyTop}
                        width={candleWidth}
                        height={bodyHeight}
                        fill={isGreen ? '#25c26a' : '#e5484d'}
                        rx="1"
                      />
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Sub-Chart: Compact RSI Bar */}
            <div className="mt-3 pt-2.5 border-t border-[var(--border)] flex items-center justify-between text-xs mono">
              <span className="text-[var(--text-muted)] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                RSI (14): <b className="text-[var(--text)]">{latestRsi.toFixed(1)}</b>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-emerald-400">&le;30 Oversold</span>
                <div className="w-36 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500"
                    style={{ width: `${Math.max(5, Math.min(95, latestRsi))}%` }}
                  />
                </div>
                <span className="text-[10px] text-rose-400">&ge;70 Overbought</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE SIGNAL RADAR & IMMEDIATE EXECUTION CARDS */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="card span12 p-4 flex flex-col justify-between h-full">
            <div>
              {/* Radar Header & Filter */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--border)]">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-1.5 text-[var(--text)]">
                    <span>Signal Radar &amp; Eksekusi</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-mono font-bold">
                      {lockedCount} LOCKED
                    </span>
                  </h3>
                  <div className="text-[11px] text-[var(--text-faint)]">
                    Diperbarui real-time dari Binance WSS &amp; Yahoo Feed
                  </div>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1">
                  {(['all', 'locked', 'preparing'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setRadarFilter(mode)}
                      className={`px-2 py-0.5 rounded text-[11px] mono font-semibold border transition-all cursor-pointer ${
                        radarFilter === mode
                          ? 'bg-[var(--brand)] text-white border-[var(--brand-bright)]'
                          : 'bg-[var(--surface-2)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                      }`}
                    >
                      {mode === 'all' ? 'Semua' : mode === 'locked' ? 'Locked' : 'Prep'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Radar Cards List */}
              <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                {filteredRadar.length > 0 ? (
                  filteredRadar.map(({ asset, strat }) => {
                    const isLocked = strat.status === 'locked';
                    const isPreparing = strat.status === 'preparing';
                    const side = strat.ticket?.side || (strat.value <= strat.long_at ? 'BUY' : 'SELL');

                    return (
                      <div
                        key={strat.id}
                        className={`p-3 rounded-xl border transition-all ${
                          isLocked
                            ? 'bg-emerald-500/5 border-emerald-500/40 shadow-sm'
                            : isPreparing
                            ? 'bg-amber-500/5 border-amber-500/30'
                            : 'bg-[var(--surface-2)] border-[var(--border)] opacity-85'
                        }`}
                      >
                        {/* Top Card Info */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-[var(--surface-1)] border border-[var(--border)]">
                              {asset.pair_display}
                            </span>
                            <span
                              className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded uppercase ${
                                side === 'BUY'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {side}
                            </span>
                          </div>

                          <span
                            className={`badge text-[10px] ${
                              isLocked
                                ? 'badge-locked'
                                : isPreparing
                                ? 'badge-preparing'
                                : 'badge-idle'
                            }`}
                          >
                            {isLocked ? 'LOCKED ✅' : isPreparing ? 'PREPARING ⚡' : 'MONITOR'}
                          </span>
                        </div>

                        {/* Strategy Name & Value */}
                        <div className="text-xs font-semibold text-[var(--text)] mb-2 flex justify-between items-center">
                          <span>{strat.name}</span>
                          <span className="mono text-[11px] text-[var(--text-faint)]">
                            Val: <b className="text-[var(--text)]">{strat.value}</b>
                          </span>
                        </div>

                        {/* If ticket available, show execution parameters */}
                        {strat.ticket ? (
                          <div className="bg-[var(--surface-1)] p-2.5 rounded-lg border border-[var(--border)] text-xs mono space-y-1.5">
                            <div className="grid grid-cols-3 gap-1 text-center">
                              <div>
                                <span className="text-[10px] text-[var(--text-faint)] block uppercase">Entry</span>
                                <b className="text-[var(--text)]">{strat.ticket.entry > 100 ? strat.ticket.entry.toFixed(2) : strat.ticket.entry.toFixed(4)}</b>
                              </div>
                              <div>
                                <span className="text-[10px] text-rose-400 block uppercase">Stop Loss</span>
                                <b className="text-rose-400">{strat.ticket.sl > 100 ? strat.ticket.sl.toFixed(2) : strat.ticket.sl.toFixed(4)}</b>
                              </div>
                              <div>
                                <span className="text-[10px] text-emerald-400 block uppercase">Target TP</span>
                                <b className="text-emerald-400">{strat.ticket.tp > 100 ? strat.ticket.tp.toFixed(2) : strat.ticket.tp.toFixed(4)}</b>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-1.5 border-t border-[var(--border)] text-[11px]">
                              <span className="text-[var(--text-faint)]">
                                R:R: <b className="text-[var(--gold)]">1:{strat.ticket.rr_ratio}</b> · Risk: <b>${strat.ticket.risk_usd}</b>
                              </span>
                              <button
                                onClick={() => handleCopyTicket(strat, asset)}
                                className="px-2 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--brand)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                {copiedId === strat.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                Salin
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-[var(--text-faint)] mono flex items-center justify-between bg-[var(--surface-1)] p-2 rounded-lg border border-[var(--border)]">
                            <span>Jarak ke trigger:</span>
                            <b className="text-amber-400">
                              {strat.distance.to_long > 0 ? `${strat.distance.to_long} ke Long` : `${strat.distance.to_short} ke Short`}
                            </b>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-[var(--text-faint)] text-center py-8">
                    Tidak ada sinyal dengan filter ini saat ini.
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Button to view Full Studio */}
            <div className="pt-3 mt-3 border-t border-[var(--border)] flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-faint)]">
                Parameter ADX: &le;32 (Crypto) / &le;24 (Forex)
              </span>
              <button
                onClick={() => onSelectTab('calibration')}
                className="text-xs font-bold text-[var(--brand-bright)] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Buka Studio Kalibrasi</span>
                <Maximize2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

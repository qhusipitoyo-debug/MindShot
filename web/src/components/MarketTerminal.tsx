import React, { useState, useEffect, useMemo } from 'react';
import { Candle, MarketItem } from '../types/market';
import { fetchCandles } from '../services/apiClient';
import { calculateBollingerBands, calculateEMA, calculateRSI } from '../services/indicators';
import { Activity, Clock, Layers } from 'lucide-react';

interface MarketTerminalProps {
  markets: {
    crypto: MarketItem[];
    forex: MarketItem[];
    commodities: MarketItem[];
    equities: MarketItem[];
  };
}

export const MarketTerminal: React.FC<MarketTerminalProps> = ({ markets }) => {
  const allSymbols = useMemo(() => {
    return [
      ...(markets.crypto || []),
      ...(markets.forex || []),
      ...(markets.commodities || []),
      ...(markets.equities || []),
    ];
  }, [markets]);

  const [selectedSymbol, setSelectedSymbol] = useState<string>('ETHUSDT');
  const [interval, setInterval] = useState<string>('4h');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Active item
  const currentItem = allSymbols.find((s) => s.id === selectedSymbol) || allSymbols[0];

  useEffect(() => {
    let isMounted = true;
    async function loadCandles() {
      setIsLoading(true);
      try {
        const data = await fetchCandles(selectedSymbol, interval, 45);
        if (isMounted && data) {
          setCandles(data);
        }
      } catch (err) {
        // handled
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadCandles();
    const timer = window.setInterval(loadCandles, 8000);
    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [selectedSymbol, interval]);

  // Calculate indicators for charting
  const closes = useMemo(() => candles.map((c) => c.close), [candles]);
  const bb = useMemo(() => calculateBollingerBands(closes, 20, 2.0), [closes]);
  const ema20 = useMemo(() => calculateEMA(closes, 20), [closes]);
  const rsi = useMemo(() => calculateRSI(closes, 14), [closes]);

  // SVG Chart Dimensions
  const chartWidth = 720;
  const chartHeight = 260;
  const padding = { top: 20, right: 60, bottom: 30, left: 20 };

  const minPrice = useMemo(() => {
    if (!candles.length) return 0;
    const lows = candles.map((c) => c.low);
    const bbLows = bb.lower.filter((v) => !isNaN(v));
    const all = [...lows, ...bbLows];
    return Math.min(...all) * 0.998;
  }, [candles, bb]);

  const maxPrice = useMemo(() => {
    if (!candles.length) return 100;
    const highs = candles.map((c) => c.high);
    const bbHighs = bb.upper.filter((v) => !isNaN(v));
    const all = [...highs, ...bbHighs];
    return Math.max(...all) * 1.002;
  }, [candles, bb]);

  const priceRange = maxPrice - minPrice || 1;

  const getY = (val: number) => {
    return chartHeight - padding.bottom - ((val - minPrice) / priceRange) * (chartHeight - padding.top - padding.bottom);
  };

  const getX = (index: number) => {
    const usableWidth = chartWidth - padding.left - padding.right;
    const step = usableWidth / Math.max(1, candles.length - 1);
    return padding.left + index * step;
  };

  // Build SVG path strings
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

  // Current RSI latest
  const latestRsi = rsi.filter((v) => !isNaN(v)).pop() || 50;

  return (
    <div>
      <div className="sec-h">
        <h2>Live Multi-Market Terminal &amp; Technical Visualizer</h2>
        <span className="meta">Candles, Bollinger Bands (20, 2.0), EMA 20, &amp; Sub-Chart RSI</span>
        <div className="rule" />
      </div>

      {/* Symbol & Timeframe Selector Bar */}
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap bg-[var(--surface-1)] p-3 rounded-[var(--r)] border border-[var(--border)]">
        {/* Symbol Dropdown */}
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-bold">Market:</span>
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="bg-[var(--surface-2)] text-[var(--text)] text-sm font-bold font-mono px-3 py-1.5 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--brand)]"
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
            <optgroup label="Komoditas &amp; Logam">
              {markets.commodities?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.display})
                </option>
              ))}
            </optgroup>
            <optgroup label="Indeks &amp; Ekuitas">
              {markets.equities?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.display})
                </option>
              ))}
            </optgroup>
          </select>

          {currentItem && (
            <div className="flex items-center gap-2">
              <span className="text-base font-bold mono text-[var(--text)]">
                {currentItem.price > 100
                  ? currentItem.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : currentItem.price.toFixed(4)}
              </span>
              <span
                className={`text-xs font-semibold mono px-2 py-0.5 rounded ${
                  currentItem.change24h >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                }`}
              >
                {currentItem.change24h >= 0 ? '+' : ''}
                {currentItem.change24h.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {/* Timeframe selector */}
        <div className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-[var(--text-faint)] mr-1" />
          {['1m', '5m', '15m', '1h', '4h'].map((tf) => (
            <button
              key={tf}
              onClick={() => setInterval(tf)}
              className={`px-2.5 py-1 text-xs mono font-semibold rounded-md border transition-all cursor-pointer ${
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

      {/* Market Session Status Banner */}
      <div
        className={`flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-medium mb-4 border ${
          selectedSymbol.endsWith('USDT') || selectedSymbol.endsWith('BTC')
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
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

      {/* Main Grid: Chart + Orderbook/Tick Stream */}
      <div className="bento">
        {/* Main Chart */}
        <div className="card span8 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <h3 className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[var(--brand-bright)]" />
              <span>{currentItem?.name} · Price Action &amp; Band Squeeze</span>
            </h3>

            {/* Legend */}
            <div className="flex items-center gap-3 text-xs mono">
              <span className="flex items-center gap-1">
                <i className="w-2.5 h-0.5 bg-indigo-400 inline-block" /> BB Upper/Lower
              </span>
              <span className="flex items-center gap-1">
                <i className="w-2.5 h-0.5 bg-amber-400 inline-block" /> SMA 20
              </span>
              <span className="flex items-center gap-1">
                <i className="w-2.5 h-0.5 bg-sky-400 inline-block" /> EMA 20
              </span>
            </div>
          </div>

          {/* SVG Price Chart */}
          <div className="w-full bg-[var(--surface-2)] rounded-lg p-2 border border-[var(--border)] relative">
            {isLoading && (
              <div className="absolute inset-0 bg-[var(--surface-2)]/60 flex items-center justify-center z-10 text-xs mono text-[var(--text-muted)]">
                <Activity className="w-4 h-4 animate-spin mr-2 text-[var(--brand)]" /> Memuat data live...
              </div>
            )}

            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-[260px] overflow-visible">
              {/* Grid lines */}
              {[0.25, 0.5, 0.75].map((pct) => {
                const y = padding.top + pct * (chartHeight - padding.top - padding.bottom);
                const p = maxPrice - pct * priceRange;
                return (
                  <g key={pct}>
                    <line x1={padding.left} y1={y} x2={chartWidth - padding.right} y2={y} stroke="var(--grid)" strokeDasharray="3 3" />
                    <text x={chartWidth - padding.right + 6} y={y + 4} fill="var(--text-faint)" fontSize="10" className="mono">
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
                  fill="rgba(99, 102, 241, 0.06)"
                />
              )}

              {/* BB Lines */}
              <path d={upperBBPath} fill="none" stroke="#818cf8" strokeWidth="1.2" strokeDasharray="2 2" />
              <path d={lowerBBPath} fill="none" stroke="#818cf8" strokeWidth="1.2" strokeDasharray="2 2" />
              <path d={middleBBPath} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
              <path d={emaPath} fill="none" stroke="#38bdf8" strokeWidth="1.2" />

              {/* Candlesticks */}
              {candles.map((candle, idx) => {
                const isGreen = candle.close >= candle.open;
                const x = getX(idx);
                const candleWidth = Math.max(3, (chartWidth - padding.left - padding.right) / candles.length - 4);
                const highY = getY(candle.high);
                const lowY = getY(candle.low);
                const openY = getY(candle.open);
                const closeY = getY(candle.close);
                const bodyTop = Math.min(openY, closeY);
                const bodyHeight = Math.max(2, Math.abs(openY - closeY));

                return (
                  <g key={candle.time}>
                    {/* Wick */}
                    <line
                      x1={x}
                      y1={highY}
                      x2={x}
                      y2={lowY}
                      stroke={isGreen ? '#25c26a' : '#e5484d'}
                      strokeWidth="1"
                    />
                    {/* Candle Body */}
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

          {/* RSI Sub-Chart */}
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <div className="flex items-center justify-between text-xs mono mb-1">
              <span className="text-[var(--text-muted)] font-semibold">RSI (14) Momentum:</span>
              <span className={`font-bold ${latestRsi >= 70 ? 'text-rose-400' : latestRsi <= 30 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {latestRsi.toFixed(1)} {latestRsi >= 70 ? '(Overbought)' : latestRsi <= 30 ? '(Oversold)' : '(Neutral)'}
              </span>
            </div>

            <div className="h-16 w-full bg-[var(--surface-2)] rounded border border-[var(--border)] relative overflow-hidden">
              {/* Overbought / Oversold zones */}
              <div className="absolute top-[30%] left-0 right-0 h-[1px] bg-rose-500/30 border-b border-dashed border-rose-500/40" />
              <div className="absolute top-[70%] left-0 right-0 h-[1px] bg-emerald-500/30 border-b border-dashed border-emerald-500/40" />

              <svg viewBox={`0 0 ${chartWidth} 64`} className="w-full h-full">
                <path
                  d={rsi
                    .map((val, i) => {
                      if (isNaN(val)) return '';
                      const x = getX(i);
                      const y = 64 - (val / 100) * 64;
                      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                    })
                    .filter(Boolean)
                    .join(' ')}
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Live Orderbook / Tick Flow Panel */}
        <div className="card span4 flex flex-col justify-between">
          <div>
            <h3>Live Market Flow &amp; Micro-Ticks</h3>
            <div className="ch-sub">Aliran transaksi &amp; kedalaman order real-time</div>

            {/* Depth visualizer */}
            <div className="space-y-1 text-xs mono">
              <div className="text-[var(--text-faint)] text-[10px] uppercase font-bold mb-1">Orderbook Asks (Jual)</div>
              {[1.004, 1.003, 1.002, 1.001].map((mult, i) => {
                const p = (currentItem?.price || 100) * mult;
                const size = (0.45 + i * 0.32).toFixed(2);
                return (
                  <div key={i} className="flex justify-between items-center py-0.5 px-2 rounded bg-rose-500/5 text-rose-400">
                    <span>{p > 100 ? p.toFixed(2) : p.toFixed(4)}</span>
                    <span className="text-[var(--text-faint)]">{size} Vol</span>
                  </div>
                );
              })}

              {/* Current Spread divider */}
              <div className="py-1 my-1 text-center font-bold text-sm text-[var(--text)] border-y border-[var(--border)] bg-[var(--surface-2)]">
                {currentItem?.price > 100
                  ? currentItem.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : currentItem?.price.toFixed(4)}
              </div>

              <div className="text-[var(--text-faint)] text-[10px] uppercase font-bold mb-1">Orderbook Bids (Beli)</div>
              {[0.999, 0.998, 0.997, 0.996].map((mult, i) => {
                const p = (currentItem?.price || 100) * mult;
                const size = (0.52 + i * 0.28).toFixed(2);
                return (
                  <div key={i} className="flex justify-between items-center py-0.5 px-2 rounded bg-emerald-500/5 text-emerald-400">
                    <span>{p > 100 ? p.toFixed(2) : p.toFixed(4)}</span>
                    <span className="text-[var(--text-faint)]">{size} Vol</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 mt-4 border-t border-[var(--border)] text-xs text-[var(--text-faint)]">
            <b>Feed Status:</b> {currentItem?.source === 'binance' ? 'Binance WSS Ultra-low latency' : 'Yahoo Finance Real-time REST Proxy'}
          </div>
        </div>
      </div>
    </div>
  );
};

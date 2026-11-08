import React from 'react';
import { Sun, Moon, Radio, Activity, RefreshCw } from 'lucide-react';
import { MarketItem } from '../types/market';

interface HeaderProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  binanceStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  markets: {
    crypto: MarketItem[];
    forex: MarketItem[];
    commodities: MarketItem[];
    equities: MarketItem[];
  };
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  binanceStatus,
  markets,
  onRefresh,
  isRefreshing,
}) => {
  // Combine priority symbols for the top ticker tape
  const allTickerItems = [
    ...(markets.crypto || []),
    ...(markets.forex || []).slice(0, 3),
    ...(markets.commodities || []).slice(0, 2),
    ...(markets.equities || []).slice(0, 1),
  ];

  return (
    <header>
      <div className="top">
        <div className="brand">
          <div className="brand-icon">🎯</div>
          <div>
            <div className="brand-title">MiND-Shot · Live Multi-Market Terminal</div>
            <div className="brand-sub">
              Real-time Trading Intelligence &amp; Calibrated Mean-Reversion Playbook
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Live Stream Indicators */}
          <div className="flex items-center gap-2 text-xs mono">
            <span
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
                binanceStatus === 'connected'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${binanceStatus === 'connected' ? 'animate-pulse' : ''}`} />
              Binance WSS: {binanceStatus}
            </span>

            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-sky-500/10 text-sky-400 border-sky-500/30">
              <Activity className="w-3.5 h-3.5" />
              Yahoo Feed: Live
            </span>
          </div>

          {/* Refresh button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg border border-[var(--border)] hover:border-[var(--border-strong)] bg-[var(--surface-1)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
            title="Force refresh live market feeds"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {/* Theme switcher */}
          <button
            onClick={onToggleTheme}
            className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
          </button>
        </div>
      </div>

      {/* Live Scrolling Ticker Tape */}
      <div className="ticker-bar">
        {allTickerItems.map((item) => {
          const isPos = item.change24h >= 0;
          return (
            <div
              key={item.id}
              className={`ticker-item ${item.flash === 'up' ? 'flash-up' : item.flash === 'down' ? 'flash-down' : ''}`}
            >
              <span className="font-bold text-[var(--text)]">{item.name}</span>
              <span className="mono font-semibold text-[var(--text)]">
                {item.price > 100 ? item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : item.price.toFixed(4)}
              </span>
              <span className={`mono text-xs font-semibold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPos ? '+' : ''}
                {item.change24h.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </header>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { Header } from './components/Header';
import { Navigation, ActiveTab } from './components/Navigation';
import { CommandCenter } from './components/CommandCenter';
import { LiveSignalsPanel } from './components/LiveSignalsPanel';
import { MarketTerminal } from './components/MarketTerminal';
import { CalibrationStudio } from './components/CalibrationStudio';
import { NewsEngine } from './components/NewsEngine';
import { ValidationReport } from './components/ValidationReport';
import { binanceSocket } from './services/binanceSocket';
import { fetchMarketQuotes, fetchSignals, fetchNewsFeed, fetchBacktestData } from './services/apiClient';
import { AssetSignals, BacktestResult, BacktestSummary, BacktestTrade, CalibrationParams, CurrencyNewsStatus, MarketCategory, MarketItem, NewsEvent } from './types/market';

export default function App() {
  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ms-theme') as 'dark' | 'light';
      if (saved) return saved;
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return 'dark';
  });

  // Active navigation tab defaults to unified dynamic Cockpit view
  const [activeTab, setActiveTab] = useState<ActiveTab>('cockpit');
  const [, startTransition] = useTransition();

  // Connection and live data states
  const [binanceStatus, setBinanceStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'error'>('connecting');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Market Quotes
  const [markets, setMarkets] = useState<{
    crypto: MarketItem[];
    forex: MarketItem[];
    commodities: MarketItem[];
    equities: MarketItem[];
  }>({
    crypto: [],
    forex: [],
    commodities: [],
    equities: [],
  });

  // Signals
  const [signalsData, setSignalsData] = useState<{
    assets: AssetSignals[];
    generated_at: string;
    source: string;
  }>({
    assets: [],
    generated_at: new Date().toISOString(),
    source: 'live',
  });

  // News & Blackout
  const [newsData, setNewsData] = useState<{
    currencyStatus: Record<string, CurrencyNewsStatus>;
    headlines: Array<{ title: string; link: string; pubDate: string; sentiment: 'bullish' | 'bearish' | 'neutral' }>;
    events: NewsEvent[];
  }>({
    currencyStatus: {},
    headlines: [],
    events: [],
  });

  // Backtest Playbook Data
  const [backtestData, setBacktestData] = useState<{
    summary: BacktestSummary | null;
    results: BacktestResult[];
    trades: BacktestTrade[];
    config: any;
  }>({
    summary: null,
    results: [],
    trades: [],
    config: null,
  });

  // Calibration parameters per market category
  const [calibrationParams, setCalibrationParams] = useState<Record<MarketCategory, CalibrationParams>>({
    crypto: { adxMax: 32.0, zScoreThreshold: 2.1, rsiOverbought: 74, rsiOversold: 26, atrSlMultiplier: 2.5, atrTpMultiplier: 3.5, newsBlackoutMins: 10 },
    forex: { adxMax: 24.0, zScoreThreshold: 1.8, rsiOverbought: 68, rsiOversold: 32, atrSlMultiplier: 1.6, atrTpMultiplier: 2.2, newsBlackoutMins: 20 },
    commodities: { adxMax: 28.0, zScoreThreshold: 2.0, rsiOverbought: 70, rsiOversold: 30, atrSlMultiplier: 2.0, atrTpMultiplier: 3.0, newsBlackoutMins: 15 },
    equities: { adxMax: 26.0, zScoreThreshold: 1.9, rsiOverbought: 74, rsiOversold: 34, atrSlMultiplier: 1.8, atrTpMultiplier: 2.8, newsBlackoutMins: 15 },
  });

  // Theme effect
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ms-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Subscribe to Binance Socket status and ticks
  useEffect(() => {
    const unsubStatus = binanceSocket.subscribeStatus((st) => {
      setBinanceStatus(st);
    });

    const unsubTick = binanceSocket.subscribe((tick) => {
      // Update crypto item in real time with flash
      setMarkets((prev) => {
        const isEur = tick.symbol.toLowerCase() === 'eurusdt';
        const isPaxg = tick.symbol.toLowerCase() === 'paxgusdt';

        const cryptos = prev.crypto.map((c) => {
          if (c.id.toLowerCase() === tick.symbol.toLowerCase()) {
            const oldPrice = c.price;
            const flash = tick.price > oldPrice ? ('up' as const) : tick.price < oldPrice ? ('down' as const) : null;
            return {
              ...c,
              price: tick.price,
              change24h: tick.change24h,
              high24h: tick.high24h,
              low24h: tick.low24h,
              volume: tick.volume,
              timestamp: tick.timestamp,
              flash,
            };
          }
          return c;
        });

        const forex = prev.forex.map((f) => {
          if (isEur && f.id === 'EURUSD=X') {
            const oldPrice = f.price;
            const flash = tick.price > oldPrice ? ('up' as const) : tick.price < oldPrice ? ('down' as const) : null;
            return {
              ...f,
              price: tick.price,
              change24h: tick.change24h,
              high24h: tick.high24h,
              low24h: tick.low24h,
              timestamp: tick.timestamp,
              flash,
            };
          }
          return f;
        });

        const commodities = prev.commodities.map((m) => {
          if (isPaxg && m.id === 'GC=F') {
            const oldPrice = m.price;
            const flash = tick.price > oldPrice ? ('up' as const) : tick.price < oldPrice ? ('down' as const) : null;
            return {
              ...m,
              price: tick.price,
              change24h: tick.change24h,
              high24h: tick.high24h,
              low24h: tick.low24h,
              timestamp: tick.timestamp,
              flash,
            };
          }
          return m;
        });

        return { ...prev, crypto: cryptos, forex, commodities };
      });
    });

    return () => {
      unsubStatus();
      unsubTick();
    };
  }, []);

  // Fetch initial data
  const loadAllData = useCallback(async (force = false) => {
    setIsRefreshing(true);
    try {
      const [m, s, n, b] = await Promise.allSettled([
        fetchMarketQuotes(),
        fetchSignals({
          force,
          adx_crypto: calibrationParams.crypto.adxMax,
          adx_forex: calibrationParams.forex.adxMax,
          z_crypto: calibrationParams.crypto.zScoreThreshold,
          z_forex: calibrationParams.forex.zScoreThreshold,
        }),
        fetchNewsFeed(),
        fetchBacktestData(),
      ]);

      if (m.status === 'fulfilled' && m.value) {
        setMarkets(m.value);
      }
      if (s.status === 'fulfilled' && s.value) {
        setSignalsData(s.value);
      }
      if (n.status === 'fulfilled' && n.value) {
        setNewsData(n.value);
      }
      if (b.status === 'fulfilled' && b.value) {
        setBacktestData({
          summary: b.value.summary,
          results: b.value.results || [],
          trades: b.value.trades || [],
          config: b.value.config,
        });
      }
    } catch (err) {
      // handled
    } finally {
      setIsRefreshing(false);
    }
  }, [calibrationParams]);

  useEffect(() => {
    loadAllData();
    // Poll updates every 8 seconds
    const interval = setInterval(() => {
      loadAllData();
    }, 8000);
    return () => clearInterval(interval);
  }, [loadAllData]);

  // Handle calibration update from Studio
  const handleApplyCalibration = (market: MarketCategory, params: CalibrationParams) => {
    setCalibrationParams((prev) => ({
      ...prev,
      [market]: params,
    }));
    // Re-fetch signals with updated calibration
    fetchSignals({
      force: true,
      adx_crypto: market === 'crypto' ? params.adxMax : calibrationParams.crypto.adxMax,
      adx_forex: market === 'forex' ? params.adxMax : calibrationParams.forex.adxMax,
      z_crypto: market === 'crypto' ? params.zScoreThreshold : calibrationParams.crypto.zScoreThreshold,
      z_forex: market === 'forex' ? params.zScoreThreshold : calibrationParams.forex.zScoreThreshold,
    }).then((res) => {
      if (res?.assets) setSignalsData(res);
    });
  };

  // Locked signals count for badges
  const lockedCount = signalsData.assets.reduce(
    (acc, a) => acc + a.strategies.filter((s) => s.status === 'locked').length,
    0
  );

  return (
    <div className="wrap">
      {/* Header with Tickers & Status */}
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        binanceStatus={binanceStatus}
        markets={markets}
        onRefresh={() => loadAllData(true)}
        isRefreshing={isRefreshing}
      />

      {/* Navigation Tabs */}
      <Navigation
        activeTab={activeTab}
        onChangeTab={(tab) => startTransition(() => setActiveTab(tab))}
        lockedSignalsCount={lockedCount}
      />

      {/* Main Tab Content */}
      <main>
        {activeTab === 'cockpit' && (
          <CommandCenter
            markets={markets}
            signals={signalsData.assets}
            currencyStatus={newsData.currencyStatus}
            onSelectTab={setActiveTab}
            onRefresh={() => loadAllData(true)}
            isRefreshing={isRefreshing}
          />
        )}

        {activeTab === 'signals' && (
          <LiveSignalsPanel
            assets={signalsData.assets}
            lastUpdate={signalsData.generated_at}
            source={signalsData.source}
            onForceRefresh={() => loadAllData(true)}
            isRefreshing={isRefreshing}
          />
        )}

        {activeTab === 'terminal' && (
          <MarketTerminal markets={markets} />
        )}

        {activeTab === 'calibration' && (
          <CalibrationStudio
            onApplyCalibration={handleApplyCalibration}
            currentParams={calibrationParams}
          />
        )}

        {activeTab === 'news' && (
          <NewsEngine
            currencyStatus={newsData.currencyStatus}
            headlines={newsData.headlines}
            events={newsData.events}
          />
        )}

        {activeTab === 'backtest' && (
          <ValidationReport
            summary={backtestData.summary}
            results={backtestData.results}
            trades={backtestData.trades}
            config={backtestData.config}
          />
        )}
      </main>
    </div>
  );
}

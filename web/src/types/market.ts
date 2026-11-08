export type MarketCategory = 'crypto' | 'forex' | 'commodities' | 'equities';

export interface MarketItem {
  id: string;
  name: string;
  display: string;
  asset: string;
  ccy?: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume: string;
  source: 'binance' | 'yahoo' | 'synth';
  timestamp: number;
  flash?: 'up' | 'down' | null;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SignalTicket {
  side: 'BUY' | 'SELL';
  entry: number;
  sl: number;
  tp: number;
  sl_pips: number;
  tp_pips: number;
  risk_usd: number;
  reward_usd: number;
  rr_ratio: number;
  confidence: number;
  status: 'LOCKED' | 'READY' | 'EXECUTING';
  timestamp: number;
}

export interface StrategyLevel {
  entry_ref: number;
  sl: number;
  sl_atr: number;
  tp: number;
  valid: boolean;
  risk_usd: number;
  reward_usd: number | null;
  anchor: number | null;
}

export interface StrategySignal {
  id: string;
  name: string;
  source: 'vwap_z' | 'rsi2' | 'stoch_k' | 'zscore';
  value: number;
  long_at: number;
  short_at: number;
  adx: number;
  adx_max: number;
  adx_ok: boolean;
  long_ok: boolean;
  short_ok: boolean;
  status: 'locked' | 'preparing' | 'trending' | 'idle';
  distance: {
    to_long: number;
    to_short: number;
  };
  levels: {
    atr: number;
    buy: StrategyLevel;
    sell: StrategyLevel;
  };
  ticket: SignalTicket | null;
}

export interface AssetSignals {
  asset: string;
  symbol: string;
  pair_display: string;
  category: MarketCategory;
  last_close: number;
  change24h: number;
  bar_closed_at: number;
  strategies: StrategySignal[];
}

export interface NewsEvent {
  id: string;
  t: number;
  iso: string;
  ccy: string;
  impact: 'high' | 'medium' | 'low';
  title: string;
  forecast: number | null;
  previous: number | null;
  actual: number | null;
  source?: string;
  blackout: [number, number] | null;
}

export interface CurrencyNewsStatus {
  status: 'is-block' | 'is-soon' | 'is-clear';
  nextEvent: NewsEvent | null;
  countdownMins: number | null;
}

export interface CalibrationParams {
  adxMax: number;
  zScoreThreshold: number;
  rsiOverbought: number;
  rsiOversold: number;
  atrSlMultiplier: number;
  atrTpMultiplier: number;
  newsBlackoutMins: number;
}

export interface BacktestSummary {
  strategies: number;
  passing: number;
  avg_win_rate: number;
  overall_win_rate: number;
  total_trades: number;
  avg_return_pct: number;
  best_return_pct: number;
  worst_drawdown_pct: number;
}

export interface BacktestResult {
  strategy_id: string;
  name: string;
  asset: string;
  trades: number;
  wins: number;
  long_trades: number;
  short_trades: number;
  win_rate: number;
  expected_win_rate: number;
  final_wallet: number;
  return_pct: number;
  max_drawdown_pct: number;
  passes: boolean;
  equity: number[];
}

export interface BacktestTrade {
  strategy_id: string;
  name: string;
  asset: string;
  side: 'long' | 'short';
  entry: number;
  exit: number;
  entry_ts: number;
  exit_ts: number;
  pnl_usd: number;
  ret_pct: number;
  wallet_after: number;
  win: boolean;
}

// Real-time Binance WebSocket Client for sub-second crypto ticks and trades

type TickerCallback = (data: {
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume: string;
  timestamp: number;
}) => void;

type StatusCallback = (status: 'connected' | 'connecting' | 'disconnected' | 'error') => void;

class BinanceSocketService {
  private ws: WebSocket | null = null;
  private subscribers: Set<TickerCallback> = new Set();
  private statusSubscribers: Set<StatusCallback> = new Set();
  private reconnectTimer: any = null;
  private isExplicitClose = false;
  private currentStatus: 'connected' | 'connecting' | 'disconnected' | 'error' = 'disconnected';

  private symbols = ['btcusdt', 'ethusdt', 'solusdt', 'bnbusdt', 'xrpusdt', 'eurusdt', 'paxgusdt'];

  constructor() {
    // defer connection to browser environment
    if (typeof window !== 'undefined') {
      this.connect();
    }
  }

  public connect() {
    if (typeof window === 'undefined' || this.ws?.readyState === WebSocket.OPEN) return;

    this.setStatus('connecting');
    this.isExplicitClose = false;

    // Connect to multi-stream endpoint for tickers
    const streams = this.symbols.map((s) => `${s}@ticker`).join('/');
    const url = `wss://stream.binance.com:9443/ws/${streams}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.setStatus('connected');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          // Binance ticker stream format:
          // e: '24hrTicker', s: 'BTCUSDT', c: '75980.20', p: '240.10', P: '0.32', h: '76400', l: '74800', v: '24120.4'
          if (raw && raw.s && raw.c) {
            const parsed = {
              symbol: raw.s,
              price: parseFloat(raw.c),
              change24h: parseFloat(raw.P || '0'),
              high24h: parseFloat(raw.h || '0'),
              low24h: parseFloat(raw.l || '0'),
              volume: parseFloat(raw.v || '0').toFixed(1),
              timestamp: raw.E || Date.now(),
            };

            for (const cb of this.subscribers) {
              cb(parsed);
            }
          }
        } catch (err) {
          // ignore malformed frame
        }
      };

      this.ws.onerror = () => {
        this.setStatus('error');
      };

      this.ws.onclose = () => {
        this.setStatus('disconnected');
        if (!this.isExplicitClose) {
          this.reconnectTimer = setTimeout(() => this.connect(), 3500);
        }
      };
    } catch (err) {
      this.setStatus('error');
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    }
  }

  private setStatus(status: 'connected' | 'connecting' | 'disconnected' | 'error') {
    this.currentStatus = status;
    for (const cb of this.statusSubscribers) {
      cb(status);
    }
  }

  public subscribe(cb: TickerCallback) {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  public subscribeStatus(cb: StatusCallback) {
    this.statusSubscribers.add(cb);
    cb(this.currentStatus);
    return () => {
      this.statusSubscribers.delete(cb);
    };
  }

  public disconnect() {
    this.isExplicitClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const binanceSocket = new BinanceSocketService();

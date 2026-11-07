/**
 * MiND-Shot Node.js Backend Server
 * 
 * Wraps the Python trading engine to provide signal data via API,
 * serving the React dashboard locally without requiring GitHub Actions.
 */

import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const app = express();
const PORT = process.env.PORT || 3000;
const REPO_DIR = process.cwd();

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cors());

/**
 * Run the Python backtest engine and return results
 * @returns {Promise<Object>} Backtest results in dashboard format
 */
async function runBacktest() {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn("python", ["gen_report.py"], {
      cwd: REPO_DIR,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      timeout: 120000,
    });

    let stdout = "";
    let stderr = "";

    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code === 0) {
        const jsonPath = path.join(REPO_DIR, "web", "public", "backtest.json");
        if (fs.existsSync(jsonPath)) {
          try {
            const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
            resolve(data);
          } catch (e) {
            reject(new Error(`Failed to parse backtest.json: ${e.message}`));
          }
        } else {
          reject(new Error("backtest.json not generated"));
        }
      } else {
        reject(
          new Error(`Python backtest failed (code ${code}): ${stderr || stdout}`)
        );
      }
    });

    pythonProcess.on("error", (err) => {
      reject(new Error(`Failed to spawn Python process: ${err.message}`));
    });

    pythonProcess.on("timeout", () => {
      pythonProcess.kill();
      reject(new Error("Backtest timed out after 2 minutes"));
    });
  });
}

/**
 * API: Get backtest results summary
 * GET /api/backtest/summary
 */
app.get("/api/backtest/summary", async (req, res) => {
  try {
    const data = await runBacktest();
    const summary = {
      generated_at: data.generated_at,
      config: data.config,
      summary: data.summary,
      results: data.results.map((r) => ({
        strategy_id: r.strategy_id,
        name: r.name,
        asset: r.asset,
        trades: r.trades,
        wins: r.wins,
        long_trades: r.long_trades,
        short_trades: r.short_trades,
        win_rate: r.win_rate,
        expected_win_rate: r.expected_win_rate,
        final_wallet: r.final_wallet,
        return_pct: r.return_pct,
        max_drawdown_pct: r.max_drawdown_pct,
        passes: r.passes,
      })),
    };
    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error running backtest summary:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * API: Get full backtest results
 * GET /api/backtest
 */
app.get("/api/backtest", async (req, res) => {
  try {
    const data = await runBacktest();
    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error running backtest:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ── Live signals: run live_signals.py (Kraken→binance.vision feed), cache 60s ──
let signalsCache = null;
let signalsCacheAt = 0;
const SIGNALS_TTL_MS = 60_000;

function runLiveSignals() {
  return new Promise((resolve, reject) => {
    const p = spawn("python3", ["live_signals.py"], {
      cwd: REPO_DIR,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      timeout: 120_000,
    });
    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => {
      if (code !== 0 && code !== null) {
        return reject(new Error(`live_signals.py failed (code ${code}): ${stderr || stdout}`));
      }
      if (code === null) {
        return reject(new Error(`live_signals.py timed out: ${stderr || stdout}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`live_signals.py JSON parse failed: ${e.message} — got: ${stdout.slice(0, 200)}`));
      }
    });
    p.on("error", (err) => reject(new Error(`failed to spawn live_signals.py: ${err.message}`)));
  });
}

app.get("/api/signals", async (req, res) => {
  const force = req.query.force === "1";
  const fresh = signalsCache && (Date.now() - signalsCacheAt) < SIGNALS_TTL_MS;
  if (fresh && !force) return res.json({ success: true, data: signalsCache, cached: true });
  try {
    const data = await runLiveSignals();
    signalsCache = data;
    signalsCacheAt = Date.now();
    res.json({ success: true, data, cached: false });
  } catch (error) {
    console.error("Error fetching live signals:", error.message);
    if (fresh) return res.json({ success: true, data: signalsCache, cached: true, stale: true });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Economic news feed: run news_feed.py (TradingView + GitHub feed), cache 15 min
 */
let newsCache = null;
let newsCacheAt = 0;
const NEWS_TTL_MS = 15 * 60_000;

function runNewsFeed() {
  return new Promise((resolve, reject) => {
    const p = spawn("python3", ["news_feed.py"], {
      cwd: REPO_DIR,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      timeout: 120_000,
    });
    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => {
      if (code !== 0 && code !== null) {
        return reject(new Error(`news_feed.py failed (code ${code}): ${stderr || stdout}`));
      }
      if (code === null) {
        return reject(new Error(`news_feed.py timed out: ${stderr || stdout}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`news_feed.py JSON parse failed: ${e.message}`));
      }
    });
    p.on("error", (err) => reject(new Error(`failed to spawn news_feed.py: ${err.message}`)));
  });
}

app.get("/api/news", async (req, res) => {
  const force = req.query.force === "1";
  const fresh = newsCache && (Date.now() - newsCacheAt) < NEWS_TTL_MS;
  if (fresh && !force) return res.json({ success: true, data: newsCache, cached: true });
  try {
    const data = await runNewsFeed();
    newsCache = data;
    newsCacheAt = Date.now();
    res.json({ success: true, data, cached: false });
  } catch (error) {
    console.error("Error fetching news feed:", error.message);
    if (fresh) return res.json({ success: true, data: newsCache, cached: true, stale: true });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Forex scanner: run forex_signals.py (Yahoo 1h → 4h + news gate), cache 15 min
 */
let forexCache = null;
let forexCacheAt = 0;
const FOREX_TTL_MS = 15 * 60_000;

function runForexSignals(noCache = false) {
  return new Promise((resolve, reject) => {
    const args = ["forex_signals.py"];
    if (noCache) args.push("--no-cache");
    const p = spawn("python3", args, {
      cwd: REPO_DIR,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      timeout: 240_000,
    });
    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => {
      if (code !== 0 && code !== null) {
        return reject(new Error(`forex_signals.py failed (code ${code}): ${stderr || stdout}`));
      }
      if (code === null) {
        return reject(new Error(`forex_signals.py timed out: ${stderr || stdout}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`forex_signals.py JSON parse failed: ${e.message} — got: ${stdout.slice(0, 200)}`));
      }
    });
    p.on("error", (err) => reject(new Error(`failed to spawn forex_signals.py: ${err.message}`)));
  });
}

app.get("/api/forex", async (req, res) => {
  const force = req.query.force === "1";
  const fresh = forexCache && (Date.now() - forexCacheAt) < FOREX_TTL_MS;
  if (fresh && !force) return res.json({ success: true, data: forexCache, cached: true });
  try {
    const data = await runForexSignals(force);
    forexCache = data;
    forexCacheAt = Date.now();
    res.json({ success: true, data, cached: false });
  } catch (error) {
    console.error("Error scanning forex:", error.message);
    if (forexCache) return res.json({ success: true, data: forexCache, cached: true, stale: true });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Health check endpoint
 * GET /api/health
 */
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    service: "MiND-Shot Backend",
    timestamp: new Date().toISOString(),
  });
});

// Empty route handler for unmatched paths (avoid path-to-regexp errors)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Not found",
  });
});

/**
 * Start the server
 */
async function startServer() {
  // Ensure state directory exists
  const stateDir = path.join(REPO_DIR, "state");
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  // Start the server
  app.listen(PORT, () => {
    console.log("=".repeat(60));
    console.log("🚀 MiND-Shot Node.js Backend Server");
    console.log("=".repeat(60));
    console.log(`📡 Server running at http://localhost:${PORT}`);
    console.log(`📊 Dashboard API available at:`);
    console.log(`   http://localhost:${PORT}/api/backtest/summary`);
    console.log(`   http://localhost:${PORT}/api/backtest`);
    console.log(`   http://localhost:${PORT}/api/health`);
    console.log("=".repeat(60));
    console.log("⚡ Press Ctrl+C to stop the server");
    console.log("=".repeat(60));
  });
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

startServer();
#!/usr/bin/env bash
# MiND-Shot — start the local backend + dashboard (idempotent: won't double-start).
set -u
cd "$(dirname "$0")"

BACKEND_LOG=/tmp/mind_backend.log
VITE_LOG=/tmp/vite_dev.log

is_up() { curl -s -m 2 -o /dev/null "$1"; }

if is_up "http://localhost:3000/api/health"; then
  echo "✔ Backend sudah jalan  → http://localhost:3000"
else
  echo "→ Menjalankan backend (node server.js)…"
  nohup node server.js > "$BACKEND_LOG" 2>&1 &
  for _ in $(seq 1 20); do
    is_up "http://localhost:3000/api/health" && break
    sleep 0.5
  done
fi

if is_up "http://localhost:5173/"; then
  echo "✔ Dashboard sudah jalan → http://localhost:5173"
else
  echo "→ Menjalankan dashboard (vite)…"
  ( cd web && nohup npm run dev > "$VITE_LOG" 2>&1 & )
  for _ in $(seq 1 40); do
    is_up "http://localhost:5173/" && break
    sleep 0.5
  done
fi

if is_up "http://localhost:3000/api/health" && is_up "http://localhost:5173/"; then
  echo ""
  echo "✅ MiND-Shot siap: http://localhost:5173/"
  echo "   log backend : $BACKEND_LOG"
  echo "   log dashboard: $VITE_LOG"
else
  echo ""
  echo "⚠️ Salah satu service gagal start. Cek log:"
  echo "   tail -n 40 $BACKEND_LOG"
  echo "   tail -n 40 $VITE_LOG"
  exit 1
fi

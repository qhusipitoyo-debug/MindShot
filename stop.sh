#!/usr/bin/env bash
# MiND-Shot — stop the local backend + dashboard.
set -u

# Kill only processes on the app's ports whose command line matches this app,
# so we never take down an unrelated service.
kill_port() {
  local port="$1" needle="$2" pids pid alive
  pids=$(ss -ltnp 2>/dev/null \
    | awk -v p=":$port" '$4 ~ p"$" {print}' \
    | grep -oP 'pid=\K[0-9]+' | sort -u)

  local matched=""
  for pid in $pids; do
    if tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q "$needle"; then
      matched="$matched $pid"
    fi
  done
  matched=$(echo "$matched" | xargs)

  if [ -z "$matched" ]; then
    echo "· port $port: tidak ada proses MiND-Shot"
    return
  fi
  echo "→ stop port $port (pid: $matched)"
  kill $matched 2>/dev/null
  for _ in 1 2 3 4 5 6; do
    alive=""
    for pid in $matched; do kill -0 "$pid" 2>/dev/null && alive="$alive $pid"; done
    [ -z "$(echo "$alive" | xargs)" ] && return
    sleep 0.5
  done
  kill -9 $matched 2>/dev/null
}

kill_port 3000 "server.js"
kill_port 5173 "vite"
sleep 1

echo "🛑 MiND-Shot dihentikan."

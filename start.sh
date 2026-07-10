#!/usr/bin/env bash
# מריץ את שלושת חלקי הפרויקט (טלגרם, בקאנד, פרונטאנד) במקביל.
# עצירה: Ctrl+C (עוצר את כולם יחד).

set -e
cd "$(dirname "$0")"
mkdir -p logs

PIDS=()
cleanup() {
  echo ""
  echo "עוצר את כל התהליכים..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# --- טלגרם ---
if [ ! -d "telegram/venv" ]; then
  echo "מתקין תלויות טלגרם (venv)..."
  python3 -m venv telegram/venv
  telegram/venv/bin/pip install -q -r telegram/requirements.txt
fi
echo "מריץ ליסנר טלגרם..."
(cd telegram && ./venv/bin/python telegram_listener.py) >logs/telegram.log 2>&1 &
PIDS+=($!)

# --- Backend ---
if [ ! -d "backend/node_modules" ]; then
  echo "מתקין תלויות backend..."
  (cd backend && npm install)
fi
echo "מריץ backend..."
(cd backend && npm start) >logs/backend.log 2>&1 &
PIDS+=($!)

# --- Frontend ---
if [ ! -d "frontend/node_modules" ]; then
  echo "מתקין תלויות frontend..."
  (cd frontend && npm install)
fi
echo "מריץ frontend..."
(cd frontend && npm run dev) >logs/frontend.log 2>&1 &
PIDS+=($!)

echo ""
echo "כל השירותים רצים ברקע. לוגים ב-logs/*.log"
echo "backend:  http://localhost:4000"
echo "frontend: http://localhost:5173"
echo "לעצירה: Ctrl+C"
echo ""

wait

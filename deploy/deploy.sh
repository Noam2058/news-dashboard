#!/usr/bin/env bash
# מריץ/מעדכן את האפליקציה על השרת. הרצה מתוך /opt/news-dashboard אחרי git pull.
set -e
cd "$(dirname "$0")/.."

echo "== backend =="
(cd backend && npm install && npm rebuild better-sqlite3)

echo "== frontend (build סטטי, ה-API יגיע דרך nginx על אותו דומיין) =="
(cd frontend && VITE_API_BASE="" npm install && VITE_API_BASE="" npm run build)

echo "== telegram venv =="
if [ ! -d telegram/venv ]; then
  python3 -m venv telegram/venv
fi
telegram/venv/bin/pip install -q -r telegram/requirements.txt

echo "== pm2 =="
pm2 startOrReload deploy/ecosystem.config.cjs
pm2 save

echo ""
echo "בוצע. סטטוס: pm2 status | לוגים: pm2 logs"

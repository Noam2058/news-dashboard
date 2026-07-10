#!/usr/bin/env bash
# הרצה חד-פעמית על שרת Ubuntu נקי (כ-root), מתקינה את כל מה שצריך.
# שימוש: ssh root@<IP> 'bash -s' < deploy/setup-server.sh
set -e

echo "== עדכון מערכת =="
apt-get update -y && apt-get upgrade -y

echo "== Node.js 20 LTS =="
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "== Python =="
apt-get install -y python3 python3-venv python3-pip

echo "== nginx + certbot =="
apt-get install -y nginx certbot python3-certbot-nginx

echo "== pm2 =="
npm install -g pm2

echo "== ספריית האפליקציה =="
mkdir -p /opt/news-dashboard

echo ""
echo "הותקן בהצלחה. השלב הבא: git clone הריפו ל-/opt/news-dashboard,"
echo "העתקת הסודות (telegram/.env + session), ואז הרצת deploy.sh"

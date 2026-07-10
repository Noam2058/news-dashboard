# הפיכת הדשבורד לאתר חי — מדריך

## מה אתה צריך לעשות בעצמך (דורש חשבון + תשלום, לא ניתן לביצוע על ידי סוכן)

### 1. שרת VPS
המלצה: [Hetzner Cloud](https://www.hetzner.com/cloud) — מכונת CX22 (2 vCPU, 4GB RAM) ב-~4.5€/חודש, מספיק בענק לדשבורד אישי.
- הרשמה → יצירת פרויקט → Add Server → Ubuntu 24.04 → CX22 → הוספת מפתח SSH שלך
- בסיום תקבל כתובת IP ציבורית (למשל `95.216.x.x`)

### 2. דומיין
כל ספק (Namecheap, GoDaddy, ישראנט...) — לאחר הרכישה:
- בהגדרות ה-DNS של הדומיין, הוסף רשומת **A** שמצביעה מ-`@` (ומ-`www`) אל ה-IP של השרת
- זה יכול לקחת עד כמה שעות להתעדכן (בד"כ דקות)

לאחר שיש לך IP ודומיין מוצבע אליו — תעדכן אותי ואוכל להריץ את שאר השלבים דרך SSH ישירות מכאן.

---

## מה קורה בהמשך (ניתן להרצה מרחוק דרך SSH)

### 3. התקנה ראשונית על השרת
```bash
ssh root@<IP> 'bash -s' < deploy/setup-server.sh
```
מתקין Node 20, Python, nginx, certbot, pm2.

### 4. העלאת הקוד
```bash
ssh root@<IP> "git clone https://github.com/Noam2058/news-dashboard.git /opt/news-dashboard"
```

### 5. העברת הסודות (לא נמצאים בגיט בכוונה)
```bash
scp telegram/.env root@<IP>:/opt/news-dashboard/telegram/.env
scp telegram/news_session.session root@<IP>:/opt/news-dashboard/telegram/news_session.session
```
(העתקת קובץ ה-session הקיים חוסכת אימות טלגרם מחדש בשרת)

### 6. הרצת דיפלוי
```bash
ssh root@<IP> "cd /opt/news-dashboard && bash deploy/deploy.sh"
```

### 7. nginx + HTTPS
```bash
# על השרת, אחרי החלפת הדומיין בקובץ:
sed "s/DOMAIN_PLACEHOLDER/<your-domain>/g" deploy/nginx.conf.template > /etc/nginx/sites-available/news-dashboard
ln -s /etc/nginx/sites-available/news-dashboard /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d <your-domain> -d www.<your-domain>
```
certbot יתקין תעודת HTTPS חינמית ויחדש אותה אוטומטית, ויוסיף הפניית HTTP→HTTPS.

**אם הדומיין מנוהל דרך Cloudflare (proxy מופעל, ה-A record מצביע ל-IP של Cloudflare
ולא של השרת):** ודא/י שמצב ההצפנה תחת SSL/TLS → Overview מוגדר ל-**Full (strict)**
ולא Flexible - אחרת ה-redirect ל-HTTPS שה-certbot מוסיף יגרום ללולאת הפניות אינסופית
(Cloudflare מדבר HTTP עם השרת ב-Flexible, השרת מפנה בחזרה ל-HTTPS, וחוזר חלילה).
עם Full (strict) הבעיה נעלמת כי גם Cloudflare↔שרת עובר ב-HTTPS.

### 8. בדיקה
פתח את `https://<your-domain>` בדפדפן — אמור לראות את הדשבורד החי.

---

## תחזוקה שוטפת
- לוגים: `pm2 logs` על השרת
- סטטוס: `pm2 status`
- עדכון קוד: `git pull && bash deploy/deploy.sh`
- הפעלה אוטומטית אחרי ריסטארט לשרת: `pm2 startup` (פעם אחת, יציג פקודה להרצה)

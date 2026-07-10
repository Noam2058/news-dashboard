import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

const SOURCE_LABELS = {
  globes: "גלובס",
  n12: "N12",
  ynet: "Ynet",
};

function sourceLabel(item) {
  if (item.source_type === "rss") {
    return SOURCE_LABELS[item.source_name] || item.source_name;
  }
  return `@${item.source_name}`;
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function formatClock(date) {
  return date.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// עוטף ערכים מספריים/לטיניים ב-LTR isolate כדי שסימני +/- וסדר הספרות
// לא יתהפכו בתוך עמוד RTL
function Num({ children }) {
  return (
    <span style={{ direction: "ltr", unicodeBidi: "isolate" }}>{children}</span>
  );
}

function formatValue(value) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: value > 100 ? 1 : 2,
  });
}

function formatChange(change) {
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
}

function changeColor(change) {
  return change >= 0 ? "#2f7d3a" : "#a63b3b";
}

// קודי מזג אוויר לפי תקן WMO (מוחזרים מ-Open-Meteo)
const WEATHER_CODE_LABELS = {
  0: "בהיר",
  1: "בהיר בעיקר",
  2: "מעונן חלקית",
  3: "מעונן",
  45: "ערפילי",
  48: "ערפילי",
  51: "טפטוף קל",
  53: "טפטוף",
  55: "טפטוף חזק",
  56: "טפטוף קפוא",
  57: "טפטוף קפוא חזק",
  61: "גשם קל",
  63: "גשם",
  65: "גשם חזק",
  66: "גשם קפוא",
  67: "גשם קפוא חזק",
  71: "שלג קל",
  73: "שלג",
  75: "שלג כבד",
  77: "גרעיני שלג",
  80: "ממטרים קלים",
  81: "ממטרים",
  82: "ממטרים חזקים",
  85: "ממטרי שלג",
  86: "ממטרי שלג כבדים",
  95: "סופת רעמים",
  96: "סופת רעמים עם ברד",
  99: "סופת רעמים עם ברד כבד",
};

function weatherLabel(code) {
  return WEATHER_CODE_LABELS[code] || "—";
}

const TEL_AVIV_FALLBACK = { lat: 32.0853, lon: 34.7818, city: "תל אביב" };
const WEATHER_POLL_MS = 15 * 60 * 1000; // 15 דקות - טמפרטורה לא זזה מהר

const NEWS_MAX_AGE_MS = 12 * 60 * 60 * 1000; // תואם את הניקוי בצד השרת (db.js pruneOldItems)
const CLIENT_PRUNE_INTERVAL_MS = 60 * 1000; // בודקים כל דקה כדי שגם טאב שנשאר פתוח יתעדכן

const TABS = [
  { id: "news", label: "חדשות" },
  { id: "markets", label: "שוק ההון" },
  { id: "exchange", label: "בורסה" },
  { id: "channels", label: "אפיקים" },
];

export default function App() {
  const [items, setItems] = useState([]);
  const [freshIds, setFreshIds] = useState(new Set());
  const [filter, setFilter] = useState("all");
  const [connected, setConnected] = useState(false);
  const [notifyEnabled, setNotifyEnabled] = useState(
    typeof Notification !== "undefined" && Notification.permission === "granted"
  );
  const [now, setNow] = useState(new Date());
  const [activeTab, setActiveTab] = useState("news");
  // ברוחב מובייל הרשימה מתחילה מצומצמת; ברוחב דסקטופ ה-CSS מתעלם מהמצב הזה ומציג תמיד.
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "light"
  );
  const [market, setMarket] = useState({
    tickers: [],
    bonds: [],
    movers: [],
    exchangeRows: [],
    channels: [],
    updatedAt: null,
  });
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  // מסנן פריטים ישנים מ-12 שעות גם בטאב שנשאר פתוח הרבה זמן,
  // כך שהוא יתעדכן בהתאם לניקוי שקורה בשרת ולא ימשיך להציג פריטים ישנים לנצח
  useEffect(() => {
    const t = setInterval(() => {
      const cutoff = Date.now() - NEWS_MAX_AGE_MS;
      setItems((prev) =>
        prev.filter((it) => new Date(it.published_at).getTime() >= cutoff)
      );
    }, CLIENT_PRUNE_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  // מזג אוויר אמיתי לפי מיקום המשתמש (Geolocation), עם נפילה ל-תל אביב אם נדחה/לא זמין
  useEffect(() => {
    let cancelled = false;
    let lat = TEL_AVIV_FALLBACK.lat;
    let lon = TEL_AVIV_FALLBACK.lon;
    let cityPromise = Promise.resolve(TEL_AVIV_FALLBACK.city);

    async function loadWeather() {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`
        );
        const data = await res.json();
        const city = await cityPromise;
        if (cancelled) return;
        setWeather({
          city,
          temp: Math.round(data.current.temperature_2m),
          condition: weatherLabel(data.current.weather_code),
          debugCoords: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        });
      } catch (err) {
        console.error("שגיאה בטעינת מזג אוויר:", err);
      }
    }

    function startWithCoords(useGeo) {
      if (useGeo) {
        cityPromise = fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=he`
        )
          .then((r) => r.json())
          .then((d) => d.city || d.locality || TEL_AVIV_FALLBACK.city)
          .catch(() => TEL_AVIV_FALLBACK.city);
      }
      loadWeather();
      const interval = setInterval(loadWeather, WEATHER_POLL_MS);
      return () => clearInterval(interval);
    }

    let stopPolling = () => {};

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
          stopPolling = startWithCoords(true);
        },
        () => {
          if (cancelled) return;
          stopPolling = startWithCoords(false);
        },
        { timeout: 8000, maximumAge: 30 * 60 * 1000 }
      );
    } else {
      stopPolling = startWithCoords(false);
    }

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, []);

  // טעינה ראשונית: חדשות + תמונת מצב שוק
  useEffect(() => {
    fetch(`${API_BASE}/api/news?limit=150`)
      .then((r) => r.json())
      .then(setItems)
      .catch((err) => console.error("שגיאה בטעינת חדשות:", err));

    fetch(`${API_BASE}/api/markets`)
      .then((r) => r.json())
      .then(setMarket)
      .catch((err) => console.error("שגיאה בטעינת נתוני שוק:", err));
  }, []);

  // חיבור SSE לעדכונים חיים - חדשות ונתוני שוק
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/stream`);

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener("new-item", (event) => {
      const item = JSON.parse(event.data);
      setItems((prev) => {
        const next = [item, ...prev.filter((it) => it.id !== item.id)];
        next.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
        return next;
      });

      setFreshIds((prev) => new Set(prev).add(item.id));
      setTimeout(() => {
        setFreshIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }, 6000);

      if (notifyEnabled && typeof Notification !== "undefined") {
        new Notification(`${sourceLabel(item)} — עדכון חדש`, {
          body: item.title,
          icon: item.image_url || undefined,
        });
      }
    });

    es.addEventListener("market-update", (event) => {
      setMarket(JSON.parse(event.data));
    });

    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifyEnabled]);

  const sourcesPresent = useMemo(() => {
    const counts = new Map();
    items.forEach((it) => {
      const key = it.source_name;
      const label = sourceLabel(it);
      const cur = counts.get(key);
      counts.set(key, { label, count: (cur?.count || 0) + 1 });
    });
    return Array.from(counts.entries()); // [[source_name, {label, count}], ...]
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((it) => it.source_name === filter);
  }, [items, filter]);

  const telegramItems = useMemo(
    () => items.filter((it) => it.source_type === "telegram").slice(0, 5),
    [items]
  );

  async function toggleNotifications() {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      setNotifyEnabled((v) => !v);
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifyEnabled(perm === "granted");
  }

  const marqueeItems = market.tickers;
  const marqueeLoop = marqueeItems.concat(marqueeItems);

  return (
    <div className="dash">
      {/* kicker strip */}
      <div className="kicker-strip">
        <div className="kicker-text">מהדורה יומית · דאשבורד נתונים חיים</div>
      </div>

      {/* nameplate */}
      <div className="nameplate">
        <div className="brand">The Daily News</div>
        <div className="tabs">
          {TABS.map((tab) => (
            <span
              key={tab.id}
              className={`tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </span>
          ))}
        </div>
        <div className="clock-group">
          {weather && (
            <div
              className="weather"
              title={`קואורדינטות שהדפדפן דיווח: ${weather.debugCoords}`}
            >
              <span>{weather.city}</span>
              <span className="weather-temp">
                <Num>{weather.temp}°</Num>
              </span>
              <span>{weather.condition}</span>
            </div>
          )}
          <div className="clock">
            {now.toLocaleDateString("he-IL", { weekday: "long" })} ·{" "}
            <Num>{formatClock(now)}</Num>
          </div>
          <span
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
          >
            {theme === "dark" ? "מצב בהיר" : "מצב כהה"}
          </span>
        </div>
      </div>

      {/* market ticker marquee */}
      <div className="marquee-wrap">
        {marqueeItems.length === 0 ? (
          <div className="marquee-empty">טוען נתוני שוק…</div>
        ) : (
          <div className="marquee-track">
            {marqueeLoop.map((t, i) => (
              <span className="marquee-item" key={`${t.id}-${i}`}>
                <span className="marquee-label">{t.label}</span>
                <Num>{formatValue(t.value)}</Num>
                <b style={{ color: changeColor(t.change) }}>
                  <Num>{formatChange(t.change)}</Num>
                </b>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* body grid */}
      <div className="body-grid">
        {/* sidebar */}
        <div className="sidebar">
          <button
            type="button"
            className="side-label toggle-label"
            onClick={() => setSourcesOpen((v) => !v)}
            aria-expanded={sourcesOpen}
          >
            מקורות
            <span className={`chevron ${sourcesOpen ? "open" : ""}`}>‹</span>
          </button>
          <div className={`source-list ${sourcesOpen ? "" : "collapsed"}`}>
            <div
              className={`source-row ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              <span>הכל</span>
              <span className="count">{items.length}</span>
            </div>
            {sourcesPresent.map(([name, { label, count }]) => (
              <div
                key={name}
                className={`source-row ${filter === name ? "active" : ""}`}
                onClick={() => setFilter(name)}
              >
                <span>{label}</span>
                <span className="count">{count}</span>
              </div>
            ))}
          </div>
          <div className="side-divider" />
          <div className={`live-indicator ${connected ? "" : "offline"}`}>
            <span className="live-dot" />
            {connected ? "מחובר בזמן אמת" : "מתחבר…"}
          </div>
          <button
            className={`notify-btn ${notifyEnabled ? "enabled" : ""}`}
            onClick={toggleNotifications}
          >
            {notifyEnabled ? "התראות פעילות ✓" : "הפעל התראות"}
          </button>
        </div>

        {/* main content */}
        <div className="main-content">
          {activeTab === "news" && (
            <NewsFeed items={filteredItems} freshIds={freshIds} />
          )}
          {activeTab === "markets" && <MarketsTab market={market} />}
          {activeTab === "exchange" && <ExchangeTab rows={market.exchangeRows} />}
          {activeTab === "channels" && <ChannelsTab channels={market.channels} />}
        </div>

        {/* aside */}
        <div className="aside">
          <div className="side-label">מובילות היום</div>
          <div className="movers">
            {market.movers.length === 0 && (
              <div className="muted-note">טוען…</div>
            )}
            {market.movers.map((m) => (
              <div className="mover" key={m.id}>
                <div className="mover-top">
                  <span className="mover-name">{m.name}</span>
                  <span style={{ color: changeColor(m.change), fontWeight: 700 }}>
                    <Num>{formatChange(m.change)}</Num>
                  </span>
                </div>
                <div className="mover-bar-track">
                  <div
                    className="mover-bar-fill"
                    style={{
                      width: `${Math.min(100, Math.abs(m.change) * 12)}%`,
                      background: changeColor(m.change),
                      marginInlineStart: m.change < 0 ? "auto" : 0,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="side-divider" />
          <div className="side-label">תשואות אג"ח</div>
          {market.bonds.map((b) => (
            <div className="bond-row" key={b.id}>
              <span>{b.label}</span>
              <Num>{b.yield.toFixed(2)}%</Num>
            </div>
          ))}
          <div className="muted-note">
            תשואת אג"ח ישראל אינה זמינה חינמית בזמן אמת — מוצגת רק ארה"ב.
          </div>

          <div className="side-divider" />
          <div className="telegram-feed-header">
            <div className="side-label">טלגרם — פיד חי</div>
            <span className="telegram-dot" />
          </div>
          <div className="telegram-feed">
            {telegramItems.length === 0 && (
              <div className="muted-note">אין עדיין הודעות מהערוצים.</div>
            )}
            {telegramItems.map((item) => (
              <div
                key={item.id}
                className={`telegram-msg ${freshIds.has(item.id) ? "fresh" : ""}`}
              >
                <div className="telegram-msg-text">{item.title}</div>
                <div className="telegram-msg-time">
                  {freshIds.has(item.id) ? "עכשיו" : formatTime(item.published_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewsFeed({ items, freshIds }) {
  const [brokenImages, setBrokenImages] = useState(new Set());

  if (items.length === 0) {
    return (
      <div className="empty-state">
        עדיין אין עדכונים להצגה. ברגע שהשרת ימשוך כתבות מגלובס או שיגיעו
        הודעות מהערוצים בטלגרם, הן יופיעו כאן אוטומטית.
      </div>
    );
  }
  return (
    <div className="feed">
      {items.map((item) => (
        <article
          key={item.id}
          className={`news-item ${freshIds.has(item.id) ? "fresh" : ""}`}
        >
          {item.image_url && !brokenImages.has(item.id) ? (
            <img
              className="thumb"
              src={item.image_url}
              alt=""
              loading="lazy"
              onError={() =>
                setBrokenImages((prev) => new Set(prev).add(item.id))
              }
            />
          ) : (
            <div className="ph-box">תמונה</div>
          )}
          <div className="news-body">
            <div className="news-meta">
              <span className={`source-tag ${item.source_type}`}>
                {sourceLabel(item)}
              </span>
              <span>{formatTime(item.published_at)}</span>
              {freshIds.has(item.id) && <span className="badge-new">חדש</span>}
            </div>
            <h2 className="news-title">
              {item.link ? (
                <a href={item.link} target="_blank" rel="noreferrer">
                  {item.title}
                </a>
              ) : (
                item.title
              )}
            </h2>
            {item.content && item.content !== item.title && (
              <p className="news-snippet">
                {item.content.slice(0, 220)}
                {item.content.length > 220 ? "…" : ""}
              </p>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function MarketsTab({ market }) {
  const [editing, setEditing] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleRemove(id) {
    setBusy(true);
    try {
      await fetch(`${API_BASE}/api/watchlist/${id}`, { method: "DELETE" });
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    const symbol = newSymbol.trim();
    if (!symbol) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/watchlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, label: newLabel.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה בהוספה");
        return;
      }
      setNewSymbol("");
      setNewLabel("");
    } catch {
      setError("שגיאת רשת");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="markets-tab">
      <div className="side-label row" style={{ marginBottom: 14 }}>
        <span>מדדים, מטבעות וסחורות · זמן אמת</span>
        <button type="button" className="edit-link" onClick={() => setEditing((v) => !v)}>
          {editing ? "סיום עריכה" : "עריכה"}
        </button>
      </div>
      <div className="ticker-grid">
        {market.tickers.map((t) => (
          <div className="ticker-card" key={t.id}>
            {editing && (
              <button
                type="button"
                className="ticker-remove"
                onClick={() => handleRemove(t.id)}
                aria-label={`הסר ${t.label}`}
                disabled={busy}
              >
                ✕
              </button>
            )}
            <div className="ticker-card-label">{t.label}</div>
            <div className="ticker-card-value">
              <Num>{formatValue(t.value)}</Num>
              <span style={{ color: changeColor(t.change), fontWeight: 700 }}>
                <Num>{formatChange(t.change)}</Num>
              </span>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <form className="ticker-add-form" onSubmit={handleAdd}>
          <input
            type="text"
            placeholder="סימול (למשל AAPL)"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            disabled={busy}
          />
          <input
            type="text"
            placeholder="תווית (אופציונלי)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !newSymbol.trim()}>
            הוסף
          </button>
          {error && <span className="ticker-add-error">{error}</span>}
        </form>
      )}
    </div>
  );
}

function ExchangeTab({ rows }) {
  return (
    <div className="exchange-tab">
      <div className="side-label" style={{ marginBottom: 14 }}>
        מסחר בבורסת תל אביב · זמן אמת (Yahoo Finance)
      </div>
      <table className="exchange-table">
        <thead>
          <tr>
            <th>מניה</th>
            <th>מחיר</th>
            <th>שינוי</th>
            <th>שווי מסחר משוער</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={{ fontWeight: 700 }}>{row.name}</td>
              <td>
                <Num>{formatValue(row.price)}</Num>
              </td>
              <td style={{ color: changeColor(row.change), fontWeight: 700 }}>
                <Num>{formatChange(row.change)}</Num>
              </td>
              <td className="muted">
                <Num>{Math.round(row.volumeValue).toLocaleString("en-US")}</Num> ₪
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChannelsTab({ channels }) {
  return (
    <div className="channels-tab">
      <div className="side-label" style={{ marginBottom: 6 }}>
        אפיקי מעקב
      </div>
      <p className="muted-note" style={{ marginBottom: 16 }}>
        אין מקור חינמי אמין לתשואות קרנות/תעודות סל ישראליות בשמן העברי, לכן
        מוצגים כאן מכשירים סחירים גלובליים עם תשואת 12 חודש אמיתית, מחושבת
        ממחירי סגירה היסטוריים.
      </p>
      <div className="channels-list">
        {channels.map((c) => (
          <div className="channel-row" key={c.id}>
            <div>
              <div className="channel-name">{c.name}</div>
              <div className="channel-type">{c.type}</div>
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ color: changeColor(c.yield1y), fontWeight: 700 }}>
                <Num>{formatChange(c.yield1y)}</Num>
              </div>
              <div className="channel-type">תשואת 12 חודשים</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

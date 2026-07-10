import bus from "./eventBus.js";
import { getWatchlist } from "./watchlist.js";

// כל הנתונים כאן נשלפים מ-Yahoo Finance (chart API ציבורי, ללא מפתח).
// זהו endpoint לא רשמי של Yahoo - עובד היטב לשימוש אישי אך עלול להשתנות/להיחסם.

const HEADERS = { "User-Agent": "Mozilla/5.0 (news-dashboard personal use)" };

// רשימת הטיקר הנע (מדדים/מטבעות/סחורות) ניתנת לעריכה ע"י המשתמש - ראה watchlist.js.

const BONDS = [{ id: "us10y", symbol: "^TNX", label: '10 שנים · ארה"ב' }];

// מניות ת"א מובילות - מוצגות גם כ"מובילות" וגם בטבלת הבורסה
const STOCKS = [
  { symbol: "TEVA.TA", name: "טבע" },
  { symbol: "NICE.TA", name: "נייס" },
  { symbol: "LUMI.TA", name: "בנק לאומי" },
  { symbol: "POLI.TA", name: "בנק פועלים" },
  { symbol: "ESLT.TA", name: "אלביט מערכות" },
  { symbol: "DSCT.TA", name: "בנק דיסקונט" },
  { symbol: "ICL.TA", name: 'איכ"ל' },
  { symbol: "MZTF.TA", name: "מזרחי טפחות" },
];

// "אפיקים": אין מקור חינמי אמין לתשואות קרנות/תעודות סל ישראליות בשמן העברי,
// לכן נעקוב אחרי מכשירים גלובליים סחירים עם טיקר אמיתי ב-Yahoo, ומחשבים תשואת 12 חודש
// אמיתית מתוך מחירי סגירה היסטוריים (לא נתון מומצא).
const CHANNELS = [
  { symbol: "SPY", name: "מדד S&P 500 (ETF)", type: 'מעקב מדד · ארה"ב' },
  { symbol: "QQQ", name: 'מדד נאסד"ק 100 (ETF)', type: 'מעקב מדד · ארה"ב' },
  { symbol: "TA35.TA", name: 'מדד ת"א 35', type: "מדד מקומי · ישראל" },
  { symbol: "IAU", name: "זהב (ETF)", type: "סחורה · זהב" },
  { symbol: "TLT", name: 'אג"ח ממשלתי ארוך (ETF)', type: 'אג"ח · ארה"ב 20+ שנה' },
  { symbol: "BND", name: 'אג"ח כללי (ETF)', type: 'אג"ח · שוק כולל ארה"ב' },
];

const QUOTE_POLL_MS = 20 * 1000; // מחירים חיים - כל 20 שניות
const CHANNELS_POLL_MS = 6 * 60 * 60 * 1000; // תשואות 12 חודש - כל 6 שעות, כמעט לא זזות תוך-יומי

let snapshot = {
  tickers: [],
  bonds: [],
  movers: [],
  exchangeRows: [],
  channels: [],
  updatedAt: null,
};

async function fetchChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1d&range=1d`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} עבור ${symbol}`);
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || meta.regularMarketPrice == null) {
    throw new Error(`אין נתונים עבור ${symbol}`);
  }
  return meta;
}

async function fetchYearReturn(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1mo&range=1y`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} עבור ${symbol}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close?.filter((c) => c != null);
  const current = result?.meta?.regularMarketPrice;
  if (!closes || closes.length < 2 || current == null) {
    throw new Error(`אין מספיק היסטוריה עבור ${symbol}`);
  }
  const first = closes[0];
  return ((current - first) / first) * 100;
}

// מניות ת"א מתומחרות ב-Yahoo באגורות (ILA) - ממירים לשקלים
function normalizePrice(meta) {
  const divisor = meta.currency === "ILA" ? 100 : 1;
  return meta.regularMarketPrice / divisor;
}

function pctChange(meta) {
  const prev = meta.chartPreviousClose ?? meta.previousClose;
  if (!prev) return 0;
  return ((meta.regularMarketPrice - prev) / prev) * 100;
}

async function pollQuotes() {
  try {
    const watchlist = getWatchlist();
    const [watchlistRes, bondsRes, stocksRes] = await Promise.all([
      Promise.allSettled(watchlist.map((s) => fetchChart(s.symbol))),
      Promise.allSettled(BONDS.map((s) => fetchChart(s.symbol))),
      Promise.allSettled(STOCKS.map((s) => fetchChart(s.symbol))),
    ]);

    const tickers = watchlist.map((def, i) => {
      const r = watchlistRes[i];
      if (r.status !== "fulfilled") return null;
      const meta = r.value;
      return {
        id: String(def.id),
        symbol: def.symbol,
        label: def.label,
        value: normalizePrice(meta),
        change: pctChange(meta),
        currency: meta.currency,
      };
    }).filter(Boolean);

    const bonds = BONDS.map((def, i) => {
      const r = bondsRes[i];
      if (r.status !== "fulfilled") return null;
      const meta = r.value;
      // ^TNX מבוטא ב-Yahoo כמספר שכבר שקול לאחוזי תשואה (למשל 4.53 = 4.53%)
      return { id: def.id, label: def.label, yield: meta.regularMarketPrice };
    }).filter(Boolean);

    const stockRows = STOCKS.map((def, i) => {
      const r = stocksRes[i];
      if (r.status !== "fulfilled") return null;
      const meta = r.value;
      const price = normalizePrice(meta);
      return {
        id: def.symbol,
        name: def.name,
        price,
        change: pctChange(meta),
        volumeValue: (meta.regularMarketVolume || 0) * price,
      };
    }).filter(Boolean);

    const movers = [...stockRows].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5);

    snapshot = {
      ...snapshot,
      tickers,
      bonds,
      movers,
      exchangeRows: stockRows,
      updatedAt: new Date().toISOString(),
    };

    bus.emit("market-update", snapshot);
  } catch (err) {
    console.error("[Markets] שגיאה בעדכון נתוני שוק:", err.message);
  }
}

async function pollChannels() {
  try {
    const results = await Promise.allSettled(CHANNELS.map((c) => fetchYearReturn(c.symbol)));
    const channels = CHANNELS.map((def, i) => {
      const r = results[i];
      if (r.status !== "fulfilled") return null;
      return { id: def.symbol, name: def.name, type: def.type, yield1y: r.value };
    }).filter(Boolean);

    snapshot = { ...snapshot, channels };
    bus.emit("market-update", snapshot);
    console.log(`[Markets] עודכנו תשואות 12 חודש עבור ${channels.length} אפיקים`);
  } catch (err) {
    console.error("[Markets] שגיאה בעדכון אפיקים:", err.message);
  }
}

export function getMarketSnapshot() {
  return snapshot;
}

// בודק שסימול קיים ב-Yahoo לפני שמוסיפים אותו לרשימת המעקב, ומציע תווית ברירת מחדל.
export async function validateSymbol(symbol) {
  const meta = await fetchChart(symbol);
  return { suggestedLabel: meta.shortName || meta.longName || symbol };
}

export async function refreshMarketData() {
  await pollQuotes();
}

export function startMarketPolling() {
  console.log("מתחיל polling לנתוני שוק (Yahoo Finance)");
  pollQuotes();
  pollChannels();
  setInterval(pollQuotes, QUOTE_POLL_MS);
  setInterval(pollChannels, CHANNELS_POLL_MS);
}

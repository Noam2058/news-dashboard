import db from "./db.js";

db.exec(`
  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
`);

// הרשימה שהייתה קבועה בקוד עד עכשיו - נטענת פעם אחת כברירת מחדל אם הטבלה ריקה,
// כדי לא לשנות את מה שמוצג כרגע. מכאן והלאה המשתמש עורך את הרשימה בעצמו.
const DEFAULT_TICKERS = [
  { symbol: "TA35.TA", label: 'ת"א 35' },
  { symbol: "^TA125.TA", label: 'ת"א 125' },
  { symbol: "ILS=X", label: "דולר/שקל" },
  { symbol: "EURILS=X", label: "יורו/שקל" },
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "BTC-USD", label: "ביטקוין" },
  { symbol: "GC=F", label: "זהב (אונקיה)" },
  { symbol: "CL=F", label: "נפט ברנט (חבית)" },
  { symbol: "SI=F", label: "כסף (אונקיה)" },
];

const countRow = db.prepare(`SELECT COUNT(*) AS c FROM watchlist`).get();
if (countRow.c === 0) {
  const insert = db.prepare(
    `INSERT INTO watchlist (symbol, label, sort_order) VALUES (?, ?, ?)`
  );
  DEFAULT_TICKERS.forEach((t, i) => insert.run(t.symbol, t.label, i));
}

export function getWatchlist() {
  return db
    .prepare(`SELECT id, symbol, label FROM watchlist ORDER BY sort_order ASC, id ASC`)
    .all();
}

export function addToWatchlist(symbol, label) {
  const existing = db.prepare(`SELECT id FROM watchlist WHERE symbol = ?`).get(symbol);
  if (existing) {
    throw new Error("הסימול הזה כבר ברשימה");
  }
  const maxOrder = db.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM watchlist`).get().m;
  const result = db
    .prepare(`INSERT INTO watchlist (symbol, label, sort_order) VALUES (?, ?, ?)`)
    .run(symbol, label, maxOrder + 1);
  return { id: result.lastInsertRowid, symbol, label };
}

export function removeFromWatchlist(id) {
  const result = db.prepare(`DELETE FROM watchlist WHERE id = ?`).run(id);
  return result.changes > 0;
}

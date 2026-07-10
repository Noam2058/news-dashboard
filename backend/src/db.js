import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "..", "news.db"));

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS news_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,      -- 'rss' | 'telegram'
    source_name TEXT NOT NULL,      -- 'globes' | 'newsisrael' | ...
    title TEXT NOT NULL,
    link TEXT,
    content TEXT,
    published_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    dedupe_key TEXT UNIQUE NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_published_at ON news_items(published_at DESC);
`);

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO news_items
    (source_type, source_name, title, link, content, published_at, dedupe_key)
  VALUES (@source_type, @source_name, @title, @link, @content, @published_at, @dedupe_key)
`);

/**
 * Inserts an item if it doesn't already exist (by dedupe_key).
 * Returns the inserted row (with id) if new, or null if it was a duplicate.
 */
export function insertNewsItem(item) {
  const result = insertStmt.run(item);
  if (result.changes === 0) return null; // duplicate, ignored
  return { id: result.lastInsertRowid, ...item };
}

export function getRecentItems(limit = 100, source_type = null) {
  if (source_type) {
    return db
      .prepare(
        `SELECT * FROM news_items WHERE source_type = ? ORDER BY published_at DESC LIMIT ?`
      )
      .all(source_type, limit);
  }
  return db
    .prepare(`SELECT * FROM news_items ORDER BY published_at DESC LIMIT ?`)
    .all(limit);
}

const pruneStmt = db.prepare(
  `DELETE FROM news_items WHERE published_at < datetime('now', ?)`
);

// חייב להיות תואם לגיל שאחריו pruneOldItems מוחק כתבות (ראה server.js).
// כתבה ישנה מזה לא נכנסת מלכתחילה - אחרת אחרי שהיא נמחקת, פולינג הבא
// שעדיין רואה אותה במקור (RSS/טלגרם) יכניס אותה מחדש כ"כתבה חדשה".
export const NEWS_MAX_AGE_HOURS = 12;

export function isFresh(publishedAtIso) {
  const ageMs = Date.now() - new Date(publishedAtIso).getTime();
  return ageMs < NEWS_MAX_AGE_HOURS * 60 * 60 * 1000;
}

/**
 * מוחק כתבות/הודעות שפורסמו לפני יותר מ-maxAgeHours שעות.
 * שומר את הפיד "רזה" ומונע הצטברות אינסופית של דאטה ישן.
 */
export function pruneOldItems(maxAgeHours = NEWS_MAX_AGE_HOURS) {
  const result = pruneStmt.run(`-${maxAgeHours} hours`);
  return result.changes;
}

export default db;

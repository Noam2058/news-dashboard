import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { insertNewsItem, isFresh } from "./db.js";
import bus from "./eventBus.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// telegram_listener.py כותב לקובץ הזה (ראה תיקיית ../../telegram)
const JSONL_PATH =
  process.env.TELEGRAM_JSONL_PATH ||
  path.join(__dirname, "..", "..", "telegram", "messages.jsonl");

const POLL_INTERVAL_MS = 5 * 1000; // 5 שניות - הודעות טלגרם רוצים בזמן קרוב לאמת

let lastSize = 0;

function processNewLines(newText) {
  const lines = newText.split("\n").filter((l) => l.trim().length > 0);
  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue; // שורה לא תקינה, מדלגים
    }

    const item = {
      source_type: "telegram",
      source_name: record.channel || "unknown",
      title: (record.text || "").slice(0, 200) || "(הודעה ללא טקסט)",
      link: "",
      content: record.text || "",
      published_at: new Date(record.date || record.received_at).toISOString(),
      image_url: null, // הליסנר של טלגרם לא שולף מדיה כרגע
      dedupe_key: `telegram:${record.channel}:${record.message_id}`,
    };

    // מגן מפני הצפה של הודעות ישנות כ"חדשות" אחרי ריסטארט לשרת
    // (שמאפס את lastSize וגורם לקריאה מחדש של כל הקובץ מההתחלה).
    if (!isFresh(item.published_at)) continue;
    const inserted = insertNewsItem(item);
    if (inserted) {
      bus.emit("new-item", inserted);
      console.log(`[Telegram/${item.source_name}] ${item.title.slice(0, 80)}`);
    }
  }
}

function checkFile() {
  fs.stat(JSONL_PATH, (err, stats) => {
    if (err) {
      // הקובץ עדיין לא נוצר - זה תקין, נחכה שה-listener של טלגרם ייצור אותו
      return;
    }

    if (stats.size < lastSize) {
      // הקובץ קטן מקודם -> כנראה נוצר מחדש, מתחילים מחדש
      lastSize = 0;
    }

    if (stats.size > lastSize) {
      const stream = fs.createReadStream(JSONL_PATH, {
        start: lastSize,
        end: stats.size,
        encoding: "utf-8",
      });
      let buffer = "";
      stream.on("data", (chunk) => (buffer += chunk));
      stream.on("end", () => {
        lastSize = stats.size;
        processNewLines(buffer);
      });
    }
  });
}

export function startTelegramWatcher() {
  console.log("עוקב אחרי קובץ טלגרם:", JSONL_PATH);
  checkFile(); // בדיקה ראשונה מיידית
  setInterval(checkFile, POLL_INTERVAL_MS);
}

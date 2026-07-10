import express from "express";
import cors from "cors";
import { getRecentItems, pruneOldItems } from "./db.js";
import { startRssPolling } from "./rssPoller.js";
import { startTelegramWatcher } from "./telegramTail.js";
import { startMarketPolling, getMarketSnapshot } from "./marketData.js";
import bus from "./eventBus.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// --- REST API ---

// GET /api/news?limit=100&source_type=rss|telegram
app.get("/api/news", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const sourceType = req.query.source_type || null;
  const items = getRecentItems(limit, sourceType);
  res.json(items);
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// GET /api/markets - תמונת מצב נוכחית של נתוני שוק (מדדים, סחורות, אג"ח, מובילות, בורסה, אפיקים)
app.get("/api/markets", (req, res) => {
  res.json(getMarketSnapshot());
});

// --- SSE: עדכונים בזמן אמת ---
// הדפדפן פותח חיבור אחד פתוח, והשרת שולח event בכל פעם שיש כתבה/הודעה חדשה.
app.get("/api/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  const onNewItem = (item) => {
    res.write(`event: new-item\ndata: ${JSON.stringify(item)}\n\n`);
  };
  const onMarketUpdate = (data) => {
    res.write(`event: market-update\ndata: ${JSON.stringify(data)}\n\n`);
  };

  bus.on("new-item", onNewItem);
  bus.on("market-update", onMarketUpdate);

  // heartbeat כדי לשמור את החיבור פתוח דרך פרוקסים
  const heartbeat = setInterval(() => res.write(":heartbeat\n\n"), 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    bus.off("new-item", onNewItem);
    bus.off("market-update", onMarketUpdate);
  });
});

const NEWS_MAX_AGE_HOURS = 12;
const PRUNE_INTERVAL_MS = 30 * 60 * 1000; // בודקים כל 30 דקות, מוחקים כל מה שעבר את גיל 12 השעות

function pruneNews() {
  const deleted = pruneOldItems(NEWS_MAX_AGE_HOURS);
  if (deleted > 0) {
    console.log(`[Cleanup] נמחקו ${deleted} כתבות/הודעות ישנות מ-${NEWS_MAX_AGE_HOURS} שעות`);
  }
}

app.listen(PORT, () => {
  console.log(`השרת רץ על http://localhost:${PORT}`);
  startRssPolling();
  startTelegramWatcher();
  startMarketPolling();
  pruneNews();
  setInterval(pruneNews, PRUNE_INTERVAL_MS);
});

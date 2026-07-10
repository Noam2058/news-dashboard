import Parser from "rss-parser";
import { insertNewsItem, isFresh } from "./db.js";
import bus from "./eventBus.js";

const parser = new Parser();

// ---- מקורות RSS ----
// כתובת גלובס נבדקה ועובדת (מדור "כל הכתבות").
// לכלכליסט לא נמצאה כתובת RSS רשמית פעילה נכון להיום - הפיד כאן מושבת (enabled: false).
// אם תמצא/י כתובת פעילה (בדף https://www.calcalist.co.il/tags/rss או דרך שירות כמו rss.app),
// אפשר להוסיף אותה כאן ולהפעיל.
const RSS_SOURCES = [
  {
    name: "globes",
    label: "גלובס",
    url: "https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=2",
    enabled: true,
  },
  // ל-N12 (מאקו) אין פיד מרוכז אחד - הם מפרסמים feed נפרד לכל קטגוריה,
  // אז מושכים כמה קטגוריות מרכזיות תחת אותו מקור "N12" כדי לקבל תמונה שלמה
  {
    name: "n12",
    label: "N12",
    url: "https://rcs.mako.co.il/rss/news-israel.xml",
    enabled: true,
  },
  {
    name: "n12",
    label: "N12",
    url: "https://rcs.mako.co.il/rss/news-world.xml",
    enabled: true,
  },
  {
    name: "n12",
    label: "N12",
    url: "https://rcs.mako.co.il/rss/news-military.xml",
    enabled: true,
  },
  {
    name: "n12",
    label: "N12",
    url: "https://rcs.mako.co.il/rss/news-law.xml",
    enabled: true,
  },
  {
    name: "n12",
    label: "N12",
    url: "https://rcs.mako.co.il/rss/news-money.xml",
    enabled: true,
  },
  {
    name: "calcalist",
    label: "כלכליסט",
    url: "", // TODO: להשלים כתובת RSS פעילה כשתימצא
    enabled: false,
  },
  {
    name: "ynet",
    label: "Ynet",
    url: "https://www.ynet.co.il/Integration/StoryRss2.xml",
    enabled: true,
  },
];

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 דקות

async function pollSource(source) {
  if (!source.enabled || !source.url) return;

  try {
    const feed = await parser.parseURL(source.url);
    for (const entry of feed.items) {
      const publishedAt = entry.isoDate || entry.pubDate || new Date().toISOString();
      const item = {
        source_type: "rss",
        source_name: source.name,
        title: entry.title || "(ללא כותרת)",
        link: entry.link || "",
        content: entry.contentSnippet || entry.content || "",
        published_at: new Date(publishedAt).toISOString(),
        dedupe_key: `rss:${source.name}:${entry.link || entry.guid || entry.title}`,
      };
      // כתבה שכבר ישנה כשאנחנו רואים אותה לראשונה מדולגת - היא תימחק
      // ב-prune הקרוב בכל מקרה, ואם ניתן לה להיכנס היא רק תוחזר כ"חדשה"
      // בפולינג הבא כל עוד היא נשארת בפיד המקור (ראה pruneOldItems ב-db.js).
      if (!isFresh(item.published_at)) continue;
      const inserted = insertNewsItem(item);
      if (inserted) {
        bus.emit("new-item", inserted);
        console.log(`[RSS/${source.label}] ${item.title}`);
      }
    }
  } catch (err) {
    console.error(`[RSS/${source.label}] שגיאה בשליפת הפיד:`, err.message);
  }
}

export function startRssPolling() {
  const enabledSources = RSS_SOURCES.filter((s) => s.enabled);
  console.log(
    "מתחיל polling ל-RSS עבור:",
    enabledSources.map((s) => s.label).join(", ") || "(אין מקורות פעילים)"
  );

  // שליפה ראשונה מיד עם ההפעלה
  enabledSources.forEach(pollSource);

  // ואז כל POLL_INTERVAL_MS
  setInterval(() => {
    enabledSources.forEach(pollSource);
  }, POLL_INTERVAL_MS);
}

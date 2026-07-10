"""
טלגרם ניוז ליסנר
==================
מאזין לערוצים שהוגדרו ושומר כל הודעה חדשה ל-messages.jsonl
בהרצה הראשונה תתבקש להזין קוד אימות שנשלח לאפליקציית טלגרם שלך.
"""

import json
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from telethon import TelegramClient, events

load_dotenv()

API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
PHONE = os.environ["TELEGRAM_PHONE"]

# ---- כאן מגדירים את הערוצים שרוצים לעקוב אחריהם ----
# אפשר שם משתמש (@channel) או קישור מלא
CHANNELS = [
    "newsisrael",
    "abualiexpress",
    "yediotnews25",
    "News_il_h",
    "Political_arena",
    "firstreportsnews",
    "N12chat",
    "amitsegal",
]

OUTPUT_FILE = "messages.jsonl"
SESSION_NAME = "news_session"  # קובץ session שנוצר אחרי אימות ראשוני

client = TelegramClient(SESSION_NAME, API_ID, API_HASH)


def save_message(channel_name: str, message) -> None:
    record = {
        "channel": channel_name,
        "message_id": message.id,
        "date": message.date.astimezone(timezone.utc).isoformat(),
        "text": message.raw_text or "",
        "received_at": datetime.now(timezone.utc).isoformat(),
    }
    with open(OUTPUT_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    print(f"[{record['channel']}] {record['text'][:80]}")


@client.on(events.NewMessage(chats=CHANNELS))
async def handler(event):
    entity = await event.get_chat()
    channel_name = getattr(entity, "username", None) or getattr(entity, "title", "unknown")
    save_message(channel_name, event.message)


async def main():
    await client.start(phone=PHONE)
    print("מחובר לטלגרם. מאזין לערוצים:", ", ".join(CHANNELS))
    print("לעצירה: Ctrl+C")
    await client.run_until_disconnected()


if __name__ == "__main__":
    with client:
        client.loop.run_until_complete(main())

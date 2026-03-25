---
name: read-imessage
description: Read recent iMessages from specific contacts on macOS. Use when the user wants to read messages, check texts, see iMessage conversations, or query their Messages app data.
---

# Read iMessage

Read messages from the macOS Messages database.

## Prerequisites

- macOS only (iMessage database not available on other platforms)
- **Full Disk Access** must be granted to the terminal/app running the script
  - System Settings → Privacy & Security → Full Disk Access → Enable for Terminal/Cursor

## Quick Start

Read recent messages from a contact:

```bash
python3 .cursor/skills/read-imessage/scripts/read_messages.py --contact "+15551234567" --limit 20
```

Options:
- `--contact`: Phone number (with country code) or email address
- `--limit`: Number of recent messages (default: 10)
- `--days`: Only messages from last N days

## Database Location

The iMessage database is at:
```
~/Library/Messages/chat.db
```

## Direct SQL Queries

For custom queries, connect directly:

```python
import sqlite3
import os

db_path = os.path.expanduser("~/Library/Messages/chat.db")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get recent messages from a specific contact
cursor.execute("""
    SELECT 
        datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as date,
        CASE WHEN m.is_from_me = 1 THEN 'Me' ELSE h.id END as sender,
        m.text
    FROM message m
    LEFT JOIN handle h ON m.handle_id = h.ROWID
    WHERE h.id LIKE ?
    ORDER BY m.date DESC
    LIMIT ?
""", ('%+15551234567%', 20))

for row in cursor.fetchall():
    print(f"[{row[0]}] {row[1]}: {row[2]}")
```

## Key Tables

| Table | Purpose |
|-------|---------|
| `message` | Message content, timestamps, is_from_me flag |
| `handle` | Phone numbers and email addresses |
| `chat` | Conversation threads |
| `chat_message_join` | Links messages to chats |

## Common Issues

**"unable to open database file"**: Full Disk Access not granted. Add your terminal app to the Full Disk Access list.

**Empty results**: Contact identifier format may differ. Try with/without country code, or use email if it's an iCloud contact.

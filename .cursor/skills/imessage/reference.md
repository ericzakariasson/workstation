# iMessage `chat.db` reference

Database path: `~/Library/Messages/chat.db` (requires Full Disk Access to read from most apps).

## Useful tables

| Table | Purpose |
|-------|---------|
| `message` | Message content, timestamps, `is_from_me` |
| `handle` | Phone numbers and email addresses |
| `chat` | Conversation threads |
| `chat_message_join` | Links messages to chats |
| `chat_handle_join` | Links chats to handles |

## Example: recent messages for a handle

```python
import sqlite3
import os

db_path = os.path.expanduser("~/Library/Messages/chat.db")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

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

## Common errors

**unable to open database file**: Grant Full Disk Access to Terminal/Cursor (or run from a context that already has it).

**Empty results**: Handle format may differ; try with/without country code, or match by email.

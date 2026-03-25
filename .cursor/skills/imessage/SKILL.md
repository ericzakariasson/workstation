---
name: imessage
description: Looks up macOS Contacts, reads the local Messages database, and sends iMessages via Messages.app using small Python scripts. Use when the user wants to find a contact, read or search iMessages and chat.db, list recent handles, text someone by name or phone, send an iMessage from the terminal, or automate Messages on macOS.
---

# iMessage (macOS)

One skill, **three scripts** (from the workstation repo root, or a symlinked `imessage` folder under `~/.cursor/skills/`):

| Script | Purpose |
|--------|---------|
| `scripts/get_contacts.py` | Search **Contacts** by name; optional `--recent-handles` from `chat.db` |
| `scripts/read_messages.py` | Read recent messages for a **phone/email** handle; `--list-contacts` |
| `scripts/send_message.py` | **Send** a message by **name** (Contacts + optional chat title) or **handle** |

Base path in examples: `.cursor/skills/imessage/` (change if your clone lives elsewhere).

## Prerequisites

- **macOS only**
- **Automation**: Allow **Contacts** and **Messages** for Terminal/Cursor when prompted.
- **Full Disk Access**: Required for anything that reads `~/Library/Messages/chat.db` (`read_messages.py`, `get_contacts.py --recent-handles`, and `send_message.py` chat.db name fallback).

## `get_contacts.py`

```bash
python3 .cursor/skills/imessage/scripts/get_contacts.py "Name Fragment"
python3 .cursor/skills/imessage/scripts/get_contacts.py --json "Alex"
python3 .cursor/skills/imessage/scripts/get_contacts.py --recent-handles 30
```

## `read_messages.py`

Requires **phone** or **email** (use `get_contacts.py` first if you only have a person’s name).

```bash
python3 .cursor/skills/imessage/scripts/read_messages.py --contact "+15551234567" --limit 20
python3 .cursor/skills/imessage/scripts/read_messages.py --list-contacts
```

Options: `--contact` / `-c`, `--limit` / `-l`, `--days` / `-d`.

## `send_message.py`

```bash
python3 .cursor/skills/imessage/scripts/send_message.py "Alex Kim" "Running 10 min late"
python3 .cursor/skills/imessage/scripts/send_message.py "+15551234567" "Link: https://example.com"
python3 .cursor/skills/imessage/scripts/send_message.py --dry-run "Mom" "ignored"
python3 .cursor/skills/imessage/scripts/send_message.py --resolve-chat-db-first "Book Club" "7pm"
```

**Resolution order:** If the first argument looks like email or phone (10+ digits), it is used as-is. Otherwise **Contacts** match (`name contains`) uses first phone then first email; if that fails, **chat.db** `display_name` match (when readable). Multiple Contacts matches → list and exit without sending.

SMS-only / non‑iMessage buddies may fail when the **iMessage** service cannot reach that address.

## Agent notes

1. Use **`get_contacts.py`** to turn a **name** into numbers/emails before **`read_messages.py`**.
2. **`send_message.py`** can resolve names alone; use **`get_contacts.py`** when the user needs full phone/email lists or disambiguation.
3. Shell-escape messages with quotes; use `$'line\\nline'` or a heredoc for multiline bodies.

## Extra reference

- SQL and table overview: [reference.md](reference.md)

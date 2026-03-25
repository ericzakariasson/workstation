---
name: imessage
description: Looks up macOS Contacts for messaging, sends iMessages, and reads recent threads. Use when the user wants to find a contact's phone or email, text someone by name, read iMessages, list recent chat handles, or automate Messages from the terminal on macOS.
---

# iMessage (macOS)

Workflows for **Contacts lookup**, **sending** messages, and **reading** the local Messages database. Scripts live under `.cursor/skills/` in the **workstation** repo; run examples from the repository root, or symlink those folders into `~/.cursor/skills/` (see the repo `README.md`).

## Prerequisites

- **macOS only**
- **Automation**: Terminal or Cursor needs permission to control **Contacts** and **Messages** where applicable (System Settings → Privacy & Security → Automation).
- **Full Disk Access**: Required for any script that reads `~/Library/Messages/chat.db` (`read_messages.py`, `send_message.py` chat.db fallback, `get_contacts.py --recent-handles`).

## Lookup: Contacts search

Search cards whose **name contains** the query (case rules follow Contacts / AppleScript). Prints every **phone** and **email** on each card.

```bash
python3 .cursor/skills/imessage/scripts/get_contacts.py "Pontus Abrahamson"
```

JSON:

```bash
python3 .cursor/skills/imessage/scripts/get_contacts.py --json "Pontus"
```

Recent **handles** (phone/email strings) seen in Messages, newest activity first:

```bash
python3 .cursor/skills/imessage/scripts/get_contacts.py --recent-handles 30
```

## Send

```bash
python3 .cursor/skills/send-imessage/scripts/send_message.py "Contact Name" "Message text"
```

See [send-imessage](../send-imessage/SKILL.md) for handles, `--dry-run`, and chat.db display-name fallback.

## Read

```bash
python3 .cursor/skills/read-imessage/scripts/read_messages.py --contact "+15551234567" --limit 20
```

See [read-imessage](../read-imessage/SKILL.md) for schema notes and SQL examples.

## Agent notes

1. Prefer **get_contacts.py** to resolve a **person** to numbers/emails before read/send when the user gives a name.
2. **Send** may still resolve names internally; use **get_contacts** when the user needs to see all numbers/emails or disambiguate.
3. If Contacts returns nothing, try **--recent-handles** or a **phone/email** the user provides.

---
name: send-imessage
description: Resolves a macOS Contacts name or Messages chat display name to a phone number or email and sends a message via the Messages app (iMessage). Use when the user wants to text someone, send an iMessage, SMS from Mac, message a person by name, or tell a contact something from the terminal.
---

# Send iMessage

Send a message through the macOS **Messages** app using a **contact name** (from the Contacts app or a prior conversation title in the local Messages database) or a direct **phone / email** handle.

## Prerequisites (macOS only)

- **Contacts**: Name-based lookup uses the Contacts app — grant **Automation** permission when prompted (the terminal or Cursor controlling Contacts).
- **Messages**: Sending uses AppleScript against Messages — allow **Automation** for **Messages** (System Settings → Privacy & Security → Automation, or the prompt on first run).
- **chat.db fallback** (optional): Resolving by conversation `display_name` reads `~/Library/Messages/chat.db`. Grant **Full Disk Access** to the app running the script if you use that path (same as [read-imessage](../read-imessage/SKILL.md)).

Green bubble (SMS-only) recipients may not work if their address is not reachable via the **iMessage** service; use a phone number that Messages can send from this Mac.

## Quick start

```bash
python3 .cursor/skills/send-imessage/scripts/send_message.py "Alex Kim" "Running 10 min late"
```

Direct handle (skips name resolution):

```bash
python3 .cursor/skills/send-imessage/scripts/send_message.py "+15551234567" "Here is the link: https://example.com"
```

Preview resolved address:

```bash
python3 .cursor/skills/send-imessage/scripts/send_message.py --dry-run "Mom" "ignored"
```

Prefer matching a **thread title** in Messages before Contacts:

```bash
python3 .cursor/skills/send-imessage/scripts/send_message.py --resolve-chat-db-first "Book Club" "Meetup moved to 7pm"
```

## How name resolution works

1. If `contact` looks like an **email** or **phone** (10+ digits), it is used as the Messages **buddy** id as-is.
2. By default, **Contacts** is searched for cards whose **name contains** the string (case-sensitive in AppleScript). **First phone** on the card is used, else **first email**.
3. If Contacts yields **no** or **ambiguous** matches, **chat.db** is queried for chats with a non-empty **display_name** matching the fragment (then ordered by `last_read_message_timestamp` when that column exists).
4. **Multiple** Contacts matches: the script lists candidates and exits without sending — narrow the name or pass a phone/email.

## Agent workflow

1. Confirm the user is on **macOS** and wants the message sent from their **Messages** account on this machine.
2. Run the script with the **contact** and **message** strings; escape only what the shell needs (wrap arguments in single quotes if they contain spaces or `!`).
3. If resolution fails or Automation is denied, report the stderr message and point to **Automation** + **Full Disk Access** as above.
4. To **read** threads, use [read-imessage](../read-imessage/SKILL.md).

## Common issues

**Automation denied**: Approve Cursor/Terminal for **Contacts** and **Messages** (Automation).

**Multiple matches**: Use a clearer substring of the display name, or use `+countryCodeNumber` / email.

**Send failed / buddy errors**: Number or email may not be registered for iMessage, or the handle string may need a leading `+` and country code.

**chat.db errors**: Grant **Full Disk Access** to the runner; without it, name resolution falls back to Contacts and direct handles only.

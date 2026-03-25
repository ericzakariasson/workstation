#!/usr/bin/env python3
"""Send an iMessage by contact name (Contacts or chat display name) or by phone/email."""

from __future__ import annotations

import argparse
import os
import re
import sqlite3
import subprocess
import sys


def apple_string_literal(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def run_osascript(source: str) -> str:
    r = subprocess.run(
        ["osascript", "-e", source],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        err = (r.stderr or r.stdout or "").strip()
        raise RuntimeError(err or "osascript failed")
    return (r.stdout or "").strip()


def looks_like_handle(contact: str) -> bool:
    t = contact.strip()
    if "@" in t:
        return True
    digits = re.sub(r"\D", "", t)
    return len(digits) >= 10


def resolve_from_chat_db(display_fragment: str) -> list[str]:
    db_path = os.path.expanduser("~/Library/Messages/chat.db")
    if not os.path.exists(db_path):
        return []
    needle = f"%{display_fragment.strip()}%"
    # Prefer recently active chats when ordering column exists
    queries = [
        """
        SELECT DISTINCT h.id
        FROM chat c
        JOIN chat_handle_join chj ON chj.chat_id = c.ROWID
        JOIN handle h ON h.ROWID = chj.handle_id
        WHERE c.display_name IS NOT NULL AND TRIM(c.display_name) != ''
          AND LOWER(c.display_name) LIKE LOWER(?)
        ORDER BY c.last_read_message_timestamp DESC
        """,
        """
        SELECT DISTINCT h.id
        FROM chat c
        JOIN chat_handle_join chj ON chj.chat_id = c.ROWID
        JOIN handle h ON h.ROWID = chj.handle_id
        WHERE c.display_name IS NOT NULL AND TRIM(c.display_name) != ''
          AND LOWER(c.display_name) LIKE LOWER(?)
        """,
    ]
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    except sqlite3.Error:
        return []
    try:
        for q in queries:
            try:
                cur = conn.cursor()
                cur.execute(q, (needle,))
                rows = [row[0] for row in cur.fetchall() if row[0]]
                if rows:
                    return rows
            except sqlite3.OperationalError:
                continue
    finally:
        conn.close()
    return []


def find_in_contacts(name_fragment: str) -> list[tuple[str, str]]:
    """Return (contact_card_name, phone_or_email) for matches."""
    esc = apple_string_literal(name_fragment.strip())
    script = f'''
    tell application "Contacts"
        set foundList to people whose name contains "{esc}"
        set outLines to {{}}
        repeat with p in foundList
            set cardName to name of p as string
            set addr to ""
            try
                if (count of (phones of p)) > 0 then
                    repeat with ph in phones of p
                        set addr to value of ph
                        exit repeat
                    end repeat
                end if
            end try
            if addr is "" then
                try
                    if (count of (emails of p)) > 0 then
                        repeat with em in emails of p
                            set addr to value of em
                            exit repeat
                        end repeat
                    end if
                end try
            end if
            if addr is not "" then
                set end of outLines to cardName & tab & addr
            end if
        end repeat
    end tell
    set AppleScript's text item delimiters to linefeed
    outLines as text
    '''
    raw = run_osascript(script)
    out: list[tuple[str, str]] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or "\t" not in line:
            continue
        n, sep, h = line.partition("\t")
        if h:
            out.append((n.strip(), h.strip()))
    return out


def send_imessage(handle: str, message: str) -> None:
    h = apple_string_literal(handle.strip())
    m = apple_string_literal(message)
    script = f'''
    tell application "Messages"
        set targetService to 1st service whose service type = iMessage
        set targetBuddy to buddy "{h}" of targetService
        send "{m}" to targetBuddy
    end tell
    '''
    run_osascript(script)


def _unique_preserve(items: list[str]) -> list[str]:
    out: list[str] = []
    for x in items:
        if x not in out:
            out.append(x)
    return out


def _pick_contacts_matches(raw: str, from_contacts: list[tuple[str, str]]) -> str:
    if len(from_contacts) == 1:
        return from_contacts[0][1]
    if len(from_contacts) > 1:
        lines = "\n".join(f"  - {n}: {h}" for n, h in from_contacts)
        print(
            f"Multiple Contacts matches for {raw!r}. Narrow the name or use phone/email:\n{lines}",
            file=sys.stderr,
        )
        sys.exit(2)
    assert False, "expected non-empty from_contacts"


def _pick_db_matches(raw: str, from_db: list[str]) -> str:
    uniq = _unique_preserve(from_db)
    if len(uniq) == 1:
        return uniq[0]
    if len(uniq) > 1:
        lines = "\n".join(f"  - {x}" for x in uniq[:15])
        more = f"\n  ... ({len(uniq)} total)" if len(uniq) > 15 else ""
        print(
            f"Multiple chat.db handles for display name {raw!r}. Use a phone/email or a unique name:\n{lines}{more}",
            file=sys.stderr,
        )
        sys.exit(2)
    assert False, "expected non-empty from_db"


def resolve_handle(contact_arg: str, prefer_contacts_first: bool) -> str:
    raw = contact_arg.strip()
    if looks_like_handle(raw):
        return raw.strip()

    from_contacts = find_in_contacts(raw)
    from_db = resolve_from_chat_db(raw)

    if prefer_contacts_first:
        if from_contacts:
            return _pick_contacts_matches(raw, from_contacts)
        if from_db:
            return _pick_db_matches(raw, from_db)
    else:
        if from_db:
            return _pick_db_matches(raw, from_db)
        if from_contacts:
            return _pick_contacts_matches(raw, from_contacts)

    print(
        f"No iMessage handle found for {raw!r}. Try phone/email, check Contacts spelling, "
        "or ensure you've messaged them (for display-name fallback).",
        file=sys.stderr,
    )
    sys.exit(2)


def main() -> None:
    p = argparse.ArgumentParser(description="Send an iMessage by contact name or handle")
    p.add_argument("contact", help="Contact name, phone (+country…), or email")
    p.add_argument("message", help="Message body to send")
    p.add_argument(
        "--resolve-chat-db-first",
        action="store_true",
        help="Prefer matching Messages chat display_name before Contacts (default: Contacts first)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print resolved phone/email only; do not send",
    )
    args = p.parse_args()

    handle = resolve_handle(args.contact, prefer_contacts_first=not args.resolve_chat_db_first)
    if args.dry_run:
        print(handle)
        return
    try:
        send_imessage(handle, args.message)
    except RuntimeError as e:
        print(f"Failed to send (Automation/ Messages setup, or not reachable via iMessage): {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

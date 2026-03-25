#!/usr/bin/env python3
"""Search macOS Contacts by name (or list recent iMessage handles)."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
from dataclasses import asdict, dataclass


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


@dataclass
class PhoneRow:
    value: str
    label: str


@dataclass
class EmailRow:
    value: str
    label: str


@dataclass
class ContactCard:
    name: str
    phones: list[PhoneRow]
    emails: list[EmailRow]


def fetch_contacts_matching(query: str) -> list[ContactCard]:
    esc = apple_string_literal(query.strip())
    script = f'''
    tell application "Contacts"
        set foundList to people whose name contains "{esc}"
        set outText to ""
        repeat with p in foundList
            set cardName to name of p as string
            set outText to outText & "CARD" & tab & cardName & linefeed
            try
                repeat with ph in phones of p
                    set lab to ""
                    try
                        set lab to label of ph as string
                    end try
                    set outText to outText & "PHONE" & tab & (value of ph) & tab & lab & linefeed
                end repeat
            end try
            try
                repeat with em in emails of p
                    set lab to ""
                    try
                        set lab to label of em as string
                    end try
                    set outText to outText & "EMAIL" & tab & (value of em) & tab & lab & linefeed
                end repeat
            end try
        end repeat
    end tell
    return outText
    '''
    raw = run_osascript(script)
    cards: list[ContactCard] = []
    current: ContactCard | None = None
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("\t", 2)
        kind = parts[0] if parts else ""
        if kind == "CARD" and len(parts) >= 2:
            current = ContactCard(name=parts[1], phones=[], emails=[])
            cards.append(current)
        elif kind == "PHONE" and current and len(parts) >= 2:
            val = parts[1]
            lab = parts[2] if len(parts) > 2 else ""
            current.phones.append(PhoneRow(value=val, label=lab))
        elif kind == "EMAIL" and current and len(parts) >= 2:
            val = parts[1]
            lab = parts[2] if len(parts) > 2 else ""
            current.emails.append(EmailRow(value=val, label=lab))
    return cards


def recent_imessage_handles(limit: int) -> list[str]:
    db_path = os.path.expanduser("~/Library/Messages/chat.db")
    if not os.path.exists(db_path):
        return []
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    except sqlite3.Error:
        return []
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT DISTINCT h.id, MAX(m.date) AS last_dt
            FROM handle h
            JOIN message m ON m.handle_id = h.ROWID
            GROUP BY h.id
            ORDER BY last_dt DESC
            LIMIT ?
            """,
            (limit,),
        )
        return [row[0] for row in cur.fetchall() if row[0]]
    except sqlite3.OperationalError:
        return []
    finally:
        conn.close()


def print_human(cards: list[ContactCard]) -> None:
    if not cards:
        print("No Contacts matches.")
        return
    for c in cards:
        print(c.name)
        for ph in c.phones:
            suffix = f" ({ph.label})" if ph.label else ""
            print(f"  phone{suffix}: {ph.value}")
        for em in c.emails:
            suffix = f" ({em.label})" if em.label else ""
            print(f"  email{suffix}: {em.value}")
        print()


def cards_to_json_serializable(cards: list[ContactCard]) -> list[dict]:
    out: list[dict] = []
    for c in cards:
        d = asdict(c)
        out.append(d)
    return out


def main() -> None:
    p = argparse.ArgumentParser(
        description="Search macOS Contacts by name substring, or list recent iMessage handles"
    )
    p.add_argument(
        "query",
        nargs="?",
        help='Name substring to search (Contacts "name contains" match)',
    )
    p.add_argument(
        "--recent-handles",
        type=int,
        metavar="N",
        help="List N most recently used iMessage handles from chat.db (needs Full Disk Access)",
    )
    p.add_argument("--json", action="store_true", help="Print JSON instead of human text")
    args = p.parse_args()

    if args.recent_handles is not None:
        handles = recent_imessage_handles(max(1, args.recent_handles))
        if args.json:
            print(json.dumps(handles, indent=2))
        else:
            if not handles:
                print("No handles (grant Full Disk Access or no messages).")
            else:
                for h in handles:
                    print(h)
        return

    if not args.query:
        p.error("provide a name query or use --recent-handles N")

    try:
        cards = fetch_contacts_matching(args.query)
    except RuntimeError as e:
        print(f"Contacts error (allow Automation for Contacts): {e}", file=sys.stderr)
        sys.exit(1)

    if args.json:
        print(json.dumps(cards_to_json_serializable(cards), indent=2))
    else:
        print_human(cards)


if __name__ == "__main__":
    main()

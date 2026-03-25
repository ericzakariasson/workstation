#!/usr/bin/env python3
"""Read recent iMessages from a specific contact."""

import argparse
import sqlite3
import os
from datetime import datetime, timedelta


def get_messages(contact: str, limit: int = 10, days: int | None = None) -> list[dict]:
    """
    Fetch recent messages from a contact.

    Args:
        contact: Phone number (e.g., +15551234567) or email address
        limit: Maximum number of messages to return
        days: Only return messages from the last N days

    Returns:
        List of message dicts with date, sender, and text
    """
    db_path = os.path.expanduser("~/Library/Messages/chat.db")

    if not os.path.exists(db_path):
        raise FileNotFoundError(
            "iMessage database not found. This script only works on macOS."
        )

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Build query with optional date filter
    query = """
        SELECT 
            datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as date,
            CASE WHEN m.is_from_me = 1 THEN 'Me' ELSE h.id END as sender,
            m.text,
            m.is_from_me
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE h.id LIKE ?
    """
    params = [f'%{contact}%']

    if days:
        # Calculate cutoff timestamp (macOS uses nanoseconds since 2001-01-01)
        cutoff = datetime.now() - timedelta(days=days)
        mac_epoch = datetime(2001, 1, 1)
        cutoff_ns = int((cutoff - mac_epoch).total_seconds() * 1_000_000_000)
        query += " AND m.date >= ?"
        params.append(cutoff_ns)

    query += " ORDER BY m.date DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)

    messages = []
    for row in cursor.fetchall():
        messages.append({
            'date': row[0],
            'sender': row[1],
            'text': row[2],
            'is_from_me': bool(row[3])
        })

    conn.close()

    # Return in chronological order
    return list(reversed(messages))


def list_contacts(limit: int = 20) -> list[str]:
    """List contacts with recent messages."""
    db_path = os.path.expanduser("~/Library/Messages/chat.db")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT DISTINCT h.id, MAX(m.date) as last_msg
        FROM handle h
        JOIN message m ON m.handle_id = h.ROWID
        GROUP BY h.id
        ORDER BY last_msg DESC
        LIMIT ?
    """, (limit,))

    contacts = [row[0] for row in cursor.fetchall()]
    conn.close()
    return contacts


def main():
    parser = argparse.ArgumentParser(description="Read iMessages from a contact")
    parser.add_argument("--contact", "-c", help="Phone number or email address")
    parser.add_argument("--limit", "-l", type=int, default=10, help="Number of messages")
    parser.add_argument("--days", "-d", type=int, help="Only messages from last N days")
    parser.add_argument("--list-contacts", action="store_true", help="List recent contacts")

    args = parser.parse_args()

    if args.list_contacts:
        print("Recent contacts:")
        for contact in list_contacts():
            print(f"  {contact}")
        return

    if not args.contact:
        parser.error("--contact is required (or use --list-contacts)")

    try:
        messages = get_messages(args.contact, args.limit, args.days)

        if not messages:
            print(f"No messages found for contact: {args.contact}")
            return

        for msg in messages:
            direction = "→" if msg['is_from_me'] else "←"
            text = msg['text'] or "[attachment]"
            print(f"[{msg['date']}] {direction} {text}")

    except sqlite3.OperationalError as e:
        if "unable to open database" in str(e):
            print("Error: Cannot access iMessage database.")
            print("Grant Full Disk Access to your terminal app:")
            print("  System Settings → Privacy & Security → Full Disk Access")
        else:
            raise


if __name__ == "__main__":
    main()

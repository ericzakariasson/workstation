# Agents

## Cursor Cloud specific instructions

### Overview

This is a **macOS-only** personal workstation repo containing a single Cursor agent skill (`imessage`) with three Python 3 scripts under `.cursor/skills/imessage/scripts/`. The scripts use only Python stdlib — there are no external dependencies and no `requirements.txt`.

### Key constraints on Cloud (Linux) VMs

- **All three scripts depend on macOS APIs** (AppleScript via `osascript`, Contacts.app, Messages.app, `~/Library/Messages/chat.db`). They **cannot run end-to-end on Linux**.
- On Linux you can still:
  - **Syntax-check**: `python3 -m py_compile <script>`
  - **Lint**: `python3 -m pyflakes <script>` (install once with `pip3 install pyflakes`)
  - **Test CLI parsing**: `python3 <script> --help`
  - `get_contacts.py --recent-handles N` exits gracefully (no `chat.db`).
  - `read_messages.py` raises `FileNotFoundError` with a clear message.
  - `send_message.py --dry-run` attempts AppleScript and fails with `RuntimeError`.

### Running scripts (macOS only)

See `README.md` and `.cursor/skills/imessage/SKILL.md` for full usage. All commands run from the repo root:

```bash
python3 .cursor/skills/imessage/scripts/get_contacts.py "Name"
python3 .cursor/skills/imessage/scripts/read_messages.py --contact "+15551234567"
python3 .cursor/skills/imessage/scripts/send_message.py --dry-run "Name" "msg"
```

### Linting

```bash
python3 -m pyflakes .cursor/skills/imessage/scripts/*.py
```

# Workstation

Personal macOS setup and **Cursor agent skills** for iMessage / Contacts automation.

## Cursor skills (iMessage)

Skills live in `.cursor/skills/`. Cursor loads **project** skills from this directory when this repo is the workspace, and **personal** skills from `~/.cursor/skills/`.

To use the same skills in every project via your home directory:

```bash
cd /path/to/workstation   # this repository
mkdir -p ~/.cursor/skills
for d in imessage read-imessage send-imessage; do
  ln -sf "$PWD/.cursor/skills/$d" "$HOME/.cursor/skills/$d"
done
```

From the **repository root**, you can also run scripts directly:

```bash
python3 .cursor/skills/imessage/scripts/get_contacts.py "Name"
```

See each skill’s `SKILL.md` for permissions (Automation, Full Disk Access) and usage.

## Contents

| Skill | Role |
|-------|------|
| [imessage](.cursor/skills/imessage/SKILL.md) | Lookup Contacts, link to read/send |
| [send-imessage](.cursor/skills/send-imessage/SKILL.md) | Send messages via Messages.app |
| [read-imessage](.cursor/skills/read-imessage/SKILL.md) | Read `chat.db` from disk |

No secrets or account data belong in this repository—only scripts and documentation.

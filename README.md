# Workstation

Personal macOS setup, a **single Cursor agent skill** for iMessage / Contacts (`imessage`), and **Glass**, an Electron agent-orchestration app powered by the Cursor SDK.

## Glass

[glass/](glass/) is a Codex-style desktop cockpit for running Cursor agents (local and cloud) in parallel. See [glass/README.md](glass/README.md).

```bash
cd glass && npm install && npm run dev
```

## Cursor skill

Skills live under `.cursor/skills/`. With this repo as the workspace, Cursor loads **imessage** automatically. To use it from any project, symlink into your personal skills folder:

```bash
cd /path/to/workstation   # this repository
mkdir -p ~/.cursor/skills
ln -sf "$PWD/.cursor/skills/imessage" "$HOME/.cursor/skills/imessage"
```

Remove stale symlinks if you had the old split skills:

```bash
rm -f ~/.cursor/skills/read-imessage ~/.cursor/skills/send-imessage
```

From the **repository root**:

```bash
python3 .cursor/skills/imessage/scripts/get_contacts.py "Name"
```

See [.cursor/skills/imessage/SKILL.md](.cursor/skills/imessage/SKILL.md) for all scripts, permissions, and usage.

## Contents

| Path | Role |
|------|------|
| [glass/](glass/) | Electron agent-orchestration app (Cursor SDK) |
| [.cursor/skills/imessage/](.cursor/skills/imessage/) | **SKILL.md**, `reference.md`, `scripts/*.py` |

No secrets or account data belong in this repository—only scripts and documentation.

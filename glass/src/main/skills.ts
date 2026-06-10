import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SkillInfo } from "@shared/types";

/**
 * Scans Cursor skill folders (`.cursor/skills/<name>/SKILL.md`). Local agents
 * load these automatically because Glass passes settingSources project+user.
 */
export function listSkills(cwd?: string): SkillInfo[] {
  const skills: SkillInfo[] = [];
  if (cwd) collect(join(cwd, ".cursor", "skills"), "project", skills);
  collect(join(homedir(), ".cursor", "skills"), "user", skills);
  return skills;
}

function collect(dir: string, source: SkillInfo["source"], out: SkillInfo[]): void {
  try {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const skillFile = join(dir, entry.name, "SKILL.md");
      if (!existsSync(skillFile)) continue;
      if (out.some((skill) => skill.name === entry.name)) continue;
      out.push({
        name: entry.name,
        description: readDescription(skillFile),
        source,
      });
    }
  } catch {
    // unreadable dir; skip
  }
}

function readDescription(skillFile: string): string | undefined {
  try {
    const text = readFileSync(skillFile, "utf8").slice(0, 4000);
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatter) {
      const line = frontmatter[1].match(/^description:\s*(.+)$/m);
      if (line) return line[1].trim().replace(/^["']|["']$/g, "").slice(0, 200);
    }
    const firstParagraph = text
      .replace(/^---\n[\s\S]*?\n---/, "")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#"));
    return firstParagraph?.slice(0, 200);
  } catch {
    return undefined;
  }
}

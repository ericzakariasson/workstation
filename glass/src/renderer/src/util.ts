export function timeAgo(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function formatDuration(ms?: number): string | null {
  if (!ms || ms <= 0) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

const TOOL_LABELS: Record<string, string> = {
  shell: "Shell",
  bash: "Shell",
  read: "Read file",
  read_file: "Read file",
  write: "Write file",
  edit: "Edit file",
  str_replace: "Edit file",
  ls: "List files",
  glob: "Find files",
  grep: "Search",
  semSearch: "Semantic search",
  sem_search: "Semantic search",
  delete: "Delete file",
  task: "Subagent",
  mcp: "MCP",
  web: "Web",
  fetch: "Fetch",
};

export function toolLabel(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  const cleaned = name.replace(/[_-]+/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export type ToolIconKind = "terminal" | "file" | "edit" | "search" | "spark" | "globe" | "wrench";

export function toolIcon(name: string): ToolIconKind {
  const n = name.toLowerCase();
  if (/shell|bash|terminal|exec/.test(n)) return "terminal";
  if (/read|ls|cat|list/.test(n)) return "file";
  if (/write|edit|replace|delete|apply/.test(n)) return "edit";
  if (/grep|glob|search|find/.test(n)) return "search";
  if (/task|agent/.test(n)) return "spark";
  if (/web|fetch|http|browser/.test(n)) return "globe";
  return "wrench";
}

/** Pulls a human-readable one-liner out of an unstable tool args payload. */
export function toolSubtitle(args?: string): string | null {
  if (!args) return null;
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>;
    for (const key of ["command", "path", "file_path", "pattern", "query", "url", "name"]) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) {
        return value.length > 80 ? `${value.slice(0, 80)}…` : value;
      }
    }
  } catch {
    const line = args.split("\n")[0];
    if (line.trim()) return line.length > 80 ? `${line.slice(0, 80)}…` : line;
  }
  return null;
}

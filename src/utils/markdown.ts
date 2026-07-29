function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function trimMatchGroup(match: RegExpMatchArray | null, group: number): string | null {
  if (!match) return null;
  const value = match[group];
  return value ? value.trim() : null;
}

export function extractSection(mdText: string, header: string): string | null {
  const escaped = escapeRegex(header);
  const pattern = new RegExp(`${escaped}\\n([\\s\\S]*?)(?=\\n###|$)`, 'i');
  return trimMatchGroup(mdText.match(pattern), 1);
}

export function extractTitle(mdText: string): string {
  const match = mdText.match(/###\s*🎯\s*今日灵感内核\n(.*)/);
  return trimMatchGroup(match, 1) ?? '未命名想法';
}

export function extractMilestone(mdText: string): string | null {
  return extractSection(mdText, '### 🚀 20分钟强制里程碑 (Milestone)');
}

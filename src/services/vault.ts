import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { config } from '../config/env.js';

const FALLBACK_SAFE_TITLE = 'untitled-idea';

function buildSafeTitle(title: string): string {
  const safeTitle = title
    .replace(/[^\w\u4e00-\u9fa5 -]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);

  if (safeTitle.length > 0) return safeTitle;
  return FALLBACK_SAFE_TITLE;
}

function buildTimestamp(now: Date): string {
  const [, timePart = '000000.000Z'] = now.toISOString().split('T');
  return timePart.replace(/[:.]/g, '').replace('Z', '').slice(0, 9);
}

export function buildVaultFilename(title: string, now: Date = new Date()): string {
  const date = now.toISOString().split('T')[0];
  const timestamp = buildTimestamp(now);
  const safeTitle = buildSafeTitle(title);
  return `${date}-${timestamp}-${safeTitle}.md`;
}

function buildFrontMatter(title: string): string {
  const now = new Date().toISOString();
  const escapedTitle = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  return `---\ntitle: "${escapedTitle}"\ndate: ${now}\ntags: [idea, adhd-healing]\n---\n`;
}

function buildFileContent(title: string, finalMarkdown: string, rawText: string): string {
  const frontMatter = buildFrontMatter(title);
  return `${frontMatter}\n${finalMarkdown}\n\n---\n\n## 原始意识流记录\n\n${rawText}`;
}

export async function saveToLocalVault(
  title: string,
  finalMarkdown: string,
  rawText: string
): Promise<string> {
  await mkdir(config.brainVaultPath, { recursive: true });
  const filename = buildVaultFilename(title);
  const filePath = join(config.brainVaultPath, filename);
  const content = buildFileContent(title, finalMarkdown, rawText);
  await writeFile(filePath, content, 'utf-8');
  console.log(`[vault] Saved: ${filePath}`);
  return filePath;
}

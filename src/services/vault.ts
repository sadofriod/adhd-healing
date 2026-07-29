import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { config } from '../config/env.js';

function buildSafeTitle(title: string): string {
  return title
    .replace(/[^\w\u4e00-\u9fa5 -]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

function buildFilename(title: string): string {
  const date = new Date().toISOString().split('T')[0];
  const safeTitle = buildSafeTitle(title);
  return `${date}-${safeTitle}.md`;
}

function buildFrontMatter(title: string): string {
  const now = new Date().toISOString();
  return `---\ntitle: "${title}"\ndate: ${now}\ntags: [idea, adhd-healing]\n---\n`;
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
  const filename = buildFilename(title);
  const filePath = join(config.brainVaultPath, filename);
  const content = buildFileContent(title, finalMarkdown, rawText);
  await writeFile(filePath, content, 'utf-8');
  console.log(`[vault] Saved: ${filePath}`);
  return filePath;
}

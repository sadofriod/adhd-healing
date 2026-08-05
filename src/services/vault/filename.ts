import { join } from 'path';
import type { ArchiveClassification } from '../../types';
import {
  DEFAULT_SUBCATEGORY,
  FALLBACK_SAFE_TITLE,
  UNCATEGORIZED_CATEGORY,
} from './common';

const LOCAL_ARCHIVE_DIRNAME = '.local-vault';
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

export function buildSafeTitle(title: string): string {
  const safeTitle = title
    .replace(/[^\w\u4e00-\u9fa5 -]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);

  if (safeTitle.length > 0) return safeTitle;
  return FALLBACK_SAFE_TITLE;
}

export function buildAlphaSuffix(now: Date, length: number): string {
  let value = Math.max(now.getTime(), 0);
  let suffix = '';

  for (let index = 0; index < length; index += 1) {
    suffix = `${ALPHABET[value % ALPHABET.length]}${suffix}`;
    value = Math.floor(value / ALPHABET.length);
  }

  return suffix;
}

export function sanitizeArchiveSegment(value: string, fallback: string): string {
  const segment = buildSafeTitle(value).toLowerCase();
  if (segment.length > 0) return segment;
  return fallback;
}

export function toPortablePath(path: string): string {
  return path.replace(/\\/g, '/');
}

export function buildVaultFilename(title: string, now: Date = new Date()): string {
  const safeTitle = buildSafeTitle(title);
  return `${safeTitle}-${buildAlphaSuffix(now, 8)}.md`;
}

export function buildArtifactDirectoryName(title: string, now: Date = new Date()): string {
  return `${buildSafeTitle(title)}-${buildAlphaSuffix(now, 6)}`;
}

export function getLocalArchiveRoot(): string {
  return join(process.cwd(), LOCAL_ARCHIVE_DIRNAME);
}

export function buildArchiveRelativePath(
  classification: ArchiveClassification,
  filename: string
): string {
  const category = sanitizeArchiveSegment(classification.category, UNCATEGORIZED_CATEGORY);
  const subcategory = sanitizeArchiveSegment(classification.subcategory, DEFAULT_SUBCATEGORY);
  return toPortablePath(join(category, subcategory, filename));
}

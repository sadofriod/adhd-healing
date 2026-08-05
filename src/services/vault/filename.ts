import { join } from 'path';
import type { ArchiveClassification } from '../../types';
import {
  DEFAULT_SUBCATEGORY,
  FALLBACK_SAFE_TITLE,
  UNCATEGORIZED_CATEGORY,
} from './common';

const LOCAL_ARCHIVE_DIRNAME = '.local-vault';

export function buildSafeTitle(title: string): string {
  const safeTitle = title
    .replace(/[^\w\u4e00-\u9fa5 -]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);

  if (safeTitle.length > 0) return safeTitle;
  return FALLBACK_SAFE_TITLE;
}

export function buildTimestamp(now: Date): string {
  const [, timePart = '000000.000Z'] = now.toISOString().split('T');
  return timePart.replace(/[:.]/g, '').replace('Z', '').slice(0, 9);
}

function buildCompactArtifactDirectorySuffix(now: Date): string {
  const iso = now.toISOString();
  const [datePart = '1970-01-01', timePart = '00:00:00.000Z'] = iso.split('T');
  const compactDate = datePart.replace(/-/g, '');
  const compactTime = timePart.replace(/[:.]/g, '').replace('Z', '').slice(0, 6);
  return `${compactDate}-${compactTime}`;
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
  const date = now.toISOString().split('T')[0];
  const timestamp = buildTimestamp(now);
  const safeTitle = buildSafeTitle(title);
  return `${date}-${timestamp}-${safeTitle}.md`;
}

export function buildArtifactDirectoryName(title: string, now: Date = new Date()): string {
  return `${buildSafeTitle(title)}-${buildCompactArtifactDirectorySuffix(now)}`;
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

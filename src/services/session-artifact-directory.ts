import { database } from './database';
import { flushSessionPersistence } from './session';
import { buildArtifactDirectoryName } from './vault/filename';

const ARTIFACT_DIRECTORY_KEY = 'obsidian:artifact-directory:v1';
const ARTIFACT_DIRECTORY_TOOL = 'obsidian-artifact-directory';

type StoredArtifactDirectory = {
  readonly directoryPath: string;
};

function buildDirectoryPath(title: string, now: Date): string {
  return buildArtifactDirectoryName(title, now);
}

function isLegacyDirectoryPath(directoryPath: string): boolean {
  return /^\d{4}-\d{2}-\d{2}-\d{9}-.+$/u.test(directoryPath);
}

function normalizeLegacyDirectoryPath(directoryPath: string, title: string): string {
  const match = directoryPath.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{6})(\d{3})-(.+)$/u);
  if (!match) return directoryPath;
  const [, year, month, day, hhmmss, milliseconds] = match;
  const iso = `${year}-${month}-${day}T${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}:${hhmmss.slice(4, 6)}.${milliseconds}Z`;
  return buildArtifactDirectoryName(title, new Date(iso));
}

function parseStoredDirectoryPath(outputJson: string): string | undefined {
  try {
    const parsed = JSON.parse(outputJson) as Partial<StoredArtifactDirectory>;
    if (typeof parsed.directoryPath !== 'string') return undefined;
    const directoryPath = parsed.directoryPath.trim();
    return directoryPath.length > 0 ? directoryPath : undefined;
  } catch {
    return undefined;
  }
}

export async function getOrCreateSessionArtifactDirectoryPath(
  sessionId: string,
  title: string,
  now: Date
): Promise<string> {
  await flushSessionPersistence();

  const existing = await database.sessionResearchMemory.findUnique({
    where: {
      sessionId_key: {
        sessionId,
        key: ARTIFACT_DIRECTORY_KEY,
      },
    },
  });
  const existingDirectoryPath = existing
    ? parseStoredDirectoryPath(existing.outputJson)
    : undefined;
  if (existingDirectoryPath) {
    const normalizedDirectoryPath = isLegacyDirectoryPath(existingDirectoryPath)
      ? normalizeLegacyDirectoryPath(existingDirectoryPath, title)
      : existingDirectoryPath;
    if (normalizedDirectoryPath !== existingDirectoryPath) {
      await database.sessionResearchMemory.update({
        where: {
          sessionId_key: {
            sessionId,
            key: ARTIFACT_DIRECTORY_KEY,
          },
        },
        data: {
          outputJson: JSON.stringify({ directoryPath: normalizedDirectoryPath }),
        },
      });
    }
    return normalizedDirectoryPath;
  }

  const directoryPath = buildDirectoryPath(title, now);
  await database.sessionResearchMemory.upsert({
    where: {
      sessionId_key: {
        sessionId,
        key: ARTIFACT_DIRECTORY_KEY,
      },
    },
    create: {
      sessionId,
      key: ARTIFACT_DIRECTORY_KEY,
      toolName: ARTIFACT_DIRECTORY_TOOL,
      inputJson: JSON.stringify({ version: 1 }),
      outputJson: JSON.stringify({ directoryPath }),
    },
    update: {
      toolName: ARTIFACT_DIRECTORY_TOOL,
      inputJson: JSON.stringify({ version: 1 }),
      outputJson: JSON.stringify({ directoryPath }),
    },
  });
  return directoryPath;
}
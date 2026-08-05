import { beforeEach, describe, expect, test } from 'bun:test';
import { deleteSessionHistory } from './session';
import { database } from './database';
import { getOrCreateSessionArtifactDirectoryPath } from './session-artifact-directory';

describe('session artifact directory', () => {
  beforeEach(async () => {
    await deleteSessionHistory();
  });

  test('reuses the first generated directory path for the same session', async () => {
    const session = await database.session.create({ data: {} });

    const first = await getOrCreateSessionArtifactDirectoryPath(
      session.id,
      '回溯者 第一卷角色精简与文风去AI化',
      new Date('2026-08-05T03:37:15.922Z')
    );
    const second = await getOrCreateSessionArtifactDirectoryPath(
      session.id,
      '第二次收束',
      new Date('2026-08-05T04:37:15.922Z')
    );

    expect(first).toBe('回溯者-第一卷角色精简与文风去AI化-eyzdtq');
    expect(second).toBe(first);
    expect(second).not.toContain(session.id);
  });

  test('upgrades a stored legacy directory path to the compact suffix format', async () => {
    const session = await database.session.create({ data: {} });
    await database.sessionResearchMemory.create({
      data: {
        sessionId: session.id,
        key: 'obsidian:artifact-directory:v1',
        toolName: 'obsidian-artifact-directory',
        inputJson: JSON.stringify({ version: 1 }),
        outputJson: JSON.stringify({
          directoryPath: '2026-08-05-033715922-回溯者第一卷角色精简与文风去AI化',
        }),
      },
    });

    const directoryPath = await getOrCreateSessionArtifactDirectoryPath(
      session.id,
      '回溯者 第一卷角色精简与文风去AI化',
      new Date('2026-08-05T03:37:15.922Z')
    );

    expect(directoryPath).toBe('回溯者-第一卷角色精简与文风去AI化-eyzdtq');
  });
});
import { buildObsidianNote, type McpToolExecutor, type ObsidianNote } from './obsidian';
import { executeMcpTool } from './mcp';
import { buildSafeVaultTitle, buildVaultFilename } from './vault';
import { config } from '../config/env';
import type { DeepResearchArtifact } from '../types';

export type ObsidianArtifactBundleInput = {
  readonly title: string;
  readonly markdown: string;
  readonly milestone: string;
  readonly category: string;
  readonly subcategory: string;
  readonly tags: readonly string[];
  readonly researchArtifacts: readonly DeepResearchArtifact[];
  readonly now?: Date;
};

export type ObsidianArtifactBundle = {
  readonly directoryPath: string;
  readonly mainLink: string;
  readonly mainNote: ObsidianNote;
  readonly researchNotes: readonly ObsidianNote[];
};

type ArtifactPath = {
  readonly title: string;
  readonly path: string;
  readonly linkTarget: string;
};

function getDirectoryPath(title: string, now: Date): string {
  return buildVaultFilename(title, now).replace(/\.md$/i, '');
}

function getUniqueStem(title: string, used: Map<string, number>): string {
  const base = buildSafeVaultTitle(title);
  const key = base.toLocaleLowerCase();
  const count = (used.get(key) ?? 0) + 1;
  used.set(key, count);
  return count === 1 ? base : `${base}-${count}`;
}

function buildArtifactPaths(
  directoryPath: string,
  titles: readonly string[]
): readonly ArtifactPath[] {
  const used = new Map<string, number>();
  return titles.map(title => {
    const stem = getUniqueStem(title, used);
    return {
      title,
      path: `${directoryPath}/${stem}.md`,
      linkTarget: `${directoryPath}/${stem}`,
    };
  });
}

function buildWikiLink(path: ArtifactPath): string {
  return `[[${path.linkTarget}|${path.title}]]`;
}

function appendResearchLinks(
  markdown: string,
  artifacts: readonly DeepResearchArtifact[],
  paths: readonly ArtifactPath[]
): string {
  if (artifacts.length === 0) return markdown;
  const links = artifacts.map((artifact, index) => (
    `- ${buildWikiLink(paths[index]!)} — ${artifact.summary}`
  ));
  return [markdown, '', '## 深度调研产物', '', ...links].join('\n');
}

function appendParentLink(markdown: string, mainPath: ArtifactPath): string {
  return [
    markdown,
    '',
    '## 关联主报告',
    '',
    `- 父报告：${buildWikiLink(mainPath)}`,
  ].join('\n');
}

export function buildObsidianArtifactBundle(
  input: ObsidianArtifactBundleInput
): ObsidianArtifactBundle {
  const now = input.now ?? new Date();
  const directoryPath = getDirectoryPath(input.title, now);
  const [mainPath, ...researchPaths] = buildArtifactPaths(
    directoryPath,
    [input.title, ...input.researchArtifacts.map(artifact => artifact.title)]
  );
  if (!mainPath) throw new Error('无法生成主报告路径');

  const mainNote = buildObsidianNote({
    ...input,
    now,
    path: mainPath.path,
    markdown: appendResearchLinks(
      input.markdown,
      input.researchArtifacts,
      researchPaths
    ),
    children: researchPaths.map(path => path.linkTarget),
  });
  const researchNotes = input.researchArtifacts.map((artifact, index) => (
    buildObsidianNote({
      title: artifact.title,
      markdown: appendParentLink(artifact.markdown, mainPath),
      milestone: input.milestone,
      category: input.category,
      subcategory: input.subcategory,
      tags: [...input.tags, ...artifact.tags],
      now,
      path: researchPaths[index]!.path,
      noteType: 'brain-distill-research',
      parent: mainPath.linkTarget,
    })
  ));

  return {
    directoryPath,
    mainLink: buildWikiLink(mainPath),
    mainNote,
    researchNotes,
  };
}

export async function saveObsidianArtifactBundle(
  input: ObsidianArtifactBundleInput,
  executeTool: McpToolExecutor = executeMcpTool
): Promise<ObsidianArtifactBundle> {
  const bundle = buildObsidianArtifactBundle(input);
  const notes = [bundle.mainNote, ...bundle.researchNotes];
  for (const note of notes) {
    console.log(`[obsidian] Saving artifact: ${note.path}`);
    await executeTool(config.obsidianMcpWriteTool, {
      path: note.path,
      content: note.content,
    });
    console.log(`[obsidian] Saved artifact: ${note.path}`);
  }
  console.log(`[obsidian] Saved artifact bundle: ${bundle.directoryPath}`);
  return bundle;
}

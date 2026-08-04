import { buildObsidianNote, type McpToolExecutor, type ObsidianNote } from './obsidian';
import {
  createWikiLinkMaterializer,
  type WikiLinkDocument,
} from './obsidian-links';
import { executeMcpTool } from './mcp';
import { writeObsidianNote } from './obsidian-writer';
import { buildSafeTitle, buildVaultFilename } from './vault/filename';
import type { DeepResearchArtifact } from '../types';

export type ObsidianArtifactBundleInput = {
  readonly sessionId?: string;
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
  readonly linkedNotes: readonly ObsidianNote[];
};

type ArtifactPath = {
  readonly title: string;
  readonly path: string;
  readonly linkTarget: string;
};

type ArtifactPathSet = {
  readonly mainPath: ArtifactPath;
  readonly researchPaths: readonly ArtifactPath[];
};

type RewrittenArtifactContent = {
  readonly materializer: ReturnType<typeof createWikiLinkMaterializer>;
  readonly mainMarkdown: string;
  readonly researchMarkdowns: readonly string[];
};

function getDirectoryPath(title: string, now: Date): string {
  return buildVaultFilename(title, now).replace(/\.md$/i, '');
}

function getSessionDirectoryPath(sessionId: string): string {
  return `session-${buildSafeTitle(sessionId)}`;
}

function getUniqueStem(title: string, used: Map<string, number>): string {
  const base = buildSafeTitle(title);
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

function buildSessionArtifactPaths(
  directoryPath: string,
  title: string,
  researchTitles: readonly string[],
  now: Date
): {
  readonly mainPath: ArtifactPath;
  readonly researchPaths: readonly ArtifactPath[];
} {
  const mainStem = buildVaultFilename(title, now).replace(/\.md$/i, '');
  const mainPath = {
    title,
    path: `${directoryPath}/${mainStem}.md`,
    linkTarget: `${directoryPath}/${mainStem}`,
  };
  const used = new Map<string, number>();
  const researchPaths = researchTitles.map(researchTitle => {
    const researchStem = `${mainStem}--${getUniqueStem(researchTitle, used)}`;
    return {
      title: researchTitle,
      path: `${directoryPath}/${researchStem}.md`,
      linkTarget: `${directoryPath}/${researchStem}`,
    };
  });

  return {
    mainPath,
    researchPaths,
  };
}

function buildWikiLink(path: ArtifactPath): string {
  return `[[${path.linkTarget}|${path.title}]]`;
}

function buildStandaloneArtifactPaths(
  directoryPath: string,
  researchTitles: readonly string[],
  title: string
): ArtifactPathSet {
  const [mainPath, ...researchPaths] = buildArtifactPaths(
    directoryPath,
    [title, ...researchTitles]
  );
  if (!mainPath) throw new Error('无法生成主报告路径');
  return { mainPath, researchPaths };
}

function resolveArtifactPaths(
  input: ObsidianArtifactBundleInput,
  now: Date,
  directoryPath: string
): ArtifactPathSet {
  const researchTitles = input.researchArtifacts.map(artifact => artifact.title);
  if (input.sessionId) {
    return buildSessionArtifactPaths(directoryPath, input.title, researchTitles, now);
  }
  return buildStandaloneArtifactPaths(directoryPath, researchTitles, input.title);
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

function buildLinkedNoteMarkdown(linkDocument: WikiLinkDocument): string {
  return [
    `由 [[${linkDocument.sourceLinkTarget}|${linkDocument.sourceTitle}]] 中的显式双链创建，用于沉淀“${linkDocument.title}”这个节点的后续内容。`,
    '',
    '## 待补充',
    '',
    '- 在后续澄清或调研中补全该节点的定义、边界和执行结论。',
  ].join('\n');
}

function rewriteArtifactContent(
  input: ObsidianArtifactBundleInput,
  directoryPath: string,
  paths: ArtifactPathSet
): RewrittenArtifactContent {
  const materializer = createWikiLinkMaterializer({
    directoryPath,
    knownTargets: [paths.mainPath, ...paths.researchPaths],
  });
  return {
    materializer,
    mainMarkdown: materializer.rewriteMarkdown(input.markdown, paths.mainPath),
    researchMarkdowns: input.researchArtifacts.map((artifact, index) => (
      materializer.rewriteMarkdown(artifact.markdown, paths.researchPaths[index]!)
    )),
  };
}

function buildMainArtifactNote(
  input: ObsidianArtifactBundleInput,
  now: Date,
  mainPath: ArtifactPath,
  researchPaths: readonly ArtifactPath[],
  rewrittenMainMarkdown: string
): ObsidianNote {
  return buildObsidianNote({
    ...input,
    now,
    path: mainPath.path,
    markdown: appendResearchLinks(
      rewrittenMainMarkdown,
      input.researchArtifacts,
      researchPaths
    ),
    children: researchPaths.map(path => path.linkTarget),
  });
}

function buildResearchArtifactNotes(
  input: ObsidianArtifactBundleInput,
  now: Date,
  mainPath: ArtifactPath,
  researchPaths: readonly ArtifactPath[],
  rewrittenResearchMarkdowns: readonly string[]
): readonly ObsidianNote[] {
  return input.researchArtifacts.map((artifact, index) => (
    buildObsidianNote({
      title: artifact.title,
      markdown: appendParentLink(rewrittenResearchMarkdowns[index]!, mainPath),
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
}

function buildLinkedArtifactNotes(
  input: ObsidianArtifactBundleInput,
  now: Date,
  materializer: ReturnType<typeof createWikiLinkMaterializer>,
  mainPath: ArtifactPath
): readonly ObsidianNote[] {
  return materializer.getLinkedDocuments().map(linkDocument => (
    buildObsidianNote({
      title: linkDocument.title,
      markdown: buildLinkedNoteMarkdown(linkDocument),
      milestone: input.milestone,
      category: input.category,
      subcategory: input.subcategory,
      tags: [...input.tags, '双链文档'],
      now,
      path: linkDocument.path,
      noteType: 'brain-distill-link',
      parent: mainPath.linkTarget,
    })
  ));
}

export function buildObsidianArtifactBundle(
  input: ObsidianArtifactBundleInput
): ObsidianArtifactBundle {
  const now = input.now ?? new Date();
  const directoryPath = input.sessionId
    ? getSessionDirectoryPath(input.sessionId)
    : getDirectoryPath(input.title, now);
  const { mainPath, researchPaths } = resolveArtifactPaths(input, now, directoryPath);
  const rewrittenContent = rewriteArtifactContent(input, directoryPath, {
    mainPath,
    researchPaths,
  });

  const mainNote = buildMainArtifactNote(
    input,
    now,
    mainPath,
    researchPaths,
    rewrittenContent.mainMarkdown
  );
  const researchNotes = buildResearchArtifactNotes(
    input,
    now,
    mainPath,
    researchPaths,
    rewrittenContent.researchMarkdowns
  );
  const linkedNotes = buildLinkedArtifactNotes(
    input,
    now,
    rewrittenContent.materializer,
    mainPath
  );

  return {
    directoryPath,
    mainLink: buildWikiLink(mainPath),
    mainNote,
    researchNotes,
    linkedNotes,
  };
}

export async function saveObsidianArtifactBundle(
  input: ObsidianArtifactBundleInput,
  executeTool: McpToolExecutor = executeMcpTool
): Promise<ObsidianArtifactBundle> {
  const bundle = buildObsidianArtifactBundle(input);
  const notes = [bundle.mainNote, ...bundle.researchNotes, ...bundle.linkedNotes];
  for (const note of notes) {
    console.log(`[obsidian] Saving artifact: ${note.path}`);
    const result = await writeObsidianNote(note.path, note.content, {
      ...(executeTool === executeMcpTool ? {} : { backend: 'mcp' as const }),
      executeTool,
    });
    console.log(`[obsidian] Saved artifact via ${result.backend.toUpperCase()}: ${note.path}`);
  }
  console.log(`[obsidian] Saved artifact bundle: ${bundle.directoryPath}`);
  return bundle;
}

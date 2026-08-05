import { buildSafeTitle } from './vault/filename';

export type LinkableDocument = {
  readonly title: string;
  readonly path: string;
  readonly linkTarget: string;
};

export type WikiLinkDocument = LinkableDocument & {
  readonly mentions: readonly WikiLinkMention[];
};

export type WikiLinkMention = {
  readonly sourceTitle: string;
  readonly sourceLinkTarget: string;
  readonly excerpt: string;
};

type MutableWikiLinkDocument = LinkableDocument & {
  readonly mentions: WikiLinkMention[];
};

function isMutableWikiLinkDocument(value: LinkableDocument): value is MutableWikiLinkDocument {
  if (!('mentions' in value)) return false;
  return Array.isArray((value as { mentions?: unknown }).mentions);
}

const WIKI_LINK_PATTERN = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;

function normalizeLinkTarget(value: string): string {
  return value.trim();
}

function createLookupKey(value: string): string {
  return normalizeLinkTarget(value).toLocaleLowerCase();
}

function extractStem(path: string): string {
  const filename = path.split('/').at(-1) ?? path;
  return filename.replace(/\.md$/i, '');
}

function createSeededStemUsage(
  knownTargets: readonly LinkableDocument[]
): Map<string, number> {
  return knownTargets.reduce((used, target) => {
    const stem = extractStem(target.path);
    const key = stem.toLocaleLowerCase();
    used.set(key, (used.get(key) ?? 0) + 1);
    return used;
  }, new Map<string, number>());
}

function getUniqueStem(title: string, used: Map<string, number>): string {
  const base = buildSafeTitle(title);
  const key = base.toLocaleLowerCase();
  const count = (used.get(key) ?? 0) + 1;
  used.set(key, count);
  return count === 1 ? base : `${base}-${count}`;
}

function rememberKnownTarget(
  lookup: Map<string, LinkableDocument>,
  target: LinkableDocument
): void {
  [target.title, target.linkTarget, extractStem(target.path)]
    .map(createLookupKey)
    .filter(Boolean)
    .forEach(key => lookup.set(key, target));
}

function createLinkedDocument(
  rawTarget: string,
  _directoryPath: string,
  usedStems: Map<string, number>,
  source: LinkableDocument,
  excerpt: string
): MutableWikiLinkDocument {
  const stem = getUniqueStem(rawTarget, usedStems);
  return {
    title: rawTarget,
    path: `${stem}.md`,
    linkTarget: stem,
    mentions: [{
      sourceTitle: source.title,
      sourceLinkTarget: source.linkTarget,
      excerpt,
    }],
  };
}

function normalizeExcerpt(excerpt: string): string {
  return excerpt
    .replace(WIKI_LINK_PATTERN, (_match, rawTarget, rawAlias) => String(rawAlias ?? rawTarget ?? '').trim())
    .replace(/^[-*]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function extractMentionExcerpt(markdown: string, offset: number): string {
  const lineStart = markdown.lastIndexOf('\n', Math.max(offset - 1, 0));
  const lineEnd = markdown.indexOf('\n', offset);
  const excerpt = markdown.slice(lineStart + 1, lineEnd === -1 ? markdown.length : lineEnd);
  return normalizeExcerpt(excerpt);
}

function appendMention(
  document: MutableWikiLinkDocument,
  source: LinkableDocument,
  excerpt: string
): void {
  const normalizedExcerpt = normalizeExcerpt(excerpt);
  if (!normalizedExcerpt) return;
  const duplicate = document.mentions.some(mention => (
    mention.sourceLinkTarget === source.linkTarget
      && mention.excerpt === normalizedExcerpt
  ));
  if (duplicate) return;
  document.mentions.push({
    sourceTitle: source.title,
    sourceLinkTarget: source.linkTarget,
    excerpt: normalizedExcerpt,
  });
}

type MaterializerState = {
  readonly directoryPath: string;
  readonly knownTargets: Map<string, LinkableDocument>;
  readonly linkedDocuments: Map<string, MutableWikiLinkDocument>;
  readonly usedStems: Map<string, number>;
};

function createMaterializerState(input: {
  readonly directoryPath: string;
  readonly knownTargets: readonly LinkableDocument[];
}): MaterializerState {
  const knownTargets = new Map<string, LinkableDocument>();
  input.knownTargets.forEach(target => rememberKnownTarget(knownTargets, target));
  return {
    directoryPath: input.directoryPath,
    knownTargets,
    linkedDocuments: new Map<string, MutableWikiLinkDocument>(),
    usedStems: createSeededStemUsage(input.knownTargets),
  };
}

function getExistingTarget(
  state: MaterializerState,
  lookupKey: string
): LinkableDocument | undefined {
  return state.knownTargets.get(lookupKey) ?? state.linkedDocuments.get(lookupKey);
}

function storeLinkedDocument(
  state: MaterializerState,
  lookupKey: string,
  document: MutableWikiLinkDocument
): MutableWikiLinkDocument {
  state.linkedDocuments.set(lookupKey, document);
  rememberKnownTarget(state.knownTargets, document);
  return document;
}

function resolveTargetDocument(
  state: MaterializerState,
  rawTarget: string,
  source: LinkableDocument,
  excerpt: string
): LinkableDocument {
  const lookupKey = createLookupKey(rawTarget);
  const existingTarget = getExistingTarget(state, lookupKey);
  if (existingTarget) {
    if (isMutableWikiLinkDocument(existingTarget)) appendMention(existingTarget, source, excerpt);
    return existingTarget;
  }
  return storeLinkedDocument(
    state,
    lookupKey,
    createLinkedDocument(rawTarget, state.directoryPath, state.usedStems, source, excerpt)
  );
}

function getWikiLinkLabel(rawAlias: unknown, fallbackLabel: string): string {
  const alias = typeof rawAlias === 'string' ? rawAlias.trim() : '';
  return alias.length > 0 ? alias : fallbackLabel;
}

function rewriteWikiLink(
  match: string,
  rawTarget: unknown,
  rawAlias: unknown,
  source: LinkableDocument,
  state: MaterializerState,
  offset: number,
  markdown: string
): string {
  const target = normalizeLinkTarget(String(rawTarget ?? ''));
  if (!target) return match;
  const resolvedTarget = resolveTargetDocument(
    state,
    target,
    source,
    extractMentionExcerpt(markdown, offset)
  );
  return `[[${resolvedTarget.linkTarget}|${getWikiLinkLabel(rawAlias, target)}]]`;
}

export function createWikiLinkMaterializer(input: {
  readonly directoryPath: string;
  readonly knownTargets: readonly LinkableDocument[];
}): {
  readonly rewriteMarkdown: (
    markdown: string,
    source: LinkableDocument
  ) => string;
  readonly getLinkedDocuments: () => readonly WikiLinkDocument[];
} {
  const state = createMaterializerState(input);

  return {
    rewriteMarkdown(markdown: string, source: LinkableDocument): string {
      return markdown.replace(
        WIKI_LINK_PATTERN,
        (match, rawTarget, rawAlias, offset) => rewriteWikiLink(
          match,
          rawTarget,
          rawAlias,
          source,
          state,
          Number(offset),
          markdown
        )
      );
    },
    getLinkedDocuments(): readonly WikiLinkDocument[] {
      return Array.from(state.linkedDocuments.values()).map(document => ({
        ...document,
        mentions: [...document.mentions],
      }));
    },
  };
}
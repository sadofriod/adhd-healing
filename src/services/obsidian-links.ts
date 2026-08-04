import { buildSafeTitle } from './vault/filename';

export type LinkableDocument = {
  readonly title: string;
  readonly path: string;
  readonly linkTarget: string;
};

export type WikiLinkDocument = LinkableDocument & {
  readonly sourceTitle: string;
  readonly sourceLinkTarget: string;
};

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
  directoryPath: string,
  usedStems: Map<string, number>,
  source: LinkableDocument
): WikiLinkDocument {
  const stem = getUniqueStem(rawTarget, usedStems);
  return {
    title: rawTarget,
    path: `${directoryPath}/${stem}.md`,
    linkTarget: `${directoryPath}/${stem}`,
    sourceTitle: source.title,
    sourceLinkTarget: source.linkTarget,
  };
}

type MaterializerState = {
  readonly directoryPath: string;
  readonly knownTargets: Map<string, LinkableDocument>;
  readonly linkedDocuments: Map<string, WikiLinkDocument>;
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
    linkedDocuments: new Map<string, WikiLinkDocument>(),
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
  document: WikiLinkDocument
): WikiLinkDocument {
  state.linkedDocuments.set(lookupKey, document);
  rememberKnownTarget(state.knownTargets, document);
  return document;
}

function resolveTargetDocument(
  state: MaterializerState,
  rawTarget: string,
  source: LinkableDocument
): LinkableDocument {
  const lookupKey = createLookupKey(rawTarget);
  const existingTarget = getExistingTarget(state, lookupKey);
  if (existingTarget) return existingTarget;
  return storeLinkedDocument(
    state,
    lookupKey,
    createLinkedDocument(rawTarget, state.directoryPath, state.usedStems, source)
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
  state: MaterializerState
): string {
  const target = normalizeLinkTarget(String(rawTarget ?? ''));
  if (!target) return match;
  const resolvedTarget = resolveTargetDocument(state, target, source);
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
        (match, rawTarget, rawAlias) => rewriteWikiLink(match, rawTarget, rawAlias, source, state)
      );
    },
    getLinkedDocuments(): readonly WikiLinkDocument[] {
      return Array.from(state.linkedDocuments.values());
    },
  };
}
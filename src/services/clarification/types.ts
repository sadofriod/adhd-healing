export type SessionMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ArchiveDocumentInput = {
  title: string;
  markdown: string;
  sessionMessages?: SessionMessage[];
};
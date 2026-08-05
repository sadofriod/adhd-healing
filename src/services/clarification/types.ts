import type { Locale } from '../../i18n/locale';

export type SessionMessage = {
  readonly role: 'user' | 'assistant';
  readonly content: string;
};

export type ArchiveDocumentInput = {
  readonly title: string;
  readonly markdown: string;
  readonly sessionMessages?: readonly SessionMessage[];
  readonly locale?: Locale;
};
export const SUPPORTED_LOCALES = ['zh', 'en'] as const;

export type Locale = typeof SUPPORTED_LOCALES[number];

export const DEFAULT_LOCALE: Locale = 'zh';

const LOCALE_PREFIX_MAP: Readonly<Record<string, Locale>> = {
  zh: 'zh',
  en: 'en',
};

function isLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

function getLocaleByPrefix(value: string): Locale | undefined {
  return Object.entries(LOCALE_PREFIX_MAP)
    .find(([prefix]) => value.startsWith(prefix))
    ?.[1];
}

function resolveLocale(value: string): Locale | undefined {
  if (isLocale(value)) return value;
  return getLocaleByPrefix(value);
}

function normalizeLocaleInput(value: string | null | undefined): string {
  if (!value) return '';
  return value.trim().toLowerCase();
}

export function normalizeLocale(value: string | null | undefined): Locale {
  const resolvedLocale = resolveLocale(normalizeLocaleInput(value));
  if (resolvedLocale) return resolvedLocale;
  return DEFAULT_LOCALE;
}

function getLocaleCandidates(req: Request): readonly (string | null | undefined)[] {
  const { searchParams } = new URL(req.url);
  const acceptLanguage = req.headers.get('accept-language');
  return [
    searchParams.get('lang'),
    req.headers.get('x-locale'),
    acceptLanguage?.split(',')[0],
  ];
}

export function getRequestLocale(req: Request): Locale {
  const matched = getLocaleCandidates(req).find(Boolean);
  return normalizeLocale(matched);
}

export function getIntlLocale(locale: Locale): 'zh-CN' | 'en-US' {
  if (locale === 'en') return 'en-US';
  return 'zh-CN';
}

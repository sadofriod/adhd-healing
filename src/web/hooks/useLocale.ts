import { useState } from 'react';
import { getIntlLocale, normalizeLocale, type Locale } from '../../i18n/locale';

type LocaleState = {
  readonly locale: Locale;
  readonly intlLocale: 'zh-CN' | 'en-US';
  readonly toggleLocale: () => void;
};

function getBrowserLanguage(): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.language;
}

function getInitialLocale(): Locale {
  return normalizeLocale(getBrowserLanguage());
}

function getToggledLocale(locale: Locale): Locale {
  if (locale === 'zh') return 'en';
  return 'zh';
}

export function useLocale(): LocaleState {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);

  function toggleLocale(): void {
    setLocale(current => getToggledLocale(current));
  }

  return { locale, intlLocale: getIntlLocale(locale), toggleLocale };
}

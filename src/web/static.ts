import { DEFAULT_LOCALE, type Locale } from '../i18n/locale';
import { getServerMessage } from '../i18n/server-messages';

type StaticAsset = {
  readonly fileName: string;
  readonly contentType: string;
};

const STATIC_ASSETS: Record<string, StaticAsset> = {
  '/': { fileName: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/main.js': { fileName: 'main.js', contentType: 'text/javascript; charset=utf-8' },
  '/styles.css': { fileName: 'styles.css', contentType: 'text/css; charset=utf-8' },
};

function getStaticAsset(pathname: string): StaticAsset | undefined {
  return STATIC_ASSETS[pathname];
}

function getAssetFile(fileName: string) {
  return Bun.file(new URL(`../../public/${fileName}`, import.meta.url));
}

async function getExistingAssetFile(fileName: string): Promise<Blob | null> {
  const file = getAssetFile(fileName);
  if (await file.exists()) return file;
  return null;
}

function createMissingAssetResponse(fileName: string, locale: Locale): Response {
  return new Response(`${getServerMessage(locale, 'missingWebAsset')}: ${fileName}`, { status: 503 });
}

async function createAssetResponse(asset: StaticAsset, locale: Locale): Promise<Response> {
  const file = await getExistingAssetFile(asset.fileName);
  if (!file) return createMissingAssetResponse(asset.fileName, locale);
  return new Response(file, {
    headers: { 'Content-Type': asset.contentType },
  });
}

export async function handleWebAsset(
  pathname: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<Response | null> {
  const asset = getStaticAsset(pathname);
  if (!asset) return null;
  return createAssetResponse(asset, locale);
}
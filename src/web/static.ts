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

function createMissingAssetResponse(fileName: string): Response {
  return new Response(`Missing web asset: ${fileName}`, { status: 503 });
}

export async function handleWebAsset(pathname: string): Promise<Response | null> {
  const asset = getStaticAsset(pathname);
  if (!asset) return null;

  const file = getAssetFile(asset.fileName);
  if (!(await file.exists())) {
    return createMissingAssetResponse(asset.fileName);
  }

  return new Response(file, {
    headers: { 'Content-Type': asset.contentType },
  });
}
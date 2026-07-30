const buildResult = await Bun.build({
  entrypoints: ['src/web/main.tsx', 'src/web/styles.css'],
  outdir: 'public',
  target: 'browser',
  sourcemap: 'external',
  naming: {
    entry: '[name].[ext]',
    chunk: 'chunks/[name]-[hash].[ext]',
    asset: '[name].[ext]',
  },
});

if (!buildResult.success) {
  for (const message of buildResult.logs) {
    console.error(message);
  }

  process.exit(1);
}

console.log('[web] Built React client assets');

export {};
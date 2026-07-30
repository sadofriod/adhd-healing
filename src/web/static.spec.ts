import { describe, expect, it } from 'bun:test';
import { handleWebAsset } from './static.js';

describe('handleWebAsset', () => {
  it('serves the HTML shell for the root path', async () => {
    const response = await handleWebAsset('/');

    expect(response).not.toBeNull();
    expect(response?.headers.get('Content-Type')).toContain('text/html');
    await expect(response?.text()).resolves.toContain('<div id="app"></div>');
  });

  it('returns null for unknown assets', async () => {
    await expect(handleWebAsset('/missing.js')).resolves.toBeNull();
  });
});
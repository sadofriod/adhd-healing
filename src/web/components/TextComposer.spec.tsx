import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TextComposer } from './TextComposer';

describe('TextComposer', () => {
  test('renders restored draft text and attachment pills for paused sessions', () => {
    const markup = renderToStaticMarkup(
      <TextComposer
        disabled={true}
        locale="zh"
        onSubmit={async () => undefined}
        prompt="继续输入"
        restoredDraft={{
          text: '恢复中的输入',
          attachments: [{
            name: 'context.md',
            content: '# context',
            mimeType: 'text/markdown',
            size: 42,
          }],
        }}
      />
    );

    expect(markup).toContain('恢复中的输入');
    expect(markup).toContain('context.md · 42 bytes');
  });
});
import type { FormEvent, JSX } from 'react';
import { useState } from 'react';

type TextComposerProps = {
  readonly disabled: boolean;
  readonly prompt: string;
  readonly onSubmit: (text: string) => Promise<void>;
};

export function TextComposer(props: TextComposerProps): JSX.Element {
  const [value, setValue] = useState('');
  const canSubmit = value.trim().length > 0 && !props.disabled;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedValue = value.trim();
    if (!trimmedValue) return;

    await props.onSubmit(trimmedValue);
    setValue('');
  }

  return (
    <section className="panel-surface composer-card">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Text input</p>
          <h2>手动输入</h2>
        </div>
        <span className="mode-pill">JSON</span>
      </div>

      <form className="composer-form" onSubmit={handleSubmit}>
        <label className="input-label" htmlFor="distill-text">
          当前这一轮你想补充什么？
        </label>
        <textarea
          id="distill-text"
          className="composer-textarea"
          disabled={props.disabled}
          onChange={event => setValue(event.currentTarget.value)}
          placeholder={props.prompt}
          rows={8}
          value={value}
        />
        <button className="primary-button" disabled={!canSubmit} type="submit">
          发送文字
        </button>
      </form>
    </section>
  );
}